import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const canonicalIntakeSource = readFileSync(resolve(projectRoot, "server/services/canonicalClaimIntake.ts"), "utf8");
const assistedSubmissionSource = readFileSync(resolve(projectRoot, "server/agency/agencyAssistedClaimSubmission.ts"), "utf8");

describe("agency-assisted assessment-start recovery wiring", () => {
  it("records the canonical recoverable failure state and in-app notification without changing the persisted claim identity", () => {
    expect(canonicalIntakeSource).toContain('documentProcessingStatus: "ASSESSMENT_START_FAILED"');
    expect(canonicalIntakeSource).toContain('status: "assessment_start_failed"');
    expect(canonicalIntakeSource).toContain('action: "assessment_start_recoverable_failure"');
    expect(canonicalIntakeSource).toContain("Claim received — assessment start needs attention");
    expect(canonicalIntakeSource).toContain('return { status: "recoverable_failure" as const }');
  });

  it("returns the recovery state through the agency-assisted service without another persistence call", () => {
    expect(assistedSubmissionSource).toContain("const assessmentStart = await dependencies.startAssessment");
    expect(assistedSubmissionSource).toContain("assessmentStartStatus: assessmentStart?.status");
    expect(assistedSubmissionSource).toContain("const persisted = await dependencies.persist");
  });
});
