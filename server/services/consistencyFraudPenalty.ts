/**
 * consistencyFraudPenalty.ts
 * Stage 29 — Governed Consistency-to-Fraud Penalty
 *
 * Encapsulates the five rules that govern how a consistency_check_json result
 * contributes to the weighted fraud score:
 *
 *  Rule 1 — Status gate:     only run when status == "complete"
 *  Rule 2 — Severity gate:   only apply weight when high_severity_mismatches >= 1
 *  Rule 3 — Dampening:       base_score > 70 → −30%; multiple high factors → −20%
 *  Rule 4 — Cap:             contribution must not exceed 15% of total fraud score
 *  Rule 5 — Audit log:       every decision (apply / skip / dampen / cap) is recorded
 *
 * This module is pure (no DB calls, no side effects) and fully unit-testable.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a single mismatch entry inside consistency_check_json */
export interface ConsistencyMismatch {
  mismatch_type: string;
  severity: "high" | "medium" | "low";
  details?: string;
}

/** Parsed consistency_check_json document */
export interface ConsistencyCheckJson {
  status: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  mismatches?: ConsistencyMismatch[];
  [key: string]: unknown;
}

/** Per-mismatch audit record (Rule 5) */
export interface PenaltyAuditEntry {
  mismatch_type: string;
  /** Raw weight before dampening/cap */
  raw_weight: number;
  /** Final weight after dampening and cap */
  applied_weight: number;
  dampening_applied: boolean;
  dampening_reasons: string[];
  capped: boolean;
  skipped: boolean;
  skip_reason?: string;
}

/** Full result returned by computeConsistencyFraudPenalty */
export interface ConsistencyFraudPenaltyResult {
  /** Total penalty to add to the fraud base score */
  total_penalty: number;
  /** Whether the status gate passed */
  status_gate_passed: boolean;
  /** Whether at least one high-severity mismatch was found */
  severity_gate_passed: boolean;
  /** Number of high-severity mismatches */
  high_severity_count: number;
  /** Confidence level from the consistency check */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Per-mismatch audit entries (Rule 5) */
  audit_log: PenaltyAuditEntry[];
  /** Human-readable summary for the fraud explanation */
  summary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base weight per high-severity mismatch by confidence level */
const BASE_WEIGHT: Record<"HIGH" | "MEDIUM" | "LOW", number> = {
  HIGH: 12,
  MEDIUM: 5,
  LOW: 0, // LOW confidence → never applied
};

/** Maximum fraction of total score that Factor 7 may contribute */
const MAX_CONTRIBUTION_FRACTION = 0.15;

/** Dampening factor when base score before Factor 7 exceeds this threshold */
const HIGH_BASE_SCORE_THRESHOLD = 70;
const HIGH_BASE_SCORE_DAMPENING = 0.70; // −30%

/** Dampening factor when ≥2 other factors with value ≥10 are already triggered */
const MULTI_FACTOR_DAMPENING = 0.80; // −20%

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Compute the governed consistency-to-fraud penalty.
 *
 * @param consistencyCheckJson  Parsed or raw consistency_check_json (null → skip)
 * @param baseScoreBeforePenalty  Fraud base score accumulated before this factor
 * @param highWeightTriggeredCount  Number of other factors already triggered with value ≥10
 */
export function computeConsistencyFraudPenalty(
  consistencyCheckJson: ConsistencyCheckJson | null | undefined,
  baseScoreBeforePenalty: number,
  highWeightTriggeredCount: number
): ConsistencyFraudPenaltyResult {
  const audit_log: PenaltyAuditEntry[] = [];

  // ── Rule 1: Status gate ───────────────────────────────────────────────────
  if (!consistencyCheckJson || consistencyCheckJson.status !== "complete") {
    return {
      total_penalty: 0,
      status_gate_passed: false,
      severity_gate_passed: false,
      high_severity_count: 0,
      confidence: "LOW",
      audit_log: [],
      summary: consistencyCheckJson
        ? `Consistency check status is "${consistencyCheckJson.status}" — penalty not applied (requires "complete").`
        : "No consistency check data available — penalty not applied.",
    };
  }

  // ── Rule 2: Severity gate ─────────────────────────────────────────────────
  const mismatches: ConsistencyMismatch[] = Array.isArray(consistencyCheckJson.mismatches)
    ? consistencyCheckJson.mismatches
    : [];
  const highMismatches = mismatches.filter((m) => m.severity === "high");
  const confidence: "HIGH" | "MEDIUM" | "LOW" = consistencyCheckJson.confidence ?? "LOW";

  if (highMismatches.length === 0) {
    return {
      total_penalty: 0,
      status_gate_passed: true,
      severity_gate_passed: false,
      high_severity_count: 0,
      confidence,
      audit_log: [],
      summary: "No high-severity mismatches found — consistency penalty not applied.",
    };
  }

  if (confidence === "LOW") {
    // Record skipped entries for every high mismatch
    for (const m of highMismatches) {
      audit_log.push({
        mismatch_type: m.mismatch_type,
        raw_weight: BASE_WEIGHT.LOW,
        applied_weight: 0,
        dampening_applied: false,
        dampening_reasons: [],
        capped: false,
        skipped: true,
        skip_reason: "Confidence is LOW — weight not applied per policy",
      });
    }
    return {
      total_penalty: 0,
      status_gate_passed: true,
      severity_gate_passed: true,
      high_severity_count: highMismatches.length,
      confidence: "LOW",
      audit_log,
      summary: `${highMismatches.length} high-severity mismatch(es) detected but consistency check confidence is LOW — penalty not applied.`,
    };
  }

  // ── Rules 3 & 4: Dampening and cap per mismatch ───────────────────────────
  let runningBase = baseScoreBeforePenalty;
  let totalPenalty = 0;

  for (const m of highMismatches) {
    const rawWeight = BASE_WEIGHT[confidence];
    let weight = rawWeight;
    const dampeningReasons: string[] = [];
    let dampeningApplied = false;

    // Rule 3a: base score > 70 → −30%
    if (runningBase > HIGH_BASE_SCORE_THRESHOLD) {
      weight = weight * HIGH_BASE_SCORE_DAMPENING;
      dampeningReasons.push(`−30% (base score ${runningBase.toFixed(1)} > ${HIGH_BASE_SCORE_THRESHOLD})`);
      dampeningApplied = true;
    }

    // Rule 3b: ≥2 other high-weight factors → −20%
    if (highWeightTriggeredCount >= 2) {
      weight = weight * MULTI_FACTOR_DAMPENING;
      dampeningReasons.push(`−20% (${highWeightTriggeredCount} high-weight factors already triggered)`);
      dampeningApplied = true;
    }

    // Rule 4: cap at 15% of projected total
    const projectedTotal = Math.min(100, runningBase + weight);
    const maxAllowed = projectedTotal * MAX_CONTRIBUTION_FRACTION;
    let capped = false;
    if (weight > maxAllowed) {
      weight = maxAllowed;
      capped = true;
    }

    // Round to 1 decimal place
    const appliedWeight = Math.round(weight * 10) / 10;

    audit_log.push({
      mismatch_type: m.mismatch_type,
      raw_weight: rawWeight,
      applied_weight: appliedWeight,
      dampening_applied: dampeningApplied,
      dampening_reasons: dampeningReasons,
      capped,
      skipped: false,
    });

    runningBase += appliedWeight;
    totalPenalty += appliedWeight;
  }

  // Round total to 1 decimal place
  totalPenalty = Math.round(totalPenalty * 10) / 10;

  const dampenedCount = audit_log.filter((e) => e.dampening_applied).length;
  const cappedCount = audit_log.filter((e) => e.capped).length;

  const summaryParts: string[] = [
    `${highMismatches.length} high-severity mismatch(es) detected (confidence: ${confidence}).`,
    `Total penalty applied: +${totalPenalty} points.`,
  ];
  if (dampenedCount > 0) summaryParts.push(`Dampening applied to ${dampenedCount} mismatch(es).`);
  if (cappedCount > 0) summaryParts.push(`15% cap applied to ${cappedCount} mismatch(es).`);

  return {
    total_penalty: totalPenalty,
    status_gate_passed: true,
    severity_gate_passed: true,
    high_severity_count: highMismatches.length,
    confidence,
    audit_log,
    summary: summaryParts.join(" "),
  };
}

/**
 * Parse consistency_check_json safely from a raw DB value (string or object).
 * Returns null if the value is absent or unparseable.
 */
export function parseConsistencyCheckJson(
  raw: string | object | null | undefined
): ConsistencyCheckJson | null {
  if (!raw) return null;
  try {
    if (typeof raw === "string") return JSON.parse(raw) as ConsistencyCheckJson;
    return raw as ConsistencyCheckJson;
  } catch {
    return null;
  }
}
