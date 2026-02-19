// @ts-nocheck
/**
 * Claim Replay Routing Engine
 * 
 * Applies current automation policies to historical claims to simulate routing decisions.
 * Generates simulated workflow audit trail without affecting live workflows.
 * 
 * CRITICAL: All operations are read-only simulations (isReplay = true, noLiveMutation = true).
 */

import { getDb } from "../db";
import { historicalClaims, automationPolicies } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import type { ReplayAiAssessmentResult } from "./claim-replay-ai-assessment";

export interface ReplayRoutingDecisionResult {
  // Routing decision
  routingDecision: "auto_approve" | "hybrid_review" | "escalate" | "fraud_review";
  routingReason: string;
  routingConfidence: number; // 0-100
  
  // Predicted outcomes
  predictedPayout: number; // In cents
  estimatedProcessingTimeHours: number;
  
  // Policy applied
  policyVersionId: number;
  policyVersion: number;
  policyName: string;
  
  // Thresholds used
  thresholdsApplied: {
    minAutomationConfidence: number;
    minHybridConfidence: number;
    maxAiOnlyApprovalAmount: number;
    maxHybridApprovalAmount: number;
    fraudSensitivityMultiplier: number;
  };
  
  // Simulated workflow steps
  simulatedWorkflowSteps: Array<{
    step: string;
    timestamp: Date;
    action: string;
    result: string;
    isSimulated: true;
  }>;
  
  // Replay metadata
  isReplay: true;
  noLiveMutation: true;
  replayTimestamp: Date;
}

/**
 * Get active automation policy for tenant
 */
async function getActivePolicy(tenantId: string) {
  const db = await getDb();
  
  const [policy] = await db
    .select()
    .from(automationPolicies)
    .where(
      and(
        eq(automationPolicies.tenantId, tenantId),
        eq(automationPolicies.isActive, 1)
      )
    )
    .orderBy(desc(automationPolicies.version))
    .limit(1);
  
  if (!policy) {
    throw new Error(`No active automation policy found for tenant ${tenantId}`);
  }
  
  return policy;
}

/**
 * Apply routing logic to historical claim using current policy
 */
export async function replayRoutingDecision(
  historicalClaimId: number,
  aiAssessment: ReplayAiAssessmentResult
): Promise<ReplayRoutingDecisionResult> {
  const db = await getDb();
  
  // Get historical claim
  const [claim] = await db
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, historicalClaimId))
    .limit(1);
  
  if (!claim) {
    throw new Error(`Historical claim ${historicalClaimId} not found`);
  }
  
  // Get active policy for tenant
  const policy = await getActivePolicy(claim.tenantId);
  
  const simulatedWorkflowSteps: Array<{
    step: string;
    timestamp: Date;
    action: string;
    result: string;
    isSimulated: true;
  }> = [];
  
  const now = new Date();
  
  // Step 1: Claim intake
  simulatedWorkflowSteps.push({
    step: "claim_intake",
    timestamp: new Date(now.getTime() + 0),
    action: "Historical claim loaded for replay",
    result: `Claim ${claim.claimReference} loaded`,
    isSimulated: true,
  });
  
  // Step 2: AI assessment
  simulatedWorkflowSteps.push({
    step: "ai_assessment",
    timestamp: new Date(now.getTime() + 1000),
    action: "AI damage detection, cost estimation, fraud detection",
    result: `Confidence: ${aiAssessment.compositeConfidenceScore}%, Fraud: ${aiAssessment.fraudScore}%, Cost: $${(aiAssessment.estimatedCost / 100).toFixed(2)}`,
    isSimulated: true,
  });
  
  // Step 3: Routing decision logic
  let routingDecision: "auto_approve" | "hybrid_review" | "escalate" | "fraud_review";
  let routingReason: string;
  let estimatedProcessingTimeHours: number;
  
  const confidenceScore = aiAssessment.compositeConfidenceScore;
  const fraudScore = aiAssessment.fraudScore;
  const estimatedCostCents = aiAssessment.estimatedCost;
  
  const minAutomationConfidence = Number(policy.minAutomationConfidence) || 85;
  const minHybridConfidence = Number(policy.minHybridConfidence) || 65;
  const maxAiOnlyApprovalAmount = Number(policy.maxAiOnlyApprovalAmount) || 7500000; // $75k in cents
  const maxHybridApprovalAmount = Number(policy.maxHybridApprovalAmount) || 20000000; // $200k in cents
  const fraudSensitivityMultiplier = Number(policy.fraudSensitivityMultiplier) || 1.0;
  
  // Apply fraud sensitivity multiplier
  const adjustedFraudThreshold = 40 / fraudSensitivityMultiplier; // Base threshold 40
  
  // Routing logic
  if (fraudScore >= adjustedFraudThreshold) {
    routingDecision = "fraud_review";
    routingReason = `Fraud score ${fraudScore}% exceeds threshold ${adjustedFraudThreshold.toFixed(1)}% (sensitivity ${fraudSensitivityMultiplier}x)`;
    estimatedProcessingTimeHours = 48; // 2 days for fraud review
  } else if (confidenceScore >= minAutomationConfidence && estimatedCostCents <= maxAiOnlyApprovalAmount) {
    routingDecision = "auto_approve";
    routingReason = `Confidence ${confidenceScore}% >= ${minAutomationConfidence}% and cost $${(estimatedCostCents / 100).toFixed(2)} <= $${(maxAiOnlyApprovalAmount / 100).toFixed(2)}`;
    estimatedProcessingTimeHours = 0.5; // 30 minutes for auto-approval
  } else if (confidenceScore >= minHybridConfidence && estimatedCostCents <= maxHybridApprovalAmount) {
    routingDecision = "hybrid_review";
    routingReason = `Confidence ${confidenceScore}% >= ${minHybridConfidence}% and cost $${(estimatedCostCents / 100).toFixed(2)} <= $${(maxHybridApprovalAmount / 100).toFixed(2)}`;
    estimatedProcessingTimeHours = 4; // 4 hours for hybrid review
  } else {
    routingDecision = "escalate";
    routingReason = `Confidence ${confidenceScore}% < ${minHybridConfidence}% or cost $${(estimatedCostCents / 100).toFixed(2)} > $${(maxHybridApprovalAmount / 100).toFixed(2)}`;
    estimatedProcessingTimeHours = 24; // 1 day for escalation
  }
  
  simulatedWorkflowSteps.push({
    step: "routing_decision",
    timestamp: new Date(now.getTime() + 2000),
    action: `Apply routing policy ${policy.policyName} (v${policy.version})`,
    result: `Decision: ${routingDecision} - ${routingReason}`,
    isSimulated: true,
  });
  
  // Step 4: Simulated workflow execution
  if (routingDecision === "auto_approve") {
    simulatedWorkflowSteps.push({
      step: "auto_approval",
      timestamp: new Date(now.getTime() + 3000),
      action: "AI auto-approval",
      result: `Approved $${(estimatedCostCents / 100).toFixed(2)}`,
      isSimulated: true,
    });
  } else if (routingDecision === "hybrid_review") {
    simulatedWorkflowSteps.push({
      step: "hybrid_review_assignment",
      timestamp: new Date(now.getTime() + 3000),
      action: "Assign to claims processor for hybrid review",
      result: "Assigned to processor queue",
      isSimulated: true,
    });
    
    simulatedWorkflowSteps.push({
      step: "hybrid_review_completion",
      timestamp: new Date(now.getTime() + 3000 + estimatedProcessingTimeHours * 3600 * 1000),
      action: "Claims processor reviews AI recommendation",
      result: "Review completed",
      isSimulated: true,
    });
  } else if (routingDecision === "escalate") {
    simulatedWorkflowSteps.push({
      step: "escalation",
      timestamp: new Date(now.getTime() + 3000),
      action: "Escalate to senior assessor",
      result: "Escalated for manual assessment",
      isSimulated: true,
    });
    
    simulatedWorkflowSteps.push({
      step: "manual_assessment",
      timestamp: new Date(now.getTime() + 3000 + estimatedProcessingTimeHours * 3600 * 1000),
      action: "Senior assessor completes manual assessment",
      result: "Assessment completed",
      isSimulated: true,
    });
  } else if (routingDecision === "fraud_review") {
    simulatedWorkflowSteps.push({
      step: "fraud_review_assignment",
      timestamp: new Date(now.getTime() + 3000),
      action: "Assign to fraud investigation team",
      result: "Assigned to fraud queue",
      isSimulated: true,
    });
    
    simulatedWorkflowSteps.push({
      step: "fraud_investigation",
      timestamp: new Date(now.getTime() + 3000 + estimatedProcessingTimeHours * 3600 * 1000),
      action: "Fraud team investigates claim",
      result: "Investigation completed",
      isSimulated: true,
    });
  }
  
  return {
    routingDecision,
    routingReason,
    routingConfidence: confidenceScore,
    predictedPayout: estimatedCostCents,
    estimatedProcessingTimeHours,
    policyVersionId: policy.id,
    policyVersion: policy.version,
    policyName: policy.policyName,
    thresholdsApplied: {
      minAutomationConfidence,
      minHybridConfidence,
      maxAiOnlyApprovalAmount,
      maxHybridApprovalAmount,
      fraudSensitivityMultiplier,
    },
    simulatedWorkflowSteps,
    isReplay: true,
    noLiveMutation: true,
    replayTimestamp: now,
  };
}

/**
 * Map original decision to KINGA routing decision for comparison
 */
export function mapOriginalDecisionToRoutingDecision(
  originalDecision: "approved" | "rejected" | "referred" | "total_loss" | "cash_settlement" | null
): "auto_approve" | "hybrid_review" | "escalate" | "fraud_review" | null {
  if (!originalDecision) return null;
  
  switch (originalDecision) {
    case "approved":
      return "auto_approve"; // Assume approved claims would be auto-approved
    case "referred":
      return "hybrid_review"; // Referred claims would go to hybrid review
    case "rejected":
      return "fraud_review"; // Rejected claims likely fraud-related
    case "total_loss":
      return "escalate"; // Total loss requires escalation
    case "cash_settlement":
      return "hybrid_review"; // Cash settlements require review
    default:
      return null;
  }
}
