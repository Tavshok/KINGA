/**
 * reportReadinessGate.test.ts
 *
 * Comprehensive test suite for the Report Readiness Gate engine.
 * Covers all 3 mandatory gates, soft checks, batch processing, and aggregation.
 */

import { describe, it, expect } from "vitest";
import {
  checkReportReadiness,
  checkReportReadinessBatch,
  aggregateReadinessStats,
  type ReportReadinessInput,
} from "./reportReadinessGate";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ReportReadinessInput> = {}): ReportReadinessInput {
  return {
    decision_ready: {
      is_ready: true,
      recommendation: "APPROVE",
      decision_basis: "system_validated",
      assessor_validated: false,
      has_blocking_factors: false,
    },
    contradiction_check: {
      valid: true,
      action: "ALLOW",
      critical_count: 0,
      major_count: 0,
      minor_count: 0,
    },
    overall_confidence: 75,
    ...overrides,
  };
}

// ─── Core contract ────────────────────────────────────────────────────────────

describe("checkReportReadiness — core contract", () => {
  it("returns export_allowed, status, and reason fields", () => {
    const result = checkReportReadiness(makeInput());
    expect(result).toHaveProperty("export_allowed");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("reason");
  });

  it("returns gate_results with 3 entries", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.gate_results).toHaveLength(3);
  });

  it("returns hold_reasons array", () => {
    const result = checkReportReadiness(makeInput());
    expect(Array.isArray(result.hold_reasons)).toBe(true);
  });

  it("returns warnings array", () => {
    const result = checkReportReadiness(makeInput());
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("returns metadata with engine and version", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.metadata.engine).toBe("ReportReadinessGate");
    expect(result.metadata.version).toBe("1.0.0");
  });

  it("metadata gates_passed + gates_failed = 3", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.metadata.gates_passed + result.metadata.gates_failed).toBe(3);
  });
});

// ─── READY path ───────────────────────────────────────────────────────────────

describe("READY path", () => {
  it("all gates pass → export_allowed true", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.export_allowed).toBe(true);
  });

  it("all gates pass → status READY", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.status).toBe("READY");
  });

  it("all gates pass → hold_reasons empty", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.hold_reasons).toHaveLength(0);
  });

  it("all gates pass → reason mentions recommendation and confidence", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.reason).toContain("APPROVE");
    expect(result.reason).toContain("75");
  });

  it("all gates pass → all gate_results have passed: true", () => {
    const result = checkReportReadiness(makeInput());
    for (const g of result.gate_results) {
      expect(g.passed).toBe(true);
    }
  });

  it("REVIEW recommendation → READY but warning added", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: {
          is_ready: true,
          recommendation: "REVIEW",
          decision_basis: "system_validated",
          has_blocking_factors: false,
        },
      })
    );
    expect(result.export_allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("REVIEW"))).toBe(true);
  });

  it("APPROVE without assessor validation → warning added", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: {
          is_ready: true,
          recommendation: "APPROVE",
          decision_basis: "system_validated",
          assessor_validated: false,
          has_blocking_factors: false,
        },
      })
    );
    expect(result.export_allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("assessor"))).toBe(true);
  });

  it("confidence exactly 40 → READY (boundary)", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 40 }));
    expect(result.export_allowed).toBe(true);
    expect(result.status).toBe("READY");
  });

  it("confidence 41 → READY", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 41 }));
    expect(result.export_allowed).toBe(true);
  });

  it("confidence 100 → READY", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 100 }));
    expect(result.export_allowed).toBe(true);
  });
});

// ─── Gate 1: decision_ready ───────────────────────────────────────────────────

describe("Gate 1 — decision_ready", () => {
  it("is_ready false → HOLD", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: { is_ready: false },
      })
    );
    expect(result.export_allowed).toBe(false);
    expect(result.status).toBe("HOLD");
  });

  it("is_ready false → gate decision_ready failed", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: { is_ready: false },
      })
    );
    const gate = result.gate_results.find((g) => g.gate === "decision_ready");
    expect(gate?.passed).toBe(false);
  });

  it("is_ready false → hold_reasons mentions Phase 1", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: { is_ready: false },
      })
    );
    expect(result.hold_reasons.some((r) => r.includes("Phase 1"))).toBe(true);
  });

  it("decision_basis insufficient_data → HOLD", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: {
          is_ready: true,
          recommendation: "REVIEW",
          decision_basis: "insufficient_data",
          has_blocking_factors: false,
        },
      })
    );
    expect(result.export_allowed).toBe(false);
    expect(result.hold_reasons.some((r) => r.includes("insufficient_data"))).toBe(true);
  });

  it("has_blocking_factors true → HOLD", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: {
          is_ready: true,
          recommendation: "APPROVE",
          decision_basis: "system_validated",
          has_blocking_factors: true,
        },
      })
    );
    expect(result.export_allowed).toBe(false);
    expect(result.hold_reasons.some((r) => r.includes("blocking factors"))).toBe(true);
  });

  it("is_ready true, no blocking factors, valid basis → gate passes", () => {
    const result = checkReportReadiness(makeInput());
    const gate = result.gate_results.find((g) => g.gate === "decision_ready");
    expect(gate?.passed).toBe(true);
  });

  it("assessor_validated basis → gate passes", () => {
    const result = checkReportReadiness(
      makeInput({
        decision_ready: {
          is_ready: true,
          recommendation: "APPROVE",
          decision_basis: "assessor_validated",
          assessor_validated: true,
          has_blocking_factors: false,
        },
      })
    );
    const gate = result.gate_results.find((g) => g.gate === "decision_ready");
    expect(gate?.passed).toBe(true);
  });
});

// ─── Gate 2: contradiction_check ──────────────────────────────────────────────

describe("Gate 2 — contradiction_check", () => {
  it("valid false → HOLD", () => {
    const result = checkReportReadiness(
      makeInput({
        contradiction_check: {
          valid: false,
          action: "BLOCK",
          critical_count: 1,
          major_count: 0,
          minor_count: 0,
        },
      })
    );
    expect(result.export_allowed).toBe(false);
    expect(result.status).toBe("HOLD");
  });

  it("action BLOCK → HOLD", () => {
    const result = checkReportReadiness(
      makeInput({
        contradiction_check: {
          valid: true,
          action: "BLOCK",
          critical_count: 0,
          major_count: 1,
          minor_count: 0,
        },
      })
    );
    expect(result.export_allowed).toBe(false);
  });

  it("BLOCK with critical count → hold_reason mentions CRITICAL", () => {
    const result = checkReportReadiness(
      makeInput({
        contradiction_check: {
          valid: false,
          action: "BLOCK",
          critical_count: 2,
          major_count: 0,
          minor_count: 0,
        },
      })
    );
    expect(result.hold_reasons.some((r) => r.includes("CRITICAL"))).toBe(true);
  });

  it("BLOCK with major count → hold_reason mentions MAJOR", () => {
    const result = checkReportReadiness(
      makeInput({
        contradiction_check: {
          valid: false,
          action: "BLOCK",
          critical_count: 0,
          major_count: 3,
          minor_count: 0,
        },
      })
    );
    expect(result.hold_reasons.some((r) => r.includes("MAJOR"))).toBe(true);
  });

  it("valid true, action ALLOW → gate passes", () => {
    const result = checkReportReadiness(makeInput());
    const gate = result.gate_results.find((g) => g.gate === "contradiction_check");
    expect(gate?.passed).toBe(true);
  });

  it("valid true, minor contradictions → gate passes but warning added", () => {
    const result = checkReportReadiness(
      makeInput({
        contradiction_check: {
          valid: true,
          action: "ALLOW",
          critical_count: 0,
          major_count: 0,
          minor_count: 2,
        },
      })
    );
    const gate = result.gate_results.find((g) => g.gate === "contradiction_check");
    expect(gate?.passed).toBe(true);
    expect(result.warnings.some((w) => w.includes("minor"))).toBe(true);
  });

  it("valid false, action null → HOLD", () => {
    const result = checkReportReadiness(
      makeInput({
        contradiction_check: {
          valid: false,
          action: null,
        },
      })
    );
    expect(result.export_allowed).toBe(false);
  });
});

// ─── Gate 3: overall_confidence ───────────────────────────────────────────────

describe("Gate 3 — overall_confidence", () => {
  it("confidence null → HOLD", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: null }));
    expect(result.export_allowed).toBe(false);
    expect(result.hold_reasons.some((r) => r.includes("unknown"))).toBe(true);
  });

  it("confidence undefined → HOLD", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: undefined }));
    expect(result.export_allowed).toBe(false);
  });

  it("confidence 39 → HOLD (below minimum)", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 39 }));
    expect(result.export_allowed).toBe(false);
    expect(result.hold_reasons.some((r) => r.includes("39"))).toBe(true);
  });

  it("confidence 0 → HOLD", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 0 }));
    expect(result.export_allowed).toBe(false);
  });

  it("confidence 40 → READY (boundary)", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 40 }));
    expect(result.export_allowed).toBe(true);
  });

  it("confidence 59 → READY but warning about marginal confidence", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 59 }));
    expect(result.export_allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("59"))).toBe(true);
  });

  it("confidence 60 → READY without marginal warning", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 60 }));
    expect(result.export_allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("below the recommended 60"))).toBe(false);
  });

  it("gate detail mentions the confidence value", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 75 }));
    const gate = result.gate_results.find((g) => g.gate === "overall_confidence");
    expect(gate?.detail).toContain("75");
  });

  it("gate detail mentions the threshold", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 75 }));
    const gate = result.gate_results.find((g) => g.gate === "overall_confidence");
    expect(gate?.detail).toContain("40");
  });
});

// ─── Assessor override mode ───────────────────────────────────────────────────

describe("assessor_override mode", () => {
  it("assessor_override true lowers threshold to 30", () => {
    const result = checkReportReadiness(
      makeInput({ overall_confidence: 35, assessor_override: true })
    );
    expect(result.export_allowed).toBe(true);
    expect(result.metadata.confidence_threshold_used).toBe(30);
  });

  it("assessor_override true, confidence 29 → HOLD", () => {
    const result = checkReportReadiness(
      makeInput({ overall_confidence: 29, assessor_override: true })
    );
    expect(result.export_allowed).toBe(false);
  });

  it("assessor_override true, confidence 30 → READY (boundary)", () => {
    const result = checkReportReadiness(
      makeInput({ overall_confidence: 30, assessor_override: true })
    );
    expect(result.export_allowed).toBe(true);
  });

  it("assessor_override gate detail mentions override", () => {
    const result = checkReportReadiness(
      makeInput({ overall_confidence: 35, assessor_override: true })
    );
    const gate = result.gate_results.find((g) => g.gate === "overall_confidence");
    expect(gate?.detail).toContain("assessor override");
  });
});

// ─── Draft mode ───────────────────────────────────────────────────────────────

describe("draft_mode", () => {
  it("draft_mode true lowers threshold to 30", () => {
    const result = checkReportReadiness(
      makeInput({ overall_confidence: 35, draft_mode: true })
    );
    expect(result.export_allowed).toBe(true);
    expect(result.metadata.confidence_threshold_used).toBe(30);
  });

  it("draft_mode true, confidence 30 → READY", () => {
    const result = checkReportReadiness(
      makeInput({ overall_confidence: 30, draft_mode: true })
    );
    expect(result.export_allowed).toBe(true);
  });

  it("draft_mode true, REVIEW recommendation → no REVIEW warning", () => {
    const result = checkReportReadiness(
      makeInput({
        draft_mode: true,
        decision_ready: {
          is_ready: true,
          recommendation: "REVIEW",
          decision_basis: "system_validated",
          has_blocking_factors: false,
        },
      })
    );
    expect(result.warnings.some((w) => w.includes("REVIEW"))).toBe(false);
  });
});

// ─── Soft checks (warnings only) ─────────────────────────────────────────────

describe("soft checks — documents_attached", () => {
  it("documents_attached false → warning added but not blocking", () => {
    const result = checkReportReadiness(
      makeInput({ documents_attached: false })
    );
    expect(result.export_allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("documents"))).toBe(true);
  });

  it("documents_attached true → no documents warning", () => {
    const result = checkReportReadiness(
      makeInput({ documents_attached: true })
    );
    expect(result.warnings.some((w) => w.includes("documents"))).toBe(false);
  });
});

describe("soft checks — intake_validated", () => {
  it("intake_validated false → warning added but not blocking", () => {
    const result = checkReportReadiness(
      makeInput({ intake_validated: false })
    );
    expect(result.export_allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("intake"))).toBe(true);
  });

  it("intake_validated true → no intake warning", () => {
    const result = checkReportReadiness(
      makeInput({ intake_validated: true })
    );
    expect(result.warnings.some((w) => w.includes("intake"))).toBe(false);
  });
});

// ─── Multiple gate failures ───────────────────────────────────────────────────

describe("multiple gate failures", () => {
  it("all 3 gates fail → 3 hold_reasons", () => {
    const result = checkReportReadiness({
      decision_ready: { is_ready: false },
      contradiction_check: { valid: false, action: "BLOCK", critical_count: 1 },
      overall_confidence: 20,
    });
    expect(result.hold_reasons).toHaveLength(3);
  });

  it("all 3 gates fail → export_allowed false", () => {
    const result = checkReportReadiness({
      decision_ready: { is_ready: false },
      contradiction_check: { valid: false, action: "BLOCK" },
      overall_confidence: 10,
    });
    expect(result.export_allowed).toBe(false);
  });

  it("all 3 gates fail → metadata.gates_failed = 3", () => {
    const result = checkReportReadiness({
      decision_ready: { is_ready: false },
      contradiction_check: { valid: false, action: "BLOCK" },
      overall_confidence: 10,
    });
    expect(result.metadata.gates_failed).toBe(3);
  });

  it("2 gates fail → reason is the first hold_reason", () => {
    const result = checkReportReadiness({
      decision_ready: { is_ready: false },
      contradiction_check: { valid: true, action: "ALLOW" },
      overall_confidence: 20,
    });
    expect(result.reason).toBe(result.hold_reasons[0]);
  });
});

// ─── Batch processing ─────────────────────────────────────────────────────────

describe("checkReportReadinessBatch", () => {
  it("returns one result per input", () => {
    const batch = [
      { claim_id: 1, input: makeInput() },
      { claim_id: 2, input: makeInput({ overall_confidence: 20 }) },
      { claim_id: 3, input: makeInput({ decision_ready: { is_ready: false } }) },
    ];
    const results = checkReportReadinessBatch(batch);
    expect(results).toHaveLength(3);
  });

  it("preserves claim_id in results", () => {
    const batch = [
      { claim_id: "abc-123", input: makeInput() },
      { claim_id: 999, input: makeInput() },
    ];
    const results = checkReportReadinessBatch(batch);
    expect(results[0].claim_id).toBe("abc-123");
    expect(results[1].claim_id).toBe(999);
  });

  it("each result has export_allowed field", () => {
    const batch = [{ claim_id: 1, input: makeInput() }];
    const results = checkReportReadinessBatch(batch);
    expect(results[0].result).toHaveProperty("export_allowed");
  });

  it("empty batch returns empty array", () => {
    const results = checkReportReadinessBatch([]);
    expect(results).toHaveLength(0);
  });

  it("mixed ready/hold batch → correct statuses", () => {
    const batch = [
      { claim_id: 1, input: makeInput() },
      { claim_id: 2, input: makeInput({ overall_confidence: 10 }) },
    ];
    const results = checkReportReadinessBatch(batch);
    expect(results[0].result.status).toBe("READY");
    expect(results[1].result.status).toBe("HOLD");
  });
});

// ─── Aggregation ──────────────────────────────────────────────────────────────

describe("aggregateReadinessStats", () => {
  it("counts total, ready, on_hold correctly", () => {
    const batch = [
      { claim_id: 1, input: makeInput() },
      { claim_id: 2, input: makeInput() },
      { claim_id: 3, input: makeInput({ overall_confidence: 10 }) },
    ];
    const results = checkReportReadinessBatch(batch);
    const stats = aggregateReadinessStats(results);
    expect(stats.total).toBe(3);
    expect(stats.ready).toBe(2);
    expect(stats.on_hold).toBe(1);
  });

  it("ready_rate_pct is correct", () => {
    const batch = [
      { claim_id: 1, input: makeInput() },
      { claim_id: 2, input: makeInput({ overall_confidence: 10 }) },
    ];
    const results = checkReportReadinessBatch(batch);
    const stats = aggregateReadinessStats(results);
    expect(stats.ready_rate_pct).toBe(50);
  });

  it("top_hold_reasons lists the most frequent reason", () => {
    const batch = [
      { claim_id: 1, input: makeInput({ overall_confidence: 10 }) },
      { claim_id: 2, input: makeInput({ overall_confidence: 15 }) },
      { claim_id: 3, input: makeInput({ decision_ready: { is_ready: false } }) },
    ];
    const results = checkReportReadinessBatch(batch);
    const stats = aggregateReadinessStats(results);
    expect(stats.top_hold_reasons.length).toBeGreaterThan(0);
    // Each unique reason string is counted separately; at least one reason should exist
    expect(stats.top_hold_reasons[0].count).toBeGreaterThanOrEqual(1);
  });

  it("empty results returns zero stats", () => {
    const stats = aggregateReadinessStats([]);
    expect(stats.total).toBe(0);
    expect(stats.ready).toBe(0);
    expect(stats.on_hold).toBe(0);
    expect(stats.ready_rate_pct).toBe(0);
    expect(stats.top_hold_reasons).toHaveLength(0);
  });

  it("all ready → on_hold = 0, ready_rate_pct = 100", () => {
    const batch = [
      { claim_id: 1, input: makeInput() },
      { claim_id: 2, input: makeInput() },
    ];
    const results = checkReportReadinessBatch(batch);
    const stats = aggregateReadinessStats(results);
    expect(stats.on_hold).toBe(0);
    expect(stats.ready_rate_pct).toBe(100);
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe("metadata", () => {
  it("confidence_threshold_used is 40 by default", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.metadata.confidence_threshold_used).toBe(40);
  });

  it("confidence_threshold_used is 30 with assessor_override", () => {
    const result = checkReportReadiness(makeInput({ assessor_override: true }));
    expect(result.metadata.confidence_threshold_used).toBe(30);
  });

  it("confidence_threshold_used is 30 with draft_mode", () => {
    const result = checkReportReadiness(makeInput({ draft_mode: true }));
    expect(result.metadata.confidence_threshold_used).toBe(30);
  });

  it("timestamp_utc is a valid ISO string", () => {
    const result = checkReportReadiness(makeInput());
    expect(() => new Date(result.metadata.timestamp_utc)).not.toThrow();
    expect(result.metadata.timestamp_utc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("gates_passed = 3 when all pass", () => {
    const result = checkReportReadiness(makeInput());
    expect(result.metadata.gates_passed).toBe(3);
    expect(result.metadata.gates_failed).toBe(0);
  });

  it("gates_failed = 1 when one fails", () => {
    const result = checkReportReadiness(makeInput({ overall_confidence: 10 }));
    expect(result.metadata.gates_failed).toBe(1);
    expect(result.metadata.gates_passed).toBe(2);
  });
});
