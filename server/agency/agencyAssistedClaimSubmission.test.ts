import { describe, expect, it, vi } from "vitest";
import { submitAgencyAssistedCanonicalClaim } from "./agencyAssistedClaimSubmission";

const attachment = { key: "agency-claims/55/damage.jpg", url: "https://example.test/damage.jpg", fileName: "damage.jpg", fileSize: 1, mimeType: "image/jpeg", category: "damage_photo" as const };
const input = { agencyClientId: 7, insurerTenantId: "insurer-a", idempotencyKey: "agency-assisted-key-1", vehicleMake: "Toyota", vehicleModel: "Corolla", vehicleRegistration: "ABC123", incidentDate: "2026-08-13", incidentLocation: "Harare", incidentDescription: "Rear impact", attachments: [attachment], repairerPreferences: [] };

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    agencyTenantId: "agency-a", agencyUserId: 55,
    loadScopedClient: vi.fn().mockResolvedValue({ id: 7, fullName: "Client", phone: "+263771000000" }),
    insurerExists: vi.fn().mockResolvedValue(true),
    resolveActor: vi.fn().mockResolvedValue({ id: 901, tenantId: "insurer-a", role: "claimant", uploadKeyPrefixes: ["agency-claims/55/"], identityId: 18, trustLevel: "restricted_agency_assisted" }),
    persist: vi.fn().mockResolvedValue({ claimId: 22, claimNumber: "CLM-22", idempotent: false, repairerWarnings: [] }),
    startAssessment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

describe("agency-assisted canonical claim submission", () => {
  it("preserves agency provenance and calls canonical persistence with tenant-scoped evidence", async () => {
    const deps = dependencies();
    const result = await submitAgencyAssistedCanonicalClaim(deps, input);
    expect(result).toMatchObject({ claimId: 22, claimantIdentityTrust: "restricted_agency_assisted" });
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "insurer-a" }), expect.objectContaining({ channel: "agency_assisted", sourceMetadata: expect.objectContaining({ agencyTenantId: "agency-a", agencyClientId: 7 }) }));
    expect(deps.startAssessment).toHaveBeenCalledWith(expect.anything(), 22, input.idempotencyKey);
  });

  it("rejects a foreign agency client or insurer before canonical persistence", async () => {
    await expect(submitAgencyAssistedCanonicalClaim(dependencies({ loadScopedClient: vi.fn().mockResolvedValue(null) }), input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitAgencyAssistedCanonicalClaim(dependencies({ insurerExists: vi.fn().mockResolvedValue(false) }), input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a restricted claimant identity resolved from another insurer tenant before canonical persistence", async () => {
    const persist = vi.fn();
    await expect(submitAgencyAssistedCanonicalClaim(dependencies({
      persist,
      resolveActor: vi.fn().mockResolvedValue({ id: 901, tenantId: "insurer-b", role: "claimant", uploadKeyPrefixes: ["agency-claims/55/"], identityId: 18, trustLevel: "restricted_agency_assisted" }),
    }), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects an attachment outside the agency actor ownership prefix", async () => {
    await expect(submitAgencyAssistedCanonicalClaim(dependencies(), { ...input, attachments: [{ ...attachment, key: "agency-claims/other/damage.jpg" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes idempotent replays to the canonical recovery-safe assessment starter without a second claim write", async () => {
    const persist = vi.fn().mockResolvedValue({ claimId: 22, claimNumber: "CLM-22", idempotent: true, repairerWarnings: [] });
    const startAssessment = vi.fn().mockResolvedValue(undefined);
    await submitAgencyAssistedCanonicalClaim(dependencies({ persist, startAssessment }), input);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(startAssessment).toHaveBeenCalledWith(expect.anything(), 22, input.idempotencyKey);
  });

  it("returns a recoverable assessment-start state without duplicating the persisted claim or evidence", async () => {
    const persist = vi.fn().mockResolvedValue({ claimId: 22, claimNumber: "CLM-22", idempotent: false, repairerWarnings: [] });
    const startAssessment = vi.fn().mockResolvedValue({ status: "recoverable_failure" });
    const result = await submitAgencyAssistedCanonicalClaim(dependencies({ persist, startAssessment }), input);
    expect(result.assessmentStartStatus).toBe("recoverable_failure");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(startAssessment).toHaveBeenCalledTimes(1);
  });
});
