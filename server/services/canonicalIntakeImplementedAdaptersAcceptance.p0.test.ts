import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn();
const generateKingaRef = vi.fn();

vi.mock("../db", () => ({
  getDb,
  generateKingaRef,
  createAuditEntry: vi.fn(),
  emitClaimEvent: vi.fn(),
  createNotification: vi.fn(),
  triggerAiAssessment: vi.fn(),
}));

type Captured = { claim?: Record<string, unknown>; documents: Array<Record<string, unknown>> };

function makePersistenceDb(captured: Captured, claimId = 501) {
  let insertCall = 0;
  const tx = {
    insert: vi.fn(() => {
      insertCall += 1;
      return {
        values: vi.fn(async (value: Record<string, unknown>) => {
          if (insertCall === 2) captured.claim = value;
          if (insertCall >= 3) captured.documents.push(value);
          return [{ insertId: insertCall === 2 ? claimId : insertCall }];
        }),
      };
    }),
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

function submission(channel: "portal" | "whatsapp") {
  return {
    idempotencyKey: `${channel}-acceptance-001`,
    channel,
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    vehicleRegistration: "ACCEPT-001",
    incidentDate: "2026-08-13",
    incidentLocation: "Harare",
    incidentDescription: "Rear impact recorded for isolated acceptance.",
    claimantPhone: "+263771000001",
    attachments: [
      { key: "claims/11/damage.jpg", url: "https://files.example.test/damage.jpg", fileName: "damage.jpg", fileSize: 128, mimeType: "image/jpeg", category: "damage_photo" as const },
      { key: "claims/11/police.pdf", url: "https://files.example.test/police.pdf", fileName: "police.pdf", fileSize: 512, mimeType: "application/pdf", category: "police_report" as const },
    ],
    repairerPreferences: [],
    sourceMetadata: { acceptanceChannel: channel },
  };
}

describe("P0 implemented canonical intake adapter acceptance", () => {
  beforeEach(() => vi.resetAllMocks());

  it("has only the implemented web/My Portal and WhatsApp adapters wired to canonical intake", () => {
    const web = readFileSync("server/routers/claims-core.ts", "utf8");
    const whatsapp = readFileSync("server/whatsapp/engine.ts", "utf8");
    expect(web).toContain("persistCanonicalClaimIntake");
    expect(web).toContain('channel: input.channel');
    expect(whatsapp).toContain("submitAndStartCanonicalIntake");
    expect(whatsapp).toContain("persist: persistCanonicalClaimIntake");
    expect(whatsapp).toContain('channel: "whatsapp"');
  });

  it("persists equivalent canonical claim and document fields for web/My Portal and local WhatsApp hand-off payloads", async () => {
    const { persistCanonicalClaimIntake } = await import("./canonicalClaimIntake");
    const actor = { id: 11, tenantId: "tenant-acceptance", role: "claimant" };
    generateKingaRef.mockResolvedValue("KNG-ACCEPTANCE");

    const portal: Captured = { documents: [] };
    getDb.mockResolvedValueOnce(makePersistenceDb(portal));
    await persistCanonicalClaimIntake(actor, submission("portal"));

    const whatsapp: Captured = { documents: [] };
    getDb.mockResolvedValueOnce(makePersistenceDb(whatsapp));
    await persistCanonicalClaimIntake(actor, submission("whatsapp"));

    expect(portal.claim).toMatchObject({ tenantId: "tenant-acceptance", claimantId: 11, vehicleRegistration: "ACCEPT-001", incidentDescription: "Rear impact recorded for isolated acceptance.", status: "intake_pending", workflowState: "intake_queue" });
    expect(whatsapp.claim).toMatchObject({ tenantId: "tenant-acceptance", claimantId: 11, vehicleRegistration: "ACCEPT-001", incidentDescription: "Rear impact recorded for isolated acceptance.", status: "intake_pending", workflowState: "intake_queue" });
    expect(portal.documents.map(({ fileKey, mimeType, documentCategory }) => ({ fileKey, mimeType, documentCategory }))).toEqual(whatsapp.documents.map(({ fileKey, mimeType, documentCategory }) => ({ fileKey, mimeType, documentCategory })));
    expect(portal.documents).toHaveLength(2);
    expect(whatsapp.documents).toHaveLength(2);
  });

  it("normalizes an agency-assisted accident claim into the same canonical evidence contract with additional agency provenance", async () => {
    const { submitAgencyAssistedCanonicalClaim } = await import("../agency/agencyAssistedClaimSubmission");
    const persist = vi.fn().mockResolvedValue({ claimId: 502, claimNumber: "KNG-AGENCY", idempotent: false, repairerWarnings: [] });
    const agencyAttachment = { key: "agency-claims/55/damage.jpg", url: "https://files.example.test/agency-damage.jpg", fileName: "agency-damage.jpg", fileSize: 256, mimeType: "image/jpeg", category: "damage_photo" as const };

    await submitAgencyAssistedCanonicalClaim({
      agencyTenantId: "agency-acceptance",
      agencyUserId: 55,
      loadScopedClient: vi.fn().mockResolvedValue({ id: 7, fullName: "Agency Client", phone: "+263771000001" }),
      insurerExists: vi.fn().mockResolvedValue(true),
      resolveActor: vi.fn().mockResolvedValue({ id: 71, tenantId: "tenant-acceptance", role: "claimant", uploadKeyPrefixes: ["agency-claims/55/"], identityId: 19, trustLevel: "restricted_agency_assisted" }),
      persist,
      startAssessment: vi.fn().mockResolvedValue({ status: "started" }),
    }, {
      agencyClientId: 7,
      insurerTenantId: "tenant-acceptance",
      idempotencyKey: "agency-acceptance-001",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleRegistration: "ACCEPT-001",
      incidentDate: "2026-08-13",
      incidentLocation: "Harare",
      incidentDescription: "Rear impact recorded for isolated acceptance.",
      attachments: [agencyAttachment],
      repairerPreferences: [],
    });

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ id: 71, tenantId: "tenant-acceptance" }), expect.objectContaining({
      channel: "agency_assisted",
      vehicleRegistration: "ACCEPT-001",
      incidentDescription: "Rear impact recorded for isolated acceptance.",
      idempotencyKey: "agency-acceptance-001",
      attachments: [agencyAttachment],
      sourceMetadata: expect.objectContaining({ agencyTenantId: "agency-acceptance", agencyClientId: 7, claimantIdentityTrust: "restricted_agency_assisted" }),
    }));
  });

  it("keeps isolated portal and WhatsApp claim and document persistence records scoped to their own tenants", async () => {
    const { persistCanonicalClaimIntake } = await import("./canonicalClaimIntake");
    generateKingaRef.mockResolvedValue("KNG-TENANT-ACCEPTANCE");
    const portal: Captured = { documents: [] };
    const whatsapp: Captured = { documents: [] };

    getDb.mockResolvedValueOnce(makePersistenceDb(portal, 501));
    await persistCanonicalClaimIntake({ id: 11, tenantId: "tenant-portal", role: "claimant" }, submission("portal"));
    getDb.mockResolvedValueOnce(makePersistenceDb(whatsapp, 502));
    await persistCanonicalClaimIntake({ id: 12, tenantId: "tenant-whatsapp", role: "claimant" }, {
      ...submission("whatsapp"),
      attachments: submission("whatsapp").attachments.map((attachment) => ({ ...attachment, key: attachment.key.replace("claims/11/", "claims/12/") })),
    });

    expect(portal.claim).toMatchObject({ tenantId: "tenant-portal", claimantId: 11 });
    expect(whatsapp.claim).toMatchObject({ tenantId: "tenant-whatsapp", claimantId: 12 });
    expect(portal.documents.map((document) => document.claimId)).not.toEqual(whatsapp.documents.map((document) => document.claimId));
    expect(portal.documents.map((document) => document.fileKey)).toEqual(["claims/11/damage.jpg", "claims/11/police.pdf"]);
    expect(whatsapp.documents.map((document) => document.fileKey)).toEqual(["claims/12/damage.jpg", "claims/12/police.pdf"]);
  });

  it("rejects an attachment from another authenticated intake session before any persistence attempt", async () => {
    const { persistCanonicalClaimIntake } = await import("./canonicalClaimIntake");
    await expect(persistCanonicalClaimIntake({ id: 11, tenantId: "tenant-acceptance", role: "claimant" }, {
      ...submission("portal"),
      attachments: [{ ...submission("portal").attachments[0], key: "claims/99/foreign.jpg" }],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
