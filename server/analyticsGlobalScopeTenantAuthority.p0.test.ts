import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/analytics.ts"), "utf8");

describe("analytics global-scope tenant authority", () => {
  it("requires session scope for analytics and contains no cross-tenant analytics resolver fallback", () => {
    const resolver = source.slice(source.indexOf("function resolveAnalyticsTenant"), source.indexOf("export const analyticsRouter"));
    expect(resolver).toContain("return requireTenantScope");
    expect(resolver).not.toContain("crossTenantRoles");
    expect(resolver).not.toContain("return null");
  });

  it("retains explicit tenant predicates in assessor, panel-beater, financial, and Risk Manager aggregates", () => {
    expect(source).toContain("eq(users.tenantId, tenantId)");
    expect(source).toContain("eq(panelBeaters.tenantId, tenantId)");
    expect(source).toContain("const tenantFilter = eq(claims.tenantId, tenantId)");
    expect(source).toContain("const tenantFilter = sql`tenant_id = ${tenantId}`");
    expect(source).not.toContain("'1=1'");
  });
});
