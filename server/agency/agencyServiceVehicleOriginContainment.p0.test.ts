import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { resolveServiceVehicle } from "../routers/agency-insurance-service";
import { getDb } from "../db";
import { vehicleRegistry } from "../../drizzle/schema";

describe("DRV-013 — agency vehicle origin containment", () => {
  const fixtureStamp = `drv013-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const agencyTenant = `${fixtureStamp}-agency`;
  const insurerTenant = `${fixtureStamp}-insurer`;
  const sharedVin = `D013${Date.now().toString().slice(-9)}`.slice(0, 17);
  let insurerVehicleId = 0;
  let agencyVehicleId = 0;

  const insertId = (result: unknown): number => {
    const value = Number((result as any)[0]?.insertId ?? (result as any).insertId);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Expected an owned vehicle fixture ID");
    return value;
  };

  const vehicleInput = (vin: string | undefined, registration: string) => ({
    vehicleVin: vin,
    vehicleRegistration: registration,
    vehicleMake: "Fixture",
    vehicleModel: "Agency Origin",
    vehicleYear: 2020,
  } as any);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    insurerVehicleId = insertId(await db.insert(vehicleRegistry).values({
      vin: sharedVin,
      registrationNumber: `D13-I-${fixtureStamp}`.slice(0, 30),
      make: "Fixture",
      model: "Insurer-Owned",
      year: 2020,
      tenantId: insurerTenant,
    }));
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (agencyVehicleId > 0) await db.delete(vehicleRegistry).where(eq(vehicleRegistry.id, agencyVehicleId));
    if (insurerVehicleId > 0) await db.delete(vehicleRegistry).where(eq(vehicleRegistry.id, insurerVehicleId));

    const [remainingAgencyVehicle, remainingInsurerVehicle] = await Promise.all([
      agencyVehicleId > 0 ? db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(eq(vehicleRegistry.id, agencyVehicleId)) : Promise.resolve([]),
      insurerVehicleId > 0 ? db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(eq(vehicleRegistry.id, insurerVehicleId)) : Promise.resolve([]),
    ]);
    expect(remainingAgencyVehicle).toHaveLength(0);
    expect(remainingInsurerVehicle).toHaveLength(0);
  });

  it("fails closed when another tenant already owns the globally unique VIN and creates no agency vehicle record", async () => {
    await expect(resolveServiceVehicle(vehicleInput(sharedVin, `D13-A-${fixtureStamp}`.slice(0, 30)), agencyTenant))
      .rejects.toMatchObject({ code: "CONFLICT" });

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const agencyMatches = await db.select({ id: vehicleRegistry.id }).from(vehicleRegistry)
      .where(and(eq(vehicleRegistry.vin, sharedVin), eq(vehicleRegistry.tenantId, agencyTenant)));
    expect(agencyMatches).toHaveLength(0);
  });

  it("retains normal same-tenant agency resolution without a VIN transfer", async () => {
    const resolved = await resolveServiceVehicle(vehicleInput(undefined, `D13-LOCAL-${fixtureStamp}`.slice(0, 30)), agencyTenant);
    agencyVehicleId = resolved.id;

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [stored] = await db.select({ id: vehicleRegistry.id, tenantId: vehicleRegistry.tenantId, vin: vehicleRegistry.vin })
      .from(vehicleRegistry).where(eq(vehicleRegistry.id, agencyVehicleId));
    expect(stored).toMatchObject({ id: agencyVehicleId, tenantId: agencyTenant, vin: null });
  });
});
