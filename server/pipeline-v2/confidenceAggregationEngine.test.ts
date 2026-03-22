/**
 * confidenceAggregationEngine.test.ts
 *
 * Comprehensive test suite for the Confidence Aggregation Engine.
 * Tests the weakest-link rule, confidence level thresholds, null handling,
 * tie-breaking, additional components, and the builder helper.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateConfidence,
  buildConfidenceAggregationInput,
  type ConfidenceAggregationInput,
} from "./confidenceAggregationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ConfidenceAggregationInput> = {}): ConfidenceAggregationInput {
  return {
    physics_confidence: 80,
    damage_confidence: 75,
    fraud_confidence: 90,
    consistency_score: 85,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: BASIC WEAKEST-LINK RULE
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Weakest-Link Rule", () => {
  it("should return the minimum of all four components", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 90,
      damage_confidence: 60,
      fraud_confidence: 85,
      consistency_score: 78,
    }));
    expect(result.overall_confidence).toBe(60);
    expect(result.weakest_component).toBe("damage");
  });

  it("should NOT return the average of components", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80,
      damage_confidence: 80,
      fraud_confidence: 80,
      consistency_score: 20,
    }));
    // Average would be 65, but weakest-link gives 20
    expect(result.overall_confidence).toBe(20);
    expect(result.overall_confidence).not.toBe(65);
  });

  it("should identify physics as weakest when it has the lowest score", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 30,
      damage_confidence: 80,
      fraud_confidence: 90,
      consistency_score: 85,
    }));
    expect(result.overall_confidence).toBe(30);
    expect(result.weakest_component).toBe("physics");
  });

  it("should identify fraud as weakest when it has the lowest score", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 85,
      damage_confidence: 80,
      fraud_confidence: 25,
      consistency_score: 90,
    }));
    expect(result.overall_confidence).toBe(25);
    expect(result.weakest_component).toBe("fraud");
  });

  it("should identify consistency as weakest when it has the lowest score", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 85,
      damage_confidence: 80,
      fraud_confidence: 90,
      consistency_score: 35,
    }));
    expect(result.overall_confidence).toBe(35);
    expect(result.weakest_component).toBe("consistency");
  });

  it("should return 0 when the minimum score is 0", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 0,
      damage_confidence: 90,
      fraud_confidence: 85,
      consistency_score: 80,
    }));
    expect(result.overall_confidence).toBe(0);
    expect(result.weakest_component).toBe("physics");
  });

  it("should return 100 when all components are 100", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 100,
      damage_confidence: 100,
      fraud_confidence: 100,
      consistency_score: 100,
    }));
    expect(result.overall_confidence).toBe(100);
    expect(result.confidence_level).toBe("HIGH");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: CONFIDENCE LEVEL THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Confidence Level Thresholds", () => {
  it("should return HIGH when overall_confidence >= 75", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 75,
      damage_confidence: 90,
      fraud_confidence: 85,
      consistency_score: 80,
    }));
    expect(result.confidence_level).toBe("HIGH");
    expect(result.overall_confidence).toBe(75);
  });

  it("should return HIGH at exactly 75", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 75,
      damage_confidence: 75,
      fraud_confidence: 75,
      consistency_score: 75,
    }));
    expect(result.confidence_level).toBe("HIGH");
  });

  it("should return HIGH at 100", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 100,
      damage_confidence: 100,
      fraud_confidence: 100,
      consistency_score: 100,
    }));
    expect(result.confidence_level).toBe("HIGH");
  });

  it("should return MEDIUM when overall_confidence is 74 (just below HIGH)", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 74,
      damage_confidence: 90,
      fraud_confidence: 85,
      consistency_score: 80,
    }));
    expect(result.confidence_level).toBe("MEDIUM");
    expect(result.overall_confidence).toBe(74);
  });

  it("should return MEDIUM when overall_confidence is 45", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 45,
      damage_confidence: 90,
      fraud_confidence: 85,
      consistency_score: 80,
    }));
    expect(result.confidence_level).toBe("MEDIUM");
    expect(result.overall_confidence).toBe(45);
  });

  it("should return MEDIUM at exactly 45", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 45,
      damage_confidence: 45,
      fraud_confidence: 45,
      consistency_score: 45,
    }));
    expect(result.confidence_level).toBe("MEDIUM");
  });

  it("should return LOW when overall_confidence is 44 (just below MEDIUM)", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 44,
      damage_confidence: 90,
      fraud_confidence: 85,
      consistency_score: 80,
    }));
    expect(result.confidence_level).toBe("LOW");
    expect(result.overall_confidence).toBe(44);
  });

  it("should return LOW when overall_confidence is 0", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 0,
      damage_confidence: 90,
      fraud_confidence: 85,
      consistency_score: 80,
    }));
    expect(result.confidence_level).toBe("LOW");
  });

  it("should return LOW when overall_confidence is 1", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 1,
      damage_confidence: 90,
      fraud_confidence: 85,
      consistency_score: 80,
    }));
    expect(result.confidence_level).toBe("LOW");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: NULL HANDLING (UNAVAILABLE COMPONENTS)
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Null Handling", () => {
  it("should exclude null components from the MIN calculation", () => {
    // Physics is null (e.g. theft claim — physics not run)
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: 80,
      fraud_confidence: 70,
      consistency_score: 85,
    }));
    // MIN of [80, 70, 85] = 70 (physics excluded)
    expect(result.overall_confidence).toBe(70);
    expect(result.weakest_component).toBe("fraud");
    expect(result.components_available).toBe(3);
    expect(result.components_total).toBe(4);
  });

  it("should handle two null components correctly", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: null,
      fraud_confidence: 65,
      consistency_score: 80,
    }));
    expect(result.overall_confidence).toBe(65);
    expect(result.weakest_component).toBe("fraud");
    expect(result.components_available).toBe(2);
  });

  it("should handle three null components (only one available)", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: null,
      fraud_confidence: null,
      consistency_score: 72,
    }));
    expect(result.overall_confidence).toBe(72);
    expect(result.weakest_component).toBe("consistency");
    expect(result.components_available).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Only 1");
  });

  it("should return overall_confidence=0 and LOW when ALL components are null", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: null,
      fraud_confidence: null,
      consistency_score: null,
    }));
    expect(result.overall_confidence).toBe(0);
    expect(result.confidence_level).toBe("LOW");
    expect(result.weakest_component).toBe("unavailable");
    expect(result.components_available).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should not penalise score when physics is null for theft scenario", () => {
    // Theft claim: physics not run, but other engines are strong
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: 85,
      fraud_confidence: 78,
      consistency_score: 82,
    }));
    // Should be 78 (fraud is weakest), not penalised by null physics
    expect(result.overall_confidence).toBe(78);
    expect(result.confidence_level).toBe("HIGH");
  });

  it("should mark unavailable components in component_detail", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: 80,
      fraud_confidence: 75,
      consistency_score: 85,
    }));
    const physicsDetail = result.component_detail.find((d) => d.name === "physics");
    expect(physicsDetail?.available).toBe(false);
    expect(physicsDetail?.score).toBeNull();
    expect(physicsDetail?.is_weakest).toBe(false);
  });

  it("should mark the weakest component in component_detail", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80,
      damage_confidence: 55,
      fraud_confidence: 90,
      consistency_score: 85,
    }));
    const damageDetail = result.component_detail.find((d) => d.name === "damage");
    expect(damageDetail?.is_weakest).toBe(true);
    const physicsDetail = result.component_detail.find((d) => d.name === "physics");
    expect(physicsDetail?.is_weakest).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: SCORE CLAMPING
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Score Clamping", () => {
  it("should clamp scores above 100 to 100", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 120,
      damage_confidence: 80,
      fraud_confidence: 90,
      consistency_score: 85,
    }));
    const physicsDetail = result.component_detail.find((d) => d.name === "physics");
    expect(physicsDetail?.score).toBe(100);
    expect(result.overall_confidence).toBe(80);
  });

  it("should clamp scores below 0 to 0", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: -10,
      damage_confidence: 80,
      fraud_confidence: 90,
      consistency_score: 85,
    }));
    const physicsDetail = result.component_detail.find((d) => d.name === "physics");
    expect(physicsDetail?.score).toBe(0);
    expect(result.overall_confidence).toBe(0);
    expect(result.confidence_level).toBe("LOW");
  });

  it("should round fractional scores", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80.7,
      damage_confidence: 75.3,
      fraud_confidence: 90.1,
      consistency_score: 85.9,
    }));
    const damageDetail = result.component_detail.find((d) => d.name === "damage");
    expect(damageDetail?.score).toBe(75);
    expect(result.overall_confidence).toBe(75);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: TIE-BREAKING
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Tie-Breaking", () => {
  it("should pick the first component in priority order on a tie (physics first)", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 60,
      damage_confidence: 60,
      fraud_confidence: 80,
      consistency_score: 90,
    }));
    expect(result.overall_confidence).toBe(60);
    // physics comes before damage in priority order
    expect(result.weakest_component).toBe("physics");
  });

  it("should pick damage over fraud on a tie when physics is null", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: 55,
      fraud_confidence: 55,
      consistency_score: 90,
    }));
    expect(result.overall_confidence).toBe(55);
    expect(result.weakest_component).toBe("damage");
  });

  it("should pick fraud over consistency on a tie when physics and damage are null", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: null,
      fraud_confidence: 50,
      consistency_score: 50,
    }));
    expect(result.overall_confidence).toBe(50);
    expect(result.weakest_component).toBe("fraud");
  });

  it("should handle all four components tied at the same score", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 70,
      damage_confidence: 70,
      fraud_confidence: 70,
      consistency_score: 70,
    }));
    expect(result.overall_confidence).toBe(70);
    expect(result.confidence_level).toBe("MEDIUM");
    // physics is first in priority order
    expect(result.weakest_component).toBe("physics");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: ADDITIONAL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Additional Components", () => {
  it("should include additional components in the weakest-link calculation", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80,
      damage_confidence: 75,
      fraud_confidence: 90,
      consistency_score: 85,
      additional_components: {
        severity_consensus: 40, // this is the weakest
      },
    }));
    expect(result.overall_confidence).toBe(40);
    expect(result.weakest_component).toBe("severity_consensus");
  });

  it("should handle additional components that are null", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80,
      damage_confidence: 75,
      fraud_confidence: 90,
      consistency_score: 85,
      additional_components: {
        severity_consensus: null,
        damage_pattern: 70,
      },
    }));
    // severity_consensus is null (excluded), damage_pattern=70 < 75
    expect(result.overall_confidence).toBe(70);
    expect(result.weakest_component).toBe("damage_pattern");
    expect(result.components_total).toBe(6); // 4 primary + 2 additional
    expect(result.components_available).toBe(5); // severity_consensus excluded
  });

  it("should include all additional components in component_detail", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80,
      damage_confidence: 75,
      fraud_confidence: 90,
      consistency_score: 85,
      additional_components: {
        severity_consensus: 88,
        damage_pattern: 72,
        scenario_fraud: 68,
      },
    }));
    expect(result.component_detail.length).toBe(7);
    const scenarioDetail = result.component_detail.find((d) => d.name === "scenario_fraud");
    expect(scenarioDetail?.score).toBe(68);
    expect(scenarioDetail?.is_weakest).toBe(true);
  });

  it("should count additional components in components_total", () => {
    const result = aggregateConfidence(makeInput({
      additional_components: {
        severity_consensus: 80,
        damage_pattern: 75,
      },
    }));
    expect(result.components_total).toBe(6); // 4 primary + 2 additional
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: OUTPUT STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Output Structure", () => {
  it("should always return all required output fields", () => {
    const result = aggregateConfidence(makeInput());
    expect(result).toHaveProperty("overall_confidence");
    expect(result).toHaveProperty("weakest_component");
    expect(result).toHaveProperty("confidence_level");
    expect(result).toHaveProperty("components_available");
    expect(result).toHaveProperty("components_total");
    expect(result).toHaveProperty("component_detail");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("warnings");
  });

  it("should return component_detail with 4 entries for 4 primary components", () => {
    const result = aggregateConfidence(makeInput());
    expect(result.component_detail.length).toBe(4);
  });

  it("should return non-empty reasoning string", () => {
    const result = aggregateConfidence(makeInput());
    expect(result.reasoning.length).toBeGreaterThan(20);
  });

  it("should return empty warnings array when all components are available", () => {
    const result = aggregateConfidence(makeInput());
    expect(result.warnings).toEqual([]);
  });

  it("should return warnings when only 1 component is available", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: null,
      damage_confidence: null,
      fraud_confidence: null,
      consistency_score: 70,
    }));
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should include the weakest component name in reasoning", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80,
      damage_confidence: 40,
      fraud_confidence: 90,
      consistency_score: 85,
    }));
    expect(result.reasoning).toContain("damage");
  });

  it("should include the score in reasoning", () => {
    const result = aggregateConfidence(makeInput({
      physics_confidence: 80,
      damage_confidence: 40,
      fraud_confidence: 90,
      consistency_score: 85,
    }));
    expect(result.reasoning).toContain("40");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: REAL-WORLD SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Aggregation Engine — Real-World Scenarios", () => {
  it("Mazda BT-50 cattle strike — strong physics, no fraud, high consistency", () => {
    // Animal strike: physics executed, no fraud signals, high consistency
    const result = aggregateConfidence({
      physics_confidence: 88,
      damage_confidence: 82,
      fraud_confidence: 92, // low fraud risk → high confidence
      consistency_score: 85,
      additional_components: {
        severity_consensus: 90,
        damage_pattern: 87,
        scenario_fraud: 91,
      },
    });
    expect(result.overall_confidence).toBe(82);
    expect(result.weakest_component).toBe("damage");
    expect(result.confidence_level).toBe("HIGH");
  });

  it("Suspected fraud claim — high fraud risk → low fraud confidence", () => {
    // High fraud risk score → fraud_confidence = 100 - 85 = 15
    const result = aggregateConfidence({
      physics_confidence: 75,
      damage_confidence: 70,
      fraud_confidence: 15, // 100 - 85 fraud risk
      consistency_score: 40,
    });
    expect(result.overall_confidence).toBe(15);
    expect(result.weakest_component).toBe("fraud");
    expect(result.confidence_level).toBe("LOW");
  });

  it("Theft claim — physics not run, other engines strong", () => {
    const result = aggregateConfidence({
      physics_confidence: null, // physics not run for theft
      damage_confidence: 78,
      fraud_confidence: 82,
      consistency_score: 80,
    });
    expect(result.overall_confidence).toBe(78);
    expect(result.weakest_component).toBe("damage");
    expect(result.confidence_level).toBe("HIGH");
    expect(result.components_available).toBe(3);
  });

  it("Windscreen claim — minimal damage, physics skipped, moderate confidence", () => {
    const result = aggregateConfidence({
      physics_confidence: null,
      damage_confidence: 65,
      fraud_confidence: 80,
      consistency_score: 70,
    });
    expect(result.overall_confidence).toBe(65);
    expect(result.weakest_component).toBe("damage");
    expect(result.confidence_level).toBe("MEDIUM");
  });

  it("Cross-engine conflict — consistency score is very low", () => {
    const result = aggregateConfidence({
      physics_confidence: 85,
      damage_confidence: 80,
      fraud_confidence: 75,
      consistency_score: 22, // engines disagree
    });
    expect(result.overall_confidence).toBe(22);
    expect(result.weakest_component).toBe("consistency");
    expect(result.confidence_level).toBe("LOW");
    expect(result.reasoning).toContain("consistency");
  });

  it("Flood claim — all engines moderate, no single weak link", () => {
    const result = aggregateConfidence({
      physics_confidence: 68,
      damage_confidence: 72,
      fraud_confidence: 70,
      consistency_score: 65,
    });
    expect(result.overall_confidence).toBe(65);
    expect(result.weakest_component).toBe("consistency");
    expect(result.confidence_level).toBe("MEDIUM");
  });

  it("Fire claim — physics and consistency both unavailable", () => {
    const result = aggregateConfidence({
      physics_confidence: null,
      damage_confidence: 60,
      fraud_confidence: 55,
      consistency_score: null,
    });
    expect(result.overall_confidence).toBe(55);
    expect(result.weakest_component).toBe("fraud");
    expect(result.confidence_level).toBe("MEDIUM");
    expect(result.components_available).toBe(2);
  });

  it("should not let a single strong signal mask a very weak one", () => {
    // Physics is 99, but consistency is 10 — overall must be 10
    const result = aggregateConfidence({
      physics_confidence: 99,
      damage_confidence: 95,
      fraud_confidence: 98,
      consistency_score: 10,
    });
    expect(result.overall_confidence).toBe(10);
    expect(result.confidence_level).toBe("LOW");
    expect(result.weakest_component).toBe("consistency");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: buildConfidenceAggregationInput HELPER
// ─────────────────────────────────────────────────────────────────────────────

describe("buildConfidenceAggregationInput — Helper", () => {
  it("should map stage6 overallSeverityScore to damage_confidence proxy", () => {
    const input = buildConfidenceAggregationInput(
      { overallSeverityScore: 80 },
      null,
      null
    );
    // proxy: 40 + 80 * 0.5 = 80
    expect(input.damage_confidence).toBe(80);
  });

  it("should use stage6 analysisConfidence directly when available", () => {
    const input = buildConfidenceAggregationInput(
      { overallSeverityScore: 80, analysisConfidence: 72 },
      null,
      null
    );
    expect(input.damage_confidence).toBe(72);
  });

  it("should return null damage_confidence when stage6 is null", () => {
    const input = buildConfidenceAggregationInput(null, null, null);
    expect(input.damage_confidence).toBeNull();
  });

  it("should map stage7 damageConsistencyScore to physics_confidence (×100)", () => {
    const input = buildConfidenceAggregationInput(
      null,
      { physicsExecuted: true, damageConsistencyScore: 0.85 },
      null
    );
    expect(input.physics_confidence).toBe(85);
  });

  it("should return null physics_confidence when stage7 is null", () => {
    const input = buildConfidenceAggregationInput(null, null, null);
    expect(input.physics_confidence).toBeNull();
  });

  it("should invert fraudRiskScore to get fraud_confidence", () => {
    const input = buildConfidenceAggregationInput(
      null,
      null,
      { fraudRiskScore: 30 }
    );
    expect(input.fraud_confidence).toBe(70);
  });

  it("should return fraud_confidence=0 when fraudRiskScore=100", () => {
    const input = buildConfidenceAggregationInput(
      null,
      null,
      { fraudRiskScore: 100 }
    );
    expect(input.fraud_confidence).toBe(0);
  });

  it("should return fraud_confidence=100 when fraudRiskScore=0", () => {
    const input = buildConfidenceAggregationInput(
      null,
      null,
      { fraudRiskScore: 0 }
    );
    expect(input.fraud_confidence).toBe(100);
  });

  it("should map crossEngineConsistency.consistency_score to consistency_score", () => {
    const input = buildConfidenceAggregationInput(
      null,
      null,
      { crossEngineConsistency: { consistency_score: 78 } }
    );
    expect(input.consistency_score).toBe(78);
  });

  it("should return null consistency_score when crossEngineConsistency is null", () => {
    const input = buildConfidenceAggregationInput(null, null, null);
    expect(input.consistency_score).toBeNull();
  });

  it("should include severity_consensus in additional_components when available", () => {
    const input = buildConfidenceAggregationInput(
      null,
      { severityConsensus: { confidence: 88 } },
      null
    );
    expect(input.additional_components?.severity_consensus).toBe(88);
  });

  it("should include damage_pattern in additional_components when available", () => {
    const input = buildConfidenceAggregationInput(
      null,
      { damagePatternValidation: { confidence: 76 } },
      null
    );
    expect(input.additional_components?.damage_pattern).toBe(76);
  });

  it("should include scenario_fraud in additional_components when available", () => {
    const input = buildConfidenceAggregationInput(
      null,
      null,
      { scenarioFraudResult: { confidence: 82 } }
    );
    expect(input.additional_components?.scenario_fraud).toBe(82);
  });

  it("should return no additional_components when none are available", () => {
    const input = buildConfidenceAggregationInput(null, null, null);
    expect(input.additional_components).toBeUndefined();
  });

  it("should build a complete input from all three stages", () => {
    const input = buildConfidenceAggregationInput(
      { overallSeverityScore: 70 },
      {
        physicsExecuted: true,
        damageConsistencyScore: 0.82,
        severityConsensus: { confidence: 90 },
        damagePatternValidation: { confidence: 78 },
      },
      {
        fraudRiskScore: 25,
        crossEngineConsistency: { consistency_score: 80 },
        scenarioFraudResult: { confidence: 85 },
      }
    );
    expect(input.physics_confidence).toBe(82);
    expect(input.damage_confidence).toBe(75); // 40 + 70*0.5
    expect(input.fraud_confidence).toBe(75); // 100 - 25
    expect(input.consistency_score).toBe(80);
    expect(input.additional_components?.severity_consensus).toBe(90);
    expect(input.additional_components?.damage_pattern).toBe(78);
    expect(input.additional_components?.scenario_fraud).toBe(85);
  });
});
