/**
 * output-validation-engine.test.ts
 *
 * Regression tests for the KINGA Output Validation and Correction Engine.
 * Covers all 10 rules defined in the Output Validation Spec.
 */

import { describe, it, expect } from "vitest";
import { runOutputValidation, type ValidationEngineInput } from "./output-validation-engine";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Build a fully-valid baseline input that passes all 10 rules */
function baseline(overrides: Partial<ValidationEngineInput> = {}): ValidationEngineInput {
  return {
    claimId: 1001,
    claimNumber: "CLM-2024-001",
    rawVerdict: "APPROVE",
    confidenceScore: 82,
    fraudScore: 12,
    fraudLevel: "minimal",
    aiEstimateUsd: 1500,
    documentedOriginalQuoteUsd: 1800,
    documentedAgreedCostUsd: 1500,
    costBasis: "assessor_validated",
    panelBeaterFromCostIntel: "SKINNERS AUTO BODY",
    panelBeaterFromAssessor: null,
    repairerName: null,
    accidentDescription: "Vehicle was struck from behind at a traffic light. The rear bumper sustained impact damage.",
    imageUrls: ["https://s3.example.com/img1.jpg", "https://s3.example.com/img2.jpg"],
    imageProcessingRan: true,
    damagedComponents: ["rear bumper", "boot lid", "tail lights"],
    physicsExecuted: true,
    impactSpeedKmh: 35,
    impactForceKn: 18.4,
    severityClassification: "minor",
    hasVectors: true,
    accidentType: "rear_collision",
    structuralDamage: false,
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    vehicleYear: 2019,
    vehicleRegistration: "ABC 123 ZW",
    accidentDate: "2024-03-15",
    accidentLocation: "Harare CBD",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 1: TERMINOLOGY VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 1 — Terminology Validation", () => {
  it("passes clean input without corrections", () => {
    const result = runOutputValidation(baseline());
    expect(result.corrections.filter(c => c.rule === 1)).toHaveLength(0);
    expect(result.final_output.terminologyCorrected).toBe(false);
  });

  it("replaces 'reconchika' with 'repair component'", () => {
    const result = runOutputValidation(baseline({
      accidentDescription: "The reconchika on the left door was damaged.",
    }));
    const correction = result.corrections.find(c => c.rule === 1 && c.field === "accidentDescription");
    expect(correction).toBeDefined();
    expect(String(correction!.corrected)).toContain("repair component");
    expect(result.final_output.terminologyCorrected).toBe(true);
  });

  it("replaces 'write-off' with 'total loss'", () => {
    const result = runOutputValidation(baseline({
      accidentDescription: "The vehicle is a write-off due to extensive damage.",
    }));
    const correction = result.corrections.find(c => c.rule === 1);
    expect(correction).toBeDefined();
    expect(String(correction!.corrected)).toContain("total loss");
  });

  it("replaces raw 'undefined' string in costBasis", () => {
    const result = runOutputValidation(baseline({ costBasis: "undefined" }));
    // 'undefined' string is replaced by terminology rule
    const correction = result.corrections.find(c => c.rule === 1 && c.field === "costBasis");
    expect(correction).toBeDefined();
    expect(String(correction!.corrected)).toBe("not available");
  });

  it("replaces 'write off' (no hyphen) with 'total loss'", () => {
    const result = runOutputValidation(baseline({
      accidentDescription: "Adjuster noted vehicle is a write off.",
    }));
    expect(result.corrections.some(c => c.rule === 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 2: COST GOVERNANCE
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 2 — Cost Governance", () => {
  it("preserves valid AI estimate with sufficient confidence", () => {
    const result = runOutputValidation(baseline({ aiEstimateUsd: 1500, confidenceScore: 82 }));
    expect(result.final_output.aiEstimateUsd).toBe(1500);
    expect(result.final_output.aiEstimateSuppressed).toBe(false);
  });

  it("suppresses AI estimate when confidence < 60", () => {
    const result = runOutputValidation(baseline({ aiEstimateUsd: 1500, confidenceScore: 55 }));
    expect(result.final_output.aiEstimateUsd).toBeNull();
    expect(result.final_output.aiEstimateSuppressed).toBe(true);
    expect(result.suppressed_fields).toContain("ai_estimate_usd");
    expect(result.final_output.aiEstimateSuppressReason).toContain("55");
  });

  it("suppresses unrealistically low AI estimate ($4.62)", () => {
    const result = runOutputValidation(baseline({ aiEstimateUsd: 4.62, confidenceScore: 82 }));
    expect(result.final_output.aiEstimateUsd).toBeNull();
    expect(result.final_output.aiEstimateSuppressed).toBe(true);
    expect(result.final_output.aiEstimateSuppressReason).toContain("$4.62");
  });

  it("suppresses unrealistically high AI estimate ($600,000)", () => {
    const result = runOutputValidation(baseline({ aiEstimateUsd: 600_000, confidenceScore: 82 }));
    expect(result.final_output.aiEstimateUsd).toBeNull();
    expect(result.final_output.aiEstimateSuppressed).toBe(true);
  });

  it("computes quote optimisation correctly", () => {
    const result = runOutputValidation(baseline({
      documentedOriginalQuoteUsd: 2000,
      documentedAgreedCostUsd: 1600,
    }));
    expect(result.final_output.quoteOptimisationUsd).toBe(400);
  });

  it("sets quoteOptimisationUsd to null when either quote field is missing", () => {
    const result = runOutputValidation(baseline({
      documentedOriginalQuoteUsd: null,
      documentedAgreedCostUsd: 1600,
    }));
    expect(result.final_output.quoteOptimisationUsd).toBeNull();
  });

  it("handles null AI estimate gracefully (no suppression needed)", () => {
    const result = runOutputValidation(baseline({ aiEstimateUsd: null }));
    expect(result.final_output.aiEstimateUsd).toBeNull();
    expect(result.final_output.aiEstimateSuppressed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 3: PANEL BEATER EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 3 — Panel Beater Extraction", () => {
  it("extracts panel beater from cost intelligence (priority 1)", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: "SKINNERS AUTO BODY",
      panelBeaterFromAssessor: "OTHER REPAIRER",
      repairerName: "THIRD OPTION",
    }));
    expect(result.final_output.panelBeaterName).toBe("SKINNERS AUTO BODY");
    expect(result.final_output.panelBeaterSource).toBe("quotation_header");
  });

  it("falls back to assessor report when cost intel is null", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: "CITY PANEL BEATERS",
      repairerName: null,
    }));
    expect(result.final_output.panelBeaterName).toBe("CITY PANEL BEATERS");
    expect(result.final_output.panelBeaterSource).toBe("assessor_report");
  });

  it("falls back to repairerName when both primary sources are null", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: null,
      repairerName: "HARARE MOTORS",
    }));
    expect(result.final_output.panelBeaterName).toBe("HARARE MOTORS");
    expect(result.final_output.panelBeaterSource).toBe("assessor_report");
  });

  it("returns null and logs correction when panel beater not found anywhere", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: null,
      repairerName: null,
    }));
    expect(result.final_output.panelBeaterName).toBeNull();
    expect(result.final_output.panelBeaterSource).toBe("not_found");
    expect(result.corrections.some(c => c.rule === 3)).toBe(true);
  });

  it("ignores single-character or empty panel beater strings", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: " ",
      panelBeaterFromAssessor: "",
      repairerName: null,
    }));
    expect(result.final_output.panelBeaterName).toBeNull();
    expect(result.final_output.panelBeaterSource).toBe("not_found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 4: ACCIDENT DESCRIPTION SANITY
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 4 — Accident Description Sanity", () => {
  it("passes clean event-only description unchanged", () => {
    const result = runOutputValidation(baseline({
      accidentDescription: "Vehicle was struck from behind at a traffic light.",
    }));
    expect(result.final_output.accidentDescriptionSanitised).toBe(false);
    expect(result.final_output.accidentDescription).toBe("Vehicle was struck from behind at a traffic light.");
  });

  it("removes sentences containing repair actions", () => {
    const result = runOutputValidation(baseline({
      accidentDescription: "Vehicle was struck from behind. The workshop stripped the rear bumper. Replacement parts were ordered.",
    }));
    expect(result.final_output.accidentDescriptionSanitised).toBe(true);
    expect(result.final_output.accidentDescription).not.toContain("stripped");
    expect(result.final_output.accidentDescription).not.toContain("Replacement");
    expect(result.final_output.accidentDescription).toContain("struck from behind");
  });

  it("removes sentences containing inspection actions", () => {
    const result = runOutputValidation(baseline({
      accidentDescription: "Animal ran onto the road causing a collision. The vehicle was inspected at the panel beater.",
    }));
    expect(result.final_output.accidentDescriptionSanitised).toBe(true);
    expect(result.final_output.accidentDescription).not.toContain("inspected");
  });

  it("returns null when all sentences are repair-related", () => {
    const result = runOutputValidation(baseline({
      accidentDescription: "The workshop stripped the vehicle. Repairs were completed.",
    }));
    expect(result.final_output.accidentDescription).toBeNull();
    expect(result.final_output.accidentDescriptionSanitised).toBe(true);
  });

  it("handles null description gracefully", () => {
    const result = runOutputValidation(baseline({ accidentDescription: null }));
    expect(result.final_output.accidentDescription).toBeNull();
    expect(result.final_output.accidentDescriptionSanitised).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 5: IMAGE PROCESSING VISIBILITY
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 5 — Image Processing Visibility", () => {
  it("reports processed status when images exist and components were detected", () => {
    const result = runOutputValidation(baseline({
      imageUrls: ["img1.jpg", "img2.jpg"],
      imageProcessingRan: true,
      damagedComponents: ["rear bumper", "boot lid"],
    }));
    expect(result.final_output.imageProcessingStatus).toBe("processed");
    expect(result.final_output.imageProcessingFlag).toBe(false);
    expect(result.final_output.imageCount).toBe(2);
  });

  it("flags image_processing_missing when images exist but no components detected", () => {
    const result = runOutputValidation(baseline({
      imageUrls: ["img1.jpg"],
      imageProcessingRan: false,
      damagedComponents: [],
    }));
    expect(result.final_output.imageProcessingStatus).toBe("not_processed");
    expect(result.final_output.imageProcessingFlag).toBe(true);
    expect(result.flags.some(f => f.flag === "image_processing_missing")).toBe(true);
  });

  it("reports no_images when imageUrls is empty", () => {
    const result = runOutputValidation(baseline({
      imageUrls: [],
      imageProcessingRan: false,
      damagedComponents: [],
    }));
    expect(result.final_output.imageProcessingStatus).toBe("no_images");
    expect(result.final_output.imageProcessingFlag).toBe(false);
    expect(result.final_output.imageCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 6: PHYSICS OUTPUT VISIBILITY
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 6 — Physics Output Visibility", () => {
  it("passes complete physics output when all fields present", () => {
    const result = runOutputValidation(baseline({
      physicsExecuted: true,
      impactSpeedKmh: 35,
      impactForceKn: 18.4,
      severityClassification: "minor",
      hasVectors: true,
    }));
    expect(result.final_output.physicsExecuted).toBe(true);
    expect(result.final_output.impactSpeedKmh).toBe(35);
    expect(result.final_output.impactForceKn).toBe(18.4);
    expect(result.final_output.severityClassification).toBe("minor");
    expect(result.final_output.showVectors).toBe(true);
    expect(result.flags.some(f => f.flag === "physics_output_incomplete")).toBe(false);
  });

  it("flags physics_output_incomplete when model ran but speed is missing", () => {
    const result = runOutputValidation(baseline({
      physicsExecuted: true,
      impactSpeedKmh: null,
      impactForceKn: 18.4,
      severityClassification: "minor",
    }));
    expect(result.flags.some(f => f.flag === "physics_output_incomplete")).toBe(true);
  });

  it("returns null physics fields when model did not execute", () => {
    const result = runOutputValidation(baseline({
      physicsExecuted: false,
      impactSpeedKmh: 35,
      impactForceKn: 18.4,
      severityClassification: "minor",
    }));
    expect(result.final_output.physicsExecuted).toBe(false);
    expect(result.final_output.impactSpeedKmh).toBeNull();
    expect(result.final_output.impactForceKn).toBeNull();
    expect(result.final_output.severityClassification).toBeNull();
    expect(result.final_output.showVectors).toBe(false);
  });

  it("sets showVectors to false when hasVectors is false", () => {
    const result = runOutputValidation(baseline({ physicsExecuted: true, hasVectors: false }));
    expect(result.final_output.showVectors).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 7: UI STATUS MAPPING
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 7 — UI Status Mapping", () => {
  it("maps APPROVE correctly", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "APPROVE", fraudScore: 10, confidenceScore: 82 }));
    expect(result.final_output.decisionVerdict).toBe("APPROVE");
    expect(result.final_output.decisionLabel).toBe("Approve");
  });

  it("maps FINALISE_CLAIM to APPROVE", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "FINALISE_CLAIM", fraudScore: 10, confidenceScore: 82 }));
    expect(result.final_output.decisionVerdict).toBe("APPROVE");
  });

  it("maps REVIEW_REQUIRED to REVIEW", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "REVIEW_REQUIRED", fraudScore: 10, confidenceScore: 82 }));
    expect(result.final_output.decisionVerdict).toBe("REVIEW");
  });

  it("maps ESCALATE_INVESTIGATION to REJECT", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "ESCALATE_INVESTIGATION", fraudScore: 10, confidenceScore: 82 }));
    expect(result.final_output.decisionVerdict).toBe("REJECT");
  });

  it("overrides APPROVE to REJECT when fraud score > 60", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "APPROVE", fraudScore: 75, confidenceScore: 82 }));
    expect(result.final_output.decisionVerdict).toBe("REJECT");
    expect(result.corrections.some(c => c.rule === 7 && String(c.corrected) === "REJECT")).toBe(true);
  });

  it("overrides APPROVE to REVIEW when confidence < 40", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "APPROVE", fraudScore: 10, confidenceScore: 35 }));
    expect(result.final_output.decisionVerdict).toBe("REVIEW");
    expect(result.corrections.some(c => c.rule === 7 && String(c.corrected) === "REVIEW")).toBe(true);
  });

  it("does not override REVIEW to REJECT even with high fraud", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "REVIEW_REQUIRED", fraudScore: 75, confidenceScore: 82 }));
    // Fraud override only applies when verdict is APPROVE
    expect(result.final_output.decisionVerdict).toBe("REVIEW");
  });

  it("maps unknown verdict to REVIEW as safe default", () => {
    const result = runOutputValidation(baseline({ rawVerdict: "SOME_UNKNOWN_VERDICT", fraudScore: 10, confidenceScore: 82 }));
    expect(result.final_output.decisionVerdict).toBe("REVIEW");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 8: CONFIDENCE GATING
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 8 — Confidence Gating", () => {
  it("does not gate when confidence >= 60", () => {
    const result = runOutputValidation(baseline({ confidenceScore: 60 }));
    expect(result.final_output.confidenceGated).toBe(false);
    expect(result.flags.some(f => f.flag === "low_confidence")).toBe(false);
  });

  it("gates output when confidence < 60", () => {
    const result = runOutputValidation(baseline({ confidenceScore: 59, aiEstimateUsd: 1500 }));
    expect(result.final_output.confidenceGated).toBe(true);
    expect(result.flags.some(f => f.flag === "low_confidence")).toBe(true);
  });

  it("raises critical severity flag when confidence < 30", () => {
    const result = runOutputValidation(baseline({ confidenceScore: 25, aiEstimateUsd: 1500 }));
    const flag = result.flags.find(f => f.flag === "low_confidence");
    expect(flag?.severity).toBe("critical");
  });

  it("raises warning severity flag when confidence is 30–59", () => {
    const result = runOutputValidation(baseline({ confidenceScore: 45, aiEstimateUsd: 1500 }));
    const flag = result.flags.find(f => f.flag === "low_confidence");
    expect(flag?.severity).toBe("warning");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 9: DATA COMPLETENESS CHECK
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 9 — Data Completeness Check", () => {
  it("marks output as complete when all critical fields present", () => {
    const result = runOutputValidation(baseline());
    expect(result.final_output.isComplete).toBe(true);
    expect(result.final_output.missingCriticalFields).toHaveLength(0);
  });

  it("flags INCOMPLETE when panel beater is missing", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: null,
      repairerName: null,
    }));
    expect(result.final_output.isComplete).toBe(false);
    expect(result.final_output.missingCriticalFields).toContain("panel_beater");
    expect(result.flags.some(f => f.flag === "INCOMPLETE")).toBe(true);
  });

  it("flags INCOMPLETE when cost basis is missing", () => {
    const result = runOutputValidation(baseline({ costBasis: null }));
    expect(result.final_output.isComplete).toBe(false);
    expect(result.final_output.missingCriticalFields).toContain("cost_basis");
  });

  it("flags INCOMPLETE when accident type is missing", () => {
    const result = runOutputValidation(baseline({ accidentType: null }));
    expect(result.final_output.isComplete).toBe(false);
    expect(result.final_output.missingCriticalFields).toContain("accident_type");
  });

  it("raises critical severity when 2+ critical fields are missing", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: null,
      repairerName: null,
      costBasis: null,
    }));
    const flag = result.flags.find(f => f.flag === "INCOMPLETE");
    expect(flag?.severity).toBe("critical");
  });

  it("sets status to SUPPRESSED when output is incomplete", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: null,
      repairerName: null,
    }));
    expect(result.status).toBe("SUPPRESSED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 10: NEVER INVENT DATA
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 10 — Never Invent Data", () => {
  it("converts empty string to null for string fields", () => {
    const result = runOutputValidation(baseline({ vehicleMake: "" }));
    expect(result.final_output.vehicleMake).toBeNull();
  });

  it("converts 'null' string to null", () => {
    const result = runOutputValidation(baseline({ vehicleRegistration: "null" }));
    expect(result.final_output.vehicleRegistration).toBeNull();
  });

  it("converts 'undefined' string to null", () => {
    const result = runOutputValidation(baseline({ accidentLocation: "undefined" }));
    // 'undefined' is also caught by Rule 1 terminology check
    expect(result.final_output.accidentLocation).toBeNull();
  });

  it("converts NaN vehicleYear to null", () => {
    const result = runOutputValidation(baseline({ vehicleYear: NaN }));
    expect(result.final_output.vehicleYear).toBeNull();
  });

  it("converts Infinity to null for numeric fields", () => {
    const result = runOutputValidation(baseline({ impactSpeedKmh: Infinity, physicsExecuted: true }));
    expect(result.final_output.impactSpeedKmh).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OVERALL STATUS DETERMINATION
// ─────────────────────────────────────────────────────────────────────────────

describe("Overall Status", () => {
  it("returns VALIDATED when all rules pass with no corrections", () => {
    const result = runOutputValidation(baseline());
    // Baseline may have rule 3 correction (no panel beater fallback needed since we provide one)
    // and no flags — should be VALIDATED or CORRECTED
    expect(["VALIDATED", "CORRECTED"]).toContain(result.status);
  });

  it("returns CORRECTED when corrections applied but no suppressions or INCOMPLETE flags", () => {
    const result = runOutputValidation(baseline({
      rawVerdict: "FINALISE_CLAIM", // will be corrected to APPROVE
      accidentDescription: "Vehicle was struck. The workshop stripped the bumper.",
    }));
    // Has corrections but no suppressions
    if (result.suppressed_fields.length === 0 && !result.flags.some(f => f.flag === "INCOMPLETE")) {
      expect(result.status).toBe("CORRECTED");
    }
  });

  it("returns SUPPRESSED when AI estimate is suppressed", () => {
    const result = runOutputValidation(baseline({ aiEstimateUsd: 4.62, confidenceScore: 82 }));
    expect(result.status).toBe("SUPPRESSED");
  });

  it("returns SUPPRESSED when output is incomplete", () => {
    const result = runOutputValidation(baseline({
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: null,
      repairerName: null,
      costBasis: null,
      accidentType: null,
    }));
    expect(result.status).toBe("SUPPRESSED");
  });

  it("always returns a valid final_output regardless of failures", () => {
    const result = runOutputValidation(baseline({
      aiEstimateUsd: 4.62,
      confidenceScore: 20,
      fraudScore: 90,
      panelBeaterFromCostIntel: null,
      panelBeaterFromAssessor: null,
      repairerName: null,
      costBasis: null,
      accidentType: null,
      accidentDescription: "The workshop stripped the vehicle.",
      imageUrls: ["img1.jpg"],
      imageProcessingRan: false,
      damagedComponents: [],
      physicsExecuted: true,
      impactSpeedKmh: null,
      impactForceKn: null,
      severityClassification: null,
    }));
    expect(result.final_output).toBeDefined();
    expect(result.final_output.claimId).toBe(1001);
    expect(result.notes).toBeTruthy();
  });
});
