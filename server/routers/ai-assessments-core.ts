/**
 * KINGA AI Assessments Router
 * Extracted from server/routers.ts for maintainability — Aug 2026.
 * Procedures for AI assessment results, reports, and pipeline management.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, insurerDomainProcedure, router, superAdminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  claims, aiAssessments as aiAssessmentsTable, ingestionDocuments,
} from "../../drizzle/schema";
import { eq, and, desc, asc, inArray, or, count, isNotNull } from "drizzle-orm";
import {
  getClaimById,
  updateClaimStatus,
  createAuditEntry,
  createNotification,
  triggerAiAssessment,
  getUsersByInsurerRoles,
  getActivePipelineCount,
  getPipelineQueueLength,
} from "../db";
import {
  getAiAssessmentByClaimId,
  getDecisionSnapshots,
  getLatestSnapshotJson,
  getQuoteLineItemsByQuoteId,
  getQuotesByClaimId,
  saveDecisionSnapshot
} from "../db";
import { validateAiAssessmentResponse } from "../apiResponseValidator";
import { validateClaimAnalysisResponse } from "../services/apiResponseValidator";
import { sanitiseReportNarrative, buildBlockError } from "../services/externalReportSanitiser";
import { logger } from "../logger";
import { isAdminRole } from "@shared/role-permissions";
import { requireGovernedTenantClaim } from "../services/governedClaimAuthority";

export const aiAssessmentsRouter = router({
  byClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = ctx.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      }
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) return null;

      // Apply normalisation service — ensures cost, fraud, and verdict are
      // always consistent regardless of which pipeline stages ran or how
      // data was stored. This is the single authoritative transformation
      // for all report-facing data.
      const { normaliseReportData } = await import('../report-normalisation');
      const { runPhase1 } = await import('../phase1-data-integrity');
      let costIntelParsed: any = null;
      let fraudBreakdownParsed: any = null;
      let causalVerdictParsed: any = null;
      let validatedOutcomeParsed: any = null;
      try { costIntelParsed = assessment.costIntelligenceJson ? (typeof assessment.costIntelligenceJson === 'string' ? JSON.parse(assessment.costIntelligenceJson) : assessment.costIntelligenceJson) : null; } catch { /* ignore */ }
      try { fraudBreakdownParsed = assessment.fraudScoreBreakdownJson ? (typeof assessment.fraudScoreBreakdownJson === 'string' ? JSON.parse(assessment.fraudScoreBreakdownJson) : assessment.fraudScoreBreakdownJson) : null; } catch { /* ignore */ }
      try {
        // causalVerdictJson may be stored in pipelineRunSummary or a dedicated field
        const prs = assessment.pipelineRunSummary ? (typeof assessment.pipelineRunSummary === 'string' ? JSON.parse(assessment.pipelineRunSummary) : assessment.pipelineRunSummary) : null;
        causalVerdictParsed = prs?.causalVerdict ?? prs?.causal_verdict ?? null;
      } catch { /* ignore */ }

      // Run Phase 1 Data Integrity & Sanitisation gate before normalisation.
      // This validates dates, reconciles costs, corrects unit shifts, sanitises
      // text fields, and normalises terminology. The gate results are attached
      // to the response for audit trail purposes.
      // Derive photosDetected from damagePhotosJson — photosDetected is NOT a DB column.
      // Previously this always resolved to null, causing Phase 1 to report PHOTO_STATUS=NOT_APPLICABLE.
      let p1PhotoUrls: string[] = [];
      try {
        if (assessment.damagePhotosJson) {
          const _p1Photos = typeof assessment.damagePhotosJson === 'string'
            ? JSON.parse(assessment.damagePhotosJson)
            : assessment.damagePhotosJson;
          p1PhotoUrls = Array.isArray(_p1Photos) ? _p1Photos.filter((u: any) => typeof u === 'string') : [];
        }
      } catch { /* non-fatal */ }
      const p1PhotosDetected = p1PhotoUrls.length > 0 ? true : null;
      const p1 = runPhase1({
        incidentDate: (assessment as any).incidentDate ?? null,
        inspectionDate: (assessment as any).inspectionDate ?? null,
        partsCost: assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : null,
        labourCost: assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : null,
        aiEstimatedTotal: assessment.estimatedCost ? Number(assessment.estimatedCost) : null,
        repairerQuoteTotal: costIntelParsed?.documentedOriginalQuoteUsd ?? null,
        photosDetected: p1PhotosDetected,
        photosProcessed: p1PhotosDetected,
        photosProcessedCount: p1PhotoUrls.length,
        incidentType: (assessment as any).incidentType ?? null,
        incidentDescription: (assessment as any).accidentDescription ?? (assessment as any).incidentDescription ?? null,
        policeReportNumber: (assessment as any).policeReportNumber ?? null,
        textFields: {
          assessorNotes: (assessment as any).assessorNotes ?? null,
          damageDescription: (assessment as any).damageDescription ?? null,
        },
      });

      // Run a lightweight Phase 2 pass using stored assessment data.
      // This ensures the single authoritative verdict is always derived from
      // the Phase 2 Decision Engine, even on the read path.
      const { runPhase2: runP2Normalise } = await import('../phase2-decision-engine');
      let p2NormDecision: 'APPROVE' | 'REVIEW' | 'ESCALATE' | 'REJECT' | null = null;
      try {
        // Parse damage photo URLs from damagePhotosJson
        let byClaimPhotoUrls: string[] = [];
        try {
          if (assessment.damagePhotosJson) {
            const parsed = typeof assessment.damagePhotosJson === 'string'
              ? JSON.parse(assessment.damagePhotosJson)
              : assessment.damagePhotosJson;
            byClaimPhotoUrls = Array.isArray(parsed) ? parsed.filter((u: any) => typeof u === 'string') : [];
          }
        } catch { /* non-fatal */ }
        // Parse physics data for consistency score
        let byClaimPhysics: any = null;
        try {
          byClaimPhysics = assessment.physicsAnalysis
            ? (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis) : assessment.physicsAnalysis)
            : null;
        } catch { /* non-fatal */ }
        const byClaimConsistency = byClaimPhysics?.damageConsistencyScore ?? 50;
        const byClaimDeltaV = byClaimPhysics?.deltaVKmh ?? byClaimPhysics?.deltaV ?? 0;
        const byClaimSeverity = assessment.structuralDamageSeverity ?? 'minor';
        const byClaimFraudScore = assessment.fraudScore ? Number(assessment.fraudScore) : 0;
        const p2Norm = runP2Normalise({
          authoritativeTotalUsd: p1.authoritativeTotalUsd ?? (assessment.estimatedCost ? Number(assessment.estimatedCost) : 0),
          incidentType: (assessment as any).incidentType ?? null,
          incidentDescription: (assessment as any).accidentDescription ?? (assessment as any).incidentDescription ?? null,
          photosDetected: byClaimPhotoUrls.length > 0 ? true : null,
          photosProcessed: byClaimPhotoUrls.length > 0 ? true : null,
          photosProcessedCount: byClaimPhotoUrls.length,
          damagePhotoUrls: byClaimPhotoUrls,
          policeReportNumber: (assessment as any).policeReportNumber ?? null,
          repairerQuoteTotal: costIntelParsed?.documentedOriginalQuoteUsd ?? null,
          deltaVKmh: Number(byClaimDeltaV),
          physicsConsistencyScore: Number(byClaimConsistency),
          structuralDamageSeverity: byClaimSeverity as string,
          fraudScore: byClaimFraudScore,
          vehicleMarketValueCents: null, // not available on read path without extra DB call
        });
        p2NormDecision = p2Norm.finalDecision;
      } catch { /* non-fatal — falls back to pipeline verdict */ }

      const normalised = normaliseReportData({
        estimatedCost: assessment.estimatedCost ? Number(assessment.estimatedCost) : null,
        estimatedPartsCost: assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : null,
        estimatedLaborCost: assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : null,
        fraudScore: assessment.fraudScore ? Number(assessment.fraudScore) : null,
        fraudRiskLevel: assessment.fraudRiskLevel,
        recommendation: assessment.recommendation,
        currencyCode: assessment.currencyCode,
        costIntelligenceJson: costIntelParsed,
        fraudScoreBreakdownJson: fraudBreakdownParsed,
        causalVerdictJson: causalVerdictParsed,
        validatedOutcomeJson: validatedOutcomeParsed,
        phase2Decision: p2NormDecision,
      });

      // Parse the full ClaimRecord JSON for the ForensicAuditReport
      let parsedClaimRecord: any = null;
      try {
        if ((assessment as any).claimRecordJson) {
          parsedClaimRecord = JSON.parse((assessment as any).claimRecordJson as string);
        }
      } catch { /* non-fatal */ }

      // Parse the dedicated narrativeAnalysisJson column (Stage 7e output).
      // Falls back to the value embedded inside claimRecord.accidentDetails.narrativeAnalysis
      // so historical assessments that pre-date the dedicated column still render correctly.
      let parsedNarrativeAnalysis: any = null;
      try {
        if ((assessment as any).narrativeAnalysisJson) {
          parsedNarrativeAnalysis = JSON.parse((assessment as any).narrativeAnalysisJson as string);
        } else if (parsedClaimRecord?.accidentDetails?.narrativeAnalysis) {
          // Fallback: extract from claimRecord for assessments before the dedicated column was added
          parsedNarrativeAnalysis = parsedClaimRecord.accidentDetails.narrativeAnalysis;
        }
      } catch { /* non-fatal */ }

      // Parse forensicAnalysis JSON to extract preGenerationCheck contradictions (C-5 fix)
      let parsedPreGenerationCheck: any = null;
      try {
        if ((assessment as any).forensicAnalysisJson) {
          const fa = JSON.parse((assessment as any).forensicAnalysisJson as string);
          parsedPreGenerationCheck = fa?.preGenerationCheck ?? null;
        }
      } catch { /* non-fatal */ }
      // Phase 4 — Parse IFE, DOE, and FEL version snapshot for Decision Narrative View
      let parsedIfeResult: any = null;
      let parsedDoeResult: any = null;
      let parsedFelVersionSnapshot: any = null;
      try {
        if ((assessment as any).ifeResultJson) {
          parsedIfeResult = typeof (assessment as any).ifeResultJson === 'string'
            ? JSON.parse((assessment as any).ifeResultJson)
            : (assessment as any).ifeResultJson;
        }
      } catch { /* non-fatal */ }
      try {
        if ((assessment as any).doeResultJson) {
          parsedDoeResult = typeof (assessment as any).doeResultJson === 'string'
            ? JSON.parse((assessment as any).doeResultJson)
            : (assessment as any).doeResultJson;
        }
      } catch { /* non-fatal */ }
      try {
        if ((assessment as any).felVersionSnapshotJson) {
          parsedFelVersionSnapshot = typeof (assessment as any).felVersionSnapshotJson === 'string'
            ? JSON.parse((assessment as any).felVersionSnapshotJson)
            : (assessment as any).felVersionSnapshotJson;
        }
      } catch { /* non-fatal */ }

      return {
        ...assessment,
        // Overwrite raw JSON strings with parsed objects so components receive
        // proper objects instead of strings that silently evaluate to null/undefined.
        costIntelligenceJson: costIntelParsed,
        fraudScoreBreakdownJson: fraudBreakdownParsed,
        // Overwrite with normalised values — these are what the UI must use
        _normalised: normalised,
        // Phase 1 gate results — for audit trail and data quality indicators
        _phase1: {
          overallStatus: p1.overallStatus,
          gates: p1.gates,
          allCorrections: p1.allCorrections,
          authoritativeTotalUsd: p1.authoritativeTotalUsd,
          costReconciliationError: p1.costReconciliationError,
          incidentType: p1.incidentType,
          photoStatusMessage: p1.photoStatusMessage,
          locale: p1.locale,
        },
        // Full ClaimRecord — all extracted fields including insurer, policy, excess, market value, etc.
        _claimRecord: parsedClaimRecord,
        // Stage 7e Narrative Analysis — dedicated field for ForensicAuditReport
        // Falls back to claimRecord.accidentDetails.narrativeAnalysis for pre-column assessments
        _narrativeAnalysis: parsedNarrativeAnalysis,
        // Pre-generation consistency check contradictions (C-5 fix)
        // Surfaces fraud score contradictions, physics indicator conflicts, and cost basis mismatches
        _preGenerationCheck: parsedPreGenerationCheck,
        // Full forensic analysis JSON — provides reconciliationLog, integrityGate, and schema validation
        // to the CongruencyPanel in ForensicAuditReport
        _forensicAnalysis: (() => {
          try {
            if ((assessment as any).forensicAnalysisJson) {
              return JSON.parse((assessment as any).forensicAnalysisJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Phase 4 — Decision Narrative View data
        _ifeResult: parsedIfeResult,
        _doeResult: parsedDoeResult,
        _felVersionSnapshot: parsedFelVersionSnapshot,
        // Claim Quality Score — 6-dimension quality assessment with grade A-F
        _claimQuality: (() => {
          try {
            if ((assessment as any).claimQualityJson) {
              return JSON.parse((assessment as any).claimQualityJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Stage 36: Forensic Audit Validator — 10-dimension post-pipeline validation report
        _forensicAuditValidation: (() => {
          try {
            if ((assessment as any).forensicAuditValidationJson) {
              return JSON.parse((assessment as any).forensicAuditValidationJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Stage 12.5: Report Readiness Gate — whether the claim can be exported as a report
        _reportReadiness: (() => {
          try {
            if ((assessment as any).reportReadinessJson) {
              return JSON.parse((assessment as any).reportReadinessJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Photo counts — ForensicAuditReport expects these as NUMBERS (not booleans).
        // imageAnalysisTotalCount = all photos linked to the claim (including deferred by vision budget)
        // imageAnalysisSuccessCount = photos successfully processed by the vision LLM
        photosDetected: Number((assessment as any).imageAnalysisTotalCount ?? 0),
        photosProcessedCount: Number((assessment as any).imageAnalysisSuccessCount ?? 0),
        // R-F-01/04/05 fix: parsed report signals — blockAutoApproval, prePublicationBlockers, costRecommendation
        _reportSignals: (() => {
          try {
            if ((assessment as any).reportSignalsJson) {
              return JSON.parse((assessment as any).reportSignalsJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // XV Cross-Validation Risk — physics/cost/narrative multi-engine risk from pipeline
        // Surfaced separately from fraud score so CRITICAL XV risk is never hidden behind a 'low' fraud label
        _xvRisk: (() => {
          try {
            const xv = (assessment as any).crossValidationJson
              ? (typeof (assessment as any).crossValidationJson === 'string'
                  ? JSON.parse((assessment as any).crossValidationJson)
                  : (assessment as any).crossValidationJson)
              : null;
            if (!xv) return null;
            return {
              overallRisk: xv.overallRisk ?? xv.overall_risk ?? null,
              overallRiskScore: xv.overallRiskScore ?? xv.overall_risk_score ?? null,
              speedDeviation: xv.speedDeviation ?? xv.speed_deviation ?? null,
              costDeviation: xv.costDeviation ?? xv.cost_deviation ?? null,
              findings: Array.isArray(xv.findings) ? xv.findings : [],
            };
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Stage 9.5 CGI — Contact Geometry Intelligence full output
        // contactGeometryFlag and forensicVerdict are top-level convenience fields.
        _cgi: (() => {
          try {
            if ((assessment as any).cgiResultJson) {
              return typeof (assessment as any).cgiResultJson === 'string'
                ? JSON.parse((assessment as any).cgiResultJson)
                : (assessment as any).cgiResultJson;
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Stage 10-I Interpretation Engine — cross-engine LLM narrative and adjuster actions
        _interpretation: (() => {
          try {
            if ((assessment as any).interpretationResultJson) {
              return typeof (assessment as any).interpretationResultJson === 'string'
                ? JSON.parse((assessment as any).interpretationResultJson)
                : (assessment as any).interpretationResultJson;
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
      };
    }),
  historicalBenchmarks: protectedProcedure
    .input(z.object({
      vehicleMake: z.string(),
      vehicleModel: z.string().optional(),
      damageContext: z.object({
        accidentType: z.string().optional(),
        damageSeverity: z.string().optional(),
        affectedZones: z.array(z.string()).optional(),
        estimatedCost: z.number().optional(),
      }).optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      const { getHistoricalBenchmarks } = await import("../continuous-learning");
      return await getHistoricalBenchmarks(tenantId, input.vehicleMake, input.vehicleModel, input.damageContext);
    }),
  all: protectedProcedure
    .query(async ({ ctx }) => {
      const tenantId = ctx.user?.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      }
      // Fetch this tenant's AI assessments for batch export.
      const { getDb } = await import("../db");
      const { aiAssessments } = await import("../../drizzle/schema");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return await db.select().from(aiAssessments).where(eq(aiAssessments.tenantId, tenantId));
    }),
  // Intelligence Enforcement Layer — applies all enforcement rules to a claim's assessment
  getEnforcement: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const { applyIntelligenceEnforcement } = await import("../intelligence-enforcement");
      const { getAiAssessmentByClaimId, getQuotesByClaimId } = await import("../db");
      const { tenantId } = await requireGovernedTenantClaim(String(input.claimId), ctx.user.tenantId);
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) return null;
      const quotes = await getQuotesByClaimId(input.claimId, tenantId);

      // ── Prior claims lookup ──────────────────────────────────────────────
      // Resolve hasPreviousClaims from the claimantHistory table using the
      // claimant linked to this claim. A claimant with totalClaims > 1 has
      // at least one prior claim on record, which adds +20 to the fraud score.
      let hasPreviousClaims = false;
      try {
        const { getDb } = await import('../db');
        const { claimantHistory, claims: claimsTable } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (db) {
          // Get the claimantId from the claims table for this claim
          const [claimRow] = await db.select({ claimantId: claimsTable.claimantId, kingaRef: claimsTable.kingaRef })
            .from(claimsTable)
            .where(and(eq(claimsTable.id, input.claimId), eq(claimsTable.tenantId, tenantId)))
            .limit(1);
          if (claimRow?.claimantId) {
            const [histRow] = await db.select({ totalClaims: claimantHistory.totalClaims })
              .from(claimantHistory)
              .where(eq(claimantHistory.claimantId, claimRow.claimantId))
              .limit(1);
            // totalClaims includes the current claim, so > 1 means prior claims exist
            hasPreviousClaims = (histRow?.totalClaims ?? 0) > 1;
          }
        }
      } catch { /* non-fatal: defaults to false if lookup fails */ }
      // ── ClaimRecordBridge: single authoritative data resolution ──────────
      // Resolves every field from claim_record_json first, then flat DB columns.
      // ALL downstream consumers in this procedure MUST use `bridge.*` instead
      // of reading directly from `assessment.*` to prevent split-brain data issues.
      const { resolveClaimRecord } = await import('../claim-record-bridge');
      const bridge = resolveClaimRecord(assessment as Record<string, unknown>);
      // Populate quotedAmountUsd from quotes table
      bridge.quotedAmountUsd = quotes.length > 0 ? Math.max(...quotes.map((q: any) => (q.quotedAmount || 0) / 100)) : null;

      // Run Phase 1 unit-correction gate so cost values fed to the enforcement
      // engine are already normalised (cents/dollars shift corrected, parts+labour
      // reconciled). Non-blocking — enforcement always proceeds even if WARN.
      const { runPhase1: runP1Enforcement } = await import('../phase1-data-integrity');
      const p1Enforcement = runP1Enforcement({
        partsCost: assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : null,
        labourCost: assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : null,
        aiEstimatedTotal: assessment.estimatedCost ? Number(assessment.estimatedCost) : null,
        incidentType: bridge.incidentType !== 'unknown' ? bridge.incidentType : null,
        incidentDescription: bridge.incidentDescription,
        textFields: {},
      });
      // Use Phase 1 authoritative total if available; fall back to raw DB value
      const enforcementAiCost = p1Enforcement.authoritativeTotalUsd ?? (assessment.estimatedCost || 0);
      const enforcementPartsUsd = p1Enforcement.partsUsd ?? (assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : 0);
      const enforcementLabourUsd = p1Enforcement.labourUsd ?? (assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : 0);

      // ── All field reads now go through bridge — no more ad-hoc JSON parsing ──────
      const quotedAmounts = quotes.map((q: any) => (q.quotedAmount || 0) / 100); // cents → dollars
      const damagedComponents = bridge.damagedComponents;
      const fraudIndicators = bridge.fraudIndicators;
      const fraudScore = bridge.fraudScore;
      const estimatedSpeedKmh = bridge.estimatedSpeedKmh;
      const deltaVKmh = bridge.deltaVKmh;
      const impactForceKn = bridge.impactForceKn;
      const energyKj = bridge.energyKj;
      const vehicleMassKg = bridge.vehicleMassKg;
      const accidentSeverity = bridge.structuralDamageSeverity;
      const consistencyScore = bridge.physicsConsistencyScore;
      const impactDirection = bridge.impactDirection;
      const aiEstimatedCost = enforcementAiCost; // Phase 1 unit-corrected authoritative cost
      const extractionConfidence = assessment.confidenceScore ?? bridge.dataCompletenessScore ?? 75;
      // Keep fraudScoreBreakdown for legacy consumers that still reference it below
      let fraudScoreBreakdown: any = null;
      try {
        fraudScoreBreakdown = assessment.fraudScoreBreakdownJson
          ? (typeof assessment.fraudScoreBreakdownJson === 'string' ? JSON.parse(assessment.fraudScoreBreakdownJson) : assessment.fraudScoreBreakdownJson)
          : null;
      } catch { /* ignore */ }

      // Derive damage zones from component names and impact direction.
      // Map component names to standard zone labels (Front, Rear, Left Side, Right Side, Roof, Underbody, Interior)
      const _compToZone = (comp: string): string | null => {
        const c = comp.toLowerCase();
        if (/\bfront\b|\bf\/|\bfr\b|bumper.*front|front.*bumper|windscreen|windshield|bonnet|hood|grille|headlamp|headlight|foglight|fog.lamp/.test(c)) return 'Front';
        if (/\brear\b|\br\/|\brr\b|tail|boot|trunk|back.*bumper|bumper.*rear|rear.*bumper|reverse|back.light|brake.light/.test(c)) return 'Rear';
        if (/\bleft\b|\bl\/s\b|\bl\.s\b|\bls\b|driver.side|nearside/.test(c)) return 'Left Side';
        if (/\bright\b|\br\/s\b|\br\.s\b|\brs\b|passenger.side|offside/.test(c)) return 'Right Side';
        if (/\broof\b|\bsunroof\b|\bpillar\b/.test(c)) return 'Roof';
        if (/\bunderbody\b|\bchassis\b|\bsump\b|\baxle\b|\bsuspension\b/.test(c)) return 'Underbody';
        if (/\binterior\b|\bdashboard\b|\bseat\b|\bairbag\b/.test(c)) return 'Interior';
        return null;
      };
      const _derivedZones = damagedComponents.length > 0
        ? [...new Set(damagedComponents.map((c: string) => _compToZone(c)).filter(Boolean) as string[])]
        : [];
      const damageZones = _derivedZones.length > 0
        ? _derivedZones
        : impactDirection !== 'unknown' ? [impactDirection] : [];

      const result = applyIntelligenceEnforcement({
        fraudScore: Number(fraudScore),
        fraudRiskLevel: bridge.fraudRiskLevel,
        estimatedSpeedKmh: Number(estimatedSpeedKmh),
        deltaVKmh: Number(deltaVKmh),
        impactForceKn: Number(impactForceKn),
        energyKj: Number(energyKj),
        vehicleMassKg: Number(vehicleMassKg),
        accidentSeverity,
        consistencyScore: Number(consistencyScore),
        impactDirection,
        damageZones,
        damageComponents: damagedComponents,
        aiEstimatedCost,
        quotedAmounts,
        vehicleMake: bridge.vehicleMake ?? '',
        hasPreviousClaims,
        fraudScoreBreakdownJson: fraudIndicators.length > 0 ? fraudIndicators : null,
        extractionConfidence: Number(extractionConfidence),
        incidentType: bridge.incidentType !== 'unknown' ? bridge.incidentType : undefined,
      });
      // Run the Cost Extraction Engine for guaranteed populated cost object
      const { extractCosts } = await import('../cost-extraction-engine');
      const aiPartsCost = enforcementPartsUsd; // Phase 1 unit-corrected parts cost
      const aiLabourCost = enforcementLabourUsd; // Phase 1 unit-corrected labour cost

      // ── Load actual quote line items for authoritative per-item costs ──
      let quoteLineItemsForCost: Array<{ description: string; category: string; quantity: number; unitPrice: number; lineTotal: number; isRepair?: boolean; isReplacement?: boolean }> = [];
      try {
        if (quotes.length > 0) {
          const { getQuoteLineItemsByQuoteId } = await import('../db');
          // Load line items from ALL quotes for multi-quote optimisation
          const allLineItemsByQuote: Array<{ quoteId: number; repairer: string; items: typeof quoteLineItemsForCost }> = [];
          for (const quote of quotes) {
            const lineItems = await getQuoteLineItemsByQuoteId(quote.id);
            const mappedItems = lineItems.map((li: any) => ({
              description: li.description ?? 'Unknown item',
              category: li.category ?? 'other',
              quantity: Number(li.quantity ?? 1),
              unitPrice: Number(li.unitPrice ?? 0),
              lineTotal: Number(li.lineTotal ?? 0),
              isRepair: li.isRepair === 1,
              isReplacement: li.isReplacement === 1,
            }));
            allLineItemsByQuote.push({ quoteId: quote.id, repairer: (quote as any).repairerName ?? `Repairer ${quote.id}`, items: mappedItems });
            // Use first quote as primary source for backward compat
            if (quote.id === quotes[0].id) {
              quoteLineItemsForCost = mappedItems;
            }
          }
          // Run multi-quote optimisation when more than one quote exists
          if (quotes.length > 1) {
            try {
              const { optimiseRepairCost } = await import('../pipeline-v2/quoteOptimisationEngine');
              const optimisationResult = optimiseRepairCost(allLineItemsByQuote as any, [], "unknown");
              (quoteLineItemsForCost as any).__optimisation = optimisationResult;
            } catch (optErr) {
              console.warn('[getEnforcement] Quote optimisation failed:', optErr);
            }
          }
        }
      } catch (err) {
        console.warn('[getEnforcement] Failed to load quote line items:', err);
      }

      // ── Load learning DB benchmark ──
      let learningBenchmark: { vehicleDescriptor: string; componentCount: number; collisionDirection: string; marketRegion: string; avgCostUsd: number | null; sampleSize: number } | null = null;
      try {
        const { costLearningRecords } = await import('../../drizzle/schema');
        const { sql: sqlFn } = await import('drizzle-orm');
        const dbConn = await getDb();
        if (dbConn && assessment.vehicleMake) {
          const vehicleDesc = `${(assessment.vehicleMake ?? '').toLowerCase()} ${(assessment.vehicleModel ?? '').toLowerCase()}`.trim();
          if (vehicleDesc) {
            // Exclude the current claim to prevent circular self-reference in the benchmark
            const currentClaimId = input.claimId ?? 0;
            const rows = await dbConn.select({
              avgCost: sqlFn`AVG(final_cost_usd_cents)`.as('avg_cost'),
              cnt: sqlFn`COUNT(*)`.as('cnt'),
            })
              .from(costLearningRecords)
              .where(sqlFn`vehicle_descriptor LIKE ${`%${vehicleDesc}%`} AND (claim_id IS NULL OR claim_id != ${currentClaimId})`);
            const row = rows[0] as any;
            // Require at least 3 independent historical claims to avoid noise / self-reference
            if (row && Number(row.cnt) >= 3) {
              // Use claim's currency code for learning benchmark segmentation
              const claimCurrencyCode = (assessment as any).currencyCode ?? 'USD';
              learningBenchmark = {
                vehicleDescriptor: vehicleDesc,
                componentCount: damagedComponents.length,
                collisionDirection: impactDirection,
                marketRegion: claimCurrencyCode, // segmented by currency, not hardcoded country
                avgCostUsd: row.avgCost ? Number(row.avgCost) / 100 : null, // cents → base currency unit
                sampleSize: Number(row.cnt),
              };
            }
          }
        }
      } catch (err) {
        console.warn('[getEnforcement] Failed to query learning benchmark:', err);
      }

      const claimCurrency = (assessment as any).currencyCode ?? 'USD';
      const costExtraction = extractCosts({
        aiEstimatedCost,
        aiPartsCost,
        aiLabourCost,
        damageComponents: damagedComponents,
        accidentSeverity,
        extractionConfidence: Number(extractionConfidence),
        quotedAmounts,
        quoteLineItems: quoteLineItemsForCost,
        learningBenchmark,
        currencyCode: claimCurrency,
      });
      // Run the Weighted Fraud Scoring Engine — deterministic, rule-based
      const { computeWeightedFraudScore, countMissingFields } = await import('../weighted-fraud-scoring');
      const primaryQuotedAmount = quotedAmounts.length > 0 ? Math.max(...quotedAmounts) : 0;
      // Use bridge.dataCompletenessScore if available (from claimRecord.dataQuality),
      // otherwise fall back to countMissingFields() heuristic
      const missingDataCount = bridge.dataCompletenessScore > 0
        ? Math.round((1 - bridge.dataCompletenessScore / 100) * 10) // convert % to missing-field count
        : countMissingFields({
            estimatedSpeedKmh: Number(estimatedSpeedKmh),
            impactForceKn: Number(impactForceKn),
            energyKj: Number(energyKj),
            vehicleMake: bridge.vehicleMake ?? '',
            impactDirection,
            damageComponents: damagedComponents,
          });
      // Build multi-source conflict signal from Stage 12/13 consistency check result
      // Only inject when: status == "complete" AND at least one high-severity mismatch
      // confidence HIGH → weight 12, MEDIUM → weight 5, LOW → ignored
      let multiSourceConflict: { confidence: "HIGH" | "MEDIUM" | "LOW"; highSeverityMismatchCount: number; details: string } | undefined;
      try {
        const consistencyRaw = assessment.consistencyCheckJson
          ? (typeof assessment.consistencyCheckJson === 'string'
              ? JSON.parse(assessment.consistencyCheckJson)
              : assessment.consistencyCheckJson)
          : null;
        if (
          consistencyRaw &&
          consistencyRaw.status === 'complete' &&
          Array.isArray(consistencyRaw.mismatches)
        ) {
          const highMismatches = consistencyRaw.mismatches.filter(
            (m: any) => m.severity === 'high'
          );
          const checkConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = consistencyRaw.confidence ?? 'LOW';
          if (highMismatches.length > 0 && checkConfidence !== 'LOW') {
            multiSourceConflict = {
              confidence: checkConfidence,
              highSeverityMismatchCount: highMismatches.length,
              details: highMismatches
                .map((m: any) => m.details)
                .slice(0, 2) // include up to 2 details in the fraud explanation
                .join('; '),
            };
          }
        }
      } catch { /* ignore parse errors — signal simply won't be injected */ }

      // Temporal data for impossibility engine (engine runs after the claim row fetch below)
      const claimIncidentDate = assessment.accidentDate ?? null;
      const claimVehicleYear = assessment.vehicleYear ? Number(assessment.vehicleYear) : null;

      const weightedFraud = computeWeightedFraudScore({
        consistencyScore: Number(consistencyScore),
        aiEstimatedCost,
        quotedAmount: primaryQuotedAmount,
        impactDirection,
        damageZones,
        hasPreviousClaims,
        missingDataCount,
        aiIndicators: fraudIndicators.map(i => ({ label: i.indicator, points: i.score })),
        multiSourceConflict,
        // T1 temporal impossibility — derived from the full engine below after claim row fetch
        // Will be injected post-engine via impossibilityPoints adjustment
      });
      // Phase 2 — Decision & Consistency Engine
      // Runs after all scoring engines so it has the final fraud score from
      // the weighted engine. Produces the single authoritative decision.
      const { runPhase2 } = await import('../phase2-decision-engine');
      // Parse damage photo URLs from damagePhotosJson
      let phase2DamagePhotoUrls: string[] = [];
      try {
        if (assessment.damagePhotosJson) {
          const parsed = typeof assessment.damagePhotosJson === 'string'
            ? JSON.parse(assessment.damagePhotosJson)
            : assessment.damagePhotosJson;
          phase2DamagePhotoUrls = Array.isArray(parsed) ? parsed.filter((u: any) => typeof u === 'string') : [];
        }
      } catch { /* non-fatal */ }
      // Resolve vehicleMarketValue from the claims table (stored in cents)
      let phase2MarketValueCents: number | null = null;
      let claimMileageKm: number | null = null;
      let claimSubmittedAt: number | null = null;
      let claimRegistration: string | null = null;
      let otherClaimsForReg: Array<{ claimId: number; claimNumber: string; incidentDate: string }> = [];
      try {
        const { claims: claimsTable } = await import('../../drizzle/schema');
        const { eq, and: andEq, ne } = await import('drizzle-orm');
        const db2 = await getDb();
        if (db2) {
          const [claimRow] = await db2.select({
            vehicleMarketValue: claimsTable.vehicleMarketValue,
            vehicleMileage: claimsTable.vehicleMileage,
            createdAt: claimsTable.createdAt,
            vehicleRegistration: claimsTable.vehicleRegistration,
            incidentDate: claimsTable.incidentDate,
          })
            .from(claimsTable)
            .where(eq(claimsTable.id, input.claimId))
            .limit(1);
          phase2MarketValueCents = claimRow?.vehicleMarketValue ?? null;
          // Parse mileage string to integer km
          if (claimRow?.vehicleMileage) {
            const stripped = String(claimRow.vehicleMileage).replace(/[\s,]/g, '');
            const parsed = parseInt(stripped, 10);
            if (!isNaN(parsed) && parsed > 0) claimMileageKm = parsed;
          }
          claimSubmittedAt = claimRow?.createdAt ? new Date(claimRow.createdAt).getTime() : null;
          claimRegistration = claimRow?.vehicleRegistration ?? null;
          // I2: look for other claims with same registration within 7 days
          if (claimRow?.vehicleRegistration && claimRow?.incidentDate) {
            const otherRows = await db2.select({
              id: claimsTable.id,
              claimNumber: claimsTable.claimNumber,
              incidentDate: claimsTable.incidentDate,
            })
              .from(claimsTable)
              .where(andEq(
                eq(claimsTable.vehicleRegistration, claimRow.vehicleRegistration),
                ne(claimsTable.id, input.claimId)
              ))
              .limit(20);
            otherClaimsForReg = otherRows
              .filter(r => r.incidentDate)
              .map(r => ({ claimId: r.id, claimNumber: r.claimNumber ?? '', incidentDate: r.incidentDate! }));
          }
        }
      } catch { /* non-fatal */ }

      // ── Full Impossibility Detection Engine ──────────────────────────────────
      const { detectImpossibilities, impossibilityFraudPoints, impossibilitySummary } = await import('../services/impossibilityDetector');
      const impossibilityFlags = detectImpossibilities({
        incidentDate: claimIncidentDate,
        vehicleYear: claimVehicleYear,
        submittedAt: claimSubmittedAt,
        vehicleMileageKm: claimMileageKm,
        quotedRepairCost: primaryQuotedAmount > 0 ? primaryQuotedAmount : null,
        vehicleMarketValue: phase2MarketValueCents ? phase2MarketValueCents / 100 : null,
        vehicleRegistration: claimRegistration,
        otherClaimsForRegistration: otherClaimsForReg,
      });
      const impossibilityPoints = impossibilityFraudPoints(impossibilityFlags);
      const impossibilityNote = impossibilitySummary(impossibilityFlags);
      // Use bridge for authoritative photo and incident data
      // FAR-2 fix: if bridge.photoUrls and damagePhotosJson are both empty, fall back to
      // damage_photo entries in claimDocuments (uploaded via the portal but not yet synced
      // into damagePhotosJson by an older pipeline run).
      let claimDocPhotoUrls: string[] = [];
      if (bridge.photoUrls.length === 0 && phase2DamagePhotoUrls.length === 0) {
        try {
          const { claimDocuments: claimDocsTable } = await import('../../drizzle/schema');
          const { and: andOp } = await import('drizzle-orm');
          const db2Far = await getDb();
          if (db2Far) {
            const docs = await db2Far
              .select({ fileUrl: claimDocsTable.fileUrl })
              .from(claimDocsTable)
              .where(andOp(
                eq(claimDocsTable.claimId, input.claimId),
                eq(claimDocsTable.documentCategory, 'damage_photo')
              ));
            claimDocPhotoUrls = docs.map((d: any) => d.fileUrl).filter(Boolean);
          }
        } catch { /* non-fatal */ }
      }
      const phase2PhotoUrls = bridge.photoUrls.length > 0
        ? bridge.photoUrls
        : phase2DamagePhotoUrls.length > 0
          ? phase2DamagePhotoUrls
          : claimDocPhotoUrls;
      const phase2 = runPhase2({
        authoritativeTotalUsd: enforcementAiCost,
        incidentType: bridge.incidentType !== 'unknown' ? bridge.incidentType : null,
        incidentDescription: bridge.incidentDescription,
        // photosDetected: true if photos exist in source doc (even if ingestion failed)
        photosDetected: bridge.photosDetected ? true : null,
        // photosProcessed: true only if photos were actually ingested and processed
        photosProcessed: bridge.photosIngested ? true : null,
        photosProcessedCount: phase2PhotoUrls.length,
        damagePhotoUrls: phase2PhotoUrls,
        policeReportNumber: bridge.policeReportNumber,
        repairerQuoteTotal: primaryQuotedAmount > 0 ? primaryQuotedAmount : null,
        deltaVKmh: Number(deltaVKmh),
        physicsConsistencyScore: Number(consistencyScore),
        structuralDamageSeverity: accidentSeverity,
        // Use pipeline fraud score (bridge.fraudScore) not weightedFraud.totalScore
        // weightedFraud is a supplementary scoring engine; the pipeline Stage 8 score
        // is the primary authoritative fraud score.
        fraudScore: bridge.fraudScore > 0 ? bridge.fraudScore : (weightedFraud.score ?? 0),
        vehicleMarketValueCents: phase2MarketValueCents,
      });

      // Stage 27: validate and auto-heal before sending to frontend
      // Include claimId so the AI_ASSESSMENT_CONTRACT critical field check passes
      // Extract photoForensics from the stored fraudScoreBreakdownJson
      const photoForensicsData = fraudScoreBreakdown?.photoForensics ?? null;
      // Derive photosDetected (count) and photosProcessedCount from imageAnalysis DB columns.
      // The ForensicAuditReport expects these as NUMBERS (not booleans) for count display.
      // imageAnalysisTotalCount = all photos linked to the claim (including deferred)
      // imageAnalysisSuccessCount = photos successfully analysed by the vision LLM
      // NOTE: Read from `assessment` (DB row), NOT `result` (IntelligenceEnforcementResult which has no photo columns)
      const photosDetectedCount = Number((assessment as any).imageAnalysisTotalCount ?? 0);
      const photosProcessedCount = Number((assessment as any).imageAnalysisSuccessCount ?? 0);
      console.log('[DEBUG byClaim] photosDetectedCount:', photosDetectedCount, 'photosProcessedCount:', photosProcessedCount, 'imageAnalysisTotalCount raw:', (assessment as any).imageAnalysisTotalCount, 'imageAnalysisSuccessCount raw:', (assessment as any).imageAnalysisSuccessCount);
      // Resolve kingaRef from the claimRow fetched earlier in the hasPreviousClaims block
      // claimRow is scoped inside the try block above, so we re-fetch it here safely
      let _kingaRef: string | null = null;
      try {
        const { getDb: _gdb2 } = await import('../db');
        const { claims: _ct2 } = await import('../../drizzle/schema');
        const { eq: _eq2 } = await import('drizzle-orm');
        const _db2 = await _gdb2();
        if (_db2) {
          const [_kr] = await _db2.select({ kingaRef: _ct2.kingaRef }).from(_ct2).where(_eq2(_ct2.id, input.claimId)).limit(1);
          _kingaRef = _kr?.kingaRef ?? null;
        }
      } catch { /* non-fatal */ }
      // Parse Claim Truth Layer from DB (unified resolution of all extraction/decision data)
      let _claimTruth: any = null;
      try {
        const ctRaw = (assessment as any).claimTruthJson;
        _claimTruth = ctRaw ? (typeof ctRaw === 'string' ? JSON.parse(ctRaw) : ctRaw) : null;
      } catch { /* non-fatal */ }
      // Parse Canonical Claim Truth Object (CTO) from DB — TRE output
      let _claimTruthObject: any = null;
      try {
        const ctoRaw = (assessment as any).claimTruthObjectJson;
        _claimTruthObject = ctoRaw ? (typeof ctoRaw === 'string' ? JSON.parse(ctoRaw) : ctoRaw) : null;
      } catch { /* non-fatal */ }
      const rawResponse = {
        ...result,
        costExtraction,
        weightedFraud,
        _phase2: phase2,
        claimId: input.claimId,
        kingaRef: _kingaRef,
        _claimTruth,
        _claimTruthObject,
        _photoForensics: photoForensicsData,
        // Expose damageZones at top level so ForensicAuditReport Section2 VehicleDamageMap can read it
        // (IntelligenceEnforcementResult.directionFlag does NOT include damageZones — it only has mismatch/explanation)
        damageZones,
        // Physics values from bridge (actual Stage7 output) — used by report Section 2
        // These are the authoritative values; physicsEstimate is only populated when Stage7 didn't run
        _physics: (() => {
          // Parse the full physicsAnalysis JSON once so all sub-fields are available
          let physicsJson: any = null;
          try {
            const pa = (assessment as any).physicsAnalysis;
            physicsJson = pa ? (typeof pa === 'string' ? JSON.parse(pa) : pa) : null;
          } catch { /* non-fatal */ }
          return {
            deltaVKmh: Number(deltaVKmh) || 0,
            impactForceKn: Number(impactForceKn) || 0,
            energyKj: Number(energyKj) || 0,
            vehicleMassKg: Number(vehicleMassKg) || 0,
            estimatedSpeedKmh: Number(estimatedSpeedKmh) || 0,
            speedInferenceEnsemble: bridge.speedInferenceEnsemble ?? null,
            // Dual-speed forensics: claimed vs physics-inferred speed comparison
            speedForensics: physicsJson?.speedForensics ?? null,
            // Extended physics fields — stored in physicsAnalysis JSON but previously not exposed
            severityConsensus: physicsJson?.severityConsensus ?? null,
            damagePatternValidation: physicsJson?.damagePatternValidation ?? null,
            latentDamageProbability: physicsJson?.latentDamageProbability ?? null,
            velocityRange: physicsJson?.velocityRange ?? null,
            physicsNumerical: physicsJson?.physicsNumerical ?? null,
            impactVector: physicsJson?.impactVector ?? null,
            energyDistribution: physicsJson?.energyDistribution ?? null,
            decelerationG: physicsJson?.decelerationG ?? null,
            reconstructionSummary: physicsJson?.reconstructionSummary ?? null,
            damageConsistencyScore: physicsJson?.damageConsistencyScore ?? null,
            accidentSeverity: physicsJson?.accidentSeverity ?? null,
            // Physics execution status — EXECUTED / SKIPPED_NON_PHYSICAL / SKIPPED_NO_SPEED / ESTIMATED_FALLBACK
            physicsStatus: physicsJson?.physicsStatus ?? null,
            // Animal strike physics engine output (Section 2.1 animal strike block)
            animalStrikePhysics: physicsJson?.animalStrikePhysics ?? null,
            // Causal plausibility score (0–100)
            causalPlausibility: physicsJson?.causalPlausibility ?? null,
            // P6: Stage 6 image source reliability — HIGH/MEDIUM/LOW/NONE
            // LOW or NONE means imageIntelligence fallback fired; crush depths were excluded from physics consensus
            visionSourceReliability: (() => {
              // P6: visionSourceReliability is stored inside physics_analysis JSON
              // (alongside the ensemble it gates). The old code read damageAnalysisJson
              // which does not exist as a DB column — fixed to read physicsJson.
              return physicsJson?.visionSourceReliability ?? 'NONE';
            })(),
          };
        })(),
        // Override photosDetected with numeric count so ForensicAuditReport renders correctly
        photosDetected: photosDetectedCount > 0 ? photosDetectedCount : (bridge.photosDetected ? phase2PhotoUrls.length : 0),
        photosProcessedCount: photosProcessedCount > 0 ? photosProcessedCount : phase2PhotoUrls.length,
        // Expose enrichedPhotosJson from DB so Section 4 can render per-photo vision metadata.
        // The `result` spread above comes from IntelligenceEnforcementResult which does NOT
        // include DB columns — we must explicitly pull this from the `assessment` row.
        enrichedPhotosJson: (assessment as any).enrichedPhotosJson ?? null,
        // Also expose damagePhotosJson as fallback for photo URL resolution
        damagePhotosJson: (assessment as any).damagePhotosJson ?? null,
        // Expose pipeline run summary for frontend stage progress display
        // pipelineRunSummary is a DB column not in IntelligenceEnforcementResult
        pipelineRunSummary: (assessment as any).pipelineRunSummary ?? null,
        // Expose raw photo counts for frontend issue detection
        imageAnalysisTotalCount: photosDetectedCount,
        imageAnalysisSuccessCount: photosProcessedCount,
        // Expose degraded stages list for quick issue surfacing
        pipelineDegradedStagesJson: (assessment as any).pipelineDegradedStagesJson ?? null,
        // R-F-01/04/05 fix: parsed report signals — blockAutoApproval, prePublicationBlockers, costRecommendation
        _reportSignals: (() => {
          try {
            if ((assessment as any).reportSignalsJson) {
              return JSON.parse((assessment as any).reportSignalsJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // R-GH-17 (Batch 2e): add fields present in byClaim but missing from getEnforcement
        // Stage 36: Forensic Audit Validator — 10-dimension post-pipeline validation report
        _forensicAuditValidation: (() => {
          try {
            if ((assessment as any).forensicAuditValidationJson) {
              return JSON.parse((assessment as any).forensicAuditValidationJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Stage 12.5: Report Readiness Gate — whether the claim can be exported as a report
        _reportReadiness: (() => {
          try {
            if ((assessment as any).reportReadinessJson) {
              return JSON.parse((assessment as any).reportReadinessJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Batch 2c: decisionReadiness and degradationReasons from Stage 10
        decisionReadiness: (() => {
          try {
            if ((assessment as any).decisionReadinessJson) {
              return JSON.parse((assessment as any).decisionReadinessJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        degradationReasons: (() => {
          try {
            if ((assessment as any).degradationReasonsJson) {
              return JSON.parse((assessment as any).degradationReasonsJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Batch 2d: Stage 4 fieldValidation and gateDecision
        fieldValidation: (() => {
          try {
            if ((assessment as any).fieldValidationJson) {
              return JSON.parse((assessment as any).fieldValidationJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        gateDecision: (() => {
          try {
            if ((assessment as any).gateDecisionJson) {
              return JSON.parse((assessment as any).gateDecisionJson as string);
            }
          } catch { /* non-fatal */ }
          return null;
        })(),
        // Impossibility Detection Engine output — all logical/temporal/physical impossibilities
        // detected for this claim. Empty array = no impossibilities found.
        _impossibilityFlags: impossibilityFlags,
        _impossibilityPoints: impossibilityPoints,
        _impossibilityNote: impossibilityNote,
      };
      // Stage 27 pass 1: field contract validation (critical fields, alias mapping, fallbacks)
      // Wrapped in try-catch: validation warnings are logged server-side but never block the UI.
      // A TRPCError here causes the frontend to show "Run KINGA Assessment" for completed claims.
      let contractValidated: typeof rawResponse;
      try {
        contractValidated = validateAiAssessmentResponse(rawResponse as Record<string, unknown>, input.claimId) as typeof rawResponse;
      } catch (validationErr: any) {
        console.warn(`[getEnforcement] Stage 27 validation warning for claim ${input.claimId} (non-fatal): ${validationErr?.message ?? validationErr}`);
        contractValidated = rawResponse as typeof rawResponse;
      }
      // Stage 27 pass 2: numeric integrity, contradiction detection, NaN/Infinity clamping
      const integrityResult = validateClaimAnalysisResponse(contractValidated, `aiAssessments.byClaim(${input.claimId})`);
      return (integrityResult.passed ? integrityResult.data : contractValidated) as typeof rawResponse;
    }),

  // Save an immutable Decision Snapshot — called once per decision render
  saveSnapshot: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      verdict: z.object({
        decision: z.string(),
        primaryReason: z.string(),
        confidence: z.number(),
      }),
      cost: z.object({
        aiEstimate: z.number(),
        quoted: z.number(),
        deviationPercent: z.number(),
        fairRangeMin: z.number(),
        fairRangeMax: z.number(),
        verdict: z.string(),
      }),
      fraud: z.object({
        score: z.number(),
        level: z.string(),
        contributions: z.array(z.object({ factor: z.string(), value: z.number() })),
      }),
      physics: z.object({
        deltaV: z.number(),
        velocityRange: z.string(),
        energyKj: z.number(),
        forceKn: z.number(),
        estimated: z.boolean(),
      }),
      damage: z.object({
        zones: z.array(z.string()),
        severity: z.string(),
        consistencyScore: z.number(),
      }),
      enforcementTrace: z.array(z.object({
        rule: z.string(),
        value: z.unknown(),
        threshold: z.string(),
        triggered: z.boolean(),
      })),
      confidenceBreakdown: z.array(z.object({
        factor: z.string(),
        penalty: z.number(),
      })),
      dataQuality: z.object({
        missingFields: z.array(z.string()),
        estimatedFields: z.array(z.string()),
        extractionConfidence: z.number(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const { saveDecisionSnapshot } = await import('../db');
      const { getOrCreateLifecycle } = await import('../decision-lifecycle');
      const { tenantId } = await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      const result = await saveDecisionSnapshot({
        ...input,
        tenantId,
        createdByUserId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
      });
      // Ensure lifecycle record exists (creates DRAFT if new)
      const lifecycle = await getOrCreateLifecycle(input.claimId, tenantId);
      return {
        success: true,
        snapshotId: result.id,
        version: result.version,
        lifecycle_state: lifecycle.lifecycle_state,
        is_final: lifecycle.is_final,
        is_locked: lifecycle.is_locked,
      };
    }),

  // Get the latest spec-compliant snapshot JSON for a claim (verbatim snake_case, no nulls)
  getLatestSnapshot: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { getLatestSnapshotJson } = await import('../db');
      await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      const snapshot = await getLatestSnapshotJson(input.claimId);
      return snapshot ?? null;
    }),

  // Re-run current engine logic against an original snapshot and return a structured diff
  replayDecision: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      snapshotVersion: z.number().optional(), // defaults to latest
      // Optional live claim data to supplement snapshot fields
      liveData: z.object({
        damageComponents: z.array(z.string()).optional(),
        impactDirection: z.string().optional(),
        vehicleMake: z.string().optional(),
        vehicleMassKg: z.number().optional(),
        hasPreviousClaims: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getLatestSnapshotJson } = await import('../db');
      const { replayDecision } = await import('../decision-replay');
      const { getOrCreateLifecycle, isReplayAllowed, saveReplayLog } = await import('../decision-lifecycle');
      const { tenantId } = await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);

      // Fetch the original immutable snapshot
      const originalSnapshot = await getLatestSnapshotJson(input.claimId);
      if (!originalSnapshot) {
        throw new Error(`No snapshot found for claim ${input.claimId}`);
      }

      // LIFECYCLE GUARD: replay is blocked when state = LOCKED
      const lifecycle = await getOrCreateLifecycle(input.claimId, tenantId);
      if (!isReplayAllowed(lifecycle.lifecycle_state)) {
        throw new Error(
          `Replay blocked: claim ${input.claimId} is LOCKED. ` +
          `A LOCKED claim is an immutable legal record and cannot be replayed.`
        );
      }

      // Re-run current logic — original snapshot is NEVER modified
      const result = replayDecision(originalSnapshot, input.liveData);

      // Persist replay result to replay_logs (never overwrites original snapshot)
      await saveReplayLog({
        claimId: input.claimId,
        tenantId,
        originalSnapshotVersion: originalSnapshot.snapshot_version,
        originalVerdict: result.original_verdict,
        newVerdict: result.new_verdict,
        changed: result.changed,
        differences: result.differences,
        impactAnalysis: result.impact_analysis,
        replayResult: result,
        replayedByUserId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
        lifecycleStateAtReplay: lifecycle.lifecycle_state,
      });

      return {
        ...result,
        lifecycle_state: lifecycle.lifecycle_state,
        is_final: lifecycle.is_final,
        is_locked: lifecycle.is_locked,
      };
    }),

  // ─── Lifecycle procedures ──────────────────────────────────────────────────

  // Get the current lifecycle state for a claim
  getLifecycle: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { getOrCreateLifecycle } = await import('../decision-lifecycle');
      const { tenantId } = await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      return getOrCreateLifecycle(input.claimId, tenantId);
    }),

  // Mark the decision as REVIEWED (user has viewed/reviewed the decision)
  markReviewed: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      reason: z.string().min(10, 'Reason must be at least 10 characters'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { transitionLifecycle } = await import('../decision-lifecycle');
      const { enforceGovernance } = await import('../decision-governance');
      const { tenantId } = await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);

      // Rule 1 + Rule 5: validate reason and write audit entry
      const governance = await enforceGovernance({
        claimId: input.claimId,
        tenantId,
        action: 'REVIEWED',
        performedBy: String(ctx.user?.id ?? 'unknown'),
        performedByName: ctx.user?.name ?? undefined,
        reason: input.reason,
      });
      if (!governance.action_allowed) {
        return {
          success: false,
          lifecycle_state: 'DRAFT' as const,
          is_final: false,
          is_locked: false,
          action_allowed: false,
          validation_errors: governance.validation_errors,
          override_flag: false,
        };
      }

      const result = await transitionLifecycle(input.claimId, tenantId, 'REVIEWED', {
        userId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
      });
      if (!result.success) throw new Error(result.error);
      return {
        ...result,
        action_allowed: true,
        validation_errors: [] as string[],
        override_flag: false,
      };
    }),

  // Finalise the decision — creates authoritative snapshot, sets state = FINALISED
  finaliseDecision: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      finalDecisionChoice: z.enum(['FINALISE_CLAIM', 'REVIEW_REQUIRED', 'ESCALATE_INVESTIGATION']),
      reason: z.string().min(10, 'Reason must be at least 10 characters'),
      // Optional: AI decision for override detection
      aiDecision: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { transitionLifecycle, markAuthoritativeSnapshot } = await import('../decision-lifecycle');
      const { getDecisionSnapshots } = await import('../db');
      const { enforceGovernance } = await import('../decision-governance');
      const { tenantId } = await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);

      // Rule 1 + Rule 2 + Rule 5: validate, detect override, write audit
      const governance = await enforceGovernance({
        claimId: input.claimId,
        tenantId,
        action: 'FINALISED',
        performedBy: String(ctx.user?.id ?? 'unknown'),
        performedByName: ctx.user?.name ?? undefined,
        reason: input.reason,
        aiDecision: input.aiDecision,
        humanDecision: input.finalDecisionChoice,
        metadata: { finalDecisionChoice: input.finalDecisionChoice },
      });
      if (!governance.action_allowed) {
        return {
          success: false,
          lifecycle_state: 'DRAFT' as const,
          is_final: false,
          is_locked: false,
          action_allowed: false,
          validation_errors: governance.validation_errors,
          override_flag: governance.override_flag,
          authoritative_snapshot_id: null as number | null,
          final_decision_choice: input.finalDecisionChoice,
        };
      }

      // Get the latest snapshot ID to mark as authoritative
      const snapshots = await getDecisionSnapshots(input.claimId);
      const latestSnapshot = snapshots[0]; // ordered by createdAt desc
      if (!latestSnapshot) {
        throw new Error(`No snapshot found for claim ${input.claimId}. Cannot finalise without a snapshot.`);
      }

      // Transition to FINALISED
      const result = await transitionLifecycle(input.claimId, tenantId, 'FINALISED', {
        userId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
        finalDecisionChoice: input.finalDecisionChoice,
        authoritativeSnapshotId: latestSnapshot.id,
      });
      if (!result.success) throw new Error(result.error);

      // Mark the snapshot as the authoritative final record
      await markAuthoritativeSnapshot(latestSnapshot.id);

      return {
        ...result,
        action_allowed: true,
        validation_errors: [] as string[],
        override_flag: governance.override_flag,
        override: governance.override,
        authoritative_snapshot_id: latestSnapshot.id,
        final_decision_choice: input.finalDecisionChoice,
      };
    }),

  // Lock the claim — immutable legal record, no further replays or recalculations
  lockDecision: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      reason: z.string().min(10, 'Reason must be at least 10 characters'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { transitionLifecycle } = await import('../decision-lifecycle');
      const { enforceGovernance } = await import('../decision-governance');
      const { tenantId } = await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);

      // Rule 1 + Rule 3 + Rule 5: validate reason, verify lock conditions, write audit
      const governance = await enforceGovernance({
        claimId: input.claimId,
        tenantId,
        action: 'LOCKED',
        performedBy: String(ctx.user?.id ?? 'unknown'),
        performedByName: ctx.user?.name ?? undefined,
        reason: input.reason,
      });
      if (!governance.action_allowed) {
        return {
          success: false,
          lifecycle_state: 'FINALISED' as const,
          is_final: true,
          is_locked: false,
          action_allowed: false,
          validation_errors: governance.validation_errors,
          override_flag: false,
        };
      }

      const result = await transitionLifecycle(input.claimId, tenantId, 'LOCKED', {
        userId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
      });
      if (!result.success) throw new Error(result.error);
      return {
        ...result,
        action_allowed: true,
        validation_errors: [] as string[],
        override_flag: false,
      };
    }),

  // Get governance audit log for a claim
  getAuditLog: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { getAuditLog } = await import('../decision-governance');
      await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      return getAuditLog(input.claimId);
    }),

  // Generate full tamper-evident audit export for a claim
  getAuditExport: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { generateAuditExport, validateAuditExport, AuditExportBlockedError } = await import('../audit-export');
      await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      try {
        const result = await generateAuditExport(input.claimId);
        return { export_allowed: true as const, reason: 'All checks passed', checks: [], data: result };
      } catch (err) {
        if (err instanceof AuditExportBlockedError) {
          // Return spec-compliant blocked response — do NOT throw a TRPCError
          // so the frontend can read the structured validation details.
          return {
            export_allowed: false as const,
            reason: 'Missing or inconsistent audit data',
            checks: err.checks,
            data: null,
          };
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Audit export failed',
        });
      }
    }),

  // Validate export preconditions without generating the export
  validateAuditExport: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { validateAuditExport } = await import('../audit-export');
      await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      return validateAuditExport(input.claimId);
    }),

  // ─── Shadow Override Monitor (passive observation only) ─────────────────

  // Run a full shadow scan across all users who have ever overridden
  runShadowScan: protectedProcedure
    .mutation(async () => {
      const { runFullShadowScan } = await import('../shadow-override-monitor');
      // Shadow mode: no blocking, no escalation, no user notification
      return runFullShadowScan();
    }),

  // Get the latest stored observation for a specific user
  getShadowObservation: superAdminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const { getLatestObservation } = await import('../shadow-override-monitor');
      return getLatestObservation(input.userId);
    }),

  // Get all stored shadow observations (latest per user)
  getAllShadowObservations: superAdminProcedure
    .query(async () => {
      const { getAllObservations } = await import('../shadow-override-monitor');
      return getAllObservations();
    }),

  // ─── Shadow Monitoring Reports (platform-wide, observation only) ─────────
  // These reports aggregate governance and observation rows across tenants.
  // They are platform-super-admin-only until a separately approved tenant
  // scoped product contract is implemented. Never substitute client role input
  // for session authority here.

  // Generate a shadow monitoring report for a specific role
  generateShadowReport: superAdminProcedure
    .input(z.object({
      role: z.enum(["claims_manager", "risk_manager", "executive"]),
      periodDays: z.number().int().min(1).max(90).default(7),
    }))
    .mutation(async ({ input }) => {
      const { generateShadowReport } = await import('../shadow-report-generator');
      return generateShadowReport(input.role, input.periodDays);
    }),

  // Generate all three role reports in a single call
  generateAllShadowReports: superAdminProcedure
    .input(z.object({
      periodDays: z.number().int().min(1).max(90).default(7),
    }))
    .mutation(async ({ input }) => {
      const { generateAllShadowReports } = await import('../shadow-report-generator');
      return generateAllShadowReports(input.periodDays);
    }),

  // Get replay logs for a claim
  getReplayLogs: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { getReplayLogs } = await import('../decision-lifecycle');
      await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      return getReplayLogs(input.claimId);
    }),

  // ─── Output Validation Engine (10-Rule Spec) ────────────────────────────
  // Runs all 10 output validation rules on a stored assessment before UI render.
  // Returns: { status, corrections, suppressed_fields, flags, final_output, notes }
  validate: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const { runOutputValidation } = await import('../output-validation-engine');
      const { getAiAssessmentByClaimId, getQuotesByClaimId } = await import('../db');
      const tenantId = ctx.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'A tenant-scoped session is required' });
      }
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) return null;
      // Parse cost intelligence JSON
      let costIntel: any = null;
      try {
        costIntel = assessment.costIntelligenceJson
          ? (typeof assessment.costIntelligenceJson === 'string'
              ? JSON.parse(assessment.costIntelligenceJson)
              : assessment.costIntelligenceJson)
          : null;
      } catch { /* ignore */ }
      // Parse physics analysis JSON
      let physicsRaw: any = null;
      try {
        physicsRaw = assessment.physicsAnalysis
          ? (typeof assessment.physicsAnalysis === 'string'
              ? JSON.parse(assessment.physicsAnalysis)
              : assessment.physicsAnalysis)
          : null;
      } catch { /* ignore */ }
      // Parse damaged components
      let damagedComponents: string[] = [];
      try {
        const comps = assessment.damagedComponentsJson
          ? (typeof assessment.damagedComponentsJson === 'string'
              ? JSON.parse(assessment.damagedComponentsJson)
              : assessment.damagedComponentsJson)
          : [];
        damagedComponents = Array.isArray(comps)
          ? comps.map((c: any) => (typeof c === 'string' ? c : c?.name || c?.component || '')).filter(Boolean)
          : [];
      } catch { /* ignore */ }
      // Parse image URLs
      let imageUrls: string[] = [];
      try {
        const imgs = (assessment as any).imageUrls
          ? (typeof (assessment as any).imageUrls === 'string'
              ? JSON.parse((assessment as any).imageUrls)
              : (assessment as any).imageUrls)
          : [];
        imageUrls = Array.isArray(imgs) ? imgs.filter(Boolean) : [];
      } catch { /* ignore */ }
      // Determine if physics model actually ran (has non-zero speed or force)
      const physicsExecuted = !!(physicsRaw &&
        (physicsRaw.estimatedSpeedKmh > 0 || physicsRaw.impactForceKn > 0 || physicsRaw.deltaVKmh > 0));
      const impactSpeedKmh = physicsRaw?.estimatedSpeedKmh ?? physicsRaw?.estimatedSpeed?.value ?? null;
      const impactForceKn = physicsRaw?.impactForceKn ?? null;
      const severityClassification = physicsRaw?.accidentSeverity ?? assessment.structuralDamageSeverity ?? null;
      const hasVectors = !!(physicsRaw?.impactVector?.direction && physicsRaw?.impactVector?.direction !== 'unknown');
      // Image processing ran if damagedComponents were extracted
      const imageProcessingRan = damagedComponents.length > 0;
      // AI estimate in USD (stored as dollars)
      const aiEstimateUsd = assessment.estimatedCost ? Number(assessment.estimatedCost) : null;
      // Cost intel fields
      const documentedOriginalQuoteUsd = costIntel?.documentedOriginalQuoteUsd ?? null;
      const documentedAgreedCostUsd = costIntel?.documentedAgreedCostUsd ?? null;
      const panelBeaterFromCostIntel = costIntel?.panelBeaterName ?? null;
      return runOutputValidation({
        claimId: input.claimId,
        claimNumber: assessment.claimNumber ?? null,
        rawVerdict: assessment.recommendation ?? null,
        confidenceScore: assessment.confidenceScore ?? 0,
        fraudScore: assessment.fraudScore ?? 0,
        fraudLevel: assessment.fraudRiskLevel ?? null,
        aiEstimateUsd,
        documentedOriginalQuoteUsd,
        documentedAgreedCostUsd,
        costBasis: (assessment as any).costBasis ?? null,
        panelBeaterFromCostIntel,
        panelBeaterFromAssessor: (assessment as any).panelBeaterName ?? null,
        repairerName: (assessment as any).repairerName ?? null,
        accidentDescription: assessment.accidentDescription ?? null,
        imageUrls,
        imageProcessingRan,
        damagedComponents,
        physicsExecuted,
        impactSpeedKmh: impactSpeedKmh ? Number(impactSpeedKmh) : null,
        impactForceKn: impactForceKn ? Number(impactForceKn) : null,
        severityClassification,
        hasVectors,
        accidentType: (assessment as any).accidentType ?? null,
        structuralDamage: !!((assessment as any).structuralDamage),
        vehicleMake: assessment.vehicleMake ?? null,
        vehicleModel: assessment.vehicleModel ?? null,
        vehicleYear: assessment.vehicleYear ? Number(assessment.vehicleYear) : null,
        vehicleRegistration: assessment.vehicleRegistration ?? null,
        accidentDate: assessment.accidentDate ?? null,
        accidentLocation: assessment.accidentLocation ?? null,
      });
    }),
  // Retrieve all snapshots for a claim (audit history)
  getSnapshots: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { getDecisionSnapshots } = await import('../db');
      await requireGovernedTenantClaim(input.claimId, ctx.user?.tenantId);
      const snapshots = await getDecisionSnapshots(input.claimId);
      return snapshots.map(s => ({
        id: s.id,
        version: s.snapshotVersion,
        createdAt: s.createdAt,
        createdByUserId: s.createdByUserId,
        verdict: {
          decision: s.verdictDecision,
          primaryReason: s.verdictPrimaryReason,
          confidence: s.verdictConfidence,
        },
        cost: {
          aiEstimate: s.costAiEstimate,
          quoted: s.costQuoted,
          deviationPercent: s.costDeviationPercent,
          fairRangeMin: s.costFairRangeMin,
          fairRangeMax: s.costFairRangeMax,
          verdict: s.costVerdict,
        },
        fraud: {
          score: s.fraudScore,
          level: s.fraudLevel,
          contributions: JSON.parse(s.fraudContributionsJson || '[]'),
        },
        physics: {
          deltaV: s.physicsDetlaV / 10,
          velocityRange: s.physicsVelocityRange,
          energyKj: s.physicsEnergyKj,
          forceKn: s.physicsForceKn,
          estimated: s.physicsEstimated === 1,
        },
        damage: {
          zones: JSON.parse(s.damageZonesJson || '[]'),
          severity: s.damageSeverity,
          consistencyScore: s.damageConsistencyScore,
        },
        enforcementTrace: JSON.parse(s.enforcementTraceJson || '[]'),
        confidenceBreakdown: JSON.parse(s.confidenceBreakdownJson || '[]'),
        dataQuality: {
          missingFields: JSON.parse(s.missingFieldsJson || '[]'),
          estimatedFields: JSON.parse(s.estimatedFieldsJson || '[]'),
          extractionConfidence: s.extractionConfidence,
        },
      }));
    }),
  // ─── Push Report to Role ─────────────────────────────────────────────────
  // Shares a completed assessment report with a specific insurer role.
  // All users with that role will receive a notification and the report will
  // appear in their Reports Centre under "Shared with Me".
  pushReportToRole: protectedProcedure
    .input(z.object({
      claimId: z.number().int(),
      targetRole: z.enum([
        "claims_processor",
        "assessor_internal",
        "risk_manager",
        "claims_manager",
        "executive",
        "underwriter",
        "insurer_admin",
      ]),
      message: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const { getDb, getAiAssessmentByClaimId, createNotification } = await import("../db");
      const { getUsersByInsurerRoles: _getByRoles } = await import("../db");
      const { aiAssessments: aiAssessmentsTable } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { claims: claimsTable } = await import("../../drizzle/schema");
      const { tenantId } = await requireGovernedTenantClaim(String(input.claimId), ctx.user.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Fetch the assessment to get its ID and verify it exists
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found for this claim" });

      // Fetch claim details for the notification
      const [claimRow] = await db.select({ claimNumber: claimsTable.claimNumber, vehicleMake: claimsTable.vehicleMake, vehicleModel: claimsTable.vehicleModel })
        .from(claimsTable)
        .where(and(eq(claimsTable.id, input.claimId), eq(claimsTable.tenantId, tenantId)))
        .limit(1);

      // Update sharedWithRolesJson — append the new role if not already present
      let currentRoles: string[] = [];
      try {
        const raw = (assessment as any).sharedWithRolesJson;
        currentRoles = raw ? JSON.parse(raw) : [];
      } catch { /* ignore */ }
      if (!currentRoles.includes(input.targetRole)) {
        currentRoles.push(input.targetRole);
        await db.update(aiAssessmentsTable)
          .set({ sharedWithRolesJson: JSON.stringify(currentRoles) } as any)
          .where(and(eq(aiAssessmentsTable.id, assessment.id), eq(aiAssessmentsTable.tenantId, tenantId)));
      }

      // Notify all users with the target role
      const targetUsers = (await _getByRoles([input.targetRole])).filter((user) => user.tenantId === tenantId);
      const actorName = (ctx.user as any).name ?? "A colleague";
      const claimRef = claimRow?.claimNumber ?? `Claim #${input.claimId}`;
      const vehicleLabel = [claimRow?.vehicleMake, claimRow?.vehicleModel].filter(Boolean).join(" ") || "";
      const customMsg = input.message ? ` — "${input.message}"` : "";
      for (const targetUser of targetUsers) {
        if (targetUser.id) {
          await createNotification({
            userId: targetUser.id,
            tenantId,
            title: `Report Shared: ${claimRef}`,
            message: `${actorName} has shared the assessment report for ${claimRef}${vehicleLabel ? ` (${vehicleLabel})` : ""} with your role${customMsg}. View it in your Reports Centre.`,
            type: "system_alert",
            claimId: input.claimId,
            entityType: "claim",
            entityId: input.claimId,
            actionUrl: `/insurer-portal/comparison/${input.claimId}`,
            priority: "medium",
          });
        }
      }

      return {
        success: true,
        sharedWithRoles: currentRoles,
        notifiedCount: targetUsers.length,
        message: `Report shared with ${targetUsers.length} user${targetUsers.length !== 1 ? "s" : ""} in the "${input.targetRole.replace(/_/g, " ")}" role.`,
      };
    }),
  // Get which roles a report has been shared with
  getSharedRoles: protectedProcedure
    .input(z.object({ claimId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const { getAiAssessmentByClaimId } = await import("../db");
      const { tenantId } = await requireGovernedTenantClaim(String(input.claimId), ctx.user.tenantId);
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) return { sharedWithRoles: [] as string[] };
      let roles: string[] = [];
      try {
        const raw = (assessment as any).sharedWithRolesJson;
        roles = raw ? JSON.parse(raw) : [];
      } catch { /* ignore */ }
      return { sharedWithRoles: roles };
    }),
  // Get all claims whose report has been shared with the current user's insurerRole
  getSharedWithMe: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const insurerRole = (ctx.user as any).insurerRole as string | null;
    if (!insurerRole) return { claims: [] as any[] };
    const tenantId = ctx.user.tenantId;
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
    const { getDb: _getDb } = await import("../db");
    const db2 = await _getDb();
    if (!db2) return { claims: [] as any[] };
    const { aiAssessments: aiAssessmentsTable2 } = await import("../../drizzle/schema");
    const { claims: claimsTable2 } = await import("../../drizzle/schema");
    const { eq: eq2, and: and2, isNotNull: isNotNull2 } = await import("drizzle-orm");
    const rows2 = await db2
      .select({
        assessmentId: aiAssessmentsTable2.id,
        claimId: aiAssessmentsTable2.claimId,
        sharedWithRolesJson: (aiAssessmentsTable2 as any).sharedWithRolesJson,
        fraudScore: aiAssessmentsTable2.fraudScore,
        overallRisk: (aiAssessmentsTable2 as any).overallRisk,
        createdAt: aiAssessmentsTable2.createdAt,
        claimNumber: claimsTable2.claimNumber,
        vehicleMake: claimsTable2.vehicleMake,
        vehicleModel: claimsTable2.vehicleModel,
        vehicleYear: claimsTable2.vehicleYear,
        claimStatus: claimsTable2.status,
        incidentDate: claimsTable2.incidentDate,
      })
      .from(aiAssessmentsTable2)
      .innerJoin(claimsTable2, eq2(aiAssessmentsTable2.claimId, claimsTable2.id))
      .where(and2(
        isNotNull2((aiAssessmentsTable2 as any).sharedWithRolesJson),
        eq2(claimsTable2.tenantId, tenantId)
      ))
      .orderBy(aiAssessmentsTable2.createdAt);
    const filtered2 = rows2.filter((row: any) => {
      try {
        const roles2: string[] = JSON.parse((row as any).sharedWithRolesJson ?? "[]");
        return roles2.includes(insurerRole);
      } catch { return false; }
    });
    return {
      claims: filtered2.map((row: any) => ({
        assessmentId: row.assessmentId,
        claimId: row.claimId,
        claimNumber: row.claimNumber,
        vehicleMake: row.vehicleMake,
        vehicleModel: row.vehicleModel,
        vehicleYear: row.vehicleYear,
        claimStatus: row.claimStatus,
        incidentDate: row.incidentDate,
        fraudScore: row.fraudScore,
        overallRisk: row.overallRisk,
        createdAt: row.createdAt,
      })),
    };
  }),

  // ─── Resolve PDF fragment URLs → renderable PNG URLs ─────────────────────
  // The pipeline stores PDF fragment URLs (e.g. ...pdf#page=12) in enrichedPhotosJson
  // when using pdf_single_pass_vision mode. These cannot be rendered by <img> tags.
  // This procedure renders the referenced pages to PNG, uploads to S3, and returns
  // fresh PNG URLs. Results are also written back to enrichedPhotosJson so subsequent
  // loads skip this step.
  resolvePdfPhotoUrls: protectedProcedure
    .input(z.object({
      claimId: z.number().int(),
      photos: z.array(z.object({
        index: z.number().int(),
        url: z.string(),
        pageNumber: z.number().int().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const { getDb: _getDb2, getAiAssessmentByClaimId: _getAssessment } = await import("../db");
      const { aiAssessments: _aiAssessmentsTable } = await import("../../drizzle/schema");
      const { eq: _eq } = await import("drizzle-orm");
      const { tenantId: _tenantId } = await requireGovernedTenantClaim(String(input.claimId), ctx.user.tenantId);
      const _db = await _getDb2();
      if (!_db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Separate PDF fragment URLs from already-renderable URLs
      const _pdfFragmentPattern = /\.pdf#page=(\d+)$/i;
      const _toRender = input.photos.filter(p => _pdfFragmentPattern.test(p.url));

      if (_toRender.length === 0) {
        return { resolved: input.photos.map(p => ({ index: p.index, url: p.url, resolved: false })) };
      }

      // Group by base PDF URL to minimise downloads
      const _byPdf = new Map<string, Array<{ index: number; pageNumber: number }>>();
      for (const p of _toRender) {
        const _match = p.url.match(/^(.+\.pdf)#page=(\d+)$/i);
        if (!_match) continue;
        const [, _basePdfUrl, _pageStr] = _match;
        const _pageNum = p.pageNumber ?? parseInt(_pageStr, 10);
        if (!_byPdf.has(_basePdfUrl)) _byPdf.set(_basePdfUrl, []);
        _byPdf.get(_basePdfUrl)!.push({ index: p.index, pageNumber: _pageNum });
      }

      const _resolvedMap = new Map<number, string>(); // index → PNG URL

      for (const [_basePdfUrl, _pages] of _byPdf.entries()) {
        try {
          const { storageGet: _storageGet } = await import("../storage");
          let _pdfDownloadUrl = _basePdfUrl;
          try {
            const _urlObj = new URL(_basePdfUrl);
            const _s3Key = _urlObj.pathname.slice(1);
            const { url: _presigned } = await _storageGet(_s3Key);
            _pdfDownloadUrl = _presigned;
          } catch {
            _pdfDownloadUrl = _basePdfUrl;
          }

          const _pageNumbers = _pages.map(p => p.pageNumber);
          const { renderSpecificPdfPages: _renderPages } = await import("../pipeline-v2/pdfToImages");
          const _rendered = await _renderPages(
            _pdfDownloadUrl,
            _pageNumbers,
            {
              dpi: 100,
              keyPrefix: `claims/${input.claimId}/report-photos`,
              log: (msg: string) => logger.info('resolvePdfPhotoUrls', msg, { claimId: String(input.claimId) }),
            } as any
          );

          for (const _p of _pages) {
            const _page = _rendered.get(_p.pageNumber);
            if (_page?.url) {
              _resolvedMap.set(_p.index, _page.url);
            }
          }
        } catch (_err: any) {
          console.error(`[resolvePdfPhotoUrls] Claim ${input.claimId}: Failed to render PDF ${_basePdfUrl}: ${_err.message}`);
        }
      }

      // Build resolved array
      const _resolved = input.photos.map(p => ({
        index: p.index,
        url: _resolvedMap.get(p.index) ?? p.url,
        resolved: _resolvedMap.has(p.index),
      }));

      // Write resolved PNG URLs back to enrichedPhotosJson in DB
      if (_resolvedMap.size > 0) {
        try {
          const _assessment = await _getAssessment(input.claimId, _tenantId);
          if (_assessment) {
            let _enriched: any[] = [];
            try {
              const _raw = (_assessment as any).enrichedPhotosJson;
              _enriched = _raw ? (typeof _raw === 'string' ? JSON.parse(_raw) : _raw) : [];
            } catch { _enriched = []; }
            for (const [_idx, _pngUrl] of _resolvedMap.entries()) {
              const _entry = _enriched.find((e: any) => e.index === _idx);
              if (_entry) _entry.url = _pngUrl;
              else if (_enriched[_idx]) _enriched[_idx].url = _pngUrl;
            }
            await _db.update(_aiAssessmentsTable)
              .set({ enrichedPhotosJson: JSON.stringify(_enriched) } as any)
              .where(_eq(_aiAssessmentsTable.claimId, input.claimId));
          }
        } catch (_writeErr: any) {
          console.warn(`[resolvePdfPhotoUrls] Claim ${input.claimId}: Failed to write back resolved URLs (non-fatal): ${_writeErr.message}`);
        }
      }

      return { resolved: _resolved };
    }),
});
