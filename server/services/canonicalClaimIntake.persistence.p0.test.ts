import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn();
const generateKingaRef = vi.fn();
const createAuditEntry = vi.fn();
const emitClaimEvent = vi.fn();

vi.mock("../db", () => ({
  getDb,
  generateKingaRef,
  createAuditEntry,
  emitClaimEvent,
  createNotification: vi.fn(),
  triggerAiAssessment: vi.fn(),
}));

const input = {
  idempotencyKey: "bb4d2b9b-6959-44a7-a52f-d99c4d8acb94",
  channel: "portal",
  vehicleMake: "Toyota", vehicleModel: "Corolla", vehicleRegistration: "ABC1234",
  incidentDate: "2026-08-12", incidentLocation: "Harare", incidentDescription: "Rear collision at junction.",
  claimantPhone: "+263771234567",
  attachments: [{ key: "claims/7/damage.jpg", url: "https://files.example.test/damage.jpg", fileName: "damage.jpg", fileSize: 128, mimeType: "image/jpeg", category: "damage_photo" as const }],
  repairerPreferences: ["repairer-1", "repairer-2", "repairer-3", "repairer-4"],
};

function makeTx(ledgerInsert: ReturnType<typeof vi.fn>, claimInsert: ReturnType<typeof vi.fn>, documentInsert: ReturnType<typeof vi.fn>) {
  let insertCall = 0;
  return {
    insert: vi.fn(() => {
      insertCall += 1;
      return { values: insertCall === 1 ? ledgerInsert : insertCall === 2 ? claimInsert : documentInsert };
    }),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  };
}

describe("P0 canonical intake persistence", () => {
  beforeEach(() => vi.resetAllMocks());

  it("persists all evidence once and returns the same claim for an idempotent retry", async () => {
    const ledgerValues = vi.fn().mockResolvedValue([{ insertId: 100 }]);
    const claimValues = vi.fn().mockResolvedValue([{ insertId: 501 }]);
    const documentValues = vi.fn().mockResolvedValue([{ insertId: 9001 }]);
    const tx = makeTx(ledgerValues, claimValues, documentValues);
    const expectedHash = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
    let selects = 0;
    const db: any = {
      select: vi.fn(() => {
        const builder: any = {
          from: () => builder,
          where: () => builder,
          limit: async () => {
            selects += 1;
            if (selects === 1) return [];
            if (selects === 2) return [{ tenantId: "tenant-a", userId: 7, idempotencyKey: input.idempotencyKey, requestHash: expectedHash, claimId: 501 }];
            return [{ id: 501, tenantId: "tenant-a", claimNumber: "CLM-EXISTING" }];
          },
        };
        return builder;
      }),
      transaction: async (work: (value: typeof tx) => Promise<void>) => work(tx),
    };
    getDb.mockResolvedValue(db);
    generateKingaRef.mockResolvedValue("KNG-TEST-001");
    const { persistCanonicalClaimIntake } = await import("./canonicalClaimIntake");
    const actor = { id: 7, tenantId: "tenant-a", role: "claimant" };

    const created = await persistCanonicalClaimIntake(actor, input);
    const retried = await persistCanonicalClaimIntake(actor, input);

    expect(created).toMatchObject({ claimId: 501, idempotent: false, repairerWarnings: [] });
    expect(retried).toMatchObject({ claimId: 501, claimNumber: "CLM-EXISTING", idempotent: true });
    expect(claimValues).toHaveBeenCalledOnce();
    expect(documentValues).toHaveBeenCalledOnce();
    expect(claimValues).toHaveBeenCalledWith(expect.objectContaining({ claimantPhone: "+263771234567", selectedPanelBeaterIds: JSON.stringify(input.repairerPreferences) }));
    expect(documentValues).toHaveBeenCalledWith(expect.objectContaining({ fileKey: "claims/7/damage.jpg", fileSize: 128, mimeType: "image/jpeg" }));
  });
});
