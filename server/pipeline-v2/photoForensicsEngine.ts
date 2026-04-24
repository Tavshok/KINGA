/**
 * pipeline-v2/photoForensicsEngine.ts
 *
 * PHOTO FORENSICS ENGINE
 *
 * Downloads each damage photo URL, runs pure Node.js EXIF extraction
 * (using exifr) and basic manipulation heuristics, then optionally runs
 * AI vision analysis on each photo for damage description and authenticity.
 *
 * Design principles:
 *  - Non-blocking: individual photo failures are captured, not thrown.
 *  - Sequential: photos are processed one at a time to avoid S3 rate limits
 *    and to keep memory usage bounded.
 *  - Self-cleaning: temp files are always deleted even on error.
 *  - Capped: at most MAX_PHOTOS_TO_ANALYSE photos are processed.
 *  - Abort-safe: the download timeout covers BOTH connection AND body read.
 *  - Zero system binaries: uses exifr (pure JS) instead of python3/exiftool.
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import type { FraudIndicator } from "./types";

const MAX_PHOTOS_TO_ANALYSE = 10;   // Analyse up to 10 photos per claim
const DOWNLOAD_TIMEOUT_MS = 30_000; // 30s covers large S3 photos (3-8MB)

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PhotoForensicsResult {
  url: string;
  /** null when the download or analysis failed */
  analysisResult: RawAnalysisResult | null;
  error?: string;
}

export interface PhotoForensicsSummary {
  /** Per-photo results */
  photos: PhotoForensicsResult[];
  /** Aggregated FraudIndicator entries for Stage 8 */
  indicators: FraudIndicator[];
  /** Number of photos that were actually analysed */
  analysedCount: number;
  /** Number of photos that failed (download or analysis error) */
  errorCount: number;
  /** Whether any photo had a GPS coordinate */
  anyGpsPresent: boolean;
  /** Whether any photo was flagged as suspicious */
  anySuspicious: boolean;
}

interface RawAnalysisResult {
  is_suspicious: boolean;
  confidence: number;
  flags: string[];
  exif_data: Record<string, string>;
  gps_coordinates: { latitude: number; longitude: number } | null;
  capture_datetime: string | null;
  manipulation_indicators: { manipulation_score?: number };
  image_hash: string;
  recommendations: string[];
  /** AI vision description of the damage visible in this photo */
  ai_vision_description?: string;
  /**
   * True when the image is not a vehicle damage photo (e.g. document, form,
   * estimate sheet, ID, licence disc, scene photo without vehicle, etc.).
   * Set by the AI vision classification step.
   */
  is_non_vehicle?: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download a remote image to a temp file.
 * The AbortController covers BOTH the connection AND the body read —
 * this prevents "This operation was aborted" errors when S3 is slow.
 */
async function downloadToTemp(url: string): Promise<{ tmpPath: string; buffer: Buffer }> {
  const ext = path.extname(url.split("?")[0]) || ".jpg";
  const tmpPath = path.join(
    os.tmpdir(),
    `kinga-photo-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
  );

  const controller = new AbortController();
  // Keep the timer active through BOTH fetch() and arrayBuffer() reads.
  // Do NOT clear it until after the body is fully read.
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let buffer: Buffer;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      clearTimeout(timer);
      throw new Error(`HTTP ${response.status} downloading photo`);
    }
    // Body read — abort controller still active here
    let arrayBuf: ArrayBuffer;
    try {
      arrayBuf = await response.arrayBuffer();
    } catch (bodyErr: any) {
      clearTimeout(timer);
      if (bodyErr.name === "AbortError") {
        throw new Error(`Photo download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s (body stalled)`);
      }
      throw bodyErr;
    }
    clearTimeout(timer);
    buffer = Buffer.from(arrayBuf);
    await fs.writeFile(tmpPath, buffer);
    return { tmpPath, buffer };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`Photo download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s (connection)`);
    }
    throw err;
  }
}

/**
 * Run pure Node.js EXIF analysis on a buffer.
 * Uses exifr for EXIF extraction and crypto for image hashing.
 */
async function runNodeForensics(buffer: Buffer): Promise<RawAnalysisResult> {
  const flags: string[] = [];
  const recommendations: string[] = [];
  let exifData: Record<string, string> = {};
  let gpsCoordinates: { latitude: number; longitude: number } | null = null;
  let captureDateTime: string | null = null;
  let manipulationScore = 0;

  // Image hash
  const imageHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // EXIF extraction via exifr (pure JS, no native binaries)
  try {
    const exifr = await import("exifr");
    const parse = exifr.default?.parse ?? exifr.parse;
    const exif = await parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: false,
      xmp: true,
      icc: false,
      jfif: false,
      ihdr: false,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
    });

    if (exif && typeof exif === "object") {
      // Flatten EXIF to string map
      for (const [k, v] of Object.entries(exif)) {
        if (v !== null && v !== undefined) {
          exifData[k] = String(v);
        }
      }

      // GPS coordinates
      if (exif.latitude != null && exif.longitude != null) {
        gpsCoordinates = { latitude: Number(exif.latitude), longitude: Number(exif.longitude) };
      } else {
        flags.push("WARNING: No GPS data in photo EXIF — location cannot be verified");
      }

      // Capture datetime
      const dt = exif.DateTimeOriginal ?? exif.CreateDate ?? exif.DateTime;
      if (dt) {
        captureDateTime = dt instanceof Date ? dt.toISOString() : String(dt);
      }

      // Camera make/model — useful for authenticity
      const make = exif.Make ?? exif.CameraMake;
      const model = exif.Model ?? exif.CameraModel;
      if (make) exifData["_camera_make"] = String(make);
      if (model) exifData["_camera_model"] = String(model);

      // Editing software detection
      const software = exif.Software ?? exif.ProcessingSoftware ?? exif.CreatorTool;
      if (software) {
        const sw = String(software).toLowerCase();
        const EDITING_TOOLS = [
          "photoshop", "lightroom", "gimp", "snapseed", "facetune",
          "picsart", "pixelmator", "affinity", "canva", "vsco",
          "adobe", "capture one", "darktable", "rawtherapee",
        ];
        if (EDITING_TOOLS.some(t => sw.includes(t))) {
          flags.push(`MANIPULATION: Image edited with ${software}`);
          manipulationScore += 0.6;
          recommendations.push(
            `Photo metadata indicates editing software (${software}). Manual review of image authenticity recommended.`
          );
        }
      }

      // Stripped EXIF detection
      const fieldCount = Object.keys(exifData).length;
      if (fieldCount < 3) {
        flags.push("SUSPICIOUS: No EXIF metadata — image may have been stripped or is a screenshot");
        manipulationScore += 0.3;
        recommendations.push("Photo has minimal/no EXIF metadata. This is common after editing or screenshot capture.");
      }

      // Future date detection
      if (captureDateTime) {
        const captureDate = new Date(captureDateTime);
        const now = new Date();
        if (captureDate > now) {
          flags.push("SUSPICIOUS: Photo capture date is in the future — metadata may be manipulated");
          manipulationScore += 0.5;
        }
      }

      // Thumbnail mismatch heuristic — if thumbnail exists but main image is very different size
      if (exif.ThumbnailLength && buffer.length > 0) {
        const thumbRatio = Number(exif.ThumbnailLength) / buffer.length;
        if (thumbRatio > 0.8) {
          // Thumbnail is suspiciously large relative to main image — possible splice
          flags.push("SUSPICIOUS: Thumbnail-to-image size ratio is abnormal — possible image splice");
          manipulationScore += 0.25;
        }
      }

    } else {
      // No EXIF at all
      flags.push("SUSPICIOUS: No EXIF metadata — image may have been stripped or is a screenshot");
      flags.push("WARNING: No GPS data in photo EXIF — location cannot be verified");
      manipulationScore += 0.3;
      recommendations.push("Photo has no EXIF metadata. This is common after editing or screenshot capture.");
    }
  } catch (exifErr) {
    flags.push("SUSPICIOUS: No EXIF metadata — EXIF extraction failed");
    flags.push("WARNING: No GPS data in photo EXIF — location cannot be verified");
    manipulationScore += 0.2;
  }

  const isSuspicious = manipulationScore > 0.4;
  const confidence = Math.min(1.0, 0.5 + manipulationScore * 0.5);

  return {
    is_suspicious: isSuspicious,
    confidence,
    flags,
    exif_data: exifData,
    gps_coordinates: gpsCoordinates,
    capture_datetime: captureDateTime,
    manipulation_indicators: { manipulation_score: manipulationScore },
    image_hash: imageHash,
    recommendations,
  };
}

/**
 * Run AI vision analysis on a photo URL.
 * Asks the LLM to describe visible damage, assess authenticity, and flag anomalies.
 * Returns null on failure (non-blocking).
 */
/**
 * Result of AI vision classification for a single photo.
 */
interface VisionClassification {
  /** True when the image is NOT a vehicle damage photo */
  isNonVehicle: boolean;
  /** Human-readable description (damage analysis if vehicle, reason if not) */
  description: string;
}

async function runAiVisionAnalysis(photoUrl: string): Promise<VisionClassification | null> {
  try {
    const { invokeLLM } = await import("../_core/llm");
    const result = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: photoUrl, detail: "high" },
            },
            {
              type: "text",
              text: `You are a motor vehicle insurance claims photo analyst.

STEP 1 — IMAGE CLASSIFICATION (mandatory first step):
Determine whether this image is a vehicle damage photograph or something else.

Images that are NOT vehicle damage photos include:
- Repair quotation / estimate forms or sheets
- Invoice, receipt, or billing documents
- Claim forms or application documents
- Driver's licence, ID documents, or identity cards
- Vehicle registration papers or licence discs
- Police report documents or accident report forms
- Scene-only photos with no vehicle visible
- Logos, stamps, or watermarks
- Any other document, text, or form image

If the image IS a vehicle damage photo, respond with:
IMAGE_TYPE: VEHICLE_DAMAGE

If the image is NOT a vehicle damage photo, respond with:
IMAGE_TYPE: NON_VEHICLE
REASON: [brief description of what the image actually shows]

STEP 2 — DAMAGE ANALYSIS (only if IMAGE_TYPE is VEHICLE_DAMAGE):
1. DAMAGE DESCRIPTION: Describe all visible damage in detail (location on vehicle, severity, type of damage).
2. DAMAGE CONSISTENCY: Does the damage pattern appear consistent with a real collision/incident? Note any anomalies (e.g. rust under fresh damage, mismatched paint, pre-existing damage).
3. PHOTO AUTHENTICITY: Any signs the photo is staged, digitally altered, or taken at a different time/location than claimed?
4. DAMAGE SEVERITY: Estimate severity (minor/moderate/severe/total loss).
5. AFFECTED PARTS: List specific vehicle parts affected.

Be concise but thorough. Flag any fraud indicators clearly.`,
            },
          ],
        },
      ],
      timeoutMs: 45_000,
    });
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length < 5) return null;
    const text = content.trim();
    // Parse IMAGE_TYPE classification from the response
    const typeMatch = text.match(/IMAGE_TYPE\s*:\s*(VEHICLE_DAMAGE|NON_VEHICLE)/i);
    if (typeMatch) {
      const isNonVehicle = typeMatch[1].toUpperCase() === 'NON_VEHICLE';
      if (isNonVehicle) {
        // Extract the reason if present
        const reasonMatch = text.match(/REASON\s*:\s*([^\n]+)/i);
        const reason = reasonMatch ? reasonMatch[1].trim() : 'Image does not depict vehicle damage';
        return { isNonVehicle: true, description: reason };
      }
      // Vehicle damage — strip the IMAGE_TYPE header line and return the analysis
      const analysisText = text
        .replace(/^IMAGE_TYPE\s*:\s*VEHICLE_DAMAGE[^\n]*\n?/im, '')
        .trim();
      return { isNonVehicle: false, description: analysisText || text };
    }
    // No IMAGE_TYPE tag — treat as vehicle damage (legacy / fallback)
    return { isNonVehicle: false, description: text };
  } catch (err: any) {
    // Non-blocking — vision analysis failure does not fail the photo
    console.warn(`[PhotoForensics] AI vision analysis failed for photo: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Analyse a single photo URL.
 * Downloads to temp, runs EXIF forensics + AI vision analysis, cleans up.
 */
async function analysePhoto(
  url: string,
  runVision: boolean
): Promise<PhotoForensicsResult> {
  let tmpPath: string | null = null;
  try {
    const { tmpPath: tp, buffer } = await downloadToTemp(url);
    tmpPath = tp;
    const result = await runNodeForensics(buffer);

    // AI vision analysis — classifies image type AND describes damage
    if (runVision) {
      const vision = await runAiVisionAnalysis(url);
      if (vision) {
        result.ai_vision_description = vision.description;
        if (vision.isNonVehicle) {
          result.is_non_vehicle = true;
        }
      }
    }

    return { url, analysisResult: result };
  } catch (err: any) {
    return { url, analysisResult: null, error: String(err?.message ?? err) };
  } finally {
    if (tmpPath) {
      fs.unlink(tmpPath).catch(() => { /* best-effort cleanup */ });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run photo forensics on up to MAX_PHOTOS_TO_ANALYSE damage photo URLs.
 * Photos are processed sequentially to avoid S3 rate limits and memory spikes.
 *
 * @param photoUrls   List of photo URLs to analyse.
 * @param runVision   Whether to run AI vision analysis per photo (default: true).
 *                    Set to false in tests or when LLM budget is constrained.
 */
export async function runPhotoForensics(
  photoUrls: string[],
  runVision = true
): Promise<PhotoForensicsSummary> {
  if (photoUrls.length === 0) {
    return {
      photos: [],
      indicators: [],
      analysedCount: 0,
      errorCount: 0,
      anyGpsPresent: false,
      anySuspicious: false,
    };
  }

  const urlsToProcess = photoUrls.slice(0, MAX_PHOTOS_TO_ANALYSE);
  // Batched parallel processing: 4 photos per batch.
  // S3 handles concurrent downloads fine; 4-concurrent LLM vision calls are within rate limits.
  // Cuts forensics time from ~50s sequential to ~15s parallel for 10 photos.
  const FORENSICS_BATCH_SIZE = 4;
  const photos: PhotoForensicsResult[] = [];
  for (let batchStart = 0; batchStart < urlsToProcess.length; batchStart += FORENSICS_BATCH_SIZE) {
    const batch = urlsToProcess.slice(batchStart, batchStart + FORENSICS_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(url => analysePhoto(url, runVision)));
    photos.push(...batchResults);
  }

  // ── Aggregate indicators ──────────────────────────────────────────────────
  const indicators: FraudIndicator[] = [];
  let analysedCount = 0;
  let errorCount = 0;
  let anyGpsPresent = false;
  let anySuspicious = false;
  let manipulationCount = 0;
  let noExifCount = 0;
  let noGpsCount = 0;
  const editingSoftwareFlags: string[] = [];
  let futureDateCount = 0;
  let thumbnailAnomalyCount = 0;

  for (const photo of photos) {
    if (!photo.analysisResult || photo.error) {
      errorCount++;
      continue;
    }
    analysedCount++;
    const r = photo.analysisResult;

    if (r.gps_coordinates) anyGpsPresent = true;
    if (r.is_suspicious) anySuspicious = true;

    const manScore = r.manipulation_indicators?.manipulation_score ?? 0;
    if (manScore > 0.5) manipulationCount++;

    if (r.flags.some(f => f.startsWith("SUSPICIOUS: No EXIF"))) noExifCount++;
    if (r.flags.some(f => f.startsWith("WARNING: No GPS"))) noGpsCount++;
    if (r.flags.some(f => f.includes("future"))) futureDateCount++;
    if (r.flags.some(f => f.includes("Thumbnail"))) thumbnailAnomalyCount++;

    const editFlags = r.flags.filter(f => f.startsWith("MANIPULATION: Image edited"));
    editingSoftwareFlags.push(...editFlags);
  }

  // ── Build FraudIndicator entries ──────────────────────────────────────────

  if (analysedCount > 0) {
    if (manipulationCount > 0) {
      indicators.push({
        indicator: "photo_manipulation_detected",
        category: "photo_forensics",
        score: Math.min(25, manipulationCount * 12),
        description: `${manipulationCount} of ${analysedCount} analysed photo(s) show signs of digital manipulation.`,
      });
    }

    if (editingSoftwareFlags.length > 0) {
      const unique = [...new Set(editingSoftwareFlags)];
      indicators.push({
        indicator: "photo_editing_software_detected",
        category: "photo_forensics",
        score: 15,
        description: `Photo EXIF metadata reveals editing software: ${unique.slice(0, 3).join("; ")}.`,
      });
    }

    if (futureDateCount > 0) {
      indicators.push({
        indicator: "photo_future_capture_date",
        category: "photo_forensics",
        score: 20,
        description: `${futureDateCount} photo(s) have capture dates in the future — metadata may be manipulated.`,
      });
    }

    if (thumbnailAnomalyCount > 0) {
      indicators.push({
        indicator: "photo_thumbnail_anomaly",
        category: "photo_forensics",
        score: 10,
        description: `${thumbnailAnomalyCount} photo(s) have abnormal thumbnail-to-image size ratios — possible image splice.`,
      });
    }

    if (noExifCount === analysedCount) {
      indicators.push({
        indicator: "photos_no_exif_data",
        category: "photo_forensics",
        score: 10,
        description: `All ${analysedCount} analysed photo(s) have no EXIF metadata — images may have been stripped or are screenshots.`,
      });
    } else if (noExifCount > 0) {
      indicators.push({
        indicator: "photos_partial_exif_missing",
        category: "photo_forensics",
        score: 5,
        description: `${noExifCount} of ${analysedCount} analysed photo(s) are missing EXIF metadata.`,
      });
    }

    if (!anyGpsPresent && noGpsCount > 0) {
      indicators.push({
        indicator: "photos_no_gps_data",
        category: "photo_forensics",
        score: 5,
        description: `None of the ${analysedCount} analysed photo(s) contain GPS coordinates — accident location cannot be verified from photo metadata.`,
      });
    }
  }

  if (errorCount > 0 && analysedCount === 0) {
    indicators.push({
      indicator: "photo_forensics_failed",
      category: "photo_forensics",
      score: 5,
      description: `Photo forensics analysis could not be completed for any of the ${photoUrls.length} submitted photo(s). Manual review recommended.`,
    });
  }

  return {
    photos,
    indicators,
    analysedCount,
    errorCount,
    anyGpsPresent,
    anySuspicious,
  };
}
