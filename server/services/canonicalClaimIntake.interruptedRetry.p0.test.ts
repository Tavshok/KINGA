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

const input = {
  idempotencyKey: "interrupted-retry-001",
  channel: "portal",
  vehicleMake: "Toyota",
  vehicleModel: "Corolla",
  vehicleRegistration: "INT-001",
  incidentDate: "2026-08-13",
  incidentLocation: "Harare",
  incidentDescription: "Interrupted request acceptance fixture.",
  attachments: [{ key: "claims/7/interrupted.jpg", url: "https://files.example.test/interrupted.jpg", fileName: "interrupted.jpg", fileSize: 128, mimeType: "image/jpeg", category: "damage_photo" as const }],
  repairerPreferences: [],
};

describe("P0 canonical intake interrupted retry", () => {
  beforeEach(() => vi.resetAllMocks());

  it("commits exactly one claim and evidence set when the first transaction is interrupted before commit and the submission is retried", async () => {
    let attempts = 0;
    const committed = { ledger: 0, claims: 0, documents: 0 };
    const db: any = {
      select: vi.fn(() => {
        const builder: any = { from: () => builder, where: () => builder, limit: async () => [] };
        return builder;
      }),
      transaction: async (work: (tx: any) => Promise<void>) => {
        attempts += 1;
        const staged = { ledger: 0, claims: 0, documents: 0 };
        let insertCall = 0;
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn(async () => {
              insertCall += 1;
              if (insertCall === 1) staged.ledger += 1;
              if (insertCall === 2) staged.claims += 1;
              if (insertCall >= 3) staged.documents += 1;
              return [{ insertId: insertCall === 2 ? 501 : insertCall }];
            }),
          })),
          update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
        };
        await work(tx);
        if (attempts === 1) throw new Error("simulated transport interruption before transaction commit");
        committed.ledger += staged.ledger;
        committed.claims += staged.claims;
        committed.documents += staged.documents;
      },
    };
    getDb.mockResolvedValue(db);
    generateKingaRef.mockResolvedValue("KNG-INTERRUPTED");
    const { persistCanonicalClaimIntake } = await import("./canonicalClaimIntake");
    const actor = { id: 7, tenantId: "tenant-a", role: "claimant" };

    await expect(persistCanonicalClaimIntake(actor, input)).rejects.toThrow("simulated transport interruption");
    const retried = await persistCanonicalClaimIntake(actor, input);

    expect(retried).toMatchObject({ claimId: 501, idempotent: false });
    expect(committed).toEqual({ ledger: 1, claims: 1, documents: 1 });
    expect(attempts).toBe(2);
  });
});
