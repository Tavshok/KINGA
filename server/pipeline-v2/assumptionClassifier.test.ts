/**
 * assumptionClassifier.test.ts — Phase 2C Assumption Registry Enrichment
 */
import { describe, it, expect } from "vitest";
import { classifyAssumption, classifyAssumptions } from "./assumptionClassifier";
import type { Assumption } from "./types";

function makeAssumption(overrides: Partial<Assumption> = {}): Assumption {
  return {
    field: "vehicleMake",
    assumedValue: "Toyota",
    reason: "Inferred from model name",
    strategy: "contextual_inference",
    confidence: 65,
    stage: "stage-3",
    ...overrides,
  };
}

describe("classifyAssumption — assumptionType", () => {
  it("maps industry_average → MARKET_DEFAULT", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "industry_average" }));
    expect(result.assumptionType).toBe("MARKET_DEFAULT");
  });

  it("maps manufacturer_lookup → MARKET_DEFAULT", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "manufacturer_lookup" }));
    expect(result.assumptionType).toBe("MARKET_DEFAULT");
  });

  it("maps damage_based_estimate → SYSTEM_ESTIMATE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "damage_based_estimate" }));
    expect(result.assumptionType).toBe("SYSTEM_ESTIMATE");
  });

  it("maps typical_collision → SYSTEM_ESTIMATE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "typical_collision" }));
    expect(result.assumptionType).toBe("SYSTEM_ESTIMATE");
  });

  it("maps default_value → SYSTEM_ESTIMATE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "default_value" }));
    expect(result.assumptionType).toBe("SYSTEM_ESTIMATE");
  });

  it("maps llm_vision → SYSTEM_ESTIMATE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "llm_vision" }));
    expect(result.assumptionType).toBe("SYSTEM_ESTIMATE");
  });

  it("maps contextual_inference → DOCUMENT_INFERENCE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "contextual_inference" }));
    expect(result.assumptionType).toBe("DOCUMENT_INFERENCE");
  });

  it("maps cross_document_search → DOCUMENT_INFERENCE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "cross_document_search" }));
    expect(result.assumptionType).toBe("DOCUMENT_INFERENCE");
  });

  it("maps secondary_ocr → DOCUMENT_INFERENCE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "secondary_ocr" }));
    expect(result.assumptionType).toBe("DOCUMENT_INFERENCE");
  });

  it("maps partial_data → DOCUMENT_INFERENCE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "partial_data" }));
    expect(result.assumptionType).toBe("DOCUMENT_INFERENCE");
  });

  it("maps historical_data → HISTORICAL_PROXY", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "historical_data" }));
    expect(result.assumptionType).toBe("HISTORICAL_PROXY");
  });

  it("maps none → SYSTEM_ESTIMATE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "none" }));
    expect(result.assumptionType).toBe("SYSTEM_ESTIMATE");
  });

  it("maps skip → SYSTEM_ESTIMATE", () => {
    const result = classifyAssumption(makeAssumption({ strategy: "skip" }));
    expect(result.assumptionType).toBe("SYSTEM_ESTIMATE");
  });

  it("preserves existing assumptionType if already set", () => {
    const result = classifyAssumption(makeAssumption({
      strategy: "industry_average",
      assumptionType: "CLAIMANT_STATED",
    }));
    expect(result.assumptionType).toBe("CLAIMANT_STATED");
  });
});

describe("classifyAssumption — impact from exact field names", () => {
  it("quoteTotalCents → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "quoteTotalCents" }));
    expect(result.impact).toBe("HIGH");
  });

  it("agreedCostCents → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "agreedCostCents" }));
    expect(result.impact).toBe("HIGH");
  });

  it("estimatedSpeedKmh → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "estimatedSpeedKmh" }));
    expect(result.impact).toBe("HIGH");
  });

  it("fraudScore → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "fraudScore" }));
    expect(result.impact).toBe("HIGH");
  });

  it("vehicleRegistration → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "vehicleRegistration" }));
    expect(result.impact).toBe("HIGH");
  });

  it("policyNumber → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "policyNumber" }));
    expect(result.impact).toBe("HIGH");
  });

  it("structuralDamage → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "structuralDamage" }));
    expect(result.impact).toBe("HIGH");
  });

  it("vehicleMake → MEDIUM", () => {
    const result = classifyAssumption(makeAssumption({ field: "vehicleMake" }));
    expect(result.impact).toBe("MEDIUM");
  });

  it("vehicleYear → MEDIUM", () => {
    const result = classifyAssumption(makeAssumption({ field: "vehicleYear" }));
    expect(result.impact).toBe("MEDIUM");
  });

  it("accidentDate → MEDIUM", () => {
    const result = classifyAssumption(makeAssumption({ field: "accidentDate" }));
    expect(result.impact).toBe("MEDIUM");
  });
});

describe("classifyAssumption — impact from keyword heuristics", () => {
  it("field containing 'cost' → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "repairCostEstimate" }));
    expect(result.impact).toBe("HIGH");
  });

  it("field containing 'cents' → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "labourCents" }));
    expect(result.impact).toBe("HIGH");
  });

  it("field containing 'fraud' → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "fraudRiskIndicator" }));
    expect(result.impact).toBe("HIGH");
  });

  it("field containing 'speed' → HIGH", () => {
    const result = classifyAssumption(makeAssumption({ field: "impactSpeed" }));
    expect(result.impact).toBe("HIGH");
  });

  it("field containing 'vehicle' → MEDIUM (keyword heuristic)", () => {
    const result = classifyAssumption(makeAssumption({ field: "vehicleColour" }));
    expect(result.impact).toBe("MEDIUM");
  });

  it("field containing 'date' → MEDIUM", () => {
    const result = classifyAssumption(makeAssumption({ field: "repairDate" }));
    expect(result.impact).toBe("MEDIUM");
  });

  it("unknown field → LOW", () => {
    const result = classifyAssumption(makeAssumption({ field: "weatherConditions" }));
    expect(result.impact).toBe("LOW");
  });

  it("preserves existing impact if already set", () => {
    const result = classifyAssumption(makeAssumption({
      field: "quoteTotalCents",
      impact: "LOW",
    }));
    expect(result.impact).toBe("LOW");
  });
});

describe("classifyAssumption — immutability", () => {
  it("returns a new object, does not mutate the input", () => {
    const original = makeAssumption({ field: "quoteTotalCents" });
    const result = classifyAssumption(original);
    expect(result).not.toBe(original);
    expect(original.assumptionType).toBeUndefined();
    expect(original.impact).toBeUndefined();
  });

  it("preserves all original fields", () => {
    const original = makeAssumption({
      field: "quoteTotalCents",
      reason: "Extracted from quote table",
      confidence: 88,
    });
    const result = classifyAssumption(original);
    expect(result.field).toBe("quoteTotalCents");
    expect(result.reason).toBe("Extracted from quote table");
    expect(result.confidence).toBe(88);
    expect(result.strategy).toBe("contextual_inference");
    expect(result.stage).toBe("stage-3");
  });
});

describe("classifyAssumptions — array processing", () => {
  it("returns empty array for null input", () => {
    expect(classifyAssumptions(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(classifyAssumptions(undefined)).toEqual([]);
  });

  it("returns empty array for empty array input", () => {
    expect(classifyAssumptions([])).toEqual([]);
  });

  it("classifies all items in the array", () => {
    const input = [
      makeAssumption({ field: "quoteTotalCents", strategy: "industry_average" }),
      makeAssumption({ field: "vehicleMake", strategy: "contextual_inference" }),
      makeAssumption({ field: "weatherConditions", strategy: "default_value" }),
    ];
    const result = classifyAssumptions(input);
    expect(result).toHaveLength(3);
    expect(result[0].impact).toBe("HIGH");
    expect(result[0].assumptionType).toBe("MARKET_DEFAULT");
    expect(result[1].impact).toBe("MEDIUM");
    expect(result[1].assumptionType).toBe("DOCUMENT_INFERENCE");
    expect(result[2].impact).toBe("LOW");
    expect(result[2].assumptionType).toBe("SYSTEM_ESTIMATE");
  });

  it("counts correctly for impact distribution", () => {
    const input = [
      makeAssumption({ field: "quoteTotalCents" }),   // HIGH
      makeAssumption({ field: "fraudScore" }),         // HIGH
      makeAssumption({ field: "vehicleMake" }),        // MEDIUM
      makeAssumption({ field: "weatherConditions" }), // LOW
    ];
    const result = classifyAssumptions(input);
    const highCount = result.filter(a => a.impact === "HIGH").length;
    const mediumCount = result.filter(a => a.impact === "MEDIUM").length;
    const lowCount = result.filter(a => a.impact === "LOW").length;
    expect(highCount).toBe(2);
    expect(mediumCount).toBe(1);
    expect(lowCount).toBe(1);
  });
});
