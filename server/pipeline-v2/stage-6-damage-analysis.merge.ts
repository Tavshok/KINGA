/** Deterministic Stage 6 component merge concern. Keep source precedence stable. */
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

export function mergeComponents(
  structured: DamageAnalysisComponent[],
  vision: DamageAnalysisComponent[]
): DamageAnalysisComponent[] {
  if (vision.length === 0) return structured;
  if (structured.length === 0) return vision;

  const existingNames = new Set(structured.map((c) => c.name.toLowerCase().trim()));
  const newFromVision = vision.filter((c) => !existingNames.has(c.name.toLowerCase().trim()));

  return [...structured, ...newFromVision];
}

// Image Intelligence Layer is imported at the top of this file

/**
 * Stage 6: Damage Analysis
 *
 * Extracts damaged vehicle components from available evidence using one of three
 * paths, selected at runtime based on what evidence is available:
 *
 *   Path A — Photo vision (preferred): `readDamageFromPhotos` processes up to
 *     PER_RUN_VISION_BUDGET photos in parallel batches via the LLM vision API.
 *     Photos are ranked by damage likelihood score before selection.
 *
 *   Path B — PDF direct vision (fallback): `readDamageFromPdf` passes the raw
 *     PDF to the LLM as a file_url when no pre-rendered page images are available.
 *     Used when Stage 1 page rendering failed or produced 0 pages.
 *
 *   Path C — Description inference (last resort): `inferDamageFromDescription`
 *     extracts components from the claim description text when no images or PDF
 *     are available.
 *
 * All three paths produce the same output shape (DamageAnalysisComponent[]) so
 * the rest of the pipeline does not need to know which path was taken.
 *
 * The function is intentionally not split into sub-functions because the path
 * selection logic, the mergeComponents deduplication, and the final isDegraded
 * flag all depend on the same local state variables.
 */
