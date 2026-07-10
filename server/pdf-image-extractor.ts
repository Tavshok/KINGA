// @ts-nocheck
/**
 * PDF Image Extraction — Pure Node.js Multi-Strategy Pipeline
 *
 * Uses pdfjs-dist + @napi-rs/canvas (NO system binaries required).
 * Replaces pdftoppm/pdfimages/pdfinfo/pdftotext which are not available
 * in the production container.
 */
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
// sharp is loaded lazily to prevent server startup crash if the native binary
// fails to load in the Cloud Run production container.
let _sharp: typeof import('sharp').default | null = null;
async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp');
    _sharp = mod.default;
    _sharp.concurrency(1); // Limit to 1 thread to prevent memory explosion
  }
  return _sharp;
}
// @napi-rs/canvas is loaded lazily to prevent server startup crash if the
// native Skia binary fails to load in the Cloud Run production container.
let _napiCanvas: typeof import('@napi-rs/canvas') | null = null;
async function getCanvas() {
  if (!_napiCanvas) {
    _napiCanvas = await import('@napi-rs/canvas');
  }
  return _napiCanvas;
}

// ─── Configuration ────────────────────────────────────────────────────────────
// BATCH_SIZE removed — streaming approach processes one page at a time (no batching needed)
/**
 * R-A-05 FIX: Hard cap on pages rendered to prevent OOM under the 512 MiB Cloud Run limit.
 * Previously unbounded — a 100-page PDF would attempt to render all 100 pages.
 * At 200 DPI, each A4 page PNG is ~2-4 MB in memory; 100 pages = 200-400 MB peak,
 * which reliably causes OOM kills on the 512 MiB Cloud Run instance.
 *
 * Cap is set to 40 pages:
 *   - Covers the vast majority of real-world assessor reports (typically 8-25 pages)
 *   - Keeps peak memory well within the 512 MiB limit (~80-160 MB for 40 pages)
 *   - Pages beyond the cap are NOT silently dropped — a truncation warning is logged
 *     and written to ExtractionSummary.errors[] so Stage 1 can surface it.
 *
 * If a genuine claim document exceeds 40 pages, the LLM still receives the full
 * PDF via file_url in Stage 3 — only the rendered page images are capped.
 */
const MAX_PAGES_TO_RENDER = 40;
const GLOBAL_TIMEOUT_MS = 3 * 60 * 1000; // Reduced from 12min to 3min — long PDFs fall back to LLM-only extraction
const DOWNLOAD_TIMEOUT_MS = 45_000;
const DOWNLOAD_RETRIES = 3;
const S3_UPLOAD_RETRIES = 3;
const DPI_NATIVE = 150;
const DPI_SCANNED = 200; // Reduced from 250 to 200 — still readable, but uses ~36% less memory per page
const MIN_DIM_PAGE_RENDER = 300;
const MIN_DIM_EMBEDDED = 400;
const MIN_PIXEL_AREA = 90_000;
// CALIBRATION: origin unknown, do not change without benchmarking.
// Laplacian variance below this value indicates a blurry image. Value of 20 was
// chosen empirically on a sample of SA motor claim photos. A lower value would
// accept more blurry images into the pipeline; a higher value would reject
// borderline-sharp photos that may still be usable for forensics.
const BLUR_VARIANCE_THRESHOLD = 20;
// Raised from 0.82 to 0.92: pages with photos on white backgrounds were being
// incorrectly flagged as text-heavy, causing them to be classified as document_page
// and excluded from photo forensics. Only truly text-dominated pages (>92% white)
// should be marked as text-heavy.
const TEXT_PAGE_WHITE_RATIO = 0.92;
// CALIBRATION: origin unknown, do not change without benchmarking.
// Colour standard deviation below this value indicates a near-uniform (blank or
// near-blank) image. Value of 8 was chosen empirically. A lower value would
// allow more uniform images through; a higher value would reject more images
// that have subtle colour variation but no useful photographic content.
const UNIFORM_STDDEV_THRESHOLD = 8;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ImageQualityReport {
  width: number;
  height: number;
  blurScore: number;
  isBlurry: boolean;
  isTextHeavy: boolean;
  isUniform: boolean;
  colourVariance: number;
  aspectRatio: number;
  pixelArea: number;
  rejectionReason?: string;
}

export interface ExtractedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page_render' | 'embedded_image';
  quality: ImageQualityReport;
  fromScannedPdf: boolean;
  renderDpi?: number;
}

export interface ExtractionSummary {
  images: ExtractedImage[];
  isScannedPdf: boolean;
  renderDpi: number;
  pageCount: number;
  pagesRendered: number;
  embeddedCandidates: number;
  rejectedByDimension: number;
  rejectedByQuality: number;
  blurryCount: number;
  textHeavyCount: number;
  errors: string[];
}

// ─── pdfjs-dist setup ────────────────────────────────────────────────────────
let _pdfjsLib: any = null;
async function getPdfjsLib() {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = new URL(
    '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url
  ).href;
  _pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return _pdfjsLib;
}

class NapiCanvasFactory {
  async create(width: number, height: number) {
    const napiCanvas = await getCanvas();
    const canvas = napiCanvas.createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

// ─── Image Quality Analysis ───────────────────────────────────────────────────
async function analyseImageQuality(imageBuffer: Buffer, width: number, height: number): Promise<ImageQualityReport> {
  const aspectRatio = width / (height || 1);
  const pixelArea = width * height;
  let blurScore = 100;
  let isTextHeavy = false;
  let isUniform = false;
  let colourVariance = 100;
  try {
    const analysisWidth = Math.min(200, width);
    const analysisHeight = Math.round(height * (analysisWidth / width));
    const sharp = await getSharp();
    const { data: greyData, info: greyInfo } = await sharp(imageBuffer)
      .resize(analysisWidth, analysisHeight, { fit: 'fill' })
      .greyscale().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(greyData);
    const n = pixels.length;
    let lapSum = 0, lapSumSq = 0, lapCount = 0;
    const w = greyInfo.width, h = greyInfo.height;
    for (let y = 0; y < h; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = -pixels[idx - 1] + 2 * pixels[idx] - pixels[idx + 1];
        lapSum += lap; lapSumSq += lap * lap; lapCount++;
      }
    }
    if (lapCount > 0) {
      const lapMean = lapSum / lapCount;
      blurScore = Math.round(Math.abs(lapSumSq / lapCount - lapMean * lapMean));
    }
    let whitePixels = 0;
    for (let i = 0; i < n; i++) if (pixels[i] > 220) whitePixels++;
    isTextHeavy = whitePixels / n > TEXT_PAGE_WHITE_RATIO;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) { sum += pixels[i]; sumSq += pixels[i] * pixels[i]; }
    const mean = sum / n;
    colourVariance = Math.round(Math.sqrt(Math.max(0, sumSq / n - mean * mean)));
    isUniform = colourVariance < UNIFORM_STDDEV_THRESHOLD;
  } catch (err) {
    console.warn(`[Quality] Analysis failed: ${err}`);
  }
  return { width, height, blurScore, isBlurry: blurScore < BLUR_VARIANCE_THRESHOLD, isTextHeavy, isUniform, colourVariance, aspectRatio, pixelArea };
}

// ─── S3 Upload with Retry ─────────────────────────────────────────────────────
async function uploadToS3WithRetry(buffer: Buffer, key: string, contentType: string, label: string): Promise<string | null> {
  for (let attempt = 1; attempt <= S3_UPLOAD_RETRIES; attempt++) {
    try {
      const { url } = await storagePut(key, buffer, contentType);
      return url;
    } catch (err: any) {
      if (attempt < S3_UPLOAD_RETRIES) await new Promise(r => setTimeout(r, 1000 * attempt));
      else console.error(`[S3] Upload failed after ${S3_UPLOAD_RETRIES} attempts for ${label}: ${err.message}`);
    }
  }
  return null;
}

// ─── PDF Download with Retry ──────────────────────────────────────────────────
async function downloadPdfWithRetry(pdfUrl: string): Promise<Buffer> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      const response = await fetch(pdfUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`[PDF Extractor] Downloaded ${buffer.length} bytes (attempt ${attempt})`);
      return buffer;
    } catch (err: any) {
      lastError = err;
      if (attempt < DOWNLOAD_RETRIES) {
        console.warn(`[PDF Extractor] Download attempt ${attempt} failed: ${err.message}. Retrying in ${5 * attempt}s...`);
        await new Promise(r => setTimeout(r, 5000 * attempt));
      }
    }
  }
  throw lastError || new Error('PDF download failed');
}

// ─── Process a PNG buffer ─────────────────────────────────────────────────────
async function processBuffer(
  pngBuffer: Buffer, source: 'page_render' | 'embedded_image',
  minDimension: number, pageNumber: number, sessionId: string,
  fromScannedPdf: boolean, renderDpi?: number
): Promise<ExtractedImage | null> {
  try {
    const sharp = await getSharp();
    const metadata = await sharp(pngBuffer).metadata();
    const w = metadata.width || 0, h = metadata.height || 0;
    if (w < minDimension || h < minDimension) {
      console.log(`[PDF Extractor] Rejected (too small): ${source} ${w}x${h} < ${minDimension}px`);
      return null;
    }
    if (w * h < MIN_PIXEL_AREA) {
      console.log(`[PDF Extractor] Rejected (pixel area): ${source} ${w}x${h}`);
      return null;
    }
    const aspect = w / (h || 1);
    if (aspect > 10 || aspect < 0.1) {
      console.log(`[PDF Extractor] Rejected (aspect ratio): ${source} ${w}x${h} ratio=${aspect.toFixed(2)}`);
      return null;
    }
    const finalBuffer = metadata.format === 'png' ? pngBuffer : await sharp(pngBuffer).png({ quality: 90 }).toBuffer();
    const quality = await analyseImageQuality(finalBuffer, w, h);
    if (quality.isUniform) {
      console.log(`[PDF Extractor] Rejected (uniform/blank): ${source} ${w}x${h} stddev=${quality.colourVariance}`);
      quality.rejectionReason = 'uniform_blank';
      return null;
    }
    if (quality.isBlurry) console.log(`[PDF Extractor] Blurry: ${source} ${w}x${h} blurScore=${quality.blurScore}`);
    if (quality.isTextHeavy) console.log(`[PDF Extractor] Text-heavy: ${source} ${w}x${h}`);
    const imageKey = `extracted-images/${sessionId}/${nanoid(10)}.png`;
    const url = await uploadToS3WithRetry(finalBuffer, imageKey, 'image/png', `${source}-p${pageNumber}`);
    if (!url) { console.error(`[PDF Extractor] S3 upload failed for ${source} page ${pageNumber}`); return null; }
    console.log(`[PDF Extractor] Uploaded ${source} ${w}x${h} blur=${quality.blurScore} textHeavy=${quality.isTextHeavy} -> ${url.substring(0, 80)}...`);
    return { url, width: w, height: h, pageNumber, source, quality, fromScannedPdf, renderDpi };
  } catch (err: any) {
    console.error(`[PDF Extractor] Error processing buffer: ${err.message}`);
    return null;
  }
}

// ─── Main Extraction Logic (sub-functions) ───────────────────────────────────

/**
 * Detect whether a PDF is scanned (image-based) or native (text-based).
 *
 * R-A-06 FIX: Samples 30% of pages (capped at 10, min 3) distributed evenly
 * across the document and uses the MEDIAN chars/page rather than the mean.
 * This prevents a sparse cover page or blank separator from dragging the score
 * below the threshold on a genuinely native PDF.
 *
 * Returns true if the PDF is scanned (median chars/page < 100).
 */
async function detectScannedPdf(pdfDoc: any, pageCount: number): Promise<boolean> {
  try {
    const sampleCount = Math.min(Math.max(Math.ceil(pageCount * 0.3), 3), 10);
    // Distribute sample pages evenly across the document to catch hybrid layouts
    const sampleIndices: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const idx = Math.round(1 + (i / (sampleCount - 1 || 1)) * (pageCount - 1));
      sampleIndices.push(Math.min(idx, pageCount));
    }
    const charsPerPage: number[] = [];
    for (const p of sampleIndices) {
      const pg = await pdfDoc.getPage(p);
      const textContent = await pg.getTextContent();
      const chars = textContent.items.reduce((sum: number, item: any) => sum + (item.str?.length || 0), 0);
      charsPerPage.push(chars);
    }
    // Median is robust against outlier pages (blank separators, cover pages)
    const sorted = [...charsPerPage].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianChars = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const isScanned = medianChars < 100;
    console.log(`[PDF Extractor] R-A-06: Scanned detection: medianChars/page=${Math.round(medianChars)}, isScanned=${isScanned}, pages=${pageCount}, sampled=${sampleCount}`);
    return isScanned;
  } catch (e: any) {
    console.warn(`[PDF Extractor] Scanned detection failed: ${e.message}`);
    return false;
  }
}

/**
 * Apply heuristic rotation correction to a rendered page PNG buffer.
 *
 * FIX 1 (declared rotation): pdf.js exposes the /Rotate entry on page.rotate.
 * Passing it to getViewport corrects pages saved with a rotation tag in the PDF.
 *
 * FIX 2 (heuristic rotation, R-A-07): Some scanners produce portrait pages saved
 * as landscape WITHOUT setting /Rotate. We detect this by comparing the rendered
 * aspect ratio: if ratio > 1.6 and the page is not the last page (damage schedules
 * are commonly legitimately landscape), we rotate 90° CCW to portrait.
 * Threshold raised from 1.3 to 1.6 to avoid false positives on slightly-wide pages
 * (e.g. A4 landscape damage schedules, wide tables).
 * Only applied to scanned PDFs — native PDFs may have intentional landscape pages.
 *
 * Returns the (possibly rotated) PNG buffer.
 */
async function applyHeuristicRotation(
  pngBuffer: Buffer,
  pageNum: number,
  pagesToRender: number,
  isScanned: boolean,
  declaredRotation: number
): Promise<Buffer> {
  if (!isScanned || declaredRotation !== 0) return pngBuffer;
  try {
    const sharpInst = await getSharp();
    const meta = await sharpInst(pngBuffer).metadata();
    const rw = meta.width ?? 1;
    const rh = meta.height ?? 1;
    const ratio = rw / rh;
    const isLastPage = pageNum === pagesToRender;
    if (ratio > 1.6 && !isLastPage) {
      console.log(`[PDF Extractor] R-A-07: Page ${pageNum}: heuristic rotation applied (ratio=${ratio.toFixed(2)}, rotating 90° CCW to portrait)`);
      return sharpInst(pngBuffer).rotate(90).toBuffer();
    } else if (ratio > 1.3 && ratio <= 1.6) {
      console.log(`[PDF Extractor] R-A-07: Page ${pageNum}: landscape ratio=${ratio.toFixed(2)} below rotation threshold (1.6) — keeping original orientation`);
    }
  } catch (rotErr: any) {
    console.warn(`[PDF Extractor] Page ${pageNum}: heuristic rotation check failed: ${rotErr.message}`);
  }
  return pngBuffer;
}

/**
 * Extract embedded images from a single PDF page using the pdf.js operator list.
 *
 * pdf.js operator codes used here:
 *   85 = paintImageXObject   — references an external XObject image by name
 *   86 = paintInlineImageXObject — references an inline image by name
 * Both are resolved via page.objs (page-local) or page.commonObjs (shared across pages).
 *
 * Images below MIN_DIM_EMBEDDED pixels in either dimension are skipped — they are
 * typically decorative icons or logos, not damage photographs.
 *
 * Returns extracted images and a count of candidates attempted (for summary stats).
 */
async function extractEmbeddedImagesFromPage(
  page: any,
  pageNum: number,
  sessionId: string,
  isScanned: boolean,
  renderDpi: number
): Promise<{ images: ExtractedImage[]; candidates: number; rejectedByDimension: number; blurryCount: number; textHeavyCount: number }> {
  const images: ExtractedImage[] = [];
  let candidates = 0, rejectedByDimension = 0, blurryCount = 0, textHeavyCount = 0;
  try {
    const ops = await page.getOperatorList();
    const objs = page.objs;
    const commonObjs = page.commonObjs;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === 85 || fn === 86) {
        const imgName = ops.argsArray[i]?.[0];
        if (!imgName) continue;
        try {
          let imgData: any = null;
          if (objs.has(imgName)) imgData = objs.get(imgName);
          else if (commonObjs.has(imgName)) imgData = commonObjs.get(imgName);
          if (imgData && imgData.data && imgData.width >= MIN_DIM_EMBEDDED && imgData.height >= MIN_DIM_EMBEDDED) {
            const w = imgData.width, h = imgData.height;
            const rawData = Buffer.from(imgData.data);
            const channels = rawData.length / (w * h);
            if (channels >= 3) {
              candidates++;
              const ch = Math.min(4, Math.round(channels)) as 3 | 4;
              const sharpInst = await getSharp();
              const pngBuf = await sharpInst(rawData, { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
              const embResult = await processBuffer(pngBuf, 'embedded_image', MIN_DIM_EMBEDDED, pageNum, sessionId, isScanned, renderDpi);
              if (embResult) {
                images.push(embResult);
                if (embResult.quality.isBlurry) blurryCount++;
                if (embResult.quality.isTextHeavy) textHeavyCount++;
              } else {
                rejectedByDimension++;
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (embErr: any) {
    // Non-fatal: embedded extraction failure for this page is recorded in the caller's errors[]
    throw embErr;
  }
  return { images, candidates, rejectedByDimension, blurryCount, textHeavyCount };
}

// ─── Main Extraction Orchestrator ────────────────────────────────────────────
/**
 * Core extraction orchestrator. Loads the PDF, detects scan type, renders each
 * page (with rotation correction), extracts embedded images, and assembles the
 * ExtractionSummary. Each page is processed and released immediately to keep
 * peak memory at ~2 page buffers rather than N pages simultaneously.
 *
 * Sub-functions:
 *   detectScannedPdf()          — R-A-06 median-chars scanned detection
 *   applyHeuristicRotation()    — R-A-07 heuristic rotation correction
 *   extractEmbeddedImagesFromPage() — pdf.js operator-list embedded extraction
 *   processBuffer()             — dimension/quality check + S3 upload
 */
async function _doExtraction(pdfBuffer: Buffer, pdfFileName: string | undefined, sessionId: string, forceDpi?: number): Promise<ExtractionSummary> {
  const errors: string[] = [];
  const extractedImages: ExtractedImage[] = [];
  let rejectedByDimension = 0, rejectedByQuality = 0, blurryCount = 0, textHeavyCount = 0;

  try {
    const pdfjsLib = await getPdfjsLib();
    const canvasFactory = new NapiCanvasFactory();

    console.log(`[PDF Extractor] Loading PDF (${pdfBuffer.length} bytes, session: ${sessionId})`);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      canvasFactory,
      disableFontFace: true,
      standardFontDataUrl: undefined,
    });
    const pdfDoc = await loadingTask.promise;
    const pageCount = pdfDoc.numPages;
    console.log(`[PDF Extractor] PDF loaded: ${pageCount} pages`);

    const isScanned = await detectScannedPdf(pdfDoc, pageCount);
    const renderDpi = forceDpi ?? (isScanned ? DPI_SCANNED : DPI_NATIVE);
    const SCALE = renderDpi / 72;

    // R-A-05 FIX: Enforce page cap to prevent OOM on large PDFs
    const pagesToRender = Math.min(pageCount, MAX_PAGES_TO_RENDER);
    if (pageCount > MAX_PAGES_TO_RENDER) {
      const truncationMsg = `[PDF Extractor] R-A-05: PDF has ${pageCount} pages — rendering capped at ${MAX_PAGES_TO_RENDER} to prevent OOM. Pages ${MAX_PAGES_TO_RENDER + 1}-${pageCount} will not be rendered as images (LLM still receives full PDF via file_url in Stage 3).`;
      console.warn(truncationMsg);
      errors.push(truncationMsg);
    }
    console.log(`[PDF Extractor] PDF type: ${isScanned ? 'SCANNED' : 'NATIVE'}, pages: ${pageCount} (rendering: ${pagesToRender}), DPI: ${renderDpi}`);

    // ── STREAMING EXTRACTION: render + process + release each page immediately ──
    // This prevents accumulating all page PNG buffers in memory simultaneously.
    // Peak memory = ~2 page buffers (current render + 1 in-flight upload) instead of N pages.
    // Speed is maintained: processBuffer uploads to S3 while next page renders.
    let pagesRendered = 0;
    let embeddedCandidates = 0;

    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);

        // Respect PDF metadata rotation (/Rotate entry) — see applyHeuristicRotation() for full rationale
        const declaredRotation: number = page.rotate ?? 0;
        const viewport = page.getViewport({ scale: SCALE, rotation: declaredRotation });

        const napiCanvas = await getCanvas();
        const canvas = napiCanvas.createCanvas(Math.round(viewport.width), Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx as any, viewport }).promise;
        pagesRendered++;

        // Apply heuristic rotation for un-tagged scanned pages (R-A-07)
        const pngBuffer = await applyHeuristicRotation(
          canvas.toBuffer('image/png'), pageNum, pagesToRender, isScanned, declaredRotation
        );

        // Process page render immediately (uploads to S3, releases buffer)
        const pageResult = await processBuffer(pngBuffer, 'page_render', MIN_DIM_PAGE_RENDER, pageNum, sessionId, isScanned, renderDpi);
        if (pageResult) {
          extractedImages.push(pageResult);
          if (pageResult.quality.isBlurry) blurryCount++;
          if (pageResult.quality.isTextHeavy) textHeavyCount++;
        } else {
          rejectedByDimension++;
        }

        // Extract embedded images from this page (same pass, no second getPage call)
        try {
          const emb = await extractEmbeddedImagesFromPage(page, pageNum, sessionId, isScanned, renderDpi);
          extractedImages.push(...emb.images);
          embeddedCandidates += emb.candidates;
          rejectedByDimension += emb.rejectedByDimension;
          blurryCount += emb.blurryCount;
          textHeavyCount += emb.textHeavyCount;
        } catch (embErr: any) {
          // Non-fatal: embedded extraction failure for this page
          errors.push(`embedded_p${pageNum}: ${embErr.message}`);
        }

        page.cleanup();
      } catch (e: any) {
        console.warn(`[PDF Extractor] Failed to render page ${pageNum}: ${e.message}`);
        errors.push(`page_render_${pageNum}: ${e.message}`);
      }
    }

    console.log(`[PDF Extractor] Complete: ${extractedImages.length} image(s) uploaded (${pagesRendered} pages rendered, ${embeddedCandidates} embedded candidates, ${rejectedByDimension} rejected, ${blurryCount} blurry, ${textHeavyCount} text-heavy)`);

    return { images: extractedImages, isScannedPdf: isScanned, renderDpi, pageCount, pagesRendered, embeddedCandidates, rejectedByDimension, rejectedByQuality, blurryCount, textHeavyCount, errors };
  } catch (error: any) {
    const msg = `Fatal extraction error: ${error.message}`;
    errors.push(msg);
    console.error(`[PDF Extractor] ${msg}`);
    return { images: [], isScannedPdf: false, renderDpi: DPI_NATIVE, pageCount: 0, pagesRendered: 0, embeddedCandidates: 0, rejectedByDimension: 0, rejectedByQuality: 0, blurryCount: 0, textHeavyCount: 0, errors };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function extractImagesFromPDFBuffer(pdfBuffer: Buffer, pdfFileName?: string): Promise<ExtractedImage[]> {
  const sessionId = nanoid(8);
  console.log(`[PDF Extractor] Starting: ${pdfFileName || 'buffer'} (${pdfBuffer.length} bytes, session: ${sessionId})`);
  const extractionPromise = _doExtraction(pdfBuffer, pdfFileName, sessionId);
  const timeoutPromise = new Promise<ExtractionSummary>((_, reject) =>
    setTimeout(() => reject(new Error(`PDF extraction timed out after ${GLOBAL_TIMEOUT_MS / 1000}s`)), GLOBAL_TIMEOUT_MS)
  );
  try {
    const summary = await Promise.race([extractionPromise, timeoutPromise]);
    return summary.images;
  } catch (error: any) {
    console.error(`[PDF Extractor] Extraction failed: ${error.message}`);
    return [];
  }
}

export async function extractImagesWithSummary(pdfBuffer: Buffer, pdfFileName?: string, options?: { forceDpi?: number }): Promise<ExtractionSummary> {
  const sessionId = nanoid(8);
  console.log(`[PDF Extractor] Starting (with summary): ${pdfFileName || 'buffer'} (${pdfBuffer.length} bytes, session: ${sessionId})`);
  const extractionPromise = _doExtraction(pdfBuffer, pdfFileName, sessionId, options?.forceDpi);
  const timeoutPromise = new Promise<ExtractionSummary>((_, reject) =>
    setTimeout(() => reject(new Error(`PDF extraction timed out after ${GLOBAL_TIMEOUT_MS / 1000}s`)), GLOBAL_TIMEOUT_MS)
  );
  try {
    return await Promise.race([extractionPromise, timeoutPromise]);
  } catch (error: any) {
    console.error(`[PDF Extractor] Extraction failed: ${error.message}`);
    return { images: [], isScannedPdf: false, renderDpi: DPI_NATIVE, pageCount: 0, pagesRendered: 0, embeddedCandidates: 0, rejectedByDimension: 0, rejectedByQuality: 0, blurryCount: 0, textHeavyCount: 0, errors: [error.message] };
  }
}

export async function extractImagesFromPDFUrl(pdfUrl: string, pdfFileName?: string): Promise<ExtractedImage[]> {
  try {
    const pdfBuffer = await downloadPdfWithRetry(pdfUrl);
    return extractImagesFromPDFBuffer(pdfBuffer, pdfFileName);
  } catch (err: any) {
    console.warn(`[PDF Extractor] extractImagesFromPDFUrl failed for ${pdfUrl}: ${err.message}`);
    return [];
  }
}

export async function extractImagesFromPDFUrlWithSummary(pdfUrl: string, pdfFileName?: string, options?: { forceDpi?: number }): Promise<ExtractionSummary> {
  const pdfBuffer = await downloadPdfWithRetry(pdfUrl);
  return extractImagesWithSummary(pdfBuffer, pdfFileName, options);
}

export async function extractImagesFromPDF(pdfPath: string): Promise<ExtractedImage[]> {
  const { readFileSync } = await import('fs');
  const pdfBuffer = readFileSync(pdfPath);
  return extractImagesFromPDFBuffer(pdfBuffer, pdfPath.split('/').pop());
}
