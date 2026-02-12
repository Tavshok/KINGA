/**
 * Executive Analytics for KINGA
 * 
 * Provides comprehensive analytics and decision-making data for executives.
 * Includes KPIs, performance metrics, cost savings, and critical alerts.
 */

import { getDb } from "./db";
import { claims, users, aiAssessments, assessorEvaluations, panelBeaterQuotes, panelBeaters } from "../drizzle/schema";
import { eq, and, or, desc, sql, gt, lt } from "drizzle-orm";

/**
 * Global search across claims
 */
export async function globalSearch(query: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const searchTerm = `%${query}%`;

  // Search by vehicle registration, claim number, policy number, or claimant name
  const results = await db
    .select({
      claim: claims,
      claimant: users,
    })
    .from(claims)
    .leftJoin(users, eq(claims.claimantId, users.id))
    .where(
      or(
        sql`${claims.vehicleRegistration} LIKE ${searchTerm}`,
        sql`${claims.claimNumber} LIKE ${searchTerm}`,
        sql`${claims.policyNumber} LIKE ${searchTerm}`,
        sql`${users.name} LIKE ${searchTerm}`
      )
    )
    .limit(50);

  return results.map(({ claim, claimant }) => ({
    ...claim,
    claimantName: claimant?.name,
    claimantEmail: claimant?.email,
  }));
}

/**
 * Get Executive KPIs
 */
export async function getExecutiveKPIs() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Total claims
  const [totalClaimsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(claims);
  const totalClaims = Number(totalClaimsResult?.count || 0);

  // Completed claims
  const [completedClaimsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(claims)
    .where(eq(claims.status, "completed"));
  const completedClaims = Number(completedClaimsResult?.count || 0);

  // Total fraud detected (high risk)
  const [fraudDetectedResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(aiAssessments)
    .where(eq(aiAssessments.fraudRiskLevel, "high"));
  const fraudDetected = Number(fraudDetectedResult?.count || 0);

  // Average processing time (created to closed)
  const [avgProcessingResult] = await db
    .select({
      avgDays: sql<number>`AVG(TIMESTAMPDIFF(DAY, ${claims.createdAt}, ${claims.closedAt}))`,
    })
    .from(claims)
    .where(and(
      eq(claims.status, "completed"),
      sql`${claims.closedAt} IS NOT NULL`
    ));
  const avgProcessingTime = Number(avgProcessingResult?.avgDays || 0);

  // Total savings (AI estimated vs approved amount)
  const savingsData = await db
    .select({
      aiEstimate: aiAssessments.estimatedCost,
      approvedAmount: claims.approvedAmount,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(and(
      sql`${claims.approvedAmount} IS NOT NULL`,
      sql`${aiAssessments.estimatedCost} IS NOT NULL`
    ));

  const totalSavings = savingsData.reduce((sum, row) => {
    const aiEstimate = Number(row.aiEstimate || 0);
    const approved = Number(row.approvedAmount || 0);
    return sum + Math.max(0, aiEstimate - approved);
  }, 0);

  // High-value claims count (>$10k)
  const [highValueResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(aiAssessments)
    .where(gt(aiAssessments.estimatedCost, 1000000)); // $10k in cents
  const highValueClaims = Number(highValueResult?.count || 0);

  return {
    totalClaims,
    completedClaims,
    activeClaims: totalClaims - completedClaims,
    fraudDetected,
    avgProcessingTime: Math.round(avgProcessingTime * 10) / 10, // Round to 1 decimal
    totalSavings: Math.round(totalSavings / 100), // Convert to dollars
    highValueClaims,
    completionRate: totalClaims > 0 ? Math.round((completedClaims / totalClaims) * 100) : 0,
  };
}

/**
 * Get Critical Alerts
 */
export async function getCriticalAlerts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // High-value claims pending approval
  const highValuePending = await db
    .select({
      claim: claims,
      aiAssessment: aiAssessments,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(and(
      or(
        eq(claims.workflowState, "technical_approval"),
        eq(claims.workflowState, "financial_decision")
      ),
      gt(aiAssessments.estimatedCost, 1000000)
    ))
    .limit(10);

  // High fraud risk claims
  const highFraudRisk = await db
    .select({
      claim: claims,
      aiAssessment: aiAssessments,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(and(
      eq(aiAssessments.fraudRiskLevel, "high"),
      sql`${claims.status} NOT IN ('completed', 'rejected')`
    ))
    .limit(10);

  // Disputed claims
  const disputedClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.workflowState, "disputed"))
    .limit(10);

  // Claims stuck in workflow (>7 days in same state)
  const stuckClaims = await db
    .select()
    .from(claims)
    .where(and(
      sql`${claims.status} NOT IN ('completed', 'rejected')`,
      sql`TIMESTAMPDIFF(DAY, ${claims.updatedAt}, NOW()) > 7`
    ))
    .limit(10);

  return {
    highValuePending: highValuePending.map(r => ({ ...r.claim, estimatedCost: r.aiAssessment?.estimatedCost })),
    highFraudRisk: highFraudRisk.map(r => ({ ...r.claim, fraudRiskLevel: r.aiAssessment?.fraudRiskLevel })),
    disputedClaims,
    stuckClaims,
    totalAlerts: highValuePending.length + highFraudRisk.length + disputedClaims.length + stuckClaims.length,
  };
}

/**
 * Get Assessor Performance Analytics
 */
export async function getAssessorPerformance() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const assessors = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      performanceScore: users.performanceScore,
      totalAssessments: users.totalAssessmentsCompleted,
      accuracyScore: users.accuracyScore,
      avgCompletionTime: users.avgCompletionTime,
      tier: users.assessorTier,
    })
    .from(users)
    .where(eq(users.role, "assessor"))
    .orderBy(desc(users.performanceScore));

  return assessors;
}

/**
 * Get Panel Beater Analytics
 */
export async function getPanelBeaterAnalytics() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const beaterStats = await db
    .select({
      id: panelBeaters.id,
      name: panelBeaters.businessName,
      totalQuotes: sql<number>`COUNT(${panelBeaterQuotes.id})`,
      avgQuoteAmount: sql<number>`AVG(${panelBeaterQuotes.quotedAmount})`,
      acceptedQuotes: sql<number>`SUM(CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} THEN 1 ELSE 0 END)`,
    })
    .from(panelBeaters)
    .leftJoin(panelBeaterQuotes, eq(panelBeaters.id, panelBeaterQuotes.panelBeaterId))
    .leftJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
    .groupBy(panelBeaters.id, panelBeaters.businessName)
    .orderBy(desc(sql`COUNT(${panelBeaterQuotes.id})`));

  return beaterStats.map(stat => ({
    ...stat,
    totalQuotes: Number(stat.totalQuotes || 0),
    avgQuoteAmount: Math.round(Number(stat.avgQuoteAmount || 0) / 100), // Convert to dollars
    acceptedQuotes: Number(stat.acceptedQuotes || 0),
    acceptanceRate: Number(stat.totalQuotes || 0) > 0 
      ? Math.round((Number(stat.acceptedQuotes || 0) / Number(stat.totalQuotes || 0)) * 100)
      : 0,
  }));
}

/**
 * Get Cost Savings Trends (last 6 months)
 */
export async function getCostSavingsTrends() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const trends = await db
    .select({
      month: sql<string>`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`,
      totalAiEstimate: sql<number>`SUM(${aiAssessments.estimatedCost})`,
      totalApproved: sql<number>`SUM(${claims.approvedAmount})`,
      claimCount: sql<number>`COUNT(${claims.id})`,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(and(
      sql`${claims.approvedAmount} IS NOT NULL`,
      sql`${aiAssessments.estimatedCost} IS NOT NULL`,
      sql`${claims.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`
    ))
    .groupBy(sql`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`);

  return trends.map(trend => ({
    month: trend.month,
    savings: Math.round((Number(trend.totalAiEstimate || 0) - Number(trend.totalApproved || 0)) / 100),
    claimCount: Number(trend.claimCount || 0),
    avgSavingsPerClaim: Number(trend.claimCount || 0) > 0
      ? Math.round(((Number(trend.totalAiEstimate || 0) - Number(trend.totalApproved || 0)) / Number(trend.claimCount || 0)) / 100)
      : 0,
  }));
}

/**
 * Get Workflow Bottleneck Analysis
 */
export async function getWorkflowBottlenecks() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const bottlenecks = await db
    .select({
      workflowState: claims.workflowState,
      count: sql<number>`COUNT(*)`,
      avgDaysInState: sql<number>`AVG(TIMESTAMPDIFF(DAY, ${claims.updatedAt}, NOW()))`,
    })
    .from(claims)
    .where(sql`${claims.status} NOT IN ('completed', 'rejected')`)
    .groupBy(claims.workflowState)
    .orderBy(desc(sql<number>`AVG(TIMESTAMPDIFF(DAY, ${claims.updatedAt}, NOW()))`));

  return bottlenecks.map(b => ({
    state: b.workflowState,
    count: Number(b.count || 0),
    avgDaysInState: Math.round(Number(b.avgDaysInState || 0) * 10) / 10,
  }));
}

/**
 * Get Financial Overview
 */
export async function getFinancialOverview() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Total payouts
  const [payoutsResult] = await db
    .select({
      total: sql<number>`SUM(${claims.approvedAmount})`,
    })
    .from(claims)
    .where(sql`${claims.approvedAmount} IS NOT NULL`);
  const totalPayouts = Math.round(Number(payoutsResult?.total || 0) / 100);

  // Total reserves (pending claims estimated cost)
  const [reservesResult] = await db
    .select({
      total: sql<number>`SUM(${aiAssessments.estimatedCost})`,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(and(
      sql`${claims.status} NOT IN ('completed', 'rejected')`,
      sql`${aiAssessments.estimatedCost} IS NOT NULL`
    ));
  const totalReserves = Math.round(Number(reservesResult?.total || 0) / 100);

  // Fraud prevented (high fraud risk claims rejected)
  const [fraudPreventedResult] = await db
    .select({
      total: sql<number>`SUM(${aiAssessments.estimatedCost})`,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(and(
      eq(claims.status, "rejected"),
      eq(aiAssessments.fraudRiskLevel, "high")
    ));
  const fraudPrevented = Math.round(Number(fraudPreventedResult?.total || 0) / 100);

  return {
    totalPayouts,
    totalReserves,
    fraudPrevented,
    netExposure: totalPayouts + totalReserves,
  };
}


/**
 * Get Claims Volume Over Time
 * Returns daily claim counts for the specified period
 */
export async function getClaimsVolumeOverTime(days: number = 30) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const results = await db
    .select({
      date: sql<string>`DATE(${claims.createdAt})`,
      total: sql<number>`COUNT(*)`,
      fraudDetected: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) > 70 THEN 1 ELSE 0 END)`,
      avgFraudScore: sql<number>`AVG(COALESCE(${claims.fraudRiskScore}, 0))`,
    })
    .from(claims)
    .where(gt(claims.createdAt, startDate))
    .groupBy(sql`DATE(${claims.createdAt})`)
    .orderBy(sql`DATE(${claims.createdAt})`);

  return results.map((r) => ({
    date: r.date,
    total: Number(r.total),
    fraudDetected: Number(r.fraudDetected),
    avgFraudScore: Number(r.avgFraudScore || 0),
  }));
}

/**
 * Get Fraud Detection Rate Trends
 * Returns fraud detection metrics over time
 */
export async function getFraudDetectionTrends(days: number = 30) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const results = await db
    .select({
      date: sql<string>`DATE(${claims.createdAt})`,
      totalClaims: sql<number>`COUNT(*)`,
      lowRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) < 30 THEN 1 ELSE 0 END)`,
      mediumRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 30 AND COALESCE(${claims.fraudRiskScore}, 0) < 70 THEN 1 ELSE 0 END)`,
      highRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 70 THEN 1 ELSE 0 END)`,
      avgScore: sql<number>`AVG(COALESCE(${claims.fraudRiskScore}, 0))`,
    })
    .from(claims)
    .where(gt(claims.createdAt, startDate))
    .groupBy(sql`DATE(${claims.createdAt})`)
    .orderBy(sql`DATE(${claims.createdAt})`);

  return results.map((r) => ({
    date: r.date,
    totalClaims: Number(r.totalClaims),
    lowRisk: Number(r.lowRisk),
    mediumRisk: Number(r.mediumRisk),
    highRisk: Number(r.highRisk),
    avgScore: Number(r.avgScore || 0),
    fraudRate: Number(r.totalClaims) > 0 ? (Number(r.highRisk) / Number(r.totalClaims)) * 100 : 0,
  }));
}

/**
 * Get Cost Breakdown By Status
 * Returns cost analysis grouped by claim status
 */
export async function getCostBreakdownByStatus() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Join with aiAssessments to get estimated costs
  const results = await db
    .select({
      status: sql<string>`${claims.status}`,
      count: sql<number>`COUNT(DISTINCT ${claims.id})`,
      totalEstimatedCost: sql<number>`SUM(COALESCE(${aiAssessments.estimatedCost}, 0))`,
      avgEstimatedCost: sql<number>`AVG(COALESCE(${aiAssessments.estimatedCost}, 0))`,
      totalApprovedAmount: sql<number>`SUM(COALESCE(${claims.approvedAmount}, 0))`,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .groupBy(sql`${claims.status}`);

  return results.map((r) => ({
    status: r.status || "unknown",
    count: Number(r.count),
    totalEstimatedCost: Number(r.totalEstimatedCost || 0),
    avgEstimatedCost: Number(r.avgEstimatedCost || 0),
    totalApprovedAmount: Number(r.totalApprovedAmount || 0),
  }));
}

/**
 * Get Average Processing Time By Status
 * Returns average time spent in each claim status
 */
export async function getAverageProcessingTime() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Calculate average time from creation to completion for completed claims
  const [completedResult] = await db
    .select({
      avgDays: sql<number>`AVG(DATEDIFF(${claims.closedAt}, ${claims.createdAt}))`,
    })
    .from(claims)
    .where(eq(claims.status, "completed"));

  // Calculate average time for pending triage
  const [triageResult] = await db
    .select({
      avgDays: sql<number>`AVG(DATEDIFF(NOW(), ${claims.createdAt}))`,
    })
    .from(claims)
    .where(eq(claims.status, "triage"));

  // Calculate average time for under assessment
  const [assessmentResult] = await db
    .select({
      avgDays: sql<number>`AVG(DATEDIFF(NOW(), ${claims.createdAt}))`,
    })
    .from(claims)
    .where(eq(claims.status, "assessment_in_progress"));

  // Calculate average time for awaiting approval
  const [approvalResult] = await db
    .select({
      avgDays: sql<number>`AVG(DATEDIFF(NOW(), ${claims.createdAt}))`,
    })
    .from(claims)
    .where(eq(claims.status, "quotes_pending"));

  return {
    completed: Number(completedResult?.avgDays || 0),
    pendingTriage: Number(triageResult?.avgDays || 0),
    underAssessment: Number(assessmentResult?.avgDays || 0),
    awaitingApproval: Number(approvalResult?.avgDays || 0),
  };
}

/**
 * Get Fraud Risk Distribution
 * Returns distribution of claims by fraud risk level
 */
export async function getFraudRiskDistribution() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [results] = await db
    .select({
      lowRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) < 30 THEN 1 ELSE 0 END)`,
      mediumRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 30 AND COALESCE(${claims.fraudRiskScore}, 0) < 70 THEN 1 ELSE 0 END)`,
      highRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 70 THEN 1 ELSE 0 END)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(claims);

  return {
    lowRisk: Number(results?.lowRisk || 0),
    mediumRisk: Number(results?.mediumRisk || 0),
    highRisk: Number(results?.highRisk || 0),
    total: Number(results?.total || 0),
  };
}
