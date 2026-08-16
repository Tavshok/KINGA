import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { engineerProfiles, inspections, physicalMeasurements, users } from "../../drizzle/schema";

describe("AUD-P0 engineering inspection authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA = "";
  let tenantB = "";
  let engineerAId = 0;
  let engineerBId = 0;
  let adminAId = 0;
  let inspectionAId = 0;
  let inspectionBId = 0;

  const contextFor = (id: number, role: "engineer" | "admin", tenantId: string) => ({
    user: { id, role, tenantId, openId: `inspection-authority-${id}`, name: "Inspection authority fixture" },
    db,
    req: {} as any,
    res: {} as any,
  });

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for inspection authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-inspection-authority-a-${stamp}`;
    tenantB = `test-inspection-authority-b-${stamp}`;
    const engineerAOpenId = `inspection-engineer-a-${stamp}`;
    const engineerBOpenId = `inspection-engineer-b-${stamp}`;
    const adminAOpenId = `inspection-admin-a-${stamp}`;

    await db.insert(users).values([
      { openId: engineerAOpenId, email: `${engineerAOpenId}@invalid.example`, name: "Engineer A", role: "engineer", tenantId: tenantA, emailVerified: 1 },
      { openId: engineerBOpenId, email: `${engineerBOpenId}@invalid.example`, name: "Engineer B", role: "engineer", tenantId: tenantB, emailVerified: 1 },
      { openId: adminAOpenId, email: `${adminAOpenId}@invalid.example`, name: "Admin A", role: "admin", tenantId: tenantA, emailVerified: 1 },
    ]);
    const [engineerA, engineerB, adminA] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.openId, engineerAOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, engineerBOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, adminAOpenId)).then((rows) => rows[0]),
    ]);
    if (!engineerA || !engineerB || !adminA) throw new Error("Unable to resolve inspection authority users");
    engineerAId = engineerA.id;
    engineerBId = engineerB.id;
    adminAId = adminA.id;

    await db.insert(engineerProfiles).values([
      { userId: engineerAId, tenantId: tenantA },
      { userId: engineerBId, tenantId: tenantB },
    ]);
    await db.insert(inspections).values([
      { tenantId: tenantA, inspectionRef: `INS-A-${stamp}`, inspectionType: "engineering", status: "assigned", assetType: "vehicle", assignedEngineerId: engineerAId, createdBy: engineerAId },
      { tenantId: tenantB, inspectionRef: `INS-B-${stamp}`, inspectionType: "engineering", status: "assigned", assetType: "vehicle", assignedEngineerId: engineerBId, createdBy: engineerBId },
    ]);
    const [inspectionA, inspectionB] = await Promise.all([
      db.select({ id: inspections.id }).from(inspections).where(and(eq(inspections.tenantId, tenantA), eq(inspections.createdBy, engineerAId))).then((rows) => rows[0]),
      db.select({ id: inspections.id }).from(inspections).where(and(eq(inspections.tenantId, tenantB), eq(inspections.createdBy, engineerBId))).then((rows) => rows[0]),
    ]);
    if (!inspectionA || !inspectionB) throw new Error("Unable to resolve inspection authority fixtures");
    inspectionAId = inspectionA.id;
    inspectionBId = inspectionB.id;
  });

  afterAll(async () => {
    if (!db || !tenantA || !tenantB) return;
    const tenantIds = [tenantA, tenantB];
    await db.delete(physicalMeasurements).where(inArray(physicalMeasurements.tenantId, tenantIds));
    await db.delete(inspections).where(inArray(inspections.tenantId, tenantIds));
    await db.delete(engineerProfiles).where(inArray(engineerProfiles.tenantId, tenantIds));
    await db.delete(users).where(inArray(users.tenantId, tenantIds));
  });

  it("returns only the authenticated engineer's tenant and assigned inspection", async () => {
    const engineerA = appRouter.createCaller(contextFor(engineerAId, "engineer", tenantA));
    await expect(engineerA.inspections.get({ inspectionId: inspectionAId })).resolves.toMatchObject({ inspection: { id: inspectionAId, tenantId: tenantA } });
    await expect(engineerA.inspections.get({ inspectionId: inspectionBId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(engineerA.inspections.list({})).resolves.toMatchObject({ inspections: [expect.objectContaining({ id: inspectionAId, tenantId: tenantA })] });
  });

  it("denies foreign inspection writes and invalid evidence before any measurement or claim-link side effect", async () => {
    const engineerA = appRouter.createCaller(contextFor(engineerAId, "engineer", tenantA));
    const adminA = appRouter.createCaller(contextFor(adminAId, "admin", tenantA));
    await expect(engineerA.inspections.updateStatus({ inspectionId: inspectionBId, status: "in_progress" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(engineerA.inspections.linkToClaim({ inspectionId: inspectionBId, claimId: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adminA.inspections.assign({ inspectionId: inspectionBId, engineerUserId: engineerAId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(engineerA.inspections.addMeasurement({
      inspectionId: inspectionAId,
      measurementCategory: "structural",
      measurementType: "fixture",
      value: 1,
      unit: "mm",
      evidenceDocumentIds: [999999999],
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await db.select({ id: physicalMeasurements.id }).from(physicalMeasurements).where(eq(physicalMeasurements.inspectionId, inspectionAId));
    expect(rows).toHaveLength(0);
  });
});
