// @ts-nocheck
/**
 * KINGA AI Confidence Scoring Engine
 * 
 * Calculates composite confidence scores (0-100) for claim automation eligibility.
 * Aggregates 6 independent confidence metrics:
 * 1. Damage Detection Certainty (25% weight)
 * 2. Physics Validation Strength (20% weight)
 * 3. Fraud Scoring Confidence (15% weight)
 * 4. Historical AI Accuracy Patterns (15% weight)
 * 5. Data Completeness Metrics (15% weight)
 * 6. Vehicle Risk Intelligence (10% weight)
 * 
 * Confidence-Governed Automation Framework
 */

import { getDb } from "./db";
import { claims, aiAssessments, claimIntelligenceDataset, claimConfidenceScores } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export interface ConfidenceScoreComponents {
  damageCertainty: number; // 0-100
  physicsStrength: number; // 0-100
  fraudConfidence: number; // 0-100
  historicalAccuracy: number; // 0-100
  dataCompleteness: number; // 0-100
  vehicleRiskIntelligence: number; // 0-100
}

export interface ConfidenceScoreBreakdown extends ConfidenceScoreComponents {
  compositeConfidenceScore: number; // 0-100
  scoringVersion: string;
  
  // Component details
  damageCertaintyBreakdown?: object;
  physicsValidationDetails?: object;
  fraudAnalysisDetails?: object;
  historicalAccuracyDetails?: object;
  dataCompletenessDetails?: object;
  vehicleRiskDetails?: object;
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const SCORING_WEIGHTS = {
  damageCertainty: 0.25,
  physicsStrength: 0.20,
  fraudConfidence: 0.15,
  historicalAccuracy: 0.15,
  dataCompleteness: 0.15,
  vehicleRiskIntelligence: 0.10,
};

const SCORING_VERSION = "v1.0";

// ============================================================================
// COMPONENT SCORERS
// ============================================================================

/**
 * 1. Damage Detection Certainty (Weight: 25%)
 * 
 * Measures the AI's confidence in identifying damaged vehicle components from photos.
 * 
 * Formula:
 * damage_certainty = (avg_component_confidence) * component_coverage_factor
 * 
 * where:
 *   component_coverage_factor = 1.0 if all expected components detected
 *                             = 0.8 if 80-99% detected
 *                             = 0.6 if 60-79% detected
 *                             = 0.4 if < 60% detected
 */
export async function calculateDamageCertainty(claimId: number): Promise<{
  score: number;
  breakdown: object;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  // Get AI assessment for this claim
  const [assessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .limit(1);
  
  if (!assessment) {
    return {
      score: 0,
      breakdown: { reason: "No AI assessment found" },
    };
  }
  
  // Parse damage components (assume JSON structure: { components: [{ name, confidence }] })
  const damageComponentsJson = (assessment as any).damagedComponentsJson;
  const damageComponents = damageComponentsJson ? JSON.parse(damageComponentsJson) : null;
  if (!damageComponents || !Array.isArray(damageComponents)) {
    return {
      score: 50, // Default moderate confidence if no component data
      breakdown: { reason: "No component confidence data available" },
    };
  }
  
  // Calculate average component confidence
  const componentConfidences = damageComponents
    .map((c: any) => c.confidence || 0)
    .filter((conf: number) => conf > 0);
  
  if (componentConfidences.length === 0) {
    return {
      score: 50,
      breakdown: { reason: "No valid component confidences" },
    };
  }
  
  const avgComponentConfidence =
    componentConfidences.reduce((sum: number, conf: number) => sum + conf, 0) /
    componentConfidences.length;
  
  // Calculate component coverage factor
  const expectedComponentCount = 6; // Typical: bumper, hood, fender, door, quarter panel, headlight
  const detectedComponentCount = componentConfidences.length;
  const coverageRatio = detectedComponentCount / expectedComponentCount;
  
  let coverageFactor = 1.0;
  if (coverageRatio >= 1.0) coverageFactor = 1.0;
  else if (coverageRatio >= 0.8) coverageFactor = 0.8;
  else if (coverageRatio >= 0.6) coverageFactor = 0.6;
  else coverageFactor = 0.4;
  
  const damageCertainty = avgComponentConfidence * coverageFactor;
  
  return {
    score: Math.round(damageCertainty),
    breakdown: {
      avgComponentConfidence: Math.round(avgComponentConfidence),
      detectedComponentCount,
      expectedComponentCount,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      coverageFactor,
    },
  };
}

/**
 * 2. Physics Validation Strength (Weight: 20%)
 * 
 * Measures the consistency between reported accident physics and observed damage.
 * 
 * Formula:
 * physics_strength = physics_plausibility_score
 * 
 * where:
 *   physics_plausibility_score = 100 if damage perfectly matches physics
 *                              = 50-99 if minor inconsistencies
 *                              = 0-49 if major inconsistencies
 */
export async function calculatePhysicsStrength(claimId: number): Promise<{
  score: number;
  details: object;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  const [assessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .limit(1);
  
  const physicsAnalysis = (assessment as any).physicsAnalysis;
  if (!assessment || !physicsAnalysis) {
    return {
      score: 50, // Default moderate confidence if no physics validation
      details: { reason: "No physics validation data" },
    };
  }
  
  const physicsValidation = JSON.parse(physicsAnalysis);
  const plausibilityScore = physicsValidation.plausibilityScore || 50;
  
  return {
    score: Math.round(plausibilityScore),
    details: {
      plausibilityScore: Math.round(plausibilityScore),
      explanation: physicsValidation.explanation || "No explanation available",
    },
  };
}

/**
 * 3. Fraud Scoring Confidence (Weight: 15%)
 * 
 * Measures the AI's confidence in the fraud risk assessment.
 * 
 * Formula:
 * fraud_confidence = 100 - (fraud_score * fraud_certainty_factor)
 * 
 * where:
 *   fraud_certainty_factor = 1.0 if fraud indicators are clear
 *                          = 0.5 if fraud indicators are ambiguous
 */
export async function calculateFraudConfidence(claimId: number): Promise<{
  score: number;
  details: object;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  const [assessment] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .limit(1);
  
  if (!assessment || (assessment as any).fraudScore === null) {
    return {
      score: 50, // Default moderate confidence if no fraud score
      details: { reason: "No fraud score data" },
    };
  }
  
  const fraudScore = (assessment as any).fraudScore || 0;
  const fraudExplanation = (assessment as any).fraudExplanation || "";
  
  // Determine fraud certainty factor based on explanation clarity
  const fraudCertaintyFactor = fraudExplanation.length > 50 ? 1.0 : 0.5;
  
  const fraudConfidence = 100 - fraudScore * fraudCertaintyFactor;
  
  return {
    score: Math.max(0, Math.round(fraudConfidence)),
    details: {
      fraudScore,
      fraudCertaintyFactor,
      explanation: fraudExplanation,
    },
  };
}

/**
 * 4. Historical AI Accuracy Patterns (Weight: 15%)
 * 
 * Measures the AI's historical accuracy for similar claims.
 * 
 * Formula:
 * historical_accuracy = 100 - (avg_cost_variance_ai_vs_final for similar_claims)
 * 
 * where:
 *   similar_claims = claims with same vehicle_make, vehicle_model, accident_type
 */
export async function calculateHistoricalAccuracy(claimId: number): Promise<{
  score: number;
  details: object;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  // Get current claim details
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  
  if (!claim) {
    return {
      score: 50,
      details: { reason: "Claim not found" },
    };
  }
  
  const vehicleMake = claim.vehicleMake;
  const vehicleModel = claim.vehicleModel;
  
  if (!vehicleMake || !vehicleModel) {
    return {
      score: 50,
      details: { reason: "Vehicle make/model not available" },
    };
  }
  
  // Query similar claims from intelligence dataset
  const similarClaims = await db
    .select({
      costVarianceAiVsFinal: claimIntelligenceDataset.costVarianceAiVsFinal,
    })
    .from(claimIntelligenceDataset)
    .where(
      and(
        eq(claimIntelligenceDataset.vehicleMake, vehicleMake),
        eq(claimIntelligenceDataset.vehicleModel, vehicleModel)
      )
    )
    .limit(100);
  
  if (similarClaims.length === 0) {
    return {
      score: 70, // Default moderate-high confidence for new vehicle models
      details: {
        reason: "No historical data for this vehicle",
        vehicleMake,
        vehicleModel,
      },
    };
  }
  
  // Calculate average cost variance
  const validVariances = similarClaims
    .map((c) => c.costVarianceAiVsFinal)
    .filter((v): v is number => v !== null);
  
  if (validVariances.length === 0) {
    return {
      score: 70,
      details: { reason: "No cost variance data available" },
    };
  }
  
  const avgCostVariance =
    validVariances.reduce((sum, v) => sum + Math.abs(v), 0) / validVariances.length;
  
  const historicalAccuracy = 100 - avgCostVariance;
  
  return {
    score: Math.max(0, Math.min(100, Math.round(historicalAccuracy))),
    details: {
      similarClaimCount: similarClaims.length,
      avgCostVariance: Math.round(avgCostVariance * 100) / 100,
      vehicleMake,
      vehicleModel,
    },
  };
}

/**
 * 5. Data Completeness Metrics (Weight: 15%)
 * 
 * Measures the completeness and quality of claim data.
 * 
 * Formula:
 * data_completeness = (
 *   (required_fields_present / total_required_fields) * 0.5 +
 *   (photo_quality_score / 100) * 0.3 +
 *   (policy_verified ? 1 : 0) * 0.2
 * ) * 100
 */
export async function calculateDataCompleteness(claimId: number): Promise<{
  score: number;
  details: object;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  
  if (!claim) {
    return {
      score: 0,
      details: { reason: "Claim not found" },
    };
  }
  
  // Check required fields
  const requiredFields = [
    claim.incidentDescription,
    claim.vehicleMake,
    claim.vehicleModel,
    claim.vehicleYear,
    claim.policyNumber,
  ];
  
  const requiredFieldsPresent = requiredFields.filter((f) => f !== null && f !== "").length;
  const totalRequiredFields = requiredFields.length;
  const fieldCompletenessRatio = requiredFieldsPresent / totalRequiredFields;
  
  // Assess photo quality (simplified: count photos, assume quality)
  const damagePhotos = claim.damagePhotos as any;
  const photoCount = Array.isArray(damagePhotos) ? damagePhotos.length : 0;
  const photoQualityScore = Math.min(100, photoCount * 20); // 5 photos = 100
  
  // Check policy verification
  const policyVerified = claim.policyNumber !== null && claim.policyNumber !== "";
  
  // Calculate data completeness
  const dataCompleteness =
    (fieldCompletenessRatio * 0.5 + (photoQualityScore / 100) * 0.3 + (policyVerified ? 1 : 0) * 0.2) * 100;
  
  return {
    score: Math.round(dataCompleteness),
    details: {
      requiredFieldsPresent,
      totalRequiredFields,
      fieldCompletenessRatio: Math.round(fieldCompletenessRatio * 100) / 100,
      photoCount,
      photoQualityScore,
      policyVerified,
    },
  };
}

/**
 * 6. Vehicle Risk Intelligence (Weight: 10%)
 * 
 * Measures the AI's familiarity with the vehicle make/model.
 * 
 * Formula:
 * vehicle_risk_intelligence = min(100, (historical_claim_count / 10) * 100)
 */
export async function calculateVehicleRiskIntelligence(claimId: number): Promise<{
  score: number;
  details: object;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  
  if (!claim) {
    return {
      score: 0,
      details: { reason: "Claim not found" },
    };
  }
  
  const vehicleMake = claim.vehicleMake;
  const vehicleModel = claim.vehicleModel;
  
  if (!vehicleMake || !vehicleModel) {
    return {
      score: 50,
      details: { reason: "Vehicle make/model not available" },
    };
  }
  
  // Count historical claims for this vehicle
  const [result] = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(claimIntelligenceDataset)
    .where(
      and(
        eq(claimIntelligenceDataset.vehicleMake, vehicleMake),
        eq(claimIntelligenceDataset.vehicleModel, vehicleModel)
      )
    );
  
  const historicalClaimCount = result?.count || 0;
  
  const vehicleRiskIntelligence = Math.min(100, (historicalClaimCount / 10) * 100);
  
  return {
    score: Math.round(vehicleRiskIntelligence),
    details: {
      historicalClaimCount,
      vehicleMake,
      vehicleModel,
    },
  };
}

// ============================================================================
// COMPOSITE CONFIDENCE SCORE
// ============================================================================

/**
 * Calculate composite confidence score for a claim.
 * 
 * Aggregates 6 component scores using weighted average.
 * 
 * Formula:
 * composite_confidence_score = (
 *   damage_certainty * 0.25 +
 *   physics_strength * 0.20 +
 *   fraud_confidence * 0.15 +
 *   historical_accuracy * 0.15 +
 *   data_completeness * 0.15 +
 *   vehicle_risk_intelligence * 0.10
 * )
 */
export async function calculateCompositeConfidenceScore(
  claimId: number
): Promise<ConfidenceScoreBreakdown> {
  // Calculate all component scores
  const [
    damageCertaintyResult,
    physicsStrengthResult,
    fraudConfidenceResult,
    historicalAccuracyResult,
    dataCompletenessResult,
    vehicleRiskIntelligenceResult,
  ] = await Promise.all([
    calculateDamageCertainty(claimId),
    calculatePhysicsStrength(claimId),
    calculateFraudConfidence(claimId),
    calculateHistoricalAccuracy(claimId),
    calculateDataCompleteness(claimId),
    calculateVehicleRiskIntelligence(claimId),
  ]);
  
  const components: ConfidenceScoreComponents = {
    damageCertainty: damageCertaintyResult.score,
    physicsStrength: physicsStrengthResult.score,
    fraudConfidence: fraudConfidenceResult.score,
    historicalAccuracy: historicalAccuracyResult.score,
    dataCompleteness: dataCompletenessResult.score,
    vehicleRiskIntelligence: vehicleRiskIntelligenceResult.score,
  };
  
  // Calculate composite score
  const compositeConfidenceScore =
    components.damageCertainty * SCORING_WEIGHTS.damageCertainty +
    components.physicsStrength * SCORING_WEIGHTS.physicsStrength +
    components.fraudConfidence * SCORING_WEIGHTS.fraudConfidence +
    components.historicalAccuracy * SCORING_WEIGHTS.historicalAccuracy +
    components.dataCompleteness * SCORING_WEIGHTS.dataCompleteness +
    components.vehicleRiskIntelligence * SCORING_WEIGHTS.vehicleRiskIntelligence;
  
  return {
    ...components,
    compositeConfidenceScore: Math.round(compositeConfidenceScore),
    scoringVersion: SCORING_VERSION,
    
    // Component details
    damageCertaintyBreakdown: damageCertaintyResult.breakdown,
    physicsValidationDetails: physicsStrengthResult.details,
    fraudAnalysisDetails: fraudConfidenceResult.details,
    historicalAccuracyDetails: historicalAccuracyResult.details,
    dataCompletenessDetails: dataCompletenessResult.details,
    vehicleRiskDetails: vehicleRiskIntelligenceResult.details,
  };
}

/**
 * Save confidence score to database.
 */
export async function saveConfidenceScore(
  claimId: number,
  tenantId: string,
  scoreBreakdown: ConfidenceScoreBreakdown
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  const [result] = await db.insert(claimConfidenceScores).values({
    claimId,
    tenantId,
    damageCertainty: scoreBreakdown.damageCertainty.toString(),
    physicsStrength: scoreBreakdown.physicsStrength.toString(),
    fraudConfidence: scoreBreakdown.fraudConfidence.toString(),
    historicalAccuracy: scoreBreakdown.historicalAccuracy.toString(),
    dataCompleteness: scoreBreakdown.dataCompleteness.toString(),
    vehicleRiskIntelligence: scoreBreakdown.vehicleRiskIntelligence.toString(),
    compositeConfidenceScore: scoreBreakdown.compositeConfidenceScore.toString(),
    scoringVersion: scoreBreakdown.scoringVersion,
    damageCertaintyBreakdown: scoreBreakdown.damageCertaintyBreakdown,
    physicsValidationDetails: scoreBreakdown.physicsValidationDetails,
    fraudAnalysisDetails: scoreBreakdown.fraudAnalysisDetails,
    historicalAccuracyDetails: scoreBreakdown.historicalAccuracyDetails,
    dataCompletenessDetails: scoreBreakdown.dataCompletenessDetails,
    vehicleRiskDetails: scoreBreakdown.vehicleRiskDetails,
  });
  
  return result.insertId;
}
