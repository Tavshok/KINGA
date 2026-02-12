/**
 * Claim Routing Decision Engine
 * 
 * Dynamically routes claims to AI-only, hybrid, or manual workflows based on:
 * - Composite confidence score
 * - Automation policy thresholds
 * - Claim characteristics (type, amount, vehicle, fraud risk)
 * 
 * Uses schema-derived types for field name accuracy.
 */

import { getDb } from "./db";
import {
  claimRoutingDecisions,
  type ClaimRoutingDecision,
  type InsertClaimRoutingDecision,
  type AutomationPolicy,
  type ClaimConfidenceScore,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

export type WorkflowType = "ai_only" | "hybrid" | "manual";

export interface RoutingContext {
  claimId: number;
  tenantId: string;
  confidenceScore: ClaimConfidenceScore;
  automationPolicy: AutomationPolicy;
  claimType: string;
  estimatedRepairCost: number;
  vehicleMake: string;
  vehicleYear: number;
  fraudScore: number;
}

export interface RoutingResult {
  workflow: WorkflowType;
  reason: string;
  confidenceScoreId: number;
  policyId: number;
}

/**
 * Route a claim to the appropriate workflow based on confidence and policy
 */
export async function routeClaim(context: RoutingContext): Promise<RoutingResult> {
  const {
    confidenceScore,
    automationPolicy,
    claimType,
    estimatedRepairCost,
    vehicleMake,
    vehicleYear,
    fraudScore,
  } = context;
  
  const compositeScore = Number(confidenceScore.compositeConfidenceScore);
  const reasons: string[] = [];
  
  // Decision tree logic
  
  // 1. Check fraud risk cutoff
  if (fraudScore > automationPolicy.maxFraudScoreForAutomation) {
    return {
      workflow: "manual",
      reason: `Fraud score ${fraudScore} exceeds policy cutoff ${automationPolicy.maxFraudScoreForAutomation}`,
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  // 2. Check claim type eligibility
  const eligibleTypes = JSON.parse(automationPolicy.eligibleClaimTypes as string) as string[];
  const excludedTypes = JSON.parse(automationPolicy.excludedClaimTypes as string) as string[];
  
  if (excludedTypes.includes(claimType)) {
    return {
      workflow: "manual",
      reason: `Claim type "${claimType}" is excluded from automation by policy`,
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  if (!eligibleTypes.includes(claimType)) {
    return {
      workflow: "manual",
      reason: `Claim type "${claimType}" is not eligible for automation`,
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  // 3. Check vehicle category rules
  const eligibleCategories = JSON.parse(automationPolicy.eligibleVehicleCategories as string) as string[];
  const excludedMakes = JSON.parse(automationPolicy.excludedVehicleMakes as string) as string[];
  
  if (excludedMakes.includes(vehicleMake)) {
    return {
      workflow: "manual",
      reason: `Vehicle make "${vehicleMake}" is excluded from automation`,
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  // 4. Check vehicle age
  const currentYear = new Date().getFullYear();
  const vehicleAge = currentYear - vehicleYear;
  
  if (vehicleYear < automationPolicy.minVehicleYear) {
    return {
      workflow: "manual",
      reason: `Vehicle year ${vehicleYear} is below minimum ${automationPolicy.minVehicleYear}`,
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  if (vehicleAge > automationPolicy.maxVehicleAge) {
    return {
      workflow: "manual",
      reason: `Vehicle age ${vehicleAge} years exceeds maximum ${automationPolicy.maxVehicleAge}`,
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  // 5. Check manager approval threshold
  if (estimatedRepairCost > Number(automationPolicy.requireManagerApprovalAbove)) {
    return {
      workflow: "manual",
      reason: `Repair cost R${estimatedRepairCost} requires manager approval (threshold: R${automationPolicy.requireManagerApprovalAbove})`,
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  // 6. Check AI-only workflow eligibility
  if (
    compositeScore >= automationPolicy.minAutomationConfidence &&
    estimatedRepairCost <= Number(automationPolicy.maxAiOnlyApprovalAmount)
  ) {
    reasons.push(`Confidence ${compositeScore.toFixed(1)}% ≥ threshold ${automationPolicy.minAutomationConfidence}%`);
    reasons.push(`Cost R${estimatedRepairCost} ≤ AI-only limit R${automationPolicy.maxAiOnlyApprovalAmount}`);
    
    return {
      workflow: "ai_only",
      reason: reasons.join("; "),
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  // 7. Check hybrid workflow eligibility
  if (
    compositeScore >= automationPolicy.minHybridConfidence &&
    estimatedRepairCost <= Number(automationPolicy.maxHybridApprovalAmount)
  ) {
    reasons.push(`Confidence ${compositeScore.toFixed(1)}% ≥ hybrid threshold ${automationPolicy.minHybridConfidence}%`);
    reasons.push(`Cost R${estimatedRepairCost} ≤ hybrid limit R${automationPolicy.maxHybridApprovalAmount}`);
    
    return {
      workflow: "hybrid",
      reason: reasons.join("; "),
      confidenceScoreId: confidenceScore.id,
      policyId: automationPolicy.id,
    };
  }
  
  // 8. Default to manual workflow
  if (compositeScore < automationPolicy.minHybridConfidence) {
    reasons.push(`Confidence ${compositeScore.toFixed(1)}% below hybrid threshold ${automationPolicy.minHybridConfidence}%`);
  }
  
  if (estimatedRepairCost > Number(automationPolicy.maxHybridApprovalAmount)) {
    reasons.push(`Cost R${estimatedRepairCost} exceeds hybrid limit R${automationPolicy.maxHybridApprovalAmount}`);
  }
  
  return {
    workflow: "manual",
    reason: reasons.length > 0 ? reasons.join("; ") : "Does not meet automation criteria",
    confidenceScoreId: confidenceScore.id,
    policyId: automationPolicy.id,
  };
}

/**
 * Record routing decision in database
 */
export async function recordRoutingDecision(
  context: RoutingContext,
  result: RoutingResult
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const policySnapshot = {
    minAutomationConfidence: context.automationPolicy.minAutomationConfidence,
    minHybridConfidence: context.automationPolicy.minHybridConfidence,
    maxAiOnlyApprovalAmount: Number(context.automationPolicy.maxAiOnlyApprovalAmount),
    maxHybridApprovalAmount: Number(context.automationPolicy.maxHybridApprovalAmount),
    maxFraudScoreForAutomation: context.automationPolicy.maxFraudScoreForAutomation,
  };
  
  const insertData: InsertClaimRoutingDecision = {
    claimId: context.claimId,
    tenantId: context.tenantId,
    confidenceScoreId: result.confidenceScoreId,
    automationPolicyId: result.policyId,
    routedWorkflow: result.workflow,
    routingReason: result.reason,
    policyThresholdsApplied: policySnapshot,
    decisionMadeBySystem: true,
    wasOverridden: false,
  };
  
  const dbResult = await db.insert(claimRoutingDecisions).values(insertData);
  
  const decisionId = Number((dbResult as unknown as { insertId: string | number }).insertId);
  console.log(`[Routing Engine] Claim ${context.claimId} routed to ${result.workflow} workflow (decision ${decisionId})`);
  
  return decisionId;
}

/**
 * Override a routing decision (manual intervention)
 */
export async function overrideRoutingDecision(
  decisionId: number,
  newWorkflow: WorkflowType,
  overrideReason: string,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(claimRoutingDecisions)
    .set({
      routedWorkflow: newWorkflow,
      wasOverridden: true,
      overrideReason,
      overriddenByUserId: userId,
      overriddenAt: new Date(),
    })
    .where(eq(claimRoutingDecisions.id, decisionId));
  
  console.log(`[Routing Engine] Decision ${decisionId} overridden to ${newWorkflow} by user ${userId}`);
}

/**
 * Get routing decision for a claim
 */
export async function getClaimRoutingDecision(claimId: number): Promise<ClaimRoutingDecision | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const decisions = await db
    .select()
    .from(claimRoutingDecisions)
    .where(eq(claimRoutingDecisions.claimId, claimId))
    .limit(1);
  
  return decisions.length > 0 ? decisions[0] : null;
}
