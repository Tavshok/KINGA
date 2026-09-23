import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { normaliseReportData } from "./report-normalisation";
import { computeRPS } from "./recovery/recoveryTrigger";
import { generateReportHtml } from "./reporting/reportDefinitions";
import { buildP0DriverFraudPropensityHold } from "./routers/intelligence-platform";
import { scheduleP0GatedFastTrack } from "./db";

describe("P0-B1 final historical fraud bypass gates", () => {
  it("does not normalise historic fraud fields or create a threshold escalation", () => {
    const result = normaliseReportData({
      fraudScore: 100,
      fraudRiskLevel: "high",
      fraudScoreBreakdownJson: { overallScore: 100 },
    });

    expect(result.fraud).toEqual({
      score: null,
      level: null,
      derivedFromJson: false,
    });
    expect(result.verdict).toMatchObject({
      verdict: "PENDING",
      source: "fallback",
    });
  });

  it("does not allow a fraud score to alter recovery threshold input", () => {
    const common = {
      wrongedParty: "unknown" as const,
      thirdPartyLiabilityPct: 0,
      plausibilityScore: null,
      hasThirdPartyName: false,
      hasThirdPartyRegistration: false,
      hasThirdPartyInsurer: false,
      hasThirdPartyContact: false,
      hasPoliceReport: false,
      approvedAmount: null,
    };

    expect(computeRPS({ ...common, fraudScore: 0 })).toBe(
      computeRPS({ ...common, fraudScore: 100 })
    );
  });

  it("withholds predictive driver fraud propensity without a numeric or risk classification", () => {
    expect(buildP0DriverFraudPropensityHold(42)).toMatchObject({
      driverId: 42,
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
      score: null,
      riskLevel: null,
      factors: [],
      dataSources: [],
    });
  });

  it("does not schedule the production fast-track callback for P0-held fraud evidence", () => {
    const schedule = vi.fn();
    const onWithheld = vi.fn();

    const result = scheduleP0GatedFastTrack({
      enabled: true,
      fraudDecisionEligibility: {
        contractVersion: "P0-1.0",
        field: "fraud_risk_score",
        disposition: "ADVISORY",
        governing: null,
        reasonCode: "P0_ADVISORY_FRAUD_SOURCES_REQUIRE_QUALIFICATION",
        explanation:
          "Current visual, physics-derived, photo-forensic, model-derived and fallback fraud inputs are descriptive only under P0. They cannot produce a governing fraud score, fraud disposition, repairer disqualification, or automated routing action.",
        requiredEvidence: [
          "An independently verifiable documentary, metadata, or human-reviewed fraud finding linked to the claim.",
          "A future owner-approved qualified fraud-evidence policy that binds the finding to an automated decision purpose.",
        ],
        reviewRequired: true,
      },
      fraudDecisionSources: {
        advisoryEvidencePresent: true,
        fallbackOrDegraded: false,
      },
      onWithheld,
      schedule,
    });

    expect(result).toBe("WITHHELD");
    expect(onWithheld).toHaveBeenCalledOnce();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("holds the vehicle-verification report before historic fraud rows can render", async () => {
    const html = await generateReportHtml(
      "agency.vehicle_verification",
      { registration: "P0B1-TEST" },
      "tenant-p0b1"
    );
    expect(html).toContain("Fraud Decision Withheld");
    expect(html).toContain("Manual Review Required");
    expect(html).not.toContain("Fraud Score");
  });

  it("does not let stored fraud values order or define operational queue and geographic outputs", () => {
    const read = (relativePath: string) =>
      fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
    const claimsCore = read("server/routers/claims-core.ts");
    const geographic = claimsCore.slice(
      claimsCore.indexOf("getGeographicRiskClusters:"),
      claimsCore.indexOf("getExecutiveSummary:")
    );
    const processorQueue = claimsCore.slice(
      claimsCore.indexOf("getProcessorQueue:"),
      claimsCore.indexOf("getTierConfig:")
    );

    expect(geographic).not.toMatch(
      /fraudRisk(Level|Score)|fraudRate|highRiskClaims|avgFraudScore/
    );
    expect(geographic).toContain("fraudDecision: { ...P0_B1_FRAUD_HOLD }");
    expect(processorQueue).not.toMatch(
      /fraudRisk(Level|Score)|desc\(claims\.fraudRiskScore\)/
    );
    expect(processorQueue).toContain(".orderBy(asc(claims.createdAt))");
    expect(processorQueue).toContain("projectP0B1ProcessorQueueRows(rows)");
  });

  it("registers P0 holds before legacy external assessment, report, recovery, policy, and learning paths", () => {
    const read = (relativePath: string) =>
      fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
    const rootRouter = read("server/routers.ts");
    const pdfExport = read("server/pdf-export.ts");
    const policyRouter = read("server/routers/policy-management.ts");
    const learningRouter = read("server/routers/learning.ts");
    const claimReportsRouter = read("server/routers/claim-reports-core.ts");
    const uploadRouter = read("server/upload-assessment.ts");
    const assessmentProcessor = read("server/assessment-processor.ts");
    const recoveryTrigger = read("server/recovery/recoveryTrigger.ts");
    const intelligencePlatform = read(
      "server/routers/intelligence-platform.ts"
    );
    const database = read("server/db.ts");

    expect(rootRouter).toMatch(
      /uploadExternalAssessment[\s\S]*?throwP0B1FraudDecisionHold/
    );
    expect(pdfExport).toContain("renderP0B1FraudAbstentionMarker");
    expect(pdfExport).toContain("toAssessmentPdfCanonicalInput");
    expect(uploadRouter).toMatch(
      /authMiddleware,[\s\S]*?p0B1AssessmentUploadHold,[\s\S]*?upload\.single/
    );
    expect(assessmentProcessor).toMatch(
      /processExternalAssessment[\s\S]*?throwP0B1FraudDecisionHold/
    );
    expect(policyRouter).toMatch(
      /simulatePolicy[\s\S]*?throwP0B1FraudDecisionHold/
    );
    for (const route of [
      "getFraudPatternAnalysis",
      "evaluateCalibrationFeedback",
      "applyCalibrationUpdate",
    ]) {
      expect(learningRouter).toMatch(
        new RegExp(`${route}[\\s\\S]*?buildP0B1FraudDecisionHold`)
      );
    }
    for (const route of ["getCalibrationDrift", "getCalibrationHistory"]) {
      expect(learningRouter).toMatch(
        new RegExp(`${route}[\\s\\S]*?buildP0B1FraudDecisionHold`)
      );
    }
    expect(claimReportsRouter).toContain("redactP0B1FraudReportPayload");
    expect(claimReportsRouter).toContain("buildP0B1FraudAbstentionText");
    expect(recoveryTrigger).toMatch(
      /triggerRecoveryEvaluation[\s\S]*?p0B1RecoveryAutomationPolicyActive\(\)[\s\S]*?return;/
    );
    expect(intelligencePlatform).toMatch(
      /getDriverFraudPropensity[\s\S]*?return buildP0DriverFraudPropensityHold\(input\.driverId\)[\s\S]*?const db = await getDb\(\)/
    );
    const fastTrackBoundary = database.indexOf("scheduleP0GatedFastTrack({");
    const firstFastTrackQuery = database.indexOf(
      "const ftTenantRows = await db.select",
      fastTrackBoundary
    );
    expect(fastTrackBoundary).toBeGreaterThan(-1);
    expect(firstFastTrackQuery).toBeGreaterThan(fastTrackBoundary);
  });
});
