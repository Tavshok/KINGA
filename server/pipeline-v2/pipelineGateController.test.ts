/**
 * pipelineGateController.test.ts
 *
 * Comprehensive tests for the Pipeline Gate Controller.
 * Covers all four HOLD rules, PROCEED conditions, combined scenarios,
 * and the Mazda audit scenario.
 */

import { describe, it, expect } from "vitest";
import { evaluateGate, canProceed } from "./pipelineGateController";
import type { GateControllerInput } from "./pipelineGateController";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<GateControllerInput> = {}): GateControllerInput {
  return {
    evidence_registry: {
      damage_photos: "PRESENT",
      repair_quote: "PRESENT",
      assessor_report: "PRESENT",
      claim_form: "PRESENT",
      driver_statement: "PRESENT",
      incident_details: "PRESENT",
      vehicle_details: "PRESENT",
      ...overrides.evidence_registry,
    },
    validated_fields: {
      incident_type: { value: "animal_strike", source: "claim_form", confidence: 95 },
      repair_cost: { value: 4774, source: "assessor", confidence: 90 },
      speed_kmh: { value: 90, source: "claim_form", confidence: 95 },
      market_value: { value: 12000, source: "assessor", confidence: 85 },
      ...overrides.validated_fields,
    },
    conflict_report: {
      critical_conflicts: [],
      proceed: true,
      summary: "No conflicts detected.",
      ...overrides.conflict_report,
    },
    assessment_mode: overrides.assessment_mode ?? "PRE_ASSESSMENT",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 1: No damage photos
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 1 — No damage photos", () => {
  it("HOLD when damage_photos = ABSENT", () => {
    const result = evaluateGate(makeInput({ evidence_registry: { damage_photos: "ABSENT" } }));
    expect(result.status).toBe("HOLD");
    expect(result.reasons.some((r) => r.includes("photographs are absent"))).toBe(true);
    expect(result.required_actions.some((a) => a.includes("Request damage photographs"))).toBe(true);
  });

  it("PROCEED when damage_photos = PRESENT", () => {
    const result = evaluateGate(makeInput({ evidence_registry: { damage_photos: "PRESENT" } }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "NO_DAMAGE_PHOTOS");
    expect(rule?.triggered).toBe(false);
  });

  it("PROCEED when damage_photos = UNKNOWN (not a hard HOLD)", () => {
    const result = evaluateGate(makeInput({ evidence_registry: { damage_photos: "UNKNOWN" } }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "NO_DAMAGE_PHOTOS");
    expect(rule?.triggered).toBe(false);
  });

  it("includes NO_DAMAGE_PHOTOS in rules_triggered with triggered=true", () => {
    const result = evaluateGate(makeInput({ evidence_registry: { damage_photos: "ABSENT" } }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "NO_DAMAGE_PHOTOS");
    expect(rule?.triggered).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 2: Unknown incident type
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 2 — Unknown incident type", () => {
  it("HOLD when incident_type value = 'unknown'", () => {
    const result = evaluateGate(makeInput({
      validated_fields: { incident_type: { value: "unknown", source: "inferred", confidence: 20 } },
    }));
    expect(result.status).toBe("HOLD");
    expect(result.reasons.some((r) => r.includes("Incident type could not be determined"))).toBe(true);
    expect(result.required_actions.some((a) => a.includes("Incident Classification Engine"))).toBe(true);
  });

  it("HOLD when incident_type value = null", () => {
    const result = evaluateGate(makeInput({
      validated_fields: { incident_type: { value: null, source: "inferred", confidence: 0 } },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "UNKNOWN_INCIDENT_TYPE");
    expect(rule?.triggered).toBe(true);
  });

  it("HOLD when incident_type field is absent from validated_fields", () => {
    const result = evaluateGate(makeInput({
      validated_fields: { incident_type: null },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "UNKNOWN_INCIDENT_TYPE");
    expect(rule?.triggered).toBe(true);
  });

  it("HOLD when incident_type value is empty string", () => {
    const result = evaluateGate(makeInput({
      validated_fields: { incident_type: { value: "", source: "inferred", confidence: 0 } },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "UNKNOWN_INCIDENT_TYPE");
    expect(rule?.triggered).toBe(true);
  });

  it("PROCEED when incident_type = 'animal_strike'", () => {
    const result = evaluateGate(makeInput({
      validated_fields: { incident_type: { value: "animal_strike", source: "claim_form", confidence: 95 } },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "UNKNOWN_INCIDENT_TYPE");
    expect(rule?.triggered).toBe(false);
  });

  it("PROCEED when incident_type = 'vehicle_collision'", () => {
    const result = evaluateGate(makeInput({
      validated_fields: { incident_type: { value: "vehicle_collision", source: "claim_form", confidence: 90 } },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "UNKNOWN_INCIDENT_TYPE");
    expect(rule?.triggered).toBe(false);
  });

  it("PROCEED for all valid incident types", () => {
    const validTypes = ["animal_strike", "vehicle_collision", "theft", "fire", "flood", "vandalism"];
    for (const type of validTypes) {
      const result = evaluateGate(makeInput({
        validated_fields: { incident_type: { value: type, source: "claim_form", confidence: 90 } },
      }));
      const rule = result.rules_triggered.find((r) => r.rule_id === "UNKNOWN_INCIDENT_TYPE");
      expect(rule?.triggered, `Expected no trigger for type: ${type}`).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 3: HIGH conflict exists
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 3 — HIGH conflict exists", () => {
  it("HOLD when a HIGH speed_conflict exists", () => {
    const result = evaluateGate(makeInput({
      conflict_report: {
        critical_conflicts: [
          { type: "speed_conflict", severity: "HIGH", description: "Stated 90 km/h vs estimated 17 km/h" },
        ],
        proceed: false,
      },
    }));
    expect(result.status).toBe("HOLD");
    expect(result.reasons.some((r) => r.includes("speed_conflict"))).toBe(true);
  });

  it("HOLD when a HIGH incident_conflict exists", () => {
    const result = evaluateGate(makeInput({
      conflict_report: {
        critical_conflicts: [
          { type: "incident_conflict", severity: "HIGH", description: "Classified as vehicle_collision but narrative describes animal strike" },
        ],
        proceed: false,
      },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "HIGH_CONFLICT_EXISTS");
    expect(rule?.triggered).toBe(true);
  });

  it("HOLD when a HIGH damage_mismatch exists", () => {
    const result = evaluateGate(makeInput({
      conflict_report: {
        critical_conflicts: [
          { type: "damage_mismatch", severity: "HIGH", description: "Catastrophic damage at 5 km/h" },
        ],
        proceed: false,
      },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "HIGH_CONFLICT_EXISTS");
    expect(rule?.triggered).toBe(true);
  });

  it("PROCEED when only MEDIUM conflicts exist", () => {
    const result = evaluateGate(makeInput({
      conflict_report: {
        critical_conflicts: [
          { type: "speed_conflict", severity: "MEDIUM", description: "20% speed deviation" },
        ],
        proceed: true,
      },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "HIGH_CONFLICT_EXISTS");
    expect(rule?.triggered).toBe(false);
  });

  it("PROCEED when conflict_report has no conflicts", () => {
    const result = evaluateGate(makeInput({
      conflict_report: { critical_conflicts: [], proceed: true },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "HIGH_CONFLICT_EXISTS");
    expect(rule?.triggered).toBe(false);
  });

  it("HOLD when multiple HIGH conflicts exist — all listed in reasons", () => {
    const result = evaluateGate(makeInput({
      conflict_report: {
        critical_conflicts: [
          { type: "speed_conflict", severity: "HIGH", description: "Speed mismatch" },
          { type: "incident_conflict", severity: "HIGH", description: "Incident mismatch" },
        ],
        proceed: false,
      },
    }));
    expect(result.status).toBe("HOLD");
    expect(result.reasons[0]).toContain("2 HIGH-severity conflict(s)");
  });

  it("includes required_action listing the conflict types", () => {
    const result = evaluateGate(makeInput({
      conflict_report: {
        critical_conflicts: [
          { type: "speed_conflict", severity: "HIGH", description: "Speed mismatch" },
        ],
        proceed: false,
      },
    }));
    expect(result.required_actions.some((a) => a.includes("speed_conflict"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 4: Missing repair cost in POST_ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 4 — Missing repair cost in POST_ASSESSMENT", () => {
  it("HOLD when POST_ASSESSMENT and repair_cost is null", () => {
    const result = evaluateGate(makeInput({
      assessment_mode: "POST_ASSESSMENT",
      validated_fields: { repair_cost: { value: null, source: "inferred", confidence: 0 } },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "MISSING_REPAIR_COST_POST");
    expect(rule?.triggered).toBe(true);
    expect(result.status).toBe("HOLD");
    expect(result.reasons.some((r) => r.includes("POST_ASSESSMENT"))).toBe(true);
    expect(result.required_actions.some((a) => a.includes("agreed repair cost"))).toBe(true);
  });

  it("HOLD when POST_ASSESSMENT and repair_cost field is absent", () => {
    const result = evaluateGate(makeInput({
      assessment_mode: "POST_ASSESSMENT",
      validated_fields: { repair_cost: null },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "MISSING_REPAIR_COST_POST");
    expect(rule?.triggered).toBe(true);
  });

  it("HOLD when POST_ASSESSMENT and repair_cost = 0", () => {
    const result = evaluateGate(makeInput({
      assessment_mode: "POST_ASSESSMENT",
      validated_fields: { repair_cost: { value: 0, source: "inferred", confidence: 0 } },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "MISSING_REPAIR_COST_POST");
    expect(rule?.triggered).toBe(true);
  });

  it("PROCEED when POST_ASSESSMENT and repair_cost is present", () => {
    const result = evaluateGate(makeInput({
      assessment_mode: "POST_ASSESSMENT",
      validated_fields: { repair_cost: { value: 4774, source: "assessor", confidence: 90 } },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "MISSING_REPAIR_COST_POST");
    expect(rule?.triggered).toBe(false);
  });

  it("PROCEED when PRE_ASSESSMENT and repair_cost is missing (not a HOLD in pre-assessment)", () => {
    const result = evaluateGate(makeInput({
      assessment_mode: "PRE_ASSESSMENT",
      validated_fields: { repair_cost: null },
    }));
    const rule = result.rules_triggered.find((r) => r.rule_id === "MISSING_REPAIR_COST_POST");
    expect(rule?.triggered).toBe(false);
  });

  it("defaults to PRE_ASSESSMENT when assessment_mode is omitted", () => {
    const input = makeInput({ validated_fields: { repair_cost: null } });
    delete (input as Partial<GateControllerInput>).assessment_mode;
    const result = evaluateGate(input);
    const rule = result.rules_triggered.find((r) => r.rule_id === "MISSING_REPAIR_COST_POST");
    expect(rule?.triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROCEED conditions
// ─────────────────────────────────────────────────────────────────────────────

describe("PROCEED conditions", () => {
  it("PROCEED when all four rules pass", () => {
    const result = evaluateGate(makeInput());
    expect(result.status).toBe("PROCEED");
    expect(result.reasons).toHaveLength(0);
    expect(result.required_actions).toHaveLength(0);
  });

  it("canProceed returns true when status = PROCEED", () => {
    expect(canProceed(makeInput())).toBe(true);
  });

  it("canProceed returns false when status = HOLD", () => {
    expect(canProceed(makeInput({ evidence_registry: { damage_photos: "ABSENT" } }))).toBe(false);
  });

  it("all four rules_triggered entries are present in output", () => {
    const result = evaluateGate(makeInput());
    expect(result.rules_triggered).toHaveLength(4);
    const ids = result.rules_triggered.map((r) => r.rule_id);
    expect(ids).toContain("NO_DAMAGE_PHOTOS");
    expect(ids).toContain("UNKNOWN_INCIDENT_TYPE");
    expect(ids).toContain("HIGH_CONFLICT_EXISTS");
    expect(ids).toContain("MISSING_REPAIR_COST_POST");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Combined scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("Combined scenarios", () => {
  it("HOLD with multiple rules triggered — all reasons and actions returned", () => {
    const result = evaluateGate(makeInput({
      evidence_registry: { damage_photos: "ABSENT" },
      validated_fields: { incident_type: { value: "unknown", source: "inferred", confidence: 10 } },
      conflict_report: {
        critical_conflicts: [
          { type: "speed_conflict", severity: "HIGH", description: "Speed mismatch" },
        ],
        proceed: false,
      },
    }));
    expect(result.status).toBe("HOLD");
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    expect(result.required_actions.length).toBeGreaterThanOrEqual(3);
  });

  it("HOLD with all four rules triggered simultaneously", () => {
    const result = evaluateGate({
      evidence_registry: { damage_photos: "ABSENT" },
      validated_fields: {
        incident_type: { value: "unknown", source: "inferred", confidence: 0 },
        repair_cost: null,
      },
      conflict_report: {
        critical_conflicts: [
          { type: "speed_conflict", severity: "HIGH", description: "Speed mismatch" },
        ],
        proceed: false,
      },
      assessment_mode: "POST_ASSESSMENT",
    });
    expect(result.status).toBe("HOLD");
    const triggeredCount = result.rules_triggered.filter((r) => r.triggered).length;
    expect(triggeredCount).toBe(4);
    expect(result.reasons).toHaveLength(4);
    expect(result.required_actions).toHaveLength(4);
  });

  it("HOLD on Rule 1 only — other rules pass", () => {
    const result = evaluateGate(makeInput({
      evidence_registry: { damage_photos: "ABSENT" },
    }));
    const triggered = result.rules_triggered.filter((r) => r.triggered);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].rule_id).toBe("NO_DAMAGE_PHOTOS");
  });

  it("HOLD on Rule 4 only — other rules pass", () => {
    const result = evaluateGate(makeInput({
      assessment_mode: "POST_ASSESSMENT",
      validated_fields: { repair_cost: null },
    }));
    const triggered = result.rules_triggered.filter((r) => r.triggered);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].rule_id).toBe("MISSING_REPAIR_COST_POST");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Output contract
// ─────────────────────────────────────────────────────────────────────────────

describe("Output contract", () => {
  it("returns the exact JSON contract shape", () => {
    const result = evaluateGate(makeInput());
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("reasons");
    expect(result).toHaveProperty("required_actions");
    expect(["PROCEED", "HOLD"]).toContain(result.status);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(Array.isArray(result.required_actions)).toBe(true);
  });

  it("reasons and required_actions are empty arrays when PROCEED", () => {
    const result = evaluateGate(makeInput());
    expect(result.reasons).toHaveLength(0);
    expect(result.required_actions).toHaveLength(0);
  });

  it("reasons and required_actions are non-empty strings when HOLD", () => {
    const result = evaluateGate(makeInput({ evidence_registry: { damage_photos: "ABSENT" } }));
    expect(result.reasons.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
    expect(result.required_actions.every((a) => typeof a === "string" && a.length > 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAZDA FULL SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("MAZDA FULL SCENARIO", () => {
  it("HOLD on the Mazda claim as it was processed (wrong incident type, HIGH speed conflict, no photos processed)", () => {
    const result = evaluateGate({
      // Photos were present in the document but never processed by the pipeline
      evidence_registry: { damage_photos: "ABSENT" },
      validated_fields: {
        // Incident type was wrongly classified as vehicle_collision
        incident_type: { value: "vehicle_collision", source: "inferred", confidence: 45 },
        repair_cost: { value: 4774, source: "assessor", confidence: 80 },
        speed_kmh: { value: 17, source: "inferred", confidence: 30 }, // AI estimated, not the stated 90
        market_value: null,
      },
      conflict_report: {
        critical_conflicts: [
          {
            type: "speed_conflict",
            severity: "HIGH",
            description: "Stated 90 km/h vs estimated 17 km/h — 81% deviation exceeds 30% threshold",
          },
          {
            type: "incident_conflict",
            severity: "HIGH",
            description: "Classified as vehicle_collision but narrative describes cow appearing from ditch",
          },
        ],
        proceed: false,
      },
      assessment_mode: "PRE_ASSESSMENT",
    });

    expect(result.status).toBe("HOLD");
    const triggeredRules = result.rules_triggered.filter((r) => r.triggered).map((r) => r.rule_id);
    expect(triggeredRules).toContain("NO_DAMAGE_PHOTOS");
    expect(triggeredRules).toContain("HIGH_CONFLICT_EXISTS");
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("PROCEED on the Mazda claim when correctly processed", () => {
    const result = evaluateGate({
      // Photos present and processed
      evidence_registry: { damage_photos: "PRESENT" },
      validated_fields: {
        // Correctly classified as animal_strike
        incident_type: { value: "animal_strike", source: "claim_form", confidence: 95 },
        repair_cost: { value: 4774, source: "assessor", confidence: 90 },
        speed_kmh: { value: 90, source: "claim_form", confidence: 95 },
        market_value: { value: 12000, source: "assessor", confidence: 85 },
      },
      conflict_report: {
        critical_conflicts: [],
        proceed: true,
      },
      assessment_mode: "PRE_ASSESSMENT",
    });

    expect(result.status).toBe("PROCEED");
    expect(result.reasons).toHaveLength(0);
  });
});
