import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { claims } from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveReportRecord } from "./resolvedReportRecord";

describe("resolved report record tenant authority", () => {
  it("rejects a foreign-tenant claim before loading report evidence", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable in test");

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ownerTenantId = `report-owner-${stamp}`;
    const foreignTenantId = `report-foreign-${stamp}`;
    const claimNumber = `RPT-TENANT-${stamp}`;
    let claimId: number | undefined;

    try {
      await db.insert(claims).values({
        claimNumber,
        tenantId: ownerTenantId,
        status: "submitted",
        vehicleMake: "Kinga",
        vehicleModel: "Tenant Fixture",
        vehicleYear: 2024,
      });
      const inserted = await db.select({ id: claims.id }).from(claims).where(and(
        eq(claims.claimNumber, claimNumber),
        eq(claims.tenantId, ownerTenantId),
      )).limit(1);
      claimId = inserted[0]?.id;
      if (!claimId) throw new Error("Test claim insert did not return an id");

      await expect(resolveReportRecord({
        claimId,
        tenantId: foreignTenantId,
        audience: "claim_assessment",
      })).rejects.toThrow(/not found|tenant/i);
    } finally {
      if (claimId) await db.delete(claims).where(eq(claims.id, claimId));
    }
  });
});
