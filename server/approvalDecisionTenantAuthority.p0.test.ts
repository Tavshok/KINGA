import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/approval.ts"),
  "utf8",
);
const decisionBlock = source.slice(
  source.indexOf("submitApprovalDecision: protectedProcedure"),
  source.indexOf("getApprovalHistory: protectedProcedure"),
);

describe("approval decision tenant authority", () => {
  it("requires a tenant-owned claim before annotations approvals and claim notification reads", () => {
    expect(source).toContain("async function requireApprovalTenantClaim");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    expect(decisionBlock).toContain("requireApprovalTenantClaim(drizzle, input.claim_id, tenantId)");
    expect(decisionBlock).toContain("eq(claims.tenantId, tenantId)");
  });

  it("uses the shared administrative contract and tenant-scoped next-stage recipients", () => {
    expect(decisionBlock).toContain("isAdminRole(userRole)");
    expect(decisionBlock).toContain("eq(users.tenantId, tenantId)");
    expect(decisionBlock).toContain("eq(users.insurerRole, nextRoleKey)");
  });
});
