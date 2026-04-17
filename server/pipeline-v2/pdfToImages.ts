/**
 * pdfToImages.ts
 *
 * PDF → PNG image extraction with multi-pathway resilience:
 *
 *   PRIMARY:  MuPDF (npm `mupdf` package — self-contained, no system binary)
 *   FALLBACK: pdftoppm (poppler-utils system binary)
 *   TERTIARY: pdfimages (embedded image extraction — handled in stage-1)
 *
 * RELIABILITY IMPROVEMENTS (Month 2):
 *   - MuPDF is a pure Node.js library — no system binary dependency
 *   - pdftoppm now THROWS on failure instead of silently returning empty array
 *   - isScannedPdf detection triggers 200 DPI re-render for better OCR quality
 *   - Startup health check exported for server boot validation
 *   - renderEngine field in result for audit trail
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
  /** Which rendering engine was used */
  renderEngine: "mupdf" | "pdftoppm" | "none";
  /** Whether the PDF was detected as a scanned document */
  isScannedPdf: boolean;
  /** Effective DPI used (may be higher than requested for scanned PDFs) */
  effectiveDpi: number;
}

// ── Startup health check ──────────────────────────────────────────────────────
/**
 * Verifies that at least one PDF rendering engine is available.
 * Called at server boot — logs a WARNING if pdftoppm is missing (MuPDF is always available).
 */
export async function checkPdfRenderingEngines(): Promise<void> {
  // MuPDF is always available (npm package) — primary engine
  try {
    const { Document } = await import("mupdf");
    void Document;
    console.log("[PDF Health] MuPDF (primary): ✅ available");
  } catch (err) {
    console.error("[PDF Health] MuPDF (primary): ❌ FAILED —", String(err));
    console.error("[PDF Health] CRITICAL: PDF rendering unavailable. Image analysis will be disabled.");
  }
  // pdftoppm availability check (fallback only)
  try {
    await execFileAsync("pdftoppm", ["-v"]);
    console.log("[PDF Health] pdftoppm (fallback): ✅ available");
  } catch {
    console.warn("[PDF Health] pdftoppm (fallback): ⚠️  not available — MuPDF will be used exclusively");
  }
}

// ── Scanned PDF detection ─────────────────────────────────────────────────────
/**
 * Detects whether a PDF is a scanned document (raster image pages with no
 * native text objects). Scanned PDFs require higher DPI for quality OCR.
 */
async function detectScannedPdf(pdfPath: string): Promise<boolean> {
  try {
    const { stdout: infoOut } = await execFileAsync("pdfinfo", [pdfPath]).catch(() => ({ stdout: "" }));
    const pageMatch = infoOut.match(/Pages:\s+(\d+)/);
    const pages = pageMatch ? parseInt(pageMatch[1], 10) : 1;
    try {
      const { stdout: text } = await execFileAsync("pdftotext", [pdfPath, "-"]);
      const charsPerPage = text.replace(/\s/g, "").length / Math.max(pages, 1);
      // Scanned PDFs typically have < 50 non-whitespace chars per page
      return charsPerPage < 50;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

// ── MuPDF rendering (primary) ─────────────────────────────────────────────────
async function renderWithMuPdf(
  pdfPath: string,
  dpi: number,
  maxPages: number,
  tempDir: string,
  log: (msg: string) => void
): Promise<{ files: string[]; totalPages: number; truncated: boolean }> {
  const { Document } = await import("mupdf");
  const { readFile: fsReadFile, writeFile: fsWriteFile } = await import("fs/promises");
  const pdfBuffer = await fsReadFile(pdfPath);
  const doc = Document.openDocument(pdfBuffer, "application/pdf");
  const totalPages = doc.countPages();
  const pagesToRender = Math.min(totalPages, maxPages);
  const truncated = totalPages > maxPages;
  log(`MuPDF: rendering ${pagesToRender}/${totalPages} pages at ${dpi} DPI`);
  const files: string[] = [];
  const scale = dpi / 72;
  for (let i = 0; i < pagesToRender; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap([scale, 0, 0, scale, 0, 0], "DeviceRGB", false);
    const pngBytes = pixmap.asPNG();
    const pageNum = i + 1;
    const filePath = join(tempDir, `page-${String(pageNum).padStart(3, "0")}.png`);
    await fsWriteFile(filePath, Buffer.from(pngBytes));
    files.push(filePath);
  }
  log(`MuPDF: rendered ${files.length} pages`);
  return { files, totalPages, truncated };
}

/**
 * Download a PDF from a URL to a temp file.
 */
async function downloadPdf(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: HTTP ${response.status} — ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const { writeFile } = await import("fs/promises");
  await writeFile(destPath, buffer);
}

// ── pdftoppm rendering (fallback) — now THROWS on failure ────────────────────
async function renderWithPdftoppm(
  pdfPath: string,
  dpi: number,
  maxPages: number,
  tempDir: string,
  log: (msg: string) => void
): Promise<{ files: string[]; totalPages: number; truncated: boolean }> {
  const totalPages = await getPdfPageCount(pdfPath);
  const pagesToRender = Math.min(totalPages || maxPages, maxPages);
  const truncated = totalPages > maxPages;
  const outputPrefix = join(tempDir, "page");
  log(`pdftoppm: rendering ${pagesToRender} pages at ${dpi} DPI`);
  // FIXED: now throws on failure instead of silently returning empty array
  await execFileAsync("pdftoppm", [
    "-r", String(dpi),
    "-png",
    "-l", String(pagesToRender),
    pdfPath,
    outputPrefix,
  ]).catch((err) => {
    throw new Error(`pdftoppm failed: ${String(err)}`);
  });
  const allFiles = await readdir(tempDir);
  const files = allFiles
    .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
    .sort()
    .map((f) => join(tempDir, f));
  if (files.length === 0) {
    throw new Error(`pdftoppm produced 0 pages (dpi=${dpi}, maxPages=${maxPages})`);
  }
  log(`pdftoppm: rendered ${files.length} pages`);
  return { files, totalPages, truncated };
}

/**
 * Get the total page count of a PDF using pdfinfo.
 */
async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath]);
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
    dpi: requestedDpi = 150,
    maxPages = 20,
    keyPrefix = "pdf-pages",
    log = () => {},
  } = options;

  const errors: string[] = [];
  const pages: PdfPageImage[] = [];
  let tempDir: string | null = null;
  let renderEngine: "mupdf" | "pdftoppm" | "none" = "none";
  let isScannedPdf = false;
  let effectiveDpi = requestedDpi;

  try {
    tempDir = await mkdtemp(join(tmpdir(), "kinga-pdf-"));
    const pdfPath = join(tempDir, "document.pdf");

    log(`Downloading PDF from ${pdfUrl}`);
    await downloadPdf(pdfUrl, pdfPath);

    // ── Scanned PDF detection — upgrade DPI for better quality ───────────
    isScannedPdf = await detectScannedPdf(pdfPath);
    if (isScannedPdf) {
      effectiveDpi = Math.max(requestedDpi, 200);
      log(`Scanned PDF detected — upgrading DPI from ${requestedDpi} to ${effectiveDpi} for better OCR quality`);
    } else {
      effectiveDpi = requestedDpi;
    }

    const urlHash = createHash("md5").update(pdfUrl).digest("hex").slice(0, 8);

    // ── Try MuPDF first (primary — pure Node.js, no system binary) ───────
    let renderFiles: string[] = [];
    let totalPages = 0;
    let truncated = false;

    try {
      const result = await renderWithMuPdf(pdfPath, effectiveDpi, maxPages, tempDir, log);
      renderFiles = result.files;
      totalPages = result.totalPages;
      truncated = result.truncated;
      renderEngine = "mupdf";
      log(`MuPDF: successfully rendered ${renderFiles.length} pages`);
    } catch (mupdfErr) {
      const msg = `MuPDF rendering failed: ${String(mupdfErr)}`;
      errors.push(msg);
      log(`WARNING: ${msg} — trying pdftoppm fallback`);

      // ── Fallback to pdftoppm ────────────────────────────────────────────
      try {
        const result = await renderWithPdftoppm(pdfPath, effectiveDpi, maxPages, tempDir, log);
        renderFiles = result.files;
        totalPages = result.totalPages;
        truncated = result.truncated;
        renderEngine = "pdftoppm";
        log(`pdftoppm fallback: successfully rendered ${renderFiles.length} pages`);
      } catch (pdftoppmErr) {
        const msg2 = `pdftoppm fallback also failed: ${String(pdftoppmErr)}`;
        errors.push(msg2);
        log(`ERROR: ${msg2} — no page images available`);
        return {
          pages: [],
          totalPagesRendered: 0,
          totalPagesInDocument: 0,
          truncated: false,
          errors,
          renderEngine: "none",
          isScannedPdf,
          effectiveDpi,
        };
      }
    }

    if (truncated) {
      log(`WARNING: PDF has ${totalPages} pages, rendered first ${maxPages} only`);
    }

    // ── Upload rendered pages to S3 ───────────────────────────────────────
    for (const filePath of renderFiles) {
      const fileName = filePath.split("/").pop() || "";
      const pageMatch = fileName.match(/page-(\d+)\.png/);
      const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : 0;

      try {
        const buffer = await readFile(filePath);
        const s3Key = `${keyPrefix}/${urlHash}/page-${String(pageNumber).padStart(3, "0")}.png`;
        const { url, key } = await storagePut(s3Key, buffer, "image/png");
        pages.push({ pageNumber, url, key, fileSizeBytes: buffer.length });
        log(`Uploaded page ${pageNumber} → ${url}`);
      } catch (uploadErr) {
        const msg = `Failed to upload page ${pageNumber}: ${String(uploadErr)}`;
        errors.push(msg);
        log(`ERROR: ${msg}`);
      }
    }

    return {
      pages,
      totalPagesRendered: pages.length,
      totalPagesInDocument: totalPages,
      truncated,
      errors,
      renderEngine,
      isScannedPdf,
      effectiveDpi,
    };
  } finally {
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
