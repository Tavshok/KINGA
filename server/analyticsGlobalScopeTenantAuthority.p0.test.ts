import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/analytics.ts"),
  "utf8"
);

describe("analytics global-scope tenant authority", () => {
  it("requires session scope for analytics and contains no cross-tenant analytics resolver fallback", () => {
    const resolver = source.slice(
      source.indexOf("function resolveAnalyticsTenant"),
      source.indexOf("export const analyticsRouter")
    );
    expect(resolver).toContain("return requireTenantScope");
    expect(resolver).not.toContain("crossTenantRoles");
    expect(resolver).not.toContain("return null");
  });

  it("retains tenant predicates for active aggregates and holds fraud analytics after tenant authority", () => {
    expect(source).toContain("eq(users.tenantId, tenantId)");
    expect(source).toContain("eq(panelBeaters.tenantId, tenantId)");
    expect(source).not.toContain("'1=1'");

    const financialOverview = source.slice(
      source.indexOf("getFinancialOverview:"),
      source.indexOf("getRiskManagerKPIs:")
    );
    expect(financialOverview).toContain("requireP0FraudAnalyticsTenant(ctx)");
    expect(financialOverview).toContain("throwP0B1FraudDecisionHold()");

    const riskManagerKpis = source.slice(
      source.indexOf("getRiskManagerKPIs:"),
      source.indexOf("sendRiskAnalyticsReport:")
    );
    expect(riskManagerKpis).toContain("requireRiskManagerAnalyticsRole(ctx)");
    expect(riskManagerKpis).toContain("requireP0FraudAnalyticsTenant(ctx)");
    expect(riskManagerKpis).toContain("throwP0B1FraudDecisionHold()");
  });
});
