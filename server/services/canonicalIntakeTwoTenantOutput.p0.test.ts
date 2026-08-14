import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitAgencyAssistedCanonicalClaim } from "../agency/agencyAssistedClaimSubmission";
import {
  type CanonicalClaimInput,
  type CanonicalIntakeActor,
  persistCanonicalClaimIntake,
} from "./canonicalClaimIntake";
import { submitPortalCanonicalIntake, submitWhatsAppCanonicalIntake } from "./canonicalIntakeAdapters";

const { getDb, generateKingaRef, createAuditEntry, emitClaimEvent, createNotification, triggerAiAssessment } = vi.hoisted(() => ({
  getDb: vi.fn(),
  generateKingaRef: vi.fn(),
  createAuditEntry: vi.fn(),
  emitClaimEvent: vi.fn(),
  createNotification: vi.fn(),
  triggerAiAssessment: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb,
  generateKingaRef,
  createAuditEntry,
  emitClaimEvent,
  createNotification,
  triggerAiAssessment,
}));

type Captured = { claim?: Record<string, unknown>; documents: Array<Record<string, unknown>> };
type Adapter = "web_my_portal" | "whatsapp_local" | "agency_assisted";

function makePersistenceDb(captured: Captured, claimId: number) {
  let insertCall = 0;
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        insertCall += 1;
        if (insertCall === 2) captured.claim = value;
        if (insertCall >= 3) captured.documents.push(value);
        return [{ insertId: insertCall === 2 ? claimId : insertCall }];
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

function canonicalInput(adapter: Adapter, actorId: number, key: string): CanonicalClaimInput {
  const attachmentPrefix = adapter === "agency_assisted" ? "agency-claims/55" : `claims/${actorId}`;
  return {
    idempotencyKey: key,
    channel: adapter === "web_my_portal" ? "web" : adapter === "whatsapp_local" ? "whatsapp" : "agency_assisted",
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    vehicleRegistration: "TENANT-OUTPUT-001",
    incidentDate: "2026-08-14",
    incidentLocation: "Harare",
    incidentDescription: "Isolated two-tenant canonical output fixture.",
    claimantPhone: "+263771000001",
    attachments: [{
      key: `${attachmentPrefix}/damage.jpg`,
      url: "https://files.example.test/damage.jpg",
      fileName: "damage.jpg",
      fileSize: 128,
      mimeType: "image/jpeg",
      category: "damage_photo",
    }],
    repairerPreferences: [],
  };
}

async function persistThroughAdapter(adapter: Adapter, tenantId: string, claimId: number) {
  const captured: Captured = { documents: [] };
  getDb.mockResolvedValueOnce(makePersistenceDb(captured, claimId));
  generateKingaRef.mockResolvedValue(`KNG-${tenantId}-${claimId}`);
  const startAssessment = vi.fn().mockResolvedValue({ status: "started" as const });

  if (adapter === "web_my_portal") {
    const actor: CanonicalIntakeActor = { id: 101, tenantId, role: "claimant" };
    await submitPortalCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment }, actor, canonicalInput(adapter, actor.id, `${tenantId}-${adapter}`));
  } else if (adapter === "whatsapp_local") {
    const actor: CanonicalIntakeActor = { id: 102, tenantId, role: "claimant" };
    await submitWhatsAppCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment }, actor, canonicalInput(adapter, actor.id, `${tenantId}-${adapter}`));
  } else {
    const input = canonicalInput(adapter, 55, `${tenantId}-${adapter}`);
    await submitAgencyAssistedCanonicalClaim({
      agencyTenantId: "agency-output",
      agencyUserId: 55,
      loadScopedClient: vi.fn().mockResolvedValue({ id: 7, fullName: "Agency Client", phone: "+263771000001" }),
      insurerExists: vi.fn().mockResolvedValue(true),
      resolveActor: vi.fn().mockResolvedValue({ id: 55, tenantId, role: "claimant", identityId: 81, trustLevel: "restricted_agency_assisted", uploadKeyPrefixes: ["agency-claims/55/"] }),
      persist: persistCanonicalClaimIntake,
      startAssessment,
    }, {
      ...input,
      agencyClientId: 7,
      insurerTenantId: tenantId,
      attachments: input.attachments,
    });
  }
  return { captured, startAssessment };
}

function comparableOutput(captured: Captured) {
  return {
    tenantId: captured.claim?.tenantId,
    vehicleMake: captured.claim?.vehicleMake,
    vehicleModel: captured.claim?.vehicleModel,
    vehicleRegistration: captured.claim?.vehicleRegistration,
    incidentDescription: captured.claim?.incidentDescription,
    status: captured.claim?.status,
    workflowState: captured.claim?.workflowState,
    documents: captured.documents.map(({ fileName, fileSize, mimeType, documentCategory }) => ({ fileName, fileSize, mimeType, documentCategory })),
  };
}

async function expectForeignExistingRecordDenied(adapter: Adapter) {
  const actor: CanonicalIntakeActor = adapter === "web_my_portal"
    ? { id: 101, tenantId: "tenant-output-a", role: "claimant" }
    : adapter === "whatsapp_local"
      ? { id: 102, tenantId: "tenant-output-a", role: "claimant", uploadKeyPrefixes: ["whatsapp-claims/"] }
      : { id: 55, tenantId: "tenant-output-a", role: "claimant", uploadKeyPrefixes: ["agency-claims/55/"] };
  const input = canonicalInput(adapter, actor.id, `foreign-existing-${adapter}`);
  const canonicalPersistInput = adapter === "agency_assisted"
    ? {
      ...input,
      agencyClientId: 7,
      insurerTenantId: "tenant-output-a",
      claimantPhone: "+263771000001",
      sourceMetadata: {
        agencyTenantId: "agency-output",
        agencyClientId: 7,
        agencySubmittedBy: 55,
        claimantIdentityTrust: "restricted_agency_assisted",
        claimantName: "Agency Client",
      },
    }
    : input;
  const requestHash = createHash("sha256").update(JSON.stringify(canonicalPersistInput)).digest("hex");
  let selects = 0;
  const db: any = {
    select: vi.fn(() => {
      const builder: any = {
        from: () => builder,
        where: () => builder,
        limit: async () => {
          selects += 1;
          return selects === 1
            ? [{ tenantId: "tenant-output-a", userId: actor.id, idempotencyKey: input.idempotencyKey, requestHash, claimId: 9099 }]
            : [{ id: 9099, tenantId: "tenant-output-b", claimNumber: "CLM-FOREIGN" }];
        },
      };
      return builder;
    }),
    transaction: vi.fn(),
  };
  getDb.mockResolvedValueOnce(db);
  const startAssessment = vi.fn();

  const attempt = adapter === "web_my_portal"
    ? submitPortalCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment }, actor, input)
    : adapter === "whatsapp_local"
      ? submitWhatsAppCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment }, actor, input)
      : submitAgencyAssistedCanonicalClaim({
        agencyTenantId: "agency-output", agencyUserId: 55,
        loadScopedClient: vi.fn().mockResolvedValue({ id: 7, fullName: "Agency Client", phone: "+263771000001" }),
        insurerExists: vi.fn().mockResolvedValue(true),
        resolveActor: vi.fn().mockResolvedValue({ ...actor, identityId: 81, trustLevel: "restricted_agency_assisted" }),
        persist: persistCanonicalClaimIntake, startAssessment,
      }, { ...input, agencyClientId: 7, insurerTenantId: "tenant-output-a", attachments: input.attachments });

  await expect(attempt).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(db.transaction).not.toHaveBeenCalled();
  expect(startAssessment).not.toHaveBeenCalled();
  expect(createAuditEntry).not.toHaveBeenCalled();
  expect(emitClaimEvent).not.toHaveBeenCalled();
  expect(createNotification).not.toHaveBeenCalled();
}

describe("Approved P0 Package 2 isolated two-tenant adapter output and direct-ID boundaries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("persists equivalent normalised canonical claim and document output across every adapter in each isolated tenant", async () => {
    const adapters: Adapter[] = ["web_my_portal", "whatsapp_local", "agency_assisted"];
    const tenantA = await Promise.all(adapters.map((adapter, index) => persistThroughAdapter(adapter, "tenant-output-a", 1001 + index)));
    const tenantB = await Promise.all(adapters.map((adapter, index) => persistThroughAdapter(adapter, "tenant-output-b", 2001 + index)));

    const outputsA = tenantA.map(({ captured }) => comparableOutput(captured));
    const outputsB = tenantB.map(({ captured }) => comparableOutput(captured));
    expect(outputsA).toEqual([outputsA[0], outputsA[0], outputsA[0]]);
    expect(outputsB).toEqual([outputsB[0], outputsB[0], outputsB[0]]);
    expect(outputsA[0]).toMatchObject({ tenantId: "tenant-output-a", status: "intake_pending", workflowState: "intake_queue", documents: [{ fileName: "damage.jpg", mimeType: "image/jpeg", documentCategory: "damage_photo" }] });
    expect(outputsB[0]).toMatchObject({ tenantId: "tenant-output-b", status: "intake_pending", workflowState: "intake_queue", documents: [{ fileName: "damage.jpg", mimeType: "image/jpeg", documentCategory: "damage_photo" }] });
    expect(outputsA[0]?.tenantId).not.toBe(outputsB[0]?.tenantId);
    for (const result of [...tenantA, ...tenantB]) expect(result.startAssessment).toHaveBeenCalledOnce();
  });

  it("rejects foreign attachment attempts for portal, WhatsApp-local, and agency-assisted adapters before persistence or assessment side effects", async () => {
    const startAssessment = vi.fn();
    const foreignPortal = canonicalInput("web_my_portal", 101, "foreign-portal");
    foreignPortal.attachments[0] = { ...foreignPortal.attachments[0]!, key: "claims/999/foreign.jpg" };
    await expect(submitPortalCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment }, { id: 101, tenantId: "tenant-output-a", role: "claimant" }, foreignPortal)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const foreignWhatsApp = canonicalInput("whatsapp_local", 102, "foreign-whatsapp");
    foreignWhatsApp.attachments[0] = { ...foreignWhatsApp.attachments[0]!, key: "claims/999/foreign.jpg" };
    await expect(submitWhatsAppCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment }, { id: 102, tenantId: "tenant-output-a", role: "claimant" }, foreignWhatsApp)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const foreignAgency = canonicalInput("agency_assisted", 55, "foreign-agency");
    foreignAgency.attachments[0] = { ...foreignAgency.attachments[0]!, key: "agency-claims/999/foreign.jpg" };
    await expect(submitAgencyAssistedCanonicalClaim({
      agencyTenantId: "agency-output", agencyUserId: 55,
      loadScopedClient: vi.fn().mockResolvedValue({ id: 7, fullName: "Agency Client", phone: "+263771000001" }),
      insurerExists: vi.fn().mockResolvedValue(true),
      resolveActor: vi.fn().mockResolvedValue({ id: 55, tenantId: "tenant-output-a", role: "claimant", identityId: 81, trustLevel: "restricted_agency_assisted", uploadKeyPrefixes: ["agency-claims/55/"] }),
      persist: persistCanonicalClaimIntake, startAssessment,
    }, { ...foreignAgency, agencyClientId: 7, insurerTenantId: "tenant-output-a", attachments: foreignAgency.attachments })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(startAssessment).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each(["web_my_portal", "whatsapp_local", "agency_assisted"] as const)("denies a foreign existing intake record through the %s boundary before any write or assessment start", async (adapter) => {
    await expectForeignExistingRecordDenied(adapter);
  });
});
