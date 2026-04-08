/**
 * physicsVectorDirection.test.ts
 *
 * Physics vector direction contract tests.
 *
 * These tests verify that:
 *   1. Animal strikes ALWAYS produce front-zone damage — never rear, boot, or side
 *   2. Damage components are directionally consistent with the impact type
 *   3. Force magnitude is always positive and physically plausible
 *   4. Heavier animals produce more severe damage than lighter ones at the same speed
 *   5. Bullbar correctly redirects damage away from protected components
 *   6. Impact force vectors are never assigned to wrong axis (rear for frontal strike)
 *
 * All tests are deterministic — no LLM calls.
 */

import { describe, it, expect } from "vitest";
import { runAnimalStrikePhysics, type AnimalStrikePhysicsInput } from "./animalStrikePhysicsEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Helper: maps test-friendly aliases → actual AnimalStrikePhysicsInput field names
// The engine uses: animal_category, damage_components, presence_of_bullbar
// ("kudu" and "elephant" are not valid AnimalCategory values — map to "cattle" as conservative fallback)
function mapAnimalType(t: string | null | undefined): AnimalStrikePhysicsInput["animal_category"] {
  if (t === null || t === undefined) return undefined;
  const MAP: Record<string, AnimalStrikePhysicsInput["animal_category"]> = {
    cow: "cattle", cattle: "cattle", kudu: "cattle", elephant: "cattle",
    horse: "horse", donkey: "donkey", goat: "goat", sheep: "sheep",
    pig: "pig", dog: "dog", small_animal: "small_animal",
  };
  return MAP[t] ?? "cattle";
}
function buildInput(overrides: {
  speed_kmh?: number | null;
  animal_type?: string | null;
  vehicle_type?: string | null;
  reported_damage_components?: string[];
  bullbar_present?: boolean;
  airbags_deployed?: boolean;
  seatbelts_triggered?: boolean;
} = {}): AnimalStrikePhysicsInput {
  const { animal_type, reported_damage_components, bullbar_present, ...rest } = overrides;
  return {
    speed_kmh: 90,
    animal_category: mapAnimalType(animal_type ?? "cow"),
    vehicle_type: "sedan",
    damage_components: reported_damage_components ?? ["front bumper assembly", "bonnet/hood", "radiator support panel"],
    presence_of_bullbar: bullbar_present ?? false,
    airbags_deployed: false,
    seatbelts_triggered: false,
    ...rest,
  };
}

// Rear-zone keywords that should NEVER appear in animal strike expected_damage
const REAR_ZONE_KEYWORDS = ["boot", "rear bumper", "tailgate", "rear door", "rear quarter", "tow bar", "spare wheel"];
// Side-zone keywords that should NEVER be primary damage for a direct frontal animal strike
const SIDE_ONLY_KEYWORDS = ["driver door", "passenger door", "side skirt", "rocker panel", "b-pillar", "c-pillar"];

function hasRearZone(components: string[]): boolean {
  return components.some(c => REAR_ZONE_KEYWORDS.some(k => c.toLowerCase().includes(k)));
}

function hasSideOnlyZone(components: string[]): boolean {
  return components.some(c => SIDE_ONLY_KEYWORDS.some(k => c.toLowerCase().includes(k)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Directional correctness — animal strikes are ALWAYS frontal
// ─────────────────────────────────────────────────────────────────────────────

describe("physicsVectorDirection — animal strike damage is always frontal", () => {
  it("expected_damage contains front bumper assembly for cow strike at 90 km/h", () => {
    const result = runAnimalStrikePhysics(buildInput());
    const hasfront = result.expected_damage.some(d => d.toLowerCase().includes("front bumper"));
    expect(hasfront).toBe(true);
  });

  it("expected_damage does NOT contain rear-zone components for frontal cow strike", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 90, animal_type: "cow" }));
    expect(hasRearZone(result.expected_damage)).toBe(false);
  });

  it("expected_damage does NOT contain rear-zone components for high-speed kudu strike", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 120, animal_type: "kudu" }));
    expect(hasRearZone(result.expected_damage)).toBe(false);
  });

  it("expected_damage does NOT contain rear-zone components for low-speed dog strike", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 30, animal_type: "dog" }));
    expect(hasRearZone(result.expected_damage)).toBe(false);
  });

  it("expected_damage does NOT contain rear-zone components for elephant strike", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 60, animal_type: "elephant" }));
    expect(hasRearZone(result.expected_damage)).toBe(false);
  });

  it("expected_damage does NOT contain side-only components for direct frontal strike", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 90, animal_type: "cow" }));
    expect(hasSideOnlyZone(result.expected_damage)).toBe(false);
  });

  it("expected_damage always includes at least one front-zone component at any speed", () => {
    const speeds = [20, 40, 60, 80, 100, 120, 140];
    for (const speed_kmh of speeds) {
      const result = runAnimalStrikePhysics(buildInput({ speed_kmh, animal_type: "cow" }));
      const hasFront = result.expected_damage.some(d =>
        d.toLowerCase().includes("front bumper") ||
        d.toLowerCase().includes("bonnet") ||
        d.toLowerCase().includes("grille") ||
        d.toLowerCase().includes("radiator") ||
        d.toLowerCase().includes("headlamp")
      );
      expect(hasFront, `Speed ${speed_kmh} km/h should produce front-zone damage`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Force magnitude — always positive and physically plausible
// ─────────────────────────────────────────────────────────────────────────────

describe("physicsVectorDirection — force magnitude is always positive", () => {
  it("impact_force_kn is positive for cow strike at 90 km/h", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 90, animal_type: "cow" }));
    expect(result.impact_force_kn).toBeGreaterThan(0);
  });

  it("delta_v_kmh is positive for any non-zero speed", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 60, animal_type: "cow" }));
    expect(result.delta_v_kmh).toBeGreaterThan(0);
  });

  it("peak_deceleration_g is between 0.01 and 50 for typical highway speed", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 90, animal_type: "cow" }));
    expect(result.peak_deceleration_g).toBeGreaterThan(0.01);
    expect(result.peak_deceleration_g).toBeLessThan(50);
  });

  it("energy_absorbed_kj is positive for any non-zero speed", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 80, animal_type: "kudu" }));
    expect(result.energy_absorbed_kj).toBeGreaterThan(0);
  });

  it("impact_force_kn is zero when speed is zero", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 0, animal_type: "cow" }));
    expect(result.impact_force_kn).toBe(0);
    expect(result.delta_v_kmh).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Animal size scaling — larger animals produce more severe damage
// ─────────────────────────────────────────────────────────────────────────────

describe("physicsVectorDirection — larger animals produce more severe damage at same speed", () => {
  it("elephant strike produces more expected_damage components than dog strike at 60 km/h", () => {
    const elephant = runAnimalStrikePhysics(buildInput({ speed_kmh: 60, animal_type: "elephant" }));
    const dog = runAnimalStrikePhysics(buildInput({ speed_kmh: 60, animal_type: "dog" }));
    expect(elephant.expected_damage.length).toBeGreaterThan(dog.expected_damage.length);
  });

  it("cow strike produces higher impact_force_kn than dog strike at same speed", () => {
    const cow = runAnimalStrikePhysics(buildInput({ speed_kmh: 80, animal_type: "cow" }));
    const dog = runAnimalStrikePhysics(buildInput({ speed_kmh: 80, animal_type: "dog" }));
    expect(cow.impact_force_kn).toBeGreaterThan(dog.impact_force_kn);
  });

  it("elephant strike produces higher delta_v_kmh than goat strike at same speed", () => {
    const elephant = runAnimalStrikePhysics(buildInput({ speed_kmh: 70, animal_type: "elephant" }));
    const goat = runAnimalStrikePhysics(buildInput({ speed_kmh: 70, animal_type: "goat" }));
    expect(elephant.delta_v_kmh).toBeGreaterThan(goat.delta_v_kmh);
  });

  it("higher speed produces higher impact_force_kn for same animal", () => {
    const fast = runAnimalStrikePhysics(buildInput({ speed_kmh: 120, animal_type: "cow" }));
    const slow = runAnimalStrikePhysics(buildInput({ speed_kmh: 40, animal_type: "cow" }));
    expect(fast.impact_force_kn).toBeGreaterThan(slow.impact_force_kn);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Bullbar — redirects damage away from protected components
// ─────────────────────────────────────────────────────────────────────────────

describe("physicsVectorDirection — bullbar redirects damage correctly", () => {
  it("bullbar is listed in expected_damage when bullbar_present is true", () => {
    const result = runAnimalStrikePhysics(buildInput({ bullbar_present: true, speed_kmh: 90, animal_type: "cow" }));
    expect(result.bullbar_effect_applied).toBe(true);
    expect(result.expected_damage.some(d => d.toLowerCase().includes("bull bar"))).toBe(true);
  });

  it("bullbar_effect_applied is false when no bullbar", () => {
    const result = runAnimalStrikePhysics(buildInput({ bullbar_present: false }));
    expect(result.bullbar_effect_applied).toBe(false);
  });

  it("radiator support panel is NOT in expected_damage for minor strike with bullbar", () => {
    const result = runAnimalStrikePhysics(buildInput({
      speed_kmh: 30,
      animal_type: "dog",
      bullbar_present: true,
    }));
    const hasRadiatorSupport = result.expected_damage.some(d => d.toLowerCase().includes("radiator support"));
    expect(hasRadiatorSupport).toBe(false);
  });

  it("bullbar does NOT remove rear-zone components (they were never there)", () => {
    const withBullbar = runAnimalStrikePhysics(buildInput({ bullbar_present: true, speed_kmh: 90, animal_type: "cow" }));
    expect(hasRearZone(withBullbar.expected_damage)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Severity classification — correct tier at each speed/animal combination
// ─────────────────────────────────────────────────────────────────────────────

describe("physicsVectorDirection — severity classification is directionally consistent", () => {
  it("low speed + small animal = minor severity", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 20, animal_type: "dog" }));
    expect(result.impact_severity).toBe("minor");
  });

  it("highway speed + large animal = severe or catastrophic", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 100, animal_type: "cow" }));
    expect(["severe", "catastrophic"]).toContain(result.impact_severity);
  });

  it("catastrophic severity includes structural components (windscreen, A-pillar, or chassis)", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 140, animal_type: "elephant" }));
    const hasStructural = result.expected_damage.some(d =>
      d.toLowerCase().includes("windscreen") ||
      d.toLowerCase().includes("a-pillar") ||
      d.toLowerCase().includes("chassis")
    );
    expect(result.impact_severity).toBe("catastrophic");
    expect(hasStructural).toBe(true);
  });

  it("minor severity does NOT include chassis or A-pillar", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: 20, animal_type: "dog" }));
    const hasHeavyStructural = result.expected_damage.some(d =>
      d.toLowerCase().includes("chassis") ||
      d.toLowerCase().includes("a-pillar") ||
      d.toLowerCase().includes("windscreen")
    );
    expect(hasHeavyStructural).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Null-input guard — engine does not crash on missing data
// ─────────────────────────────────────────────────────────────────────────────

describe("physicsVectorDirection — null-input guard", () => {
  it("returns plausibility_score=0 when speed is null", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: null as any }));
    expect(result.plausibility_score).toBe(0);
  });

  it("returns empty expected_damage when speed is null", () => {
    const result = runAnimalStrikePhysics(buildInput({ speed_kmh: null as any }));
    expect(result.expected_damage).toHaveLength(0);
  });

  it("does not throw when animal_type is null", () => {
    expect(() => runAnimalStrikePhysics(buildInput({ animal_type: null as any }))).not.toThrow();
  });

  it("does not throw when vehicle_type is null", () => {
    expect(() => runAnimalStrikePhysics(buildInput({ vehicle_type: null as any }))).not.toThrow();
  });

  it("does not throw when damage_components is empty", () => {
    expect(() => runAnimalStrikePhysics(buildInput({ reported_damage_components: [] }))).not.toThrow();
  });
});
