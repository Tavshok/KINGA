/**
 * decisionTraceGenerator.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  generateDecisionTrace,
  buildDecisionTraceInputFromDb,
  type DecisionTraceInput,
} from "./decisionTraceGenerator";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fullApproveInput: DecisionTraceInput = {
  final_recommendation: "APPROVE",
  final_confidence: 82,
  decision_basis: "system_validated",
  key_drivers: ["damage_consistent", "fraud_low", "cost_within_range"],
  blocking_factors: [],
  extraction: {
    total_documents: 2,
    total_pages: 8,
    ocr_applied: false,
    ocr_confidence: null,
    primary_document_type: "claim_form",
  },
  data_extraction: {
    vehicle_make: "Toyota",
    vehicle_model: "Corolla",
    vehicle_year: 2019,
    incident_type: "vehicle_collision",
    claim_amount_cents: 450000,
    damaged_components_count: 4,
    fields_extracted: 22,
    fields_missing: 1,
  },
  damage: {
    damaged_components: ["front bumper", "hood", "radiator", "headlight"],
    severity: "moderate",
    is_consistent: true,
    consistency_score: 88,
    has_unexplained_damage: false,
    structural_damage: false,
    summary: "Damage consistent with frontal collision.",
  },
  physics: {
    is_plausible: true,
    confidence: 85,
    has_critical_inconsistency: false,
    impact_direction: "frontal",
    energy_level: "medium",
    summary: "Physics model confirms frontal impact at medium energy.",
  },
  fraud: {
    fraud_risk_level: "low",
    fraud_risk_score: 18,
    critical_flag_count: 0,
    top_indicators: [],
    scenario_fraud_flagged: false,
    reasoning: "No significant fraud indicators detected.",
  },
  cost: {
    expected_cost_cents: 420000,
    claim_amount_cents: 450000,
    quote_deviation_pct: 7.1,
    recommendation: "PROCEED_TO_ASSESSMENT",
    is_within_range: true,
    has_anomalies: false,
    savings_opportunity_cents: 15000,
    reasoning: "Cost within acceptable range.",
  },
  consistency: {
    overall_status: "CONSISTENT",
    consistency_score: 91,
    critical_conflict_count: 0,
    proceed: true,
    summary: "All engines consistent.",
  },
};

const fullRejectInput: DecisionTraceInput = {
  final_recommendation: "REJECT",
  final_confidence: 91,
  decision_basis: "system_validated",
  key_drivers: ["fraud_high", "physics_implausible"],
  blocking_factors: ["Fraud risk level is HIGH", "Physics implausible"],
  extraction: {
    total_documents: 1,
    total_pages: 4,
    ocr_applied: true,
    ocr_confidence: 78,
    primary_document_type: "repair_quote",
  },
  data_extraction: {
    vehicle_make: "BMW",
    vehicle_model: "3 Series",
    vehicle_year: 2021,
    incident_type: "animal_strike",
    claim_amount_cents: 1200000,
    damaged_components_count: 8,
    fields_extracted: 18,
    fields_missing: 3,
  },
  damage: {
    damaged_components: ["front bumper", "hood", "engine bay", "windshield"],
    severity: "severe",
    is_consistent: false,
    consistency_score: 32,
    has_unexplained_damage: true,
    structural_damage: true,
    summary: "Damage pattern inconsistent with reported animal strike.",
  },
  physics: {
    is_plausible: false,
    confidence: 45,
    has_critical_inconsistency: true,
    impact_direction: "frontal",
    energy_level: "high",
    summary: "Physics model finds impact energy inconsistent with animal strike.",
  },
  fraud: {
    fraud_risk_level: "high",
    fraud_risk_score: 84,
    critical_flag_count: 3,
    top_indicators: ["staged_collision", "inflated_estimate", "prior_claim_history"],
    scenario_fraud_flagged: true,
    reasoning: "Multiple high-confidence fraud indicators detected.",
  },
  cost: {
    expected_cost_cents: 600000,
    claim_amount_cents: 1200000,
    quote_deviation_pct: 100,
    recommendation: "ESCALATE",
    is_within_range: false,
    has_anomalies: true,
    savings_opportunity_cents: 600000,
    reasoning: "Claimed amount 100% above expected — escalation required.",
  },
  consistency: {
    overall_status: "CONFLICTED",
    consistency_score: 28,
    critical_conflict_count: 2,
    proceed: false,
    summary: "Critical conflicts between physics and damage signals.",
  },
};

const fullReviewInput: DecisionTraceInput = {
  final_recommendation: "REVIEW",
  final_confidence: 52,
  decision_basis: "insufficient_data",
  key_drivers: ["confidence_low", "fraud_medium"],
  blocking_factors: ["Confidence below 60%", "Medium fraud risk"],
  extraction: {
    total_documents: 1,
    total_pages: 3,
    ocr_applied: true,
    ocr_confidence: 55,
    primary_document_type: "police_report",
  },
  data_extraction: {
    vehicle_make: "Ford",
    vehicle_model: "Ranger",
    vehicle_year: 2018,
    incident_type: "theft",
    claim_amount_cents: 800000,
    damaged_components_count: 2,
    fields_extracted: 14,
    fields_missing: 8,
  },
  damage: {
    damaged_components: ["door lock", "ignition"],
    severity: "minor",
    is_consistent: null,
    consistency_score: null,
    has_unexplained_damage: false,
    structural_damage: false,
    summary: null,
  },
  physics: {
    is_plausible: null,
    confidence: 52,
    has_critical_inconsistency: false,
    impact_direction: null,
    energy_level: null,
    summary: "Physics analysis inconclusive for theft scenario.",
  },
  fraud: {
    fraud_risk_level: "medium",
    fraud_risk_score: 52,
    critical_flag_count: 1,
    top_indicators: ["suspicious_timing"],
    scenario_fraud_flagged: false,
    reasoning: "Medium fraud risk — requires review.",
  },
  cost: {
    expected_cost_cents: 750000,
    claim_amount_cents: 800000,
    quote_deviation_pct: 6.7,
    recommendation: "NEGOTIATE",
    is_within_range: true,
    has_anomalies: false,
    savings_opportunity_cents: 50000,
    reasoning: "Minor negotiation opportunity.",
  },
  consistency: null,
};

// ─── Output Structure ─────────────────────────────────────────────────────────

describe("generateDecisionTrace — output structure", () => {
  it("returns a decision_trace array", () => {
    const result = generateDecisionTrace(fullApproveInput);
    expect(result.decision_trace).toBeInstanceOf(Array);
    expect(result.decision_trace.length).toBeGreaterThan(0);
  });

  it("each trace entry has all required fields", () => {
    const result = generateDecisionTrace(fullApproveInput);
    for (const entry of result.decision_trace) {
      expect(entry).toHaveProperty("stage");
      expect(entry).toHaveProperty("input_summary");
      expect(entry).toHaveProperty("output_summary");
      expect(entry).toHaveProperty("impact_on_decision");
      expect(typeof entry.stage).toBe("string");
      expect(typeof entry.input_summary).toBe("string");
      expect(typeof entry.output_summary).toBe("string");
      expect(typeof entry.impact_on_decision).toBe("string");
    }
  });

  it("returns final_recommendation matching input", () => {
    expect(generateDecisionTrace(fullApproveInput).final_recommendation).toBe("APPROVE");
    expect(generateDecisionTrace(fullRejectInput).final_recommendation).toBe("REJECT");
    expect(generateDecisionTrace(fullReviewInput).final_recommendation).toBe("REVIEW");
  });

  it("returns final_confidence matching input", () => {
    expect(generateDecisionTrace(fullApproveInput).final_confidence).toBe(82);
  });

  it("returns executive_summary as non-empty string", () => {
    const result = generateDecisionTrace(fullApproveInput);
    expect(typeof result.executive_summary).toBe("string");
    expect(result.executive_summary.length).toBeGreaterThan(10);
  });

  it("returns trace_complete = true when all stages present", () => {
    expect(generateDecisionTrace(fullApproveInput).trace_complete).toBe(true);
  });

  it("returns missing_stages as empty array when all stages present", () => {
    expect(generateDecisionTrace(fullApproveInput).missing_stages).toEqual([]);
  });

  it("returns metadata with correct engine name and version", () => {
    const result = generateDecisionTrace(fullApproveInput);
    expect(result.metadata.engine).toBe("DecisionTraceGenerator");
    expect(result.metadata.version).toBe("1.0.0");
  });

  it("metadata.stages_included matches trace length", () => {
    const result = generateDecisionTrace(fullApproveInput);
    expect(result.metadata.stages_included).toBe(result.decision_trace.length);
  });

  it("metadata.timestamp_utc is a valid ISO string", () => {
    const result = generateDecisionTrace(fullApproveInput);
    expect(new Date(result.metadata.timestamp_utc).toISOString()).toBe(result.metadata.timestamp_utc);
  });
});

// ─── Stage Inclusion ──────────────────────────────────────────────────────────

describe("generateDecisionTrace — stage inclusion", () => {
  it("includes Stage 1-2 when extraction is provided", () => {
    const stage = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Ingestion")
    );
    expect(stage).toBeDefined();
  });

  it("includes Stage 3 when data_extraction is provided", () => {
    const stage = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Data Extraction")
    );
    expect(stage).toBeDefined();
  });

  it("includes Stage 6 when damage is provided", () => {
    const stage = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Damage")
    );
    expect(stage).toBeDefined();
  });

  it("includes Stage 7 when physics is provided", () => {
    const stage = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Physics")
    );
    expect(stage).toBeDefined();
  });

  it("includes Stage 8 when fraud is provided", () => {
    const stage = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Fraud")
    );
    expect(stage).toBeDefined();
  });

  it("includes Stage 9 when cost is provided", () => {
    const stage = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Cost")
    );
    expect(stage).toBeDefined();
  });

  it("includes consistency stage when consistency is provided", () => {
    const stage = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Consistency")
    );
    expect(stage).toBeDefined();
  });

  it("always includes Decision Authority as the final entry", () => {
    const result = generateDecisionTrace(fullApproveInput);
    const last = result.decision_trace[result.decision_trace.length - 1];
    expect(last.stage).toContain("Decision Authority");
  });

  it("omits consistency stage when consistency is null", () => {
    const stage = generateDecisionTrace(fullReviewInput).decision_trace.find((e) =>
      e.stage.includes("Consistency")
    );
    expect(stage).toBeUndefined();
  });

  it("tracks missing stages when extraction is null", () => {
    const result = generateDecisionTrace({ ...fullApproveInput, extraction: null });
    expect(result.missing_stages.some((s) => s.includes("Stage 1"))).toBe(true);
    expect(result.trace_complete).toBe(false);
  });

  it("tracks missing stages when physics is null", () => {
    const result = generateDecisionTrace({ ...fullApproveInput, physics: null });
    expect(result.missing_stages.some((s) => s.includes("Physics"))).toBe(true);
  });

  it("tracks missing stages when fraud is null", () => {
    const result = generateDecisionTrace({ ...fullApproveInput, fraud: null });
    expect(result.missing_stages.some((s) => s.includes("Fraud"))).toBe(true);
  });

  it("tracks missing stages when cost is null", () => {
    const result = generateDecisionTrace({ ...fullApproveInput, cost: null });
    expect(result.missing_stages.some((s) => s.includes("Cost"))).toBe(true);
  });

  it("metadata.stages_skipped matches missing_stages count", () => {
    const result = generateDecisionTrace({ ...fullApproveInput, extraction: null, physics: null });
    expect(result.metadata.stages_skipped).toBe(result.missing_stages.length);
  });
});

// ─── APPROVE Path ─────────────────────────────────────────────────────────────

describe("generateDecisionTrace — APPROVE path", () => {
  it("executive summary mentions passing all stages", () => {
    const result = generateDecisionTrace(fullApproveInput);
    expect(result.executive_summary.toLowerCase()).toMatch(/passed all|confidence/);
  });

  it("executive summary mentions confidence percentage", () => {
    expect(generateDecisionTrace(fullApproveInput).executive_summary).toContain("82%");
  });

  it("physics stage impact mentions supported APPROVE", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Physics")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("approve");
  });

  it("fraud stage impact mentions low fraud supported APPROVE", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Fraud")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("approve");
  });

  it("damage stage impact mentions consistent and APPROVE", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Damage")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("approve");
  });

  it("cost stage impact mentions within range and APPROVE", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Cost")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("approve");
  });

  it("consistency stage impact mentions APPROVE when consistent", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Consistency")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("approve");
  });

  it("Decision Authority entry output mentions APPROVE", () => {
    const result = generateDecisionTrace(fullApproveInput);
    const last = result.decision_trace[result.decision_trace.length - 1];
    expect(last.output_summary).toContain("APPROVE");
  });
});

// ─── REJECT Path ──────────────────────────────────────────────────────────────

describe("generateDecisionTrace — REJECT path", () => {
  it("executive summary mentions REJECT", () => {
    expect(generateDecisionTrace(fullRejectInput).executive_summary.toLowerCase()).toContain("reject");
  });

  it("physics stage mentions critical inconsistency → REJECT", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Physics")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("reject");
  });

  it("fraud stage mentions HIGH fraud → REJECT", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Fraud")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("reject");
  });

  it("fraud output summary mentions critical flags", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Fraud")
    );
    expect(entry?.output_summary).toContain("3");
  });

  it("cost stage mentions ESCALATE", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Cost")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toMatch(/escalat|reject/);
  });

  it("consistency stage mentions critical conflicts → REJECT", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Consistency")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("reject");
  });

  it("damage stage mentions inconsistency", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Damage")
    );
    expect(entry?.output_summary.toLowerCase()).toContain("inconsistent");
  });

  it("Decision Authority entry output mentions REJECT", () => {
    const result = generateDecisionTrace(fullRejectInput);
    const last = result.decision_trace[result.decision_trace.length - 1];
    expect(last.output_summary).toContain("REJECT");
  });
});

// ─── REVIEW Path ──────────────────────────────────────────────────────────────

describe("generateDecisionTrace — REVIEW path", () => {
  it("executive summary mentions REVIEW", () => {
    expect(generateDecisionTrace(fullReviewInput).executive_summary.toLowerCase()).toContain("review");
  });

  it("executive summary mentions confidence", () => {
    expect(generateDecisionTrace(fullReviewInput).executive_summary).toContain("52%");
  });

  it("fraud stage mentions medium fraud → REVIEW", () => {
    const entry = generateDecisionTrace(fullReviewInput).decision_trace.find((e) =>
      e.stage.includes("Fraud")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toContain("review");
  });

  it("cost stage mentions NEGOTIATE → REVIEW signals", () => {
    const entry = generateDecisionTrace(fullReviewInput).decision_trace.find((e) =>
      e.stage.includes("Cost")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toMatch(/negotiate|review/);
  });

  it("Decision Authority entry output mentions REVIEW", () => {
    const result = generateDecisionTrace(fullReviewInput);
    const last = result.decision_trace[result.decision_trace.length - 1];
    expect(last.output_summary).toContain("REVIEW");
  });

  it("extraction stage mentions low OCR confidence", () => {
    const entry = generateDecisionTrace(fullReviewInput).decision_trace.find((e) =>
      e.stage.includes("Ingestion")
    );
    expect(entry?.impact_on_decision.toLowerCase()).toMatch(/ocr|review/);
  });
});

// ─── Truncation ───────────────────────────────────────────────────────────────

describe("generateDecisionTrace — summary truncation", () => {
  it("all input_summary fields are ≤ 121 chars", () => {
    const result = generateDecisionTrace(fullApproveInput);
    for (const entry of result.decision_trace) {
      expect(entry.input_summary.length).toBeLessThanOrEqual(121);
    }
  });

  it("all output_summary fields are ≤ 121 chars", () => {
    const result = generateDecisionTrace(fullApproveInput);
    for (const entry of result.decision_trace) {
      expect(entry.output_summary.length).toBeLessThanOrEqual(121);
    }
  });

  it("executive_summary is ≤ 201 chars", () => {
    expect(generateDecisionTrace(fullApproveInput).executive_summary.length).toBeLessThanOrEqual(201);
  });
});

// ─── Minimal Input ────────────────────────────────────────────────────────────

describe("generateDecisionTrace — minimal input", () => {
  it("handles input with only final_recommendation and final_confidence", () => {
    const result = generateDecisionTrace({ final_recommendation: "REVIEW", final_confidence: 45 });
    expect(result.decision_trace.length).toBeGreaterThan(0);
    expect(result.trace_complete).toBe(false);
  });

  it("Decision Authority entry is always present even with minimal input", () => {
    const result = generateDecisionTrace({ final_recommendation: "REJECT", final_confidence: 90 });
    const last = result.decision_trace[result.decision_trace.length - 1];
    expect(last.stage).toContain("Decision Authority");
  });

  it("handles null physics gracefully", () => {
    expect(() => generateDecisionTrace({ ...fullApproveInput, physics: null })).not.toThrow();
  });

  it("handles null fraud gracefully", () => {
    expect(() => generateDecisionTrace({ ...fullApproveInput, fraud: null })).not.toThrow();
  });

  it("handles null cost gracefully", () => {
    expect(() => generateDecisionTrace({ ...fullApproveInput, cost: null })).not.toThrow();
  });

  it("handles null damage gracefully", () => {
    expect(() => generateDecisionTrace({ ...fullApproveInput, damage: null })).not.toThrow();
  });

  it("handles null extraction gracefully", () => {
    expect(() => generateDecisionTrace({ ...fullApproveInput, extraction: null })).not.toThrow();
  });

  it("handles null data_extraction gracefully", () => {
    expect(() => generateDecisionTrace({ ...fullApproveInput, data_extraction: null })).not.toThrow();
  });

  it("handles empty damaged_components array", () => {
    expect(() =>
      generateDecisionTrace({
        ...fullApproveInput,
        damage: { ...fullApproveInput.damage!, damaged_components: [] },
      })
    ).not.toThrow();
  });

  it("handles null key_drivers", () => {
    expect(() =>
      generateDecisionTrace({ ...fullApproveInput, key_drivers: null })
    ).not.toThrow();
  });

  it("handles null blocking_factors", () => {
    expect(() =>
      generateDecisionTrace({ ...fullApproveInput, blocking_factors: null })
    ).not.toThrow();
  });
});

// ─── Physics Stage ────────────────────────────────────────────────────────────

describe("generateDecisionTrace — physics stage", () => {
  it("output mentions critical inconsistency when present", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Physics")
    );
    expect(entry?.output_summary).toContain("Critical");
  });

  it("output mentions plausible when physics is plausible", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Physics")
    );
    expect(entry?.output_summary.toLowerCase()).toContain("plausible");
  });

  it("output mentions implausible when physics is implausible", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Physics")
    );
    expect(entry?.output_summary.toLowerCase()).toContain("implausible");
  });

  it("input_summary includes impact direction", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Physics")
    );
    expect(entry?.input_summary.toLowerCase()).toContain("frontal");
  });

  it("handles null is_plausible", () => {
    const result = generateDecisionTrace({
      ...fullApproveInput,
      physics: { ...fullApproveInput.physics!, is_plausible: null },
    });
    const entry = result.decision_trace.find((e) => e.stage.includes("Physics"));
    expect(entry?.impact_on_decision.toLowerCase()).toContain("unavailable");
  });
});

// ─── Fraud Stage ──────────────────────────────────────────────────────────────

describe("generateDecisionTrace — fraud stage", () => {
  it("elevated fraud risk → REJECT impact", () => {
    const result = generateDecisionTrace({
      ...fullApproveInput,
      final_recommendation: "REJECT",
      fraud: {
        fraud_risk_level: "elevated",
        fraud_risk_score: 72,
        critical_flag_count: 2,
        top_indicators: ["inflated_estimate"],
        scenario_fraud_flagged: true,
        reasoning: "Elevated risk.",
      },
    });
    const entry = result.decision_trace.find((e) => e.stage.includes("Fraud"));
    expect(entry?.impact_on_decision.toLowerCase()).toContain("reject");
  });

  it("output mentions scenario fraud flag", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Fraud")
    );
    expect(entry?.output_summary.toLowerCase()).toContain("scenario");
  });

  it("input_summary includes top indicators", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Fraud")
    );
    expect(entry?.input_summary.toLowerCase()).toContain("staged_collision");
  });

  it("minimal fraud level → APPROVE impact", () => {
    const result = generateDecisionTrace({
      ...fullApproveInput,
      fraud: {
        fraud_risk_level: "minimal",
        fraud_risk_score: 5,
        critical_flag_count: 0,
        top_indicators: [],
        scenario_fraud_flagged: false,
        reasoning: null,
      },
    });
    const entry = result.decision_trace.find((e) => e.stage.includes("Fraud"));
    expect(entry?.impact_on_decision.toLowerCase()).toContain("approve");
  });

  it("null fraud_risk_level → unavailable message", () => {
    const result = generateDecisionTrace({
      ...fullApproveInput,
      fraud: { ...fullApproveInput.fraud!, fraud_risk_level: null },
    });
    const entry = result.decision_trace.find((e) => e.stage.includes("Fraud"));
    expect(entry?.impact_on_decision.toLowerCase()).toContain("unavailable");
  });
});

// ─── Cost Stage ───────────────────────────────────────────────────────────────

describe("generateDecisionTrace — cost stage", () => {
  it("output mentions savings opportunity when present", () => {
    const entry = generateDecisionTrace(fullApproveInput).decision_trace.find((e) =>
      e.stage.includes("Cost")
    );
    expect(entry?.output_summary.toLowerCase()).toContain("savings");
  });

  it("output mentions anomalies when present", () => {
    const entry = generateDecisionTrace(fullRejectInput).decision_trace.find((e) =>
      e.stage.includes("Cost")
    );
    expect(entry?.output_summary.toLowerCase()).toContain("anomal");
  });

  it("handles NEGOTIATE recommendation", () => {
    const entry = generateDecisionTrace(fullReviewInput).decision_trace.find((e) =>
      e.stage.includes("Cost")
    );
    expect(entry?.output_summary.toLowerCase()).toContain("negotiate");
  });

  it("handles null cost recommendation", () => {
    const result = generateDecisionTrace({
      ...fullApproveInput,
      cost: { ...fullApproveInput.cost!, recommendation: null },
    });
    const entry = result.decision_trace.find((e) => e.stage.includes("Cost"));
    expect(entry?.output_summary).toContain("N/A");
  });
});

// ─── buildDecisionTraceInputFromDb ────────────────────────────────────────────

describe("buildDecisionTraceInputFromDb", () => {
  const mockAiAssessment: Record<string, unknown> = {
    vehicleMake: "Honda",
    vehicleModel: "Civic",
    vehicleYear: 2020,
    incidentType: "vehicle_collision",
    fraudRiskLevel: "low",
    fraudRiskScore: 22,
    confidenceScore: 78,
    structuralDamageSeverity: "moderate",
    estimatedCost: 4500,
    physicsAnalysis: "Frontal impact is physically plausible.",
    damagedComponentsJson: JSON.stringify([
      { name: "front bumper" },
      { name: "hood" },
      { name: "radiator" },
    ]),
    consistencyCheckJson: JSON.stringify({
      overall_status: "CONSISTENT",
      consistency_score: 85,
      critical_conflict_count: 0,
      proceed: true,
      summary: "All consistent.",
    }),
    costRealismJson: JSON.stringify({ deviation_pct: 5.2, has_anomalies: false }),
    fraudScoreBreakdownJson: JSON.stringify([
      { indicator: "quote_inflation" },
      { indicator: "prior_claims" },
    ]),
  };

  const mockClaim: Record<string, unknown> = {
    incidentType: "vehicle_collision",
    claimAmount: 5000,
    finalApprovedAmount: 4800,
  };

  const mockDecisionResult = {
    recommendation: "APPROVE" as const,
    confidence: 78,
    decision_basis: "system_validated",
    key_drivers: ["damage_consistent", "fraud_low"],
    blocking_factors: [],
  };

  it("returns a valid DecisionTraceInput", () => {
    const result = buildDecisionTraceInputFromDb(mockAiAssessment, mockClaim, mockDecisionResult);
    expect(result.final_recommendation).toBe("APPROVE");
    expect(result.final_confidence).toBe(78);
  });

  it("populates data_extraction with vehicle info", () => {
    const result = buildDecisionTraceInputFromDb(mockAiAssessment, mockClaim, mockDecisionResult);
    expect(result.data_extraction?.vehicle_make).toBe("Honda");
    expect(result.data_extraction?.vehicle_model).toBe("Civic");
    expect(result.data_extraction?.vehicle_year).toBe(2020);
  });

  it("populates fraud with correct risk level", () => {
    const result = buildDecisionTraceInputFromDb(mockAiAssessment, mockClaim, mockDecisionResult);
    expect(result.fraud?.fraud_risk_level).toBe("low");
    expect(result.fraud?.fraud_risk_score).toBe(22);
  });

  it("populates damage with parsed components", () => {
    const result = buildDecisionTraceInputFromDb(mockAiAssessment, mockClaim, mockDecisionResult);
    expect(result.damage?.damaged_components).toContain("front bumper");
    expect(result.damage?.damaged_components?.length).toBe(3);
  });

  it("populates consistency from consistencyCheckJson", () => {
    const result = buildDecisionTraceInputFromDb(mockAiAssessment, mockClaim, mockDecisionResult);
    expect(result.consistency?.overall_status).toBe("CONSISTENT");
    expect(result.consistency?.consistency_score).toBe(85);
  });

  it("populates cost with PROCEED_TO_ASSESSMENT for small deviation", () => {
    const result = buildDecisionTraceInputFromDb(mockAiAssessment, mockClaim, mockDecisionResult);
    // 4500 estimated vs 4800 approved = 6.25% deviation → PROCEED_TO_ASSESSMENT
    expect(result.cost?.recommendation).toBe("PROCEED_TO_ASSESSMENT");
    expect(result.cost?.is_within_range).toBe(true);
  });

  it("handles missing consistencyCheckJson gracefully", () => {
    const result = buildDecisionTraceInputFromDb(
      { ...mockAiAssessment, consistencyCheckJson: null },
      mockClaim,
      mockDecisionResult
    );
    expect(result.consistency).toBeNull();
  });

  it("handles missing damagedComponentsJson gracefully", () => {
    const result = buildDecisionTraceInputFromDb(
      { ...mockAiAssessment, damagedComponentsJson: null },
      mockClaim,
      mockDecisionResult
    );
    expect(result.damage?.damaged_components).toBeNull();
  });

  it("handles malformed JSON gracefully", () => {
    expect(() =>
      buildDecisionTraceInputFromDb(
        { ...mockAiAssessment, consistencyCheckJson: "not-json" },
        mockClaim,
        mockDecisionResult
      )
    ).not.toThrow();
  });

  it("produces a valid generateDecisionTrace input", () => {
    const traceInput = buildDecisionTraceInputFromDb(mockAiAssessment, mockClaim, mockDecisionResult);
    const result = generateDecisionTrace(traceInput);
    expect(result.final_recommendation).toBe("APPROVE");
    expect(result.decision_trace.length).toBeGreaterThan(0);
  });

  it("sets cost ESCALATE when deviation > 40%", () => {
    const result = buildDecisionTraceInputFromDb(
      { ...mockAiAssessment, estimatedCost: 2000 },
      { ...mockClaim, finalApprovedAmount: 5000 },
      mockDecisionResult
    );
    expect(result.cost?.recommendation).toBe("ESCALATE");
    expect(result.cost?.is_within_range).toBe(false);
  });

  it("sets cost NEGOTIATE when deviation 15–40%", () => {
    const result = buildDecisionTraceInputFromDb(
      { ...mockAiAssessment, estimatedCost: 3500 },
      { ...mockClaim, finalApprovedAmount: 5000 },
      mockDecisionResult
    );
    expect(result.cost?.recommendation).toBe("NEGOTIATE");
  });
});
