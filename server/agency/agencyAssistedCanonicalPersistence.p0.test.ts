import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, generateKingaRef } = vi.hoisted(() => ({ getDb: vi.fn(), generateKingaRef: vi.fn() }));

vi.mock("../db", () => ({
  getDb,
  generateKingaRef,
  createAuditEntry: vi.fn(),
  emitClaimEvent: vi.fn(),
  createNotification: vi.fn(),
  triggerAiAssessment: vi.fn(),
}));

function makePersistenceDb(captured: { claim?: Record<string, unknown>; documents: Array<Record<string, unknown>> }) {
  let insertCall = 0;
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        insertCall += 1;
        if (insertCall === 2) captured.claim = value;
        if (insertCall >= 3) captured.documents.push(value);
        return [{ insertId: insertCall === 2 ? 701 : insertCall }];
      }),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  };
  return {
    select: vi.fn(() => {
      const builder: any = { from: () => builder, where: () => builder, limit: async () => [] };
      return builder;
    }),
    transaction: async (work: (value: typeof tx) => Promise<void>) => work(tx),
  };
}

describe("P0 agency-assisted canonical persistence", () => {
  beforeEach(() => vi.resetAllMocks());

  it("persists the canonical claim and document evidence contract with restricted identity and agency provenance", async () => {
    const { submitAgencyAssistedCanonicalClaim } = await import("./agencyAssistedClaimSubmission");
    const captured = { documents: [] as Array<Record<string, unknown>> };
    getDb.mockResolvedValue(makePersistenceDb(captured));
    generateKingaRef.mockResolvedValue("KNG-AGENCY-PERSISTENCE");
    const { persistCanonicalClaimIntake } = await import("../services/canonicalClaimIntake");
    const attachment = { key: "agency-claims/55/damage.jpg", url: "https://files.example.test/agency-damage.jpg", fileName: "agency-damage.jpg", fileSize: 256, mimeType: "image/jpeg", category: "damage_photo" as const };

    const result = await submitAgencyAssistedCanonicalClaim({
      agencyTenantId: "agency-a",
      agencyUserId: 55,
      loadScopedClient: vi.fn().mockResolvedValue({ id: 7, fullName: "Agency Client", phone: "+263771000001" }),
      insurerExists: vi.fn().mockResolvedValue(true),
      resolveActor: vi.fn().mockResolvedValue({ id: 71, tenantId: "tenant-insurer", role: "claimant", uploadKeyPrefixes: ["agency-claims/55/"], identityId: 19, trustLevel: "restricted_agency_assisted" }),
      persist: persistCanonicalClaimIntake,
      startAssessment: vi.fn().mockResolvedValue({ status: "started" }),
    }, {
      agencyClientId: 7,
      insurerTenantId: "tenant-insurer",
      idempotencyKey: "agency-persistence-001",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleRegistration: "AGENCY-001",
      incidentDate: "2026-08-13",
      incidentLocation: "Harare",
      incidentDescription: "Agency-assisted isolated persistence fixture.",
      attachments: [attachment],
      repairerPreferences: [],
    });

    expect(result).toMatchObject({ claimId: 701, claimantIdentityId: 19, claimantIdentityTrust: "restricted_agency_assisted" });
    expect(captured.claim).toMatchObject({ tenantId: "tenant-insurer", claimantId: 71, vehicleRegistration: "AGENCY-001", claimantPhone: "+263771000001", status: "intake_pending", workflowState: "intake_queue" });
    expect(captured.claim?.metadata).toMatchObject({ sourceMetadata: { agencyTenantId: "agency-a", agencyClientId: 7, agencySubmittedBy: 55, claimantIdentityTrust: "restricted_agency_assisted" } });
    expect(captured.documents).toEqual([expect.objectContaining({ claimId: 701, uploadedBy: 71, fileKey: attachment.key, mimeType: "image/jpeg", documentCategory: "damage_photo" })]);
  });
});
