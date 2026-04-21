/**
 * pdfToImages.ts
 *
 * WI-2: PDF page rendering engine.
 *
 * Renders each page of a PDF document to a PNG image using pdftoppm
 * (poppler-utils, pre-installed on the server), then uploads each image
 * to S3 and returns the public URLs.
 *
 * DESIGN DECISIONS
 * ─────────────────
 * 1. Uses pdftoppm (not pdfjs-dist canvas rendering) because pdftoppm
 *    is a native binary with no canvas/browser dependencies, produces
 *    high-quality rasterisation, and is already installed.
 *
 * 2. Resolution: 150 DPI — sufficient for LLM vision analysis, keeps
 *    file sizes manageable (~200–400 KB per page).
 *
 * 3. Page limit: configurable, default 20 pages. Claim bundles are
 *    typically 10–25 pages; this prevents runaway processing on large
 *    documents.
 *
 * 4. Uploads each page to S3 under a deterministic key so re-processing
 *    the same PDF does not create duplicate uploads.
 *
 * 5. Graceful degradation: if pdftoppm fails for any page, that page is
 *    skipped and the rest are still returned.
 *
 * TIMEOUT GUARDS (critical — prevents pipeline from hanging forever)
 * ─────────────────────────────────────────────────────────────────
 * - PDF download: 60s hard timeout (AbortController covers both headers AND body read)
 * - pdftoppm rendering: 120s hard timeout (kills the child process)
 * - pdfinfo page count: 15s hard timeout
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readdir, readFile, rm } from "fs/promises";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { storagePut } from "../storage";

const execFileAsync = promisify(execFile);

export interface PdfToImagesOptions {
  /** DPI resolution for rendering. Default: 150 */
  dpi?: number;
  /** Maximum number of pages to render. Default: 20 */
  maxPages?: number;
  /** S3 key prefix for uploaded images. Default: "pdf-pages" */
  keyPrefix?: string;
  /** Logger function */
  log?: (msg: string) => void;
}

export interface PdfPageImage {
  pageNumber: number;
  url: string;
  key: string;
  fileSizeBytes: number;
}

export interface PdfToImagesResult {
  pages: PdfPageImage[];
  totalPagesRendered: number;
  totalPagesInDocument: number;
  truncated: boolean;
  errors: string[];
}

/**
 * Download a PDF from a URL to a temp file.
 * Hard 60-second timeout covers both the connection and the full body read.
 * If either stalls, the AbortController fires and we throw — preventing
 * the pipeline from hanging indefinitely.
 */
async function downloadPdf(url: string, destPath: string): Promise<void> {
  const DOWNLOAD_TIMEOUT_MS = 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError" || controller.signal.aborted) {
      throw new Error(`PDF download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s — ${url}`);
    }
    throw err;
  }

  if (!response.ok) {
    clearTimeout(timer);
    throw new Error(`Failed to download PDF: HTTP ${response.status} — ${url}`);
  }

  // Keep the AbortController active through the body read.
  // If the server sends headers but stalls on the body, this will abort.
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError" || controller.signal.aborted) {
      throw new Error(`PDF body download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s — ${url}`);
    }
    throw err;
  }
  clearTimeout(timer);

  const { writeFile } = await import("fs/promises");
  await writeFile(destPath, buffer);
}

/**
 * Get the total page count of a PDF using pdfinfo.
 * Hard 15-second timeout to prevent hanging on corrupt PDFs.
 */
async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 15_000 });
    const match = stdout.match(/Pages:\s+(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Render PDF pages to PNG images using pdftoppm.
 *
 * @param pdfUrl   Public URL of the PDF to render
 * @param options  Rendering options
 * @returns        Array of S3 URLs for each rendered page
 */
export async function renderPdfToImages(
  pdfUrl: string,
  options: PdfToImagesOptions = {}
): Promise<PdfToImagesResult> {
  const {
    dpi = 150,
    maxPages = 20,
    keyPrefix = "pdf-pages",
    log = () => {},
  } = options;

  const errors: string[] = [];
  const pages: PdfPageImage[] = [];
  let tempDir: string | null = null;

  try {
    // Create a temporary directory for this rendering job
    tempDir = await mkdtemp(join(tmpdir(), "kinga-pdf-"));
    const pdfPath = join(tempDir, "document.pdf");

    log(`Downloading PDF from ${pdfUrl}`);
    await downloadPdf(pdfUrl, pdfPath);

    // Get total page count
    const totalPages = await getPdfPageCount(pdfPath);
    log(`PDF has ${totalPages} pages`);

    const pagesToRender = Math.min(totalPages || maxPages, maxPages);
    const truncated = totalPages > maxPages;

    if (truncated) {
      log(`WARNING: PDF has ${totalPages} pages, rendering first ${maxPages} only`);
    }

    // Generate a deterministic prefix based on the PDF URL hash
    // so re-processing the same PDF reuses the same S3 keys
    const urlHash = createHash("md5").update(pdfUrl).digest("hex").slice(0, 8);
    const outputPrefix = join(tempDir, "page");

    // Render pages using pdftoppm — hard 120s timeout to prevent hanging on
    // corrupt or very large PDFs. execFileAsync timeout kills the child process.
    log(`Rendering ${pagesToRender} pages at ${dpi} DPI`);
    try {
      await execFileAsync("pdftoppm", [
        "-r", String(dpi),
        "-png",
        "-l", String(pagesToRender),
        pdfPath,
        outputPrefix,
      ], { timeout: 120_000 });
    } catch (err) {
      errors.push(`pdftoppm rendering error: ${String(err)}`);
      log(`ERROR: pdftoppm failed: ${String(err)}`);
      // Return empty result — do not throw, allow pipeline to continue
      return {
        pages: [],
        totalPagesRendered: 0,
        totalPagesInDocument: totalPages,
        truncated,
        errors,
      };
    }

    // Collect rendered PNG files
    const files = (await readdir(tempDir))
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort();

    log(`Rendered ${files.length} page image(s)`);

    // Upload each page to S3
    for (const file of files) {
      const pageMatch = file.match(/page-(\d+)\.png/);
      const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : 0;
      const filePath = join(tempDir, file);

      try {
        const buffer = await readFile(filePath);
        const s3Key = `${keyPrefix}/${urlHash}/page-${String(pageNumber).padStart(3, "0")}.png`;

        const { url, key } = await storagePut(s3Key, buffer, "image/png");

        pages.push({
          pageNumber,
          url,
          key,
          fileSizeBytes: buffer.length,
        });

        log(`Uploaded page ${pageNumber} → ${url}`);
      } catch (uploadErr) {
        const msg = `Failed to upload page ${pageNumber}: ${String(uploadErr)}`;
        errors.push(msg);
        log(`ERROR: ${msg}`);
        // Continue with remaining pages
      }
    }

    return {
      pages,
      totalPagesRendered: pages.length,
      totalPagesInDocument: totalPages,
      truncated,
      errors,
    };
  } finally {
    // Always clean up the temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Extract only the page image URLs from a render result.
 * Convenience wrapper for use in stage-1.
 */
export function extractImageUrls(result: PdfToImagesResult): string[] {
  return result.pages.map((p) => p.url);
}
