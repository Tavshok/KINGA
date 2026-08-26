/** Structured-description fallback for Stage 6. Never invoke remote vision services here. */
/**
 * pipeline-v2/stage-6-damage-analysis.ts
 *
 * STAGE 6 — DAMAGE ANALYSIS ENGINE (Self-Healing + Vision)
 *
 * Using vehicle photos and damage descriptions from the ClaimRecord:
 *   - Identify damaged components (from structured data OR LLM vision on photos)
 *   - Create damage zones
 *   - Compute severity scores
 *
 * VISION PATH: When damagePhotoUrls are present in the pipeline context,
 * the LLM is called with the actual damage photos to extract components
 * directly from the images. Vision results are merged with any structured
 * components from the claim record (structured data takes precedence for
 * components already identified; vision adds newly detected components).
 *
 * RELIABILITY ARCHITECTURE (10-point hardening):
 *   1. Pre-validate image URLs before sending to LLM (skip inaccessible ones)
 *   2. Process each image INDEPENDENTLY — one failure never kills all
 *   3. Retry each image up to 2× with exponential back-off
 *   4. Timeout every LLM call at 45s
 *   5. Minimum success threshold: ≥50% of images must succeed for ANALYSED status
 *   6. Fallback prompt: if primary returns 0 components, retry with simpler "describe" prompt
 *   7. Merge per-image results (deduplication by part name)
 *   8. Flag degraded mode when success rate < threshold
 *   9. Strengthen prompt: infer from unclear images, never return empty
 *  10. Surface failure rate in assumptions for monitoring
 *
 * NEVER halts — if no damage data exists, produces empty analysis with assumptions.
 */

import { ensureDamageContract } from "./engineFallback";
import { invokeLLM } from "../_core/llm";
import { normalisePartName, CANONICAL_PARTS_PROMPT_LIST } from "./canonicalPartsVocabulary";
import { renderSpecificPdfPages } from "./pdfToImages";
import { KINGA_REPORT_SYSTEM_PROMPT } from "./kingaReportSystemPrompt";
import { selectDamagePhotoPages } from "./imageIntelligence";
import {
  evidenceFromClassifiedImage,
  evidenceFromPdfDirectPage,
  evidenceFromScoredPdfPage,
  evidenceFromSemanticImage,
  removeIneligiblePhysicsMeasurements,
} from "./imageEvidenceEligibility";
import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  DamageAnalysisComponent,
  DamageZone,
  AccidentSeverity,
  Assumption,
  RecoveryAction,
  ImageEvidenceEnvelope,
} from "./types";
import { TIMEOUT_VISION_MS } from "./pipelineContractRegistry";
import { normaliseVisionComponentNames } from "../services/visionTermNormaliser";
// R-B-06 fix: import TIMEOUT_VISION_MS from pipelineContractRegistry so the
// stage-level budget is a single source of truth (currently 200_000 ms / 200 s).
// The orchestrator enforces this via runWithTimeout("6_damage_analysis", ...).
//
// Timing model:
//   VISION_TIMEOUT_MS (below) = 45 s per-image LLM call timeout.
//   VISION_RETRIES = 2 means each image can take up to 3 × 45 s = 135 s worst case.
//   TIMEOUT_VISION_MS (stage budget) = 200 s is the binding constraint.
//   At typical LLM speed (~5–10 s/image): 20 photos ≈ 160 s ✓ within budget.
//   At worst-case (all retries hit timeout): budget exhausted after ~4 photos.
//   PER_RUN_VISION_BUDGET should satisfy: budget × VISION_TIMEOUT_MS << TIMEOUT_VISION_MS.

export function inferDamageFromDescription(
  claimRecord: ClaimRecord,
  assumptions: Assumption[]
): DamageAnalysisComponent[] {
  const impactPoint = (claimRecord.accidentDetails.impactPoint || "").toLowerCase();
  const direction = claimRecord.accidentDetails.collisionDirection;

  // Fix C: helper to stamp every inferred component with source: "inferred"
  const infer = (comp: Omit<DamageAnalysisComponent, 'source'>): DamageAnalysisComponent =>
    ({ ...comp, source: 'inferred' as const });

  const inferred: DamageAnalysisComponent[] = [];

  if (direction === "frontal" || /front/i.test(impactPoint)) {
    inferred.push(
      infer({ name: "Front Bumper", location: "front", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 }),
      infer({ name: "Bonnet", location: "front", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 }),
      infer({ name: "Grille", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.1 }),
      infer({ name: "LH Headlamp", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 }),
      infer({ name: "RH Headlamp", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 }),
    );
  } else if (direction === "rear" || /rear|back/i.test(impactPoint)) {
    inferred.push(
      infer({ name: "Rear Bumper", location: "rear", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 }),
      infer({ name: "Boot Lid", location: "rear", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 }),
      infer({ name: "LH Tail Lamp", location: "rear", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 }),
      infer({ name: "RH Tail Lamp", location: "rear", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 }),
    );
  } else if (direction === "side_driver" || direction === "side_passenger") {
    const side = direction === "side_driver" ? "LH" : "RH";
    const sideLabel = direction === "side_driver" ? "left" : "right";
    inferred.push(
      infer({ name: `${side} Front Door`, location: sideLabel, damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 }),
      infer({ name: `${side} Rear Door`, location: sideLabel, damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0.5 }),
      infer({ name: `${side} B-Pillar`, location: sideLabel, damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 }),
      infer({ name: `${side} Sill Panel`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.4 }),
      infer({ name: `${side} Front Fender`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.6 }),
      infer({ name: `${side} Rear Quarter Panel`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.7 }),
      infer({ name: `${side} Door Glass`, location: sideLabel, damageType: "shatter", severity: "moderate", visible: true, distanceFromImpact: 0.2 }),
      infer({ name: `${side} Door Mirror`, location: sideLabel, damageType: "breakage", severity: "minor", visible: true, distanceFromImpact: 0.1 }),
    );
  } else if (direction === "rollover") {
    inferred.push(
      infer({ name: "Roof Panel", location: "roof", damageType: "deformation", severity: "severe", visible: true, distanceFromImpact: 0 }),
      infer({ name: "Roof Lining", location: "roof", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.1 }),
      infer({ name: "LH A-Pillar", location: "left", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.2 }),
      infer({ name: "RH A-Pillar", location: "right", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.2 }),
      infer({ name: "LH B-Pillar", location: "left", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.3 }),
      infer({ name: "RH B-Pillar", location: "right", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.3 }),
      infer({ name: "LH Front Door", location: "left", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.4 }),
      infer({ name: "RH Front Door", location: "right", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.4 }),
      infer({ name: "Windscreen", location: "front", damageType: "shatter", severity: "severe", visible: true, distanceFromImpact: 0.5 }),
      infer({ name: "Rear Windscreen", location: "rear", damageType: "shatter", severity: "moderate", visible: true, distanceFromImpact: 0.5 }),
      infer({ name: "LH Sill Panel", location: "left", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.6 }),
      infer({ name: "RH Sill Panel", location: "right", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.6 }),
    );
  } else {
    // Fix A: stale-default removed. When collision direction is unknown/unrecognised
    // (null, "multi_impact", "other", "unknown", or any unmatched value), do NOT inject
    // front-zone components. Return empty array with assumption entry (confidence: 0).
    assumptions.push({
      field: "damagedParts",
      assumedValue: "no_damage_detected",
      reason: `Collision direction '${direction ?? 'null'}' is unrecognised or absent. Cannot safely infer damage zone. No components injected.`,
      strategy: "none" as const,
      confidence: 0,
      stage: "Stage 6",
    });
    return [];
  }

  if (inferred.length > 0) {
    assumptions.push({
      field: "damagedParts",
      assumedValue: `${inferred.length} inferred components (source: narrative)`,
      reason: `No damage components extracted from documents or vision. Inferred ${inferred.length} likely damaged components from collision direction (${direction}) and impact point. Components marked source=inferred.`,
      strategy: "contextual_inference",
      confidence: 35,
      stage: "Stage 6",
    });
  }

  return inferred;
}

/**
 * Merge vision-extracted components with structured components.
 * Structured components take precedence; vision adds newly detected parts
 * not already present in the structured list (deduplication by name).
 */
