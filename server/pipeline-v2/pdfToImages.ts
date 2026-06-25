/**
 * pdfToImages.ts
 *
 * PDF page rendering engine — pdftoppm implementation.
 *
 * Renders each page of a PDF document to a PNG image using pdftoppm
 * (poppler-utils). Replaces the previous pdfjs-dist + @napi-rs/canvas
 * implementation which failed in Node.js environments due to the
 * GlobalWorkerOptions.workerSrc requirement and @napi-rs/canvas native
 * binary compatibility issues in Cloud Run.
 *
 * DESIGN DECISIONS
 * ─────────────────
 * 1. Uses pdftoppm (poppler-utils) via child_process.execFile.
 *    poppler-utils is pre-installed in the Manus sandbox and must be
 *    included in the Cloud Run container image (Dockerfile: apt-get install poppler-utils).
 *
 * 2. Resolution: 100 DPI — sufficient for LLM vision analysis. Reduced from 150 DPI
 *    to allow more pages to be rendered within Cloud Run memory limits.
 *
 * 3. Page limit: configurable, default 25 pages (memory guard for Cloud Run).
 *    At 100 DPI, 25 pages of a typical A4 PDF use ~200MB of RAM, well within the
 *    512MB Cloud Run limit. This covers most SA repair quote PDFs (typically 10-32 pages).
 *
 * 4. Uploads each page to S3 under a deterministic key so re-processing
 *    the same PDF does not create duplicate uploads.
 *
 * TIMEOUT GUARDS
 * ─────────────────────────────────────────────────────────────────
 * - PDF download: 60s hard timeout
 * - pdftoppm render: 60s per batch
 */

import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import sharp from "sharp";
import { storagePut } from "../storage";

const execFileAsync = promisify(execFile);

export interface PdfToImagesOptions {
  /** DPI resolution for rendering. Default: 100 */
  dpi?: number;
  /** Maximum number of pages to render. Default: 25 */
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
  /** Width in pixels (read from buffer before upload — no S3 re-fetch needed) */
  width: number;
  /** Height in pixels (read from buffer before upload — no S3 re-fetch needed) */
  height: number;
}

export interface PdfToImagesResult {
  pages: PdfPageImage[];
  totalPagesRendered: number;
  totalPagesInDocument: number;
  truncated: boolean;
  errors: string[];
}

/**
 * Download a PDF from a URL into a Buffer.
 * Hard 60-second timeout covers both the connection and the full body read.
 */
async function downloadPdfBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get total page count of a PDF using pdfinfo.
 */
async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 10_000 });
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
    dpi = 100,
    maxPages = 25,
    keyPrefix = "pdf-pages",
    log = () => {},
  } = options;

  // ── MEMORY GUARD ──────────────────────────────────────────────────────────
  // Cloud Run has 512MB RAM. At 100 DPI, 25 A4 pages ≈ 200MB RAM — safe.
  // At 150 DPI, 25 pages would exceed 400MB — unsafe. Hard-cap both DPI and pages
  // so callers cannot accidentally pass unsafe values.
  const SAFE_MAX_PAGES = 25;
  const SAFE_MAX_DPI = 100;
  const effectiveMaxPages = Math.min(maxPages, SAFE_MAX_PAGES);
  const effectiveDpi = Math.min(dpi, SAFE_MAX_DPI);
  if (dpi > SAFE_MAX_DPI) {
    log(`[Memory Guard] DPI capped from ${dpi} to ${effectiveDpi} (caller requested ${dpi} DPI which would exceed Cloud Run memory limit)`);
  }
  log(`[Memory Guard] Rendering ${effectiveMaxPages} pages at ${effectiveDpi} DPI (Cloud Run safe)`);

  const errors: string[] = [];
  const pages: PdfPageImage[] = [];

  // Deterministic S3 key prefix based on PDF URL hash
  const urlHash = createHash("md5").update(pdfUrl).digest("hex").slice(0, 8);

  // Download PDF to temp file
  log(`Downloading PDF from ${pdfUrl}`);
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await downloadPdfBuffer(pdfUrl);
    log(`PDF downloaded: ${pdfBuffer.length} bytes`);
  } catch (err: any) {
    errors.push(`PDF download failed: ${err.message}`);
    log(`ERROR: ${err.message}`);
    return { pages: [], totalPagesRendered: 0, totalPagesInDocument: 0, truncated: false, errors };
  }

  // Write to temp file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kinga-pdf-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");

  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    // Release the large buffer now that it's on disk
    (pdfBuffer as any) = null;

    // Get total page count
    const totalPages = await getPdfPageCount(pdfPath);
    const pagesToRender = Math.min(totalPages || effectiveMaxPages, effectiveMaxPages);
    const truncated = totalPages > effectiveMaxPages;

    if (totalPages > 0) {
      log(`PDF loaded: ${totalPages} pages, rendering ${pagesToRender} at ${effectiveDpi} DPI`);
      if (truncated) {
        log(`WARNING: PDF has ${totalPages} pages, rendering first ${effectiveMaxPages} only`);
      }
    } else {
      log(`PDF page count unknown, rendering up to ${effectiveMaxPages} pages`);
    }

    // Run pdftoppm to render pages
    try {
      await execFileAsync(
        "pdftoppm",
        ["-r", String(effectiveDpi), "-f", "1", "-l", String(pagesToRender), "-png", pdfPath, outputPrefix],
        { timeout: 60_000, maxBuffer: 100 * 1024 * 1024 }
      );
    } catch (err: any) {
      errors.push(`pdftoppm render failed: ${err.message}`);
      log(`ERROR: pdftoppm failed: ${err.message}`);
      return { pages: [], totalPagesRendered: 0, totalPagesInDocument: totalPages, truncated, errors };
    }

    // Find rendered PNG files
    const pngFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith("page") && f.endsWith(".png"))
      .sort();

    log(`pdftoppm rendered ${pngFiles.length} page(s)`);

    // Upload each page to S3 (with landscape auto-rotation)
    for (const pngFile of pngFiles) {
      const match = pngFile.match(/(\d+)\.png$/);
      const pageNum = match ? parseInt(match[1], 10) : pages.length + 1;
      try {
        const pngPath = path.join(tmpDir, pngFile);
        let pngBuf: Buffer = fs.readFileSync(pngPath);

        // ── LANDSCAPE AUTO-ROTATION ──────────────────────────────────────────
        // PDF pages stored in landscape orientation (width > height) confuse the
        // LLM — table columns appear rotated 90°, causing wrong column reads.
        // Detect landscape pages and rotate 90° clockwise to portrait.
        try {
          const meta = await sharp(pngBuf).metadata();
          if (meta.width && meta.height && meta.width > meta.height) {
            log(`Page ${pageNum}: landscape detected (${meta.width}×${meta.height}) — rotating 90° to portrait`);
            pngBuf = Buffer.from(await sharp(pngBuf).rotate(90).png().toBuffer());
          }
        } catch (rotErr: any) {
          log(`Page ${pageNum}: rotation check failed (non-fatal): ${rotErr.message}`);
        }
        // ─────────────────────────────────────────────────────────────────────

        // Read final dimensions from the (possibly rotated) buffer — avoids S3 re-fetch later
        let imgWidth = 0;
        let imgHeight = 0;
        try {
          const finalMeta = await sharp(pngBuf).metadata();
          imgWidth = finalMeta.width ?? 0;
          imgHeight = finalMeta.height ?? 0;
        } catch { /* non-fatal — dimensions will be 0 */ }
        const s3Key = `${keyPrefix}/${urlHash}/page-${String(pageNum).padStart(3, "0")}.png`;
        const { url, key } = await storagePut(s3Key, pngBuf, "image/png");
        pages.push({ pageNumber: pageNum, url, key, fileSizeBytes: pngBuf.length, width: imgWidth, height: imgHeight });
        log(`Rendered + uploaded page ${pageNum}/${pagesToRender} → ${url}`);
      } catch (err: any) {
        const msg = `Page ${pageNum} upload failed: ${err.message}`;
        errors.push(msg);
        log(`ERROR: ${msg}`);
      }
    }

    log(`Rendering complete: ${pages.length}/${pagesToRender} pages uploaded`);
    return {
      pages,
      totalPagesRendered: pages.length,
      totalPagesInDocument: totalPages,
      truncated,
      errors,
    };

  } finally {
    // Clean up temp directory
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
}

/**
 * Extract only the page image URLs from a render result.
 * Convenience wrapper for use in stage-1.
 */
export function extractImageUrls(result: PdfToImagesResult): string[] {
  return result.pages.map((p) => p.url);
}

/**
 * Render specific pages of a PDF to PNG images and upload to S3.
 *
 * Used by Stage 6 PDF direct vision path: after the LLM identifies which
 * pages contain vehicle damage photos, only those pages are rendered and
 * uploaded — avoiding the memory/time cost of rendering all pages upfront.
 *
 * @param pdfUrl       Public URL of the PDF (presigned or CDN)
 * @param pageNumbers  1-based page numbers to render (e.g. [3, 7, 12])
 * @param options      Rendering options (dpi, keyPrefix, log)
 * @returns            Map of page number → uploaded image URL
 */
export async function renderSpecificPdfPages(
  pdfUrl: string,
  pageNumbers: number[],
  options: PdfToImagesOptions = {}
): Promise<Map<number, PdfPageImage>> {
  const {
    dpi = 100,
    keyPrefix = "pdf-damage-pages",
    log = () => {},
  } = options;

  const result = new Map<number, PdfPageImage>();
  if (pageNumbers.length === 0) return result;

  const urlHash = createHash("md5").update(pdfUrl).digest("hex").slice(0, 12);

  // Download PDF once
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await downloadPdfBuffer(pdfUrl);
    log(`PDF downloaded for targeted render: ${pdfBuffer.length} bytes, ${pageNumbers.length} page(s) to render`);
  } catch (err: any) {
    log(`ERROR: PDF download failed for targeted render: ${err.message}`);
    return result;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kinga-pdf-targeted-"));
  const pdfPath = path.join(tmpDir, "input.pdf");

  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    (pdfBuffer as any) = null; // release memory

    // Render each requested page individually using pdftoppm -f <page> -l <page>
    for (const pageNum of pageNumbers) {
      const outputPrefix = path.join(tmpDir, `page-${pageNum}`);
      try {
        await execFileAsync(
          "pdftoppm",
          ["-r", String(dpi), "-f", String(pageNum), "-l", String(pageNum), "-png", pdfPath, outputPrefix],
          { timeout: 30_000, maxBuffer: 50 * 1024 * 1024 }
        );

        // Find the output file — pdftoppm names it <prefix>-<padded>.png
        const pngFiles = fs.readdirSync(tmpDir)
          .filter(f => f.startsWith(`page-${pageNum}-`) && f.endsWith(".png"));

        if (pngFiles.length === 0) {
          log(`Page ${pageNum}: pdftoppm produced no output`);
          continue;
        }

        const pngPath = path.join(tmpDir, pngFiles[0]);
        let pngBuf: Buffer = fs.readFileSync(pngPath);

        // Auto-rotate landscape pages to portrait
        try {
          const meta = await sharp(pngBuf).metadata();
          if (meta.width && meta.height && meta.width > meta.height) {
            log(`Page ${pageNum}: landscape detected (${meta.width}×${meta.height}) — rotating 90° to portrait`);
            pngBuf = Buffer.from(await sharp(pngBuf).rotate(90).png().toBuffer());
          }
        } catch { /* non-fatal */ }

        // Read final dimensions
        let imgWidth = 0, imgHeight = 0;
        try {
          const finalMeta = await sharp(pngBuf).metadata();
          imgWidth = finalMeta.width ?? 0;
          imgHeight = finalMeta.height ?? 0;
        } catch { /* non-fatal */ }

        const s3Key = `${keyPrefix}/${urlHash}/damage-page-${String(pageNum).padStart(3, "0")}.png`;
        const { url, key } = await storagePut(s3Key, pngBuf, "image/png");
        result.set(pageNum, {
          pageNumber: pageNum,
          url,
          key,
          fileSizeBytes: pngBuf.length,
          width: imgWidth,
          height: imgHeight,
        });
        log(`Rendered + uploaded damage page ${pageNum} → ${url}`);

        // Clean up the rendered file immediately to free disk space
        try { fs.unlinkSync(pngPath); } catch { /* non-fatal */ }
      } catch (err: any) {
        log(`ERROR: Page ${pageNum} render/upload failed: ${err.message}`);
      }
    }

    log(`Targeted render complete: ${result.size}/${pageNumbers.length} damage pages uploaded`);
    return result;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
}
