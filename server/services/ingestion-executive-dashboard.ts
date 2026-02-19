// @ts-nocheck
/**
 * Executive Dashboard Service for Historical Claims Ingestion
 * Provides high-level metrics and insights for executive oversight
 */

import { getDb } from "../db";
import { 
  ingestionBatches,
  historicalClaims,
  trainingDataset,
  claimReviewQueue,
  biasDetectionFlags
} from "../../drizzle/schema";
import { eq, and, sql, gte, desc } from "drizzle-orm";

const db = await getDb();

export interface IngestionDashboardMetrics {
  // Batch statistics
  totalBatches: number;
  activeBatches: number;
  completedBatches: number;
  failedBatches: number;
  
  // Claims statistics
  totalClaimsIngested: number;
  claimsInTrainingDataset: number;
  claimsPendingReview: number;
  claimsRejected: number;
  
  // Confidence distribution
  highConfidenceClaims: number;
  mediumConfidenceClaims: number;
  lowConfidenceClaims: number;
  
  // Bias detection summary
  totalBiasFlags: number;
  highSeverityBiasFlags: number;
  mediumSeverityBiasFlags: number;
  lowSeverityBiasFlags: number;
  
  // Processing metrics
  avgExtractionTimeSeconds: number | null;
  avgReviewTimeSeconds: number | null;
  
  // Data quality
  dataQualityScore: number; // 0-100
  completenessRate: number; // Percentage of claims with complete data
}

export interface BatchSummary {
  id: number;
  uploadedBy: string;
  uploadedAt: Date;
  status: string;
  totalDocuments: number;
  processedDocuments: number;
  claimsExtracted: number;
  biasFlags: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Get comprehensive ingestion metrics for executive dashboard
 */
export async function getIngestionDashboardMetrics(params: {
  tenantId: string;
}): Promise<IngestionDashboardMetrics> {
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Batch statistics
  const batchStats = await db.select({
    totalBatches: sql<number>`count(*)::int`,
    activeBatches: sql<number>`sum(case when status = 'processing' then 1 else 0 end)::int`,
    completedBatches: sql<number>`sum(case when status = 'completed' then 1 else 0 end)::int`,
    failedBatches: sql<number>`sum(case when status = 'failed' then 1 else 0 end)::int`,
  })
    .from(ingestionBatches)
    .where(eq(ingestionBatches.tenantId, params.tenantId));
  
  // Claims statistics
  const claimStats = await db.select({
    totalClaimsIngested: sql<number>`count(*)::int`,
  })
    .from(historicalClaims)
    .where(eq(historicalClaims.tenantId, params.tenantId));
  
  const trainingDatasetCount = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(trainingDataset)
    .where(eq(trainingDataset.tenantId, params.tenantId));
  
  const pendingReviewCount = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(claimReviewQueue)
    .where(
      and(
        eq(claimReviewQueue.tenantId, params.tenantId),
        eq(claimReviewQueue.reviewStatus, "pending_review")
      )
    );
  
  const rejectedCount = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(claimReviewQueue)
    .where(
      and(
        eq(claimReviewQueue.tenantId, params.tenantId),
        eq(claimReviewQueue.reviewStatus, "rejected")
      )
    );
  
  // Confidence distribution
  const confidenceDistribution = await db.select({
    high: sql<number>`sum(case when confidence_score >= 80 then 1 else 0 end)::int`,
    medium: sql<number>`sum(case when confidence_score >= 50 and confidence_score < 80 then 1 else 0 end)::int`,
    low: sql<number>`sum(case when confidence_score < 50 then 1 else 0 end)::int`,
  })
    .from(historicalClaims)
    .where(eq(historicalClaims.tenantId, params.tenantId));
  
  // Bias detection summary
  const biasStats = await db.select({
    totalBiasFlags: sql<number>`count(*)::int`,
    highSeverityBiasFlags: sql<number>`sum(case when severity = 'high' then 1 else 0 end)::int`,
    mediumSeverityBiasFlags: sql<number>`sum(case when severity = 'medium' then 1 else 0 end)::int`,
    lowSeverityBiasFlags: sql<number>`sum(case when severity = 'low' then 1 else 0 end)::int`,
  })
    .from(biasDetectionFlags)
    .where(eq(biasDetectionFlags.tenantId, params.tenantId));
  
  // Processing metrics
  const processingMetrics = await db.select({
    avgExtractionTime: sql<number>`avg(extract(epoch from (completed_at - uploaded_at)))::int`,
  })
    .from(ingestionBatches)
    .where(
      and(
        eq(ingestionBatches.tenantId, params.tenantId),
        eq(ingestionBatches.status, "completed")
      )
    );
  
  const reviewMetrics = await db.select({
    avgReviewTime: sql<number>`avg(extract(epoch from (reviewed_at - created_at)))::int`,
  })
    .from(claimReviewQueue)
    .where(
      and(
        eq(claimReviewQueue.tenantId, params.tenantId),
        sql`reviewed_at IS NOT NULL`
      )
    );
  
  // Data quality calculation
  const totalClaims = claimStats[0]?.totalClaimsIngested || 0;
  const highConfidence = confidenceDistribution[0]?.high || 0;
  const dataQualityScore = totalClaims > 0 
    ? Math.round((highConfidence / totalClaims) * 100) 
    : 0;
  
  const completenessRate = totalClaims > 0
    ? Math.round(((highConfidence + (confidenceDistribution[0]?.medium || 0)) / totalClaims) * 100)
    : 0;
  
  return {
    totalBatches: batchStats[0]?.totalBatches || 0,
    activeBatches: batchStats[0]?.activeBatches || 0,
    completedBatches: batchStats[0]?.completedBatches || 0,
    failedBatches: batchStats[0]?.failedBatches || 0,
    
    totalClaimsIngested: totalClaims,
    claimsInTrainingDataset: trainingDatasetCount[0]?.count || 0,
    claimsPendingReview: pendingReviewCount[0]?.count || 0,
    claimsRejected: rejectedCount[0]?.count || 0,
    
    highConfidenceClaims: highConfidence,
    mediumConfidenceClaims: confidenceDistribution[0]?.medium || 0,
    lowConfidenceClaims: confidenceDistribution[0]?.low || 0,
    
    totalBiasFlags: biasStats[0]?.totalBiasFlags || 0,
    highSeverityBiasFlags: biasStats[0]?.highSeverityBiasFlags || 0,
    mediumSeverityBiasFlags: biasStats[0]?.mediumSeverityBiasFlags || 0,
    lowSeverityBiasFlags: biasStats[0]?.lowSeverityBiasFlags || 0,
    
    avgExtractionTimeSeconds: processingMetrics[0]?.avgExtractionTime || null,
    avgReviewTimeSeconds: reviewMetrics[0]?.avgReviewTime || null,
    
    dataQualityScore,
    completenessRate,
  };
}

/**
 * Get recent batch summaries
 */
export async function getRecentBatches(params: {
  tenantId: string;
  limit?: number;
}): Promise<BatchSummary[]> {
  if (!db) {
    throw new Error("Database connection not available");
  }

  const limit = params.limit || 10;
  
  const batches = await db.select()
    .from(ingestionBatches)
    .where(eq(ingestionBatches.tenantId, params.tenantId))
    .orderBy(desc(ingestionBatches.uploadedAt))
    .limit(limit);
  
  const batchSummaries: BatchSummary[] = [];
  
  for (const batch of batches) {
    // Get claims count for this batch
    const claimsCount = await db.select({
      total: sql<number>`count(*)::int`,
      high: sql<number>`sum(case when confidence_score >= 80 then 1 else 0 end)::int`,
      medium: sql<number>`sum(case when confidence_score >= 50 and confidence_score < 80 then 1 else 0 end)::int`,
      low: sql<number>`sum(case when confidence_score < 50 then 1 else 0 end)::int`,
    })
      .from(historicalClaims)
      .where(eq(historicalClaims.batchId, batch.id));
    
    // Get bias flags count
    const biasCount = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(biasDetectionFlags)
      .where(eq(biasDetectionFlags.batchId, batch.id));
    
    batchSummaries.push({
      id: batch.id,
      uploadedBy: batch.uploadedBy,
      uploadedAt: batch.uploadedAt,
      status: batch.status,
      totalDocuments: batch.totalDocuments,
      processedDocuments: batch.processedDocuments,
      claimsExtracted: claimsCount[0]?.total || 0,
      biasFlags: biasCount[0]?.count || 0,
      confidenceDistribution: {
        high: claimsCount[0]?.high || 0,
        medium: claimsCount[0]?.medium || 0,
        low: claimsCount[0]?.low || 0,
      },
    });
  }
  
  return batchSummaries;
}

/**
 * Get bias detection trends over time
 */
export async function getBiasTrends(params: {
  tenantId: string;
  days?: number;
}): Promise<Array<{
  date: string;
  biasType: string;
  count: number;
  severity: string;
}>> {
  if (!db) {
    throw new Error("Database connection not available");
  }

  const days = params.days || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const trends = await db.select({
    date: sql<string>`DATE(created_at)`,
    biasType: biasDetectionFlags.biasType,
    severity: biasDetectionFlags.severity,
    count: sql<number>`count(*)::int`,
  })
    .from(biasDetectionFlags)
    .where(
      and(
        eq(biasDetectionFlags.tenantId, params.tenantId),
        gte(biasDetectionFlags.createdAt, startDate)
      )
    )
    .groupBy(sql`DATE(created_at)`, biasDetectionFlags.biasType, biasDetectionFlags.severity)
    .orderBy(sql`DATE(created_at) DESC`);
  
  return trends.map(t => ({
    date: t.date,
    biasType: t.biasType || "unknown",
    count: t.count,
    severity: t.severity || "low",
  }));
}
