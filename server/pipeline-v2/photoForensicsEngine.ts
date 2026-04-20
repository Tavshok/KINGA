/**
 * pipeline-v2/photoForensicsEngine.ts
 *
 * PHOTO FORENSICS ENGINE
 *
 * Downloads each damage photo URL, runs pure Node.js EXIF extraction
 * (using exifr) and basic manipulation heuristics, then returns per-photo
 * results plus aggregated FraudIndicator entries ready for Stage 8.
 *
 * Design principles:
 *  - Non-blocking: individual photo failures are captured, not thrown.
 *  - Parallel: all photos are analysed concurrently (Promise.allSettled).
 *  - Self-cleaning: temp files are always deleted even on error.
 *  - Capped: at most MAX_PHOTOS_TO_ANALYSE photos are processed to keep
 *    pipeline latency bounded.
 *  - Zero system binaries: uses exifr (pure JS) instead of python3/exiftool.
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import type { FraudIndicator } from "./types";

const MAX_PHOTOS_TO_ANALYSE = 3;   // Cap at 3 to keep pipeline latency bounded
const DOWNLOAD_TIMEOUT_MS = 10_000; // 10s download timeout per photo

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
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download a remote image to a temp file.
 * Returns the local path on success, throws on failure.
 */
async function downloadToTemp(url: string): Promise<string> {
  const ext = path.extname(url.split("?")[0]) || ".jpg";
  const tmpPath = path.join(os.tmpdir(), `kinga-photo-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} downloading photo`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);
    return tmpPath;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run pure Node.js EXIF analysis on a local image file.
 * Uses exifr for EXIF extraction and crypto for image hashing.
 */
async function runNodeForensics(localPath: string): Promise<RawAnalysisResult> {
  const flags: string[] = [];
  const recommendations: string[] = [];
  let exifData: Record<string, string> = {};
  let gpsCoordinates: { latitude: number; longitude: number } | null = null;
  let captureDateTime: string | null = null;
  let manipulationScore = 0;

  // Read file buffer for hashing
  const buffer = await fs.readFile(localPath);
  const imageHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // EXIF extraction via exifr (pure JS, no native binaries)
  try {
    // Dynamic import to handle ESM/CJS compatibility
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

      // Editing software detection
      const software = exif.Software ?? exif.ProcessingSoftware ?? exif.CreatorTool;
      if (software) {
        const sw = String(software).toLowerCase();
        const EDITING_TOOLS = ["photoshop", "lightroom", "gimp", "snapseed", "facetune", "picsart", "pixelmator", "affinity", "canva", "vsco"];
        if (EDITING_TOOLS.some(t => sw.includes(t))) {
          flags.push(`MANIPULATION: Image edited with ${software}`);
          manipulationScore += 0.6;
          recommendations.push(`Photo metadata indicates editing software (${software}). Manual review of image authenticity recommended.`);
        }
      }

      // Check for stripped EXIF (very few fields = likely stripped)
      const fieldCount = Object.keys(exifData).length;
      if (fieldCount < 3) {
        flags.push("SUSPICIOUS: No EXIF metadata — image may have been stripped or is a screenshot");
        manipulationScore += 0.3;
        recommendations.push("Photo has minimal/no EXIF metadata. This is common after editing or screenshot capture.");
      }

      // Check for future dates (impossible capture time)
      if (captureDateTime) {
        const captureDate = new Date(captureDateTime);
        const now = new Date();
        if (captureDate > now) {
          flags.push("SUSPICIOUS: Photo capture date is in the future — metadata may be manipulated");
          manipulationScore += 0.5;
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
    // EXIF extraction failed — treat as missing EXIF
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
 * Analyse a single photo URL.
 * Downloads to temp, runs Node.js forensics, cleans up temp file.
 */
async function analysePhoto(url: string): Promise<PhotoForensicsResult> {
  let tmpPath: string | null = null;
  try {
    tmpPath = await downloadToTemp(url);
    const result = await runNodeForensics(tmpPath);
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
 * Returns a summary with per-photo results and aggregated fraud indicators.
 */
export async function runPhotoForensics(
  photoUrls: string[]
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

  // Cap to avoid pipeline latency blow-up
  const urlsToProcess = photoUrls.slice(0, MAX_PHOTOS_TO_ANALYSE);

  // Analyse all photos concurrently
  const settled = await Promise.allSettled(urlsToProcess.map(analysePhoto));

  const photos: PhotoForensicsResult[] = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : { url: "unknown", analysisResult: null, error: String((s as any).reason) }
  );

  // ── Aggregate indicators ──────────────────────────────────────────────────
  const indicators: FraudIndicator[] = [];
  let analysedCount = 0;
  let errorCount = 0;
  let anyGpsPresent = false;
  let anySuspicious = false;
  let manipulationCount = 0;
  let noExifCount = 0;
  let noGpsCount = 0;
  let editingSoftwareFlags: string[] = [];

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

    const hasNoExif = r.flags.some(f => f.startsWith("SUSPICIOUS: No EXIF"));
    if (hasNoExif) noExifCount++;

    const hasNoGps = r.flags.some(f => f.startsWith("WARNING: No GPS"));
    if (hasNoGps) noGpsCount++;

    const editFlags = r.flags.filter(f => f.startsWith("MANIPULATION: Image edited"));
    editingSoftwareFlags.push(...editFlags);
  }

  // ── Build FraudIndicator entries ──────────────────────────────────────────

  if (analysedCount > 0) {
    // 1. Manipulation detected in photos
    if (manipulationCount > 0) {
      indicators.push({
        indicator: "photo_manipulation_detected",
        category: "photo_forensics",
        score: Math.min(25, manipulationCount * 12),
        description: `${manipulationCount} of ${analysedCount} analysed photo(s) show signs of digital manipulation (cloning, splicing, or abnormal entropy).`,
      });
    }

    // 2. Editing software in EXIF
    if (editingSoftwareFlags.length > 0) {
      const unique = [...new Set(editingSoftwareFlags)];
      indicators.push({
        indicator: "photo_editing_software_detected",
        category: "photo_forensics",
        score: 15,
        description: `Photo EXIF metadata reveals editing software: ${unique.slice(0, 3).join("; ")}.`,
      });
    }

    // 3. No EXIF data (stripped — common after editing)
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

    // 4. No GPS data
    if (!anyGpsPresent && noGpsCount > 0) {
      indicators.push({
        indicator: "photos_no_gps_data",
        category: "photo_forensics",
        score: 5,
        description: `None of the ${analysedCount} analysed photo(s) contain GPS coordinates — accident location cannot be verified from photo metadata.`,
      });
    }
  }

  // 5. Photo analysis errors (partial data)
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
