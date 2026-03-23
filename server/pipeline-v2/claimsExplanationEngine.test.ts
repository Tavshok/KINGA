/**
 * claimsExplanationEngine.test.ts
 *
 * Comprehensive test suite for the Insurance Claims Explanation Engine.
 * Tests cover all recommendation types, driver humanisation, section generation,
 * professional language compliance, and batch processing.
 */

import { describe, it, expect } from "vitest";
import {
  generateClaimExplanation,
  generateClaimExplanationBatch,
  type ExplanationInput,
} from "./claimsExplanationEngine";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseApproveInput: ExplanationInput = {
  recommendation: "APPROVE",
  key_drivers: ["damage_consistent", "fraud_low", "physics_plausible"],
  reasoning: "All checks passed. Damage consistent, no fraud indicators, physics plausible.",
  confidence: 82,
  decision_basis: "system_validated",
  claim_reference: "CLM-2024-001",
  incident_type: "frontal",
  severity: "moderate",
  estimated_cost: 15000,
  currency: "USD",
  fraud_risk_level: "low",
  physics_plausible: true,
  damage_consistent: true,
  consistency_status: "CONSISTENT",
};

const baseReviewInput: ExplanationInput = {
  recommendation: "REVIEW",
  key_drivers: ["fraud_medium", "cost_escalation", "moderate_conflicts"],
  reasoning: "Moderate fraud indicators and cost escalation require manual review.",
  confidence: 52,
  decision_basis: "system_validated",
  incident_type: "rear",
  severity: "high",
  estimated_cost: 45000,
  fraud_risk_level: "medium",
  physics_plausible: true,
  damage_consistent: false,
};

const baseRejectInput: ExplanationInput = {
  recommendation: "REJECT",
  key_drivers: ["fraud_high", "physics_implausible", "critical_conflicts"],
  reasoning: "High fraud risk, physical inconsistency, and critical conflicts.",
  confidence: 88,
  decision_basis: "system_validated",
  incident_type: "side",
  severity: "critical",
  fraud_risk_level: "high",
  physics_plausible: false,
  damage_consistent: false,
  consistency_status: "CONFLICTED",
};

// ─── generateClaimExplanation — APPROVE ──────────────────────────────────────

describe("generateClaimExplanation — APPROVE", () => {
  it("returns a non-empty summary", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(20);
  });

  it("summary mentions approved/settlement language", () => {
    const result = generateClaimExplanation(baseApproveInput);
    const lower = result.summary.toLowerCase();
    expect(lower).toMatch(/approved|settlement|eligible/);
  });

  it("summary includes claim reference when provided", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.summary).toContain("CLM-2024-001");
  });

  it("summary includes estimated cost when provided", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.summary).toMatch(/\$15,000|\$15000|15,000/);
  });

  it("summary includes incident type", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.summary.toLowerCase()).toContain("frontal");
  });

  it("returns a non-empty detailed_explanation", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.detailed_explanation).toBeTruthy();
    expect(result.detailed_explanation.length).toBeGreaterThan(100);
  });

  it("detailed_explanation contains all section headings", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.detailed_explanation).toContain("Decision Basis");
    expect(result.detailed_explanation).toContain("Technical Findings");
    expect(result.detailed_explanation).toContain("Assessment Factors");
    expect(result.detailed_explanation).toContain("Recommended Action");
  });

  it("sections array has at least 4 entries", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.sections.length).toBeGreaterThanOrEqual(4);
  });

  it("metadata recommendation matches input", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.metadata.recommendation).toBe("APPROVE");
  });

  it("metadata confidence_band is HIGH for confidence 82", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.metadata.confidence_band).toBe("HIGH");
  });

  it("metadata decision_basis matches input", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.metadata.decision_basis).toBe("system_validated");
  });

  it("metadata generated_at is a valid ISO string", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(() => new Date(result.metadata.generated_at)).not.toThrow();
    expect(new Date(result.metadata.generated_at).getFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it("metadata engine and version are set", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.metadata.engine).toBeTruthy();
    expect(result.metadata.version).toMatch(/\d+\.\d+\.\d+/);
  });
});

// ─── generateClaimExplanation — REVIEW ───────────────────────────────────────

describe("generateClaimExplanation — REVIEW", () => {
  it("summary mentions review/referred language", () => {
    const result = generateClaimExplanation(baseReviewInput);
    const lower = result.summary.toLowerCase();
    expect(lower).toMatch(/review|referred|manual/);
  });

  it("summary does not mention settlement approval", () => {
    const result = generateClaimExplanation(baseReviewInput);
    const lower = result.summary.toLowerCase();
    expect(lower).not.toContain("approved for settlement");
  });

  it("detailed_explanation contains manual review language", () => {
    const result = generateClaimExplanation(baseReviewInput);
    expect(result.detailed_explanation.toLowerCase()).toMatch(/manual|adjuster|review/);
  });

  it("metadata confidence_band is LOW for confidence 52", () => {
    const result = generateClaimExplanation(baseReviewInput);
    expect(result.metadata.confidence_band).toBe("LOW");
  });

  it("metadata recommendation is REVIEW", () => {
    const result = generateClaimExplanation(baseReviewInput);
    expect(result.metadata.recommendation).toBe("REVIEW");
  });

  it("includes fraud risk section for medium fraud level", () => {
    const result = generateClaimExplanation(baseReviewInput);
    const hasFraudSection = result.sections.some((s) => s.heading === "Fraud Risk Assessment");
    expect(hasFraudSection).toBe(true);
  });

  it("fraud section body uses professional language for medium risk", () => {
    const result = generateClaimExplanation(baseReviewInput);
    const fraudSection = result.sections.find((s) => s.heading === "Fraud Risk Assessment");
    expect(fraudSection?.body.toLowerCase()).toMatch(/moderate|risk indicator|scrutin/);
  });
});

// ─── generateClaimExplanation — REJECT ───────────────────────────────────────

describe("generateClaimExplanation — REJECT", () => {
  it("summary mentions declined/ineligible language", () => {
    const result = generateClaimExplanation(baseRejectInput);
    const lower = result.summary.toLowerCase();
    expect(lower).toMatch(/declined|ineligible|reject/);
  });

  it("detailed_explanation contains decline letter language", () => {
    const result = generateClaimExplanation(baseRejectInput);
    expect(result.detailed_explanation.toLowerCase()).toMatch(/decline|policy provision|dispute/);
  });

  it("metadata confidence_band is HIGH for confidence 88", () => {
    const result = generateClaimExplanation(baseRejectInput);
    expect(result.metadata.confidence_band).toBe("HIGH");
  });

  it("includes fraud risk section for high fraud level", () => {
    const result = generateClaimExplanation(baseRejectInput);
    const hasFraudSection = result.sections.some((s) => s.heading === "Fraud Risk Assessment");
    expect(hasFraudSection).toBe(true);
  });

  it("fraud section body mentions SIU for high fraud", () => {
    const result = generateClaimExplanation(baseRejectInput);
    const fraudSection = result.sections.find((s) => s.heading === "Fraud Risk Assessment");
    expect(fraudSection?.body).toMatch(/SIU|Special Investigations/);
  });

  it("technical findings mention physical inconsistency", () => {
    const result = generateClaimExplanation(baseRejectInput);
    const techSection = result.sections.find((s) => s.heading === "Technical Findings");
    expect(techSection?.body.toLowerCase()).toMatch(/inconsisten|physical/);
  });

  it("technical findings mention data conflicts", () => {
    const result = generateClaimExplanation(baseRejectInput);
    const techSection = result.sections.find((s) => s.heading === "Technical Findings");
    expect(techSection?.body.toLowerCase()).toMatch(/conflict/);
  });
});

// ─── Professional Language Compliance ────────────────────────────────────────

describe("professional language compliance", () => {
  const inputs = [baseApproveInput, baseReviewInput, baseRejectInput];

  inputs.forEach((input) => {
    it(`does not mention 'AI' in ${input.recommendation} output`, () => {
      const result = generateClaimExplanation(input);
      const full = result.summary + " " + result.detailed_explanation;
      expect(full).not.toMatch(/\bAI\b|\bartificial intelligence\b/i);
    });

    it(`does not mention 'model' in ${input.recommendation} output`, () => {
      const result = generateClaimExplanation(input);
      const full = result.summary + " " + result.detailed_explanation;
      // Allow "model" only in context like "vehicle model" — check for standalone usage
      expect(full).not.toMatch(/\bML model\b|\bmachine learning model\b|\bpredictive model\b/i);
    });

    it(`does not mention 'algorithm' in ${input.recommendation} output`, () => {
      const result = generateClaimExplanation(input);
      const full = result.summary + " " + result.detailed_explanation;
      expect(full).not.toMatch(/\balgorithm\b/i);
    });

    it(`does not mention 'automated system' in ${input.recommendation} output`, () => {
      const result = generateClaimExplanation(input);
      const full = result.summary + " " + result.detailed_explanation;
      expect(full).not.toMatch(/automated system/i);
    });
  });
});

// ─── Decision Basis Variations ────────────────────────────────────────────────

describe("decision_basis variations", () => {
  it("assessor_validated basis uses assessor-confirmed language", () => {
    const input: ExplanationInput = {
      ...baseApproveInput,
      decision_basis: "assessor_validated",
    };
    const result = generateClaimExplanation(input);
    const basisSection = result.sections.find((s) => s.heading === "Decision Basis");
    expect(basisSection?.body.toLowerCase()).toMatch(/assessor|qualified/);
  });

  it("insufficient_data basis uses provisional language", () => {
    const input: ExplanationInput = {
      ...baseReviewInput,
      decision_basis: "insufficient_data",
    };
    const result = generateClaimExplanation(input);
    const basisSection = result.sections.find((s) => s.heading === "Decision Basis");
    expect(basisSection?.body.toLowerCase()).toMatch(/provisional|additional evidence/);
  });

  it("null decision_basis defaults gracefully", () => {
    const input: ExplanationInput = {
      ...baseApproveInput,
      decision_basis: null,
    };
    const result = generateClaimExplanation(input);
    expect(result.metadata.decision_basis).toBeNull();
    expect(result.sections.length).toBeGreaterThan(0);
  });
});

// ─── Confidence Band ──────────────────────────────────────────────────────────

describe("confidence_band mapping", () => {
  it("confidence 75+ → HIGH", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, confidence: 75 });
    expect(result.metadata.confidence_band).toBe("HIGH");
  });

  it("confidence 55–74 → MEDIUM", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, confidence: 60 });
    expect(result.metadata.confidence_band).toBe("MEDIUM");
  });

  it("confidence 40–54 → LOW", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, confidence: 45 });
    expect(result.metadata.confidence_band).toBe("LOW");
  });

  it("confidence < 40 → INSUFFICIENT", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, confidence: 30 });
    expect(result.metadata.confidence_band).toBe("INSUFFICIENT");
  });

  it("null confidence → INSUFFICIENT", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, confidence: null });
    expect(result.metadata.confidence_band).toBe("INSUFFICIENT");
  });

  it("confidence 100 → HIGH", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, confidence: 100 });
    expect(result.metadata.confidence_band).toBe("HIGH");
  });
});

// ─── Blocking Factors Section ─────────────────────────────────────────────────

describe("blocking_factors section", () => {
  it("includes blocking factors section when factors are present", () => {
    const input: ExplanationInput = {
      ...baseRejectInput,
      blocking_factors: ["fraud_high", "physics_implausible"],
    };
    const result = generateClaimExplanation(input);
    const hasSection = result.sections.some((s) => s.heading === "Conditions Preventing Settlement");
    expect(hasSection).toBe(true);
  });

  it("omits blocking factors section when no factors", () => {
    const input: ExplanationInput = {
      ...baseApproveInput,
      blocking_factors: [],
    };
    const result = generateClaimExplanation(input);
    const hasSection = result.sections.some((s) => s.heading === "Conditions Preventing Settlement");
    expect(hasSection).toBe(false);
  });

  it("blocking factors section uses professional language", () => {
    const input: ExplanationInput = {
      ...baseRejectInput,
      blocking_factors: ["fraud_high"],
    };
    const result = generateClaimExplanation(input);
    const section = result.sections.find((s) => s.heading === "Conditions Preventing Settlement");
    expect(section?.body.toLowerCase()).toMatch(/fraud|risk indicator/);
  });
});

// ─── Warnings Section ─────────────────────────────────────────────────────────

describe("warnings section", () => {
  it("includes advisory notes section when warnings present", () => {
    const input: ExplanationInput = {
      ...baseReviewInput,
      warnings: ["High-value claim — senior adjuster review required."],
    };
    const result = generateClaimExplanation(input);
    const hasSection = result.sections.some((s) => s.heading === "Advisory Notes");
    expect(hasSection).toBe(true);
  });

  it("omits advisory notes section when no warnings", () => {
    const input: ExplanationInput = {
      ...baseApproveInput,
      warnings: [],
    };
    const result = generateClaimExplanation(input);
    const hasSection = result.sections.some((s) => s.heading === "Advisory Notes");
    expect(hasSection).toBe(false);
  });

  it("warnings section body contains the warning text", () => {
    const input: ExplanationInput = {
      ...baseReviewInput,
      warnings: ["Policy excess has not been confirmed."],
    };
    const result = generateClaimExplanation(input);
    const section = result.sections.find((s) => s.heading === "Advisory Notes");
    expect(section?.body).toContain("Policy excess has not been confirmed");
  });
});

// ─── Fraud Risk Variations ────────────────────────────────────────────────────

describe("fraud_risk_level variations", () => {
  it("elevated fraud level includes elevated language", () => {
    const input: ExplanationInput = {
      ...baseReviewInput,
      fraud_risk_level: "elevated",
    };
    const result = generateClaimExplanation(input);
    const fraudSection = result.sections.find((s) => s.heading === "Fraud Risk Assessment");
    expect(fraudSection?.body.toLowerCase()).toMatch(/elevated|enhanced scrutin/);
  });

  it("none fraud level includes bona fide language", () => {
    const input: ExplanationInput = {
      ...baseApproveInput,
      fraud_risk_level: "none",
    };
    const result = generateClaimExplanation(input);
    const fraudSection = result.sections.find((s) => s.heading === "Fraud Risk Assessment");
    expect(fraudSection?.body.toLowerCase()).toMatch(/bona fide|no fraud/);
  });

  it("null fraud_risk_level omits fraud section", () => {
    const input: ExplanationInput = {
      ...baseApproveInput,
      fraud_risk_level: null,
    };
    const result = generateClaimExplanation(input);
    const hasFraudSection = result.sections.some((s) => s.heading === "Fraud Risk Assessment");
    expect(hasFraudSection).toBe(false);
  });
});

// ─── Cost and Currency ────────────────────────────────────────────────────────

describe("cost and currency formatting", () => {
  it("formats USD correctly in summary", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, estimated_cost: 25000, currency: "USD" });
    expect(result.summary).toMatch(/\$25,000/);
  });

  it("omits cost from summary when not provided", () => {
    const input: ExplanationInput = { ...baseApproveInput, estimated_cost: null };
    const result = generateClaimExplanation(input);
    expect(result.summary).not.toMatch(/\$/);
  });

  it("includes cost in technical findings section", () => {
    const result = generateClaimExplanation({ ...baseApproveInput, estimated_cost: 18500 });
    const techSection = result.sections.find((s) => s.heading === "Technical Findings");
    expect(techSection?.body).toMatch(/18,500/);
  });

  it("flags cost escalation in technical findings", () => {
    const input: ExplanationInput = {
      ...baseReviewInput,
      key_drivers: ["cost_escalation"],
      estimated_cost: 80000,
    };
    const result = generateClaimExplanation(input);
    const techSection = result.sections.find((s) => s.heading === "Technical Findings");
    expect(techSection?.body.toLowerCase()).toMatch(/exceed|range|review/);
  });
});

// ─── Incident Type Variations ─────────────────────────────────────────────────

describe("incident_type variations", () => {
  const types = ["frontal", "rear", "side", "rollover", "hail", "flood", "fire", "theft"];

  types.forEach((type) => {
    it(`handles incident_type '${type}' without error`, () => {
      const input: ExplanationInput = { ...baseApproveInput, incident_type: type };
      expect(() => generateClaimExplanation(input)).not.toThrow();
    });
  });

  it("uses generic label for unknown incident type", () => {
    const input: ExplanationInput = { ...baseApproveInput, incident_type: "unknown_event" };
    const result = generateClaimExplanation(input);
    expect(result.summary).toContain("unknown event");
  });

  it("uses generic label when incident_type is null", () => {
    const input: ExplanationInput = { ...baseApproveInput, incident_type: null };
    const result = generateClaimExplanation(input);
    expect(result.summary.toLowerCase()).toContain("vehicle incident");
  });
});

// ─── Empty / Minimal Inputs ───────────────────────────────────────────────────

describe("minimal input handling", () => {
  it("handles empty key_drivers without error", () => {
    const input: ExplanationInput = {
      recommendation: "APPROVE",
      key_drivers: [],
      reasoning: "",
    };
    expect(() => generateClaimExplanation(input)).not.toThrow();
  });

  it("handles empty key_drivers with fallback text", () => {
    const input: ExplanationInput = {
      recommendation: "APPROVE",
      key_drivers: [],
      reasoning: "",
    };
    const result = generateClaimExplanation(input);
    const factorsSection = result.sections.find((s) => s.heading === "Assessment Factors");
    expect(factorsSection?.body.toLowerCase()).toMatch(/no specific|not recorded/);
  });

  it("handles all optional fields as null/undefined", () => {
    const input: ExplanationInput = {
      recommendation: "REVIEW",
      key_drivers: ["fraud_medium"],
      reasoning: "Moderate risk.",
    };
    expect(() => generateClaimExplanation(input)).not.toThrow();
  });

  it("produces valid output with minimal input", () => {
    const input: ExplanationInput = {
      recommendation: "REJECT",
      key_drivers: ["fraud_high"],
      reasoning: "High fraud.",
    };
    const result = generateClaimExplanation(input);
    expect(result.summary).toBeTruthy();
    expect(result.detailed_explanation).toBeTruthy();
    expect(result.sections.length).toBeGreaterThan(0);
  });
});

// ─── Batch Processing ─────────────────────────────────────────────────────────

describe("generateClaimExplanationBatch", () => {
  it("processes multiple claims and returns correct count", () => {
    const batch = [
      { claim_id: 1, input: baseApproveInput },
      { claim_id: 2, input: baseReviewInput },
      { claim_id: 3, input: baseRejectInput },
    ];
    const results = generateClaimExplanationBatch(batch);
    expect(results).toHaveLength(3);
  });

  it("preserves claim_id in results", () => {
    const batch = [
      { claim_id: 42, input: baseApproveInput },
      { claim_id: "CLM-999", input: baseRejectInput },
    ];
    const results = generateClaimExplanationBatch(batch);
    expect(results[0].claim_id).toBe(42);
    expect(results[1].claim_id).toBe("CLM-999");
  });

  it("each result has summary and detailed_explanation", () => {
    const batch = [
      { claim_id: 1, input: baseApproveInput },
      { claim_id: 2, input: baseRejectInput },
    ];
    const results = generateClaimExplanationBatch(batch);
    results.forEach((r) => {
      expect(r.result.summary).toBeTruthy();
      expect(r.result.detailed_explanation).toBeTruthy();
    });
  });

  it("handles empty batch without error", () => {
    const results = generateClaimExplanationBatch([]);
    expect(results).toHaveLength(0);
  });

  it("each result recommendation matches input", () => {
    const batch = [
      { claim_id: 1, input: baseApproveInput },
      { claim_id: 2, input: baseReviewInput },
      { claim_id: 3, input: baseRejectInput },
    ];
    const results = generateClaimExplanationBatch(batch);
    expect(results[0].result.metadata.recommendation).toBe("APPROVE");
    expect(results[1].result.metadata.recommendation).toBe("REVIEW");
    expect(results[2].result.metadata.recommendation).toBe("REJECT");
  });
});

// ─── Sections Structure ───────────────────────────────────────────────────────

describe("sections structure", () => {
  it("every section has a non-empty heading", () => {
    const result = generateClaimExplanation(baseApproveInput);
    result.sections.forEach((s) => {
      expect(s.heading).toBeTruthy();
    });
  });

  it("every section has a non-empty body", () => {
    const result = generateClaimExplanation(baseApproveInput);
    result.sections.forEach((s) => {
      expect(s.body).toBeTruthy();
      expect(s.body.length).toBeGreaterThan(10);
    });
  });

  it("Decision Basis is always the first section", () => {
    const result = generateClaimExplanation(baseApproveInput);
    expect(result.sections[0].heading).toBe("Decision Basis");
  });

  it("Recommended Action is always the last section", () => {
    const result = generateClaimExplanation(baseApproveInput);
    const last = result.sections[result.sections.length - 1];
    expect(last.heading).toBe("Recommended Action");
  });

  it("detailed_explanation is built from sections", () => {
    const result = generateClaimExplanation(baseApproveInput);
    result.sections.forEach((s) => {
      expect(result.detailed_explanation).toContain(s.heading);
    });
  });
});
