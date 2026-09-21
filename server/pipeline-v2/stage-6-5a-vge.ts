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
import {
  calibrateDeformationMeasurement,
  type DeformationCalibrationResult,
  type ReferenceDimensionMeasurement,
} from "./deformationCalibration";
import type { PipelineContext } from "./types";
import mysql from "mysql2/promise";

// ── Output types ──────────────────────────────────────────────────────────────

export type PerspectiveCorrectionMethod = "none" | "ellipse_analysis" | "homography";
export type CalibrationConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface ReferenceObjectDetection {
  type: string;                    // e.g. "wheel", "licence_plate", "headlamp_spacing"
  tier: 1 | 2 | 3;
  pixelMeasurementPx: number;
  /** The exact vehicle-geometry measurement used as physical scale authority. */
  vehicleMeasurementType: string;
  /** Only manufacturer/engineer stored profile values may set physical scale. */
  physicalMeasurementSource: "VEHICLE_PROFILE";
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
  /** Deterministic per-image calibration decision. Never silently averages disagreement. */
  calibrationDecision?: DeformationCalibrationResult["status"];
  calibrationReasons?: string[];
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

/**
 * Returns true only for a single-image VGE measurement that may enter the
 * Stage 7 calibrated-geometry boundary. This is deliberately stricter than
 * display availability: LOW/NONE confidence results remain descriptive only.
 */
export function isQualifiedVgeCalibratedGeometry(
  result: VGECalibrationResult | null | undefined
): result is VGECalibrationResult & { calibratedCrushDepthM: number } {
  return Boolean(
    result?.calibrationAvailable &&
      Number.isFinite(result.calibratedCrushDepthM) &&
      result.calibratedCrushDepthM! > 0 &&
      (result.confidenceLevel === "HIGH" || result.confidenceLevel === "MEDIUM")
  );
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
  // ── Tier 1: universal (visible from any angle) ────────────────────────────
  wheel:             { tier: 1, baseReliability: 0.95 },
  licence_plate:     { tier: 1, baseReliability: 0.85 },
  // ── Tier 2: front-view specific ──────────────────────────────────────────
  headlamp_spacing:  { tier: 2, baseReliability: 0.75 },
  grille_width:      { tier: 2, baseReliability: 0.72 },
  bonnet_width:      { tier: 2, baseReliability: 0.80 },
  windscreen_width:  { tier: 2, baseReliability: 0.78 },
  // ── Tier 2: rear-view specific ───────────────────────────────────────────
  // rear_track_width: centre-to-centre rear wheel spacing — reliable for rear photos
  rear_track_width:  { tier: 2, baseReliability: 0.78 },
  // overall_width: outer body width — visible from rear or front
  overall_width:     { tier: 2, baseReliability: 0.70 },
  // ── Tier 2: side-view specific ───────────────────────────────────────────
  // overall_height: ground to roof — reliable for side photos
  overall_height:    { tier: 2, baseReliability: 0.72 },
  // ── Tier 3: supporting only ───────────────────────────────────────────────
  badge:             { tier: 3, baseReliability: 0.40 },
  door_handle:       { tier: 3, baseReliability: 0.35 },
};

/**
 * The LLM may nominate only a visible reference *type*. It never supplies the
 * physical size used for scale. This allow-list binds that nomination to one
 * manufacturer/engineer value stored on the resolved vehicle profile.
 */
const PROFILE_REFERENCE_BINDINGS: Record<string, {
  measurementTypes: string[];
  independenceGroup: string;
}> = {
  wheel: { measurementTypes: ["wheel_diameter_mm", "wheel_diameter_alt_mm"], independenceGroup: "wheel" },
  // The LLM contract defines this span as plate width; height is not an
  // interchangeable scale reference and is intentionally not a fallback.
  licence_plate: { measurementTypes: ["licence_plate_width_mm"], independenceGroup: "licence_plate" },
  headlamp_spacing: { measurementTypes: ["headlamp_spacing_mm"], independenceGroup: "headlamp_spacing" },
  grille_width: { measurementTypes: ["grille_width_mm"], independenceGroup: "grille_width" },
  bonnet_width: { measurementTypes: ["bonnet_width_mm"], independenceGroup: "bonnet_width" },
  rear_track_width: { measurementTypes: ["rear_track_mm"], independenceGroup: "rear_track_width" },
  overall_width: { measurementTypes: ["overall_width_mm"], independenceGroup: "overall_width" },
  overall_height: { measurementTypes: ["overall_height_mm"], independenceGroup: "overall_height" },
  windscreen_width: { measurementTypes: ["windscreen_width_mm"], independenceGroup: "windscreen_width" },
};

/** Explicitly minimal LLM output accepted for reference candidates. */
export interface LlmReferenceCandidate {
  type: string;
  pixelMeasurementPx: number;
  isUndamaged: boolean;
  wheelEllipseAspectRatio?: number;
  perspectiveCorrectionApplicable?: boolean;
  notes?: string;
}

export interface BoundReferenceCalibration {
  detections: ReferenceObjectDetection[];
  calibration: DeformationCalibrationResult;
  overallCalibrationConfidence: number;
  perspectiveCorrected: boolean;
  perspectiveCorrectionMethod: PerspectiveCorrectionMethod;
}

function resolveStoredProfileMeasurement(
  referenceType: string,
  measurements: Record<string, number>,
): { measurementType: string; physicalMeasurementMm: number; independenceGroup: string } | null {
  const binding = PROFILE_REFERENCE_BINDINGS[referenceType];
  if (!binding) return null;

  // `collapseStoredProfileMeasurements` represents duplicate raw database rows
  // as NaN. An alternate measurement must never mask that ambiguity: the whole
  // nominated reference type is unavailable until its stored fitment data is
  // reconciled.
  const hasAmbiguousBoundMeasurement = binding.measurementTypes.some(
    (measurementType) =>
      Object.hasOwn(measurements, measurementType) &&
      !Number.isFinite(measurements[measurementType])
  );
  if (hasAmbiguousBoundMeasurement) return null;

  const eligibleMeasurements = binding.measurementTypes
    .map((measurementType) => ({ measurementType, value: measurements[measurementType] }))
    .filter((measurement): measurement is { measurementType: string; value: number } =>
      Number.isFinite(measurement.value) && measurement.value > 0
    );

  // The selected profile must resolve to exactly one stored physical value.
  // A duplicate/alternate fitment is a profile ambiguity, not a reason to
  // choose the first value or silently average it.
  if (eligibleMeasurements.length !== 1) return null;
  const measurement = eligibleMeasurements[0];
  return {
    measurementType: measurement.measurementType,
    physicalMeasurementMm: measurement.value,
    independenceGroup: binding.independenceGroup,
  };
}

/** Bind LLM pixel spans to stored vehicle dimensions; LLM physical sizes are never accepted. */
export function bindKnownVehicleReferenceCalibration(input: {
  rawCrushDepthPx: number;
  candidates: LlmReferenceCandidate[];
  profileMeasurements: Record<string, number>;
  agreementToleranceFraction: number;
}): BoundReferenceCalibration {
  const detections: ReferenceObjectDetection[] = [];
  const references: ReferenceDimensionMeasurement[] = [];

  for (const [index, candidate] of input.candidates.entries()) {
    const type = typeof candidate.type === "string" ? candidate.type.trim().toLowerCase() : "";
    const metadata = REFERENCE_RELIABILITY[type];
    const boundMeasurement = resolveStoredProfileMeasurement(type, input.profileMeasurements);
    const pixelMeasurementPx = Number(candidate.pixelMeasurementPx);
    if (!metadata || !boundMeasurement || !Number.isFinite(pixelMeasurementPx) || pixelMeasurementPx <= 0) continue;

    const aspectRatio = Number(candidate.wheelEllipseAspectRatio);
    let perspectiveCorrectionMethod: PerspectiveCorrectionMethod = "none";
    let confidenceAdjustment = 1;
    if (type === "wheel" && Number.isFinite(aspectRatio)) {
      if (aspectRatio < 0.4) confidenceAdjustment = 0.5;
      else if (aspectRatio < 0.95 && candidate.perspectiveCorrectionApplicable === true) {
        perspectiveCorrectionMethod = "ellipse_analysis";
        confidenceAdjustment = 0.85 + (aspectRatio - 0.4) * 0.25;
      }
    }
    const confidence = Math.min(0.99, metadata.baseReliability * confidenceAdjustment);
    const referenceId = `${boundMeasurement.measurementType}:${index}`;
    detections.push({
      type,
      tier: metadata.tier,
      pixelMeasurementPx,
      vehicleMeasurementType: boundMeasurement.measurementType,
      physicalMeasurementSource: "VEHICLE_PROFILE",
      physicalMeasurementMm: boundMeasurement.physicalMeasurementMm,
      scaleMmPerPixel: boundMeasurement.physicalMeasurementMm / pixelMeasurementPx,
      baseReliability: metadata.baseReliability,
      perspectiveCorrectionMethod,
      wheelEllipseAspectRatio: Number.isFinite(aspectRatio) ? aspectRatio : undefined,
      confidence,
      notes: candidate.notes,
    });
    references.push({
      referenceId,
      label: type.replace(/_/g, " "),
      independenceGroup: boundMeasurement.independenceGroup,
      isUndamaged: candidate.isUndamaged === true,
      trueValue: boundMeasurement.physicalMeasurementMm,
      measuredValue: pixelMeasurementPx,
      unit: "mm",
    });
  }

  const calibration = calibrateDeformationMeasurement({
    rawMeasuredValue: input.rawCrushDepthPx,
    rawUnit: "px",
    referenceDimensions: references,
    agreementToleranceFraction: input.agreementToleranceFraction,
  });
  const overallCalibrationConfidence = detections.length === 0 ? 0 : detections.reduce((sum, detection) => sum + detection.confidence, 0) / detections.length;
  const perspectiveCorrected = detections.some((detection) => detection.perspectiveCorrectionMethod !== "none");
  return {
    detections,
    calibration,
    overallCalibrationConfidence,
    perspectiveCorrected,
    perspectiveCorrectionMethod: perspectiveCorrected ? "ellipse_analysis" : "none",
  };
}

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

/**
 * Preserve duplicate database rows as an explicit unusable value. A record map
 * cannot otherwise distinguish a legitimate stored dimension from a later row
 * that silently overwrote it. The binding layer rejects non-finite values.
 */
export function collapseStoredProfileMeasurements(
  rows: Array<{ measurement_type: string; value_mm: unknown }>
): Record<string, number> {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const measurementType = typeof row.measurement_type === "string" ? row.measurement_type : "";
    if (!measurementType) continue;
    const values = grouped.get(measurementType) ?? [];
    values.push(Number(row.value_mm));
    grouped.set(measurementType, values);
  }

  const measurements: Record<string, number> = {};
  for (const [measurementType, values] of grouped) {
    // A selected scale type must map to exactly one physical row. This rejects
    // duplicated measurements even when their numeric values happen to agree:
    // row identity and fitment provenance remain ambiguous.
    measurements[measurementType] = values.length === 1 ? values[0] : Number.NaN;
  }
  return measurements;
}

/** A make/model/year query must identify one profile; ties are unavailable. */
export function selectUnambiguousVehicleProfile<T>(rows: T[]): T | null {
  return rows.length === 1 ? rows[0] : null;
}

async function fetchMeasurements(
  conn: mysql.Connection,
  vehicleModelId: number
): Promise<Record<string, number>> {
  const [measRows] = await conn.execute<any[]>(
    `SELECT measurement_type, value_mm FROM vehicle_geometry_measurements WHERE vehicle_model_id = ?`,
    [vehicleModelId]
  );
  return collapseStoredProfileMeasurements(measRows as Array<{ measurement_type: string; value_mm: unknown }>);
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

    // ── Pass 1: standard LIKE match ─────────────────────────────────────────
    // Do not let completeness rank resolve a vehicle variant ambiguity. The
    // claimant-provided make/model/year must identify exactly one profile.
    const [rows] = await conn.execute<any[]>(
      `SELECT id, manufacturer, model, variant, year_from, year_to
       FROM vehicle_models
       WHERE LOWER(manufacturer) LIKE LOWER(?) AND LOWER(model) LIKE LOWER(?)
         AND year_from <= ? AND (year_to IS NULL OR year_to >= ?)
       ORDER BY completeness_score DESC, id ASC`,
      [`%${make}%`, `%${model}%`, yearFilter, yearFilter]
    );

    const exactProfile = selectUnambiguousVehicleProfile(rows as any[]);
    if (exactProfile) {
      const vm = exactProfile;
      const label = `${vm.manufacturer} ${vm.model}${vm.variant ? ' ' + vm.variant : ''} ${vm.year_from}–${vm.year_to ?? 'present'}`;
      const measurements = await fetchMeasurements(conn, vm.id);
      return { id: vm.id, label, measurements };
    }

    // More than one profile is an unresolved trim/fitment ambiguity. Do not
    // broaden to fuzzy matching or choose the highest completeness score.
    if ((rows as any[]).length > 1) return null;

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
    const fuzzyMatches = (allRows as any[]).filter(r =>
      normaliseVehicleString(r.manufacturer).includes(normMake) &&
      (
        normaliseVehicleString(r.model).includes(normModel) ||
        normModel.includes(normaliseVehicleString(r.model))
      )
    );

    const vm = selectUnambiguousVehicleProfile(fuzzyMatches);
    if (!vm) return null;
    const label = `${vm.manufacturer} ${vm.model}${vm.variant ? ' ' + vm.variant : ''} ${vm.year_from}–${vm.year_to ?? 'present'}`;
    const measurements = await fetchMeasurements(conn, vm.id);
    return { id: vm.id, label, measurements };

  } catch {
    return null;
  } finally {
    await conn?.end();
  }
}

// ── LLM vision prompt for reference object detection ─────────────────────────

/**
 * Build a direction-aware calibration prompt.
 *
 * Reference objects are zone-indexed:
 *   FRONT view: wheel, licence_plate, headlamp_spacing, grille_width, bonnet_width
 *   REAR view:  wheel, licence_plate, rear_track_width, overall_width
 *   SIDE view:  wheel, licence_plate, overall_height, windscreen_width
 *   UNKNOWN:    all of the above — LLM picks what is visible
 *
 * Crush depth language is direction-neutral:
 *   "maximum visible deformation depth from the undamaged panel face to the deepest
 *    point of crush, measured perpendicular to the original panel surface"
 */
function buildCalibrationPrompt(profile: { label: string; measurements: Record<string, number> } | null): string {
  // Available profile types guide visual nomination only. Physical values remain
  // server-side and are bound by PROFILE_REFERENCE_BINDINGS after parsing.
  const FRONT_KEYS  = ['wheel_diameter_mm', 'wheel_diameter_alt_mm', 'licence_plate_width_mm', 'headlamp_spacing_mm', 'grille_width_mm', 'bonnet_width_mm', 'overall_width_mm'];
  const REAR_KEYS   = ['wheel_diameter_mm', 'wheel_diameter_alt_mm', 'licence_plate_width_mm', 'rear_track_mm', 'overall_width_mm'];
  const SIDE_KEYS   = ['wheel_diameter_mm', 'wheel_diameter_alt_mm', 'licence_plate_width_mm', 'overall_height_mm', 'windscreen_width_mm'];
  const ALL_KEYS    = Array.from(new Set([...FRONT_KEYS, ...REAR_KEYS, ...SIDE_KEYS]));

  const profileSection = profile
    ? `Vehicle reference profile: ${profile.label}
Known reference types available for server-side binding:
${Object.entries(profile.measurements)
  .filter(([k]) => ALL_KEYS.includes(k))
  .map(([k]) => `  - ${k}`)
  .join('\n')}`
    : `No vehicle reference profile is available. Do not nominate a scale reference.`;

  return `You are a vehicle accident reconstruction specialist performing photogrammetric scale calibration.

${profileSection}

STEP 1 — Determine the view angle:
First, identify whether this image shows the FRONT, REAR, SIDE, or a 45-degree angle of the vehicle.
This determines which reference objects are visible and which profile dimensions to use.

STEP 2 — Detect ALL visible reference objects:
For each reference object detected, return:
1. type: one of:
   - "wheel"              (Tier 1 — visible from any angle; use wheel_diameter_mm)
   - "licence_plate"      (Tier 1 — visible from front or rear; use licence_plate_width_mm)
   - "headlamp_spacing"   (Tier 2 — FRONT view only; centre-to-centre distance between headlamps; use headlamp_spacing_mm)
   - "grille_width"       (Tier 2 — FRONT view only; use grille_width_mm)
   - "bonnet_width"       (Tier 2 — FRONT view only; use bonnet_width_mm)
   - "rear_track_width"   (Tier 2 — REAR view only; centre-to-centre distance between rear wheels; use rear_track_mm)
   - "overall_width"      (Tier 2 — REAR or FRONT view; outer edge to outer edge of body; use overall_width_mm)
   - "overall_height"     (Tier 2 — SIDE view only; ground to roof; use overall_height_mm)
   - "windscreen_width"   (Tier 2 — FRONT or SIDE view; use windscreen_width_mm)
   DO NOT use headlamp_spacing, grille_width, or bonnet_width for REAR or SIDE photos — these features are not visible.
   DO NOT use rear_track_width for FRONT photos.
2. pixelMeasurementPx: the measured dimension in pixels (diameter for wheel; width for licence plate, lamps, grille, bonnet, windscreen, and body references; height only for overall_height)
3. isUndamaged: true ONLY if the complete nominated reference is visibly outside the damaged area; otherwise false
4. wheelEllipseAspectRatio: ONLY for wheels — ratio of minor to major axis (1.0 = perfect circle, <0.4 = extreme perspective)
5. perspectiveCorrectionApplicable: true if wheel aspect ratio is 0.4–0.95 (moderate perspective, correctable)
6. notes: any relevant observation (occlusion, damage to reference object, etc.)

Do NOT return, infer, or estimate any physical millimetre dimension. The server binds an accepted type to the stored vehicle profile and rejects unbound nominations.

STEP 3 — Estimate crush depth:
7. rawCrushDepthPx: the maximum visible deformation depth in pixels — measured from the undamaged panel face (or its projected continuation) to the deepest point of crush, perpendicular to the original panel surface. This applies equally to frontal, rear, and side impacts. Return null if the deformation is not measurable from this view angle.
8. collisionDirection: "frontal", "rear", "side", or "unknown" — based on where the damage is located
9. imageViewAngle: "front", "rear", "side", "45_degree_front", "45_degree_rear", or "unknown"

Return ONLY valid JSON in this exact format:
{
  "referenceObjects": [
    {
      "type": "wheel",
      "pixelMeasurementPx": 220,
      "isUndamaged": true,
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

    const rawCrushDepthPx = Number(parsed.rawCrushDepthPx);
    if (!profile) {
      return { ...base, failureReason: "No resolved vehicle profile with stored reference measurements; calibrated crush depth is unavailable" };
    }
    if (!Number.isFinite(rawCrushDepthPx) || rawCrushDepthPx <= 0) {
      return { ...base, failureReason: "Visible crush depth was not measurable in pixels; calibrated crush depth is unavailable" };
    }
    const bound = bindKnownVehicleReferenceCalibration({
      rawCrushDepthPx,
      candidates: refObjects as LlmReferenceCandidate[],
      profileMeasurements: profile.measurements,
      agreementToleranceFraction: 0.15,
    });
    if (bound.detections.length === 0) {
      return {
        ...base,
        calibrationDecision: bound.calibration.status,
        calibrationReasons: bound.calibration.reasons,
        failureReason: "No LLM-nominated reference could be bound to a stored vehicle-profile measurement",
      };
    }

    // Normalise the LLM-reported view angle to the VGR canonical set
    const rawAngle = (parsed.imageViewAngle ?? 'unknown').toLowerCase();
    const normalisedAngle =
      rawAngle.includes('front') && rawAngle.includes('45') ? '45_degree_front' :
      rawAngle.includes('rear')  && rawAngle.includes('45') ? '45_degree_rear'  :
      rawAngle.includes('front') || rawAngle.includes('head') ? 'front' :
      rawAngle.includes('rear')  || rawAngle.includes('back') ? 'rear'  :
      rawAngle.includes('side')  || rawAngle.includes('lateral') ? 'side' :
      'unknown';

    const isCalibrated = bound.calibration.status === "CALIBRATED";
    const correctedCrushDepthMm = isCalibrated ? bound.calibration.correctedValue : null;
    const uncertaintyFactor = Math.max(0.15, 1 - bound.overallCalibrationConfidence);
    const calibrationFailureReason = isCalibrated ? undefined : bound.calibration.reasons.join(" ");

    return {
      imageUrl,
      imageIndex,
      scaleAvailable: isCalibrated,
      referenceObjects: bound.detections,
      overallCalibrationConfidence: isCalibrated ? bound.overallCalibrationConfidence : 0,
      perspectiveCorrected: bound.perspectiveCorrected,
      perspectiveCorrectionMethod: bound.perspectiveCorrectionMethod,
      rawCrushDepthMm: null,
      calibratedCrushDepthMm: correctedCrushDepthMm,
      calibratedCrushDepthMinMm: correctedCrushDepthMm == null ? null : Math.max(0, correctedCrushDepthMm * (1 - uncertaintyFactor)),
      calibratedCrushDepthMaxMm: correctedCrushDepthMm == null ? null : correctedCrushDepthMm * (1 + uncertaintyFactor),
      imageViewAngle: normalisedAngle,
      calibrationDecision: bound.calibration.status,
      calibrationReasons: bound.calibration.reasons,
      failureReason: calibrationFailureReason,
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
