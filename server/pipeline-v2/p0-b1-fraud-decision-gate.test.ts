import { describe, expect, it } from "vitest";

import {
  assessFraudDecisionEligibility,
  preserveOrFailClosedFraudDecisionEligibility,
} from "../evidence-governance/quantitativeFieldGovernance";
import {
  buildClaimTruth,
  buildP0GatedClaimTruth,
  enrichClaimTruthWithPhysics,
} from "./claimTruthLayer";
import { evaluateP0GatedClaimDecision } from "./claimsDecisionAuthority";
import { runDOE } from "./decisionOptimisationEngine";
import {
  buildP0FraudReviewBoundary,
  buildP0PhotoMetadataIndicators,
  classifyP0FraudObservations,
} from "./stage-8-fraud";
import {
  buildFraudNarrativeForReport,
  buildFraudSection,
} from "./stage-10-report";
import { decisionRouter } from "../routers/decision";
import { projectP0B1AssessmentHold } from "../routers/ai-assessments-core";
import { executeFastTrackAction } from "../services/fast-track-dispatcher";
import { generateReportHtml } from "../reporting/reportDefinitions";
import { buildP0PortfolioFraudHold } from "../routers/intelligence-platform";
import { projectP0AccidentCluster } from "../routers/intelligence";
import { claimsRouter } from "../routers/claims-core";
import { analyticsRouter } from "../routers/analytics";
import { treGovernanceRouter } from "../routers/tre-governance";
import { reportsRouter } from "../routers/reports";
import { detectContradictions } from "./contradictionDetectionEngine";
import { buildP0B1DecisionTraceHold } from "./decisionTraceGenerator";
import { validateClaimAnalysisResponse } from "../services/apiResponseValidator";
import { resolveCanonicalClaimReportPresentation } from "../reporting/canonicalClaimReportPresentation";
import {
  buildP0B1FraudDecisionHold,
  P0_B1_FRAUD_DECISION_HOLD,
} from "../evidence-governance/p0FraudDecisionHold";

const advisorySources = {
  crushDepthDecision: {
    contractVersion: "P0-1.0",
    field: "crush_depth_m",
    disposition: "ADVISORY",
    governing: null,
    advisoryEvidence: [],
    reasonCode: "P0_ADVISORY_RAW_STAGE6_ONLY",
    explanation: "forged",
  },
  advisoryEvidencePresent: true,
  fallbackOrDegraded: false,
};

function advisoryEligibility() {
  return assessFraudDecisionEligibility(advisorySources);
}

describe("P0-B1 fraud and automated-decision boundary", () => {
  it("rejects a forged governing fraud decision and preserves a source-bound review hold", () => {
    const forged = {
      ...advisoryEligibility(),
      disposition: "GOVERNING",
      governing: { fraudRiskScore: 0 },
    };

    const preserved = preserveOrFailClosedFraudDecisionEligibility(
      forged,
      advisorySources
    );

    expect(preserved).toMatchObject({
      disposition: "UNAVAILABLE",
      governing: null,
      reasonCode: "P0_UNAVAILABLE_MISSING_OR_INCONSISTENT_DECISION",
      reviewRequired: true,
    });
    expect(preserved.requiredEvidence.join(" ")).toMatch(
      /independently verifiable/i
    );
  });

  it("withholds Stage 8 score/level and emits a non-score actionable review marker", () => {
    const boundary = buildP0FraudReviewBoundary({
      crushDepthDecision: advisorySources.crushDepthDecision,
      fallbackOrDegraded: false,
    });

    expect(boundary.fraudRiskScore).toBeNull();
    expect(boundary.fraudRiskLevel).toBeNull();
    expect(boundary.fraudDecisionEligibility).toMatchObject({
      disposition: "ADVISORY",
      governing: null,
      reviewRequired: true,
    });
    expect(boundary.indicators).toEqual([
      expect.objectContaining({
        indicator: "P0_FRAUD_EVIDENCE_UNAVAILABLE",
        score: null,
        severity: "advisory",
      }),
    ]);
    expect(boundary.indicators[0].evidence?.join(" ")).toMatch(/qualified/i);

    expect(
      classifyP0FraudObservations([
        {
          indicator: "photo_manipulation_probability",
          category: "photo_forensics",
          score: 99,
          severity: "critical",
          description: "Model probability is high.",
        },
        {
          indicator: "contact_patch_mismatch",
          category: "physics",
          score: 50,
          description: "Raw visual/physics mismatch.",
        },
      ])
    ).toEqual([
      expect.objectContaining({
        indicator: "photo_manipulation_probability",
        score: null,
        severity: "advisory",
      }),
      expect.objectContaining({
        indicator: "contact_patch_mismatch",
        score: null,
        severity: "advisory",
      }),
    ]);

    const photoMetadata = buildP0PhotoMetadataIndicators({
      analysedCount: 1,
      errorCount: 0,
      anyGpsPresent: true,
      anySuspicious: true,
      visionCrushDepthM: 0.99,
      photos: [
        {
          url: "https://evidence.example/photo.jpg",
          analysisResult: {
            is_suspicious: true,
            confidence: 0.99,
            flags: ["suspicious"],
            gps_coordinates: { latitude: 1, longitude: 2 },
            capture_datetime: "2026-01-01T10:00:00Z",
            manipulation_indicators: { manipulation_score: 0.99 },
            image_hash: "sha256:retained",
            recommendations: ["investigate"],
            ai_vision_description: "AI-generated image probability high",
          },
        },
      ],
    });
    expect(photoMetadata).toEqual([
      expect.objectContaining({
        score: null,
        severity: "advisory",
        evidence: expect.arrayContaining([
          "Image hash: sha256:retained",
          "EXIF capture time: 2026-01-01T10:00:00Z",
        ]),
      }),
    ]);
    expect(JSON.stringify(photoMetadata)).not.toMatch(
      /0\.99|AI-generated|suspicious/i
    );
  });

  it("gates DOE before candidates can treat unavailable fraud as low risk", () => {
    const eligibility = advisoryEligibility();
    const result = runDOE({
      candidates: [
        {
          panelBeater: "Lowest quote",
          totalCost: 100,
          currency: "USD",
          structuralCompleteness: 1,
          coverageRatio: 1,
          turnaroundDays: null,
          reliabilityScore: 1,
          fraudRisk: "low",
          fraudSignal: null,
          confidence: "high",
        },
      ],
      benchmarkCost: 100,
      fcdiScore: 100,
      inputCompletenessScore: 100,
      doeEligible: true,
      doeIneligibilityReason: null,
      fraudDecisionEligibility: eligibility,
      fraudDecisionSources: advisorySources,
    });

    expect(result).toMatchObject({
      status: "GATED_FRAUD_EVIDENCE",
      selectedPanelBeater: null,
      selectedCost: null,
      fraudRisk: null,
    });
    expect(result.rationale).toMatch(/independently verifiable/i);
  });

  it("blocks a high-looking fraud result from becoming a rejection in Claims Decision Authority", () => {
    const eligibility = advisoryEligibility();
    const decision = evaluateP0GatedClaimDecision({
      scenario_type: "collision",
      overall_confidence: 95,
      fraud_result: {
        fraud_risk_level: "elevated",
        fraud_risk_score: 99,
        critical_flag_count: 3,
        scenario_fraud_flagged: true,
        fraud_decision_eligibility: eligibility,
        fraud_decision_sources: advisorySources,
      },
    });

    expect(decision.recommendation).toBe("REVIEW");
    expect(decision.decision_basis).toBe("insufficient_data");
    expect(decision.reasoning).toMatch(
      /cannot produce a governing fraud score/i
    );
    expect(decision.reasoning).toMatch(/independently verifiable/i);
    expect(decision.reasoning).not.toMatch(/rejected due to/i);
  });

  it("holds Claim Truth at review despite adversarial fraud weights and scores", () => {
    const eligibility = advisoryEligibility();
    const truth = buildP0GatedClaimTruth({
      claimRecord: {
        vehicle: {
          make: "Toyota",
          model: "Corolla",
          year: 2020,
          registration: "TEST-1",
          vin: null,
          marketValueUsd: 10000,
        },
        repairQuote: {
          repairerCompany: "Repairer",
          quoteTotalCents: 100000,
          lineItems: [],
        },
        accidentDetails: {},
      },
      stage3Data: null,
      evidenceRegistry: null,
      classifiedImages: null,
      enrichedPhotos: null,
      extractedQuotes: [],
      kingaEstimateUsd: 1000,
      kingaEstimateSource: "stage9",
      systemCreatedAt: null,
      totalPages: 1,
      stage8FraudScore: 99,
      stage8FraudLevel: "elevated",
      fraudDecisionEligibility: eligibility,
      fraudDecisionSources: advisorySources,
    } as any);

    expect(truth.decision.recommendation).toBe("REVIEW");
    expect(truth.decision.primaryReason).toMatch(
      /cannot produce a governing fraud score/i
    );
    expect(truth.decision.primaryReason).not.toMatch(
      /High fraud risk: score 99/i
    );

    const enriched = enrichClaimTruthWithPhysics(truth, {
      deltaVKmh: 1,
      airbagDeployed: true,
      airbagThresholdKmh: 25,
      estimatedSpeedKmh: 90,
      damageConsistencyScore: 1,
    });
    expect(enriched).toBe(truth);
    expect(enriched.fraudSignals.physicsAnomalies).toEqual(
      truth.fraudSignals.physicsAnomalies
    );

    const missingAuthorityTruth = buildClaimTruth({
      claimRecord: {
        vehicle: {
          make: "Toyota",
          model: "Corolla",
          year: 2020,
          registration: "TEST-2",
          vin: null,
          marketValueUsd: 10000,
        },
        repairQuote: {
          repairerCompany: "Repairer",
          quoteTotalCents: 100000,
          lineItems: [],
        },
        accidentDetails: {},
      },
      stage3Data: null,
      evidenceRegistry: null,
      classifiedImages: null,
      extractedQuotes: [],
      kingaEstimateUsd: 1000,
      kingaEstimateSource: "stage9",
      systemCreatedAt: null,
      totalPages: 1,
    } as any);
    expect(
      enrichClaimTruthWithPhysics(missingAuthorityTruth, {
        deltaVKmh: 1,
        airbagDeployed: true,
        airbagThresholdKmh: 25,
        estimatedSpeedKmh: 90,
        damageConsistencyScore: 1,
      })
    ).toBe(missingAuthorityTruth);
  });

  it("projects an actionable report hold without score, level, or indicator points", () => {
    const fraudAnalysis = {
      ...buildP0FraudReviewBoundary({
        crushDepthDecision: advisorySources.crushDepthDecision,
        fallbackOrDegraded: false,
      }),
      quoteDeviation: null,
      repairerHistory: { flagged: false, notes: "" },
      claimantClaimFrequency: { flagged: false, notes: "" },
      vehicleClaimHistory: { flagged: false, notes: "" },
      damageConsistencyScore: 99,
      damageConsistencyNotes: "adversarial physics mismatch",
      scenarioFraudResult: null,
      crossEngineConsistency: null,
    } as any;
    const section = buildFraudSection(fraudAnalysis);

    expect(section.content).toMatchObject({
      available: false,
      reviewRequired: true,
      status: "FRAUD_DECISION_WITHHELD",
    });
    expect(section.content).not.toHaveProperty("riskScore");
    expect(section.content).not.toHaveProperty("riskLevel");
    expect(JSON.stringify(section.content)).not.toContain('"score"');
    expect((section.content as any).requiredEvidence.join(" ")).toMatch(
      /qualified/i
    );
    expect(buildFraudNarrativeForReport(fraudAnalysis, section)).toBeNull();
  });

  it("holds the protected decision API when a caller supplies a high-looking fraud score", async () => {
    const caller = decisionRouter.createCaller({
      user: {
        id: 91001,
        openId: "p0-b1-decision-router",
        role: "admin",
        tenantId: "p0-b1-test",
      } as never,
    });

    const decision = await caller.evaluateClaimDecision({
      scenario_type: "collision",
      overall_confidence: 99,
      fraud_result: {
        fraud_risk_level: "elevated",
        fraud_risk_score: 99,
        critical_flag_count: 3,
        scenario_fraud_flagged: true,
      },
    });

    expect(decision.recommendation).toBe("REVIEW");
    expect(decision.decision_basis).toBe("insufficient_data");
    expect(decision.reasoning).toMatch(
      /fraud evidence eligibility is missing/i
    );
  });

  it("holds the protected escalation route despite caller-supplied fraud flags", async () => {
    const caller = decisionRouter.createCaller({
      user: {
        id: 91002,
        openId: "p0-b1-routing-router",
        role: "admin",
        tenantId: "p0-b1-test",
      } as never,
    });

    const route = await caller.routeClaim({
      recommendation: "REJECT",
      confidence: 99,
      fraud_risk_level: "elevated",
      fraud_flagged: true,
      critical_fraud_flag_count: 3,
    });

    expect(route.metadata.recommendation).toBe("REVIEW");
    expect(route.metadata.fraud_detected).toBe(false);
    expect(JSON.stringify(route)).toMatch(
      /P0-B1 withheld automated fraud routing/i
    );
  });

  it("withholds caller-supplied fraud content from the explanation API", async () => {
    const caller = decisionRouter.createCaller({
      user: {
        id: 91003,
        openId: "p0-b1-explanation-router",
        role: "admin",
        tenantId: "p0-b1-test",
      } as never,
    });

    const explanation = await caller.generateClaimExplanation({
      recommendation: "REJECT",
      key_drivers: ["Fraud score 99"],
      reasoning: "Fraud score is elevated",
      fraud_risk_level: "elevated",
      confidence: 99,
    });
    const serialized = JSON.stringify(explanation);

    expect(serialized).toMatch(/Automated fraud decision withheld/i);
    expect(serialized).toMatch(
      /independently verifiable claim-linked fraud evidence/i
    );
    expect(serialized).not.toMatch(/Fraud score 99|fraud score is elevated/i);
  });

  it("sanitizes historic assessment score, level, indicators, and breakdowns", () => {
    const result = projectP0B1AssessmentHold({
      id: 7,
      fraudScore: 99,
      fraudRiskLevel: "critical",
      fraudIndicators: JSON.stringify([{ indicator: "forged", score: 99 }]),
      fraudScoreBreakdownJson: JSON.stringify({ overallScore: 99 }),
    });

    expect(result).toMatchObject({
      id: 7,
      fraudDecision: expect.objectContaining(P0_B1_FRAUD_DECISION_HOLD),
    });
    expect(result).not.toHaveProperty("fraudScore");
    expect(result).not.toHaveProperty("fraudRiskLevel");
    expect(result).not.toHaveProperty("fraudIndicators");
    expect(result).not.toHaveProperty("fraudScoreBreakdownJson");
  });

  it("fails forged direct fast-track dispatch closed before any action", async () => {
    const result = await executeFastTrackAction(
      99,
      {
        eligible: true,
        action: "STRAIGHT_TO_PAYMENT",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 100,
          fraudScore: 0,
          claimValue: 1,
          reason: "forged",
        },
      },
      1,
      true
    );

    expect(result).toMatchObject({ success: false, action: "MANUAL_REVIEW" });
    expect(result.error).toMatch(/qualified automated-decision authority/i);
  });

  it("replaces report dispatcher fraud projections with the actionable hold", async () => {
    const html = await generateReportHtml("portfolio.fraud_summary", {
      claimId: 99,
      fraudScore: 99,
      fraudRiskLevel: "critical",
      fraudIndicator: "forged-sentinel-indicator",
    });

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).toContain("Manual Review Required");
    expect(html).not.toContain("critical");
    expect(html).not.toContain("forged-sentinel-indicator");
  });

  it("withholds portfolio fraud thresholds and score aggregates", () => {
    const hold = buildP0PortfolioFraudHold(90);

    expect(hold).toMatchObject({
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
      alerts: null,
      aiScores: null,
    });
    expect(hold.requiredEvidence.join(" ")).toMatch(
      /independently verifiable/i
    );
    expect(JSON.stringify(hold)).not.toMatch(/highRiskClaims|avgFraudScore/i);
  });

  it("removes accident-cluster fraud rate, score, and risk classification", () => {
    const projected = projectP0AccidentCluster({
      id: 3,
      claim_count: 9,
      fraud_rate: 0.99,
      risk_level: "high",
      is_spatio_temporal: true,
    });

    expect(projected).toMatchObject({
      id: 3,
      claim_count: 9,
      hotspot_type: "spatio_temporal_cluster",
      fraudDecision: {
        status: "FRAUD_DECISION_WITHHELD",
        reviewRequired: true,
      },
    });
    expect(projected).not.toHaveProperty("avg_fraud_score");
    expect(projected).not.toHaveProperty("max_fraud_score");
    expect(projected).not.toHaveProperty("risk_level");
  });

  it("exposes an actionable claims hold without a fraud score or level", () => {
    expect(P0_B1_FRAUD_DECISION_HOLD).toMatchObject({
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
    });
    expect(P0_B1_FRAUD_DECISION_HOLD.requiredEvidence).toHaveLength(3);
    expect(P0_B1_FRAUD_DECISION_HOLD).not.toHaveProperty("score");
    expect(P0_B1_FRAUD_DECISION_HOLD).not.toHaveProperty("riskLevel");
  });

  it("holds registered analytics and executive PDF routes while preserving TRE resource checks before its hold", async () => {
    const user = {
      id: 91004,
      openId: "p0-b1-public-route-gate",
      role: "admin",
      insurerRole: "executive",
      tenantId: "p0-b1-test",
    } as never;

    await expect(
      analyticsRouter.createCaller({ user }).getKPIs({})
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      claimsRouter.createCaller({ user }).getFraudAlerts({})
    ).resolves.toMatchObject({
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
      results: [],
    });
    await expect(
      treGovernanceRouter
        .createCaller({ user })
        .getCanonicalValues({ claimId: 99 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reportsRouter.createCaller({ user }).generateExecutiveReport({})
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("returns the same actionable contradiction hold for hostile and benign-looking inputs", () => {
    const hostile = detectContradictions({
      recommendation: "APPROVE",
      fraud_result: {
        fraud_risk_level: "elevated",
        fraud_risk_score: 99,
        critical_flag_count: 4,
        scenario_fraud_flagged: true,
      },
      physics_result: { is_plausible: false, has_critical_inconsistency: true },
    });
    const benign = detectContradictions({
      recommendation: "APPROVE",
      fraud_result: { fraud_risk_level: "minimal", fraud_risk_score: 0 },
      physics_result: { is_plausible: true, has_critical_inconsistency: false },
    });

    expect(hostile).toMatchObject({ valid: false, action: "BLOCK" });
    expect(hostile.decision_hold).toEqual(benign.decision_hold);
    expect(JSON.stringify(hostile)).not.toMatch(/99|elevated|implausible/i);
  });

  it("does not publish caller-provided fraud or physics sentinels in a decision trace", () => {
    const trace = buildP0B1DecisionTraceHold();

    expect(trace).toMatchObject({
      final_recommendation: "REVIEW",
      final_confidence: 0,
      trace_complete: false,
      decision_hold: { status: "FRAUD_DECISION_WITHHELD" },
    });
    expect(JSON.stringify(trace)).not.toMatch(
      /FRAUD-SENTINEL|PHYSICS-SENTINEL|99|elevated/i
    );
  });

  it("removes fraud aliases and raw breakdowns at the response-validation boundary", () => {
    const result = validateClaimAnalysisResponse({
      fraudScore: 99,
      fraudRiskLevel: "elevated",
      fraudScoreBreakdownJson: {
        indicators: ["FRAUD-SENTINEL"],
        fraud_risk_score: 99,
      },
      costIntelligenceJson: { expectedRepairCostCents: 1000 },
    });

    expect(result.data).toMatchObject({
      fraudDecision: {
        status: "FRAUD_DECISION_WITHHELD",
        actionAllowed: false,
      },
    });
    expect(JSON.stringify(result.data)).not.toMatch(
      /FRAUD-SENTINEL|99|elevated|fraudScore/i
    );
  });

  it("severs historic fraud inputs from canonical report normalisation", () => {
    const presentation = resolveCanonicalClaimReportPresentation({
      fraud_score: 99,
      fraud_risk_level: "elevated",
      recommendation: "ESCALATE",
      fraud_score_breakdown_json: {
        overallScore: 99,
        indicator: "FRAUD-SENTINEL",
      },
      estimated_cost: 20000,
    });

    expect(presentation).toMatchObject({
      claim: { fraudScore: null, fraudRiskLevel: null, fraudIndicators: [] },
      report: {
        fraud: { score: null, level: null, derivedFromJson: false },
        verdict: { verdict: "PENDING", source: "fallback" },
      },
    });
    expect(buildP0B1FraudDecisionHold().requiredEvidence).toHaveLength(3);
  });
});
