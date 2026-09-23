import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/tre-governance.ts"),
  "utf8"
);

describe("Truth Record governance tenant authority", () => {
  it("resolves claim and assessment records inside the session tenant for every claim-scoped governance procedure", () => {
    expect(source).toContain("function requireTreTenant");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    expect(source).toContain("eq(aiAssessments.tenantId, tenantId)");
    const calls =
      source.match(
        /getAssessmentCTO\(input\.claimId, requireTreTenant\(ctx\)\)/g
      ) ?? [];
    expect(calls).toHaveLength(8);
  });

  it("restricts governance dashboard records to the authenticated tenant", () => {
    const dashboard = source.slice(source.indexOf("getGovernanceDashboard:"));
    expect(dashboard).toContain("const tenantId = requireTreTenant(ctx)");
    expect(dashboard).toContain(
      ".where(and(eq(claims.tenantId, tenantId), eq(aiAssessments.tenantId, tenantId)))"
    );
  });

  it("checks tenant and claim authority before legacy TRE holds and removes regulatory fraud scoring", () => {
    const hold = source.slice(
      source.indexOf("const p0FraudTreProcedure"),
      source.indexOf("async function getAssessmentCTO")
    );
    expect(hold.indexOf("requireTreTenant(ctx)")).toBeGreaterThan(-1);
    expect(hold.indexOf("requireTreClaim(claimId, tenantId)")).toBeGreaterThan(
      hold.indexOf("requireTreTenant(ctx)")
    );
    expect(hold.indexOf('code: "PRECONDITION_FAILED"')).toBeGreaterThan(
      hold.indexOf("requireTreClaim(claimId, tenantId)")
    );

    const compliance = source.slice(
      source.indexOf("getRegulatoryCompliance:"),
      source.indexOf("getExplanation:")
    );
    expect(compliance).not.toContain("fraudScore:");
    expect(compliance).not.toContain("fraudRiskScore");
  });
});
