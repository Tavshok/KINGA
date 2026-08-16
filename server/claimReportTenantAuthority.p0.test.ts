import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/claim-reports-core.ts"),
  "utf8",
);

const validateBlock = source.slice(
  source.indexOf("validate: protectedProcedure"),
  source.indexOf("generate: protectedProcedure"),
);
const generateBlock = source.slice(
  source.indexOf("generate: protectedProcedure"),
  source.indexOf("createSnapshot: protectedProcedure"),
);

describe("legacy claim report tenant authority", () => {
  it("uses the shared tenant-scoped claim resolver in validation and generation", () => {
    expect(source).toContain("async function requireReportTenantClaim");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    expect(validateBlock).toContain("requireReportTenantClaim(input.claimId, ctx.user.tenantId)");
    expect(generateBlock).toContain("requireReportTenantClaim(input.claimId, ctx.user.tenantId)");
  });

  it("uses the shared administrative role contract for report permissions", () => {
    expect(validateBlock).toContain("isAdminRole(ctx.user.role)");
    expect(generateBlock).toContain("isAdminRole(ctx.user.role)");
  });
});
