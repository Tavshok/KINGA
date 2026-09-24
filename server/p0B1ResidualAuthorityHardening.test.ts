import { describe, expect, it, vi } from "vitest";

import { P0_B1_FRAUD_DECISION_HOLD } from "./evidence-governance/p0FraudDecisionHold";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
}));

import { exceptionIntelligenceRouter } from "./routers/exception-intelligence";

const tenantId = "p0-b1-residual-tenant";
const tenantScopedUser = {
  user: {
    id: 1,
    role: "claims_manager",
    tenantId,
  },
  req: { headers: {} },
} as any;
const tenantlessUser = {
  user: {
    id: 2,
    role: "claims_manager",
    tenantId: null,
  },
  req: { headers: {} },
} as any;

describe("P0-B1 residual authority hardening", () => {
  it("withholds system drift fraud analytics after tenant authorization and before every database read", async () => {
    mocks.getDb.mockReset();

    await expect(
      exceptionIntelligenceRouter
        .createCaller(tenantScopedUser)
        .getSystemDriftReport({ windowDays: 30 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies a tenantless session before the system drift P0 hold", async () => {
    mocks.getDb.mockReset();

    await expect(
      exceptionIntelligenceRouter
        .createCaller(tenantlessUser)
        .getSystemDriftReport({ windowDays: 30 })
    ).rejects.toThrow("tenant-scoped session is required");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
