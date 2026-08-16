import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/policy-management.ts"),
  "utf8",
);
const serviceSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/services/policy-activation.ts"),
  "utf8",
);

describe("policy-management tenant authority", () => {
  it("derives every tenant-scoped route from the session and rejects client tenant mismatch", () => {
    expect(routerSource).toContain("function requirePolicyTenant");
    expect(routerSource).not.toContain("input.tenantId || ctx.user.tenantId");
    const invocations = routerSource.match(/requirePolicyTenant\(ctx\.user, input\.tenantId\)/g) ?? [];
    expect(invocations.length).toBe(10);
  });

  it("keeps tenant predicates on activation, update validation, and deletion writes", () => {
    expect(serviceSource).toContain("Policy ${policyId} not found for tenant ${tenantId}");
    const tenantPredicates = serviceSource.match(/eq\(automationPolicies\.tenantId, tenantId\)/g) ?? [];
    expect(tenantPredicates.length).toBeGreaterThanOrEqual(7);
  });
});
