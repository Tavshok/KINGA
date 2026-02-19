// @ts-nocheck
/**
 * Confidence Scoring and Dataset Classification Service
 * Assesses data quality and routes claims to appropriate datasets
 */

import { getDb } from "../db";
import { 
  extractedDocumentData,
  historicalClaims,
  trainingDataset,
  humanReviewQueue
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const db = await getDb();

export type ConfidenceCategory = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceScoreResult {
  overallScore: number;
  category: ConfidenceCategory;
  components: {
    extractionConfidence: number;
    dataCompleteness: number;
    dataConsistency: number;
    valueReasonableness: number;
  };
  issues: string[];
  recommendations: string[];
}

/**
 * Calculate confidence score for extracted claim data
 */
export async function calculateIngestionConfidenceScore(params: {
  documentId: number;
  extractedData: any;
  extractionConfidence: number;
}): Promise<ConfidenceScoreResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Component 1: Extraction Confidence (30% weight)
  const extractionScore = params.extractionConfidence;
  
  // Component 2: Data Completeness (30% weight)
  const requiredFields = [
    "claimNumber",
    "claimDate",
    "incidentDate",
    "claimantName",
    "vehicleMake",
    "vehicleModel",
    "damageDescription",
    "estimatedRepairCost",
  ];
  
  const presentFields = requiredFields.filter(
    field => params.extractedData[field] !== null && params.extractedData[field] !== undefined
  );
  const completenessScore = (presentFields.length / requiredFields.length) * 100;
  
  if (completenessScore < 80) {
    issues.push(`Missing ${requiredFields.length - presentFields.length} required fields`);
    recommendations.push("Request additional documentation or manual data entry");
  }
  
  // Component 3: Data Consistency (20% weight)
  let consistencyScore = 100;
  
  // Check date consistency
  if (params.extractedData.claimDate && params.extractedData.incidentDate) {
    const claimDate = new Date(params.extractedData.claimDate);
    const incidentDate = new Date(params.extractedData.incidentDate);
    
    if (claimDate < incidentDate) {
      consistencyScore -= 30;
      issues.push("Claim date is before incident date");
    }
    
    const daysDiff = Math.abs((claimDate.getTime() - incidentDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      consistencyScore -= 20;
      issues.push("Claim filed more than 1 year after incident");
    }
  }
  
  // Check cost consistency
  if (params.extractedData.estimatedRepairCost && params.extractedData.panelBeaterQuote) {
    const variance = Math.abs(
      params.extractedData.estimatedRepairCost - params.extractedData.panelBeaterQuote
    ) / params.extractedData.estimatedRepairCost;
    
    if (variance > 0.5) {
      consistencyScore -= 20;
      issues.push("Large variance between estimated cost and panel beater quote");
    }
  }
  
  // Component 4: Value Reasonableness (20% weight)
  let reasonablenessScore = 100;
  
  if (params.extractedData.estimatedRepairCost) {
    const cost = params.extractedData.estimatedRepairCost;
    
    // Flag extreme values
    if (cost < 500) {
      reasonablenessScore -= 20;
      issues.push("Repair cost unusually low (< R500)");
    } else if (cost > 500000) {
      reasonablenessScore -= 30;
      issues.push("Repair cost unusually high (> R500,000)");
      recommendations.push("Verify total loss assessment");
    }
  }
  
  if (params.extractedData.vehicleYear) {
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - params.extractedData.vehicleYear;
    
    if (vehicleAge < 0) {
      reasonablenessScore -= 40;
      issues.push("Vehicle year is in the future");
    } else if (vehicleAge > 50) {
      reasonablenessScore -= 20;
      issues.push("Vehicle is very old (> 50 years)");
    }
  }
  
  // Calculate weighted overall score
  const overallScore = Math.round(
    (extractionScore * 0.3) +
    (completenessScore * 0.3) +
    (consistencyScore * 0.2) +
    (reasonablenessScore * 0.2)
  );
  
  // Determine category based on configurable thresholds
  let category: ConfidenceCategory;
  if (overallScore >= 80) {
    category = "HIGH";
  } else if (overallScore >= 60) {
    category = "MEDIUM";
    recommendations.push("Queue for human review before adding to training dataset");
  } else {
    category = "LOW";
    recommendations.push("Exclude from training dataset - use for reference only");
  }
  
  return {
    overallScore,
    category,
    components: {
      extractionConfidence: extractionScore,
      dataCompleteness: completenessScore,
      dataConsistency: consistencyScore,
      valueReasonableness: reasonablenessScore,
    },
    issues,
    recommendations,
  };
}

/**
 * Classify and route claim to appropriate dataset
 */
export async function classifyAndRouteHistoricalClaim(params: {
  tenantId: string;
  documentId: number;
  batchId: number;
  extractedData: any;
  confidenceScore: ConfidenceScoreResult;
}): Promise<{
  success: boolean;
  historicalClaimId?: number;
  routedTo: "reference" | "training" | "review";
  errorMessage?: string;
}> {
  try {
    // Always create historical claim in reference dataset
    const [historicalClaim] = await db.insert(historicalClaims).values({
      tenantId: params.tenantId,
      batchId: params.batchId,
      sourceDocumentId: params.documentId,
      claimNumber: params.extractedData.claimNumber,
      claimDate: params.extractedData.claimDate ? new Date(params.extractedData.claimDate) : null,
      incidentDate: params.extractedData.incidentDate ? new Date(params.extractedData.incidentDate) : null,
      claimantName: params.extractedData.claimantName,
      vehicleMake: params.extractedData.vehicleMake,
      vehicleModel: params.extractedData.vehicleModel,
      vehicleYear: params.extractedData.vehicleYear,
      damageDescription: params.extractedData.damageDescription,
      estimatedRepairCost: params.extractedData.estimatedRepairCost,
      confidenceScore: params.confidenceScore.overallScore,
      confidenceCategory: params.confidenceScore.category,
      dataQualityIssues: params.confidenceScore.issues,
      rawExtractedData: params.extractedData,
    }).$returningId();
    
    const historicalClaimId = historicalClaim.id;
    
    // Route based on confidence category
    if (params.confidenceScore.category === "HIGH") {
      // Automatically add to training dataset
      await db.insert(trainingDataset).values({
        tenantId: params.tenantId,
        historicalClaimId,
        approvalStatus: "auto_approved",
        approvedAt: new Date(),
        approvalNotes: "Auto-approved: HIGH confidence score",
      });
      
      return {
        success: true,
        historicalClaimId,
        routedTo: "training",
      };
      
    } else if (params.confidenceScore.category === "MEDIUM") {
      // Queue for human review
      await db.insert(humanReviewQueue).values({
        tenantId: params.tenantId,
        historicalClaimId,
        reviewPriority: "medium",
        reviewStatus: "pending",
        flaggedIssues: params.confidenceScore.issues,
        reviewerNotes: params.confidenceScore.recommendations.join("; "),
      });
      
      return {
        success: true,
        historicalClaimId,
        routedTo: "review",
      };
      
    } else {
      // LOW confidence - reference only, do not add to training
      return {
        success: true,
        historicalClaimId,
        routedTo: "reference",
      };
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorMessage,
      routedTo: "reference",
    };
  }
}

/**
 * Get ingestion confidence statistics for a batch
 */
export async function getBatchConfidenceStats(params: {
  tenantId: string;
  batchId: number;
}): Promise<{
  totalClaims: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  averageScore: number;
  routedToTraining: number;
  routedToReview: number;
  routedToReferenceOnly: number;
}> {
  const claims = await db.select()
    .from(historicalClaims)
    .where(eq(historicalClaims.batchId, params.batchId));
  
  const totalClaims = claims.length;
  const highConfidence = claims.filter(c => c.confidenceCategory === "HIGH").length;
  const mediumConfidence = claims.filter(c => c.confidenceCategory === "MEDIUM").length;
  const lowConfidence = claims.filter(c => c.confidenceCategory === "LOW").length;
  
  const averageScore = totalClaims > 0
    ? Math.round(claims.reduce((sum, c) => sum + (c.confidenceScore || 0), 0) / totalClaims)
    : 0;
  
  // Count routing destinations
  const trainingClaims = await db.select()
    .from(trainingDataset)
    .innerJoin(historicalClaims, eq(trainingDataset.historicalClaimId, historicalClaims.id))
    .where(eq(historicalClaims.batchId, params.batchId));
  
  const reviewClaims = await db.select()
    .from(humanReviewQueue)
    .innerJoin(historicalClaims, eq(humanReviewQueue.historicalClaimId, historicalClaims.id))
    .where(eq(historicalClaims.batchId, params.batchId));
  
  return {
    totalClaims,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    averageScore,
    routedToTraining: trainingClaims.length,
    routedToReview: reviewClaims.length,
    routedToReferenceOnly: totalClaims - trainingClaims.length - reviewClaims.length,
  };
}
