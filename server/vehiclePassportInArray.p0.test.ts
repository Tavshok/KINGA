import React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { appRouter } from "./routers";
import {
  agencyInsuranceServiceRequestInsurers,
  agencyInsuranceServiceRequests,
  claims,
  users,
  vehicleConditionSnapshots,
  vehicleRegistry,
} from "../drizzle/schema";

const panelState = vi.hoisted(() => ({
  passport: undefined as any,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    vehiclePassport: {
      // The payload is assigned only after the real appRouter procedure succeeds.
      getPassport: { useQuery: () => ({ data: panelState.passport, isLoading: false, error: null }) },
      getPassportByRegistration: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) },
      getFraudSignals: { useQuery: () => ({ data: { totalSignals: 0, totalAlerts: 0, signals: [], alerts: [] } }) },
      getTimeline: { useQuery: () => ({ data: { events: [] } }) },
    },
  },
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => children,
  CardContent: ({ children }: any) => children,
  CardHeader: ({ children }: any) => children,
  CardTitle: ({ children }: any) => children,
}));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: any) => children }));
vi.stubGlobal("React", React);

import { VehiclePassportPanel } from "../client/src/components/VehiclePassportPanel";

describe("P0 Vehicle Passport qualifying insurer snapshot regression", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let agencyTenantId = "";
  let insurerTenantId = "";
  let agencyUserId = 0;
  let insurerUserId = 0;
  let vehicleRegistryId = 0;
  let claimId = 0;
  const serviceRequestIds: number[] = [];
  const insurerLinkIds: number[] = [];
  const snapshotIds: number[] = [];
  const expectedRequestNumbers: string[] = [];
  const expectedObservations: string[] = [];
  let cacheWriteSpy: ReturnType<typeof vi.spyOn> | undefined;

  const contextFor = (id: number, tenantId: string) => ({
    user: {
      id,
      role: "insurer",
      tenantId,
      openId: `vehicle-passport-insurer-${id}`,
      name: "Vehicle Passport insurer fixture",
    },
    req: {} as any,
    res: {} as any,
  });

  const resolveRequiredId = async (
    query: Promise<Array<{ id: number }>>,
    description: string,
  ) => {
    const [row] = await query;
    if (!row) throw new Error(`Unable to resolve ${description} fixture`);
    return row.id;
  };

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for Vehicle Passport regression");
    db = connection;
    // getPassport schedules cache writes after responding. They are unrelated to this
    // query regression and their physical schema has intentionally not been changed here.
    cacheWriteSpy = vi.spyOn(global, "setImmediate").mockImplementation((() => undefined) as any);

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    agencyTenantId = `test-vp-agency-${stamp}`;
    insurerTenantId = `test-vp-insurer-${stamp}`;
    const agencyOpenId = `vp-agency-${stamp}`;
    const insurerOpenId = `vp-insurer-${stamp}`;
    const registrationNumber = `VP${Date.now().toString(36).toUpperCase()}${stamp.slice(-2).toUpperCase()}`.slice(0, 30);

    await db.insert(users).values({
      openId: agencyOpenId,
      email: `${agencyOpenId}@invalid.example`,
      name: "Vehicle Passport agency fixture",
      role: "agency",
      tenantId: agencyTenantId,
      emailVerified: 1,
    });
    agencyUserId = await resolveRequiredId(
      db.select({ id: users.id }).from(users).where(eq(users.openId, agencyOpenId)),
      "agency user",
    );

    await db.insert(users).values({
      openId: insurerOpenId,
      email: `${insurerOpenId}@invalid.example`,
      name: "Vehicle Passport insurer fixture",
      role: "insurer",
      tenantId: insurerTenantId,
      emailVerified: 1,
    });
    insurerUserId = await resolveRequiredId(
      db.select({ id: users.id }).from(users).where(eq(users.openId, insurerOpenId)),
      "insurer user",
    );

    await db.insert(vehicleRegistry).values({
      registrationNumber,
      make: "Fixture",
      model: "Passport",
      year: 2024,
      tenantId: agencyTenantId,
    });
    vehicleRegistryId = await resolveRequiredId(
      db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(and(
        eq(vehicleRegistry.registrationNumber, registrationNumber),
        eq(vehicleRegistry.tenantId, agencyTenantId),
      )),
      "vehicle registry",
    );

    await db.insert(claims).values({
      claimantId: agencyUserId,
      claimNumber: `VP-CLAIM-${stamp}`,
      tenantId: agencyTenantId,
      vehicleRegistration: registrationNumber,
      incidentType: "collision",
      claimSource: "agency",
      status: "intake_pending",
    });
    claimId = await resolveRequiredId(
      db.select({ id: claims.id }).from(claims).where(and(
        eq(claims.claimantId, agencyUserId),
        eq(claims.tenantId, agencyTenantId),
      )),
      "claim",
    );

    for (const [index, status] of ["invited", "viewed", "responded", "withdrawn"].entries()) {
      const requestNumber = `VP-REQUEST-${status.toUpperCase()}-${stamp}`;
      if (status !== "withdrawn") expectedRequestNumbers.push(requestNumber);
      await db.insert(agencyInsuranceServiceRequests).values({
        requestNumber,
        agencyTenantId,
        agencyClientId: agencyUserId,
        vehicleRegistryId,
        coverType: "comprehensive",
        status: "ready_for_insurer_review",
        clientInstruction: "Owned Vehicle Passport regression fixture",
        vehicleRegistration: registrationNumber,
        vehicleMake: "Fixture",
        vehicleModel: "Passport",
        vehicleYear: 2024,
        createdBy: agencyUserId,
      });
      const serviceRequestId = await resolveRequiredId(
        db.select({ id: agencyInsuranceServiceRequests.id })
          .from(agencyInsuranceServiceRequests)
          .where(eq(agencyInsuranceServiceRequests.requestNumber, requestNumber)),
        `${status} service request`,
      );
      serviceRequestIds.push(serviceRequestId);

      await db.insert(agencyInsuranceServiceRequestInsurers).values({
        serviceRequestId,
        agencyTenantId,
        insurerTenantId,
        status,
      });
      insurerLinkIds.push(await resolveRequiredId(
        db.select({ id: agencyInsuranceServiceRequestInsurers.id })
          .from(agencyInsuranceServiceRequestInsurers)
          .where(and(
            eq(agencyInsuranceServiceRequestInsurers.serviceRequestId, serviceRequestId),
            eq(agencyInsuranceServiceRequestInsurers.insurerTenantId, insurerTenantId),
          )),
        `${status} insurer link`,
      ));

      await db.insert(vehicleConditionSnapshots).values({
        vehicleRegistryId,
        insuranceServiceRequestId: serviceRequestId,
        snapshotVersion: 1,
        snapshotDate: `2026-09-0${index + 1} 10:00:00`,
        exteriorCondition: status === "viewed" ? "fair" : "good",
        interiorCondition: "good",
        mechanicalCondition: "good",
        evidenceSourcesJson: { source: "owned-regression-fixture", status },
        observations: `Owned ${status} Vehicle Passport fixture`,
        capturedBy: agencyUserId,
        tenantId: agencyTenantId,
      });
      if (status !== "withdrawn") expectedObservations.push(`Owned ${status} Vehicle Passport fixture`);
      snapshotIds.push(await resolveRequiredId(
        db.select({ id: vehicleConditionSnapshots.id })
          .from(vehicleConditionSnapshots)
          .where(and(
            eq(vehicleConditionSnapshots.insuranceServiceRequestId, serviceRequestId),
            eq(vehicleConditionSnapshots.snapshotVersion, 1),
          )),
        `${status} condition snapshot`,
      ));
    }
  });

  afterAll(async () => {
    try {
      if (!db) return;
      // Every predicate below is anchored to IDs allocated for this test only.
      if (snapshotIds.length) await db.delete(vehicleConditionSnapshots).where(inArray(vehicleConditionSnapshots.id, snapshotIds));
      if (insurerLinkIds.length) await db.delete(agencyInsuranceServiceRequestInsurers).where(inArray(agencyInsuranceServiceRequestInsurers.id, insurerLinkIds));
      if (serviceRequestIds.length) await db.delete(agencyInsuranceServiceRequests).where(inArray(agencyInsuranceServiceRequests.id, serviceRequestIds));
      if (claimId) await db.delete(claims).where(eq(claims.id, claimId));
      if (vehicleRegistryId) await db.delete(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleRegistryId));
      if (insurerUserId) await db.delete(users).where(eq(users.id, insurerUserId));
      if (agencyUserId) await db.delete(users).where(eq(users.id, agencyUserId));

      const remaining = await Promise.all([
        snapshotIds.length
          ? db.select({ id: vehicleConditionSnapshots.id }).from(vehicleConditionSnapshots).where(inArray(vehicleConditionSnapshots.id, snapshotIds))
          : [],
        insurerLinkIds.length
          ? db.select({ id: agencyInsuranceServiceRequestInsurers.id }).from(agencyInsuranceServiceRequestInsurers).where(inArray(agencyInsuranceServiceRequestInsurers.id, insurerLinkIds))
          : [],
        serviceRequestIds.length
          ? db.select({ id: agencyInsuranceServiceRequests.id }).from(agencyInsuranceServiceRequests).where(inArray(agencyInsuranceServiceRequests.id, serviceRequestIds))
          : [],
        claimId ? db.select({ id: claims.id }).from(claims).where(eq(claims.id, claimId)) : [],
        vehicleRegistryId ? db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleRegistryId)) : [],
        insurerUserId ? db.select({ id: users.id }).from(users).where(eq(users.id, insurerUserId)) : [],
        agencyUserId ? db.select({ id: users.id }).from(users).where(eq(users.id, agencyUserId)) : [],
      ]);
      expect(remaining.flat()).toHaveLength(0);
    } finally {
      cacheWriteSpy?.mockRestore();
    }
  });

  it("returns the three qualifying insurer-status snapshots through the real tRPC procedure", async () => {
    const caller = appRouter.createCaller(contextFor(insurerUserId, insurerTenantId));
    const result = await caller.vehiclePassport.getPassport({ vehicleRegistryId });

    expect(result.vehicle.id).toBe(vehicleRegistryId);
    expect(result.intelligence.totalClaims).toBe(1);
    expect(result.preLossConditionSnapshots).toHaveLength(3);
    expect(result.preLossConditionSnapshots.map((snapshot) => snapshot.requestNumber).sort()).toEqual(expectedRequestNumbers.sort());
    expect(result.preLossConditionSnapshots.map((snapshot) => snapshot.observations).sort()).toEqual(expectedObservations.sort());

    panelState.passport = result;
  });

  it("renders the populated report-facing panel from the real procedure result without the unavailable fallback", () => {
    expect(panelState.passport).toBeDefined();
    const html = renderToStaticMarkup(
      createElement(VehiclePassportPanel, { vehicleRegistryId }),
    );

    expect(html).toContain("LOW RISK");
    expect(html).toContain("Intelligence Summary");
    expect(html).not.toContain("Vehicle passport unavailable.");
    expect(html).not.toContain("inArray is not defined");
  });
});
