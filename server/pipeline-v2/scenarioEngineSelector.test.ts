/**
 * scenarioEngineSelector.test.ts
 *
 * Tests for the Scenario Engine Selector.
 * Covers all six primary engines, all extended sub-types,
 * context clue inference, and the hard animal_strike rule.
 */

import { describe, it, expect } from "vitest";
import { selectScenarioEngine } from "./scenarioEngineSelector";

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL STRIKE ENGINE (hard rule — always selected when animal is mentioned)
// ─────────────────────────────────────────────────────────────────────────────

describe("animal_strike_engine — hard rule", () => {
  it("selects animal_strike_engine when incident_type is 'animal_strike'", () => {
    const result = selectScenarioEngine({ incident_type: "animal_strike" });
    expect(result.selected_engine).toBe("animal_strike_engine");
    expect(result.confidence).toBeGreaterThanOrEqual(90);
  });

  it("selects animal_strike_engine when cow is mentioned in damage description", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      damage_description: "Vehicle hit a cow on the highway",
    });
    expect(result.selected_engine).toBe("animal_strike_engine");
  });

  it("selects animal_strike_engine when incident_type is 'collision' but narrative mentions cow", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      driver_narrative: "I was driving at 90km/h when a cow ran out from a ditch",
    });
    expect(result.selected_engine).toBe("animal_strike_engine");
    expect(result.confidence).toBeGreaterThanOrEqual(90);
  });

  it("detects animal_strike_large sub-type for cow", () => {
    const result = selectScenarioEngine({
      incident_type: "animal_strike",
      damage_description: "Struck a large cow",
    });
    expect(result.detected_sub_type).toBe("animal_strike_large");
    expect(result.requires_specialist).toBe(true);
  });

  it("detects animal_strike_medium sub-type for dog", () => {
    const result = selectScenarioEngine({
      incident_type: "animal_strike",
      damage_description: "Hit a dog that ran into the road",
    });
    expect(result.detected_sub_type).toBe("animal_strike_medium");
    expect(result.is_minor_claim).toBe(true);
  });

  it("detects animal_strike_small sub-type for bird", () => {
    const result = selectScenarioEngine({
      incident_type: "animal_strike",
      damage_description: "Large bird flew into windscreen",
    });
    expect(result.detected_sub_type).toBe("animal_strike_small");
  });

  it("defaults to animal_strike_large when no size clue is present", () => {
    const result = selectScenarioEngine({
      incident_type: "animal_strike",
    });
    expect(result.detected_sub_type).toBe("animal_strike_large");
  });

  it("boosts confidence when highway/rural context is present", () => {
    const withHighway = selectScenarioEngine({
      incident_type: "animal_strike",
      context_clues: ["highway"],
    });
    const withoutContext = selectScenarioEngine({
      incident_type: "animal_strike",
      context_clues: ["urban"],
    });
    expect(withHighway.confidence).toBeGreaterThanOrEqual(withoutContext.confidence);
  });

  it("does NOT require police report for animal strike", () => {
    const result = selectScenarioEngine({ incident_type: "animal_strike" });
    expect(result.engine_parameters.expect_police_report).toBe(false);
  });

  it("requires physics reconstruction for animal strike", () => {
    const result = selectScenarioEngine({ incident_type: "animal_strike" });
    expect(result.engine_parameters.apply_physics).toBe(true);
    expect(result.engine_parameters.speed_relevant).toBe(true);
  });

  it("selects animal_strike_engine for horse", () => {
    const result = selectScenarioEngine({
      incident_type: "unknown",
      damage_description: "Horse ran across the road and I hit it",
    });
    expect(result.selected_engine).toBe("animal_strike_engine");
    expect(result.detected_sub_type).toBe("animal_strike_large");
  });

  it("selects animal_strike_engine for kudu (African wildlife)", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      driver_narrative: "A kudu jumped in front of my vehicle",
    });
    expect(result.selected_engine).toBe("animal_strike_engine");
  });

  it("selects animal_strike_engine for goat", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      damage_description: "Hit a goat that was on the road",
    });
    expect(result.selected_engine).toBe("animal_strike_engine");
    expect(result.detected_sub_type).toBe("animal_strike_medium");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WINDSCREEN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("windscreen_engine", () => {
  it("selects windscreen_engine for windscreen crack", () => {
    const result = selectScenarioEngine({
      incident_type: "windscreen",
      damage_description: "Stone chip caused a crack in the windscreen",
    });
    expect(result.selected_engine).toBe("windscreen_engine");
    expect(result.detected_sub_type).toBe("windscreen_crack");
    expect(result.is_minor_claim).toBe(true);
  });

  it("selects windscreen_engine for windscreen shatter", () => {
    const result = selectScenarioEngine({
      incident_type: "windscreen",
      damage_description: "Windscreen completely shattered after impact",
    });
    expect(result.selected_engine).toBe("windscreen_engine");
    expect(result.detected_sub_type).toBe("windscreen_shatter");
  });

  it("selects windscreen_engine when damage description mentions windshield", () => {
    const result = selectScenarioEngine({
      incident_type: "unknown",
      damage_description: "Windshield has a large crack from a stone",
    });
    expect(result.selected_engine).toBe("windscreen_engine");
  });

  it("does NOT require police report for windscreen damage", () => {
    const result = selectScenarioEngine({ incident_type: "windscreen" });
    expect(result.engine_parameters.expect_police_report).toBe(false);
  });

  it("does NOT apply physics for windscreen damage", () => {
    const result = selectScenarioEngine({ incident_type: "windscreen" });
    expect(result.engine_parameters.apply_physics).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COSMETIC DAMAGE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("cosmetic_damage_engine", () => {
  it("selects cosmetic_damage_engine for tree scratch", () => {
    const result = selectScenarioEngine({
      incident_type: "cosmetic",
      damage_description: "Vehicle was scratched by a tree branch in the driveway",
    });
    expect(result.selected_engine).toBe("cosmetic_damage_engine");
    expect(result.detected_sub_type).toBe("paint_scratch_tree");
    expect(result.is_minor_claim).toBe(true);
  });

  it("selects cosmetic_damage_engine for human scratch (keying)", () => {
    const result = selectScenarioEngine({
      incident_type: "cosmetic",
      damage_description: "Vehicle was keyed in the parking lot",
    });
    expect(result.selected_engine).toBe("cosmetic_damage_engine");
    expect(result.detected_sub_type).toBe("paint_scratch_human");
  });

  it("notes possible vandalism for human scratching", () => {
    const result = selectScenarioEngine({
      incident_type: "cosmetic",
      damage_description: "Scratched by person — key marks on door",
    });
    expect(result.reasoning).toContain("vandalism_engine");
  });

  it("selects cosmetic_damage_engine for door ding", () => {
    const result = selectScenarioEngine({
      incident_type: "cosmetic",
      damage_description: "Door ding from adjacent vehicle in parking lot",
    });
    expect(result.selected_engine).toBe("cosmetic_damage_engine");
    expect(result.detected_sub_type).toBe("door_ding");
  });

  it("selects cosmetic_damage_engine for bumper scuff", () => {
    const result = selectScenarioEngine({
      incident_type: "cosmetic",
      damage_description: "Bumper scuff from reversing into a pole",
    });
    expect(result.selected_engine).toBe("cosmetic_damage_engine");
    expect(result.detected_sub_type).toBe("bumper_scuff");
  });

  it("does NOT apply physics for cosmetic damage", () => {
    const result = selectScenarioEngine({ incident_type: "cosmetic" });
    expect(result.engine_parameters.apply_physics).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WEATHER EVENT ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("weather_event_engine", () => {
  it("selects weather_event_engine for hail damage", () => {
    const result = selectScenarioEngine({
      incident_type: "weather",
      damage_description: "Multiple dents from hailstorm",
    });
    expect(result.selected_engine).toBe("weather_event_engine");
    expect(result.detected_sub_type).toBe("hail_damage");
  });

  it("selects weather_event_engine for falling tree", () => {
    const result = selectScenarioEngine({
      incident_type: "weather",
      damage_description: "Tree fell on vehicle during storm",
    });
    expect(result.selected_engine).toBe("weather_event_engine");
    expect(result.detected_sub_type).toBe("falling_tree");
    expect(result.requires_specialist).toBe(true);
  });

  it("selects weather_event_engine for pothole damage", () => {
    const result = selectScenarioEngine({
      incident_type: "weather",
      damage_description: "Hit a pothole and damaged the rim and tyre",
    });
    expect(result.selected_engine).toBe("weather_event_engine");
    expect(result.detected_sub_type).toBe("pothole_damage");
  });

  it("selects flood_engine when flood is mentioned in weather context", () => {
    const result = selectScenarioEngine({
      incident_type: "flood",
      damage_description: "Vehicle was submerged in flash flood",
    });
    expect(result.selected_engine).toBe("flood_engine");
    expect(result.detected_sub_type).toBe("flash_flood");
  });

  it("does NOT require police report for weather events", () => {
    const result = selectScenarioEngine({ incident_type: "weather" });
    expect(result.engine_parameters.expect_police_report).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOOD ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("flood_engine", () => {
  it("selects flood_engine for explicit flood incident type", () => {
    const result = selectScenarioEngine({ incident_type: "flood" });
    expect(result.selected_engine).toBe("flood_engine");
    expect(result.requires_specialist).toBe(true);
  });

  it("selects flood_engine when submerged is mentioned", () => {
    const result = selectScenarioEngine({
      incident_type: "unknown",
      damage_description: "Vehicle was submerged in water",
    });
    expect(result.selected_engine).toBe("flood_engine");
  });

  it("does NOT apply physics for flood damage", () => {
    const result = selectScenarioEngine({ incident_type: "flood" });
    expect(result.engine_parameters.apply_physics).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIRE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("fire_engine", () => {
  it("selects fire_engine for explicit fire incident type", () => {
    const result = selectScenarioEngine({ incident_type: "fire" });
    expect(result.selected_engine).toBe("fire_engine");
    expect(result.requires_specialist).toBe(true);
  });

  it("detects engine_fire sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "fire",
      damage_description: "Engine bay caught fire while driving",
    });
    expect(result.detected_sub_type).toBe("engine_fire");
  });

  it("detects arson sub-type and notes police requirement", () => {
    const result = selectScenarioEngine({
      incident_type: "fire",
      damage_description: "Vehicle was deliberately set alight",
    });
    expect(result.detected_sub_type).toBe("arson");
    expect(result.reasoning).toContain("police report");
  });

  it("detects electrical_fire sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "fire",
      damage_description: "Electrical short circuit caused fire in wiring",
    });
    expect(result.detected_sub_type).toBe("electrical_fire");
  });

  it("requires police report for fire", () => {
    const result = selectScenarioEngine({ incident_type: "fire" });
    expect(result.engine_parameters.expect_police_report).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THEFT ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("theft_engine", () => {
  it("selects theft_engine for explicit theft incident type", () => {
    const result = selectScenarioEngine({ incident_type: "theft" });
    expect(result.selected_engine).toBe("theft_engine");
    expect(result.detected_sub_type).toBe("vehicle_theft");
  });

  it("detects catalytic_converter_theft sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "theft",
      damage_description: "Catalytic converter was stolen overnight",
    });
    expect(result.detected_sub_type).toBe("catalytic_converter_theft");
  });

  it("detects wheel_theft sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "theft",
      damage_description: "All four wheels and tyres were stolen",
    });
    expect(result.detected_sub_type).toBe("wheel_theft");
  });

  it("detects contents_theft sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "theft",
      damage_description: "Laptop and bag stolen from vehicle",
    });
    expect(result.detected_sub_type).toBe("contents_theft");
  });

  it("requires police report for theft", () => {
    const result = selectScenarioEngine({ incident_type: "theft" });
    expect(result.engine_parameters.expect_police_report).toBe(true);
  });

  it("does NOT apply physics for theft", () => {
    const result = selectScenarioEngine({ incident_type: "theft" });
    expect(result.engine_parameters.apply_physics).toBe(false);
  });

  it("selects theft_engine when 'stolen' appears in narrative", () => {
    const result = selectScenarioEngine({
      incident_type: "unknown",
      driver_narrative: "My vehicle was stolen from outside my house",
    });
    expect(result.selected_engine).toBe("theft_engine");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VANDALISM ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("vandalism_engine", () => {
  it("selects vandalism_engine for explicit vandalism incident type", () => {
    const result = selectScenarioEngine({ incident_type: "vandalism" });
    expect(result.selected_engine).toBe("vandalism_engine");
  });

  it("detects keying sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "vandalism",
      damage_description: "Vehicle was keyed along the driver side door",
    });
    expect(result.detected_sub_type).toBe("keying");
    expect(result.is_minor_claim).toBe(true);
  });

  it("detects spray_paint sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "vandalism",
      damage_description: "Graffiti spray paint on bonnet and doors",
    });
    expect(result.detected_sub_type).toBe("spray_paint");
  });

  it("detects smashed_windows sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "vandalism",
      damage_description: "Windows were smashed and contents stolen",
    });
    expect(result.detected_sub_type).toBe("smashed_windows");
  });

  it("requires police report for vandalism", () => {
    const result = selectScenarioEngine({ incident_type: "vandalism" });
    expect(result.engine_parameters.expect_police_report).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE COLLISION ENGINE (only when explicitly confirmed)
// ─────────────────────────────────────────────────────────────────────────────

describe("vehicle_collision_engine", () => {
  it("selects vehicle_collision_engine for explicit collision type", () => {
    const result = selectScenarioEngine({ incident_type: "collision" });
    expect(result.selected_engine).toBe("vehicle_collision_engine");
  });

  it("detects rear_end_collision sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      damage_description: "Was rear ended by another vehicle at a traffic light",
    });
    expect(result.detected_sub_type).toBe("rear_end_collision");
  });

  it("detects head_on_collision sub-type", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      damage_description: "Head on collision with oncoming vehicle",
    });
    expect(result.detected_sub_type).toBe("head_on_collision");
  });

  it("requires police report for vehicle collision", () => {
    const result = selectScenarioEngine({ incident_type: "collision" });
    expect(result.engine_parameters.expect_police_report).toBe(true);
  });

  it("applies physics for vehicle collision", () => {
    const result = selectScenarioEngine({ incident_type: "collision" });
    expect(result.engine_parameters.apply_physics).toBe(true);
    expect(result.engine_parameters.third_party_involved).toBe(true);
  });

  it("marks as requires_specialist when highway context is present", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      context_clues: ["highway"],
    });
    expect(result.requires_specialist).toBe(true);
  });

  it("does NOT select vehicle_collision_engine when cow is mentioned", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",
      damage_description: "Hit a cow on the national road",
    });
    expect(result.selected_engine).toBe("animal_strike_engine");
    expect(result.selected_engine).not.toBe("vehicle_collision_engine");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UNKNOWN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

describe("unknown_engine", () => {
  it("selects unknown_engine for unrecognised incident type", () => {
    const result = selectScenarioEngine({ incident_type: "unknown" });
    expect(result.selected_engine).toBe("unknown_engine");
    expect(result.confidence).toBeLessThan(50);
  });

  it("returns low confidence for unknown engine", () => {
    const result = selectScenarioEngine({ incident_type: "mystery_event" });
    expect(result.confidence).toBeLessThan(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT CLUE INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

describe("context clue inference from text", () => {
  it("infers highway context from narrative", () => {
    const result = selectScenarioEngine({
      incident_type: "animal_strike",
      driver_narrative: "I was driving on the N1 highway at night",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(97);
  });

  it("infers rural context from narrative", () => {
    const result = selectScenarioEngine({
      incident_type: "animal_strike",
      driver_narrative: "Driving on a gravel road near a farm",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(93);
  });

  it("infers parking context from narrative", () => {
    const result = selectScenarioEngine({
      incident_type: "cosmetic",
      driver_narrative: "Found scratch on vehicle in the parking lot",
    });
    expect(result.selected_engine).toBe("cosmetic_damage_engine");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAZDA AUDIT SCENARIO (regression test)
// ─────────────────────────────────────────────────────────────────────────────

describe("Mazda BT-50 audit regression", () => {
  it("correctly routes the Mazda cow strike to animal_strike_engine despite claim form saying collision", () => {
    const result = selectScenarioEngine({
      incident_type: "collision",          // what the claim form said
      damage_description: "Bonnet folded back, bull bar damaged, radiator destroyed",
      driver_narrative: "I was travelling at 90km/h when a cow appeared from a ditch on the side of the road",
      context_clues: ["rural", "highway"],
    });
    expect(result.selected_engine).toBe("animal_strike_engine");
    expect(result.detected_sub_type).toBe("animal_strike_large");
    expect(result.confidence).toBeGreaterThanOrEqual(95);
    expect(result.engine_parameters.expect_police_report).toBe(false);
    expect(result.engine_parameters.apply_physics).toBe(true);
  });
});
