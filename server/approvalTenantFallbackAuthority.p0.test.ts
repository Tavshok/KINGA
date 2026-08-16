import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/approval.ts"), "utf8");

describe("approval workflow tenant authority", () => {
  it("derives approval workflow scope from the session and contains no static default tenant fallback", () => {
    expect(source).toContain("function requireApprovalTenant");
    expect(source).not.toMatch(/tenantId[^\n]*(\?\?|\|\|)\s*["']default["']/);
    const tenantResolutions = source.match(/requireApprovalTenant\(ctx\)/g) ?? [];
    expect(tenantResolutions.length).toBeGreaterThanOrEqual(9);
  });

  it("preserves claim plus tenant resolution before an approval decision is written", () => {
    const decision = source.slice(source.indexOf("submitApprovalDecision:"));
    expect(decision).toContain("requireApprovalTenant(ctx)");
    expect(decision).toContain("requireApprovalTenantClaim(drizzle, input.claim_id, tenantId)");
    expect(decision).toContain("eq(claimApprovals.tenantId, tenantId)");
  });
});
