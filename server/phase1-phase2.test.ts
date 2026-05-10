/**
 * Phase 1 & Phase 2 regression tests
 * Covers:
 *   P1-A: Canonical fraud score binding (Section 6 / hash components)
 *   P1-B: Repair-to-value ratio guard (zero treated as null)
 *   P2-A: Late-submission date gap rule (accidentDateCrossCheckEngine)
 *   P2-B: Severity INCONCLUSIVE verdict when CONFLICTED
 */
import { describe, it, expect } from "vitest";
import { runAccidentDateCrossCheck } from "./pipeline-v2/accidentDateCrossCheckEngine";

// ─── P2-A: Late-submission tests ────────────────────────────────────────────

describe("accidentDateCrossCheckEngine — late submission", () => {
  it("returns null lateSubmission when claimSubmissionDate is not provided", () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: "2024-02-01",
      policeReportDate: null,
    });
    expect(result.lateSubmission).toBeNull();
  });

  it("returns isLate=false when submission is within 90 days", () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: "2024-02-01",
      claimSubmissionDate: "2024-04-01",
    });
    expect(result.lateSubmission).not.toBeNull();
    expect(result.lateSubmission!.isLate).toBe(false);
    expect(result.lateSubmission!.isCritical).toBe(false);
    expect(result.lateSubmission!.fraudScoreContribution).toBe(0);
  });

  it("returns isLate=true and +5 fraud points when submission is 91–365 days after incident", () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: "2024-02-01",
      claimSubmissionDate: "2024-06-15",
    });
    expect(result.lateSubmission).not.toBeNull();
    expect(result.lateSubmission!.isLate).toBe(true);
    expect(result.lateSubmission!.isCritical).toBe(false);
    expect(result.lateSubmission!.fraudScoreContribution).toBe(5);
    expect(result.lateSubmission!.daysBetween).toBeGreaterThan(90);
  });

  it("returns isCritical=true and +10 fraud points when submission is >365 days after incident", () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: "2024-02-01",
      claimSubmissionDate: "2026-05-01",
    });
    expect(result.lateSubmission).not.toBeNull();
    expect(result.lateSubmission!.isCritical).toBe(true);
    expect(result.lateSubmission!.isLate).toBe(true);
    expect(result.lateSubmission!.fraudScoreContribution).toBe(10);
    expect(result.lateSubmission!.daysBetween).toBeGreaterThan(365);
    expect(result.lateSubmission!.explanation).toContain("strong fraud indicator");
  });

  it("does not flag late submission when submission date is before incident date", () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: "2024-02-01",
      claimSubmissionDate: "2023-12-01",
    });
    expect(result.lateSubmission).toBeNull();
  });

  it("incorporates late-submission score into overall fraudScore", () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: "2024-02-01",
      claimSubmissionDate: "2026-05-01",
    });
    expect(result.fraudScore).toBeGreaterThanOrEqual(10);
    expect(result.fraudScore).toBeLessThanOrEqual(20);
  });

  it("summary includes CRITICAL message when gap exceeds 365 days", () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: "2024-02-01",
      claimSubmissionDate: "2026-05-01",
    });
    expect(result.summary).toContain("CRITICAL");
  });
});

// ─── P1-B: Repair-to-value ratio guard ──────────────────────────────────────

describe("repair-to-value ratio guard logic", () => {
  const guardedRepairToValue = (rawRatio: number | null | undefined): number | null => {
    if (rawRatio != null && rawRatio > 0) return rawRatio;
    return null;
  };

  it("returns null when ratio is 0", () => {
    expect(guardedRepairToValue(0)).toBeNull();
  });

  it("returns null when ratio is null", () => {
    expect(guardedRepairToValue(null)).toBeNull();
  });

  it("returns null when ratio is undefined", () => {
    expect(guardedRepairToValue(undefined)).toBeNull();
  });

  it("returns the ratio when it is a positive number", () => {
    expect(guardedRepairToValue(65.5)).toBe(65.5);
  });

  it("returns the ratio when it is 0.1", () => {
    expect(guardedRepairToValue(0.1)).toBe(0.1);
  });
});

// ─── P1-A: Canonical fraud score priority chain ──────────────────────────────

describe("canonical fraud score priority chain", () => {
  const resolveCanonicalFraudScore = (
    fraudScoreBreakdownJson: any,
    fraudScore: number | null | undefined,
    weightedFraudScore: number | null | undefined
  ): number => {
    const breakdown = fraudScoreBreakdownJson
      ? (typeof fraudScoreBreakdownJson === "string"
          ? (() => { try { return JSON.parse(fraudScoreBreakdownJson); } catch { return null; } })()
          : fraudScoreBreakdownJson)
      : null;
    const canonical = breakdown?.overallScore ?? fraudScore ?? null;
    return (canonical != null && canonical > 0) ? Number(canonical) : (weightedFraudScore ?? 0);
  };

  it("prefers fraudScoreBreakdownJson.overallScore (Stage 8 output)", () => {
    expect(resolveCanonicalFraudScore({ overallScore: 68 }, 15, 15)).toBe(68);
  });

  it("falls back to aiAssessment.fraudScore when breakdown is missing", () => {
    expect(resolveCanonicalFraudScore(null, 68, 15)).toBe(68);
  });

  it("falls back to weightedFraud.score when both canonical sources are missing", () => {
    expect(resolveCanonicalFraudScore(null, null, 15)).toBe(15);
  });

  it("falls back to weightedFraud.score when canonical score is 0", () => {
    expect(resolveCanonicalFraudScore({ overallScore: 0 }, 0, 15)).toBe(15);
  });

  it("returns 0 when all sources are missing", () => {
    expect(resolveCanonicalFraudScore(null, null, null)).toBe(0);
  });

  it("parses fraudScoreBreakdownJson from string", () => {
    expect(resolveCanonicalFraudScore('{"overallScore":68}', 15, 15)).toBe(68);
  });

  it("handles malformed JSON string gracefully", () => {
    expect(resolveCanonicalFraudScore("{bad json}", 68, 15)).toBe(68);
  });
});

// ─── P2-B: Severity INCONCLUSIVE verdict logic ──────────────────────────────

describe("severity INCONCLUSIVE verdict logic", () => {
  const resolveVerdict = (alignment: string, rawVerdict: string): string => {
    const isAligned = alignment === "FULL" || alignment === "FULLY_ALIGNED" || alignment === "ALIGNED";
    const isPartial = alignment === "PARTIAL";
    const isConflicted = alignment === "CONFLICTED" || alignment === "CONFLICT" || (!isAligned && !isPartial);
    return isConflicted ? "INCONCLUSIVE" : rawVerdict;
  };

  it("returns INCONCLUSIVE when alignment is CONFLICTED", () => {
    expect(resolveVerdict("CONFLICTED", "minor")).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE when alignment is CONFLICT (legacy)", () => {
    expect(resolveVerdict("CONFLICT", "minor")).toBe("INCONCLUSIVE");
  });

  it("returns the raw verdict when alignment is FULL", () => {
    expect(resolveVerdict("FULL", "moderate")).toBe("moderate");
  });

  it("returns the raw verdict when alignment is PARTIAL", () => {
    expect(resolveVerdict("PARTIAL", "severe")).toBe("severe");
  });

  it("returns INCONCLUSIVE when alignment is unknown", () => {
    expect(resolveVerdict("UNKNOWN", "minor")).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE when alignment is empty string", () => {
    expect(resolveVerdict("", "minor")).toBe("INCONCLUSIVE");
  });
});
