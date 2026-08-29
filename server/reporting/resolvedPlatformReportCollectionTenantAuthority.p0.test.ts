import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { claims } from "../../drizzle/schema";
import { getDb } from "../db";
import { generateReportHtml } from "./reportDefinitions";
import { resolvePlatformReportCollection } from "./resolvedPlatformReportCollection";

describe("resolved platform report collection authority", () => {
  it("keeps a tenant aggregate isolated and permits a platform-global aggregate only with explicit authority", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable in test");

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tenantA = `platform-report-a-${stamp}`;
    const tenantB = `platform-report-b-${stamp}`;
    const claimA = `PLATFORM-A-${stamp}`;
    const claimB = `PLATFORM-B-${stamp}`;
    const globalBefore = await resolvePlatformReportCollection({
      authority: { kind: "platform_global", auditTenantId: tenantA, actorId: 1, actorRole: "admin" },
    });

    try {
      await db.insert(claims).values([
        { claimNumber: claimA, tenantId: tenantA, status: "submitted", vehicleMake: "Kinga", vehicleModel: "Aggregate A", vehicleYear: 2024 },
        { claimNumber: claimB, tenantId: tenantB, status: "rejected", vehicleMake: "Kinga", vehicleModel: "Aggregate B", vehicleYear: 2024 },
      ]);

      const tenantACollection = await resolvePlatformReportCollection({
        authority: { kind: "tenant", tenantId: tenantA },
      });
      expect(tenantACollection.portfolio.totalClaims).toBe(1);
      expect(tenantACollection.portfolio.rejectedCount).toBe(0);
      expect(tenantACollection.portfolio.activeInsurerCount).toBe(1);

      const globalAfter = await resolvePlatformReportCollection({
        authority: { kind: "platform_global", auditTenantId: tenantA, actorId: 1, actorRole: "admin" },
      });
      expect(globalAfter.portfolio.totalClaims).toBe(globalBefore.portfolio.totalClaims + 2);
      expect(globalAfter.portfolio.rejectedCount).toBe(globalBefore.portfolio.rejectedCount + 1);

      const [claimsSummary, fraudSummary, dwellTime, platformDashboard] = await Promise.all([
        generateReportHtml("portfolio.claims_summary", { fromTs: 0, toTs: Date.now() }, tenantA),
        generateReportHtml("portfolio.fraud_summary", { fromTs: 0, toTs: Date.now() }, tenantA),
        generateReportHtml("portfolio.dwell_time", { fromTs: 0, toTs: Date.now() }, tenantA),
        generateReportHtml("executive.platform_dashboard", {
          platformAggregateAuthority: { kind: "platform_global", auditTenantId: tenantA, actorId: 1, actorRole: "admin" },
        }, tenantA),
      ]);
      expect(claimsSummary).toContain("Claims Portfolio Summary");
      expect(fraudSummary).toContain("Fraud Detection Summary Report");
      expect(dwellTime).toContain("Elapsed Processing Time by Current Status");
      expect(platformDashboard).toContain("Platform Executive Dashboard");

      await expect(resolvePlatformReportCollection({
        authority: { kind: "platform_global", auditTenantId: tenantA, actorId: 1, actorRole: "insurer" as never },
      })).rejects.toThrow(/platform-super-admin/i);
    } finally {
      await db.delete(claims).where(and(
        eq(claims.claimNumber, claimA),
        eq(claims.tenantId, tenantA),
      ));
      await db.delete(claims).where(and(
        eq(claims.claimNumber, claimB),
        eq(claims.tenantId, tenantB),
      ));
    }
  });
});
