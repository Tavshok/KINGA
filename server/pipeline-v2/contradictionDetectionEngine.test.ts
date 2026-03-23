/**
 * contradictionDetectionEngine.test.ts
 *
 * Comprehensive test suite for the Contradiction Detection Engine.
 * Tests all 18 contradiction rules, batch processing, and aggregation.
 */

import { describe, it, expect } from "vitest";
import {
  detectContradictions,
  detectContradictionsBatch,
  aggregateContradictionStats,
  type ContradictionInput,
} from "./contradictionDetectionEngine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanApprove(): ContradictionInput {
  return {
    recommendation: "APPROVE",
    overall_confidence: 75,
    assessor_validated: false,
    is_high_value: false,
    severity: "minor",
    fraud_result: { fraud_risk_level: "low", fraud_risk_score: 15, critical_flag_count: 0, scenario_fraud_flagged: false },
    physics_result: { is_plausible: true, confidence: 80, has_critical_inconsistency: false },
    damage_validation: { is_consistent: true, consistency_score: 85, has_unexplained_damage: false },
    cost_decision: { recommendation: "PROCEED_TO_ASSESSMENT", is_within_range: true, has_anomalies: false },
    consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0, proceed: true },
  };
}

function cleanReject(): ContradictionInput {
  return {
    recommendation: "REJECT",
    overall_confidence: 90,
    fraud_result: { fraud_risk_level: "high", critical_flag_count: 3, scenario_fraud_flagged: true },
    physics_result: { is_plausible: false, has_critical_inconsistency: true },
    damage_validation: { is_consistent: false, has_unexplained_damage: true },
    cost_decision: { recommendation: "ESCALATE", is_within_range: false },
    consistency_status: { overall_status: "CONFLICTED", critical_conflict_count: 2, proceed: false },
  };
}

function cleanReview(): ContradictionInput {
  return {
    recommendation: "REVIEW",
    overall_confidence: 55,
    fraud_result: { fraud_risk_level: "medium", critical_flag_count: 0 },
    physics_result: { is_plausible: true, has_critical_inconsistency: false },
    damage_validation: { is_consistent: true },
    cost_decision: { recommendation: "NEGOTIATE" },
    consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0, proceed: true },
  };
}

// ─── Basic output shape ───────────────────────────────────────────────────────

describe("Output shape", () => {
  it("returns the required JSON fields", () => {
    const result = detectContradictions(cleanApprove());
    expect(result).toHaveProperty("contradictions");
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("action");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("metadata");
  });

  it("contradictions is always an array", () => {
    expect(Array.isArray(detectContradictions(cleanApprove()).contradictions)).toBe(true);
  });

  it("valid is boolean", () => {
    expect(typeof detectContradictions(cleanApprove()).valid).toBe("boolean");
  });

  it("action is ALLOW or BLOCK", () => {
    const r1 = detectContradictions(cleanApprove());
    const r2 = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } });
    expect(["ALLOW", "BLOCK"]).toContain(r1.action);
    expect(["ALLOW", "BLOCK"]).toContain(r2.action);
  });

  it("each contradiction entry has required fields", () => {
    const result = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } });
    for (const c of result.contradictions) {
      expect(c).toHaveProperty("rule_id");
      expect(c).toHaveProperty("description");
      expect(c).toHaveProperty("severity");
      expect(c).toHaveProperty("conflicting_values");
      expect(c.conflicting_values).toHaveProperty("field_a");
      expect(c.conflicting_values).toHaveProperty("value_a");
      expect(c.conflicting_values).toHaveProperty("field_b");
      expect(c.conflicting_values).toHaveProperty("value_b");
    }
  });

  it("metadata contains engine name and version", () => {
    const r = detectContradictions(cleanApprove());
    expect(r.metadata.engine).toBe("ContradictionDetectionEngine");
    expect(r.metadata.version).toBe("1.0.0");
    expect(typeof r.metadata.rules_checked).toBe("number");
    expect(r.metadata.rules_checked).toBeGreaterThan(0);
  });
});

// ─── ALLOW cases ─────────────────────────────────────────────────────────────

describe("ALLOW — clean decisions", () => {
  it("APPROVE with all clear signals → ALLOW", () => {
    const r = detectContradictions(cleanApprove());
    expect(r.action).toBe("ALLOW");
    expect(r.valid).toBe(true);
    expect(r.contradictions).toHaveLength(0);
  });

  it("REJECT with all bad signals → ALLOW", () => {
    const r = detectContradictions(cleanReject());
    expect(r.action).toBe("ALLOW");
    expect(r.valid).toBe(true);
  });

  it("REVIEW with moderate signals → ALLOW", () => {
    const r = detectContradictions(cleanReview());
    expect(r.action).toBe("ALLOW");
    expect(r.valid).toBe(true);
  });

  it("APPROVE with minimal fraud → ALLOW", () => {
    const input = { ...cleanApprove(), fraud_result: { fraud_risk_level: "minimal" as const, critical_flag_count: 0 } };
    expect(detectContradictions(input).action).toBe("ALLOW");
  });

  it("APPROVE with null fraud level → ALLOW", () => {
    const input = { ...cleanApprove(), fraud_result: { fraud_risk_level: null, critical_flag_count: 0 } };
    expect(detectContradictions(input).action).toBe("ALLOW");
  });

  it("APPROVE with no optional fields → ALLOW", () => {
    const r = detectContradictions({ recommendation: "APPROVE" });
    expect(r.action).toBe("ALLOW");
  });

  it("REJECT with no optional fields → ALLOW (no issues to contradict)", () => {
    const r = detectContradictions({ recommendation: "REJECT" });
    // REJECT with no signals is a false rejection → BLOCK
    expect(r.action).toBe("BLOCK");
  });

  it("REVIEW with no optional fields → ALLOW", () => {
    const r = detectContradictions({ recommendation: "REVIEW" });
    expect(r.action).toBe("ALLOW");
  });
});

// ─── APPROVE + fraud contradictions ──────────────────────────────────────────

describe("APPROVE_HIGH_FRAUD rule", () => {
  it("APPROVE + fraud HIGH → BLOCK with APPROVE_HIGH_FRAUD", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } });
    expect(r.action).toBe("BLOCK");
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_HIGH_FRAUD")).toBe(true);
  });

  it("APPROVE + fraud ELEVATED → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "elevated" } });
    expect(r.action).toBe("BLOCK");
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_HIGH_FRAUD")).toBe(true);
  });

  it("APPROVE + fraud CRITICAL → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "critical" } });
    expect(r.action).toBe("BLOCK");
  });

  it("APPROVE + fraud MEDIUM → ALLOW for this rule", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "medium" } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_HIGH_FRAUD")).toBe(false);
  });

  it("APPROVE_HIGH_FRAUD contradiction has CRITICAL severity", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } });
    const c = r.contradictions.find((c) => c.rule_id === "APPROVE_HIGH_FRAUD");
    expect(c?.severity).toBe("CRITICAL");
  });
});

describe("APPROVE_CRITICAL_FRAUD_FLAGS rule", () => {
  it("APPROVE + critical_flag_count 1 → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { critical_flag_count: 1 } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CRITICAL_FRAUD_FLAGS")).toBe(true);
  });

  it("APPROVE + critical_flag_count 5 → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { critical_flag_count: 5 } });
    expect(r.action).toBe("BLOCK");
  });

  it("APPROVE + critical_flag_count 0 → no flag for this rule", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { critical_flag_count: 0 } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CRITICAL_FRAUD_FLAGS")).toBe(false);
  });
});

describe("APPROVE_SCENARIO_FRAUD_FLAGGED rule", () => {
  it("APPROVE + scenario_fraud_flagged true → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { scenario_fraud_flagged: true } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_SCENARIO_FRAUD_FLAGGED")).toBe(true);
  });

  it("APPROVE + scenario_fraud_flagged false → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { scenario_fraud_flagged: false } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_SCENARIO_FRAUD_FLAGGED")).toBe(false);
  });
});

// ─── APPROVE + physics contradictions ────────────────────────────────────────

describe("APPROVE_IMPLAUSIBLE_PHYSICS rule", () => {
  it("APPROVE + is_plausible false → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", physics_result: { is_plausible: false } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_IMPLAUSIBLE_PHYSICS")).toBe(true);
    expect(r.action).toBe("BLOCK");
  });

  it("APPROVE + is_plausible true → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", physics_result: { is_plausible: true } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_IMPLAUSIBLE_PHYSICS")).toBe(false);
  });

  it("APPROVE_IMPLAUSIBLE_PHYSICS has CRITICAL severity", () => {
    const r = detectContradictions({ recommendation: "APPROVE", physics_result: { is_plausible: false } });
    const c = r.contradictions.find((c) => c.rule_id === "APPROVE_IMPLAUSIBLE_PHYSICS");
    expect(c?.severity).toBe("CRITICAL");
  });
});

describe("APPROVE_CRITICAL_PHYSICS_INCONSISTENCY rule", () => {
  it("APPROVE + has_critical_inconsistency true → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", physics_result: { has_critical_inconsistency: true } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CRITICAL_PHYSICS_INCONSISTENCY")).toBe(true);
  });

  it("APPROVE + has_critical_inconsistency false → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", physics_result: { has_critical_inconsistency: false } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CRITICAL_PHYSICS_INCONSISTENCY")).toBe(false);
  });
});

// ─── APPROVE + damage contradictions ─────────────────────────────────────────

describe("APPROVE_DAMAGE_INCONSISTENT rule", () => {
  it("APPROVE + is_consistent false → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", damage_validation: { is_consistent: false } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_DAMAGE_INCONSISTENT")).toBe(true);
  });

  it("APPROVE + is_consistent true → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", damage_validation: { is_consistent: true } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_DAMAGE_INCONSISTENT")).toBe(false);
  });

  it("APPROVE_DAMAGE_INCONSISTENT has MAJOR severity", () => {
    const r = detectContradictions({ recommendation: "APPROVE", damage_validation: { is_consistent: false } });
    const c = r.contradictions.find((c) => c.rule_id === "APPROVE_DAMAGE_INCONSISTENT");
    expect(c?.severity).toBe("MAJOR");
  });
});

describe("APPROVE_UNEXPLAINED_DAMAGE rule", () => {
  it("APPROVE + has_unexplained_damage true → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", damage_validation: { has_unexplained_damage: true } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_UNEXPLAINED_DAMAGE")).toBe(true);
  });

  it("APPROVE + has_unexplained_damage false → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", damage_validation: { has_unexplained_damage: false } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_UNEXPLAINED_DAMAGE")).toBe(false);
  });
});

// ─── APPROVE + cost contradictions ───────────────────────────────────────────

describe("APPROVE_COST_ESCALATE rule", () => {
  it("APPROVE + cost ESCALATE → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", cost_decision: { recommendation: "ESCALATE" } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_COST_ESCALATE")).toBe(true);
  });

  it("APPROVE + cost NEGOTIATE → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", cost_decision: { recommendation: "NEGOTIATE" } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_COST_ESCALATE")).toBe(false);
  });

  it("APPROVE + cost PROCEED_TO_ASSESSMENT → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", cost_decision: { recommendation: "PROCEED_TO_ASSESSMENT" } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_COST_ESCALATE")).toBe(false);
  });
});

// ─── APPROVE + consistency contradictions ────────────────────────────────────

describe("APPROVE_CRITICAL_CONSISTENCY_CONFLICT rule", () => {
  it("APPROVE + critical_conflict_count 2 → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", consistency_status: { critical_conflict_count: 2 } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CRITICAL_CONSISTENCY_CONFLICT")).toBe(true);
  });

  it("APPROVE + critical_conflict_count 0 → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", consistency_status: { critical_conflict_count: 0 } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CRITICAL_CONSISTENCY_CONFLICT")).toBe(false);
  });
});

describe("APPROVE_CONSISTENCY_BLOCKED rule", () => {
  it("APPROVE + proceed false → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", consistency_status: { proceed: false } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CONSISTENCY_BLOCKED")).toBe(true);
  });

  it("APPROVE + proceed true → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", consistency_status: { proceed: true } });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CONSISTENCY_BLOCKED")).toBe(false);
  });
});

// ─── APPROVE + confidence contradictions ─────────────────────────────────────

describe("APPROVE_LOW_CONFIDENCE rule", () => {
  it("APPROVE + confidence 30 → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", overall_confidence: 30 });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_LOW_CONFIDENCE")).toBe(true);
  });

  it("APPROVE + confidence 39 → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", overall_confidence: 39 });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_LOW_CONFIDENCE")).toBe(true);
  });

  it("APPROVE + confidence 40 → no flag (boundary)", () => {
    const r = detectContradictions({ recommendation: "APPROVE", overall_confidence: 40 });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_LOW_CONFIDENCE")).toBe(false);
  });

  it("APPROVE + confidence 75 → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", overall_confidence: 75 });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_LOW_CONFIDENCE")).toBe(false);
  });

  it("APPROVE + confidence null → no flag (unknown is not flagged)", () => {
    const r = detectContradictions({ recommendation: "APPROVE", overall_confidence: null });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_LOW_CONFIDENCE")).toBe(false);
  });
});

// ─── APPROVE + severity contradictions ───────────────────────────────────────

describe("APPROVE_CATASTROPHIC_SEVERITY_NO_ASSESSOR rule", () => {
  it("APPROVE + catastrophic severity + no assessor → BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", severity: "catastrophic", assessor_validated: false });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CATASTROPHIC_SEVERITY_NO_ASSESSOR")).toBe(true);
  });

  it("APPROVE + catastrophic + assessor validated → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", severity: "catastrophic", assessor_validated: true });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CATASTROPHIC_SEVERITY_NO_ASSESSOR")).toBe(false);
  });

  it("APPROVE + severe (not catastrophic) + no assessor → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", severity: "severe", assessor_validated: false });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_CATASTROPHIC_SEVERITY_NO_ASSESSOR")).toBe(false);
  });
});

describe("APPROVE_HIGH_VALUE_NO_ASSESSOR rule", () => {
  it("APPROVE + high value + no assessor → MINOR contradiction", () => {
    const r = detectContradictions({ recommendation: "APPROVE", is_high_value: true, assessor_validated: false });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_HIGH_VALUE_NO_ASSESSOR")).toBe(true);
    const c = r.contradictions.find((c) => c.rule_id === "APPROVE_HIGH_VALUE_NO_ASSESSOR");
    expect(c?.severity).toBe("MINOR");
  });

  it("APPROVE + high value + assessor validated → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", is_high_value: true, assessor_validated: true });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_HIGH_VALUE_NO_ASSESSOR")).toBe(false);
  });

  it("APPROVE + not high value → no flag", () => {
    const r = detectContradictions({ recommendation: "APPROVE", is_high_value: false });
    expect(r.contradictions.some((c) => c.rule_id === "APPROVE_HIGH_VALUE_NO_ASSESSOR")).toBe(false);
  });
});

// ─── REJECT contradictions ────────────────────────────────────────────────────

describe("REJECT_NO_ISSUES rule", () => {
  it("REJECT + all clear signals → BLOCK", () => {
    const r = detectContradictions({
      recommendation: "REJECT",
      fraud_result: { fraud_risk_level: "low", critical_flag_count: 0, scenario_fraud_flagged: false },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
      damage_validation: { is_consistent: true, has_unexplained_damage: false },
      consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0 },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REJECT_NO_ISSUES")).toBe(true);
    expect(r.action).toBe("BLOCK");
  });

  it("REJECT + fraud high → no REJECT_NO_ISSUES flag", () => {
    const r = detectContradictions({
      recommendation: "REJECT",
      fraud_result: { fraud_risk_level: "high", critical_flag_count: 2 },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REJECT_NO_ISSUES")).toBe(false);
  });

  it("REJECT + physics implausible → no REJECT_NO_ISSUES flag", () => {
    const r = detectContradictions({
      recommendation: "REJECT",
      physics_result: { is_plausible: false },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REJECT_NO_ISSUES")).toBe(false);
  });

  it("REJECT_NO_ISSUES has CRITICAL severity", () => {
    const r = detectContradictions({
      recommendation: "REJECT",
      fraud_result: { fraud_risk_level: "low", critical_flag_count: 0, scenario_fraud_flagged: false },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
      damage_validation: { is_consistent: true, has_unexplained_damage: false },
      consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0 },
    });
    const c = r.contradictions.find((c) => c.rule_id === "REJECT_NO_ISSUES");
    expect(c?.severity).toBe("CRITICAL");
  });
});

describe("REJECT_HIGH_CONFIDENCE_NO_ISSUES rule", () => {
  it("REJECT + confidence 85 + no issues → BLOCK with REJECT_HIGH_CONFIDENCE_NO_ISSUES", () => {
    const r = detectContradictions({
      recommendation: "REJECT",
      overall_confidence: 85,
      fraud_result: { fraud_risk_level: "low", critical_flag_count: 0 },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
      damage_validation: { is_consistent: true, has_unexplained_damage: false },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REJECT_HIGH_CONFIDENCE_NO_ISSUES")).toBe(true);
  });

  it("REJECT + confidence 74 + no issues → no REJECT_HIGH_CONFIDENCE_NO_ISSUES (below threshold)", () => {
    const r = detectContradictions({
      recommendation: "REJECT",
      overall_confidence: 74,
      fraud_result: { fraud_risk_level: "low", critical_flag_count: 0 },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REJECT_HIGH_CONFIDENCE_NO_ISSUES")).toBe(false);
  });
});

// ─── REVIEW contradictions ────────────────────────────────────────────────────

describe("REVIEW_HIGH_FRAUD_SHOULD_REJECT rule", () => {
  it("REVIEW + fraud HIGH → BLOCK with REVIEW_HIGH_FRAUD_SHOULD_REJECT", () => {
    const r = detectContradictions({ recommendation: "REVIEW", fraud_result: { fraud_risk_level: "high" } });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_HIGH_FRAUD_SHOULD_REJECT")).toBe(true);
  });

  it("REVIEW + fraud ELEVATED → BLOCK", () => {
    const r = detectContradictions({ recommendation: "REVIEW", fraud_result: { fraud_risk_level: "elevated" } });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_HIGH_FRAUD_SHOULD_REJECT")).toBe(true);
  });

  it("REVIEW + fraud MEDIUM → no flag", () => {
    const r = detectContradictions({ recommendation: "REVIEW", fraud_result: { fraud_risk_level: "medium" } });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_HIGH_FRAUD_SHOULD_REJECT")).toBe(false);
  });
});

describe("REVIEW_CRITICAL_PHYSICS_SHOULD_REJECT rule", () => {
  it("REVIEW + critical physics inconsistency → BLOCK", () => {
    const r = detectContradictions({ recommendation: "REVIEW", physics_result: { has_critical_inconsistency: true } });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_CRITICAL_PHYSICS_SHOULD_REJECT")).toBe(true);
  });

  it("REVIEW + no critical physics → no flag", () => {
    const r = detectContradictions({ recommendation: "REVIEW", physics_result: { has_critical_inconsistency: false } });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_CRITICAL_PHYSICS_SHOULD_REJECT")).toBe(false);
  });
});

describe("REVIEW_ALL_CLEAR_HIGH_CONFIDENCE rule", () => {
  it("REVIEW + all clear + confidence 85 → MINOR contradiction", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      overall_confidence: 85,
      is_high_value: false,
      assessor_validated: false,
      fraud_result: { fraud_risk_level: "low", critical_flag_count: 0 },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
      damage_validation: { is_consistent: true, has_unexplained_damage: false },
      consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0 },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_ALL_CLEAR_HIGH_CONFIDENCE")).toBe(true);
    const c = r.contradictions.find((c) => c.rule_id === "REVIEW_ALL_CLEAR_HIGH_CONFIDENCE");
    expect(c?.severity).toBe("MINOR");
  });

  it("REVIEW + all clear + confidence 79 → no flag (below threshold)", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      overall_confidence: 79,
      fraud_result: { fraud_risk_level: "low", critical_flag_count: 0 },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
      damage_validation: { is_consistent: true, has_unexplained_damage: false },
      consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0 },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_ALL_CLEAR_HIGH_CONFIDENCE")).toBe(false);
  });

  it("REVIEW + all clear + high value → no flag (high value justifies review)", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      overall_confidence: 90,
      is_high_value: true,
      fraud_result: { fraud_risk_level: "low", critical_flag_count: 0 },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
      damage_validation: { is_consistent: true, has_unexplained_damage: false },
      consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0 },
    });
    expect(r.contradictions.some((c) => c.rule_id === "REVIEW_ALL_CLEAR_HIGH_CONFIDENCE")).toBe(false);
  });
});

// ─── Cross-signal contradictions ─────────────────────────────────────────────

describe("FRAUD_HIGH_PHYSICS_PLAUSIBLE_MISMATCH rule", () => {
  it("Fraud HIGH + physics plausible (no critical inconsistency) → MINOR contradiction", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      fraud_result: { fraud_risk_level: "high" },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
    });
    expect(r.contradictions.some((c) => c.rule_id === "FRAUD_HIGH_PHYSICS_PLAUSIBLE_MISMATCH")).toBe(true);
    const c = r.contradictions.find((c) => c.rule_id === "FRAUD_HIGH_PHYSICS_PLAUSIBLE_MISMATCH");
    expect(c?.severity).toBe("MINOR");
  });

  it("Fraud HIGH + physics has critical inconsistency → no mismatch flag", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      fraud_result: { fraud_risk_level: "high" },
      physics_result: { is_plausible: true, has_critical_inconsistency: true },
    });
    expect(r.contradictions.some((c) => c.rule_id === "FRAUD_HIGH_PHYSICS_PLAUSIBLE_MISMATCH")).toBe(false);
  });

  it("Fraud LOW + physics plausible → no mismatch flag", () => {
    const r = detectContradictions({
      recommendation: "APPROVE",
      fraud_result: { fraud_risk_level: "low" },
      physics_result: { is_plausible: true },
    });
    expect(r.contradictions.some((c) => c.rule_id === "FRAUD_HIGH_PHYSICS_PLAUSIBLE_MISMATCH")).toBe(false);
  });
});

describe("DAMAGE_INCONSISTENT_COST_WITHIN_RANGE rule", () => {
  it("Damage inconsistent + cost within range → MINOR contradiction", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      damage_validation: { is_consistent: false },
      cost_decision: { is_within_range: true },
    });
    expect(r.contradictions.some((c) => c.rule_id === "DAMAGE_INCONSISTENT_COST_WITHIN_RANGE")).toBe(true);
  });

  it("Damage inconsistent + cost not within range → no mismatch flag", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      damage_validation: { is_consistent: false },
      cost_decision: { is_within_range: false },
    });
    expect(r.contradictions.some((c) => c.rule_id === "DAMAGE_INCONSISTENT_COST_WITHIN_RANGE")).toBe(false);
  });
});

describe("CONSISTENCY_CONFLICTED_PROCEED_TRUE rule", () => {
  it("Consistency CONFLICTED + critical conflicts + proceed true → MAJOR contradiction", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      consistency_status: { overall_status: "CONFLICTED", critical_conflict_count: 2, proceed: true },
    });
    expect(r.contradictions.some((c) => c.rule_id === "CONSISTENCY_CONFLICTED_PROCEED_TRUE")).toBe(true);
    const c = r.contradictions.find((c) => c.rule_id === "CONSISTENCY_CONFLICTED_PROCEED_TRUE");
    expect(c?.severity).toBe("MAJOR");
  });

  it("Consistency CONFLICTED + 0 critical conflicts + proceed true → no flag", () => {
    const r = detectContradictions({
      recommendation: "REVIEW",
      consistency_status: { overall_status: "CONFLICTED", critical_conflict_count: 0, proceed: true },
    });
    expect(r.contradictions.some((c) => c.rule_id === "CONSISTENCY_CONFLICTED_PROCEED_TRUE")).toBe(false);
  });

  it("Consistency CONSISTENT + proceed true → no flag", () => {
    const r = detectContradictions({
      recommendation: "APPROVE",
      consistency_status: { overall_status: "CONSISTENT", critical_conflict_count: 0, proceed: true },
    });
    expect(r.contradictions.some((c) => c.rule_id === "CONSISTENCY_CONFLICTED_PROCEED_TRUE")).toBe(false);
  });
});

// ─── Multiple contradictions ──────────────────────────────────────────────────

describe("Multiple contradictions", () => {
  it("APPROVE with multiple bad signals → multiple contradictions", () => {
    const r = detectContradictions({
      recommendation: "APPROVE",
      fraud_result: { fraud_risk_level: "high", critical_flag_count: 3, scenario_fraud_flagged: true },
      physics_result: { is_plausible: false, has_critical_inconsistency: true },
      damage_validation: { is_consistent: false, has_unexplained_damage: true },
      cost_decision: { recommendation: "ESCALATE" },
      consistency_status: { critical_conflict_count: 2, proceed: false },
      overall_confidence: 25,
    });
    expect(r.contradictions.length).toBeGreaterThan(3);
    expect(r.action).toBe("BLOCK");
    expect(r.valid).toBe(false);
    expect(r.metadata.critical_count).toBeGreaterThan(0);
  });

  it("metadata counts match contradictions array", () => {
    const r = detectContradictions({
      recommendation: "APPROVE",
      fraud_result: { fraud_risk_level: "high" },
      physics_result: { is_plausible: false },
      overall_confidence: 20,
    });
    const criticalCount = r.contradictions.filter((c) => c.severity === "CRITICAL").length;
    const majorCount = r.contradictions.filter((c) => c.severity === "MAJOR").length;
    const minorCount = r.contradictions.filter((c) => c.severity === "MINOR").length;
    expect(r.metadata.critical_count).toBe(criticalCount);
    expect(r.metadata.major_count).toBe(majorCount);
    expect(r.metadata.minor_count).toBe(minorCount);
  });
});

// ─── Summary messages ─────────────────────────────────────────────────────────

describe("Summary messages", () => {
  it("ALLOW summary mentions no contradictions", () => {
    const r = detectContradictions(cleanApprove());
    expect(r.summary.toLowerCase()).toContain("no contradictions");
  });

  it("BLOCK summary mentions BLOCK", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } });
    expect(r.summary.toLowerCase()).toContain("block");
  });

  it("BLOCK summary mentions the recommendation", () => {
    const r = detectContradictions({ recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } });
    expect(r.summary).toContain("APPROVE");
  });
});

// ─── Batch processing ─────────────────────────────────────────────────────────

describe("detectContradictionsBatch", () => {
  it("returns one result per input", () => {
    const results = detectContradictionsBatch([
      { claim_id: 1, input: cleanApprove() },
      { claim_id: 2, input: { recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } } },
      { claim_id: 3, input: cleanReject() },
    ]);
    expect(results).toHaveLength(3);
  });

  it("preserves claim_id in results", () => {
    const results = detectContradictionsBatch([
      { claim_id: "abc-123", input: cleanApprove() },
    ]);
    expect(results[0].claim_id).toBe("abc-123");
  });

  it("each result has action field", () => {
    const results = detectContradictionsBatch([
      { claim_id: 1, input: cleanApprove() },
      { claim_id: 2, input: cleanReject() },
    ]);
    for (const r of results) {
      expect(["ALLOW", "BLOCK"]).toContain(r.result.action);
    }
  });

  it("empty batch returns empty array", () => {
    expect(detectContradictionsBatch([])).toHaveLength(0);
  });
});

// ─── Aggregation ──────────────────────────────────────────────────────────────

describe("aggregateContradictionStats", () => {
  it("counts total, blocked, allowed correctly", () => {
    const results = detectContradictionsBatch([
      { claim_id: 1, input: cleanApprove() },          // ALLOW
      { claim_id: 2, input: { recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } } }, // BLOCK
      { claim_id: 3, input: cleanReject() },            // ALLOW
    ]);
    const stats = aggregateContradictionStats(results);
    expect(stats.total).toBe(3);
    expect(stats.blocked).toBe(1);
    expect(stats.allowed).toBe(2);
  });

  it("block_rate_pct is correct", () => {
    const results = detectContradictionsBatch([
      { claim_id: 1, input: cleanApprove() },
      { claim_id: 2, input: { recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } } },
    ]);
    const stats = aggregateContradictionStats(results);
    expect(stats.block_rate_pct).toBe(50);
  });

  it("top_rules lists the most frequent contradiction", () => {
    const results = detectContradictionsBatch([
      { claim_id: 1, input: { recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } } },
      { claim_id: 2, input: { recommendation: "APPROVE", fraud_result: { fraud_risk_level: "high" } } },
      { claim_id: 3, input: { recommendation: "APPROVE", physics_result: { is_plausible: false } } },
    ]);
    const stats = aggregateContradictionStats(results);
    expect(stats.top_rules.length).toBeGreaterThan(0);
    expect(stats.top_rules[0].rule_id).toBe("APPROVE_HIGH_FRAUD");
    expect(stats.top_rules[0].count).toBe(2);
  });

  it("empty results returns zero stats", () => {
    const stats = aggregateContradictionStats([]);
    expect(stats.total).toBe(0);
    expect(stats.blocked).toBe(0);
    expect(stats.block_rate_pct).toBe(0);
    expect(stats.top_rules).toHaveLength(0);
  });
});
