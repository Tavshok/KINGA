import { describe, expect, it, vi } from "vitest";
import { submitAndStartCanonicalIntake } from "./canonicalIntakeSubmission";

const actor = { id: 7, tenantId: "tenant-a", role: "claimant" };
const input = {
  idempotencyKey: "adapter-replay-001", channel: "portal", vehicleMake: "Toyota", vehicleModel: "Corolla", vehicleRegistration: "REPLAY-001",
  incidentDate: "2026-08-13", incidentLocation: "Harare", incidentDescription: "Adapter replay fixture.", attachments: [], repairerPreferences: [],
};

describe("P0 canonical intake adapter replay boundary", () => {
  it("does not start an assessment when persistence is interrupted, then starts exactly once after the replay persists one claim", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("interrupted before commit")).mockResolvedValueOnce({ claimId: 701, claimNumber: "CLM-701", idempotent: false, repairerWarnings: [] });
    const startAssessment = vi.fn().mockResolvedValue({ status: "started" });
    const dependencies = { persist, startAssessment };

    await expect(submitAndStartCanonicalIntake(dependencies, actor, input)).rejects.toThrow("interrupted before commit");
    await expect(submitAndStartCanonicalIntake(dependencies, actor, input)).resolves.toMatchObject({ claimId: 701, assessmentStartStatus: "started" });

    expect(persist).toHaveBeenCalledTimes(2);
    expect(startAssessment).toHaveBeenCalledTimes(1);
    expect(startAssessment).toHaveBeenCalledWith(actor, 701, input.idempotencyKey);
  });

  it("inspects idempotent replay state without causing a duplicate external assessment start", async () => {
    const persist = vi.fn().mockResolvedValueOnce({ claimId: 702, claimNumber: "CLM-702", idempotent: false, repairerWarnings: [] }).mockResolvedValueOnce({ claimId: 702, claimNumber: "CLM-702", idempotent: true, repairerWarnings: [] });
    let externalAssessmentStarts = 0;
    const startAssessment = vi.fn().mockImplementation(async () => {
      if (externalAssessmentStarts > 0) return { status: "already_recorded" as const };
      externalAssessmentStarts += 1;
      return { status: "started" as const };
    });

    await expect(submitAndStartCanonicalIntake({ persist, startAssessment }, actor, input)).resolves.toMatchObject({ claimId: 702, assessmentStartStatus: "started" });
    await expect(submitAndStartCanonicalIntake({ persist, startAssessment }, actor, input)).resolves.toMatchObject({ claimId: 702, idempotent: true, assessmentStartStatus: "already_recorded" });

    expect(persist).toHaveBeenCalledTimes(2);
    expect(startAssessment).toHaveBeenCalledTimes(2);
    expect(externalAssessmentStarts).toBe(1);
  });

  it("preserves a recoverable assessment-start state on idempotent replay without creating another persisted claim or notification", async () => {
    const persist = vi.fn().mockResolvedValueOnce({ claimId: 702, claimNumber: "CLM-702", idempotent: false, repairerWarnings: [] }).mockResolvedValueOnce({ claimId: 702, claimNumber: "CLM-702", idempotent: true, repairerWarnings: [] });
    let recoveryNotifications = 0;
    const startAssessment = vi.fn().mockImplementation(async () => {
      if (recoveryNotifications > 0) return { status: "recoverable_failure" as const };
      recoveryNotifications += 1;
      return { status: "recoverable_failure" as const };
    });
    const dependencies = { persist, startAssessment };

    const first = await submitAndStartCanonicalIntake(dependencies, actor, input);
    const replay = await submitAndStartCanonicalIntake(dependencies, actor, input);

    expect(first).toMatchObject({ claimId: 702, idempotent: false, assessmentStartStatus: "recoverable_failure" });
    expect(replay).toMatchObject({ claimId: 702, idempotent: true, assessmentStartStatus: "recoverable_failure" });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(startAssessment).toHaveBeenCalledTimes(2);
    expect(recoveryNotifications).toBe(1);
  });
});
