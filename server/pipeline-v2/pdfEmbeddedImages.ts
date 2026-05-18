/**
 * pdfEmbeddedImages.ts
 *
 * PDF Embedded Image Extractor — pdfimages implementation.
 *
 * Extracts raster images that are physically embedded inside a PDF document
 * using `pdfimages` (poppler-utils). This is distinct from rendering PDF pages
 * as screenshots (pdfToImages.ts) — it snips out the actual image objects that
 * were embedded by the document author (damage photos, scanned quote pages, etc.)
 *
 * WHY THIS MATTERS
 * ─────────────────
 * Many SA insurance claim PDFs are assembled from:
 *   - Scanned damage photos (JPEG, 400–900px square)
 *   - Scanned repair quotes (JPEG, 1000–1800px tall, full-page)
 *   - Small logos / icons (JPEG, <100px — filtered out)
 *
 * Rendering pages as screenshots (pdfToImages.ts) gives the LLM a view of the
 * full page layout but at lower resolution. Extracting embedded images gives the
 * LLM the original full-resolution photos and quote scans as they were captured.
 *
 * FILTERING CRITERIA
 * ─────────────────
 * An embedded image is kept if ALL of the following are true:
 *   1. Width  >= MIN_DIMENSION_PX (200px) — excludes icons, logos, bullets
 *   2. Height >= MIN_DIMENSION_PX (200px) — excludes banners, dividers
 *   3. File size >= MIN_FILE_SIZE_BYTES (8 KB) — excludes tiny placeholder images
 *
 * Both damage photos and full-page quote scans pass this filter. The LLM
 * downstream (Stage 6 damage analysis) handles both types correctly.
 *
 * OUTPUT
 * ─────────────────
 * Qualifying images are uploaded to S3 under:
 *   claims/{claimId}/embedded-photos/img-NNN.jpg
 *
 * Returns an array of public S3 URLs, ready to be merged into ctx.damagePhotoUrls.
 *
 * TIMEOUT GUARDS
 * ─────────────────────────────────────────────────────────────────
 * - PDF download: 60s hard timeout (shared with pdfToImages.ts)
 * - pdfimages extraction: 30s per run
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import { storagePut } from "../storage";

const execFileAsync = promisify(execFile);

// ─── Filtering thresholds ─────────────────────────────────────────────────────

/** Minimum width/height in pixels. Excludes logos, icons, bullets. */
const MIN_DIMENSION_PX = 200;

/** Minimum file size in bytes. Excludes tiny placeholder images. */
const MIN_FILE_SIZE_BYTES = 8_000;

/** Maximum number of embedded images to upload (prevents runaway S3 costs). */
const MAX_IMAGES_TO_UPLOAD = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmbeddedImageInfo {
  /** 0-based index from pdfimages output */
  index: number;
  /** PDF page number (1-based) */
  page: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** File size in bytes */
  fileSizeBytes: number;
  /** S3 URL of the uploaded image */
  url: string;
  /** S3 key */
  key: string;
}

export interface ExtractEmbeddedImagesResult {
  /** Uploaded images that passed the size/dimension filter */
  images: EmbeddedImageInfo[];
  /** Total embedded images found in the PDF (before filtering) */
  totalFound: number;
  /** Number of images skipped due to size/dimension filter */
  skipped: number;
  /** Non-fatal errors encountered during extraction */
  errors: string[];
}

// ─── pdfimages list parser ────────────────────────────────────────────────────

interface PdfImageListEntry {
  page: number;
  index: number;
  width: number;
  height: number;
}

/**
 * Parse the output of `pdfimages -list` into structured entries.
 * Output format (columns): page num type width height color comp bpc enc interp object-id x-ppi y-ppi size ratio
 */
function parsePdfImagesList(stdout: string): PdfImageListEntry[] {
  const entries: PdfImageListEntry[] = [];
  const lines = stdout.split("\n");
  for (const line of lines) {
    // Skip header lines (start with "page" or "---")
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("page") || trimmed.startsWith("---")) continue;
    // Parse space-separated columns
    const cols = trimmed.split(/\s+/);
    if (cols.length < 5) continue;
    const page = parseInt(cols[0], 10);
    const index = parseInt(cols[1], 10);
    const width = parseInt(cols[3], 10);
    const height = parseInt(cols[4], 10);
    if (isNaN(page) || isNaN(index) || isNaN(width) || isNaN(height)) continue;
    entries.push({ page, index, width, height });
  }
  return entries;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Extract embedded raster images from a PDF and upload qualifying ones to S3.
 *
 * @param pdfBuffer  PDF file contents as a Buffer
 * @param claimId    Claim ID used to build the S3 key path
 * @param log        Optional logger function
 * @returns          Array of S3 URLs for qualifying embedded images
 */
export async function extractEmbeddedImages(
  pdfBuffer: Buffer,
  claimId: number,
  log: (msg: string) => void = () => {}
): Promise<ExtractEmbeddedImagesResult> {
  const errors: string[] = [];
  const images: EmbeddedImageInfo[] = [];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kinga-embedded-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "img");

  // Deterministic S3 key prefix based on PDF content hash
  const pdfHash = createHash("md5").update(pdfBuffer).digest("hex").slice(0, 8);

  try {
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Step 1: List embedded images to get dimensions before extracting
    let listEntries: PdfImageListEntry[] = [];
    try {
      const { stdout } = await execFileAsync(
        "pdfimages",
        ["-list", pdfPath],
        { timeout: 30_000 }
      );
      listEntries = parsePdfImagesList(stdout);
      log(`Found ${listEntries.length} embedded image(s) in PDF`);
    } catch (listErr: any) {
      errors.push(`pdfimages -list failed: ${listErr.message}`);
      log(`ERROR: pdfimages -list failed: ${listErr.message}`);
      return { images: [], totalFound: 0, skipped: 0, errors };
    }

    const totalFound = listEntries.length;

    // Step 2: Filter by dimensions before extracting (saves time on large PDFs)
    const qualifying = listEntries.filter(
      (e) => e.width >= MIN_DIMENSION_PX && e.height >= MIN_DIMENSION_PX
    );
    const skippedByDimension = totalFound - qualifying.length;
    log(`Dimension filter: ${qualifying.length}/${totalFound} pass (>= ${MIN_DIMENSION_PX}px)`);

    if (qualifying.length === 0) {
      return { images: [], totalFound, skipped: skippedByDimension, errors };
    }

    // Step 3: Extract all embedded images as JPEG (or native format)
    // -j: write JPEG images as JPEG files (preserves original JPEG quality)
    // -png: write non-JPEG images as PNG
    // Without -all, pdfimages writes PPM for non-JPEG images by default.
    // Using -j -png gives us JPEG for JPEG originals and PNG for others.
    try {
      await execFileAsync(
        "pdfimages",
        ["-j", "-png", pdfPath, outputPrefix],
        { timeout: 30_000, maxBuffer: 200 * 1024 * 1024 }
      );
    } catch (extractErr: any) {
      errors.push(`pdfimages extraction failed: ${extractErr.message}`);
      log(`ERROR: pdfimages extraction failed: ${extractErr.message}`);
      return { images: [], totalFound, skipped: skippedByDimension, errors };
    }

    // Step 4: Read extracted files, apply size filter, upload qualifying ones
    const extractedFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith("img-") && (f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".ppm")))
      .sort();

    log(`Extracted ${extractedFiles.length} image file(s) from PDF`);

    let uploadCount = 0;
    let skippedBySize = 0;

    for (const filename of extractedFiles) {
      if (uploadCount >= MAX_IMAGES_TO_UPLOAD) {
        log(`WARNING: Reached upload limit (${MAX_IMAGES_TO_UPLOAD}). Stopping.`);
        break;
      }

      // Parse index from filename: img-NNN.jpg → NNN
      const indexMatch = filename.match(/img-(\d+)\./);
      if (!indexMatch) continue;
      const fileIndex = parseInt(indexMatch[1], 10);

      // Find the corresponding list entry for dimension info
      const listEntry = listEntries[fileIndex];
      if (!listEntry) continue;

      // Skip if dimensions are below threshold (already filtered, but double-check)
      if (listEntry.width < MIN_DIMENSION_PX || listEntry.height < MIN_DIMENSION_PX) continue;

      const filePath = path.join(tmpDir, filename);
      const fileSize = fs.statSync(filePath).size;

      // Apply file size filter
      if (fileSize < MIN_FILE_SIZE_BYTES) {
        skippedBySize++;
        continue;
      }

      // Determine MIME type
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === ".jpg" ? "image/jpeg"
        : ext === ".png" ? "image/png"
        : "image/x-portable-pixmap";

      // Convert PPM to JPEG-compatible format for S3 (upload as-is, LLM handles it)
      // PPM files are uncompressed RGB — they're large but valid image data.
      // For production, consider converting PPM→JPEG via sharp, but for now upload as PNG.
      const uploadExt = ext === ".ppm" ? ".png" : ext;
      const s3Key = `claims/${claimId}/embedded-photos/${pdfHash}/img-${String(fileIndex).padStart(3, "0")}${uploadExt}`;

      try {
        const imgBuffer = fs.readFileSync(filePath);
        const { url, key } = await storagePut(s3Key, imgBuffer, mimeType);
        images.push({
          index: fileIndex,
          page: listEntry.page,
          width: listEntry.width,
          height: listEntry.height,
          fileSizeBytes: fileSize,
          url,
          key,
        });
        log(`Uploaded embedded image ${fileIndex} (page ${listEntry.page}, ${listEntry.width}×${listEntry.height}, ${Math.round(fileSize / 1024)}KB) → ${url}`);
        uploadCount++;
      } catch (uploadErr: any) {
        const msg = `Image ${fileIndex} upload failed: ${uploadErr.message}`;
        errors.push(msg);
        log(`ERROR: ${msg}`);
      }
    }

    const totalSkipped = skippedByDimension + skippedBySize;
    log(`Embedded image extraction complete: ${images.length} uploaded, ${totalSkipped} skipped (${skippedByDimension} too small, ${skippedBySize} below size threshold)`);

    return { images, totalFound, skipped: totalSkipped, errors };

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
}

/**
 * Convenience wrapper: extract embedded images from a PDF URL.
 * Downloads the PDF first, then calls extractEmbeddedImages.
 */
export async function extractEmbeddedImagesFromUrl(
  pdfUrl: string,
  claimId: number,
  log: (msg: string) => void = () => {}
): Promise<ExtractEmbeddedImagesResult> {
  log(`Downloading PDF for embedded image extraction: ${pdfUrl}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let pdfBuffer: Buffer;
  try {
    const res = await fetch(pdfUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    pdfBuffer = Buffer.from(arrayBuffer);
    log(`PDF downloaded: ${pdfBuffer.length} bytes`);
  } catch (err: any) {
    log(`ERROR: PDF download failed: ${err.message}`);
    return { images: [], totalFound: 0, skipped: 0, errors: [`PDF download failed: ${err.message}`] };
  } finally {
    clearTimeout(timer);
  }
  return extractEmbeddedImages(pdfBuffer, claimId, log);
}
