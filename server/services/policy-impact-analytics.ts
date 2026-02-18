/**
 * Policy Impact Analytics Service
 * 
 * Tracks policy version impact metrics for governance and compliance:
 * - Override rate (human overrides of AI decisions)
 * - Fraud detection rate
 * - Average processing time
 * - Financial variance (AI vs final approved amounts)
 * - Policy effectiveness scoring
 */

import { getDb } from "../db";
import { 
  claims, 
  claimRoutingDecisions, 
  automationPolicies,
  claimConfidenceScores,
} from "../../drizzle/schema";
import { eq, and, gte, lte, sql, avg, count, sum } from "drizzle-orm";

export interface PolicyImpactMetrics {
  policyId: number;
  policyVersion: number;
  policyName: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  
  // Claim Volume Metrics
  totalClaims: number;
  autoApprovedClaims: number;
  hybridReviewClaims: number;
  escalatedClaims: number;
  fraudReviewClaims: number;
  
  // Override Metrics
  totalOverrides: number;
  overrideRate: number; // Percentage of AI decisions overridden by humans
  aiToHumanApprovalOverrides: number; // AI approved, human rejected
  aiToHumanRejectionOverrides: number; // AI rejected, human approved
  
  // Fraud Detection Metrics
  fraudDetectionRate: number; // Percentage of claims flagged as fraud
  confirmedFraudCases: number;
  falsePositiveFraudRate: number;
  
  // Processing Time Metrics
  averageProcessingTimeHours: number;
  averageAutoApprovalTimeHours: number;
  averageHybridReviewTimeHours: number;
  
  // Financial Metrics
  totalClaimAmount: number;
  totalApprovedAmount: number;
  averageClaimAmount: number;
  averageApprovedAmount: number;
  aiEstimateAccuracy: number; // Percentage accuracy of AI estimates vs final approved
  financialVariance: number; // Total difference between AI estimates and final approved
  
  // Confidence Metrics
  averageConfidenceScore: number;
  averageAutoApprovedConfidence: number;
  averageHybridReviewConfidence: number;
  
  // Policy Effectiveness Score (0-100)
  effectivenessScore: number;
}

/**
 * Calculate policy impact metrics for a specific policy version
 */
export async function getPolicyImpactMetrics(
  policyId: number,
  tenantId: string
): Promise<PolicyImpactMetrics> {
  const db = await getDb();

  // Get policy details
  const [policy] = await db
    .select()
    .from(automationPolicies)
    .where(
      and(
        eq(automationPolicies.id, policyId),
        eq(automationPolicies.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!policy) {
    throw new Error(`Policy ${policyId} not found`);
  }

  // Get claims routed using this policy
  const policyEffectiveFrom = policy.effectiveFrom;
  const policyEffectiveUntil = policy.effectiveUntil || new Date();

  const routedClaims = await db
    .select({
      claimId: claimRoutingDecisions.claimId,
      routingDecision: claimRoutingDecisions.routingDecision,
      policyVersion: claimRoutingDecisions.policyVersion,
      routedAt: claimRoutingDecisions.routedAt,
    })
    .from(claimRoutingDecisions)
    .where(
      and(
        eq(claimRoutingDecisions.policyVersion, policy.version),
        gte(claimRoutingDecisions.routedAt, policyEffectiveFrom),
        lte(claimRoutingDecisions.routedAt, policyEffectiveUntil)
      )
    );

  const totalClaims = routedClaims.length;

  if (totalClaims === 0) {
    // Return empty metrics if no claims
    return {
      policyId: policy.id,
      policyVersion: policy.version,
      policyName: policy.policyName,
      effectiveFrom: policy.effectiveFrom,
      effectiveUntil: policy.effectiveUntil,
      totalClaims: 0,
      autoApprovedClaims: 0,
      hybridReviewClaims: 0,
      escalatedClaims: 0,
      fraudReviewClaims: 0,
      totalOverrides: 0,
      overrideRate: 0,
      aiToHumanApprovalOverrides: 0,
      aiToHumanRejectionOverrides: 0,
      fraudDetectionRate: 0,
      confirmedFraudCases: 0,
      falsePositiveFraudRate: 0,
      averageProcessingTimeHours: 0,
      averageAutoApprovalTimeHours: 0,
      averageHybridReviewTimeHours: 0,
      totalClaimAmount: 0,
      totalApprovedAmount: 0,
      averageClaimAmount: 0,
      averageApprovedAmount: 0,
      aiEstimateAccuracy: 0,
      financialVariance: 0,
      averageConfidenceScore: 0,
      averageAutoApprovedConfidence: 0,
      averageHybridReviewConfidence: 0,
      effectivenessScore: 0,
    };
  }

  // Count routing decisions
  const autoApprovedClaims = routedClaims.filter(c => c.routingDecision === "auto_approve").length;
  const hybridReviewClaims = routedClaims.filter(c => c.routingDecision === "hybrid_review").length;
  const escalatedClaims = routedClaims.filter(c => c.routingDecision === "escalate").length;
  const fraudReviewClaims = routedClaims.filter(c => c.routingDecision === "fraud_review").length;

  // Get claim details for financial and override metrics
  const claimIds = routedClaims.map(c => c.claimId);
  const claimDetails = await db
    .select()
    .from(claims)
    .where(sql`${claims.id} IN (${sql.join(claimIds.map(id => sql`${id}`), sql`, `)})`);

  // Calculate financial metrics
  let totalClaimAmount = 0;
  let totalApprovedAmount = 0;
  let totalAiEstimate = 0;
  let totalFinalApproved = 0;
  let totalOverrides = 0;
  let aiToHumanApprovalOverrides = 0;
  let aiToHumanRejectionOverrides = 0;
  let confirmedFraudCases = 0;
  let totalProcessingTime = 0;
  let autoApprovalProcessingTime = 0;
  let hybridReviewProcessingTime = 0;
  let autoApprovalCount = 0;
  let hybridReviewCount = 0;

  for (const claim of claimDetails) {
    const aiEstimate = Number(claim.aiEstimatedCost) || 0;
    const finalApproved = Number(claim.insurerApprovedCost) || 0;

    totalClaimAmount += aiEstimate;
    totalApprovedAmount += finalApproved;
    totalAiEstimate += aiEstimate;
    totalFinalApproved += finalApproved;

    // Check for overrides (AI decision vs final decision)
    const routingDecision = routedClaims.find(rc => rc.claimId === claim.id)?.routingDecision;
    const finalDecision = claim.finalDecision;

    if (routingDecision === "auto_approve" && finalDecision === "rejected") {
      totalOverrides++;
      aiToHumanApprovalOverrides++;
    } else if (routingDecision === "escalate" && finalDecision === "approved") {
      totalOverrides++;
      aiToHumanRejectionOverrides++;
    }

    // Check for confirmed fraud
    if (claim.finalFraudOutcome === "fraudulent") {
      confirmedFraudCases++;
    }

    // Calculate processing time
    if (claim.createdAt && claim.updatedAt) {
      const processingTimeMs = new Date(claim.updatedAt).getTime() - new Date(claim.createdAt).getTime();
      const processingTimeHours = processingTimeMs / (1000 * 60 * 60);
      totalProcessingTime += processingTimeHours;

      if (routingDecision === "auto_approve") {
        autoApprovalProcessingTime += processingTimeHours;
        autoApprovalCount++;
      } else if (routingDecision === "hybrid_review") {
        hybridReviewProcessingTime += processingTimeHours;
        hybridReviewCount++;
      }
    }
  }

  // Get confidence scores
  const confidenceScores = await db
    .select()
    .from(claimConfidenceScores)
    .where(sql`${claimConfidenceScores.claimId} IN (${sql.join(claimIds.map(id => sql`${id}`), sql`, `)})`);

  let totalConfidenceScore = 0;
  let autoApprovedConfidenceSum = 0;
  let hybridReviewConfidenceSum = 0;
  let autoApprovedConfidenceCount = 0;
  let hybridReviewConfidenceCount = 0;

  for (const cs of confidenceScores) {
    const confidenceScore = Number(cs.compositeConfidenceScore);
    totalConfidenceScore += confidenceScore;

    const routingDecision = routedClaims.find(rc => rc.claimId === cs.claimId)?.routingDecision;
    if (routingDecision === "auto_approve") {
      autoApprovedConfidenceSum += confidenceScore;
      autoApprovedConfidenceCount++;
    } else if (routingDecision === "hybrid_review") {
      hybridReviewConfidenceSum += confidenceScore;
      hybridReviewConfidenceCount++;
    }
  }

  // Calculate metrics
  const overrideRate = totalClaims > 0 ? (totalOverrides / totalClaims) * 100 : 0;
  const fraudDetectionRate = totalClaims > 0 ? (fraudReviewClaims / totalClaims) * 100 : 0;
  const falsePositiveFraudRate = fraudReviewClaims > 0 ? ((fraudReviewClaims - confirmedFraudCases) / fraudReviewClaims) * 100 : 0;
  const averageProcessingTimeHours = totalClaims > 0 ? totalProcessingTime / totalClaims : 0;
  const averageAutoApprovalTimeHours = autoApprovalCount > 0 ? autoApprovalProcessingTime / autoApprovalCount : 0;
  const averageHybridReviewTimeHours = hybridReviewCount > 0 ? hybridReviewProcessingTime / hybridReviewCount : 0;
  const averageClaimAmount = totalClaims > 0 ? totalClaimAmount / totalClaims : 0;
  const averageApprovedAmount = totalClaims > 0 ? totalApprovedAmount / totalClaims : 0;
  const aiEstimateAccuracy = totalFinalApproved > 0 ? (1 - Math.abs(totalAiEstimate - totalFinalApproved) / totalFinalApproved) * 100 : 0;
  const financialVariance = totalAiEstimate - totalFinalApproved;
  const averageConfidenceScore = confidenceScores.length > 0 ? totalConfidenceScore / confidenceScores.length : 0;
  const averageAutoApprovedConfidence = autoApprovedConfidenceCount > 0 ? autoApprovedConfidenceSum / autoApprovedConfidenceCount : 0;
  const averageHybridReviewConfidence = hybridReviewConfidenceCount > 0 ? hybridReviewConfidenceSum / hybridReviewConfidenceCount : 0;

  // Calculate effectiveness score (0-100)
  // Weighted combination of:
  // - Low override rate (40%)
  // - High fraud detection accuracy (30%)
  // - Fast processing time (20%)
  // - High AI estimate accuracy (10%)
  const overrideScore = Math.max(0, 100 - overrideRate * 2); // Lower override rate = higher score
  const fraudScore = Math.max(0, 100 - falsePositiveFraudRate); // Lower false positive = higher score
  const processingScore = Math.max(0, 100 - averageProcessingTimeHours * 2); // Faster processing = higher score
  const accuracyScore = aiEstimateAccuracy;

  const effectivenessScore = (
    overrideScore * 0.4 +
    fraudScore * 0.3 +
    processingScore * 0.2 +
    accuracyScore * 0.1
  );

  return {
    policyId: policy.id,
    policyVersion: policy.version,
    policyName: policy.policyName,
    effectiveFrom: policy.effectiveFrom,
    effectiveUntil: policy.effectiveUntil,
    totalClaims,
    autoApprovedClaims,
    hybridReviewClaims,
    escalatedClaims,
    fraudReviewClaims,
    totalOverrides,
    overrideRate,
    aiToHumanApprovalOverrides,
    aiToHumanRejectionOverrides,
    fraudDetectionRate,
    confirmedFraudCases,
    falsePositiveFraudRate,
    averageProcessingTimeHours,
    averageAutoApprovalTimeHours,
    averageHybridReviewTimeHours,
    totalClaimAmount,
    totalApprovedAmount,
    averageClaimAmount,
    averageApprovedAmount,
    aiEstimateAccuracy,
    financialVariance,
    averageConfidenceScore,
    averageAutoApprovedConfidence,
    averageHybridReviewConfidence,
    effectivenessScore,
  };
}

/**
 * Compare impact metrics between two policy versions
 */
export async function comparePolicyPerformance(
  policy1Id: number,
  policy2Id: number,
  tenantId: string
): Promise<{
  policy1Metrics: PolicyImpactMetrics;
  policy2Metrics: PolicyImpactMetrics;
  improvements: {
    overrideRateImprovement: number;
    fraudDetectionImprovement: number;
    processingTimeImprovement: number;
    aiAccuracyImprovement: number;
    effectivenessImprovement: number;
  };
}> {
  const [policy1Metrics, policy2Metrics] = await Promise.all([
    getPolicyImpactMetrics(policy1Id, tenantId),
    getPolicyImpactMetrics(policy2Id, tenantId),
  ]);

  return {
    policy1Metrics,
    policy2Metrics,
    improvements: {
      overrideRateImprovement: policy1Metrics.overrideRate - policy2Metrics.overrideRate,
      fraudDetectionImprovement: policy2Metrics.fraudDetectionRate - policy1Metrics.fraudDetectionRate,
      processingTimeImprovement: policy1Metrics.averageProcessingTimeHours - policy2Metrics.averageProcessingTimeHours,
      aiAccuracyImprovement: policy2Metrics.aiEstimateAccuracy - policy1Metrics.aiEstimateAccuracy,
      effectivenessImprovement: policy2Metrics.effectivenessScore - policy1Metrics.effectivenessScore,
    },
  };
}

/**
 * Get policy impact metrics for all policies in a tenant
 */
export async function getAllPolicyImpactMetrics(
  tenantId: string
): Promise<PolicyImpactMetrics[]> {
  const db = await getDb();

  const policies = await db
    .select()
    .from(automationPolicies)
    .where(eq(automationPolicies.tenantId, tenantId))
    .orderBy(automationPolicies.createdAt);

  const metricsPromises = policies.map(policy => 
    getPolicyImpactMetrics(policy.id, tenantId)
  );

  return Promise.all(metricsPromises);
}
