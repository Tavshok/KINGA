import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../_core/notification", () => ({
  notifyOwner: mocks.notifyOwner,
}));

import { checkSingleCaseDeadline } from "./recoveryDeadlineAlerts";

function deadlineCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    claimNumber: "CLM-42",
    status: "open",
    recoveryDeadline: "2026-10-20",
    recoveryDeadlineAlertSentAt: null,
    thirdPartyName: "Test Third Party",
    thirdPartyInsurer: "Test Insurer",
    approvedSettlementAmount: 250_000,
    recoveryPotentialScore: 75,
    currencyCode: "ZAR",
    ...overrides,
  };
}

function databaseFor(row: ReturnType<typeof deadlineCase>) {
  const whereUpdate = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: whereUpdate });
  const update = vi.fn().mockReturnValue({ set });
  const limit = vi.fn().mockResolvedValue([row]);
  const whereSelect = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });

  return {
    db: { select, update },
    update,
    set,
    whereUpdate,
  };
}

describe("update-triggered recovery deadline alerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));
    vi.clearAllMocks();
    mocks.notifyOwner.mockResolvedValue(true);
  });

  it("checks one qualifying case, notifies, and records its alert timestamp", async () => {
    const { db, update, set, whereUpdate } = databaseFor(deadlineCase());
    mocks.getDb.mockResolvedValue(db);

    await checkSingleCaseDeadline(42);

    expect(mocks.getDb).toHaveBeenCalledTimes(2);
    expect(mocks.notifyOwner).toHaveBeenCalledOnce();
    expect(mocks.notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Recovery Case RC-42"),
        content: expect.stringContaining("30 days remaining"),
      })
    );
    expect(update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({
      recoveryDeadlineAlertSentAt: "2026-09-20 12:00:00",
    });
    expect(whereUpdate).toHaveBeenCalledOnce();
  });

  it("retains duplicate suppression for a recently alerted case", async () => {
    const { db, update } = databaseFor(
      deadlineCase({ recoveryDeadlineAlertSentAt: "2026-09-18 12:00:00" })
    );
    mocks.getDb.mockResolvedValue(db);

    await checkSingleCaseDeadline(42);

    expect(mocks.getDb).toHaveBeenCalledOnce();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
