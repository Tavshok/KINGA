/**
 * Stage 29 — Governed Consistency-to-Fraud Penalty Tests
 *
 * Covers all five rules:
 *   Rule 1 — Status gate
 *   Rule 2 — Severity gate
 *   Rule 3 — Dampening (base > 70 and/or multiple high factors)
 *   Rule 4 — 15% cap
 *   Rule 5 — Audit log completeness
 */
import { describe, it, expect } from "vitest";
import {
  computeConsistencyFraudPenalty,
  parseConsistencyCheckJson,
  type ConsistencyCheckJson,
} from "./consistencyFraudPenalty";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCheck(
  overrides: Partial<ConsistencyCheckJson> = {}
): ConsistencyCheckJson {
  return {
    status: "complete",
    confidence: "HIGH",
    mismatches: [
      { mismatch_type: "zone_mismatch", severity: "high", details: "Zone A vs Zone B" },
    ],
    ...overrides,
  };
}

// ─── Rule 1: Status gate ──────────────────────────────────────────────────────

describe("Rule 1 — Status gate", () => {
  it("skips penalty when consistencyCheckJson is null", () => {
    const result = computeConsistencyFraudPenalty(null, 40, 0);
    expect(result.total_penalty).toBe(0);
    expect(result.status_gate_passed).toBe(false);
    expect(result.audit_log).toHaveLength(0);
  });

  it("skips penalty when consistencyCheckJson is undefined", () => {
    const result = computeConsistencyFraudPenalty(undefined, 40, 0);
    expect(result.total_penalty).toBe(0);
    expect(result.status_gate_passed).toBe(false);
  });

  it("skips penalty when status is 'pending'", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ status: "pending" }),
      40,
      0
    );
    expect(result.total_penalty).toBe(0);
    expect(result.status_gate_passed).toBe(false);
  });

  it("skips penalty when status is 'error'", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ status: "error" }),
      40,
      0
    );
    expect(result.total_penalty).toBe(0);
    expect(result.status_gate_passed).toBe(false);
  });

  it("skips penalty when status is 'partial'", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ status: "partial" }),
      40,
      0
    );
    expect(result.total_penalty).toBe(0);
    expect(result.status_gate_passed).toBe(false);
  });

  it("passes gate when status is 'complete'", () => {
    const result = computeConsistencyFraudPenalty(makeCheck(), 40, 0);
    expect(result.status_gate_passed).toBe(true);
  });

  it("summary mentions status when gate fails", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ status: "pending" }),
      40,
      0
    );
    expect(result.summary).toContain("pending");
  });
});

// ─── Rule 2: Severity gate ────────────────────────────────────────────────────

describe("Rule 2 — Severity gate", () => {
  it("skips penalty when there are no high-severity mismatches", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({
        mismatches: [
          { mismatch_type: "zone_mismatch", severity: "medium" },
          { mismatch_type: "cost_mismatch", severity: "low" },
        ],
      }),
      40,
      0
    );
    expect(result.total_penalty).toBe(0);
    expect(result.severity_gate_passed).toBe(false);
    expect(result.high_severity_count).toBe(0);
  });

  it("skips penalty when mismatches array is empty", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ mismatches: [] }),
      40,
      0
    );
    expect(result.total_penalty).toBe(0);
    expect(result.severity_gate_passed).toBe(false);
  });

  it("skips penalty when mismatches field is absent", () => {
    const result = computeConsistencyFraudPenalty(
      { status: "complete", confidence: "HIGH" },
      40,
      0
    );
    expect(result.total_penalty).toBe(0);
    expect(result.severity_gate_passed).toBe(false);
  });

  it("applies penalty when at least one high-severity mismatch exists", () => {
    const result = computeConsistencyFraudPenalty(makeCheck(), 40, 0);
    expect(result.severity_gate_passed).toBe(true);
    expect(result.high_severity_count).toBe(1);
    expect(result.total_penalty).toBeGreaterThan(0);
  });

  it("counts only high-severity mismatches", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({
        mismatches: [
          { mismatch_type: "zone_mismatch", severity: "high" },
          { mismatch_type: "cost_mismatch", severity: "medium" },
          { mismatch_type: "direction_mismatch", severity: "high" },
        ],
      }),
      40,
      0
    );
    expect(result.high_severity_count).toBe(2);
    expect(result.audit_log).toHaveLength(2);
  });

  it("skips penalty when confidence is LOW even with high-severity mismatches", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ confidence: "LOW" }),
      40,
      0
    );
    expect(result.total_penalty).toBe(0);
    expect(result.severity_gate_passed).toBe(true); // gate passed but LOW confidence skips
    expect(result.audit_log[0].skipped).toBe(true);
    expect(result.audit_log[0].skip_reason).toContain("LOW");
  });
});

// ─── Rule 3: Dampening ────────────────────────────────────────────────────────

describe("Rule 3 — Dampening", () => {
  it("applies −30% dampening when base score > 70", () => {
    // HIGH confidence → raw weight 12; base 75 > 70 → 12 * 0.7 = 8.4
    const result = computeConsistencyFraudPenalty(makeCheck(), 75, 0);
    expect(result.audit_log[0].dampening_applied).toBe(true);
    expect(result.audit_log[0].dampening_reasons.some((r) => r.includes("−30%"))).toBe(true);
    // raw 12 * 0.7 = 8.4; projected total = 75 + 8.4 = 83.4; max 15% = 12.51 → no cap
    expect(result.audit_log[0].applied_weight).toBeCloseTo(8.4, 1);
  });

  it("does NOT apply −30% dampening when base score == 70 (boundary)", () => {
    const result = computeConsistencyFraudPenalty(makeCheck(), 70, 0);
    const reasons = result.audit_log[0].dampening_reasons;
    expect(reasons.some((r) => r.includes("−30%"))).toBe(false);
  });

  it("applies −20% dampening when highWeightTriggeredCount >= 2", () => {
    // HIGH confidence → raw weight 12; 2 high factors → 12 * 0.8 = 9.6
    // But 15% cap: projected = min(100, 40+9.6) = 49.6; max = 7.44 → capped to 7.4
    const result = computeConsistencyFraudPenalty(makeCheck(), 40, 2);
    expect(result.audit_log[0].dampening_applied).toBe(true);
    expect(result.audit_log[0].dampening_reasons.some((r) => r.includes("−20%"))).toBe(true);
    expect(result.audit_log[0].applied_weight).toBeCloseTo(7.4, 1);
  });

  it("does NOT apply −20% dampening when highWeightTriggeredCount == 1", () => {
    const result = computeConsistencyFraudPenalty(makeCheck(), 40, 1);
    const reasons = result.audit_log[0].dampening_reasons;
    expect(reasons.some((r) => r.includes("−20%"))).toBe(false);
  });

  it("applies both −30% and −20% dampening when both conditions are met", () => {
    // HIGH → 12 * 0.7 * 0.8 = 6.72
    const result = computeConsistencyFraudPenalty(makeCheck(), 75, 2);
    const reasons = result.audit_log[0].dampening_reasons;
    expect(reasons.some((r) => r.includes("−30%"))).toBe(true);
    expect(reasons.some((r) => r.includes("−20%"))).toBe(true);
    expect(result.audit_log[0].applied_weight).toBeCloseTo(6.7, 1);
  });

  it("MEDIUM confidence uses base weight 5 before dampening", () => {
    // MEDIUM → 5 * 0.7 = 3.5 (base > 70)
    const result = computeConsistencyFraudPenalty(
      makeCheck({ confidence: "MEDIUM" }),
      75,
      0
    );
    expect(result.audit_log[0].raw_weight).toBe(5);
    expect(result.audit_log[0].applied_weight).toBeCloseTo(3.5, 1);
  });

  it("no dampening when base <= 70 and highWeightTriggeredCount < 2", () => {
    const result = computeConsistencyFraudPenalty(makeCheck(), 40, 0);
    expect(result.audit_log[0].dampening_applied).toBe(false);
    expect(result.audit_log[0].dampening_reasons).toHaveLength(0);
  });
});

// ─── Rule 4: 15% cap ─────────────────────────────────────────────────────────

describe("Rule 4 — 15% cap", () => {
  it("caps contribution to 15% of projected total score", () => {
    // HIGH → raw 12; base 0; projected total = min(100, 0+12) = 12; max = 12*0.15 = 1.8
    const result = computeConsistencyFraudPenalty(makeCheck(), 0, 0);
    expect(result.audit_log[0].capped).toBe(true);
    expect(result.audit_log[0].applied_weight).toBeCloseTo(1.8, 1);
  });

  it("does NOT cap when weight is within 15% of projected total", () => {
    // HIGH → 12; base 80; projected = min(100, 80+12) = 92; max = 92*0.15 = 13.8 > 12 → no cap
    // But base > 70 → dampening: 12 * 0.7 = 8.4; projected = min(100, 80+8.4) = 88.4; max = 88.4*0.15 = 13.26 > 8.4 → no cap
    const result = computeConsistencyFraudPenalty(makeCheck(), 80, 0);
    expect(result.audit_log[0].capped).toBe(false);
  });

  it("cap is applied after dampening", () => {
    // LOW base, no dampening: HIGH → 12; base 5; projected = 17; max = 2.55 → capped
    // After rounding to 1dp: Math.round(2.55 * 10) / 10 = 2.6
    const result = computeConsistencyFraudPenalty(makeCheck(), 5, 0);
    expect(result.audit_log[0].capped).toBe(true);
    expect(result.audit_log[0].applied_weight).toBeCloseTo(2.6, 1);
  });

  it("total_penalty equals sum of applied_weights across all mismatches", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({
        mismatches: [
          { mismatch_type: "zone_mismatch", severity: "high" },
          { mismatch_type: "direction_mismatch", severity: "high" },
        ],
      }),
      40,
      0
    );
    const sum = result.audit_log.reduce((acc, e) => acc + e.applied_weight, 0);
    expect(result.total_penalty).toBeCloseTo(Math.round(sum * 10) / 10, 1);
  });
});

// ─── Rule 5: Audit log ────────────────────────────────────────────────────────

describe("Rule 5 — Audit log", () => {
  it("produces one audit entry per high-severity mismatch", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({
        mismatches: [
          { mismatch_type: "zone_mismatch", severity: "high" },
          { mismatch_type: "cost_mismatch", severity: "high" },
          { mismatch_type: "direction_mismatch", severity: "medium" }, // excluded
        ],
      }),
      40,
      0
    );
    expect(result.audit_log).toHaveLength(2);
  });

  it("each audit entry has required fields", () => {
    const result = computeConsistencyFraudPenalty(makeCheck(), 40, 0);
    const entry = result.audit_log[0];
    expect(entry).toHaveProperty("mismatch_type");
    expect(entry).toHaveProperty("raw_weight");
    expect(entry).toHaveProperty("applied_weight");
    expect(entry).toHaveProperty("dampening_applied");
    expect(entry).toHaveProperty("dampening_reasons");
    expect(entry).toHaveProperty("capped");
    expect(entry).toHaveProperty("skipped");
  });

  it("preserves mismatch_type in audit entry", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({
        mismatches: [{ mismatch_type: "component_unreported", severity: "high" }],
      }),
      40,
      0
    );
    expect(result.audit_log[0].mismatch_type).toBe("component_unreported");
  });

  it("skipped entries have skip_reason populated", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ confidence: "LOW" }),
      40,
      0
    );
    expect(result.audit_log[0].skip_reason).toBeTruthy();
  });

  it("non-skipped entries have skip_reason undefined", () => {
    const result = computeConsistencyFraudPenalty(makeCheck(), 40, 0);
    expect(result.audit_log[0].skip_reason).toBeUndefined();
  });

  it("audit log is empty when status gate fails", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ status: "pending" }),
      40,
      0
    );
    expect(result.audit_log).toHaveLength(0);
  });

  it("audit log is empty when severity gate fails", () => {
    const result = computeConsistencyFraudPenalty(
      makeCheck({ mismatches: [{ mismatch_type: "zone_mismatch", severity: "medium" }] }),
      40,
      0
    );
    expect(result.audit_log).toHaveLength(0);
  });

  it("summary is a non-empty string in all code paths", () => {
    const paths = [
      computeConsistencyFraudPenalty(null, 40, 0),
      computeConsistencyFraudPenalty(makeCheck({ status: "pending" }), 40, 0),
      computeConsistencyFraudPenalty(makeCheck({ mismatches: [] }), 40, 0),
      computeConsistencyFraudPenalty(makeCheck({ confidence: "LOW" }), 40, 0),
      computeConsistencyFraudPenalty(makeCheck(), 40, 0),
      computeConsistencyFraudPenalty(makeCheck(), 75, 2),
    ];
    for (const r of paths) {
      expect(typeof r.summary).toBe("string");
      expect(r.summary.length).toBeGreaterThan(0);
    }
  });
});

// ─── Integration: computeWeightedFraudScore with consistencyCheckJson ─────────

describe("Integration — computeWeightedFraudScore with consistencyCheckJson", () => {
  it("returns penalty_audit_log and penalty_summary in the result", async () => {
    const { computeWeightedFraudScore } = await import("../weighted-fraud-scoring");
    const result = computeWeightedFraudScore({
      consistencyScore: 60,
      aiEstimatedCost: 10000,
      quotedAmount: 10000,
      impactDirection: "front",
      damageZones: ["front"],
      hasPreviousClaims: false,
      missingDataCount: 0,
      consistencyCheckJson: makeCheck(),
    });
    expect(result).toHaveProperty("penalty_audit_log");
    expect(result).toHaveProperty("penalty_summary");
    expect(Array.isArray(result.penalty_audit_log)).toBe(true);
  });

  it("Factor 7 is not triggered when consistency check status is pending", async () => {
    const { computeWeightedFraudScore } = await import("../weighted-fraud-scoring");
    const result = computeWeightedFraudScore({
      consistencyScore: 60,
      aiEstimatedCost: 10000,
      quotedAmount: 10000,
      impactDirection: "front",
      damageZones: ["front"],
      hasPreviousClaims: false,
      missingDataCount: 0,
      consistencyCheckJson: makeCheck({ status: "pending" }),
    });
    const factor7 = result.full_contributions.find(
      (c) => c.factor === "Multi-Source Damage Conflict"
    );
    expect(factor7?.triggered).toBe(false);
    expect(factor7?.value).toBe(0);
  });

  it("Factor 7 is triggered with HIGH confidence and high-severity mismatch", async () => {
    const { computeWeightedFraudScore } = await import("../weighted-fraud-scoring");
    const result = computeWeightedFraudScore({
      consistencyScore: 60,
      aiEstimatedCost: 10000,
      quotedAmount: 10000,
      impactDirection: "front",
      damageZones: ["front"],
      hasPreviousClaims: false,
      missingDataCount: 0,
      consistencyCheckJson: makeCheck(),
    });
    const factor7 = result.full_contributions.find(
      (c) => c.factor === "Multi-Source Damage Conflict"
    );
    expect(factor7?.triggered).toBe(true);
    expect(factor7?.value).toBeGreaterThan(0);
  });

  it("legacy multiSourceConflict path still works when consistencyCheckJson is absent", async () => {
    const { computeWeightedFraudScore } = await import("../weighted-fraud-scoring");
    const result = computeWeightedFraudScore({
      consistencyScore: 60,
      aiEstimatedCost: 10000,
      quotedAmount: 10000,
      impactDirection: "front",
      damageZones: ["front"],
      hasPreviousClaims: false,
      missingDataCount: 0,
      multiSourceConflict: {
        confidence: "HIGH",
        highSeverityMismatchCount: 1,
        details: "Zone conflict",
      },
    });
    const factor7 = result.full_contributions.find(
      (c) => c.factor === "Multi-Source Damage Conflict"
    );
    expect(factor7?.triggered).toBe(true);
  });
});

// ─── parseConsistencyCheckJson ────────────────────────────────────────────────

describe("parseConsistencyCheckJson", () => {
  it("returns null for null input", () => {
    expect(parseConsistencyCheckJson(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseConsistencyCheckJson(undefined)).toBeNull();
  });

  it("parses a valid JSON string", () => {
    const raw = JSON.stringify({ status: "complete", confidence: "HIGH", mismatches: [] });
    const result = parseConsistencyCheckJson(raw);
    expect(result?.status).toBe("complete");
  });

  it("returns the object directly when already parsed", () => {
    const obj = { status: "complete", confidence: "HIGH" as const };
    expect(parseConsistencyCheckJson(obj)).toBe(obj);
  });

  it("returns null for invalid JSON string", () => {
    expect(parseConsistencyCheckJson("{invalid json}")).toBeNull();
  });
});
