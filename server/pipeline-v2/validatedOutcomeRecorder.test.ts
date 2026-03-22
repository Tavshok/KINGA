/**
 * validatedOutcomeRecorder.test.ts
 *
 * Comprehensive test suite for the Validated Outcome Recorder.
 * Tests all admission rules, rejection paths, edge cases, and batch evaluation.
 */

import { describe, it, expect } from "vitest";
import {
  recordValidatedOutcome,
  evaluateBatchOutcomes,
  buildValidatedOutcomeInput,
  type ValidatedOutcomeInput,
  type ValidatedOutcomeResult,
} from "./validatedOutcomeRecorder";

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<{
  true_cost_usd: number | null;
  confidence: number | null;
  recommendation: string | null;
  assessor_present: boolean;
}>): ValidatedOutcomeInput {
  return {
    costDecision: {
      true_cost_usd: overrides.true_cost_usd !== undefined ? overrides.true_cost_usd : 5000,
      confidence: overrides.confidence !== undefined ? overrides.confidence : 75,
    },
    decision: {
      recommendation: overrides.recommendation !== undefined ? overrides.recommendation : "approve",
    },
    assessor_present: overrides.assessor_present !== undefined ? overrides.assessor_present : false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 1: ASSESSOR-VALIDATED → ALWAYS STORE (HIGH)
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 1: Assessor-validated outcomes", () => {
  it("stores assessor-validated outcome at HIGH tier", () => {
    const result = recordValidatedOutcome(makeInput({ assessor_present: true }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome even with low confidence (55)", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      confidence: 55,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome even with very low confidence (10)", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      confidence: 10,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome even with zero confidence", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      confidence: 0,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome with null confidence", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      confidence: null,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome with manual_review recommendation", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      recommendation: "manual_review",
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome with total_loss recommendation", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      recommendation: "total_loss",
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome with settle recommendation", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      recommendation: "settle",
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("stores assessor-validated outcome with partial_approval recommendation", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      recommendation: "partial_approval",
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("reason includes assessor confirmation language", () => {
    const result = recordValidatedOutcome(makeInput({ assessor_present: true }));
    expect(result.reason.toLowerCase()).toContain("assessor");
    expect(result.reason.toLowerCase()).toContain("high");
  });

  it("reason includes the cost amount", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      true_cost_usd: 12500,
    }));
    expect(result.reason).toContain("12500");
  });

  it("reason includes the recommendation", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      recommendation: "approve",
    }));
    expect(result.reason.toLowerCase()).toContain("approve");
  });

  // Mazda BT-50 cattle strike scenario
  it("stores Mazda BT-50 cattle strike assessor-validated outcome", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 18750, confidence: 88 },
      decision: { recommendation: "approve" },
      assessor_present: true,
    });
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
    expect(result.reason).toContain("18750");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 2: SYSTEM-OPTIMISED + CONFIDENCE ≥ 60 → STORE (MEDIUM)
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 2: System-optimised outcomes with sufficient confidence", () => {
  it("stores system-optimised outcome at MEDIUM tier when confidence = 60", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 60,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("stores system-optimised outcome at MEDIUM tier when confidence = 75", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 75,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("stores system-optimised outcome at MEDIUM tier when confidence = 100", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 100,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("stores system-optimised outcome at MEDIUM tier when confidence = 61", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 61,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("reason includes confidence score", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 72,
    }));
    expect(result.reason).toContain("72");
    expect(result.reason.toLowerCase()).toContain("medium");
  });

  it("reason includes threshold reference", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 65,
    }));
    expect(result.reason).toContain("60");
  });

  it("stores with approve_with_conditions recommendation", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 70,
      recommendation: "approve_with_conditions",
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("stores with manual_review recommendation at MEDIUM tier", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 65,
      recommendation: "manual_review",
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 3: DO NOT STORE — LOW CONFIDENCE
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 3: System-optimised outcomes below confidence threshold", () => {
  it("rejects system-optimised outcome when confidence = 59", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 59,
    }));
    expect(result.store).toBe(false);
    expect(result.quality_tier).toBe("LOW");
  });

  it("rejects system-optimised outcome when confidence = 0", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 0,
    }));
    expect(result.store).toBe(false);
    expect(result.quality_tier).toBe("LOW");
  });

  it("rejects system-optimised outcome when confidence = 1", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 1,
    }));
    expect(result.store).toBe(false);
  });

  it("rejects system-optimised outcome when confidence = 30", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 30,
    }));
    expect(result.store).toBe(false);
  });

  it("reason mentions confidence and threshold", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 45,
    }));
    expect(result.reason).toContain("45");
    expect(result.reason).toContain("60");
  });

  it("rejects when confidence is null and no assessor", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: null,
    }));
    expect(result.store).toBe(false);
    expect(result.quality_tier).toBe("LOW");
  });

  it("reason mentions missing confidence when null", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: null,
    }));
    expect(result.reason.toLowerCase()).toContain("missing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MISSING / INVALID COST
// ─────────────────────────────────────────────────────────────────────────────

describe("Missing or invalid true_cost_usd", () => {
  it("rejects when true_cost_usd is null", () => {
    const result = recordValidatedOutcome(makeInput({
      true_cost_usd: null,
      assessor_present: true,
    }));
    expect(result.store).toBe(false);
    expect(result.quality_tier).toBe("LOW");
  });

  it("rejects when true_cost_usd is 0", () => {
    const result = recordValidatedOutcome(makeInput({
      true_cost_usd: 0,
      assessor_present: true,
    }));
    expect(result.store).toBe(false);
  });

  it("rejects when true_cost_usd is negative", () => {
    const result = recordValidatedOutcome(makeInput({
      true_cost_usd: -100,
      assessor_present: true,
    }));
    expect(result.store).toBe(false);
  });

  it("rejects when true_cost_usd is undefined", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: undefined, confidence: 80 },
      decision: { recommendation: "approve" },
      assessor_present: true,
    });
    expect(result.store).toBe(false);
  });

  it("reason mentions missing cost when null", () => {
    const result = recordValidatedOutcome(makeInput({
      true_cost_usd: null,
      assessor_present: true,
    }));
    expect(result.reason.toLowerCase()).toContain("cost");
  });

  it("accepts small positive cost (e.g. $1)", () => {
    const result = recordValidatedOutcome(makeInput({
      true_cost_usd: 1,
      assessor_present: true,
    }));
    expect(result.store).toBe(true);
  });

  it("accepts large cost (e.g. $250,000)", () => {
    const result = recordValidatedOutcome(makeInput({
      true_cost_usd: 250000,
      assessor_present: true,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVALID RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("Invalid or non-learning recommendations", () => {
  it("rejects when recommendation is null", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: null,
      assessor_present: true,
    }));
    expect(result.store).toBe(false);
  });

  it("rejects when recommendation is 'declined'", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: "declined",
      assessor_present: true,
    }));
    expect(result.store).toBe(false);
  });

  it("rejects when recommendation is 'pending'", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: "pending",
      assessor_present: true,
    }));
    expect(result.store).toBe(false);
  });

  it("rejects when recommendation is empty string", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: "",
      assessor_present: true,
    }));
    expect(result.store).toBe(false);
  });

  it("rejects when recommendation is undefined", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 5000, confidence: 80 },
      decision: { recommendation: undefined },
      assessor_present: true,
    });
    expect(result.store).toBe(false);
  });

  it("reason mentions recommendation when invalid", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: "declined",
      assessor_present: true,
    }));
    expect(result.reason.toLowerCase()).toContain("declined");
  });

  it("accepts recommendation with mixed case (e.g. 'Approve')", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: "Approve",
      assessor_present: true,
    }));
    expect(result.store).toBe(true);
  });

  it("accepts recommendation with spaces (e.g. 'manual review')", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: "manual review",
      assessor_present: true,
    }));
    expect(result.store).toBe(true);
  });

  it("accepts 'approve_with_conditions' recommendation", () => {
    const result = recordValidatedOutcome(makeInput({
      recommendation: "approve_with_conditions",
      assessor_present: false,
      confidence: 70,
    }));
    expect(result.store).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe("Edge cases and boundary conditions", () => {
  it("confidence exactly at threshold (60) is admitted", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 60,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("confidence one below threshold (59) is rejected", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 59,
    }));
    expect(result.store).toBe(false);
  });

  it("confidence above 100 is clamped to 100 and admitted", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 150,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("confidence below 0 is clamped to 0 and rejected", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: -10,
    }));
    expect(result.store).toBe(false);
  });

  it("assessor_present=true overrides low confidence", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: true,
      confidence: 5,
    }));
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("assessor_present=false with confidence=59 is rejected", () => {
    const result = recordValidatedOutcome(makeInput({
      assessor_present: false,
      confidence: 59,
    }));
    expect(result.store).toBe(false);
  });

  it("all inputs null/undefined returns store=false", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: null, confidence: null },
      decision: { recommendation: null },
      assessor_present: false,
    });
    expect(result.store).toBe(false);
  });

  it("result always has a non-empty reason string", () => {
    const cases = [
      makeInput({ assessor_present: true }),
      makeInput({ assessor_present: false, confidence: 70 }),
      makeInput({ assessor_present: false, confidence: 30 }),
      makeInput({ true_cost_usd: null }),
      makeInput({ recommendation: "declined" }),
    ];
    for (const input of cases) {
      const result = recordValidatedOutcome(input);
      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(10);
    }
  });

  it("quality_tier is always LOW when store=false", () => {
    const rejectionCases = [
      makeInput({ true_cost_usd: null }),
      makeInput({ recommendation: "declined" }),
      makeInput({ assessor_present: false, confidence: 30 }),
      makeInput({ assessor_present: false, confidence: null }),
    ];
    for (const input of rejectionCases) {
      const result = recordValidatedOutcome(input);
      expect(result.store).toBe(false);
      expect(result.quality_tier).toBe("LOW");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BATCH EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

describe("Batch outcome evaluation", () => {
  it("returns correct totals for a mixed batch", () => {
    const inputs = [
      { ...makeInput({ assessor_present: true }), claim_id: "CLM-001" },
      { ...makeInput({ assessor_present: false, confidence: 75 }), claim_id: "CLM-002" },
      { ...makeInput({ assessor_present: false, confidence: 40 }), claim_id: "CLM-003" },
      { ...makeInput({ true_cost_usd: null }), claim_id: "CLM-004" },
      { ...makeInput({ assessor_present: true, recommendation: "total_loss" }), claim_id: "CLM-005" },
    ];
    const summary = evaluateBatchOutcomes(inputs);
    expect(summary.total).toBe(5);
    expect(summary.admitted).toBe(3);
    expect(summary.rejected).toBe(2);
    expect(summary.high_tier).toBe(2);
    expect(summary.medium_tier).toBe(1);
  });

  it("returns empty results for empty input", () => {
    const summary = evaluateBatchOutcomes([]);
    expect(summary.total).toBe(0);
    expect(summary.admitted).toBe(0);
    expect(summary.rejected).toBe(0);
    expect(summary.results).toHaveLength(0);
  });

  it("preserves claim_id in results", () => {
    const inputs = [
      { ...makeInput({ assessor_present: true }), claim_id: "CLM-999" },
    ];
    const summary = evaluateBatchOutcomes(inputs);
    expect(summary.results[0].claim_id).toBe("CLM-999");
  });

  it("all HIGH tier when all assessor-validated", () => {
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      ...makeInput({ assessor_present: true }),
      claim_id: i,
    }));
    const summary = evaluateBatchOutcomes(inputs);
    expect(summary.high_tier).toBe(5);
    expect(summary.medium_tier).toBe(0);
    expect(summary.admitted).toBe(5);
  });

  it("all rejected when all low confidence and no assessor", () => {
    const inputs = Array.from({ length: 3 }, (_, i) => ({
      ...makeInput({ assessor_present: false, confidence: 20 }),
      claim_id: i,
    }));
    const summary = evaluateBatchOutcomes(inputs);
    expect(summary.admitted).toBe(0);
    expect(summary.rejected).toBe(3);
  });

  it("index is preserved in batch results", () => {
    const inputs = [
      { ...makeInput({ assessor_present: true }), claim_id: "A" },
      { ...makeInput({ assessor_present: false, confidence: 70 }), claim_id: "B" },
    ];
    const summary = evaluateBatchOutcomes(inputs);
    expect(summary.results[0].index).toBe(0);
    expect(summary.results[1].index).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildValidatedOutcomeInput ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

describe("buildValidatedOutcomeInput adapter", () => {
  it("builds a valid input from pipeline params", () => {
    const input = buildValidatedOutcomeInput({
      trueCostUsd: 8500,
      decisionConfidence: 72,
      recommendation: "approve",
      assessorPresent: false,
    });
    expect(input.costDecision.true_cost_usd).toBe(8500);
    expect(input.costDecision.confidence).toBe(72);
    expect(input.decision.recommendation).toBe("approve");
    expect(input.assessor_present).toBe(false);
  });

  it("built input produces correct result when passed to recorder", () => {
    const input = buildValidatedOutcomeInput({
      trueCostUsd: 12000,
      decisionConfidence: 80,
      recommendation: "approve",
      assessorPresent: true,
    });
    const result = recordValidatedOutcome(input);
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("built input with null cost produces rejection", () => {
    const input = buildValidatedOutcomeInput({
      trueCostUsd: null,
      decisionConfidence: 90,
      recommendation: "approve",
      assessorPresent: true,
    });
    const result = recordValidatedOutcome(input);
    expect(result.store).toBe(false);
  });

  it("built input with low confidence produces rejection", () => {
    const input = buildValidatedOutcomeInput({
      trueCostUsd: 5000,
      decisionConfidence: 45,
      recommendation: "approve",
      assessorPresent: false,
    });
    const result = recordValidatedOutcome(input);
    expect(result.store).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REAL-WORLD SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

describe("Real-world claim scenarios", () => {
  it("Mazda BT-50 cattle strike — assessor present, HIGH tier", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 18750.00, confidence: 91 },
      decision: { recommendation: "approve" },
      assessor_present: true,
    });
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });

  it("Toyota Camry rear-end — system optimised, high confidence, MEDIUM tier", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 6200.00, confidence: 78 },
      decision: { recommendation: "approve" },
      assessor_present: false,
    });
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("Ford Ranger flood damage — system optimised, borderline confidence (60), MEDIUM tier", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 22000.00, confidence: 60 },
      decision: { recommendation: "total_loss" },
      assessor_present: false,
    });
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("MEDIUM");
  });

  it("Hyundai i30 windscreen — system optimised, low confidence (45), rejected", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 850.00, confidence: 45 },
      decision: { recommendation: "approve" },
      assessor_present: false,
    });
    expect(result.store).toBe(false);
  });

  it("Subaru Outback theft — declined recommendation, rejected even with assessor", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 35000.00, confidence: 95 },
      decision: { recommendation: "declined" },
      assessor_present: true,
    });
    expect(result.store).toBe(false);
  });

  it("Holden Commodore fire — pending outcome, rejected", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 14500.00, confidence: 70 },
      decision: { recommendation: "pending" },
      assessor_present: false,
    });
    expect(result.store).toBe(false);
  });

  it("Nissan Navara hail damage — assessor validated, no cost yet, rejected", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: null, confidence: 85 },
      decision: { recommendation: "approve" },
      assessor_present: true,
    });
    expect(result.store).toBe(false);
  });

  it("Tesla Model 3 collision — assessor validated, manual review, HIGH tier", () => {
    const result = recordValidatedOutcome({
      costDecision: { true_cost_usd: 28000.00, confidence: 55 },
      decision: { recommendation: "manual_review" },
      assessor_present: true,
    });
    expect(result.store).toBe(true);
    expect(result.quality_tier).toBe("HIGH");
  });
});
