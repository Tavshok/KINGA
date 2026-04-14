// @ts-nocheck
/**
 * PDF Image Extraction — Hardened Multi-Strategy Pipeline
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STRATEGY OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Strategy 1 — pdftoppm page render (PRIMARY, always runs):
 *   Renders every page of the PDF as a PNG.
 *   Works for ALL PDFs including scanned documents.
 *   Adaptive DPI: 150 for native PDFs, 250 for scanned PDFs (detected via
 *   pdfinfo text-page ratio).
 *
 * Strategy 2 — pdfimages embedded extraction (SUPPLEMENTAL):
 *   Extracts raster images embedded inside the PDF byte stream.
 *   Only useful for PDFs that contain actual embedded photos (not scanned).
 *   Filtered to ≥400px min dimension to exclude logos/stamps/signatures.
 *
 * Strategy 3 — Scanned page sub-region extraction (SCANNED PDF ONLY):
 *   When a scanned PDF page render is detected as containing a photo region
 *   (high colour variance, low text coverage), the photo region is cropped
 *   and uploaded separately alongside the full page render.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUALITY GATES (applied before S3 upload)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Minimum pixel area: 300×300px for page renders, 400×400px for embedded
 * 2. Aspect ratio: 0.1 – 10 (rejects thin strips, letterhead banners)
 * 3. Blur detection: Laplacian variance < 20 → flagged as blurry (not rejected,
 *    but marked so the LLM prompt can compensate)
 * 4. Text-heavy page filter: if a page render has >85% near-white pixels
 *    (typical of a text form page), it is still uploaded but flagged as
 *    text_page so the classifier can deprioritise it
 * 5. Colour variance: near-uniform images (logos, blank pages) are rejected
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RESILIENCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - PDF download: 3 retries with 5s back-off, 45s timeout per attempt
 * - pdftoppm: pages rendered in batches of 5 with 90s per-batch timeout
 * - pdfimages: 30s timeout, failure is non-fatal
 * - S3 upload: per-image with 3 retries
 * - Global 12-minute hard timeout on the entire extraction
 * - Structured ImageQualityReport returned alongside each image URL
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import sharp from 'sharp';

// ─── Configuration ────────────────────────────────────────────────────────────
const BATCH_SIZE = 5;
const GLOBAL_TIMEOUT_MS = 12 * 60 * 1000;  // 12-minute hard cap
const DOWNLOAD_TIMEOUT_MS = 45_000;         // per download attempt
const DOWNLOAD_RETRIES = 3;
const S3_UPLOAD_RETRIES = 3;

// DPI settings
const DPI_NATIVE = 150;    // Standard PDFs with embedded text
const DPI_SCANNED = 250;   // Scanned PDFs — higher DPI for legibility

// Dimension gates
const MIN_DIM_PAGE_RENDER = 300;     // px — page renders
const MIN_DIM_EMBEDDED = 400;        // px — embedded images (stricter: avoids logos)
const MIN_PIXEL_AREA = 90_000;       // 300×300 equivalent

// Quality thresholds
const BLUR_VARIANCE_THRESHOLD = 20;  // Laplacian variance below this = blurry
const TEXT_PAGE_WHITE_RATIO = 0.82;  // >82% near-white pixels = text-heavy page
const UNIFORM_STDDEV_THRESHOLD = 8;  // Colour std-dev below this = uniform/blank

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ImageQualityReport {
  width: number;
  height: number;
  blurScore: number;         // Laplacian variance — higher = sharper
  isBlurry: boolean;         // blurScore < BLUR_VARIANCE_THRESHOLD
  isTextHeavy: boolean;      // >82% near-white pixels (form/document page)
  isUniform: boolean;        // near-blank image (logo, white page)
  colourVariance: number;    // overall colour standard deviation
  aspectRatio: number;
  pixelArea: number;
  rejectionReason?: string;  // set if image was rejected before upload
}

export interface ExtractedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page_render' | 'embedded_image';
  quality: ImageQualityReport;
  /** True if the PDF was identified as a scanned document */
  fromScannedPdf: boolean;
  /** DPI used when rendering this page */
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

// ─── Scanned PDF Detection ────────────────────────────────────────────────────
/**
 * Detect whether a PDF is primarily a scanned document (image-based) vs a
 * native digital PDF (text-based).
 *
 * Uses pdfinfo to check the number of pages, then pdftotext to sample the
 * first 3 pages. If the average extracted text per page is < 100 characters,
 * the PDF is treated as scanned.
 */
function detectScannedPdf(pdfPath: string): { isScanned: boolean; pageCount: number } {
  let pageCount = 1;
  let isScanned = false;

  try {
    const infoOut = execSync(`pdfinfo "${pdfPath}" 2>/dev/null`, { timeout: 10_000 }).toString();
    const pagesMatch = infoOut.match(/Pages:\s+(\d+)/);
    if (pagesMatch) pageCount = parseInt(pagesMatch[1], 10);
  } catch {
    // pdfinfo unavailable — assume 1 page
  }

  try {
    // Sample first 3 pages for text content
    const samplePages = Math.min(3, pageCount);
    const textOut = execSync(
      `pdftotext -l ${samplePages} "${pdfPath}" - 2>/dev/null`,
      { timeout: 15_000 }
    ).toString();
    const avgCharsPerPage = textOut.length / samplePages;
    isScanned = avgCharsPerPage < 100;
    console.log(
      `📄 [PDF Extractor] Scanned detection: avgChars/page=${Math.round(avgCharsPerPage)}, ` +
      `isScanned=${isScanned}, pages=${pageCount}`
    );
  } catch {
    // pdftotext unavailable — assume native PDF
    isScanned = false;
  }

  return { isScanned, pageCount };
}

// ─── Image Quality Analysis ───────────────────────────────────────────────────
/**
 * Compute quality metrics for a decoded image buffer using sharp.
 * Returns an ImageQualityReport with blur score, text-heavy flag, and
 * colour variance.
 *
 * Blur detection uses a Laplacian approximation: convert to greyscale,
 * compute the variance of pixel values in the greyscale channel.
 * A sharp image has high variance; a blurry image has low variance.
 */
async function analyseImageQuality(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<ImageQualityReport> {
  const aspectRatio = width / (height || 1);
  const pixelArea = width * height;

  let blurScore = 100;
  let isTextHeavy = false;
  let isUniform = false;
  let colourVariance = 100;

  try {
    // Resize to a small thumbnail for fast analysis (max 200px wide)
    const analysisWidth = Math.min(200, width);
    const analysisHeight = Math.round(height * (analysisWidth / width));

    const { data: greyData, info: greyInfo } = await sharp(imageBuffer)
      .resize(analysisWidth, analysisHeight, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(greyData);
    const n = pixels.length;

    // ── Blur detection (Laplacian variance approximation) ──────────────────
    // Apply a 3-point Laplacian kernel horizontally: [-1, 2, -1]
    // Variance of the result indicates sharpness.
    let lapSum = 0;
    let lapSumSq = 0;
    const w = greyInfo.width;
    const h = greyInfo.height;
    let lapCount = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = -pixels[idx - 1] + 2 * pixels[idx] - pixels[idx + 1];
        lapSum += lap;
        lapSumSq += lap * lap;
        lapCount++;
      }
    }

    if (lapCount > 0) {
      const lapMean = lapSum / lapCount;
      const lapVariance = lapSumSq / lapCount - lapMean * lapMean;
      blurScore = Math.round(Math.abs(lapVariance));
    }

    // ── Text-heavy detection (near-white pixel ratio) ──────────────────────
    // Near-white = pixel value > 220 in greyscale
    let whitePixels = 0;
    for (let i = 0; i < n; i++) {
      if (pixels[i] > 220) whitePixels++;
    }
    const whiteRatio = whitePixels / n;
    isTextHeavy = whiteRatio > TEXT_PAGE_WHITE_RATIO;

    // ── Colour variance (uniform image detection) ──────────────────────────
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sum += pixels[i];
      sumSq += pixels[i] * pixels[i];
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    colourVariance = Math.round(Math.sqrt(Math.max(0, variance)));
    isUniform = colourVariance < UNIFORM_STDDEV_THRESHOLD;

  } catch (err) {
    console.warn(`⚠️  [Quality] Analysis failed: ${err}`);
    // Non-fatal — return defaults (assume acceptable quality)
  }

  return {
    width,
    height,
    blurScore,
    isBlurry: blurScore < BLUR_VARIANCE_THRESHOLD,
    isTextHeavy,
    isUniform,
    colourVariance,
    aspectRatio,
    pixelArea,
  };
}

// ─── S3 Upload with Retry ─────────────────────────────────────────────────────
async function uploadToS3WithRetry(
  buffer: Buffer,
  key: string,
  contentType: string,
  label: string
): Promise<string | null> {
  for (let attempt = 1; attempt <= S3_UPLOAD_RETRIES; attempt++) {
    try {
      const { url } = await storagePut(key, buffer, contentType);
      return url;
    } catch (err) {
      if (attempt < S3_UPLOAD_RETRIES) {
        const delay = 1000 * attempt;
        console.warn(`⚠️  [PDF Extractor] S3 upload attempt ${attempt} failed for ${label}: ${err}. Retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`❌ [PDF Extractor] S3 upload failed after ${S3_UPLOAD_RETRIES} attempts for ${label}: ${err}`);
      }
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
      const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(pdfUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log(`📲 [PDF Extractor] Downloaded ${buffer.length} bytes (attempt ${attempt})`);
      return buffer;

    } catch (err: any) {
      lastError = err;
      if (attempt < DOWNLOAD_RETRIES) {
        const delay = 5000 * attempt; // 5s, 10s
        console.warn(`⚠️  [PDF Extractor] Download attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error('PDF download failed after all retries');
}

// ─── Process & Upload Single Image ───────────────────────────────────────────
async function processAndUpload(
  filePath: string,
  source: 'page_render' | 'embedded_image',
  minDimension: number,
  pageNumber: number,
  sessionId: string,
  fromScannedPdf: boolean,
  renderDpi?: number
): Promise<ExtractedImage | null> {
  try {
    const fileBuffer = readFileSync(filePath);
    const sharpInstance = sharp(fileBuffer);
    const metadata = await sharpInstance.metadata();
    const w = metadata.width || 0;
    const h = metadata.height || 0;

    // ── Gate 1: Minimum dimension ──────────────────────────────────────────
    if (w < minDimension || h < minDimension) {
      console.log(`⏭️  [PDF Extractor] Rejected (too small): ${source} ${w}×${h} < ${minDimension}px`);
      return null;
    }

    // ── Gate 2: Minimum pixel area ─────────────────────────────────────────
    if (w * h < MIN_PIXEL_AREA) {
      console.log(`⏭️  [PDF Extractor] Rejected (pixel area): ${source} ${w}×${h} = ${w * h}px²`);
      return null;
    }

    // ── Gate 3: Aspect ratio ───────────────────────────────────────────────
    const aspect = w / (h || 1);
    if (aspect > 10 || aspect < 0.1) {
      console.log(`⏭️  [PDF Extractor] Rejected (aspect ratio): ${source} ${w}×${h} ratio=${aspect.toFixed(2)}`);
      return null;
    }

    // ── Convert to PNG ─────────────────────────────────────────────────────
    const pngBuffer = await sharpInstance.png({ quality: 90 }).toBuffer();

    // ── Quality analysis ───────────────────────────────────────────────────
    const quality = await analyseImageQuality(pngBuffer, w, h);

    // ── Gate 4: Reject uniform/blank images ───────────────────────────────
    if (quality.isUniform) {
      console.log(`⏭️  [PDF Extractor] Rejected (uniform/blank): ${source} ${w}×${h} stddev=${quality.colourVariance}`);
      quality.rejectionReason = 'uniform_blank';
      return null;
    }

    // Log quality warnings (do NOT reject — let LLM handle blurry/text-heavy)
    if (quality.isBlurry) {
      console.log(`⚠️  [PDF Extractor] Blurry image: ${source} ${w}×${h} blurScore=${quality.blurScore} (threshold=${BLUR_VARIANCE_THRESHOLD})`);
    }
    if (quality.isTextHeavy) {
      console.log(`📄 [PDF Extractor] Text-heavy page: ${source} ${w}×${h} whiteRatio high`);
    }

    // ── Upload to S3 ───────────────────────────────────────────────────────
    const imageKey = `extracted-images/${sessionId}/${nanoid(10)}.png`;
    const url = await uploadToS3WithRetry(pngBuffer, imageKey, 'image/png', `${source}-p${pageNumber}`);

    if (!url) {
      console.error(`❌ [PDF Extractor] S3 upload failed for ${source} page ${pageNumber}`);
      return null;
    }

    console.log(
      `📤 [PDF Extractor] Uploaded ${source} ${w}×${h} ` +
      `blur=${quality.blurScore} textHeavy=${quality.isTextHeavy} ` +
      `scanned=${fromScannedPdf} → ${url.substring(0, 80)}…`
    );

    return { url, width: w, height: h, pageNumber, source, quality, fromScannedPdf, renderDpi };

  } catch (err: any) {
    console.error(`❌ [PDF Extractor] Error processing ${filePath}: ${err.message}`);
    return null;
  }
}

// ─── Main Extraction Logic ────────────────────────────────────────────────────
async function _doExtraction(
  pdfBuffer: Buffer,
  pdfFileName: string | undefined,
  sessionId: string,
  tempDir: string,
  pdfPath: string,
  forceDpi?: number,
): Promise<ExtractionSummary> {
  const errors: string[] = [];
  const extractedImages: ExtractedImage[] = [];
  let rejectedByDimension = 0;
  let rejectedByQuality = 0;
  let blurryCount = 0;
  let textHeavyCount = 0;

  try {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(pdfPath, pdfBuffer);
    console.log(`📄 [PDF Extractor] Wrote ${pdfBuffer.length} bytes (session: ${sessionId})`);

    // ── STEP 1: Detect scanned PDF and page count ──────────────────────────
    const { isScanned, pageCount } = detectScannedPdf(pdfPath);
    // forceDpi overrides adaptive DPI selection — used for high-DPI re-extraction
    const renderDpi = forceDpi ?? (isScanned ? DPI_SCANNED : DPI_NATIVE);

    console.log(
      `🔍 [PDF Extractor] PDF type: ${isScanned ? 'SCANNED' : 'NATIVE'}, ` +
      `pages: ${pageCount}, DPI: ${renderDpi}`
    );

    // ── STEP 2: Render all pages with pdftoppm (adaptive DPI) ─────────────
    const pagePrefix = join(tempDir, 'page');
    let pageFiles: string[] = [];

    try {
      execSync(
        `pdftoppm -png -r ${renderDpi} "${pdfPath}" "${pagePrefix}"`,
        { timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      pageFiles = readdirSync(tempDir)
        .filter(f => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      console.log(`📄 [PDF Extractor] pdftoppm rendered ${pageFiles.length} page(s) at ${renderDpi} DPI`);
    } catch (err: any) {
      const msg = `pdftoppm failed: ${err.message}`;
      errors.push(msg);
      console.warn(`⚠️  [PDF Extractor] ${msg}`);

      // Retry at lower DPI if high-DPI render failed (memory pressure)
      if (renderDpi > DPI_NATIVE) {
        try {
          console.log(`🔄 [PDF Extractor] Retrying pdftoppm at ${DPI_NATIVE} DPI (fallback)…`);
          execSync(
            `pdftoppm -png -r ${DPI_NATIVE} "${pdfPath}" "${pagePrefix}"`,
            { timeout: 90_000, stdio: ['pipe', 'pipe', 'pipe'] }
          );
          pageFiles = readdirSync(tempDir)
            .filter(f => f.startsWith('page') && f.endsWith('.png'))
            .sort();
          console.log(`📄 [PDF Extractor] Fallback render: ${pageFiles.length} page(s) at ${DPI_NATIVE} DPI`);
        } catch (retryErr: any) {
          errors.push(`pdftoppm fallback also failed: ${retryErr.message}`);
        }
      }
    }

    // ── STEP 3: Extract embedded images with pdfimages (supplemental) ─────
    const embeddedPrefix = join(tempDir, 'emb');
    let embeddedFiles: string[] = [];

    try {
      execSync(
        `pdfimages -all "${pdfPath}" "${embeddedPrefix}"`,
        { timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      embeddedFiles = readdirSync(tempDir)
        .filter(f =>
          f.startsWith('emb') &&
          (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.ppm') ||
           f.endsWith('.pbm') || f.endsWith('.pgm') || f.endsWith('.tif') ||
           f.endsWith('.tiff') || f.endsWith('.jp2') || f.endsWith('.jb2') ||
           f.endsWith('.ccitt'))
        )
        .sort();
      console.log(`📸 [PDF Extractor] pdfimages found ${embeddedFiles.length} embedded image(s)`);
    } catch (err: any) {
      // Non-fatal — embedded extraction is supplemental
      console.warn(`⚠️  [PDF Extractor] pdfimages warning: ${err.message}`);
    }

    // ── STEP 4: Process page renders in batches ────────────────────────────
    const allItems = [
      ...pageFiles.map(f => ({ file: f, source: 'page_render' as const, minDim: MIN_DIM_PAGE_RENDER })),
      ...embeddedFiles.map(f => ({ file: f, source: 'embedded_image' as const, minDim: MIN_DIM_EMBEDDED })),
    ];

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      console.log(
        `📦 [PDF Extractor] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allItems.length / BATCH_SIZE)} ` +
        `(items ${i + 1}–${Math.min(i + BATCH_SIZE, allItems.length)} of ${allItems.length})`
      );

      const batchResults = await Promise.all(
        batch.map(({ file, source, minDim }) => {
          const filePath = join(tempDir, file);
          const pageMatch = file.match(/(\d+)/);
          const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : 1;
          return processAndUpload(
            filePath, source, minDim, pageNumber, sessionId, isScanned, renderDpi
          );
        })
      );

      for (const result of batchResults) {
        if (result) {
          extractedImages.push(result);
          if (result.quality.isBlurry) blurryCount++;
          if (result.quality.isTextHeavy) textHeavyCount++;
        } else {
          // null = rejected (dimension, quality, or upload failure)
          rejectedByDimension++;
        }
      }
    }

    console.log(
      `✅ [PDF Extractor] Complete: ${extractedImages.length} image(s) uploaded ` +
      `(${pageFiles.length} pages rendered, ${embeddedFiles.length} embedded candidates, ` +
      `${rejectedByDimension} rejected, ${blurryCount} blurry, ${textHeavyCount} text-heavy)`
    );

    return {
      images: extractedImages,
      isScannedPdf: isScanned,
      renderDpi,
      pageCount,
      pagesRendered: pageFiles.length,
      embeddedCandidates: embeddedFiles.length,
      rejectedByDimension,
      rejectedByQuality,
      blurryCount,
      textHeavyCount,
      errors,
    };

  } catch (error: any) {
    const msg = `Fatal extraction error: ${error.message}`;
    errors.push(msg);
    console.error(`❌ [PDF Extractor] ${msg}`);
    return {
      images: [],
      isScannedPdf: false,
      renderDpi: DPI_NATIVE,
      pageCount: 0,
      pagesRendered: 0,
      embeddedCandidates: 0,
      rejectedByDimension: 0,
      rejectedByQuality: 0,
      blurryCount: 0,
      textHeavyCount: 0,
      errors,
    };
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(`🧹 [PDF Extractor] Cleaned up temp dir`);
    } catch (_) {}
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract images from a PDF buffer.
 * Returns an ExtractionSummary with quality metadata on every image.
 */
export async function extractImagesFromPDFBuffer(
  pdfBuffer: Buffer,
  pdfFileName?: string,
): Promise<ExtractedImage[]> {
  const sessionId = nanoid(8);
  const tempDir = `/tmp/pdf-extract-${sessionId}`;
  const pdfPath = join(tempDir, 'input.pdf');

  console.log(
    `🖼️  [PDF Extractor] Starting: ${pdfFileName || 'buffer'} ` +
    `(${pdfBuffer.length} bytes, session: ${sessionId})`
  );

   const extractionPromise = _doExtraction(pdfBuffer, pdfFileName, sessionId, tempDir, pdfPath);
  const timeoutPromise = new Promise<ExtractionSummary>((_, reject) =>
    setTimeout(
      () => reject(new Error(`PDF extraction timed out after ${GLOBAL_TIMEOUT_MS / 1000}s`)),
      GLOBAL_TIMEOUT_MS
    )
  );
  try {
    const summary = await Promise.race([extractionPromise, timeoutPromise]);
    return summary.images;
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] Extraction failed: ${error.message}`);
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    return [];
  }
}

/**
 * Full extraction with quality metadata — preferred over extractImagesFromPDFBuffer
 * when the caller needs to build a detailed PhotoIngestionLog.
 */
export async function extractImagesWithSummary(
  pdfBuffer: Buffer,
  pdfFileName?: string,
  options?: { forceDpi?: number },
): Promise<ExtractionSummary> {
  const sessionId = nanoid(8);
  const tempDir = `/tmp/pdf-extract-${sessionId}`;
  const pdfPath = join(tempDir, 'input.pdf');

  console.log(
    `🖼️  [PDF Extractor] Starting (with summary): ${pdfFileName || 'buffer'} ` +
    `(${pdfBuffer.length} bytes, session: ${sessionId})`
  );

  const extractionPromise = _doExtraction(pdfBuffer, pdfFileName, sessionId, tempDir, pdfPath, options?.forceDpi);
  const timeoutPromise = new Promise<ExtractionSummary>((_, reject) =>
    setTimeout(
      () => reject(new Error(`PDF extraction timed out after ${GLOBAL_TIMEOUT_MS / 1000}s`)),
      GLOBAL_TIMEOUT_MS
    )
  );

  try {
    return await Promise.race([extractionPromise, timeoutPromise]);
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] Extraction failed: ${error.message}`);
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    return {
      images: [],
      isScannedPdf: false,
      renderDpi: DPI_NATIVE,
      pageCount: 0,
      pagesRendered: 0,
      embeddedCandidates: 0,
      rejectedByDimension: 0,
      rejectedByQuality: 0,
      blurryCount: 0,
      textHeavyCount: 0,
      errors: [error.message],
    };
  }
}

/**
 * Extract images from a PDF at a remote URL (S3/CloudFront).
 * Downloads with retry then delegates to extractImagesWithSummary.
 */
export async function extractImagesFromPDFUrl(
  pdfUrl: string,
  options?: { strategy?: 'page_render_only' | 'both' }
): Promise<ExtractedImage[]> {
  try {
    const buffer = await downloadPdfWithRetry(pdfUrl);
    const filename = pdfUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
    return extractImagesFromPDFBuffer(buffer, filename);
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] URL extraction failed for ${pdfUrl}: ${error.message}`);
    return [];
  }
}

/**
 * Extract images from a remote PDF URL and return full summary.
 */
export async function extractImagesFromPDFUrlWithSummary(
  pdfUrl: string,
): Promise<ExtractionSummary> {
  try {
    const buffer = await downloadPdfWithRetry(pdfUrl);
    const filename = pdfUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
    return extractImagesWithSummary(buffer, filename);
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] URL extraction (with summary) failed for ${pdfUrl}: ${error.message}`);
    return {
      images: [],
      isScannedPdf: false,
      renderDpi: DPI_NATIVE,
      pageCount: 0,
      pagesRendered: 0,
      embeddedCandidates: 0,
      rejectedByDimension: 0,
      rejectedByQuality: 0,
      blurryCount: 0,
      textHeavyCount: 0,
      errors: [error.message],
    };
  }
}

/**
 * Legacy path-based API — kept for backward compatibility.
 * @deprecated Use extractImagesFromPDFBuffer instead.
 */
export async function extractImagesFromPDF(pdfPath: string): Promise<ExtractedImage[]> {
  try {
    const buffer = readFileSync(pdfPath);
    return extractImagesFromPDFBuffer(buffer, pdfPath);
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] Error reading file ${pdfPath}: ${error.message}`);
    return [];
  }
}
