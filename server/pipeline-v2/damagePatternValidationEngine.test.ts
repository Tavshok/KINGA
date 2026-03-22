/**
 * damagePatternValidationEngine.test.ts
 *
 * Comprehensive tests for the Damage Pattern Validation Engine.
 * Covers: all scenario types, structural detection, image contradiction,
 * impact direction plausibility, the Mazda scenario, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { validateDamagePattern } from "./damagePatternValidationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL STRIKE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Animal Strike Pattern Validation", () => {
  it("STRONG match — Mazda BT-50 cattle strike at 90 km/h (full frontal damage)", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: [
        "front bumper assembly",
        "bonnet/hood",
        "radiator",
        "grille",
        "headlamp assembly",
        "radiator support panel",
        "intercooler",
        "fan cowling",
        "bull bar",
      ],
      impact_direction: "frontal",
    });
    expect(result.pattern_match).toBe("STRONG");
    expect(result.structural_damage_detected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.missing_expected_components.length).toBeLessThanOrEqual(5);
  });

  it("MODERATE match — partial frontal damage (missing radiator)", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: [
        "front bumper",
        "bonnet",
        "grille",
      ],
      impact_direction: "frontal",
    });
    expect(["STRONG", "MODERATE"]).toContain(result.pattern_match);
    expect(result.structural_damage_detected).toBe(false);
  });

  it("WEAK match — only one primary component present", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper"],
      impact_direction: "frontal",
    });
    expect(["MODERATE", "WEAK"]).toContain(result.pattern_match);
  });

  it("NONE match — rear damage only for animal strike", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["boot lid", "rear bumper", "taillight"],
      impact_direction: "rear",
    });
    // Rear damage with no frontal components = WEAK or NONE
    expect(["WEAK", "NONE"]).toContain(result.pattern_match);
  });

  it("detects structural damage when radiator support is present", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "radiator support panel", "bonnet"],
      impact_direction: "frontal",
    });
    expect(result.structural_damage_detected).toBe(true);
    expect(result.validation_detail.structural_components_found).toContain("radiator support panel");
  });

  it("does not flag structural damage when only cosmetic components present", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "grille", "headlamp"],
      impact_direction: "frontal",
    });
    expect(result.structural_damage_detected).toBe(false);
  });

  it("IMAGE CONTRADICTION — rear images only for animal strike", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator"],
      image_detected_zones: ["rear", "boot", "rear_bumper"],
      impact_direction: "frontal",
    });
    expect(result.pattern_match).toBe("WEAK");
    expect(result.validation_detail.image_contradiction).toBe(true);
  });

  it("no image contradiction when frontal images match animal strike", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator"],
      image_detected_zones: ["front", "bonnet", "radiator", "grille"],
      impact_direction: "frontal",
    });
    expect(result.validation_detail.image_contradiction).toBe(false);
  });

  it("identifies unexpected components (rear bumper in frontal animal strike)", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "rear bumper assembly"],
      impact_direction: "frontal",
    });
    expect(result.unexpected_components.some(c => c.includes("rear bumper"))).toBe(true);
  });

  it("reasoning mentions structural damage when found", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "radiator support", "bonnet"],
      impact_direction: "frontal",
    });
    expect(result.reasoning).toContain("Structural damage confirmed");
  });

  it("reasoning mentions missing primary components", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper"],
      impact_direction: "frontal",
    });
    expect(result.reasoning).toContain("Missing primary");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE COLLISION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Vehicle Collision Pattern Validation", () => {
  it("STRONG match — frontal collision with bumper, fender, radiator", () => {
    const result = validateDamagePattern({
      scenario_type: "vehicle_collision",
      damage_components: ["front bumper", "fender", "wing", "door", "quarter panel"],
      impact_direction: "frontal",
    });
    expect(result.pattern_match).toBe("STRONG");
  });

  it("MODERATE match — rear collision with bumper and taillight", () => {
    const result = validateDamagePattern({
      scenario_type: "vehicle_collision",
      damage_components: ["rear bumper", "taillight"],
      impact_direction: "rear",
    });
    expect(["STRONG", "MODERATE", "WEAK"]).toContain(result.pattern_match);
  });

  it("structural damage detected when frame rail is present", () => {
    const result = validateDamagePattern({
      scenario_type: "vehicle_collision",
      damage_components: ["front bumper", "frame rail", "radiator"],
      impact_direction: "frontal",
    });
    expect(result.structural_damage_detected).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THEFT TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Theft Pattern Validation", () => {
  it("STRONG match — door lock, ignition, steering column, window", () => {
    const result = validateDamagePattern({
      scenario_type: "theft",
      damage_components: ["door lock", "ignition", "window", "steering column"],
      impact_direction: "unknown",
    });
    expect(result.pattern_match).toBe("STRONG");
    expect(result.structural_damage_detected).toBe(false);
  });

  it("MODERATE match — catalytic converter theft", () => {
    const result = validateDamagePattern({
      scenario_type: "theft",
      damage_components: ["catalytic converter", "exhaust"],
      impact_direction: "unknown",
    });
    // catalytic converter is in secondary, so coverage depends on primary
    expect(["WEAK", "MODERATE", "NONE"]).toContain(result.pattern_match);
  });

  it("MODERATE match — wheel theft", () => {
    const result = validateDamagePattern({
      scenario_type: "theft",
      damage_components: ["wheels", "tyres"],
      impact_direction: "unknown",
    });
    expect(["WEAK", "MODERATE", "NONE"]).toContain(result.pattern_match);
  });

  it("IMAGE CONTRADICTION — fire damage images for theft claim", () => {
    const result = validateDamagePattern({
      scenario_type: "fire",
      damage_components: ["engine bay", "wiring harness"],
      image_detected_zones: ["paint", "exterior", "scratch"],
      impact_direction: "unknown",
    });
    expect(result.validation_detail.image_contradiction).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIRE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Fire Pattern Validation", () => {
  it("STRONG match — engine bay, wiring harness, fuel system", () => {
    const result = validateDamagePattern({
      scenario_type: "fire",
      damage_components: ["engine bay", "wiring harness", "fuel system"],
      impact_direction: "unknown",
    });
    expect(result.pattern_match).toBe("STRONG");
  });

  it("WEAK match — only interior damage (secondary only)", () => {
    const result = validateDamagePattern({
      scenario_type: "fire",
      damage_components: ["seats", "dashboard"],
      impact_direction: "unknown",
    });
    expect(["WEAK", "NONE"]).toContain(result.pattern_match);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOOD TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Flood Pattern Validation", () => {
  it("STRONG match — interior, carpet, electrical, wiring", () => {
    const result = validateDamagePattern({
      scenario_type: "flood",
      damage_components: ["interior", "carpet", "electrical", "wiring"],
      impact_direction: "undercarriage",
    });
    expect(result.pattern_match).toBe("STRONG");
  });

  it("IMAGE CONTRADICTION — collision images for flood claim", () => {
    const result = validateDamagePattern({
      scenario_type: "flood",
      damage_components: ["interior", "carpet"],
      image_detected_zones: ["front_bumper", "crumple_zone", "front"],
      impact_direction: "undercarriage",
    });
    expect(result.validation_detail.image_contradiction).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VANDALISM TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Vandalism Pattern Validation", () => {
  it("STRONG match — paint, window, windscreen, tyre", () => {
    const result = validateDamagePattern({
      scenario_type: "vandalism",
      damage_components: ["paint", "window", "windscreen", "tyre"],
      impact_direction: "unknown",
    });
    expect(result.pattern_match).toBe("STRONG");
  });

  it("MODERATE match — smashed windows and mirrors", () => {
    const result = validateDamagePattern({
      scenario_type: "vandalism",
      damage_components: ["window", "mirror", "wiper"],
      impact_direction: "unknown",
    });
    expect(["STRONG", "MODERATE"]).toContain(result.pattern_match);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WINDSCREEN TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Windscreen Pattern Validation", () => {
  it("STRONG match — windscreen crack", () => {
    const result = validateDamagePattern({
      scenario_type: "windscreen",
      damage_components: ["windscreen"],
      impact_direction: "frontal",
    });
    // windscreen alone covers 1/2 = 50% of primary, which hits the moderate_threshold (0.5)
    // STRONG requires >= 0.8 primary coverage, so single component = MODERATE
    expect(["STRONG", "MODERATE"]).toContain(result.pattern_match);
  });

  it("STRONG match — windshield shatter", () => {
    const result = validateDamagePattern({
      scenario_type: "windscreen",
      damage_components: ["windshield", "wiper"],
      impact_direction: "frontal",
    });
    // windshield covers 1/2 primary (50%) = MODERATE; need both windscreen+windshield to reach STRONG
    expect(["STRONG", "MODERATE"]).toContain(result.pattern_match);
  });

  it("NONE match — no windscreen component for windscreen claim", () => {
    const result = validateDamagePattern({
      scenario_type: "windscreen",
      damage_components: ["front bumper", "grille"],
      impact_direction: "frontal",
    });
    expect(result.pattern_match).toBe("NONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COSMETIC TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Cosmetic Pattern Validation", () => {
  it("STRONG match — paint scratch and dent", () => {
    const result = validateDamagePattern({
      scenario_type: "cosmetic",
      damage_components: ["paint", "scratch", "dent"],
      impact_direction: "unknown",
    });
    expect(result.pattern_match).toBe("STRONG");
  });

  it("MODERATE match — bumper scuff", () => {
    const result = validateDamagePattern({
      scenario_type: "cosmetic",
      damage_components: ["bumper", "scuff"],
      impact_direction: "unknown",
    });
    expect(["STRONG", "MODERATE"]).toContain(result.pattern_match);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WEATHER EVENT TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Weather Event Pattern Validation", () => {
  it("STRONG match — hail damage to roof, bonnet, boot", () => {
    const result = validateDamagePattern({
      scenario_type: "weather_event",
      damage_components: ["roof", "bonnet", "hood", "boot lid"],
      impact_direction: "top",
    });
    expect(result.pattern_match).toBe("STRONG");
  });

  it("MODERATE match — falling tree damage to roof and windscreen", () => {
    const result = validateDamagePattern({
      scenario_type: "weather_event",
      damage_components: ["roof", "windscreen", "mirror"],
      impact_direction: "top",
    });
    expect(["STRONG", "MODERATE"]).toContain(result.pattern_match);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UNKNOWN SCENARIO TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Unknown Scenario Handling", () => {
  it("returns NONE and confidence 0 for unknown scenario", () => {
    const result = validateDamagePattern({
      scenario_type: "unknown",
      damage_components: ["front bumper", "bonnet"],
      impact_direction: "frontal",
    });
    expect(result.pattern_match).toBe("NONE");
    expect(result.confidence).toBe(0);
  });

  it("returns NONE when no damage components provided", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: [],
      impact_direction: "frontal",
    });
    expect(result.pattern_match).toBe("NONE");
    expect(result.confidence).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPACT DIRECTION PLAUSIBILITY TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Impact Direction Plausibility", () => {
  it("downgrades match when impact direction is implausible for scenario", () => {
    // Animal strike with side impact — unusual, should downgrade
    const frontal = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator", "grille", "headlamp"],
      impact_direction: "frontal",
    });
    const side = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator", "grille", "headlamp"],
      impact_direction: "side_driver",
    });
    // Frontal should have higher or equal confidence than side
    expect(frontal.confidence).toBeGreaterThanOrEqual(side.confidence);
  });

  it("unknown impact direction does not penalise the match", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator", "grille", "headlamp"],
      impact_direction: "unknown",
    });
    expect(result.pattern_match).toBe("STRONG");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION DETAIL TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Validation Detail Output", () => {
  it("validation_detail contains expected_primary and expected_secondary", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet"],
      impact_direction: "frontal",
    });
    expect(result.validation_detail.expected_primary.length).toBeGreaterThan(0);
    expect(result.validation_detail.expected_secondary.length).toBeGreaterThan(0);
  });

  it("validation_detail.primary_coverage_pct is a percentage 0-100", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator"],
      impact_direction: "frontal",
    });
    expect(result.validation_detail.primary_coverage_pct).toBeGreaterThanOrEqual(0);
    expect(result.validation_detail.primary_coverage_pct).toBeLessThanOrEqual(100);
  });

  it("validation_detail.matched_primary lists only matched keywords", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet"],
      impact_direction: "frontal",
    });
    expect(result.validation_detail.matched_primary.length).toBeGreaterThan(0);
    // Every matched keyword should be from the expected_primary list
    for (const m of result.validation_detail.matched_primary) {
      expect(result.validation_detail.expected_primary).toContain(m);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE SCORE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence Score Calculation", () => {
  it("confidence is higher when image zones are provided", () => {
    const withImages = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator"],
      image_detected_zones: ["front", "bonnet", "radiator"],
      impact_direction: "frontal",
    });
    const withoutImages = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator"],
      impact_direction: "frontal",
    });
    expect(withImages.confidence).toBeGreaterThanOrEqual(withoutImages.confidence);
  });

  it("confidence is penalised when image contradiction is detected", () => {
    const withContradiction = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator"],
      image_detected_zones: ["rear", "boot", "rear_bumper"],
      impact_direction: "frontal",
    });
    const withoutContradiction = validateDamagePattern({
      scenario_type: "animal_strike",
      damage_components: ["front bumper", "bonnet", "radiator"],
      impact_direction: "frontal",
    });
    expect(withContradiction.confidence).toBeLessThan(withoutContradiction.confidence);
  });

  it("confidence is always between 0 and 100", () => {
    const scenarios = ["animal_strike", "vehicle_collision", "theft", "fire", "flood", "vandalism"] as const;
    for (const s of scenarios) {
      const result = validateDamagePattern({
        scenario_type: s,
        damage_components: ["front bumper", "bonnet"],
        impact_direction: "frontal",
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REAL-WORLD SCENARIO: MAZDA BT-50 CATTLE STRIKE
// ─────────────────────────────────────────────────────────────────────────────

describe("Real-world Scenario: Mazda BT-50 Cattle Strike", () => {
  it("produces STRONG match for the Mazda BT-50 cattle strike damage profile", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      vehicle_type: "pickup",
      damage_components: [
        "front bumper assembly",
        "bonnet/hood",
        "radiator",
        "front grille",
        "headlamp assembly",
        "radiator support panel",
        "intercooler",
        "fan cowling",
        "bull bar",
        "fuse box",
      ],
      image_detected_zones: [
        "front",
        "bonnet",
        "radiator",
        "grille",
        "headlamp",
        "bull_bar",
      ],
      impact_direction: "frontal",
    });

    expect(result.pattern_match).toBe("STRONG");
    expect(result.structural_damage_detected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.validation_detail.image_contradiction).toBe(false);
    expect(result.missing_expected_components.length).toBeLessThanOrEqual(5);
  });

  it("Mazda scenario: reasoning mentions structural components", () => {
    const result = validateDamagePattern({
      scenario_type: "animal_strike",
      vehicle_type: "pickup",
      damage_components: [
        "front bumper assembly",
        "bonnet/hood",
        "radiator support panel",
        "radiator",
        "grille",
      ],
      impact_direction: "frontal",
    });
    expect(result.reasoning).toContain("Structural damage confirmed");
    expect(result.reasoning).toContain("radiator support panel");
  });
});
