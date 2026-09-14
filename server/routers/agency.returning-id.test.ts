import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returningId = vi.fn();
  const values = vi.fn(() => ({ $returningId: returningId }));
  const insert = vi.fn(() => ({ values }));
  const getDb = vi.fn(async () => ({ insert }));
  return { getDb, insert, values, returningId };
});

vi.mock("../db", () => ({ getDb: mocks.getDb }));

import { agencyRouter } from "./agency";

describe("agency quotation generated ID response", () => {
  beforeEach(() => {
    mocks.getDb.mockClear();
    mocks.insert.mockClear();
    mocks.values.mockClear();
    mocks.returningId.mockReset();
  });

  it("returns Drizzle's generated quotation-request identifier instead of indexing the returned object as an array", async () => {
    mocks.returningId.mockResolvedValue([{ id: 4242 }]);
    const caller = agencyRouter.createCaller({
      user: { id: 19, openId: "agency-id-response-test", role: "user", tenantId: null, isUnregisteredClaimant: 0 } as never,
      tenant: null,
      db: {} as never,
      req: {} as never,
      res: {} as never,
    });

    const response = await caller.submitQuotation({
      fullName: "Agency Test User",
      email: "agency-id-test@example.test",
      insuranceType: "comprehensive",
      vehicleMake: "Test",
      vehicleModel: "Vehicle",
      vehicleYear: 2024,
    });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(response.id).toBe(4242);
    expect(response.requestNumber).toMatch(/^QR-/);
  });
});
