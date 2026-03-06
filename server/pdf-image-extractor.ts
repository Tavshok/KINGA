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
 * Both strategies upload results to S3 and return arrays of S3 URLs.
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import sharp from 'sharp';

interface ExtractedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page_render' | 'embedded_image';
}

/**
 * Extract images from a PDF buffer and upload to S3.
 *
 * Always renders pages with pdftoppm so document-style PDFs (assessor reports,
 * police reports, quote sheets) produce visual images for AI analysis.
 * Also attempts to extract any embedded photos with pdfimages.
 *
 * @param pdfBuffer   Buffer containing the PDF file
 * @param pdfFileName Original filename for logging
 * @returns Array of extracted image objects with S3 URLs
 */
export async function extractImagesFromPDFBuffer(
  pdfBuffer: Buffer,
  pdfFileName?: string,
): Promise<ExtractedImage[]> {
  const sessionId = nanoid(8);
  const tempDir = `/tmp/pdf-extract-${sessionId}`;
  const pdfPath = join(tempDir, 'input.pdf');

  console.log(
    `🖼️  [PDF Extractor] Starting extraction from: ${pdfFileName || 'buffer'} (session: ${sessionId})`,
  );

  try {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(pdfPath, pdfBuffer);
    console.log(`📄 [PDF Extractor] Wrote ${pdfBuffer.length} bytes to temp file`);

    // ----------------------------------------------------------------
    // STRATEGY 1: Render every page as a PNG with pdftoppm
    // ----------------------------------------------------------------
    const pagePrefix = join(tempDir, 'page');
    let pageFiles: string[] = [];

    try {
      execSync(`pdftoppm -png -r 200 "${pdfPath}" "${pagePrefix}"`, {
        timeout: 120_000,
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
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      embeddedFiles = readdirSync(tempDir)
        .filter(
          (f) =>
            f.startsWith('emb') &&
            (f.endsWith('.png') ||
              f.endsWith('.jpg') ||
              f.endsWith('.ppm') ||
              f.endsWith('.pbm') ||
              f.endsWith('.pgm') ||
              f.endsWith('.tif') ||
              f.endsWith('.tiff') ||
              f.endsWith('.jp2') ||
              f.endsWith('.jb2') ||
              f.endsWith('.ccitt')),
        )
        .sort();
      console.log(
        `📸 [PDF Extractor] pdfimages found ${embeddedFiles.length} embedded image(s)`,
      );
    } catch (err: any) {
      // pdfimages failing is non-fatal — page renders are sufficient
      console.warn(`⚠️  [PDF Extractor] pdfimages extraction warning: ${err.message}`);
    }

    // ----------------------------------------------------------------
    // PROCESS & UPLOAD
    // ----------------------------------------------------------------
    const extractedImages: ExtractedImage[] = [];

    // Helper: process a single image file and upload to S3
    async function processAndUpload(
      file: string,
      source: 'page_render' | 'embedded_image',
      minDimension: number,
    ): Promise<void> {
      try {
        const filePath = join(tempDir, file);
        const fileBuffer = readFileSync(filePath);

        const sharpInstance = sharp(fileBuffer);
        const metadata = await sharpInstance.metadata();
        const w = metadata.width || 0;
        const h = metadata.height || 0;

        // Skip images that are too small (icons, logos, decorative elements)
        if (w < minDimension || h < minDimension) {
          console.log(`⏭️  [PDF Extractor] Skipping small image: ${file} (${w}×${h})`);
          return;
        }

        // Skip extreme aspect ratios (borders, lines)
        const aspect = w / (h || 1);
        if (aspect > 8 || aspect < 0.125) {
          console.log(`⏭️  [PDF Extractor] Skipping narrow image: ${file} (${w}×${h})`);
          return;
        }

        const pngBuffer = await sharpInstance.png({ quality: 90 }).toBuffer();

        // Extract page number from filename
        const pageMatch = file.match(/(\d+)/);
        const pageNumber = pageMatch ? parseInt(pageMatch[1]) : 1;

        const imageKey = `extracted-images/${sessionId}/${nanoid(10)}.png`;
        const { url } = await storagePut(imageKey, pngBuffer, 'image/png');

        extractedImages.push({ url, width: w, height: h, pageNumber, source });
        console.log(
          `📤 [PDF Extractor] Uploaded ${source} ${extractedImages.length}: ${w}×${h} → ${url.substring(0, 80)}...`,
        );
      } catch (imgError: any) {
        console.error(`❌ [PDF Extractor] Error processing ${file}: ${imgError.message}`);
      }
    }

    // Process page renders (minimum 300px — full pages are always large)
    for (const file of pageFiles) {
      await processAndUpload(file, 'page_render', 300);
    }

    // Process embedded images (minimum 150px — real photos are at least 150×150)
    for (const file of embeddedFiles) {
      await processAndUpload(file, 'embedded_image', 150);
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
    } catch (_) {
      // Ignore cleanup errors
    }
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
 *
 * @param pdfUrl   HTTPS URL to the PDF file
 * @param options  Optional extraction options (reserved for future use)
 * @returns Array of extracted image objects with S3 URLs
 */
export async function extractImagesFromPDFUrl(
  pdfUrl: string,
  options?: { strategy?: 'page_render_only' | 'both' }
): Promise<ExtractedImage[]> {
  try {
    // Download the PDF from the remote URL
    const response = await fetch(pdfUrl);
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
