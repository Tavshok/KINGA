import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/tre-v4-governance.ts"),
  "utf8"
);

describe("TRE v4 governance tenant authority", () => {
  it("requires tenant-owned claim and assessment resolution before target-addressed trust operations", () => {
    expect(source).toContain("function requireTreV4Tenant");
    expect(source).toContain("async function requireTenantAssessment");
    expect(source).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    const targetChecks =
      source.match(
        /requireTenantAssessment\(input\.assessmentId, requireTreV4Tenant\(ctx\)\)/g
      ) ?? [];
    expect(targetChecks.length).toBeGreaterThanOrEqual(6);
    expect(source).toContain(
      "await requireTenantClaim(claimId, requireTreV4Tenant(ctx))"
    );
  });

  it("checks the enterprise dashboard tenant before withholding fraud output", () => {
    const dashboard = source.slice(source.indexOf("getEnterpriseDashboard:"));
    expect(dashboard).toContain("requireTreV4Tenant(ctx)");
    expect(dashboard).toContain("throwP0FraudTreHold()");
    expect(dashboard).not.toContain("const db = await getDb()");
    expect(dashboard).not.toContain("fraudRiskBreakdown");
  });

  it("performs tenant and assessment checks before withholding fraud-bearing TRE operations", () => {
    const procedure = (name: string, nextName: string) =>
      source.slice(source.indexOf(`${name}:`), source.indexOf(`${nextName}:`));

    for (const [name, nextName] of [
      ["runSimulation", "runStandardSimulations"],
      ["runStandardSimulations", "getEnterpriseDashboard"],
      ["getTrustAPIv2", "});"],
    ]) {
      const block = procedure(name, nextName);
      expect(block.indexOf("requireTreV4Tenant(ctx)")).toBeGreaterThan(-1);
      expect(
        block.indexOf("requireTenantAssessment(input.assessmentId, tenantId)")
      ).toBeGreaterThan(-1);
      expect(block.indexOf("throwP0FraudTreHold()")).toBeGreaterThan(
        block.indexOf("requireTenantAssessment(input.assessmentId, tenantId)")
      );
    }

    const dashboard = procedure("getEnterpriseDashboard", "getTrustAPIv2");
    expect(dashboard.indexOf("requireTreV4Tenant(ctx)")).toBeGreaterThan(-1);
    expect(dashboard.indexOf("throwP0FraudTreHold()")).toBeGreaterThan(
      dashboard.indexOf("requireTreV4Tenant(ctx)")
    );
    expect(dashboard).not.toContain("const db = await getDb()");
  });
});
