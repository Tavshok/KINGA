/**
 * stageInputGuards.ts
 * ───────────────────
 * Per-stage input completeness checks.
 *
 * Design contract:
 *  - Guards NEVER throw or block the pipeline.
 *  - Guards return a `StageInputReport` that lists missing / low-confidence
 *    fields and attaches a plain-English DATA_GAPS preamble that can be
 *    prepended to any LLM prompt so the model knows to flag those fields as
 *    "insufficient data" rather than silently inferring values.
 *  - The orchestrator calls the appropriate guard before each stage and
 *    stores the report on `ctx.stageInputReports[stageKey]`.
 *  - Individual stage engines can read `ctx.stageInputReports[stageKey]` and
 *    prepend `report.promptPreamble` to their system prompt.
 *
 * Adding a new guard:
 *  1. Add a `check<StageName>Inputs` function below.
 *  2. Export it from the barrel at the bottom.
 *  3. Call it in orchestrator.ts before the stage's `runWithTimeout` call.
 */

import type { ClaimRecord, Stage6Output, Stage7Output } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldGap {
  field: string;
  severity: "critical" | "major" | "minor";
  reason: string;
}

export interface StageInputReport {
  stageKey: string;
  gaps: FieldGap[];
  /** True when at least one CRITICAL gap is present */
  hasCriticalGaps: boolean;
  /** True when at least one MAJOR gap is present */
  hasMajorGaps: boolean;
  /**
   * Plain-English preamble to prepend to the LLM system prompt.
   * Empty string when there are no gaps.
   */
  promptPreamble: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildReport(stageKey: string, gaps: FieldGap[]): StageInputReport {
  const hasCriticalGaps = gaps.some((g) => g.severity === "critical");
  const hasMajorGaps = gaps.some((g) => g.severity === "major");

  let promptPreamble = "";
  if (gaps.length > 0) {
    const lines = gaps.map(
      (g) => `  • [${g.severity.toUpperCase()}] ${g.field}: ${g.reason}`
    );
    promptPreamble =
      `DATA_GAPS_WARNING — The following input fields are absent or low-confidence ` +
      `for this ${stageKey} analysis. Do NOT infer or fabricate values for these fields. ` +
      `Instead, mark them as "insufficient data" in your output and reduce your ` +
      `confidence score accordingly.\n` +
      lines.join("\n") +
      "\n\n";
  }

  return { stageKey, gaps, hasCriticalGaps, hasMajorGaps, promptPreamble };
}

// ─── Stage 6: Damage Analysis ─────────────────────────────────────────────────

/**
 * Checks inputs for Stage 6 (damage analysis).
 * Stage 6 is deterministic (no LLM) but its output feeds Stages 7–9.
 * Gaps here propagate downstream.
 */
export function checkStage6Inputs(claimRecord: ClaimRecord | null): StageInputReport {
  const gaps: FieldGap[] = [];

  if (!claimRecord) {
    gaps.push({
      field: "claimRecord",
      severity: "critical",
      reason: "No claim record available — damage analysis will use empty fallback.",
    });
    return buildReport("6_damage_analysis", gaps);
  }

  if (!claimRecord.vehicle?.make && !claimRecord.vehicle?.model) {
    gaps.push({
      field: "vehicle.make / vehicle.model",
      severity: "major",
      reason: "Vehicle make and model are both absent — damage severity thresholds cannot be calibrated.",
    });
  }

  if (!claimRecord.vehicle?.year) {
    gaps.push({
      field: "vehicle.year",
      severity: "minor",
      reason: "Vehicle year absent — age-based depreciation and part availability cannot be assessed.",
    });
  }

  if (!claimRecord.accidentDetails?.collisionDirection || claimRecord.accidentDetails.collisionDirection === "unknown") {
    gaps.push({
      field: "accidentDetails.collisionDirection",
      severity: "major",
      reason: "Collision direction is unknown — damage zone mapping will be unreliable.",
    });
  }

  if (claimRecord.damage?.imageUrls?.length === 0) {
    gaps.push({
      field: "damage.imageUrls",
      severity: "major",
      reason: "No damage photos available — visual damage assessment is unavailable.",
    });
  }

  return buildReport("6_damage_analysis", gaps);
}

// ─── Stage 7: Physics + Causality ─────────────────────────────────────────────

/**
 * Checks inputs for Stage 7 (physics, severity consensus, causal reasoning, narrative).
 */
export function checkStage7Inputs(
  claimRecord: ClaimRecord | null,
  damageAnalysis: Stage6Output | null
): StageInputReport {
  const gaps: FieldGap[] = [];

  if (!claimRecord) {
    gaps.push({
      field: "claimRecord",
      severity: "critical",
      reason: "No claim record — physics analysis cannot proceed.",
    });
    return buildReport("7_unified", gaps);
  }

  if (!damageAnalysis || (damageAnalysis.damagedParts ?? []).length === 0) {
    gaps.push({
      field: "damageAnalysis.damagedParts",
      severity: "critical",
      reason: "No damaged parts identified — Delta-V and energy calculations will be unreliable.",
    });
  }

  if (claimRecord.accidentDetails?.estimatedSpeedKmh == null) {
    gaps.push({
      field: "accidentDetails.estimatedSpeedKmh",
      severity: "major",
      reason: "No claimed speed — physics speed estimate will rely solely on damage deformation.",
    });
  }

  if (claimRecord.accidentDetails?.maxCrushDepthM == null) {
    gaps.push({
      field: "accidentDetails.maxCrushDepthM",
      severity: "major",
      reason: "Crush depth absent — energy absorption calculation will use component-count heuristic.",
    });
  }

  if (!claimRecord.vehicle?.make || !claimRecord.vehicle?.model) {
    gaps.push({
      field: "vehicle.make / vehicle.model",
      severity: "major",
      reason: "Vehicle identity incomplete — mass and stiffness parameters will use class defaults.",
    });
  }

  if (!claimRecord.accidentDetails?.description || claimRecord.accidentDetails.description.trim().length < 20) {
    gaps.push({
      field: "accidentDetails.description",
      severity: "major",
      reason: "Incident description is absent or too brief — narrative analysis confidence will be low.",
    });
  }

  return buildReport("7_unified", gaps);
}

// ─── Stage 8: Fraud Analysis ──────────────────────────────────────────────────

/**
 * Checks inputs for Stage 8 (fraud scoring).
 */
export function checkStage8Inputs(
  claimRecord: ClaimRecord | null,
  damageAnalysis: Stage6Output | null,
  physicsAnalysis: Stage7Output | null
): StageInputReport {
  const gaps: FieldGap[] = [];

  if (!claimRecord) {
    gaps.push({
      field: "claimRecord",
      severity: "critical",
      reason: "No claim record — fraud analysis cannot proceed.",
    });
    return buildReport("8_fraud", gaps);
  }

  if (!physicsAnalysis || physicsAnalysis.damageConsistencyScore == null) {
    gaps.push({
      field: "physicsAnalysis.damageConsistencyScore",
      severity: "critical",
      reason: "Physics damage consistency score absent — physics-damage consistency indicator cannot be computed.",
    });
  }

  if (!damageAnalysis || (damageAnalysis.damagedParts ?? []).length === 0) {
    gaps.push({
      field: "damageAnalysis.damagedParts",
      severity: "major",
      reason: "No damaged parts — damage inflation indicator will have low confidence.",
    });
  }

  if (claimRecord.dataQuality?.completenessScore != null && claimRecord.dataQuality.completenessScore < 30) {
    gaps.push({
      field: "dataQuality.completenessScore",
      severity: "major",
      reason: `Data completeness is ${claimRecord.dataQuality.completenessScore}% — fraud indicators derived from missing fields will be unreliable.`,
    });
  }

  if (!claimRecord.accidentDetails?.collisionDirection || claimRecord.accidentDetails.collisionDirection === "unknown") {
    gaps.push({
      field: "accidentDetails.collisionDirection",
      severity: "minor",
      reason: "Collision direction unknown — directional damage consistency check will be skipped.",
    });
  }

  return buildReport("8_fraud", gaps);
}

// ─── Stage 9: Cost Optimisation ───────────────────────────────────────────────

/**
 * Checks inputs for Stage 9 (cost optimisation).
 */
export function checkStage9Inputs(
  claimRecord: ClaimRecord | null,
  damageAnalysis: Stage6Output | null,
  physicsAnalysis: Stage7Output | null
): StageInputReport {
  const gaps: FieldGap[] = [];

  if (!claimRecord) {
    gaps.push({
      field: "claimRecord",
      severity: "critical",
      reason: "No claim record — cost optimisation cannot proceed.",
    });
    return buildReport("9_cost", gaps);
  }

  if (!damageAnalysis || (damageAnalysis.damagedParts ?? []).length === 0) {
    gaps.push({
      field: "damageAnalysis.damagedParts",
      severity: "critical",
      reason: "No damaged parts — repair cost calculation has no basis.",
    });
  }

  if (!claimRecord.vehicle?.make || !claimRecord.vehicle?.model || !claimRecord.vehicle?.year) {
    gaps.push({
      field: "vehicle.make / model / year",
      severity: "major",
      reason: "Vehicle identity incomplete — OEM part pricing cannot be looked up; generic rates will be used.",
    });
  }

  if (!claimRecord.marketRegion) {
    gaps.push({
      field: "marketRegion",
      severity: "minor",
      reason: "Market region absent — default labour and paint rates will be applied.",
    });
  }

  if (physicsAnalysis?.accidentSeverity == null) {
    gaps.push({
      field: "physicsAnalysis.accidentSeverity",
      severity: "minor",
      reason: "Severity classification absent — repair complexity multiplier will use moderate default.",
    });
  }

  return buildReport("9_cost", gaps);
}

// ─── Re-exports (for consumers that import from this module) ─────────────────
