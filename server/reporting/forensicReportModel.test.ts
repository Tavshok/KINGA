import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  aiAssessments,
  claimDocuments,
  claims,
  insuranceAuditLogs,
  panelBeaterQuotes,
  panelBeaters,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { generateClaimsIntelligenceReport } from "./claimsIntelligenceReport";
import { generateForensicDecisionReport } from "./forensicDecisionReport";
import { generateReportHtml } from "./reportDefinitions";
import { resolveForensicReportModel } from "./forensicReportModel";

describe("ForensicReportModel", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let tenantId = "";
  let claimId = 0;
  let actorId = 0;
  let panelBeaterId = 0;
  const assessmentIds: number[] = [];
  const quoteIds: number[] = [];
  const documentIds: number[] = [];
  const auditLogIds: number[] = [];
  const generatedAt = new Date("2026-08-27T09:30:00.000Z");

  beforeAll(async () => {
    db = await getDb();
    if (!db)
      throw new Error(
        "Live database is required for forensic report model parity coverage"
      );

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantId = `test-fr-model-${stamp}`;
    const [actorInsert] = await db.insert(users).values({
      openId: `fr-model-user-${stamp}`,
      email: `fr-model-${stamp}@invalid.example`,
      name: "Forensic Model Fixture Actor",
      role: "admin",
      tenantId,
      emailVerified: 1,
    } as any);
    actorId = Number((actorInsert as { insertId: number | string }).insertId);
    const [claimInsert] = await db.insert(claims).values({
      claimNumber: `FR-MODEL-${stamp}`,
      claimantId: actorId,
      tenantId,
      vehicleMake: "Kinga",
      vehicleModel: "Forensic Parity",
      vehicleYear: 2024,
      vehicleRegistration: `FRM-${stamp.slice(-6).toUpperCase()}`,
      vehicleVin: `VIN-FRM-${stamp}`.slice(0, 50),
      vehicleMarketValue: 3_000_000,
      currencyCode: "USD",
      policyNumber: `POL-${stamp}`,
      incidentDate: "2026-08-20 10:30:00",
      incidentDescription:
        "Vehicle was stationary and was struck from the rear during a controlled forensic model parity fixture.",
      incidentType: "collision",
      incidentLocation: "Test location only",
      status: "assessment_complete",
      workflowState: "internal_review",
      lodgerName: "Forensic Model Fixture",
      claimSource: "system_seed",
    } as any);
    claimId = Number((claimInsert as { insertId: number | string }).insertId);

    const commonAssessment = {
      claimId,
      tenantId,
      fraudRiskLevel: "moderate" as const,
      estimatedCost: 1_200_000,
      totalLossIndicated: 0,
      repairToValueRatio: 40,
      costIntelligenceJson: JSON.stringify({
        currency: "USD",
        totalComponents: 8,
        matchedComponents: 6,
        missingFromQuote: 2,
        extraInQuote: 1,
        repairabilityDecision: "REPAIR",
        missingComponents: [
          {
            component: "P0A2_COST_STRUCTURAL_ALIAS_DO_NOT_PUBLISH",
            severity: "critical",
          },
        ],
      }),
      repairIntelligenceJson: JSON.stringify({
        totalComponents: 8,
        severeCount: 2,
        moderateCount: 3,
        minorCount: 3,
        structuralGaps: [
          {
            component: "P0A2_REPAIR_STRUCTURAL_ALIAS_DO_NOT_PUBLISH",
            severity: "critical",
          },
        ],
        structuralReviewRequired: true,
        structuralReviewRationale:
          "P0A2_STRUCTURAL_REVIEW_RATIONALE_DO_NOT_PUBLISH",
        reconciliationNote:
          "P0A2_RECONCILIATION_COLLISION_ALIAS_DO_NOT_PUBLISH",
        policyExclusions: [
          { item: "Unapproved modification", amount: 120, clause: "PX-1" },
        ],
      }),
      fraudScoreBreakdownJson: JSON.stringify({
        fraudCategoryBreakdown: {
          physical_consistency: { normScore: 5, budget: 28 },
          scenario_intelligence: { normScore: 6, budget: 22 },
          financial_anomaly: { normScore: 7, budget: 20 },
          documentation_integrity: { normScore: 4, budget: 15 },
          entity_intelligence: { normScore: 3, budget: 10 },
          photo_forensics: { normScore: 2, budget: 5 },
        },
        quoteSimilarity: { verdict: "possible", highestPairSimilarity: 0.92 },
        indicators: [
          {
            name: "P0A2_FRAUD_COLLISION_INDICATOR_DO_NOT_PUBLISH",
            finding: "P0A2_FRAUD_COLLISION_FINDING_DO_NOT_PUBLISH",
            score: 80,
            triggered: true,
          },
        ],
      }),
      ifeResultJson: JSON.stringify({
        completenessScore: 88,
        uniqueComponents: 8,
        zonesCovered: 2,
        documentCompleteness: { police_report: 100, damage_photo: 80 },
      }),
      narrativeAnalysisJson: JSON.stringify({
        reasoning_summary:
          "The reported rear impact is consistent with the available fixture evidence.",
        consistency_verdict: "Consistent",
        cross_validation: {
          physics_verdict: "Consistent",
          damage_verdict: "Consistent",
        },
        crossEngineAgreement: 92,
        stakeholder_analysis: {
          claimant_charged: false,
          under_investigation: false,
        },
      }),
      physicsAnalysis: JSON.stringify({
        deltaVKmh: 28,
        kineticEnergy: 32,
        impactForceKn: 120,
        vehicleMass: 1450,
        decelerationG: 1.8,
        damageConsistencyScore: 84,
        accidentSeverity: "Moderate",
        safetyRisk: "Low",
        impactDirection: "rear",
        damageZones: [
          {
            zone: "P0A2_PHYSICS_ZONE_DO_NOT_PUBLISH",
            severity: "P0A2_PHYSICS_SEVERITY_DO_NOT_PUBLISH",
          },
        ],
        speedInferenceEnsemble: {
          consensusSpeedKmh: 36,
          overallConfidence: "high",
          methods: [
            {
              method: "CRUSH",
              label: "Crush",
              speedKmh: 36,
              confidence: "high",
              ran: true,
            },
            {
              method: "VISION",
              label: "Vision",
              speedKmh: null,
              confidence: "low",
              ran: false,
            },
          ],
        },
      }),
      physicsTruthJson: JSON.stringify({
        speed: {
          canonical: {
            value: 36,
            min: 31,
            max: 40,
            confidence: 0.88,
            source: "speed ensemble",
            provenanceNote: "Fixture calculation",
          },
          deltaVKmh: { value: 28, min: 24, max: 31, confidence: 0.84 },
        },
        energy: { kineticEnergyJ: { value: 32000, confidence: 0.8 } },
        geometry: {
          crushDepth: {
            value: 0.16,
            min: 0.13,
            max: 0.18,
            confidence: 0.76,
            source: "calibrated image",
          },
        },
        evidenceCompleteness: {
          dataQualityScore: 88,
          speedMethodsRan: 1,
          speedMethodsTotal: 2,
        },
        integrityCheck: { flags: [] },
        impactCausation: "THIRD_PARTY_REAR_STRIKE",
        brakingDistanceM: 7.3,
        brakingFrictionCoefficient: 0.7,
        structuralLoadPath: {
          penetratedComponents: [
            {
              name: "rear cross-member",
              zone: "rear",
              penetrationDepthM: 0.16,
              energyAbsorbedJ: 12000,
              inspectionRequired: true,
            },
          ],
          latentDamageProbability: {
            suspension: 45,
            frame: 25,
            overallRiskLevel: "MODERATE",
          },
          structuralIntegrityRisk: "moderate",
          confidence: 0.78,
          warnings: ["Inspect rear suspension"],
        },
        wave3: {
          integrity: {
            integrityScore: 91,
            clean: true,
            criticalCount: 0,
            warningCount: 0,
            flags: [],
          },
          uncertainty: {
            overallGrade: "B",
            summary: "Moderate uncertainty",
            campbellSpeed: { formatted: "36 km/h" },
          },
          explainability: {
            verdictParagraph: "Fixture forensic finding.",
            keyFindings: ["Rear impact coherence"],
            methodologyCitations: [],
          },
        },
      }),
      forensicAuditValidationJson: JSON.stringify({
        overallScore: 82,
        riskSummary: "FIXTURE PHYSICAL-IMPOSSIBILITY SUMMARY MUST NOT PUBLISH",
        dateDelta:
          "2 days — documents differ; review claim form and police report.",
        duplicateFlag: true,
        linkedClaims: ["P0A2_AUDIT_ONLY_DUPLICATE_DO_NOT_PUBLISH"],
        validationIssues: [
          {
            severity: "high",
            title: "P0A2_NON_KEYWORD_COLLISION_ALIAS_DO_NOT_PUBLISH",
            description: "Fixture axes align without collision vocabulary.",
          },
        ],
        validationChecks: [
          {
            name: "P0A2_VALIDATION_ALIAS_DO_NOT_PUBLISH",
            status: "Pass",
          },
        ],
        nextSteps: ["P0A2_NEXT_STEP_ALIAS_DO_NOT_PUBLISH"],
      }),
      claimQualityJson: JSON.stringify({ overallScore: 86, grade: "B" }),
      decisionAuthorityJson: JSON.stringify({
        summary: "P0A2_DECISION_AUTHORITY_COLLISION_SPEED_DO_NOT_PUBLISH",
        collisionConclusion:
          "P0A2_DECISION_AUTHORITY_CAUSATION_DO_NOT_PUBLISH",
      }),
      crossValidationJson: JSON.stringify({
        threeWaySpeedComparison: {
          claimedSpeedKmh: 40,
          consensusSpeedKmh: 36,
          severityImpliedSpeed: "30–40 km/h",
          verdict: "ALL_AGREE",
        },
      }),
      claimTruthJson: JSON.stringify({
        decision: {
          reviewTriggers: [
            "P0A2_CLAIM_TRUTH_COLLISION_TRIGGER_DO_NOT_PUBLISH",
          ],
        },
        costBasis: { costVerdict: "FAIR" },
      }),
      enrichedPhotosJson: JSON.stringify([
        {
          url: "https://example.invalid/forensic-model-rear.jpg",
          impactZone: "rear",
          caption: "Fixture rear damage photo",
          severity: "severe",
          confidenceScore: 90,
          componentCount: 5,
          semanticType: "vehicle_damage_photo",
          detectedComponents: ["rear bumper", "cross-member"],
          directionContradiction: true,
          suitableForCrushDepth: true,
          physicsExclusionReason:
            "FIXTURE LEGACY PHOTO PHYSICS EXCLUSION MUST NOT PUBLISH",
        },
        {
          url: "https://example.invalid/forensic-model-underbody.jpg",
          impactZone: "underbody",
          severity: "moderate",
          confidenceScore: 85,
          componentCount: 3,
        },
      ]),
      cgiResultJson: JSON.stringify({
        conclusion: {
          verdict: "COHERENT",
          summary: "Fixture geometry is coherent.",
        },
        layer1Indicators: [],
      }),
      interpretationResultJson: JSON.stringify({
        overallClassification: "NORMAL",
        sections: [],
      }),
      modelVersion: "forensic-model-fixture",
      triggeredRole: "claims_assessor",
      damageDescription: "Rear impact fixture damage",
    };

    const [firstAssessment] = await db.insert(aiAssessments).values({
      ...commonAssessment,
      fraudScore: 12,
      recommendation: "APPROVE",
      createdAt: "2026-08-20 10:30:00",
    } as any);
    assessmentIds.push(
      Number((firstAssessment as { insertId: number | string }).insertId)
    );
    const [latestAssessment] = await db.insert(aiAssessments).values({
      ...commonAssessment,
      fraudScore: 47,
      recommendation: "REVIEW",
      createdAt: "2026-08-21 10:30:00",
    } as any);
    assessmentIds.push(
      Number((latestAssessment as { insertId: number | string }).insertId)
    );

    const [repairerInsert] = await db.insert(panelBeaters).values({
      name: "Forensic Model Repairer",
      businessName: `Forensic Model Repairer ${stamp}`,
      approved: 1,
      panelBeaterStatus: "approved",
      tenantId,
    } as any);
    panelBeaterId = Number(
      (repairerInsert as { insertId: number | string }).insertId
    );
    const [quoteInsert] = await db.insert(panelBeaterQuotes).values({
      claimId,
      panelBeaterId,
      tenantId,
      quotedAmount: 1_000_000,
      partsCost: 700_000,
      laborCost: 300_000,
      quoteType: "original",
      status: "submitted",
      currencyCode: "USD",
      quoteCongruencyScore: "92.00",
    } as any);
    quoteIds.push(
      Number((quoteInsert as { insertId: number | string }).insertId)
    );
    const [documentInsert] = await db.insert(claimDocuments).values({
      claimId,
      uploadedBy: actorId,
      fileName: `forensic-model-${stamp}.pdf`,
      fileKey: `tests/forensic-model/${stamp}.pdf`,
      fileUrl: "https://example.invalid/forensic-model-document.pdf",
      fileSize: 1,
      mimeType: "application/pdf",
      documentCategory: "police_report",
    } as any);
    documentIds.push(
      Number((documentInsert as { insertId: number | string }).insertId)
    );
    const [auditInsert] = await db.insert(insuranceAuditLogs).values({
      userId: actorId,
      userRole: "claims_processor",
      action: "claim_created",
      entityType: "claim",
      entityId: claimId,
      changes: JSON.stringify({ source: "forensic-model-fixture" }),
      tenantId,
    } as any);
    auditLogIds.push(
      Number((auditInsert as { insertId: number | string }).insertId)
    );
  });

  it("faithfully represents the current forensic report’s populated field families for the same live claim", async () => {
    const model = await resolveForensicReportModel({
      claimId,
      tenantId,
      audience: "forensic",
      generatedAt,
    });

    expect(model).toMatchObject({
      contractVersion: "1",
      provenance: {
        generatedAt,
        selectedAssessmentId: assessmentIds[1],
        assessmentSelection: "latest_created_at_then_id",
      },
      scope: { claimId, tenantId, audience: "forensic" },
      executive: {
        currency: "USD",
        fraud: { value: 47, band: "moderate" },
        fraudScoreAdjusted: 77,
        physicsConsistency: { value: 84, band: "good" },
        forensicAudit: { value: 82, band: "good" },
        dataCompleteness: { value: 88, band: "good" },
        claimQuality: { value: 86, band: "good" },
        marketValue: 30_000,
        repairToValueRatioPercent: 40,
        reviewTriggers: ["P0A2_CLAIM_TRUTH_COLLISION_TRIGGER_DO_NOT_PUBLISH"],
      },
      claimAndVehicle: {
        vehicleDescription: "Kinga Forensic Parity 2024",
        incidentType: "collision",
        dateAnomaly: { present: false },
      },
      narrative: {
        reconstructedSequence:
          "The reported rear impact is consistent with the available fixture evidence.",
        physicsVsNarrative: "Consistent",
        damageVsNarrative: "Consistent",
        crossEngineAgreement: 92,
        impactDirection: "rear",
      },
      technical: {
        deltaV: { value: 28, unit: "km/h", min: 24, max: 31 },
        kineticEnergy: { value: 32, unit: "kJ" },
        impactForce: { value: 120, unit: "kN" },
        vehicleMass: { value: 1450, unit: "kg" },
        deceleration: { value: 1.8, unit: "g" },
        crushDepth: { value: 160, unit: "mm", min: 130, max: 180 },
        impactSeverity: "Moderate",
        dataQualityScore: 88,
        speed: {
          consensus: 36,
          consensusRounded: 36,
          overallConfidence: "high",
          methodsRan: 1,
          methodsTotal: 2,
        },
        damageSeverity: {
          totalComponents: 8,
          severeCount: 2,
          moderateCount: 3,
          minorCount: 3,
          severePercent: 25,
          moderatePercent: 38,
          minorPercent: 37,
        },
        causation: {
          state: "available",
          value: {
            classification: "THIRD_PARTY_REAR_STRIKE",
            brakingDistanceMetres: 7.3,
            brakingFrictionCoefficient: 0.7,
          },
        },
      },
      structural: {
        loadPath: {
          state: "available",
          value: {
            integrityRisk: "moderate",
            warnings: ["Inspect rear suspension"],
          },
        },
        vehicleProfile: { safetyRisk: "Low" },
      },
      reconciliation: {
        matchedComponents: 6,
        missingFromQuote: 2,
        extraInQuote: 1,
        criticalStructuralGaps: [
          {
            component: "P0A2_REPAIR_STRUCTURAL_ALIAS_DO_NOT_PUBLISH",
            severity: "critical",
          },
        ],
      },
      financial: {
        quotes: [
          { quoted_amount: 1000000, currency_code: "USD", status: "submitted" },
        ],
        lowestQuote: 10000,
        highestQuote: 10000,
      },
      evidence: {
        documents: [{ document_category: "police_report" }],
        totalPhotos: 2,
        usablePhotos: 2,
        uniqueComponents: 8,
        zonesCovered: 2,
        zonesTotal: 4,
      },
      risk: {
        categoryScores: {
          physical: 5,
          scenario: 6,
          financial: 7,
          documentation: 4,
          entity: 3,
          photo: 2,
        },
        categoryBudgets: {
          physical: 28,
          scenario: 22,
          financial: 20,
          documentation: 15,
          entity: 10,
          photo: 5,
        },
      },
      contactGeometry: { state: "available" },
      interpretation: { state: "available" },
      validation: {
        highIssues: [
          { title: "P0A2_NON_KEYWORD_COLLISION_ALIAS_DO_NOT_PUBLISH" },
        ],
        nextSteps: ["P0A2_NEXT_STEP_ALIAS_DO_NOT_PUBLISH"],
      },
      approval: { completedStages: 1, source: "audit_log_derivation" },
    });

    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.technical)).toBe(true);
    expect(Object.isFrozen(model.evidence.photos)).toBe(true);
  });

  it("withholds non-governing collision physics from the forensic renderer while preserving non-physics evidence", async () => {
    const model = await resolveForensicReportModel({
      claimId,
      tenantId,
      audience: "forensic",
      generatedAt,
    });
    const html = await generateForensicDecisionReport(claimId, tenantId);
    const processorStage = model.approval.stages[0]! as Record<string, unknown>;

    expect(html).toContain("Kinga Forensic Parity 2024");
    expect(html).toContain("47<span");
    expect(html).toContain("88<span");
    expect(html).toContain('data-p0-collision-physics="withheld"');
    expect(html).toContain("Obtain a qualified governing measurement");
    expect(html).not.toContain("36 km/h");
    expect(html).not.toContain("28 km/h");
    expect(html).not.toContain("120 kN");
    expect(html).not.toContain("160 mm");
    expect(html).not.toContain("Third-party rear strike");
    expect(processorStage).toMatchObject({
      stage: 1,
      role: "Claims Processor Review",
      status: "Complete",
      officer: "claims_processor",
    });
    expect(html).toContain(String(processorStage.role));
    expect(html).toContain(String(processorStage.status));
    expect(html).toContain(String(processorStage.officer));

    // The live database does not currently expose claim_disputes. The model must
    // preserve that fact explicitly and the renderer must not manufacture a
    // dispute section from a missing source.
    expect(model.availability.disputes).toMatchObject({
      state: "source_unavailable",
      value: null,
      source: "claim_disputes",
    });
    expect(model.disputes).toEqual([]);
    expect(html).not.toContain("Dispute Record");
  });

  it("recognises either human final-approval route without inventing a payment stage", async () => {
    const addApprovalEvent = async (action: string, userRole: string) => {
      const [insert] = await db.insert(insuranceAuditLogs).values({
        userId: actorId,
        userRole,
        action,
        entityType: "claim",
        entityId: claimId,
        changes: JSON.stringify({ source: "forensic-model-approval-fixture" }),
        tenantId,
      } as any);
      const id = Number((insert as { insertId: number | string }).insertId);
      auditLogIds.push(id);
      return id;
    };

    const claimsManagerLogId = await addApprovalEvent(
      "manager_approved",
      "claims_manager"
    );
    const claimsManagerOnly = await resolveForensicReportModel({
      claimId,
      tenantId,
      audience: "forensic",
      generatedAt,
    });
    expect(claimsManagerOnly.approval).toMatchObject({
      completedStages: 2,
      requiredStages: 4,
    });
    expect(claimsManagerOnly.approval.stages[3]).toMatchObject({
      stage: 4,
      role: "Claims Manager Approval",
      status: "Complete",
      officer: "claims_manager",
    });
    expect(claimsManagerOnly.approval.stages[4]).toMatchObject({
      stage: 5,
      role: "Executive / GM Sign-off",
      status: "Not required",
    });
    const claimsManagerHtml = await generateForensicDecisionReport(
      claimId,
      tenantId
    );
    expect(claimsManagerHtml).toContain("2 of 4 required stages complete.");
    expect(claimsManagerHtml).toContain("Claims Manager Approval");
    expect(claimsManagerHtml).toContain("Executive / GM Sign-off");
    expect(claimsManagerHtml).not.toContain("Final Payment Authorisation");

    await addApprovalEvent("executive_approved", "executive");
    const bothApprovers = await resolveForensicReportModel({
      claimId,
      tenantId,
      audience: "forensic",
      generatedAt,
    });
    expect(bothApprovers.approval).toMatchObject({
      completedStages: 3,
      requiredStages: 4,
    });
    expect(bothApprovers.approval.stages[3]).toMatchObject({
      status: "Complete",
    });
    expect(bothApprovers.approval.stages[4]).toMatchObject({
      status: "Complete",
      officer: "executive",
    });

    await db
      .delete(insuranceAuditLogs)
      .where(
        and(
          eq(insuranceAuditLogs.id, claimsManagerLogId),
          eq(insuranceAuditLogs.entityId, claimId),
          eq(insuranceAuditLogs.tenantId, tenantId)
        )
      );
    const executiveOnly = await resolveForensicReportModel({
      claimId,
      tenantId,
      audience: "forensic",
      generatedAt,
    });
    expect(executiveOnly.approval).toMatchObject({
      completedStages: 2,
      requiredStages: 4,
    });
    expect(executiveOnly.approval.stages[3]).toMatchObject({
      stage: 4,
      status: "Not required",
    });
    expect(executiveOnly.approval.stages[4]).toMatchObject({
      stage: 5,
      role: "Executive / GM Sign-off",
      status: "Complete",
      officer: "executive",
    });
  });

  it("renders the Claims Intelligence tier with non-physics evidence and an actionable collision hold", async () => {
    const model = await resolveForensicReportModel({
      claimId,
      tenantId,
      audience: "forensic",
      generatedAt,
    });
    const html = await generateClaimsIntelligenceReport(claimId, tenantId);

    expect(html).toContain("Kinga Forensic Parity 2024");
    expect(html).toContain(`${model.executive.fraud.value}/100`);
    expect(html).toContain("$30,000.00");
    expect(html).toContain('data-p0-collision-physics="withheld"');
    expect(html).toContain("Obtain a qualified governing measurement");
    expect(html).not.toContain("28 km/h");
    expect(html).not.toContain("32.0 kJ");
    expect(html).not.toContain("120.0 kN");
    expect(html).toContain("Copy-Quotation — Possible");
  });

  it("renders CL, CI, and FR with shared non-physics evidence while withholding raw collision values", async () => {
    const model = await resolveForensicReportModel({
      claimId,
      tenantId,
      audience: "forensic",
      generatedAt,
    });
    const [claimsLedgerHtml, claimsIntelligenceHtml, forensicHtml] =
      await Promise.all([
        generateReportHtml("claim.assessment", { claimId }, tenantId),
        generateClaimsIntelligenceReport(claimId, tenantId),
        generateForensicDecisionReport(claimId, tenantId),
      ]);
    const reports = [claimsLedgerHtml, claimsIntelligenceHtml, forensicHtml];

    for (const report of reports) {
      expect(report).toContain("Kinga Forensic Parity 2024");
      expect(report).toContain(String(model.executive.fraud.value));
      expect(report).toContain("$30,000.00");
      expect(report).toContain('data-p0-collision-physics="withheld"');
      expect(report).toContain("Obtain a qualified governing measurement");
      expect(report).not.toContain("28 km/h");
      expect(report).not.toContain("120 kN");
      expect(report).not.toContain("Third-party rear strike");
      expect(report).toContain("Fixture rear damage photo");
      expect(report).toContain("Type: vehicle_damage_photo");
      expect(report).toContain("Components: rear bumper, cross-member");
      expect(report).not.toContain("Physics: crush-depth eligible");
      expect(report).not.toContain(
        "FIXTURE LEGACY PHOTO PHYSICS EXCLUSION MUST NOT PUBLISH"
      );
      expect(report).not.toContain("Zone label requires verification");
      expect(report).not.toContain(
        "P0A2_REPAIR_STRUCTURAL_ALIAS_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_COST_STRUCTURAL_ALIAS_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_STRUCTURAL_REVIEW_RATIONALE_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_RECONCILIATION_COLLISION_ALIAS_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_FRAUD_COLLISION_INDICATOR_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_FRAUD_COLLISION_FINDING_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_CLAIM_TRUTH_COLLISION_TRIGGER_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_DECISION_AUTHORITY_COLLISION_SPEED_DO_NOT_PUBLISH"
      );
      expect(report).not.toContain(
        "P0A2_DECISION_AUTHORITY_CAUSATION_DO_NOT_PUBLISH"
      );
    }

    expect(forensicHtml).toContain(
      "Source documents require manual date reconciliation before a documentary consistency conclusion is published."
    );
    expect(forensicHtml).not.toContain(
      "FIXTURE PHYSICAL-IMPOSSIBILITY SUMMARY MUST NOT PUBLISH"
    );
    expect(forensicHtml).not.toContain("Cross-engine agreement (C1–C9)");
    expect(forensicHtml).not.toContain("92/100");
    expect(forensicHtml).not.toContain("P0A2_PHYSICS_ZONE_DO_NOT_PUBLISH");
    expect(forensicHtml).not.toContain(
      "P0A2_PHYSICS_SEVERITY_DO_NOT_PUBLISH"
    );
    expect(forensicHtml).not.toContain(
      "P0A2_NON_KEYWORD_COLLISION_ALIAS_DO_NOT_PUBLISH"
    );
    expect(forensicHtml).not.toContain(
      "P0A2_VALIDATION_ALIAS_DO_NOT_PUBLISH"
    );
    expect(forensicHtml).not.toContain("P0A2_NEXT_STEP_ALIAS_DO_NOT_PUBLISH");
    expect(forensicHtml).not.toContain(
      "P0A2_AUDIT_ONLY_DUPLICATE_DO_NOT_PUBLISH"
    );
    expect(forensicHtml).not.toContain("Physical consistency");
    expect(forensicHtml).not.toContain("Photo forensics");

    const decisionLabel = model.executive.decision.status
      .replaceAll("_", " ")
      .toLowerCase();
    for (const report of reports)
      expect(report.toLowerCase()).toContain(decisionLabel);
  });

  it("fails closed when a different tenant requests the same claim", async () => {
    await expect(
      resolveForensicReportModel({
        claimId,
        tenantId: `${tenantId}-foreign`,
        audience: "forensic",
        generatedAt,
      })
    ).rejects.toThrow("not found in the current tenant scope");
  });

  afterAll(async () => {
    if (!db) return;
    if (assessmentIds.length > 0) {
      for (const assessmentId of assessmentIds) {
        await db
          .delete(aiAssessments)
          .where(
            and(
              eq(aiAssessments.id, assessmentId),
              eq(aiAssessments.claimId, claimId),
              eq(aiAssessments.tenantId, tenantId)
            )
          );
      }
    }
    for (const documentId of documentIds)
      await db
        .delete(claimDocuments)
        .where(
          and(
            eq(claimDocuments.id, documentId),
            eq(claimDocuments.claimId, claimId)
          )
        );
    for (const auditLogId of auditLogIds)
      await db
        .delete(insuranceAuditLogs)
        .where(
          and(
            eq(insuranceAuditLogs.id, auditLogId),
            eq(insuranceAuditLogs.entityId, claimId),
            eq(insuranceAuditLogs.tenantId, tenantId)
          )
        );
    for (const quoteId of quoteIds)
      await db
        .delete(panelBeaterQuotes)
        .where(
          and(
            eq(panelBeaterQuotes.id, quoteId),
            eq(panelBeaterQuotes.claimId, claimId),
            eq(panelBeaterQuotes.tenantId, tenantId)
          )
        );
    if (claimId)
      await db
        .delete(claims)
        .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
    if (panelBeaterId)
      await db
        .delete(panelBeaters)
        .where(
          and(
            eq(panelBeaters.id, panelBeaterId),
            eq(panelBeaters.tenantId, tenantId)
          )
        );
    if (actorId)
      await db
        .delete(users)
        .where(and(eq(users.id, actorId), eq(users.tenantId, tenantId)));

    if (assessmentIds.length > 0) {
      const leakedAssessments = await db
        .select({ id: aiAssessments.id })
        .from(aiAssessments)
        .where(eq(aiAssessments.id, assessmentIds[0]!));
      expect(leakedAssessments).toHaveLength(0);
    }
    if (claimId) {
      const leakedClaims = await db
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
      expect(leakedClaims).toHaveLength(0);
    }
    for (const quoteId of quoteIds) {
      const leakedQuotes = await db
        .select({ id: panelBeaterQuotes.id })
        .from(panelBeaterQuotes)
        .where(
          and(
            eq(panelBeaterQuotes.id, quoteId),
            eq(panelBeaterQuotes.claimId, claimId),
            eq(panelBeaterQuotes.tenantId, tenantId)
          )
        );
      expect(leakedQuotes).toHaveLength(0);
    }
  });
});
