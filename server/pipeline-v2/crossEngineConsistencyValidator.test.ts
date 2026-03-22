/**
 * crossEngineConsistencyValidator.test.ts
 */
import { describe, it, expect } from "vitest";
import { validateCrossEngineConsistency } from "./crossEngineConsistencyValidator";
import type { CrossEngineValidatorInput } from "./crossEngineConsistencyValidator";

function makeInput(overrides: Partial<CrossEngineValidatorInput> = {}): CrossEngineValidatorInput {
  return { claimRecord: null, stage6: null, stage7: null, stage8: null, ...overrides };
}
function makeStage7(overrides: Record<string, unknown> = {}): unknown {
  return { physicsExecuted: true, accidentSeverity: "moderate", damageConsistencyScore: 72, ...overrides };
}
function makeStage6(overrides: Record<string, unknown> = {}): unknown {
  return { overallSeverityScore: 50, damageZones: [{ zone: "front", severity: "moderate" }], ...overrides };
}
function makeStage8(overrides: Record<string, unknown> = {}): unknown {
  return { fraudRiskScore: 20, fraudRiskLevel: "low", indicators: [], damageConsistencyScore: 70, scenarioFraudResult: null, ...overrides };
}
function makeClaimRecord(overrides: Record<string, unknown> = {}): unknown {
  return { accidentDetails: { collisionDirection: "front" }, ...overrides };
}

// ── NULL / EMPTY INPUT ──────────────────────────────────────────────────────
describe("Null / empty input", () => {
  it("returns score 50 and CONFLICTED when all inputs are null", () => {
    const r = validateCrossEngineConsistency(makeInput());
    expect(r.consistency_score).toBe(50);
    expect(r.overall_status).toBe("CONFLICTED");
    expect(r.agreements).toHaveLength(0);
    expect(r.conflicts).toHaveLength(0);
  });
  it("returns validator_metadata with checks_run=9 even for null input", () => {
    expect(validateCrossEngineConsistency(makeInput()).validator_metadata.checks_run).toBe(9);
  });
  it("returns a reasoning string even for null input", () => {
    const r = validateCrossEngineConsistency(makeInput());
    expect(r.reasoning).toBeTruthy();
    expect(typeof r.reasoning).toBe("string");
  });
});

// ── C1: PHYSICS vs DAMAGE SEVERITY ─────────────────────────────────────────
describe("C1: Physics vs Damage Severity", () => {
  it("STRONG agreement when physics=moderate and damage score=50", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "moderate" }),
      stage6: makeStage6({ overallSeverityScore: 50 }),
    }));
    const c1 = r.agreements.find(a => a.check_id === "c1_physics_damage_severity");
    expect(c1).toBeDefined();
    expect(c1?.strength).toBe("STRONG");
  });
  it("MODERATE agreement when physics=moderate and damage score=30 (1 band apart)", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "moderate" }),
      stage6: makeStage6({ overallSeverityScore: 30 }),
    }));
    const c1 = r.agreements.find(a => a.check_id === "c1_physics_damage_severity");
    expect(c1).toBeDefined();
    expect(c1?.strength).toBe("MODERATE");
  });
  it("SIGNIFICANT conflict when physics=severe and damage score=30 (2 bands apart)", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "severe" }),
      stage6: makeStage6({ overallSeverityScore: 30 }),
    }));
    const c1 = r.conflicts.find(c => c.check_id === "c1_physics_damage_severity");
    expect(c1).toBeDefined();
    expect(c1?.severity).toBe("SIGNIFICANT");
  });
  it("CRITICAL conflict when physics=catastrophic and damage score=5 (4 bands apart)", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "catastrophic" }),
      stage6: makeStage6({ overallSeverityScore: 5 }),
    }));
    const c1 = r.conflicts.find(c => c.check_id === "c1_physics_damage_severity");
    expect(c1).toBeDefined();
    expect(c1?.severity).toBe("CRITICAL");
  });
  it("no C1 check when stage6 is null", () => {
    const r = validateCrossEngineConsistency(makeInput({ stage7: makeStage7(), stage6: null }));
    expect(r.agreements.find(a => a.check_id === "c1_physics_damage_severity")).toBeUndefined();
    expect(r.conflicts.find(c => c.check_id === "c1_physics_damage_severity")).toBeUndefined();
  });
});

// ── C2: PHYSICS vs DOCUMENT DIRECTION ──────────────────────────────────────
describe("C2: Physics vs Document Direction", () => {
  it("STRONG agreement when physics=frontal and document=front", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "front" } }),
      stage7: makeStage7({ impactVector: { direction: "frontal" } }),
    }));
    const c2 = r.agreements.find(a => a.check_id === "c2_physics_document_direction");
    expect(c2).toBeDefined();
    expect(c2?.strength).toBe("STRONG");
  });
  it("CRITICAL conflict when physics=frontal and document=rear (opposite)", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "rear" } }),
      stage7: makeStage7({ impactVector: { direction: "frontal" } }),
    }));
    const c2 = r.conflicts.find(c => c.check_id === "c2_physics_document_direction");
    expect(c2).toBeDefined();
    expect(c2?.severity).toBe("CRITICAL");
  });
  it("SIGNIFICANT conflict when physics=frontal and document=side_driver", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "side_driver" } }),
      stage7: makeStage7({ impactVector: { direction: "frontal" } }),
    }));
    const c2 = r.conflicts.find(c => c.check_id === "c2_physics_document_direction");
    expect(c2).toBeDefined();
    expect(c2?.severity).toBe("SIGNIFICANT");
  });
  it("no C2 check when claimRecord is null", () => {
    const r = validateCrossEngineConsistency(makeInput({ claimRecord: null, stage7: makeStage7({ impactVector: { direction: "frontal" } }) }));
    expect(r.agreements.find(a => a.check_id === "c2_physics_document_direction")).toBeUndefined();
  });
  it("normalises head_on to frontal correctly", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "front" } }),
      stage7: makeStage7({ impactVector: { direction: "head_on" } }),
    }));
    const c2 = r.agreements.find(a => a.check_id === "c2_physics_document_direction");
    expect(c2).toBeDefined();
    expect(c2?.strength).toBe("STRONG");
  });
});

// ── C3: DAMAGE ZONE vs DOCUMENT DIRECTION ──────────────────────────────────
describe("C3: Damage Zone vs Document Direction", () => {
  it("STRONG agreement when primary zone=front and direction=front", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "front" } }),
      stage6: makeStage6({ damageZones: [{ zone: "front", severity: "moderate" }] }),
    }));
    const c3 = r.agreements.find(a => a.check_id === "c3_damage_zone_document_direction");
    expect(c3).toBeDefined();
    expect(c3?.strength).toBe("STRONG");
  });
  it("CRITICAL conflict when primary zone=front and direction=rear", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "rear" } }),
      stage6: makeStage6({ damageZones: [{ zone: "front", severity: "severe" }] }),
    }));
    const c3 = r.conflicts.find(c => c.check_id === "c3_damage_zone_document_direction");
    expect(c3).toBeDefined();
    expect(c3?.severity).toBe("CRITICAL");
  });
  it("no C3 check when stage6 has no damage zones", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord(),
      stage6: makeStage6({ damageZones: [] }),
    }));
    expect(r.agreements.find(a => a.check_id === "c3_damage_zone_document_direction")).toBeUndefined();
  });
  it("picks highest severity zone as primary when multiple zones", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "rear" } }),
      stage6: makeStage6({ damageZones: [{ zone: "front", severity: "minor" }, { zone: "rear", severity: "severe" }] }),
    }));
    const c3 = r.agreements.find(a => a.check_id === "c3_damage_zone_document_direction");
    expect(c3).toBeDefined();
    expect(c3?.strength).toBe("STRONG");
  });
});

// ── C4: DAMAGE PATTERN vs PHYSICS SEVERITY ─────────────────────────────────
describe("C4: Damage Pattern vs Physics Severity", () => {
  it("STRONG agreement when pattern=STRONG and physics=moderate", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "moderate", damagePatternValidation: { pattern_match: "STRONG", confidence: 88, structural_damage_detected: false, validation_detail: {} } }),
    }));
    const c4 = r.agreements.find(a => a.check_id === "c4_damage_pattern_physics");
    expect(c4).toBeDefined();
    expect(c4?.strength).toBe("STRONG");
  });
  it("MODERATE agreement when pattern=MODERATE and physics=minor", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "minor", damagePatternValidation: { pattern_match: "MODERATE", confidence: 65, structural_damage_detected: false, validation_detail: {} } }),
    }));
    const c4 = r.agreements.find(a => a.check_id === "c4_damage_pattern_physics");
    expect(c4).toBeDefined();
    expect(c4?.strength).toBe("MODERATE");
  });
  it("CRITICAL conflict when pattern=NONE and physics=severe", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "severe", damagePatternValidation: { pattern_match: "NONE", confidence: 80, structural_damage_detected: false, validation_detail: {} } }),
    }));
    const c4 = r.conflicts.find(c => c.check_id === "c4_damage_pattern_physics");
    expect(c4).toBeDefined();
    expect(c4?.severity).toBe("CRITICAL");
  });
  it("SIGNIFICANT conflict when pattern=WEAK and physics=moderate", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "moderate", damagePatternValidation: { pattern_match: "WEAK", confidence: 55, structural_damage_detected: false, validation_detail: {} } }),
    }));
    const c4 = r.conflicts.find(c => c.check_id === "c4_damage_pattern_physics");
    expect(c4).toBeDefined();
    expect(c4?.severity).toBe("SIGNIFICANT");
  });
  it("MODERATE agreement when pattern=NONE and physics=cosmetic (low energy)", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "cosmetic", damagePatternValidation: { pattern_match: "NONE", confidence: 40, structural_damage_detected: false, validation_detail: {} } }),
    }));
    const c4 = r.agreements.find(a => a.check_id === "c4_damage_pattern_physics");
    expect(c4).toBeDefined();
    expect(c4?.strength).toBe("MODERATE");
  });
});

// ── C5: IMAGE CONTRADICTION vs FRAUD SCORE ─────────────────────────────────
describe("C5: Image Contradiction vs Fraud Score", () => {
  it("STRONG agreement when no contradiction and fraud score < 40", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damagePatternValidation: { pattern_match: "STRONG", confidence: 85, structural_damage_detected: false, validation_detail: { image_contradiction: false } } }),
      stage8: makeStage8({ fraudRiskScore: 20 }),
    }));
    const c5 = r.agreements.find(a => a.check_id === "c5_image_contradiction_fraud");
    expect(c5).toBeDefined();
    expect(c5?.strength).toBe("STRONG");
  });
  it("MODERATE agreement when contradiction AND fraud score >= 40", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damagePatternValidation: { pattern_match: "WEAK", confidence: 55, structural_damage_detected: false, validation_detail: { image_contradiction: true, image_contradiction_reason: "Inconsistent zone" } } }),
      stage8: makeStage8({ fraudRiskScore: 60 }),
    }));
    const c5 = r.agreements.find(a => a.check_id === "c5_image_contradiction_fraud");
    expect(c5).toBeDefined();
    expect(c5?.strength).toBe("MODERATE");
  });
  it("SIGNIFICANT conflict when contradiction detected but fraud score is low", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damagePatternValidation: { pattern_match: "WEAK", confidence: 55, structural_damage_detected: false, validation_detail: { image_contradiction: true, image_contradiction_reason: "Rust visible" } } }),
      stage8: makeStage8({ fraudRiskScore: 25 }),
    }));
    const c5 = r.conflicts.find(c => c.check_id === "c5_image_contradiction_fraud");
    expect(c5).toBeDefined();
    expect(c5?.severity).toBe("SIGNIFICANT");
  });
});

// ── C6: SCENARIO FRAUD vs PHYSICS ──────────────────────────────────────────
describe("C6: Scenario Fraud vs Physics", () => {
  it("STRONG agreement when physics confirms moderate+ severity and scenario fraud is LOW", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ physicsExecuted: true, accidentSeverity: "moderate" }),
      stage8: makeStage8({ scenarioFraudResult: { fraud_score: 18, risk_level: "LOW", flags: [], reasoning: "Consistent." } }),
    }));
    const c6 = r.agreements.find(a => a.check_id === "c6_scenario_fraud_physics");
    expect(c6).toBeDefined();
    expect(c6?.strength).toBe("STRONG");
  });
  it("MODERATE agreement when physics not executed and scenario fraud is LOW", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ physicsExecuted: false, accidentSeverity: "cosmetic" }),
      stage8: makeStage8({ scenarioFraudResult: { fraud_score: 15, risk_level: "LOW", flags: [], reasoning: "Non-physical." } }),
    }));
    const c6 = r.agreements.find(a => a.check_id === "c6_scenario_fraud_physics");
    expect(c6).toBeDefined();
    expect(c6?.strength).toBe("MODERATE");
  });
  it("SIGNIFICANT conflict when physics confirms severe and scenario fraud is HIGH", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ physicsExecuted: true, accidentSeverity: "severe" }),
      stage8: makeStage8({ scenarioFraudResult: { fraud_score: 75, risk_level: "HIGH", flags: ["timeline_inconsistency"], reasoning: "Multiple flags." } }),
    }));
    const c6 = r.conflicts.find(c => c.check_id === "c6_scenario_fraud_physics");
    expect(c6).toBeDefined();
    expect(c6?.severity).toBe("SIGNIFICANT");
  });
});

// ── C7: FRAUD vs PHYSICS CONSISTENCY SCORE ─────────────────────────────────
describe("C7: Fraud vs Physics Consistency Score", () => {
  it("STRONG agreement when scores within 5 points", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damageConsistencyScore: 75 }),
      stage8: makeStage8({ damageConsistencyScore: 72 }),
    }));
    const c7 = r.agreements.find(a => a.check_id === "c7_fraud_physics_consistency");
    expect(c7).toBeDefined();
    expect(c7?.strength).toBe("STRONG");
  });
  it("MODERATE agreement when scores within 15 points", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damageConsistencyScore: 80 }),
      stage8: makeStage8({ damageConsistencyScore: 68 }),
    }));
    const c7 = r.agreements.find(a => a.check_id === "c7_fraud_physics_consistency");
    expect(c7).toBeDefined();
    expect(c7?.strength).toBe("MODERATE");
  });
  it("MINOR conflict when scores 16-30 points apart", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damageConsistencyScore: 85 }),
      stage8: makeStage8({ damageConsistencyScore: 60 }),
    }));
    const c7 = r.conflicts.find(c => c.check_id === "c7_fraud_physics_consistency");
    expect(c7).toBeDefined();
    expect(c7?.severity).toBe("MINOR");
  });
  it("SIGNIFICANT conflict when scores more than 30 points apart", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damageConsistencyScore: 90 }),
      stage8: makeStage8({ damageConsistencyScore: 40 }),
    }));
    const c7 = r.conflicts.find(c => c.check_id === "c7_fraud_physics_consistency");
    expect(c7).toBeDefined();
    expect(c7?.severity).toBe("SIGNIFICANT");
  });
  it("normalises 0-1 scale to 0-100", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damageConsistencyScore: 0.75 }),
      stage8: makeStage8({ damageConsistencyScore: 0.72 }),
    }));
    const c7 = r.agreements.find(a => a.check_id === "c7_fraud_physics_consistency");
    expect(c7).toBeDefined();
    expect(c7?.strength).toBe("STRONG");
  });
});

// ── C8: STRUCTURAL DAMAGE vs PHYSICS SEVERITY ──────────────────────────────
describe("C8: Structural Damage vs Physics Severity", () => {
  it("STRONG agreement when structural damage detected and physics=severe", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "severe", damagePatternValidation: { pattern_match: "STRONG", confidence: 90, structural_damage_detected: true, validation_detail: {} } }),
    }));
    const c8 = r.agreements.find(a => a.check_id === "c8_structural_damage_physics");
    expect(c8).toBeDefined();
    expect(c8?.strength).toBe("STRONG");
  });
  it("CRITICAL conflict when structural damage detected but physics=cosmetic", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "cosmetic", damagePatternValidation: { pattern_match: "MODERATE", confidence: 60, structural_damage_detected: true, validation_detail: {} } }),
    }));
    const c8 = r.conflicts.find(c => c.check_id === "c8_structural_damage_physics");
    expect(c8).toBeDefined();
    expect(c8?.severity).toBe("CRITICAL");
  });
  it("no C8 check when structural_damage_detected is false", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "severe", damagePatternValidation: { pattern_match: "STRONG", confidence: 90, structural_damage_detected: false, validation_detail: {} } }),
    }));
    expect(r.agreements.find(a => a.check_id === "c8_structural_damage_physics")).toBeUndefined();
  });
});

// ── C9: FRAUD INDICATORS vs DAMAGE PATTERN ─────────────────────────────────
describe("C9: Fraud Indicators vs Damage Pattern", () => {
  it("MODERATE agreement when both engines flag damage pattern issue", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damagePatternValidation: { pattern_match: "NONE", confidence: 75, structural_damage_detected: false, validation_detail: {} } }),
      stage8: makeStage8({ indicators: [{ indicator: "damage_pattern_none", score: 35, description: "No expected components" }] }),
    }));
    const c9 = r.agreements.find(a => a.check_id === "c9_fraud_indicators_damage_pattern");
    expect(c9).toBeDefined();
    expect(c9?.strength).toBe("MODERATE");
  });
  it("MINOR conflict when damage pattern is WEAK but fraud engine did not flag it", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damagePatternValidation: { pattern_match: "WEAK", confidence: 55, structural_damage_detected: false, validation_detail: {} } }),
      stage8: makeStage8({ indicators: [] }),
    }));
    const c9 = r.conflicts.find(c => c.check_id === "c9_fraud_indicators_damage_pattern");
    expect(c9).toBeDefined();
    expect(c9?.severity).toBe("MINOR");
  });
  it("no C9 check when damage pattern is STRONG", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ damagePatternValidation: { pattern_match: "STRONG", confidence: 90, structural_damage_detected: false, validation_detail: {} } }),
      stage8: makeStage8({ indicators: [] }),
    }));
    expect(r.agreements.find(a => a.check_id === "c9_fraud_indicators_damage_pattern")).toBeUndefined();
  });
});

// ── OVERALL STATUS & SCORE ──────────────────────────────────────────────────
describe("Overall status and score computation", () => {
  it("returns CONSISTENT when all available engines agree", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "front" } }),
      stage6: makeStage6({ overallSeverityScore: 50, damageZones: [{ zone: "front", severity: "moderate" }] }),
      stage7: makeStage7({ physicsExecuted: true, accidentSeverity: "moderate", damageConsistencyScore: 72, impactVector: { direction: "frontal" }, damagePatternValidation: { pattern_match: "STRONG", confidence: 88, structural_damage_detected: false, validation_detail: { image_contradiction: false } } }),
      stage8: makeStage8({ fraudRiskScore: 18, damageConsistencyScore: 70, scenarioFraudResult: { fraud_score: 18, risk_level: "LOW", flags: [], reasoning: "Consistent." } }),
    }));
    expect(r.overall_status).toBe("CONSISTENT");
    expect(r.consistency_score).toBeGreaterThan(55);
  });
  it("returns CONFLICTED when a CRITICAL conflict exists", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "severe", damagePatternValidation: { pattern_match: "NONE", confidence: 80, structural_damage_detected: false, validation_detail: {} } }),
      stage6: makeStage6({ overallSeverityScore: 5 }),
    }));
    expect(r.overall_status).toBe("CONFLICTED");
  });
  it("caps score at 45 when exactly 1 CRITICAL conflict", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "catastrophic", damagePatternValidation: { pattern_match: "NONE", confidence: 90, structural_damage_detected: false, validation_detail: {} } }),
      stage6: makeStage6({ overallSeverityScore: 5 }),
    }));
    expect(r.consistency_score).toBeLessThanOrEqual(45);
    expect(r.critical_conflict_count).toBeGreaterThanOrEqual(1);
  });
  it("caps score at 25 when 2+ CRITICAL conflicts", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "rear" } }),
      stage7: makeStage7({ accidentSeverity: "catastrophic", impactVector: { direction: "frontal" }, damagePatternValidation: { pattern_match: "NONE", confidence: 90, structural_damage_detected: false, validation_detail: {} } }),
      stage6: makeStage6({ overallSeverityScore: 5 }),
    }));
    expect(r.consistency_score).toBeLessThanOrEqual(25);
    expect(r.critical_conflict_count).toBeGreaterThanOrEqual(2);
  });
  it("score is higher with more STRONG agreements", () => {
    const base = validateCrossEngineConsistency(makeInput({ stage7: makeStage7({ accidentSeverity: "moderate" }), stage6: makeStage6({ overallSeverityScore: 50 }) }));
    const rich = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "front" } }),
      stage6: makeStage6({ overallSeverityScore: 50, damageZones: [{ zone: "front", severity: "moderate" }] }),
      stage7: makeStage7({ physicsExecuted: true, accidentSeverity: "moderate", damageConsistencyScore: 72, impactVector: { direction: "frontal" }, damagePatternValidation: { pattern_match: "STRONG", confidence: 88, structural_damage_detected: false, validation_detail: { image_contradiction: false } } }),
      stage8: makeStage8({ fraudRiskScore: 18, damageConsistencyScore: 70, scenarioFraudResult: { fraud_score: 18, risk_level: "LOW", flags: [], reasoning: "Consistent." } }),
    }));
    expect(rich.consistency_score).toBeGreaterThan(base.consistency_score);
  });
});

// ── REASONING ───────────────────────────────────────────────────────────────
describe("Reasoning narrative", () => {
  it("mentions CONFLICTED in reasoning when conflicts exist", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "severe", damagePatternValidation: { pattern_match: "NONE", confidence: 80, structural_damage_detected: false, validation_detail: {} } }),
    }));
    expect(r.reasoning).toContain("CONFLICTED");
  });
  it("mentions available engines in reasoning", () => {
    const r = validateCrossEngineConsistency(makeInput({ stage7: makeStage7(), stage8: makeStage8() }));
    expect(r.reasoning).toMatch(/physics|fraud/i);
  });
});

// ── VALIDATOR METADATA ───────────────────────────────────────────────────────
describe("Validator metadata", () => {
  it("correctly counts agreements and conflicts", () => {
    const r = validateCrossEngineConsistency(makeInput({ stage7: makeStage7({ accidentSeverity: "moderate" }), stage6: makeStage6({ overallSeverityScore: 50 }) }));
    expect(r.validator_metadata.agreements_found).toBe(r.agreements.length);
    expect(r.validator_metadata.conflicts_found).toBe(r.conflicts.length);
  });
  it("reports inputs_available correctly", () => {
    const r = validateCrossEngineConsistency(makeInput({ stage7: makeStage7(), stage8: makeStage8() }));
    expect(r.validator_metadata.inputs_available.physics).toBe(true);
    expect(r.validator_metadata.inputs_available.fraud).toBe(true);
    expect(r.validator_metadata.inputs_available.damage).toBe(false);
  });
  it("tracks score_before_conflict_penalty and conflict_penalty_applied", () => {
    const r = validateCrossEngineConsistency(makeInput({
      stage7: makeStage7({ accidentSeverity: "severe", damagePatternValidation: { pattern_match: "NONE", confidence: 80, structural_damage_detected: false, validation_detail: {} } }),
    }));
    expect(r.validator_metadata.score_before_conflict_penalty).toBeGreaterThanOrEqual(0);
    expect(r.validator_metadata.conflict_penalty_applied).toBeGreaterThan(0);
  });
});

// ── REAL-WORLD: MAZDA BT-50 CATTLE STRIKE ───────────────────────────────────
describe("Real-world scenario: Mazda BT-50 cattle strike", () => {
  it("returns CONSISTENT for a legitimate frontal cattle strike", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "front" } }),
      stage6: makeStage6({ overallSeverityScore: 55, damageZones: [{ zone: "front", severity: "severe" }, { zone: "hood", severity: "moderate" }] }),
      stage7: makeStage7({ physicsExecuted: true, accidentSeverity: "moderate", damageConsistencyScore: 78, impactVector: { direction: "frontal" }, damagePatternValidation: { pattern_match: "STRONG", confidence: 82, structural_damage_detected: false, validation_detail: { image_contradiction: false } } }),
      stage8: makeStage8({ fraudRiskScore: 12, damageConsistencyScore: 76, indicators: [], scenarioFraudResult: { fraud_score: 12, risk_level: "LOW", flags: [], false_positive_protection: [{ reason: "Missing police report normal for animal strike" }], reasoning: "Legitimate animal strike." } }),
    }));
    expect(r.overall_status).toBe("CONSISTENT");
    expect(r.consistency_score).toBeGreaterThan(60);
    expect(r.critical_conflict_count).toBe(0);
    expect(r.agreements.length).toBeGreaterThan(0);
  });
});

// ── REAL-WORLD: STAGED COLLISION ─────────────────────────────────────────────
describe("Real-world scenario: Staged collision (fraud)", () => {
  it("returns CONFLICTED with CRITICAL conflicts for staged rear-end with frontal damage", () => {
    const r = validateCrossEngineConsistency(makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: { collisionDirection: "rear" } }),
      stage6: makeStage6({ overallSeverityScore: 5, damageZones: [{ zone: "front", severity: "severe" }] }),
      stage7: makeStage7({ physicsExecuted: true, accidentSeverity: "catastrophic", damageConsistencyScore: 20, impactVector: { direction: "frontal" }, damagePatternValidation: { pattern_match: "NONE", confidence: 85, structural_damage_detected: true, validation_detail: { image_contradiction: true, image_contradiction_reason: "Damage is frontal but claim states rear impact" } } }),
      stage8: makeStage8({ fraudRiskScore: 85, damageConsistencyScore: 15, indicators: [{ indicator: "damage_pattern_none", score: 35, description: "No expected rear components" }, { indicator: "damage_image_contradiction", score: 30, description: "Image contradicts claim" }], scenarioFraudResult: { fraud_score: 85, risk_level: "HIGH", flags: ["damage_pattern_none", "image_contradiction"], reasoning: "Multiple fraud indicators." } }),
    }));
    expect(r.overall_status).toBe("CONFLICTED");
    expect(r.critical_conflict_count).toBeGreaterThanOrEqual(2);
    expect(r.consistency_score).toBeLessThanOrEqual(25);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
});
