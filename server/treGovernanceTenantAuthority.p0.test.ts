import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/tre-governance.ts"), "utf8");

describe("Truth Record governance tenant authority", () => {
  it("resolves claim and assessment records inside the session tenant for every claim-scoped governance procedure", () => {
    expect(source).toContain("function requireTreTenant");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    expect(source).toContain("eq(aiAssessments.tenantId, tenantId)");
    const calls = source.match(/getAssessmentCTO\(input\.claimId, requireTreTenant\(ctx\)\)/g) ?? [];
    expect(calls).toHaveLength(8);
  });

  it("restricts governance dashboard records to the authenticated tenant", () => {
    const dashboard = source.slice(source.indexOf("getGovernanceDashboard:"));
    expect(dashboard).toContain("const tenantId = requireTreTenant(ctx)");
    expect(dashboard).toContain(".where(and(eq(claims.tenantId, tenantId), eq(aiAssessments.tenantId, tenantId)))");
  });
});
