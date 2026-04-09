/**
 * pipeline-v2/photoForensicsEngine.ts
 *
 * PHOTO FORENSICS ENGINE
 *
 * Downloads each damage photo URL, runs the Python image_forensics.py
 * script on it, and returns per-photo EXIF / manipulation results plus
 * aggregated FraudIndicator entries ready for Stage 8.
 *
 * Design principles:
 *  - Non-blocking: individual photo failures are captured, not thrown.
 *  - Parallel: all photos are analysed concurrently (Promise.allSettled).
 *  - Self-cleaning: temp files are always deleted even on error.
 *  - Capped: at most MAX_PHOTOS_TO_ANALYSE photos are processed to keep
 *    pipeline latency bounded.
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import type { FraudIndicator } from "./types";

const execAsync = promisify(exec);

const PYTHON_DIR = path.join(__dirname, "../../python");
const MAX_PHOTOS_TO_ANALYSE = 6;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const ANALYSIS_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PhotoForensicsResult {
  url: string;
  /** null when the download or analysis failed */
  analysisResult: RawPythonResult | null;
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

interface RawPythonResult {
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
 * Run image_forensics.py on a local file.
 * Returns the parsed JSON result.
 */
async function runPythonForensics(localPath: string): Promise<RawPythonResult> {
  const scriptPath = path.join(PYTHON_DIR, "image_forensics.py");
  const { stdout } = await execAsync(
    `python3 "${scriptPath}" "${localPath}"`,
    { timeout: ANALYSIS_TIMEOUT_MS }
  );
  return JSON.parse(stdout) as RawPythonResult;
}

/**
 * Analyse a single photo URL.
 * Downloads to temp, runs Python, cleans up temp file.
 */
async function analysePhoto(url: string): Promise<PhotoForensicsResult> {
  let tmpPath: string | null = null;
  try {
    tmpPath = await downloadToTemp(url);
    const result = await runPythonForensics(tmpPath);
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
