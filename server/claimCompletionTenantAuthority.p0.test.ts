import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/claim-completion.ts"),
  "utf8",
);

const completeBlock = source.slice(
  source.indexOf("completeClaim: protectedProcedure"),
  source.indexOf("reopenClaim: protectedProcedure"),
);
const reopenBlock = source.slice(source.indexOf("reopenClaim: protectedProcedure"));

describe("claim completion tenant authority", () => {
  it("requires a tenant-owned claim and tenant-bound closure write", () => {
    expect(source).toContain("async function requireCompletionTenantClaim");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    expect(completeBlock).toContain("requireCompletionTenantClaim(input.claimId, ctx.user.tenantId)");
    expect(completeBlock).toContain("eq(claims.tenantId, ctx.user.tenantId!)");
  });

  it("requires a tenant-owned claim and tenant-bound reopening write", () => {
    expect(reopenBlock).toContain("isAdminRole(ctx.user.role)");
    expect(reopenBlock).toContain("requireCompletionTenantClaim(input.claimId, ctx.user.tenantId)");
    expect(reopenBlock).toContain("eq(claims.tenantId, ctx.user.tenantId!)");
  });
});
