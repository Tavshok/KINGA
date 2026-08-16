import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/vehicle-valuation-core.ts"),
  "utf8",
);

describe("vehicle valuation core tenant authority", () => {
  it("requires tenant-owned claim resolution before valuation and annotation claim reads", () => {
    expect(source).toContain("function requireVehicleValuationTenant");
    expect(source).toContain("function requireVehicleValuationClaim");
    expect(source).toContain("eq(claims.id, claimId), eq(claims.tenantId, tenantId)");
    expect(source).toContain("requireVehicleValuationClaim(input.claimId, requireVehicleValuationTenant(ctx))");
    expect(source).toContain("await requireVehicleValuationClaim(input.claimId, tenantId);");
    expect(source).toContain("eq(claims.id, input.claimId), eq(claims.tenantId, tenantId)");
  });

  it("requires a tenant-owned assessment before narrative history and annotation writes", () => {
    expect(source).toContain("function requireVehicleValuationAssessment");
    expect(source).toContain("eq(aiAssessmentsTable.id, assessmentId), eq(aiAssessmentsTable.tenantId, tenantId)");
    expect(source).toContain("await requireVehicleValuationAssessment(input.assessmentId, tenantId, input.claimId);");
    expect(source).toContain("await requireVehicleValuationAssessment(input.assessmentId, requireVehicleValuationTenant(ctx));");
    expect(source).not.toContain("byClaim: protectedProcedure\n    .input(z.object({ claimId: z.number() }))\n    .query(async ({ input })");
  });
});
