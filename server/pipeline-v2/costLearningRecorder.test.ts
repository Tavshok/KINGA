/**
 * costLearningRecorder.test.ts
 *
 * Unit tests for the Cost Intelligence Learning Recorder module.
 * Covers: component normalisation, structural detection, case signature,
 * weight computation, high-cost driver identification, quote coverage,
 * and pattern aggregation.
 */

import { describe, it, expect } from "vitest";
import {
  normaliseComponentName,
  isStructuralComponent,
  generateCaseSignature,
  extractCostLearningRecord,
  aggregateCostPatterns,
  type CostLearningInput,
  type LearningInputComponent,
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
// CASE SIGNATURE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

describe("generateCaseSignature", () => {
  const makeComponents = (severities: string[]): LearningInputComponent[] =>
    severities.map((s, i) => ({
      name: `component_${i}`,
      severity: s as LearningInputComponent["severity"],
    }));

  it("generates correct signature for pickup rear moderate 8 components high cost", () => {
    const sig = generateCaseSignature(
      "pickup",
      "rear",
      makeComponents(["moderate", "minor", "moderate", "cosmetic", "moderate", "minor", "moderate", "cosmetic"]),
      300000 // $3,000
    );
    expect(sig).toBe("pickup_rear_moderate_8c_high");
  });

  it("uses 'catastrophic' tier when any component is catastrophic", () => {
    const sig = generateCaseSignature(
      "sedan",
      "frontal",
      makeComponents(["moderate", "catastrophic"]),
      600000
    );
    expect(sig).toContain("catastrophic");
  });

  it("uses 'severe' tier when highest is severe (no catastrophic)", () => {
    const sig = generateCaseSignature(
      "suv",
      "side_driver",
      makeComponents(["minor", "severe", "moderate"]),
      250000
    );
    expect(sig).toContain("severe");
  });

  it("uses 'no_cost' when finalCostCents is null", () => {
    const sig = generateCaseSignature("pickup", "rear", makeComponents(["moderate"]), null);
    expect(sig).toContain("no_cost");
  });

  it("uses 'low' tier for costs under $500", () => {
    const sig = generateCaseSignature("sedan", "frontal", makeComponents(["cosmetic"]), 30000);
    expect(sig).toContain("low");
  });

  it("uses 'medium' tier for costs $500–$2,000", () => {
    const sig = generateCaseSignature("sedan", "frontal", makeComponents(["minor"]), 100000);
    expect(sig).toContain("medium");
  });

  it("uses 'major' tier for costs over $5,000", () => {
    const sig = generateCaseSignature("sedan", "frontal", makeComponents(["severe"]), 600000);
    expect(sig).toContain("major");
  });

  it("replaces spaces in vehicle type with underscores", () => {
    const sig = generateCaseSignature("light truck", "rear", makeComponents(["minor"]), 80000);
    expect(sig).toContain("light_truck");
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
    finalCostCents: 257600, // $2,576
    selectedQuoteComponents: ["bonnet/hood", "radiator support panel", "headlamp assembly", "front bumper assembly"],
    collisionDirection: "frontal",
    marketRegion: "ZW",
  };

  it("returns a CostLearningRecord with correct claim_id", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.claim_id).toBe(2730001);
  });

  it("normalises component names in component_detail", () => {
    const record = extractCostLearningRecord(baseInput);
    const names = record.component_detail.map(c => c.component);
    expect(names).toContain("bonnet/hood");
    expect(names).toContain("radiator support panel");
    expect(names).toContain("headlamp assembly");
    expect(names).toContain("front bumper assembly");
    expect(names).toContain("front grille");
  });

  it("identifies radiator support panel as structural", () => {
    const record = extractCostLearningRecord(baseInput);
    const structural = record.component_detail.find(c => c.component === "radiator support panel");
    expect(structural?.is_structural).toBe(true);
  });

  it("does not flag front bumper assembly as structural", () => {
    const record = extractCostLearningRecord(baseInput);
    const bumper = record.component_detail.find(c => c.component === "front bumper assembly");
    expect(bumper?.is_structural).toBe(false);
  });

  it("structural_component_count reflects structural components", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.structural_component_count).toBe(1); // only radiator support panel
  });

  it("relative weights sum to approximately 1.0", () => {
    const record = extractCostLearningRecord(baseInput);
    const total = Object.values(record.component_weighting).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0, 1);
  });

  it("identifies high-cost drivers (≥15% weight)", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.high_cost_drivers.length).toBeGreaterThan(0);
    // Radiator support panel (severe) should be a dominant driver
    expect(record.high_cost_drivers).toContain("radiator support panel");
  });

  it("computes correct final_cost_usd", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.final_cost_usd).toBeCloseTo(2576, 0);
  });

  it("sets cost_is_agreed to true when finalCostCents is provided", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.cost_is_agreed).toBe(true);
  });

  it("sets cost_is_agreed to false when finalCostCents is null", () => {
    const record = extractCostLearningRecord({ ...baseInput, finalCostCents: null });
    expect(record.cost_is_agreed).toBe(false);
  });

  it("adds 'no_final_cost' quality flag when finalCostCents is null", () => {
    const record = extractCostLearningRecord({ ...baseInput, finalCostCents: null });
    expect(record.quality_flags).toContain("no_final_cost");
  });

  it("computes quote_coverage_ratio correctly", () => {
    const record = extractCostLearningRecord(baseInput);
    // 4 of 5 damage components are in the quote
    expect(record.quote_coverage_ratio).toBeCloseTo(0.8, 1);
  });

  it("adds 'no_quote_components' flag when selectedQuoteComponents is empty", () => {
    const record = extractCostLearningRecord({ ...baseInput, selectedQuoteComponents: [] });
    expect(record.quality_flags).toContain("no_quote_components");
  });

  it("generates a case_signature containing vehicle type and direction", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.case_signature).toContain("pickup");
    expect(record.case_signature).toContain("frontal");
  });

  it("sets vehicle_descriptor from make + model + type", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.vehicle_descriptor).toContain("isuzu");
    expect(record.vehicle_descriptor).toContain("d-max");
    expect(record.vehicle_descriptor).toContain("pickup");
  });

  it("sets market_region correctly", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.market_region).toBe("ZW");
  });

  it("records component_count correctly", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(record.component_count).toBe(5);
  });

  it("includes recorded_at as ISO timestamp", () => {
    const record = extractCostLearningRecord(baseInput);
    expect(() => new Date(record.recorded_at)).not.toThrow();
    expect(record.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles empty damage components gracefully", () => {
    const record = extractCostLearningRecord({ ...baseInput, damageComponents: [] });
    expect(record.component_count).toBe(0);
    expect(record.high_cost_drivers).toHaveLength(0);
    expect(record.quality_flags).toContain("no_damage_components");
  });

  it("handles airbag as a high-cost driver when severe", () => {
    const withAirbag: CostLearningInput = {
      ...baseInput,
      damageComponents: [
        { name: "airbag", severity: "catastrophic" },
        { name: "grille", severity: "minor" },
      ],
    };
    const record = extractCostLearningRecord(withAirbag);
    expect(record.high_cost_drivers).toContain("airbag module");
  });

  it("handles chassis as highest-weight structural component when severe", () => {
    const withChassis: CostLearningInput = {
      ...baseInput,
      damageComponents: [
        { name: "chassis", severity: "severe" },
        { name: "grille", severity: "cosmetic" },
        { name: "moulding", severity: "cosmetic" },
      ],
    };
    const record = extractCostLearningRecord(withChassis);
    expect(record.high_cost_drivers[0]).toBe("chassis/frame");
    expect(record.structural_component_count).toBe(1);
  });

  it("handles rear collision correctly in case signature", () => {
    const record = extractCostLearningRecord({ ...baseInput, collisionDirection: "rear" });
    expect(record.case_signature).toContain("rear");
  });

  it("adds structural_components_present flag when structural components exist", () => {
    const record = extractCostLearningRecord(baseInput);
    const structFlag = record.quality_flags.find(f => f.startsWith("structural_components_present"));
    expect(structFlag).toBeDefined();
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
    costUsd: number | null,
    drivers: string[]
  ) => ({
    claim_id: claimId,
    recorded_at: new Date().toISOString(),
    vehicle_descriptor: `toyota hilux ${vehicleType}`,
    collision_direction: collisionDir,
    market_region: "ZW",
    high_cost_drivers: drivers,
    component_weighting: drivers.reduce((acc, d, i) => ({ ...acc, [d]: 0.3 - i * 0.05 }), {} as Record<string, number>),
    component_detail: [],
    case_signature: `${vehicleType}_${collisionDir}_moderate_5c_high`,
    component_count: 5,
    final_cost_usd: costUsd,
    cost_is_agreed: costUsd !== null,
    structural_component_count: 1,
    quote_coverage_ratio: 0.8,
    quality_flags: [],
  });

  it("returns empty array for empty input", () => {
    expect(aggregateCostPatterns([])).toEqual([]);
  });

  it("groups records by vehicle type and collision direction", () => {
    const records = [
      makeRecord(1, "pickup", "rear", 2500, ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", 3000, ["radiator support panel"]),
      makeRecord(3, "sedan", "frontal", 1500, ["headlamp assembly"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns.length).toBe(2); // pickup::rear and sedan::frontal
  });

  it("computes average cost correctly", () => {
    const records = [
      makeRecord(1, "pickup", "rear", 2000, ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", 4000, ["radiator support panel"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const pickupPattern = patterns.find(p => p.collision_direction === "rear");
    expect(pickupPattern?.avg_cost_usd).toBeCloseTo(3000, 0);
  });

  it("handles null costs in average computation", () => {
    const records = [
      makeRecord(1, "pickup", "rear", 2000, ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", null, ["grille"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const p = patterns.find(p => p.collision_direction === "rear");
    expect(p?.avg_cost_usd).toBeCloseTo(2000, 0); // only non-null values averaged
  });

  it("returns null avg_cost_usd when all costs are null", () => {
    const records = [
      makeRecord(1, "pickup", "rear", null, ["bonnet/hood"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns[0].avg_cost_usd).toBeNull();
  });

  it("identifies top cost drivers by frequency", () => {
    const records = [
      makeRecord(1, "pickup", "rear", 2500, ["bonnet/hood", "radiator support panel"]),
      makeRecord(2, "pickup", "rear", 3000, ["bonnet/hood", "headlamp assembly"]),
      makeRecord(3, "pickup", "rear", 2000, ["bonnet/hood"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const p = patterns[0];
    expect(p.top_cost_drivers[0].component).toBe("bonnet/hood");
    expect(p.top_cost_drivers[0].frequency).toBe(3);
  });

  it("sorts patterns by claim_count descending", () => {
    const records = [
      makeRecord(1, "sedan", "frontal", 1500, ["headlamp assembly"]),
      makeRecord(2, "pickup", "rear", 2500, ["bonnet/hood"]),
      makeRecord(3, "pickup", "rear", 3000, ["radiator support panel"]),
    ];
    const patterns = aggregateCostPatterns(records);
    expect(patterns[0].claim_count).toBeGreaterThanOrEqual(patterns[1].claim_count);
  });

  it("computes average component weighting across group", () => {
    const records = [
      makeRecord(1, "pickup", "rear", 2500, ["bonnet/hood"]),
      makeRecord(2, "pickup", "rear", 3000, ["bonnet/hood"]),
    ];
    const patterns = aggregateCostPatterns(records);
    const p = patterns[0];
    expect(p.avg_component_weighting["bonnet/hood"]).toBeDefined();
    expect(p.avg_component_weighting["bonnet/hood"]).toBeGreaterThan(0);
  });
});
