/**
 * contradictionDetectionEngine.ts
 *
 * Contradiction Detection Engine — validates that a final decision is logically
 * consistent with all upstream pipeline stage outputs.
 *
 * Any logical inconsistency → action = "BLOCK"
 * No contradictions found   → action = "ALLOW"
 *
 * Return shape (matches the prompt contract):
 * {
 *   "contradictions": [],
 *   "valid": true/false,
 *   "action": "ALLOW | BLOCK"
 * }
 *
 * Contradiction examples checked:
 *   - APPROVE + fraud HIGH/ELEVATED
 *   - APPROVE + physics implausible / critical inconsistency
 *   - APPROVE + damage inconsistent
 *   - APPROVE + cost ESCALATE
 *   - APPROVE + consistency CONFLICTED with critical conflicts
 *   - APPROVE + overall confidence < 40
 *   - REJECT + no issues found (false rejection)
 *   - REJECT + fraud LOW/MINIMAL + physics plausible + damage consistent
 *   - REVIEW + all signals clear + confidence ≥ 80 (unnecessary review)
 *   - Severity CATASTROPHIC + recommendation APPROVE without assessor validation
 *   - Scenario fraud flagged + APPROVE
 *   - Critical flag count > 0 + APPROVE
 */

import type { FraudRiskLevel } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContradictionSeverity = "CRITICAL" | "MAJOR" | "MINOR";
export type ContradictionAction = "ALLOW" | "BLOCK";

export interface ContradictionEntry {
  /** Short identifier for this contradiction rule */
  rule_id: string;
  /** Human-readable description of the contradiction */
  description: string;
  /** Severity of this contradiction */
  severity: ContradictionSeverity;
  /** The two conflicting values */
  conflicting_values: {
    field_a: string;
    value_a: string;
    field_b: string;
    value_b: string;
  };
}

export interface ContradictionInput {
  /** The final recommendation being validated */
  recommendation: "APPROVE" | "REVIEW" | "REJECT";
  /** Overall confidence score (0-100) */
  overall_confidence?: number | null;
  /** Whether an assessor has manually validated this claim */
  assessor_validated?: boolean | null;
  /** Whether this is a high-value claim */
  is_high_value?: boolean | null;
  /** Assessed severity level */
  severity?: string | null;
  /** Fraud analysis result */
  fraud_result?: {
    fraud_risk_level?: FraudRiskLevel | string | null;
    fraud_risk_score?: number | null;
    critical_flag_count?: number | null;
    scenario_fraud_flagged?: boolean | null;
  } | null;
  /** Physics engine result */
  physics_result?: {
    is_plausible?: boolean | null;
    confidence?: number | null;
    has_critical_inconsistency?: boolean | null;
  } | null;
  /** Damage validation result */
  damage_validation?: {
    is_consistent?: boolean | null;
    consistency_score?: number | null;
    has_unexplained_damage?: boolean | null;
  } | null;
  /** Cost decision result */
  cost_decision?: {
    recommendation?: "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE" | null;
    is_within_range?: boolean | null;
    has_anomalies?: boolean | null;
  } | null;
  /** Cross-engine consistency status */
  consistency_status?: {
    overall_status?: "CONSISTENT" | "CONFLICTED" | null;
    critical_conflict_count?: number | null;
    proceed?: boolean | null;
  } | null;
}

export interface ContradictionResult {
  /** List of all contradictions found */
  contradictions: ContradictionEntry[];
  /** Whether the decision is logically valid (no contradictions) */
  valid: boolean;
  /** ALLOW if no contradictions, BLOCK if any contradiction found */
  action: ContradictionAction;
  /** Summary message */
  summary: string;
  /** Engine metadata */
  metadata: {
    engine: "ContradictionDetectionEngine";
    version: "1.0.0";
    rules_checked: number;
    critical_count: number;
    major_count: number;
    minor_count: number;
    timestamp_utc: string;
  };
}

// ─── Rule Definitions ─────────────────────────────────────────────────────────

interface ContradictionRule {
  id: string;
  severity: ContradictionSeverity;
  description: (input: ContradictionInput) => string;
  field_a: string;
  field_b: string;
  value_a: (input: ContradictionInput) => string;
  value_b: (input: ContradictionInput) => string;
  check: (input: ContradictionInput) => boolean;
}

const HIGH_FRAUD_LEVELS: Set<string> = new Set(["high", "elevated", "critical"]);
const MODERATE_FRAUD_LEVELS: Set<string> = new Set(["medium"]);
const LOW_FRAUD_LEVELS: Set<string> = new Set(["low", "minimal"]);

const CONTRADICTION_RULES: ContradictionRule[] = [
  // ── APPROVE contradictions ──────────────────────────────────────────────────

  {
    id: "APPROVE_HIGH_FRAUD",
    severity: "CRITICAL",
    description: () =>
      "APPROVE issued despite fraud risk level being HIGH or ELEVATED. High-fraud claims must be REJECTED or REVIEWED.",
    field_a: "recommendation",
    field_b: "fraud_result.fraud_risk_level",
    value_a: () => "APPROVE",
    value_b: (i) => i.fraud_result?.fraud_risk_level ?? "unknown",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      HIGH_FRAUD_LEVELS.has((i.fraud_result?.fraud_risk_level ?? "").toLowerCase()),
  },

  {
    id: "APPROVE_CRITICAL_FRAUD_FLAGS",
    severity: "CRITICAL",
    description: (i) =>
      `APPROVE issued despite ${i.fraud_result?.critical_flag_count ?? 0} critical fraud flag(s) being present.`,
    field_a: "recommendation",
    field_b: "fraud_result.critical_flag_count",
    value_a: () => "APPROVE",
    value_b: (i) => String(i.fraud_result?.critical_flag_count ?? 0),
    check: (i) =>
      i.recommendation === "APPROVE" &&
      (i.fraud_result?.critical_flag_count ?? 0) > 0,
  },

  {
    id: "APPROVE_SCENARIO_FRAUD_FLAGGED",
    severity: "CRITICAL",
    description: () =>
      "APPROVE issued despite the scenario fraud engine flagging this claim as a known fraud pattern.",
    field_a: "recommendation",
    field_b: "fraud_result.scenario_fraud_flagged",
    value_a: () => "APPROVE",
    value_b: () => "true",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.fraud_result?.scenario_fraud_flagged === true,
  },

  {
    id: "APPROVE_IMPLAUSIBLE_PHYSICS",
    severity: "CRITICAL",
    description: () =>
      "APPROVE issued despite physics engine finding the claim physically implausible.",
    field_a: "recommendation",
    field_b: "physics_result.is_plausible",
    value_a: () => "APPROVE",
    value_b: () => "false",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.physics_result?.is_plausible === false,
  },

  {
    id: "APPROVE_CRITICAL_PHYSICS_INCONSISTENCY",
    severity: "CRITICAL",
    description: () =>
      "APPROVE issued despite a critical physical inconsistency being flagged by the physics engine.",
    field_a: "recommendation",
    field_b: "physics_result.has_critical_inconsistency",
    value_a: () => "APPROVE",
    value_b: () => "true",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.physics_result?.has_critical_inconsistency === true,
  },

  {
    id: "APPROVE_DAMAGE_INCONSISTENT",
    severity: "MAJOR",
    description: () =>
      "APPROVE issued despite damage validation finding the damage inconsistent with the reported incident.",
    field_a: "recommendation",
    field_b: "damage_validation.is_consistent",
    value_a: () => "APPROVE",
    value_b: () => "false",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.damage_validation?.is_consistent === false,
  },

  {
    id: "APPROVE_UNEXPLAINED_DAMAGE",
    severity: "MAJOR",
    description: () =>
      "APPROVE issued despite unexplained damage patterns being detected.",
    field_a: "recommendation",
    field_b: "damage_validation.has_unexplained_damage",
    value_a: () => "APPROVE",
    value_b: () => "true",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.damage_validation?.has_unexplained_damage === true,
  },

  {
    id: "APPROVE_COST_ESCALATE",
    severity: "MAJOR",
    description: () =>
      "APPROVE issued despite the cost engine recommending ESCALATE due to significant cost deviation.",
    field_a: "recommendation",
    field_b: "cost_decision.recommendation",
    value_a: () => "APPROVE",
    value_b: () => "ESCALATE",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.cost_decision?.recommendation === "ESCALATE",
  },

  {
    id: "APPROVE_CRITICAL_CONSISTENCY_CONFLICT",
    severity: "CRITICAL",
    description: (i) =>
      `APPROVE issued despite ${i.consistency_status?.critical_conflict_count ?? 0} critical cross-engine conflict(s) being detected.`,
    field_a: "recommendation",
    field_b: "consistency_status.critical_conflict_count",
    value_a: () => "APPROVE",
    value_b: (i) => String(i.consistency_status?.critical_conflict_count ?? 0),
    check: (i) =>
      i.recommendation === "APPROVE" &&
      (i.consistency_status?.critical_conflict_count ?? 0) > 0,
  },

  {
    id: "APPROVE_CONSISTENCY_BLOCKED",
    severity: "CRITICAL",
    description: () =>
      "APPROVE issued despite the consistency checker blocking the claim from proceeding.",
    field_a: "recommendation",
    field_b: "consistency_status.proceed",
    value_a: () => "APPROVE",
    value_b: () => "false",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.consistency_status?.proceed === false,
  },

  {
    id: "APPROVE_LOW_CONFIDENCE",
    severity: "MAJOR",
    description: (i) =>
      `APPROVE issued with overall confidence of ${i.overall_confidence ?? "unknown"}% — below the minimum threshold of 40%.`,
    field_a: "recommendation",
    field_b: "overall_confidence",
    value_a: () => "APPROVE",
    value_b: (i) => `${i.overall_confidence ?? "unknown"}%`,
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.overall_confidence != null &&
      i.overall_confidence < 40,
  },

  {
    id: "APPROVE_CATASTROPHIC_SEVERITY_NO_ASSESSOR",
    severity: "MAJOR",
    description: () =>
      "APPROVE issued for a CATASTROPHIC severity claim without assessor validation. Catastrophic claims require manual sign-off.",
    field_a: "recommendation",
    field_b: "severity",
    value_a: () => "APPROVE",
    value_b: () => "catastrophic",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      (i.severity ?? "").toLowerCase() === "catastrophic" &&
      !i.assessor_validated,
  },

  {
    id: "APPROVE_HIGH_VALUE_NO_ASSESSOR",
    severity: "MINOR",
    description: () =>
      "APPROVE issued for a high-value claim without assessor validation. High-value claims should be manually reviewed.",
    field_a: "recommendation",
    field_b: "is_high_value",
    value_a: () => "APPROVE",
    value_b: () => "true",
    check: (i) =>
      i.recommendation === "APPROVE" &&
      i.is_high_value === true &&
      !i.assessor_validated,
  },

  // ── REJECT contradictions ───────────────────────────────────────────────────

  {
    id: "REJECT_NO_ISSUES",
    severity: "CRITICAL",
    description: () =>
      "REJECT issued despite all signals being clear: fraud LOW, physics plausible, damage consistent, and no critical conflicts.",
    field_a: "recommendation",
    field_b: "all_signals",
    value_a: () => "REJECT",
    value_b: () => "all_clear",
    check: (i) => {
      if (i.recommendation !== "REJECT") return false;
      const fraudOk =
        !i.fraud_result?.fraud_risk_level ||
        LOW_FRAUD_LEVELS.has((i.fraud_result.fraud_risk_level ?? "").toLowerCase());
      const physicsOk =
        !i.physics_result ||
        (i.physics_result.is_plausible !== false &&
          !i.physics_result.has_critical_inconsistency);
      const damageOk =
        !i.damage_validation ||
        (i.damage_validation.is_consistent !== false &&
          !i.damage_validation.has_unexplained_damage);
      const consistencyOk =
        !i.consistency_status ||
        (i.consistency_status.overall_status !== "CONFLICTED" &&
          (i.consistency_status.critical_conflict_count ?? 0) === 0);
      const noFraudFlags = (i.fraud_result?.critical_flag_count ?? 0) === 0;
      const noScenarioFraud = !i.fraud_result?.scenario_fraud_flagged;
      return fraudOk && physicsOk && damageOk && consistencyOk && noFraudFlags && noScenarioFraud;
    },
  },

  {
    id: "REJECT_HIGH_CONFIDENCE_NO_ISSUES",
    severity: "MAJOR",
    description: (i) =>
      `REJECT issued with high confidence (${i.overall_confidence ?? "unknown"}%) but no critical issues detected. This may be a false rejection.`,
    field_a: "recommendation",
    field_b: "overall_confidence",
    value_a: () => "REJECT",
    value_b: (i) => `${i.overall_confidence ?? "unknown"}%`,
    check: (i) => {
      if (i.recommendation !== "REJECT") return false;
      if ((i.overall_confidence ?? 0) < 75) return false;
      const noHighFraud = !HIGH_FRAUD_LEVELS.has(
        (i.fraud_result?.fraud_risk_level ?? "").toLowerCase()
      );
      const noPhysicsIssue =
        i.physics_result?.is_plausible !== false &&
        !i.physics_result?.has_critical_inconsistency;
      const noDamageIssue =
        i.damage_validation?.is_consistent !== false &&
        !i.damage_validation?.has_unexplained_damage;
      const noFraudFlags = (i.fraud_result?.critical_flag_count ?? 0) === 0;
      return noHighFraud && noPhysicsIssue && noDamageIssue && noFraudFlags;
    },
  },

  // ── REVIEW contradictions ───────────────────────────────────────────────────

  {
    id: "REVIEW_HIGH_FRAUD_SHOULD_REJECT",
    severity: "MAJOR",
    description: () =>
      "REVIEW issued despite fraud risk being HIGH or ELEVATED — this should be REJECT.",
    field_a: "recommendation",
    field_b: "fraud_result.fraud_risk_level",
    value_a: () => "REVIEW",
    value_b: (i) => i.fraud_result?.fraud_risk_level ?? "unknown",
    check: (i) =>
      i.recommendation === "REVIEW" &&
      HIGH_FRAUD_LEVELS.has((i.fraud_result?.fraud_risk_level ?? "").toLowerCase()),
  },

  {
    id: "REVIEW_CRITICAL_PHYSICS_SHOULD_REJECT",
    severity: "MAJOR",
    description: () =>
      "REVIEW issued despite a critical physical inconsistency — this should be REJECT.",
    field_a: "recommendation",
    field_b: "physics_result.has_critical_inconsistency",
    value_a: () => "REVIEW",
    value_b: () => "true",
    check: (i) =>
      i.recommendation === "REVIEW" &&
      i.physics_result?.has_critical_inconsistency === true,
  },

  {
    id: "REVIEW_ALL_CLEAR_HIGH_CONFIDENCE",
    severity: "MINOR",
    description: (i) =>
      `REVIEW issued despite all signals being clear and confidence at ${i.overall_confidence ?? "unknown"}%. Consider APPROVE.`,
    field_a: "recommendation",
    field_b: "all_signals + confidence",
    value_a: () => "REVIEW",
    value_b: (i) => `all_clear + ${i.overall_confidence ?? "unknown"}%`,
    check: (i) => {
      if (i.recommendation !== "REVIEW") return false;
      if ((i.overall_confidence ?? 0) < 80) return false;
      if (i.is_high_value) return false;
      if (i.assessor_validated) return false;
      const fraudOk =
        !i.fraud_result?.fraud_risk_level ||
        LOW_FRAUD_LEVELS.has((i.fraud_result.fraud_risk_level ?? "").toLowerCase());
      const physicsOk =
        !i.physics_result ||
        (i.physics_result.is_plausible !== false &&
          !i.physics_result.has_critical_inconsistency);
      const damageOk =
        !i.damage_validation ||
        (i.damage_validation.is_consistent !== false &&
          !i.damage_validation.has_unexplained_damage);
      const consistencyOk =
        !i.consistency_status ||
        (i.consistency_status.overall_status !== "CONFLICTED" &&
          (i.consistency_status.critical_conflict_count ?? 0) === 0);
      const noFraudFlags = (i.fraud_result?.critical_flag_count ?? 0) === 0;
      return fraudOk && physicsOk && damageOk && consistencyOk && noFraudFlags;
    },
  },

  // ── Cross-signal contradictions ─────────────────────────────────────────────

  {
    id: "FRAUD_HIGH_PHYSICS_PLAUSIBLE_MISMATCH",
    severity: "MINOR",
    description: () =>
      "Fraud risk is HIGH but physics is marked plausible — these signals conflict and should be reviewed together.",
    field_a: "fraud_result.fraud_risk_level",
    field_b: "physics_result.is_plausible",
    value_a: (i) => i.fraud_result?.fraud_risk_level ?? "unknown",
    value_b: () => "true",
    check: (i) =>
      HIGH_FRAUD_LEVELS.has((i.fraud_result?.fraud_risk_level ?? "").toLowerCase()) &&
      i.physics_result?.is_plausible === true &&
      i.physics_result?.has_critical_inconsistency !== true,
  },

  {
    id: "DAMAGE_INCONSISTENT_COST_WITHIN_RANGE",
    severity: "MINOR",
    description: () =>
      "Damage is marked inconsistent but cost is within the expected range — these signals conflict.",
    field_a: "damage_validation.is_consistent",
    field_b: "cost_decision.is_within_range",
    value_a: () => "false",
    value_b: () => "true",
    check: (i) =>
      i.damage_validation?.is_consistent === false &&
      i.cost_decision?.is_within_range === true,
  },

  {
    id: "CONSISTENCY_CONFLICTED_PROCEED_TRUE",
    severity: "MAJOR",
    description: () =>
      "Cross-engine consistency status is CONFLICTED but proceed flag is true — contradictory gate state.",
    field_a: "consistency_status.overall_status",
    field_b: "consistency_status.proceed",
    value_a: () => "CONFLICTED",
    value_b: () => "true",
    check: (i) =>
      i.consistency_status?.overall_status === "CONFLICTED" &&
      (i.consistency_status?.critical_conflict_count ?? 0) > 0 &&
      i.consistency_status?.proceed === true,
  },
];

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Detect logical contradictions between pipeline stage outputs and the final decision.
 *
 * @param input - All relevant stage outputs and the final recommendation
 * @returns ContradictionResult with contradictions list, valid flag, and ALLOW/BLOCK action
 */
export function detectContradictions(input: ContradictionInput): ContradictionResult {
  const contradictions: ContradictionEntry[] = [];

  for (const rule of CONTRADICTION_RULES) {
    if (rule.check(input)) {
      contradictions.push({
        rule_id: rule.id,
        description: rule.description(input),
        severity: rule.severity,
        conflicting_values: {
          field_a: rule.field_a,
          value_a: rule.value_a(input),
          field_b: rule.field_b,
          value_b: rule.value_b(input),
        },
      });
    }
  }

  const valid = contradictions.length === 0;
  const action: ContradictionAction = valid ? "ALLOW" : "BLOCK";

  const criticalCount = contradictions.filter((c) => c.severity === "CRITICAL").length;
  const majorCount = contradictions.filter((c) => c.severity === "MAJOR").length;
  const minorCount = contradictions.filter((c) => c.severity === "MINOR").length;

  let summary: string;
  if (valid) {
    summary = `Decision ${input.recommendation} is logically consistent with all ${CONTRADICTION_RULES.length} rules checked. No contradictions found.`;
  } else {
    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} CRITICAL`);
    if (majorCount > 0) parts.push(`${majorCount} MAJOR`);
    if (minorCount > 0) parts.push(`${minorCount} MINOR`);
    summary = `Decision ${input.recommendation} blocked: ${parts.join(", ")} contradiction(s) detected. Review and correct the recommendation before proceeding.`;
  }

  return {
    contradictions,
    valid,
    action,
    summary,
    metadata: {
      engine: "ContradictionDetectionEngine",
      version: "1.0.0",
      rules_checked: CONTRADICTION_RULES.length,
      critical_count: criticalCount,
      major_count: majorCount,
      minor_count: minorCount,
      timestamp_utc: new Date().toISOString(),
    },
  };
}

/**
 * Validate a batch of decisions. Returns per-item results.
 */
export function detectContradictionsBatch(
  items: Array<{ claim_id: string | number; input: ContradictionInput }>
): Array<{ claim_id: string | number; result: ContradictionResult }> {
  return items.map((item) => ({
    claim_id: item.claim_id,
    result: detectContradictions(item.input),
  }));
}

/**
 * Aggregate contradiction stats across a batch of results.
 */
export function aggregateContradictionStats(
  results: Array<{ claim_id: string | number; result: ContradictionResult }>
): {
  total: number;
  blocked: number;
  allowed: number;
  block_rate_pct: number;
  top_rules: Array<{ rule_id: string; count: number; severity: ContradictionSeverity }>;
} {
  const total = results.length;
  const blocked = results.filter((r) => r.result.action === "BLOCK").length;
  const allowed = total - blocked;
  const block_rate_pct = total > 0 ? Math.round((blocked / total) * 100) : 0;

  // Count rule occurrences
  const ruleCounts = new Map<string, { count: number; severity: ContradictionSeverity }>();
  for (const r of results) {
    for (const c of r.result.contradictions) {
      const existing = ruleCounts.get(c.rule_id);
      if (existing) {
        existing.count++;
      } else {
        ruleCounts.set(c.rule_id, { count: 1, severity: c.severity });
      }
    }
  }

  const top_rules = Array.from(ruleCounts.entries())
    .map(([rule_id, { count, severity }]) => ({ rule_id, count, severity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { total, blocked, allowed, block_rate_pct, top_rules };
}
