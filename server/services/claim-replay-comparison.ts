/**
 * Claim Replay Comparison Analytics
 * 
 * Compares original historical claim decisions with KINGA AI routing decisions.
 * Stores replay results for performance analysis and system validation.
 */

import { getDb } from "../db";
import { historicalClaims, historicalReplayResults } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import type { ReplayAiAssessmentResult } from "./claim-replay-ai-assessment";
import type { ReplayRoutingDecisionResult } from "./claim-replay-routing-engine";
import { replayCompleteAiAssessment } from "./claim-replay-ai-assessment";
import { replayRoutingDecision, mapOriginalDecisionToRoutingDecision } from "./claim-replay-routing-engine";

export interface ComparisonMetrics {
  // Decision comparison
  decisionMatch: boolean;
  originalDecision: "approved" | "rejected" | "referred" | "total_loss" | "cash_settlement" | null;
  kingaRoutingDecision: "auto_approve" | "hybrid_review" | "escalate" | "fraud_review";
  decisionDelta: string; // Human-readable description
  
  // Financial comparison
  originalPayout: number; // In cents
  kingaPredictedPayout: number; // In cents
  payoutVariance: number; // originalPayout - kingaPredictedPayout
  payoutVariancePercentage: number; // (variance / originalPayout) * 100
  financialImpact: "savings" | "cost_increase" | "neutral";
  
  // Time comparison
  originalProcessingTimeHours: number;
  kingaEstimatedProcessingTimeHours: number;
  processingTimeDelta: number; // originalProcessingTime - kingaEstimatedProcessingTime
  processingTimeDeltaPercentage: number;
  timeImpact: "faster" | "slower" | "neutral";
  
  // Confidence analysis
  confidenceLevel: "very_high" | "high" | "medium" | "low" | "very_low";
  confidenceJustification: string;
  
  // Performance summary
  performanceSummary: string;
  recommendedAction: "adopt_kinga" | "review_policy" | "manual_review" | "no_action";
}

/**
 * Compare original decision with KINGA routing decision
 */
function compareDecisions(
  originalDecision: "approved" | "rejected" | "referred" | "total_loss" | "cash_settlement" | null,
  kingaRoutingDecision: "auto_approve" | "hybrid_review" | "escalate" | "fraud_review"
): {
  decisionMatch: boolean;
  decisionDelta: string;
} {
  const mappedOriginal = mapOriginalDecisionToRoutingDecision(originalDecision);
  
  if (!mappedOriginal) {
    return {
      decisionMatch: false,
      decisionDelta: `Original decision unknown, KINGA suggests ${kingaRoutingDecision}`,
    };
  }
  
  const decisionMatch = mappedOriginal === kingaRoutingDecision;
  
  let decisionDelta: string;
  if (decisionMatch) {
    decisionDelta = `Both systems agree: ${kingaRoutingDecision}`;
  } else {
    decisionDelta = `Original: ${mappedOriginal} → KINGA: ${kingaRoutingDecision}`;
  }
  
  return { decisionMatch, decisionDelta };
}

/**
 * Compare financial outcomes
 */
function compareFinancials(
  originalPayout: number,
  kingaPredictedPayout: number
): {
  payoutVariance: number;
  payoutVariancePercentage: number;
  financialImpact: "savings" | "cost_increase" | "neutral";
} {
  const payoutVariance = originalPayout - kingaPredictedPayout;
  const payoutVariancePercentage = originalPayout > 0
    ? (payoutVariance / originalPayout) * 100
    : 0;
  
  let financialImpact: "savings" | "cost_increase" | "neutral";
  if (Math.abs(payoutVariancePercentage) < 5) {
    financialImpact = "neutral";
  } else if (payoutVariance > 0) {
    financialImpact = "savings"; // KINGA predicted lower payout
  } else {
    financialImpact = "cost_increase"; // KINGA predicted higher payout
  }
  
  return {
    payoutVariance,
    payoutVariancePercentage,
    financialImpact,
  };
}

/**
 * Compare processing times
 */
function compareProcessingTimes(
  originalProcessingTimeHours: number,
  kingaEstimatedProcessingTimeHours: number
): {
  processingTimeDelta: number;
  processingTimeDeltaPercentage: number;
  timeImpact: "faster" | "slower" | "neutral";
} {
  const processingTimeDelta = originalProcessingTimeHours - kingaEstimatedProcessingTimeHours;
  const processingTimeDeltaPercentage = originalProcessingTimeHours > 0
    ? (processingTimeDelta / originalProcessingTimeHours) * 100
    : 0;
  
  let timeImpact: "faster" | "slower" | "neutral";
  if (Math.abs(processingTimeDeltaPercentage) < 10) {
    timeImpact = "neutral";
  } else if (processingTimeDelta > 0) {
    timeImpact = "faster"; // KINGA processes faster
  } else {
    timeImpact = "slower"; // KINGA processes slower
  }
  
  return {
    processingTimeDelta,
    processingTimeDeltaPercentage,
    timeImpact,
  };
}

/**
 * Generate performance summary
 */
function generatePerformanceSummary(
  metrics: ComparisonMetrics
): string {
  const parts: string[] = [];
  
  // Decision comparison
  if (metrics.decisionMatch) {
    parts.push("✅ KINGA routing decision matches original outcome");
  } else {
    parts.push(`⚠️ Decision mismatch: ${metrics.decisionDelta}`);
  }
  
  // Financial impact
  if (metrics.financialImpact === "savings") {
    parts.push(`💰 Potential savings: $${(Math.abs(metrics.payoutVariance) / 100).toFixed(2)} (${metrics.payoutVariancePercentage.toFixed(1)}%)`);
  } else if (metrics.financialImpact === "cost_increase") {
    parts.push(`💸 Potential cost increase: $${(Math.abs(metrics.payoutVariance) / 100).toFixed(2)} (${Math.abs(metrics.payoutVariancePercentage).toFixed(1)}%)`);
  } else {
    parts.push("💵 Financial impact: Neutral");
  }
  
  // Time impact
  if (metrics.timeImpact === "faster") {
    parts.push(`⚡ Processing time reduced by ${metrics.processingTimeDelta.toFixed(1)} hours (${metrics.processingTimeDeltaPercentage.toFixed(1)}%)`);
  } else if (metrics.timeImpact === "slower") {
    parts.push(`🐌 Processing time increased by ${Math.abs(metrics.processingTimeDelta).toFixed(1)} hours (${Math.abs(metrics.processingTimeDeltaPercentage).toFixed(1)}%)`);
  } else {
    parts.push("⏱️ Processing time: Similar");
  }
  
  // Confidence
  parts.push(`🎯 Confidence: ${metrics.confidenceLevel.toUpperCase().replace(/_/g, " ")}`);
  
  return parts.join(" | ");
}

/**
 * Determine recommended action
 */
function determineRecommendedAction(
  metrics: ComparisonMetrics
): "adopt_kinga" | "review_policy" | "manual_review" | "no_action" {
  // High confidence + decision match + savings = adopt KINGA
  if (
    metrics.decisionMatch &&
    (metrics.confidenceLevel === "very_high" || metrics.confidenceLevel === "high") &&
    metrics.financialImpact === "savings"
  ) {
    return "adopt_kinga";
  }
  
  // Decision mismatch + high confidence = review policy
  if (!metrics.decisionMatch && (metrics.confidenceLevel === "very_high" || metrics.confidenceLevel === "high")) {
    return "review_policy";
  }
  
  // Low confidence or large cost increase = manual review
  if (
    metrics.confidenceLevel === "low" ||
    metrics.confidenceLevel === "very_low" ||
    (metrics.financialImpact === "cost_increase" && Math.abs(metrics.payoutVariancePercentage) > 20)
  ) {
    return "manual_review";
  }
  
  // Default: no action
  return "no_action";
}

/**
 * Calculate comparison metrics
 */
export function calculateComparisonMetrics(
  claim: any,
  aiAssessment: ReplayAiAssessmentResult,
  routingResult: ReplayRoutingDecisionResult
): ComparisonMetrics {
  // Extract original data
  const originalDecision = claim.repairDecision as "approved" | "rejected" | "referred" | "total_loss" | "cash_settlement" | null;
  const originalPayout = Number(claim.finalApprovedCost) * 100 || 0; // Convert to cents
  const originalProcessingTimeHours = 24; // Default 24 hours (no historical data available)
  
  // Decision comparison
  const { decisionMatch, decisionDelta } = compareDecisions(
    originalDecision,
    routingResult.routingDecision
  );
  
  // Financial comparison
  const { payoutVariance, payoutVariancePercentage, financialImpact } = compareFinancials(
    originalPayout,
    routingResult.predictedPayout
  );
  
  // Time comparison
  const { processingTimeDelta, processingTimeDeltaPercentage, timeImpact } = compareProcessingTimes(
    originalProcessingTimeHours,
    routingResult.estimatedProcessingTimeHours
  );
  
  // Confidence analysis
  const confidenceLevel = aiAssessment.compositeConfidenceScore >= 90 ? "very_high"
    : aiAssessment.compositeConfidenceScore >= 80 ? "high"
    : aiAssessment.compositeConfidenceScore >= 70 ? "medium"
    : aiAssessment.compositeConfidenceScore >= 60 ? "low"
    : "very_low";
  
  const confidenceJustification = `Composite confidence score: ${aiAssessment.compositeConfidenceScore}% (Damage: ${aiAssessment.damageDetectionScore}%, Cost: ${aiAssessment.costConfidenceLevel}, Fraud: ${100 - aiAssessment.fraudScore}%)`;
  
  const metrics: ComparisonMetrics = {
    decisionMatch,
    originalDecision,
    kingaRoutingDecision: routingResult.routingDecision,
    decisionDelta,
    originalPayout,
    kingaPredictedPayout: routingResult.predictedPayout,
    payoutVariance,
    payoutVariancePercentage,
    financialImpact,
    originalProcessingTimeHours,
    kingaEstimatedProcessingTimeHours: routingResult.estimatedProcessingTimeHours,
    processingTimeDelta,
    processingTimeDeltaPercentage,
    timeImpact,
    confidenceLevel,
    confidenceJustification,
    performanceSummary: "", // Will be filled below
    recommendedAction: "no_action", // Will be filled below
  };
  
  metrics.performanceSummary = generatePerformanceSummary(metrics);
  metrics.recommendedAction = determineRecommendedAction(metrics);
  
  return metrics;
}

/**
 * Store replay results in database
 */
export async function storeReplayResults(
  historicalClaimId: number,
  claim: any,
  aiAssessment: ReplayAiAssessmentResult,
  routingResult: ReplayRoutingDecisionResult,
  metrics: ComparisonMetrics,
  replayedByUserId: number
): Promise<number> {
  const db = await getDb();
  
  // Get next replay version for this claim
  const existingReplays = await db
    .select()
    .from(historicalReplayResults)
    .where(eq(historicalReplayResults.historicalClaimId, historicalClaimId))
    .orderBy(desc(historicalReplayResults.replayVersion))
    .limit(1);
  
  const replayVersion = existingReplays.length > 0 ? (existingReplays[0].replayVersion || 0) + 1 : 1;
  
  // Insert replay result
  const [result] = await db.insert(historicalReplayResults).values({
    tenantId: claim.tenantId,
    historicalClaimId,
    originalClaimReference: claim.claimReference,
    replayedByUserId,
    replayVersion,
    policyVersionId: routingResult.policyVersionId,
    policyVersion: routingResult.policyVersion,
    policyName: routingResult.policyName,
    originalDecision: metrics.originalDecision,
    originalPayout: metrics.originalPayout.toString(),
    originalProcessingTimeHours: metrics.originalProcessingTimeHours.toString(),
    originalAssessorName: claim.assessorName,
    aiDamageDetectionScore: aiAssessment.damageDetectionScore.toString(),
    aiEstimatedCost: aiAssessment.estimatedCost.toString(),
    aiFraudScore: aiAssessment.fraudScore.toString(),
    aiConfidenceScore: aiAssessment.compositeConfidenceScore.toString(),
    kingaRoutingDecision: routingResult.routingDecision,
    kingaPredictedPayout: routingResult.predictedPayout.toString(),
    kingaEstimatedProcessingTimeHours: routingResult.estimatedProcessingTimeHours.toString(),
    decisionMatch: metrics.decisionMatch ? 1 : 0,
    payoutVariance: metrics.payoutVariance.toString(),
    payoutVariancePercentage: metrics.payoutVariancePercentage.toString(),
    processingTimeDelta: metrics.processingTimeDelta.toString(),
    processingTimeDeltaPercentage: metrics.processingTimeDeltaPercentage.toString(),
    confidenceLevel: metrics.confidenceLevel,
    confidenceJustification: metrics.confidenceJustification,
    fraudRiskLevel: aiAssessment.fraudRiskLevel,
    fraudIndicators: JSON.stringify(aiAssessment.fraudIndicators),
    simulatedWorkflowSteps: JSON.stringify(routingResult.simulatedWorkflowSteps),
    isReplay: 1,
    noLiveMutation: 1,
    performanceSummary: metrics.performanceSummary,
    recommendedAction: metrics.recommendedAction,
    replayDurationMs: aiAssessment.processingTimeMs,
    replayStatus: "success",
  });
  
  // Update historical claim replay tracking
  await db
    .update(historicalClaims)
    .set({
      replayMode: 1,
      lastReplayedAt: new Date(),
      replayCount: (claim.replayCount || 0) + 1,
    })
    .where(eq(historicalClaims.id, historicalClaimId));
  
  return result.insertId;
}

/**
 * Complete replay workflow: AI assessment + routing + comparison + storage
 */
export async function replayHistoricalClaim(
  historicalClaimId: number,
  replayedByUserId: number
): Promise<{
  replayResultId: number;
  metrics: ComparisonMetrics;
  aiAssessment: ReplayAiAssessmentResult;
  routingResult: ReplayRoutingDecisionResult;
}> {
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
  
  console.log(`[Replay] Starting replay for claim ${historicalClaimId} (${claim.claimReference})`);
  
  // Step 1: AI re-assessment
  const aiAssessment = await replayCompleteAiAssessment(historicalClaimId);
  console.log(`[Replay] AI assessment complete: confidence ${aiAssessment.compositeConfidenceScore}%, fraud ${aiAssessment.fraudScore}%`);
  
  // Step 2: Routing decision
  const routingResult = await replayRoutingDecision(historicalClaimId, aiAssessment);
  console.log(`[Replay] Routing decision: ${routingResult.routingDecision}`);
  
  // Step 3: Comparison analytics
  const metrics = calculateComparisonMetrics(claim, aiAssessment, routingResult);
  console.log(`[Replay] Comparison complete: ${metrics.performanceSummary}`);
  
  // Step 4: Store results
  const replayResultId = await storeReplayResults(
    historicalClaimId,
    claim,
    aiAssessment,
    routingResult,
    metrics,
    replayedByUserId
  );
  console.log(`[Replay] Results stored with ID ${replayResultId}`);
  
  return {
    replayResultId,
    metrics,
    aiAssessment,
    routingResult,
  };
}
