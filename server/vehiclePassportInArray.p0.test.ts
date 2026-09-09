import React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { aggregateVehiclePassport } from "./services/epic4-aggregation";
import { cleanupOwnedFixture } from "./test-helpers/owned-fixture-cleanup";
import {
	agencyClients,
	agencyInsuranceServiceRequestInsurers,
  agencyInsuranceServiceRequests,
  claimConfidenceScores,
  claims,
  crossClaimSignals,
  fraudAlerts,
  inspections,
  users,
  vehicleDamageHistory,
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
  let unrelatedTenantId = "";
	let agencyUserId = 0;
	let agencyClientId = 0;
  let insurerUserId = 0;
  let unrelatedUserId = 0;
  let vehicleRegistryId = 0;
  let tenantlessVehicleRegistryId = 0;
  let tenantlessRegistrationNumber = "";
  let claimId = 0;
  let ownerDamageHistoryId = 0;
  let ownerInspectionId = 0;
  let ownerConfidenceScoreId = 0;
  let ownerSignalId = 0;
  let ownerFraudAlertId = 0;
  let foreignClaimId = 0;
  let foreignDamageHistoryId = 0;
  let foreignInspectionId = 0;
  let foreignConfidenceScoreId = 0;
  let foreignSignalId = 0;
  let foreignFraudAlertId = 0;
  const serviceRequestIds: number[] = [];
  const insurerLinkIds: number[] = [];
  const snapshotIds: number[] = [];
  const expectedRequestNumbers: string[] = [];
  const expectedObservations: string[] = [];
	let cacheWriteSpy: ReturnType<typeof vi.spyOn> | undefined;

  const contextFor = (id: number, tenantId: string | null) => ({
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
    unrelatedTenantId = `test-vp-unrelated-${stamp}`;
    const agencyOpenId = `vp-agency-${stamp}`;
    const insurerOpenId = `vp-insurer-${stamp}`;
    const unrelatedOpenId = `vp-unrelated-${stamp}`;
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

	await db.insert(agencyClients).values({
		agencyTenantId,
		fullName: "Vehicle Passport owned fixture client",
		vehicleRegistration: registrationNumber,
		vehicleMake: "Fixture",
		vehicleModel: "Passport",
		vehicleYear: 2024,
		createdBy: agencyUserId,
	});
	agencyClientId = await resolveRequiredId(
		db.select({ id: agencyClients.id }).from(agencyClients).where(and(
			eq(agencyClients.agencyTenantId, agencyTenantId),
			eq(agencyClients.createdBy, agencyUserId),
		)),
		"agency client",
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

    await db.insert(users).values({
      openId: unrelatedOpenId,
      email: `${unrelatedOpenId}@invalid.example`,
      name: "Vehicle Passport unrelated fixture",
      role: "insurer",
      tenantId: unrelatedTenantId,
      emailVerified: 1,
    });
    unrelatedUserId = await resolveRequiredId(
      db.select({ id: users.id }).from(users).where(eq(users.openId, unrelatedOpenId)),
      "unrelated insurer user",
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

    tenantlessRegistrationNumber = `VPTL${stamp.replace(/[^a-z0-9]/gi, "").slice(-20).toUpperCase()}`.slice(0, 30);
    await db.insert(vehicleRegistry).values({
      registrationNumber: tenantlessRegistrationNumber,
      make: "Fixture",
      model: "Tenantless Passport",
      year: 2024,
      tenantId: null,
    });
    tenantlessVehicleRegistryId = await resolveRequiredId(
      db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(and(
        eq(vehicleRegistry.registrationNumber, tenantlessRegistrationNumber),
      )),
      "tenantless vehicle registry",
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

    await db.insert(vehicleDamageHistory).values({
      vehicleId: vehicleRegistryId,
      claimId,
      vehicleRegistration: registrationNumber,
      damageZone: "front",
      severity: "minor",
      repairCostEstimateCents: 2000,
      tenantId: agencyTenantId,
    });
    ownerDamageHistoryId = await resolveRequiredId(
      db.select({ id: vehicleDamageHistory.id }).from(vehicleDamageHistory)
        .where(eq(vehicleDamageHistory.claimId, claimId)),
      "owning tenant damage history",
    );

    await db.insert(inspections).values({
      tenantId: agencyTenantId,
      inspectionRef: `VP-INSPECTION-OWNER-${stamp}`,
      inspectionType: "vehicle",
      assetType: "vehicle",
      vehicleRegistration: registrationNumber,
      claimId,
      createdBy: agencyUserId,
    });
    ownerInspectionId = await resolveRequiredId(
      db.select({ id: inspections.id }).from(inspections).where(eq(inspections.claimId, claimId)),
      "owning tenant inspection",
    );

    await db.insert(claimConfidenceScores).values({
      claimId,
      tenantId: agencyTenantId,
      damageCertainty: "80.00",
      physicsStrength: "81.00",
      fraudConfidence: "82.00",
      historicalAccuracy: "83.00",
      dataCompleteness: "84.00",
      vehicleRiskIntelligence: "85.00",
      compositeConfidenceScore: "86.00",
    });
    ownerConfidenceScoreId = await resolveRequiredId(
      db.select({ id: claimConfidenceScores.id }).from(claimConfidenceScores)
        .where(eq(claimConfidenceScores.claimId, claimId)),
      "owning tenant confidence score",
    );

    await db.insert(crossClaimSignals).values({
      claimId,
      signalType: "vehicle_high_claim_frequency",
      signalLabel: "Owned tenant fixture signal",
      tenantId: agencyTenantId,
    });
    ownerSignalId = await resolveRequiredId(
      db.select({ id: crossClaimSignals.id }).from(crossClaimSignals)
        .where(eq(crossClaimSignals.claimId, claimId)),
      "owning tenant fraud signal",
    );

    await db.insert(fraudAlerts).values({
      claimId,
      alertType: "fixture_alert",
      alertSeverity: "low",
      alertTitle: "Owned tenant fixture alert",
      alertDescription: "Must not be visible to another tenant.",
    });
    ownerFraudAlertId = await resolveRequiredId(
      db.select({ id: fraudAlerts.id }).from(fraudAlerts).where(eq(fraudAlerts.claimId, claimId)),
      "owning tenant fraud alert",
    );

    await db.insert(claims).values({
      claimantId: unrelatedUserId,
      claimNumber: `VP-FOREIGN-CLAIM-${stamp}`,
      tenantId: unrelatedTenantId,
      vehicleRegistration: registrationNumber,
      incidentType: "collision",
      claimSource: "agency",
      status: "intake_pending",
    });
    foreignClaimId = await resolveRequiredId(
      db.select({ id: claims.id }).from(claims).where(and(
        eq(claims.claimantId, unrelatedUserId),
        eq(claims.tenantId, unrelatedTenantId),
      )),
      "foreign tenant claim",
    );

    await db.insert(vehicleDamageHistory).values({
      vehicleId: vehicleRegistryId,
      claimId: foreignClaimId,
      vehicleRegistration: registrationNumber,
      damageZone: "rear",
      severity: "severe",
      repairCostEstimateCents: 9000,
      tenantId: unrelatedTenantId,
    });
    foreignDamageHistoryId = await resolveRequiredId(
      db.select({ id: vehicleDamageHistory.id }).from(vehicleDamageHistory)
        .where(eq(vehicleDamageHistory.claimId, foreignClaimId)),
      "foreign tenant damage history",
    );

    await db.insert(inspections).values({
      tenantId: unrelatedTenantId,
      inspectionRef: `VP-INSPECTION-FOREIGN-${stamp}`,
      inspectionType: "vehicle",
      assetType: "vehicle",
      vehicleRegistration: registrationNumber,
      claimId: foreignClaimId,
      createdBy: unrelatedUserId,
    });
    foreignInspectionId = await resolveRequiredId(
      db.select({ id: inspections.id }).from(inspections).where(eq(inspections.claimId, foreignClaimId)),
      "foreign tenant inspection",
    );

    await db.insert(claimConfidenceScores).values({
      claimId: foreignClaimId,
      tenantId: unrelatedTenantId,
      damageCertainty: "60.00",
      physicsStrength: "61.00",
      fraudConfidence: "62.00",
      historicalAccuracy: "63.00",
      dataCompleteness: "64.00",
      vehicleRiskIntelligence: "65.00",
      compositeConfidenceScore: "66.00",
    });
    foreignConfidenceScoreId = await resolveRequiredId(
      db.select({ id: claimConfidenceScores.id }).from(claimConfidenceScores)
        .where(eq(claimConfidenceScores.claimId, foreignClaimId)),
      "foreign tenant confidence score",
    );

    await db.insert(crossClaimSignals).values({
      claimId: foreignClaimId,
      signalType: "repairer_repeat_pattern_signal",
      signalLabel: "Foreign tenant fixture signal",
      tenantId: unrelatedTenantId,
    });
    foreignSignalId = await resolveRequiredId(
      db.select({ id: crossClaimSignals.id }).from(crossClaimSignals)
        .where(eq(crossClaimSignals.claimId, foreignClaimId)),
      "foreign tenant fraud signal",
    );

    await db.insert(fraudAlerts).values({
      claimId: foreignClaimId,
      alertType: "foreign_fixture_alert",
      alertSeverity: "high",
      alertTitle: "Foreign tenant fixture alert",
      alertDescription: "Must not be visible to the owning agency tenant.",
    });
    foreignFraudAlertId = await resolveRequiredId(
      db.select({ id: fraudAlerts.id }).from(fraudAlerts).where(eq(fraudAlerts.claimId, foreignClaimId)),
      "foreign tenant fraud alert",
    );

    for (const [index, status] of ["invited", "viewed", "responded", "withdrawn"].entries()) {
      const requestNumber = `VP-REQUEST-${status.toUpperCase()}-${stamp}`;
      if (status !== "withdrawn") expectedRequestNumbers.push(requestNumber);
      await db.insert(agencyInsuranceServiceRequests).values({
        requestNumber,
        agencyTenantId,
		agencyClientId,
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
			// Every predicate is anchored to an ID allocated by this fixture only.
			await cleanupOwnedFixture([
				{ id: "snapshots", remove: async () => { if (snapshotIds.length) await db.delete(vehicleConditionSnapshots).where(inArray(vehicleConditionSnapshots.id, snapshotIds)); } },
				{ id: "insurer-links", remove: async () => { if (insurerLinkIds.length) await db.delete(agencyInsuranceServiceRequestInsurers).where(inArray(agencyInsuranceServiceRequestInsurers.id, insurerLinkIds)); } },
				{ id: "service-requests", requires: ["snapshots", "insurer-links"], remove: async () => { if (serviceRequestIds.length) await db.delete(agencyInsuranceServiceRequests).where(inArray(agencyInsuranceServiceRequests.id, serviceRequestIds)); } },
				{ id: "agency-client", requires: ["service-requests"], remove: async () => { if (agencyClientId) await db.delete(agencyClients).where(eq(agencyClients.id, agencyClientId)); } },
				{ id: "fraud-alerts", remove: async () => { if (ownerFraudAlertId) await db.delete(fraudAlerts).where(eq(fraudAlerts.id, ownerFraudAlertId)); if (foreignFraudAlertId) await db.delete(fraudAlerts).where(eq(fraudAlerts.id, foreignFraudAlertId)); } },
				{ id: "signals", remove: async () => { if (ownerSignalId) await db.delete(crossClaimSignals).where(eq(crossClaimSignals.id, ownerSignalId)); if (foreignSignalId) await db.delete(crossClaimSignals).where(eq(crossClaimSignals.id, foreignSignalId)); } },
				{ id: "confidence-scores", remove: async () => { if (ownerConfidenceScoreId) await db.delete(claimConfidenceScores).where(eq(claimConfidenceScores.id, ownerConfidenceScoreId)); if (foreignConfidenceScoreId) await db.delete(claimConfidenceScores).where(eq(claimConfidenceScores.id, foreignConfidenceScoreId)); } },
				{ id: "inspections", remove: async () => { if (ownerInspectionId) await db.delete(inspections).where(eq(inspections.id, ownerInspectionId)); if (foreignInspectionId) await db.delete(inspections).where(eq(inspections.id, foreignInspectionId)); } },
				{ id: "damage-history", remove: async () => { if (ownerDamageHistoryId) await db.delete(vehicleDamageHistory).where(eq(vehicleDamageHistory.id, ownerDamageHistoryId)); if (foreignDamageHistoryId) await db.delete(vehicleDamageHistory).where(eq(vehicleDamageHistory.id, foreignDamageHistoryId)); } },
				{ id: "claims", requires: ["fraud-alerts", "signals", "confidence-scores", "inspections", "damage-history"], remove: async () => { if (foreignClaimId) await db.delete(claims).where(eq(claims.id, foreignClaimId)); if (claimId) await db.delete(claims).where(eq(claims.id, claimId)); } },
				{ id: "vehicles", requires: ["service-requests", "damage-history"], remove: async () => { if (tenantlessVehicleRegistryId) await db.delete(vehicleRegistry).where(eq(vehicleRegistry.id, tenantlessVehicleRegistryId)); if (vehicleRegistryId) await db.delete(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleRegistryId)); } },
				{ id: "users", requires: ["agency-client", "claims", "vehicles"], remove: async () => { if (unrelatedUserId) await db.delete(users).where(eq(users.id, unrelatedUserId)); if (insurerUserId) await db.delete(users).where(eq(users.id, insurerUserId)); if (agencyUserId) await db.delete(users).where(eq(users.id, agencyUserId)); } },
			], async () => {
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
		agencyClientId ? db.select({ id: agencyClients.id }).from(agencyClients).where(eq(agencyClients.id, agencyClientId)) : [],
        claimId ? db.select({ id: claims.id }).from(claims).where(eq(claims.id, claimId)) : [],
        foreignClaimId ? db.select({ id: claims.id }).from(claims).where(eq(claims.id, foreignClaimId)) : [],
        ownerDamageHistoryId ? db.select({ id: vehicleDamageHistory.id }).from(vehicleDamageHistory).where(eq(vehicleDamageHistory.id, ownerDamageHistoryId)) : [],
        foreignDamageHistoryId ? db.select({ id: vehicleDamageHistory.id }).from(vehicleDamageHistory).where(eq(vehicleDamageHistory.id, foreignDamageHistoryId)) : [],
        ownerInspectionId ? db.select({ id: inspections.id }).from(inspections).where(eq(inspections.id, ownerInspectionId)) : [],
        foreignInspectionId ? db.select({ id: inspections.id }).from(inspections).where(eq(inspections.id, foreignInspectionId)) : [],
        ownerConfidenceScoreId ? db.select({ id: claimConfidenceScores.id }).from(claimConfidenceScores).where(eq(claimConfidenceScores.id, ownerConfidenceScoreId)) : [],
        foreignConfidenceScoreId ? db.select({ id: claimConfidenceScores.id }).from(claimConfidenceScores).where(eq(claimConfidenceScores.id, foreignConfidenceScoreId)) : [],
        ownerSignalId ? db.select({ id: crossClaimSignals.id }).from(crossClaimSignals).where(eq(crossClaimSignals.id, ownerSignalId)) : [],
        foreignSignalId ? db.select({ id: crossClaimSignals.id }).from(crossClaimSignals).where(eq(crossClaimSignals.id, foreignSignalId)) : [],
        ownerFraudAlertId ? db.select({ id: fraudAlerts.id }).from(fraudAlerts).where(eq(fraudAlerts.id, ownerFraudAlertId)) : [],
        foreignFraudAlertId ? db.select({ id: fraudAlerts.id }).from(fraudAlerts).where(eq(fraudAlerts.id, foreignFraudAlertId)) : [],
        tenantlessVehicleRegistryId ? db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(eq(vehicleRegistry.id, tenantlessVehicleRegistryId)) : [],
        vehicleRegistryId ? db.select({ id: vehicleRegistry.id }).from(vehicleRegistry).where(eq(vehicleRegistry.id, vehicleRegistryId)) : [],
        unrelatedUserId ? db.select({ id: users.id }).from(users).where(eq(users.id, unrelatedUserId)) : [],
        insurerUserId ? db.select({ id: users.id }).from(users).where(eq(users.id, insurerUserId)) : [],
        agencyUserId ? db.select({ id: users.id }).from(users).where(eq(users.id, agencyUserId)) : [],
				]);
				expect(remaining.flat()).toHaveLength(0);
			});
		} finally {
      cacheWriteSpy?.mockRestore();
    }
  });

  it("returns the three qualifying insurer-status snapshots through the real tRPC procedure", async () => {
    const caller = appRouter.createCaller(contextFor(insurerUserId, insurerTenantId));
    const result = await caller.vehiclePassport.getPassport({ vehicleRegistryId });

    expect(result.vehicle.id).toBe(vehicleRegistryId);
    expect(result.intelligence.totalClaims).toBe(0);
    expect(result.intelligence.totalDamageEvents).toBe(0);
    expect(result.intelligence.totalFraudSignals).toBe(0);
    expect(result.intelligence.totalInspections).toBe(0);
    expect(result.intelligence.fraudAlertCount).toBe(0);
    expect(result.preLossConditionSnapshots).toHaveLength(3);
    expect(result.preLossConditionSnapshots.map((snapshot) => snapshot.requestNumber).sort()).toEqual(expectedRequestNumbers.sort());
    expect(result.preLossConditionSnapshots.map((snapshot) => snapshot.observations).sort()).toEqual(expectedObservations.sort());

    panelState.passport = result;
  });

  it("returns only bounded pre-loss evidence to a legitimately invited insurer", async () => {
    const caller = appRouter.createCaller(contextFor(insurerUserId, insurerTenantId));
    const timeline = await caller.vehiclePassport.getTimeline({ vehicleRegistryId });

    expect(timeline.events).toHaveLength(3);
    expect(timeline.events.map((event) => event.sourceTable)).toEqual([
      "vehicle_condition_snapshots",
      "vehicle_condition_snapshots",
      "vehicle_condition_snapshots",
    ]);
  });

  it("keeps all Passport aggregate, timeline, claim-history, and fraud-signal sources within the requesting tenant", async () => {
    const aggregate = await aggregateVehiclePassport(vehicleRegistryId, agencyTenantId);
    expect(aggregate).toMatchObject({
      totalClaims: 1,
      totalDamageEvents: 1,
      totalFraudSignals: 1,
      totalInspections: 1,
      fraudAlertCount: 1,
    });

    const caller = appRouter.createCaller(contextFor(agencyUserId, agencyTenantId));
    const [timeline, claimHistory, fraudSignals] = await Promise.all([
      caller.vehiclePassport.getTimeline({ vehicleRegistryId }),
      caller.vehiclePassport.getClaimHistory({ vehicleRegistryId }),
      caller.vehiclePassport.getFraudSignals({ vehicleRegistryId }),
    ]);
    expect(timeline.events.map((event) => event.sourceId)).toContain(ownerDamageHistoryId);
    expect(timeline.events.map((event) => event.sourceId)).toContain(ownerInspectionId);
    expect(timeline.events.map((event) => event.sourceId)).toContain(ownerFraudAlertId);
    expect(timeline.events.map((event) => event.sourceId)).not.toContain(foreignDamageHistoryId);
    expect(timeline.events.map((event) => event.sourceId)).not.toContain(foreignInspectionId);
    expect(timeline.events.map((event) => event.sourceId)).not.toContain(foreignFraudAlertId);
    expect(claimHistory.claims.map((claim) => claim.claimId)).toEqual([claimId]);
    expect(fraudSignals.signals.map((signal) => signal.id)).toEqual([ownerSignalId]);
    expect(fraudSignals.alerts.map((alert) => alert.id)).toEqual([ownerFraudAlertId]);
  });

  it("denies an unrelated tenant without an agency invitation across every sensitive Passport endpoint", async () => {
    const caller = appRouter.createCaller(contextFor(unrelatedUserId, unrelatedTenantId));

    for (const request of [
      () => caller.vehiclePassport.getPassport({ vehicleRegistryId }),
      () => caller.vehiclePassport.getTimeline({ vehicleRegistryId }),
      () => caller.vehiclePassport.getClaimHistory({ vehicleRegistryId }),
      () => caller.vehiclePassport.getFraudSignals({ vehicleRegistryId }),
    ]) {
      await expect(request()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
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

  it("denies a tenantless vehicle to a valid but unrelated tenant on all three previously permissive endpoints", async () => {
    const caller = appRouter.createCaller(contextFor(unrelatedUserId, unrelatedTenantId));

    for (const request of [
      () => caller.vehiclePassport.getTimeline({ vehicleRegistryId: tenantlessVehicleRegistryId }),
      () => caller.vehiclePassport.getClaimHistory({ vehicleRegistryId: tenantlessVehicleRegistryId }),
      () => caller.vehiclePassport.getFraudSignals({ vehicleRegistryId: tenantlessVehicleRegistryId }),
    ]) {
      await expect(request()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("denies a tenantless vehicle before data access when the authenticated session has no tenant", async () => {
    const caller = appRouter.createCaller(contextFor(unrelatedUserId, null) as any);

    for (const request of [
      () => caller.vehiclePassport.getTimeline({ vehicleRegistryId: tenantlessVehicleRegistryId }),
      () => caller.vehiclePassport.getClaimHistory({ vehicleRegistryId: tenantlessVehicleRegistryId }),
      () => caller.vehiclePassport.getFraudSignals({ vehicleRegistryId: tenantlessVehicleRegistryId }),
    ]) {
      await expect(request()).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "A tenant-scoped session is required",
      });
    }
  });
});
