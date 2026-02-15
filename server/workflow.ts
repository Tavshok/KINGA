/**
 * Workflow Management for KINGA RBAC System
 * 
 * Handles workflow state transitions, comment management, and approval tracking
 * for the hierarchical role-based access control system.
 */

import { getDb } from "./db";
import { claims, claimComments, users } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { WorkflowState, InsurerRole } from "./rbac";
import { requireValidTransition, requiresGMConsultation } from "./rbac";
import { TRPCError } from "@trpc/server";

/**
 * Transition claim to new workflow state
 */
export async function transitionWorkflowState(
  claimId: number,
  newState: WorkflowState,
  userId: number,
  userRole: InsurerRole
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Claim not found",
    });
  }

  const currentState = claim.workflowState as WorkflowState | null;
  
  // If no current state, allow setting initial state
  if (currentState) {
    requireValidTransition(currentState, newState);
  }

  // Update claim with new state
  const updateData: any = {
    workflowState: newState,
    updatedAt: new Date(),
  };

  // Track approvals based on state
  if (newState === "technical_approval" && userRole === "risk_manager") {
    updateData.technicallyApprovedBy = userId;
    updateData.technicallyApprovedAt = new Date();
  }

  if (newState === "payment_authorized" && userRole === "claims_manager") {
    updateData.financiallyApprovedBy = userId;
    updateData.financiallyApprovedAt = new Date();
  }

  if (newState === "closed" && userRole === "claims_manager") {
    updateData.closedBy = userId;
    updateData.closedAt = new Date();
  }

  await db
    .update(claims)
    .set(updateData)
    .where(eq(claims.id, claimId));
}

/**
 * Add comment to claim
 */
export async function addClaimComment(params: {
  claimId: number;
  userId: number;
  userRole: string;
  commentType: "general" | "flag" | "clarification_request" | "technical_note";
  content: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(claimComments).values({
    claimId: params.claimId,
    userId: params.userId,
    userRole: params.userRole,
    commentType: params.commentType,
    content: params.content,
    createdAt: new Date(),
  });
}

/**
 * Get comments for a claim
 */
export async function getClaimComments(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const comments = await db
    .select({
      id: claimComments.id,
      claimId: claimComments.claimId,
      userId: claimComments.userId,
      userRole: claimComments.userRole,
      commentType: claimComments.commentType,
      content: claimComments.content,
      createdAt: claimComments.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(claimComments)
    .leftJoin(users, eq(claimComments.userId, users.id))
    .where(eq(claimComments.claimId, claimId))
    .orderBy(desc(claimComments.createdAt));

  return comments;
}

/**
 * Check if claim requires GM consultation (high-value)
 */
export async function checkGMConsultationRequired(claimId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get claim with AI assessment
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) return false;

  // Check approved amount if available
  if (claim.approvedAmount) {
    return requiresGMConsultation(claim.approvedAmount / 100); // Convert cents to dollars
  }

  // Otherwise check AI estimated cost
  const { aiAssessments } = await import("../drizzle/schema");
  const [aiAssessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .limit(1);

  if (aiAssessment?.estimatedCost) {
    return requiresGMConsultation(aiAssessment.estimatedCost / 100); // Convert cents to dollars
  }

  return false;
}

/**
 * Approve technical basis (Risk Manager)
 */
export async function approveTechnicalBasis(
  claimId: number,
  userId: number,
  approvalNotes?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(claims)
    .set({
      technicallyApprovedBy: userId,
      technicallyApprovedAt: new Date(),
      workflowState: "technical_approval",
    })
    .where(eq(claims.id, claimId));

  // Add comment if notes provided
  if (approvalNotes) {
    await addClaimComment({
      claimId,
      userId,
      userRole: "risk_manager",
      commentType: "technical_note",
      content: approvalNotes,
    });
  }
}

/**
 * Authorize payment (Claims Manager)
 */
export async function authorizePayment(
  claimId: number,
  userId: number,
  approvedAmount: number, // in cents
  approvalNotes?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(claims)
    .set({
      financiallyApprovedBy: userId,
      financiallyApprovedAt: new Date(),
      approvedAmount,
      workflowState: "payment_authorized",
    })
    .where(eq(claims.id, claimId));

  // Add comment if notes provided
  if (approvalNotes) {
    await addClaimComment({
      claimId,
      userId,
      userRole: "claims_manager",
      commentType: "general",
      content: approvalNotes,
    });
  }
}

/**
 * Close claim (Claims Manager)
 */
export async function closeClaim(
  claimId: number,
  userId: number,
  closureNotes?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(claims)
    .set({
      closedBy: userId,
      closedAt: new Date(),
      workflowState: "closed",
      status: "completed",
    })
    .where(eq(claims.id, claimId));

  // Add comment if notes provided
  if (closureNotes) {
    await addClaimComment({
      claimId,
      userId,
      userRole: "claims_manager",
      commentType: "general",
      content: closureNotes,
    });
  }
}

/**
 * Get claims by workflow state
 */
export async function getClaimsByWorkflowState(state: WorkflowState, options?: { limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        claimantIdNumber: claims.claimantIdNumber,
        vehicleRegistration: claims.vehicleRegistration,
        vehicleMake: claims.vehicleMake,
        vehicleModel: claims.vehicleModel,
        policyNumber: claims.policyNumber,
        workflowState: claims.workflowState,
        status: claims.status,
        incidentType: claims.incidentType,
        incidentDate: claims.incidentDate,
        createdAt: claims.createdAt,
        claimantId: claims.claimantId,
      })
      .from(claims)
      .where(eq(claims.workflowState, state))
      .orderBy(desc(claims.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(claims)
      .where(eq(claims.workflowState, state)),
  ]);

  return {
    items,
    total: Number(countResult[0]?.count ?? 0),
    limit,
    offset,
  };
}

/**
 * Get claims requiring technical approval
 */
export async function getClaimsRequiringTechnicalApproval() {
  return await getClaimsByWorkflowState("internal_review");
}

/**
 * Get claims requiring financial decision
 */
export async function getClaimsRequiringFinancialDecision() {
  return await getClaimsByWorkflowState("technical_approval");
}

/**
 * Get high-value claims requiring GM consultation
 */
export async function getHighValueClaims() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { aiAssessments } = await import("../drizzle/schema");
  
  // Get all claims with AI assessments over threshold
  const highValueClaims = await db
    .select({
      claim: claims,
      aiAssessment: aiAssessments,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(
      // Claims with approved amount > $10k OR estimated cost > $10k
      and(
        // Add condition here - simplified for now
      )
    );

  // Filter in JavaScript for now (can optimize with SQL later)
  return highValueClaims.filter(({ claim, aiAssessment }) => {
    if (claim.approvedAmount && claim.approvedAmount > 1000000) return true; // $10k in cents
    if (aiAssessment?.estimatedCost && aiAssessment.estimatedCost > 1000000) return true;
    return false;
  });
}
