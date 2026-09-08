import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { upsertVehicleRegistry } from "./vehicle-registry";
import { claimEvents, claims, users, vehicleRegistry } from "../drizzle/schema";

describe("P0 Vehicle Registry cross-tenant containment", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA = "";
  let tenantB = "";
  let userAId = 0;
  let userBId = 0;
  let vehicleAId = 0;
  const tenantBClaimIds: number[] = [];
  const containmentEventIds: number[] = [];
  let fixtureVin = "";
  let fixtureRegistration = "";

  const resolveId = async (query: Promise<Array<{ id: number }>>, label: string) => {
    const [row] = await query;
    if (!row) throw new Error(`Unable to resolve ${label} fixture`);
    return row.id;
  };

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for Vehicle Registry containment regression");
    db = connection;

    const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
    tenantA = `test-vr-a-${stamp}`;
    tenantB = `test-vr-b-${stamp}`;
    fixtureVin = `VR${stamp}`.slice(0, 17);
    fixtureRegistration = `VR${stamp}`.slice(0, 30);

    const openIdA = `vr-owner-a-${stamp}`;
    const openIdB = `vr-owner-b-${stamp}`;
    await db.insert(users).values([
      { openId: openIdA, email: `${openIdA}@invalid.example`, name: "Vehicle registry tenant A fixture", role: "agency", tenantId: tenantA, emailVerified: 1 },
      { openId: openIdB, email: `${openIdB}@invalid.example`, name: "Vehicle registry tenant B fixture", role: "agency", tenantId: tenantB, emailVerified: 1 },
    ]);
    userAId = await resolveId(db.select({ id: users.id }).from(users).where(eq(users.openId, openIdA)), "tenant A user");
    userBId = await resolveId(db.select({ id: users.id }).from(users).where(eq(users.openId, openIdB)), "tenant B user");

    await db.insert(vehicleRegistry).values({
      vin: fixtureVin,
      registrationNumber: fixtureRegistration,
      make: "Fixture",
      model: "Owned by tenant A",
      year: 2024,
      totalClaimsCount: 1,
      totalRepairCostCents: 1100,
      claimIdsJson: "[101]",
      damageZoneCountsJson: '{"front":1}',
      vehicleRiskScore: 0,
      tenantId: tenantA,
    });
    vehicleAId = await resolveId(
      db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(and(
        eq(vehicleRegistry.vin, fixtureVin),
        eq(vehicleRegistry.tenantId, tenantA),
      )),
      "tenant A vehicle",
    );

    for (const suffix of ["VIN", "REGISTRATION"]) {
      const claimNumber = `VR-CONTAIN-${suffix}-${stamp}`;
      await db.insert(claims).values({
        claimantId: userBId,
        claimNumber,
        tenantId: tenantB,
        vehicleRegistration: fixtureRegistration,
        incidentType: "collision",
        claimSource: "agency",
        status: "intake_pending",
      });
      tenantBClaimIds.push(await resolveId(
        db.select({ id: claims.id }).from(claims).where(and(
          eq(claims.claimNumber, claimNumber),
          eq(claims.tenantId, tenantB),
        )),
        `${suffix} tenant B claim`,
      ));
    }
  });

  afterAll(async () => {
    if (!db) return;
    if (containmentEventIds.length) await db.delete(claimEvents).where(inArray(claimEvents.id, containmentEventIds));
    if (tenantBClaimIds.length) await db.delete(claims).where(inArray(claims.id, tenantBClaimIds));
    if (vehicleAId) await db.delete(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleAId));
    if (userBId) await db.delete(users).where(eq(users.id, userBId));
    if (userAId) await db.delete(users).where(eq(users.id, userAId));

    const remaining = await Promise.all([
      containmentEventIds.length ? db.select({ id: claimEvents.id }).from(claimEvents).where(inArray(claimEvents.id, containmentEventIds)) : [],
      tenantBClaimIds.length ? db.select({ id: claims.id }).from(claims).where(inArray(claims.id, tenantBClaimIds)) : [],
      vehicleAId ? db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleAId)) : [],
      userBId ? db.select({ id: users.id }).from(users).where(eq(users.id, userBId)) : [],
      userAId ? db.select({ id: users.id }).from(users).where(eq(users.id, userAId)) : [],
    ]);
    expect(remaining.flat()).toHaveLength(0);
  });

  it("contains both VIN and registration matches rather than mutating tenant A’s vehicle or attaching tenant B’s claims", async () => {
    const [vinClaimId, registrationClaimId] = tenantBClaimIds;
    expect(vinClaimId).toBeDefined();
    expect(registrationClaimId).toBeDefined();

    const before = await db.select().from(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleAId)).limit(1);
    expect(before[0]).toMatchObject({
      tenantId: tenantA,
      totalClaimsCount: 1,
      totalRepairCostCents: 1100,
      claimIdsJson: "[101]",
      damageZoneCountsJson: '{"front":1}',
    });

    await expect(upsertVehicleRegistry({
      claimId: vinClaimId!,
      tenantId: tenantB,
      vin: fixtureVin,
      registrationNumber: fixtureRegistration,
      repairCostCents: 5000,
      impactZone: "rear",
    })).resolves.toBeNull();
    await expect(upsertVehicleRegistry({
      claimId: registrationClaimId!,
      tenantId: tenantB,
      vin: null,
      registrationNumber: fixtureRegistration,
      repairCostCents: 7000,
      impactZone: "left",
    })).resolves.toBeNull();

    const [after] = await db.select().from(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleAId)).limit(1);
    expect(after).toMatchObject({
      id: vehicleAId,
      tenantId: tenantA,
      totalClaimsCount: 1,
      totalRepairCostCents: 1100,
      claimIdsJson: "[101]",
      damageZoneCountsJson: '{"front":1}',
    });
    const tenantBVehicleRows = await db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(and(
      eq(vehicleRegistry.tenantId, tenantB),
      eq(vehicleRegistry.registrationNumber, fixtureRegistration),
    ));
    expect(tenantBVehicleRows).toHaveLength(0);

    const incomingClaims = await db.select({ id: claims.id, vehicleRegistryId: claims.vehicleRegistryId })
      .from(claims)
      .where(inArray(claims.id, tenantBClaimIds));
    expect(incomingClaims).toEqual([
      { id: vinClaimId, vehicleRegistryId: null },
      { id: registrationClaimId, vehicleRegistryId: null },
    ]);

    const events = await db.select({ id: claimEvents.id, claimId: claimEvents.claimId, tenantId: claimEvents.tenantId, userRole: claimEvents.userRole, eventType: claimEvents.eventType, eventPayload: claimEvents.eventPayload })
      .from(claimEvents)
      .where(inArray(claimEvents.claimId, tenantBClaimIds));
    containmentEventIds.push(...events.map((event) => event.id));
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "vehicle_registry_cross_tenant_match_contained",
      "vehicle_registry_cross_tenant_match_contained",
    ]));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimId: vinClaimId, tenantId: tenantB, userRole: "system", eventPayload: expect.objectContaining({ matchedBy: "vin", existingVehicleRegistryId: vehicleAId, action: "claim_retained_without_registry_attachment" }) }),
      expect.objectContaining({ claimId: registrationClaimId, tenantId: tenantB, userRole: "system", eventPayload: expect.objectContaining({ matchedBy: "registration_number", existingVehicleRegistryId: vehicleAId, action: "claim_retained_without_registry_attachment" }) }),
    ]));
  });
});
