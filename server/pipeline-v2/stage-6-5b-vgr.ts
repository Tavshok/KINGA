/**
 * pipeline-v2/stage-6-5b-vgr.ts
 *
 * STAGE 6.5B — VISION GEOMETRY RECONCILIATION (VGR)
 *
 * Cross-image geometric reconciliation engine. Takes the per-image calibration
 * results from Stage 6.5A and produces a single, defensible consensus crush
 * depth estimate by:
 *
 *   1. Grouping images by estimated view angle (FRONTAL, ANGLE_45, SIDE, UNKNOWN)
 *   2. Applying view-angle-appropriate confidence weights:
 *        FRONTAL  → 1.00 (primary measurement plane)
 *        ANGLE_45 → 0.70 (useful cross-validation, partial foreshortening)
 *        SIDE     → 0.40 (lateral crush only, not frontal depth)
 *        UNKNOWN  → 0.50 (conservative)
 *   3. Computing a weighted consensus crush depth across all contributing images
 *   4. Flagging when images disagree beyond their individual uncertainty bounds
 *   5. Raising the overall confidence when images agree (convergence bonus)
 *      and lowering it when they conflict (divergence penalty)
 *   6. Producing a structured VGRConsensusResult for Stage 7 and the report
 *
 * VVCS Convention (inherited from Stage 6.5A):
 *   Origin: front axle centreline at ground level
 *   X: positive forward, Y: positive left, Z: positive up
 *   All coordinates in millimetres.
 *
 * NEVER halts the pipeline — all errors return null, Stage 7 falls back to
 * the best single-image result from Stage 6.5A.
 */

import type { PerImageCalibrationResult, CalibrationConfidenceLevel } from './stage-6-5a-vge';

// ── Output types ──────────────────────────────────────────────────────────────

export type ViewAngle = "FRONTAL" | "ANGLE_45" | "SIDE" | "UNKNOWN";

export interface ReconciliationImageEntry {
  imageUrl: string;
  imageIndex: number;
  viewAngle: ViewAngle;
  viewAngleWeight: number;
  calibratedCrushDepthMm: number;
  calibratedCrushDepthMinMm: number;
  calibratedCrushDepthMaxMm: number;
  calibrationConfidence: number;
  effectiveWeight: number;  // viewAngleWeight × calibrationConfidence
  contributesToConsensus: boolean;
  exclusionReason?: string;
}

export interface CrossImageAgreementAssessment {
  /** Number of images contributing to the consensus */
  contributingImages: number;
  /** Spread between max and min crush depth estimates (mm) */
  spreadMm: number;
  /** Spread as a percentage of the consensus estimate */
  spreadPct: number;
  /** Whether images agree within their combined uncertainty bounds */
  withinUncertaintyBounds: boolean;
  /** Convergence bonus applied to overall confidence (positive = images agree) */
  convergenceAdjustment: number;
  /** Human-readable agreement assessment */
  agreementLevel: "STRONG" | "MODERATE" | "WEAK" | "CONFLICTING";
  /** Populated when images conflict significantly */
  conflictDescription?: string;
}

export interface VGRConsensusResult {
  /** True if reconciliation produced a usable consensus */
  reconciliationAvailable: boolean;
  /** Consensus crush depth (metres) — replaces Stage 6.5A single-best-image estimate */
  consensusCrushDepthM: number | null;
  consensusCrushDepthMinM: number | null;
  consensusCrushDepthMaxM: number | null;
  /** Overall confidence after convergence/divergence adjustment */
  overallConfidence: number;
  confidenceLevel: CalibrationConfidenceLevel;
  /** View-angle breakdown */
  frontalImages: number;
  angle45Images: number;
  sideImages: number;
  unknownAngleImages: number;
  /** Per-image reconciliation entries */
  imageEntries: ReconciliationImageEntry[];
  /** Cross-image agreement assessment */
  agreementAssessment: CrossImageAgreementAssessment;
  /** Failure reason if reconciliation was not possible */
  failureReason?: string;
}

// ── View angle weights ────────────────────────────────────────────────────────

const VIEW_ANGLE_WEIGHTS: Record<ViewAngle, number> = {
  FRONTAL:  1.00,
  ANGLE_45: 0.70,
  SIDE:     0.40,
  UNKNOWN:  0.50,
};

// ── View angle inference from LLM-provided image metadata ────────────────────

/**
 * Resolve the view angle for a calibrated image.
 *
 * Priority order:
 *   1. LLM-reported imageViewAngle from Stage 6.5A (most accurate — the model
 *      directly observed the photo and classified the angle).
 *   2. URL/filename heuristics (fallback for older results or failed VGE runs).
 *
 * The imageViewAngle field was added to PerImageCalibrationResult in the
 * Jul 2026 physics accuracy upgrade. Results from before that date will have
 * imageViewAngle=undefined and will fall through to the filename heuristic.
 */
function inferViewAngle(imageUrl: string, llmReportedAngle?: string): ViewAngle {
  // 1. Use LLM-reported angle when available
  if (llmReportedAngle && llmReportedAngle !== 'unknown') {
    const a = llmReportedAngle.toLowerCase();
    if (a === 'front' || a === 'frontal' || a === 'head_on') return 'FRONTAL';
    if (a === 'rear'  || a === 'back')                       return 'FRONTAL'; // rear crush = frontal geometry plane
    if (a === '45_degree_front' || a === '45_degree_rear')   return 'ANGLE_45';
    if (a === 'side'  || a === 'lateral')                    return 'SIDE';
  }

  // 2. Filename heuristics (fallback)
  const lower = imageUrl.toLowerCase();
  const filename = lower.split('/').pop() ?? lower;
  if (/front|frontal|head.?on|forward/.test(filename)) return 'FRONTAL';
  if (/side|lateral|profile/.test(filename))           return 'SIDE';
  if (/angle|45|quarter|three.?quarter/.test(filename)) return 'ANGLE_45';
  if (/page-\d{3,}/.test(filename))                    return 'UNKNOWN';

  return 'UNKNOWN';
}

// ── Confidence level classification ──────────────────────────────────────────

function classifyConfidence(conf: number): CalibrationConfidenceLevel {
  if (conf >= 0.85) return "HIGH";
  if (conf >= 0.65) return "MEDIUM";
  if (conf >= 0.30) return "LOW";
  return "NONE";
}

// ── Agreement assessment ──────────────────────────────────────────────────────

function assessCrossImageAgreement(
  entries: ReconciliationImageEntry[],
  consensusMm: number
): CrossImageAgreementAssessment {
  const contributing = entries.filter(e => e.contributesToConsensus);
  if (contributing.length < 2) {
    return {
      contributingImages: contributing.length,
      spreadMm: 0,
      spreadPct: 0,
      withinUncertaintyBounds: true,
      convergenceAdjustment: 0,
      agreementLevel: "STRONG",
    };
  }

  const depths = contributing.map(e => e.calibratedCrushDepthMm);
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  const spreadMm = maxDepth - minDepth;
  const spreadPct = consensusMm > 0 ? (spreadMm / consensusMm) * 100 : 0;

  // Check if each image's estimate overlaps with the consensus within its uncertainty bounds
  const allWithinBounds = contributing.every(e =>
    e.calibratedCrushDepthMinMm <= consensusMm && e.calibratedCrushDepthMaxMm >= consensusMm
  );

  // Convergence adjustment: bonus when spread < 15%, penalty when spread > 35%
  let convergenceAdjustment = 0;
  let agreementLevel: CrossImageAgreementAssessment['agreementLevel'];
  let conflictDescription: string | undefined;

  if (spreadPct < 10) {
    convergenceAdjustment = +0.10;  // Strong agreement bonus
    agreementLevel = "STRONG";
  } else if (spreadPct < 20) {
    convergenceAdjustment = +0.05;  // Moderate agreement bonus
    agreementLevel = "MODERATE";
  } else if (spreadPct < 35) {
    convergenceAdjustment = -0.05;  // Mild disagreement penalty
    agreementLevel = "WEAK";
  } else {
    convergenceAdjustment = -0.15;  // Significant disagreement penalty
    agreementLevel = "CONFLICTING";
    conflictDescription =
      `Images disagree on crush depth by ${spreadMm.toFixed(0)} mm (${spreadPct.toFixed(0)}% spread). ` +
      `Range: ${minDepth.toFixed(0)}–${maxDepth.toFixed(0)} mm. ` +
      `Possible causes: different damage zones photographed, perspective distortion in one or more images, ` +
      `or the damage is non-uniform across the impact zone. ` +
      `The consensus estimate (${consensusMm.toFixed(0)} mm) should be treated with caution.`;
  }

  return {
    contributingImages: contributing.length,
    spreadMm,
    spreadPct,
    withinUncertaintyBounds: allWithinBounds,
    convergenceAdjustment,
    agreementLevel,
    conflictDescription,
  };
}

// ── Main Stage 6.5B entry point ───────────────────────────────────────────────

/**
 * Run Stage 6.5B VGR cross-image geometric reconciliation.
 * Called from the orchestrator after Stage 6.5A.
 *
 * @param perImageResults  Per-image calibration results from Stage 6.5A
 * @returns VGRConsensusResult or null if no calibrated images available
 */
export function runVGRReconciliation(
  perImageResults: PerImageCalibrationResult[]
): VGRConsensusResult | null {
  try {
    // Only process images that produced a calibrated crush depth
    const calibratedImages = perImageResults.filter(
      r => r.scaleAvailable && r.calibratedCrushDepthMm != null
    );

    if (calibratedImages.length === 0) {
      return {
        reconciliationAvailable: false,
        consensusCrushDepthM: null,
        consensusCrushDepthMinM: null,
        consensusCrushDepthMaxM: null,
        overallConfidence: 0,
        confidenceLevel: "NONE",
        frontalImages: 0,
        angle45Images: 0,
        sideImages: 0,
        unknownAngleImages: 0,
        imageEntries: [],
        agreementAssessment: {
          contributingImages: 0,
          spreadMm: 0,
          spreadPct: 0,
          withinUncertaintyBounds: true,
          convergenceAdjustment: 0,
          agreementLevel: "STRONG",
        },
        failureReason: "No calibrated crush depth measurements available from Stage 6.5A",
      };
    }

    // Build reconciliation entries
    const entries: ReconciliationImageEntry[] = [];
    let frontalCount = 0, angle45Count = 0, sideCount = 0, unknownCount = 0;

    for (const img of calibratedImages) {
      const viewAngle = inferViewAngle(img.imageUrl);
      const viewAngleWeight = VIEW_ANGLE_WEIGHTS[viewAngle];
      const effectiveWeight = viewAngleWeight * img.overallCalibrationConfidence;

      switch (viewAngle) {
        case "FRONTAL":  frontalCount++; break;
        case "ANGLE_45": angle45Count++; break;
        case "SIDE":     sideCount++;    break;
        default:         unknownCount++; break;
      }

      entries.push({
        imageUrl: img.imageUrl,
        imageIndex: img.imageIndex,
        viewAngle,
        viewAngleWeight,
        calibratedCrushDepthMm: img.calibratedCrushDepthMm!,
        calibratedCrushDepthMinMm: img.calibratedCrushDepthMinMm ?? img.calibratedCrushDepthMm! * 0.85,
        calibratedCrushDepthMaxMm: img.calibratedCrushDepthMaxMm ?? img.calibratedCrushDepthMm! * 1.15,
        calibrationConfidence: img.overallCalibrationConfidence,
        effectiveWeight,
        contributesToConsensus: effectiveWeight > 0.05,  // Exclude very low weight entries
      });
    }

    const contributing = entries.filter(e => e.contributesToConsensus);
    if (contributing.length === 0) {
      return {
        reconciliationAvailable: false,
        consensusCrushDepthM: null,
        consensusCrushDepthMinM: null,
        consensusCrushDepthMaxM: null,
        overallConfidence: 0,
        confidenceLevel: "NONE",
        frontalImages: frontalCount,
        angle45Images: angle45Count,
        sideImages: sideCount,
        unknownAngleImages: unknownCount,
        imageEntries: entries,
        agreementAssessment: {
          contributingImages: 0,
          spreadMm: 0,
          spreadPct: 0,
          withinUncertaintyBounds: true,
          convergenceAdjustment: 0,
          agreementLevel: "STRONG",
        },
        failureReason: "All calibrated images had insufficient effective weight for consensus",
      };
    }

    // Weighted consensus crush depth
    const totalWeight = contributing.reduce((s, e) => s + e.effectiveWeight, 0);
    const consensusMm = contributing.reduce((s, e) => s + e.calibratedCrushDepthMm * e.effectiveWeight, 0) / totalWeight;

    // Consensus uncertainty bounds: weighted mean of individual bounds
    const consensusMinMm = contributing.reduce((s, e) => s + e.calibratedCrushDepthMinMm * e.effectiveWeight, 0) / totalWeight;
    const consensusMaxMm = contributing.reduce((s, e) => s + e.calibratedCrushDepthMaxMm * e.effectiveWeight, 0) / totalWeight;

    // Base confidence: weighted mean of individual calibration confidences
    const baseConfidence = contributing.reduce((s, e) => s + e.calibrationConfidence * e.effectiveWeight, 0) / totalWeight;

    // Agreement assessment (also produces convergence adjustment)
    const agreementAssessment = assessCrossImageAgreement(entries, consensusMm);

    // Final confidence: base ± convergence adjustment, clamped to [0, 1]
    const finalConfidence = Math.max(0, Math.min(1, baseConfidence + agreementAssessment.convergenceAdjustment));

    return {
      reconciliationAvailable: true,
      consensusCrushDepthM: consensusMm / 1000,
      consensusCrushDepthMinM: consensusMinMm / 1000,
      consensusCrushDepthMaxM: consensusMaxMm / 1000,
      overallConfidence: finalConfidence,
      confidenceLevel: classifyConfidence(finalConfidence),
      frontalImages: frontalCount,
      angle45Images: angle45Count,
      sideImages: sideCount,
      unknownAngleImages: unknownCount,
      imageEntries: entries,
      agreementAssessment,
    };

  } catch (err: any) {
    return {
      reconciliationAvailable: false,
      consensusCrushDepthM: null,
      consensusCrushDepthMinM: null,
      consensusCrushDepthMaxM: null,
      overallConfidence: 0,
      confidenceLevel: "NONE",
      frontalImages: 0,
      angle45Images: 0,
      sideImages: 0,
      unknownAngleImages: 0,
      imageEntries: [],
      agreementAssessment: {
        contributingImages: 0,
        spreadMm: 0,
        spreadPct: 0,
        withinUncertaintyBounds: true,
        convergenceAdjustment: 0,
        agreementLevel: "STRONG",
      },
      failureReason: `VGR reconciliation error: ${err?.message ?? String(err)}`,
    };
  }
}
