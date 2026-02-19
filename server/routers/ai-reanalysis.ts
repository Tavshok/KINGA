// @ts-nocheck
/**
 * AI Re-Analysis Router
 * 
 * Allows all insurer roles to run AI analysis on accessible claims for review purposes
 * without affecting workflow state.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
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
      // Look for any re-analysis created in the last 5 minutes
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

      // 7. Get original AI assessment (most recent non-reanalysis)
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

      // 9. Trigger AI assessment (mock implementation - replace with actual AI service call)
      // In production, this would call the AI assessment service
      const aiResult = await triggerAiAssessmentService(claim);

      // 10. Create new AI assessment entry (re-analysis version)
      const [newAssessment] = await db
        .insert(aiAssessments)
        .values({
          claimId: input.claimId,
          estimatedCost: aiResult.estimatedCost,
          damageDescription: aiResult.damageDescription,
          detectedDamageTypes: JSON.stringify(aiResult.detectedDamageTypes),
          confidenceScore: aiResult.confidenceScore,
          fraudIndicators: JSON.stringify(aiResult.fraudIndicators),
          fraudRiskLevel: aiResult.fraudRiskLevel,
          totalLossIndicated: aiResult.totalLossIndicated ? 1 : 0,
          structuralDamageSeverity: aiResult.structuralDamageSeverity,
          estimatedVehicleValue: aiResult.estimatedVehicleValue,
          repairToValueRatio: aiResult.repairToValueRatio,
          totalLossReasoning: aiResult.totalLossReasoning,
          damagedComponentsJson: JSON.stringify(aiResult.damagedComponents),
          physicsAnalysis: JSON.stringify(aiResult.physicsAnalysis),
          graphUrls: JSON.stringify(aiResult.graphUrls),
          modelVersion: aiResult.modelVersion,
          processingTime: aiResult.processingTime,
          // Re-analysis metadata
          isReanalysis: 1,
          triggeredBy: userId,
          triggeredRole: userRole,
          previousAssessmentId: originalAssessment?.id || null,
          reanalysisReason: input.reason || null,
          versionNumber: nextVersion,
          tenantId: tenantId || null,
        })
        .$returningId();

      // 11. Log governance audit trail
      await db.insert(auditTrail).values({
        action: "AI_REANALYSIS",
        userId: userId,
        claimId: input.claimId,
        metadata: JSON.stringify({
          triggeredRole: userRole,
          reason: input.reason,
          versionNumber: nextVersion,
          previousAssessmentId: originalAssessment?.id,
          newAssessmentId: newAssessment.id,
        }),
        tenantId: tenantId || null,
      });

      return {
        success: true,
        assessmentId: newAssessment.id,
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

      // Validate claim access
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

      // Fetch all AI assessments for this claim, ordered by version
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

      // Fetch both assessments
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

      // Validate both belong to same claim and tenant
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

      // Calculate differences
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

      // Only executive and insurer_admin can view stats
      if (userRole !== "executive" && userRole !== "insurer_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only executives and admins can view re-analysis statistics",
        });
      }

      const daysAgo = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // Count re-analyses by role
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

      // Total re-analyses
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

/**
 * Mock AI Assessment Service
 * 
 * In production, replace this with actual AI service integration
 */
async function triggerAiAssessmentService(claim: any) {
  // Simulate AI processing delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Mock AI assessment result
  return {
    estimatedCost: Math.floor(Math.random() * 50000) + 10000, // Random cost between 10k-60k cents
    damageDescription: "Re-analysis: Front bumper damage, headlight replacement required",
    detectedDamageTypes: ["bumper_damage", "headlight_damage", "paint_damage"],
    confidenceScore: Math.floor(Math.random() * 30) + 70, // Random 70-100
    fraudIndicators: [],
    fraudRiskLevel: "low" as const,
    totalLossIndicated: false,
    structuralDamageSeverity: "minor" as const,
    estimatedVehicleValue: 2000000, // 20,000 in cents
    repairToValueRatio: 15,
    totalLossReasoning: null,
    damagedComponents: [
      { component: "Front Bumper", severity: "moderate", cost: 5000 },
      { component: "Headlight (Left)", severity: "severe", cost: 3000 },
    ],
    physicsAnalysis: {
      impactSpeed: "25 km/h",
      impactAngle: "frontal",
      consistency: "high",
    },
    graphUrls: [],
    modelVersion: "v2.1.0",
    processingTime: 2000,
  };
}
