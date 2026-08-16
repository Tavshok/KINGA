import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { agencyDocuments, quotationRequests, users } from "../../drizzle/schema";

describe("AUD-P0 legacy agency record authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenant = "";
  let customerAId = 0;
  let customerBId = 0;
  let quotationAId = 0;
  let quotationBId = 0;

  const contextFor = (id: number) => ({
    user: { id, role: "claimant", tenantId: tenant, openId: `legacy-agency-authority-${id}`, name: "Legacy agency authority fixture" },
    req: {} as any,
    res: {} as any,
  });

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for legacy agency authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenant = `test-legacy-agency-authority-${stamp}`;
    const customerAOpenId = `legacy-agency-customer-a-${stamp}`;
    const customerBOpenId = `legacy-agency-customer-b-${stamp}`;
    await db.insert(users).values([
      { openId: customerAOpenId, email: `${customerAOpenId}@invalid.example`, name: "Customer A", role: "claimant", tenantId: tenant, emailVerified: 1 },
      { openId: customerBOpenId, email: `${customerBOpenId}@invalid.example`, name: "Customer B", role: "claimant", tenantId: tenant, emailVerified: 1 },
    ]);
    const [customerA, customerB] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.openId, customerAOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, customerBOpenId)).then((rows) => rows[0]),
    ]);
    if (!customerA || !customerB) throw new Error("Unable to resolve legacy agency authority users");
    customerAId = customerA.id;
    customerBId = customerB.id;
    await db.insert(quotationRequests).values([
      { requestNumber: `LEGACY-A-${stamp}`, tenantId: tenant, userId: customerAId, fullName: "Customer A", email: `${customerAOpenId}@invalid.example`, insuranceType: "comprehensive", vehicleMake: "Toyota", vehicleModel: "Vitz", vehicleYear: 2020, vehicleRegistration: `LAA${stamp.slice(-6).toUpperCase()}`, status: "pending" },
      { requestNumber: `LEGACY-B-${stamp}`, tenantId: tenant, userId: customerBId, fullName: "Customer B", email: `${customerBOpenId}@invalid.example`, insuranceType: "comprehensive", vehicleMake: "Mazda", vehicleModel: "Demio", vehicleYear: 2021, vehicleRegistration: `LAB${stamp.slice(-6).toUpperCase()}`, status: "pending" },
    ]);
    const [quotationA, quotationB] = await Promise.all([
      db.select({ id: quotationRequests.id }).from(quotationRequests).where(and(eq(quotationRequests.userId, customerAId), eq(quotationRequests.tenantId, tenant))).then((rows) => rows[0]),
      db.select({ id: quotationRequests.id }).from(quotationRequests).where(and(eq(quotationRequests.userId, customerBId), eq(quotationRequests.tenantId, tenant))).then((rows) => rows[0]),
    ]);
    if (!quotationA || !quotationB) throw new Error("Unable to resolve legacy agency authority quotation fixtures");
    quotationAId = quotationA.id;
    quotationBId = quotationB.id;
  });

  afterAll(async () => {
    if (!db || !tenant) return;
    await db.delete(agencyDocuments).where(inArray(agencyDocuments.quotationRequestId, [quotationAId, quotationBId]));
    await db.delete(quotationRequests).where(eq(quotationRequests.tenantId, tenant));
    await db.delete(users).where(eq(users.tenantId, tenant));
  });

  it("retires unscoped legacy cross-record quotation and policy administration", async () => {
    const customerA = appRouter.createCaller(contextFor(customerAId));
    await expect(customerA.agency.allQuotations({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(customerA.agency.updateQuotation({ id: quotationBId, status: "quoted" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(customerA.agency.allPolicies({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies foreign quotation document access before storage or disclosure and limits vehicle intelligence to an owned quotation", async () => {
    const customerA = appRouter.createCaller(contextFor(customerAId));
    await expect(customerA.agency.uploadDocument({ quotationRequestId: quotationBId, documentType: "vehicle_photos", title: "Denied", fileName: "denied.png", fileData: "data:image/png;base64,AA==" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(customerA.agency.getDocuments({ quotationRequestId: quotationBId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(customerA.agency.getDocuments({ quotationRequestId: quotationAId })).resolves.toEqual([]);
    await expect(customerA.agency.getVehicleRiskIntelligence({ registrationNumber: `LAB${tenant.slice(-6).toUpperCase()}` })).resolves.toEqual({ found: false });
    const documents = await db.select({ id: agencyDocuments.id }).from(agencyDocuments).where(eq(agencyDocuments.quotationRequestId, quotationBId));
    expect(documents).toHaveLength(0);
  });
});
