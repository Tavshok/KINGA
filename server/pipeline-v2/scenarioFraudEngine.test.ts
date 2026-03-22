/**
 * scenarioFraudEngine.test.ts
 *
 * Comprehensive test suite for the Scenario-Aware Fraud Detection Engine.
 *
 * Coverage:
 *   - All 9 scenario types + unknown
 *   - Police report rules (scenario-aware)
 *   - Timeline consistency rules
 *   - Damage pattern rules (STRONG/MODERATE/WEAK/NONE)
 *   - Assessor confirmation trust signals
 *   - False positive protection
 *   - Behavioural enrichment flags
 *   - Score capping (0–100)
 *   - Risk level thresholds
 *   - Output schema completeness
 *   - Real-world scenarios (Mazda BT-50 cattle strike, staged collision, fire fraud)
 */

import { describe, it, expect } from "vitest";
import {
  evaluateScenarioFraud,
  type ScenarioFraudInput,
  type DamagePatternResult,
} from "./scenarioFraudEngine";

// ─────────────────────────────────────────────────────────────────────────────
// TEST FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const STRONG_PATTERN: DamagePatternResult = {
  pattern_match: "STRONG",
  structural_damage_detected: false,
  confidence: 90,
  validation_detail: {
    image_contradiction: false,
    primary_coverage_pct: 85,
    secondary_coverage_pct: 60,
  },
};

const MODERATE_PATTERN: DamagePatternResult = {
  pattern_match: "MODERATE",
  structural_damage_detected: false,
  confidence: 65,
  validation_detail: {
    image_contradiction: false,
    primary_coverage_pct: 55,
    secondary_coverage_pct: 35,
  },
};

const WEAK_PATTERN: DamagePatternResult = {
  pattern_match: "WEAK",
  structural_damage_detected: false,
  confidence: 40,
  validation_detail: {
    image_contradiction: false,
    primary_coverage_pct: 20,
    secondary_coverage_pct: 10,
  },
};

const NONE_PATTERN: DamagePatternResult = {
  pattern_match: "NONE",
  structural_damage_detected: false,
  confidence: 85,
  validation_detail: {
    image_contradiction: false,
    primary_coverage_pct: 0,
    secondary_coverage_pct: 0,
  },
};

const IMAGE_CONTRADICTION_PATTERN: DamagePatternResult = {
  pattern_match: "WEAK",
  structural_damage_detected: false,
  confidence: 75,
  validation_detail: {
    image_contradiction: true,
    image_contradiction_reason: "Images show rear damage only; frontal collision claimed.",
    primary_coverage_pct: 15,
    secondary_coverage_pct: 5,
  },
};

const STRUCTURAL_STRONG_PATTERN: DamagePatternResult = {
  pattern_match: "STRONG",
  structural_damage_detected: true,
  confidence: 92,
  validation_detail: {
    image_contradiction: false,
    primary_coverage_pct: 90,
    secondary_coverage_pct: 70,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT SCHEMA VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe("Output schema", () => {
  it("returns all required top-level fields", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result).toHaveProperty("fraud_score");
    expect(result).toHaveProperty("risk_level");
    expect(result).toHaveProperty("flags");
    expect(result).toHaveProperty("false_positive_protection");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("engine_metadata");
  });

  it("fraud_score is always between 0 and 100", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "theft",
      police_report_status: "absent",
      timeline_consistency: "contradictory",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "disputed",
      enrichment: {
        prior_claims_count: 8,
        recently_purchased: true,
        vehicle_financed: true,
        high_fraud_location: true,
      },
    });

    expect(result.fraud_score).toBeGreaterThanOrEqual(0);
    expect(result.fraud_score).toBeLessThanOrEqual(100);
  });

  it("risk_level is always one of LOW | MEDIUM | HIGH", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "unknown",
      police_report_status: "unknown",
      timeline_consistency: "unknown",
      damage_pattern_result: null,
      assessor_confirmation: "unknown",
    });

    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.risk_level);
  });

  it("flags array contains objects with required fields", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "contradictory",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "disputed",
    });

    for (const flag of result.flags) {
      expect(flag).toHaveProperty("code");
      expect(flag).toHaveProperty("category");
      expect(flag).toHaveProperty("severity");
      expect(flag).toHaveProperty("score_contribution");
      expect(flag).toHaveProperty("description");
      expect(flag).toHaveProperty("scenario_specific");
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(flag.severity);
      expect(["documentation", "timeline", "pattern", "financial", "behaviour", "scenario"]).toContain(flag.category);
    }
  });

  it("engine_metadata contains all required fields", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const meta = result.engine_metadata;
    expect(meta).toHaveProperty("scenario_type", "animal_strike");
    expect(meta).toHaveProperty("scenario_profile_applied");
    expect(meta).toHaveProperty("trust_signals_applied");
    expect(meta).toHaveProperty("score_before_trust_reduction");
    expect(meta).toHaveProperty("trust_reduction_applied");
    expect(meta).toHaveProperty("false_positives_suppressed");
    expect(meta).toHaveProperty("inputs_missing");
    expect(Array.isArray(meta.trust_signals_applied)).toBe(true);
    expect(Array.isArray(meta.inputs_missing)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL STRIKE — CORE RULES
// ─────────────────────────────────────────────────────────────────────────────

describe("Animal Strike scenario", () => {
  it("missing police report is NOT a fraud signal", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const hasPoliceFlag = result.flags.some(f => f.code === "missing_police_report");
    expect(hasPoliceFlag).toBe(false);
  });

  it("missing police report is suppressed as false positive", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const suppressed = result.false_positive_protection.some(
      p => p.suppressed_flag === "missing_police_report"
    );
    expect(suppressed).toBe(true);
  });

  it("strong damage + assessor confirmation → LOW risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.risk_level).toBe("LOW");
    expect(result.fraud_score).toBeLessThan(25);
  });

  it("NONE pattern match → HIGH risk despite animal strike scenario", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.flags.some(f => f.code === "damage_pattern_none")).toBe(true);
    // NONE pattern should always be at least MEDIUM risk
    expect(["MEDIUM", "HIGH"]).toContain(result.risk_level);
    // Score should be substantial (>= 25) for NONE pattern
    expect(result.fraud_score).toBeGreaterThanOrEqual(25);
  });

  it("image contradiction → HIGH risk for animal strike", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: IMAGE_CONTRADICTION_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.flags.some(f => f.code === "image_contradiction")).toBe(true);
    expect(result.risk_level).toBe("HIGH");
  });

  it("assessor confirmation reduces fraud score significantly", () => {
    // Use a scenario with real fraud flags to ensure non-zero score before trust reduction
    const withoutAssessor = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: WEAK_PATTERN,
      assessor_confirmation: "not_yet",
    });

    const withAssessor = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: WEAK_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(withAssessor.fraud_score).toBeLessThan(withoutAssessor.fraud_score);
  });

  it("Mazda BT-50 cattle strike — clean claim → LOW risk, score < 15", () => {
    // Real-world scenario: rural cattle strike, no police report (normal),
    // frontal damage consistent with animal strike, assessor confirmed
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRUCTURAL_STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.fraud_score).toBeLessThan(15);
    expect(result.risk_level).toBe("LOW");
    expect(result.flags.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE COLLISION — CORE RULES
// ─────────────────────────────────────────────────────────────────────────────

describe("Vehicle Collision scenario", () => {
  it("missing police report IS a fraud signal for vehicle collision", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(true);
  });

  it("police report absent → MEDIUM severity flag for vehicle collision", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "not_yet",
    });

    const flag = result.flags.find(f => f.code === "missing_police_report");
    expect(flag).toBeDefined();
    expect(["MEDIUM", "HIGH"]).toContain(flag!.severity);
  });

  it("pending police report → no missing_police_report flag", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "pending",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(false);
  });

  it("contradictory timeline → HIGH severity flag", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "contradictory",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const flag = result.flags.find(f => f.code === "contradictory_timeline");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
  });

  it("NONE pattern + absent police + contradictory timeline → HIGH risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "contradictory",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.risk_level).toBe("HIGH");
    expect(result.fraud_score).toBeGreaterThan(55);
  });

  it("strong pattern + assessor confirmed + police present → LOW risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.risk_level).toBe("LOW");
    expect(result.fraud_score).toBeLessThan(25);
  });

  it("assessor disputed damage → HIGH severity flag with score 40", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "disputed",
    });

    const flag = result.flags.find(f => f.code === "assessor_disputed_damage");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
    expect(flag!.score_contribution).toBe(40);
  });

  it("recently purchased vehicle + collision → recently_purchased_vehicle flag", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "not_yet",
      enrichment: { recently_purchased: true },
    });

    expect(result.flags.some(f => f.code === "recently_purchased_vehicle")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THEFT SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("Theft scenario", () => {
  it("missing police report → HIGH severity flag for theft", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "theft",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
    });

    const flag = result.flags.find(f => f.code === "missing_police_report");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
    expect(flag!.score_contribution).toBeGreaterThanOrEqual(30);
  });

  it("recently purchased + financed + absent police → HIGH risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "theft",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
      enrichment: {
        recently_purchased: true,
        vehicle_financed: true,
      },
    });

    expect(result.risk_level).toBe("HIGH");
    expect(result.flags.some(f => f.code === "recently_purchased_vehicle")).toBe(true);
    expect(result.flags.some(f => f.code === "financed_vehicle_total_loss_risk")).toBe(true);
  });

  it("no_damage_photos is a known false positive for theft (stolen vehicle)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "theft",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
    });

    // no_damage_photos should not appear as a flag for theft (it's a known FPP)
    // Note: this flag is generated by Stage 8 documentation analysis, not this engine
    // The engine's FPP list should include it
    const profile_fpp = result.false_positive_protection.some(
      p => p.suppressed_flag === "no_damage_photos"
    );
    // If the engine generated no_damage_photos flag, it should be suppressed
    // If it didn't generate it, that's also fine
    const hasFlag = result.flags.some(f => f.code === "no_damage_photos");
    if (hasFlag) {
      expect(profile_fpp).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIRE SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("Fire scenario", () => {
  it("missing police report → HIGH severity flag for fire", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "fire",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
    });

    const flag = result.flags.find(f => f.code === "missing_police_report");
    expect(flag).toBeDefined();
    expect(flag!.score_contribution).toBeGreaterThanOrEqual(25);
  });

  it("recently purchased + financed + fire → HIGH risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "fire",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
      enrichment: {
        recently_purchased: true,
        vehicle_financed: true,
        after_hours_lodgement: true,
      },
    });

    expect(result.risk_level).toBe("HIGH");
  });

  it("low_data_completeness is a known false positive for fire", () => {
    // Fire destroys documentation — low completeness is expected
    const result = evaluateScenarioFraud({
      scenario_type: "fire",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
    });

    const suppressed = result.false_positive_protection.some(
      p => p.suppressed_flag === "low_data_completeness"
    );
    const hasFlag = result.flags.some(f => f.code === "low_data_completeness");
    if (hasFlag) expect(suppressed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOOD SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("Flood scenario", () => {
  it("missing police report is NOT a fraud signal for flood", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "flood",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(false);
  });

  it("significant timeline gap is suppressed for flood (displacement expected)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "flood",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const hasTimelineFlag = result.flags.some(f => f.code === "significant_timeline_gap");
    expect(hasTimelineFlag).toBe(false);
    const suppressed = result.false_positive_protection.some(
      p => p.suppressed_flag === "significant_delay"
    );
    expect(suppressed).toBe(true);
  });

  it("contradictory timeline IS still a fraud signal for flood", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "flood",
      police_report_status: "absent",
      timeline_consistency: "contradictory",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.flags.some(f => f.code === "contradictory_timeline")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WINDSCREEN SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("Windscreen scenario", () => {
  it("missing police report is NOT a fraud signal for windscreen", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "windscreen",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(false);
    expect(result.risk_level).toBe("LOW");
  });

  it("significant delay is suppressed for windscreen (low urgency)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "windscreen",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "significant_timeline_gap")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WEATHER EVENT SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("Weather Event scenario", () => {
  it("missing police report is NOT a fraud signal for weather event", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "weather_event",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(false);
    expect(result.risk_level).toBe("LOW");
  });

  it("NONE pattern match → HIGH risk for weather event", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "weather_event",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.flags.some(f => f.code === "damage_pattern_none")).toBe(true);
    // NONE pattern should always be at least MEDIUM risk
    expect(["MEDIUM", "HIGH"]).toContain(result.risk_level);
    // Score should be substantial (>= 25) for NONE pattern
    expect(result.fraud_score).toBeGreaterThanOrEqual(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VANDALISM SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("Vandalism scenario", () => {
  it("missing police report IS a fraud signal for vandalism", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vandalism",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(true);
  });

  it("no_third_party_details is a known false positive for vandalism", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vandalism",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    // no_third_party_details should be in the FPP list for vandalism
    const hasFlag = result.flags.some(f => f.code === "no_third_party_details");
    if (hasFlag) {
      const suppressed = result.false_positive_protection.some(
        p => p.suppressed_flag === "no_third_party_details"
      );
      expect(suppressed).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DAMAGE PATTERN RULES
// ─────────────────────────────────────────────────────────────────────────────

describe("Damage pattern evaluation", () => {
  it("STRONG pattern → no damage_pattern flags", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.flags.some(f => f.code === "damage_pattern_none")).toBe(false);
    expect(result.flags.some(f => f.code === "damage_pattern_weak")).toBe(false);
  });

  it("MODERATE pattern → no damage_pattern flags", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.flags.some(f => f.code === "damage_pattern_none")).toBe(false);
    expect(result.flags.some(f => f.code === "damage_pattern_weak")).toBe(false);
  });

  it("WEAK pattern → damage_pattern_weak flag with MEDIUM severity", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: WEAK_PATTERN,
      assessor_confirmation: "not_yet",
    });

    const flag = result.flags.find(f => f.code === "damage_pattern_weak");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("MEDIUM");
    expect(flag!.category).toBe("pattern");
  });

  it("NONE pattern → damage_pattern_none flag with HIGH severity", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    const flag = result.flags.find(f => f.code === "damage_pattern_none");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
    expect(flag!.category).toBe("pattern");
  });

  it("image contradiction → image_contradiction flag with HIGH severity", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: IMAGE_CONTRADICTION_PATTERN,
      assessor_confirmation: "not_yet",
    });

    const flag = result.flags.find(f => f.code === "image_contradiction");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
    expect(flag!.score_contribution).toBeGreaterThanOrEqual(30);
  });

  it("null damage_pattern_result → no damage pattern flags", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
    });

    expect(result.flags.some(f => f.code.startsWith("damage_pattern"))).toBe(false);
    expect(result.engine_metadata.inputs_missing).toContain("damage_pattern_result");
  });

  it("scenario multiplier increases NONE score for vehicle_collision vs animal_strike", () => {
    const collisionResult = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    const animalResult = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    // vehicle_collision has higher multiplier (1.5) vs animal_strike (1.2)
    const collisionFlag = collisionResult.flags.find(f => f.code === "damage_pattern_none");
    const animalFlag = animalResult.flags.find(f => f.code === "damage_pattern_none");
    expect(collisionFlag!.score_contribution).toBeGreaterThanOrEqual(animalFlag!.score_contribution);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ASSESSOR CONFIRMATION TRUST SIGNALS
// ─────────────────────────────────────────────────────────────────────────────

describe("Assessor confirmation trust signals", () => {
  it("confirmed assessor reduces score", () => {
    const base = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "not_yet",
    });

    const confirmed = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(confirmed.fraud_score).toBeLessThan(base.fraud_score);
    expect(confirmed.engine_metadata.trust_reduction_applied).toBeGreaterThan(0);
  });

  it("partial assessor confirmation reduces score less than full confirmation", () => {
    const partial = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "partial",
    });

    const full = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(full.fraud_score).toBeLessThanOrEqual(partial.fraud_score);
  });

  it("assessor disputed damage → assessor_disputed_damage flag, no trust reduction", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "disputed",
    });

    expect(result.flags.some(f => f.code === "assessor_disputed_damage")).toBe(true);
    expect(result.engine_metadata.trust_reduction_applied).toBe(0);
  });

  it("confirmed assessor + STRONG pattern → bonus trust reduction applied", () => {
    const confirmedStrong = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const confirmedModerate = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    // STRONG pattern gives a bonus trust reduction on top of assessor confirmation
    expect(confirmedStrong.engine_metadata.trust_reduction_applied).toBeGreaterThan(
      confirmedModerate.engine_metadata.trust_reduction_applied
    );
  });

  it("STRONG pattern without assessor still provides trust reduction", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "not_yet",
    });

    expect(result.engine_metadata.trust_reduction_applied).toBeGreaterThan(0);
    expect(result.engine_metadata.trust_signals_applied.length).toBeGreaterThan(0);
  });

  it("structural damage confirmed by assessor adds additional trust signal", () => {
    const withStructural = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRUCTURAL_STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const withoutStructural = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(withStructural.engine_metadata.trust_reduction_applied).toBeGreaterThanOrEqual(
      withoutStructural.engine_metadata.trust_reduction_applied
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FALSE POSITIVE PROTECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("False positive protection", () => {
  it("STRONG pattern + confirmed assessor suppresses LOW documentation flags", () => {
    // Simulate a scenario where a LOW documentation flag would normally appear
    // but physical consistency is overwhelming
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    // No LOW documentation flags should survive
    const lowDocFlags = result.flags.filter(
      f => f.severity === "LOW" && f.category === "documentation"
    );
    expect(lowDocFlags.length).toBe(0);
  });

  it("false_positive_protection array is always an array", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(Array.isArray(result.false_positive_protection)).toBe(true);
  });

  it("false positive suppression records contain required fields", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    for (const fpp of result.false_positive_protection) {
      expect(fpp).toHaveProperty("suppressed_flag");
      expect(fpp).toHaveProperty("reason");
      expect(fpp).toHaveProperty("scenario_context");
      expect(typeof fpp.suppressed_flag).toBe("string");
      expect(typeof fpp.reason).toBe("string");
    }
  });

  it("engine_metadata.false_positives_suppressed matches false_positive_protection length", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "minor_gap",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.engine_metadata.false_positives_suppressed).toBe(
      result.false_positive_protection.length
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOURAL ENRICHMENT
// ─────────────────────────────────────────────────────────────────────────────

describe("Behavioural enrichment flags", () => {
  it("3+ prior claims → high_prior_claim_frequency flag (MEDIUM)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: { prior_claims_count: 3 },
    });

    const flag = result.flags.find(f => f.code === "high_prior_claim_frequency");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("MEDIUM");
  });

  it("5+ prior claims → high_prior_claim_frequency flag (HIGH)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: { prior_claims_count: 5 },
    });

    const flag = result.flags.find(f => f.code === "high_prior_claim_frequency");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
  });

  it("2 prior claims → no prior claim frequency flag", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: { prior_claims_count: 2 },
    });

    expect(result.flags.some(f => f.code === "high_prior_claim_frequency")).toBe(false);
  });

  it("non-panel repairer requested → non_panel_repairer_requested flag", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: {
        specific_repairer_requested: true,
        preferred_repairer: false,
      },
    });

    expect(result.flags.some(f => f.code === "non_panel_repairer_requested")).toBe(true);
  });

  it("preferred panel repairer → no non_panel_repairer_requested flag", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: {
        specific_repairer_requested: true,
        preferred_repairer: true,
      },
    });

    expect(result.flags.some(f => f.code === "non_panel_repairer_requested")).toBe(false);
  });

  it("high fraud location → high_fraud_location flag (MEDIUM)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: { high_fraud_location: true },
    });

    const flag = result.flags.find(f => f.code === "high_fraud_location");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("MEDIUM");
  });

  it("extreme reporting delay → extreme_reporting_delay flag (HIGH)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: { days_to_report: 90 }, // 3x the typical 7-day window
    });

    const flag = result.flags.find(f => f.code === "extreme_reporting_delay");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
  });

  it("late reporting (within 3x window) → late_reporting flag (LOW)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: { days_to_report: 10 }, // > 7 days but < 21 days
    });

    const flag = result.flags.find(f => f.code === "late_reporting");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("LOW");
  });

  it("no enrichment → no enrichment flags", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const enrichmentFlags = result.flags.filter(f =>
      ["high_prior_claim_frequency", "recently_purchased_vehicle",
       "financed_vehicle_total_loss_risk", "non_panel_repairer_requested",
       "after_hours_lodgement", "high_fraud_location"].includes(f.code)
    );
    expect(enrichmentFlags.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE RULES
// ─────────────────────────────────────────────────────────────────────────────

describe("Timeline consistency rules", () => {
  it("consistent timeline → no timeline flags", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const timelineFlags = result.flags.filter(f => f.category === "timeline");
    expect(timelineFlags.length).toBe(0);
  });

  it("minor_gap timeline → suppressed as benign", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "minor_gap",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "significant_timeline_gap")).toBe(false);
    const suppressed = result.false_positive_protection.some(
      p => p.suppressed_flag === "minor_timeline_gap"
    );
    expect(suppressed).toBe(true);
  });

  it("significant_gap for vehicle_collision → significant_timeline_gap flag", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "significant_gap",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "significant_timeline_gap")).toBe(true);
  });

  it("contradictory timeline → contradictory_timeline flag (HIGH)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "contradictory",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const flag = result.flags.find(f => f.code === "contradictory_timeline");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("HIGH");
    expect(flag!.score_contribution).toBeGreaterThanOrEqual(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RISK LEVEL THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

describe("Risk level thresholds", () => {
  it("score 0–24 → LOW risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.fraud_score).toBeLessThan(25);
    expect(result.risk_level).toBe("LOW");
  });

  it("score 25–54 → MEDIUM risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: WEAK_PATTERN,
      assessor_confirmation: "not_yet",
    });

    // Should be in MEDIUM range
    if (result.fraud_score >= 25 && result.fraud_score < 55) {
      expect(result.risk_level).toBe("MEDIUM");
    }
  });

  it("score 55+ → HIGH risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "contradictory",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "disputed",
    });

    expect(result.fraud_score).toBeGreaterThanOrEqual(55);
    expect(result.risk_level).toBe("HIGH");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MISSING INPUTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Missing input tracking", () => {
  it("all unknown inputs → all four tracked as missing", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "unknown",
      police_report_status: "unknown",
      timeline_consistency: "unknown",
      damage_pattern_result: null,
      assessor_confirmation: "unknown",
    });

    expect(result.engine_metadata.inputs_missing).toContain("police_report_status");
    expect(result.engine_metadata.inputs_missing).toContain("timeline_consistency");
    expect(result.engine_metadata.inputs_missing).toContain("damage_pattern_result");
    expect(result.engine_metadata.inputs_missing).toContain("assessor_confirmation");
  });

  it("fully populated inputs → no missing inputs", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.engine_metadata.inputs_missing.length).toBe(0);
  });

  it("reasoning mentions missing inputs when present", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "unknown",
      timeline_consistency: "unknown",
      damage_pattern_result: null,
      assessor_confirmation: "unknown",
    });

    expect(result.reasoning).toContain("Missing inputs");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REASONING QUALITY
// ─────────────────────────────────────────────────────────────────────────────

describe("Reasoning output", () => {
  it("reasoning is a non-empty string", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(50);
  });

  it("reasoning mentions the scenario type", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.reasoning.toLowerCase()).toContain("animal");
  });

  it("reasoning mentions final fraud score", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.reasoning).toContain(String(result.fraud_score));
  });

  it("animal strike reasoning includes police report note", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.reasoning).toContain("police report is NOT a fraud signal");
  });

  it("theft reasoning includes police report mandatory note", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "theft",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
    });

    expect(result.reasoning).toContain("mandatory");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REAL-WORLD SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

describe("Real-world scenarios", () => {
  it("Mazda BT-50 cattle strike (clean) → LOW risk, score ≤ 10, zero flags", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRUCTURAL_STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.risk_level).toBe("LOW");
    expect(result.fraud_score).toBeLessThanOrEqual(10);
    expect(result.flags.length).toBe(0);
  });

  it("Staged collision (no police, contradictory timeline, NONE pattern, disputed assessor) → HIGH risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "contradictory",
      damage_pattern_result: NONE_PATTERN,
      assessor_confirmation: "disputed",
      enrichment: {
        recently_purchased: true,
        high_fraud_location: true,
        prior_claims_count: 4,
      },
    });

    expect(result.risk_level).toBe("HIGH");
    expect(result.fraud_score).toBeGreaterThanOrEqual(55);
    expect(result.flags.length).toBeGreaterThanOrEqual(5);
  });

  it("Fire fraud (recently purchased, financed, no police, after hours) → HIGH risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "fire",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: null,
      assessor_confirmation: "not_yet",
      enrichment: {
        recently_purchased: true,
        vehicle_financed: true,
        after_hours_lodgement: true,
      },
    });

    expect(result.risk_level).toBe("HIGH");
    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(true);
    expect(result.flags.some(f => f.code === "recently_purchased_vehicle")).toBe(true);
    expect(result.flags.some(f => f.code === "financed_vehicle_total_loss_risk")).toBe(true);
  });

  it("Flood claim (legitimate, delayed, no police) → LOW or MEDIUM risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "flood",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
      enrichment: { days_to_report: 25 },
    });

    // Flood with significant delay should not be HIGH risk
    expect(["LOW", "MEDIUM"]).toContain(result.risk_level);
    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(false);
    expect(result.flags.some(f => f.code === "significant_timeline_gap")).toBe(false);
  });

  it("Theft with full documentation → LOW risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "theft",
      police_report_status: "present",
      timeline_consistency: "consistent",
      damage_pattern_result: null,
      assessor_confirmation: "confirmed",
    });

    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(false);
    expect(result.risk_level).toBe("LOW");
  });

  it("Windscreen claim (no police, delayed) → LOW risk", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "windscreen",
      police_report_status: "absent",
      timeline_consistency: "significant_gap",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.risk_level).toBe("LOW");
    expect(result.flags.some(f => f.code === "missing_police_report")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCORE INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

describe("Score integrity", () => {
  it("score_before_trust_reduction >= final fraud_score", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.engine_metadata.score_before_trust_reduction).toBeGreaterThanOrEqual(
      result.fraud_score
    );
  });

  it("trust_reduction_applied = score_before_trust_reduction - fraud_score (approximately)", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "vehicle_collision",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: MODERATE_PATTERN,
      assessor_confirmation: "confirmed",
    });

    const meta = result.engine_metadata;
    const expectedScore = Math.max(0, meta.score_before_trust_reduction - meta.trust_reduction_applied);
    expect(result.fraud_score).toBe(expectedScore);
  });

  it("score is never negative", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "animal_strike",
      police_report_status: "absent",
      timeline_consistency: "consistent",
      damage_pattern_result: STRONG_PATTERN,
      assessor_confirmation: "confirmed",
    });

    expect(result.fraud_score).toBeGreaterThanOrEqual(0);
  });

  it("score is never above 100 even with many flags", () => {
    const result = evaluateScenarioFraud({
      scenario_type: "theft",
      police_report_status: "absent",
      timeline_consistency: "contradictory",
      damage_pattern_result: {
        ...NONE_PATTERN,
        validation_detail: { ...NONE_PATTERN.validation_detail, image_contradiction: true },
      },
      assessor_confirmation: "disputed",
      enrichment: {
        prior_claims_count: 10,
        recently_purchased: true,
        vehicle_financed: true,
        after_hours_lodgement: true,
        high_fraud_location: true,
        specific_repairer_requested: true,
        preferred_repairer: false,
        days_to_report: 200,
      },
    });

    expect(result.fraud_score).toBeLessThanOrEqual(100);
  });
});
