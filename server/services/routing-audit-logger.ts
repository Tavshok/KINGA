/**
 * Routing Audit Logger
 * 
 * Logs routing re-evaluation events to workflowAuditTrail for compliance tracking.
 */

import { getDb } from "../db";
import { workflowAuditTrail } from "../../drizzle/schema";

/**
 * Audit log parameters for routing re-evaluation
 */
export interface LogRoutingReEvaluationParams {
  claimId: number;
  tenantId: string;
  userId: number;
  userRole: string;
  previousRoutingId: string | null;
  newRoutingId: string;
  previousCategory: string | null;
  newCategory: string;
  justification: string;
  modelVersion: string;
  thresholdVersion: string;
}

/**
 * Log routing re-evaluation to workflow audit trail
 * 
 * Creates comprehensive audit record of routing decision changes.
 */
export async function logRoutingReEvaluation(
  params: LogRoutingReEvaluationParams
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const auditDetails = {
    action: "ROUTING_RE_EVALUATION",
    claimId: params.claimId,
    previousRoutingId: params.previousRoutingId,
    newRoutingId: params.newRoutingId,
    previousCategory: params.previousCategory,
    newCategory: params.newCategory,
    modelVersion: params.modelVersion,
    thresholdVersion: params.thresholdVersion,
    justification: params.justification,
    performedBy: {
      userId: params.userId,
      role: params.userRole,
    },
  };

  await db.insert(workflowAuditTrail).values({
    claimId: params.claimId,
    userId: params.userId,
    userRole: params.userRole as "claims_processor" | "assessor_internal" | "assessor_external" | "risk_manager" | "claims_manager" | "executive" | "insurer_admin",
    previousState: null,
    newState: "under_assessment", // Default state for routing re-evaluation
    comments: `Routing re-evaluated by ${params.userRole} (User ID: ${params.userId}). Category changed from ${params.previousCategory || "NONE"} to ${params.newCategory}. Justification: ${params.justification}`,
    metadata: JSON.stringify(auditDetails),
  });
}
