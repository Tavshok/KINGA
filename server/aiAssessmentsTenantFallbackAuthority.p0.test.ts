import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/ai-assessments-core.ts"), "utf8");

describe("AI assessment tenant fallback authority", () => {
  it("contains no static default tenant fallback or administrative tenantless assessment path", () => {
    expect(source).not.toMatch(/tenantId\s*(\?\?|\|\|)\s*['"]default['"]/);
    expect(source).not.toMatch(/isAdminRole\(ctx\.user\.role\)\s*\?\s*undefined\s*:/);
  });

  it("requires tenant-owned claim scope before enforcement, report sharing, shared-role reads, and PDF photo rendering", () => {
    expect(source.match(/requireGovernedTenantClaim\(String\(input\.claimId\), ctx\.user\.tenantId\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("eq2(claimsTable2.tenantId, tenantId)");
  });
});
