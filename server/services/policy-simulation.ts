/**
 * Policy Simulation Service
 * 
 * Simulates routing decisions using draft policies without affecting real claims.
 * Provides what-if analysis for policy changes.
 */

import { getDb } from "../db";
import { claims, claimConfidenceScores, automationPolicies } from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export interface PolicySimulationInput {
  // Policy parameters to simulate
  minAutomationConfidence: number;
  minHybridConfidence: number;
  maxAiOnlyApprovalAmount: number;
  maxHybridApprovalAmount: number;
  maxFraudScoreForAutomation: number;
  fraudSensitivityMultiplier: number;
  eligibleClaimTypes: string[];
  excludedClaimTypes: string[];
  minVehicleYear: number;
  maxVehicleAge: number;
}

export interface SimulationResult {
  totalClaims: number;
  autoApproveCount: number;
  autoApprovePercentage: number;
  hybridReviewCount: number;
  hybridReviewPercentage: number;
  escalateCount: number;
  escalatePercentage: number;
  fraudReviewCount: number;
  fraudReviewPercentage: number;
  averageConfidenceScore: number;
  averageFraudScore: number;
  averageClaimAmount: number;
  totalApprovedAmount: number;
  claimTypeBreakdown: Record<string, number>;
  routingDecisionBreakdown: Record<string, number>;
}

/**
 * Simulate routing distribution using a draft policy
 * Analyzes recent claims (last 30 days) to predict routing outcomes
 */
export async function simulateRoutingDistribution(
  tenantId: string,
  policyInput: PolicySimulationInput,
  daysToAnalyze: number = 30
): Promise<SimulationResult> {
  const db = await getDb();

  // Get recent claims for simulation
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToAnalyze);

  const recentClaims = await db
    .select({
      claimId: claims.id,
      claimType: claims.claimType,
      claimAmount: claims.aiEstimatedCost,
      fraudScore: claims.aiFraudScore,
      vehicleYear: claims.vehicleYear,
      confidenceScoreId: claims.id, // Placeholder for join
    })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        gte(claims.createdAt, cutoffDate)
      )
    )
    .limit(1000); // Limit to 1000 claims for performance

  // Get confidence scores for these claims
  const claimIds = recentClaims.map(c => c.claimId);
  const confidenceScores = await db
    .select()
    .from(claimConfidenceScores)
    .where(sql`${claimConfidenceScores.claimId} IN (${sql.join(claimIds.map(id => sql`${id}`), sql`, `)})`);

  const confidenceMap = new Map(
    confidenceScores.map(cs => [cs.claimId, Number(cs.compositeConfidenceScore)])
  );

  // Simulate routing for each claim
  let autoApproveCount = 0;
  let hybridReviewCount = 0;
  let escalateCount = 0;
  let fraudReviewCount = 0;
  let totalConfidenceScore = 0;
  let totalFraudScore = 0;
  let totalClaimAmount = 0;
  let totalApprovedAmount = 0;
  const claimTypeBreakdown: Record<string, number> = {};
  const routingDecisionBreakdown: Record<string, number> = {};

  for (const claim of recentClaims) {
    const confidenceScore = confidenceMap.get(claim.claimId) || 0;
    const fraudScore = claim.fraudScore || 0;
    const claimAmount = Number(claim.claimAmount) || 0;
    const vehicleYear = claim.vehicleYear || 0;
    const vehicleAge = new Date().getFullYear() - vehicleYear;

    totalConfidenceScore += confidenceScore;
    totalFraudScore += fraudScore;
    totalClaimAmount += claimAmount;

    // Track claim type breakdown
    const claimType = claim.claimType || "unknown";
    claimTypeBreakdown[claimType] = (claimTypeBreakdown[claimType] || 0) + 1;

    // Apply policy rules to determine routing decision
    let routingDecision = "escalate"; // Default to escalate

    // Check claim type eligibility
    const isEligibleClaimType = 
      policyInput.eligibleClaimTypes.includes(claimType) &&
      !policyInput.excludedClaimTypes.includes(claimType);

    if (!isEligibleClaimType) {
      routingDecision = "escalate";
    }
    // Check vehicle age eligibility
    else if (vehicleYear < policyInput.minVehicleYear || vehicleAge > policyInput.maxVehicleAge) {
      routingDecision = "escalate";
    }
    // Check fraud score (apply sensitivity multiplier)
    else if (fraudScore * policyInput.fraudSensitivityMultiplier > policyInput.maxFraudScoreForAutomation) {
      routingDecision = "fraud_review";
    }
    // Check automation threshold
    else if (confidenceScore >= policyInput.minAutomationConfidence && claimAmount <= policyInput.maxAiOnlyApprovalAmount) {
      routingDecision = "auto_approve";
      totalApprovedAmount += claimAmount;
    }
    // Check hybrid threshold
    else if (confidenceScore >= policyInput.minHybridConfidence && claimAmount <= policyInput.maxHybridApprovalAmount) {
      routingDecision = "hybrid_review";
    }
    // Otherwise escalate
    else {
      routingDecision = "escalate";
    }

    // Count routing decisions
    if (routingDecision === "auto_approve") autoApproveCount++;
    else if (routingDecision === "hybrid_review") hybridReviewCount++;
    else if (routingDecision === "fraud_review") fraudReviewCount++;
    else escalateCount++;

    // Track routing decision breakdown
    routingDecisionBreakdown[routingDecision] = (routingDecisionBreakdown[routingDecision] || 0) + 1;
  }

  const totalClaims = recentClaims.length;

  return {
    totalClaims,
    autoApproveCount,
    autoApprovePercentage: totalClaims > 0 ? (autoApproveCount / totalClaims) * 100 : 0,
    hybridReviewCount,
    hybridReviewPercentage: totalClaims > 0 ? (hybridReviewCount / totalClaims) * 100 : 0,
    escalateCount,
    escalatePercentage: totalClaims > 0 ? (escalateCount / totalClaims) * 100 : 0,
    fraudReviewCount,
    fraudReviewPercentage: totalClaims > 0 ? (fraudReviewCount / totalClaims) * 100 : 0,
    averageConfidenceScore: totalClaims > 0 ? totalConfidenceScore / totalClaims : 0,
    averageFraudScore: totalClaims > 0 ? totalFraudScore / totalClaims : 0,
    averageClaimAmount: totalClaims > 0 ? totalClaimAmount / totalClaims : 0,
    totalApprovedAmount,
    claimTypeBreakdown,
    routingDecisionBreakdown,
  };
}

/**
 * Compare simulation results between two policies
 */
export async function comparePolicySimulations(
  tenantId: string,
  policy1: PolicySimulationInput,
  policy2: PolicySimulationInput,
  daysToAnalyze: number = 30
): Promise<{
  policy1Results: SimulationResult;
  policy2Results: SimulationResult;
  differences: {
    autoApproveDelta: number;
    hybridReviewDelta: number;
    escalateDelta: number;
    fraudReviewDelta: number;
    approvedAmountDelta: number;
  };
}> {
  const [policy1Results, policy2Results] = await Promise.all([
    simulateRoutingDistribution(tenantId, policy1, daysToAnalyze),
    simulateRoutingDistribution(tenantId, policy2, daysToAnalyze),
  ]);

  return {
    policy1Results,
    policy2Results,
    differences: {
      autoApproveDelta: policy2Results.autoApprovePercentage - policy1Results.autoApprovePercentage,
      hybridReviewDelta: policy2Results.hybridReviewPercentage - policy1Results.hybridReviewPercentage,
      escalateDelta: policy2Results.escalatePercentage - policy1Results.escalatePercentage,
      fraudReviewDelta: policy2Results.fraudReviewPercentage - policy1Results.fraudReviewPercentage,
      approvedAmountDelta: policy2Results.totalApprovedAmount - policy1Results.totalApprovedAmount,
    },
  };
}

/**
 * Simulate routing for a single claim using a draft policy
 */
export async function simulateSingleClaimRouting(
  claimId: number,
  policyInput: PolicySimulationInput
): Promise<{
  routingDecision: string;
  confidenceScore: number;
  fraudScore: number;
  claimAmount: number;
  reasoning: string[];
}> {
  const db = await getDb();

  // Get claim details
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }

  // Get confidence score
  const [confidenceScoreRecord] = await db
    .select()
    .from(claimConfidenceScores)
    .where(eq(claimConfidenceScores.claimId, claimId))
    .limit(1);

  const confidenceScore = confidenceScoreRecord ? Number(confidenceScoreRecord.compositeConfidenceScore) : 0;
  const fraudScore = claim.aiFraudScore || 0;
  const claimAmount = Number(claim.aiEstimatedCost) || 0;
  const vehicleYear = claim.vehicleYear || 0;
  const vehicleAge = new Date().getFullYear() - vehicleYear;
  const claimType = claim.claimType || "unknown";

  const reasoning: string[] = [];
  let routingDecision = "escalate";

  // Apply policy rules
  const isEligibleClaimType = 
    policyInput.eligibleClaimTypes.includes(claimType) &&
    !policyInput.excludedClaimTypes.includes(claimType);

  if (!isEligibleClaimType) {
    routingDecision = "escalate";
    reasoning.push(`Claim type "${claimType}" is not eligible for automation`);
  } else if (vehicleYear < policyInput.minVehicleYear) {
    routingDecision = "escalate";
    reasoning.push(`Vehicle year ${vehicleYear} is below minimum ${policyInput.minVehicleYear}`);
  } else if (vehicleAge > policyInput.maxVehicleAge) {
    routingDecision = "escalate";
    reasoning.push(`Vehicle age ${vehicleAge} years exceeds maximum ${policyInput.maxVehicleAge} years`);
  } else if (fraudScore * policyInput.fraudSensitivityMultiplier > policyInput.maxFraudScoreForAutomation) {
    routingDecision = "fraud_review";
    reasoning.push(`Fraud score ${fraudScore} (adjusted: ${fraudScore * policyInput.fraudSensitivityMultiplier}) exceeds threshold ${policyInput.maxFraudScoreForAutomation}`);
  } else if (confidenceScore >= policyInput.minAutomationConfidence && claimAmount <= policyInput.maxAiOnlyApprovalAmount) {
    routingDecision = "auto_approve";
    reasoning.push(`Confidence ${confidenceScore}% meets automation threshold ${policyInput.minAutomationConfidence}%`);
    reasoning.push(`Claim amount $${(claimAmount / 100).toLocaleString()} within AI-only limit $${(policyInput.maxAiOnlyApprovalAmount / 100).toLocaleString()}`);
  } else if (confidenceScore >= policyInput.minHybridConfidence && claimAmount <= policyInput.maxHybridApprovalAmount) {
    routingDecision = "hybrid_review";
    reasoning.push(`Confidence ${confidenceScore}% meets hybrid threshold ${policyInput.minHybridConfidence}%`);
    reasoning.push(`Claim amount $${(claimAmount / 100).toLocaleString()} within hybrid limit $${(policyInput.maxHybridApprovalAmount / 100).toLocaleString()}`);
  } else {
    routingDecision = "escalate";
    if (confidenceScore < policyInput.minHybridConfidence) {
      reasoning.push(`Confidence ${confidenceScore}% below hybrid threshold ${policyInput.minHybridConfidence}%`);
    }
    if (claimAmount > policyInput.maxHybridApprovalAmount) {
      reasoning.push(`Claim amount $${(claimAmount / 100).toLocaleString()} exceeds hybrid limit $${(policyInput.maxHybridApprovalAmount / 100).toLocaleString()}`);
    }
  }

  return {
    routingDecision,
    confidenceScore,
    fraudScore,
    claimAmount,
    reasoning,
  };
}
