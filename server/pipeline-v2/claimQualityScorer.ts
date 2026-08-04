/**
 * pipeline-v2/claimQualityScorer.ts
 *
 * CLAIM QUALITY SCORER
 *
 * Computes a multi-dimensional quality score for each processed claim.
 * This score tells the adjuster at a glance how much they can rely on the
 * KINGA assessment — and where the gaps are.
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
   * Grade A/B: "KINGA assessment is reliable. Standard review recommended."
   * Grade C: "KINGA assessment is partially reliable. Review flagged dimensions."
   * Grade D/F: "KINGA assessment has significant gaps. Manual assessment required."
   */
  adjusterGuidance: string;
  /** Whether this claim requires mandatory manual review before a decision */
  requiresManualReview: boolean;
  /** Specific actions the adjuster must take */
  mandatoryActions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring constants
// KINGA-N-03 CALIBRATION: All thresholds, weights, deductions, and band boundaries below
// were set by engineering judgment during initial build.
// No historical claim dataset was used to derive them.
// Do not change without benchmarking against a labelled claim sample.
// ─────────────────────────────────────────────────────────────────────────────

// ─ Dimension weights (must sum to 1.0) ───────────────────────────────────────
/** Weight of Data Completeness dimension in overall score */
const DIM_W_DATA_COMPLETENESS  = 0.25;
/** Weight of Image Confidence dimension in overall score */
const DIM_W_IMAGE_CONFIDENCE   = 0.20;
/** Weight of Cost Source Reliability dimension in overall score */
const DIM_W_COST_SOURCE        = 0.20;
/** Weight of Classification Confidence dimension in overall score */
const DIM_W_CLASSIFICATION     = 0.10;
/** Weight of Physics Analysis dimension in overall score */
const DIM_W_PHYSICS            = 0.10;
/** Weight of Cross-Stage Consistency dimension in overall score */
const DIM_W_CONSISTENCY        = 0.15;

// ─ Data Completeness label bands ───────────────────────────────────────────────
/** Data Completeness: minimum score for 'Complete' label */
const DC_LABEL_COMPLETE        = 85;
/** Data Completeness: minimum score for 'Mostly Complete' label */
const DC_LABEL_MOSTLY_COMPLETE = 65;
/** Data Completeness: minimum score for 'Partial' label */
const DC_LABEL_PARTIAL         = 45;
/** Data Completeness: mandatory-review gate (score below this triggers manual review) */
const DC_MANUAL_REVIEW_GATE    = 50;
/** Data Completeness: mandatory-action gate (score below this triggers action) */
const DC_ACTION_GATE           = 50;

// ─ Image Confidence scoring ─────────────────────────────────────────────────────
/** Image Confidence: score when no photos at all */
const IC_SCORE_NO_PHOTOS       = 10;
/** Image Confidence: score when images extracted but none classified as damage */
const IC_SCORE_NO_DAMAGE_CLASS = 25;
/** Image Confidence: score when damage photos found but vision processing failed */
const IC_SCORE_VISION_FAILED   = 20;
/** Image Confidence: points per processed photo (capped at IC_PHOTO_CAP) */
const IC_POINTS_PER_PHOTO      = 15;
/** Image Confidence: maximum points from photo count */
const IC_PHOTO_CAP             = 60;
/** Image Confidence: confidence bonus multiplier (imageConfidence * this) */
const IC_CONFIDENCE_MULTIPLIER = 0.4;
/** Image Confidence: minimum processed photos before issuing a warning */
const IC_MIN_PHOTOS_WARNING    = 3;
/** Image Confidence: minimum image confidence before issuing a quality warning */
const IC_CONFIDENCE_WARNING    = 60;
/** Image Confidence: label bands */
const IC_LABEL_HIGH            = 80;
const IC_LABEL_MEDIUM          = 55;
const IC_LABEL_LOW             = 30;
/** Image Confidence: mandatory-action gate */
const IC_ACTION_GATE           = 30;

// ─ Cost Source Reliability scoring ──────────────────────────────────────────────
/** Cost Source: score for learning_db source (best) */
const CS_SCORE_LEARNING_DB     = 95;
/** Cost Source: score for quote_proportional source */
const CS_SCORE_QUOTE_PROP      = 75;
/** Cost Source: score for hardcoded_fallback source */
const CS_SCORE_HARDCODED       = 35;
/** Cost Source: score for insufficient_data source */
const CS_SCORE_INSUFFICIENT    = 10;
/** Cost Source: score for unknown source */
const CS_SCORE_UNKNOWN         = 40;
/** Cost Source: bonus for ≥3 quotes compared */
const CS_BONUS_THREE_QUOTES    = 10;
/** Cost Source: bonus for exactly 2 quotes compared */
const CS_BONUS_TWO_QUOTES      = 5;
/** Cost Source: minimum quotes for three-quote bonus */
const CS_MIN_QUOTES_THREE      = 3;
/** Cost Source: deviation above this (%) triggers major penalty */
const CS_DEVIATION_MAJOR       = 200;
/** Cost Source: deviation above this (%) triggers minor penalty */
const CS_DEVIATION_MINOR       = 100;
/** Cost Source: major deviation penalty */
const CS_PENALTY_MAJOR         = 20;
/** Cost Source: minor deviation penalty */
const CS_PENALTY_MINOR         = 10;
/** Cost Source: label bands */
const CS_LABEL_HIGH            = 80;
const CS_LABEL_MEDIUM          = 55;
const CS_LABEL_LOW             = 30;
/** Cost Source: mandatory-review gate */
const CS_MANUAL_REVIEW_GATE    = 30;
/** Cost Source: mandatory-action gate */
const CS_ACTION_GATE           = 30;

// ─ Classification Confidence scoring ─────────────────────────────────────────────
/** Classification: penalty when a conflict is detected */
const CL_CONFLICT_PENALTY      = 25;
/** Classification: threshold below which a warning is issued */
const CL_CONFIDENCE_WARNING    = 70;
/** Classification: penalty for generic incident type */
const CL_GENERIC_PENALTY       = 15;
/** Classification: default score when unavailable */
const CL_SCORE_UNAVAILABLE     = 20;
/** Classification: label bands */
const CL_LABEL_HIGH            = 85;
const CL_LABEL_MEDIUM          = 65;
const CL_LABEL_LOW             = 40;
/** Classification: mandatory-action gate */
const CL_ACTION_GATE           = 40;

// ─ Physics Analysis scoring ───────────────────────────────────────────────────────
/** Physics: base score when physics engine ran */
const PH_BASE_SCORE            = 60;
/** Physics: bonus when real speed input was available */
const PH_BONUS_SPEED           = 20;
/** Physics: fallback bonus when speed was estimated (not real) */
const PH_BONUS_SPEED_FALLBACK  = 5;
/** Physics: bonus when damage consistency score is high */
const PH_BONUS_CONSISTENCY_HIGH = 20;
/** Physics: bonus when damage consistency score is medium */
const PH_BONUS_CONSISTENCY_MED  = 10;
/** Physics: minimum consistency score for high bonus */
const PH_CONSISTENCY_HIGH_GATE  = 70;
/** Physics: minimum consistency score for medium bonus */
const PH_CONSISTENCY_MED_GATE   = 50;
/** Physics: score when not applicable (non-collision incident) */
const PH_SCORE_NOT_APPLICABLE   = 80;
/** Physics: label bands */
const PH_LABEL_STRONG          = 80;
const PH_LABEL_ADEQUATE        = 55;
const PH_LABEL_WEAK            = 30;

// ─ Cross-Stage Consistency scoring ──────────────────────────────────────────────
/** Consistency: score when check was not run (neutral default) */
const CON_SCORE_NOT_CHECKED    = 70;
/** Consistency: penalty per CRITICAL flag */
const CON_PENALTY_CRITICAL     = 30;
/** Consistency: penalty per HIGH flag */
const CON_PENALTY_HIGH         = 20;
/** Consistency: penalty per MEDIUM flag */
const CON_PENALTY_MEDIUM       = 10;
/** Consistency: penalty per INFO flag */
const CON_PENALTY_INFO         = 5;
/** Consistency: label bands */
const CON_LABEL_CONSISTENT     = 90;
const CON_LABEL_MINOR          = 70;
const CON_LABEL_INCONSISTENT   = 45;

// ─ Overall grade bands ──────────────────────────────────────────────────────────────────
// CALIBRATION: origin unknown, do not change without benchmarking.
// These bands map the 0–100 overall score to a letter grade shown in the
// portal and used in the decision recommendation engine. The thresholds
// were set during initial development and have not been validated against
// a labelled dataset. If the grade distribution in production is skewed
// (e.g. most claims grade C or below), recalibrate against a sample of
// manually-reviewed claims before adjusting.
/** Minimum overall score for grade A (CALIBRATION: engineering-judgment) */
const GRADE_A_MIN = 85;
/** Minimum overall score for grade B (CALIBRATION: engineering-judgment) */
const GRADE_B_MIN = 70;
/** Minimum overall score for grade C (CALIBRATION: engineering-judgment) */
const GRADE_C_MIN = 55;
/** Minimum overall score for grade D (CALIBRATION: engineering-judgment) */
const GRADE_D_MIN = 40;

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
    weight: DIM_W_DATA_COMPLETENESS,
    label: score >= DC_LABEL_COMPLETE ? "Complete" : score >= DC_LABEL_MOSTLY_COMPLETE ? "Mostly Complete" : score >= DC_LABEL_PARTIAL ? "Partial" : "Incomplete",
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
    score = IC_SCORE_NO_PHOTOS;
    issues.push("No damage photos submitted — damage analysis based on text only");
  } else if (uploadedPhotos === 0 && totalExtracted > 0) {
    // Images were extracted from PDF but none classified as damage photos
    score = IC_SCORE_NO_DAMAGE_CLASS;
    issues.push(`${totalExtracted} image(s) extracted from document but none identified as damage photos — analysis based on document pages`);
  } else if (processedPhotos === 0) {
    score = IC_SCORE_VISION_FAILED;
    issues.push(`${uploadedPhotos} damage photo(s) identified but none were successfully processed by vision`);
  } else {
    // Base score from number of usable photos
    const photoScore = Math.min(IC_PHOTO_CAP, processedPhotos * IC_POINTS_PER_PHOTO);
    // Confidence score from the vision engine
    const confidenceBonus = Math.round(imageConfidence * IC_CONFIDENCE_MULTIPLIER);
    score = photoScore + confidenceBonus;

    if (processedPhotos < IC_MIN_PHOTOS_WARNING) {
      issues.push(`Only ${processedPhotos} of ${uploadedPhotos} damage photo(s) processed — more photos improve accuracy`);
    }
    if (imageConfidence < IC_CONFIDENCE_WARNING) {
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
    weight: DIM_W_IMAGE_CONFIDENCE,
    label: score >= IC_LABEL_HIGH ? "High" : score >= IC_LABEL_MEDIUM ? "Medium" : score >= IC_LABEL_LOW ? "Low" : "None",
    issues,
  };
}

function scoreCostSource(costAnalysis: Stage9Output | null): QualityDimension {
  const issues: string[] = [];
  let score = 0;

  if (!costAnalysis) {
    issues.push("Cost analysis did not run");
    return { name: "Cost Source Reliability", score: 0, weight: DIM_W_COST_SOURCE, label: "Unavailable", issues };
  }

  const source = (costAnalysis as any).aiEstimateSource as string | undefined;

  switch (source) {
    case "learning_db":
      score = CS_SCORE_LEARNING_DB;
      break;
    case "quote_proportional":
      score = CS_SCORE_QUOTE_PROP;
      issues.push("AI benchmark derived from submitted quote — no independent learning DB data for this vehicle/region");
      break;
    case "hardcoded_fallback":
      score = CS_SCORE_HARDCODED;
      issues.push("AI benchmark uses hardcoded industry averages — not calibrated to this vehicle or market");
      break;
    case "insufficient_data":
      score = CS_SCORE_INSUFFICIENT;
      issues.push("Insufficient data for AI cost benchmark — manual cost assessment required");
      break;
    default:
      score = CS_SCORE_UNKNOWN;
      issues.push("Cost benchmark source is unknown");
  }

  // Bonus if multiple quotes were compared
  const quoteCount = (costAnalysis as any).quoteCount ?? 1;
  if (quoteCount >= CS_MIN_QUOTES_THREE) {
    score = Math.min(100, score + CS_BONUS_THREE_QUOTES);
  } else if (quoteCount === 2) {
    score = Math.min(100, score + CS_BONUS_TWO_QUOTES);
  }

  // Penalty for extreme deviation
  const deviationPct = Math.abs(costAnalysis.quoteDeviationPct ?? 0);
  if (deviationPct > CS_DEVIATION_MAJOR) {
    score = Math.max(0, score - CS_PENALTY_MAJOR);
    issues.push(`Quote deviates ${deviationPct.toFixed(0)}% from AI benchmark — significant outlier`);
  } else if (deviationPct > CS_DEVIATION_MINOR) {
    score = Math.max(0, score - CS_PENALTY_MINOR);
    issues.push(`Quote deviates ${deviationPct.toFixed(0)}% from AI benchmark — review recommended`);
  }

  return {
    name: "Cost Source Reliability",
    score,
    weight: DIM_W_COST_SOURCE,
    label: score >= CS_LABEL_HIGH ? "High" : score >= CS_LABEL_MEDIUM ? "Medium" : score >= CS_LABEL_LOW ? "Low" : "Unreliable",
    issues,
  };
}

function scoreClassification(claimRecord: ClaimRecord): QualityDimension {
  const issues: string[] = [];
  let score = 0;

  const classification = claimRecord.accidentDetails.incidentClassification;

  if (!classification) {
    issues.push("Incident classification not available");
    return { name: "Classification Confidence", score: CL_SCORE_UNAVAILABLE, weight: DIM_W_CLASSIFICATION, label: "Unavailable", issues };
  }

  const confidence = classification.confidence ?? 0;
  score = confidence;

  if (classification.conflict_detected) {
    score = Math.max(0, score - CL_CONFLICT_PENALTY);
    issues.push("Classification conflict detected — multiple incident types are plausible");
  }

  if (confidence < CL_CONFIDENCE_WARNING) {
    issues.push(`Classification confidence is ${confidence}% — below the ${CL_CONFIDENCE_WARNING}% threshold for reliable analysis`);
  }

  if (classification.incident_type === "unknown" || classification.incident_type === "collision") {
    score = Math.max(0, score - CL_GENERIC_PENALTY);
    issues.push("Incident type is generic — specific type (rear_end, head_on, etc.) could not be determined");
  }

  return {
    name: "Classification Confidence",
    score: Math.min(100, Math.max(0, score)),
    weight: DIM_W_CLASSIFICATION,
    label: score >= CL_LABEL_HIGH ? "High" : score >= CL_LABEL_MEDIUM ? "Medium" : score >= CL_LABEL_LOW ? "Low" : "Uncertain",
    issues,
  };
}

function scorePhysics(physicsAnalysis: Stage7Output | null, claimRecord: ClaimRecord): QualityDimension {
  const issues: string[] = [];
  let score = 0;

  if (!physicsAnalysis) {
    issues.push("Physics analysis did not run");
    return { name: "Physics Analysis", score: 0, weight: DIM_W_PHYSICS, label: "Unavailable", issues };
  }

  if (!physicsAnalysis.physicsExecuted) {
    // Physics not applicable for this incident type (e.g. theft, flood) — not a failure
    return { name: "Physics Analysis", score: PH_SCORE_NOT_APPLICABLE, weight: DIM_W_PHYSICS, label: "Not Applicable", issues };
  }

  // Physics ran — score based on input quality
  score = PH_BASE_SCORE;

  const speedKmh = physicsAnalysis.estimatedSpeedKmh ?? 0;
  if (speedKmh > 0) {
    score += PH_BONUS_SPEED;
  } else {
    issues.push("Speed was not available — physics engine used damage-severity estimation");
    score += PH_BONUS_SPEED_FALLBACK;
  }

  const consistencyScore = physicsAnalysis.damageConsistencyScore ?? 0;
  if (consistencyScore >= PH_CONSISTENCY_HIGH_GATE) {
    score += PH_BONUS_CONSISTENCY_HIGH;
  } else if (consistencyScore >= PH_CONSISTENCY_MED_GATE) {
    score += PH_BONUS_CONSISTENCY_MED;
    issues.push(`Damage consistency score is ${consistencyScore}% — some inconsistency between physics and damage`);
  } else {
    issues.push(`Damage consistency score is ${consistencyScore}% — significant inconsistency detected`);
  }

  return {
    name: "Physics Analysis",
    score: Math.min(100, Math.max(0, score)),
    weight: DIM_W_PHYSICS,
    label: score >= PH_LABEL_STRONG ? "Strong" : score >= PH_LABEL_ADEQUATE ? "Adequate" : score >= PH_LABEL_WEAK ? "Weak" : "Failed",
    issues,
  };
}

function scoreConsistency(consistencyCheck: ConsistencyCheckResult | null | undefined): QualityDimension {
  const issues: string[] = [];

  if (!consistencyCheck) {
    return { name: "Cross-Stage Consistency", score: CON_SCORE_NOT_CHECKED, weight: DIM_W_CONSISTENCY, label: "Not Checked", issues };
  }

  let score = 100;

  for (const flag of consistencyCheck.flags) {
    switch (flag.severity) {
      case "CRITICAL":
        score -= CON_PENALTY_CRITICAL;
        issues.push(`[CRITICAL] ${flag.description}`);
        break;
      case "HIGH":
        score -= CON_PENALTY_HIGH;
        issues.push(`[HIGH] ${flag.description}`);
        break;
      case "MEDIUM":
        score -= CON_PENALTY_MEDIUM;
        issues.push(`[MEDIUM] ${flag.description}`);
        break;
      case "INFO":
        score -= CON_PENALTY_INFO;
        issues.push(`[INFO] ${flag.description}`);
        break;
    }
  }

  score = Math.max(0, score);

  return {
    name: "Cross-Stage Consistency",
    score,
    weight: DIM_W_CONSISTENCY,
    label: score >= CON_LABEL_CONSISTENT ? "Consistent" : score >= CON_LABEL_MINOR ? "Minor Issues" : score >= CON_LABEL_INCONSISTENT ? "Inconsistent" : "Contradictory",
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADE CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

function scoreToGrade(score: number): QualityGrade {
  if (score >= GRADE_A_MIN) return "A";
  if (score >= GRADE_B_MIN) return "B";
  if (score >= GRADE_C_MIN) return "C";
  if (score >= GRADE_D_MIN) return "D";
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
    dimensions.costSource.score < CS_MANUAL_REVIEW_GATE ||
    dimensions.dataCompleteness.score < DC_MANUAL_REVIEW_GATE;

  if (dimensions.dataCompleteness.score < DC_ACTION_GATE) {
    mandatoryActions.push("Request missing claim information from claimant before proceeding");
  }
  if (dimensions.imageConfidence.score < IC_ACTION_GATE) {
    mandatoryActions.push("Request damage photographs from claimant or arrange physical inspection");
  }
  if (dimensions.costSource.score < CS_ACTION_GATE) {
    mandatoryActions.push("Obtain independent repair quote — AI cost benchmark is not reliable for this claim");
  }
  if (consistencyCheck?.blockAutoApproval) {
    mandatoryActions.push(
      ...consistencyCheck.flags
        .filter(f => f.severity === "CRITICAL" || f.severity === "HIGH")
        .map(f => f.adjusterAction)
    );
  }
  if (dimensions.classification.score < CL_ACTION_GATE) {
    mandatoryActions.push("Verify incident type with claimant — classification is uncertain");
  }

  // Adjuster guidance
  let adjusterGuidance: string;
  if (grade === "A") {
    adjusterGuidance = "KINGA assessment is highly reliable. Standard review is sufficient before making a decision.";
  } else if (grade === "B") {
    adjusterGuidance = "KINGA assessment is reliable. Review the flagged dimensions below before making a decision.";
  } else if (grade === "C") {
    adjusterGuidance = "KINGA assessment is partially reliable. The flagged dimensions require manual verification before a decision can be made.";
  } else if (grade === "D") {
    adjusterGuidance = "KINGA assessment has significant gaps. Manual assessment is required. Do not rely on AI cost or damage estimates without independent verification.";
  } else {
    adjusterGuidance = "KINGA assessment is unreliable for this claim. A full manual assessment is required. The AI output should be used as a starting point only.";
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
