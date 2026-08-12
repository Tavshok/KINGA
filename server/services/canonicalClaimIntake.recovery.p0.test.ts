import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn();
const triggerAiAssessment = vi.fn();
const createNotification = vi.fn();
const createAuditEntry = vi.fn();

vi.mock("../db", () => ({
  getDb,
  triggerAiAssessment,
  createNotification,
  createAuditEntry,
  emitClaimEvent: vi.fn(),
  generateKingaRef: vi.fn(),
}));

function makeDb(requests: Array<Record<string, unknown>>) {
  let selectIndex = 0;
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  return {
    select: vi.fn(() => {
      const builder: any = {
        from: () => builder,
        where: () => builder,
        limit: async () => [requests[selectIndex++]],
      };
      return builder;
    }),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
  };
}

describe("P0 canonical assessment-start recovery", () => {
  beforeEach(() => vi.resetAllMocks());

  it("retains the claim in recoverable intake state and sends exactly one in-app notification when start fails", async () => {
    const db = makeDb([
      { tenantId: "tenant-a", userId: 7, status: "persisted" },
      { tenantId: "tenant-a", userId: 7, status: "assessment_start_failed" },
    ]);
    getDb.mockResolvedValue(db);
    triggerAiAssessment.mockRejectedValueOnce(new Error("transient assessment error"));
    const { startCanonicalIntakeAssessment } = await import("./canonicalClaimIntake");
    const actor = { id: 7, tenantId: "tenant-a", role: "claimant" };

    await startCanonicalIntakeAssessment(actor, 321, "4b01f536-0e5b-4a24-8d61-681a4024978c");
    await startCanonicalIntakeAssessment(actor, 321, "4b01f536-0e5b-4a24-8d61-681a4024978c");

    expect(triggerAiAssessment).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, claimId: 321, type: "system_alert" }));
    expect(createAuditEntry).toHaveBeenCalledWith(expect.objectContaining({ action: "assessment_start_recoverable_failure", claimId: 321 }));
  });
});
