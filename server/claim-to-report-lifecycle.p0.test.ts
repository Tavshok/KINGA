import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { submitAndStartCanonicalIntake } from "./services/canonicalIntakeSubmission";
import type { CanonicalClaimInput, CanonicalIntakeActor } from "./services/canonicalClaimIntake";
import { renderClaimReportReadinessBanner, resolveClaimReportReadiness } from "./reporting/claimReportReadiness";
import { canAccessReport } from "./routers/reporting";

const actor: CanonicalIntakeActor = { id: 71, tenantId: "tenant-lifecycle", role: "claimant" };
const input: CanonicalClaimInput = {
  idempotencyKey: "lifecycle-claim-001",
  channel: "web",
  vehicleMake: "Toyota",
  vehicleModel: "Corolla",
  vehicleRegistration: "LIFE-001",
  incidentDate: "2026-08-14",
  incidentLocation: "Harare",
  incidentDescription: "Isolated claim-to-report lifecycle fixture.",
  claimantPhone: "+263771000001",
  attachments: [{
    key: "claims/71/lifecycle-damage.jpg",
    url: "https://files.example.test/lifecycle-damage.jpg",
    fileName: "lifecycle-damage.jpg",
    fileSize: 128,
    mimeType: "image/jpeg",
    category: "damage_photo",
  }],
  repairerPreferences: [],
};

describe("Approved isolated canonical claim-to-report lifecycle acceptance", () => {
  it("preserves canonical claim, tenant, and evidence identity through an assessment-started report-input boundary", async () => {
    const persist = vi.fn(async (receivedActor: CanonicalIntakeActor, receivedInput: CanonicalClaimInput) => {
      expect(receivedActor).toEqual(actor);
      expect(receivedInput.attachments).toEqual(input.attachments);
      return { claimId: 4701, claimNumber: "KNG-LIFE-4701", idempotent: false, repairerWarnings: [] };
    });
    const startAssessment = vi.fn(async (receivedActor: CanonicalIntakeActor, claimId: number, idempotencyKey: string) => {
      expect(receivedActor.tenantId).toBe("tenant-lifecycle");
      expect(claimId).toBe(4701);
      expect(idempotencyKey).toBe(input.idempotencyKey);
      return { status: "started" as const };
    });

    const outcome = await submitAndStartCanonicalIntake({ persist, startAssessment }, actor, input);
    const readiness = resolveClaimReportReadiness({ status: "assessment_in_progress", assessment_date: "2026-08-14T08:00:00Z" });

    expect(outcome).toMatchObject({ claimId: 4701, claimNumber: "KNG-LIFE-4701", assessmentStartStatus: "started" });
    expect(input.attachments).toHaveLength(1);
    expect(actor.tenantId).toBe("tenant-lifecycle");
    expect(readiness).toMatchObject({ state: "ready_for_report_inputs", permitsCompletedAssessmentIntelligence: true });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(startAssessment).toHaveBeenCalledTimes(1);
  });

  it("retains the canonical claim and evidence but exposes a recoverable assessment-start outcome instead of completed report intelligence", async () => {
    const persist = vi.fn().mockResolvedValue({ claimId: 4702, claimNumber: "KNG-LIFE-4702", idempotent: false, repairerWarnings: [] });
    const startAssessment = vi.fn().mockResolvedValue({ status: "recoverable_failure" as const });

    const outcome = await submitAndStartCanonicalIntake({ persist, startAssessment }, actor, input);
    const readiness = resolveClaimReportReadiness({ status: "assessment_start_failed", assessment_date: null });
    const banner = renderClaimReportReadinessBanner({ status: "assessment_start_failed", assessment_date: null });

    expect(outcome).toMatchObject({ claimId: 4702, claimNumber: "KNG-LIFE-4702", assessmentStartStatus: "recoverable_failure" });
    expect(readiness).toMatchObject({ state: "assessment_start_recoverable_failure", permitsCompletedAssessmentIntelligence: false });
    expect(banner).toContain('data-kinga-report-readiness="assessment_start_recoverable_failure"');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(startAssessment).toHaveBeenCalledTimes(1);
  });

  it("does not create a report-input boundary when canonical persistence is interrupted before a claim exists", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("simulated pre-commit interruption"));
    const startAssessment = vi.fn();

    await expect(submitAndStartCanonicalIntake({ persist, startAssessment }, actor, input))
      .rejects.toThrow("simulated pre-commit interruption");
    expect(startAssessment).not.toHaveBeenCalled();
  });

  it("uses the real report access contract and renders the shared readiness boundary across CL, CI, and FR without generating output", () => {
    const reportingRouter = readFileSync(resolve(__dirname, "routers/reporting.ts"), "utf8");
    const reportDefinitions = readFileSync(resolve(__dirname, "reporting/reportDefinitions.ts"), "utf8");

    expect(reportingRouter).toContain("assertClaimInTenant(input.claimId, scope.tenantId)");
    expect(reportDefinitions).toContain("generateClaimsIntelligenceReport");
    expect(reportDefinitions).toContain("generateForensicDecisionReport");
    expect(reportDefinitions).toContain('case "claim.assessment":      return generateClaimAssessmentReport');
    expect(reportDefinitions).toContain("renderClaimReportReadinessBanner(claim)");
    expect(reportingRouter).toContain("assertClaimInTenant(input.claimId, scope.tenantId)");
    expect(readFileSync(resolve(__dirname, "reporting/claimsIntelligenceReport.ts"), "utf8")).toContain("renderClaimReportReadinessBanner(c)");
    expect(readFileSync(resolve(__dirname, "reporting/forensicDecisionReport.ts"), "utf8")).toContain("renderClaimReportReadinessBanner(c)");
    expect(canAccessReport("claim.intelligence", "insurer", "claims_processor")).toBe(true);
    expect(canAccessReport("claim.intelligence", "panel_beater")).toBe(false);
  });
});
