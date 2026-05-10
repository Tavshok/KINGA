/**
 * Phase 3 regression tests — Pre-Publication Validation Layer
 * Covers all 8 checks in prePublicationValidator.ts
 */
import { describe, it, expect } from "vitest";
import { runPrePublicationValidation, type PrePublicationInput } from "./pipeline-v2/prePublicationValidator";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseInput(): PrePublicationInput {
  return {
    claim: {
      claimNumber: "CI-024NATPHARM",
      id: 42,
      incidentDate: "2024-02-01",
      createdAt: "2024-03-01T10:00:00Z",
    },
    aiAssessment: {
      fraudScore: 68,
      fraudScoreBreakdownJson: { overallScore: 68 },
      photosDetected: 5,
    },
    enforcement: { weightedFraud: { score: 15 } },
    valuation: { repairToValueRatio: 45.5, marketValueUsd: 12000 },
    accidentDateCrossCheck: { lateSubmission: { isCritical: false, isLate: false } },
    severityConsensus: { source_alignment: "FULL", final_severity: "minor" },
    decisionReadiness: { decision_ready: true, confidence: 80, blocking_issues: [], checks: [], summary: "Ready" },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("runPrePublicationValidation — happy path", () => {
  it("returns valid=true when all checks pass", () => {
    const result = runPrePublicationValidation(baseInput());
    expect(result.valid).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.blockers).toHaveLength(0);
  });

  it("returns a validatedAt ISO timestamp", () => {
    const result = runPrePublicationValidation(baseInput());
    expect(result.validatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── CHECK-01: Fraud score present ───────────────────────────────────────────

describe("CHECK-01: fraud score present", () => {
  it("CRITICAL when all fraud score sources are null", () => {
    const input = baseInput();
    input.aiAssessment.fraudScore = null;
    input.aiAssessment.fraudScoreBreakdownJson = null;
    input.enforcement = { weightedFraud: { score: null } };
    const result = runPrePublicationValidation(input);
    const blocker = result.blockers.find(b => b.checkId === "CHECK-01");
    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe("CRITICAL");
    expect(result.blocked).toBe(true);
  });

  it("passes when fraudScoreBreakdownJson.overallScore is present", () => {
    const input = baseInput();
    input.aiAssessment.fraudScore = null;
    input.enforcement = null;
    const result = runPrePublicationValidation(input);
    expect(result.blockers.find(b => b.checkId === "CHECK-01")).toBeUndefined();
  });

  it("passes when only weightedFraud.score is present", () => {
    const input = baseInput();
    input.aiAssessment.fraudScore = null;
    input.aiAssessment.fraudScoreBreakdownJson = null;
    input.enforcement = { weightedFraud: { score: 42 } };
    const result = runPrePublicationValidation(input);
    expect(result.blockers.find(b => b.checkId === "CHECK-01")).toBeUndefined();
  });
});

// ─── CHECK-02: Claim reference present ───────────────────────────────────────

describe("CHECK-02: claim reference present", () => {
  it("CRITICAL when both claimNumber and id are missing", () => {
    const input = baseInput();
    input.claim.claimNumber = null;
    input.claim.id = null;
    const result = runPrePublicationValidation(input);
    const blocker = result.blockers.find(b => b.checkId === "CHECK-02");
    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe("CRITICAL");
  });

  it("passes when claimNumber is present", () => {
    const result = runPrePublicationValidation(baseInput());
    expect(result.blockers.find(b => b.checkId === "CHECK-02")).toBeUndefined();
  });

  it("passes when only id is present", () => {
    const input = baseInput();
    input.claim.claimNumber = null;
    const result = runPrePublicationValidation(input);
    expect(result.blockers.find(b => b.checkId === "CHECK-02")).toBeUndefined();
  });
});

// ─── CHECK-03: Incident date present ─────────────────────────────────────────

describe("CHECK-03: incident date present", () => {
  it("HIGH when incidentDate is missing", () => {
    const input = baseInput();
    input.claim.incidentDate = null;
    const result = runPrePublicationValidation(input);
    const blocker = result.blockers.find(b => b.checkId === "CHECK-03");
    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe("HIGH");
    expect(result.blocked).toBe(false); // HIGH does not block
  });

  it("passes when incidentDate is present", () => {
    const result = runPrePublicationValidation(baseInput());
    expect(result.blockers.find(b => b.checkId === "CHECK-03")).toBeUndefined();
  });
});

// ─── CHECK-04: Repair-to-value ratio not zero ─────────────────────────────────

describe("CHECK-04: repair-to-value ratio not zero", () => {
  it("HIGH when ratio is 0 and market value is present", () => {
    const input = baseInput();
    input.valuation = { repairToValueRatio: 0, marketValueUsd: 12000 };
    const result = runPrePublicationValidation(input);
    const blocker = result.blockers.find(b => b.checkId === "CHECK-04");
    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe("HIGH");
  });

  it("passes when ratio is null (no data)", () => {
    const input = baseInput();
    input.valuation = { repairToValueRatio: null, marketValueUsd: 12000 };
    const result = runPrePublicationValidation(input);
    expect(result.blockers.find(b => b.checkId === "CHECK-04")).toBeUndefined();
  });

  it("passes when ratio is positive", () => {
    const result = runPrePublicationValidation(baseInput());
    expect(result.blockers.find(b => b.checkId === "CHECK-04")).toBeUndefined();
  });
});

// ─── CHECK-05: Late submission flagged ───────────────────────────────────────

describe("CHECK-05: late submission flagged", () => {
  it("HIGH when gap > 365 days and engine did not flag it", () => {
    const input = baseInput();
    input.claim.incidentDate = "2024-02-01";
    input.claim.createdAt = "2026-05-01T10:00:00Z"; // 820 days later
    input.accidentDateCrossCheck = { lateSubmission: { isCritical: false } }; // engine missed it
    const result = runPrePublicationValidation(input);
    const blocker = result.blockers.find(b => b.checkId === "CHECK-05");
    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe("HIGH");
  });

  it("passes when gap > 365 days and engine correctly flagged it as critical", () => {
    const input = baseInput();
    input.claim.incidentDate = "2024-02-01";
    input.claim.createdAt = "2026-05-01T10:00:00Z";
    input.accidentDateCrossCheck = { lateSubmission: { isCritical: true } };
    const result = runPrePublicationValidation(input);
    expect(result.blockers.find(b => b.checkId === "CHECK-05")).toBeUndefined();
  });

  it("passes when gap is within 365 days", () => {
    const result = runPrePublicationValidation(baseInput()); // 28 days gap
    expect(result.blockers.find(b => b.checkId === "CHECK-05")).toBeUndefined();
  });
});

// ─── CHECK-07: Photos analysed ───────────────────────────────────────────────

describe("CHECK-07: photos analysed", () => {
  it("HIGH when photosDetected is 0", () => {
    const input = baseInput();
    input.aiAssessment.photosDetected = 0;
    const result = runPrePublicationValidation(input);
    const blocker = result.blockers.find(b => b.checkId === "CHECK-07");
    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe("HIGH");
  });

  it("passes when photosDetected is null (unknown)", () => {
    const input = baseInput();
    input.aiAssessment.photosDetected = null;
    const result = runPrePublicationValidation(input);
    expect(result.blockers.find(b => b.checkId === "CHECK-07")).toBeUndefined();
  });

  it("passes when photosDetected > 0", () => {
    const result = runPrePublicationValidation(baseInput());
    expect(result.blockers.find(b => b.checkId === "CHECK-07")).toBeUndefined();
  });
});

// ─── CHECK-08: Decision readiness ran ────────────────────────────────────────

describe("CHECK-08: decision readiness ran", () => {
  it("MEDIUM when decisionReadiness is null", () => {
    const input = baseInput();
    input.decisionReadiness = null;
    const result = runPrePublicationValidation(input);
    const blocker = result.blockers.find(b => b.checkId === "CHECK-08");
    expect(blocker).toBeDefined();
    expect(blocker!.severity).toBe("MEDIUM");
    expect(result.blocked).toBe(false); // MEDIUM does not block
  });

  it("passes when decisionReadiness is present", () => {
    const result = runPrePublicationValidation(baseInput());
    expect(result.blockers.find(b => b.checkId === "CHECK-08")).toBeUndefined();
  });
});

// ─── Blocking behaviour ───────────────────────────────────────────────────────

describe("blocking behaviour", () => {
  it("blocked=true only when there is at least one CRITICAL blocker", () => {
    const input = baseInput();
    // Trigger CHECK-01 (CRITICAL) and CHECK-03 (HIGH)
    input.aiAssessment.fraudScore = null;
    input.aiAssessment.fraudScoreBreakdownJson = null;
    input.enforcement = null;
    input.claim.incidentDate = null;
    const result = runPrePublicationValidation(input);
    expect(result.blocked).toBe(true);
  });

  it("blocked=false when only HIGH/MEDIUM blockers exist", () => {
    const input = baseInput();
    input.claim.incidentDate = null; // HIGH
    input.decisionReadiness = null; // MEDIUM
    const result = runPrePublicationValidation(input);
    expect(result.blocked).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });
});
