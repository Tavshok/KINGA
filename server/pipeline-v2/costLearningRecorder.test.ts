/**
 * costLearningRecorder.test.ts
 *
 * Unit tests for the Cost Intelligence Learning Recorder module.
 * Covers: component normalisation, structural detection, case signature,
 * weight computation, high-cost driver identification, quote coverage,
 * validated-outcomes-only policy, cost_tier derivation, accident_severity,
 * and pattern aggregation.
 */

import { describe, it, expect } from "vitest";
import {
  normaliseComponentName,
  isStructuralComponent,
  generateCaseSignature,
  deriveCostTier,
  checkValidatedOutcomePolicy,
  extractCostLearningRecord,
  aggregateCostPatterns,
  type CostLearningInput,
  type CostLearningRecord,
} from "./costLearningRecorder";

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

describe("normaliseComponentName", () => {
  it("normalises 'bonnet' to 'bonnet/hood'", () => {
    expect(normaliseComponentName("bonnet")).toBe("bonnet/hood");
  });

  it("normalises 'hood' to 'bonnet/hood'", () => {
    expect(normaliseComponentName("hood")).toBe("bonnet/hood");
  });

  it("normalises 'windscreen' to 'windshield/windscreen'", () => {
    expect(normaliseComponentName("windscreen")).toBe("windshield/windscreen");
  });

  it("normalises 'windshield' to 'windshield/windscreen'", () => {
    expect(normaliseComponentName("windshield")).toBe("windshield/windscreen");
  });

  it("normalises 'headlight' to 'headlamp assembly'", () => {
    expect(normaliseComponentName("headlight")).toBe("headlamp assembly");
  });

  it("normalises 'headlamp' to 'headlamp assembly'", () => {
    expect(normaliseComponentName("headlamp")).toBe("headlamp assembly");
  });

  it("normalises 'grille' to 'front grille'", () => {
    expect(normaliseComponentName("grille")).toBe("front grille");
  });

  it("normalises 'grill' to 'front grille'", () => {
    expect(normaliseComponentName("grill")).toBe("front grille");
  });

  it("normalises 'radiator support' to 'radiator support panel'", () => {
    expect(normaliseComponentName("radiator support")).toBe("radiator support panel");
  });

  it("normalises 'rad support' to 'radiator support panel'", () => {
    expect(normaliseComponentName("rad support")).toBe("radiator support panel");
  });

  it("normalises 'chassis' to 'chassis/frame'", () => {
    expect(normaliseComponentName("chassis")).toBe("chassis/frame");
  });

  it("normalises 'frame' to 'chassis/frame'", () => {
    expect(normaliseComponentName("frame")).toBe("chassis/frame");
  });

  it("normalises 'front bumper' to 'front bumper assembly'", () => {
    expect(normaliseComponentName("front bumper")).toBe("front bumper assembly");
  });

  it("normalises 'bumper cover' to 'front bumper assembly'", () => {
    expect(normaliseComponentName("bumper cover")).toBe("front bumper assembly");
  });

  it("normalises 'tail light' to 'tail lamp assembly'", () => {
    expect(normaliseComponentName("tail light")).toBe("tail lamp assembly");
  });

  it("normalises 'wing mirror' to 'door mirror'", () => {
    expect(normaliseComponentName("wing mirror")).toBe("door mirror");
  });

  it("returns unknown components unchanged (lowercase)", () => {
    expect(normaliseComponentName("custom_part_xyz")).toBe("custom_part_xyz");
  });

  it("handles uppercase input by lowercasing", () => {
    expect(normaliseComponentName("BONNET")).toBe("bonnet/hood");
  });

  it("handles mixed case input", () => {
    expect(normaliseComponentName("Windscreen")).toBe("windshield/windscreen");
  });

  it("trims whitespace", () => {
    expect(normaliseComponentName("  grille  ")).toBe("front grille");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL COMPONENT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("isStructuralComponent", () => {
  it("detects chassis/frame as structural", () => {
    expect(isStructuralComponent("chassis/frame")).toBe(true);
  });

  it("detects radiator support panel as structural", () => {
    expect(isStructuralComponent("radiator support panel")).toBe(true);
  });

  it("detects sill panel as structural", () => {
    expect(isStructuralComponent("sill panel")).toBe(true);
  });

  it("detects front subframe as structural", () => {
    expect(isStructuralComponent("front subframe")).toBe(true);
  });

  it("detects bumper bracket as structural", () => {
    expect(isStructuralComponent("bumper bracket")).toBe(true);
  });

  it("detects diff connector as structural", () => {
    expect(isStructuralComponent("diff connector")).toBe(true);
  });

  it("detects differential connector as structural", () => {
    expect(isStructuralComponent("differential connector")).toBe(true);
  });

  it("detects A-pillar as structural", () => {
    expect(isStructuralComponent("a-pillar")).toBe(true);
  });

  it("detects B-pillar as structural", () => {
    expect(isStructuralComponent("b pillar")).toBe(true);
  });

  it("does NOT flag front bumper assembly as structural", () => {
    expect(isStructuralComponent("front bumper assembly")).toBe(false);
  });

  it("does NOT flag headlamp assembly as structural", () => {
    expect(isStructuralComponent("headlamp assembly")).toBe(false);
  });

  it("does NOT flag bonnet/hood as structural", () => {
    expect(isStructuralComponent("bonnet/hood")).toBe(false);
  });

  it("does NOT flag front grille as structural", () => {
    expect(isStructuralComponent("front grille")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COST TIER DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveCostTier", () => {
  it("returns 'low' for cost < $1,500", () => {
    expect(deriveCostTier(0)).toBe("low");
    expect(deriveCostTier(500)).toBe("low");
    expect(deriveCostTier(1499.99)).toBe("low");
  });

  it("returns 'medium' for cost $1,500–$5,000", () => {
    expect(deriveCostTier(1500)).toBe("medium");
    expect(deriveCostTier(3000)).toBe("medium");
    expect(deriveCostTier(5000)).toBe("medium");
  });

  it("returns 'high' for cost > $5,000", () => {
    expect(deriveCostTier(5001)).toBe("high");
    expect(deriveCostTier(10000)).toBe("high");
    expect(deriveCostTier(50000)).toBe("high");
  });

  it("boundary: $1,500 is medium", () => {
    expect(deriveCostTier(1500)).toBe("medium");
  });

  it("boundary: $5,000 is medium", () => {
    expect(deriveCostTier(5000)).toBe("medium");
  });

  it("boundary: $5,000.01 is high", () => {
    expect(deriveCostTier(5000.01)).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASE SIGNATURE GENERATION (new format)
// ─────────────────────────────────────────────────────────────────────────────

describe("generateCaseSignature", () => {
  it("generates correct format: vehicleType_impact_severity_componentCount_costTier", () => {
    const sig = generateCaseSignature("pickup", "frontal", "severe", 6, "high");
    expect(sig).toBe("pickup_frontal_severe_6c_high");
  });

  it("generates correct signature for sedan rear moderate 3 components low cost", () => {
    const sig = generateCaseSignature("sedan", "rear", "moderate", 3, "low");
    expect(sig).toBe("sedan_rear_moderate_3c_low");
  });

  it("generates correct signature for suv side minor 4 components medium cost", () => {
    const sig = generateCaseSignature("suv", "side_driver", "minor", 4, "medium");
    expect(sig).toBe("suv_side_driver_minor_4c_medium");
  });

  it("generates correct signature for total_loss", () => {
    const sig = generateCaseSignature("pickup", "rollover", "total_loss", 12, "high");
    expect(sig).toBe("pickup_rollover_total_loss_12c_high");
  });

  it("replaces spaces in vehicle type with underscores", () => {
    const sig = generateCaseSignature("light truck", "rear", "moderate", 5, "medium");
    expect(sig).toContain("light_truck");
  });

  it("handles unknown collision direction", () => {
    const sig = generateCaseSignature("sedan", "unknown", "minor", 2, "low");
    expect(sig).toContain("unknown");
  });

  it("normalises special characters in vehicle type", () => {
    const sig = generateCaseSignature("4x4/suv", "frontal", "moderate", 4, "medium");
    expect(sig).toMatch(/^4x4_suv_frontal_moderate_4c_medium$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATED-OUTCOMES-ONLY POLICY GATE
// ─────────────────────────────────────────────────────────────────────────────

describe("checkValidatedOutcomePolicy", () => {
  it("accepts assessor_validated with any confidence", () => {
    expect(checkValidatedOutcomePolicy(2500, "assessor_validated", 10)).toBeNull();
    expect(checkValidatedOutcomePolicy(2500, "assessor_validated", 100)).toBeNull();
    expect(checkValidatedOutcomePolicy(2500, "assessor_validated", null)).toBeNull();
  });

  it("accepts system_optimised with confidence >= 60", () => {
    expect(checkValidatedOutcomePolicy(2500, "system_optimised", 60)).toBeNull();
    expect(checkValidatedOutcomePolicy(2500, "system_optimised", 75)).toBeNull();
    expect(checkValidatedOutcomePolicy(2500, "system_optimised", 100)).toBeNull();
  });

  it("rejects system_optimised with confidence < 60", () => {
    const rejection = checkValidatedOutcomePolicy(2500, "system_optimised", 59);
    expect(rejection).not.toBeNull();
    expect(rejection!.rejection_reason).toContain("59");
    expect(rejection!.rejection_reason).toContain("60");
  });

  it("rejects system_optimised with null confidence (treated as 0)", () => {
    const rejection = checkValidatedOutcomePolicy(2500, "system_optimised", null);
    expect(rejection).not.toBeNull();
  });

  it("rejects when trueCostUsd is null", () => {
    const rejection = checkValidatedOutcomePolicy(null, "assessor_validated", 90);
    expect(rejection).not.toBeNull();
    expect(rejection!.rejection_reason).toContain("No validated true cost");
  });

  it("rejects when trueCostUsd is 0", () => {
    const rejection = checkValidatedOutcomePolicy(0, "assessor_validated", 90);
    expect(rejection).not.toBeNull();
  });

  it("rejects when trueCostUsd is negative", () => {
    const rejection = checkValidatedOutcomePolicy(-100, "assessor_validated", 90);
    expect(rejection).not.toBeNull();
  });

  it("rejects when costBasis is null", () => {
    const rejection = checkValidatedOutcomePolicy(2500, null, 90);
    expect(rejection).not.toBeNull();
    expect(rejection!.rejection_reason).toContain("No cost basis");
  });

  it("rejects unknown cost_basis values", () => {
    const rejection = checkValidatedOutcomePolicy(2500, "unknown_basis" as any, 90);
    expect(rejection).not.toBeNull();
  });

  it("rejection includes cost_basis and decision_confidence", () => {
    const rejection = checkValidatedOutcomePolicy(2500, "system_optimised", 30);
    expect(rejection!.cost_basis).toBe("system_optimised");
    expect(rejection!.decision_confidence).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT COST LEARNING RECORD — CORE LOGIC
// ─────────────────────────────────────────────────────────────────────────────

describe("extractCostLearningRecord", () => {
  const baseInput: CostLearningInput = {
    claimId: 2730001,
    vehicleType: "pickup",
    vehicleMake: "Isuzu",
    vehicleModel: "D-Max",
    damageComponents: [
      { name: "bonnet", severity: "moderate" },
      { name: "radiator support", severity: "severe" },
      { name: "headlight", severity: "moderate" },
      { name: "front bumper", severity: "moderate" },
      { name: "grille", severity: "minor" },
    ],
    trueCostUsd: 2576,
    costBasis: "assessor_validated",
    decisionConfidence: 85,
    accidentSeverity: "moderate",
    selectedQuoteComponents: ["bonnet/hood", "radiator support panel", "headlamp assembly", "front bumper assembly"],
    collisionDirection: "frontal",
    marketRegion: "ZW",
  };

  // ── Policy gate ────────────────────────────────────────────────────────────

  it("returns a record when policy passes (assessor_validated)", () => {
    const { record, rejection } = extractCostLearningRecord(baseInput);
    expect(record).not.toBeNull();
    expect(rejection).toBeNull();
  });

  it("returns a record when policy passes (system_optimised, confidence=65)", () => {
    const { record, rejection } = extractCostLearningRecord({
      ...baseInput,
      costBasis: "system_optimised",
      decisionConfidence: 65,
    });
    expect(record).not.toBeNull();
    expect(rejection).toBeNull();
  });

  it("returns null record and rejection when system_optimised confidence < 60", () => {
    const { record, rejection } = extractCostLearningRecord({
      ...baseInput,
      costBasis: "system_optimised",
      decisionConfidence: 45,
    });
    expect(record).toBeNull();
    expect(rejection).not.toBeNull();
    expect(rejection!.rejection_reason).toContain("45");
  });

  it("returns null record and rejection when trueCostUsd is null", () => {
    const { record, rejection } = extractCostLearningRecord({
      ...baseInput,
      trueCostUsd: null,
    });
    expect(record).toBeNull();
    expect(rejection).not.toBeNull();
  });

  it("returns null record and rejection when costBasis is null", () => {
    const { record, rejection } = extractCostLearningRecord({
      ...baseInput,
      costBasis: null,
    });
    expect(record).toBeNull();
    expect(rejection).not.toBeNull();
  });

  // ── Core record fields ─────────────────────────────────────────────────────

  it("returns a CostLearningRecord with correct claim_id", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.claim_id).toBe(2730001);
  });

  it("normalises component names in component_detail", () => {
    const { record } = extractCostLearningRecord(baseInput);
    const names = record!.component_detail.map(c => c.component);
    expect(names).toContain("bonnet/hood");
    expect(names).toContain("radiator support panel");
    expect(names).toContain("headlamp assembly");
    expect(names).toContain("front bumper assembly");
    expect(names).toContain("front grille");
  });

  it("identifies radiator support panel as structural", () => {
    const { record } = extractCostLearningRecord(baseInput);
    const structural = record!.component_detail.find(c => c.component === "radiator support panel");
    expect(structural?.is_structural).toBe(true);
  });

  it("does not flag front bumper assembly as structural", () => {
    const { record } = extractCostLearningRecord(baseInput);
    const bumper = record!.component_detail.find(c => c.component === "front bumper assembly");
    expect(bumper?.is_structural).toBe(false);
  });

  it("structural_component_count reflects structural components", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.structural_component_count).toBe(1); // only radiator support panel
  });

  it("relative weights sum to approximately 1.0", () => {
    const { record } = extractCostLearningRecord(baseInput);
    const total = Object.values(record!.component_weighting).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0, 1);
  });

  it("identifies high-cost drivers (≥15% weight)", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.high_cost_drivers.length).toBeGreaterThan(0);
    expect(record!.high_cost_drivers).toContain("radiator support panel");
  });

  it("sets true_cost_usd from trueCostUsd input", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.true_cost_usd).toBeCloseTo(2576, 0);
  });

  it("sets cost_tier correctly from true_cost_usd", () => {
    const { record } = extractCostLearningRecord(baseInput);
    // $2,576 → medium (1500–5000)
    expect(record!.cost_tier).toBe("medium");
  });

  it("sets cost_tier to 'low' for true_cost_usd < $1,500", () => {
    const { record } = extractCostLearningRecord({ ...baseInput, trueCostUsd: 800 });
    expect(record!.cost_tier).toBe("low");
  });

  it("sets cost_tier to 'high' for true_cost_usd > $5,000", () => {
    const { record } = extractCostLearningRecord({ ...baseInput, trueCostUsd: 7500 });
    expect(record!.cost_tier).toBe("high");
  });

  it("sets accident_severity correctly", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.accident_severity).toBe("moderate");
  });

  it("sets cost_basis correctly", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.cost_basis).toBe("assessor_validated");
  });

  it("sets decision_confidence correctly", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.decision_confidence).toBe(85);
  });

  it("sets cost_is_validated to true for all stored records", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.cost_is_validated).toBe(true);
  });

  it("case_signature uses new format: vehicleType_impact_severity_componentCount_costTier", () => {
    const { record } = extractCostLearningRecord(baseInput);
    // pickup_frontal_moderate_5c_medium
    expect(record!.case_signature).toBe("pickup_frontal_moderate_5c_medium");
  });

  it("case_signature reflects accident_severity (not component severity)", () => {
    const { record } = extractCostLearningRecord({
      ...baseInput,
      accidentSeverity: "severe",
    });
    expect(record!.case_signature).toContain("severe");
  });

  it("case_signature reflects cost_tier", () => {
    const { record: lowRecord } = extractCostLearningRecord({ ...baseInput, trueCostUsd: 800 });
    expect(lowRecord!.case_signature).toContain("low");

    const { record: highRecord } = extractCostLearningRecord({ ...baseInput, trueCostUsd: 8000 });
    expect(highRecord!.case_signature).toContain("high");
  });

  it("adds 'assessor_validated' quality flag for assessor_validated basis", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.quality_flags).toContain("assessor_validated");
  });

  it("adds system_optimised confidence quality flag for system_optimised basis", () => {
    const { record } = extractCostLearningRecord({
      ...baseInput,
      costBasis: "system_optimised",
      decisionConfidence: 70,
    });
    expect(record!.quality_flags.some(f => f.includes("system_optimised_confidence"))).toBe(true);
  });

  it("computes quote_coverage_ratio correctly", () => {
    const { record } = extractCostLearningRecord(baseInput);
    // 4 of 5 damage components are in the quote
    expect(record!.quote_coverage_ratio).toBeCloseTo(0.8, 1);
  });

  it("adds 'no_quote_components' flag when selectedQuoteComponents is empty", () => {
    const { record } = extractCostLearningRecord({ ...baseInput, selectedQuoteComponents: [] });
    expect(record!.quality_flags).toContain("no_quote_components");
  });

  it("sets vehicle_descriptor from make + model + type", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.vehicle_descriptor).toContain("isuzu");
    expect(record!.vehicle_descriptor).toContain("d-max");
    expect(record!.vehicle_descriptor).toContain("pickup");
  });

  it("sets market_region correctly", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.market_region).toBe("ZW");
  });

  it("records component_count correctly", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.component_count).toBe(5);
  });

  it("includes recorded_at as ISO timestamp", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(() => new Date(record!.recorded_at)).not.toThrow();
    expect(record!.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles empty damage components gracefully", () => {
    const { record } = extractCostLearningRecord({ ...baseInput, damageComponents: [] });
    expect(record!.component_count).toBe(0);
    expect(record!.high_cost_drivers).toHaveLength(0);
    expect(record!.quality_flags).toContain("no_damage_components");
  });

  it("handles airbag as a high-cost driver when severe", () => {
    const { record } = extractCostLearningRecord({
      ...baseInput,
      damageComponents: [
        { name: "airbag", severity: "catastrophic" },
        { name: "grille", severity: "minor" },
      ],
    });
    expect(record!.high_cost_drivers).toContain("airbag module");
  });

  it("handles chassis as highest-weight structural component when severe", () => {
    const { record } = extractCostLearningRecord({
      ...baseInput,
      damageComponents: [
        { name: "chassis", severity: "severe" },
        { name: "grille", severity: "cosmetic" },
        { name: "moulding", severity: "cosmetic" },
      ],
    });
    expect(record!.high_cost_drivers[0]).toBe("chassis/frame");
    expect(record!.structural_component_count).toBe(1);
  });

  it("handles rear collision correctly in case signature", () => {
    const { record } = extractCostLearningRecord({ ...baseInput, collisionDirection: "rear" });
    expect(record!.case_signature).toContain("rear");
  });

  it("adds structural_components_present flag when structural components exist", () => {
    const { record } = extractCostLearningRecord(baseInput);
    const structFlag = record!.quality_flags.find(f => f.startsWith("structural_components_present"));
    expect(structFlag).toBeDefined();
  });

  // ── Backward compatibility ─────────────────────────────────────────────────

  it("backward compat: final_cost_usd equals true_cost_usd", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.final_cost_usd).toBe(record!.true_cost_usd);
  });

  it("backward compat: cost_is_agreed is true for assessor_validated", () => {
    const { record } = extractCostLearningRecord(baseInput);
    expect(record!.cost_is_agreed).toBe(true);
  });

  it("backward compat: cost_is_agreed is false for system_optimised", () => {
    const { record } = extractCostLearningRecord({
      ...baseInput,
      costBasis: "system_optimised",
      decisionConfidence: 70,
    });
    expect(record!.cost_is_agreed).toBe(false);
  });

  it("backward compat: finalCostCents is used when trueCostUsd is not provided", () => {
    const legacyInput: CostLearningInput = {
      ...baseInput,
      trueCostUsd: null as any,
      finalCostCents: 300000, // $3,000
    };
    // Policy will reject because trueCostUsd resolves to 3000 from finalCostCents
    // but costBasis is assessor_validated so it should pass
    const { record } = extractCostLearningRecord(legacyInput);
    expect(record!.true_cost_usd).toBeCloseTo(3000, 0);
  });

  // ── Total loss scenario ────────────────────────────────────────────────────

  it("handles total_loss accident severity", () => {
    const { record } = extractCostLearningRecord({
      ...baseInput,
      accidentSeverity: "total_loss",
      trueCostUsd: 25000,
    });
    expect(record!.accident_severity).toBe("total_loss");
    expect(record!.cost_tier).toBe("high");
    expect(record!.case_signature).toContain("total_loss");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN AGGREGATION
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateCostPatterns", () => {
  const makeRecord = (
    claimId: number,
    vehicleType: string,
    collisionDir: string,
    accidentSev: string,
    trueCostUsd: number | null,
    costTier: "low" | "medium" | "high",
    drivers: string[]
  ): CostLearningRecord => ({
    claim_id: claimId,
    recorded_at: new Date().toISOString(),
    vehicle_descriptor: `toyota hilux ${vehicleType}`,
    collision_direction: collisionDir,
    market_region: "ZW",
    high_cost_drivers: drivers,
    component_weighting: drivers.reduce((acc, d, i) => ({ ...acc, [d]: 0.3 - i * 0.05 }), {} as Record<string, number>),
    component_detail: [],
    case_signature: `${vehicleType}_${collisionDir}_${accidentSev}_5c_${costTier}`,
    cost_tier: costTier,
    component_count: 5,
    true_cost_usd: trueCostUsd,
    cost_basis: "assessor_validated",
    decision_confidence: 90,
    accident_severity: accidentSev as any,
    cost_is_validated: true,
    structural_component_count: 1,
    quote_coverage_ratio: 0.8,
    quality_flags: ["assessor_validated"],
    // backward compat
    final_cost_usd: trueCostUsd,
    cost_is_agreed: true,
  });

  it("returns empty array for empty input", () => {
    expect(aggregateCostPatterns([])).toEqual([]);
  });

  it("filters out non-validated records", () => {
    const invalidRecord = {
      ...makeRecord(1, "pickup", "rear", "moderate", 2500, "medium", ["bonnet/hood"]),
      cost_is_validated: false,
    };
    expect(aggregateCostPatterns([invalidRecord])).toEqual([]);
  });

  it("groups records by vehicle type, collision direction, and accident severity", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", 2500, "medium", ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", "moderate", 3000, "medium", ["radiator support panel"]),
      makeRecord(3, "sedan", "frontal", "minor", 1500, "medium", ["headlamp assembly"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns.length).toBe(2); // pickup::rear::moderate and sedan::frontal::minor
  });

  it("computes average true cost correctly", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", 2000, "medium", ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", "moderate", 4000, "medium", ["radiator support panel"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const pickupPattern = patterns.find(p => p.collision_direction === "rear");
    expect(pickupPattern?.avg_true_cost_usd).toBeCloseTo(3000, 0);
  });

  it("handles null costs in average computation", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", 2000, "medium", ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", "moderate", null, "medium", ["grille"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const p = patterns.find(p => p.collision_direction === "rear");
    expect(p?.avg_true_cost_usd).toBeCloseTo(2000, 0); // only non-null values averaged
  });

  it("returns null avg_true_cost_usd when all costs are null", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", null, "medium", ["bonnet/hood"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns[0].avg_true_cost_usd).toBeNull();
  });

  it("identifies top cost drivers by frequency", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", 2500, "medium", ["bonnet/hood", "radiator support panel"]),
      makeRecord(2, "pickup", "rear", "moderate", 3000, "medium", ["bonnet/hood", "headlamp assembly"]),
      makeRecord(3, "pickup", "rear", "moderate", 2000, "medium", ["bonnet/hood"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const p = patterns[0];
    expect(p.top_cost_drivers[0].component).toBe("bonnet/hood");
    expect(p.top_cost_drivers[0].frequency).toBe(3);
  });

  it("sorts patterns by claim_count descending", () => {
    const records = [
      makeRecord(1, "sedan", "frontal", "minor", 1500, "medium", ["headlamp assembly"]),
      makeRecord(2, "pickup", "rear", "moderate", 2500, "medium", ["bonnet/hood"]),
      makeRecord(3, "pickup", "rear", "moderate", 3000, "medium", ["radiator support panel"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns[0].claim_count).toBeGreaterThanOrEqual(patterns[1].claim_count);
  });

  it("computes average component weighting across group", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", 2500, "medium", ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", "moderate", 3000, "medium", ["bonnet/hood"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const p = patterns[0];
    expect(p.avg_component_weighting["bonnet/hood"]).toBeDefined();
    expect(p.avg_component_weighting["bonnet/hood"]).toBeGreaterThan(0);
  });

  it("includes accident_severity in pattern output", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "severe", 5500, "high", ["chassis/frame"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns[0].accident_severity).toBe("severe");
  });

  it("includes cost_tier in pattern output", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", 2500, "medium", ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", "moderate", 3000, "medium", ["radiator support panel"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns[0].cost_tier).toBe("medium");
  });

  it("sets cost_tier to 'mixed' when group has different tiers", () => {
    const records = [
      makeRecord(1, "pickup", "rear", "moderate", 2500, "medium", ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", "moderate", 8000, "high", ["chassis/frame"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns[0].cost_tier).toBe("mixed");
  });
});
