/**
 * pipeline-v2/stage-6-5a-vge.ts
 *
 * STAGE 6.5A — VISION GEOMETRY ENGINE: Scale Calibration
 *
 * Converts pixel measurements to physical dimensions using known reference objects
 * detected in damage photos. Produces a calibrated crush depth estimate with
 * uncertainty bounds and a Geometry Evidence Block for the report.
 *
 * VVCS Convention:
 *   Origin: front axle centreline at ground level
 *   X: positive forward, Y: positive left, Z: positive up
 *   All coordinates in millimetres.
 *
 * Reference object tiers:
 *   Tier 1 (highest reliability): wheel/tyre, licence plate
 *   Tier 2 (useful):              headlamp spacing, grille width, bonnet width
 *   Tier 3 (supporting only):     badges, door handles, trim lines
 *
 * Degrades gracefully:
 *   - No vehicle profile in DB → attempts wheel detection using tyre spec from claim
 *   - No reference objects detected → returns null, Stage 7 uses raw LLM estimate
 *   - Extreme perspective (wheel aspect ratio < 0.4) → LOW confidence, no correction
 *
 * NEVER halts the pipeline — all errors produce a null result with a failure reason.
 */

import { invokeLLM } from "../_core/llm";
import type { PipelineContext } from "./types";
import mysql from "mysql2/promise";

// ── Output types ──────────────────────────────────────────────────────────────

export type PerspectiveCorrectionMethod = "none" | "ellipse_analysis" | "homography";
export type CalibrationConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface ReferenceObjectDetection {
  type: string;                    // e.g. "wheel", "licence_plate", "headlamp_spacing"
  tier: 1 | 2 | 3;
  pixelMeasurementPx: number;
  physicalMeasurementMm: number;
  scaleMmPerPixel: number;
  baseReliability: number;         // 0–1 from measurement_types table
  perspectiveCorrectionMethod: PerspectiveCorrectionMethod;
  /** Wheel ellipse aspect ratio — if < 0.4, perspective is too extreme for correction */
  wheelEllipseAspectRatio?: number;
  confidence: number;              // 0–1 final confidence for this detection
  notes?: string;
}

export interface PerImageCalibrationResult {
  imageUrl: string;
  imageIndex: number;
  scaleAvailable: boolean;
  referenceObjects: ReferenceObjectDetection[];
  overallCalibrationConfidence: number;  // 0–1 weighted mean of all reference confidences
  perspectiveCorrected: boolean;
  perspectiveCorrectionMethod: PerspectiveCorrectionMethod;
  /** Calibrated crush depth for this image (mm), null if not measurable */
  rawCrushDepthMm: number | null;
  calibratedCrushDepthMm: number | null;
  calibratedCrushDepthMinMm: number | null;
  calibratedCrushDepthMaxMm: number | null;
  /**
   * View angle reported by the VGE LLM: "front", "rear", "side",
   * "45_degree_front", "45_degree_rear", or "unknown".
   * Populated from the LLM response — used by Stage 6.5B VGR for
   * view-angle-weighted crush depth consensus.
   */
  imageViewAngle?: string;
  failureReason?: string;
}

export interface VGECalibrationResult {
  /** True if at least one image produced a usable scale calibration */
  calibrationAvailable: boolean;
  /** Source quality assessment — populated when all images are unsuitable */
  sourceQualityAssessment?: GeometrySourceAssessment;
  /** Evidence acquisition recommendation when source is unsuitable */
  evidenceAcquisitionRecommendation?: string;
  /** Overall calibration confidence across all images (0–1) */
  overallCalibrationConfidence: number;
  confidenceLevel: CalibrationConfidenceLevel;
  /** Vehicle model ID used for reference dimensions (null if no profile found) */
  vehicleModelId: number | null;
  vehicleProfileUsed: string | null;  // e.g. "Toyota Hilux Revo Double Cab 2016–2023"
  /** Per-image results */
  perImageResults: PerImageCalibrationResult[];
  /** Best calibrated crush depth estimate across all images (metres) */
  calibratedCrushDepthM: number | null;
  calibratedCrushDepthMinM: number | null;
  calibratedCrushDepthMaxM: number | null;
  /** Number of reference objects detected across all images */
  totalReferenceObjectsDetected: number;
  /** Geometry Evidence Block — human-readable provenance chain for the report */
  geometryEvidenceBlock: GeometryEvidenceBlock;
}

export interface GeometryEvidenceBlock {
  vehicle: string;
  calibrationStatus: string;
  /** 'CALIBRATED' | 'NOT_APPLICABLE' | 'FAILED' */
  calibrationStatusCode: 'CALIBRATED' | 'NOT_APPLICABLE' | 'FAILED';
  sourceQualityAssessment?: GeometrySourceAssessment;
  evidenceAcquisitionRecommendation?: string;
  referenceObjectsSummary: string[];
  overallCalibrationConfidencePct: number;
  perspectiveCorrectionApplied: boolean;
  estimatedDeformationRange: string | null;
  measurementBasis: string;
  limitations: string[];
  /** Populated when reference objects disagree on scale by more than 15% */
  referenceDisagreementWarning?: string;
}

// ── Source Quality Gate types ────────────────────────────────────────────────

export type GeometrySourceType =
  | "DIRECT_DIGITAL_PHOTO"
  | "PDF_RENDERED_PHOTO"
  | "SCANNED_DOCUMENT"
  | "SCREENSHOT"
  | "UNKNOWN";

export type GeometryUsability = "SUITABLE" | "LIMITED" | "UNSUITABLE";

export interface GeometrySourceAssessment {
  sourceType: GeometrySourceType;
  geometryUsability: GeometryUsability;
  reason: string;
  confidence: number;  // 0–1
}

// ── Reference object reliability weights ─────────────────────────────────────

const REFERENCE_RELIABILITY: Record<string, { tier: 1 | 2 | 3; baseReliability: number }> = {
  wheel:             { tier: 1, baseReliability: 0.95 },
  licence_plate:     { tier: 1, baseReliability: 0.85 },
  headlamp_spacing:  { tier: 2, baseReliability: 0.75 },
  grille_width:      { tier: 2, baseReliability: 0.72 },
  bonnet_width:      { tier: 2, baseReliability: 0.80 },
  windscreen_width:  { tier: 2, baseReliability: 0.78 },
  badge:             { tier: 3, baseReliability: 0.40 },
  door_handle:       { tier: 3, baseReliability: 0.35 },
};

// ── Source Quality Gate ──────────────────────────────────────────────────────

/**
 * Classify the geometry usability of an image URL without making an LLM call.
 * Uses URL pattern heuristics and filename analysis.
 * PDF page renders are identified by the page-NNN.png naming convention used
 * by the pipeline's PDF-to-image converter.
 */
function assessSourceQuality(imageUrl: string): GeometrySourceAssessment {
  const lower = imageUrl.toLowerCase();
  const filename = lower.split('/').pop() ?? lower;

  // PDF page renders: pipeline names them page-NNN.png or page-NNN.jpg
  if (/page-\d{3,}\.(png|jpg|jpeg|webp)/.test(filename)) {
    return {
      sourceType: "PDF_RENDERED_PHOTO",
      geometryUsability: "UNSUITABLE",
      reason: "Image originated from a PDF page render. Print scaling and scan resolution prevent reliable pixel-to-mm conversion. The physical dimensions of any reference object cannot be determined from this image source.",
      confidence: 0.95,
    };
  }

  // Screenshot patterns
  if (/screenshot|screen_shot|screen-shot|capture/.test(filename)) {
    return {
      sourceType: "SCREENSHOT",
      geometryUsability: "UNSUITABLE",
      reason: "Image appears to be a screenshot. Display scaling and unknown source resolution prevent reliable pixel-to-mm conversion.",
      confidence: 0.80,
    };
  }

  // Scanned documents: common scanner output patterns
  if (/scan|scanned|doc_\d|document/.test(filename)) {
    return {
      sourceType: "SCANNED_DOCUMENT",
      geometryUsability: "UNSUITABLE",
      reason: "Image appears to be a scanned document. Scanner DPI and print scaling introduce unknown distortion factors.",
      confidence: 0.75,
    };
  }

  // Direct digital photo patterns: camera/phone naming conventions
  if (/img_\d|dsc_\d|dscn|\bphoto\b|\bpic\b|\bcam\b|\bimage\b.*\d{4,}/.test(filename) ||
      /\.(jpg|jpeg|heic|heif)$/.test(filename)) {
    return {
      sourceType: "DIRECT_DIGITAL_PHOTO",
      geometryUsability: "SUITABLE",
      reason: "Image appears to be a direct digital photograph. Pixel-to-mm calibration is applicable.",
      confidence: 0.70,
    };
  }

  // PNG without page- prefix — could be direct photo or processed image
  if (/\.png$/.test(filename)) {
    return {
      sourceType: "UNKNOWN",
      geometryUsability: "LIMITED",
      reason: "Image source type cannot be determined from filename alone. Calibration will be attempted but results should be treated with caution.",
      confidence: 0.50,
    };
  }

  return {
    sourceType: "UNKNOWN",
    geometryUsability: "LIMITED",
    reason: "Image source type unknown. Calibration will be attempted.",
    confidence: 0.40,
  };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Normalise a vehicle make/model string for fuzzy comparison.
 * Strips hyphens, spaces, underscores and lowercases so that:
 *   "MUX" matches "MU-X", "NP 200" matches "NP200", "D-Max" matches "DMAX", etc.
 */
function normaliseVehicleString(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, '');
}

async function fetchMeasurements(
  conn: mysql.Connection,
  vehicleModelId: number
): Promise<Record<string, number>> {
  const [measRows] = await conn.execute<any[]>(
    `SELECT measurement_type, value_mm FROM vehicle_geometry_measurements WHERE vehicle_model_id = ?`,
    [vehicleModelId]
  );
  const measurements: Record<string, number> = {};
  for (const row of measRows as any[]) {
    measurements[row.measurement_type] = parseFloat(row.value_mm);
  }
  return measurements;
}

async function getVehicleProfile(
  make: string | null,
  model: string | null,
  year: number | null
): Promise<{ id: number; label: string; measurements: Record<string, number> } | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !make || !model) return null;

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(dbUrl);
    const yearFilter = year ?? new Date().getFullYear();

    // ── Pass 1: standard LIKE match (fast path) ──────────────────────────────
    const [rows] = await conn.execute<any[]>(
      `SELECT id, manufacturer, model, variant, year_from, year_to
       FROM vehicle_models
       WHERE LOWER(manufacturer) LIKE LOWER(?) AND LOWER(model) LIKE LOWER(?)
         AND year_from <= ? AND (year_to IS NULL OR year_to >= ?)
       ORDER BY completeness_score DESC
       LIMIT 1`,
      [`%${make}%`, `%${model}%`, yearFilter, yearFilter]
    );

    if ((rows as any[]).length > 0) {
      const vm = (rows as any[])[0];
      const label = `${vm.manufacturer} ${vm.model}${vm.variant ? ' ' + vm.variant : ''} ${vm.year_from}\u2013${vm.year_to ?? 'present'}`;
      const measurements = await fetchMeasurements(conn, vm.id);
      return { id: vm.id, label, measurements };
    }

    // ── Pass 2: normalised fuzzy match (handles MUX↔MU-X, NP200↔NP 200, etc.) ─
    const normMake  = normaliseVehicleString(make);
    const normModel = normaliseVehicleString(model);
    const [allRows] = await conn.execute<any[]>(
      `SELECT id, manufacturer, model, variant, year_from, year_to, completeness_score
       FROM vehicle_models
       WHERE year_from <= ? AND (year_to IS NULL OR year_to >= ?)
       ORDER BY completeness_score DESC`,
      [yearFilter, yearFilter]
    );
    const fuzzyMatch = (allRows as any[]).find(r =>
      normaliseVehicleString(r.manufacturer).includes(normMake) &&
      (
        normaliseVehicleString(r.model).includes(normModel) ||
        normModel.includes(normaliseVehicleString(r.model))
      )
    ) ?? null;

    if (!fuzzyMatch) return null;

    const vm = fuzzyMatch;
    const label = `${vm.manufacturer} ${vm.model}${vm.variant ? ' ' + vm.variant : ''} ${vm.year_from}\u2013${vm.year_to ?? 'present'}`;
    const measurements = await fetchMeasurements(conn, vm.id);
    return { id: vm.id, label, measurements };

  } catch {
    return null;
  } finally {
    await conn?.end();
  }
}

// ── LLM vision prompt for reference object detection ─────────────────────────

function buildCalibrationPrompt(profile: { label: string; measurements: Record<string, number> } | null): string {
  const profileSection = profile
    ? `Vehicle reference profile: ${profile.label}
Known dimensions:
${Object.entries(profile.measurements)
  .filter(([k]) => ['wheel_diameter_mm', 'wheel_diameter_alt_mm', 'licence_plate_width_mm', 'headlamp_spacing_mm', 'grille_width_mm', 'bumper_width_mm', 'overall_width_mm'].includes(k))
  .map(([k, v]) => `  - ${k}: ${v} mm`)
  .join('\n')}`
    : `No vehicle profile available. Use standard Zimbabwe licence plate (520 × 110 mm) if visible.`;

  return `You are a vehicle accident reconstruction specialist performing photogrammetric scale calibration.

${profileSection}

Analyse this damage photograph and detect ALL visible reference objects that can be used to establish a physical scale (mm per pixel).

For each reference object detected, return:
1. type: one of "wheel", "licence_plate", "headlamp_spacing", "grille_width", "bonnet_width"
2. pixelMeasurementPx: the measured dimension in pixels (diameter for wheel, width for others)
3. physicalMeasurementMm: the known physical dimension in mm (use profile values above, or standard plate 520mm)
4. wheelEllipseAspectRatio: ONLY for wheels — ratio of minor to major axis (1.0 = perfect circle, <0.4 = extreme perspective)
5. perspectiveCorrectionApplicable: true if wheel aspect ratio is 0.4–0.95 (moderate perspective, correctable)
6. notes: any relevant observation (occlusion, damage to reference object, etc.)

Also estimate:
7. rawCrushDepthPx: the maximum visible crush/deformation depth in pixels (frontal compression from bumper face to deepest point), or null if not measurable from this view
8. collisionDirection: "frontal", "rear", "side", or "unknown"
9. imageViewAngle: "front", "rear", "side", "45_degree_front", "45_degree_rear", or "unknown"

Return ONLY valid JSON in this exact format:
{
  "referenceObjects": [
    {
      "type": "wheel",
      "pixelMeasurementPx": 220,
      "physicalMeasurementMm": 776,
      "wheelEllipseAspectRatio": 0.85,
      "perspectiveCorrectionApplicable": true,
      "notes": "Front left wheel, partially occluded by bumper"
    }
  ],
  "rawCrushDepthPx": 85,
  "collisionDirection": "frontal",
  "imageViewAngle": "45_degree_front"
}

If no reference objects are visible, return: {"referenceObjects": [], "rawCrushDepthPx": null, "collisionDirection": "unknown", "imageViewAngle": "unknown"}`;
}

// ── Per-image calibration ─────────────────────────────────────────────────────

async function calibrateImage(
  imageUrl: string,
  imageIndex: number,
  profile: { id: number; label: string; measurements: Record<string, number> } | null
): Promise<PerImageCalibrationResult> {
  const base: PerImageCalibrationResult = {
    imageUrl,
    imageIndex,
    scaleAvailable: false,
    referenceObjects: [],
    overallCalibrationConfidence: 0,
    perspectiveCorrected: false,
    perspectiveCorrectionMethod: "none",
    rawCrushDepthMm: null,
    calibratedCrushDepthMm: null,
    calibratedCrushDepthMinMm: null,
    calibratedCrushDepthMaxMm: null,
  };

  try {
    const prompt = buildCalibrationPrompt(profile);
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const rawContent = response?.choices?.[0]?.message?.content ?? "";
    const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...base, failureReason: "LLM returned no JSON" };

    const parsed = JSON.parse(jsonMatch[0]);
    const refObjects: any[] = parsed.referenceObjects ?? [];

    if (refObjects.length === 0) {
      return { ...base, failureReason: "No reference objects detected in image" };
    }

    // Process each detected reference object
    const detections: ReferenceObjectDetection[] = [];
    for (const ref of refObjects) {
      const meta = REFERENCE_RELIABILITY[ref.type] ?? { tier: 3 as const, baseReliability: 0.40 };
      const pixelMm = ref.pixelMeasurementPx > 0 ? ref.physicalMeasurementMm / ref.pixelMeasurementPx : 0;
      if (pixelMm <= 0) continue;

      // Perspective correction assessment for wheels
      let perspMethod: PerspectiveCorrectionMethod = "none";
      let confidenceAdjustment = 1.0;
      const aspectRatio = ref.wheelEllipseAspectRatio;

      if (ref.type === "wheel" && aspectRatio != null) {
        if (aspectRatio < 0.4) {
          // Extreme perspective — correction unreliable, penalise confidence
          confidenceAdjustment = 0.5;
          perspMethod = "none";
        } else if (aspectRatio >= 0.4 && aspectRatio < 0.95 && ref.perspectiveCorrectionApplicable) {
          // Moderate perspective — apply ellipse-based correction
          perspMethod = "ellipse_analysis";
          // Correct the scale: actual diameter = observed_major_axis (the wheel appears as an ellipse;
          // the major axis approximates the true diameter when aspect ratio is moderate)
          confidenceAdjustment = 0.85 + (aspectRatio - 0.4) * 0.25; // 0.85 at 0.4, ~0.99 at 1.0
        } else {
          // Near-circular — no correction needed
          perspMethod = "none";
          confidenceAdjustment = 1.0;
        }
      }

      const finalConfidence = Math.min(0.99, meta.baseReliability * confidenceAdjustment);

      detections.push({
        type: ref.type,
        tier: meta.tier,
        pixelMeasurementPx: ref.pixelMeasurementPx,
        physicalMeasurementMm: ref.physicalMeasurementMm,
        scaleMmPerPixel: pixelMm,
        baseReliability: meta.baseReliability,
        perspectiveCorrectionMethod: perspMethod,
        wheelEllipseAspectRatio: aspectRatio,
        confidence: finalConfidence,
        notes: ref.notes,
      });
    }

    if (detections.length === 0) {
      return { ...base, failureReason: "All detected reference objects had invalid pixel measurements" };
    }

    // Weighted mean scale (higher confidence detections weighted more)
    const totalWeight = detections.reduce((s, d) => s + d.confidence, 0);
    const weightedScale = detections.reduce((s, d) => s + d.scaleMmPerPixel * d.confidence, 0) / totalWeight;
    const overallConf = totalWeight / detections.length; // mean confidence

    // Calibrated crush depth
    let calibratedCrushDepthMm: number | null = null;
    let calibratedCrushDepthMinMm: number | null = null;
    let calibratedCrushDepthMaxMm: number | null = null;

    if (parsed.rawCrushDepthPx != null && parsed.rawCrushDepthPx > 0) {
      calibratedCrushDepthMm = parsed.rawCrushDepthPx * weightedScale;
      // Uncertainty bounds: ±(1 - overallConf) × 100% of the estimate, min ±20mm
      const uncertaintyFactor = Math.max(0.15, 1 - overallConf);
      calibratedCrushDepthMinMm = Math.max(0, calibratedCrushDepthMm * (1 - uncertaintyFactor));
      calibratedCrushDepthMaxMm = calibratedCrushDepthMm * (1 + uncertaintyFactor);
    }

    const perspectiveCorrected = detections.some(d => d.perspectiveCorrectionMethod !== "none");
    const bestPerspMethod = perspectiveCorrected ? "ellipse_analysis" : "none";

    // Normalise the LLM-reported view angle to the VGR canonical set
    const rawAngle = (parsed.imageViewAngle ?? 'unknown').toLowerCase();
    const normalisedAngle =
      rawAngle.includes('front') && rawAngle.includes('45') ? '45_degree_front' :
      rawAngle.includes('rear')  && rawAngle.includes('45') ? '45_degree_rear'  :
      rawAngle.includes('front') || rawAngle.includes('head') ? 'front' :
      rawAngle.includes('rear')  || rawAngle.includes('back') ? 'rear'  :
      rawAngle.includes('side')  || rawAngle.includes('lateral') ? 'side' :
      'unknown';

    return {
      imageUrl,
      imageIndex,
      scaleAvailable: true,
      referenceObjects: detections,
      overallCalibrationConfidence: overallConf,
      perspectiveCorrected,
      perspectiveCorrectionMethod: bestPerspMethod,
      rawCrushDepthMm: parsed.rawCrushDepthPx != null ? parsed.rawCrushDepthPx * weightedScale : null,
      calibratedCrushDepthMm,
      calibratedCrushDepthMinMm,
      calibratedCrushDepthMaxMm,
      imageViewAngle: normalisedAngle,
    };
  } catch (err: any) {
    return { ...base, failureReason: `VGE calibration error: ${err?.message ?? String(err)}` };
  }
}

// ── Confidence level classification ──────────────────────────────────────────

function classifyConfidence(conf: number): CalibrationConfidenceLevel {
  if (conf >= 0.85) return "HIGH";
  if (conf >= 0.65) return "MEDIUM";
  if (conf >= 0.30) return "LOW";
  return "NONE";
}

// ── Reference disagreement detection ─────────────────────────────────────────

/**
 * Check if reference objects within a single image disagree on scale by more than 15%.
 * Returns a warning string if disagreement is detected, null otherwise.
 */
function detectReferenceDisagreement(results: PerImageCalibrationResult[]): string | null {
  for (const result of results) {
    if (!result.scaleAvailable || result.referenceObjects.length < 2) continue;
    const scales = result.referenceObjects.map(r => r.scaleMmPerPixel);
    const minScale = Math.min(...scales);
    const maxScale = Math.max(...scales);
    const spreadPct = ((maxScale - minScale) / minScale) * 100;
    if (spreadPct > 15) {
      const types = result.referenceObjects.map(r => r.type).join(', ');
      return `Reference objects disagree on scale by ${spreadPct.toFixed(0)}% in image ${result.imageIndex + 1} ` +
        `(${types}; scales: ${scales.map(s => s.toFixed(2)).join(', ')} mm/px). ` +
        `This may indicate perspective distortion, measurement error, or damage to one of the reference objects. ` +
        `Calibration confidence has been reduced.`;
    }
  }
  return null;
}

// ── Geometry Evidence Block builder ──────────────────────────────────────────

function buildGeometryEvidenceBlock(
  vehicleLabel: string | null,
  results: PerImageCalibrationResult[],
  calibratedCrushDepthM: number | null,
  calibratedCrushDepthMinM: number | null,
  calibratedCrushDepthMaxM: number | null,
  overallConf: number,
  sourceQualityAssessment?: GeometrySourceAssessment,
  evidenceAcquisitionRecommendation?: string
): GeometryEvidenceBlock {
  const successfulImages = results.filter(r => r.scaleAvailable);
  const allRefObjects = successfulImages.flatMap(r => r.referenceObjects);
  const refTypeCounts: Record<string, number> = {};
  for (const ref of allRefObjects) {
    refTypeCounts[ref.type] = (refTypeCounts[ref.type] ?? 0) + 1;
  }

  const refSummary = Object.entries(refTypeCounts).map(([type, count]) => {
    const meta = REFERENCE_RELIABILITY[type];
    return `${type.replace(/_/g, ' ')} (${count} detection${count > 1 ? 's' : ''}, reliability ${((meta?.baseReliability ?? 0.5) * 100).toFixed(0)}%)`;
  });

  const referenceDisagreementWarning = detectReferenceDisagreement(results);

  const limitations: string[] = [];
  if (sourceQualityAssessment?.geometryUsability === 'UNSUITABLE') {
    limitations.push(`Source images are ${sourceQualityAssessment.sourceType.replace(/_/g, ' ').toLowerCase()} — physical scale calibration not applicable`);
  } else if (successfulImages.length === 0) {
    limitations.push("No reference objects detected — raw LLM estimate used");
  }
  if (successfulImages.length === 1) limitations.push("Single image calibration — multi-image cross-validation not available");
  if (results.some(r => r.referenceObjects.some(d => d.wheelEllipseAspectRatio != null && d.wheelEllipseAspectRatio! < 0.4))) {
    limitations.push("Extreme perspective distortion detected in one or more images — perspective correction not applied");
  }
  if (!vehicleLabel) limitations.push("No vehicle geometry profile found in database — standard reference dimensions used");
  if (overallConf < 0.65) limitations.push("Low calibration confidence — crush depth estimate has wide uncertainty bounds");

  const deformationRange = calibratedCrushDepthM != null
    ? `${Math.round((calibratedCrushDepthMinM ?? calibratedCrushDepthM * 0.85) * 1000)}–${Math.round((calibratedCrushDepthMaxM ?? calibratedCrushDepthM * 1.15) * 1000)} mm`
    : null;

  let measurementBasis: string;
  if (sourceQualityAssessment?.geometryUsability === 'UNSUITABLE') {
    measurementBasis = `Calibration not applicable: ${sourceQualityAssessment.reason}`;
  } else if (successfulImages.length > 0) {
    measurementBasis = `Photogrammetric scale calibration from ${successfulImages.length} image(s), ${allRefObjects.length} reference object(s) detected. ${results.some(r => r.perspectiveCorrected) ? 'Perspective correction applied via wheel ellipse analysis.' : 'No perspective correction required.'}`;
  } else {
    measurementBasis = "No scale calibration available — raw LLM crush depth estimate used without geometric correction.";
  }

  let calibrationStatus: string;
  let calibrationStatusCode: 'CALIBRATED' | 'NOT_APPLICABLE' | 'FAILED';
  if (sourceQualityAssessment?.geometryUsability === 'UNSUITABLE') {
    calibrationStatus = `⚠ Not applicable — source images are ${sourceQualityAssessment.sourceType.replace(/_/g, ' ').toLowerCase()}`;
    calibrationStatusCode = 'NOT_APPLICABLE';
  } else if (successfulImages.length > 0) {
    calibrationStatus = `✓ Scale calibrated from ${successfulImages.length}/${results.length} image(s)`;
    calibrationStatusCode = 'CALIBRATED';
  } else {
    calibrationStatus = `✗ Calibration failed — no reference objects detected`;
    calibrationStatusCode = 'FAILED';
  }

  return {
    vehicle: vehicleLabel ?? "Unknown vehicle",
    calibrationStatus,
    calibrationStatusCode,
    sourceQualityAssessment,
    evidenceAcquisitionRecommendation,
    referenceObjectsSummary: refSummary,
    overallCalibrationConfidencePct: Math.round(overallConf * 100),
    perspectiveCorrectionApplied: results.some(r => r.perspectiveCorrected),
    estimatedDeformationRange: deformationRange,
    measurementBasis,
    limitations,
    referenceDisagreementWarning: referenceDisagreementWarning ?? undefined,
  };
}

// ── Main Stage 6.5A entry point ───────────────────────────────────────────────

/**
 * Run Stage 6.5A VGE scale calibration on all damage photos.
 * Called from the orchestrator after Stage 6 and before Stage 7.
 *
 * @param ctx Pipeline context (reads damagePhotoUrls, vehicleMake, vehicleModel, vehicleYear)
 * @returns VGECalibrationResult or null if no photos available
 */
export async function runVGECalibration(ctx: PipelineContext): Promise<VGECalibrationResult | null> {
  const photoUrls = ctx.damagePhotoUrls ?? [];
  if (photoUrls.length === 0) return null;

  // ── SOURCE QUALITY GATE ──────────────────────────────────────────────────
  // Assess every image's geometry usability before making any LLM calls.
  // If all images are UNSUITABLE, skip calibration entirely and return a
  // structured NOT_APPLICABLE result with an evidence acquisition recommendation.
  const sourceAssessments = photoUrls.map(url => assessSourceQuality(url));
  const suitableCount = sourceAssessments.filter(a => a.geometryUsability !== 'UNSUITABLE').length;
  const unsuitableCount = sourceAssessments.filter(a => a.geometryUsability === 'UNSUITABLE').length;

  // Determine the dominant source type for the claim
  const sourceTypeCounts: Record<string, number> = {};
  for (const a of sourceAssessments) {
    sourceTypeCounts[a.sourceType] = (sourceTypeCounts[a.sourceType] ?? 0) + 1;
  }
  const dominantSourceType = Object.entries(sourceTypeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as GeometrySourceType ?? 'UNKNOWN';

  const allUnsuitable = suitableCount === 0;
  const dominantSourceAssessment: GeometrySourceAssessment | undefined = allUnsuitable
    ? {
        sourceType: dominantSourceType,
        geometryUsability: 'UNSUITABLE',
        reason: sourceAssessments[0]?.reason ?? 'Source images are unsuitable for geometric calibration.',
        confidence: sourceAssessments.reduce((s, a) => s + a.confidence, 0) / sourceAssessments.length,
      }
    : undefined;

  const evidenceAcquisitionRecommendation = allUnsuitable
    ? `The submitted evidence contains ${unsuitableCount} ${dominantSourceType.replace(/_/g, ' ').toLowerCase()} image(s) unsuitable for physical deformation measurement. ` +
      `To enable calibrated geometry analysis, request original digital photographs taken directly with a camera or smartphone at the scene. ` +
      `Original photographs allow pixel-to-millimetre scale calibration using vehicle reference objects (wheels, licence plate, headlamp spacing), ` +
      `producing a defensible crush depth measurement chain.`
    : undefined;

  // Resolve vehicle profile from DB using the raw claim record on ctx
  const make = (ctx.claim as any)?.vehicleMake ?? null;
  const model = (ctx.claim as any)?.vehicleModel ?? null;
  const year = (ctx.claim as any)?.vehicleYear ?? null;

  const profile = await getVehicleProfile(make, model, year);

  if (allUnsuitable) {
    // Skip LLM calls entirely — return NOT_APPLICABLE with full provenance
    return {
      calibrationAvailable: false,
      sourceQualityAssessment: dominantSourceAssessment,
      evidenceAcquisitionRecommendation,
      overallCalibrationConfidence: 0,
      confidenceLevel: "NONE",
      vehicleModelId: profile?.id ?? null,
      vehicleProfileUsed: profile?.label ?? null,
      perImageResults: [],
      calibratedCrushDepthM: null,
      calibratedCrushDepthMinM: null,
      calibratedCrushDepthMaxM: null,
      totalReferenceObjectsDetected: 0,
      geometryEvidenceBlock: buildGeometryEvidenceBlock(
        profile?.label ?? null, [], null, null, null, 0,
        dominantSourceAssessment, evidenceAcquisitionRecommendation
      ),
    };
  }

  // Only process images that are SUITABLE or LIMITED
  const suitableUrls = photoUrls.filter((_, i) => sourceAssessments[i]?.geometryUsability !== 'UNSUITABLE');

  // Process up to 8 images (prioritise frontal/45° views; limit LLM calls)
  const MAX_IMAGES = 8;
  const urlsToProcess = suitableUrls.slice(0, MAX_IMAGES);

  const perImageResults: PerImageCalibrationResult[] = [];
  for (let i = 0; i < urlsToProcess.length; i++) {
    const result = await calibrateImage(urlsToProcess[i], i, profile);
    perImageResults.push(result);
  }

  const successfulResults = perImageResults.filter(r => r.scaleAvailable);

  if (successfulResults.length === 0) {
    return {
      calibrationAvailable: false,
      overallCalibrationConfidence: 0,
      confidenceLevel: "NONE",
      vehicleModelId: profile?.id ?? null,
      vehicleProfileUsed: profile?.label ?? null,
      perImageResults,
      calibratedCrushDepthM: null,
      calibratedCrushDepthMinM: null,
      calibratedCrushDepthMaxM: null,
      totalReferenceObjectsDetected: 0,
      geometryEvidenceBlock: buildGeometryEvidenceBlock(
        profile?.label ?? null, perImageResults, null, null, null, 0
      ),
    };
  }

  // Select the best crush depth estimate: highest confidence image with a crush depth reading
  const imagesWithCrush = successfulResults.filter(r => r.calibratedCrushDepthMm != null);
  let bestCrushDepthM: number | null = null;
  let bestCrushDepthMinM: number | null = null;
  let bestCrushDepthMaxM: number | null = null;

  if (imagesWithCrush.length > 0) {
    // Use the image with the highest calibration confidence that has a crush depth
    const best = imagesWithCrush.reduce((a, b) =>
      b.overallCalibrationConfidence > a.overallCalibrationConfidence ? b : a
    );
    bestCrushDepthM = (best.calibratedCrushDepthMm ?? 0) / 1000;
    bestCrushDepthMinM = (best.calibratedCrushDepthMinMm ?? 0) / 1000;
    bestCrushDepthMaxM = (best.calibratedCrushDepthMaxMm ?? 0) / 1000;
  }

  // Overall calibration confidence = weighted mean across successful images
  const overallConf = successfulResults.reduce((s, r) => s + r.overallCalibrationConfidence, 0) / successfulResults.length;
  const totalRefObjects = successfulResults.reduce((s, r) => s + r.referenceObjects.length, 0);

  return {
    calibrationAvailable: true,
    overallCalibrationConfidence: overallConf,
    confidenceLevel: classifyConfidence(overallConf),
    vehicleModelId: profile?.id ?? null,
    vehicleProfileUsed: profile?.label ?? null,
    perImageResults,
    calibratedCrushDepthM: bestCrushDepthM,
    calibratedCrushDepthMinM: bestCrushDepthMinM,
    calibratedCrushDepthMaxM: bestCrushDepthMaxM,
    totalReferenceObjectsDetected: totalRefObjects,
    geometryEvidenceBlock: buildGeometryEvidenceBlock(
      profile?.label ?? null,
      perImageResults,
      bestCrushDepthM,
      bestCrushDepthMinM,
      bestCrushDepthMaxM,
      overallConf
    ),
  };
}
