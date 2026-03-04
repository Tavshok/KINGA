/**
 * KINGA Confidence Scoring Engine
 * 
 * Calculates training data confidence scores for historical claims using 8-component weighted algorithm.
 * Assigns confidence categories (HIGH/MEDIUM/LOW) and detects anomalies for safe dataset inclusion.
 * 
 * @module confidence-scoring
 */

import { getDb } from "../db";
import { 
  historicalClaims, 
  ingestionDocuments, 
  extractedDocumentData,
  trainingDataScores,
  claimReviewQueue
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ConfidenceScoreComponents {
  assessorReportScore: number;
  supportingPhotosScore: number;
  panelBeaterQuotesScore: number;
  evidenceCompletenessScore: number;
  handwrittenAdjustmentsScore: number;
  fraudMarkersScore: number;
  disputeHistoryScore: number;
  competingQuotesScore: number;
}

export interface ConfidenceScoreWeights {
  assessorReport: number;      // Default: 0.25
  supportingPhotos: number;     // Default: 0.20
  panelBeaterQuotes: number;    // Default: 0.15
  evidenceCompleteness: number; // Default: 0.15
  handwrittenAdjustments: number; // Default: 0.10
  fraudMarkers: number;         // Default: 0.05
  disputeHistory: number;       // Default: 0.05
  competingQuotes: number;      // Default: 0.05
}

export interface ConfidenceScoreResult {
  claimId: number;
  components: ConfidenceScoreComponents;
  overallScore: number;
  confidenceCategory: "HIGH" | "MEDIUM" | "LOW";
  anomalyFlags: string[];
  biasRiskFlags: string[];
  explanation: string;
  calculatedAt: Date;
}

export interface AnomalyDetectionResult {
  anomalyFlags: string[];
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default scoring weights (must sum to 1.0)
 */
export const DEFAULT_WEIGHTS: ConfidenceScoreWeights = {
  assessorReport: 0.25,
  supportingPhotos: 0.20,
  panelBeaterQuotes: 0.15,
  evidenceCompleteness: 0.15,
  handwrittenAdjustments: 0.10,
  fraudMarkers: 0.05,
  disputeHistory: 0.05,
  competingQuotes: 0.05,
};

/**
 * Confidence category thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 80,    // Score >= 80 → AUTO-APPROVE for training
  MEDIUM: 50,  // Score 50-79 → MANUAL REVIEW required
  // Score < 50 → LOW → EXTENSIVE REVIEW or REJECT
};

/**
 * Required fields for evidence completeness scoring
 */
const REQUIRED_FIELDS = [
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "incidentDate",
  "incidentLocation",
  "claimantName",
  "claimantContact",
  "damageDescription",
  "estimatedCost",
];

// ============================================================================
// COMPONENT SCORING FUNCTIONS
// ============================================================================

/**
 * Component 1: Assessor Report Score (Weight: 25%)
 * 
 * Scoring Logic:
 * - No assessor report: 0
 * - Report present, < 200 words: 30
 * - Report 200-500 words: 50
 * - Report > 500 words: 70
 * - + Contains damage photos: +15
 * - + Contains cost breakdown: +15
 */
async function calculateAssessorReportScore(claimId: number): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  
  // Find assessor report document
  const assessorDocs = await dbInstance
    .select()
    .from(ingestionDocuments)
    .where(
      and(
        eq(ingestionDocuments.historicalClaimId, claimId),
        eq(ingestionDocuments.documentType, "assessor_report")
      )
    );

  if (assessorDocs.length === 0) {
    return 0; // No assessor report
  }

  // Get extracted data for assessor report
  const extractedData = await dbInstance
    .select()
    .from(extractedDocumentData)
    .where(eq(extractedDocumentData.documentId, assessorDocs[0].id));

  if (extractedData.length === 0) {
    return 30; // Report exists but not extracted yet
  }

  const data = extractedData[0];
  const extractedText = data.fullText || "";
  const wordCount = extractedText.split(/\s+/).length;

  let score = 0;

  // Base score based on word count
  if (wordCount < 200) {
    score = 30;
  } else if (wordCount >= 200 && wordCount <= 500) {
    score = 50;
  } else {
    score = 70;
  }

  // Bonus: Contains damage photos reference
  if (extractedText.toLowerCase().includes("photo") || extractedText.toLowerCase().includes("image")) {
    score += 15;
  }

  // Bonus: Contains cost breakdown
  if (extractedText.toLowerCase().includes("cost") || extractedText.toLowerCase().includes("price") || extractedText.toLowerCase().includes("$")) {
    score += 15;
  }

  return Math.min(score, 100);
}

/**
 * Component 2: Supporting Photos Score (Weight: 20%)
 * 
 * Scoring Logic:
 * - 0 photos: 0
 * - 1-2 photos: 30
 * - 3-5 photos: 60
 * - 6-10 photos: 85
 * - 11+ photos: 100
 */
async function calculateSupportingPhotosScore(claimId: number): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  
  const photoDocs = await dbInstance
    .select()
    .from(ingestionDocuments)
    .where(
      and(
        eq(ingestionDocuments.historicalClaimId, claimId),
        eq(ingestionDocuments.documentType, "damage_image")
      )
    );

  const photoCount = photoDocs.length;

  if (photoCount === 0) return 0;
  if (photoCount <= 2) return 30;
  if (photoCount <= 5) return 60;
  if (photoCount <= 10) return 85;
  return 100;
}

/**
 * Component 3: Panel Beater Quotes Score (Weight: 15%)
 * 
 * Scoring Logic:
 * - 0 quotes: 0
 * - 1 quote: 50
 * - 2 quotes: 80
 * - 3+ quotes: 100
 */
async function calculatePanelBeaterQuotesScore(claimId: number): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  
  const quoteDocs = await dbInstance
    .select()
    .from(ingestionDocuments)
    .where(
      and(
        eq(ingestionDocuments.historicalClaimId, claimId),
        eq(ingestionDocuments.documentType, "repair_quote")
      )
    );

  const quoteCount = quoteDocs.length;

  if (quoteCount === 0) return 0;
  if (quoteCount === 1) return 50;
  if (quoteCount === 2) return 80;
  return 100;
}

/**
 * Component 4: Evidence Completeness Score (Weight: 15%)
 * 
 * Scoring Logic:
 * score = (populated_fields / total_required_fields) * 100
 * 
 * Required fields:
 * - Vehicle make, model, year
 * - Incident date, location
 * - Claimant name, contact
 * - Damage description
 * - Cost estimate
 */
async function calculateEvidenceCompletenessScore(claimId: number): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  
  const claim = await dbInstance
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, claimId))
    .limit(1);

  if (claim.length === 0) return 0;

  const claimData = claim[0];
  let populatedCount = 0;

  // Check each required field
  if (claimData.vehicleMake) populatedCount++;
  if (claimData.vehicleModel) populatedCount++;
  if (claimData.vehicleYear) populatedCount++;
  if (claimData.incidentDate) populatedCount++;
  if (claimData.incidentLocation) populatedCount++;
  if (claimData.claimantName) populatedCount++;
  if (claimData.claimantContact) populatedCount++;
  if (claimData.incidentDescription) populatedCount++;
  if (claimData.totalPanelBeaterQuote) populatedCount++;

  const score = (populatedCount / REQUIRED_FIELDS.length) * 100;
  return Math.round(score);
}

/**
 * Component 5: Handwritten Adjustments Score (Weight: 10%)
 * 
 * Scoring Logic:
 * - No handwritten notes: 100
 * - 1-2 handwritten notes: 60
 * - 3+ handwritten notes: 30
 * 
 * Rationale: Handwritten adjustments may indicate uncertainty or disputes
 */
async function calculateHandwrittenAdjustmentsScore(claimId: number): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  
  // Check extracted data for handwritten note indicators
  const docs = await dbInstance
    .select()
    .from(ingestionDocuments)
    .where(eq(ingestionDocuments.historicalClaimId, claimId));

  let handwrittenCount = 0;

  for (const doc of docs) {
    const extracted = await dbInstance
      .select()
      .from(extractedDocumentData)
      .where(eq(extractedDocumentData.documentId, doc.id));

    if (extracted.length > 0) {
      const text = extracted[0].fullText || "";
      // Look for handwritten indicators
      if (
        text.toLowerCase().includes("handwritten") ||
        text.toLowerCase().includes("hand written") ||
        text.toLowerCase().includes("manual adjustment") ||
        text.toLowerCase().includes("pen mark")
      ) {
        handwrittenCount++;
      }
    }
  }

  if (handwrittenCount === 0) return 100;
  if (handwrittenCount <= 2) return 60;
  return 30;
}

/**
 * Component 6: Fraud Markers Score (Weight: 5%)
 * 
 * Scoring Logic:
 * score = 100 - fraud_risk_score
 * 
 * Fraud risk calculated from:
 * - Multiple claims same vehicle
 * - Claimant claim frequency
 * - Cost significantly above market
 * - Inconsistent damage patterns
 */
async function calculateFraudMarkersScore(claimId: number): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  
  const claim = await dbInstance
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, claimId))
    .limit(1);

  if (claim.length === 0) return 100;

  const claimData = claim[0];
  let fraudRisk = 0;

  // Check 1: Multiple claims for same vehicle
  if (claimData.vehicleRegistration) {
    const vehicleClaims = await dbInstance
      .select()
      .from(historicalClaims)
      .where(eq(historicalClaims.vehicleRegistration, claimData.vehicleRegistration));

    if (vehicleClaims.length > 3) {
      fraudRisk += 30; // High risk: > 3 claims for same vehicle
    } else if (vehicleClaims.length > 1) {
      fraudRisk += 10; // Medium risk: 2-3 claims
    }
  }

  // Check 2: Claimant claim frequency
  if (claimData.claimantName) {
    const claimantClaims = await dbInstance
      .select()
      .from(historicalClaims)
      .where(eq(historicalClaims.claimantName, claimData.claimantName));

    if (claimantClaims.length > 5) {
      fraudRisk += 30; // High risk: > 5 claims by same person
    } else if (claimantClaims.length > 2) {
      fraudRisk += 10; // Medium risk: 3-5 claims
    }
  }

  // Check 3: Cost significantly above market (simplified check)
  if (claimData.totalPanelBeaterQuote) {
    const cost = parseFloat(claimData.totalPanelBeaterQuote.toString());
    if (cost > 50000) {
      fraudRisk += 20; // High cost claim (needs more sophisticated market comparison)
    }
  }

  // Check 4: Inconsistent damage patterns (placeholder - requires ML)
  // This would check if damage description matches cost estimate
  // For now, we'll skip this check

  const score = Math.max(0, 100 - fraudRisk);
  return score;
}

/**
 * Component 7: Dispute History Score (Weight: 5%)
 * 
 * Scoring Logic:
 * - No dispute: 100
 * - Dispute resolved in favor: 70
 * - Dispute unresolved: 40
 * - Dispute resolved against: 0
 */
async function calculateDisputeHistoryScore(claimId: number): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  
  const claim = await dbInstance
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, claimId))
    .limit(1);

  if (claim.length === 0) return 100;

  const claimData = claim[0];
  // Note: historicalClaims doesn't have disputeStatus field
  // For now, assume no disputes for historical claims
  // This can be enhanced by adding a disputeStatus field to historicalClaims schema
  return 100; // Default to no dispute
}

/**
 * Component 8: Competing Quotes Score (Weight: 5%)
 * 
 * Scoring Logic:
 * - 0-1 quotes: 50
 * - 2 quotes: 80
 * - 3+ quotes: 100
 */
async function calculateCompetingQuotesScore(claimId: number): Promise<number> {
  // This is similar to panel beater quotes, but focuses on competition
  return await calculatePanelBeaterQuotesScore(claimId);
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detect anomalies in claim data
 */
async function detectAnomalies(claimId: number, components: ConfidenceScoreComponents): Promise<AnomalyDetectionResult> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");
  const anomalyFlags: string[] = [];
  let severity: "critical" | "high" | "medium" | "low" = "low";

  const claim = await dbInstance
    .select()
    .from(historicalClaims)
    .where(eq(historicalClaims.id, claimId))
    .limit(1);

  if (claim.length === 0) {
    return {
      anomalyFlags: ["claim_not_found"],
      severity: "critical",
      description: "Claim record not found in database",
    };
  }

  const claimData = claim[0];

  // Anomaly 1: Cost outlier (z-score > 3)
  if (claimData.totalPanelBeaterQuote) {
    const cost = parseFloat(claimData.totalPanelBeaterQuote.toString());
    // Simplified check: cost > $100,000 is anomaly
    if (cost > 100000) {
      anomalyFlags.push("cost_outlier");
      severity = "high";
    }
  }

  // Anomaly 2: Missing critical data
  if (components.evidenceCompletenessScore < 50) {
    anomalyFlags.push("missing_critical_data");
    if (severity === "low") severity = "medium";
  }

  // Anomaly 3: No assessor report
  if (components.assessorReportScore === 0) {
    anomalyFlags.push("no_assessor_report");
    if (severity === "low") severity = "medium";
  }

  // Anomaly 4: No supporting photos
  if (components.supportingPhotosScore === 0) {
    anomalyFlags.push("no_supporting_photos");
    if (severity === "low") severity = "medium";
  }

  // Anomaly 5: High fraud risk
  if (components.fraudMarkersScore < 50) {
    anomalyFlags.push("high_fraud_risk");
    severity = "high";
  }

  // Anomaly 6: Temporal inconsistency
  if (claimData.incidentDate && claimData.createdAt) {
    const incidentDate = new Date(claimData.incidentDate);
    const createdDate = new Date(claimData.createdAt);
    if (incidentDate > createdDate) {
      anomalyFlags.push("temporal_inconsistency");
      severity = "critical";
    }
  }

  const description = anomalyFlags.length > 0
    ? `Detected ${anomalyFlags.length} anomalies: ${anomalyFlags.join(", ")}`
    : "No anomalies detected";

  return {
    anomalyFlags,
    severity,
    description,
  };
}

// ============================================================================
// MAIN CONFIDENCE SCORING FUNCTION
// ============================================================================

/**
 * Calculate complete confidence score for a historical claim
 */
export async function calculateConfidenceScore(
  claimId: number,
  weights: ConfidenceScoreWeights = DEFAULT_WEIGHTS
): Promise<ConfidenceScoreResult> {
  // Calculate all 8 component scores
  const components: ConfidenceScoreComponents = {
    assessorReportScore: await calculateAssessorReportScore(claimId),
    supportingPhotosScore: await calculateSupportingPhotosScore(claimId),
    panelBeaterQuotesScore: await calculatePanelBeaterQuotesScore(claimId),
    evidenceCompletenessScore: await calculateEvidenceCompletenessScore(claimId),
    handwrittenAdjustmentsScore: await calculateHandwrittenAdjustmentsScore(claimId),
    fraudMarkersScore: await calculateFraudMarkersScore(claimId),
    disputeHistoryScore: await calculateDisputeHistoryScore(claimId),
    competingQuotesScore: await calculateCompetingQuotesScore(claimId),
  };

  // Calculate weighted overall score
  const overallScore = Math.round(
    components.assessorReportScore * weights.assessorReport +
    components.supportingPhotosScore * weights.supportingPhotos +
    components.panelBeaterQuotesScore * weights.panelBeaterQuotes +
    components.evidenceCompletenessScore * weights.evidenceCompleteness +
    components.handwrittenAdjustmentsScore * weights.handwrittenAdjustments +
    components.fraudMarkersScore * weights.fraudMarkers +
    components.disputeHistoryScore * weights.disputeHistory +
    components.competingQuotesScore * weights.competingQuotes
  );

  // Assign confidence category
  let confidenceCategory: "HIGH" | "MEDIUM" | "LOW";
  if (overallScore >= CONFIDENCE_THRESHOLDS.HIGH) {
    confidenceCategory = "HIGH";
  } else if (overallScore >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    confidenceCategory = "MEDIUM";
  } else {
    confidenceCategory = "LOW";
  }

  // Detect anomalies
  const anomalyResult = await detectAnomalies(claimId, components);

  // Generate explanation
  const explanation = generateScoreExplanation(components, overallScore, confidenceCategory, anomalyResult);

  return {
    claimId,
    components,
    overallScore,
    confidenceCategory,
    anomalyFlags: anomalyResult.anomalyFlags,
    biasRiskFlags: [], // Bias detection to be implemented
    explanation,
    calculatedAt: new Date(),
  };
}

/**
 * Generate human-readable explanation of confidence score
 */
function generateScoreExplanation(
  components: ConfidenceScoreComponents,
  overallScore: number,
  category: "HIGH" | "MEDIUM" | "LOW",
  anomalyResult: AnomalyDetectionResult
): string {
  const parts: string[] = [];

  parts.push(`Overall confidence score: ${overallScore}/100 (${category})`);
  parts.push("");
  parts.push("Component Scores:");
  parts.push(`- Assessor Report: ${components.assessorReportScore}/100`);
  parts.push(`- Supporting Photos: ${components.supportingPhotosScore}/100`);
  parts.push(`- Panel Beater Quotes: ${components.panelBeaterQuotesScore}/100`);
  parts.push(`- Evidence Completeness: ${components.evidenceCompletenessScore}/100`);
  parts.push(`- Handwritten Adjustments: ${components.handwrittenAdjustmentsScore}/100`);
  parts.push(`- Fraud Markers: ${components.fraudMarkersScore}/100`);
  parts.push(`- Dispute History: ${components.disputeHistoryScore}/100`);
  parts.push(`- Competing Quotes: ${components.competingQuotesScore}/100`);
  parts.push("");

  if (anomalyResult.anomalyFlags.length > 0) {
    parts.push(`Anomalies Detected (${anomalyResult.severity}): ${anomalyResult.anomalyFlags.join(", ")}`);
    parts.push("");
  }

  if (category === "HIGH") {
    parts.push("Recommendation: AUTO-APPROVE for training dataset");
  } else if (category === "MEDIUM") {
    parts.push("Recommendation: MANUAL REVIEW required");
  } else {
    parts.push("Recommendation: EXTENSIVE REVIEW or REJECT");
  }

  return parts.join("\n");
}

/**
 * Save confidence score to database
 */
export async function saveConfidenceScore(result: ConfidenceScoreResult, tenantId: string): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");

  const [inserted] = (await dbInstance
    .insert(trainingDataScores)
    .values({
      tenantId,
      historicalClaimId: result.claimId,
      trainingConfidenceScore: result.overallScore.toString(),
      trainingConfidenceCategory: result.confidenceCategory,
      assessorReportScore: result.components.assessorReportScore.toString(),
      supportingPhotosScore: result.components.supportingPhotosScore.toString(),
      panelBeaterQuotesScore: result.components.panelBeaterQuotesScore.toString(),
      evidenceCompletenessScore: result.components.evidenceCompletenessScore.toString(),
      handwrittenAdjustmentsScore: result.components.handwrittenAdjustmentsScore.toString(),
      fraudMarkersScore: result.components.fraudMarkersScore.toString(),
      disputeHistoryScore: result.components.disputeHistoryScore.toString(),
      competingQuotesScore: result.components.competingQuotesScore.toString(),
      scoringAlgorithmVersion: "1.0.0",
    })
    .$returningId()) as { id: number }[];

  return inserted.id;
}

/**
 * Add claim to review queue if manual review required
 */
export async function addToReviewQueue(result: ConfidenceScoreResult, tenantId: string): Promise<void> {
  // Only add MEDIUM and LOW confidence claims to review queue
  if (result.confidenceCategory === "HIGH") {
    return; // HIGH confidence claims are auto-approved
  }

  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database not available");

  // Check if already in queue
  const existing = await dbInstance
    .select()
    .from(claimReviewQueue)
    .where(
      and(
        eq(claimReviewQueue.historicalClaimId, result.claimId),
        eq(claimReviewQueue.reviewStatus, "pending_review")
      )
    );

  if (existing.length > 0) {
    return; // Already in queue
  }

  // Determine priority (lower score = higher priority for review)
  const priority = result.confidenceCategory === "LOW" ? 90 : 50;

  await dbInstance
    .insert(claimReviewQueue)
    .values({
      tenantId,
      historicalClaimId: result.claimId,
      reviewStatus: "pending_review",
      reviewPriority: result.confidenceCategory === "LOW" ? "high" : "medium",
      routedReason: `Confidence score: ${result.overallScore} (${result.confidenceCategory})`,
      automatedValidationLevel: "Level 1",
    });
}

/**
 * Calculate and save confidence score for a claim, adding to review queue if needed
 */
export async function processClaimConfidenceScore(claimId: number, tenantId: string): Promise<ConfidenceScoreResult> {
  const result = await calculateConfidenceScore(claimId);
  await saveConfidenceScore(result, tenantId);
  await addToReviewQueue(result, tenantId);
  return result;
}
