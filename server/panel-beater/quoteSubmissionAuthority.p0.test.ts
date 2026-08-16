import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { claims, panelBeaterQuotes, panelBeaters, users } from "../../drizzle/schema";

describe("AUD-P0 panel-beater quote submission authority", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantA = "";
  let tenantB = "";
  let repairerAUserId = 0;
  let repairerBUserId = 0;
  let assignedAssessorId = 0;
  let unassignedAssessorId = 0;
  let adminAId = 0;
  let repairerAId = 0;
  let repairerBId = 0;
  let claimAId = 0;
  let quoteAId = 0;

  const contextFor = (id: number, tenantId: string, role: "panel_beater" | "assessor" | "admin" = "panel_beater") => ({
    user: { id, role, tenantId, openId: `quote-authority-${id}`, name: "Quote authority fixture" },
    req: {} as any,
    res: {} as any,
  });

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for quote authority test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-quote-authority-a-${stamp}`;
    tenantB = `test-quote-authority-b-${stamp}`;
    const repairerAOpenId = `quote-repairer-a-${stamp}`;
    const repairerBOpenId = `quote-repairer-b-${stamp}`;
    const assignedAssessorOpenId = `quote-assessor-a-${stamp}`;
    const unassignedAssessorOpenId = `quote-assessor-b-${stamp}`;
    const adminAOpenId = `quote-admin-a-${stamp}`;
    const claimantOpenId = `quote-claimant-a-${stamp}`;
    await db.insert(users).values([
      { openId: repairerAOpenId, email: `${repairerAOpenId}@invalid.example`, name: "Repairer A", role: "panel_beater", tenantId: tenantA, emailVerified: 1 },
      { openId: repairerBOpenId, email: `${repairerBOpenId}@invalid.example`, name: "Repairer B", role: "panel_beater", tenantId: tenantB, emailVerified: 1 },
      { openId: assignedAssessorOpenId, email: `${assignedAssessorOpenId}@invalid.example`, name: "Assigned Assessor", role: "assessor", tenantId: tenantA, emailVerified: 1 },
      { openId: unassignedAssessorOpenId, email: `${unassignedAssessorOpenId}@invalid.example`, name: "Unassigned Assessor", role: "assessor", tenantId: tenantA, emailVerified: 1 },
      { openId: adminAOpenId, email: `${adminAOpenId}@invalid.example`, name: "Admin A", role: "admin", tenantId: tenantA, emailVerified: 1 },
      { openId: claimantOpenId, email: `${claimantOpenId}@invalid.example`, name: "Claimant A", role: "claimant", tenantId: tenantA, emailVerified: 1 },
    ]);
    const [repairerA, repairerB, assignedAssessor, unassignedAssessor, adminA, claimant] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.openId, repairerAOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, repairerBOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, assignedAssessorOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, unassignedAssessorOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, adminAOpenId)).then((rows) => rows[0]),
      db.select({ id: users.id }).from(users).where(eq(users.openId, claimantOpenId)).then((rows) => rows[0]),
    ]);
    if (!repairerA || !repairerB || !assignedAssessor || !unassignedAssessor || !adminA || !claimant) throw new Error("Unable to resolve quote authority users");
    repairerAUserId = repairerA.id;
    repairerBUserId = repairerB.id;
    assignedAssessorId = assignedAssessor.id;
    unassignedAssessorId = unassignedAssessor.id;
    adminAId = adminA.id;

    await db.insert(panelBeaters).values([
      { name: "Repairer A", businessName: `Authority Repairer A ${stamp}`, userId: repairerAUserId, tenantId: tenantA, approved: 1, panelBeaterStatus: "approved" },
      { name: "Repairer B", businessName: `Authority Repairer B ${stamp}`, userId: repairerBUserId, tenantId: tenantB, approved: 1, panelBeaterStatus: "approved" },
    ]);
    const [repairerAProfile, repairerBProfile] = await Promise.all([
      db.select({ id: panelBeaters.id }).from(panelBeaters).where(and(eq(panelBeaters.userId, repairerAUserId), eq(panelBeaters.tenantId, tenantA))).then((rows) => rows[0]),
      db.select({ id: panelBeaters.id }).from(panelBeaters).where(and(eq(panelBeaters.userId, repairerBUserId), eq(panelBeaters.tenantId, tenantB))).then((rows) => rows[0]),
    ]);
    if (!repairerAProfile || !repairerBProfile) throw new Error("Unable to resolve repairer profiles");
    repairerAId = repairerAProfile.id;
    repairerBId = repairerBProfile.id;

    await db.insert(claims).values({
      claimantId: claimant.id,
      claimNumber: `QUOTE-AUTH-${stamp}`,
      tenantId: tenantA,
      status: "quotes_pending",
      incidentType: "collision",
      assignedPanelBeaterId: repairerAId,
      assignedAssessorId,
    });
    const [claim] = await db.select({ id: claims.id }).from(claims).where(and(eq(claims.tenantId, tenantA), eq(claims.assignedPanelBeaterId, repairerAId))).limit(1);
    if (!claim) throw new Error("Unable to resolve quote authority claim");
    claimAId = claim.id;
  });

  afterAll(async () => {
    if (!db || !tenantA || !tenantB) return;
    const tenantIds = [tenantA, tenantB];
    await db.delete(panelBeaterQuotes).where(inArray(panelBeaterQuotes.tenantId, tenantIds));
    await db.delete(claims).where(inArray(claims.tenantId, tenantIds));
    await db.delete(panelBeaters).where(inArray(panelBeaters.tenantId, tenantIds));
    await db.delete(users).where(inArray(users.tenantId, tenantIds));
  });

  it("rejects foreign-tenant and caller-supplied repairer identity substitution before a quote write", async () => {
    const foreignRepairer = appRouter.createCaller(contextFor(repairerBUserId, tenantB));
    const authorisedRepairer = appRouter.createCaller(contextFor(repairerAUserId, tenantA));
    const input = { claimId: claimAId, panelBeaterId: repairerBId, quotedAmount: 100000, estimatedDuration: 3, itemizedBreakdown: [{ item: "Bumper", cost: 100000 }] };
    await expect(foreignRepairer.quotes.submit(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(authorisedRepairer.quotes.submit(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const foreignWrites = await db.select({ id: panelBeaterQuotes.id }).from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, claimAId));
    expect(foreignWrites).toHaveLength(0);
  });

  it("allows the authorised repairer to submit and to create a supplemental quote only from its own parent quote", async () => {
    const authorisedRepairer = appRouter.createCaller(contextFor(repairerAUserId, tenantA));
    await expect(authorisedRepairer.quotes.submit({
      claimId: claimAId, panelBeaterId: repairerAId, quotedAmount: 120000, estimatedDuration: 4,
      itemizedBreakdown: [{ item: "Bumper", cost: 120000 }],
    })).resolves.toMatchObject({ success: true });
    const [quote] = await db.select({ id: panelBeaterQuotes.id, panelBeaterId: panelBeaterQuotes.panelBeaterId, tenantId: panelBeaterQuotes.tenantId })
      .from(panelBeaterQuotes).where(and(eq(panelBeaterQuotes.claimId, claimAId), eq(panelBeaterQuotes.panelBeaterId, repairerAId))).limit(1);
    expect(quote).toMatchObject({ panelBeaterId: repairerAId, tenantId: tenantA });
    quoteAId = quote!.id;
    await expect(authorisedRepairer.quotes.submitSupplementary({
      claimId: claimAId, panelBeaterId: repairerAId, parentQuoteId: quoteAId, quotedAmount: 5000,
      itemizedBreakdown: [{ item: "Clip", cost: 5000 }],
    })).resolves.toMatchObject({ success: true });
    const supplementary = await db.select({ id: panelBeaterQuotes.id }).from(panelBeaterQuotes).where(and(eq(panelBeaterQuotes.parentQuoteId, quoteAId), eq(panelBeaterQuotes.quoteType, "supplementary")));
    expect(supplementary).toHaveLength(1);
  });

  it("rejects a foreign repairer before it can supersede or supplement another repairer quote", async () => {
    const foreignRepairer = appRouter.createCaller(contextFor(repairerBUserId, tenantB));
    await expect(foreignRepairer.quotes.submitStripRequote({
      claimId: claimAId, panelBeaterId: repairerBId, parentQuoteId: quoteAId, quotedAmount: 130000,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [parent] = await db.select({ status: panelBeaterQuotes.status }).from(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, quoteAId)).limit(1);
    expect(parent?.status).toBe("submitted");
  });

  it("allows only the exact assigned assessor to adjust the controlled quote", async () => {
    const assignedAssessor = appRouter.createCaller(contextFor(assignedAssessorId, tenantA, "assessor"));
    const unassignedAssessor = appRouter.createCaller(contextFor(unassignedAssessorId, tenantA, "assessor"));
    await expect(unassignedAssessor.quotes.adjustByAssessor({ quoteId: quoteAId, adjustedAmount: 110000 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assignedAssessor.quotes.adjustByAssessor({ quoteId: quoteAId, adjustedAmount: 110000, modificationReason: "Fixture review" })).resolves.toMatchObject({ success: true });
  });

  it("denies an unassigned assessor before quote-audit evidence access or write", async () => {
    const unassignedAssessor = appRouter.createCaller(contextFor(unassignedAssessorId, tenantA, "assessor"));
    await expect(unassignedAssessor.quotes.runAudit({ quoteId: quoteAId, claimId: claimAId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps administrative quote reads within the caller tenant", async () => {
    const adminA = appRouter.createCaller(contextFor(adminAId, tenantA, "admin"));
    await expect(adminA.quotes.byClaim({ claimId: claimAId })).resolves.toHaveLength(2);
    await expect(adminA.quotes.byClaim({ claimId: claimAId + 99999999 })).resolves.toEqual([]);
  });
});
