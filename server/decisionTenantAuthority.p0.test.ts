import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/decision.ts"),
  "utf8",
);

function block(from: string, to: string) {
  return source.slice(source.indexOf(from), source.indexOf(to));
}

describe("decision intelligence tenant authority", () => {
  it("tenant-scopes decision and contradiction summary evidence", () => {
    const decisionSummary = block("getDecisionSummary: protectedProcedure", "checkContradictions: protectedProcedure");
    const contradictionSummary = block("getContradictionStats: protectedProcedure", "generateDecisionTrace: protectedProcedure");
    for (const section of [decisionSummary, contradictionSummary]) {
      expect(section).toContain("ctx.user?.tenantId");
      expect(section).toContain("eq(aiAssessments.tenantId, tenantId)");
      expect(section).toContain("eq(claims.tenantId, tenantId)");
    }
  });

  it("tenant-scopes direct claim decision traces", () => {
    const trace = block("getDecisionTrace: protectedProcedure", "checkReportReadiness: protectedProcedure");
    expect(trace).toContain("ctx.user?.tenantId");
    expect(trace).toContain("eq(aiAssessments.claimId, input.claimId)");
    expect(trace).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(trace).toContain("eq(claims.tenantId, tenantId)");
  });

  it("tenant-scopes readiness, explanation, routing, and escalation evidence", () => {
    const readiness = block("getReadinessSummary: protectedProcedure", "generateClaimExplanation: protectedProcedure");
    const explanation = block("getClaimExplanation: protectedProcedure", "routeClaim: protectedProcedure");
    const routing = block("routeClaimById: protectedProcedure", "getEscalationSummary: protectedProcedure");
    const escalation = source.slice(source.indexOf("getEscalationSummary: protectedProcedure"));

    for (const section of [readiness, explanation, routing, escalation]) {
      expect(section).toContain("ctx.user?.tenantId");
      expect(section).toContain("eq(aiAssessments.tenantId, tenantId)");
      expect(section).toContain("eq(claims.tenantId, tenantId)");
    }
  });
});
