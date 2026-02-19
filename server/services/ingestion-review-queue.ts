// @ts-nocheck
/**
 * Human Review Queue Service
 * Manages manual review and approval workflow for MEDIUM confidence historical claims
 */

import { getDb } from "../db";
import { 
  claimReviewQueue,
  historicalClaims,
  trainingDataset,
  isoAuditLogs
} from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

const db = await getDb();

export type ReviewDecision = "approve" | "reject" | "needs_correction";

export interface ReviewQueueItem {
  id: number;
  historicalClaimId: number;
  batchId: number;
  claimNumber: string;
  confidenceScore: number;
  confidenceCategory: string;
  flaggedIssues: string[];
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  decision: ReviewDecision | null;
  reviewerNotes: string | null;
  claimData: any;
}

/**
 * Add a claim to the human review queue
 */
export async function addToReviewQueue(params: {
  tenantId: string;
  historicalClaimId: number;
  batchId: number;
  confidenceScore: number;
  confidenceCategory: string;
  flaggedIssues: string[];
}): Promise<number> {
  const [inserted] = await db.insert(claimReviewQueue).values({
    tenantId: params.tenantId,
    historicalClaimId: params.historicalClaimId,
    routedReason: params.flaggedIssues.join(", "),
    reviewStatus: "pending_review",
  }).returning({ id: claimReviewQueue.id });
  
  return inserted.id;
}

/**
 * Get pending review queue items for a tenant
 */
export async function getPendingReviews(params: {
  tenantId: string;
  limit?: number;
  offset?: number;
}): Promise<ReviewQueueItem[]> {
  const limit = params.limit || 50;
  const offset = params.offset || 0;
  
  const items = await db.select({
    id: claimReviewQueue.id,
    historicalClaimId: claimReviewQueue.historicalClaimId,
    routedReason: claimReviewQueue.routedReason,
    reviewStatus: claimReviewQueue.reviewStatus,
    createdAt: claimReviewQueue.createdAt,
    reviewedAt: claimReviewQueue.reviewedAt,
    reviewedBy: claimReviewQueue.reviewedBy,
    reviewDecision: claimReviewQueue.reviewDecision,
    reviewNotes: claimReviewQueue.reviewNotes,
    claimNumber: historicalClaims.claimNumber,
    claimData: historicalClaims.rawExtractedData,
  })
    .from(claimReviewQueue)
    .innerJoin(
      historicalClaims,
      eq(claimReviewQueue.historicalClaimId, historicalClaims.id)
    )
    .where(
      and(
        eq(claimReviewQueue.tenantId, params.tenantId),
        eq(claimReviewQueue.reviewStatus, "pending_review")
      )
    )
    .orderBy(desc(claimReviewQueue.createdAt))
    .limit(limit)
    .offset(offset);
  
  return items.map(item => ({
    id: item.id,
    historicalClaimId: item.historicalClaimId,
    batchId: 0, // Not stored in schema
    claimNumber: item.claimNumber,
    confidenceScore: 0, // Not stored in schema
    confidenceCategory: "", // Not stored in schema
    flaggedIssues: item.routedReason ? item.routedReason.split(", ") : [],
    submittedAt: item.createdAt,
    reviewedAt: item.reviewedAt,
    reviewedBy: item.reviewedBy?.toString() || null,
    decision: item.reviewDecision as ReviewDecision | null,
    reviewerNotes: item.reviewNotes,
    claimData: item.claimData,
  }));
}

/**
 * Get review queue statistics
 */
export async function getReviewQueueStats(params: {
  tenantId: string;
}): Promise<{
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  needsCorrectionCount: number;
  avgReviewTime: number | null;
}> {
  const stats = await db.select({
    reviewDecision: claimReviewQueue.reviewDecision,
    count: sql<number>`count(*)::int`,
    avgReviewTime: sql<number>`avg(extract(epoch from (reviewed_at - created_at)))::int`,
  })
    .from(claimReviewQueue)
    .where(eq(claimReviewQueue.tenantId, params.tenantId))
    .groupBy(claimReviewQueue.reviewDecision);
  
  const result = {
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    needsCorrectionCount: 0,
    avgReviewTime: null as number | null,
  };
  
  stats.forEach(stat => {
    if (stat.reviewDecision === null) {
      result.pendingCount = stat.count;
    } else if (stat.reviewDecision === "approve") {
      result.approvedCount = stat.count;
      result.avgReviewTime = stat.avgReviewTime;
    } else if (stat.reviewDecision === "reject") {
      result.rejectedCount = stat.count;
    } else if (stat.reviewDecision === "request_more_info") {
      result.needsCorrectionCount = stat.count;
    }
  });
  
  return result;
}

/**
 * Submit a review decision
 */
export async function submitReviewDecision(params: {
  tenantId: string;
  reviewQueueId: number;
  reviewerId: string;
  reviewerName: string;
  decision: ReviewDecision;
  reviewerNotes?: string;
}): Promise<void> {
  // Get the review queue item
  if (!db) throw new Error("Database not available");
  const [queueItem] = await db.select()
    .from(claimReviewQueue)
    .where(
      and(
        eq(claimReviewQueue.id, params.reviewQueueId),
        eq(claimReviewQueue.tenantId, params.tenantId)
      )
    )
    .limit(1);
  
  if (!queueItem) {
    throw new Error("Review queue item not found");
  }
  
  if (queueItem.reviewDecision !== null) {
    throw new Error("This claim has already been reviewed");
  }
  
  if (!db) throw new Error("Database not available");
  // Update review queue with decision
  await db.update(claimReviewQueue)
    .set({
      reviewDecision: params.decision,
      reviewedBy: parseInt(params.reviewerId),
      reviewedAt: new Date(),
      reviewNotes: params.reviewerNotes || null,
      reviewStatus: params.decision === "approve" ? "approved" : "rejected",
    })
    .where(eq(claimReviewQueue.id, params.reviewQueueId));
  
  // If approved, move to training dataset
  if (params.decision === "approve") {
    if (!db) {
      throw new Error("Database connection not available");
    }

    const [claim] = await db.select()
      .from(historicalClaims)
      .where(eq(historicalClaims.id, queueItem.historicalClaimId))
      .limit(1);
    
    if (claim) {
      if (!db) {
        throw new Error("Database connection not available");
      }

      await db.insert(trainingDataset).values({
        tenantId: params.tenantId,
        historicalClaimId: claim.id,
        datasetVersion: "v1.0",
        includedBy: parseInt(params.reviewerId),
        inclusionReason: `Approved via human review queue - ${params.reviewerNotes || "No notes"}`,
      });
    }
  }
  
  // Audit log the decision
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const auditData = {
    decision: params.decision,
    historicalClaimId: queueItem.historicalClaimId,
    reviewerNotes: params.reviewerNotes,
  };
  const integrityHash = require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(auditData))
    .digest('hex');

  if (!db) {
    throw new Error("Database connection not available");
  }

  await db.insert(isoAuditLogs).values({
    id: auditId,
    tenantId: params.tenantId,
    userId: parseInt(params.reviewerId),
    userRole: "claims_manager",
    actionType: "approve",
    resourceType: "humanReviewQueue",
    resourceId: params.reviewQueueId.toString(),
    beforeState: null,
    afterState: JSON.stringify(auditData),
    ipAddress: null,
    sessionId: null,
    integrityHash,
  });
}

/**
 * Get review history for a specific claim
 */
export async function getClaimReviewHistory(params: {
  tenantId: string;
  historicalClaimId: number;
}): Promise<{
  reviewCount: number;
  latestDecision: ReviewDecision | null;
  reviewHistory: Array<{
    decision: ReviewDecision;
    reviewedBy: string;
    reviewedAt: Date;
    reviewerNotes: string | null;
  }>;
}> {
  if (!db) {
    throw new Error("Database connection not available");
  }

  const reviews = await db.select()
    .from(claimReviewQueue)
    .where(
      and(
        eq(claimReviewQueue.tenantId, params.tenantId),
        eq(claimReviewQueue.historicalClaimId, params.historicalClaimId)
      )
    )
    .orderBy(desc(claimReviewQueue.reviewedAt));
  
  const reviewedItems = reviews.filter(r => r.reviewDecision !== null);
  
  return {
    reviewCount: reviewedItems.length,
    latestDecision: reviewedItems.length > 0 ? reviewedItems[0].reviewDecision as ReviewDecision : null,
    reviewHistory: reviewedItems.map(r => ({
      decision: r.reviewDecision as ReviewDecision,
      reviewedBy: r.reviewedBy?.toString() || "Unknown",
      reviewedAt: r.reviewedAt!,
      reviewerNotes: r.reviewNotes,
    })),
  };
}

/**
 * Bulk approve claims (for high-confidence batches after spot-check)
 */
export async function bulkApproveReviews(params: {
  tenantId: string;
  reviewQueueIds: number[];
  reviewerId: string;
  reviewerName: string;
  notes?: string;
}): Promise<{
  approvedCount: number;
  failedIds: number[];
}> {
  let approvedCount = 0;
  const failedIds: number[] = [];
  
  if (!db) {
    throw new Error("Database connection not available");
  }

  for (const queueId of params.reviewQueueIds) {
    try {
      await submitReviewDecision({
        tenantId: params.tenantId,
        reviewQueueId: queueId,
        reviewerId: params.reviewerId,
        reviewerName: params.reviewerName,
        decision: "approve",
        reviewerNotes: params.notes,
      });
      approvedCount++;
    } catch (error) {
      failedIds.push(queueId);
    }
  }
  
  return {
    approvedCount,
    failedIds,
  };
}
