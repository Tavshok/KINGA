/**
 * claimsDecisionAuthority.test.ts
 *
 * Comprehensive test suite for the Claims Decision Authority engine.
 * Tests all decision paths: APPROVE, REVIEW, REJECT, edge cases, and batch processing.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateClaimDecision,
  evaluateClaimDecisionBatch,
  aggregateDecisionSummary,
  type ClaimsDecisionInput,
  type BatchDecisionInput,
} from "./claimsDecisionAuthority";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApproveInput(overrides: Partial<ClaimsDecisionInput> = {}): ClaimsDecisionInput {
  return {
    scenario_type: "vehicle_collision",
    severity: "minor",
    overall_confidence: 75,
    physics_result: {
      is_plausible: true,
      confidence: 80,
      has_critical_inconsistency: false,
      summary: "Physics consistent with reported frontal collision at 40 km/h",
    },
    damage_validation: {
      is_consistent: true,
      consistency_score: 85,
      has_unexplained_damage: false,
      summary: "Damage consistent with reported incident",
    },
    fraud_result: {
      fraud_risk_level: "low",
      fraud_risk_score: 15,
      critical_flag_count: 0,
      scenario_fraud_flagged: false,
      reasoning: "No fraud indicators detected",
    },
    costDecision: {
      recommendation: "PROCEED_TO_ASSESSMENT",
      is_within_range: true,
      confidence: 78,
      has_anomalies: false,
      reasoning: "Cost within acceptable range",
    },
    consistency_status: {
      overall_status: "CONSISTENT",
      critical_conflict_count: 0,
      proceed: true,
      summary: "All engines agree",
    },
    assessor_validated: false,
    is_high_value: false,
    ...overrides,
  };
}

// ─── REJECT — Fraud ───────────────────────────────────────────────────────────

describe("REJECT — Fraud HIGH/ELEVATED", () => {
  it("rejects when fraud_risk_level is high", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high", fraud_risk_score: 80 },
    }));
    expect(result.recommendation).toBe("REJECT");
    expect(result.override_flags).toContain("fraud_risk_level=high");
  });

  it("rejects when fraud_risk_level is elevated", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "elevated", fraud_risk_score: 90 },
    }));
    expect(result.recommendation).toBe("REJECT");
    expect(result.override_flags).toContain("fraud_risk_level=elevated");
  });

  it("includes fraud risk in key_drivers on reject", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high", fraud_risk_score: 85 },
    }));
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("fraud"))).toBe(true);
  });

  it("includes fraud reasoning in key_drivers when provided", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: {
        fraud_risk_level: "high",
        fraud_risk_score: 85,
        reasoning: "Multiple staged accident indicators detected",
      },
    }));
    expect(result.key_drivers.some((d) => d.includes("Multiple staged"))).toBe(true);
  });

  it("sets decision_basis to system_validated when assessor not involved", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high" },
      assessor_validated: false,
    }));
    expect(result.decision_basis).toBe("system_validated");
  });

  it("sets decision_basis to assessor_validated when assessor validated", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high" },
      assessor_validated: true,
    }));
    expect(result.decision_basis).toBe("assessor_validated");
  });

  it("confidence is capped below 100 on fraud reject", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high", fraud_risk_score: 80 },
    }));
    expect(result.confidence).toBeLessThanOrEqual(95);
    expect(result.confidence).toBeGreaterThanOrEqual(10);
  });

  it("reasoning mentions fraud on fraud reject", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "elevated", fraud_risk_score: 92 },
    }));
    expect(result.reasoning.toLowerCase()).toContain("fraud");
  });

  it("decision_trace includes RULE-1 REJECT entry", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high" },
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-1] REJECT"))).toBe(true);
  });

  it("rejects even when all other signals are clean", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high", fraud_risk_score: 75 },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
      damage_validation: { is_consistent: true },
      overall_confidence: 90,
    }));
    expect(result.recommendation).toBe("REJECT");
  });

  it("infers fraud level from score when level not provided — high score → reject", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_score: 75, fraud_risk_level: null },
    }));
    expect(result.recommendation).toBe("REJECT");
  });

  it("infers fraud level from score — low score → approve", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_score: 10, fraud_risk_level: null },
    }));
    expect(result.recommendation).toBe("APPROVE");
  });
});

// ─── REJECT — Physics ─────────────────────────────────────────────────────────

describe("REJECT — Critical Physics Inconsistency", () => {
  it("rejects when has_critical_inconsistency is true", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { has_critical_inconsistency: true, is_plausible: false, confidence: 85 },
    }));
    expect(result.recommendation).toBe("REJECT");
    expect(result.override_flags).toContain("physics_critical_inconsistency=true");
  });

  it("includes physics inconsistency in key_drivers", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { has_critical_inconsistency: true },
    }));
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("physics"))).toBe(true);
  });

  it("uses physics confidence for output confidence", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { has_critical_inconsistency: true, confidence: 88 },
    }));
    expect(result.confidence).toBeLessThanOrEqual(90);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("reasoning mentions physical inconsistency", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { has_critical_inconsistency: true },
    }));
    expect(result.reasoning.toLowerCase()).toContain("inconsisten");
  });

  it("decision_trace includes RULE-2 REJECT entry", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { has_critical_inconsistency: true },
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-2] REJECT"))).toBe(true);
  });

  it("physics summary included in key_drivers when provided", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: {
        has_critical_inconsistency: true,
        summary: "Crush depth incompatible with stated speed",
      },
    }));
    expect(result.key_drivers.some((d) => d.includes("Crush depth"))).toBe(true);
  });

  it("rejects even when fraud is low", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { has_critical_inconsistency: true },
      fraud_result: { fraud_risk_level: "minimal", fraud_risk_score: 5 },
    }));
    expect(result.recommendation).toBe("REJECT");
  });
});

// ─── REJECT — Consistency ─────────────────────────────────────────────────────

describe("REJECT — Critical Consistency Conflicts", () => {
  it("rejects when proceed=false and critical_conflict_count > 0", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      consistency_status: {
        overall_status: "CONFLICTED",
        critical_conflict_count: 2,
        proceed: false,
        summary: "Critical speed and damage conflicts",
      },
    }));
    expect(result.recommendation).toBe("REJECT");
    expect(result.override_flags.some((f) => f.includes("critical_conflict_count"))).toBe(true);
  });

  it("does NOT reject when proceed=false but critical_conflict_count=0", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      consistency_status: {
        overall_status: "CONFLICTED",
        critical_conflict_count: 0,
        proceed: false,
      },
    }));
    // Should be REVIEW or APPROVE, not REJECT
    expect(result.recommendation).not.toBe("REJECT");
  });

  it("does NOT reject when proceed=true even with conflicts", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      consistency_status: {
        overall_status: "CONFLICTED",
        critical_conflict_count: 1,
        proceed: true,
      },
    }));
    expect(result.recommendation).not.toBe("REJECT");
  });

  it("decision_trace includes RULE-3 REJECT entry", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      consistency_status: { critical_conflict_count: 3, proceed: false },
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-3] REJECT"))).toBe(true);
  });

  it("conflict count appears in key_drivers", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      consistency_status: { critical_conflict_count: 2, proceed: false },
    }));
    expect(result.key_drivers.some((d) => d.includes("2"))).toBe(true);
  });
});

// ─── REVIEW — Moderate Fraud ──────────────────────────────────────────────────

describe("REVIEW — Moderate Fraud Risk", () => {
  it("sends to REVIEW when fraud_risk_level is medium", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "medium", fraud_risk_score: 50 },
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("includes medium fraud in key_drivers", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "medium" },
    }));
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("medium"))).toBe(true);
  });

  it("decision_trace includes RULE-4 REVIEW flag", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "medium" },
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-4] REVIEW"))).toBe(true);
  });
});

// ─── REVIEW — Low Confidence ──────────────────────────────────────────────────

describe("REVIEW — Low Confidence", () => {
  it("sends to REVIEW when overall_confidence is 59", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 59 }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("sends to REVIEW when overall_confidence is 40", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 40 }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("does NOT send to REVIEW on confidence alone when confidence is 60", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 60 }));
    // Should approve (all other signals clean)
    expect(result.recommendation).toBe("APPROVE");
  });

  it("includes low confidence in key_drivers", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 45 }));
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("confidence"))).toBe(true);
  });

  it("REVIEW confidence is capped at 75", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 55 }));
    expect(result.confidence).toBeLessThanOrEqual(75);
  });

  it("decision_trace includes RULE-5 REVIEW flag", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 50 }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-5] REVIEW"))).toBe(true);
  });

  it("skips confidence check when overall_confidence is null", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: null }));
    expect(result.warnings.some((w) => w.includes("overall_confidence"))).toBe(true);
  });
});

// ─── REVIEW — Physics Implausible (non-critical) ──────────────────────────────

describe("REVIEW — Physics Implausible (non-critical)", () => {
  it("sends to REVIEW when is_plausible=false without critical flag", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: {
        is_plausible: false,
        has_critical_inconsistency: false,
        confidence: 60,
      },
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("does NOT send to REVIEW when is_plausible=true", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("decision_trace includes RULE-6 REVIEW flag", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { is_plausible: false, has_critical_inconsistency: false },
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-6] REVIEW"))).toBe(true);
  });
});

// ─── REVIEW — Damage Inconsistency ───────────────────────────────────────────

describe("REVIEW — Damage Inconsistency", () => {
  it("sends to REVIEW when is_consistent=false", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      damage_validation: { is_consistent: false, consistency_score: 30 },
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("sends to REVIEW when has_unexplained_damage=true", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      damage_validation: { is_consistent: true, has_unexplained_damage: true },
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("includes damage inconsistency in key_drivers", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      damage_validation: { is_consistent: false },
    }));
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("damage"))).toBe(true);
  });

  it("includes damage summary in key_drivers when provided", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      damage_validation: {
        is_consistent: false,
        summary: "Rear damage inconsistent with frontal collision",
      },
    }));
    expect(result.key_drivers.some((d) => d.includes("Rear damage"))).toBe(true);
  });

  it("decision_trace includes RULE-7 REVIEW flag", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      damage_validation: { is_consistent: false },
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-7] REVIEW"))).toBe(true);
  });
});

// ─── REVIEW — Cost Escalation ─────────────────────────────────────────────────

describe("REVIEW — Cost Escalation", () => {
  it("sends to REVIEW when cost recommendation is ESCALATE", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      costDecision: { recommendation: "ESCALATE", confidence: 70 },
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("does NOT send to REVIEW for PROCEED_TO_ASSESSMENT", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      costDecision: { recommendation: "PROCEED_TO_ASSESSMENT" },
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("does NOT send to REVIEW for NEGOTIATE", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      costDecision: { recommendation: "NEGOTIATE" },
    }));
    // NEGOTIATE alone should not force REVIEW
    expect(result.recommendation).toBe("APPROVE");
  });

  it("decision_trace includes RULE-8 REVIEW flag", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      costDecision: { recommendation: "ESCALATE" },
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-8] REVIEW"))).toBe(true);
  });
});

// ─── REVIEW — High Severity ───────────────────────────────────────────────────

describe("REVIEW — High Severity", () => {
  it("sends to REVIEW when severity is severe and not assessor_validated", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      severity: "severe",
      assessor_validated: false,
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("sends to REVIEW when severity is catastrophic", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      severity: "catastrophic",
      assessor_validated: false,
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("does NOT force REVIEW for severe when assessor_validated=true", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      severity: "severe",
      assessor_validated: true,
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("does NOT force REVIEW for minor severity", () => {
    const result = evaluateClaimDecision(makeApproveInput({ severity: "minor" }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("does NOT force REVIEW for moderate severity", () => {
    const result = evaluateClaimDecision(makeApproveInput({ severity: "moderate" }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("decision_trace includes RULE-9 REVIEW flag for severe", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      severity: "severe",
      assessor_validated: false,
    }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-9] REVIEW"))).toBe(true);
  });
});

// ─── REVIEW — Insufficient Data ───────────────────────────────────────────────

describe("REVIEW — Insufficient Data", () => {
  it("sends to REVIEW when all critical inputs are missing", () => {
    const result = evaluateClaimDecision({
      scenario_type: "vehicle_collision",
      severity: "minor",
    });
    expect(result.recommendation).toBe("REVIEW");
  });

  it("sets decision_basis to insufficient_data when < 3 inputs", () => {
    const result = evaluateClaimDecision({
      scenario_type: "vehicle_collision",
    });
    expect(result.decision_basis).toBe("insufficient_data");
  });

  it("adds warning about missing inputs", () => {
    const result = evaluateClaimDecision({ scenario_type: "animal_strike" });
    expect(result.warnings.some((w) => w.includes("inputs"))).toBe(true);
  });

  it("decision_trace includes RULE-10 REVIEW flag", () => {
    const result = evaluateClaimDecision({ scenario_type: "vehicle_collision" });
    expect(result.decision_trace.some((t) => t.includes("[RULE-10] REVIEW"))).toBe(true);
  });
});

// ─── REVIEW — High Value ──────────────────────────────────────────────────────

describe("REVIEW — High Value Claim", () => {
  it("sends to REVIEW when is_high_value=true even if all signals clean", () => {
    const result = evaluateClaimDecision(makeApproveInput({ is_high_value: true }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("decision_trace includes RULE-11 REVIEW flag", () => {
    const result = evaluateClaimDecision(makeApproveInput({ is_high_value: true }));
    expect(result.decision_trace.some((t) => t.includes("[RULE-11] REVIEW"))).toBe(true);
  });

  it("does NOT force REVIEW when is_high_value=false", () => {
    const result = evaluateClaimDecision(makeApproveInput({ is_high_value: false }));
    expect(result.recommendation).toBe("APPROVE");
  });
});

// ─── APPROVE ──────────────────────────────────────────────────────────────────

describe("APPROVE — All Conditions Met", () => {
  it("approves a clean claim with all signals positive", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(result.recommendation).toBe("APPROVE");
  });

  it("confidence is at least 60 on APPROVE", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it("decision_basis is system_validated when not assessor_validated", () => {
    const result = evaluateClaimDecision(makeApproveInput({ assessor_validated: false }));
    expect(result.decision_basis).toBe("system_validated");
  });

  it("decision_basis is assessor_validated when assessor_validated=true", () => {
    const result = evaluateClaimDecision(makeApproveInput({ assessor_validated: true }));
    expect(result.decision_basis).toBe("assessor_validated");
  });

  it("key_drivers include damage consistent", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("damage consistent"))).toBe(true);
  });

  it("key_drivers include fraud risk level", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "minimal", fraud_risk_score: 5 },
    }));
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("fraud"))).toBe(true);
  });

  it("key_drivers include physics plausibility", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
    }));
    expect(result.key_drivers.some((d) => d.toLowerCase().includes("physics"))).toBe(true);
  });

  it("reasoning mentions approved", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(result.reasoning.toLowerCase()).toContain("approved");
  });

  it("blocking_factors is empty on APPROVE", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(result.blocking_factors).toHaveLength(0);
  });

  it("decision_trace includes APPROVE decision entry", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(result.decision_trace.some((t) => t.includes("[DECISION] APPROVE"))).toBe(true);
  });

  it("approves animal_strike with minimal fraud and consistent damage", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      scenario_type: "animal_strike",
      severity: "moderate",
      fraud_result: { fraud_risk_level: "minimal", fraud_risk_score: 8 },
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("approves when fraud_result is null but other signals are clean", () => {
    const result = evaluateClaimDecision(makeApproveInput({ fraud_result: null }));
    // No fraud data → no fraud REJECT/REVIEW triggered → depends on other signals
    // With all other signals clean and confidence 75, should approve
    expect(result.recommendation).toBe("APPROVE");
  });
});

// ─── Output Structure ─────────────────────────────────────────────────────────

describe("Output Structure", () => {
  it("always returns a recommendation", () => {
    const result = evaluateClaimDecision({});
    expect(["APPROVE", "REVIEW", "REJECT"]).toContain(result.recommendation);
  });

  it("confidence is always 0-100", () => {
    const inputs: ClaimsDecisionInput[] = [
      {},
      makeApproveInput(),
      makeApproveInput({ fraud_result: { fraud_risk_level: "high" } }),
      makeApproveInput({ overall_confidence: 30 }),
    ];
    for (const input of inputs) {
      const result = evaluateClaimDecision(input);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    }
  });

  it("key_drivers is always an array", () => {
    const result = evaluateClaimDecision({});
    expect(Array.isArray(result.key_drivers)).toBe(true);
  });

  it("key_drivers has at most 8 items", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(result.key_drivers.length).toBeLessThanOrEqual(8);
  });

  it("decision_trace is always a non-empty array", () => {
    const result = evaluateClaimDecision({});
    expect(Array.isArray(result.decision_trace)).toBe(true);
    expect(result.decision_trace.length).toBeGreaterThan(0);
  });

  it("metadata includes engine name", () => {
    const result = evaluateClaimDecision({});
    expect(result.metadata.engine).toBe("ClaimsDecisionAuthority");
  });

  it("metadata includes version", () => {
    const result = evaluateClaimDecision({});
    expect(result.metadata.version).toBe("1.0.0");
  });

  it("metadata includes timestamp_utc", () => {
    const result = evaluateClaimDecision({});
    expect(result.metadata.timestamp_utc).toBeTruthy();
    expect(new Date(result.metadata.timestamp_utc).getTime()).not.toBeNaN();
  });

  it("metadata includes inputs_available map", () => {
    const result = evaluateClaimDecision(makeApproveInput());
    expect(typeof result.metadata.inputs_available).toBe("object");
    expect(result.metadata.inputs_available.fraud_result).toBe(true);
  });

  it("reasoning is always a non-empty string", () => {
    const result = evaluateClaimDecision({});
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
  });
});

// ─── Priority Rules ───────────────────────────────────────────────────────────

describe("Decision Priority Rules", () => {
  it("REJECT (fraud) takes priority over REVIEW (low confidence)", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "high" },
      overall_confidence: 30,
    }));
    expect(result.recommendation).toBe("REJECT");
  });

  it("REJECT (physics) takes priority over REVIEW (medium fraud)", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      physics_result: { has_critical_inconsistency: true },
      fraud_result: { fraud_risk_level: "medium" },
    }));
    expect(result.recommendation).toBe("REJECT");
  });

  it("REJECT (fraud) takes priority over REJECT (physics) — fraud checked first", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "elevated" },
      physics_result: { has_critical_inconsistency: true },
    }));
    expect(result.recommendation).toBe("REJECT");
    // Fraud is checked first (RULE-1), so override flag should be fraud
    expect(result.override_flags.some((f) => f.includes("fraud"))).toBe(true);
  });

  it("multiple REVIEW conditions all appear in blocking_factors", () => {
    const result = evaluateClaimDecision(makeApproveInput({
      fraud_result: { fraud_risk_level: "medium" },
      overall_confidence: 45,
      damage_validation: { is_consistent: false },
    }));
    expect(result.recommendation).toBe("REVIEW");
    expect(result.blocking_factors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Batch Processing ─────────────────────────────────────────────────────────

describe("Batch Processing", () => {
  it("processes multiple claims and returns results for each", () => {
    const batch: BatchDecisionInput[] = [
      { claim_id: "C001", input: makeApproveInput() },
      { claim_id: "C002", input: makeApproveInput({ fraud_result: { fraud_risk_level: "high" } }) },
      { claim_id: "C003", input: makeApproveInput({ overall_confidence: 45 }) },
    ];
    const results = evaluateClaimDecisionBatch(batch);
    expect(results).toHaveLength(3);
    expect(results[0].claim_id).toBe("C001");
    expect(results[0].result.recommendation).toBe("APPROVE");
    expect(results[1].result.recommendation).toBe("REJECT");
    expect(results[2].result.recommendation).toBe("REVIEW");
  });

  it("handles empty batch", () => {
    const results = evaluateClaimDecisionBatch([]);
    expect(results).toHaveLength(0);
  });

  it("preserves claim_id in results", () => {
    const batch: BatchDecisionInput[] = [
      { claim_id: 42, input: makeApproveInput() },
    ];
    const results = evaluateClaimDecisionBatch(batch);
    expect(results[0].claim_id).toBe(42);
  });
});

// ─── Aggregate Summary ────────────────────────────────────────────────────────

describe("Aggregate Decision Summary", () => {
  it("returns zero summary for empty results", () => {
    const summary = aggregateDecisionSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.approve_count).toBe(0);
    expect(summary.average_confidence).toBe(0);
  });

  it("counts approve, review, reject correctly", () => {
    const batch: BatchDecisionInput[] = [
      { claim_id: 1, input: makeApproveInput() },
      { claim_id: 2, input: makeApproveInput() },
      { claim_id: 3, input: makeApproveInput({ fraud_result: { fraud_risk_level: "high" } }) },
      { claim_id: 4, input: makeApproveInput({ overall_confidence: 45 }) },
    ];
    const results = evaluateClaimDecisionBatch(batch);
    const summary = aggregateDecisionSummary(results);
    expect(summary.total).toBe(4);
    expect(summary.approve_count).toBe(2);
    expect(summary.reject_count).toBe(1);
    expect(summary.review_count).toBe(1);
  });

  it("rates sum to approximately 1.0", () => {
    const batch: BatchDecisionInput[] = [
      { claim_id: 1, input: makeApproveInput() },
      { claim_id: 2, input: makeApproveInput({ fraud_result: { fraud_risk_level: "high" } }) },
      { claim_id: 3, input: makeApproveInput({ overall_confidence: 45 }) },
    ];
    const results = evaluateClaimDecisionBatch(batch);
    const summary = aggregateDecisionSummary(results);
    const total = summary.approve_rate + summary.review_rate + summary.reject_rate;
    expect(Math.abs(total - 1.0)).toBeLessThan(0.01);
  });

  it("average_confidence is within 0-100", () => {
    const batch: BatchDecisionInput[] = [
      { claim_id: 1, input: makeApproveInput({ overall_confidence: 80 }) },
      { claim_id: 2, input: makeApproveInput({ overall_confidence: 60 }) },
    ];
    const results = evaluateClaimDecisionBatch(batch);
    const summary = aggregateDecisionSummary(results);
    expect(summary.average_confidence).toBeGreaterThanOrEqual(0);
    expect(summary.average_confidence).toBeLessThanOrEqual(100);
  });

  it("top_key_drivers has at most 10 entries", () => {
    const batch = Array.from({ length: 20 }, (_, i) => ({
      claim_id: i,
      input: makeApproveInput(),
    }));
    const results = evaluateClaimDecisionBatch(batch);
    const summary = aggregateDecisionSummary(results);
    expect(summary.top_key_drivers.length).toBeLessThanOrEqual(10);
  });

  it("by_decision_basis counts are correct", () => {
    const batch: BatchDecisionInput[] = [
      { claim_id: 1, input: makeApproveInput({ assessor_validated: true }) },
      { claim_id: 2, input: makeApproveInput({ assessor_validated: false }) },
    ];
    const results = evaluateClaimDecisionBatch(batch);
    const summary = aggregateDecisionSummary(results);
    expect(summary.by_decision_basis.assessor_validated).toBe(1);
    expect(summary.by_decision_basis.system_validated).toBe(1);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("handles completely empty input without throwing", () => {
    expect(() => evaluateClaimDecision({})).not.toThrow();
  });

  it("handles null values in all fields without throwing", () => {
    expect(() => evaluateClaimDecision({
      scenario_type: null,
      severity: null,
      physics_result: null,
      damage_validation: null,
      fraud_result: null,
      costDecision: null,
      overall_confidence: null,
      consistency_status: null,
      assessor_validated: null,
      is_high_value: null,
    })).not.toThrow();
  });

  it("handles confidence exactly at 60 — boundary is APPROVE", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 60 }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("handles confidence exactly at 59 — boundary is REVIEW", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 59 }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("handles unknown severity without throwing", () => {
    const result = evaluateClaimDecision(makeApproveInput({ severity: "unknown" }));
    expect(["APPROVE", "REVIEW", "REJECT"]).toContain(result.recommendation);
  });

  it("handles unknown scenario_type without throwing", () => {
    const result = evaluateClaimDecision(makeApproveInput({ scenario_type: "exotic_scenario" }));
    expect(["APPROVE", "REVIEW", "REJECT"]).toContain(result.recommendation);
  });

  it("confidence output is always an integer", () => {
    const result = evaluateClaimDecision(makeApproveInput({ overall_confidence: 73 }));
    expect(Number.isInteger(result.confidence)).toBe(true);
  });

  it("metadata scenario_type defaults to 'unknown' when not provided", () => {
    const result = evaluateClaimDecision({});
    expect(result.metadata.scenario_type).toBe("unknown");
  });

  it("metadata severity defaults to 'unknown' when not provided", () => {
    const result = evaluateClaimDecision({});
    expect(result.metadata.severity).toBe("unknown");
  });
});
