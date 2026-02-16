/**
 * Centralized Workflow Engine for KINGA
 * 
 * Single gateway for ALL claim state transitions with comprehensive governance enforcement:
 * - State transition validation (legal transitions only)
 * - Role permission validation (role can perform this transition)
 * - Segregation of duties validation (prevent same user completing full lifecycle)
 * - Configuration constraint validation (respect tenant-specific rules)
 * - Automatic audit trail logging (immutable record of all transitions)
 * 
 * NO direct claim state updates should occur outside this engine.
 */

import { getDb } from "./db";
import { claims, workflowAuditTrail, claimInvolvementTracking, workflowConfiguration } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { InsurerRole, WorkflowState } from "./rbac";
import { WORKFLOW_TRANSITIONS, canTransitionTo } from "./rbac";
import { workflowStateToStatus } from "./workflow-migration";

/**
 * Transition request parameters
 */
export interface TransitionRequest {
  claimId: number;
  fromState: WorkflowState;
  toState: WorkflowState;
  userId: number;
  userRole: InsurerRole;
  decisionData?: {
    approvedAmount?: number;
    selectedPanelBeaterId?: number;
    comments?: string;
  };
  aiSnapshot?: {
    fraudScore?: number;
    confidenceScore?: number;
    estimatedCost?: number;
  };
  executiveOverride?: boolean;
  overrideReason?: string;
}

/**
 * Transition result
 */
export interface TransitionResult {
  success: boolean;
  claimId: number;
  previousState: WorkflowState;
  newState: WorkflowState;
  auditId: number;
  warnings?: string[];
}

/**
 * Stage mapping for segregation tracking
 * Maps workflow states to critical stages defined in schema
 */
const STATE_TO_STAGE_MAP: Record<WorkflowState, "assessment" | "technical_approval" | "financial_decision" | "payment_authorization" | null> = {
  created: null, // Not a critical stage
  assigned: null, // Not a critical stage
  under_assessment: "assessment",
  internal_review: "assessment", // Still part of assessment phase
  technical_approval: "technical_approval",
  financial_decision: "financial_decision",
  payment_authorized: "payment_authorization",
  closed: null, // Not a critical stage
  disputed: null, // Not a critical stage
};

/**
 * Role-to-transition permission matrix
 * Defines which roles can perform which state transitions
 */
const ROLE_TRANSITION_PERMISSIONS: Record<string, InsurerRole[]> = {
  "created → assigned": ["claims_processor"],
  "assigned → under_assessment": ["assessor_internal", "claims_processor"],
  "under_assessment → internal_review": ["assessor_internal"],
  "internal_review → technical_approval": ["risk_manager", "executive"],
  "internal_review → under_assessment": ["risk_manager"], // Send back
  "technical_approval → financial_decision": ["claims_manager", "executive"],
  "technical_approval → internal_review": ["claims_manager"], // Send back
  "financial_decision → payment_authorized": ["claims_manager", "executive"],
  "financial_decision → technical_approval": ["claims_manager"], // Send back
  "payment_authorized → closed": ["claims_manager", "executive"],
  "closed → disputed": ["claims_manager", "executive"],
  "disputed → internal_review": ["risk_manager", "executive"],
};

/**
 * Centralized claim state transition function
 * ALL claim state changes MUST go through this function
 */
export async function transition(request: TransitionRequest): Promise<TransitionResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const {
    claimId,
    fromState,
    toState,
    userId,
    userRole,
    decisionData,
    aiSnapshot,
    executiveOverride,
    overrideReason,
  } = request;

  const warnings: string[] = [];

  // ============================================
  // VALIDATION LAYER 1: State Transition Rules
  // ============================================
  
  if (!canTransitionTo(fromState, toState)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid workflow transition: ${fromState} → ${toState}. Allowed transitions from ${fromState}: ${WORKFLOW_TRANSITIONS[fromState].join(", ")}`,
    });
  }

  // ============================================
  // VALIDATION LAYER 2: Role Permission
  // ============================================
  
  const transitionKey = `${fromState} → ${toState}`;
  const allowedRoles = ROLE_TRANSITION_PERMISSIONS[transitionKey];
  
  if (!executiveOverride && allowedRoles && !allowedRoles.includes(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Role "${userRole}" is not authorized to perform transition: ${transitionKey}. Allowed roles: ${allowedRoles.join(", ")}`,
    });
  }

  // ============================================
  // VALIDATION LAYER 3: Segregation of Duties
  // ============================================
  
  if (!executiveOverride) {
    // Get workflow configuration for this tenant
    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
    if (!claim) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Claim ${claimId} not found`,
      });
    }

    // Get tenant configuration (default to system-wide if no tenant-specific config)
    const configs = await db
      .select()
      .from(workflowConfiguration)
      .where(eq(workflowConfiguration.tenantId, claim.tenantId || "default"))
      .limit(1);
    
    const config = configs[0] || { maxSequentialStagesByUser: 2 };

    // Get user's involvement history for this claim
    const involvement = await db
      .select()
      .from(claimInvolvementTracking)
      .where(
        and(
          eq(claimInvolvementTracking.claimId, claimId),
          eq(claimInvolvementTracking.userId, userId)
        )
      );

    // Count unique sequential stages
    const uniqueStages = new Set(involvement.map(i => i.workflowStage));
    const newStage = STATE_TO_STAGE_MAP[toState];
    
    // Only track critical stages (newStage can be null for non-critical states)
    if (newStage && !uniqueStages.has(newStage)) {
      uniqueStages.add(newStage);
    }

    if (uniqueStages.size > config.maxSequentialStagesByUser) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Segregation of duties violation: User has reached maximum sequential involvement (${config.maxSequentialStagesByUser} stages). User has been involved in: ${Array.from(uniqueStages).join(", ")}`,
      });
    }

    // Warning if approaching limit
    if (uniqueStages.size === config.maxSequentialStagesByUser) {
      warnings.push(`User is at maximum sequential involvement limit (${config.maxSequentialStagesByUser} stages)`);
    }
  }

  // ============================================
  // VALIDATION LAYER 4: Configuration Constraints
  // ============================================
  
  // Check if risk manager is required but disabled
  if (toState === "technical_approval" || fromState === "technical_approval") {
    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
    if (claim) {
      const configs = await db
        .select()
        .from(workflowConfiguration)
        .where(eq(workflowConfiguration.tenantId, claim.tenantId || "default"))
        .limit(1);
      
      const config = configs[0];
      if (config && !config.riskManagerEnabled && userRole === "risk_manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Risk manager role is disabled for this tenant. Technical approval must be handled by executive.",
        });
      }
    }
  }

  // ============================================
  // EXECUTION: Update Claim State
  // ============================================
  
  // Update both workflowState (new governance) and status (legacy) for backward compatibility
  const legacyStatus = workflowStateToStatus(toState);
  
  await db
    .update(claims)
    .set({
      workflowState: toState,
      status: legacyStatus,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claimId));

  // ============================================
  // AUDIT TRAIL: Automatic Immutable Logging
  // ============================================
  
  const auditResult = await db.insert(workflowAuditTrail).values({
    claimId,
    userId,
    userRole,
    previousState: fromState,
    newState: toState,
    decisionValue: decisionData?.approvedAmount,
    aiScore: aiSnapshot?.fraudScore,
    confidenceScore: aiSnapshot?.confidenceScore,
    comments: decisionData?.comments || (executiveOverride ? `Executive override: ${overrideReason}` : undefined),
    executiveOverride: executiveOverride ? 1 : 0,
    overrideReason,
    timestamp: new Date(),
  });

  const auditId = Number((auditResult as unknown as { insertId: string | number }).insertId);

  // ============================================
  // INVOLVEMENT TRACKING: Segregation Monitoring
  // ============================================
  
  const stage = STATE_TO_STAGE_MAP[toState];
  // Only track critical stages
  if (stage) {
    await db.insert(claimInvolvementTracking).values({
      claimId,
      userId,
      workflowStage: stage,
      actionType: "transition_state",
      createdAt: new Date(),
    });
  }

  // ============================================
  // RETURN RESULT
  // ============================================
  
  return {
    success: true,
    claimId,
    previousState: fromState,
    newState: toState,
    auditId,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Helper: Get current claim state
 */
export async function getCurrentState(claimId: number): Promise<WorkflowState | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [claim] = await db.select({ workflowState: claims.workflowState }).from(claims).where(eq(claims.id, claimId));
  return claim?.workflowState as WorkflowState || null;
}

/**
 * Helper: Validate transition without executing
 */
export async function validateTransition(request: Omit<TransitionRequest, "decisionData" | "aiSnapshot">): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check state transition rules
  if (!canTransitionTo(request.fromState, request.toState)) {
    errors.push(`Invalid workflow transition: ${request.fromState} → ${request.toState}`);
  }

  // Check role permission
  const transitionKey = `${request.fromState} → ${request.toState}`;
  const allowedRoles = ROLE_TRANSITION_PERMISSIONS[transitionKey];
  if (!request.executiveOverride && allowedRoles && !allowedRoles.includes(request.userRole)) {
    errors.push(`Role "${request.userRole}" is not authorized for transition: ${transitionKey}`);
  }

  // Check segregation (simplified - full check requires database query)
  const db = await getDb();
  if (db && !request.executiveOverride) {
    const involvement = await db
      .select()
      .from(claimInvolvementTracking)
      .where(
        and(
          eq(claimInvolvementTracking.claimId, request.claimId),
          eq(claimInvolvementTracking.userId, request.userId)
        )
      );

    const uniqueStages = new Set(involvement.map(i => i.workflowStage));
    const newStage = STATE_TO_STAGE_MAP[request.toState];
    
    // Only track critical stages (newStage can be null for non-critical states)
    if (newStage && !uniqueStages.has(newStage)) {
      uniqueStages.add(newStage);
    }

    if (uniqueStages.size > 2) {
      errors.push("Segregation of duties violation: User has reached maximum sequential involvement");
    } else if (uniqueStages.size === 2) {
      warnings.push("User is at maximum sequential involvement limit");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
