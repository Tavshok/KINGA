import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function procedureBlock(sourceText: string, start: string, end: string) {
  const startAt = sourceText.indexOf(start);
  const endAt = sourceText.indexOf(end, startAt);
  if (startAt < 0 || endAt < 0)
    throw new Error(`Cannot locate ${start} through ${end}`);
  return sourceText.slice(startAt, endAt);
}

describe("P0-B1 independent bypass hardening", () => {
  it("removes the stored-score override from validation and returns a governed hold only after tenant authority", () => {
    const engine = source("server/output-validation-engine.ts");
    const router = source("server/routers/ai-assessments-core.ts");
    const validation = procedureBlock(
      router,
      "validate: protectedProcedure",
      "getSnapshots: protectedProcedure"
    );

    expect(engine).not.toContain("Fraud score ${fraudScore} > 60");
    expect(engine).not.toContain("fraudScore: number;");
    expect(validation).toContain(
      "requireGovernedTenantClaim(String(input.claimId), ctx.user.tenantId)"
    );
    expect(validation).toContain(
      "buildP0B1FraudDecisionHold({ claimId: input.claimId })"
    );
    expect(validation).not.toContain("runOutputValidation");
    expect(validation).not.toContain("getAiAssessmentByClaimId");
  });

  it("replaces the fraud-alert score queue with a non-querying actionable hold and presents it visibly", () => {
    const router = source("server/routers/claims-core.ts");
    const dashboard = source("client/src/pages/ClaimsManagerDashboard.tsx");
    const alerts = procedureBlock(
      router,
      "getFraudAlerts: insurerDomainProcedure",
      "getDashboardStats: insurerDomainProcedure"
    );

    expect(alerts).toContain(
      "buildP0B1FraudDecisionHold({ results: [] as never[] })"
    );
    expect(alerts).not.toContain("getDb()");
    expect(alerts).not.toContain("fraudRiskScore");
    expect(alerts).not.toContain("fraudRiskLevel");
    expect(dashboard).toContain("fraudDecisionHold");
    expect(dashboard).toContain("P0FraudValidationHold");
  });

  it("removes score/risk-based statistics, table rendering, and export from Claims Manager", () => {
    const router = source("server/routers/claims-core.ts");
    const dashboard = source("client/src/pages/ClaimsManagerDashboard.tsx");
    const stats = procedureBlock(
      router,
      "getDashboardStats: insurerDomainProcedure",
      "getEscalations: insurerDomainProcedure"
    );
    const overview = procedureBlock(
      router,
      "getManagerOverview: insurerDomainProcedure",
      "getRiskPortfolioAnalytics: insurerDomainProcedure"
    );

    for (const procedure of [stats, overview]) {
      expect(procedure).not.toContain("fraudRiskLevel");
      expect(procedure).not.toContain("fraudRiskScore");
      expect(procedure).not.toContain("fraudRate");
      expect(procedure).toContain("buildP0B1FraudDecisionHold()");
    }
    expect(dashboard).not.toContain("RiskBar");
    expect(dashboard).not.toContain("claim.fraudRiskScore");
    expect(dashboard).not.toContain("fraudRiskScore:");
    expect(dashboard).toContain("Fraud Decisions");
    expect(dashboard).toContain("P0FraudValidationHold");
  });

  it("withholds active claim-assessment and executive-PDF fraud metrics while preserving actionable guidance", () => {
    const reports = source("server/reporting/reportDefinitions.ts");
    const claimAssessment = procedureBlock(
      reports,
      "async function generateClaimAssessmentReport",
      "async function generateForensicReport"
    );
    const pdfRouter = source("server/routers/reports.ts");
    const executive = procedureBlock(
      pdfRouter,
      "generateExecutiveReport: protectedProcedure",
      "generateFinancialSummary: protectedProcedure"
    );

    expect(claimAssessment).toContain("renderP0B1FraudAbstentionMarker()");
    expect(claimAssessment).not.toContain("scoreCell(fraudScore");
    expect(claimAssessment).not.toContain("fraud_risk_level");
    expect(claimAssessment).not.toContain("quoteSimilarity");
    expect(executive).toContain(
      "fraudDecisionNotice: buildP0B1FraudAbstentionText()"
    );
    expect(executive).not.toContain("fraudDetected");
    expect(executive).not.toContain("fraudDetectionRate");
  });

  it("requires a tenant before every exception-intelligence database acquisition", () => {
    const exceptionRouter = source("server/routers/exception-intelligence.ts");
    for (const procedure of [
      procedureBlock(
        exceptionRouter,
        "getExceptionQueue: protectedProcedure",
        "getExceptionAggregates: protectedProcedure"
      ),
      procedureBlock(
        exceptionRouter,
        "getExceptionAggregates: protectedProcedure",
        "getSystemDriftReport: protectedProcedure"
      ),
      procedureBlock(
        exceptionRouter,
        "getSystemDriftReport: protectedProcedure",
        "getActionableRecommendations: protectedProcedure"
      ),
      exceptionRouter.slice(
        exceptionRouter.indexOf(
          "getActionableRecommendations: protectedProcedure"
        )
      ),
    ]) {
      expect(
        procedure.indexOf(
          "const tenantId = requireExceptionIntelligenceTenant(ctx);"
        )
      ).toBeGreaterThanOrEqual(0);
      expect(
        procedure.indexOf(
          "const tenantId = requireExceptionIntelligenceTenant(ctx);"
        )
      ).toBeLessThan(procedure.indexOf("const db = await getDb();"));
    }
  });
});
