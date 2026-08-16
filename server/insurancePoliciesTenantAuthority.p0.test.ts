import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const router = fs.readFileSync(path.resolve(process.cwd(), "server/routers/insurance-core.ts"), "utf8");
const helper = fs.readFileSync(path.resolve(process.cwd(), "server/insurance/policy-issuance.ts"), "utf8");

describe("insurance policy tenant authority", () => {
  it("derives session tenant in the router and applies customer plus tenant predicates in the helper", () => {
    const block = router.slice(router.indexOf("getMyPolicies:"), router.indexOf("getMyQuotes:"));
    expect(block).toContain("requireActorTenant(ctx.user.tenantId)");
    expect(block).toContain("getPoliciesByCustomer(ctx.user.id, actorTenantId)");
    expect(helper).toContain("getPoliciesByCustomer(customerId: number, tenantId: string)");
    expect(helper).toContain("eq(insurancePolicies.tenantId, tenantId)");
  });
});
