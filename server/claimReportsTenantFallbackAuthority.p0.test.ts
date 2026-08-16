import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/claim-reports-core.ts"), "utf8");

describe("claim report tenant fallback authority", () => {
  it("contains no static tenant fallback and requires session tenant for snapshot, PDF, interactive, email, and history paths", () => {
    expect(source).not.toMatch(/tenantId[^\n]*(\?\?|\|\|)\s*["']default["']/);
    expect(source.match(/requireReportTenant\(ctx\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("retains tenant-owned claim resolution before direct claim report validation and generation", () => {
    const direct = source.slice(source.indexOf("validate:"), source.indexOf("createSnapshot:"));
    expect(direct.match(/requireReportTenantClaim\(input.claimId, ctx.user.tenantId\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
