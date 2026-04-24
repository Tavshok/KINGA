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
 * The adjuster's confirmed outcome feeds back into component_repair_outcomes
 * so future predictions improve silently over time.
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

// --- Record adjuster outcome (learning write-back) ---------------------------

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
}): Promise<void> {
  const now = new Date().toISOString();
  const currentYear = new Date().getFullYear();
  const vehicleAgeYears = params.vehicleYear ? currentYear - params.vehicleYear : null;

  const pool = await getRawPool();
  if (!pool) return;
  await pool.execute(
    `INSERT INTO component_repair_outcomes
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
      params.outcome !== params.aiSuggestion ? 1 : 0,
      params.adjusterUserId ?? null,
      params.repairCostUsd?.toFixed(2) ?? null,
      params.replaceCostUsd?.toFixed(2) ?? null,
      now,
      now,
    ]
  );
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
