import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fleetVehicles, insuranceQuotes } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";

const tenantA = `test-quote-vehicle-a-${Date.now()}`;
const tenantB = `test-quote-vehicle-b-${Date.now()}`;
const registrationNumber = `TEST-QUOTE-VEH-${Date.now()}`;

function callerForTenantA() {
  return appRouter.createCaller({
    user: {
      id: 980001,
      openId: `test-quote-vehicle-user-${Date.now()}`,
      name: "Tenant A claimant",
      role: "claimant",
      tenantId: tenantA,
    },
    req: {} as any,
    res: {} as any,
  });
}

beforeEach(async () => {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for isolated vehicle registration authority regression");
  await db.insert(fleetVehicles).values({
    registrationNumber,
    make: "Test",
    model: "Foreign Vehicle",
    year: 2022,
    ownerId: 980002,
    tenantId: tenantB,
  });
});

afterEach(async () => {
  const db = await getDb();
  if (db) {
    await db.delete(insuranceQuotes).where(eq(insuranceQuotes.tenantId, tenantA));
    await db.delete(fleetVehicles).where(eq(fleetVehicles.registrationNumber, registrationNumber));
  }
});

describe("insurer request quote vehicle-registration authority", () => {
  it("denies foreign registration reuse before quote or vehicle creation", async () => {
    const caller = callerForTenantA();
    await expect(caller.insurance.requestQuote({
      registrationNumber,
      make: "Test",
      model: "Attempted Reuse",
      year: 2022,
      currentValue: 12500,
      driverAge: 35,
      annualMileage: "medium",
      phoneNumber: "+263770000000",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const db = await getDb();
    const tenantAVehicle = await db!.select().from(fleetVehicles).where(eq(fleetVehicles.tenantId, tenantA));
    const tenantAQuotes = await db!.select().from(insuranceQuotes).where(eq(insuranceQuotes.tenantId, tenantA));
    expect(tenantAVehicle).toHaveLength(0);
    expect(tenantAQuotes).toHaveLength(0);
  });
});
