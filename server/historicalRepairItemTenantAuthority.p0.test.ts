import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/historical-claims.ts"),
  "utf8",
);

describe("historical repair-item tenant authority", () => {
  it("resolves the item through its tenant-owned parent claim before both item and aggregate writes", () => {
    const block = source.slice(source.indexOf("updateRepairItem: protectedProcedure"), source.indexOf("updateClaim: protectedProcedure"));
    expect(block).toContain("eq(historicalClaims.tenantId, tenantId)");
    expect(block).toContain("Repair item not found");
    expect(block).toContain("eq(extractedRepairItems.historicalClaimId, authorisedItem.historicalClaimId)");
    expect(block).toContain("AND tenant_id = ${tenantId}");
  });

  it("retains tenant scope on duplicate ground-truth records, parent updates, and prediction accuracy writes", () => {
    const block = source.slice(source.indexOf("captureGroundTruth: protectedProcedure"), source.indexOf("updateRepairItem: protectedProcedure"));
    expect(block).toContain("eq(finalApprovalRecords.tenantId, tenantId)");
    expect(block).toContain("eq(historicalClaims.tenantId, tenantId)");
    expect(block).toContain("eq(aiPredictionLogs.tenantId, tenantId)");
  });
});
