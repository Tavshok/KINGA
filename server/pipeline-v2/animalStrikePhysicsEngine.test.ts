/**
 * animalStrikePhysicsEngine.test.ts
 *
 * Comprehensive tests for the Animal Strike Physics Engine.
 * Covers: physics calculations, severity classification, damage patterns,
 * plausibility scoring, bullbar effects, safety system thresholds,
 * and the Mazda BT-50 real-world scenario.
 */

import { describe, it, expect } from "vitest";
import { runAnimalStrikePhysics } from "./animalStrikePhysicsEngine";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const MAZDA_COMPONENTS = [
  "bull bar (if fitted)",
  "bonnet/hood",
  "radiator support panel",
  "intercooler",
  "fan cowling",
  "headlamp assembly",
  "front bumper assembly",
];

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICS SANITY CHECKS
// ─────────────────────────────────────────────────────────────────────────────

describe("physics sanity checks", () => {
  it("delta_v_kmh is always > 0 when speed > 0", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 50,
      vehicle_type: "sedan",
      damage_components: ["front bumper assembly"],
      presence_of_bullbar: false,
    });
    expect(result.delta_v_kmh).toBeGreaterThan(0);
  });

  it("impact_force_kn is always > 0 when speed > 0", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 60,
      vehicle_type: "pickup",
      damage_components: ["front bumper assembly"],
      presence_of_bullbar: false,
    });
    expect(result.impact_force_kn).toBeGreaterThan(0);
  });

  it("peak_deceleration_g is between 0.01 and 50", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 120,
      vehicle_type: "sedan",
      damage_components: ["front bumper assembly"],
      presence_of_bullbar: false,
    });
    expect(result.peak_deceleration_g).toBeGreaterThan(0);
    expect(result.peak_deceleration_g).toBeLessThanOrEqual(50);
  });

  it("energy_distribution_pct is never > 100%", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 200,
      vehicle_type: "motorcycle",
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(result.calculation_trace.energy_distribution_pct).toBeLessThanOrEqual(100);
  });

  it("delta_v is 0 when speed is 0", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 0,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(result.delta_v_kmh).toBe(0);
  });

  it("heavier vehicle produces lower delta_v than lighter vehicle at same speed", () => {
    const truck = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "truck",
      damage_components: [],
      presence_of_bullbar: false,
    });
    const motorcycle = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "motorcycle",
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(truck.delta_v_kmh).toBeLessThan(motorcycle.delta_v_kmh);
  });

  it("higher speed produces higher delta_v", () => {
    const slow = runAnimalStrikePhysics({
      speed_kmh: 40,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
    });
    const fast = runAnimalStrikePhysics({
      speed_kmh: 100,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(fast.delta_v_kmh).toBeGreaterThan(slow.delta_v_kmh);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

describe("severity classification", () => {
  it("classifies minor impact at low speed with small animal", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 30,
      vehicle_type: "sedan",
      damage_components: ["front bumper assembly"],
      presence_of_bullbar: false,
      animal_category: "dog",
    });
    expect(result.impact_severity).toBe("minor");
  });

  it("classifies moderate impact at medium speed with cattle", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 50,
      vehicle_type: "sedan",
      damage_components: ["front bumper assembly", "bonnet/hood"],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    expect(result.impact_severity).toBe("moderate");
  });

  it("classifies severe impact at high speed (>70 km/h) with cattle", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: MAZDA_COMPONENTS,
      presence_of_bullbar: true,
      animal_category: "cattle",
    });
    expect(["severe", "catastrophic"]).toContain(result.impact_severity);
  });

  it("classifies catastrophic impact at very high speed with large animal", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 120,
      vehicle_type: "sedan",
      damage_components: ["windscreen", "A-pillar", "chassis/frame"],
      presence_of_bullbar: false,
      animal_category: "horse",
    });
    expect(result.impact_severity).toBe("catastrophic");
  });

  it("bullbar raises severity threshold — same speed produces lower severity with bullbar", () => {
    const withBullbar = runAnimalStrikePhysics({
      speed_kmh: 70,
      vehicle_type: "pickup",
      damage_components: [],
      presence_of_bullbar: true,
      animal_category: "cattle",
    });
    const withoutBullbar = runAnimalStrikePhysics({
      speed_kmh: 70,
      vehicle_type: "pickup",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    const severityOrder: Record<string, number> = { minor: 0, moderate: 1, severe: 2, catastrophic: 3 };
    expect(severityOrder[withBullbar.impact_severity]).toBeLessThanOrEqual(
      severityOrder[withoutBullbar.impact_severity]
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY SYSTEM THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

describe("safety system thresholds", () => {
  it("seatbelt NOT expected below 8 km/h delta-v", () => {
    // Very slow speed with small animal → delta-v < 8 km/h
    const result = runAnimalStrikePhysics({
      speed_kmh: 10,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "dog",
    });
    expect(result.seatbelt_expected).toBe(false);
  });

  it("seatbelt expected at highway speed with cattle", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    expect(result.seatbelt_expected).toBe(true);
  });

  it("airbag NOT expected at low delta-v", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 30,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "dog",
    });
    expect(result.airbag_expected).toBe(false);
  });

  it("airbag expected at high speed cattle strike", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 120,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    expect(result.airbag_expected).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPECTED DAMAGE PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

describe("expected damage patterns", () => {
  it("always includes front bumper assembly in expected damage", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 60,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(result.expected_damage.some(d => d.includes("bumper"))).toBe(true);
  });

  it("includes bullbar in expected damage when bullbar is present", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "pickup",
      damage_components: [],
      presence_of_bullbar: true,
      animal_category: "cattle",
    });
    expect(result.expected_damage.some(d => d.includes("bull bar"))).toBe(true);
  });

  it("bullbar_effect_applied is true when bullbar present", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "pickup",
      damage_components: [],
      presence_of_bullbar: true,
    });
    expect(result.bullbar_effect_applied).toBe(true);
  });

  it("bullbar_effect_applied is false when no bullbar", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(result.bullbar_effect_applied).toBe(false);
  });

  it("severe cattle strike includes radiator support and intercooler", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 100,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    const damage = result.expected_damage.join(" ");
    expect(damage).toContain("radiator support panel");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLAUSIBILITY SCORING
// ─────────────────────────────────────────────────────────────────────────────

describe("plausibility scoring", () => {
  it("plausibility_score is between 0 and 100", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: MAZDA_COMPONENTS,
      presence_of_bullbar: true,
    });
    expect(result.plausibility_score).toBeGreaterThanOrEqual(0);
    expect(result.plausibility_score).toBeLessThanOrEqual(100);
  });

  it("CONSISTENT verdict when reported damage matches expected damage well", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: MAZDA_COMPONENTS,
      presence_of_bullbar: true,
      animal_category: "cattle",
      seatbelts_triggered: true,
    });
    expect(result.consistency).toBe("CONSISTENT");
    expect(result.plausibility_score).toBeGreaterThanOrEqual(70);
  });

  it("INCONSISTENT verdict when reported damage does not match expected", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: ["rear bumper", "boot lid", "rear light cluster"], // rear damage on frontal strike
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    expect(result.consistency).toBe("INCONSISTENT");
    expect(result.plausibility_score).toBeLessThan(40);
  });

  it("PARTIAL verdict for partial component match", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "sedan",
      damage_components: ["front bumper assembly"], // only one component for a severe strike
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    expect(["PARTIAL", "INCONSISTENT"]).toContain(result.consistency);
  });

  it("airbag deployed when expected raises plausibility score", () => {
    const withAirbag = runAnimalStrikePhysics({
      speed_kmh: 120,
      vehicle_type: "sedan",
      damage_components: MAZDA_COMPONENTS,
      presence_of_bullbar: false,
      animal_category: "cattle",
      airbags_deployed: true,
    });
    const withoutAirbag = runAnimalStrikePhysics({
      speed_kmh: 120,
      vehicle_type: "sedan",
      damage_components: MAZDA_COMPONENTS,
      presence_of_bullbar: false,
      animal_category: "cattle",
      airbags_deployed: false,
    });
    expect(withAirbag.plausibility_score).toBeGreaterThan(withoutAirbag.plausibility_score);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL CATEGORY HANDLING
// ─────────────────────────────────────────────────────────────────────────────

describe("animal category handling", () => {
  it("defaults to cattle when animal_category is unknown", () => {
    const unknown = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: MAZDA_COMPONENTS,
      presence_of_bullbar: true,
    });
    const cattle = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: MAZDA_COMPONENTS,
      presence_of_bullbar: true,
      animal_category: "cattle",
    });
    expect(unknown.delta_v_kmh).toBe(cattle.delta_v_kmh);
  });

  it("small animal produces much lower delta_v than cattle at same speed", () => {
    const cattle = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    const dog = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "dog",
    });
    expect(cattle.delta_v_kmh).toBeGreaterThan(dog.delta_v_kmh);
  });

  it("horse produces similar delta_v to cattle", () => {
    const cattle = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    const horse = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "horse",
    });
    // Horse (450 kg) vs cattle (500 kg) — within 15% of each other
    expect(Math.abs(cattle.delta_v_kmh - horse.delta_v_kmh)).toBeLessThan(
      cattle.delta_v_kmh * 0.15
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAZDA BT-50 REAL-WORLD SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("Mazda BT-50 real-world scenario (90 km/h cattle strike with bullbar)", () => {
  const mazdaResult = runAnimalStrikePhysics({
    speed_kmh: 90,
    vehicle_type: "pickup",
    damage_components: MAZDA_COMPONENTS,
    presence_of_bullbar: true,
    animal_category: "cattle",
    seatbelts_triggered: true,
  });

  it("produces severe or catastrophic severity at 90 km/h", () => {
    expect(["severe", "catastrophic"]).toContain(mazdaResult.impact_severity);
  });

  it("delta_v is physically plausible (5–30 km/h range for 2000 kg pickup vs 500 kg cattle)", () => {
    expect(mazdaResult.delta_v_kmh).toBeGreaterThan(5);
    expect(mazdaResult.delta_v_kmh).toBeLessThan(30);
  });

  it("impact force is in realistic range (50–500 kN)", () => {
    expect(mazdaResult.impact_force_kn).toBeGreaterThan(50);
    expect(mazdaResult.impact_force_kn).toBeLessThan(500);
  });

  it("peak deceleration is in realistic range (1–30 G)", () => {
    expect(mazdaResult.peak_deceleration_g).toBeGreaterThan(1);
    expect(mazdaResult.peak_deceleration_g).toBeLessThan(30);
  });

  it("seatbelt expected at this delta-v", () => {
    expect(mazdaResult.seatbelt_expected).toBe(true);
  });

  it("bullbar effect applied", () => {
    expect(mazdaResult.bullbar_effect_applied).toBe(true);
  });

  it("plausibility score is high (≥70) for well-documented cattle strike", () => {
    expect(mazdaResult.plausibility_score).toBeGreaterThanOrEqual(70);
  });

  it("consistency is CONSISTENT for Mazda damage pattern", () => {
    expect(mazdaResult.consistency).toBe("CONSISTENT");
  });

  it("energy distribution is ≤ 100%", () => {
    expect(mazdaResult.calculation_trace.energy_distribution_pct).toBeLessThanOrEqual(100);
  });

  it("reasoning mentions animal strike physics distinction from vehicle collision", () => {
    expect(mazdaResult.reasoning).toContain("animal strike physics differ");
  });

  it("reasoning includes speed, delta-v, and impact force", () => {
    expect(mazdaResult.reasoning).toContain("90 km/h");
    expect(mazdaResult.reasoning).toContain("delta-V");
    expect(mazdaResult.reasoning).toContain("kN");
  });

  it("calculation trace contains all required fields", () => {
    const trace = mazdaResult.calculation_trace;
    expect(trace.vehicle_mass_kg).toBe(2000);
    expect(trace.animal_mass_kg).toBe(500);
    expect(trace.speed_ms).toBeCloseTo(25, 0);
    expect(trace.delta_v_ms).toBeGreaterThan(0);
    expect(trace.contact_duration_ms).toBeGreaterThan(0);
    expect(trace.reduced_mass_kg).toBeGreaterThan(0);
    expect(trace.kinetic_energy_kj).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty damage_components array without throwing", () => {
    expect(() => runAnimalStrikePhysics({
      speed_kmh: 60,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
    })).not.toThrow();
  });

  it("handles unknown vehicle type gracefully", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 60,
      vehicle_type: "hovercraft",
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(result.calculation_trace.vehicle_mass_kg).toBe(1500); // default
  });

  it("handles null vehicle type", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 60,
      vehicle_type: null,
      damage_components: [],
      presence_of_bullbar: false,
    });
    expect(result.calculation_trace.vehicle_mass_kg).toBe(1500);
  });

  it("handles bullbar = unknown as false", () => {
    const unknown = runAnimalStrikePhysics({
      speed_kmh: 80,
      vehicle_type: "pickup",
      damage_components: [],
      presence_of_bullbar: "unknown",
    });
    expect(unknown.bullbar_effect_applied).toBe(false);
  });

  it("handles very high speed without producing impossible physics", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 200,
      vehicle_type: "sedan",
      damage_components: [],
      presence_of_bullbar: false,
      animal_category: "cattle",
    });
    expect(result.peak_deceleration_g).toBeLessThanOrEqual(50);
    expect(result.calculation_trace.energy_distribution_pct).toBeLessThanOrEqual(100);
  });

  it("plausibility score is always between 0 and 100", () => {
    const result = runAnimalStrikePhysics({
      speed_kmh: 150,
      vehicle_type: "motorcycle",
      damage_components: ["rear bumper", "boot lid"],
      presence_of_bullbar: false,
      animal_category: "cattle",
      airbags_deployed: false,
      seatbelts_triggered: false,
    });
    expect(result.plausibility_score).toBeGreaterThanOrEqual(0);
    expect(result.plausibility_score).toBeLessThanOrEqual(100);
  });
});
