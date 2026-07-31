/**
 * Repair-vs-Replace Probability Engine
 *
 * Computes a repairProbability score (0–100) for each detected component
 * using a weighted combination of four signals:
 *
 *   40% — Damage severity (from Stage 6 per-component severity field)
 *   25% — Component category (structural vs panel vs glass vs mechanical)
 *   20% — Vehicle context (age, make tier, market segment)
 *   15% — Learning DB history (actual adjuster outcomes for same component+severity+make)
 *
 * Score interpretation:
 *   >= 66  => "Repair recommended"
 *   40-65  => "Uncertain — physical inspection required"
 *   < 40   => "Replace recommended"
 *
 * The engine is deliberately probabilistic and never makes a hard decision.
 * The confirmed outcome feeds back into component_repair_outcomes at claim
 * finalization (ANALYSIS_COMPLETE) so future predictions improve silently over time.
 * Adjuster corrections via trpc.repairReplace.recordOutcome perform an UPSERT
 * that overwrites the finalization record for the same claim+component.
 *
 * G-1 GUARD: Claims with fraud_score >= 50 are excluded from the learning table
 * to prevent contaminated signals from degrading calibration data quality.
 */

import { getRawPool } from "../db";

// --- Types -------------------------------------------------------------------

export type RepairReplaceSuggestion = "repair" | "replace" | "uncertain";

export interface ComponentRepairSignal {
  componentName: string;
  componentCategory?: string;
  severity: string; // "minor" | "moderate" | "severe" | "critical"
}

export interface RepairProbabilityResult {
  componentName: string;
  componentCategory: string;
  severity: string;
  repairProbability: number;          // 0-100
  suggestion: RepairReplaceSuggestion;
  confidenceLevel: "high" | "medium" | "low";
  signalBreakdown: {
    severityScore: number;
    categoryScore: number;
    vehicleScore: number;
    learningScore: number | null;
    learningRecordCount: number;
  };
  rationale: string;
}

export interface VehicleContext {
  make?: string;
  model?: string;
  year?: number;
}

/** Return type for recordFinalizedOutcome and the adjuster correction path */
export interface OutcomeRecordResult {
  recorded: boolean;
  /** Populated when recorded=false — explains why the write was skipped */
  skippedReason?: string;
}

// --- Severity => base repair probability -------------------------------------
const SEVERITY_BASE: Record<string, number> = {
  minor:    85,
  moderate: 60,
  severe:   30,
  critical: 10,
};

function severityScore(severity: string): number {
  return SEVERITY_BASE[severity?.toLowerCase()] ?? 50;
}

// --- Component category => repair affinity -----------------------------------
const CATEGORY_AFFINITY: Record<string, number> = {
  panel:       75,
  glass:       40,
  structural:  20,
  mechanical:  35,
  electrical:  45,
  trim:        80,
  light:       50,
  unknown:     55,
};

function categoryScore(category: string): number {
  const key = category?.toLowerCase() ?? "unknown";
  return CATEGORY_AFFINITY[key] ?? CATEGORY_AFFINITY.unknown;
}

// --- Vehicle context => repair affinity modifier -----------------------------
function vehicleScore(ctx: VehicleContext): number {
  const currentYear = new Date().getFullYear();
  const age = ctx.year ? currentYear - ctx.year : 5;

  let score = 70;
  if (age <= 2)       score = 80;
  else if (age <= 5)  score = 70;
  else if (age <= 10) score = 55;
  else if (age <= 15) score = 40;
  else                score = 30;

  const luxuryMakes = ["BMW", "MERCEDES", "MERCEDES-BENZ", "AUDI", "LEXUS", "PORSCHE", "LAND ROVER", "JAGUAR", "VOLVO"];
  const budgetMakes = ["CHERY", "HAVAL", "GREAT WALL", "JAC", "FOTON", "TATA"];
  const makeName = (ctx.make ?? "").toUpperCase();
  if (luxuryMakes.some(m => makeName.includes(m))) score += 10;
  if (budgetMakes.some(m => makeName.includes(m))) score -= 10;

  return Math.max(0, Math.min(100, score));
}

// --- Learning DB query -------------------------------------------------------
interface LearningResult {
  repairCount: number;
  replaceCount: number;
  writeOffCount: number;
  total: number;
  repairRate: number;
}

async function queryLearningDB(
  componentName: string,
  severity: string
): Promise<LearningResult | null> {
  try {
    const pool = await getRawPool();
    if (!pool) return null;
    const [rows] = await pool.execute(
      `SELECT outcome, COUNT(*) AS cnt
       FROM component_repair_outcomes
       WHERE LOWER(component_name) = LOWER(?)
         AND LOWER(severity_at_decision) = LOWER(?)
       GROUP BY outcome`,
      [componentName, severity]
    );

    const data = rows as Array<{ outcome: string; cnt: string | number }>;
    if (!data || data.length === 0) return null;

    const repairCount   = Number(data.find(r => r.outcome === "repair")?.cnt    ?? 0);
    const replaceCount  = Number(data.find(r => r.outcome === "replace")?.cnt   ?? 0);
    const writeOffCount = Number(data.find(r => r.outcome === "write_off")?.cnt ?? 0);
    const total = repairCount + replaceCount + writeOffCount;

    if (total < 3) return null;

    return {
      repairCount,
      replaceCount,
      writeOffCount,
      total,
      repairRate: Math.round((repairCount / total) * 100),
    };
  } catch {
    return null;
  }
}

// --- G-1 Fraud Guard ---------------------------------------------------------
/**
 * Returns true if the claim should be excluded from the learning table.
 * Claims with fraud_score >= 50 are excluded to prevent contaminated signals.
 * Fail-safe: if the guard query fails, the write is skipped (not allowed through).
 */
async function isExcludedByFraudGuard(claimId: number): Promise<{ excluded: boolean; reason?: string }> {
  try {
    const pool = await getRawPool();
    if (!pool) return { excluded: true, reason: "G-1: pool unavailable — write skipped as fail-safe" };

    const [rows] = await pool.execute(
      `SELECT fraud_risk_score FROM claims WHERE id = ? LIMIT 1`,
      [claimId]
    );
    const data = rows as Array<{ fraud_risk_score: number | null }>;
    const score = data[0]?.fraud_risk_score ?? null;

    if (score === null) {
      // No fraud score available — allow write (no signal to exclude on)
      return { excluded: false };
    }
    if (score >= 50) {
      return {
        excluded: true,
        reason: `G-1: fraud_risk_score=${score} >= 50 — excluded from learning table to protect calibration data quality`,
      };
    }
    return { excluded: false };
  } catch (err) {
    // Fail-safe: guard query failed — skip write rather than allow unguarded write
    return {
      excluded: true,
      reason: `G-1: guard query failed (${err instanceof Error ? err.message : String(err)}) — write skipped as fail-safe`,
    };
  }
}

// --- Main scoring function ---------------------------------------------------

export async function scoreRepairProbability(
  component: ComponentRepairSignal,
  vehicleCtx: VehicleContext
): Promise<RepairProbabilityResult> {
  const category = component.componentCategory ?? inferCategory(component.componentName);
  const severity = component.severity ?? "moderate";

  const sScore = severityScore(severity);
  const cScore = categoryScore(category);
  const vScore = vehicleScore(vehicleCtx);

  const learning = await queryLearningDB(component.componentName, severity);

  let repairProbability: number;
  let learningScore: number | null = null;

  if (learning) {
    learningScore = learning.repairRate;
    repairProbability = Math.round(
      sScore * 0.40 +
      cScore * 0.25 +
      vScore * 0.20 +
      learningScore * 0.15
    );
  } else {
    // Without learning data, redistribute weights to remaining signals
    repairProbability = Math.round(
      sScore * 0.55 +
      cScore * 0.25 +
      vScore * 0.20
    );
  }

  repairProbability = Math.max(0, Math.min(100, repairProbability));

  const suggestion: RepairReplaceSuggestion =
    repairProbability >= 66 ? "repair" :
    repairProbability < 40  ? "replace" :
    "uncertain";

  const confidenceLevel: "high" | "medium" | "low" =
    learning && learning.total >= 10 ? "high" :
    learning && learning.total >= 3  ? "medium" :
    "low";

  const rationale = buildRationale(
    component.componentName, category, severity, repairProbability,
    suggestion, vehicleCtx, learning
  );

  return {
    componentName: component.componentName,
    componentCategory: category,
    severity,
    repairProbability,
    suggestion,
    confidenceLevel,
    signalBreakdown: {
      severityScore: sScore,
      categoryScore: cScore,
      vehicleScore: vScore,
      learningScore,
      learningRecordCount: learning?.total ?? 0,
    },
    rationale,
  };
}

// --- Batch scoring -----------------------------------------------------------

export async function scoreAllComponents(
  components: ComponentRepairSignal[],
  vehicleCtx: VehicleContext
): Promise<RepairProbabilityResult[]> {
  return Promise.all(components.map(c => scoreRepairProbability(c, vehicleCtx)));
}

// --- Record finalized outcome (learning write-back) --------------------------
/**
 * Writes a component repair/replace outcome to the learning table.
 *
 * PRIMARY TRIGGER: Called automatically at claim finalization (ANALYSIS_COMPLETE)
 * for every component in the AI pipeline's repair intelligence output.
 * This ensures the learning table accumulates data from all claims — both
 * autonomous (fast-track) and human-reviewed — not just those where an adjuster
 * manually annotates a decision.
 *
 * SECONDARY TRIGGER: Called via trpc.repairReplace.recordOutcome when an adjuster
 * explicitly confirms or overrides a component decision. This path performs an
 * UPSERT so the adjuster correction replaces the finalization record for the
 * same claim+component, preserving the adjuster's ground-truth signal.
 *
 * G-1 GUARD: Claims with fraud_score >= 50 are excluded. The guard is applied
 * at the start of every write — both the automatic and manual paths.
 *
 * @param params.isAdjusterCorrection - When true, performs UPSERT (adjuster path).
 *   When false (default), performs INSERT IGNORE (finalization path — skips if already written).
 */
export async function recordFinalizedOutcome(params: {
  claimId: number;
  assessmentId: number;
  componentName: string;
  componentCategory?: string;
  severityAtDecision: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  outcome: "repair" | "replace" | "write_off";
  aiSuggestion: RepairReplaceSuggestion;
  adjusterUserId?: number;
  repairCostUsd?: number;
  replaceCostUsd?: number;
  /** When true, performs UPSERT (adjuster correction path). Default: false (finalization path). */
  isAdjusterCorrection?: boolean;
}): Promise<OutcomeRecordResult> {
  // ── G-1 Fraud Guard ────────────────────────────────────────────────────────
  const guard = await isExcludedByFraudGuard(params.claimId);
  if (guard.excluded) {
    return { recorded: false, skippedReason: guard.reason };
  }

  const pool = await getRawPool();
  if (!pool) return { recorded: false, skippedReason: "pool unavailable" };

  const now = new Date().toISOString();
  const currentYear = new Date().getFullYear();
  const vehicleAgeYears = params.vehicleYear ? currentYear - params.vehicleYear : null;
  const wasOverride = params.outcome !== params.aiSuggestion ? 1 : 0;

  if (params.isAdjusterCorrection) {
    // UPSERT: adjuster correction replaces the finalization record for same claim+component
    await pool.execute(
      `INSERT INTO component_repair_outcomes
        (claim_id, assessment_id, component_name, component_category,
         severity_at_decision, vehicle_make, vehicle_model, vehicle_year,
         vehicle_age_years, outcome, ai_suggestion, was_override,
         adjuster_user_id, repair_cost_usd, replace_cost_usd,
         decided_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         outcome           = VALUES(outcome),
         ai_suggestion     = VALUES(ai_suggestion),
         was_override      = VALUES(was_override),
         adjuster_user_id  = VALUES(adjuster_user_id),
         repair_cost_usd   = VALUES(repair_cost_usd),
         replace_cost_usd  = VALUES(replace_cost_usd),
         decided_at        = VALUES(decided_at)`,
      [
        params.claimId,
        params.assessmentId,
        params.componentName,
        params.componentCategory ?? null,
        params.severityAtDecision,
        params.vehicleMake ?? null,
        params.vehicleModel ?? null,
        params.vehicleYear ?? null,
        vehicleAgeYears,
        params.outcome,
        params.aiSuggestion,
        wasOverride,
        params.adjusterUserId ?? null,
        params.repairCostUsd?.toFixed(2) ?? null,
        params.replaceCostUsd?.toFixed(2) ?? null,
        now,
        now,
      ]
    );
  } else {
    // INSERT IGNORE: finalization path — skips silently if already written
    await pool.execute(
      `INSERT IGNORE INTO component_repair_outcomes
        (claim_id, assessment_id, component_name, component_category,
         severity_at_decision, vehicle_make, vehicle_model, vehicle_year,
         vehicle_age_years, outcome, ai_suggestion, was_override,
         adjuster_user_id, repair_cost_usd, replace_cost_usd,
         decided_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.claimId,
        params.assessmentId,
        params.componentName,
        params.componentCategory ?? null,
        params.severityAtDecision,
        params.vehicleMake ?? null,
        params.vehicleModel ?? null,
        params.vehicleYear ?? null,
        vehicleAgeYears,
        params.outcome,
        params.aiSuggestion,
        wasOverride,
        params.adjusterUserId ?? null,
        params.repairCostUsd?.toFixed(2) ?? null,
        params.replaceCostUsd?.toFixed(2) ?? null,
        now,
        now,
      ]
    );
  }

  return { recorded: true };
}

/**
 * @deprecated Use recordFinalizedOutcome instead.
 * This alias is retained for backward compatibility during the migration period.
 * It calls recordFinalizedOutcome with isAdjusterCorrection=true (UPSERT behaviour).
 */
export async function recordAdjusterOutcome(params: {
  claimId: number;
  assessmentId: number;
  componentName: string;
  componentCategory?: string;
  severityAtDecision: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  outcome: "repair" | "replace" | "write_off";
  aiSuggestion: RepairReplaceSuggestion;
  adjusterUserId?: number;
  repairCostUsd?: number;
  replaceCostUsd?: number;
}): Promise<OutcomeRecordResult> {
  return recordFinalizedOutcome({ ...params, isAdjusterCorrection: true });
}

// --- Helpers -----------------------------------------------------------------

export function inferCategory(componentName: string): string {
  const name = componentName.toLowerCase();
  if (/bonnet|hood|door|fender|bumper|quarter.panel|wing|sill|rocker/.test(name)) return "panel";
  if (/windscreen|windshield|rear.window|side.window|glass/.test(name)) return "glass";
  if (/pillar|floor.pan|firewall|chassis|frame|strut.tower|rail/.test(name)) return "structural";
  if (/engine|gearbox|transmission|suspension|axle|differential|radiator/.test(name)) return "mechanical";
  if (/headlight|taillight|indicator|lamp|light/.test(name)) return "light";
  if (/wiring|ecu|module|sensor|harness/.test(name)) return "electrical";
  if (/trim|badge|emblem|mirror.cover|spoiler/.test(name)) return "trim";
  return "unknown";
}

function buildRationale(
  name: string,
  category: string,
  severity: string,
  probability: number,
  suggestion: RepairReplaceSuggestion,
  ctx: VehicleContext,
  learning: LearningResult | null
): string {
  const parts: string[] = [];

  if (severity === "minor" || severity === "moderate") {
    parts.push(`${severity} damage to ${name} typically supports repair`);
  } else {
    parts.push(`${severity} damage to ${name} raises replacement likelihood`);
  }

  if (category === "structural") {
    parts.push("structural components are safety-critical and usually replaced");
  } else if (category === "glass") {
    parts.push("glass components are typically replaced rather than repaired");
  }

  if (ctx.year) {
    const age = new Date().getFullYear() - ctx.year;
    if (age > 10) parts.push(`vehicle age (${age} years) reduces parts availability`);
    else if (age <= 3) parts.push("recent vehicle age supports OEM repair");
  }

  if (learning) {
    parts.push(
      `historical data (${learning.total} similar cases): ` +
      `${learning.repairRate}% repaired, ${Math.round((learning.replaceCount / learning.total) * 100)}% replaced`
    );
  } else {
    parts.push("no historical data for this component+severity combination yet");
  }

  return parts.join("; ") + `. Overall repair probability: ${probability}%.`;
}
