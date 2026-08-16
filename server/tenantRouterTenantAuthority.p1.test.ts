import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/tenant.ts"), "utf8");

describe("tenant router authority", () => {
  it("requires the requested tenant to equal the authenticated session tenant", () => {
    expect(source).toContain("function requireRequestedTenant");
    expect(source).toContain("if (!tenantId || tenantId !== requestedTenantId)");
    expect(source).toContain("getTenantConfig(requireRequestedTenant(ctx, input.tenantId))");
    expect(source).toContain("getTenantRoleConfig(requireRequestedTenant(ctx, input.tenantId))");
    expect(source).toContain("getTenantWorkflowThresholds(requireRequestedTenant(ctx, input.tenantId))");
    expect(source).toContain("getTenantSlaConfig(requireRequestedTenant(ctx, input.tenantId))");
  });

  it("does not enumerate all tenants for a tenant-scoped user", () => {
    expect(source).toContain("where(eq(insurerTenants.id, tenantId))");
    expect(source).not.toContain("const tenants = await db.select().from(insurerTenants);");
  });
});
