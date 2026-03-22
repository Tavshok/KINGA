/**
 * Case Signature Generator — Test Suite
 * ======================================
 * 60+ tests covering:
 *  - Core format and structure
 *  - Vehicle type normalisation
 *  - Scenario type normalisation
 *  - Impact direction normalisation
 *  - Severity level normalisation
 *  - Cost tier normalisation
 *  - Component count handling
 *  - Null / undefined / unknown inputs
 *  - Grouping key logic
 *  - Signature parser
 *  - Batch generator
 *  - Similarity check
 *  - Cost tier inference
 *  - Real-world claim examples
 */

import { describe, it, expect } from "vitest";
import {
  generateCaseSignature,
  parseCaseSignature,
  generateBatchSignatures,
  areSimilarCases,
  inferCostTier,
  type CaseSignatureInput,
} from "./caseSignatureGenerator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sig(input: CaseSignatureInput) {
  return generateCaseSignature(input).case_signature;
}

function grp(input: CaseSignatureInput) {
  return generateCaseSignature(input).grouping_key;
}

// ─── Core format tests ────────────────────────────────────────────────────────

describe("Core format", () => {
  it("produces the canonical example from the spec", () => {
    expect(sig({
      vehicle_type: "pickup",
      scenario_type: "animal_strike",
      impact_direction: "frontal",
      severity: "severe",
      component_count: 8,
      cost_tier: "high",
    })).toBe("pickup_animal_frontal_severe_8c_high");
  });

  it("always has exactly 6 underscore-separated tokens", () => {
    const result = sig({
      vehicle_type: "sedan",
      scenario_type: "collision",
      impact_direction: "rear",
      severity: "moderate",
      component_count: 4,
      cost_tier: "medium",
    });
    const parts = result.split("_");
    // component_count token ends with "c" so it's always one token
    expect(parts.length).toBe(6);
  });

  it("component_count token always ends with 'c'", () => {
    const result = generateCaseSignature({
      vehicle_type: "suv",
      scenario_type: "collision",
      impact_direction: "side",
      severity: "minor",
      component_count: 12,
      cost_tier: "low",
    });
    expect(result.tokens.component_count).toBe(12);
    expect(result.case_signature).toContain("12c");
  });

  it("all tokens are lowercase", () => {
    const result = sig({
      vehicle_type: "SEDAN",
      scenario_type: "COLLISION",
      impact_direction: "FRONTAL",
      severity: "SEVERE",
      component_count: 5,
      cost_tier: "HIGH",
    });
    expect(result).toBe(result.toLowerCase());
  });

  it("no spaces in signature", () => {
    const result = sig({
      vehicle_type: "station wagon",
      scenario_type: "animal strike",
      impact_direction: "frontal",
      severity: "severe",
      component_count: 6,
      cost_tier: "high",
    });
    expect(result).not.toContain(" ");
  });

  it("grouping_key is the first 4 tokens of case_signature", () => {
    const input: CaseSignatureInput = {
      vehicle_type: "pickup",
      scenario_type: "animal_strike",
      impact_direction: "frontal",
      severity: "severe",
      component_count: 8,
      cost_tier: "high",
    };
    const result = generateCaseSignature(input);
    const sigParts = result.case_signature.split("_");
    const expectedGrouping = sigParts.slice(0, 4).join("_");
    expect(result.grouping_key).toBe(expectedGrouping);
  });
});

// ─── Vehicle normalisation ────────────────────────────────────────────────────

describe("Vehicle type normalisation", () => {
  const base: Omit<CaseSignatureInput, "vehicle_type"> = {
    scenario_type: "collision",
    impact_direction: "frontal",
    severity: "minor",
    component_count: 2,
    cost_tier: "low",
  };

  it("normalises 'pickup' → pickup", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "pickup" }).tokens.vehicle).toBe("pickup");
  });

  it("normalises 'pick-up' → pickup", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "pick-up" }).tokens.vehicle).toBe("pickup");
  });

  it("normalises 'ute' → ute", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "ute" }).tokens.vehicle).toBe("ute");
  });

  it("normalises 'utility' → ute", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "utility" }).tokens.vehicle).toBe("ute");
  });

  it("normalises 'SUV' → suv", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "SUV" }).tokens.vehicle).toBe("suv");
  });

  it("normalises '4WD' → suv", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "4WD" }).tokens.vehicle).toBe("suv");
  });

  it("normalises 'station wagon' → suv", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "station wagon" }).tokens.vehicle).toBe("suv");
  });

  it("normalises 'hatchback' → hatchback", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "hatchback" }).tokens.vehicle).toBe("hatchback");
  });

  it("normalises 'hatch' → hatchback", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "hatch" }).tokens.vehicle).toBe("hatchback");
  });

  it("normalises 'motorcycle' → motorcycle", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "motorcycle" }).tokens.vehicle).toBe("motorcycle");
  });

  it("normalises 'motorbike' → motorcycle", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "motorbike" }).tokens.vehicle).toBe("motorcycle");
  });

  it("normalises 'truck' → truck", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "truck" }).tokens.vehicle).toBe("truck");
  });

  it("normalises 'lorry' → truck", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "lorry" }).tokens.vehicle).toBe("truck");
  });

  it("normalises 'bus' → bus", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "bus" }).tokens.vehicle).toBe("bus");
  });

  it("normalises 'caravan' → trailer", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "caravan" }).tokens.vehicle).toBe("trailer");
  });

  it("unknown vehicle type → unknown", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: "hovercraft" }).tokens.vehicle).toBe("unknown");
  });

  it("null vehicle type → unknown", () => {
    expect(generateCaseSignature({ ...base, vehicle_type: null }).tokens.vehicle).toBe("unknown");
  });
});

// ─── Scenario normalisation ───────────────────────────────────────────────────

describe("Scenario type normalisation", () => {
  const base: Omit<CaseSignatureInput, "scenario_type"> = {
    vehicle_type: "sedan",
    impact_direction: "frontal",
    severity: "minor",
    component_count: 2,
    cost_tier: "low",
  };

  it("normalises 'animal_strike' → animal", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "animal_strike" }).tokens.scenario).toBe("animal");
  });

  it("normalises 'cattle strike' → animal", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "cattle strike" }).tokens.scenario).toBe("animal");
  });

  it("normalises 'kangaroo strike' → animal", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "kangaroo strike" }).tokens.scenario).toBe("animal");
  });

  it("normalises 'vehicle_collision' → collision", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "vehicle_collision" }).tokens.scenario).toBe("collision");
  });

  it("normalises 'MVA' → collision", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "MVA" }).tokens.scenario).toBe("collision");
  });

  it("normalises 'theft' → theft", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "theft" }).tokens.scenario).toBe("theft");
  });

  it("normalises 'fire' → fire", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "fire" }).tokens.scenario).toBe("fire");
  });

  it("normalises 'flood' → flood", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "flood" }).tokens.scenario).toBe("flood");
  });

  it("normalises 'inundation' → flood", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "inundation" }).tokens.scenario).toBe("flood");
  });

  it("normalises 'vandalism' → vandalism", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "vandalism" }).tokens.scenario).toBe("vandalism");
  });

  it("normalises 'malicious damage' → vandalism", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "malicious damage" }).tokens.scenario).toBe("vandalism");
  });

  it("normalises 'windscreen' → windscreen", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "windscreen" }).tokens.scenario).toBe("windscreen");
  });

  it("normalises 'stone chip' → windscreen", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "stone chip" }).tokens.scenario).toBe("windscreen");
  });

  it("normalises 'hail damage' → weather", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "hail damage" }).tokens.scenario).toBe("weather");
  });

  it("normalises 'weather_event' → weather", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "weather_event" }).tokens.scenario).toBe("weather");
  });

  it("unknown scenario → unknown", () => {
    expect(generateCaseSignature({ ...base, scenario_type: "meteor" }).tokens.scenario).toBe("unknown");
  });

  it("null scenario → unknown", () => {
    expect(generateCaseSignature({ ...base, scenario_type: null }).tokens.scenario).toBe("unknown");
  });
});

// ─── Impact direction normalisation ──────────────────────────────────────────

describe("Impact direction normalisation", () => {
  const base: Omit<CaseSignatureInput, "impact_direction"> = {
    vehicle_type: "sedan",
    scenario_type: "collision",
    severity: "minor",
    component_count: 2,
    cost_tier: "low",
  };

  it("normalises 'frontal' → frontal", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "frontal" }).tokens.impact).toBe("frontal");
  });

  it("normalises 'head-on' → frontal", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "head-on" }).tokens.impact).toBe("frontal");
  });

  it("normalises 'front-end' → frontal", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "front-end" }).tokens.impact).toBe("frontal");
  });

  it("normalises 'rear' → rear", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "rear" }).tokens.impact).toBe("rear");
  });

  it("normalises 'rear-end' → rear", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "rear-end" }).tokens.impact).toBe("rear");
  });

  it("normalises 'side' → side", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "side" }).tokens.impact).toBe("side");
  });

  it("normalises 't-bone' → side", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "t-bone" }).tokens.impact).toBe("side");
  });

  it("normalises 'rollover' → rollover", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "rollover" }).tokens.impact).toBe("rollover");
  });

  it("normalises 'undercarriage' → undercarriage", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "undercarriage" }).tokens.impact).toBe("undercarriage");
  });

  it("normalises 'roof' → roof", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "roof" }).tokens.impact).toBe("roof");
  });

  it("normalises 'multiple' → multiple", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "multiple" }).tokens.impact).toBe("multiple");
  });

  it("normalises 'N/A' → unknown", () => {
    expect(generateCaseSignature({ ...base, impact_direction: "N/A" }).tokens.impact).toBe("unknown");
  });

  it("null impact → unknown", () => {
    expect(generateCaseSignature({ ...base, impact_direction: null }).tokens.impact).toBe("unknown");
  });
});

// ─── Severity normalisation ───────────────────────────────────────────────────

describe("Severity normalisation", () => {
  const base: Omit<CaseSignatureInput, "severity"> = {
    vehicle_type: "sedan",
    scenario_type: "collision",
    impact_direction: "frontal",
    component_count: 3,
    cost_tier: "medium",
  };

  it("normalises 'minor' → minor", () => {
    expect(generateCaseSignature({ ...base, severity: "minor" }).tokens.severity).toBe("minor");
  });

  it("normalises 'moderate' → moderate", () => {
    expect(generateCaseSignature({ ...base, severity: "moderate" }).tokens.severity).toBe("moderate");
  });

  it("normalises 'severe' → severe", () => {
    expect(generateCaseSignature({ ...base, severity: "severe" }).tokens.severity).toBe("severe");
  });

  it("normalises 'major' → severe", () => {
    expect(generateCaseSignature({ ...base, severity: "major" }).tokens.severity).toBe("severe");
  });

  it("normalises 'catastrophic' → catastrophic", () => {
    expect(generateCaseSignature({ ...base, severity: "catastrophic" }).tokens.severity).toBe("catastrophic");
  });

  it("normalises 'total loss' → catastrophic", () => {
    expect(generateCaseSignature({ ...base, severity: "total loss" }).tokens.severity).toBe("catastrophic");
  });

  it("normalises 'write-off' → catastrophic", () => {
    expect(generateCaseSignature({ ...base, severity: "write-off" }).tokens.severity).toBe("catastrophic");
  });

  it("normalises 'cosmetic' → cosmetic", () => {
    expect(generateCaseSignature({ ...base, severity: "cosmetic" }).tokens.severity).toBe("cosmetic");
  });

  it("normalises 'none' → none", () => {
    expect(generateCaseSignature({ ...base, severity: "none" }).tokens.severity).toBe("none");
  });

  it("null severity → unknown", () => {
    expect(generateCaseSignature({ ...base, severity: null }).tokens.severity).toBe("unknown");
  });
});

// ─── Cost tier normalisation ──────────────────────────────────────────────────

describe("Cost tier normalisation", () => {
  const base: Omit<CaseSignatureInput, "cost_tier"> = {
    vehicle_type: "sedan",
    scenario_type: "collision",
    impact_direction: "frontal",
    severity: "moderate",
    component_count: 4,
  };

  it("normalises 'low' → low", () => {
    expect(generateCaseSignature({ ...base, cost_tier: "low" }).tokens.cost_tier).toBe("low");
  });

  it("normalises 'medium' → medium", () => {
    expect(generateCaseSignature({ ...base, cost_tier: "medium" }).tokens.cost_tier).toBe("medium");
  });

  it("normalises 'high' → high", () => {
    expect(generateCaseSignature({ ...base, cost_tier: "high" }).tokens.cost_tier).toBe("high");
  });

  it("normalises 'total_loss' → total_loss", () => {
    expect(generateCaseSignature({ ...base, cost_tier: "total_loss" }).tokens.cost_tier).toBe("total_loss");
  });

  it("normalises 'total loss' → total_loss", () => {
    expect(generateCaseSignature({ ...base, cost_tier: "total loss" }).tokens.cost_tier).toBe("total_loss");
  });

  it("normalises 'write-off' → total_loss", () => {
    expect(generateCaseSignature({ ...base, cost_tier: "write-off" }).tokens.cost_tier).toBe("total_loss");
  });

  it("null cost_tier → unknown", () => {
    expect(generateCaseSignature({ ...base, cost_tier: null }).tokens.cost_tier).toBe("unknown");
  });
});

// ─── Component count handling ─────────────────────────────────────────────────

describe("Component count handling", () => {
  const base: Omit<CaseSignatureInput, "component_count"> = {
    vehicle_type: "sedan",
    scenario_type: "collision",
    impact_direction: "frontal",
    severity: "moderate",
    cost_tier: "medium",
  };

  it("zero components → 0c", () => {
    expect(sig({ ...base, component_count: 0 })).toContain("_0c_");
  });

  it("null components → 0c", () => {
    expect(sig({ ...base, component_count: null })).toContain("_0c_");
  });

  it("negative components → 0c", () => {
    expect(sig({ ...base, component_count: -3 })).toContain("_0c_");
  });

  it("decimal components → rounded", () => {
    expect(sig({ ...base, component_count: 4.7 })).toContain("_5c_");
  });

  it("large component count → correct", () => {
    expect(sig({ ...base, component_count: 23 })).toContain("_23c_");
  });
});

// ─── Null / unknown inputs ────────────────────────────────────────────────────

describe("All-null inputs", () => {
  it("all nulls produce a valid signature with all unknowns", () => {
    const result = generateCaseSignature({
      vehicle_type: null,
      scenario_type: null,
      impact_direction: null,
      severity: null,
      component_count: null,
      cost_tier: null,
    });
    expect(result.case_signature).toBe("unknown_unknown_unknown_unknown_0c_unknown");
    expect(result.grouping_key).toBe("unknown_unknown_unknown_unknown");
  });
});

// ─── Grouping key tests ───────────────────────────────────────────────────────

describe("Grouping key", () => {
  it("same vehicle/scenario/impact/severity → same grouping_key regardless of component count", () => {
    const base = { vehicle_type: "pickup", scenario_type: "animal_strike", impact_direction: "frontal", severity: "severe" };
    const g1 = grp({ ...base, component_count: 8, cost_tier: "high" });
    const g2 = grp({ ...base, component_count: 3, cost_tier: "low" });
    expect(g1).toBe(g2);
  });

  it("same vehicle/scenario/impact/severity → same grouping_key regardless of cost tier", () => {
    const base = { vehicle_type: "sedan", scenario_type: "collision", impact_direction: "rear", severity: "moderate" };
    const g1 = grp({ ...base, component_count: 4, cost_tier: "medium" });
    const g2 = grp({ ...base, component_count: 4, cost_tier: "high" });
    expect(g1).toBe(g2);
  });

  it("different severity → different grouping_key", () => {
    const base = { vehicle_type: "sedan", scenario_type: "collision", impact_direction: "rear", component_count: 4, cost_tier: "medium" };
    const g1 = grp({ ...base, severity: "minor" });
    const g2 = grp({ ...base, severity: "severe" });
    expect(g1).not.toBe(g2);
  });
});

// ─── Signature parser ─────────────────────────────────────────────────────────

describe("parseCaseSignature", () => {
  it("parses the canonical example", () => {
    const tokens = parseCaseSignature("pickup_animal_frontal_severe_8c_high");
    expect(tokens).not.toBeNull();
    expect(tokens!.vehicle).toBe("pickup");
    expect(tokens!.scenario).toBe("animal");
    expect(tokens!.impact).toBe("frontal");
    expect(tokens!.severity).toBe("severe");
    expect(tokens!.component_count).toBe(8);
    expect(tokens!.cost_tier).toBe("high");
  });

  it("parses a signature with 0 components", () => {
    const tokens = parseCaseSignature("sedan_collision_rear_minor_0c_low");
    expect(tokens!.component_count).toBe(0);
  });

  it("returns null for empty string", () => {
    expect(parseCaseSignature("")).toBeNull();
  });

  it("returns null for too-short signature", () => {
    expect(parseCaseSignature("pickup_animal_frontal")).toBeNull();
  });

  it("returns null if component token does not end with 'c'", () => {
    expect(parseCaseSignature("pickup_animal_frontal_severe_8_high")).toBeNull();
  });

  it("round-trips correctly", () => {
    const input: CaseSignatureInput = {
      vehicle_type: "suv",
      scenario_type: "flood",
      impact_direction: "unknown",
      severity: "moderate",
      component_count: 5,
      cost_tier: "medium",
    };
    const generated = generateCaseSignature(input);
    const parsed = parseCaseSignature(generated.case_signature);
    expect(parsed).not.toBeNull();
    expect(parsed!.vehicle).toBe(generated.tokens.vehicle);
    expect(parsed!.component_count).toBe(generated.tokens.component_count);
    expect(parsed!.cost_tier).toBe(generated.tokens.cost_tier);
  });
});

// ─── Batch generator ──────────────────────────────────────────────────────────

describe("generateBatchSignatures", () => {
  it("processes multiple inputs correctly", () => {
    const inputs: CaseSignatureInput[] = [
      { vehicle_type: "pickup", scenario_type: "animal_strike", impact_direction: "frontal", severity: "severe", component_count: 8, cost_tier: "high" },
      { vehicle_type: "sedan", scenario_type: "collision", impact_direction: "rear", severity: "moderate", component_count: 4, cost_tier: "medium" },
      { vehicle_type: "suv", scenario_type: "hail damage", impact_direction: null, severity: "minor", component_count: 2, cost_tier: "low" },
    ];
    const results = generateBatchSignatures(inputs);
    expect(results).toHaveLength(3);
    expect(results[0].case_signature).toBe("pickup_animal_frontal_severe_8c_high");
    expect(results[1].case_signature).toBe("sedan_collision_rear_moderate_4c_medium");
    expect(results[2].tokens.scenario).toBe("weather");
  });

  it("handles empty array", () => {
    expect(generateBatchSignatures([])).toHaveLength(0);
  });
});

// ─── Similarity check ─────────────────────────────────────────────────────────

describe("areSimilarCases", () => {
  it("two identical grouping keys → similar", () => {
    const a = generateCaseSignature({ vehicle_type: "pickup", scenario_type: "animal_strike", impact_direction: "frontal", severity: "severe", component_count: 8, cost_tier: "high" });
    const b = generateCaseSignature({ vehicle_type: "pickup", scenario_type: "animal_strike", impact_direction: "frontal", severity: "severe", component_count: 3, cost_tier: "low" });
    expect(areSimilarCases(a, b)).toBe(true);
  });

  it("different scenario → not similar", () => {
    const a = generateCaseSignature({ vehicle_type: "pickup", scenario_type: "animal_strike", impact_direction: "frontal", severity: "severe", component_count: 8, cost_tier: "high" });
    const b = generateCaseSignature({ vehicle_type: "pickup", scenario_type: "collision", impact_direction: "frontal", severity: "severe", component_count: 8, cost_tier: "high" });
    expect(areSimilarCases(a, b)).toBe(false);
  });
});

// ─── Cost tier inference ──────────────────────────────────────────────────────

describe("inferCostTier", () => {
  it("ratio ≥ 0.75 → total_loss", () => {
    expect(inferCostTier(15000, 18000)).toBe("total_loss");
  });

  it("ratio 0.40–0.74 → high", () => {
    expect(inferCostTier(8000, 18000)).toBe("high");
  });

  it("ratio 0.15–0.39 → medium", () => {
    expect(inferCostTier(4000, 18000)).toBe("medium");
  });

  it("ratio < 0.15 → low", () => {
    expect(inferCostTier(1000, 18000)).toBe("low");
  });

  it("absolute ≥ 15000 without market value → total_loss", () => {
    expect(inferCostTier(16000)).toBe("total_loss");
  });

  it("absolute 5000–14999 without market value → high", () => {
    expect(inferCostTier(7500)).toBe("high");
  });

  it("absolute 1500–4999 without market value → medium", () => {
    expect(inferCostTier(2500)).toBe("medium");
  });

  it("absolute < 1500 without market value → low", () => {
    expect(inferCostTier(800)).toBe("low");
  });
});

// ─── Real-world claim examples ────────────────────────────────────────────────

describe("Real-world claim examples", () => {
  it("Mazda BT-50 cattle strike — canonical KINGA test case", () => {
    const result = generateCaseSignature({
      vehicle_type: "Mazda BT-50 Pickup",
      scenario_type: "animal_strike",
      impact_direction: "frontal",
      severity: "severe",
      component_count: 8,
      cost_tier: "high",
    });
    expect(result.case_signature).toBe("pickup_animal_frontal_severe_8c_high");
    expect(result.grouping_key).toBe("pickup_animal_frontal_severe");
  });

  it("Toyota Corolla rear-end collision — low severity", () => {
    const result = generateCaseSignature({
      vehicle_type: "sedan",
      scenario_type: "vehicle_collision",
      impact_direction: "rear-end",
      severity: "minor",
      component_count: 2,
      cost_tier: "low",
    });
    expect(result.case_signature).toBe("sedan_collision_rear_minor_2c_low");
  });

  it("Nissan Patrol flood damage — no impact direction", () => {
    const result = generateCaseSignature({
      vehicle_type: "4WD",
      scenario_type: "flood",
      impact_direction: "N/A",
      severity: "severe",
      component_count: 15,
      cost_tier: "total_loss",
    });
    expect(result.case_signature).toBe("suv_flood_unknown_severe_15c_total_loss");
    expect(result.grouping_key).toBe("suv_flood_unknown_severe");
  });

  it("Holden Commodore hail damage — weather event", () => {
    const result = generateCaseSignature({
      vehicle_type: "sedan",
      scenario_type: "hail damage",
      impact_direction: "roof",
      severity: "moderate",
      component_count: 6,
      cost_tier: "medium",
    });
    expect(result.case_signature).toBe("sedan_weather_roof_moderate_6c_medium");
  });

  it("motorcycle theft — no impact direction", () => {
    const result = generateCaseSignature({
      vehicle_type: "motorbike",
      scenario_type: "vehicle theft",
      impact_direction: null,
      severity: "catastrophic",
      component_count: 0,
      cost_tier: "total_loss",
    });
    expect(result.case_signature).toBe("motorcycle_theft_unknown_catastrophic_0c_total_loss");
  });

  it("windscreen stone chip — minimal damage", () => {
    const result = generateCaseSignature({
      vehicle_type: "hatchback",
      scenario_type: "stone chip",
      impact_direction: "frontal",
      severity: "cosmetic",
      component_count: 1,
      cost_tier: "low",
    });
    expect(result.case_signature).toBe("hatchback_windscreen_frontal_cosmetic_1c_low");
  });
});
