// @ts-nocheck
/**
 * AI Rerun Service
 * 
 * Governed AI rerun capability with role-based permissions, version control, and audit trail.
 * 
 * Permission Tiers:
 * - All insurer roles: Can trigger KINGA analysis (view-only, no routing changes)
 * - Claims Manager + Executive: Can recalculate confidence scores and trigger routing reevaluation
 * 
 * Features:
 * - Version history preservation (links to previous assessments)
 * - Full audit trail logging (workflowAuditTrail — human-actor workflow state transitions)
 * - Rate limiting enforcement (tenant-configurable)
 * - Tenant isolation
 *
 * AUDIT-01 (2026-07-11): Redirected from auditTrail (wrong table/field vocabulary) to
 * workflowAuditTrail. actionType and tenantId are folded into the metadata JSON field
 * since workflowAuditTrail has no dedicated columns for them.
 */

import { getDb } from "./db";
import { aiAssessments, claims, claimConfidenceScores, claimRoutingDecisions, users } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createNotification,
  formatNotificationTitle,
  formatNotificationMessage,
} from "./notification-service";
import { insertWorkflowAudit } from "./utils/audit-helpers";

/**
 * Permission check: All insurer roles can trigger KINGA analysis
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
 * Trigger KINGA analysis rerun
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

  if (!canTriggerAIAnalysis(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions to trigger KINGA analysis",
    });
  }

  const claim = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (claim.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  }

  const previousAssessments = await db
    .select()
    .from(aiAssessments)
    .where(and(eq(aiAssessments.claimId, claimId), eq(aiAssessments.tenantId, tenantId)))
    .orderBy(desc(aiAssessments.versionNumber))
    .limit(1);

  const previousAssessment = previousAssessments[0];
  const versionNumber = previousAssessment ? previousAssessment.versionNumber + 1 : 1;

  const newAssessment = await db.insert(aiAssessments).values({
    claimId,
    tenantId,
    isReanalysis: versionNumber > 1 ? 1 : 0,
    triggeredBy: userId,
    triggeredRole: userRole,
    previousAssessmentId: previousAssessment?.id || null,
    reanalysisReason: reason || null,
    versionNumber,
    confidenceScore: 0,
    modelVersion: "v1.0.0",
    processingTime: 0,
  });

  // AUDIT-01: workflowAuditTrail — human-actor workflow event
  // actionType ("AI_ANALYSIS_RERUN") and tenantId folded into metadata (no dedicated columns)
  await insertWorkflowAudit(db as any, {
    claimId,
    userId,
    userRole: userRole as any,
    previousState: (claim[0].workflowState as any) ?? null,
    newState: (claim[0].workflowState as any) ?? "intake_queue",
    comments: reason || `KINGA analysis rerun triggered by ${userRole}`,
    metadata: {
      actionType: "AI_ANALYSIS_RERUN",
      tenantId,
      versionNumber,
      previousAssessmentId: previousAssessment?.id || null,
      triggeredBy: userId,
      triggeredRole: userRole,
    },
  });

  console.log(
    `[AI Rerun Service] Created KINGA assessment version ${versionNumber} for claim ${claimId}`
  );

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

  setImmediate(async () => {
    try {
      const { triggerAiAssessment } = await import("./db");
      await triggerAiAssessment(claimId);
    } catch (pipelineErr: any) {
      console.error(`[AI Rerun Service] Pipeline failed for claim ${claimId}:`, pipelineErr?.message ?? pipelineErr);
    }
  });

  return {
    assessmentId: newAssessment.insertId,
    versionNumber,
    previousAssessmentId: previousAssessment?.id || null,
  };
}

/**
 * Recalculate confidence score
 */
export async function recalculateConfidenceScore(
  claimId: number,
  userId: number,
  userRole: string,
  tenantId: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  if (!canRecalculateConfidence(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only claims_manager and executive can recalculate confidence scores",
    });
  }

  const claim = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (claim.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  }

  const latestAssessments = await db
    .select()
    .from(aiAssessments)
    .where(and(eq(aiAssessments.claimId, claimId), eq(aiAssessments.tenantId, tenantId)))
    .orderBy(desc(aiAssessments.versionNumber))
    .limit(1);

  if (latestAssessments.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No KINGA assessment found for this claim" });
  }

  const latestAssessment = latestAssessments[0];

  const newConfidenceScore = await db.insert(claimConfidenceScores).values({
    claimId,
    tenantId,
    damageCertainty: 0,
    physicsStrength: 0,
    fraudConfidence: 0,
    historicalAccuracy: 0,
    dataCompleteness: 0,
    quoteVariance: 0,
    compositeConfidenceScore: 0,
    scoringMethod: "AI_RERUN_RECALC",
    scoringTimestamp: new Date(),
  });

  // AUDIT-01: workflowAuditTrail — human-actor confidence recalculation event
  await insertWorkflowAudit(db as any, {
    claimId,
    userId,
    userRole: userRole as any,
    previousState: (claim[0].workflowState as any) ?? null,
    newState: (claim[0].workflowState as any) ?? "intake_queue",
    comments: `Confidence score recalculated by ${userRole}`,
    metadata: {
      actionType: "CONFIDENCE_SCORE_RECALC",
      tenantId,
      confidenceScoreId: newConfidenceScore.insertId,
      aiAssessmentId: latestAssessment.id,
      triggeredBy: userId,
      triggeredRole: userRole,
    },
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
 */
export async function triggerRoutingReevaluation(
  claimId: number,
  userId: number,
  userRole: string,
  tenantId: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  if (!canRecalculateConfidence(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only claims_manager and executive can trigger routing reevaluation",
    });
  }

  const claim = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (claim.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  }

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
    routingCategory: "MEDIUM",
    routingDecision: "INTERNAL_REVIEW",
    routingReason: "Routing reevaluated after confidence score recalculation",
    decisionTimestamp: new Date(),
  });

  const previousState = claim[0].workflowState;
  const newState = "internal_review";

  await db
    .update(claims)
    .set({
      workflowState: newState,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claimId));

  // AUDIT-01: workflowAuditTrail — routing reevaluation with actual state change
  await insertWorkflowAudit(db as any, {
    claimId,
    userId,
    userRole: userRole as any,
    previousState: (previousState as any) ?? null,
    newState: newState as any,
    comments: `Routing reevaluated by ${userRole}`,
    metadata: {
      actionType: "ROUTING_REEVALUATION",
      tenantId,
      routingDecisionId: newRoutingDecision.insertId,
      confidenceScoreId: latestConfidenceScore.id,
      triggeredBy: userId,
      triggeredRole: userRole,
    },
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
 * Get KINGA analysis version history for a claim
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
