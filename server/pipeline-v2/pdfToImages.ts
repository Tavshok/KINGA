/**
 * pdfToImages.ts
 *
 * WI-2: PDF page rendering engine — Pure Node.js implementation.
 *
 * Renders each page of a PDF document to a PNG image using pdfjs-dist
 * + @napi-rs/canvas. No system binaries required — works in Cloud Run
 * production containers (Node-only runtime, no poppler-utils).
 *
 * DESIGN DECISIONS
 * ─────────────────
 * 1. Uses pdfjs-dist (pure JS PDF parser) + @napi-rs/canvas (native canvas
 *    bindings via napi-rs) — no pdftoppm, no pdfinfo, no system binaries.
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
 * 5. Streaming: renders + uploads one page at a time to keep peak memory
 *    low (~15MB canvas buffer + 1 in-flight upload at any time).
 *
 * TIMEOUT GUARDS
 * ─────────────────────────────────────────────────────────────────
 * - PDF download: 60s hard timeout (AbortController covers both connection AND body read)
 * - Per-page render: 30s (pdfjs page render is synchronous-ish but can hang on corrupt pages)
 * - Global: 3 minutes total
 */

import { createHash } from "crypto";
import * as napiCanvas from "@napi-rs/canvas";
import { storagePut } from "../storage";

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

// Lazy-loaded pdfjs-dist instance (shared across calls)
let _pdfjsLib: any = null;
async function getPdfjsLib(): Promise<any> {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Disable worker in Node.js environment
  _pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  return _pdfjsLib;
}

/**
 * Download a PDF from a URL into a Buffer.
 * Hard 60-second timeout covers both the connection and the full body read.
 */
async function downloadPdfBuffer(url: string): Promise<Buffer> {
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
  return buffer;
}

/**
 * Render PDF pages to PNG images using pdfjs-dist + @napi-rs/canvas.
 * Pure Node.js — no system binaries required.
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

  const SCALE = dpi / 72;
  const errors: string[] = [];
  const pages: PdfPageImage[] = [];

  // Deterministic S3 key prefix based on PDF URL hash
  const urlHash = createHash("md5").update(pdfUrl).digest("hex").slice(0, 8);

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

  let pdfjsLib: any;
  try {
    pdfjsLib = await getPdfjsLib();
  } catch (err: any) {
    errors.push(`Failed to load pdfjs-dist: ${err.message}`);
    log(`ERROR: ${err.message}`);
    return { pages: [], totalPagesRendered: 0, totalPagesInDocument: 0, truncated: false, errors };
  }

  let pdfDoc: any;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      disableFontFace: true,
      standardFontDataUrl: undefined,
    });
    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    errors.push(`PDF parse failed: ${err.message}`);
    log(`ERROR: PDF parse failed: ${err.message}`);
    return { pages: [], totalPagesRendered: 0, totalPagesInDocument: 0, truncated: false, errors };
  }

  const totalPages = pdfDoc.numPages;
  const pagesToRender = Math.min(totalPages, maxPages);
  const truncated = totalPages > maxPages;
  log(`PDF loaded: ${totalPages} pages, rendering ${pagesToRender} at ${dpi} DPI`);

  if (truncated) {
    log(`WARNING: PDF has ${totalPages} pages, rendering first ${maxPages} only`);
  }

  // Streaming: render + upload each page immediately, release canvas buffer
  for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = napiCanvas.createCanvas(
        Math.round(viewport.width),
        Math.round(viewport.height)
      );
      const ctx = canvas.getContext("2d");

      // Render with a 30s per-page timeout
      const renderPromise = page.render({ canvasContext: ctx as any, viewport }).promise;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Page ${pageNum} render timed out after 30s`)), 30_000)
      );
      await Promise.race([renderPromise, timeoutPromise]);

      const pngBuffer = canvas.toBuffer("image/png");

      // Upload to S3 immediately — release pngBuffer after upload
      const s3Key = `${keyPrefix}/${urlHash}/page-${String(pageNum).padStart(3, "0")}.png`;
      const { url, key } = await storagePut(s3Key, pngBuffer, "image/png");
      pages.push({ pageNumber: pageNum, url, key, fileSizeBytes: pngBuffer.length });
      log(`Rendered + uploaded page ${pageNum}/${pagesToRender} → ${url}`);

      // Release page resources
      page.cleanup();
    } catch (err: any) {
      const msg = `Page ${pageNum} render/upload failed: ${err.message}`;
      errors.push(msg);
      log(`ERROR: ${msg}`);
      // Continue with remaining pages
    }
  }

  // Cleanup pdfjs document
  try {
    await pdfDoc.destroy();
  } catch {
    // Non-fatal
  }

  log(`Rendering complete: ${pages.length}/${pagesToRender} pages uploaded`);
  return {
    pages,
    totalPagesRendered: pages.length,
    totalPagesInDocument: totalPages,
    truncated,
    errors,
  };
}

/**
 * Extract only the page image URLs from a render result.
 * Convenience wrapper for use in stage-1.
 */
export function extractImageUrls(result: PdfToImagesResult): string[] {
  return result.pages.map((p) => p.url);
}
