import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { claims, insurerQuoteRequests, users } from "../../drizzle/schema";

describe("AUD-P0 agency insurer quote-request authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA = "";
  let tenantB = "";
  let agencyAId = 0;
  let agencyBId = 0;
  let claimAId = 0;
  let claimBId = 0;

  const contextFor = (id: number, tenantId: string) => ({
    user: { id, role: "agency", tenantId, openId: `agency-quote-authority-${id}`, name: "Agency quote authority fixture" },
    req: {} as any,
    res: {} as any,
  });

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for agency quote authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-agency-quote-authority-a-${stamp}`;
    tenantB = `test-agency-quote-authority-b-${stamp}`;
    const agencyAOpenId = `agency-quote-a-${stamp}`;
    const agencyBOpenId = `agency-quote-b-${stamp}`;
    await db.insert(users).values([
      { openId: agencyAOpenId, email: `${agencyAOpenId}@invalid.example`, name: "Agency A", role: "agency", tenantId: tenantA, emailVerified: 1 },
      { openId: agencyBOpenId, email: `${agencyBOpenId}@invalid.example`, name: "Agency B", role: "agency", tenantId: tenantB, emailVerified: 1 },
    ]);
    const [agencyA, agencyB] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.openId, agencyAOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, agencyBOpenId)).then((rows) => rows[0]),
    ]);
    if (!agencyA || !agencyB) throw new Error("Unable to resolve agency authority users");
    agencyAId = agencyA.id;
    agencyBId = agencyB.id;

    await db.insert(claims).values([
      { claimantId: agencyAId, claimNumber: `AGENCY-QUOTE-A-${stamp}`, tenantId: tenantA, status: "intake_pending", incidentType: "collision", claimSource: "agency" },
      { claimantId: agencyBId, claimNumber: `AGENCY-QUOTE-B-${stamp}`, tenantId: tenantB, status: "intake_pending", incidentType: "collision", claimSource: "agency" },
    ]);
    const [claimA, claimB] = await Promise.all([
      db.select({ id: claims.id }).from(claims).where(and(eq(claims.tenantId, tenantA), eq(claims.claimantId, agencyAId))).then((rows) => rows[0]),
      db.select({ id: claims.id }).from(claims).where(and(eq(claims.tenantId, tenantB), eq(claims.claimantId, agencyBId))).then((rows) => rows[0]),
    ]);
    if (!claimA || !claimB) throw new Error("Unable to resolve agency quote authority claims");
    claimAId = claimA.id;
    claimBId = claimB.id;

    await db.insert(insurerQuoteRequests).values([
      { claimId: claimAId, insurerTenantId: `fixture-insurer-a-${stamp}`, agencyTenantId: tenantA, status: "sent" },
      { claimId: claimBId, insurerTenantId: `fixture-insurer-b-${stamp}`, agencyTenantId: tenantB, status: "sent" },
    ]);
  });

  afterAll(async () => {
    if (!db || !tenantA || !tenantB) return;
    const tenantIds = [tenantA, tenantB];
    await db.delete(insurerQuoteRequests).where(inArray(insurerQuoteRequests.agencyTenantId, tenantIds));
    await db.delete(claims).where(inArray(claims.tenantId, tenantIds));
    await db.delete(users).where(inArray(users.tenantId, tenantIds));
  });

  it("lists only insurer requests from the authenticated agency tenant", async () => {
    const agencyA = appRouter.createCaller(contextFor(agencyAId, tenantA));
    await expect(agencyA.agencyBroker.getQuoteRequests({ claimId: claimAId })).resolves.toMatchObject({ quotes: [expect.objectContaining({ claimId: claimAId, agencyTenantId: tenantA })] });
    await expect(agencyA.agencyBroker.getQuoteRequests({ claimId: claimBId })).resolves.toEqual({ quotes: [] });
  });

  it("denies foreign claim dispatch before creating insurer quote requests", async () => {
    const agencyA = appRouter.createCaller(contextFor(agencyAId, tenantA));
    await expect(agencyA.agencyBroker.requestQuotes({ claimId: claimBId, insurerTenantIds: ["foreign-insurer-target"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await db.select({ id: insurerQuoteRequests.id }).from(insurerQuoteRequests).where(eq(insurerQuoteRequests.insurerTenantId, "foreign-insurer-target"));
    expect(rows).toHaveLength(0);
  });
});
