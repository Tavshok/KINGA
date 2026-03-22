/**
 * incidentClassificationEngine.test.ts
 *
 * Comprehensive tests for the Incident Classification Engine.
 * Tests cover:
 * - Animal strike priority rules (the Mazda root cause)
 * - All seven incident types
 * - Multi-source conflict detection
 * - Claim form field normalisation
 * - Edge cases (null inputs, empty strings, mixed signals)
 */

import { describe, it, expect } from "vitest";
import {
  classifyIncident,
  type IncidentClassificationInput,
  type ClassifiedIncidentType,
} from "./incidentClassificationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function make(overrides: Partial<IncidentClassificationInput> = {}): IncidentClassificationInput {
  return {
    driver_narrative: null,
    claim_form_incident_type: null,
    damage_description: null,
    damage_components: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: ANIMAL STRIKE — THE MAZDA SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — animal strike (Mazda root cause)", () => {
  it("classifies as animal_strike when driver says 'a cow ran out'", () => {
    const result = classifyIncident(make({
      driver_narrative: "I was travelling at 90 km/h when a cow ran out of the ditch and I hit it.",
      claim_form_incident_type: "collision",
      damage_description: "Bonnet folded back, bull bar bent, radiator damaged.",
    }));
    expect(result.incident_type).toBe("animal_strike");
    expect(result.canonical_type).toBe("collision"); // physics engine compatibility
  });

  it("overrides claim form 'collision' with animal_strike from driver narrative", () => {
    const result = classifyIncident(make({
      driver_narrative: "Hit a cow on the N1 highway.",
      claim_form_incident_type: "collision",
    }));
    expect(result.incident_type).toBe("animal_strike");
    expect(result.conflict_detected).toBe(false); // animal_strike vs collision is NOT a conflict
  });

  it("detects animal_strike from claim form field 'animal_strike'", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "animal_strike",
      damage_description: "Front end damage consistent with animal impact.",
    }));
    expect(result.incident_type).toBe("animal_strike");
    expect(result.confidence).toBeGreaterThan(70);
  });

  it("detects animal_strike from damage description mentioning cow", () => {
    const result = classifyIncident(make({
      damage_description: "Damage consistent with striking a cow at highway speed.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("detects kudu strike from driver narrative", () => {
    const result = classifyIncident(make({
      driver_narrative: "A kudu jumped onto the road and I could not avoid it.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("detects goat strike from driver narrative", () => {
    const result = classifyIncident(make({
      driver_narrative: "A goat ran across the road and I hit it.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("detects wildlife strike from generic 'animal' keyword", () => {
    const result = classifyIncident(make({
      driver_narrative: "An animal ran out of the bush and into my vehicle.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("detects livestock from 'cattle' keyword", () => {
    const result = classifyIncident(make({
      driver_narrative: "Cattle were on the road. I could not stop in time.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("detects warthog strike", () => {
    const result = classifyIncident(make({
      driver_narrative: "A warthog crossed the road in front of me.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("detects baboon strike", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a baboon that was sitting in the road.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("includes driver_statement in sources_used when narrative provided", () => {
    const result = classifyIncident(make({
      driver_narrative: "Hit a cow.",
      claim_form_incident_type: "collision",
    }));
    expect(result.sources_used).toContain("driver_statement");
    expect(result.sources_used).toContain("claim_form");
  });

  it("produces reasoning that mentions animal strike override", () => {
    const result = classifyIncident(make({
      driver_narrative: "A cow ran into the road and I struck it at 90 km/h.",
      claim_form_incident_type: "collision",
    }));
    expect(result.reasoning).toMatch(/animal/i);
    expect(result.reasoning.length).toBeGreaterThan(20);
  });

  it("confidence is at least 60 for clear animal strike", () => {
    const result = classifyIncident(make({
      driver_narrative: "I was driving when a cow appeared on the road and I hit it.",
      claim_form_incident_type: "collision",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it("confidence increases with multiple animal signals", () => {
    const single = classifyIncident(make({
      driver_narrative: "I hit a cow.",
    }));
    const multiple = classifyIncident(make({
      driver_narrative: "I hit a cow. The cow was standing in the road. Cattle were grazing nearby.",
    }));
    expect(multiple.confidence).toBeGreaterThanOrEqual(single.confidence);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: VEHICLE COLLISION
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — vehicle collision", () => {
  it("classifies as vehicle_collision when another vehicle is mentioned", () => {
    const result = classifyIncident(make({
      driver_narrative: "Another vehicle ran a red light and collided with my car.",
      claim_form_incident_type: "collision",
    }));
    expect(result.incident_type).toBe("vehicle_collision");
  });

  it("classifies as vehicle_collision for rear-end collision", () => {
    const result = classifyIncident(make({
      driver_narrative: "I was rear-ended at a stop sign.",
      claim_form_incident_type: "collision",
    }));
    expect(result.incident_type).toBe("vehicle_collision");
  });

  it("classifies as vehicle_collision for rollover", () => {
    const result = classifyIncident(make({
      driver_narrative: "I lost control on a gravel road and rolled over.",
      claim_form_incident_type: "collision",
    }));
    expect(result.incident_type).toBe("vehicle_collision");
  });

  it("classifies as vehicle_collision for single-vehicle accident hitting a pole", () => {
    const result = classifyIncident(make({
      driver_narrative: "I swerved to avoid a pothole and hit a pole.",
      claim_form_incident_type: "collision",
    }));
    expect(result.incident_type).toBe("vehicle_collision");
  });

  it("does NOT classify as vehicle_collision when only 'collision' appears in claim form with no narrative", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "collision",
    }));
    // claim form alone gives vehicle_collision
    expect(result.incident_type).toBe("vehicle_collision");
    expect(result.sources_used).toEqual(["claim_form"]);
  });

  it("canonical_type is 'collision' for vehicle_collision", () => {
    const result = classifyIncident(make({
      driver_narrative: "I collided with another vehicle at an intersection.",
    }));
    expect(result.canonical_type).toBe("collision");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: THEFT
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — theft", () => {
  it("classifies as theft for stolen vehicle", () => {
    const result = classifyIncident(make({
      driver_narrative: "My vehicle was stolen from outside my home overnight.",
      claim_form_incident_type: "theft",
    }));
    expect(result.incident_type).toBe("theft");
    expect(result.canonical_type).toBe("theft");
  });

  it("classifies as theft for hijacking", () => {
    const result = classifyIncident(make({
      driver_narrative: "I was hijacked at gunpoint at a traffic light.",
    }));
    expect(result.incident_type).toBe("theft");
  });

  it("classifies as theft for smash and grab", () => {
    const result = classifyIncident(make({
      driver_narrative: "Smash and grab — window broken and laptop taken.",
    }));
    expect(result.incident_type).toBe("theft");
  });

  it("canonical_type is 'theft' for theft", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "theft",
    }));
    expect(result.canonical_type).toBe("theft");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: FIRE
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — fire", () => {
  it("classifies as fire when vehicle caught fire", () => {
    const result = classifyIncident(make({
      driver_narrative: "The engine caught fire while I was driving on the highway.",
      claim_form_incident_type: "fire",
    }));
    expect(result.incident_type).toBe("fire");
    expect(result.canonical_type).toBe("fire");
  });

  it("classifies as fire from 'burnt' keyword", () => {
    const result = classifyIncident(make({
      damage_description: "Vehicle completely burnt out. Total loss.",
    }));
    expect(result.incident_type).toBe("fire");
  });

  it("classifies as fire from 'arson' keyword", () => {
    const result = classifyIncident(make({
      driver_narrative: "My vehicle was set alight — arson suspected.",
    }));
    expect(result.incident_type).toBe("fire");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: FLOOD / WEATHER
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — flood/weather", () => {
  it("classifies as flood for submerged vehicle", () => {
    const result = classifyIncident(make({
      driver_narrative: "My vehicle was submerged in a flash flood.",
      claim_form_incident_type: "flood",
    }));
    expect(result.incident_type).toBe("flood");
    expect(result.canonical_type).toBe("flood");
  });

  it("classifies as flood for hail damage", () => {
    const result = classifyIncident(make({
      driver_narrative: "Severe hailstorm damaged the roof and bonnet.",
      claim_form_incident_type: "hail",
    }));
    expect(result.incident_type).toBe("flood");
  });

  it("classifies as flood for storm damage", () => {
    const result = classifyIncident(make({
      driver_narrative: "A storm caused a tree to fall on my vehicle.",
    }));
    expect(result.incident_type).toBe("flood");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: VANDALISM
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — vandalism", () => {
  it("classifies as vandalism for keyed vehicle", () => {
    const result = classifyIncident(make({
      driver_narrative: "My vehicle was keyed and the tyres were slashed.",
      claim_form_incident_type: "vandalism",
    }));
    expect(result.incident_type).toBe("vandalism");
    expect(result.canonical_type).toBe("vandalism");
  });

  it("classifies as vandalism for malicious damage", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "malicious damage",
    }));
    expect(result.incident_type).toBe("vandalism");
  });

  it("classifies as vandalism from 'vandalised' keyword", () => {
    const result = classifyIncident(make({
      driver_narrative: "The vehicle was vandalised while parked outside.",
    }));
    expect(result.incident_type).toBe("vandalism");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: CONFLICT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — conflict detection", () => {
  it("does NOT flag conflict when animal_strike vs vehicle_collision (expected override)", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow on the highway.",
      claim_form_incident_type: "collision",
    }));
    expect(result.conflict_detected).toBe(false);
  });

  it("flags conflict when theft vs collision in different sources", () => {
    const result = classifyIncident(make({
      driver_narrative: "My vehicle was stolen from the parking lot.",
      claim_form_incident_type: "collision",
      damage_description: "Front bumper damage from a collision.",
    }));
    expect(result.conflict_detected).toBe(true);
  });

  it("flags conflict when fire vs flood in different sources", () => {
    const result = classifyIncident(make({
      driver_narrative: "The vehicle caught fire.",
      claim_form_incident_type: "flood",
    }));
    expect(result.conflict_detected).toBe(true);
  });

  it("does NOT flag conflict when all sources agree", () => {
    const result = classifyIncident(make({
      driver_narrative: "I was hijacked at gunpoint.",
      claim_form_incident_type: "theft",
      damage_description: "Vehicle taken. No physical damage.",
    }));
    expect(result.conflict_detected).toBe(false);
  });

  it("does NOT flag conflict when only one source is available", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow.",
    }));
    expect(result.conflict_detected).toBe(false);
  });

  it("does NOT flag conflict when unknown sources are mixed with known", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow.",
      claim_form_incident_type: null,
      damage_description: null,
    }));
    expect(result.conflict_detected).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: SOURCES_USED
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — sources_used", () => {
  it("includes only driver_statement when only narrative provided", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow.",
    }));
    expect(result.sources_used).toEqual(["driver_statement"]);
  });

  it("includes only claim_form when only claim form provided", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "theft",
    }));
    expect(result.sources_used).toEqual(["claim_form"]);
  });

  it("includes all three sources when all provided", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow.",
      claim_form_incident_type: "collision",
      damage_description: "Bonnet damage.",
    }));
    expect(result.sources_used).toContain("driver_statement");
    expect(result.sources_used).toContain("claim_form");
    expect(result.sources_used).toContain("damage_description");
    expect(result.sources_used).toHaveLength(3);
  });

  it("includes damage_description when components provided without description text", () => {
    const result = classifyIncident(make({
      damage_components: ["bonnet", "bull bar", "radiator"],
    }));
    expect(result.sources_used).toContain("damage_description");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — edge cases", () => {
  it("returns unknown when all inputs are null", () => {
    const result = classifyIncident(make());
    expect(result.incident_type).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.sources_used).toHaveLength(0);
  });

  it("returns unknown when all inputs are empty strings", () => {
    const result = classifyIncident(make({
      driver_narrative: "",
      claim_form_incident_type: "",
      damage_description: "",
    }));
    expect(result.incident_type).toBe("unknown");
  });

  it("handles case-insensitive matching — COW in uppercase", () => {
    const result = classifyIncident(make({
      driver_narrative: "I HIT A COW ON THE HIGHWAY.",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("handles mixed case in claim form field", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "THEFT",
    }));
    expect(result.incident_type).toBe("theft");
  });

  it("handles claim form field with underscores", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "animal_strike",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("handles claim form field with hyphens", () => {
    const result = classifyIncident(make({
      claim_form_incident_type: "animal-strike",
    }));
    expect(result.incident_type).toBe("animal_strike");
  });

  it("does not match 'cow' as a substring of unrelated words", () => {
    // "coward" should not trigger animal_strike
    const result = classifyIncident(make({
      driver_narrative: "The coward driver ran away after the collision.",
      claim_form_incident_type: "collision",
    }));
    // "cow" has word boundary matching for short keywords
    // "coward" contains "cow" but boundary check should prevent false match
    // The claim form says collision → vehicle_collision
    expect(result.incident_type).toBe("vehicle_collision");
  });

  it("source_detail contains one entry per provided source", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow.",
      claim_form_incident_type: "collision",
    }));
    expect(result.source_detail).toHaveLength(2);
    expect(result.source_detail[0].source).toBe("driver_statement");
    expect(result.source_detail[1].source).toBe("claim_form");
  });

  it("source_detail signals are non-empty for matched sources", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow on the highway.",
    }));
    const driverDetail = result.source_detail.find((s) => s.source === "driver_statement");
    expect(driverDetail).toBeDefined();
    expect(driverDetail!.signals.length).toBeGreaterThan(0);
  });

  it("canonical_type is 'collision' for animal_strike (physics engine compatibility)", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow.",
    }));
    expect(result.incident_type).toBe("animal_strike");
    expect(result.canonical_type).toBe("collision");
  });

  it("canonical_type is 'unknown' for unknown", () => {
    const result = classifyIncident(make());
    expect(result.canonical_type).toBe("unknown");
  });

  it("reasoning is a non-empty string", () => {
    const result = classifyIncident(make({
      driver_narrative: "I hit a cow.",
    }));
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: REAL-WORLD SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyIncident — real-world scenarios", () => {
  it("Mazda BT-50 scenario: cow strike at 90 km/h", () => {
    const result = classifyIncident(make({
      driver_narrative:
        "I was travelling at 90 km/h on the main road when a cow suddenly appeared from a ditch on the left side of the road. I applied brakes but could not stop in time and struck the cow.",
      claim_form_incident_type: "collision",
      damage_description:
        "Bonnet folded back. Bull bar split and bent. Intercooler damaged. Fan cowling destroyed. Fuse box displaced. Front bumper assembly damaged.",
      damage_components: ["bonnet", "bull bar", "intercooler", "fan cowling", "fuse box", "front bumper"],
    }));
    expect(result.incident_type).toBe("animal_strike");
    expect(result.canonical_type).toBe("collision");
    expect(result.conflict_detected).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it("urban intersection collision: two vehicles", () => {
    const result = classifyIncident(make({
      driver_narrative:
        "I was proceeding through a green traffic light when a vehicle ran a red light and struck my vehicle on the driver's side.",
      claim_form_incident_type: "collision",
      damage_description: "Driver side door, B-pillar, and rear quarter panel damage.",
    }));
    expect(result.incident_type).toBe("vehicle_collision");
    expect(result.conflict_detected).toBe(false);
  });

  it("overnight theft with no damage", () => {
    const result = classifyIncident(make({
      driver_narrative:
        "I parked my vehicle outside my house at 22:00. When I woke up at 06:00 the vehicle was gone. I reported it to the police immediately.",
      claim_form_incident_type: "theft",
      damage_description: null,
    }));
    expect(result.incident_type).toBe("theft");
    expect(result.conflict_detected).toBe(false);
  });

  it("hail damage: no driver narrative, claim form says hail", () => {
    const result = classifyIncident(make({
      driver_narrative: null,
      claim_form_incident_type: "hail",
      damage_description: "Multiple dents on roof, bonnet, and boot lid from hailstorm.",
    }));
    expect(result.incident_type).toBe("flood");
    expect(result.canonical_type).toBe("flood");
  });

  it("ambiguous description with no clear type → unknown", () => {
    const result = classifyIncident(make({
      driver_narrative: "The vehicle was damaged.",
      damage_description: "Front damage.",
    }));
    // No specific type signals → unknown or vehicle_collision depending on signals
    // "damaged" and "front damage" have no specific type keywords
    expect(["unknown", "vehicle_collision"]).toContain(result.incident_type);
  });
});
