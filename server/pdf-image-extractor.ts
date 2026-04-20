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
import sharp from 'sharp';
import * as napiCanvas from '@napi-rs/canvas';

// ─── Configuration ────────────────────────────────────────────────────────────
const BATCH_SIZE = 5;
const GLOBAL_TIMEOUT_MS = 12 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 45_000;
const DOWNLOAD_RETRIES = 3;
const S3_UPLOAD_RETRIES = 3;
const DPI_NATIVE = 150;
const DPI_SCANNED = 250;
const MIN_DIM_PAGE_RENDER = 300;
const MIN_DIM_EMBEDDED = 400;
const MIN_PIXEL_AREA = 90_000;
const BLUR_VARIANCE_THRESHOLD = 20;
const TEXT_PAGE_WHITE_RATIO = 0.82;
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
  create(width: number, height: number) {
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

// ─── Main Extraction Logic ────────────────────────────────────────────────────
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

    // Detect scanned PDF using pdfjs text extraction
    let isScanned = false;
    try {
      let totalChars = 0;
      const samplePages = Math.min(3, pageCount);
      for (let p = 1; p <= samplePages; p++) {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        totalChars += textContent.items.reduce((sum: number, item: any) => sum + (item.str?.length || 0), 0);
      }
      const avgCharsPerPage = totalChars / samplePages;
      isScanned = avgCharsPerPage < 100;
      console.log(`[PDF Extractor] Scanned detection: avgChars/page=${Math.round(avgCharsPerPage)}, isScanned=${isScanned}, pages=${pageCount}`);
    } catch (e: any) {
      console.warn(`[PDF Extractor] Scanned detection failed: ${e.message}`);
    }

    const renderDpi = forceDpi ?? (isScanned ? DPI_SCANNED : DPI_NATIVE);
    const SCALE = renderDpi / 72;
    console.log(`[PDF Extractor] PDF type: ${isScanned ? 'SCANNED' : 'NATIVE'}, pages: ${pageCount}, DPI: ${renderDpi}`);

    // Render all pages
    const pageBuffers: { buffer: Buffer; pageNumber: number }[] = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: SCALE });
        const canvas = napiCanvas.createCanvas(Math.round(viewport.width), Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx as any, viewport }).promise;
        const pngBuffer = canvas.toBuffer('image/png');
        pageBuffers.push({ buffer: pngBuffer, pageNumber: pageNum });
        page.cleanup();
      } catch (e: any) {
        console.warn(`[PDF Extractor] Failed to render page ${pageNum}: ${e.message}`);
        errors.push(`page_render_${pageNum}: ${e.message}`);
      }
    }
    console.log(`[PDF Extractor] Rendered ${pageBuffers.length} page(s) at ${renderDpi} DPI`);

    // Extract embedded images via pdfjs operator list
    const embeddedBuffers: { buffer: Buffer; pageNumber: number }[] = [];
    try {
      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
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
                  const ch = Math.min(4, Math.round(channels)) as 3 | 4;
                  const pngBuf = await sharp(rawData, { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
                  embeddedBuffers.push({ buffer: pngBuf, pageNumber: pageNum });
                }
              }
            } catch (_) {}
          }
        }
        page.cleanup();
      }
      console.log(`[PDF Extractor] pdfjs found ${embeddedBuffers.length} embedded image(s)`);
    } catch (e: any) {
      console.warn(`[PDF Extractor] Embedded image extraction failed: ${e.message}`);
      errors.push(`embedded_extraction: ${e.message}`);
    }

    // Process all images in batches
    const allItems = [
      ...pageBuffers.map(({ buffer, pageNumber }) => ({ buffer, source: 'page_render' as const, minDim: MIN_DIM_PAGE_RENDER, pageNumber })),
      ...embeddedBuffers.map(({ buffer, pageNumber }) => ({ buffer, source: 'embedded_image' as const, minDim: MIN_DIM_EMBEDDED, pageNumber })),
    ];

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      console.log(`[PDF Extractor] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allItems.length / BATCH_SIZE)} (items ${i + 1}-${Math.min(i + BATCH_SIZE, allItems.length)} of ${allItems.length})`);
      const batchResults = await Promise.all(
        batch.map(({ buffer, source, minDim, pageNumber }) =>
          processBuffer(buffer, source, minDim, pageNumber, sessionId, isScanned, renderDpi)
        )
      );
      for (const result of batchResults) {
        if (result) {
          extractedImages.push(result);
          if (result.quality.isBlurry) blurryCount++;
          if (result.quality.isTextHeavy) textHeavyCount++;
        } else {
          rejectedByDimension++;
        }
      }
    }

    console.log(`[PDF Extractor] Complete: ${extractedImages.length} image(s) uploaded (${pageBuffers.length} pages rendered, ${embeddedBuffers.length} embedded candidates, ${rejectedByDimension} rejected, ${blurryCount} blurry, ${textHeavyCount} text-heavy)`);

    return { images: extractedImages, isScannedPdf: isScanned, renderDpi, pageCount, pagesRendered: pageBuffers.length, embeddedCandidates: embeddedBuffers.length, rejectedByDimension, rejectedByQuality, blurryCount, textHeavyCount, errors };
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
  const pdfBuffer = await downloadPdfWithRetry(pdfUrl);
  return extractImagesFromPDFBuffer(pdfBuffer, pdfFileName);
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
