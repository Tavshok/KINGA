/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRE v3.0 GOVERNANCE ROUTER
 * Enhancement E6: Machine-Readable Truth API
 * Enhancement E10: Truth Governance Dashboard Backend
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { claims, aiAssessments } from "../../drizzle/schema";

// TRE v3.0 module imports
import { evaluateTruthRules, BUILT_IN_TRUTH_RULES, buildTruthRuleContext, type TruthRuleContext } from "../pipeline-v2/truthRuleEngine";
import { getRegulatoryProfile, validateAgainstProfile, type RegulatoryJurisdiction } from "../pipeline-v2/regulatoryProfiles";
import { verifyCertificateIntegrity, computeContentHash, computeTruthQualityIndex } from "../pipeline-v2/digitalTruthCertificate";
import { generateAllExplanations, generateExplanation, type ExplanationParams } from "../pipeline-v2/explainableTruthSummary";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getAssessmentCTO(claimId: number) {
  const db = await getDb();
  // Get claim number from claims table
  const claimRows = await db!
    .select({ id: claims.id, claimNumber: claims.claimNumber })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claimRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  const claimRow = claimRows[0];

  // Get assessment data from aiAssessments table
  const assessRows = await db!
    .select({
      physicsAnalysis: aiAssessments.physicsAnalysis,
      claimTruthJson: aiAssessments.claimTruthJson,
      claimTruthObjectJson: aiAssessments.claimTruthObjectJson,
    })
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .orderBy(aiAssessments.createdAt)
    .limit(1);

  const assessRow = assessRows[0] ?? {};
  const cto = (assessRow as any).claimTruthObjectJson ? JSON.parse((assessRow as any).claimTruthObjectJson) : null;
  const physics = (assessRow as any).physicsAnalysis ? JSON.parse((assessRow as any).physicsAnalysis) : null;
  const claimTruth = (assessRow as any).claimTruthJson ? JSON.parse((assessRow as any).claimTruthJson) : null;

  return { row: claimRow, cto, physics, claimTruth };
}

// ─────────────────────────────────────────────────────────────────────────────
// E6: MACHINE-READABLE TRUTH API
// ─────────────────────────────────────────────────────────────────────────────

export const treGovernanceRouter = router({

  /** E6: Get the full Claim Truth Object for a claim */
  getClaimTruthObject: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const { cto, row } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available for this claim — assessment may not have run yet" });
      return {
        claimNumber: row.claimNumber,
        cto,
        schemaVersion: cto.ctoSchemaVersion ?? "2.0.0",
        issuedAt: cto.certification?.certificate?.issuedAt ?? null,
      };
    }),

  /** E6: Get canonical field values for a claim (machine-readable, stable API) */
  getCanonicalValues: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const { cto, row } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available" });

      return {
        claimNumber: row.claimNumber,
        canonicalValues: {
          recommendation: cto.decision?.recommendation ?? "REVIEW",
          fraudRiskScore: cto.fraud?.fraudRiskScore ?? 0,
          optimisedCostUsd: cto.cost?.optimisedCostUsd ?? 0,
          overallConfidence: cto.confidence?.overallConfidence ?? 0,
          visionSourceReliability: cto.damage?.visionSourceReliability ?? "NONE",
          estimatedSpeedKmh: cto.physics?.estimatedSpeedKmh ?? null,
          isEconomicWriteOff: cto.vehicle?.isEconomicWriteOff ?? false,
          integrityScore: cto.certification?.certificate?.integrityScore?.score ?? 0,
          stabilityIndex: cto.certification?.certificate?.stabilityIndex?.score ?? 0,
          ctoSchemaVersion: cto.ctoSchemaVersion ?? "2.0.0",
        },
        contentHash: cto.certification?.certificate?.ctoHash ?? null,
        certificationStatus: cto.certification?.status ?? "UNCERTIFIED",
      };
    }),

  /** E6: Verify certificate integrity for a claim */
  verifyCertificate: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const { cto } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available" });

      const cert = cto.certification?.certificate;
      if (!cert) return { verified: false, reason: "No certificate found in CTO" };

      // Recompute content hash from canonical values
      const canonicalValues = {
        recommendation: cto.decision?.recommendation ?? "REVIEW",
        fraudRiskScore: cto.fraud?.fraudRiskScore ?? 0,
        optimisedCostUsd: cto.cost?.optimisedCostUsd ?? 0,
        overallConfidence: cto.confidence?.overallConfidence ?? 0,
        visionSourceReliability: cto.damage?.visionSourceReliability ?? "NONE",
        integrityScore: cert.integrityScore?.score ?? 0,
        stabilityIndex: cert.stabilityIndex?.score ?? 0,
      };
      const recomputedHash = computeContentHash(canonicalValues);
      const storedHash = cert.ctoHash ?? "";

      return {
        verified: recomputedHash === storedHash,
        reason: recomputedHash === storedHash ? "Content hash verified" : "Hash mismatch — CTO may have been modified after certification",
        recomputedHash,
        storedHash,
        certificationStatus: cto.certification?.status ?? "UNCERTIFIED",
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // E10: TRUTH GOVERNANCE DASHBOARD BACKEND
  // ─────────────────────────────────────────────────────────────────────────

  /** E10: Get full governance summary for a claim */
  getGovernanceSummary: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const { cto, row } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available" });

      return {
        claimNumber: row.claimNumber,
        certificationStatus: cto.certification?.status ?? "UNCERTIFIED",
        blockingReasons: cto.certification?.blockingReasons ?? [],
        integrityScore: cto.certification?.certificate?.integrityScore ?? null,
        stabilityIndex: cto.certification?.certificate?.stabilityIndex ?? null,
        sectionCertification: cto.certification?.sectionCertification ?? {},
        conflictCount: cto.consistency?.conflictCount ?? 0,
        criticalConflictCount: cto.consistency?.criticalConflictCount ?? 0,
        decayApplied: cto.confidence?.decayApplied ?? false,
        decayBreakdown: cto.confidence?.decayBreakdown ?? [],
        reconciliationExplanation: cto.confidence?.reconciliationExplanation ?? null,
        recommendation: cto.decision?.recommendation ?? "REVIEW",
        reviewTriggers: cto.decision?.reviewTriggers ?? [],
        blockingDecisionReasons: cto.decision?.blockingReasons ?? [],
        visionSourceReliability: cto.damage?.visionSourceReliability ?? "NONE",
        overallConfidence: cto.confidence?.overallConfidence ?? 0,
        fraudRiskScore: cto.fraud?.fraudRiskScore ?? 0,
        optimisedCostUsd: cto.cost?.optimisedCostUsd ?? 0,
        ctoSchemaVersion: cto.ctoSchemaVersion ?? "2.0.0",
      };
    }),

  /** E10: Evaluate truth rules for a claim */
  evaluateTruthRules: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const { cto } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available" });

      const ruleInput = {
        recommendation: cto.decision?.recommendation ?? "REVIEW",
        fraudScore: cto.fraud?.fraudRiskScore ?? 0,
        overallConfidence: cto.confidence?.overallConfidence ?? 0,
        costUsd: cto.cost?.optimisedCostUsd ?? 0,
        visionSourceReliability: cto.damage?.visionSourceReliability ?? "NONE",
        hasCriticalConflicts: (cto.consistency?.criticalConflictCount ?? 0) > 0,
        physicsConfidence: cto.physics?.physicsConfidence ?? null,
        claimAgeDays: cto.workflow?.claimAgeDays ?? 0,
        daysToLodge: cto.workflow?.daysToLodge ?? 0,
        isEconomicWriteOff: cto.vehicle?.isEconomicWriteOff ?? false,
      };

      const ruleCtx: TruthRuleContext = {
        physics: { confidence: ruleInput.physicsConfidence, speedKmh: null, status: "ok", damageConsistencyScore: 0, supportingEvidenceAvailable: true, visionSourceReliability: ruleInput.visionSourceReliability as any },
        fraud: { score: ruleInput.fraudScore, level: ruleInput.fraudScore >= 70 ? "HIGH" : "LOW", indicatorCount: 0, highSeverityIndicatorCount: 0 },
        cost: { optimisedCostUsd: ruleInput.costUsd, confidence: null, recommendation: ruleInput.recommendation, quoteDeviationPct: null },
        damage: { severity: "MODERATE", structuralDamageDetected: false, componentCount: 0, hasConfirmedDamagePhotos: ruleInput.visionSourceReliability === "HIGH" },
        evidence: { photoCount: 0, documentCount: 0, completenessScore: ruleInput.overallConfidence, hasQuotation: false },
        claim: { ageDays: ruleInput.claimAgeDays, lateSubmission: ruleInput.daysToLodge > 30, incidentType: null, policyNumber: null },
        consistency: { blockAutoApproval: ruleInput.hasCriticalConflicts, criticalConflictCount: ruleInput.hasCriticalConflicts ? 1 : 0, highConflictCount: 0 },
        ctl: { decision: ruleInput.recommendation, fraudScore: ruleInput.fraudScore },
        stage9: { decision: ruleInput.recommendation, costUsd: ruleInput.costUsd },
      };
      const results = evaluateTruthRules(ruleCtx, BUILT_IN_TRUTH_RULES);
      return {
        totalRules: results.firedRules.length + results.skippedRules.length,
        passedRules: results.firedRules.filter((r: any) => r.passed).length,
        failedRules: results.firedRules.filter((r: any) => !r.passed).length,
        criticalFailures: results.firedRules.filter((r: any) => !r.passed && r.rule.severity === "CRITICAL").length,
        blocksPublication: results.blocksPublication,
        results: results.firedRules,
      };
    }),

  /** E10: Get regulatory compliance status for a claim */
  getRegulatoryCompliance: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      jurisdiction: z.enum(["ZA", "UK", "AU", "US", "EU", "GLOBAL"]).optional(),
    }))
    .query(async ({ input }) => {
      const { cto } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available" });

      const jurisdiction = (input.jurisdiction ?? "ZA") as RegulatoryJurisdiction;
      const profile = getRegulatoryProfile(jurisdiction);

      const complianceResult = validateAgainstProfile(profile, {
        photoCount: cto.evidence?.photoCount ?? 0,
        hasQuotation: cto.evidence?.hasRepairQuotation ?? false,
        hasPoliceReport: cto.evidence?.hasPoliceReport ?? false,
        hasDriverStatement: cto.evidence?.hasDriverStatement ?? false,
        fraudScore: cto.fraud?.fraudRiskScore ?? 0,
        overallConfidence: cto.confidence?.overallConfidence ?? 0,
        costUsd: cto.cost?.optimisedCostUsd ?? 0,
        hasPhysicsAnalysis: cto.physics?.estimatedSpeedKmh !== null && cto.physics?.estimatedSpeedKmh !== undefined,
        hasCriticalConflicts: (cto.consistency?.criticalConflictCount ?? 0) > 0,
        recommendation: cto.decision?.recommendation ?? "REVIEW",
      });

      return {
        profile: {
          id: profile.id,
          name: profile.name,
          jurisdiction: profile.jurisdiction,
        },
        complianceResult,
        availableProfiles: ["ZA", "UK", "AU", "US", "EU", "GLOBAL"],
      };
    }),

  /** E10: Get explainable truth summary for a claim */
  getExplanation: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      audience: z.enum(["CLAIMANT", "ASSESSOR", "AUDITOR"]).optional(),
    }))
    .query(async ({ input }) => {
      const { cto, row } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available" });

      const params: ExplanationParams = {
        recommendation: cto.decision?.recommendation ?? "REVIEW",
        fraudScore: cto.fraud?.fraudRiskScore ?? 0,
        costUsd: cto.cost?.optimisedCostUsd ?? 0,
        confidence: cto.confidence?.overallConfidence ?? 0,
        visionReliability: cto.damage?.visionSourceReliability ?? "NONE",
        physicsSpeed: cto.physics?.estimatedSpeedKmh ?? null,
        physicsConfidence: cto.physics?.physicsConfidence ?? null,
        integrityScore: cto.certification?.certificate?.integrityScore?.score ?? 0,
        stabilityIndex: cto.certification?.certificate?.stabilityIndex?.score ?? 0,
        conflicts: (cto.consistency?.conflicts ?? []).map((c: any) => ({
          field: c.field ?? "unknown",
          description: c.description ?? "",
          resolution: c.resolution ?? "",
          severity: c.severity ?? "LOW",
          confidence: c.confidence ?? "LOW",
        })),
        missingEvidence: cto.evidence?.missingCriticalEvidence ?? [],
        reconciliationSteps: (cto.auditTrail?.reconciliationSteps ?? []).map((s: any) => ({
          pass: s.pass ?? "unknown",
          field: s.field ?? "unknown",
          resolution: s.resolution ?? "",
          confidence: s.confidence ?? "LOW",
        })),
        regulatoryProfileId: cto.certification?.certificate?.regulatoryProfileId ?? null,
        regulatoryCompliant: cto.certification?.certificate?.regulatoryCompliant ?? false,
        complianceViolations: cto.certification?.certificate?.complianceViolations ?? [],
        certificateId: cto.certification?.certificate?.certificateId ?? null,
        contentHash: cto.certification?.certificate?.ctoHash ?? null,
        ctoSchemaVersion: cto.ctoSchemaVersion ?? "2.0.0",
      };

      if (input.audience) {
        return { explanation: generateExplanation(input.audience, params) };
      }

      const explanations = generateAllExplanations(params);
      return {
        claimNumber: row.claimNumber,
        claimant: explanations.claimant,
        assessor: explanations.assessor,
        auditor: explanations.auditor,
      };
    }),

  /** E10: Get truth quality index for a claim */
  getTruthQualityIndex: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const { cto } = await getAssessmentCTO(input.claimId);
      if (!cto) throw new TRPCError({ code: "NOT_FOUND", message: "No CTO available" });

      const tqi = computeTruthQualityIndex({
        populatedFieldCount: cto.auditTrail?.populatedFieldCount ?? 0,
        expectedFieldCount: cto.auditTrail?.expectedFieldCount ?? 100,
        missingCriticalFields: cto.evidence?.missingCriticalEvidence ?? [],
        conflictCount: cto.consistency?.conflictCount ?? 0,
        criticalConflictCount: cto.consistency?.criticalConflictCount ?? 0,
        totalCheckedFields: cto.consistency?.totalCheckedFields ?? 50,
        overallConfidence: cto.confidence?.overallConfidence ?? 0,
        physicsConfidence: cto.physics?.physicsConfidence ?? null,
        fraudConfidence: cto.fraud?.fraudConfidence ?? 50,
        fieldsWithCompleteLineage: cto.auditTrail?.fieldsWithCompleteLineage ?? 0,
        totalTrackedFields: cto.auditTrail?.totalTrackedFields ?? 20,
        claimAgeDays: cto.workflow?.claimAgeDays ?? 0,
        daysToLodge: cto.workflow?.daysToLodge ?? 0,
        processingTimeMs: cto.auditTrail?.processingTimeMs ?? 0,
      });

      return { tqi };
    }),

  /** E10: Get governance dashboard summary across all recent claims */
  getGovernanceDashboard: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      jurisdiction: z.enum(["ZA", "UK", "AU", "US", "EU", "GLOBAL"]).default("ZA"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Join claims + aiAssessments to get CTO data
      const rows = await db!
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          claimTruthObjectJson: aiAssessments.claimTruthObjectJson,
          createdAt: claims.createdAt,
        })
        .from(claims)
        .leftJoin(aiAssessments, eq(aiAssessments.claimId, claims.id))
        .orderBy(claims.createdAt)
        .limit(input.limit);

      interface ClaimSummary {
        claimId: number; claimNumber: string; recommendation: string;
        certificationStatus: string; integrityScore: number; stabilityIndex: number;
        overallConfidence: number; fraudRiskScore: number; conflictCount: number;
        criticalConflictCount: number; visionSourceReliability: string; optimisedCostUsd: number;
      }
      const summaries: ClaimSummary[] = rows
        .filter((r) => r.claimTruthObjectJson)
        .map((r) => {
          const cto = JSON.parse(r.claimTruthObjectJson!);
          return {
            claimId: r.id,
            claimNumber: r.claimNumber,
            recommendation: cto.decision?.recommendation ?? "UNKNOWN",
            certificationStatus: cto.certification?.status ?? "UNCERTIFIED",
            integrityScore: cto.certification?.certificate?.integrityScore?.score ?? 0,
            stabilityIndex: cto.certification?.certificate?.stabilityIndex?.score ?? 0,
            overallConfidence: cto.confidence?.overallConfidence ?? 0,
            fraudRiskScore: cto.fraud?.fraudRiskScore ?? 0,
            conflictCount: cto.consistency?.conflictCount ?? 0,
            criticalConflictCount: cto.consistency?.criticalConflictCount ?? 0,
            visionSourceReliability: cto.damage?.visionSourceReliability ?? "NONE",
            optimisedCostUsd: cto.cost?.optimisedCostUsd ?? 0,
          };
        });

      const certified = summaries.filter((s: ClaimSummary) => s.certificationStatus === "CERTIFIED" || s.certificationStatus === "CERTIFIED_WITH_WARNINGS");
      const blocked = summaries.filter((s: ClaimSummary) => s.certificationStatus === "BLOCKED");
      const approved = summaries.filter((s: ClaimSummary) => s.recommendation === "APPROVE");
      const avgIntegrity = summaries.length > 0
        ? summaries.reduce((sum: number, s: ClaimSummary) => sum + s.integrityScore, 0) / summaries.length
        : 0;
      const avgConfidence = summaries.length > 0
        ? summaries.reduce((sum: number, s: ClaimSummary) => sum + s.overallConfidence, 0) / summaries.length
        : 0;

      return {
        totalClaims: summaries.length,
        certifiedCount: certified.length,
        blockedCount: blocked.length,
        approvedCount: approved.length,
        avgIntegrityScore: Math.round(avgIntegrity),
        avgConfidence: Math.round(avgConfidence),
        claims: summaries,
        jurisdiction: input.jurisdiction,
      };
    }),
});
