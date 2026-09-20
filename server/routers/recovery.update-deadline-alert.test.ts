import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  checkSingleCaseDeadline: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../recovery/recoveryDeadlineAlerts", () => ({
  checkSingleCaseDeadline: mocks.checkSingleCaseDeadline,
}));

import { recoveryRouter } from "./recovery";

function updateDatabase() {
  const limit = vi.fn().mockResolvedValue([{ id: 42 }]);
  const selectWhere = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where: selectWhere });
  const select = vi.fn().mockReturnValue({ from });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });

  return {
    db: { select, update },
    select,
    selectWhere,
    update,
    set,
    updateWhere,
  };
}

function context() {
  return {
    user: {
      id: 7,
      openId: "recovery-officer-test",
      name: "Recovery Officer",
      email: "recovery@example.test",
      role: "insurer",
      insurerRole: "recovery_officer",
      tenantId: "tenant-a",
      isActive: 1,
    },
    tenant: null,
    req: { headers: {} },
    res: {},
    db: {},
  } as any;
}

describe("recovery update deadline alert integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkSingleCaseDeadline.mockResolvedValue(undefined);
  });

  it("retains the single-case deadline check after an authorized tenant-scoped update", async () => {
    const { db, select, selectWhere, update, set, updateWhere } =
      updateDatabase();
    mocks.getDb.mockResolvedValue(db);
    const caller = recoveryRouter.createCaller(context());

    await expect(
      caller.updateCase({
        id: 42,
        officerNotes: "Reviewed by recovery officer",
      })
    ).resolves.toEqual({ success: true });

    expect(select).toHaveBeenCalledOnce();
    expect(selectWhere).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({
      officerNotes: "Reviewed by recovery officer",
    });
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(mocks.checkSingleCaseDeadline).toHaveBeenCalledOnce();
    expect(mocks.checkSingleCaseDeadline).toHaveBeenCalledWith(42);
  });
});
