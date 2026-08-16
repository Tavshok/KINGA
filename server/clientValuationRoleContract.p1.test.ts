import { describe, expect, it, vi } from "vitest";

vi.mock("./insurance/valuation-engine", () => ({
  generateVehicleValuation: vi.fn(async () => ({
    marketValueUsd: 12500,
    minValueUsd: 11250,
    maxValueUsd: 13750,
    confidenceScore: 0.8,
    methodology: "test-fixture",
  })),
}));

import { appRouter } from "./routers";

describe("client valuation role contract", () => {
  const contextFor = (role: string) => ({
    user: { id: 1, role, tenantId: "test-client-valuation-contract", openId: `client-valuation-${role}`, name: "Client valuation fixture" },
    req: {} as any,
    res: {} as any,
  });

  it("allows a claimant to obtain a non-persistent client market valuation", async () => {
    const claimant = appRouter.createCaller(contextFor("claimant"));
    await expect(claimant.clientValuation.getMarketValuation({ make: "Toyota", model: "Corolla", year: 2020 })).resolves.toMatchObject({
      marketValueUsd: 12500,
      valuationDate: expect.any(String),
    });
  });

  it("denies agency users from the client valuation contract", async () => {
    const agency = appRouter.createCaller(contextFor("agency"));
    await expect(agency.clientValuation.getMarketValuation({ make: "Toyota", model: "Corolla", year: 2020 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
