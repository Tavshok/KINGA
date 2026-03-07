// @ts-nocheck
/**
 * PDF Image Extraction — Dual-Strategy Pipeline
 *
 * Strategy 1 (PRIMARY — always runs):
 *   pdftoppm renders every page of the PDF as a full-resolution PNG image.
 *   This works for ALL PDFs including document-style reports, police reports,
 *   and assessor forms where pdfimages would return nothing.
 *
 * Strategy 2 (SUPPLEMENTAL — runs after Strategy 1):
 *   pdfimages extracts any embedded raster images (e.g. actual damage photos
 *   embedded inside a PDF). These are added to the page renders if they are
 *   large enough to be real photos (not logos or decorative elements).
 *
 * Both strategies upload results to S3 in parallel and return arrays of S3 URLs.
 *
 * Performance limits:
 *   - NO page cap — all pages processed (required for fraud detection)
 *   - 30s timeout on PDF download
 *   - 90s timeout on pdftoppm per batch
 *   - 30s timeout on pdfimages
 *   - Pages rendered in batches of 5, S3 uploads run in parallel per batch
 *   - Global 10-minute hard timeout on the entire extraction
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import sharp from 'sharp';

const BATCH_SIZE = 5;           // Render pages in batches to control memory usage
const GLOBAL_TIMEOUT_MS = 10 * 60 * 1000; // 10-minute hard cap — covers large multi-page PDFs

interface ExtractedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page_render' | 'embedded_image';
}

/**
 * Extract images from a PDF buffer and upload to S3.
 */
export async function extractImagesFromPDFBuffer(
  pdfBuffer: Buffer,
  pdfFileName?: string,
): Promise<ExtractedImage[]> {
  const sessionId = nanoid(8);
  const tempDir = `/tmp/pdf-extract-${sessionId}`;
  const pdfPath = join(tempDir, 'input.pdf');

  console.log(
    `🖼️  [PDF Extractor] Starting extraction from: ${pdfFileName || 'buffer'} (session: ${sessionId}, batchSize: ${BATCH_SIZE}, timeout: ${GLOBAL_TIMEOUT_MS / 60000}min)`,
  );

  // Wrap the entire extraction in a global timeout
  const extractionPromise = _doExtraction(pdfBuffer, pdfFileName, sessionId, tempDir, pdfPath);
  const timeoutPromise = new Promise<ExtractedImage[]>((_, reject) =>
    setTimeout(() => reject(new Error(`PDF extraction timed out after ${GLOBAL_TIMEOUT_MS / 1000}s`)), GLOBAL_TIMEOUT_MS)
  );

  try {
    return await Promise.race([extractionPromise, timeoutPromise]);
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] Extraction failed: ${error.message}`);
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    return [];
  }
}

async function _doExtraction(
  pdfBuffer: Buffer,
  pdfFileName: string | undefined,
  sessionId: string,
  tempDir: string,
  pdfPath: string,
): Promise<ExtractedImage[]> {
  try {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(pdfPath, pdfBuffer);
    console.log(`📄 [PDF Extractor] Wrote ${pdfBuffer.length} bytes to temp file`);

    // ----------------------------------------------------------------
    // STRATEGY 1: Render ALL pages as PNG with pdftoppm (no page cap)
    // All pages must be processed — fraud evidence can appear anywhere in the document.
    // ----------------------------------------------------------------
    const pagePrefix = join(tempDir, 'page');
    let pageFiles: string[] = [];

    try {
      // No -l flag — process all pages
      execSync(`pdftoppm -png -r 150 "${pdfPath}" "${pagePrefix}"`, {
        timeout: 90_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      pageFiles = readdirSync(tempDir)
        .filter((f) => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      console.log(`📄 [PDF Extractor] pdftoppm rendered ${pageFiles.length} page(s) as PNG`);
    } catch (err: any) {
      console.warn(`⚠️  [PDF Extractor] pdftoppm failed: ${err.message}`);
    }

    // ----------------------------------------------------------------
    // STRATEGY 2: Extract embedded images with pdfimages (supplemental)
    // ----------------------------------------------------------------
    const embeddedPrefix = join(tempDir, 'emb');
    let embeddedFiles: string[] = [];

    try {
      execSync(`pdfimages -all "${pdfPath}" "${embeddedPrefix}"`, {
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      embeddedFiles = readdirSync(tempDir)
        .filter(
          (f) =>
            f.startsWith('emb') &&
            (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.ppm') ||
              f.endsWith('.pbm') || f.endsWith('.pgm') || f.endsWith('.tif') ||
              f.endsWith('.tiff') || f.endsWith('.jp2') || f.endsWith('.jb2') ||
              f.endsWith('.ccitt')),
        )
        .sort();
      console.log(`📸 [PDF Extractor] pdfimages found ${embeddedFiles.length} embedded image(s)`);
    } catch (err: any) {
      console.warn(`⚠️  [PDF Extractor] pdfimages extraction warning: ${err.message}`);
    }

    // ----------------------------------------------------------------
    // PROCESS & UPLOAD IN PARALLEL
    // ----------------------------------------------------------------
    async function processAndUpload(
      file: string,
      source: 'page_render' | 'embedded_image',
      minDimension: number,
    ): Promise<ExtractedImage | null> {
      try {
        const filePath = join(tempDir, file);
        const fileBuffer = readFileSync(filePath);

        const sharpInstance = sharp(fileBuffer);
        const metadata = await sharpInstance.metadata();
        const w = metadata.width || 0;
        const h = metadata.height || 0;

        if (w < minDimension || h < minDimension) {
          console.log(`⏭️  [PDF Extractor] Skipping small image: ${file} (${w}×${h})`);
          return null;
        }

        const aspect = w / (h || 1);
        if (aspect > 8 || aspect < 0.125) {
          console.log(`⏭️  [PDF Extractor] Skipping narrow image: ${file} (${w}×${h})`);
          return null;
        }

        const pngBuffer = await sharpInstance.png({ quality: 85 }).toBuffer();
        const pageMatch = file.match(/(\d+)/);
        const pageNumber = pageMatch ? parseInt(pageMatch[1]) : 1;

        const imageKey = `extracted-images/${sessionId}/${nanoid(10)}.png`;
        const { url } = await storagePut(imageKey, pngBuffer, 'image/png');

        console.log(`📤 [PDF Extractor] Uploaded ${source}: ${w}×${h} → ${url.substring(0, 80)}...`);
        return { url, width: w, height: h, pageNumber, source };
      } catch (imgError: any) {
        console.error(`❌ [PDF Extractor] Error processing ${file}: ${imgError.message}`);
        return null;
      }
    }

    // Process pages in batches of BATCH_SIZE to control memory usage,
    // while still uploading each batch in parallel for speed.
    const extractedImages: ExtractedImage[] = [];

    const allFiles = [
      ...pageFiles.map(f => ({ file: f, source: 'page_render' as const, minDim: 300 })),
      ...embeddedFiles.map(f => ({ file: f, source: 'embedded_image' as const, minDim: 150 })),
    ];

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      console.log(`📦 [PDF Extractor] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allFiles.length / BATCH_SIZE)} (files ${i + 1}-${Math.min(i + BATCH_SIZE, allFiles.length)} of ${allFiles.length})`);
      const batchResults = await Promise.all(
        batch.map(({ file, source, minDim }) => processAndUpload(file, source, minDim))
      );
      for (const result of batchResults) {
        if (result) extractedImages.push(result);
      }
    }

    console.log(
      `✅ [PDF Extractor] Complete. ${extractedImages.length} image(s) uploaded to S3 ` +
        `(${pageFiles.length} page renders + ${embeddedFiles.length} embedded candidates).`,
    );
    return extractedImages;
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] Fatal error: ${error.message}`);
    return [];
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(`🧹 [PDF Extractor] Cleaned up temp directory`);
    } catch (_) {}
  }
}

/**
 * Legacy function signature for backward compatibility.
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

/**
 * Extract images from a PDF at a remote URL (e.g. S3).
 * Downloads the PDF buffer and delegates to extractImagesFromPDFBuffer.
 */
export async function extractImagesFromPDFUrl(
  pdfUrl: string,
  options?: { strategy?: 'page_render_only' | 'both' }
): Promise<ExtractedImage[]> {
  try {
    // 30-second timeout on PDF download to prevent hanging on slow/unavailable URLs
    const controller = new AbortController();
    const downloadTimeoutId = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(pdfUrl, { signal: controller.signal });
    } finally {
      clearTimeout(downloadTimeoutId);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching PDF from ${pdfUrl}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = pdfUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
    console.log(`📲 [PDF Extractor] Downloaded ${buffer.length} bytes from URL: ${filename}`);
    return extractImagesFromPDFBuffer(buffer, filename);
  } catch (error: any) {
    console.error(`❌ [PDF Extractor] Error downloading PDF from URL ${pdfUrl}: ${error.message}`);
    return [];
  }
}
