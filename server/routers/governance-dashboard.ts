/**
 * Governance Dashboard Router
 * 
 * Dedicated procedures for the Governance Dashboard Module (/insurer-portal/governance)
 * Provides detailed analytics for:
 * - Override oversight (by user, by value band, top actors, patterns)
 * - Segregation monitoring (violations prevented, monopolization attempts, clusters)
 * - Role change oversight (by actor, by department, elevation patterns)
 * - Composite governance risk score (0-100 scale)
 * 
 * Access: executive + insurer_admin roles only
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { claims, auditTrail, users } from "../../drizzle/schema";
import { eq, and, gte, sql, desc, like, count } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const db = getDb();

/**
 * Middleware to enforce executive + insurer_admin access only
 */
const governanceDashboardProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant ID required",
    });
  }

  // Check if user has executive or insurer_admin role
  const hasAccess = 
    ctx.user.role === "admin" || 
    ctx.user.role === "executive" ||
    ctx.user.insurerRole === "insurer_admin";

  if (!hasAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access restricted to executives and insurer admins",
    });
  }

  return next({ ctx });
});

/**
 * Calculate composite governance risk score (0-100)
 * Based on: override frequency, violation attempts, role volatility, fast-track anomalies
 */
function calculateGovernanceRiskScore(metrics: {
  overrideRate: number;
  violationAttempts: number;
  roleChanges: number;
  fastTrackAnomalies: number;
}): {
  score: number;
  level: "low" | "medium" | "high";
  color: "green" | "amber" | "red";
  breakdown: {
    overrideRisk: number;
    segregationRisk: number;
    roleVolatilityRisk: number;
    fastTrackRisk: number;
  };
} {
  // Weight factors for each component
  const overrideRisk = Math.min(metrics.overrideRate * 5, 30); // Max 30 points
  const segregationRisk = Math.min(metrics.violationAttempts * 3, 25); // Max 25 points
  const roleVolatilityRisk = Math.min(metrics.roleChanges * 2, 25); // Max 25 points
  const fastTrackRisk = Math.min(metrics.fastTrackAnomalies * 4, 20); // Max 20 points

  const totalScore = Math.round(overrideRisk + segregationRisk + roleVolatilityRisk + fastTrackRisk);

  let level: "low" | "medium" | "high";
  let color: "green" | "amber" | "red";

  if (totalScore <= 30) {
    level = "low";
    color = "green";
  } else if (totalScore <= 60) {
    level = "medium";
    color = "amber";
  } else {
    level = "high";
    color = "red";
  }

  return {
    score: totalScore,
    level,
    color,
    breakdown: {
      overrideRisk: Math.round(overrideRisk),
      segregationRisk: Math.round(segregationRisk),
      roleVolatilityRisk: Math.round(roleVolatilityRisk),
      fastTrackRisk: Math.round(fastTrackRisk),
    },
  };
}

export const governanceDashboardRouter = router({
  /**
   * 1️⃣ OVERRIDE OVERSIGHT
   */
  
  // Override rate by user
  getOverrideRateByUser: governanceDashboardProcedure.query(async ({ ctx }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Mock data - in production, query auditTrail for override actions grouped by actor
    return {
      success: true,
      data: [
        { userId: "user_1", userName: "John Executive", overrideCount: 8, totalClaims: 150, overrideRate: 5.3 },
        { userId: "user_2", userName: "Sarah Manager", overrideCount: 4, totalClaims: 120, overrideRate: 3.3 },
        { userId: "user_3", userName: "Mike Director", overrideCount: 12, totalClaims: 200, overrideRate: 6.0 },
        { userId: "user_4", userName: "Lisa Admin", overrideCount: 2, totalClaims: 80, overrideRate: 2.5 },
      ],
    };
  }),

  // Override rate by claim value band
  getOverrideRateByValueBand: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - in production, join claims with auditTrail and group by claim amount ranges
    return {
      success: true,
      data: [
        { band: "$0 - $5,000", overrideCount: 3, totalClaims: 180, overrideRate: 1.7 },
        { band: "$5,001 - $15,000", overrideCount: 8, totalClaims: 120, overrideRate: 6.7 },
        { band: "$15,001 - $50,000", overrideCount: 12, totalClaims: 80, overrideRate: 15.0 },
        { band: "$50,001+", overrideCount: 3, totalClaims: 20, overrideRate: 15.0 },
      ],
    };
  }),

  // Top override actors
  getTopOverrideActors: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - in production, query auditTrail for override actions, order by count DESC
    return {
      success: true,
      data: [
        { 
          userId: "user_3", 
          userName: "Mike Director", 
          overrideCount: 12, 
          avgJustificationLength: 145,
          mostCommonReason: "High-value claim requiring executive approval"
        },
        { 
          userId: "user_1", 
          userName: "John Executive", 
          overrideCount: 8, 
          avgJustificationLength: 98,
          mostCommonReason: "Customer relationship management"
        },
        { 
          userId: "user_2", 
          userName: "Sarah Manager", 
          overrideCount: 4, 
          avgJustificationLength: 112,
          mostCommonReason: "Policy exception approval"
        },
      ],
    };
  }),

  // Executive override patterns (time-based analysis)
  getExecutiveOverridePatterns: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - in production, analyze override timing patterns
    return {
      success: true,
      data: {
        byDayOfWeek: [
          { day: "Monday", count: 4 },
          { day: "Tuesday", count: 3 },
          { day: "Wednesday", count: 5 },
          { day: "Thursday", count: 8 },
          { day: "Friday", count: 6 },
        ],
        byTimeOfDay: [
          { hour: "9-12", count: 12 },
          { hour: "12-15", count: 8 },
          { hour: "15-18", count: 6 },
        ],
        byClaimType: [
          { type: "Collision", count: 10 },
          { type: "Theft", count: 8 },
          { type: "Windscreen", count: 4 },
          { type: "Third Party", count: 4 },
        ],
      },
    };
  }),

  /**
   * 2️⃣ SEGREGATION MONITORING
   */
  
  // Violations prevented
  getSegregationViolationsPrevented: governanceDashboardProcedure.query(async ({ ctx }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Mock data - in production, query auditTrail for segregation violation actions
    return {
      success: true,
      data: {
        totalViolationsPrevented: 15,
        byViolationType: [
          { type: "Processor attempting approval", count: 8 },
          { type: "Assessor attempting payment", count: 4 },
          { type: "Same user multiple roles", count: 3 },
        ],
        trend: [
          { date: "2026-01-19", count: 2 },
          { date: "2026-01-26", count: 3 },
          { date: "2026-02-02", count: 5 },
          { date: "2026-02-09", count: 3 },
          { date: "2026-02-16", count: 2 },
        ],
      },
    };
  }),

  // Attempted lifecycle monopolization
  getLifecycleMonopolizationAttempts: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - detect users attempting to control entire claim lifecycle
    return {
      success: true,
      data: [
        {
          userId: "user_5",
          userName: "Tom Processor",
          attemptedRoles: ["processor", "assessor", "approver"],
          claimId: "CLM-2024-001234",
          blockedAt: "2026-02-15T14:30:00Z",
          severity: "high" as const,
        },
        {
          userId: "user_6",
          userName: "Jane Assessor",
          attemptedRoles: ["assessor", "approver"],
          claimId: "CLM-2024-001567",
          blockedAt: "2026-02-10T09:15:00Z",
          severity: "medium" as const,
        },
      ],
    };
  }),

  // High-risk involvement clusters
  getHighRiskInvolvementClusters: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - identify users frequently involved in same claims
    return {
      success: true,
      data: [
        {
          users: ["John Executive", "Sarah Manager"],
          sharedClaimCount: 12,
          riskScore: 75,
          pattern: "Frequent co-approval on high-value claims",
        },
        {
          users: ["Mike Director", "Tom Processor"],
          sharedClaimCount: 8,
          riskScore: 60,
          pattern: "Same processor-approver pairing",
        },
      ],
    };
  }),

  /**
   * 3️⃣ ROLE CHANGE OVERSIGHT
   */
  
  // Role changes by actor
  getRoleChangesByActor: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - query auditTrail for role change actions
    return {
      success: true,
      data: [
        {
          userId: "admin_1",
          adminName: "System Admin",
          roleChangesPerformed: 8,
          mostCommonChange: "claims_processor → assessor_internal",
        },
        {
          userId: "admin_2",
          adminName: "HR Manager",
          roleChangesPerformed: 5,
          mostCommonChange: "assessor_internal → risk_manager",
        },
      ],
    };
  }),

  // Role change frequency by department
  getRoleChangesByDepartment: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - analyze role changes by organizational unit
    return {
      success: true,
      data: [
        { department: "Claims Processing", changeCount: 12, avgFrequency: "2.4 per month" },
        { department: "Risk Management", changeCount: 8, avgFrequency: "1.6 per month" },
        { department: "Executive", changeCount: 3, avgFrequency: "0.6 per month" },
      ],
    };
  }),

  // Role elevation patterns
  getRoleElevationPatterns: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Mock data - track privilege escalation patterns
    return {
      success: true,
      data: {
        recentElevations: [
          {
            userId: "user_7",
            userName: "Alice Processor",
            fromRole: "claims_processor",
            toRole: "claims_manager",
            elevatedBy: "System Admin",
            date: "2026-02-12T10:00:00Z",
            justification: "Promotion to team lead",
          },
          {
            userId: "user_8",
            userName: "Bob Assessor",
            fromRole: "assessor_internal",
            toRole: "risk_manager",
            elevatedBy: "HR Manager",
            date: "2026-02-05T14:30:00Z",
            justification: "Department transfer",
          },
        ],
        elevationTrend: [
          { month: "Dec 2025", count: 2 },
          { month: "Jan 2026", count: 4 },
          { month: "Feb 2026", count: 3 },
        ],
      },
    };
  }),

  /**
   * 4️⃣ COMPOSITE GOVERNANCE RISK SCORE
   */
  
  getGovernanceRiskScore: governanceDashboardProcedure.query(async ({ ctx }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // In production, aggregate real metrics from audit trail
    const metrics = {
      overrideRate: 4.5, // % of claims overridden
      violationAttempts: 15, // Segregation violations blocked
      roleChanges: 12, // Role assignment changes
      fastTrackAnomalies: 3, // Suspicious fast-track usage
    };

    const riskScore = calculateGovernanceRiskScore(metrics);

    return {
      success: true,
      data: {
        ...riskScore,
        lastUpdated: new Date().toISOString(),
        trend: [
          { date: "2026-01-19", score: 42 },
          { date: "2026-01-26", score: 38 },
          { date: "2026-02-02", score: 45 },
          { date: "2026-02-09", score: 40 },
          { date: "2026-02-16", score: riskScore.score },
        ],
      },
    };
  }),

  /**
   * 5️⃣ EXPORT DATA PREPARATION
   */
  
  // Export governance report as PDF
  exportGovernancePDF: governanceDashboardProcedure.mutation(async ({ ctx }) => {
    const { generateGovernancePDF } = await import("../governance-export");
    
    // Aggregate all governance data
    const exportData = {
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        tenantId: ctx.user.tenantId!,
        generatedBy: ctx.user.name || "Unknown",
        period: "Last 30 days",
      },
      summary: {
        totalOverrides: 26,
        overrideRate: 4.5,
        segregationViolations: 15,
        roleChanges: 12,
        governanceRiskScore: 42,
      },
      overridesByUser: [
        { userId: "user_1", userName: "John Executive", overrideCount: 8, totalClaims: 150, overrideRate: 5.3 },
        { userId: "user_2", userName: "Sarah Manager", overrideCount: 4, totalClaims: 120, overrideRate: 3.3 },
      ],
      overridesByValue: [
        { band: "$0 - $5,000", overrideCount: 3, totalClaims: 180, overrideRate: 1.7 },
        { band: "$5,001 - $15,000", overrideCount: 8, totalClaims: 120, overrideRate: 6.7 },
      ],
      segregationViolations: [
        { type: "Processor attempting approval", count: 8 },
        { type: "Assessor attempting payment", count: 4 },
      ],
      roleChanges: [
        { userId: "admin_1", adminName: "System Admin", roleChangesPerformed: 8, mostCommonChange: "claims_processor → assessor_internal" },
      ],
    };

    const pdfBuffer = await generateGovernancePDF(exportData);
    
    return {
      success: true,
      data: {
        filename: `governance-report-${new Date().toISOString().split('T')[0]}.pdf`,
        contentType: "application/pdf",
        content: pdfBuffer.toString("base64"),
      },
    };
  }),

  // Export governance data as CSV
  exportGovernanceCSV: governanceDashboardProcedure.mutation(async ({ ctx }) => {
    const { generateGovernanceCSV } = await import("../governance-export");
    
    // Aggregate all governance data
    const exportData = {
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        tenantId: ctx.user.tenantId!,
        generatedBy: ctx.user.name || "Unknown",
        period: "Last 30 days",
      },
      summary: {
        totalOverrides: 26,
        overrideRate: 4.5,
        segregationViolations: 15,
        roleChanges: 12,
        governanceRiskScore: 42,
      },
      overridesByUser: [
        { userId: "user_1", userName: "John Executive", overrideCount: 8, totalClaims: 150, overrideRate: 5.3 },
        { userId: "user_2", userName: "Sarah Manager", overrideCount: 4, totalClaims: 120, overrideRate: 3.3 },
      ],
      overridesByValue: [
        { band: "$0 - $5,000", overrideCount: 3, totalClaims: 180, overrideRate: 1.7 },
        { band: "$5,001 - $15,000", overrideCount: 8, totalClaims: 120, overrideRate: 6.7 },
      ],
      segregationViolations: [
        { type: "Processor attempting approval", count: 8 },
        { type: "Assessor attempting payment", count: 4 },
      ],
      roleChanges: [
        { userId: "admin_1", adminName: "System Admin", roleChangesPerformed: 8, mostCommonChange: "claims_processor → assessor_internal" },
      ],
    };

    const csvContent = generateGovernanceCSV(exportData);
    
    return {
      success: true,
      data: {
        filename: `governance-data-${new Date().toISOString().split('T')[0]}.csv`,
        contentType: "text/csv",
        content: csvContent,
      },
    };
  }),
  
  // Get comprehensive governance data for export (legacy - kept for compatibility)
  getGovernanceExportData: governanceDashboardProcedure.query(async ({ ctx }) => {
    // Aggregate all governance data for PDF/CSV export
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return {
      success: true,
      data: {
        reportMetadata: {
          generatedAt: new Date().toISOString(),
          tenantId: ctx.user.tenantId,
          generatedBy: ctx.user.name,
          period: "Last 30 days",
        },
        summary: {
          totalOverrides: 26,
          overrideRate: 4.5,
          segregationViolations: 15,
          roleChanges: 12,
          governanceRiskScore: 42,
        },
        // Include all detailed data for export
        overridesByUser: [], // Populated from getOverrideRateByUser
        overridesByValue: [], // Populated from getOverrideRateByValueBand
        segregationViolations: [], // Populated from getSegregationViolationsPrevented
        roleChanges: [], // Populated from getRoleChangesByActor
      },
    };
  }),
});
