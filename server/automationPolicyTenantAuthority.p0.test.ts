import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/automation-policies.ts"), "utf8");
const managerSource = fs.readFileSync(path.resolve(process.cwd(), "server/automation-policy-manager.ts"), "utf8");

describe("automation policy tenant authority", () => {
  it("requires a session tenant for every exposed automation policy operation", () => {
    expect(routerSource.match(/const tenantId = requireTenantId\(ctx\.user\);/g)?.length).toBe(4);
    expect(routerSource).not.toContain('|| "default"');
    expect(routerSource).not.toContain("isAdminRole(ctx.user.role) ? undefined");
  });

  it("retains the tenant predicate in active history and update helper queries", () => {
    expect(managerSource).toContain("getActiveAutomationPolicy(tenantId: string)");
    expect(managerSource).toContain("getTenantPolicies(tenantId: string)");
    expect(managerSource).toContain("eq(automationPolicies.tenantId, tenantId)");
    expect(managerSource).toContain("updateAutomationPolicy(\n  policyId: number,\n  tenantId: string,");
  });
});
