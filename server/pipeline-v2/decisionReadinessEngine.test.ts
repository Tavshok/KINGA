/**
 * decisionReadinessEngine.test.ts
 *
 * Comprehensive tests for the Decision Readiness Engine.
 * Covers all four checks, confidence scoring, blocking issues,
 * WARN conditions, combined scenarios, and the Mazda audit scenario.
 */

import { describe, it, expect } from "vitest";
import { evaluateDecisionReadiness, isDecisionReady } from "./decisionReadinessEngine";
import type { DecisionReadinessInput } from "./decisionReadinessEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<DecisionReadinessInput> = {}): DecisionReadinessInput {
  return {
    photos: {
      damage_photos_status: "PRESENT",
      photos_processed_count: 5,
      ...overrides.photos,
    },
    incident: {
      incident_type: "animal_strike",
      classification_confidence: 92,
      conflict_detected: false,
      ...overrides.incident,
    },
    physics: {
      physics_ran_successfully: true,
      physics_marked_invalid: false,
      physics_confidence: 78,
      ...overrides.physics,
    },
    cost: {
      true_cost_usd: 4774.00,
      cost_basis: "assessor_validated",
      cost_confidence: 90,
      ...overrides.cost,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 1: Photos processed
// ─────────────────────────────────────────────────────────────────────────────

describe("Check 1 — Photos processed", () => {
  it("FAIL when damage_photos_status = ABSENT", () => {
    const result = evaluateDecisionReadiness(makeInput({ photos: { damage_photos_status: "ABSENT" } }));
    const check = result.checks.find(c => c.check_id === "PHOTOS_PROCESSED")!;
    expect(check.status).toBe("FAIL");
    expect(check.is_critical).toBe(true);
    expect(result.decision_ready).toBe(false);
  });

  it("FAIL when damage_photos_status = UNKNOWN", () => {
    const result = evaluateDecisionReadiness(makeInput({ photos: { damage_photos_status: "UNKNOWN" } }));
    const check = result.checks.find(c => c.check_id === "PHOTOS_PROCESSED")!;
    expect(check.status).toBe("FAIL");
    expect(result.decision_ready).toBe(false);
  });

  it("FAIL when photos_processed_count = 0 even if PRESENT", () => {
    const result = evaluateDecisionReadiness(makeInput({
      photos: { damage_photos_status: "PRESENT", photos_processed_count: 0 },
    }));
    const check = result.checks.find(c => c.check_id === "PHOTOS_PROCESSED")!;
    expect(check.status).toBe("FAIL");
    expect(result.decision_ready).toBe(false);
  });

  it("WARN when PRESENT but photos_processed_count is null", () => {
    const result = evaluateDecisionReadiness(makeInput({
      photos: { damage_photos_status: "PRESENT", photos_processed_count: null },
    }));
    const check = result.checks.find(c => c.check_id === "PHOTOS_PROCESSED")!;
    expect(check.status).toBe("WARN");
    expect(check.is_critical).toBe(false);
    // WARN alone does not block decision
  });

  it("WARN when PRESENT but photos_processed_count is undefined", () => {
    const result = evaluateDecisionReadiness(makeInput({
      photos: { damage_photos_status: "PRESENT", photos_processed_count: undefined },
    }));
    const check = result.checks.find(c => c.check_id === "PHOTOS_PROCESSED")!;
    expect(check.status).toBe("WARN");
  });

  it("PASS when PRESENT and photos_processed_count > 0", () => {
    const result = evaluateDecisionReadiness(makeInput({
      photos: { damage_photos_status: "PRESENT", photos_processed_count: 9 },
    }));
    const check = result.checks.find(c => c.check_id === "PHOTOS_PROCESSED")!;
    expect(check.status).toBe("PASS");
    expect(check.detail).toContain("9 damage photograph(s)");
  });

  it("blocking_issue includes PHOTOS_PROCESSED resolution when FAIL", () => {
    const result = evaluateDecisionReadiness(makeInput({ photos: { damage_photos_status: "ABSENT" } }));
    const issue = result.blocking_issues.find(i => i.check_id === "PHOTOS_PROCESSED");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("CRITICAL");
    expect(issue?.resolution).toContain("Request damage photographs");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Check 2: Incident confirmed
// ─────────────────────────────────────────────────────────────────────────────

describe("Check 2 — Incident confirmed", () => {
  it("FAIL when incident_type = null", () => {
    const result = evaluateDecisionReadiness(makeInput({ incident: { incident_type: null } }));
    const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
    expect(check.status).toBe("FAIL");
    expect(result.decision_ready).toBe(false);
  });

  it("FAIL when incident_type = 'unknown'", () => {
    const result = evaluateDecisionReadiness(makeInput({ incident: { incident_type: "unknown" } }));
    const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
    expect(check.status).toBe("FAIL");
  });

  it("FAIL when incident_type = empty string", () => {
    const result = evaluateDecisionReadiness(makeInput({ incident: { incident_type: "" } }));
    const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
    expect(check.status).toBe("FAIL");
  });

  it("FAIL when incident_type is an unrecognised value", () => {
    // "collision" and its sub-types (rear_end, head_on, sideswipe, etc.) are now valid canonical
    // types — canonicaliseIncidentType maps them to vehicle_collision. Use a genuinely unknown
    // string that has no mapping to verify the FAIL path still works.
    const result = evaluateDecisionReadiness(makeInput({ incident: { incident_type: "fender_bender" } }));
    const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain('"fender_bender"');
  });

  it("WARN when conflict_detected = true", () => {
    const result = evaluateDecisionReadiness(makeInput({
      incident: { incident_type: "animal_strike", conflict_detected: true, classification_confidence: 85 },
    }));
    const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
    expect(check.status).toBe("WARN");
    expect(check.is_critical).toBe(false);
  });

  it("WARN when classification_confidence < 60", () => {
    const result = evaluateDecisionReadiness(makeInput({
      incident: { incident_type: "vehicle_collision", classification_confidence: 45, conflict_detected: false },
    }));
    const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
    expect(check.status).toBe("WARN");
  });

  it("PASS for all valid incident types with high confidence", () => {
    const validTypes = ["animal_strike", "vehicle_collision", "theft", "fire", "flood", "vandalism"];
    for (const type of validTypes) {
      const result = evaluateDecisionReadiness(makeInput({
        incident: { incident_type: type, classification_confidence: 90, conflict_detected: false },
      }));
      const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
      expect(check.status, `Expected PASS for type: ${type}`).toBe("PASS");
    }
  });

  it("PASS when classification_confidence is null (not penalised)", () => {
    const result = evaluateDecisionReadiness(makeInput({
      incident: { incident_type: "animal_strike", classification_confidence: null, conflict_detected: false },
    }));
    const check = result.checks.find(c => c.check_id === "INCIDENT_CONFIRMED")!;
    expect(check.status).toBe("PASS");
  });

  it("blocking_issue includes INCIDENT_CONFIRMED resolution when FAIL", () => {
    const result = evaluateDecisionReadiness(makeInput({ incident: { incident_type: "unknown" } }));
    const issue = result.blocking_issues.find(i => i.check_id === "INCIDENT_CONFIRMED");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("CRITICAL");
    expect(issue?.resolution).toContain("Incident Classification Engine");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Check 3: Physics valid
// ─────────────────────────────────────────────────────────────────────────────

describe("Check 3 — Physics valid", () => {
  it("FAIL when physics_ran_successfully = false", () => {
    const result = evaluateDecisionReadiness(makeInput({
      physics: { physics_ran_successfully: false, physics_marked_invalid: false },
    }));
    const check = result.checks.find(c => c.check_id === "PHYSICS_VALID")!;
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("fallback mode");
    expect(result.decision_ready).toBe(false);
  });

  it("FAIL when physics_marked_invalid = true (even if ran successfully)", () => {
    const result = evaluateDecisionReadiness(makeInput({
      physics: { physics_ran_successfully: true, physics_marked_invalid: true },
    }));
    const check = result.checks.find(c => c.check_id === "PHYSICS_VALID")!;
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("physically invalid");
    expect(result.decision_ready).toBe(false);
  });

  it("WARN when physics_confidence < 40", () => {
    const result = evaluateDecisionReadiness(makeInput({
      physics: { physics_ran_successfully: true, physics_marked_invalid: false, physics_confidence: 30 },
    }));
    const check = result.checks.find(c => c.check_id === "PHYSICS_VALID")!;
    expect(check.status).toBe("WARN");
    expect(check.is_critical).toBe(false);
  });

  it("PASS when physics ran successfully and is not invalid", () => {
    const result = evaluateDecisionReadiness(makeInput({
      physics: { physics_ran_successfully: true, physics_marked_invalid: false, physics_confidence: 75 },
    }));
    const check = result.checks.find(c => c.check_id === "PHYSICS_VALID")!;
    expect(check.status).toBe("PASS");
    expect(check.detail).toContain("confidence: 75%");
  });

  it("PASS when physics_confidence is null (not penalised)", () => {
    const result = evaluateDecisionReadiness(makeInput({
      physics: { physics_ran_successfully: true, physics_marked_invalid: false, physics_confidence: null },
    }));
    const check = result.checks.find(c => c.check_id === "PHYSICS_VALID")!;
    expect(check.status).toBe("PASS");
  });

  it("blocking_issue includes PHYSICS_VALID resolution when FAIL", () => {
    const result = evaluateDecisionReadiness(makeInput({
      physics: { physics_ran_successfully: false, physics_marked_invalid: false },
    }));
    const issue = result.blocking_issues.find(i => i.check_id === "PHYSICS_VALID");
    expect(issue).toBeDefined();
    expect(issue?.resolution).toContain("physics engine");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Check 4: Cost available
// ─────────────────────────────────────────────────────────────────────────────

describe("Check 4 — Cost available", () => {
  it("FAIL when true_cost_usd = null", () => {
    const result = evaluateDecisionReadiness(makeInput({ cost: { true_cost_usd: null } }));
    const check = result.checks.find(c => c.check_id === "COST_AVAILABLE")!;
    expect(check.status).toBe("FAIL");
    expect(result.decision_ready).toBe(false);
  });

  it("FAIL when true_cost_usd = undefined", () => {
    const result = evaluateDecisionReadiness(makeInput({ cost: { true_cost_usd: undefined } }));
    const check = result.checks.find(c => c.check_id === "COST_AVAILABLE")!;
    expect(check.status).toBe("FAIL");
  });

  it("FAIL when true_cost_usd = 0", () => {
    const result = evaluateDecisionReadiness(makeInput({ cost: { true_cost_usd: 0 } }));
    const check = result.checks.find(c => c.check_id === "COST_AVAILABLE")!;
    expect(check.status).toBe("FAIL");
  });

  it("FAIL when true_cost_usd is negative", () => {
    const result = evaluateDecisionReadiness(makeInput({ cost: { true_cost_usd: -100 } }));
    const check = result.checks.find(c => c.check_id === "COST_AVAILABLE")!;
    expect(check.status).toBe("FAIL");
  });

  it("WARN when system_optimised and cost_confidence < 50", () => {
    const result = evaluateDecisionReadiness(makeInput({
      cost: { true_cost_usd: 3200, cost_basis: "system_optimised", cost_confidence: 40 },
    }));
    const check = result.checks.find(c => c.check_id === "COST_AVAILABLE")!;
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("system_optimised");
    expect(check.is_critical).toBe(false);
  });

  it("PASS when assessor_validated with positive cost", () => {
    const result = evaluateDecisionReadiness(makeInput({
      cost: { true_cost_usd: 4774, cost_basis: "assessor_validated", cost_confidence: 90 },
    }));
    const check = result.checks.find(c => c.check_id === "COST_AVAILABLE")!;
    expect(check.status).toBe("PASS");
    expect(check.detail).toContain("4774.00");
    expect(check.detail).toContain("assessor_validated");
  });

  it("PASS when system_optimised with confidence >= 50", () => {
    const result = evaluateDecisionReadiness(makeInput({
      cost: { true_cost_usd: 3200, cost_basis: "system_optimised", cost_confidence: 65 },
    }));
    const check = result.checks.find(c => c.check_id === "COST_AVAILABLE")!;
    expect(check.status).toBe("PASS");
  });

  it("blocking_issue includes COST_AVAILABLE resolution when FAIL", () => {
    const result = evaluateDecisionReadiness(makeInput({ cost: { true_cost_usd: null } }));
    const issue = result.blocking_issues.find(i => i.check_id === "COST_AVAILABLE");
    expect(issue).toBeDefined();
    expect(issue?.resolution).toContain("Cost Decision Engine");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Decision ready — all checks pass
// ─────────────────────────────────────────────────────────────────────────────

describe("Decision ready — all checks pass", () => {
  it("decision_ready = true when all four checks pass", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result.decision_ready).toBe(true);
    expect(result.blocking_issues).toHaveLength(0);
  });

  it("isDecisionReady returns true when all pass", () => {
    expect(isDecisionReady(makeInput())).toBe(true);
  });

  it("confidence = 100 when all four checks PASS with high-quality data", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result.confidence).toBe(100);
  });

  it("summary contains 'Decision ready' when all pass", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result.summary).toContain("Decision ready");
  });

  it("all four checks are present in output", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result.checks).toHaveLength(4);
    const ids = result.checks.map(c => c.check_id);
    expect(ids).toContain("PHOTOS_PROCESSED");
    expect(ids).toContain("INCIDENT_CONFIRMED");
    expect(ids).toContain("PHYSICS_VALID");
    expect(ids).toContain("COST_AVAILABLE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Confidence scoring
// ─────────────────────────────────────────────────────────────────────────────

describe("Confidence scoring", () => {
  it("confidence = 100 when all four PASS with high-quality inputs", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result.confidence).toBe(100);
  });

  it("confidence is reduced when a check is WARN", () => {
    const result = evaluateDecisionReadiness(makeInput({
      photos: { damage_photos_status: "PRESENT", photos_processed_count: null },
    }));
    expect(result.confidence).toBeLessThan(100);
  });

  it("confidence = 0 when all four checks FAIL", () => {
    const result = evaluateDecisionReadiness({
      photos: { damage_photos_status: "ABSENT" },
      incident: { incident_type: "unknown" },
      physics: { physics_ran_successfully: false, physics_marked_invalid: false },
      cost: { true_cost_usd: null },
    });
    expect(result.confidence).toBe(0);
  });

  it("confidence is reduced for low classification confidence", () => {
    const baseline = evaluateDecisionReadiness(makeInput()).confidence;
    const reduced = evaluateDecisionReadiness(makeInput({
      incident: { incident_type: "animal_strike", classification_confidence: 55, conflict_detected: false },
    })).confidence;
    expect(reduced).toBeLessThan(baseline);
  });

  it("confidence is reduced for conflict_detected", () => {
    const baseline = evaluateDecisionReadiness(makeInput()).confidence;
    const reduced = evaluateDecisionReadiness(makeInput({
      incident: { incident_type: "animal_strike", classification_confidence: 90, conflict_detected: true },
    })).confidence;
    expect(reduced).toBeLessThan(baseline);
  });

  it("confidence is clamped to 0 minimum", () => {
    const result = evaluateDecisionReadiness({
      photos: { damage_photos_status: "ABSENT" },
      incident: { incident_type: "unknown", classification_confidence: 10, conflict_detected: true },
      physics: { physics_ran_successfully: false, physics_marked_invalid: true, physics_confidence: 5 },
      cost: { true_cost_usd: 0, cost_confidence: 5 },
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Combined scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("Combined scenarios", () => {
  it("decision_ready = false when only photos fail", () => {
    const result = evaluateDecisionReadiness(makeInput({ photos: { damage_photos_status: "ABSENT" } }));
    expect(result.decision_ready).toBe(false);
    expect(result.blocking_issues).toHaveLength(1);
  });

  it("decision_ready = false when all four fail — four blocking issues", () => {
    const result = evaluateDecisionReadiness({
      photos: { damage_photos_status: "ABSENT" },
      incident: { incident_type: "unknown" },
      physics: { physics_ran_successfully: false, physics_marked_invalid: false },
      cost: { true_cost_usd: null },
    });
    expect(result.decision_ready).toBe(false);
    expect(result.blocking_issues).toHaveLength(4);
  });

  it("decision_ready = true when all WARN (no FAIL)", () => {
    const result = evaluateDecisionReadiness(makeInput({
      photos: { damage_photos_status: "PRESENT", photos_processed_count: null },
      incident: { incident_type: "animal_strike", classification_confidence: 55, conflict_detected: false },
      physics: { physics_ran_successfully: true, physics_marked_invalid: false, physics_confidence: 35 },
      cost: { true_cost_usd: 3200, cost_basis: "system_optimised", cost_confidence: 40 },
    }));
    expect(result.decision_ready).toBe(true);
    expect(result.blocking_issues).toHaveLength(0);
    expect(result.confidence).toBeLessThan(100);
  });

  it("isDecisionReady returns false when any critical check fails", () => {
    expect(isDecisionReady(makeInput({ physics: { physics_ran_successfully: false } }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Output contract
// ─────────────────────────────────────────────────────────────────────────────

describe("Output contract", () => {
  it("returns exact JSON contract shape", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result).toHaveProperty("decision_ready");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("blocking_issues");
    expect(typeof result.decision_ready).toBe("boolean");
    expect(typeof result.confidence).toBe("number");
    expect(Array.isArray(result.blocking_issues)).toBe(true);
  });

  it("blocking_issues is empty array when decision_ready = true", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result.blocking_issues).toHaveLength(0);
  });

  it("blocking_issues contains objects with check_id, description, resolution, severity", () => {
    const result = evaluateDecisionReadiness(makeInput({ photos: { damage_photos_status: "ABSENT" } }));
    const issue = result.blocking_issues[0];
    expect(issue).toHaveProperty("check_id");
    expect(issue).toHaveProperty("description");
    expect(issue).toHaveProperty("resolution");
    expect(issue).toHaveProperty("severity");
    expect(["CRITICAL", "HIGH", "MEDIUM"]).toContain(issue.severity);
  });

  it("confidence is always between 0 and 100", () => {
    const result = evaluateDecisionReadiness(makeInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAZDA AUDIT SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("MAZDA AUDIT SCENARIO", () => {
  it("BLOCKED on the Mazda claim as originally processed — photos not processed, physics invalid, wrong incident type", () => {
    const result = evaluateDecisionReadiness({
      // Photos were in the document but never processed by the image analysis stage
      photos: {
        damage_photos_status: "PRESENT",
        photos_processed_count: 0,
      },
      // Incident type was wrongly classified as vehicle_collision with low confidence
      incident: {
        incident_type: "vehicle_collision",
        classification_confidence: 45,
        conflict_detected: true,
      },
      // Physics ran in fallback mode due to wrong incident type
      physics: {
        physics_ran_successfully: false,
        physics_marked_invalid: true,
        physics_confidence: 30,
      },
      // Cost was available but based on unvalidated data
      cost: {
        true_cost_usd: 4774,
        cost_basis: "system_optimised",
        cost_confidence: 45,
      },
    });

    expect(result.decision_ready).toBe(false);
    // Photos processed = 0 → FAIL
    // Physics fallback AND marked invalid → FAIL
    expect(result.blocking_issues.length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBeLessThan(50);
    expect(result.summary).toContain("BLOCKED");
  });

  it("READY on the Mazda claim when correctly processed", () => {
    const result = evaluateDecisionReadiness({
      // 9 photos processed from the original document
      photos: {
        damage_photos_status: "PRESENT",
        photos_processed_count: 9,
      },
      // Correctly classified as animal_strike with high confidence
      incident: {
        incident_type: "animal_strike",
        classification_confidence: 95,
        conflict_detected: false,
      },
      // Physics ran successfully with correct 90 km/h speed input
      physics: {
        physics_ran_successfully: true,
        physics_marked_invalid: false,
        physics_confidence: 82,
      },
      // Assessor-validated cost from Skinners quote
      cost: {
        true_cost_usd: 4774,
        cost_basis: "assessor_validated",
        cost_confidence: 90,
      },
    });

    expect(result.decision_ready).toBe(true);
    expect(result.blocking_issues).toHaveLength(0);
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.summary).toContain("Decision ready");
  });
});
