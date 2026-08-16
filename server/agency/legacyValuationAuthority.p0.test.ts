import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { quotationRequests, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { appRouter } from "../routers";

describe("AUD-P0 legacy valuation agency authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA: string;
  let tenantB: string;
  let agencyAId: number;
  let agencyBId: number;
  let inspectorAId: number;
  let requestAId: number;
  let requestBId: number;

  const contextFor = (id: number, role: "agency" | "insurer" | "claimant", tenantId: string) => ({
    user: {
      id,
      openId: `legacy-valuation-oat-${id}`,
      email: `legacy-valuation-oat-${id}@invalid.example`,
      name: "Legacy Valuation OAT User",
      role,
      tenantId,
      isUnregisteredClaimant: 0,
    },
  }) as any;

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for legacy valuation authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-legacy-valuation-a-${stamp}`;
    tenantB = `test-legacy-valuation-b-${stamp}`;

    const agencyAOpenId = `legacy-agency-a-${stamp}`;
    const agencyBOpenId = `legacy-agency-b-${stamp}`;
    const inspectorAOpenId = `legacy-inspector-a-${stamp}`;
    const requestANumber = `LEGACY-A-${stamp}`;
    const requestBNumber = `LEGACY-B-${stamp}`;
    await Promise.all([
      db.insert(users).values({ openId: agencyAOpenId, email: `${agencyAOpenId}@invalid.example`, name: "Agency A", role: "agency", tenantId: tenantA, emailVerified: 1 }),
      db.insert(users).values({ openId: agencyBOpenId, email: `${agencyBOpenId}@invalid.example`, name: "Agency B", role: "agency", tenantId: tenantB, emailVerified: 1 }),
      db.insert(users).values({ openId: inspectorAOpenId, email: `${inspectorAOpenId}@invalid.example`, name: "Inspector A", role: "engineer", tenantId: tenantA, emailVerified: 1 }),
      db.insert(quotationRequests).values({ requestNumber: requestANumber, tenantId: tenantA, fullName: "Tenant A Client", email: `tenant-a-${stamp}@invalid.example`, insuranceType: "comprehensive", vehicleMake: "Toyota", vehicleModel: "Corolla", vehicleYear: 2020, status: "pending" }),
      db.insert(quotationRequests).values({ requestNumber: requestBNumber, tenantId: tenantB, fullName: "Tenant B Client", email: `tenant-b-${stamp}@invalid.example`, insuranceType: "comprehensive", vehicleMake: "Mazda", vehicleModel: "Demio", vehicleYear: 2021, status: "pending" }),
    ]);
    const [agencyA] = await db.select({ id: users.id }).from(users).where(eq(users.openId, agencyAOpenId)).limit(1);
    const [agencyB] = await db.select({ id: users.id }).from(users).where(eq(users.openId, agencyBOpenId)).limit(1);
    const [inspectorA] = await db.select({ id: users.id }).from(users).where(eq(users.openId, inspectorAOpenId)).limit(1);
    const [requestA] = await db.select({ id: quotationRequests.id }).from(quotationRequests).where(and(eq(quotationRequests.requestNumber, requestANumber), eq(quotationRequests.tenantId, tenantA))).limit(1);
    const [requestB] = await db.select({ id: quotationRequests.id }).from(quotationRequests).where(and(eq(quotationRequests.requestNumber, requestBNumber), eq(quotationRequests.tenantId, tenantB))).limit(1);
    if (!agencyA || !agencyB || !inspectorA || !requestA || !requestB) throw new Error("Unable to resolve isolated authority fixture records");
    agencyAId = agencyA.id;
    agencyBId = agencyB.id;
    inspectorAId = inspectorA.id;
    requestAId = requestA.id;
    requestBId = requestB.id;
  });

  it("returns only the authenticated agency tenant's legacy history", async () => {
    const records = await appRouter.createCaller(contextFor(agencyAId, "agency", tenantA)).insuranceV2.getValuationRequests({ limit: 100 });
    expect(records.some((record: any) => record.id === requestAId)).toBe(true);
    expect(records.some((record: any) => record.id === requestBId)).toBe(false);
  });

  it("denies roles outside the agency or insurer service boundary", async () => {
    await expect(
      appRouter.createCaller(contextFor(agencyAId, "claimant", tenantA)).insuranceV2.getValuationRequests({ limit: 100 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies foreign legacy records before report, inspector, quote, or document side effects", async () => {
    const caller = appRouter.createCaller(contextFor(agencyAId, "agency", tenantA));
    await expect(caller.insuranceV2.unlockReportOnPolicyIssuance({ quotationRequestId: requestBId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.insuranceV2.assignInspector({ quotationRequestId: requestBId, inspectorUserId: inspectorAId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.insuranceV2.sendQuoteToClient({ quotationRequestId: requestBId, quotedPremium: 100, quotedExcess: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.insuranceV2.sendDocumentToClient({ quotationRequestId: requestBId, title: "No foreign attachment", fileName: "no-foreign.txt", fileData: "bm8=", documentType: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const [foreign] = await db.select().from(quotationRequests).where(and(eq(quotationRequests.id, requestBId), eq(quotationRequests.tenantId, tenantB))).limit(1);
    expect(foreign).toMatchObject({ status: "pending", inspectionAssignedTo: null, quotedPremium: null, reportGatingStatus: "teaser" });
  });

  it("permits same-tenant agency service actions without expanding the legacy lifecycle", async () => {
    const caller = appRouter.createCaller(contextFor(agencyAId, "agency", tenantA));
    await expect(caller.insuranceV2.assignInspector({ quotationRequestId: requestAId, inspectorUserId: inspectorAId })).resolves.toEqual({ success: true });
    await expect(caller.insuranceV2.sendQuoteToClient({ quotationRequestId: requestAId, quotedPremium: 100, quotedExcess: 10 })).resolves.toMatchObject({ success: true });
    await expect(caller.insuranceV2.unlockReportOnPolicyIssuance({ quotationRequestId: requestAId })).resolves.toEqual({ success: true });

    const [sameTenant] = await db.select().from(quotationRequests).where(and(eq(quotationRequests.id, requestAId), eq(quotationRequests.tenantId, tenantA))).limit(1);
    expect(sameTenant).toMatchObject({ inspectionAssignedTo: inspectorAId, quotedPremium: 100, reportGatingStatus: "full", status: "accepted" });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(quotationRequests).where(and(eq(quotationRequests.tenantId, tenantA), eq(quotationRequests.id, requestAId)));
    await db.delete(quotationRequests).where(and(eq(quotationRequests.tenantId, tenantB), eq(quotationRequests.id, requestBId)));
    await db.delete(users).where(eq(users.tenantId, tenantA));
    await db.delete(users).where(eq(users.tenantId, tenantB));
  });
});
