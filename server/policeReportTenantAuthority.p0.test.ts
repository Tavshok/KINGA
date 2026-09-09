import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { createClaim, getDb } from "./db";
import { auditTrail, claims, policeReports, users } from "../drizzle/schema";

const { extractPhysicsDataMock } = vi.hoisted(() => ({
  extractPhysicsDataMock: vi.fn(async () => ({
    roadSurface: "dry",
    vehicle1Mass: 1200,
    vehicle2Mass: 1400,
    skidMarkLength: 6.5,
    impactSpeed: 45,
    roadGradient: 0,
    lightingCondition: "daylight",
    trafficCondition: "light",
    confidence: 91,
    notes: "Fixture OCR result",
  })),
}));

vi.mock("./policeReportOCR", () => ({
  extractPhysicsDataFromPoliceReport: extractPhysicsDataMock,
}));

describe("P0 — police report parent-claim tenant authority", () => {
  const fixtureStamp = `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantA = `${fixtureStamp}-a`;
  const tenantB = `${fixtureStamp}-b`;
  const claimIds: number[] = [];
  const reportIds: number[] = [];
  const userIds: number[] = [];
  let tenantAClaimId = 0;
  let tenantBClaimId = 0;
  let tenantAReportId = 0;
  let tenantBReportId = 0;

  const insertId = (result: unknown): number => {
    const value = Number((result as any)[0]?.insertId ?? (result as any).insertId);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Expected an owned fixture insert ID");
    return value;
  };

  const callerFor = (userId: number, tenantId: string) => appRouter.createCaller({
    user: {
      id: userId,
      openId: `fixture-${userId}`,
      name: "Police Authority Fixture Assessor",
      email: `fixture-${userId}@example.invalid`,
      role: "assessor",
      tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as any,
    res: {} as any,
  } as any);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const createActorAndClaim = async (tenantId: string, suffix: string) => {
      const userId = insertId(await db.insert(users).values({
        openId: `${fixtureStamp}-${suffix}`,
        name: `Police Authority ${suffix}`,
        email: `${fixtureStamp}-${suffix}@example.invalid`,
        role: "assessor",
        tenantId,
        isActive: 1,
      }));
      userIds.push(userId);
      const claimId = insertId(await createClaim({
        claimantId: userId,
        claimNumber: `POLICE-AUTH-${suffix}-${fixtureStamp}`,
        vehicleMake: "Fixture",
        vehicleModel: "Tenant Authority",
        vehicleYear: 2020,
        vehicleRegistration: `PA-${suffix}`,
        incidentDate: new Date(),
        incidentDescription: "Owned police-authority fixture",
        incidentLocation: "Fixture location",
        damagePhotos: "[]",
        policyNumber: `POLICE-AUTH-${suffix}`,
        tenantId,
      }));
      claimIds.push(claimId);
      const reportId = insertId(await db.insert(policeReports).values({
        claimId,
        reportNumber: `POLICE-AUTH-${suffix}-${fixtureStamp}`,
        policeStation: "Fixture station",
      }));
      reportIds.push(reportId);
      return { userId, claimId, reportId };
    };

    const tenantAFixture = await createActorAndClaim(tenantA, "A");
    const tenantBFixture = await createActorAndClaim(tenantB, "B");
    tenantAClaimId = tenantAFixture.claimId;
    tenantAReportId = tenantAFixture.reportId;
    tenantBClaimId = tenantBFixture.claimId;
    tenantBReportId = tenantBFixture.reportId;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const audits = claimIds.length > 0
      ? await db.select({ id: auditTrail.id }).from(auditTrail).where(inArray(auditTrail.claimId, claimIds))
      : [];
    if (audits.length > 0) await db.delete(auditTrail).where(inArray(auditTrail.id, audits.map((row) => row.id)));
    if (reportIds.length > 0) await db.delete(policeReports).where(inArray(policeReports.id, reportIds));
    if (claimIds.length > 0) await db.delete(claims).where(inArray(claims.id, claimIds));
    if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));

    const [remainingAudits, remainingReports, remainingClaims, remainingUsers] = await Promise.all([
      audits.length > 0 ? db.select({ id: auditTrail.id }).from(auditTrail).where(inArray(auditTrail.id, audits.map((row) => row.id))) : Promise.resolve([]),
      reportIds.length > 0 ? db.select({ id: policeReports.id }).from(policeReports).where(inArray(policeReports.id, reportIds)) : Promise.resolve([]),
      claimIds.length > 0 ? db.select({ id: claims.id }).from(claims).where(inArray(claims.id, claimIds)) : Promise.resolve([]),
      userIds.length > 0 ? db.select({ id: users.id }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    ]);
    expect(remainingAudits).toHaveLength(0);
    expect(remainingReports).toHaveLength(0);
    expect(remainingClaims).toHaveLength(0);
    expect(remainingUsers).toHaveLength(0);
  });

  it("denies cross-tenant reads before returning a police report", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [tenantAUser] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantA)).limit(1);
    if (!tenantAUser) throw new Error("Missing tenant-A fixture user");

    await expect(callerFor(tenantAUser.id, tenantA).policeReports.byClaim({ claimId: tenantBClaimId }))
      .rejects.toThrow("Claim not found or access denied");
    await expect(callerFor(tenantAUser.id, tenantA).policeReports.byClaim({ claimId: tenantAClaimId }))
      .resolves.toMatchObject({ id: tenantAReportId });
  });

  it("denies cross-tenant OCR before calling the extractor and updates only the resolved tenant-local report", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [tenantAUser] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantA)).limit(1);
    if (!tenantAUser) throw new Error("Missing tenant-A fixture user");
    const caller = callerFor(tenantAUser.id, tenantA);

    extractPhysicsDataMock.mockClear();
    await expect(caller.policeReports.extractPhysicsData({ claimId: tenantBClaimId, reportDocumentUrl: "https://example.invalid/foreign.pdf" }))
      .rejects.toThrow("Claim not found or access denied");
    expect(extractPhysicsDataMock).not.toHaveBeenCalled();

    await caller.policeReports.extractPhysicsData({ claimId: tenantAClaimId, reportDocumentUrl: "https://example.invalid/local.pdf" });
    expect(extractPhysicsDataMock).toHaveBeenCalledTimes(1);
    const [updatedLocal] = await db.select({ ocrExtracted: policeReports.ocrExtracted, impactSpeed: policeReports.impactSpeed })
      .from(policeReports).where(eq(policeReports.id, tenantAReportId));
    const [untouchedForeign] = await db.select({ ocrExtracted: policeReports.ocrExtracted, impactSpeed: policeReports.impactSpeed })
      .from(policeReports).where(eq(policeReports.id, tenantBReportId));
    expect(updatedLocal).toMatchObject({ ocrExtracted: 1, impactSpeed: 45 });
    expect(untouchedForeign).toMatchObject({ ocrExtracted: 0, impactSpeed: null });
  });
});
