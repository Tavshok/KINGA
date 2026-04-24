/**
 * pipeline-v2/claimQualityScorer.ts
 *
 * CLAIM QUALITY SCORER
 *
 * Computes a multi-dimensional quality score for each processed claim.
 * This score tells the adjuster at a glance how much they can rely on the
 * AI assessment — and where the gaps are.
 *
 * Dimensions:
 *   1. Data Completeness   — are the critical fields populated?
 *   2. Image Confidence    — were usable photos processed?
 *   3. Cost Source         — is the AI benchmark from real data or a fallback?
 *   4. Classification      — how confident is the incident classification?
 *   5. Physics             — did the physics engine run with real inputs?
 *   6. Consistency         — are there cross-stage contradictions?
 *
 * Output:
 *   - overallScore: 0–100
 *   - grade: A / B / C / D / F
 *   - dimensions: per-dimension scores and labels
 *   - adjusterGuidance: plain-English summary of what the adjuster should do
 */

import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
} from "./types";
import type { ConsistencyCheckResult } from "./crossStageConsistencyEngine";

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type QualityGrade = "A" | "B" | "C" | "D" | "F";

export interface QualityDimension {
  /** Dimension name */
  name: string;
  /** Score for this dimension (0–100) */
  score: number;
  /** Weight of this dimension in the overall score (0–1) */
  weight: number;
  /** Human-readable label for the score */
  label: string;
  /** Specific gaps or issues found */
  issues: string[];
}

export interface ClaimQualityResult {
  /** Overall weighted quality score (0–100) */
  overallScore: number;
  /** Letter grade */
  grade: QualityGrade;
  /** Per-dimension breakdown */
  dimensions: {
    dataCompleteness: QualityDimension;
    imageConfidence: QualityDimension;
    costSource: QualityDimension;
    classification: QualityDimension;
    physics: QualityDimension;
    consistency: QualityDimension;
  };
  /**
   * Plain-English guidance for the adjuster.
   * Grade A/B: "AI assessment is reliable. Standard review recommended."
   * Grade C: "AI assessment is partially reliable. Review flagged dimensions."
   * Grade D/F: "AI assessment has significant gaps. Manual assessment required."
   */
  adjusterGuidance: string;
  /** Whether this claim requires mandatory manual review before a decision */
  requiresManualReview: boolean;
  /** Specific actions the adjuster must take */
  mandatoryActions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION SCORERS
// ─────────────────────────────────────────────────────────────────────────────

function scoreDataCompleteness(claimRecord: ClaimRecord): QualityDimension {
  const issues: string[] = [];
  let score = 100;

  // Critical fields — each missing field deducts significant points
  const criticalFields: Array<[any, string, number]> = [
    [claimRecord.vehicle.make, "Vehicle make", 10],
    [claimRecord.vehicle.model, "Vehicle model", 10],
    [claimRecord.vehicle.year, "Vehicle year", 8],
    [claimRecord.vehicle.registration, "Vehicle registration", 8],
    [claimRecord.accidentDetails.date, "Accident date", 10],
    [claimRecord.accidentDetails.description, "Accident description", 12],
    [claimRecord.accidentDetails.incidentType, "Incident type", 10],
    [claimRecord.repairQuote.quoteTotalCents, "Repair quote total", 12],
    [claimRecord.driver?.name || claimRecord.driver?.claimantName, "Driver/claimant name", 8],
    [claimRecord.accidentDetails.location, "Accident location", 5],
    [claimRecord.policeReport?.reportNumber, "Police report number", 7],
  ];

  for (const [value, label, deduction] of criticalFields) {
    if (value === null || value === undefined || value === "") {
      score -= deduction;
      issues.push(`Missing: ${label}`);
    }
  }

  score = Math.max(0, score);

  return {
    name: "Data Completeness",
    score,
    weight: 0.25,
    label: score >= 85 ? "Complete" : score >= 65 ? "Mostly Complete" : score >= 45 ? "Partial" : "Incomplete",
    issues,
  };
}

function scoreImageConfidence(
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output | null,
  classifiedImages?: ClaimQualityScorerInput["classifiedImages"]
): QualityDimension {
  const issues: string[] = [];
  let score = 0;

  // Use classified damage photo count if available, otherwise fall back to raw imageUrls
  const classifiedDamagePhotos = classifiedImages?.summary?.damagePhotoCount ?? 0;
  const totalExtracted = claimRecord.damage.imageUrls?.length ?? 0;
  const uploadedPhotos = classifiedDamagePhotos > 0 ? classifiedDamagePhotos : totalExtracted;
  const processedPhotos = damageAnalysis?.photosProcessed ?? 0;
  const imageConfidence = damageAnalysis?.imageConfidenceScore ?? 0;

  if (uploadedPhotos === 0 && totalExtracted === 0) {
    score = 10;
    issues.push("No damage photos submitted — damage analysis based on text only");
  } else if (uploadedPhotos === 0 && totalExtracted > 0) {
    // Images were extracted from PDF but none classified as damage photos
    score = 25;
    issues.push(`${totalExtracted} image(s) extracted from document but none identified as damage photos — analysis based on document pages`);
  } else if (processedPhotos === 0) {
    score = 20;
    issues.push(`${uploadedPhotos} damage photo(s) identified but none were successfully processed by vision`);
  } else {
    // Base score from number of usable photos
    const photoScore = Math.min(60, processedPhotos * 15);
    // Confidence score from the vision engine
    const confidenceBonus = Math.round(imageConfidence * 0.4);
    score = photoScore + confidenceBonus;

    if (processedPhotos < 3) {
      issues.push(`Only ${processedPhotos} of ${uploadedPhotos} damage photo(s) processed — more photos improve accuracy`);
    }
    if (imageConfidence < 60) {
      issues.push(`Image quality is low (confidence: ${imageConfidence}%) — photos may be blurry or poorly lit`);
    }
    // Add classification context
    if (classifiedImages?.summary) {
      const s = classifiedImages.summary;
      if (s.documentPageCount > 0 || s.quotationCount > 0) {
        issues.push(`Image classifier separated ${s.totalInput} extracted images: ${s.damagePhotoCount} damage, ${s.documentPageCount} document, ${s.quotationCount} quotation, ${s.vehicleOverviewCount} overview`);
      }
    }
  }

  score = Math.min(100, Math.max(0, score));

  return {
    name: "Image Confidence",
    score,
    weight: 0.20,
    label: score >= 80 ? "High" : score >= 55 ? "Medium" : score >= 30 ? "Low" : "None",
    issues,
  };
}

function scoreCostSource(costAnalysis: Stage9Output | null): QualityDimension {
  const issues: string[] = [];
  let score = 0;

  if (!costAnalysis) {
    issues.push("Cost analysis did not run");
    return { name: "Cost Source Reliability", score: 0, weight: 0.20, label: "Unavailable", issues };
  }

  const source = (costAnalysis as any).aiEstimateSource as string | undefined;

  switch (source) {
    case "learning_db":
      score = 95;
      break;
    case "quote_proportional":
      score = 75;
      issues.push("AI benchmark derived from submitted quote — no independent learning DB data for this vehicle/region");
      break;
    case "hardcoded_fallback":
      score = 35;
      issues.push("AI benchmark uses hardcoded industry averages — not calibrated to this vehicle or market");
      break;
    case "insufficient_data":
      score = 10;
      issues.push("Insufficient data for AI cost benchmark — manual cost assessment required");
      break;
    default:
      score = 40;
      issues.push("Cost benchmark source is unknown");
  }

  // Bonus if multiple quotes were compared
  const quoteCount = (costAnalysis as any).quoteCount ?? 1;
  if (quoteCount >= 3) {
    score = Math.min(100, score + 10);
  } else if (quoteCount === 2) {
    score = Math.min(100, score + 5);
  }

  // Penalty for extreme deviation
  const deviationPct = Math.abs(costAnalysis.quoteDeviationPct ?? 0);
  if (deviationPct > 200) {
    score = Math.max(0, score - 20);
    issues.push(`Quote deviates ${deviationPct.toFixed(0)}% from AI benchmark — significant outlier`);
  } else if (deviationPct > 100) {
    score = Math.max(0, score - 10);
    issues.push(`Quote deviates ${deviationPct.toFixed(0)}% from AI benchmark — review recommended`);
  }

  return {
    name: "Cost Source Reliability",
    score,
    weight: 0.20,
    label: score >= 80 ? "High" : score >= 55 ? "Medium" : score >= 30 ? "Low" : "Unreliable",
    issues,
  };
}

function scoreClassification(claimRecord: ClaimRecord): QualityDimension {
  const issues: string[] = [];
  let score = 0;

  const classification = claimRecord.accidentDetails.incidentClassification;

  if (!classification) {
    issues.push("Incident classification not available");
    return { name: "Classification Confidence", score: 20, weight: 0.15, label: "Unavailable", issues };
  }

  const confidence = classification.confidence ?? 0;
  score = confidence;

  if (classification.conflict_detected) {
    score = Math.max(0, score - 25);
    issues.push("Classification conflict detected — multiple incident types are plausible");
  }

  if (confidence < 70) {
    issues.push(`Classification confidence is ${confidence}% — below the 70% threshold for reliable analysis`);
  }

  if (classification.incident_type === "unknown" || classification.incident_type === "collision") {
    score = Math.max(0, score - 15);
    issues.push("Incident type is generic — specific type (rear_end, head_on, etc.) could not be determined");
  }

  return {
    name: "Classification Confidence",
    score: Math.min(100, Math.max(0, score)),
    weight: 0.10,
    label: score >= 85 ? "High" : score >= 65 ? "Medium" : score >= 40 ? "Low" : "Uncertain",
    issues,
  };
}

function scorePhysics(physicsAnalysis: Stage7Output | null, claimRecord: ClaimRecord): QualityDimension {
  const issues: string[] = [];
  let score = 0;

  if (!physicsAnalysis) {
    issues.push("Physics analysis did not run");
    return { name: "Physics Analysis", score: 0, weight: 0.10, label: "Unavailable", issues };
  }

  if (!physicsAnalysis.physicsExecuted) {
    // Physics not applicable for this incident type (e.g. theft, flood) — not a failure
    return { name: "Physics Analysis", score: 80, weight: 0.10, label: "Not Applicable", issues };
  }

  // Physics ran — score based on input quality
  score = 60; // Base for running at all

  const speedKmh = physicsAnalysis.estimatedSpeedKmh ?? 0;
  if (speedKmh > 0) {
    score += 20; // Real speed input
  } else {
    issues.push("Speed was not available — physics engine used damage-severity estimation");
    score += 5; // Fallback estimation still ran
  }

  const consistencyScore = physicsAnalysis.damageConsistencyScore ?? 0;
  if (consistencyScore >= 70) {
    score += 20;
  } else if (consistencyScore >= 50) {
    score += 10;
    issues.push(`Damage consistency score is ${consistencyScore}% — some inconsistency between physics and damage`);
  } else {
    issues.push(`Damage consistency score is ${consistencyScore}% — significant inconsistency detected`);
  }

  return {
    name: "Physics Analysis",
    score: Math.min(100, Math.max(0, score)),
    weight: 0.10,
    label: score >= 80 ? "Strong" : score >= 55 ? "Adequate" : score >= 30 ? "Weak" : "Failed",
    issues,
  };
}

function scoreConsistency(consistencyCheck: ConsistencyCheckResult | null | undefined): QualityDimension {
  const issues: string[] = [];

  if (!consistencyCheck) {
    return { name: "Cross-Stage Consistency", score: 70, weight: 0.15, label: "Not Checked", issues };
  }

  let score = 100;

  for (const flag of consistencyCheck.flags) {
    switch (flag.severity) {
      case "CRITICAL":
        score -= 30;
        issues.push(`[CRITICAL] ${flag.description}`);
        break;
      case "HIGH":
        score -= 20;
        issues.push(`[HIGH] ${flag.description}`);
        break;
      case "MEDIUM":
        score -= 10;
        issues.push(`[MEDIUM] ${flag.description}`);
        break;
      case "INFO":
        score -= 5;
        issues.push(`[INFO] ${flag.description}`);
        break;
    }
  }

  score = Math.max(0, score);

  return {
    name: "Cross-Stage Consistency",
    score,
    weight: 0.15,
    label: score >= 90 ? "Consistent" : score >= 70 ? "Minor Issues" : score >= 45 ? "Inconsistent" : "Contradictory",
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADE CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

function scoreToGrade(score: number): QualityGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCORER
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimQualityScorerInput {
  claimRecord: ClaimRecord;
  damageAnalysis: Stage6Output | null;
  physicsAnalysis: Stage7Output | null;
  fraudAnalysis: Stage8Output | null;
  costAnalysis: Stage9Output | null;
  consistencyCheck?: ConsistencyCheckResult | null;
  /** Image classification results from Stage 2.6 */
  classifiedImages?: {
    summary?: {
      totalInput: number;
      damagePhotoCount: number;
      vehicleOverviewCount: number;
      quotationCount: number;
      documentPageCount: number;
      fallbackCount: number;
    };
  } | null;
}

export function scoreClaimQuality(input: ClaimQualityScorerInput): ClaimQualityResult {
  const {
    claimRecord,
    damageAnalysis,
    physicsAnalysis,
    costAnalysis,
    consistencyCheck,
  } = input;

  const dimensions = {
    dataCompleteness: scoreDataCompleteness(claimRecord),
    imageConfidence: scoreImageConfidence(claimRecord, damageAnalysis, input.classifiedImages),
    costSource: scoreCostSource(costAnalysis),
    classification: scoreClassification(claimRecord),
    physics: scorePhysics(physicsAnalysis, claimRecord),
    consistency: scoreConsistency(consistencyCheck),
  };

  // Weighted overall score
  const overallScore = Math.round(
    Object.values(dimensions).reduce(
      (sum, dim) => sum + dim.score * dim.weight,
      0
    )
  );

  const grade = scoreToGrade(overallScore);

  // Determine mandatory actions
  const mandatoryActions: string[] = [];
  const requiresManualReview =
    grade === "D" ||
    grade === "F" ||
    (consistencyCheck?.blockAutoApproval ?? false) ||
    dimensions.costSource.score < 30 ||
    dimensions.dataCompleteness.score < 50;

  if (dimensions.dataCompleteness.score < 50) {
    mandatoryActions.push("Request missing claim information from claimant before proceeding");
  }
  if (dimensions.imageConfidence.score < 30) {
    mandatoryActions.push("Request damage photographs from claimant or arrange physical inspection");
  }
  if (dimensions.costSource.score < 30) {
    mandatoryActions.push("Obtain independent repair quote — AI cost benchmark is not reliable for this claim");
  }
  if (consistencyCheck?.blockAutoApproval) {
    mandatoryActions.push(
      ...consistencyCheck.flags
        .filter(f => f.severity === "CRITICAL" || f.severity === "HIGH")
        .map(f => f.adjusterAction)
    );
  }
  if (dimensions.classification.score < 40) {
    mandatoryActions.push("Verify incident type with claimant — classification is uncertain");
  }

  // Adjuster guidance
  let adjusterGuidance: string;
  if (grade === "A") {
    adjusterGuidance = "AI assessment is highly reliable. Standard review is sufficient before making a decision.";
  } else if (grade === "B") {
    adjusterGuidance = "AI assessment is reliable. Review the flagged dimensions below before making a decision.";
  } else if (grade === "C") {
    adjusterGuidance = "AI assessment is partially reliable. The flagged dimensions require manual verification before a decision can be made.";
  } else if (grade === "D") {
    adjusterGuidance = "AI assessment has significant gaps. Manual assessment is required. Do not rely on AI cost or damage estimates without independent verification.";
  } else {
    adjusterGuidance = "AI assessment is unreliable for this claim. A full manual assessment is required. The AI output should be used as a starting point only.";
  }

  return {
    overallScore,
    grade,
    dimensions,
    adjusterGuidance,
    requiresManualReview,
    mandatoryActions,
  };
}
