/**
 * Vehiclevaluation Router
 * Extracted from server/routers.ts (TECH-02: router file split, Aug 2026)
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  createAuditEntry,
  createVehicleMarketValuation,
  getAiAssessmentByClaimId,
  getAssessorEvaluationByClaimId,
  getClaimById,
  getVehicleMarketValuationByClaimId
} from "../db";
import { eq, and, desc, asc, inArray, gte, lte, or, sql, count, avg } from "drizzle-orm";
import {
  claims, aiAssessments as aiAssessmentsTable, vehicleMarketValuations,
  auditTrail, notifications
} from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { isAdminRole } from "@shared/role-permissions";

function requireVehicleValuationTenant(ctx: { user?: { tenantId?: string | null } }) {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

async function requireVehicleValuationClaim(claimId: number, tenantId: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const [claim] = await db.select({ id: claims.id }).from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId))).limit(1);
  if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  return db;
}

async function requireVehicleValuationAssessment(
  assessmentId: number,
  tenantId: string,
  claimId?: number,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const conditions = [eq(aiAssessmentsTable.id, assessmentId), eq(aiAssessmentsTable.tenantId, tenantId)];
  if (claimId !== undefined) conditions.push(eq(aiAssessmentsTable.claimId, claimId));
  const [assessment] = await db.select({ id: aiAssessmentsTable.id }).from(aiAssessmentsTable)
    .where(and(...conditions)).limit(1);
  if (!assessment) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found" });
  return db;
}

export const vehicleValuationCoreRouter = router({
  // Trigger vehicle valuation
  trigger: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      mileage: z.number().optional(),
      condition: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      if (!['assessor', 'insurer', 'admin'].includes(ctx.user.role)) {
        throw new Error("Not authorized");
      }

      // Get claim details
      const tenantId = requireVehicleValuationTenant(ctx);
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new Error("Claim not found");

       // Validate vehicle details are available
      if (!claim.vehicleMake || !claim.vehicleModel) {
        throw new Error(
          `Vehicle make and model are required for valuation. ` +
          `This claim has not yet had its vehicle details extracted from the PDF. ` +
          `Please re-run the KINGA assessment first to extract vehicle details from the uploaded document.`
        );
      }
      // Get assessor evaluation for repair cost
      const evaluation = await getAssessorEvaluationByClaimId(input.claimId);
      const repairCost = evaluation?.estimatedRepairCost;

      // ── Year resolution ───────────────────────────────────────────────────
      // If the claim has no vehicleYear (or it was nulled by Stage 4 OCR normalisation),
      // fall back to the current year and set yearAssumed so the UI can show an amber note.
      const { normaliseOcrYear } = await import("../../shared/vehicleYearValidation");
      const rawYear = claim.vehicleYear;
      const { year: normalisedYear, warning: yearNormWarning } = normaliseOcrYear(rawYear);
      const resolvedYear = normalisedYear ?? new Date().getFullYear();
      const yearAssumed = !normalisedYear; // true when year was missing or nulled
      const yearAssumedReason = yearAssumed
        ? (yearNormWarning ?? `Vehicle year not available; assumed ${resolvedYear} for valuation purposes.`)
        : null;

      // ── Mileage resolution ────────────────────────────────────────────────
      // If the user did not supply a mileage, estimate it from vehicle year/type.
      // The estimate carries LOW confidence and reduces the overall valuation
      // confidence score by 20 points.
      const { estimateMileageFromYear } = await import("../services/mileageEstimation");
      let resolvedMileage: number | undefined = input.mileage;
      let mileageEstimation: ReturnType<typeof estimateMileageFromYear> | null = null;
      if (!resolvedMileage) {
        mileageEstimation = estimateMileageFromYear(
          resolvedYear,
          claim.vehicleMake,
          claim.vehicleModel,
        );
        resolvedMileage = mileageEstimation.assumed_mileage_used;
      }

      // Import valuation service
      const { valuateVehicle } = await import("../services/vehicleValuation");
      // Perform valuation
      const valuation = await valuateVehicle(
        {
          make: claim.vehicleMake || '',
          model: claim.vehicleModel || '',
          year: resolvedYear,
          mileage: resolvedMileage,
          condition: input.condition,
          country: 'Zimbabwe',
        },
        repairCost ?? undefined
      );

      // Apply confidence penalty when mileage was estimated
      if (mileageEstimation) {
        valuation.confidenceScore = Math.max(10, (valuation.confidenceScore ?? 50) - 20);
        valuation.notes = [
          `⚠️ MILEAGE ESTIMATED: ${mileageEstimation.warning_message}`,
          `Estimated range: ${mileageEstimation.estimated_mileage_range[0].toLocaleString()}–${mileageEstimation.estimated_mileage_range[1].toLocaleString()} km (midpoint ${mileageEstimation.assumed_mileage_used.toLocaleString()} km used)`,
          ...valuation.notes,
        ];
      }

      // Apply confidence penalty when year was assumed
      if (yearAssumed) {
        valuation.confidenceScore = Math.max(10, (valuation.confidenceScore ?? 50) - 15);
        valuation.notes = [
          `⚠️ YEAR ASSUMED: ${yearAssumedReason}`,
          ...valuation.notes,
        ];
      }

      // Save valuation to database
      const valuationId = await createVehicleMarketValuation({
        claimId: input.claimId,
        vehicleMake: claim.vehicleMake || '',
        vehicleModel: claim.vehicleModel || '',
        vehicleYear: claim.vehicleYear || new Date().getFullYear(),
        vehicleRegistration: claim.vehicleRegistration,
        mileage: resolvedMileage,
        condition: input.condition,
        estimatedMarketValue: valuation.estimatedMarketValue,
        valuationMethod: valuation.valuationMethod,
        confidenceScore: valuation.confidenceScore,
        dataPointsCount: valuation.dataPointsCount,
        priceRange: JSON.stringify(valuation.priceRange),
        conditionAdjustment: valuation.conditionAdjustment,
        mileageAdjustment: valuation.mileageAdjustment,
        marketTrendAdjustment: valuation.marketTrendAdjustment,
        finalAdjustedValue: valuation.finalAdjustedValue,
        isTotalLoss: valuation.isTotalLoss ? 1 : 0,
        totalLossThreshold: valuation.totalLossThreshold.toString(),
        repairCostToValueRatio: valuation.repairCostToValueRatio?.toString(),
        valuationDate: valuation.valuationDate instanceof Date ? valuation.valuationDate.toISOString() : valuation.valuationDate,
        validUntil: valuation.validUntil instanceof Date ? valuation.validUntil.toISOString() : (valuation.validUntil ?? undefined),
        valuedBy: ctx.user.id,
        notes: valuation.notes.join('\n'),
      });

      // Create audit trail
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "vehicle_valuation_completed",
        entityType: "valuation",
        entityId: valuationId,
        changeDescription: `Vehicle valued at $${(valuation.finalAdjustedValue / 100).toFixed(2)}${valuation.isTotalLoss ? ' - TOTAL LOSS' : ''}${mileageEstimation ? ' (mileage estimated)' : ''}`,
      });

      // Sync vehicle market value to claims table for repair ratio calculation
      const _vDb = await getDb();
      if (_vDb) await _vDb.update(claims).set({ vehicleMarketValue: valuation.finalAdjustedValue })
        .where(and(eq(claims.id, input.claimId), eq(claims.tenantId, tenantId)));

      // Return valuation enriched with mileage estimation and year assumption metadata
      return {
        ...valuation,
        mileageEstimation: mileageEstimation ? {
          estimated_mileage_range: mileageEstimation.estimated_mileage_range,
          assumed_mileage_used: mileageEstimation.assumed_mileage_used,
          confidence: mileageEstimation.confidence,
          source: mileageEstimation.source,
          warning_message: mileageEstimation.warning_message,
        } : null,
        yearAssumed,
        yearAssumedReason,
        resolvedYear,
      };
    }),

  // Get valuation by claim ID
  byClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireVehicleValuationClaim(input.claimId, requireVehicleValuationTenant(ctx));
      const valuation = await getVehicleMarketValuationByClaimId(input.claimId);
      if (!valuation) return null;

      // Parse JSON fields
      return {
        ...valuation,
        priceRange: valuation.priceRange ? JSON.parse(valuation.priceRange) : null,
        notes: valuation.notes ? valuation.notes.split('\n') : [],
       };
    }),

  /**
   * Stage 11 — Enrich damage photos with vision KINGA analysis.
   *
   * Runs per-image vision analysis on all uploaded damage photos for a claim,
   * assigns confidence scores, and cross-checks findings against the reported
   * damage description and AI-extracted components.
   *
   * Results are stored in enrichedPhotosJson and photoInconsistenciesJson
   * on the aiAssessments record.
   */
  enrichPhotos: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error('Not authenticated');
      const allowedRoles = ['admin', 'insurer', 'assessor'];
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new Error('Insufficient permissions to run photo enrichment');
      }

      const { getDb } = await import('../db');
      const { aiAssessments, claims } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const { enrichDamagePhotos } = await import('../services/photoEnrichment');

      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Load the claim and its latest KINGA assessment
      const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
      const { getAiAssessmentByClaimId, getClaimById } = await import('../db');
      const [assessment, claim] = await Promise.all([
        getAiAssessmentByClaimId(input.claimId, tenantId),
        getClaimById(input.claimId, tenantId),
      ]);

      if (!assessment) throw new Error('No KINGA assessment found for this claim');
      if (!claim) throw new Error('Claim not found');

      // Extract photo URLs from damagePhotosJson
      let photoUrls: string[] = [];
      if (assessment.damagePhotosJson) {
        try {
          const parsed = JSON.parse(assessment.damagePhotosJson);
          if (Array.isArray(parsed)) {
            photoUrls = parsed.map((p: any) =>
              typeof p === 'string' ? p : (p.imageUrl || p.url || '')
            ).filter(Boolean);
          }
        } catch { /* ignore parse errors */ }
      }

      if (photoUrls.length === 0) {
        return { enriched_photos: [], inconsistencies: [], summary: { totalPhotos: 0, analyzedPhotos: 0, unusablePhotos: 0, inconsistencyCount: 0, averageConfidence: 0 } };
      }

      // Extract AI-extracted components from damagedComponentsJson
      let aiExtractedComponents: string[] = [];
      if (assessment.damagedComponentsJson) {
        try {
          const parsed = JSON.parse(assessment.damagedComponentsJson);
          if (Array.isArray(parsed)) {
            aiExtractedComponents = parsed.map((c: any) =>
              typeof c === 'string' ? c : (c.name || c.component || '')
            ).filter(Boolean);
          }
        } catch { /* ignore */ }
      }

      // Run enrichment
      const result = await enrichDamagePhotos({
        photoUrls,
        reportedDamageDescription: (assessment as any)?.damageDescription ?? null,
        aiExtractedComponents,
      });

      // Persist enrichment results
      await db.update(aiAssessments)
        .set({
          enrichedPhotosJson: JSON.stringify(result.enriched_photos),
          photoInconsistenciesJson: JSON.stringify(result.inconsistencies),
        })
        .where(eq(aiAssessments.id, assessment.id));

      // ─── Auto-trigger Stage 12: Damage Consistency Check ─────────────────
      // After enrichment, attempt to run the consistency check automatically.
      // The runDamageConsistencyCheck function enforces its own pre-conditions
      // internally (document components, enriched photos, physics zone) and
      // returns a pending_inputs result if any condition is unmet — so we
      // can always call it safely here.
      let consistencyResult: any = null;
      try {
        const { runDamageConsistencyCheck } = await import('../services/damageConsistency');
        const { generateMismatchNarratives } = await import('../services/mismatchNarrative');

        // Re-read the freshly persisted assessment so enrichedPhotosJson is current
        const freshAssessment = await getAiAssessmentByClaimId(input.claimId, tenantId);

        if (freshAssessment) {
          consistencyResult = await runDamageConsistencyCheck({
            damagedComponentsJson: freshAssessment.damagedComponentsJson ?? null,
            damageDescription: freshAssessment.damageDescription ?? null,
            enrichedPhotosJson: freshAssessment.enrichedPhotosJson ?? null,
            physicsAnalysisJson: freshAssessment.physicsAnalysis ?? null,
            triggerSource: 'auto',
          });

          // Attach narratives when the check completed
          if (consistencyResult.status === 'complete' && consistencyResult.mismatches.length > 0) {
            try {
              const narratives = await generateMismatchNarratives(consistencyResult.mismatches, { useLlm: false });
              const mismatchesWithNarratives = consistencyResult.mismatches.map((m: any, i: number) => ({
                ...m,
                narrative: narratives[i]?.explanation ?? null,
                narrative_source: narratives[i]?.source ?? 'template',
              }));
              consistencyResult = { ...consistencyResult, mismatches: mismatchesWithNarratives };
            } catch (narrativeErr: unknown) {
              // R-GH-16: Narrative generation failure is non-fatal but must be observable.
              console.warn(
                `[runConsistencyCheck] Mismatch narrative generation failed for assessment ${freshAssessment.id}: ` +
                `${narrativeErr instanceof Error ? narrativeErr.message : String(narrativeErr)}`
              );
            }
          }

          // Persist the consistency result
          await db.update(aiAssessments)
            .set({ consistencyCheckJson: JSON.stringify(consistencyResult) })
            .where(eq(aiAssessments.id, freshAssessment.id));

          // ─── Update fraud score if consistency check completed ────────────
          // Only update when the check produced a complete result with
          // high-severity mismatches — the weighted scorer handles the
          // confidence-based weighting (HIGH→12, MEDIUM→5, LOW→0).
          if (consistencyResult.status === 'complete') {
            try {
              const { computeWeightedFraudScore } = await import('../weighted-fraud-scoring');
              const highSeverityMismatches = consistencyResult.mismatches.filter(
                (m: any) => m.severity === 'high'
              );

              if (highSeverityMismatches.length > 0) {
                // Build a minimal input using the consistency result
                const fraudInput = {
                  consistencyScore: consistencyResult.consistency_score,
                  aiEstimatedCost: 0,
                  quotedAmount: 0,
                  impactDirection: 'unknown',
                  damageZones: [],
                  hasPreviousClaims: false,
                  missingDataCount: 0,
                  multiSourceConflict: {
                    confidence: consistencyResult.confidence as 'HIGH' | 'MEDIUM' | 'LOW',
                    highSeverityMismatchCount: highSeverityMismatches.length,
                    details: highSeverityMismatches.map((m: any) => m.details).join('; '),
                  },
                };
                const fraudResult = computeWeightedFraudScore(fraudInput);

                // Persist the updated fraud score back to the assessment
                if (freshAssessment.fraudScore !== null && freshAssessment.fraudScore !== undefined) {
                  // Blend: take the higher of the existing score and the new conflict penalty
                  const conflictPenalty = fraudResult.contributions
                    .find((c: any) => c.factor === 'Multi-Source Damage Conflict')?.value ?? 0;
                  const updatedScore = Math.min(100, (freshAssessment.fraudScore as number) + conflictPenalty);
                  await db.update(aiAssessments)
                    .set({ fraudScore: updatedScore })
                    .where(eq(aiAssessments.id, freshAssessment.id));
                }
              }
            } catch (fraudUpdateErr: unknown) {
              // R-GH-16: Fraud score update failure is non-fatal but must be observable.
              console.warn(
                `[runConsistencyCheck] Fraud score update failed for assessment ${freshAssessment.id}: ` +
                `${fraudUpdateErr instanceof Error ? fraudUpdateErr.message : String(fraudUpdateErr)}`
              );
            }
          }
        }
      } catch (autoTriggerErr: unknown) {
        // R-GH-16: Auto-trigger consistency check failure is non-fatal but must be observable.
        // Without this log, a broken import or DB error here is completely invisible.
        console.warn(
          `[enrichAssessment] Auto-trigger consistency check failed for assessment ${assessment?.id ?? 'unknown'}: ` +
          `${autoTriggerErr instanceof Error ? autoTriggerErr.message : String(autoTriggerErr)}`
        );
      }

      return {
        ...result,
        auto_consistency_check: consistencyResult
          ? { status: consistencyResult.status, triggered: true }
          : { status: 'skipped', triggered: false },
      };
    }),

  /**
   * Stage 12: Three-source damage consistency check
   *
   * Compares document-extracted damage, photo-detected damage, and physics
   * impact zone to produce a consistency_score and typed mismatches[].
   * Stores the result in consistencyCheckJson on the aiAssessment record.
   */
  runConsistencyCheck: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // R-GH-13: declare db and aiAssessments locally (were missing, causing pre-existing TS errors)
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { aiAssessments } = await import('../../drizzle/schema');
      // R-GH-16: scope to caller's tenant so cross-tenant reads are blocked
      const tenantId = ctx.user?.role === 'admin' ? undefined : (ctx.user?.tenantId || undefined);
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) throw new TRPCError({ code: 'NOT_FOUND', message: 'No KINGA assessment found for this claim' });

      const { runDamageConsistencyCheck } = await import('../services/damageConsistency');

      // Manual trigger always passes triggerSource: 'manual'
      const result = await runDamageConsistencyCheck({
        damagedComponentsJson: assessment.damagedComponentsJson ?? null,
        damageDescription: assessment.damageDescription ?? null,
        enrichedPhotosJson: assessment.enrichedPhotosJson ?? null,
        physicsAnalysisJson: assessment.physicsAnalysis ?? null,
        triggerSource: 'manual',
      });

      // Generate natural-language narratives for each mismatch when the
      // check completed successfully. Template engine only (useLlm: false)
      // to keep response latency predictable; LLM enrichment can be added
      // as a background job in a future iteration.
      let resultWithNarratives: typeof result = result;
      if (result.status === 'complete' && result.mismatches.length > 0) {
        try {
          const { generateMismatchNarratives } = await import('../services/mismatchNarrative');
          const narratives = await generateMismatchNarratives(result.mismatches, { useLlm: false });
          // Attach narrative to each mismatch by index
          const mismatchesWithNarratives = result.mismatches.map((m, i) => ({
            ...m,
            narrative: narratives[i]?.explanation ?? null,
            narrative_source: narratives[i]?.source ?? 'template',
          }));
          resultWithNarratives = { ...result, mismatches: mismatchesWithNarratives } as typeof result;
        } catch { /* narrative generation failure must not block the consistency result */ }
      }

      // Always persist the result — including pending_inputs so the UI
      // can display which conditions are still missing.
      await db.update(aiAssessments)
        .set({ consistencyCheckJson: JSON.stringify(resultWithNarratives) })
        .where(eq(aiAssessments.id, assessment.id));

      return resultWithNarratives;
    }),

  /**
   * Record an adjuster annotation (confirm/dismiss) on a specific mismatch.
   */
  annotate: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      assessmentId: z.number(),
      mismatchType: z.string(),
      mismatchIndex: z.number().default(0),
      action: z.enum(['confirm', 'dismiss']),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      if (!['assessor', 'insurer', 'admin'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only assessors, insurers, and admins may annotate mismatches' });
      }
      const tenantId = requireVehicleValuationTenant(ctx);
      await requireVehicleValuationClaim(input.claimId, tenantId);
      await requireVehicleValuationAssessment(input.assessmentId, tenantId, input.claimId);
      const { recordAnnotation } = await import('../services/mismatchAnnotation');
      const result = await recordAnnotation({
        claimId: input.claimId,
        assessmentId: input.assessmentId,
        mismatchType: input.mismatchType as any,
        mismatchIndex: input.mismatchIndex,
        action: input.action,
        note: input.note,
        userId: ctx.user.id,
        userRole: ctx.user.role,
      });
      return { success: true, annotationId: result.id };
    }),

  /**
   * Get annotation stats for a specific claim.
   */
  getClaimStats: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      await requireVehicleValuationClaim(input.claimId, requireVehicleValuationTenant(ctx));
      const { getClaimAnnotationStats, getClaimAnnotations } = await import('../services/mismatchAnnotation');
      const [stats, annotations] = await Promise.all([
        getClaimAnnotationStats(input.claimId),
        getClaimAnnotations(input.claimId),
      ]);
      return { stats, annotations };
    }),

  /**
   * Get global adaptive weights across all claims.
   * Admin-only — returns system-wide confirmation rates and weight multipliers.
   */
  getAdaptiveWeights: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins may view global adaptive weights' });
      }
      const { getAdaptiveWeights } = await import('../services/mismatchAnnotation');
      return getAdaptiveWeights();
    }),

  /**
   * Get the weight adjustment log.
   * Admin-only — returns the timestamped audit trail of every adaptive
   * weight calibration event (Stage 23).
   * Optionally filtered by mismatch_type; defaults to most recent 100 entries.
   */
  getWeightAdjustmentLog: protectedProcedure
    .input(z.object({
      mismatchType: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins may view the weight adjustment log' });
      }
      const { getWeightAdjustmentLog } = await import('../services/mismatchAnnotation');
      return getWeightAdjustmentLog(
        input.mismatchType as any,
        input.limit,
      );
    }),

  /**
   * Get the full version history for all mismatch narratives in an assessment.
   * Returns rows ordered by mismatch_index ASC, version ASC.
   */
  getNarrativeVersionHistory: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireVehicleValuationAssessment(input.assessmentId, requireVehicleValuationTenant(ctx));
      const { getNarrativeVersionHistory } = await import('../services/mismatchNarrative');
      return getNarrativeVersionHistory(input.assessmentId);
    }),

});
