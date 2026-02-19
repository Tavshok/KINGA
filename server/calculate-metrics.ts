// @ts-nocheck
/**
 * Metric Calculation Scripts
 * 
 * Background jobs to calculate and update performance metrics for assessors,
 * panel beaters, and other analytics.
 */

import { getDb } from "./db";
import { users, assessorEvaluations, panelBeaterQuotes, claims, aiAssessments } from "../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

/**
 * Calculate Assessor Performance Metrics
 * 
 * Updates performance scores, accuracy, and completion times for all assessors.
 */
export async function calculateAssessorMetrics() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  console.log("[Metrics] Calculating assessor performance metrics...");

  // Get all assessors
  const assessors = await db
    .select()
    .from(users)
    .where(eq(users.role, "assessor"));

  for (const assessor of assessors) {
    // Count total assessments by this assessor
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(assessorEvaluations)
      .where(eq(assessorEvaluations.assessorId, assessor.id));
    
    const totalAssessments = Number(countResult?.count || 0);
    if (totalAssessments === 0) continue;

    // Calculate simple performance score based on total assessments
    // More assessments = higher score (capped at 100)
    const performanceScore = Math.min(100, totalAssessments * 5);

    // Update assessor metrics
    await db
      .update(users)
      .set({
        performanceScore: sql`${Math.round(performanceScore)}`,
        totalAssessmentsCompleted: sql`${totalAssessments}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, assessor.id));

    console.log(`[Metrics] Updated assessor ${assessor.name}: score=${Math.round(performanceScore)}, assessments=${totalAssessments}`);
  }

  console.log(`[Metrics] Assessor metrics calculation complete. Updated ${assessors.length} assessors.`);
}

/**
 * Calculate Panel Beater Metrics
 * 
 * Updates quote statistics and acceptance rates for all panel beaters.
 */
export async function calculatePanelBeaterMetrics() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  console.log("[Metrics] Calculating panel beater metrics...");

  // This is handled in real-time by the executive analytics queries
  // No persistent storage needed as metrics are computed on-demand

  console.log("[Metrics] Panel beater metrics are computed on-demand from live data.");
}

/**
 * Calculate Fraud Analytics
 * 
 * Aggregates fraud detection statistics and trends.
 */
export async function calculateFraudAnalytics() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  console.log("[Metrics] Calculating fraud analytics...");

  // Get fraud statistics by risk level
  const fraudStats = await db
    .select({
      riskLevel: aiAssessments.fraudRiskLevel,
      count: sql<number>`COUNT(*)`,
      avgCost: sql<number>`AVG(${aiAssessments.estimatedCost})`,
    })
    .from(aiAssessments)
    .where(sql`${aiAssessments.fraudRiskLevel} IS NOT NULL`)
    .groupBy(sql`${aiAssessments.fraudRiskLevel}`);

  console.log("[Metrics] Fraud analytics:", fraudStats);

  // Get fraud trends by month
  const fraudTrends = await db
    .select({
      month: sql<string>`DATE_FORMAT(${aiAssessments.createdAt}, '%Y-%m')`,
      highRisk: sql<number>`SUM(CASE WHEN ${aiAssessments.fraudRiskLevel} = 'high' THEN 1 ELSE 0 END)`,
      mediumRisk: sql<number>`SUM(CASE WHEN ${aiAssessments.fraudRiskLevel} = 'medium' THEN 1 ELSE 0 END)`,
      lowRisk: sql<number>`SUM(CASE WHEN ${aiAssessments.fraudRiskLevel} = 'low' THEN 1 ELSE 0 END)`,
    })
    .from(aiAssessments)
    .where(sql`${aiAssessments.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`)
    .groupBy(sql`DATE_FORMAT(${aiAssessments.createdAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${aiAssessments.createdAt}, '%Y-%m')`);

  console.log("[Metrics] Fraud trends (last 6 months):", fraudTrends);

  console.log("[Metrics] Fraud analytics calculation complete.");
}

/**
 * Run all metric calculations
 */
export async function calculateAllMetrics() {
  console.log("[Metrics] Starting full metric calculation...");
  
  try {
    await calculateAssessorMetrics();
    await calculatePanelBeaterMetrics();
    await calculateFraudAnalytics();
    
    console.log("[Metrics] All metrics calculated successfully.");
  } catch (error) {
    console.error("[Metrics] Error calculating metrics:", error);
    throw error;
  }
}

// Run metrics calculation if executed directly
if (require.main === module) {
  calculateAllMetrics()
    .then(() => {
      console.log("[Metrics] Metric calculation complete. Exiting.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[Metrics] Fatal error:", error);
      process.exit(1);
    });
}
