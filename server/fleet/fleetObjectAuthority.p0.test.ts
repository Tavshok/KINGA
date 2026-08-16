import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { fleetDrivers, fleets, fleetVehicles, users } from "../../drizzle/schema";

describe("AUD-P0 fleet object authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA = "";
  let tenantB = "";
  let managerAId = 0;
  let managerBId = 0;
  let driverAId = 0;
  let fleetAId = 0;
  let fleetBId = 0;

  const contextFor = (id: number, role: "fleet_manager" | "fleet_driver", tenantId: string) => ({
    user: { id, role, tenantId, openId: `fleet-authority-${id}`, name: "Fleet authority fixture" },
    req: {} as any,
    res: {} as any,
  });

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for fleet authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-fleet-authority-a-${stamp}`;
    tenantB = `test-fleet-authority-b-${stamp}`;
    const managerAOpenId = `fleet-manager-a-${stamp}`;
    const managerBOpenId = `fleet-manager-b-${stamp}`;
    const driverAOpenId = `fleet-driver-a-${stamp}`;

    await db.insert(users).values([
      { openId: managerAOpenId, email: `${managerAOpenId}@invalid.example`, name: "Fleet Manager A", role: "fleet_manager", tenantId: tenantA, emailVerified: 1 },
      { openId: managerBOpenId, email: `${managerBOpenId}@invalid.example`, name: "Fleet Manager B", role: "fleet_manager", tenantId: tenantB, emailVerified: 1 },
      { openId: driverAOpenId, email: `${driverAOpenId}@invalid.example`, name: "Fleet Driver A", role: "fleet_driver", tenantId: tenantA, emailVerified: 1 },
    ]);
    const [managerA, managerB, driverA] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.openId, managerAOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, managerBOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, driverAOpenId)).then((rows) => rows[0]),
    ]);
    if (!managerA || !managerB || !driverA) throw new Error("Unable to resolve fleet authority users");
    managerAId = managerA.id;
    managerBId = managerB.id;
    driverAId = driverA.id;

    await db.insert(fleets).values([
      { ownerId: managerAId, tenantId: tenantA, fleetName: `Authority Fleet A ${stamp}`, fleetType: "logistics" },
      { ownerId: managerBId, tenantId: tenantB, fleetName: `Authority Fleet B ${stamp}`, fleetType: "logistics" },
    ]);
    const [fleetA, fleetB] = await Promise.all([
      db.select({ id: fleets.id }).from(fleets).where(and(eq(fleets.ownerId, managerAId), eq(fleets.tenantId, tenantA))).then((rows) => rows[0]),
      db.select({ id: fleets.id }).from(fleets).where(and(eq(fleets.ownerId, managerBId), eq(fleets.tenantId, tenantB))).then((rows) => rows[0]),
    ]);
    if (!fleetA || !fleetB) throw new Error("Unable to resolve fleet authority fixtures");
    fleetAId = fleetA.id;
    fleetBId = fleetB.id;

    await db.insert(fleetDrivers).values({
      fleetId: fleetAId, tenantId: tenantA, userId: driverAId, driverLicenseNumber: `TEST-${stamp}`,
      licenseExpiry: "2030-01-01", hireDate: "2025-01-01", employmentStatus: "active",
    });
    await db.insert(fleetVehicles).values([
      { registrationNumber: `FTA-${stamp}`, make: "Toyota", model: "Corolla", year: 2020, ownerId: managerAId, tenantId: tenantA, fleetId: fleetAId },
      { registrationNumber: `FTB-${stamp}`, make: "Mazda", model: "Demio", year: 2021, ownerId: managerBId, tenantId: tenantB, fleetId: fleetBId },
    ]);
  });

  afterAll(async () => {
    if (!db || !tenantA || !tenantB) return;
    const tenantIds = [tenantA, tenantB];
    await db.delete(fleetDrivers).where(inArray(fleetDrivers.tenantId, tenantIds));
    await db.delete(fleetVehicles).where(inArray(fleetVehicles.tenantId, tenantIds));
    await db.delete(fleets).where(inArray(fleets.tenantId, tenantIds));
    await db.delete(users).where(inArray(users.tenantId, tenantIds));
  });

  it("allows managers and assigned drivers to read only their authorised fleet", async () => {
    const manager = appRouter.createCaller(contextFor(managerAId, "fleet_manager", tenantA));
    const driver = appRouter.createCaller(contextFor(driverAId, "fleet_driver", tenantA));
    await expect(manager.fleet.getFleetById({ id: fleetAId })).resolves.toMatchObject({ id: fleetAId, tenantId: tenantA });
    await expect(driver.fleet.getFleetById({ id: fleetAId })).resolves.toMatchObject({ id: fleetAId, tenantId: tenantA });
    await expect(driver.fleet.getFleetVehicles({ fleetId: fleetAId })).resolves.toHaveLength(1);
    await expect(manager.fleet.getFleetById({ id: fleetBId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(driver.fleet.getFleetVehicles({ fleetId: fleetBId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("denies driver creation and foreign fleet registration or driver assignment before writes", async () => {
    const driver = appRouter.createCaller(contextFor(driverAId, "fleet_driver", tenantA));
    const manager = appRouter.createCaller(contextFor(managerAId, "fleet_manager", tenantA));
    await expect(driver.fleet.createFleet({ name: "Denied fleet", businessType: "logistics" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(manager.fleet.registerVehicle({ fleetId: fleetBId, registrationNumber: `DENIED-${Date.now()}`, make: "Toyota", model: "Yaris", year: 2022 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(manager.fleet.onboardFleetDriver({ fleetId: fleetBId, userId: driverAId, driverLicenseNumber: "DENIED-DRIVER" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps management intelligence tenant-scoped", async () => {
    const manager = appRouter.createCaller(contextFor(managerAId, "fleet_manager", tenantA));
    const result = await manager.fleet.getManagerIntelligence({ periodDays: 365 });
    expect(result.vehicleInsights.map((vehicle: any) => vehicle.fleetId)).toEqual([fleetAId]);
  });
});
