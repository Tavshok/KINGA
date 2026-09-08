import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { aiAssessments, claims, panelBeaterQuotes, panelBeaters, quoteLineItems, users } from "../../drizzle/schema";
import { generateReportHtml } from "./reportDefinitions";
import { generateClaimsIntelligenceReport } from "./claimsIntelligenceReport";
import { generateForensicDecisionReport } from "./forensicDecisionReport";

describe("P0 Package B live shared quote evidence parity", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantId = "";
  let claimantId = 0;
  let repairerAId = 0;
  let repairerBId = 0;
  let claimId = 0;
  let quoteIds: number[] = [];

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database unavailable for Package B shared quote evidence test");
    db = connection;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantId = `test-package-b-${stamp}`;
    const claimantOpenId = `package-b-claimant-${stamp}`;
    await db.insert(users).values({ openId: claimantOpenId, email: `${claimantOpenId}@invalid.example`, name: "Package B Claimant", role: "claimant", tenantId, emailVerified: 1 });
    const [claimant] = await db.select({ id: users.id }).from(users).where(eq(users.openId, claimantOpenId)).limit(1);
    if (!claimant) throw new Error("Package B claimant fixture was not created");
    claimantId = claimant.id;
    await db.insert(panelBeaters).values([
      { name: "Package B Alpha", businessName: `Package B Alpha ${stamp}`, tenantId, approved: 1, panelBeaterStatus: "approved" },
      { name: "Package B Beta", businessName: `Package B Beta ${stamp}`, tenantId, approved: 1, panelBeaterStatus: "approved" },
    ]);
    const repairers = await db.select({ id: panelBeaters.id, name: panelBeaters.name }).from(panelBeaters).where(eq(panelBeaters.tenantId, tenantId));
    repairerAId = repairers.find((row) => row.name === "Package B Alpha")?.id ?? 0;
    repairerBId = repairers.find((row) => row.name === "Package B Beta")?.id ?? 0;
    if (!repairerAId || !repairerBId) throw new Error("Package B repairer fixtures were not created");
    await db.insert(claims).values({ claimantId, claimNumber: `PACKAGE-B-${stamp}`, tenantId, status: "analysis_complete", vehicleMake: "Toyota", vehicleModel: "Hilux", vehicleYear: 2023, vehicleRegistration: `PB-${stamp.slice(-6)}`, incidentType: "collision", incidentDescription: "Owned Package B report fixture" });
    const [claim] = await db.select({ id: claims.id }).from(claims).where(and(eq(claims.tenantId, tenantId), eq(claims.claimantId, claimantId))).limit(1);
    if (!claim) throw new Error("Package B claim fixture was not created");
    claimId = claim.id;
    await db.insert(panelBeaterQuotes).values([
      { claimId, panelBeaterId: repairerAId, quotedAmount: 100000, tenantId, currencyCode: "USD", status: "submitted", itemizedBreakdown: "[]" },
      { claimId, panelBeaterId: repairerBId, quotedAmount: 120000, tenantId, currencyCode: "USD", status: "submitted", itemizedBreakdown: "[]" },
    ]);
    quoteIds = (await db.select({ id: panelBeaterQuotes.id }).from(panelBeaterQuotes).where(and(eq(panelBeaterQuotes.claimId, claimId), eq(panelBeaterQuotes.tenantId, tenantId)))).map((row) => row.id);
    if (quoteIds.length !== 2) throw new Error("Package B quote fixtures were not created");
    await db.insert(quoteLineItems).values([
      { quoteId: quoteIds[0], description: "Front bumper", category: "parts", quantity: "1", unitPrice: "450.00", lineTotal: "450.00", currency: "USD" },
      { quoteId: quoteIds[1], description: "Front bumper", category: "parts", quantity: "1", unitPrice: "420.00", lineTotal: "420.00", currency: "USD" },
      { quoteId: quoteIds[1], description: "Headlamp", category: "parts", quantity: "1", unitPrice: "220.00", lineTotal: "220.00", currency: "USD" },
    ]);
    await db.insert(aiAssessments).values({ claimId, tenantId, confidenceScore: 90, recommendation: "REVIEW", costIntelligenceJson: JSON.stringify({ compositeOptimisation: { canonicalQuoteLedger: [
      { quoteId: quoteIds[0], panelBeater: "Package B Alpha", totalCostUsd: 1000, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
      { quoteId: quoteIds[1], panelBeater: "Package B Beta", totalCostUsd: 1200, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
    ], sourceQuotesReceived: 2, l1SubmittedCostUsd: 1000, l2CompositeOptimisedCostUsd: 950, isComplete: true, quoteScopeStatus: "complete", l2Status: "complete", compositeLineItems: [{ componentName: "Front bumper", selectedCostUsd: 410, l2SelectionMethod: "fixture" }, { componentName: "Headlamp", selectedCostUsd: 210, l2SelectionMethod: "fixture" }] } }) });
  });

  afterAll(async () => {
    if (!db || !tenantId) return;
    if (quoteIds.length) await db.delete(quoteLineItems).where(inArray(quoteLineItems.quoteId, quoteIds));
    await db.delete(panelBeaterQuotes).where(and(eq(panelBeaterQuotes.claimId, claimId), eq(panelBeaterQuotes.tenantId, tenantId)));
    if (claimId) await db.delete(aiAssessments).where(and(eq(aiAssessments.claimId, claimId), eq(aiAssessments.tenantId, tenantId)));
    if (claimId) await db.delete(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
    await db.delete(panelBeaters).where(eq(panelBeaters.tenantId, tenantId));
    if (claimantId) await db.delete(users).where(and(eq(users.id, claimantId), eq(users.tenantId, tenantId)));
    const remaining = await db.select({ id: claims.id }).from(claims).where(eq(claims.tenantId, tenantId));
    if (remaining.length > 0) throw new Error("Package B fixture teardown left tenant-scoped claim rows");
  });

  it("renders the same active canonical comparison, missing-price marker, L1, and L2 across CL, CI, and FR", async () => {
    const [cl, ci, fr] = await Promise.all([generateReportHtml("claim.assessment", { claimId }, tenantId), generateClaimsIntelligenceReport(claimId, tenantId), generateForensicDecisionReport(claimId, tenantId)]);
    const sections = [cl, ci, fr].map((html) => html.match(/<section data-shared-quote-evidence="active-comparison"[\s\S]*?<\/section>/)?.[0]);
    for (const section of sections) {
      expect(section).toContain("Package B Alpha");
      expect(section).toContain("Package B Beta");
      expect(section).toContain("Not quoted");
      expect(section).toContain("$1,000.00");
      expect(section).toContain("$950.00");
    }
    expect(sections[0]).toBe(sections[1]);
    expect(sections[1]).toBe(sections[2]);
  });
});
