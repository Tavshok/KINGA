// @ts-nocheck
/**
 * Confidence Score Calculation and Routing Service
 * 
 * Calculates a normalized confidence score (0-100) for insurance claims
 * based on multiple risk factors, then determines optimal routing path.
 * 
 * Formula Components (weighted):
 * - Fraud Risk Score (30%): Lower fraud risk = higher confidence
 * - AI Damage Detection Certainty (25%): Higher AI certainty = higher confidence
 * - Quote Variance Level (20%): Lower variance = higher confidence
 * - Claim Completeness (15%): More complete = higher confidence
 * - Historical Claimant Risk (10%): Lower historical risk = higher confidence
 * 
 * Routing Categories:
 * - HIGH (>= threshold): Eligible for AI-only fast-track (if tenant enabled)
 * - MEDIUM: Internal assessor required
 * - LOW: Mandatory external assessment
 */

import { getDb } from "../db";
import { claims, aiAssessments, tenantRoleConfigs, routingThresholdConfig, workflowAuditTrail } from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

/**
 * Component scores for confidence calculation
 */
export interface ConfidenceComponents {
  fraudRiskScore: number;        // 0-100 (lower = more fraud risk)
  aiCertainty: number;            // 0-100 (AI model confidence)
  quoteVariance: number;          // 0-100 (lower = higher variance)
  claimCompleteness: number;      // 0-100 (percentage of required fields)
  historicalClaimantRisk: number; // 0-100 (lower = higher risk history)
}

/**
 * Weights for each component (must sum to 1.0)
 */
export const CONFIDENCE_WEIGHTS = {
  fraudRisk: 0.30,
  aiCertainty: 0.25,
  quoteVariance: 0.20,
  claimCompleteness: 0.15,
  historicalRisk: 0.10,
} as const;

/**
 * Routing category thresholds (tenant-configurable)
 */
export interface RoutingThresholds {
  highConfidenceThreshold: number;  // >= this = HIGH confidence
  mediumConfidenceThreshold: number; // >= this = MEDIUM confidence
  // < medium = LOW confidence
  aiFastTrackEnabled: boolean;      // Whether AI-only fast-track is allowed
}

/**
 * Default routing thresholds (used if tenant hasn't configured custom values)
 */
export const DEFAULT_ROUTING_THRESHOLDS: RoutingThresholds = {
  highConfidenceThreshold: 75,
  mediumConfidenceThreshold: 50,
  aiFastTrackEnabled: false,
};

/**
 * Routing categories
 */
export type RoutingCategory = "HIGH" | "MEDIUM" | "LOW";

/**
 * Routing recommendation
 */
export interface RoutingRecommendation {
  category: RoutingCategory;
  confidenceScore: number;
  components: ConfidenceComponents;
  recommendedPath: string;
  reasoning: string;
  requiresExternalAssessment: boolean;
  eligibleForFastTrack: boolean;
}

/**
 * Calculate fraud risk score (0-100, lower = more fraud risk)
 * 
 * Factors considered:
 * - Claim amount vs policy limits
 * - Time since incident
 * - Number of previous claims
 * - Incident type risk profile
 */
async function calculateFraudRiskScore(claimId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 50; // Default neutral score

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) return 50;

  let score = 100; // Start with perfect score

  // Factor 1: Claim amount suspiciously high (>80% of typical)
  const claimAmount = claim.claimAmount || 0;
  if (claimAmount > 100000) score -= 20; // Large claims more scrutiny
  if (claimAmount > 500000) score -= 20; // Very large claims

  // Factor 2: Time since incident (immediate claims can be suspicious)
  if (claim.incidentDate) {
    const daysSinceIncident = Math.floor(
      (Date.now() - claim.incidentDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceIncident === 0) score -= 15; // Same-day claim
    if (daysSinceIncident > 90) score -= 10; // Very delayed reporting
  }

  // Factor 3: Check for previous claims by same claimant (if available)
  const previousClaims = await db
    .select({ count: sql<number>`count(*)` })
    .from(claims)
    .where(
      and(
        eq(claims.claimantName, claim.claimantName),
        sql`${claims.id} != ${claimId}`
      )
    );

  const priorClaimCount = Number(previousClaims[0]?.count || 0);
  if (priorClaimCount > 2) score -= 15; // Frequent claimant
  if (priorClaimCount > 5) score -= 15; // Very frequent claimant

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate AI damage detection certainty (0-100)
 * 
 * Uses the AI assessment confidence score directly
 */
async function calculateAICertainty(claimId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0; // No AI assessment = no certainty

  const [assessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!assessment) return 0;

  // AI confidence is already 0-100
  return Math.max(0, Math.min(100, assessment.confidence || 0));
}

/**
 * Calculate quote variance score (0-100, lower = higher variance)
 * 
 * Compares AI estimate vs submitted quotes
 */
async function calculateQuoteVariance(claimId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 50; // Default neutral

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) return 50;

  const [assessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!assessment || !assessment.estimatedCost) return 50;

  const aiEstimate = assessment.estimatedCost;
  const claimAmount = claim.claimAmount || 0;

  if (claimAmount === 0) return 50;

  // Calculate percentage variance
  const variance = Math.abs(aiEstimate - claimAmount) / claimAmount;

  // Convert to 0-100 score (lower variance = higher score)
  if (variance <= 0.05) return 100; // Within 5% = perfect
  if (variance <= 0.10) return 90;  // Within 10% = excellent
  if (variance <= 0.20) return 75;  // Within 20% = good
  if (variance <= 0.30) return 60;  // Within 30% = acceptable
  if (variance <= 0.50) return 40;  // Within 50% = concerning
  return 20; // >50% variance = high risk
}

/**
 * Calculate claim completeness score (0-100)
 * 
 * Percentage of required fields that are filled
 */
async function calculateClaimCompleteness(claimId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) return 0;

  // Required fields checklist
  const requiredFields = [
    claim.claimNumber,
    claim.policyNumber,
    claim.claimantName,
    claim.incidentDate,
    claim.claimAmount,
    claim.incidentDescription,
  ];

  const filledFields = requiredFields.filter(field => field !== null && field !== undefined && field !== "").length;
  const completeness = (filledFields / requiredFields.length) * 100;

  return Math.round(completeness);
}

/**
 * Calculate historical claimant risk score (0-100, lower = higher risk)
 * 
 * Analyzes past claim patterns for this claimant
 */
async function calculateHistoricalClaimantRisk(claimId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 100; // No history = assume good

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) return 100;

  // Get all previous claims by this claimant
  const previousClaims = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.claimantName, claim.claimantName),
        sql`${claims.id} < ${claimId}` // Only past claims
      )
    )
    .orderBy(desc(claims.createdAt));

  if (previousClaims.length === 0) return 100; // First-time claimant = good

  let score = 100;

  // Factor 1: Number of previous claims
  if (previousClaims.length > 2) score -= 20;
  if (previousClaims.length > 5) score -= 20;

  // Factor 2: Frequency of claims (claims per year)
  if (previousClaims.length > 0) {
    const oldestClaim = previousClaims[previousClaims.length - 1];
    const daysSinceFirst = Math.floor(
      (Date.now() - oldestClaim.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const yearsActive = Math.max(1, daysSinceFirst / 365);
    const claimsPerYear = previousClaims.length / yearsActive;

    if (claimsPerYear > 2) score -= 20; // More than 2 claims/year
    if (claimsPerYear > 4) score -= 20; // More than 4 claims/year
  }

  // Factor 3: Rejected or disputed claims
  const rejectedCount = previousClaims.filter(c => 
    c.workflowState === "rejected" || c.workflowState === "disputed"
  ).length;

  if (rejectedCount > 0) score -= 15;
  if (rejectedCount > 2) score -= 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate overall confidence score (0-100)
 * 
 * Weighted combination of all component scores
 */
export async function calculateConfidenceScore(claimId: number): Promise<{
  score: number;
  components: ConfidenceComponents;
}> {
  // Calculate all component scores in parallel
  const [fraudRisk, aiCertainty, quoteVariance, completeness, historicalRisk] = await Promise.all([
    calculateFraudRiskScore(claimId),
    calculateAICertainty(claimId),
    calculateQuoteVariance(claimId),
    calculateClaimCompleteness(claimId),
    calculateHistoricalClaimantRisk(claimId),
  ]);

  const components: ConfidenceComponents = {
    fraudRiskScore: fraudRisk,
    aiCertainty,
    quoteVariance,
    claimCompleteness: completeness,
    historicalClaimantRisk: historicalRisk,
  };

  // Calculate weighted score
  const score = 
    (fraudRisk * CONFIDENCE_WEIGHTS.fraudRisk) +
    (aiCertainty * CONFIDENCE_WEIGHTS.aiCertainty) +
    (quoteVariance * CONFIDENCE_WEIGHTS.quoteVariance) +
    (completeness * CONFIDENCE_WEIGHTS.claimCompleteness) +
    (historicalRisk * CONFIDENCE_WEIGHTS.historicalRisk);

  return {
    score: Math.round(score * 10) / 10, // Round to 1 decimal place
    components,
  };
}

/**
 * Get routing thresholds for a tenant
 */
export async function getRoutingThresholds(tenantId: string): Promise<RoutingThresholds> {
  const db = await getDb();
  if (!db) return DEFAULT_ROUTING_THRESHOLDS;

  const configs = await db
    .select()
    .from(routingThresholdConfig)
    .where(and(eq(routingThresholdConfig.tenantId, tenantId), eq(routingThresholdConfig.isActive, 1)))
    .orderBy(desc(routingThresholdConfig.createdAt))
    .limit(1);

  if (!configs.length) {
    return DEFAULT_ROUTING_THRESHOLDS;
  }

  const cfg = configs[0];
  return {
    highConfidenceThreshold: Number(cfg.highThreshold) ?? DEFAULT_ROUTING_THRESHOLDS.highConfidenceThreshold,
    mediumConfidenceThreshold: Number(cfg.mediumThreshold) ?? DEFAULT_ROUTING_THRESHOLDS.mediumConfidenceThreshold,
    aiFastTrackEnabled: cfg.aiFastTrackEnabled === 1,
  };
}

/**
 * Update routing thresholds for a tenant (admin only)
 */
export async function updateRoutingThresholds(
  tenantId: string,
  thresholds: Partial<RoutingThresholds>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current config
  const current = await getRoutingThresholds(tenantId);

  // Merge with new values
  const updated = {
    ...current,
    ...thresholds,
  };

  // Validate thresholds
  if (updated.highConfidenceThreshold <= updated.mediumConfidenceThreshold) {
    throw new Error("High confidence threshold must be greater than medium threshold");
  }

  if (updated.mediumConfidenceThreshold < 0 || updated.highConfidenceThreshold > 100) {
    throw new Error("Thresholds must be between 0 and 100");
  }

  // Deactivate existing active configs for this tenant
  await db
    .update(routingThresholdConfig)
    .set({ isActive: 0 })
    .where(and(eq(routingThresholdConfig.tenantId, tenantId), eq(routingThresholdConfig.isActive, 1)));

  // Insert new active config version
  const newId = `rtc-${tenantId}-${Date.now()}`;
  await db
    .insert(routingThresholdConfig)
    .values({
      id: newId,
      tenantId,
      version: `v${Date.now()}`,
      highThreshold: String(updated.highConfidenceThreshold),
      mediumThreshold: String(updated.mediumConfidenceThreshold),
      aiFastTrackEnabled: updated.aiFastTrackEnabled ? 1 : 0,
      createdByUserId: 0,
      isActive: 1,
    });
}

/**
 * Determine routing category based on confidence score and thresholds
 */
export function determineRoutingCategory(
  confidenceScore: number,
  thresholds: RoutingThresholds
): RoutingCategory {
  if (confidenceScore >= thresholds.highConfidenceThreshold) {
    return "HIGH";
  }
  if (confidenceScore >= thresholds.mediumConfidenceThreshold) {
    return "MEDIUM";
  }
  return "LOW";
}

/**
 * Get recommended routing path with reasoning
 */
export async function getRecommendedRoute(
  claimId: number,
  tenantId: string
): Promise<RoutingRecommendation> {
  // Calculate confidence score
  const { score, components } = await calculateConfidenceScore(claimId);

  // Get tenant thresholds
  const thresholds = await getRoutingThresholds(tenantId);

  // Determine category
  const category = determineRoutingCategory(score, thresholds);

  // Generate recommendation
  let recommendedPath: string;
  let reasoning: string;
  let requiresExternalAssessment: boolean;
  let eligibleForFastTrack: boolean;

  switch (category) {
    case "HIGH":
      eligibleForFastTrack = thresholds.aiFastTrackEnabled;
      requiresExternalAssessment = false;
      recommendedPath = eligibleForFastTrack 
        ? "AI-only fast-track approval"
        : "Internal assessment with expedited review";
      reasoning = `High confidence score (${score}/100) indicates low risk. ${
        eligibleForFastTrack 
          ? "Eligible for AI-only processing without human review."
          : "Tenant has not enabled AI fast-track; internal review required."
      }`;
      break;

    case "MEDIUM":
      eligibleForFastTrack = false;
      requiresExternalAssessment = false;
      recommendedPath = "Internal assessor review required";
      reasoning = `Medium confidence score (${score}/100) requires human assessment. Internal assessor can handle without external expertise.`;
      break;

    case "LOW":
      eligibleForFastTrack = false;
      requiresExternalAssessment = true;
      recommendedPath = "Mandatory external assessment";
      reasoning = `Low confidence score (${score}/100) indicates high risk or complexity. External independent assessment required for validation.`;
      break;
  }

  return {
    category,
    confidenceScore: score,
    components,
    recommendedPath,
    reasoning,
    requiresExternalAssessment,
    eligibleForFastTrack,
  };
}

/**
 * Log routing decision to audit trail
 */
export async function logRoutingDecision(
  claimId: number,
  userId: number,
  userRole: string,
  recommendation: RoutingRecommendation,
  executiveOverride?: {
    overridden: boolean;
    overrideReason?: string;
    finalDecision?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(workflowAuditTrail).values({
    claimId,
    userId,
    userRole,
    actionType: "routing_decision",
    previousState: null,
    newState: null,
    metadata: JSON.stringify({
      confidenceScore: recommendation.confidenceScore,
      routingCategory: recommendation.category,
      recommendedPath: recommendation.recommendedPath,
      reasoning: recommendation.reasoning,
      components: recommendation.components,
      executiveOverride: executiveOverride || null,
    }),
    executiveOverride: executiveOverride?.overridden ? 1 : 0,
    overrideReason: executiveOverride?.overrideReason,
  });
}
