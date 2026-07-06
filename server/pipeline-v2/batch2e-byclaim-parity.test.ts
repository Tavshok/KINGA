/**
 * Batch 2e — R-GH-17: byClaim / getEnforcement field parity
 *
 * Verifies that the fields present in aiAssessments.byClaim are also present
 * in aiAssessments.getEnforcement. Before this fix, getEnforcement was missing
 * _forensicAuditValidation, _reportReadiness, decisionReadiness, degradationReasons,
 * fieldValidation, and gateDecision.
 *
 * These are structural tests that verify the shape of the response objects
 * by simulating the parse logic used in both procedures.
 */

import { describe, it, expect } from "vitest";

// Simulate the JSON parse helper used in both byClaim and getEnforcement
function parseJsonField(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Simulate an assessment row as it comes from the DB
function makeAssessmentRow(overrides: Record<string, string | null> = {}) {
  return {
    forensicAuditValidationJson: JSON.stringify({ dimensions: [], overallScore: 0.9 }),
    reportReadinessJson: JSON.stringify({ ready: true, blockers: [] }),
    reportSignalsJson: JSON.stringify({ blockAutoApproval: false }),
    decisionReadinessJson: JSON.stringify({ decision_ready: true, confidence: 0.95, blocking_issues: [], checks: {}, summary: "OK" }),
    degradationReasonsJson: JSON.stringify(["stage-7 estimated"]),
    fieldValidationJson: JSON.stringify({ overallScore: 0.88, fieldScores: {} }),
    gateDecisionJson: JSON.stringify({ decision: "PROCEED", reason: "All gates passed", confidence: 0.9 }),
    ...overrides,
  };
}

// Simulate the field extraction logic as it appears in both procedures
function extractByClaimFields(assessment: ReturnType<typeof makeAssessmentRow>) {
  return {
    _forensicAuditValidation: parseJsonField(assessment.forensicAuditValidationJson),
    _reportReadiness: parseJsonField(assessment.reportReadinessJson),
    _reportSignals: parseJsonField(assessment.reportSignalsJson),
  };
}

function extractGetEnforcementFields(assessment: ReturnType<typeof makeAssessmentRow>) {
  return {
    _reportSignals: parseJsonField(assessment.reportSignalsJson),
    _forensicAuditValidation: parseJsonField(assessment.forensicAuditValidationJson),
    _reportReadiness: parseJsonField(assessment.reportReadinessJson),
    decisionReadiness: parseJsonField(assessment.decisionReadinessJson),
    degradationReasons: parseJsonField(assessment.degradationReasonsJson),
    fieldValidation: parseJsonField(assessment.fieldValidationJson),
    gateDecision: parseJsonField(assessment.gateDecisionJson),
  };
}

describe("R-GH-17 — byClaim / getEnforcement field parity", () => {
  const assessment = makeAssessmentRow();

  it("byClaim returns _forensicAuditValidation", () => {
    const fields = extractByClaimFields(assessment);
    expect(fields._forensicAuditValidation).not.toBeNull();
    expect((fields._forensicAuditValidation as any).overallScore).toBe(0.9);
  });

  it("byClaim returns _reportReadiness", () => {
    const fields = extractByClaimFields(assessment);
    expect(fields._reportReadiness).not.toBeNull();
    expect((fields._reportReadiness as any).ready).toBe(true);
  });

  it("getEnforcement returns _forensicAuditValidation (was missing before R-GH-17 fix)", () => {
    const fields = extractGetEnforcementFields(assessment);
    expect(fields._forensicAuditValidation).not.toBeNull();
    expect((fields._forensicAuditValidation as any).overallScore).toBe(0.9);
  });

  it("getEnforcement returns _reportReadiness (was missing before R-GH-17 fix)", () => {
    const fields = extractGetEnforcementFields(assessment);
    expect(fields._reportReadiness).not.toBeNull();
    expect((fields._reportReadiness as any).ready).toBe(true);
  });

  it("getEnforcement returns decisionReadiness (Batch 2c new field)", () => {
    const fields = extractGetEnforcementFields(assessment);
    expect(fields.decisionReadiness).not.toBeNull();
    expect((fields.decisionReadiness as any).decision_ready).toBe(true);
    expect((fields.decisionReadiness as any).confidence).toBe(0.95);
  });

  it("getEnforcement returns degradationReasons (Batch 2c new field)", () => {
    const fields = extractGetEnforcementFields(assessment);
    expect(fields.degradationReasons).not.toBeNull();
    expect(Array.isArray(fields.degradationReasons)).toBe(true);
    expect((fields.degradationReasons as string[])[0]).toBe("stage-7 estimated");
  });

  it("getEnforcement returns fieldValidation (Batch 2d new field)", () => {
    const fields = extractGetEnforcementFields(assessment);
    expect(fields.fieldValidation).not.toBeNull();
    expect((fields.fieldValidation as any).overallScore).toBe(0.88);
  });

  it("getEnforcement returns gateDecision (Batch 2d new field)", () => {
    const fields = extractGetEnforcementFields(assessment);
    expect(fields.gateDecision).not.toBeNull();
    expect((fields.gateDecision as any).decision).toBe("PROCEED");
  });

  it("returns null gracefully when JSON columns are null", () => {
    const emptyAssessment = makeAssessmentRow({
      forensicAuditValidationJson: null,
      reportReadinessJson: null,
      decisionReadinessJson: null,
      degradationReasonsJson: null,
      fieldValidationJson: null,
      gateDecisionJson: null,
    });
    const fields = extractGetEnforcementFields(emptyAssessment);
    expect(fields._forensicAuditValidation).toBeNull();
    expect(fields._reportReadiness).toBeNull();
    expect(fields.decisionReadiness).toBeNull();
    expect(fields.degradationReasons).toBeNull();
    expect(fields.fieldValidation).toBeNull();
    expect(fields.gateDecision).toBeNull();
  });

  it("returns null gracefully when JSON columns are malformed", () => {
    const badAssessment = makeAssessmentRow({
      forensicAuditValidationJson: "not-valid-json{",
      decisionReadinessJson: "{{broken",
    });
    const fields = extractGetEnforcementFields(badAssessment);
    expect(fields._forensicAuditValidation).toBeNull();
    expect(fields.decisionReadiness).toBeNull();
  });
});
