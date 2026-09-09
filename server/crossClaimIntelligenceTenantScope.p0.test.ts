import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createClaim, getDb } from "./db";
import { runCrossClaimIntelligence } from "./cross-claim-intelligence";
import {
  claims,
  crossClaimSignals,
  driverClaims,
  drivers,
  panelBeaters,
  repairHistory,
  users,
  vehicleRegistry,
} from "../drizzle/schema";

describe("DRV-006 — tenant-scoped repairer and driver signals", () => {
  const fixtureStamp = `drv006-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantA = `${fixtureStamp}-a`;
  const tenantB = `${fixtureStamp}-b`;
  const claimIds: number[] = [];
  const driverClaimIds: number[] = [];
  const repairHistoryIds: number[] = [];
  let actorId = 0;
  let vehicleId = 0;
  let driverId = 0;
  let repairerId = 0;
  let currentClaimId = 0;
  let sameTenantPriorClaimId = 0;

  const insertId = (result: unknown): number => {
    const candidate = (result as any)[0]?.insertId ?? (result as any).insertId;
    const value = Number(candidate);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Expected an owned fixture insert ID");
    return value;
  };

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    actorId = insertId(await db.insert(users).values({
      openId: `fixture-${fixtureStamp}`,
      name: "DRV-006 Fixture Actor",
      email: `${fixtureStamp}@example.invalid`,
      role: "insurer",
      insurerRole: "claims_manager",
      tenantId: tenantA,
      isActive: 1,
    }));
    vehicleId = insertId(await db.insert(vehicleRegistry).values({
      registrationNumber: `D6${Date.now().toString().slice(-8)}`,
      make: "Fixture",
      model: "Tenant Scope",
      year: 2020,
      tenantId: tenantA,
    }));
    driverId = insertId(await db.insert(drivers).values({
      fullName: `DRV-006 Fixture Driver ${fixtureStamp}`,
      tenantId: tenantA,
    }));
    repairerId = insertId(await db.insert(panelBeaters).values({
      name: "DRV-006 Fixture Repairer",
      businessName: `DRV-006 Repairs ${fixtureStamp}`,
      email: `${fixtureStamp}-repairer@example.invalid`,
      tenantId: tenantA,
      approved: 1,
      panelBeaterStatus: "approved",
    }));

    const createOwnedClaim = async (tenantId: string, suffix: string) => {
      const result = await createClaim({
        claimantId: actorId,
        claimNumber: `DRV006-${suffix}-${fixtureStamp}`,
        vehicleMake: "Fixture",
        vehicleModel: "Tenant Scope",
        vehicleYear: 2020,
        vehicleRegistration: `D6-${suffix}`,
        incidentDate: new Date(),
        incidentDescription: "Owned tenant-scope regression fixture",
        incidentLocation: "Fixture location",
        damagePhotos: "[]",
        policyNumber: `DRV006-${suffix}`,
        tenantId,
      });
      const claimId = insertId(result);
      claimIds.push(claimId);
      await db.update(claims).set({ vehicleRegistryId: vehicleId, driverRegistryId: driverId }).where(eq(claims.id, claimId));
      return claimId;
    };

    currentClaimId = await createOwnedClaim(tenantA, "CURRENT");
    const foreignClaimOne = await createOwnedClaim(tenantB, "FOREIGN-1");
    const foreignClaimTwo = await createOwnedClaim(tenantB, "FOREIGN-2");

    for (const claimId of [currentClaimId, foreignClaimOne, foreignClaimTwo]) {
      const tenantId = claimId === currentClaimId ? tenantA : tenantB;
      driverClaimIds.push(insertId(await db.insert(driverClaims).values({ driverId, claimId, tenantId })));
    }
    for (const claimId of [foreignClaimOne, foreignClaimTwo]) {
      repairHistoryIds.push(insertId(await db.insert(repairHistory).values({
        repairerId,
        vehicleId,
        claimId,
        tenantId: tenantB,
      })));
    }
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    if (claimIds.length > 0) await db.delete(crossClaimSignals).where(inArray(crossClaimSignals.claimId, claimIds));
    if (repairHistoryIds.length > 0) await db.delete(repairHistory).where(inArray(repairHistory.id, repairHistoryIds));
    if (driverClaimIds.length > 0) await db.delete(driverClaims).where(inArray(driverClaims.id, driverClaimIds));
    if (claimIds.length > 0) await db.delete(claims).where(inArray(claims.id, claimIds));
    if (repairerId > 0) await db.delete(panelBeaters).where(eq(panelBeaters.id, repairerId));
    if (driverId > 0) await db.delete(drivers).where(eq(drivers.id, driverId));
    if (vehicleId > 0) await db.delete(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleId));
    if (actorId > 0) await db.delete(users).where(eq(users.id, actorId));

    const [remainingSignals, remainingClaims, remainingDriverClaims, remainingRepairHistory, remainingRepairers, remainingDrivers, remainingVehicles, remainingActors] = await Promise.all([
      claimIds.length > 0 ? db.select({ id: crossClaimSignals.id }).from(crossClaimSignals).where(inArray(crossClaimSignals.claimId, claimIds)) : Promise.resolve([]),
      claimIds.length > 0 ? db.select({ id: claims.id }).from(claims).where(inArray(claims.id, claimIds)) : Promise.resolve([]),
      driverClaimIds.length > 0 ? db.select({ id: driverClaims.id }).from(driverClaims).where(inArray(driverClaims.id, driverClaimIds)) : Promise.resolve([]),
      repairHistoryIds.length > 0 ? db.select({ id: repairHistory.id }).from(repairHistory).where(inArray(repairHistory.id, repairHistoryIds)) : Promise.resolve([]),
      repairerId > 0 ? db.select({ id: panelBeaters.id }).from(panelBeaters).where(eq(panelBeaters.id, repairerId)) : Promise.resolve([]),
      driverId > 0 ? db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId)) : Promise.resolve([]),
      vehicleId > 0 ? db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleId)) : Promise.resolve([]),
      actorId > 0 ? db.select({ id: users.id }).from(users).where(eq(users.id, actorId)) : Promise.resolve([]),
    ]);
    expect(remainingSignals).toHaveLength(0);
    expect(remainingClaims).toHaveLength(0);
    expect(remainingDriverClaims).toHaveLength(0);
    expect(remainingRepairHistory).toHaveLength(0);
    expect(remainingRepairers).toHaveLength(0);
    expect(remainingDrivers).toHaveLength(0);
    expect(remainingVehicles).toHaveLength(0);
    expect(remainingActors).toHaveLength(0);
  });

  it("does not create repairer or driver signals from foreign-tenant history sharing the same upstream IDs", async () => {
    const result = await runCrossClaimIntelligence({
      claimId: currentClaimId,
      vehicleRegistryId: vehicleId,
      driverRegistryId: driverId,
      tenantId: tenantA,
    });

    expect(result.signals.map((signal) => signal.signalType)).not.toEqual(expect.arrayContaining([
      "repairer_repeat_pattern_signal",
      "staged_accident_signal",
      "repairer_driver_collusion_signal",
    ]));
  });

  it("fails closed when the tenant scope is absent", async () => {
    await expect(runCrossClaimIntelligence({
      claimId: currentClaimId,
      vehicleRegistryId: vehicleId,
      driverRegistryId: driverId,
      tenantId: null,
    })).resolves.toMatchObject({ signals: [], totalScoreContribution: 0 });
  });

  it("retains a tenant-local staged-accident signal while excluding the foreign evidence", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const claimResult = await createClaim({
      claimantId: actorId,
      claimNumber: `DRV006-LOCAL-${fixtureStamp}`,
      vehicleMake: "Fixture",
      vehicleModel: "Tenant Scope",
      vehicleYear: 2020,
      vehicleRegistration: "D6-LOCAL",
      incidentDate: new Date(),
      incidentDescription: "Owned local positive-control fixture",
      incidentLocation: "Fixture location",
      damagePhotos: "[]",
      policyNumber: "DRV006-LOCAL",
      tenantId: tenantA,
    });
    sameTenantPriorClaimId = insertId(claimResult);
    claimIds.push(sameTenantPriorClaimId);
    await db.update(claims).set({ vehicleRegistryId: vehicleId, driverRegistryId: driverId }).where(eq(claims.id, sameTenantPriorClaimId));
    driverClaimIds.push(insertId(await db.insert(driverClaims).values({
      driverId,
      claimId: sameTenantPriorClaimId,
      tenantId: tenantA,
    })));
    repairHistoryIds.push(insertId(await db.insert(repairHistory).values({
      repairerId,
      vehicleId,
      claimId: sameTenantPriorClaimId,
      tenantId: tenantA,
    })));

    const result = await runCrossClaimIntelligence({
      claimId: currentClaimId,
      vehicleRegistryId: vehicleId,
      driverRegistryId: driverId,
      tenantId: tenantA,
    });

    const staged = result.signals.find((signal) => signal.signalType === "staged_accident_signal");
    expect(staged).toBeDefined();
    expect(staged?.evidence).toMatchObject({ priorClaimIds: [sameTenantPriorClaimId] });
    expect(staged?.evidence).not.toMatchObject({ priorClaimIds: expect.arrayContaining(claimIds.filter((id) => id !== currentClaimId && id !== sameTenantPriorClaimId)) });
  });
});
