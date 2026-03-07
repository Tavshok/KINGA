// @ts-nocheck
/**
 * AI Re-Analysis Router
 *
 * Allows all insurer roles to run AI analysis on accessible claims for review purposes.
 * Wired to the REAL triggerAiAssessment pipeline (db.ts) — not a mock.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, triggerAiAssessment } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { claims, aiAssessments, auditTrail } from "../../drizzle/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { getRolePermissions, getAccessibleQueues } from "../../shared/role-permissions";

const db = getDb();

/**
 * AI Re-Analysis Router
 */
export const aiReanalysisRouter = router({
  /**
   * Re-run AI analysis on a claim
   *
   * Access: All insurer roles (claims_processor, assessor_internal, risk_manager, claims_manager, executive)
   * Validation:
   * - Must have access to claim state
   * - Must belong to same tenant
   * - Cannot re-analyze cancelled claims
   * - Limited to 5 re-analyses per claim per day
   */
  reRunAiAnalysis: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const userRole = ctx.user.insurerRole;
      const tenantId = ctx.user.tenantId;

      // 1. Validate user has insurer role
      if (!userRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "AI re-analysis requires an insurer role",
        });
      }

      // 2. Fetch claim with tenant isolation
      const [claim] = await db
        .select()
        .from(claims)
        .where(
          and(
            eq(claims.id, input.claimId),
            tenantId ? eq(claims.tenantId, tenantId) : undefined
          )
        )
        .limit(1);

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found or access denied",
        });
      }

      // 3. Check if claim is cancelled
      if (claim.workflowState === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot re-analyze cancelled claims",
        });
      }

      // 4. Validate user has access to claim state
      const accessibleQueues = getAccessibleQueues(userRole);
      if (!accessibleQueues.includes(claim.workflowState || "")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role (${userRole}) does not have access to claims in ${claim.workflowState} state`,
        });
      }

      // 5. Check rate limiting: 5 re-analyses per claim per day
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [reanalysisCount] = await db
        .select({ count: count() })
        .from(aiAssessments)
        .where(
          and(
            eq(aiAssessments.claimId, input.claimId),
            eq(aiAssessments.isReanalysis, 1),
            sql`${aiAssessments.createdAt} >= ${oneDayAgo}`
          )
        );

      if (reanalysisCount && reanalysisCount.count >= 5) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Maximum 5 re-analyses per claim per day. Please try again tomorrow.",
        });
      }

      // 6. Check for simultaneous execution (locking mechanism)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const [recentReanalysis] = await db
        .select()
        .from(aiAssessments)
        .where(
          and(
            eq(aiAssessments.claimId, input.claimId),
            eq(aiAssessments.isReanalysis, 1),
            sql`${aiAssessments.createdAt} >= ${fiveMinutesAgo}`
          )
        )
        .limit(1);

      if (recentReanalysis) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "AI re-analysis is already in progress for this claim. Please wait a few minutes.",
        });
      }

      // 7. Get original AI assessment (most recent)
      const [originalAssessment] = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, input.claimId))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(1);

      // 8. Calculate next version number
      const [maxVersion] = await db
        .select({ maxVersion: sql<number>`MAX(${aiAssessments.versionNumber})` })
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, input.claimId));

      const nextVersion = (maxVersion?.maxVersion || 0) + 1;

      // 9. Mark as re-analysis in metadata before running
      // The real pipeline (triggerAiAssessment) will DELETE and re-INSERT the assessment row.
      // We capture the original assessment ID first so we can backfill re-analysis metadata after.
      const previousAssessmentId = originalAssessment?.id || null;

      // 10. Run the REAL AI pipeline (same pipeline as initial intake)
      // This runs all 10 stages: LLM extraction, incident classification, physics engine,
      // hidden damage propagation, fraud scoring, repair intelligence, parts reconciliation,
      // cost intelligence, confidence scoring, and cross-claim signals.
      try {
        await triggerAiAssessment(input.claimId);
      } catch (pipelineErr: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `AI pipeline failed: ${pipelineErr.message}`,
        });
      }

      // 11. Fetch the newly created assessment (pipeline deletes old + inserts new)
      const [newAssessment] = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, input.claimId))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(1);

      // 12. Backfill re-analysis metadata on the new assessment row
      if (newAssessment) {
        await db
          .update(aiAssessments)
          .set({
            isReanalysis: 1,
            triggeredBy: userId,
            triggeredRole: userRole,
            previousAssessmentId,
            reanalysisReason: input.reason || null,
            versionNumber: nextVersion,
          })
          .where(eq(aiAssessments.id, newAssessment.id));
      }

      // 13. Log governance audit trail
      await db.insert(auditTrail).values({
        action: "AI_REANALYSIS",
        userId: userId,
        claimId: input.claimId,
        metadata: JSON.stringify({
          triggeredRole: userRole,
          reason: input.reason,
          versionNumber: nextVersion,
          previousAssessmentId,
          newAssessmentId: newAssessment?.id,
        }),
        tenantId: tenantId || null,
      });

      return {
        success: true,
        assessmentId: newAssessment?.id,
        versionNumber: nextVersion,
        message: `AI re-analysis completed successfully (Version #${nextVersion})`,
      };
    }),

  /**
   * Get AI assessment version history for a claim
   */
  getVersionHistory: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;

      const [claim] = await db
        .select()
        .from(claims)
        .where(
          and(
            eq(claims.id, input.claimId),
            tenantId ? eq(claims.tenantId, tenantId) : undefined
          )
        )
        .limit(1);

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found or access denied",
        });
      }

      const assessments = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, input.claimId))
        .orderBy(aiAssessments.versionNumber);

      return {
        claimId: input.claimId,
        versions: assessments.map((a) => ({
          id: a.id,
          versionNumber: a.versionNumber,
          isReanalysis: Boolean(a.isReanalysis),
          triggeredBy: a.triggeredBy,
          triggeredRole: a.triggeredRole,
          reanalysisReason: a.reanalysisReason,
          confidenceScore: a.confidenceScore,
          estimatedCost: a.estimatedCost,
          fraudRiskLevel: a.fraudRiskLevel,
          createdAt: a.createdAt,
        })),
      };
    }),

  /**
   * Compare two AI assessment versions
   */
  compareVersions: protectedProcedure
    .input(
      z.object({
        assessmentId1: z.number().int().positive(),
        assessmentId2: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;

      const [assessment1] = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.id, input.assessmentId1))
        .limit(1);

      const [assessment2] = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.id, input.assessmentId2))
        .limit(1);

      if (!assessment1 || !assessment2) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or both assessments not found",
        });
      }

      if (assessment1.claimId !== assessment2.claimId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Assessments must belong to the same claim",
        });
      }

      if (tenantId && (assessment1.tenantId !== tenantId || assessment2.tenantId !== tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied to one or both assessments",
        });
      }

      const costDiff = (assessment2.estimatedCost || 0) - (assessment1.estimatedCost || 0);
      const costDiffPercent = assessment1.estimatedCost
        ? ((costDiff / assessment1.estimatedCost) * 100).toFixed(2)
        : "N/A";

      const confidenceDiff = (assessment2.confidenceScore || 0) - (assessment1.confidenceScore || 0);

      return {
        assessment1: {
          id: assessment1.id,
          versionNumber: assessment1.versionNumber,
          estimatedCost: assessment1.estimatedCost,
          confidenceScore: assessment1.confidenceScore,
          fraudRiskLevel: assessment1.fraudRiskLevel,
          damageDescription: assessment1.damageDescription,
          createdAt: assessment1.createdAt,
        },
        assessment2: {
          id: assessment2.id,
          versionNumber: assessment2.versionNumber,
          estimatedCost: assessment2.estimatedCost,
          confidenceScore: assessment2.confidenceScore,
          fraudRiskLevel: assessment2.fraudRiskLevel,
          damageDescription: assessment2.damageDescription,
          createdAt: assessment2.createdAt,
        },
        differences: {
          costDiff,
          costDiffPercent,
          confidenceDiff,
          fraudRiskLevelChanged: assessment1.fraudRiskLevel !== assessment2.fraudRiskLevel,
        },
      };
    }),

  /**
   * Get re-analysis statistics for governance dashboard
   */
  getReanalysisStats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().positive().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      const userRole = ctx.user.insurerRole;

      if (userRole !== "executive" && userRole !== "insurer_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only executives and admins can view re-analysis statistics",
        });
      }

      const daysAgo = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const reanalysisByRole = await db
        .select({
          role: aiAssessments.triggeredRole,
          count: count(),
        })
        .from(aiAssessments)
        .where(
          and(
            eq(aiAssessments.isReanalysis, 1),
            sql`${aiAssessments.createdAt} >= ${daysAgo}`,
            tenantId ? eq(aiAssessments.tenantId, tenantId) : undefined
          )
        )
        .groupBy(sql`${aiAssessments.triggeredRole}`);

      const [totalReanalyses] = await db
        .select({ count: count() })
        .from(aiAssessments)
        .where(
          and(
            eq(aiAssessments.isReanalysis, 1),
            sql`${aiAssessments.createdAt} >= ${daysAgo}`,
            tenantId ? eq(aiAssessments.tenantId, tenantId) : undefined
          )
        );

      return {
        totalReanalyses: totalReanalyses?.count || 0,
        byRole: reanalysisByRole,
        period: `${input.days} days`,
      };
    }),
});
