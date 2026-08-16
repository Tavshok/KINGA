import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/reporting.ts"),
  "utf8",
);

function block(from: string, to: string) {
  return source.slice(source.indexOf(from), source.indexOf(to));
}

describe("reporting regeneration tenant authority", () => {
  it("requires validated tenant scope and tenant-owned claim before regeneration writes", () => {
    const regeneration = block("adminRegeneratePipeline: adminProcedure", "adminGetRegenerationHistory: adminProcedure");
    expect(regeneration).toContain('resolveP0TenantScope(ctx, input.tenantId, "reporting.adminRegeneratePipeline")');
    expect(regeneration).toContain("assertClaimInTenant(input.claimId, scope.tenantId)");
    expect(regeneration).toContain("WHERE id=? AND tenant_id=?");
    expect(regeneration).toContain("report_pipeline_regenerate");
  });

  it("filters regeneration history through tenant-owned claims", () => {
    const history = block("adminGetRegenerationHistory: adminProcedure", "previewHtml: protectedProcedure");
    expect(history).toContain('resolveP0TenantScope(ctx, input.tenantId, "reporting.adminGetRegenerationHistory")');
    expect(history).toContain("assertClaimInTenant(input.claimId, scope.tenantId)");
    expect(history).toContain("INNER JOIN claims c ON c.id = r.claim_id");
    expect(history).toContain("WHERE c.tenant_id=?");
  });
});
