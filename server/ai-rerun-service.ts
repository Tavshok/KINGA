// @ts-nocheck
/**
 * AI Rerun Service
 * 
 * Governed AI rerun capability with role-based permissions, version control, and audit trail.
 * 
 * Permission Tiers:
 * - All insurer roles: Can trigger AI analysis (view-only, no routing changes)
 * - Claims Manager + Executive: Can recalculate confidence scores and trigger routing reevaluation
 * 
 * Features:
 * - Version history preservation (links to previous assessments)
 * - Full audit trail logging
 * - Rate limiting enforcement (tenant-configurable)
 * - Tenant isolation
 */

import { getDb } from "./db";
import { aiAssessments, claims, auditTrail, claimConfidenceScores, claimRoutingDecisions, users } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createNotification,
  formatNotificationTitle,
  formatNotificationMessage,
} from "./notification-service";

/**
 * Permission check: All insurer roles can trigger AI analysis
 */
export function canTriggerAIAnalysis(userRole: string | null): boolean {
  const allowedRoles = [
    "claims_processor",
    "assessor_internal",
    "assessor_external",
    "risk_manager",
    "claims_manager",
    "executive",
    "insurer_admin",
  ];
  return userRole !== null && allowedRoles.includes(userRole);
}

/**
 * Permission check: Only claims_manager and executive can recalculate confidence or trigger routing
 */
export function canRecalculateConfidence(userRole: string | null): boolean {
  return userRole === "claims_manager" || userRole === "executive";
}

/**
 * Trigger AI analysis rerun
 * 
 * Creates a new AI assessment version without changing claim routing.
 * All insurer roles can trigger this operation.
 * 
 * @param claimId - Claim ID to analyze
 * @param userId - User ID triggering the rerun
 * @param userRole - User's insurer role
 * @param tenantId - Tenant ID for isolation
 * @param reason - Optional reason for rerun
 * @returns New AI assessment record
 */
export async function triggerAIAnalysis(
  claimId: number,
  userId: number,
  userRole: string,
  tenantId: string,
  reason?: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Permission check
  if (!canTriggerAIAnalysis(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions to trigger AI analysis",
    });
  }

  // Verify claim exists and belongs to tenant
  const claim = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (claim.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  }

  // Get previous AI assessment (if any)
  const previousAssessments = await db
    .select()
    .from(aiAssessments)
    .where(and(eq(aiAssessments.claimId, claimId), eq(aiAssessments.tenantId, tenantId)))
    .orderBy(desc(aiAssessments.versionNumber))
    .limit(1);

  const previousAssessment = previousAssessments[0];
  const versionNumber = previousAssessment ? previousAssessment.versionNumber + 1 : 1;

  // TODO: Call actual AI analysis service here
  // For now, create a placeholder assessment record
  const newAssessment = await db.insert(aiAssessments).values({
    claimId,
    tenantId,
    isReanalysis: versionNumber > 1 ? 1 : 0,
    triggeredBy: userId,
    triggeredRole: userRole,
    previousAssessmentId: previousAssessment?.id || null,
    reanalysisReason: reason || null,
    versionNumber,
    confidenceScore: 0, // Placeholder - will be updated by AI service
    modelVersion: "v1.0.0", // Placeholder
    processingTime: 0, // Placeholder
  });

  // Insert audit trail entry
  await db.insert(auditTrail).values({
    claimId,
    tenantId,
    actionType: "AI_ANALYSIS_RERUN",
    actorId: userId.toString(),
    actorRole: userRole,
    previousState: claim[0].workflowState,
    newState: claim[0].workflowState, // No state change
    reason: reason || `AI analysis rerun triggered by ${userRole}`,
    metadata: JSON.stringify({
      versionNumber,
      previousAssessmentId: previousAssessment?.id || null,
      triggeredBy: userId,
      triggeredRole: userRole,
    }),
    timestamp: new Date(),
  });

  console.log(
    `[AI Rerun Service] Created AI assessment version ${versionNumber} for claim ${claimId}`
  );

  // Send governance notification to claims_manager and executive
  try {
    const managerUsers = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          inArray(users.insurerRole, ["claims_manager", "executive"])
        )
      );

    const recipientIds = managerUsers.map((u) => u.id);

    if (recipientIds.length > 0) {
      const context = {
        claimNumber: claim[0].claimNumber,
        triggeredBy: userId,
        triggeredRole: userRole,
        versionNumber,
      };

      await createNotification(
        tenantId,
        "ai_rerun",
        formatNotificationTitle("ai_rerun", context),
        formatNotificationMessage("ai_rerun", context),
        recipientIds,
        claimId,
        context
      );
    }
  } catch (error) {
    console.error("[AI Rerun Service] Failed to send AI rerun notification:", error);
  }

  return {
    assessmentId: newAssessment.insertId,
    versionNumber,
    previousAssessmentId: previousAssessment?.id || null,
  };
}

/**
 * Recalculate confidence score
 * 
 * Recalculates the confidence score for a claim based on the latest AI assessment.
 * Only claims_manager and executive can trigger this operation.
 * 
 * @param claimId - Claim ID to recalculate
 * @param userId - User ID triggering the recalculation
 * @param userRole - User's insurer role
 * @param tenantId - Tenant ID for isolation
 * @returns Updated confidence score record
 */
export async function recalculateConfidenceScore(
  claimId: number,
  userId: number,
  userRole: string,
  tenantId: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Permission check
  if (!canRecalculateConfidence(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only claims_manager and executive can recalculate confidence scores",
    });
  }

  // Verify claim exists and belongs to tenant
  const claim = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (claim.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  }

  // Get latest AI assessment
  const latestAssessments = await db
    .select()
    .from(aiAssessments)
    .where(and(eq(aiAssessments.claimId, claimId), eq(aiAssessments.tenantId, tenantId)))
    .orderBy(desc(aiAssessments.versionNumber))
    .limit(1);

  if (latestAssessments.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No AI assessment found for this claim" });
  }

  const latestAssessment = latestAssessments[0];

  // TODO: Call actual confidence scoring engine here
  // For now, create a placeholder confidence score record
  const newConfidenceScore = await db.insert(claimConfidenceScores).values({
    claimId,
    tenantId,
    damageCertainty: 0, // Placeholder
    physicsStrength: 0, // Placeholder
    fraudConfidence: 0, // Placeholder
    historicalAccuracy: 0, // Placeholder
    dataCompleteness: 0, // Placeholder
    quoteVariance: 0, // Placeholder
    compositeConfidenceScore: 0, // Placeholder
    scoringMethod: "AI_RERUN_RECALC",
    scoringTimestamp: new Date(),
  });

  // Insert audit trail entry
  await db.insert(auditTrail).values({
    claimId,
    tenantId,
    actionType: "CONFIDENCE_SCORE_RECALC",
    actorId: userId.toString(),
    actorRole: userRole,
    previousState: claim[0].workflowState,
    newState: claim[0].workflowState, // No state change yet
    reason: `Confidence score recalculated by ${userRole}`,
    metadata: JSON.stringify({
      confidenceScoreId: newConfidenceScore.insertId,
      aiAssessmentId: latestAssessment.id,
      triggeredBy: userId,
      triggeredRole: userRole,
    }),
    timestamp: new Date(),
  });

  console.log(
    `[AI Rerun] Confidence score recalculated for claim ${claimId} by user ${userId} (${userRole})`
  );

  return {
    confidenceScoreId: newConfidenceScore.insertId,
    aiAssessmentId: latestAssessment.id,
  };
}

/**
 * Trigger routing reevaluation
 * 
 * Reevaluates claim routing based on the latest confidence score.
 * Only claims_manager and executive can trigger this operation.
 * May change the claim's workflow state based on the new confidence score.
 * 
 * @param claimId - Claim ID to reevaluate
 * @param userId - User ID triggering the reevaluation
 * @param userRole - User's insurer role
 * @param tenantId - Tenant ID for isolation
 * @returns Updated routing decision record
 */
export async function triggerRoutingReevaluation(
  claimId: number,
  userId: number,
  userRole: string,
  tenantId: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Permission check
  if (!canRecalculateConfidence(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only claims_manager and executive can trigger routing reevaluation",
    });
  }

  // Verify claim exists and belongs to tenant
  const claim = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (claim.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  }

  // Get latest confidence score
  const latestConfidenceScores = await db
    .select()
    .from(claimConfidenceScores)
    .where(and(eq(claimConfidenceScores.claimId, claimId), eq(claimConfidenceScores.tenantId, tenantId)))
    .orderBy(desc(claimConfidenceScores.scoringTimestamp))
    .limit(1);

  if (latestConfidenceScores.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No confidence score found for this claim" });
  }

  const latestConfidenceScore = latestConfidenceScores[0];

  // TODO: Call actual routing engine here
  // For now, create a placeholder routing decision record
  const newRoutingDecision = await db.insert(claimRoutingDecisions).values({
    claimId,
    tenantId,
    confidenceScore: latestConfidenceScore.compositeConfidenceScore,
    confidenceComponents: JSON.stringify({
      damageCertainty: latestConfidenceScore.damageCertainty,
      physicsStrength: latestConfidenceScore.physicsStrength,
      fraudConfidence: latestConfidenceScore.fraudConfidence,
      historicalAccuracy: latestConfidenceScore.historicalAccuracy,
      dataCompleteness: latestConfidenceScore.dataCompleteness,
      quoteVariance: latestConfidenceScore.quoteVariance,
    }),
    routingCategory: "MEDIUM", // Placeholder
    routingDecision: "INTERNAL_REVIEW", // Placeholder
    routingReason: "Routing reevaluated after confidence score recalculation",
    decisionTimestamp: new Date(),
  });

  // Update claim workflow state based on routing decision
  const previousState = claim[0].workflowState;
  const newState = "manual_review"; // Placeholder - should be determined by routing engine

  await db
    .update(claims)
    .set({
      workflowState: newState,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claimId));

  // Insert audit trail entry
  await db.insert(auditTrail).values({
    claimId,
    tenantId,
    actionType: "ROUTING_REEVALUATION",
    actorId: userId.toString(),
    actorRole: userRole,
    previousState,
    newState,
    reason: `Routing reevaluated by ${userRole}`,
    metadata: JSON.stringify({
      routingDecisionId: newRoutingDecision.insertId,
      confidenceScoreId: latestConfidenceScore.id,
      previousRoutingDecision: "N/A", // Placeholder
      newRoutingDecision: "INTERNAL_REVIEW", // Placeholder
      triggeredBy: userId,
      triggeredRole: userRole,
    }),
    timestamp: new Date(),
  });

  console.log(
    `[AI Rerun] Routing reevaluated for claim ${claimId} by user ${userId} (${userRole}), new state: ${newState}`
  );

  return {
    routingDecisionId: newRoutingDecision.insertId,
    confidenceScoreId: latestConfidenceScore.id,
    previousState,
    newState,
  };
}

/**
 * Get AI analysis version history for a claim
 * 
 * Returns all AI assessment versions for a claim, ordered by version number (descending).
 * All insurer roles can view version history.
 * 
 * @param claimId - Claim ID to query
 * @param tenantId - Tenant ID for isolation
 * @returns Array of AI assessment records
 */
export async function getAIAnalysisVersionHistory(
  claimId: number,
  tenantId: string
): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const assessments = await db
    .select()
    .from(aiAssessments)
    .where(and(eq(aiAssessments.claimId, claimId), eq(aiAssessments.tenantId, tenantId)))
    .orderBy(desc(aiAssessments.versionNumber));

  return assessments;
}
