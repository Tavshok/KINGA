import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getClaimById: vi.fn(),
  getQuotesByClaimId: vi.fn(),
  getQuoteLineItemsByQuoteId: vi.fn(),
  createPanelBeaterQuote: vi.fn(),
  updateClaimStatus: vi.fn(),
  createAuditEntry: vi.fn(),
  createNotification: vi.fn(),
  getUsersByInsurerRoles: vi.fn(),
  emitClaimEvent: vi.fn(),
  getAiAssessmentByClaimId: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: mocks.getDb,
  getClaimById: mocks.getClaimById,
  getQuotesByClaimId: mocks.getQuotesByClaimId,
  getQuoteLineItemsByQuoteId: mocks.getQuoteLineItemsByQuoteId,
  createPanelBeaterQuote: mocks.createPanelBeaterQuote,
  updateClaimStatus: mocks.updateClaimStatus,
  createAuditEntry: mocks.createAuditEntry,
  createNotification: mocks.createNotification,
  getUsersByInsurerRoles: mocks.getUsersByInsurerRoles,
  emitClaimEvent: mocks.emitClaimEvent,
  getAiAssessmentByClaimId: mocks.getAiAssessmentByClaimId,
}));

import { quotesRouter } from "./quotes-core";

function context(role: string, tenantId: string | null) {
  return { user: { id: 17, role, tenantId, openId: "audit-test", isActive: 1 }, req: { headers: {} }, res: {} } as any;
}

function panelBeaterDb() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
}

describe("AUD-P0-001 — quote detail claim-object authority", () => {
  it("returns quote detail only after same-tenant target claim authority is established", async () => {
    mocks.getClaimById.mockResolvedValue({ id: 701, tenantId: "tenant-a" });
    mocks.getQuotesByClaimId.mockResolvedValue([{ id: 11, panelBeaterId: 5, quotedAmount: 125_000, repairerName: "Alpha" }]);
    mocks.getQuoteLineItemsByQuoteId.mockResolvedValue([{ id: 1, description: "Bumper", amount: 125_000 }]);
    mocks.getDb.mockResolvedValue(panelBeaterDb());

    const result = await quotesRouter.createCaller(context("insurer", "tenant-a")).getWithLineItems({ claimId: 701 });

    expect(result).toHaveLength(1);
    expect(mocks.getClaimById).toHaveBeenCalledWith(701, "tenant-a");
    expect(mocks.getQuotesByClaimId).toHaveBeenCalledWith(701, "tenant-a");
    expect(mocks.getQuoteLineItemsByQuoteId).toHaveBeenCalledWith(11);
  });

  it("treats a foreign numeric claim as unavailable before quote, line-item, or panel-beater reads", async () => {
    mocks.getClaimById.mockResolvedValue(undefined);

    await expect(quotesRouter.createCaller(context("insurer", "tenant-b")).getWithLineItems({ claimId: 701 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mocks.getClaimById).toHaveBeenCalledWith(701, "tenant-b");
    expect(mocks.getQuotesByClaimId).not.toHaveBeenCalled();
    expect(mocks.getQuoteLineItemsByQuoteId).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("requires an explicit tenant selection for platform-super-admin quote-detail access", async () => {
    await expect(quotesRouter.createCaller(context("platform_super_admin", null)).getWithLineItems({ claimId: 701 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getClaimById).not.toHaveBeenCalled();

    mocks.getClaimById.mockResolvedValue({ id: 701, tenantId: "tenant-a" });
    mocks.getQuotesByClaimId.mockResolvedValue([]);
    mocks.getDb.mockResolvedValue(panelBeaterDb());

    await expect(quotesRouter.createCaller(context("platform_super_admin", null)).getWithLineItems({ claimId: 701, tenantId: "tenant-a" }))
      .resolves.toEqual([]);
    expect(mocks.getClaimById).toHaveBeenLastCalledWith(701, "tenant-a");
    expect(mocks.getQuotesByClaimId).toHaveBeenLastCalledWith(701, "tenant-a");
  });
});
