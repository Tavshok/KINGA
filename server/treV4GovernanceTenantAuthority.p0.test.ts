import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/tre-v4-governance.ts"), "utf8");

describe("TRE v4 governance tenant authority", () => {
  it("requires tenant-owned claim and assessment resolution before target-addressed trust operations", () => {
    expect(source).toContain("function requireTreV4Tenant");
    expect(source).toContain("async function requireTenantAssessment");
    expect(source).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    const targetChecks = source.match(/requireTenantAssessment\(input\.assessmentId, requireTreV4Tenant\(ctx\)\)/g) ?? [];
    expect(targetChecks.length).toBeGreaterThanOrEqual(6);
    expect(source).toContain("await requireTenantClaim(claimId, requireTreV4Tenant(ctx))");
  });

  it("filters the enterprise assessment dashboard by session tenant", () => {
    const dashboard = source.slice(source.indexOf("getEnterpriseDashboard:"));
    expect(dashboard).toContain("const tenantId = requireTreV4Tenant(ctx)");
    expect(dashboard).toContain("eq(aiAssessments.tenantId, tenantId)");
  });
});
