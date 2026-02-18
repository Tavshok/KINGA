/**
 * Claim Replay AI Re-Assessment Service
 * 
 * Re-runs AI assessment on historical claims using current KINGA models.
 * Enables comparison of original decisions with current AI capabilities.
 * 
 * CRITICAL: All operations are read-only simulations (isReplay = true).
 * No live workflow mutations are performed.
 */

import { getDb } from "../db";
import { historicalClaims, historicalReplayResults } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface ReplayAiAssessmentResult {
  // Damage detection
  damageDetectionScore: number; // 0-100
  detectedDamageAreas: string[]; // Array of damage locations
  damageComplexity: "simple" | "moderate" | "complex" | "severe";
  
  // Cost estimation
  estimatedCost: number; // In cents
  costBreakdown: {
    parts: number;
    labor: number;
    paint: number;
    diagnostic: number;
    sundries: number;
    total: number;
  };
  costConfidenceLevel: "very_high" | "high" | "medium" | "low" | "very_low";
  
  // Fraud detection
  fraudScore: number; // 0-100
  fraudIndicators: Array<{
    indicator: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
  }>;
  fraudRiskLevel: "none" | "low" | "medium" | "high" | "critical";
  
  // Confidence scoring
  compositeConfidenceScore: number; // 0-100
  confidenceFactors: {
    imageQuality: number;
    damageClarity: number;
    vehicleIdentification: number;
    historicalDataMatch: number;
  };
  
  // Processing metadata
  processingTimeMs: number;
  modelVersion: string;
  assessmentTimestamp: Date;
}

/**
 * Re-run AI damage detection on historical claim
 * Simulates current KINGA damage detection capabilities
 */
export async function replayDamageDetection(
  historicalClaimId: number
): Promise<{
  damageDetectionScore: number;
  detectedDamageAreas: string[];
  damageComplexity: "simple" | "moderate" | "complex" | "severe";
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
  
  // SIMULATION: In production, this would call actual AI damage detection service
  // For now, we'll simulate based on historical data
  
  const startTime = Date.now();
  
  // Simulate damage detection based on accident type and repair decision
  let damageDetectionScore = 75; // Base score
  let damageComplexity: "simple" | "moderate" | "complex" | "severe" = "moderate";
  const detectedDamageAreas: string[] = [];
  
  // Adjust based on accident type
  if (claim.accidentType === "rear_end") {
    detectedDamageAreas.push("rear_bumper", "tail_lights", "trunk_lid");
    damageComplexity = "simple";
    damageDetectionScore = 85;
  } else if (claim.accidentType === "head_on") {
    detectedDamageAreas.push("front_bumper", "hood", "radiator", "headlights");
    damageComplexity = "complex";
    damageDetectionScore = 70;
  } else if (claim.accidentType === "side_impact") {
    detectedDamageAreas.push("side_door", "side_panel", "side_mirror");
    damageComplexity = "moderate";
    damageDetectionScore = 80;
  } else if (claim.accidentType === "rollover") {
    detectedDamageAreas.push("roof", "pillars", "windows", "multiple_panels");
    damageComplexity = "severe";
    damageDetectionScore = 60;
  } else {
    // Unknown accident type
    detectedDamageAreas.push("multiple_areas");
    damageComplexity = "moderate";
    damageDetectionScore = 70;
  }
  
  // Adjust based on repair decision
  if (claim.repairDecision === "total_loss") {
    damageComplexity = "severe";
    damageDetectionScore = Math.max(60, damageDetectionScore - 15);
  } else if (claim.repairDecision === "rejected") {
    damageDetectionScore = Math.max(50, damageDetectionScore - 20);
  }
  
  const processingTime = Date.now() - startTime;
  
  console.log(`[Replay] Damage detection for claim ${historicalClaimId}: ${damageDetectionScore}% (${processingTime}ms)`);
  
  return {
    damageDetectionScore,
    detectedDamageAreas,
    damageComplexity,
  };
}

/**
 * Re-run AI cost estimation on historical claim
 */
export async function replayCostEstimation(
  historicalClaimId: number
): Promise<{
  estimatedCost: number;
  costBreakdown: {
    parts: number;
    labor: number;
    paint: number;
    diagnostic: number;
    sundries: number;
    total: number;
  };
  costConfidenceLevel: "very_high" | "high" | "medium" | "low" | "very_low";
}> {
  const db = await getDb();
  
  const [claim] = await db
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, historicalClaimId))
    .limit(1);
  
  if (!claim) {
    throw new Error(`Historical claim ${historicalClaimId} not found`);
  }
  
  // SIMULATION: Use historical data to simulate AI cost estimation
  // In production, this would call actual AI cost estimation service
  
  const finalApprovedCost = Number(claim.finalApprovedCost) || 0;
  const panelBeaterQuote = Number(claim.totalPanelBeaterQuote) || 0;
  const assessorEstimate = Number(claim.totalAssessorEstimate) || 0;
  
  // Simulate AI estimate as average of panel beater quote and assessor estimate
  // with some variance
  let estimatedCost = 0;
  if (panelBeaterQuote > 0 && assessorEstimate > 0) {
    estimatedCost = (panelBeaterQuote + assessorEstimate) / 2;
  } else if (finalApprovedCost > 0) {
    // Use final approved cost with 10% variance
    estimatedCost = finalApprovedCost * (0.9 + Math.random() * 0.2);
  } else {
    // Fallback to panel beater quote or assessor estimate
    estimatedCost = panelBeaterQuote || assessorEstimate || 0;
  }
  
  // Simulate cost breakdown (typical distribution)
  const costBreakdown = {
    parts: Math.round(estimatedCost * 0.45), // 45% parts
    labor: Math.round(estimatedCost * 0.30), // 30% labor
    paint: Math.round(estimatedCost * 0.15), // 15% paint
    diagnostic: Math.round(estimatedCost * 0.05), // 5% diagnostic
    sundries: Math.round(estimatedCost * 0.05), // 5% sundries
    total: Math.round(estimatedCost),
  };
  
  // Determine confidence level based on variance from final approved cost
  let costConfidenceLevel: "very_high" | "high" | "medium" | "low" | "very_low" = "medium";
  if (finalApprovedCost > 0) {
    const variance = Math.abs(estimatedCost - finalApprovedCost) / finalApprovedCost;
    if (variance < 0.05) costConfidenceLevel = "very_high";
    else if (variance < 0.10) costConfidenceLevel = "high";
    else if (variance < 0.20) costConfidenceLevel = "medium";
    else if (variance < 0.30) costConfidenceLevel = "low";
    else costConfidenceLevel = "very_low";
  }
  
  return {
    estimatedCost: Math.round(estimatedCost),
    costBreakdown,
    costConfidenceLevel,
  };
}

/**
 * Re-run AI fraud detection on historical claim
 */
export async function replayFraudDetection(
  historicalClaimId: number
): Promise<{
  fraudScore: number;
  fraudIndicators: Array<{
    indicator: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
  }>;
  fraudRiskLevel: "none" | "low" | "medium" | "high" | "critical";
}> {
  const db = await getDb();
  
  const [claim] = await db
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, historicalClaimId))
    .limit(1);
  
  if (!claim) {
    throw new Error(`Historical claim ${historicalClaimId} not found`);
  }
  
  // SIMULATION: Fraud detection based on historical patterns
  let fraudScore = 0;
  const fraudIndicators: Array<{
    indicator: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
  }> = [];
  
  // Check for high-value claims
  const finalApprovedCost = Number(claim.finalApprovedCost) || 0;
  if (finalApprovedCost > 50000) {
    fraudScore += 15;
    fraudIndicators.push({
      indicator: "high_value_claim",
      severity: "medium",
      description: `Claim amount $${(finalApprovedCost / 100).toLocaleString()} exceeds $500 threshold`,
    });
  }
  
  // Check for total loss
  if (claim.repairDecision === "total_loss") {
    fraudScore += 20;
    fraudIndicators.push({
      indicator: "total_loss",
      severity: "high",
      description: "Total loss claims have higher fraud risk",
    });
  }
  
  // Check for rejected claims
  if (claim.repairDecision === "rejected") {
    fraudScore += 25;
    fraudIndicators.push({
      indicator: "rejected_claim",
      severity: "high",
      description: "Rejected claims may indicate fraudulent activity",
    });
  }
  
  // Check for large variance between quotes
  const panelBeaterQuote = Number(claim.totalPanelBeaterQuote) || 0;
  const assessorEstimate = Number(claim.totalAssessorEstimate) || 0;
  if (panelBeaterQuote > 0 && assessorEstimate > 0) {
    const variance = Math.abs(panelBeaterQuote - assessorEstimate) / Math.max(panelBeaterQuote, assessorEstimate);
    if (variance > 0.30) {
      fraudScore += 10;
      fraudIndicators.push({
        indicator: "quote_variance",
        severity: "medium",
        description: `Large variance (${(variance * 100).toFixed(1)}%) between panel beater quote and assessor estimate`,
      });
    }
  }
  
  // Check for old vehicles (higher fraud risk)
  const vehicleYear = claim.vehicleYear || 0;
  const vehicleAge = new Date().getFullYear() - vehicleYear;
  if (vehicleAge > 15) {
    fraudScore += 10;
    fraudIndicators.push({
      indicator: "old_vehicle",
      severity: "low",
      description: `Vehicle age ${vehicleAge} years exceeds 15-year threshold`,
    });
  }
  
  // Determine fraud risk level
  let fraudRiskLevel: "none" | "low" | "medium" | "high" | "critical" = "none";
  if (fraudScore >= 60) fraudRiskLevel = "critical";
  else if (fraudScore >= 40) fraudRiskLevel = "high";
  else if (fraudScore >= 20) fraudRiskLevel = "medium";
  else if (fraudScore >= 10) fraudRiskLevel = "low";
  else fraudRiskLevel = "none";
  
  return {
    fraudScore: Math.min(100, fraudScore),
    fraudIndicators,
    fraudRiskLevel,
  };
}

/**
 * Calculate composite confidence score
 */
export async function replayConfidenceScore(
  historicalClaimId: number,
  damageDetectionScore: number,
  costConfidenceLevel: "very_high" | "high" | "medium" | "low" | "very_low",
  fraudScore: number
): Promise<{
  compositeConfidenceScore: number;
  confidenceFactors: {
    imageQuality: number;
    damageClarity: number;
    vehicleIdentification: number;
    historicalDataMatch: number;
  };
}> {
  const db = await getDb();
  
  const [claim] = await db
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, historicalClaimId))
    .limit(1);
  
  if (!claim) {
    throw new Error(`Historical claim ${historicalClaimId} not found`);
  }
  
  // Convert cost confidence level to numeric score
  const costConfidenceMap = {
    very_high: 95,
    high: 85,
    medium: 70,
    low: 55,
    very_low: 40,
  };
  const costConfidenceScore = costConfidenceMap[costConfidenceLevel];
  
  // Simulate confidence factors
  const confidenceFactors = {
    imageQuality: 80, // Assume good image quality for historical claims
    damageClarity: damageDetectionScore,
    vehicleIdentification: claim.vehicleVin ? 95 : 70, // Higher if VIN available
    historicalDataMatch: costConfidenceScore,
  };
  
  // Calculate composite confidence score
  // Weighted average: damage 30%, cost 30%, fraud 20%, image 20%
  const compositeConfidenceScore = Math.round(
    damageDetectionScore * 0.30 +
    costConfidenceScore * 0.30 +
    (100 - fraudScore) * 0.20 + // Lower fraud = higher confidence
    confidenceFactors.imageQuality * 0.20
  );
  
  return {
    compositeConfidenceScore: Math.min(100, Math.max(0, compositeConfidenceScore)),
    confidenceFactors,
  };
}

/**
 * Complete AI re-assessment for historical claim
 * Orchestrates all AI assessment services
 */
export async function replayCompleteAiAssessment(
  historicalClaimId: number
): Promise<ReplayAiAssessmentResult> {
  const startTime = Date.now();
  
  // Run all AI assessments in parallel
  const [damageResult, costResult, fraudResult] = await Promise.all([
    replayDamageDetection(historicalClaimId),
    replayCostEstimation(historicalClaimId),
    replayFraudDetection(historicalClaimId),
  ]);
  
  // Calculate confidence score
  const confidenceResult = await replayConfidenceScore(
    historicalClaimId,
    damageResult.damageDetectionScore,
    costResult.costConfidenceLevel,
    fraudResult.fraudScore
  );
  
  const processingTime = Date.now() - startTime;
  
  return {
    // Damage detection
    damageDetectionScore: damageResult.damageDetectionScore,
    detectedDamageAreas: damageResult.detectedDamageAreas,
    damageComplexity: damageResult.damageComplexity,
    
    // Cost estimation
    estimatedCost: costResult.estimatedCost,
    costBreakdown: costResult.costBreakdown,
    costConfidenceLevel: costResult.costConfidenceLevel,
    
    // Fraud detection
    fraudScore: fraudResult.fraudScore,
    fraudIndicators: fraudResult.fraudIndicators,
    fraudRiskLevel: fraudResult.fraudRiskLevel,
    
    // Confidence scoring
    compositeConfidenceScore: confidenceResult.compositeConfidenceScore,
    confidenceFactors: confidenceResult.confidenceFactors,
    
    // Metadata
    processingTimeMs: processingTime,
    modelVersion: "KINGA-v1.0-replay",
    assessmentTimestamp: new Date(),
  };
}
