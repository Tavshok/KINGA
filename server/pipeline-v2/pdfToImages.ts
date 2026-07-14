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

// ── Quality analysis constants (mirrors pdf-image-extractor.ts analyseImageQuality) ──
/** Laplacian variance below which a page is considered blurry */
const BLUR_VARIANCE_THRESHOLD = 50;
/** Greyscale std dev below which a page is considered uniform/blank */
const UNIFORM_STDDEV_THRESHOLD = 10;
/** Fraction of pixels above 220 brightness above which a page is text-heavy */
const TEXT_PAGE_WHITE_RATIO = 0.65;

/**
 * P1 fix: Compute real quality metadata from a PNG buffer.
 * Called before S3 upload so db.ts can use real values instead of hardcoded ones.
 * Uses the same algorithm as pdf-image-extractor.ts analyseImageQuality().
 */
async function computePageQuality(
  pngBuf: Buffer, w: number, h: number
): Promise<PdfPageImage['quality']> {
  const aspectRatio = w / (h || 1);
  const pixelArea = w * h;
  let blurScore = 80;       // fallback: neutral
  let colourVariance = 80;  // fallback: neutral
  let isBlurry = false;
  let isTextHeavy = false;
  let isUniform = false;
  try {
    const analysisWidth = Math.min(200, w);
    const analysisHeight = Math.round(h * (analysisWidth / w));
    const { data: greyData, info: greyInfo } = await sharp(pngBuf)
      .resize(analysisWidth, analysisHeight, { fit: 'fill' })
      .greyscale().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(greyData);
    const n = pixels.length;
    const pw = greyInfo.width, ph = greyInfo.height;
    // Laplacian variance (blur score)
    let lapSum = 0, lapSumSq = 0, lapCount = 0;
    for (let y = 0; y < ph; y++) {
      for (let x = 1; x < pw - 1; x++) {
        const idx = y * pw + x;
        const lap = -pixels[idx - 1] + 2 * pixels[idx] - pixels[idx + 1];
        lapSum += lap; lapSumSq += lap * lap; lapCount++;
      }
    }
    if (lapCount > 0) {
      const lapMean = lapSum / lapCount;
      blurScore = Math.round(Math.abs(lapSumSq / lapCount - lapMean * lapMean));
    }
    // Text-heavy detection
    let whitePixels = 0;
    for (let i = 0; i < n; i++) if (pixels[i] > 220) whitePixels++;
    isTextHeavy = whitePixels / n > TEXT_PAGE_WHITE_RATIO;
    // Colour variance (greyscale std dev)
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) { sum += pixels[i]; sumSq += pixels[i] * pixels[i]; }
    const mean = sum / n;
    colourVariance = Math.round(Math.sqrt(Math.max(0, sumSq / n - mean * mean)));
    isUniform = colourVariance < UNIFORM_STDDEV_THRESHOLD;
    isBlurry = blurScore < BLUR_VARIANCE_THRESHOLD;
  } catch { /* non-fatal: use fallback values */ }
  return { blurScore, colourVariance, isBlurry, isTextHeavy, isUniform, aspectRatio, pixelArea };
}

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
  /**
   * P1 fix: Real quality metadata computed from the buffer before upload.
   * Replaces the hardcoded blurScore:80/colourVariance:80 in db.ts.
   * Uses the same Laplacian-variance blur and greyscale std-dev colour metrics
   * as pdf-image-extractor.ts analyseImageQuality().
   */
  quality?: {
    blurScore: number;       // Laplacian variance (raw, 0-∞; higher = sharper)
    colourVariance: number;  // Greyscale std dev (raw, 0-255; higher = more colour)
    isBlurry: boolean;
    isTextHeavy: boolean;
    isUniform: boolean;
    aspectRatio: number;
    pixelArea: number;
  };
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
  // Support file:// URLs for local temp files (used by pdf-image-extractor.ts)
  if (url.startsWith('file://')) {
    const { readFileSync } = await import('fs');
    const filePath = url.replace(/^file:\/\//, '');
    return readFileSync(filePath);
  }
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
  // KINGA precision principle: honour caller-specified DPI and page limit exactly.
  // pdftoppm writes pages to disk one at a time, so peak RAM = 1 page buffer.
  // The Dockerfile allocates sufficient memory for full-resolution rendering.
  const effectiveMaxPages = maxPages;
  const effectiveDpi = dpi;
  log(`Rendering up to ${effectiveMaxPages} pages at ${effectiveDpi} DPI`);

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
        // P1 fix: Compute real quality metadata before upload (while buffer is still in memory)
        const pageQuality = await computePageQuality(pngBuf, imgWidth, imgHeight);
        const s3Key = `${keyPrefix}/${urlHash}/page-${String(pageNum).padStart(3, "0")}.png`;
        const { url, key } = await storagePut(s3Key, pngBuf, "image/png");
        pages.push({ pageNumber: pageNum, url, key, fileSizeBytes: pngBuf.length, width: imgWidth, height: imgHeight, quality: pageQuality });
        log(`Rendered + uploaded page ${pageNum}/${pagesToRender} blur=${pageQuality?.blurScore ?? '?'} colour=${pageQuality?.colourVariance ?? '?'} textHeavy=${pageQuality?.isTextHeavy ?? '?'} → ${url}`);
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
    dpi = 200, // KINGA precision: full DPI for targeted damage page renders
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

    // ── Parallel rendering: render all pages concurrently (pdftoppm is CPU-bound
    //    but each invocation is independent), then upload to S3 in parallel with
    //    a concurrency limit of 4 to avoid overwhelming the storage API.
    const RENDER_CONCURRENCY = 4;

    // Helper: render one page to a PNG buffer
    const renderPage = async (pageNum: number): Promise<{ pageNum: number; pngBuf: Buffer; imgWidth: number; imgHeight: number } | null> => {
      const outputPrefix = path.join(tmpDir, `page-${pageNum}`);
      try {
        await execFileAsync(
          "pdftoppm",
          ["-r", String(dpi), "-f", String(pageNum), "-l", String(pageNum), "-png", pdfPath, outputPrefix],
          { timeout: 30_000, maxBuffer: 50 * 1024 * 1024 }
        );
        const pngFiles = fs.readdirSync(tmpDir)
          .filter(f => f.startsWith(`page-${pageNum}-`) && f.endsWith(".png"));
        if (pngFiles.length === 0) {
          log(`Page ${pageNum}: pdftoppm produced no output`);
          return null;
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
        let imgWidth = 0, imgHeight = 0;
        try {
          const finalMeta = await sharp(pngBuf).metadata();
          imgWidth = finalMeta.width ?? 0;
          imgHeight = finalMeta.height ?? 0;
        } catch { /* non-fatal */ }
        // Clean up immediately after reading into memory
        try { fs.unlinkSync(pngPath); } catch { /* non-fatal */ }
        return { pageNum, pngBuf, imgWidth, imgHeight };
      } catch (err: any) {
        log(`ERROR: Page ${pageNum} render failed: ${err.message}`);
        return null;
      }
    };

    // Helper: upload one rendered page to S3
    const uploadPage = async (item: { pageNum: number; pngBuf: Buffer; imgWidth: number; imgHeight: number }): Promise<void> => {
      const { pageNum, pngBuf, imgWidth, imgHeight } = item;
      try {
        const s3Key = `${keyPrefix}/${urlHash}/damage-page-${String(pageNum).padStart(3, "0")}.png`;
        const { url, key } = await storagePut(s3Key, pngBuf, "image/png");
        result.set(pageNum, { pageNumber: pageNum, url, key, fileSizeBytes: pngBuf.length, width: imgWidth, height: imgHeight });
        log(`Rendered + uploaded damage page ${pageNum} → ${url}`);
      } catch (err: any) {
        log(`ERROR: Page ${pageNum} upload failed: ${err.message}`);
      }
    };

    // Run renders in parallel batches of RENDER_CONCURRENCY
    const rendered: Array<{ pageNum: number; pngBuf: Buffer; imgWidth: number; imgHeight: number }> = [];
    for (let i = 0; i < pageNumbers.length; i += RENDER_CONCURRENCY) {
      const batch = pageNumbers.slice(i, i + RENDER_CONCURRENCY);
      const batchResults = await Promise.all(batch.map(renderPage));
      for (const r of batchResults) {
        if (r) rendered.push(r);
      }
    }
    log(`Rendered ${rendered.length}/${pageNumbers.length} pages — uploading to S3 in parallel...`);

    // Upload all rendered pages in parallel batches of RENDER_CONCURRENCY
    for (let i = 0; i < rendered.length; i += RENDER_CONCURRENCY) {
      const batch = rendered.slice(i, i + RENDER_CONCURRENCY);
      await Promise.all(batch.map(uploadPage));
    }

    log(`Targeted render complete: ${result.size}/${pageNumbers.length} damage pages uploaded`);
    return result;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
}

// ── RECOVERY LADDER ────────────────────────────────────────────────────────────
//
// Document Reliability Architecture — Phase 4
//
// When pdftoppm fails or produces 0 pages, the recovery ladder attempts
// alternative extraction strategies before escalating to human review.
//
// Strategy 1: pdfimages — extract embedded images directly from the PDF
//   (works for PDFs that contain JPEG/PNG photos embedded as objects)
// Strategy 2: pdftotext — extract text content only
//   (works for text-based PDFs; provides evidence for Stage 3 even without photos)
//
// Both strategies are available via poppler-utils (already in apt.txt).
// ──────────────────────────────────────────────────────────────────────────────

export interface EmbeddedImageExtractionResult {
  /** Number of embedded images found in the PDF */
  imagesFound: number;
  /** S3 URLs of extracted images that passed dimension threshold */
  imageUrls: string[];
  /** Images that failed dimension threshold */
  rejectedCount: number;
  /** Error message if extraction failed */
  error: string | null;
  /** Duration in milliseconds */
  durationMs: number;
}

export interface OcrTextExtractionResult {
  /** Whether text was successfully extracted */
  success: boolean;
  /** Extracted text content */
  text: string;
  /** Number of characters extracted */
  charCount: number;
  /** Error message if extraction failed */
  error: string | null;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Recovery Strategy 1: Extract embedded images from a PDF using pdfimages.
 *
 * pdfimages (poppler-utils) extracts images that are embedded as objects
 * within the PDF, as opposed to pdftoppm which renders each page as a raster.
 * This is the correct tool for PDFs that contain JPEG/PNG photos (e.g. a
 * claim form with embedded damage photographs).
 *
 * @param pdfBuffer  PDF file content as a Buffer
 * @param keyPrefix  S3 key prefix for uploaded images
 * @param log        Logger function
 */
export async function extractEmbeddedImages(
  pdfBuffer: Buffer,
  keyPrefix: string = 'pdf-embedded',
  log: (msg: string) => void = () => {}
): Promise<EmbeddedImageExtractionResult> {
  const startMs = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinga-pdfimages-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const outputPrefix = path.join(tmpDir, 'img');

  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    log(`[Recovery-1] Running pdfimages on ${pdfBuffer.length} byte PDF`);

    try {
      await execFileAsync(
        'pdfimages',
        ['-png', '-j', pdfPath, outputPrefix],
        { timeout: 60_000, maxBuffer: 100 * 1024 * 1024 }
      );
    } catch (err: any) {
      log(`[Recovery-1] pdfimages failed: ${err.message}`);
      return { imagesFound: 0, imageUrls: [], rejectedCount: 0, error: err.message, durationMs: Date.now() - startMs };
    }

    // Find extracted image files
    const imgFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('img') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.ppm')))
      .sort();

    log(`[Recovery-1] pdfimages extracted ${imgFiles.length} image(s)`);

    if (imgFiles.length === 0) {
      return { imagesFound: 0, imageUrls: [], rejectedCount: 0, error: null, durationMs: Date.now() - startMs };
    }

    // Upload images that pass dimension threshold to S3
    const imageUrls: string[] = [];
    let rejectedCount = 0;
    const urlHash = createHash('md5').update(pdfBuffer.slice(0, 256)).digest('hex').slice(0, 8);

    for (let i = 0; i < imgFiles.length; i++) {
      const imgFile = imgFiles[i];
      const imgPath = path.join(tmpDir, imgFile);
      try {
        let imgBuf: Buffer = fs.readFileSync(imgPath);

        // Convert PPM to PNG if needed (pdfimages can output PPM for some images)
        if (imgFile.endsWith('.ppm')) {
          try {
            imgBuf = Buffer.from(await sharp(imgBuf).png().toBuffer());
          } catch {
            log(`[Recovery-1] PPM→PNG conversion failed for ${imgFile}, skipping`);
            rejectedCount++;
            continue;
          }
        }

        // Dimension check
        let w = 0, h = 0;
        try {
          const meta = await sharp(imgBuf).metadata();
          w = meta.width ?? 0;
          h = meta.height ?? 0;
        } catch { /* non-fatal */ }

        if (w < 200 || h < 200) {
          log(`[Recovery-1] Image ${i + 1}: too small (${w}×${h}), skipping`);
          rejectedCount++;
          continue;
        }

        const s3Key = `${keyPrefix}/${urlHash}/embedded-${String(i + 1).padStart(3, '0')}.png`;
        const { url } = await storagePut(s3Key, imgBuf, 'image/png');
        imageUrls.push(url);
        log(`[Recovery-1] Image ${i + 1}: ${w}×${h} → uploaded to S3`);
      } catch (err: any) {
        log(`[Recovery-1] Image ${i + 1}: upload failed — ${err.message}`);
        rejectedCount++;
      }
    }

    log(`[Recovery-1] Complete: ${imageUrls.length} uploaded, ${rejectedCount} rejected`);
    return {
      imagesFound: imgFiles.length,
      imageUrls,
      rejectedCount,
      error: null,
      durationMs: Date.now() - startMs,
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
}

/**
 * Recovery Strategy 2: Extract text content from a PDF using pdftotext.
 *
 * pdftotext (poppler-utils) extracts the text layer from a PDF.
 * This is useful when pdftoppm fails but the PDF contains readable text
 * (e.g. a digitally-created claim form). The extracted text can be passed
 * to Stage 3 for structured data extraction even without images.
 *
 * @param pdfBuffer  PDF file content as a Buffer
 * @param log        Logger function
 */
export async function extractPdfText(
  pdfBuffer: Buffer,
  log: (msg: string) => void = () => {}
): Promise<OcrTextExtractionResult> {
  const startMs = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinga-pdftext-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const txtPath = path.join(tmpDir, 'output.txt');

  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    log(`[Recovery-2] Running pdftotext on ${pdfBuffer.length} byte PDF`);

    try {
      await execFileAsync(
        'pdftotext',
        ['-layout', pdfPath, txtPath],
        { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
      );
    } catch (err: any) {
      log(`[Recovery-2] pdftotext failed: ${err.message}`);
      return { success: false, text: '', charCount: 0, error: err.message, durationMs: Date.now() - startMs };
    }

    if (!fs.existsSync(txtPath)) {
      return { success: false, text: '', charCount: 0, error: 'pdftotext produced no output file', durationMs: Date.now() - startMs };
    }

    const text = fs.readFileSync(txtPath, 'utf-8');
    const charCount = text.trim().length;
    log(`[Recovery-2] pdftotext extracted ${charCount} characters`);

    return {
      success: charCount > 0,
      text,
      charCount,
      error: null,
      durationMs: Date.now() - startMs,
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
}
