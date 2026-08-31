import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { claims } from "../../drizzle/schema";
import { getDb } from "../db";
import { generateReportHtml } from "./reportDefinitions";
import { resolvePlatformReportCollection } from "./resolvedPlatformReportCollection";

describe("portfolio approved-outcome metrics", () => {
  it("counts completed claims as approved outcomes and renders the same non-zero approval rate for executives and claims managers", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable in test");
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tenantId = `approved-outcome-${stamp}`;
    const claimNumbers = ["COMPLETED", "REJECTED", "SUBMITTED"].map((state) => `APPROVAL-${state}-${stamp}`);
    const fromTs = Date.now() - 60_000;
    const toTs = Date.now() + 60_000;

    try {
      await db.insert(claims).values([
        { claimNumber: claimNumbers[0], tenantId, status: "completed", vehicleMake: "Kinga", vehicleModel: "Approval", vehicleYear: 2024 },
        { claimNumber: claimNumbers[1], tenantId, status: "rejected", vehicleMake: "Kinga", vehicleModel: "Approval", vehicleYear: 2024 },
        { claimNumber: claimNumbers[2], tenantId, status: "submitted", vehicleMake: "Kinga", vehicleModel: "Approval", vehicleYear: 2024 },
      ]);

      const aggregate = await resolvePlatformReportCollection({
        authority: { kind: "tenant", tenantId },
        filters: { fromTs, toTs },
      });
      expect(aggregate.portfolio.totalClaims).toBe(3);
      expect(aggregate.portfolio.approvedCount).toBe(1);
      expect(aggregate.portfolio.rejectedCount).toBe(1);

      const params = { fromTs, toTs };
      const [executive, claimsManager] = await Promise.all([
        generateReportHtml("executive.portfolio_overview", params, tenantId),
        generateReportHtml("claims_manager.portfolio_overview", params, tenantId),
      ]);
      const displayedRate = `Approval Rate</div><div class="kv-value">33.3%`;
      expect(executive).toContain(displayedRate);
      expect(claimsManager).toContain(displayedRate);
    } finally {
      await db.delete(claims).where(and(
        eq(claims.tenantId, tenantId),
        eq(claims.vehicleMake, "Kinga"),
        eq(claims.vehicleModel, "Approval"),
      ));
    }
  });
});
