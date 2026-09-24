import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/tre-governance.ts"),
  "utf8"
);

function routeBlock(route: string): string {
  const start = source.indexOf(`  ${route}:`);
  if (start < 0) throw new Error(`Missing TRE route: ${route}`);
  const next = source.slice(start + 1).search(/\n  [A-Za-z0-9_]+:/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

describe("Truth Record governance tenant authority", () => {
  it("uses the shared governance role policy before tenant-owned claim authority", () => {
    expect(source).toContain("function requireTreTenant");
    expect(source).toContain("function requireTreGovernanceRole");
    expect(source).toContain("GOVERNANCE_ALLOWED_ROLES");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    for (const route of [
      "getClaimTruthObject",
      "getCanonicalValues",
      "verifyCertificate",
      "getGovernanceSummary",
      "evaluateTruthRules",
      "getRegulatoryCompliance",
      "getExplanation",
      "getTruthQualityIndex",
    ]) {
      const block = routeBlock(route);
      expect(block.indexOf("requireTreGovernanceRole(ctx)")).toBeGreaterThan(
        -1
      );
      expect(block.indexOf("requireTreTenant(ctx)")).toBeGreaterThan(
        block.indexOf("requireTreGovernanceRole(ctx)")
      );
      expect(block.indexOf("await requireTreClaim")).toBeGreaterThan(
        block.indexOf("requireTreTenant(ctx)")
      );
      expect(block.indexOf("throwP0B1FraudDecisionHold()")).toBeGreaterThan(
        block.indexOf("await requireTreClaim")
      );
      expect(block).not.toContain("getAssessmentCTO");
    }
  });

  it("authorizes the aggregate dashboard before the tenant-scoped P0 hold without data access", () => {
    const dashboard = routeBlock("getGovernanceDashboard");
    expect(dashboard.indexOf("requireTreGovernanceRole(ctx)")).toBeGreaterThan(
      -1
    );
    expect(dashboard.indexOf("requireTreTenant(ctx)")).toBeGreaterThan(
      dashboard.indexOf("requireTreGovernanceRole(ctx)")
    );
    expect(dashboard.indexOf("throwP0B1FraudDecisionHold()")).toBeGreaterThan(
      dashboard.indexOf("requireTreTenant(ctx)")
    );
    expect(dashboard).not.toContain("getDb()");
    expect(dashboard).not.toContain("aiAssessments");
  });

  it("removes legacy fraud scoring from regulatory compliance", () => {
    const compliance = source.slice(
      source.indexOf("getRegulatoryCompliance:"),
      source.indexOf("getExplanation:")
    );
    expect(compliance).not.toContain("fraudScore:");
    expect(compliance).not.toContain("fraudRiskScore");
  });
});
