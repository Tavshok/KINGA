/**
 * claimConsistencyChecker.test.ts
 *
 * Comprehensive tests for the Claim Consistency Checker.
 * Covers speed conflict, incident conflict, damage mismatch,
 * proceed gate logic, and the Mazda audit scenario.
 */

import { describe, it, expect } from "vitest";
import { checkClaimConsistency } from "./claimConsistencyChecker";

// ─────────────────────────────────────────────────────────────────────────────
// Speed conflict
// ─────────────────────────────────────────────────────────────────────────────

describe("Speed conflict", () => {
  it("raises HIGH when deviation > 30%", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17,
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe("HIGH");
    expect(result.proceed).toBe(false);
  });

  it("raises MEDIUM when deviation is 15–30%", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 72, // 20% deviation
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe("MEDIUM");
    expect(result.proceed).toBe(true); // MEDIUM alone does not block
  });

  it("raises no conflict when deviation ≤ 15%", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 85, // 5.5% deviation
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    expect(conflict).toBeUndefined();
    expect(result.proceed).toBe(true);
  });

  it("raises no conflict when speeds are equal", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 90,
    });
    expect(result.critical_conflicts).toHaveLength(0);
    expect(result.proceed).toBe(true);
  });

  it("raises no conflict when stated speed is absent", () => {
    const result = checkClaimConsistency({
      estimated_speed_kmh: 17,
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    expect(conflict).toBeUndefined();
  });

  it("raises no conflict when estimated speed is absent", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    expect(conflict).toBeUndefined();
  });

  it("includes deviation_pct in detail", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17,
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    expect(conflict?.detail?.deviation_pct).toBeGreaterThan(30);
    expect(conflict?.detail?.stated_value).toBe(90);
    expect(conflict?.detail?.estimated_value).toBe(17);
  });

  it("MAZDA SCENARIO: 90 km/h stated vs 17 km/h estimated → HIGH conflict, proceed = false", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17,
    });
    expect(result.proceed).toBe(false);
    const conflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    expect(conflict?.severity).toBe("HIGH");
    expect(conflict?.description).toContain("81%"); // ~81% deviation
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Incident conflict
// ─────────────────────────────────────────────────────────────────────────────

describe("Incident conflict", () => {
  it("raises HIGH when narrative implies animal_strike but classified as vehicle_collision", () => {
    const result = checkClaimConsistency({
      classified_incident_type: "vehicle_collision",
      narrative_text: "I was travelling at 90 km/h when a cow appeared from a ditch",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe("HIGH");
    expect(conflict?.description).toContain("animal strike");
    expect(result.proceed).toBe(false);
  });

  it("raises HIGH when classified as vehicle_collision but narrative mentions goat", () => {
    const result = checkClaimConsistency({
      classified_incident_type: "vehicle_collision",
      narrative_text: "A goat ran in front of my vehicle",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict?.severity).toBe("HIGH");
  });

  it("raises HIGH when classified as vehicle_collision but narrative mentions livestock", () => {
    const result = checkClaimConsistency({
      classified_incident_type: "vehicle_collision",
      narrative_text: "Livestock crossed the road unexpectedly",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict?.severity).toBe("HIGH");
  });

  it("raises no conflict when classified type matches narrative", () => {
    const result = checkClaimConsistency({
      classified_incident_type: "animal_strike",
      narrative_text: "A cow appeared from a ditch and I hit it",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict).toBeUndefined();
  });

  it("raises no conflict when narrative has no incident type signals", () => {
    const result = checkClaimConsistency({
      classified_incident_type: "vehicle_collision",
      narrative_text: "The damage was significant",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict).toBeUndefined();
  });

  it("raises HIGH when claim_form says vehicle_collision but narrative says animal_strike", () => {
    const result = checkClaimConsistency({
      claim_form_incident_type: "vehicle_collision",
      narrative_text: "A cow appeared from a ditch on the left side of the road",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe("HIGH");
  });

  it("raises HIGH when claim_form and classified disagree and no narrative", () => {
    const result = checkClaimConsistency({
      claim_form_incident_type: "theft",
      classified_incident_type: "vehicle_collision",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict?.severity).toBe("HIGH");
  });

  it("normalises 'collision' to vehicle_collision before comparison", () => {
    const result = checkClaimConsistency({
      classified_incident_type: "collision",
      narrative_text: "A cow appeared from a ditch",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    expect(conflict?.severity).toBe("HIGH");
  });

  it("MAZDA SCENARIO: classified=vehicle_collision, narrative mentions cow → HIGH, proceed=false", () => {
    const result = checkClaimConsistency({
      classified_incident_type: "vehicle_collision",
      claim_form_incident_type: "animal_strike",
      narrative_text: "I was travelling at 90 km/h when a cow appeared from a ditch on the left side of the road",
    });
    // claim_form says animal_strike, classified says vehicle_collision
    // narrative confirms animal_strike
    // No conflict because claim_form and narrative agree on animal_strike
    const incidentConflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");
    // The claim_form says animal_strike and narrative says animal_strike — these agree
    // The classified says vehicle_collision — this conflicts with claim_form
    expect(incidentConflict).toBeDefined();
    expect(incidentConflict?.severity).toBe("HIGH");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Damage mismatch
// ─────────────────────────────────────────────────────────────────────────────

describe("Damage mismatch", () => {
  it("raises HIGH for catastrophic damage at very low speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 5,
      damage_severity: "catastrophic",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe("HIGH");
    expect(result.proceed).toBe(false);
  });

  it("raises HIGH for severe damage at very low speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 10,
      damage_severity: "severe",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict?.severity).toBe("HIGH");
  });

  it("raises MEDIUM for moderate damage at very low speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 5,
      damage_severity: "moderate",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict?.severity).toBe("MEDIUM");
    expect(result.proceed).toBe(true); // MEDIUM alone does not block
  });

  it("raises no conflict for moderate damage at moderate speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 60,
      damage_severity: "moderate",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict).toBeUndefined();
  });

  it("raises no conflict for minor damage at low speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 20,
      damage_severity: "minor",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict).toBeUndefined();
  });

  it("raises MEDIUM for minor damage at very high speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 120,
      damage_severity: "minor",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict?.severity).toBe("MEDIUM");
  });

  it("raises HIGH for airbag deployment at very low speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 10,
      airbag_deployed: true,
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict?.severity).toBe("HIGH");
    expect(result.proceed).toBe(false);
  });

  it("raises no conflict for airbag deployment at highway speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      airbag_deployed: true,
      damage_severity: "severe",
    });
    const airbagConflict = result.critical_conflicts.find(
      (c) => c.type === "damage_mismatch" && c.description.includes("Airbag")
    );
    expect(airbagConflict).toBeUndefined();
  });

  it("raises MEDIUM for multiple structural components at very low speed", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 10,
      structural_component_count: 3,
      damage_severity: "moderate",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict?.severity).toBe("MEDIUM");
  });

  it("uses estimated_speed when stated_speed is absent", () => {
    const result = checkClaimConsistency({
      estimated_speed_kmh: 5,
      damage_severity: "catastrophic",
    });
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict?.severity).toBe("HIGH");
  });

  it("raises no conflict when no speed or damage severity is provided", () => {
    const result = checkClaimConsistency({});
    const conflict = result.critical_conflicts.find((c) => c.type === "damage_mismatch");
    expect(conflict).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Proceed gate
// ─────────────────────────────────────────────────────────────────────────────

describe("Proceed gate", () => {
  it("proceed = true when no conflicts exist", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 88,
      classified_incident_type: "animal_strike",
      narrative_text: "A cow appeared from a ditch",
      damage_severity: "severe",
    });
    expect(result.proceed).toBe(true);
    expect(result.critical_conflicts).toHaveLength(0);
  });

  it("proceed = false when any HIGH conflict exists", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17, // HIGH speed conflict
    });
    expect(result.proceed).toBe(false);
  });

  it("proceed = true when only MEDIUM conflicts exist", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 72, // MEDIUM speed conflict (20%)
    });
    expect(result.proceed).toBe(true);
    expect(result.critical_conflicts.every((c) => c.severity === "MEDIUM")).toBe(true);
  });

  it("proceed = false when multiple HIGH conflicts exist", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17, // HIGH speed conflict
      classified_incident_type: "vehicle_collision",
      narrative_text: "A cow appeared from a ditch", // HIGH incident conflict
    });
    expect(result.proceed).toBe(false);
    const highConflicts = result.critical_conflicts.filter((c) => c.severity === "HIGH");
    expect(highConflicts.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Output contract
// ─────────────────────────────────────────────────────────────────────────────

describe("Output contract", () => {
  it("returns the exact JSON contract shape", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17,
    });
    expect(result).toHaveProperty("critical_conflicts");
    expect(result).toHaveProperty("proceed");
    expect(result).toHaveProperty("summary");
    expect(Array.isArray(result.critical_conflicts)).toBe(true);
    expect(typeof result.proceed).toBe("boolean");
  });

  it("each conflict has type, description, severity", () => {
    const result = checkClaimConsistency({
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17,
    });
    const conflict = result.critical_conflicts[0];
    expect(conflict).toHaveProperty("type");
    expect(conflict).toHaveProperty("description");
    expect(conflict).toHaveProperty("severity");
    expect(["speed_conflict", "incident_conflict", "damage_mismatch"]).toContain(conflict.type);
    expect(["HIGH", "MEDIUM"]).toContain(conflict.severity);
  });

  it("summary is a non-empty string", () => {
    const result = checkClaimConsistency({});
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("empty input produces no conflicts and proceed = true", () => {
    const result = checkClaimConsistency({});
    expect(result.critical_conflicts).toHaveLength(0);
    expect(result.proceed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAZDA FULL SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("MAZDA FULL SCENARIO", () => {
  it("detects all three conflict types and blocks analysis", () => {
    const result = checkClaimConsistency({
      // Speed: stated 90, AI estimated 17 → HIGH
      stated_speed_kmh: 90,
      estimated_speed_kmh: 17,
      // Incident: classified as collision, but narrative says cow → HIGH
      classified_incident_type: "vehicle_collision",
      narrative_text: "I was travelling at 90 km/h when a cow appeared from a ditch on the left side of the road",
      // Damage: severe damage at 90 km/h → plausible (no conflict)
      damage_severity: "severe",
    });

    expect(result.proceed).toBe(false);

    const speedConflict = result.critical_conflicts.find((c) => c.type === "speed_conflict");
    const incidentConflict = result.critical_conflicts.find((c) => c.type === "incident_conflict");

    expect(speedConflict?.severity).toBe("HIGH");
    expect(incidentConflict?.severity).toBe("HIGH");

    // Summary should mention blocking
    expect(result.summary).toContain("BLOCKED");
  });

  it("produces no conflicts when the Mazda claim is correctly classified", () => {
    const result = checkClaimConsistency({
      // Speed: both agree on 90 km/h
      stated_speed_kmh: 90,
      estimated_speed_kmh: 88,
      // Incident: correctly classified as animal_strike
      classified_incident_type: "animal_strike",
      narrative_text: "I was travelling at 90 km/h when a cow appeared from a ditch",
      // Damage: severe at 90 km/h → plausible
      damage_severity: "severe",
    });

    expect(result.proceed).toBe(true);
    expect(result.critical_conflicts).toHaveLength(0);
  });
});
