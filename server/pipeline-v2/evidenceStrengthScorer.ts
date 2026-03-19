/**
 * pipeline-v2/evidenceStrengthScorer.ts
 *
 * STAGE 38 — EVIDENCE STRENGTH SCORER
 *
 * Computes evidence_strength (0–1) for every engine output:
 *   - Damage Analysis   (Stage 6)
 *   - Physics / Reconstruction (Stage 7)
 *   - Fraud Analysis    (Stage 8)
 *   - Cost Estimation   (Stage 9)
 *   - Claim Assembly    (Stage 5 / ClaimRecord)
 *
 * Scoring rules:
 *   HIGH   (0.75–1.0)  — Direct measurable data, multiple sources agree
 *   MEDIUM (0.50–0.74) — Partial data, some estimation used
 *   LOW    (0.10–0.49) — Mostly inferred, fallback/assumptions used
 *
 * Output contract per tagged value:
 *   { value, evidence_strength, evidence_label, estimated }
 *
 * Architecture:
 *   Each engine has a dedicated scorer function that returns an EvidenceTag.
 *   A composite EvidenceBundle is produced for the full pipeline run.
 */

import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  Assumption,
  RecoveryStrategy,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Exported constants (used by tests and other modules)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum score for HIGH label */
export const HIGH_THRESHOLD = 0.75;

/** Minimum score for MEDIUM label */
export const MEDIUM_THRESHOLD = 0.50;

/** Absolute floor — no score may be lower than this */
export const SCORE_FLOOR = 0.10;

/** Absolute ceiling — no score may exceed this */
export const SCORE_CEILING = 1.0;

/** Recovery strategies that indicate estimation/fallback was used */
export const ESTIMATION_STRATEGIES = new Set<RecoveryStrategy>([
  "industry_average",
  "damage_based_estimate",
  "typical_collision",
  "default_value",
  "historical_data",
  "contextual_inference",
]);

/** Recovery strategies that indicate partial data (not full fallback) */
export const PARTIAL_STRATEGIES = new Set<RecoveryStrategy>([
  "secondary_ocr",
  "cross_document_search",
  "manufacturer_lookup",
  "partial_data",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Core types
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceLabel = "HIGH" | "MEDIUM" | "LOW";

/**
 * Attached to every engine output value.
 * `value` is the raw numeric/string/boolean result from the engine.
 */
export interface EvidenceTag<T = unknown> {
  value: T;
  evidence_strength: number;   // 0.10–1.0
  evidence_label: EvidenceLabel;
  estimated: boolean;
  /** Optional human-readable explanation of the score */
  rationale?: string;
}

/**
 * Full evidence bundle for a pipeline run.
 * One EvidenceTag per engine.
 */
export interface EvidenceBundle {
  damage: EvidenceTag<number>;           // overallSeverityScore
  physics: EvidenceTag<number>;          // impactForceKn
  fraud: EvidenceTag<number>;            // fraudRiskScore
  cost: EvidenceTag<number>;             // expectedRepairCostCents
  reconstruction: EvidenceTag<string>;   // accidentReconstructionSummary
  composite: EvidenceTag<number>;        // weighted composite across all engines
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a value between SCORE_FLOOR and SCORE_CEILING */
function clamp(v: number): number {
  return Math.min(SCORE_CEILING, Math.max(SCORE_FLOOR, v));
}

/** Derive label from numeric score */
export function scoreToLabel(score: number): EvidenceLabel {
  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/**
 * Count how many assumptions in the list used estimation/fallback strategies.
 * Returns { estimationCount, partialCount, totalCount }.
 */
function classifyAssumptions(assumptions: Assumption[]): {
  estimationCount: number;
  partialCount: number;
  totalCount: number;
} {
  let estimationCount = 0;
  let partialCount = 0;
  for (const a of assumptions) {
    if (ESTIMATION_STRATEGIES.has(a.strategy)) estimationCount++;
    else if (PARTIAL_STRATEGIES.has(a.strategy)) partialCount++;
  }
  return { estimationCount, partialCount, totalCount: assumptions.length };
}

/**
 * Penalty per assumption type:
 *   - Estimation/fallback: −0.12 each (capped at −0.36)
 *   - Partial data:        −0.06 each (capped at −0.18)
 *   - Other (none/cross):  −0.03 each (capped at −0.09)
 */
function assumptionPenalty(assumptions: Assumption[]): number {
  const { estimationCount, partialCount, totalCount } = classifyAssumptions(assumptions);
  const otherCount = totalCount - estimationCount - partialCount;
  const penalty =
    Math.min(estimationCount * 0.12, 0.36) +
    Math.min(partialCount * 0.06, 0.18) +
    Math.min(otherCount * 0.03, 0.09);
  return penalty;
}

/** Build an EvidenceTag from a raw score and value */
function tag<T>(
  value: T,
  rawScore: number,
  estimated: boolean,
  rationale?: string
): EvidenceTag<T> {
  const evidence_strength = clamp(rawScore);
  return {
    value,
    evidence_strength,
    evidence_label: scoreToLabel(evidence_strength),
    estimated,
    ...(rationale !== undefined ? { rationale } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine-specific scorers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DAMAGE ANALYSIS SCORER (Stage 6)
 *
 * Signals:
 *   +0.40  Images present (direct visual evidence)
 *   +0.20  ≥3 images (multiple independent views)
 *   +0.20  Damage description present
 *   +0.15  Damaged components list non-empty
 *   +0.10  Multiple damage zones identified
 *   −penalty  Assumptions used in assembly
 */
export function scoreDamage(
  damageAnalysis: Stage6Output,
  claimRecord: ClaimRecord
): EvidenceTag<number> {
  const images = claimRecord.damage.imageUrls ?? [];
  const description = claimRecord.damage.description;
  const components = damageAnalysis.damagedParts ?? [];
  const zones = damageAnalysis.damageZones ?? [];
  const assumptions = claimRecord.assumptions ?? [];

  let score = 0.10; // base

  // Direct visual evidence
  if (images.length >= 1) score += 0.40;
  if (images.length >= 3) score += 0.20;

  // Textual description
  if (description && description.trim().length > 10) score += 0.20;

  // Component list
  if (components.length >= 1) score += 0.15;

  // Multiple zones (independent corroboration)
  if (zones.length >= 2) score += 0.10;

  // Assumption penalty
  score -= assumptionPenalty(assumptions);

  const estimated = assumptions.some((a) => ESTIMATION_STRATEGIES.has(a.strategy));
  const rationale = `${images.length} image(s), ${components.length} component(s), ${zones.length} zone(s), ${assumptions.length} assumption(s)`;

  return tag(damageAnalysis.overallSeverityScore, score, estimated, rationale);
}

/**
 * PHYSICS / RECONSTRUCTION SCORER (Stage 7)
 *
 * Signals:
 *   +0.30  physicsExecuted = true (engine ran, not skipped)
 *   +0.20  Speed provided directly (not null)
 *   +0.15  Crush depth provided
 *   +0.15  Damage area provided
 *   +0.15  Airbag deployment data present
 *   +0.10  Police report number present (independent corroboration)
 *   −penalty  Assumptions used in assembly
 */
export function scorePhysics(
  physicsAnalysis: Stage7Output,
  claimRecord: ClaimRecord
): EvidenceTag<number> {
  const ad = claimRecord.accidentDetails;
  const pr = claimRecord.policeReport;
  const assumptions = claimRecord.assumptions ?? [];

  let score = 0.10; // base

  if (physicsAnalysis.physicsExecuted) score += 0.30;
  if (ad.estimatedSpeedKmh !== null) score += 0.20;
  if (ad.maxCrushDepthM !== null) score += 0.15;
  if (ad.totalDamageAreaM2 !== null) score += 0.15;
  if (ad.airbagDeployment) score += 0.10; // binary but meaningful
  if (pr.reportNumber !== null && pr.reportNumber.trim().length > 0) score += 0.10;

  score -= assumptionPenalty(assumptions);

  const estimated = !physicsAnalysis.physicsExecuted ||
    assumptions.some((a) => ESTIMATION_STRATEGIES.has(a.strategy));
  const rationale = `physicsExecuted=${physicsAnalysis.physicsExecuted}, speed=${ad.estimatedSpeedKmh}, crush=${ad.maxCrushDepthM}, area=${ad.totalDamageAreaM2}, police=${pr.reportNumber !== null}`;

  return tag(physicsAnalysis.impactForceKn, score, estimated, rationale);
}

/**
 * FRAUD ANALYSIS SCORER (Stage 8)
 *
 * Signals:
 *   +0.30  Quote present (direct financial evidence)
 *   +0.20  Quote has line items (itemised, not lump sum)
 *   +0.20  Repairer name and company both present
 *   +0.15  Assessor name present
 *   +0.10  Vehicle history check ran (vehicleClaimHistory.notes non-empty)
 *   +0.10  Claimant history check ran
 *   −penalty  Assumptions used in assembly
 */
export function scoreFraud(
  fraudAnalysis: Stage8Output,
  claimRecord: ClaimRecord
): EvidenceTag<number> {
  const q = claimRecord.repairQuote;
  const assumptions = claimRecord.assumptions ?? [];

  let score = 0.10; // base

  if (q.quoteTotalCents !== null) score += 0.30;
  if ((q.lineItems ?? []).length >= 1) score += 0.20;
  if (q.repairerName !== null && q.repairerCompany !== null) score += 0.20;
  if (q.assessorName !== null) score += 0.15;
  if (fraudAnalysis.vehicleClaimHistory?.notes?.trim().length > 0) score += 0.10;
  if (fraudAnalysis.claimantClaimFrequency?.notes?.trim().length > 0) score += 0.10;

  score -= assumptionPenalty(assumptions);

  const estimated = q.quoteTotalCents === null ||
    assumptions.some((a) => ESTIMATION_STRATEGIES.has(a.strategy));
  const rationale = `quote=${q.quoteTotalCents !== null}, lineItems=${(q.lineItems ?? []).length}, repairer=${q.repairerName !== null}, assessor=${q.assessorName !== null}`;

  return tag(fraudAnalysis.fraudRiskScore, score, estimated, rationale);
}

/**
 * COST ESTIMATION SCORER (Stage 9)
 *
 * Signals:
 *   +0.30  Quote total present (direct cost evidence)
 *   +0.20  Labour cost broken out separately
 *   +0.20  Parts cost broken out separately
 *   +0.15  ≥3 repair intelligence items (itemised breakdown)
 *   +0.10  Parts reconciliation present (cross-checked)
 *   +0.05  Quote deviation computed (comparison available)
 *   −penalty  Assumptions used in assembly
 */
export function scoreCost(
  costAnalysis: Stage9Output,
  claimRecord: ClaimRecord
): EvidenceTag<number> {
  const q = claimRecord.repairQuote;
  const assumptions = claimRecord.assumptions ?? [];
  const ri = costAnalysis.repairIntelligence ?? [];
  const pr = costAnalysis.partsReconciliation ?? [];

  let score = 0.10; // base

  if (q.quoteTotalCents !== null) score += 0.30;
  if (q.labourCostCents !== null) score += 0.20;
  if (q.partsCostCents !== null) score += 0.20;
  if (ri.length >= 3) score += 0.15;
  if (pr.length >= 1) score += 0.10;
  if (costAnalysis.quoteDeviationPct !== null) score += 0.05;

  score -= assumptionPenalty(assumptions);

  const estimated = q.quoteTotalCents === null ||
    assumptions.some((a) => ESTIMATION_STRATEGIES.has(a.strategy));
  const rationale = `quote=${q.quoteTotalCents !== null}, labour=${q.labourCostCents !== null}, parts=${q.partsCostCents !== null}, ri=${ri.length}, reconciliation=${pr.length}`;

  return tag(costAnalysis.expectedRepairCostCents, score, estimated, rationale);
}

/**
 * RECONSTRUCTION SCORER (Stage 7 narrative)
 *
 * Signals:
 *   +0.30  physicsExecuted = true
 *   +0.20  Speed provided
 *   +0.20  Crush depth provided
 *   +0.15  Multiple damage zones
 *   +0.10  Police report present
 *   +0.05  Airbag deployment data
 *   −penalty  Assumptions used
 *
 * (Mirrors physics scorer but applied to the narrative string value)
 */
export function scoreReconstruction(
  physicsAnalysis: Stage7Output,
  claimRecord: ClaimRecord
): EvidenceTag<string> {
  const ad = claimRecord.accidentDetails;
  const pr = claimRecord.policeReport;
  const assumptions = claimRecord.assumptions ?? [];
  const zones = (claimRecord.damage?.components ?? []).length;

  let score = 0.10;

  if (physicsAnalysis.physicsExecuted) score += 0.30;
  if (ad.estimatedSpeedKmh !== null) score += 0.20;
  if (ad.maxCrushDepthM !== null) score += 0.20;
  if (zones >= 2) score += 0.15;
  if (pr.reportNumber !== null && pr.reportNumber.trim().length > 0) score += 0.10;
  if (ad.airbagDeployment) score += 0.05;

  score -= assumptionPenalty(assumptions);

  const estimated = !physicsAnalysis.physicsExecuted ||
    assumptions.some((a) => ESTIMATION_STRATEGIES.has(a.strategy));
  const rationale = `physicsExecuted=${physicsAnalysis.physicsExecuted}, speed=${ad.estimatedSpeedKmh}, crush=${ad.maxCrushDepthM}, zones=${zones}, police=${pr.reportNumber !== null}`;

  return tag(physicsAnalysis.accidentReconstructionSummary, score, estimated, rationale);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite scorer
// ─────────────────────────────────────────────────────────────────────────────

/** Engine weights for composite score (must sum to 1.0) */
export const ENGINE_WEIGHTS = {
  damage: 0.25,
  physics: 0.25,
  fraud: 0.20,
  cost: 0.20,
  reconstruction: 0.10,
} as const;

function computeComposite(
  damageScore: number,
  physicsScore: number,
  fraudScore: number,
  costScore: number,
  reconstructionScore: number
): number {
  return (
    damageScore * ENGINE_WEIGHTS.damage +
    physicsScore * ENGINE_WEIGHTS.physics +
    fraudScore * ENGINE_WEIGHTS.fraud +
    costScore * ENGINE_WEIGHTS.cost +
    reconstructionScore * ENGINE_WEIGHTS.reconstruction
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute evidence strength for all five engines and return a full EvidenceBundle.
 *
 * All parameters are required — pass null-safe defaults if a stage failed.
 */
export function computeEvidenceBundle(
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output,
  fraudAnalysis: Stage8Output,
  costAnalysis: Stage9Output
): EvidenceBundle {
  const damageTag = scoreDamage(damageAnalysis, claimRecord);
  const physicsTag = scorePhysics(physicsAnalysis, claimRecord);
  const fraudTag = scoreFraud(fraudAnalysis, claimRecord);
  const costTag = scoreCost(costAnalysis, claimRecord);
  const reconstructionTag = scoreReconstruction(physicsAnalysis, claimRecord);

  const compositeRaw = computeComposite(
    damageTag.evidence_strength,
    physicsTag.evidence_strength,
    fraudTag.evidence_strength,
    costTag.evidence_strength,
    reconstructionTag.evidence_strength
  );

  const anyEstimated =
    damageTag.estimated ||
    physicsTag.estimated ||
    fraudTag.estimated ||
    costTag.estimated ||
    reconstructionTag.estimated;

  const compositeTag = tag<number>(
    Math.round(compositeRaw * 100) / 100,
    compositeRaw,
    anyEstimated,
    `Weighted composite: damage×${ENGINE_WEIGHTS.damage} + physics×${ENGINE_WEIGHTS.physics} + fraud×${ENGINE_WEIGHTS.fraud} + cost×${ENGINE_WEIGHTS.cost} + reconstruction×${ENGINE_WEIGHTS.reconstruction}`
  );

  return {
    damage: damageTag,
    physics: physicsTag,
    fraud: fraudTag,
    cost: costTag,
    reconstruction: reconstructionTag,
    composite: compositeTag,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Convenience: score a single engine output.
 * Returns an EvidenceTag for the given engine type.
 */
export function scoreEngine(
  engine: "damage" | "physics" | "fraud" | "cost" | "reconstruction",
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output,
  fraudAnalysis: Stage8Output,
  costAnalysis: Stage9Output
): EvidenceTag {
  switch (engine) {
    case "damage": return scoreDamage(damageAnalysis, claimRecord);
    case "physics": return scorePhysics(physicsAnalysis, claimRecord);
    case "fraud": return scoreFraud(fraudAnalysis, claimRecord);
    case "cost": return scoreCost(costAnalysis, claimRecord);
    case "reconstruction": return scoreReconstruction(physicsAnalysis, claimRecord);
  }
}
