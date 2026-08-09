/**
 * KINGA Assessors Router
 * Extracted from server/routers.ts for maintainability — Aug 2026.
 * External assessor management, assignment, and evaluation procedures.
 */
import { TRPCError } from "@trpc/server";
import { isAdminRole } from "@shared/role-permissions";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  getClaimById,
  updateClaimStatus,
  createAuditEntry,
  createNotification,
  getUsersByRole,
  getUsersByInsurerRoles,
  assignClaimToAssessor,
  checkAssignmentCap,
} from "../db";
export const assessorsRouter = router({
  list: protectedProcedure.query(async () => {
    return await getUsersByRole("assessor");
  }),

  // Get performance metrics for an assessor
  getPerformanceMetrics: protectedProcedure
    .input(z.object({
      assessorId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
      
      // Get all claims assigned to this assessor
      const assessments = await getClaimsByAssessor(input.assessorId, tenantId);

      const totalAssessments = assessments.length;
      if (totalAssessments === 0) {
        return {
          totalAssessments: 0,
          assessmentsThisMonth: 0,
          avgTurnaroundHours: 0,
          totalSavings: 0,
          savingsPercentage: 0,
          fraudCasesDetected: 0,
          fraudPrevented: 0,
          accuracyRate: 0,
          initialEstimates: 0,
          turnaroundBreakdown: { under24: 0, under48: 0, over48: 0 },
          fraudBreakdown: { high: 0, medium: 0 },
        };
      }

      // Calculate turnaround times
      let totalTurnaroundHours = 0;
      let under24 = 0;
      let under48 = 0;
      let over48 = 0;
      let assessmentsThisMonth = 0;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const claim of assessments) {
        if (claim.createdAt && claim.updatedAt) {
          const hours = (new Date(claim.updatedAt).getTime() - new Date(claim.createdAt).getTime()) / (1000 * 60 * 60);
          totalTurnaroundHours += hours;
          if (hours < 24) under24++;
          else if (hours < 48) under48++;
          else over48++;
        }
        if (claim.createdAt && new Date(claim.createdAt) >= monthStart) {
          assessmentsThisMonth++;
        }
      }

      const avgTurnaroundHours = totalTurnaroundHours / totalAssessments;

      // Get AI assessments and quotes for each claim
      let fraudCasesDetected = 0;
      let fraudPrevented = 0;
      let highRiskCases = 0;
      let mediumRiskCases = 0;
      let initialEstimates = 0;
      let finalCosts = 0;

      for (const claim of assessments) {
        // Get KINGA assessment
        const aiAssessment = await getAiAssessmentByClaimId(claim.id, tenantId);
        if (aiAssessment) {
          if (aiAssessment.fraudRiskLevel === "high") {
            fraudCasesDetected++;
            highRiskCases++;
            fraudPrevented += aiAssessment.estimatedCost || 0;
          } else if (aiAssessment.fraudRiskLevel === "moderate") {
            fraudCasesDetected++;
            mediumRiskCases++;
            fraudPrevented += (aiAssessment.estimatedCost || 0) / 2;
          }
          finalCosts += aiAssessment.estimatedCost || 0;
        }

        // Get quotes
        const quotes = await getQuotesByClaimId(claim.id, tenantId);
        for (const quote of quotes) {
          initialEstimates += quote.quotedAmount || 0;
        }
      }

      const totalSavings = Math.max(0, initialEstimates - finalCosts);
      const savingsPercentage = initialEstimates > 0 ? (totalSavings / initialEstimates) * 100 : 0;

      return {
        totalAssessments,
        assessmentsThisMonth,
        avgTurnaroundHours,
        totalSavings,
        savingsPercentage,
        fraudCasesDetected,
        fraudPrevented,
        accuracyRate: 92.5, // Placeholder - would need actual verification data
        initialEstimates,
        turnaroundBreakdown: {
          under24,
          under48,
          over48,
        },
        fraudBreakdown: {
          high: highRiskCases,
          medium: mediumRiskCases,
        },
      };
    }),

  /**
   * Get Assessor Performance Dashboard
   * 
   * Returns performance metrics, recent assessments, and tier information
   * for the current assessor.
   * 
   * @requires Assessor role
   * @returns Performance dashboard data
   */
  getPerformanceDashboard: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "assessor" && ctx.user.role !== "admin") {
        throw new Error("Only assessors can access performance dashboard");
      }

      const { getDb } = await import("../db");
      const { users, claims, assessorEvaluations } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get assessor's current stats
      const assessorResult = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const assessor = assessorResult[0];

      if (!assessor) throw new Error("Assessor not found");

      // Get recent assessments
      const recentAssessments = await db
        .select()
        .from(assessorEvaluations)
        .where(eq(assessorEvaluations.assessorId, ctx.user.id))
        .orderBy(desc(assessorEvaluations.createdAt))
        .limit(10);

      // Get assigned claims
      const assignedClaims = await db
        .select()
        .from(claims)
        .where(eq(claims.assignedAssessorId, ctx.user.id))
        .orderBy(desc(claims.createdAt))
        .limit(20);

      // D-06: Compute throughput this week (assessments completed in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000);
      const throughputThisWeek = recentAssessments.filter((a: any) => {
        const ts = a.completedAt ?? a.createdAt;
        return ts && new Date(ts) >= sevenDaysAgo;
      }).length;

      return {
        tier: assessor.assessorTier || "free",
        tierActivatedAt: assessor.tierActivatedAt,
        tierExpiresAt: assessor.tierExpiresAt,
        performanceScore: assessor.performanceScore || 70,
        totalAssessmentsCompleted: assessor.totalAssessmentsCompleted || 0,
        averageVarianceFromFinal: assessor.averageVarianceFromFinal,
        // D-06: New fields for Throughput and Avg Assessment Time KPIs
        throughputThisWeek,
        avgCompletionTimeHours: assessor.avgCompletionTime ? Number(assessor.avgCompletionTime) : null,
        recentAssessments,
        assignedClaims,
      };
    }),

  /**
   * Get Assessor Leaderboard
   * 
   * Returns all assessors ranked by performance score
   * 
   * @returns Leaderboard data with rankings
   */
  getLeaderboard: protectedProcedure
    .query(async () => {
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get all assessors ordered by performance score
      const assessors = await db
        .select({
          id: users.id,
          name: users.name,
          tier: users.assessorTier,
          performanceScore: users.performanceScore,
          accuracyScore: users.accuracyScore,
          avgCompletionTime: users.avgCompletionTime,
          totalAssessments: users.totalAssessmentsCompleted,
        })
        .from(users)
        .where(eq(users.role, "assessor"))
        .orderBy(desc(users.performanceScore));

      return assessors;
    }),
  /**
   * Get the assessor's own performance trend over time, broken down by insurer.
   * Uses assessorInsurerRelationships for per-insurer summary and
   * assessorEvaluations joined through claims for time-bucketed trend data.
   */
  getMyPerformanceTrend: protectedProcedure
    .input(z.object({
      period: z.enum(['weekly', 'monthly']).default('monthly'),
      tenantId: z.string().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const {
        users: usersTable,
        assessorEvaluations: evalsTable,
        assessorInsurerRelationships: relTable,
        claims: claimsTable,
        insurerTenants: tenantsTable,
      } = await import('../../drizzle/schema');
      const { eq: _eq, desc: _desc } = await import('drizzle-orm');
      // Per-insurer summary from assessorInsurerRelationships
      const relationships = await db
        .select({
          tenantId: relTable.tenantId,
          insurerDisplayName: tenantsTable.displayName,
          performanceRating: relTable.performanceRating,
          totalAssignmentsCompleted: relTable.totalAssignmentsCompleted,
          averageCompletionTimeHours: relTable.averageCompletionTimeHours,
          relationshipStatus: relTable.relationshipStatus,
        })
        .from(relTable)
        .leftJoin(tenantsTable, _eq(relTable.tenantId, tenantsTable.id))
        .where(_eq(relTable.assessorId, ctx.user.id));
      const insurers = relationships
        .filter(r => r.insurerDisplayName)
        .map(r => ({ tenantId: r.tenantId, displayName: r.insurerDisplayName! }));
      const byInsurer = relationships.map(r => ({
        tenantId: r.tenantId,
        displayName: r.insurerDisplayName || r.tenantId,
        totalAssignments: r.totalAssignmentsCompleted || 0,
        performanceRating: r.performanceRating ? Number(r.performanceRating) : null,
        avgCompletionTimeHours: r.averageCompletionTimeHours ? Number(r.averageCompletionTimeHours) : null,
        relationshipStatus: r.relationshipStatus,
      }));
      // Time-bucketed trend from evaluations
      const periodDays = input.period === 'weekly' ? 7 : 30;
      const lookbackDays = 12 * periodDays;
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const rawEvals = await db
        .select({
          id: evalsTable.id,
          estimatedRepairCost: evalsTable.estimatedRepairCost,
          status: evalsTable.status,
          createdAt: evalsTable.createdAt,
          claimTenantId: claimsTable.tenantId,
          finalApprovedAmount: claimsTable.finalApprovedAmount,
          insurerDisplayName: tenantsTable.displayName,
        })
        .from(evalsTable)
        .leftJoin(claimsTable, _eq(evalsTable.claimId, claimsTable.id))
        .leftJoin(tenantsTable, _eq(claimsTable.tenantId, tenantsTable.id))
        .where(_eq(evalsTable.assessorId, ctx.user.id))
        .orderBy(_desc(evalsTable.createdAt));
      const allEvals = rawEvals.filter(e => e.createdAt && new Date(e.createdAt) >= since && e.status === 'submitted');
      const filtered = input.tenantId ? allEvals.filter(e => e.claimTenantId === input.tenantId) : allEvals;
      // Bucket by period
      const bucketMap: Record<string, { label: string; evals: typeof filtered }> = {};
      for (const e of filtered) {
        const d = new Date(e.createdAt!);
        let key: string;
        if (input.period === 'weekly') {
          const startOfYear = new Date(d.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
          key = d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
        } else {
          key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        if (!bucketMap[key]) bucketMap[key] = { label: key, evals: [] };
        bucketMap[key].evals.push(e);
      }
      const trend = Object.entries(bucketMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, { label, evals: be }]) => {
          const total = be.length;
          const withVariance = be.filter(e => e.estimatedRepairCost && e.finalApprovedAmount && parseFloat(String(e.finalApprovedAmount)) > 0);
          const avgVariancePct = withVariance.length > 0
            ? Math.round(withVariance.reduce((s, e) => s + Math.abs(((e.estimatedRepairCost! - parseFloat(String(e.finalApprovedAmount!))) / parseFloat(String(e.finalApprovedAmount!))) * 100), 0) / withVariance.length)
            : null;
          return { label, totalAssessments: total, avgVariancePct };
        });
      const withVariance = filtered.filter(e => e.estimatedRepairCost && e.finalApprovedAmount && parseFloat(String(e.finalApprovedAmount)) > 0);
      const overallVariance = withVariance.length > 0
        ? Math.round(withVariance.reduce((s, e) => s + Math.abs(((e.estimatedRepairCost! - parseFloat(String(e.finalApprovedAmount!))) / parseFloat(String(e.finalApprovedAmount!))) * 100), 0) / withVariance.length)
        : null;
      return {
        insurers,
        byInsurer,
        trend,
        summary: { totalAssessments: filtered.length, overallAvgVariancePct: overallVariance },
      };
    }),

  // Get per-insurer relationship data for the logged-in assessor (external assessors)
  getMyInsurerRelationships: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const {
      assessors: assessorsTable,
      assessorInsurerRelationships: airTable,
      insurerTenants,
    } = await import('../../drizzle/schema');
    const { eq: _eq, and: _and, desc: _desc } = await import('drizzle-orm');

    const [assessor] = await db
      .select()
      .from(assessorsTable)
      .where(_eq(assessorsTable.userId, ctx.user.id))
      .limit(1);
    if (!assessor) return { relationships: [], assessor: null };

    const relationships = await db
      .select({
        id: airTable.id,
        tenantId: airTable.tenantId,
        insurerName: insurerTenants.displayName,
        relationshipType: airTable.relationshipType,
        relationshipStatus: airTable.relationshipStatus,
        contractStartDate: airTable.contractStartDate,
        contractedRatePerAssessment: airTable.contractedRatePerAssessment,
        performanceRating: airTable.performanceRating,
        totalAssignmentsCompleted: airTable.totalAssignmentsCompleted,
        totalAssignmentsRejected: airTable.totalAssignmentsRejected,
        averageCompletionTimeHours: airTable.averageCompletionTimeHours,
        isPreferredVendor: airTable.isPreferredVendor,
      })
      .from(airTable)
      .leftJoin(insurerTenants, _eq(airTable.tenantId, insurerTenants.id))
      .where(_and(
        _eq(airTable.assessorId, assessor.id),
        _eq(airTable.relationshipStatus, 'active'),
      ))
      .orderBy(_desc(airTable.totalAssignmentsCompleted));

    return {
      assessor: {
        id: assessor.id,
        assessorType: assessor.assessorType,
        certificationLevel: assessor.certificationLevel,
        performanceScore: assessor.performanceScore,
        totalAssessmentsCompleted: assessor.totalAssessmentsCompleted,
        averageAccuracyScore: assessor.averageAccuracyScore,
        averageTurnaroundHours: assessor.averageTurnaroundHours,
        averageRating: assessor.averageRating,
        totalMarketplaceEarnings: assessor.totalMarketplaceEarnings,
        pendingPayout: assessor.pendingPayout,
        marketplaceEnabled: assessor.marketplaceEnabled,
        marketplaceStatus: assessor.marketplaceStatus,
        specializations: assessor.specializations,
      },
      relationships,
    };
  }),
});
