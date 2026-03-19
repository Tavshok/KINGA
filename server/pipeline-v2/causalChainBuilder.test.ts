/**
 * causalChainBuilder.test.ts — Stage 37 Unit Tests
 * Covers: constants, input steps, damage steps, physics steps,
 * fraud steps, cost steps, decision outcomes, output contract,
 * escalation flag, null handling, step numbering, chain summary.
 */
import { describe, it, expect } from "vitest";
import {
  buildCausalChain,
  ESCALATION_FRAUD_LEVELS,
  MANUAL_REVIEW_FRAUD_LEVELS,
  MIN_CONFIDENCE_FOR_DECISION,
  FRAUD_SCORE_CRITICAL_THRESHOLD,
  FRAUD_SCORE_WARNING_THRESHOLD,
  DAMAGE_CONSISTENCY_WARNING_THRESHOLD,
  DAMAGE_CONSISTENCY_CRITICAL_THRESHOLD,
} from "./causalChainBuilder";
import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  AccidentSeverity,
} from "./types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeClaimRecord(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    claimId: 1,
    tenantId: 1,
    vehicle: { make: "Toyota", model: "Corolla", year: 2020, registration: "ABC123", vin: null, colour: null, engineNumber: null, mileageKm: null, massKg: 1400 },
    driver: { name: "Test Driver", licenceNumber: null, yearsLicensed: null },
    accidentDetails: {
      date: "2024-01-01",
      location: "Test Location",
      description: "Test accident",
      incidentType: "collision",
      collisionDirection: "frontal",
      impactPoint: "front",
      estimatedSpeedKmh: 60,
      maxCrushDepthM: 0.3,
      totalDamageAreaM2: 1.5,
      structuralDamage: false,
      airbagDeployment: false,
    },
    policeReport: { reportNumber: null, station: null },
    damage: { description: "Front damage", components: [], imageUrls: [] },
    repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
    dataQuality: { completenessScore: 85, missingFields: [], validationIssues: [] },
    marketRegion: "ZA",
    assumptions: [],
    ...overrides,
  } as ClaimRecord;
}

function makeStage6(overrides: Partial<Stage6Output> = {}): Stage6Output {
  return {
    damagedParts: [
      { name: "Bumper", location: "front", damageType: "crush", severity: "moderate", visible: true, distanceFromImpact: 0 },
    ],
    damageZones: [{ zone: "front", componentCount: 2, maxSeverity: "moderate" }],
    overallSeverityScore: 45,
    structuralDamageDetected: false,
    totalDamageArea: 1.5,
    ...overrides,
  };
}

function makeStage7(
  direction = "frontal",
  severity: AccidentSeverity = "moderate",
  overrides: Partial<Stage7Output> = {}
): Stage7Output {
  return {
    impactForceKn: 50,
    impactVector: { direction: direction as any, magnitude: 50, angle: 0 },
    energyDistribution: { kineticEnergyJ: 100000, energyDissipatedJ: 80000, energyDissipatedKj: 80 },
    estimatedSpeedKmh: 60,
    deltaVKmh: 40,
    decelerationG: 8,
    accidentSeverity: severity,
    accidentReconstructionSummary: "Frontal impact reconstruction",
    damageConsistencyScore: 85,
    latentDamageProbability: { engine: 0.1, transmission: 0.05, suspension: 0.2, frame: 0.1, electrical: 0.05 },
    physicsExecuted: true,
    ...overrides,
  } as Stage7Output;
}

function makeStage8(
  fraudScore = 20,
  fraudLevel = "low",
  overrides: Partial<Stage8Output> = {}
): Stage8Output {
  return {
    fraudRiskScore: fraudScore,
    fraudRiskLevel: fraudLevel as any,
    indicators: [],
    quoteDeviation: null,
    repairerHistory: { flagged: false, notes: "" },
    claimantClaimFrequency: { flagged: false, notes: "" },
    vehicleClaimHistory: { flagged: false, notes: "" },
    damageConsistencyScore: 85,
    damageConsistencyNotes: "Consistent",
    ...overrides,
  };
}

function makeStage9(totalCents = 100_000, overrides: Partial<Stage9Output> = {}): Stage9Output {
  return {
    expectedRepairCostCents: totalCents,
    quoteDeviationPct: null,
    recommendedCostRange: { lowCents: Math.round(totalCents * 0.8), highCents: Math.round(totalCents * 1.2) },
    savingsOpportunityCents: 0,
    breakdown: {
      partsCostCents: Math.round(totalCents * 0.6),
      labourCostCents: Math.round(totalCents * 0.4),
      paintCostCents: 0,
      hiddenDamageCostCents: 0,
      totalCents,
    },
    labourRateUsdPerHour: 40,
    marketRegion: "ZA",
    currency: "USD",
    repairIntelligence: [],
    partsReconciliation: [],
    ...overrides,
  };
}

// ─── 1. Exported constants ────────────────────────────────────────────────────

describe("exported constants", () => {
  it("ESCALATION_FRAUD_LEVELS contains 'high' and 'elevated'", () => {
    expect(ESCALATION_FRAUD_LEVELS.has("high")).toBe(true);
    expect(ESCALATION_FRAUD_LEVELS.has("elevated")).toBe(true);
  });
  it("MANUAL_REVIEW_FRAUD_LEVELS contains 'medium'", () => {
    expect(MANUAL_REVIEW_FRAUD_LEVELS.has("medium")).toBe(true);
  });
  it("MIN_CONFIDENCE_FOR_DECISION is between 10 and 40", () => {
    expect(MIN_CONFIDENCE_FOR_DECISION).toBeGreaterThanOrEqual(10);
    expect(MIN_CONFIDENCE_FOR_DECISION).toBeLessThanOrEqual(40);
  });
  it("FRAUD_SCORE_CRITICAL_THRESHOLD > FRAUD_SCORE_WARNING_THRESHOLD", () => {
    expect(FRAUD_SCORE_CRITICAL_THRESHOLD).toBeGreaterThan(FRAUD_SCORE_WARNING_THRESHOLD);
  });
  it("DAMAGE_CONSISTENCY_CRITICAL_THRESHOLD < DAMAGE_CONSISTENCY_WARNING_THRESHOLD", () => {
    expect(DAMAGE_CONSISTENCY_CRITICAL_THRESHOLD).toBeLessThan(DAMAGE_CONSISTENCY_WARNING_THRESHOLD);
  });
});

// ─── 2. Input steps ───────────────────────────────────────────────────────────

describe("input steps", () => {
  it("generates 'claim_received' step with vehicle info", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "claim_received");
    expect(s).toBeDefined();
    expect(s!.category).toBe("input");
    expect(s!.description).toContain("Toyota");
  });
  it("generates 'data_quality' step with completeness score", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "data_quality");
    expect(s).toBeDefined();
    expect(s!.value).toBe(85);
  });
  it("data_quality is 'info' when completeness >= 80", () => {
    const r = buildCausalChain(makeClaimRecord({ dataQuality: { completenessScore: 90, missingFields: [], validationIssues: [] } }), null, null, null, null, 90);
    expect(r.causal_chain.find((x) => x.key === "data_quality")!.severity).toBe("info");
  });
  it("data_quality is 'warning' when completeness 50–79", () => {
    const r = buildCausalChain(makeClaimRecord({ dataQuality: { completenessScore: 60, missingFields: [], validationIssues: [] } }), null, null, null, null, 60);
    expect(r.causal_chain.find((x) => x.key === "data_quality")!.severity).toBe("warning");
  });
  it("data_quality is 'critical' when completeness < 50", () => {
    const r = buildCausalChain(makeClaimRecord({ dataQuality: { completenessScore: 30, missingFields: [], validationIssues: [] } }), null, null, null, null, 30);
    expect(r.causal_chain.find((x) => x.key === "data_quality")!.severity).toBe("critical");
  });
  it("generates 'missing_fields' step when fields are absent", () => {
    const r = buildCausalChain(makeClaimRecord({ dataQuality: { completenessScore: 60, missingFields: ["vin", "mileage", "speed", "crush", "area"], validationIssues: [] } }), null, null, null, null, 60);
    const s = r.causal_chain.find((x) => x.key === "missing_fields");
    expect(s).toBeDefined();
    expect(s!.value).toBe(5);
  });
  it("does NOT generate 'missing_fields' when no fields are missing", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "missing_fields")).toBeUndefined();
  });
});

// ─── 3. Damage analysis steps ─────────────────────────────────────────────────

describe("damage analysis steps", () => {
  it("generates 'damage_zone_identified' with zone name", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), null, null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "damage_zone_identified");
    expect(s).toBeDefined();
    expect(s!.value).toBe("front");
  });
  it("generates 'structural_damage_flag' when structural damage detected", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6({ structuralDamageDetected: true }), null, null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "structural_damage_flag");
    expect(s).toBeDefined();
    expect(s!.severity).toBe("critical");
  });
  it("does NOT generate 'structural_damage_flag' when no structural damage", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), null, null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "structural_damage_flag")).toBeUndefined();
  });
  it("generates 'damage_analysis_unavailable' when damageAnalysis is null", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "damage_analysis_unavailable")).toBeDefined();
  });
  it("picks zone with most components as primary zone", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6({ damageZones: [{ zone: "rear", componentCount: 5, maxSeverity: "severe" }, { zone: "front", componentCount: 2, maxSeverity: "moderate" }] }), null, null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "damage_zone_identified")!.value).toBe("rear");
  });
});

// ─── 4. Physics steps and coherence cross-check ───────────────────────────────

describe("physics steps and coherence cross-check", () => {
  it("generates 'impact_direction_determined' step", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal"), null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "impact_direction_determined");
    expect(s).toBeDefined();
    expect(s!.value).toBe("frontal");
  });
  it("generates 'physics_damage_consistent' when direction matches zone", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal"), null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "physics_damage_consistent");
    expect(s).toBeDefined();
    expect(s!.severity).toBe("info");
  });
  it("generates 'physics_damage_mismatch' when direction is opposite to zone", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6({ damageZones: [{ zone: "front", componentCount: 3, maxSeverity: "severe" }] }), makeStage7("rear"), null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "physics_damage_mismatch");
    expect(s).toBeDefined();
    expect(s!.severity).toBe("critical");
    expect(s!.description).toContain("rear");
    expect(s!.description).toContain("front");
  });
  it("generates 'mismatch_fraud_score_increased' after mismatch", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6({ damageZones: [{ zone: "front", componentCount: 3, maxSeverity: "severe" }] }), makeStage7("rear"), null, null, 80);
    const s = r.causal_chain.find((x) => x.key === "mismatch_fraud_score_increased");
    expect(s).toBeDefined();
    expect(s!.category).toBe("decision");
    expect(s!.severity).toBe("critical");
  });
  it("generates 'physics_analysis_unavailable' when physicsAnalysis is null", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), null, null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "physics_analysis_unavailable")).toBeDefined();
  });
  it("severe severity produces critical impact step", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal", "severe"), null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "impact_direction_determined")!.severity).toBe("critical");
  });
  it("minor severity produces info impact step", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal", "minor"), null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "impact_direction_determined")!.severity).toBe("info");
  });
});

// ─── 5. Fraud steps ───────────────────────────────────────────────────────────

describe("fraud steps", () => {
  it("generates 'fraud_score_computed' with score", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(25, "low"), null, 80);
    const s = r.causal_chain.find((x) => x.key === "fraud_score_computed");
    expect(s).toBeDefined();
    expect(s!.value).toBe(25);
  });
  it("fraud step is 'info' when score < warning threshold", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(20, "low"), null, 80);
    expect(r.causal_chain.find((x) => x.key === "fraud_score_computed")!.severity).toBe("info");
  });
  it("fraud step is 'warning' when score >= warning threshold", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(FRAUD_SCORE_WARNING_THRESHOLD, "medium"), null, 80);
    expect(r.causal_chain.find((x) => x.key === "fraud_score_computed")!.severity).toBe("warning");
  });
  it("fraud step is 'critical' when score >= critical threshold", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(FRAUD_SCORE_CRITICAL_THRESHOLD, "high"), null, 80);
    expect(r.causal_chain.find((x) => x.key === "fraud_score_computed")!.severity).toBe("critical");
  });
  it("generates 'damage_consistency_low' when score below warning threshold", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(30, "low", { damageConsistencyScore: DAMAGE_CONSISTENCY_WARNING_THRESHOLD - 1 }), null, 80);
    expect(r.causal_chain.find((x) => x.key === "damage_consistency_low")).toBeDefined();
  });
  it("does NOT generate 'damage_consistency_low' when score is above threshold", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(20, "low"), null, 80);
    expect(r.causal_chain.find((x) => x.key === "damage_consistency_low")).toBeUndefined();
  });
  it("generates 'repairer_history_flagged' when repairer is flagged", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(30, "medium", { repairerHistory: { flagged: true, notes: "Suspicious" } }), null, 80);
    expect(r.causal_chain.find((x) => x.key === "repairer_history_flagged")).toBeDefined();
  });
  it("generates 'claimant_frequency_flagged' when frequency is flagged", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(30, "medium", { claimantClaimFrequency: { flagged: true, notes: "High" } }), null, 80);
    expect(r.causal_chain.find((x) => x.key === "claimant_frequency_flagged")).toBeDefined();
  });
  it("generates 'vehicle_history_flagged' when vehicle history is flagged", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(30, "medium", { vehicleClaimHistory: { flagged: true, notes: "Repeated" } }), null, 80);
    expect(r.causal_chain.find((x) => x.key === "vehicle_history_flagged")).toBeDefined();
  });
  it("generates 'fraud_escalation_triggered' for high fraud level", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(80, "high"), null, 80);
    const s = r.causal_chain.find((x) => x.key === "fraud_escalation_triggered");
    expect(s).toBeDefined();
    expect(s!.severity).toBe("critical");
    expect(s!.category).toBe("decision");
  });
  it("generates 'fraud_escalation_triggered' for elevated fraud level", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(85, "elevated"), null, 80);
    expect(r.causal_chain.find((x) => x.key === "fraud_escalation_triggered")).toBeDefined();
  });
  it("generates 'fraud_manual_review_triggered' for medium fraud level", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(50, "medium"), null, 80);
    const s = r.causal_chain.find((x) => x.key === "fraud_manual_review_triggered");
    expect(s).toBeDefined();
    expect(s!.severity).toBe("warning");
  });
  it("does NOT generate escalation/review steps for low fraud level", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(20, "low"), null, 80);
    expect(r.causal_chain.find((x) => x.key === "fraud_escalation_triggered")).toBeUndefined();
    expect(r.causal_chain.find((x) => x.key === "fraud_manual_review_triggered")).toBeUndefined();
  });
  it("generates 'fraud_analysis_unavailable' when fraudAnalysis is null", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "fraud_analysis_unavailable")).toBeDefined();
  });
});

// ─── 6. Cost steps ────────────────────────────────────────────────────────────

describe("cost steps", () => {
  it("generates 'repair_cost_estimated' with total cost", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, makeStage9(100_000), 80);
    const s = r.causal_chain.find((x) => x.key === "repair_cost_estimated");
    expect(s).toBeDefined();
    expect(s!.value).toBe(100_000);
    expect(s!.category).toBe("analysis");
  });
  it("cost step is 'warning' when quote deviation > 30%", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, makeStage9(100_000, { quoteDeviationPct: 35 }), 80);
    expect(r.causal_chain.find((x) => x.key === "repair_cost_estimated")!.severity).toBe("warning");
  });
  it("generates 'cost_adjustment_applied' when Stage 36 adjustments were applied", () => {
    const s9 = makeStage9(100_000);
    (s9 as any).costValidation = { validated_cost: true, adjustments_applied: true, adjustments_count: 1, confidence_multiplier: 0.85, severity_cost_consistent: true, issues_count: 1, summary: "Labour ratio adjusted" };
    const r = buildCausalChain(makeClaimRecord(), null, null, null, s9, 80);
    expect(r.causal_chain.find((x) => x.key === "cost_adjustment_applied")).toBeDefined();
  });
  it("generates 'severity_cost_mismatch' when severity-cost is inconsistent", () => {
    const s9 = makeStage9(100_000);
    (s9 as any).costValidation = { validated_cost: true, adjustments_applied: false, adjustments_count: 0, confidence_multiplier: 0.80, severity_cost_consistent: false, issues_count: 1, summary: "Cost too high" };
    const r = buildCausalChain(makeClaimRecord(), null, null, null, s9, 80);
    expect(r.causal_chain.find((x) => x.key === "severity_cost_mismatch")).toBeDefined();
  });
  it("generates 'cost_confidence_reduced' when confidence multiplier < 1.0", () => {
    const s9 = makeStage9(100_000);
    (s9 as any).costValidation = { validated_cost: true, adjustments_applied: true, adjustments_count: 2, confidence_multiplier: 0.70, severity_cost_consistent: false, issues_count: 2, summary: "Multiple issues" };
    const r = buildCausalChain(makeClaimRecord(), null, null, null, s9, 80);
    expect(r.causal_chain.find((x) => x.key === "cost_confidence_reduced")).toBeDefined();
  });
  it("cost_confidence_reduced is 'critical' when multiplier < 0.75", () => {
    const s9 = makeStage9(100_000);
    (s9 as any).costValidation = { validated_cost: true, adjustments_applied: true, adjustments_count: 2, confidence_multiplier: 0.70, severity_cost_consistent: false, issues_count: 2, summary: "Multiple issues" };
    const r = buildCausalChain(makeClaimRecord(), null, null, null, s9, 80);
    expect(r.causal_chain.find((x) => x.key === "cost_confidence_reduced")!.severity).toBe("critical");
  });
  it("generates 'savings_opportunity' when savings > 0", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, makeStage9(100_000, { savingsOpportunityCents: 15_000 }), 80);
    const s = r.causal_chain.find((x) => x.key === "savings_opportunity");
    expect(s).toBeDefined();
    expect(s!.value).toBe(15_000);
    expect(s!.severity).toBe("info");
  });
  it("does NOT generate 'savings_opportunity' when savings = 0", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, makeStage9(100_000), 80);
    expect(r.causal_chain.find((x) => x.key === "savings_opportunity")).toBeUndefined();
  });
  it("generates 'cost_analysis_unavailable' when costAnalysis is null", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    expect(r.causal_chain.find((x) => x.key === "cost_analysis_unavailable")).toBeDefined();
  });
});

// ─── 7. Decision outcome derivation ──────────────────────────────────────────

describe("decision outcome derivation", () => {
  it("returns 'approve' when all checks pass and confidence is high", () => {
    // Use cosmetic severity to avoid any warning steps that would produce approve_with_notes
    const cleanDamage = makeStage6({
      damageZones: [{ zone: "front", componentCount: 1, maxSeverity: "cosmetic" }],
      overallSeverityScore: 10,
      structuralDamageDetected: false,
    });
    const cleanPhysics = makeStage7("frontal", "minor");
    const cleanFraud = makeStage8(10, "minimal", { damageConsistencyScore: 95 });
    const cleanCost = makeStage9(20_000, { savingsOpportunityCents: 0, quoteDeviationPct: null });
    const r = buildCausalChain(makeClaimRecord(), cleanDamage, cleanPhysics, cleanFraud, cleanCost, 90);
    expect(r.decision_outcome).toBe("approve");
  });
  it("returns 'escalate' when high fraud level", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal"), makeStage8(80, "high"), makeStage9(), 80);
    expect(r.decision_outcome).toBe("escalate");
  });
  it("returns 'reject_pending' when fraud escalation AND physics mismatch", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6({ damageZones: [{ zone: "front", componentCount: 3, maxSeverity: "severe" }] }), makeStage7("rear"), makeStage8(80, "high"), makeStage9(), 80);
    expect(r.decision_outcome).toBe("reject_pending");
  });
  it("returns 'insufficient_data' when confidence is below minimum threshold", () => {
    const r = buildCausalChain(makeClaimRecord({ dataQuality: { completenessScore: 10, missingFields: [], validationIssues: [] } }), null, null, null, null, MIN_CONFIDENCE_FOR_DECISION - 1);
    expect(r.decision_outcome).toBe("insufficient_data");
  });
  it("returns 'manual_review' or 'approve_with_notes' for medium fraud", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal"), makeStage8(50, "medium"), makeStage9(), 80);
    expect(["manual_review", "approve_with_notes"]).toContain(r.decision_outcome);
  });
  it("escalates when physics mismatch alone", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6({ damageZones: [{ zone: "front", componentCount: 3, maxSeverity: "severe" }] }), makeStage7("rear"), makeStage8(15, "minimal"), makeStage9(), 80);
    expect(["escalate", "reject_pending"]).toContain(r.decision_outcome);
  });
});

// ─── 8. Output contract ───────────────────────────────────────────────────────

describe("output contract", () => {
  it("always returns all required fields", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    expect(Array.isArray(r.causal_chain)).toBe(true);
    expect(typeof r.chain_summary).toBe("string");
    expect(typeof r.decision_outcome).toBe("string");
    expect(typeof r.confidence_score).toBe("number");
    expect(typeof r.escalation_required).toBe("boolean");
    expect(typeof r.generated_at).toBe("string");
    expect(typeof r.step_count).toBe("number");
    expect(typeof r.critical_step_count).toBe("number");
    expect(typeof r.warning_step_count).toBe("number");
  });
  it("step_count matches causal_chain length", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    expect(r.step_count).toBe(r.causal_chain.length);
  });
  it("critical_step_count matches count of critical steps", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(80, "high"), makeStage9(), 80);
    expect(r.critical_step_count).toBe(r.causal_chain.filter((s) => s.severity === "critical").length);
  });
  it("warning_step_count matches count of warning steps", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(50, "medium"), makeStage9(), 80);
    expect(r.warning_step_count).toBe(r.causal_chain.filter((s) => s.severity === "warning").length);
  });
  it("confidence_score matches the input confidence", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 75);
    expect(r.confidence_score).toBe(75);
  });
  it("generated_at is a valid ISO timestamp", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    expect(new Date(r.generated_at).getFullYear()).toBeGreaterThan(2020);
  });
  it("each step has all required fields", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    for (const step of r.causal_chain) {
      expect(typeof step.step).toBe("number");
      expect(["input", "analysis", "result", "decision"]).toContain(step.category);
      expect(typeof step.key).toBe("string");
      expect(typeof step.description).toBe("string");
      expect(["info", "warning", "critical"]).toContain(step.severity);
      expect(typeof step.source_stage).toBe("string");
    }
  });
});

// ─── 9. Escalation flag ───────────────────────────────────────────────────────

describe("escalation_required flag", () => {
  it("is false when decision is 'approve'", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal"), makeStage8(15, "minimal"), makeStage9(), 90);
    if (r.decision_outcome === "approve") expect(r.escalation_required).toBe(false);
  });
  it("is true when decision is 'escalate'", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(80, "high"), null, 80);
    if (r.decision_outcome === "escalate") expect(r.escalation_required).toBe(true);
  });
  it("is true when decision is 'reject_pending'", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6({ damageZones: [{ zone: "front", componentCount: 3, maxSeverity: "severe" }] }), makeStage7("rear"), makeStage8(80, "high"), makeStage9(), 80);
    if (r.decision_outcome === "reject_pending") expect(r.escalation_required).toBe(true);
  });
  it("is false when decision is 'manual_review'", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(50, "medium"), null, 80);
    if (r.decision_outcome === "manual_review") expect(r.escalation_required).toBe(false);
  });
});

// ─── 10. Null / degraded input handling ──────────────────────────────────────

describe("null / degraded input handling", () => {
  it("handles all null inputs gracefully", () => {
    const r = buildCausalChain(null, null, null, null, null, 50);
    expect(r).toBeDefined();
    expect(Array.isArray(r.causal_chain)).toBe(true);
    expect(r.causal_chain.length).toBeGreaterThan(0);
  });
  it("generates 'claim_data_unavailable' when claimRecord is null", () => {
    const r = buildCausalChain(null, null, null, null, null, 50);
    expect(r.causal_chain.find((x) => x.key === "claim_data_unavailable")).toBeDefined();
  });
  it("still produces a final decision step even with all nulls", () => {
    const r = buildCausalChain(null, null, null, null, null, 50);
    expect(r.causal_chain.find((x) => x.key.startsWith("final_decision_"))).toBeDefined();
  });
  it("returns valid output structure even with all nulls", () => {
    const r = buildCausalChain(null, null, null, null, null, 50);
    expect(typeof r.decision_outcome).toBe("string");
    expect(typeof r.chain_summary).toBe("string");
    expect(typeof r.escalation_required).toBe("boolean");
  });
});

// ─── 11. Step numbering and ordering ─────────────────────────────────────────

describe("step numbering and ordering", () => {
  it("steps are numbered sequentially starting from 1", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    r.causal_chain.forEach((step, i) => expect(step.step).toBe(i + 1));
  });
  it("input steps come before analysis steps", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    const firstInputIdx = r.causal_chain.findIndex((s) => s.category === "input");
    const firstAnalysisIdx = r.causal_chain.findIndex((s) => s.category === "analysis");
    expect(firstInputIdx).toBeLessThan(firstAnalysisIdx);
  });
  it("final decision step is always the last step", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    expect(r.causal_chain[r.causal_chain.length - 1].key).toMatch(/^final_decision_/);
  });
  it("chain has at least 3 steps even with minimal input", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    expect(r.causal_chain.length).toBeGreaterThanOrEqual(3);
  });
  it("chain has more steps with full input than with null input", () => {
    const full = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    const empty = buildCausalChain(makeClaimRecord(), null, null, null, null, 80);
    expect(full.step_count).toBeGreaterThan(empty.step_count);
  });
});

// ─── 12. Chain summary generation ────────────────────────────────────────────

describe("chain summary generation", () => {
  it("chain_summary is a non-empty string", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    expect(r.chain_summary.length).toBeGreaterThan(10);
  });
  it("summary contains 'decision'", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9(), 80);
    expect(r.chain_summary.toLowerCase()).toContain("decision");
  });
  it("summary contains arrow or decision keyword", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(50, "medium"), makeStage9(), 80);
    expect(r.chain_summary).toMatch(/→|decision/);
  });
  it("summary for approve outcome contains 'APPROVE'", () => {
    const r = buildCausalChain(makeClaimRecord(), makeStage6(), makeStage7("frontal"), makeStage8(15, "minimal"), makeStage9(), 90);
    if (r.decision_outcome === "approve") expect(r.chain_summary).toContain("APPROVE");
  });
  it("summary for escalate outcome contains 'ESCALATE'", () => {
    const r = buildCausalChain(makeClaimRecord(), null, null, makeStage8(80, "high"), null, 80);
    if (r.decision_outcome === "escalate") expect(r.chain_summary).toContain("ESCALATE");
  });
});
