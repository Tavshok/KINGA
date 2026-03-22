/**
 * fieldValidationEngine.test.ts
 *
 * Comprehensive tests for the Field Validation Engine.
 * Covers source priority, conflict detection, animal strike override,
 * speed extraction from narrative text, and the Mazda audit scenario.
 */

import { describe, it, expect } from "vitest";
import {
  validateFields,
  extractSpeedFromText,
  type FieldValidationInput,
} from "./fieldValidationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// extractSpeedFromText
// ─────────────────────────────────────────────────────────────────────────────

describe("extractSpeedFromText", () => {
  it("extracts explicit km/h pattern", () => {
    expect(extractSpeedFromText("I was travelling at 90 km/h")).toBe(90);
  });

  it("extracts compact km/h pattern", () => {
    expect(extractSpeedFromText("speed was 120km/h")).toBe(120);
  });

  it("extracts kph pattern", () => {
    expect(extractSpeedFromText("doing 60 kph")).toBe(60);
  });

  it("extracts kmph pattern", () => {
    expect(extractSpeedFromText("travelling at 80kmph")).toBe(80);
  });

  it("extracts 'travelling at N' pattern", () => {
    expect(extractSpeedFromText("I was travelling at 90 when the cow appeared")).toBe(90);
  });

  it("extracts 'speed of N' pattern", () => {
    expect(extractSpeedFromText("at a speed of 100 km/h")).toBe(100);
  });

  it("extracts 'doing N' pattern", () => {
    expect(extractSpeedFromText("I was doing 70 at the time")).toBe(70);
  });

  it("extracts from the Mazda claim form text", () => {
    const text = "I was travelling at 90 km/h when a cow appeared from a ditch on the left side of the road";
    expect(extractSpeedFromText(text)).toBe(90);
  });

  it("returns null for text with no speed", () => {
    expect(extractSpeedFromText("The car was damaged in the accident")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractSpeedFromText(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractSpeedFromText("")).toBeNull();
  });

  it("rejects implausible speed (>200 km/h)", () => {
    expect(extractSpeedFromText("going at 250 km/h")).toBeNull();
  });

  it("rejects zero speed", () => {
    expect(extractSpeedFromText("speed was 0 km/h")).toBeNull();
  });

  it("extracts speed from multi-sentence narrative", () => {
    const text = "I left home at 6am. The road was clear. I was travelling at 90 km/h. A cow appeared suddenly.";
    expect(extractSpeedFromText(text)).toBe(90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateFields — speed_kmh
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFields — speed_kmh", () => {
  it("prefers claim_form over all other sources", () => {
    const result = validateFields({
      speed_claim_form: 90,
      speed_assessor: 80,
      speed_narrative: 85,
      speed_ocr: 88,
      speed_inferred: 17,
    });
    expect(result.validated_fields.speed_kmh.value).toBe(90);
    expect(result.validated_fields.speed_kmh.source).toBe("claim_form");
    expect(result.validated_fields.speed_kmh.confidence).toBe(95);
  });

  it("falls back to assessor when claim_form is absent", () => {
    const result = validateFields({
      speed_assessor: 80,
      speed_narrative: 85,
      speed_inferred: 17,
    });
    expect(result.validated_fields.speed_kmh.value).toBe(80);
    expect(result.validated_fields.speed_kmh.source).toBe("assessor");
  });

  it("falls back to narrative when claim_form and assessor are absent", () => {
    const result = validateFields({
      speed_narrative: 85,
      speed_inferred: 17,
    });
    expect(result.validated_fields.speed_kmh.value).toBe(85);
    expect(result.validated_fields.speed_kmh.source).toBe("narrative");
  });

  it("falls back to ocr when only ocr and inferred are available", () => {
    const result = validateFields({
      speed_ocr: 88,
      speed_inferred: 17,
    });
    expect(result.validated_fields.speed_kmh.value).toBe(88);
    expect(result.validated_fields.speed_kmh.source).toBe("ocr");
  });

  it("uses inferred only when no other source is available", () => {
    const result = validateFields({
      speed_inferred: 17,
    });
    expect(result.validated_fields.speed_kmh.value).toBe(17);
    expect(result.validated_fields.speed_kmh.source).toBe("inferred");
    expect(result.validated_fields.speed_kmh.confidence).toBe(40);
  });

  it("returns null value when no speed is available", () => {
    const result = validateFields({});
    expect(result.validated_fields.speed_kmh.value).toBeNull();
    expect(result.validated_fields.speed_kmh.confidence).toBe(0);
  });

  it("extracts speed from narrative_text when speed_narrative is not provided", () => {
    const result = validateFields({
      narrative_text: "I was travelling at 90 km/h when the cow appeared",
      speed_inferred: 17,
    });
    expect(result.validated_fields.speed_kmh.value).toBe(90);
    expect(result.validated_fields.speed_kmh.source).toBe("narrative");
  });

  it("MAZDA SCENARIO: claim_form 90 km/h overrides AI inferred 17 km/h", () => {
    const result = validateFields({
      speed_claim_form: 90,
      speed_inferred: 17,
      narrative_text: "I was travelling at 90 km/h when a cow appeared from a ditch",
    });
    expect(result.validated_fields.speed_kmh.value).toBe(90);
    expect(result.validated_fields.speed_kmh.source).toBe("claim_form");
    // Conflict should be flagged
    const speedConflict = result.conflicts.find((c) => c.field === "speed_kmh");
    expect(speedConflict).toBeDefined();
    expect(speedConflict?.resolution).toContain("Stated value retained");
    expect(speedConflict?.resolution).toContain("AI estimate discarded");
  });

  it("flags conflict when inferred speed differs by >20% from stated", () => {
    const result = validateFields({
      speed_claim_form: 90,
      speed_inferred: 50, // 44% deviation
    });
    const conflict = result.conflicts.find((c) => c.field === "speed_kmh");
    expect(conflict).toBeDefined();
    expect(conflict?.values).toContainEqual({ source: "claim_form", value: 90 });
    expect(conflict?.values).toContainEqual({ source: "inferred", value: 50 });
  });

  it("does NOT flag conflict when inferred speed is within 20% of stated", () => {
    const result = validateFields({
      speed_claim_form: 90,
      speed_inferred: 85, // 5.5% deviation — within threshold
    });
    const conflict = result.conflicts.find((c) => c.field === "speed_kmh");
    expect(conflict).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateFields — incident_type
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFields — incident_type", () => {
  it("prefers claim_form over all other sources", () => {
    const result = validateFields({
      incident_type_claim_form: "animal_strike",
      incident_type_inferred: "vehicle_collision",
    });
    expect(result.validated_fields.incident_type.value).toBe("animal_strike");
    expect(result.validated_fields.incident_type.source).toBe("claim_form");
  });

  it("normalises incident type aliases", () => {
    const result = validateFields({
      incident_type_claim_form: "collision",
    });
    expect(result.validated_fields.incident_type.value).toBe("vehicle_collision");
  });

  it("normalises animal strike aliases", () => {
    const result = validateFields({
      incident_type_narrative: "animal",
    });
    expect(result.validated_fields.incident_type.value).toBe("animal_strike");
  });

  it("MAZDA SCENARIO: animal_strike stated overrides vehicle_collision inferred", () => {
    const result = validateFields({
      incident_type_narrative: "animal_strike",
      incident_type_inferred: "vehicle_collision",
    });
    expect(result.validated_fields.incident_type.value).toBe("animal_strike");
    expect(result.validated_fields.incident_type.source).toBe("narrative");
    const conflict = result.conflicts.find((c) => c.field === "incident_type");
    expect(conflict).toBeDefined();
    expect(conflict?.resolution).toContain("Animal strike stated");
    expect(conflict?.resolution).toContain("overrides AI inference");
  });

  it("MAZDA SCENARIO: claim_form animal_strike overrides inferred collision", () => {
    const result = validateFields({
      incident_type_claim_form: "animal_strike",
      incident_type_inferred: "collision",
    });
    expect(result.validated_fields.incident_type.value).toBe("animal_strike");
    expect(result.validated_fields.incident_type.source).toBe("claim_form");
  });

  it("falls back to assessor when claim_form is absent", () => {
    const result = validateFields({
      incident_type_assessor: "animal_strike",
      incident_type_inferred: "vehicle_collision",
    });
    expect(result.validated_fields.incident_type.value).toBe("animal_strike");
    expect(result.validated_fields.incident_type.source).toBe("assessor");
  });

  it("flags conflict when stated and inferred incident types differ", () => {
    const result = validateFields({
      incident_type_claim_form: "theft",
      incident_type_inferred: "vehicle_collision",
    });
    const conflict = result.conflicts.find((c) => c.field === "incident_type");
    expect(conflict).toBeDefined();
    expect(conflict?.resolution).toContain("Stated value retained");
  });

  it("does NOT flag conflict when stated and inferred agree", () => {
    const result = validateFields({
      incident_type_claim_form: "vehicle_collision",
      incident_type_inferred: "collision", // normalises to vehicle_collision
    });
    const conflict = result.conflicts.find((c) => c.field === "incident_type");
    expect(conflict).toBeUndefined();
  });

  it("returns null when no incident type is available", () => {
    const result = validateFields({});
    expect(result.validated_fields.incident_type.value).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateFields — repair_cost
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFields — repair_cost", () => {
  it("prefers claim_form over all other sources", () => {
    const result = validateFields({
      repair_cost_claim_form: 4774,
      repair_cost_inferred: 47.74, // Mazda decimal error
    });
    expect(result.validated_fields.repair_cost.value).toBe(4774);
    expect(result.validated_fields.repair_cost.source).toBe("claim_form");
  });

  it("MAZDA SCENARIO: claim_form 4774 overrides inferred 47.74 (decimal error)", () => {
    const result = validateFields({
      repair_cost_claim_form: 4774,
      repair_cost_inferred: 47.74,
    });
    expect(result.validated_fields.repair_cost.value).toBe(4774);
    const conflict = result.conflicts.find((c) => c.field === "repair_cost");
    expect(conflict).toBeDefined();
    expect(conflict?.resolution).toContain("Stated value retained");
  });

  it("falls back to assessor when claim_form is absent", () => {
    const result = validateFields({
      repair_cost_assessor: 4500,
      repair_cost_inferred: 3000,
    });
    expect(result.validated_fields.repair_cost.value).toBe(4500);
    expect(result.validated_fields.repair_cost.source).toBe("assessor");
  });

  it("flags conflict when inferred cost differs by >25% from stated", () => {
    const result = validateFields({
      repair_cost_claim_form: 4000,
      repair_cost_inferred: 2000, // 50% deviation
    });
    const conflict = result.conflicts.find((c) => c.field === "repair_cost");
    expect(conflict).toBeDefined();
  });

  it("does NOT flag conflict when inferred cost is within 25% of stated", () => {
    const result = validateFields({
      repair_cost_claim_form: 4000,
      repair_cost_inferred: 3800, // 5% deviation
    });
    const conflict = result.conflicts.find((c) => c.field === "repair_cost");
    expect(conflict).toBeUndefined();
  });

  it("returns null when no repair cost is available", () => {
    const result = validateFields({});
    expect(result.validated_fields.repair_cost.value).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateFields — market_value
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFields — market_value", () => {
  it("prefers claim_form over all other sources", () => {
    const result = validateFields({
      market_value_claim_form: 12000,
      market_value_inferred: 8000,
    });
    expect(result.validated_fields.market_value.value).toBe(12000);
    expect(result.validated_fields.market_value.source).toBe("claim_form");
  });

  it("falls back to assessor when claim_form is absent", () => {
    const result = validateFields({
      market_value_assessor: 11000,
      market_value_inferred: 8000,
    });
    expect(result.validated_fields.market_value.value).toBe(11000);
    expect(result.validated_fields.market_value.source).toBe("assessor");
  });

  it("flags conflict when inferred market value differs by >25% from stated", () => {
    const result = validateFields({
      market_value_claim_form: 12000,
      market_value_inferred: 6000, // 50% deviation
    });
    const conflict = result.conflicts.find((c) => c.field === "market_value");
    expect(conflict).toBeDefined();
    expect(conflict?.resolution).toContain("Stated value retained");
  });

  it("returns null when no market value is available", () => {
    const result = validateFields({});
    expect(result.validated_fields.market_value.value).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full output contract validation
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFields — output contract", () => {
  it("returns the exact JSON contract shape", () => {
    const result = validateFields({
      speed_claim_form: 90,
      incident_type_claim_form: "animal_strike",
      repair_cost_assessor: 4774,
      market_value_assessor: 12000,
    });

    // validated_fields
    expect(result.validated_fields).toHaveProperty("speed_kmh");
    expect(result.validated_fields).toHaveProperty("incident_type");
    expect(result.validated_fields).toHaveProperty("repair_cost");
    expect(result.validated_fields).toHaveProperty("market_value");

    // Each field has value, source, confidence
    expect(result.validated_fields.speed_kmh).toHaveProperty("value");
    expect(result.validated_fields.speed_kmh).toHaveProperty("source");
    expect(result.validated_fields.speed_kmh).toHaveProperty("confidence");

    // conflicts is an array
    expect(Array.isArray(result.conflicts)).toBe(true);
  });

  it("conflict entries have field, values, resolution", () => {
    const result = validateFields({
      speed_claim_form: 90,
      speed_inferred: 17,
    });
    const conflict = result.conflicts[0];
    expect(conflict).toHaveProperty("field");
    expect(conflict).toHaveProperty("values");
    expect(conflict).toHaveProperty("resolution");
    expect(Array.isArray(conflict.values)).toBe(true);
  });

  it("no conflicts when all sources agree", () => {
    const result = validateFields({
      speed_claim_form: 90,
      speed_assessor: 90,
      speed_inferred: 88, // within 20%
    });
    expect(result.conflicts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAZDA FULL SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("MAZDA FULL SCENARIO", () => {
  it("correctly resolves all four fields for the Mazda BT-50 claim", () => {
    const result = validateFields({
      // Speed: claim form says 90, AI inferred 17
      speed_claim_form: 90,
      speed_inferred: 17,
      narrative_text: "I was travelling at 90 km/h when a cow appeared from a ditch on the left side of the road",

      // Incident type: claim form says animal_strike, AI inferred collision
      incident_type_claim_form: "animal_strike",
      incident_type_inferred: "collision",

      // Repair cost: assessor agreed 4774, AI inferred 47.74 (decimal error)
      repair_cost_assessor: 4774,
      repair_cost_inferred: 47.74,

      // Market value: not on this claim document
      market_value_assessor: null,
      market_value_inferred: 12000,
    });

    // Speed: claim_form wins
    expect(result.validated_fields.speed_kmh.value).toBe(90);
    expect(result.validated_fields.speed_kmh.source).toBe("claim_form");

    // Incident type: claim_form animal_strike wins
    expect(result.validated_fields.incident_type.value).toBe("animal_strike");
    expect(result.validated_fields.incident_type.source).toBe("claim_form");

    // Repair cost: assessor wins
    expect(result.validated_fields.repair_cost.value).toBe(4774);
    expect(result.validated_fields.repair_cost.source).toBe("assessor");

    // Market value: inferred (only source)
    expect(result.validated_fields.market_value.value).toBe(12000);
    expect(result.validated_fields.market_value.source).toBe("inferred");
    expect(result.validated_fields.market_value.confidence).toBe(40);

    // Conflicts: speed and incident_type should be flagged; repair_cost also
    const speedConflict = result.conflicts.find((c) => c.field === "speed_kmh");
    const incidentConflict = result.conflicts.find((c) => c.field === "incident_type");
    const repairConflict = result.conflicts.find((c) => c.field === "repair_cost");

    expect(speedConflict).toBeDefined();
    expect(incidentConflict).toBeDefined();
    expect(repairConflict).toBeDefined();

    // All resolutions state the stated value was retained
    expect(speedConflict?.resolution).toContain("Stated value retained");
    expect(incidentConflict?.resolution).toContain("Animal strike");
    expect(repairConflict?.resolution).toContain("Stated value retained");
  });
});
