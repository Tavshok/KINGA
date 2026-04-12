/**
 * pipeline-v2/inputFidelityEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * INPUT FIDELITY ENGINE (IFE) — Phase 3A
 *
 * Classifies every data gap and quality failure with a forensically defensible
 * attribution label. This separates system failures from claimant deficiencies,
 * preventing incorrect FCDI inflation and unfair blame assignment.
 *
 * DATA ATTRIBUTION CLASSES:
 *   CLAIMANT_DEFICIENCY     — Claimant failed to provide required information
 *   SYSTEM_EXTRACTION_FAILURE — OCR/LLM/pipeline failed on readable input
 *   DOCUMENT_LIMITATION     — Document type structurally cannot contain the field
 *   INSURER_DATA_GAP        — Policy record is incomplete (missing valuation, excess, etc.)
 *
 * PIPELINE ROLE: Called after Stage 2 (extraction) and Stage 3 (structured extraction),
 * before Stage 4 (validation). Produces an IFEReport that:
 *   1. Classifies every missing/low-quality field with an attribution
 *   2. Computes an input completeness score (0–100)
 *   3. Provides attribution-aware FCDI adjustment factors
 *   4. Feeds the Data Attribution Layer into the Forensic Audit Report
 *
 * DESIGN RULES:
 *   - Never blame the claimant for a system failure
 *   - Every attribution must be traceable to a specific signal
 *   - INSURER_DATA_GAP is a new class for emerging-market policy record gaps
 *   - Image quality scoring is deterministic (no LLM required)
 *   - The IFE output is persisted to DB and surfaced in the Forensic Audit Report
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type DataAttributionClass =
  | "CLAIMANT_DEFICIENCY"
  | "SYSTEM_EXTRACTION_FAILURE"
  | "DOCUMENT_LIMITATION"
  | "INSURER_DATA_GAP";

export interface AttributedGap {
  /** Field name that is missing or low-quality */
  field: string;
  /** Attribution class */
  attribution: DataAttributionClass;
  /** Human-readable reason for the attribution */
  reason: string;
  /** Confidence in the attribution itself (0–1) */
  attributionConfidence: number;
  /** Whether this gap affects FCDI scoring */
  affectsFCDI: boolean;
  /** FCDI adjustment: if SYSTEM_EXTRACTION_FAILURE, reduce FCDI penalty by this factor */
  fcdiAdjustmentFactor: number;
  /** Stage where the gap was detected */
  detectedAtStage: string;
}

export interface ImageQualityAssessment {
  /** URL or identifier of the image */
  imageRef: string;
  /** Image classification */
  classification: "damage_photo" | "document_scan" | "irrelevant" | "unclassifiable";
  /** Quality score 0–100 */
  qualityScore: number;
  /** Whether this image is usable for damage analysis */
  usableForAnalysis: boolean;
  /** Quality failure reasons */
  qualityFailures: Array<"low_resolution" | "blurred" | "poor_lighting" | "duplicate" | "corrupt">;
  /** Attribution for quality failures */
  attribution: DataAttributionClass;
}

export interface IFEReport {
  /** Total number of fields assessed */
  totalFieldsAssessed: number;
  /** Number of fields with gaps */
  gapCount: number;
  /** Input completeness score 0–100 */
  completenessScore: number;
  /** Attribution breakdown */
  attributionBreakdown: Record<DataAttributionClass, number>;
  /** Per-field attributed gaps */
  attributedGaps: AttributedGap[];
  /** Image quality assessments (if images were submitted) */
  imageAssessments: ImageQualityAssessment[];
  /** FCDI adjustment: total penalty reduction due to system failures (not claimant) */
  fcdiSystemFailurePenaltyReduction: number;
  /** Whether the input quality is sufficient for DOE to run */
  doeEligible: boolean;
  /** Reason DOE is ineligible (if applicable) */
  doeIneligibilityReason: string | null;
  /** Summary narrative for the Forensic Audit Report */
  narrative: string;
  /** ISO timestamp */
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Fields required for a complete claim assessment */
const CRITICAL_FIELDS: Array<{
  field: string;
  stage: string;
  documentLimited?: boolean; // True if some document types structurally can't have this
}> = [
  { field: "claimantName",        stage: "Stage2" },
  { field: "vehicleMake",         stage: "Stage2" },
  { field: "vehicleModel",        stage: "Stage2" },
  { field: "vehicleYear",         stage: "Stage2" },
  { field: "vehicleRegistration", stage: "Stage2" },
  { field: "incidentDate",        stage: "Stage2" },
  { field: "incidentDescription", stage: "Stage2" },
  { field: "repairQuoteTotal",    stage: "Stage3" },
  { field: "agreedCost",          stage: "Stage3" },
  { field: "policyNumber",        stage: "Stage2", documentLimited: true },
  { field: "insuredValue",        stage: "Stage3", documentLimited: true },
  { field: "excess",              stage: "Stage3", documentLimited: true },
  { field: "driverLicence",       stage: "Stage2", documentLimited: true },
];

/** Fields that are INSURER_DATA_GAP when missing from the policy record */
const INSURER_POLICY_FIELDS = new Set([
  "insuredValue",
  "agreedValue",
  "excess",
  "policyNumber",
  "policyInceptionDate",
  "policyExpiryDate",
  "sumInsured",
]);

/** Minimum completeness score for DOE eligibility */
const DOE_MIN_COMPLETENESS = 55;

/** FCDI adjustment factor for system extraction failures (reduces penalty) */
const SYSTEM_FAILURE_FCDI_REDUCTION = 0.7; // 70% of the penalty is waived for system failures

// ─────────────────────────────────────────────────────────────────────────────
// ATTRIBUTION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the attribution class for a missing field.
 *
 * Decision tree:
 * 1. If the field is a policy/insurer field AND the extraction succeeded on
 *    other fields → INSURER_DATA_GAP (policy record incomplete)
 * 2. If extraction confidence on the document was high but field still missing
 *    → SYSTEM_EXTRACTION_FAILURE (OCR/LLM failed on readable content)
 * 3. If the document type structurally cannot contain this field
 *    → DOCUMENT_LIMITATION
 * 4. Default → CLAIMANT_DEFICIENCY
 */
function attributeMissingField(
  field: string,
  extractionConfidence: number,
  documentHasOtherFields: boolean,
  documentType: string | null,
  isDocumentLimited: boolean,
): AttributedGap {
  let attribution: DataAttributionClass;
  let reason: string;
  let attributionConfidence: number;
  let fcdiAdjustmentFactor: number;

  if (INSURER_POLICY_FIELDS.has(field) && documentHasOtherFields) {
    // Policy record gap — insurer's data is incomplete.
    // Check this FIRST: INSURER_DATA_GAP is more precise than DOCUMENT_LIMITATION
    // for policy fields (the insurer's record is incomplete, not a doc structural gap).
    attribution = "INSURER_DATA_GAP";
    reason = `Field '${field}' is a policy record field. The policy document was processed but this field was not present, indicating an incomplete insurer record rather than a claimant omission.`;
    attributionConfidence = 0.75;
    fcdiAdjustmentFactor = SYSTEM_FAILURE_FCDI_REDUCTION;
  } else if (isDocumentLimited && documentType === "repair_quote") {
    // Repair quotes structurally don't contain non-insurer fields (e.g. driver licence).
    // Only reaches here for fields NOT in INSURER_POLICY_FIELDS.
    attribution = "DOCUMENT_LIMITATION";
    reason = `Field '${field}' is not expected in a repair quotation document. This is a structural document limitation, not a data gap.`;
    attributionConfidence = 0.95;
    fcdiAdjustmentFactor = SYSTEM_FAILURE_FCDI_REDUCTION;
  } else if (extractionConfidence >= 0.6 && documentHasOtherFields) {
    // High extraction confidence but field still missing → system failure
    attribution = "SYSTEM_EXTRACTION_FAILURE";
    reason = `Field '${field}' was not extracted despite high document readability (confidence: ${Math.round(extractionConfidence * 100)}%). This indicates an OCR or structured extraction failure, not a claimant omission.`;
    attributionConfidence = 0.80;
    fcdiAdjustmentFactor = SYSTEM_FAILURE_FCDI_REDUCTION;
  } else {
    // Default: claimant did not provide
    attribution = "CLAIMANT_DEFICIENCY";
    reason = `Field '${field}' was not found in the submitted documents. The claimant may not have provided this information.`;
    attributionConfidence = 0.65;
    fcdiAdjustmentFactor = 0; // No FCDI reduction — this is a genuine gap
  }

  return {
    field,
    attribution,
    reason,
    attributionConfidence,
    affectsFCDI: attribution !== "DOCUMENT_LIMITATION",
    fcdiAdjustmentFactor,
    detectedAtStage: "IFE",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE QUALITY SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score image quality from metadata signals.
 * Does NOT require LLM — uses deterministic heuristics on available metadata.
 */
export function assessImageQuality(
  imageRef: string,
  metadata: {
    width?: number;
    height?: number;
    fileSizeBytes?: number;
    mimeType?: string;
    isDuplicate?: boolean;
    isCorrupt?: boolean;
    /** 0–1 blur score from vision stage (if available) */
    blurScore?: number;
    /** Classification hint from vision stage */
    classificationHint?: string;
  }
): ImageQualityAssessment {
  const failures: ImageQualityAssessment["qualityFailures"] = [];
  let qualityScore = 100;

  if (metadata.isCorrupt) {
    failures.push("corrupt");
    qualityScore = 0;
  }

  if (metadata.isDuplicate) {
    failures.push("duplicate");
    qualityScore = Math.max(0, qualityScore - 30);
  }

  const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
  if (pixels > 0 && pixels < 100_000) {
    // Below ~316x316 — too low resolution for damage analysis
    failures.push("low_resolution");
    qualityScore = Math.max(0, qualityScore - 40);
  }

  if (metadata.blurScore != null && metadata.blurScore < 0.4) {
    failures.push("blurred");
    qualityScore = Math.max(0, qualityScore - 35);
  }

  if (metadata.fileSizeBytes != null && metadata.fileSizeBytes < 10_000) {
    // Under 10KB is almost certainly too small to be a useful photo
    failures.push("low_resolution");
    qualityScore = Math.max(0, qualityScore - 20);
  }

  const classification = classifyImageFromHint(metadata.classificationHint);
  const usableForAnalysis = qualityScore >= 40 && classification === "damage_photo" && !metadata.isCorrupt;

  // Attribution: if the image was submitted but is corrupt/blurred, that's a
  // CLAIMANT_DEFICIENCY (poor quality submission). If it's a system parse
  // failure (corrupt during extraction), it's SYSTEM_EXTRACTION_FAILURE.
  const attribution: DataAttributionClass = metadata.isCorrupt
    ? "SYSTEM_EXTRACTION_FAILURE"
    : failures.length > 0
    ? "CLAIMANT_DEFICIENCY"
    : "CLAIMANT_DEFICIENCY"; // Quality issues are claimant-side

  return {
    imageRef,
    classification,
    qualityScore: Math.max(0, Math.min(100, qualityScore)),
    usableForAnalysis,
    qualityFailures: failures,
    attribution,
  };
}

function classifyImageFromHint(hint?: string): ImageQualityAssessment["classification"] {
  if (!hint) return "unclassifiable";
  const h = hint.toLowerCase();
  if (h.includes("damage") || h.includes("vehicle") || h.includes("crash") || h.includes("dent") || h.includes("scratch")) {
    return "damage_photo";
  }
  if (h.includes("document") || h.includes("quote") || h.includes("form") || h.includes("scan") || h.includes("invoice")) {
    return "document_scan";
  }
  if (h.includes("irrelevant") || h.includes("unrelated") || h.includes("person") || h.includes("selfie")) {
    return "irrelevant";
  }
  return "unclassifiable";
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface IFEInput {
  /** Extracted field values from Stage 2/3 — null means missing */
  extractedFields: Record<string, any>;
  /** Overall extraction confidence from Stage 2 (0–1) */
  extractionConfidence: number;
  /** Primary document type submitted */
  primaryDocumentType: string | null;
  /** Whether the document had other fields successfully extracted */
  documentHasOtherFields: boolean;
  /** Image metadata array (from Stage 6 enrichedPhotos, if available) */
  imageMetadata?: Array<{
    imageRef: string;
    width?: number;
    height?: number;
    fileSizeBytes?: number;
    mimeType?: string;
    isDuplicate?: boolean;
    isCorrupt?: boolean;
    blurScore?: number;
    classificationHint?: string;
  }>;
}

export function computeIFE(input: IFEInput): IFEReport {
  const {
    extractedFields,
    extractionConfidence,
    primaryDocumentType,
    documentHasOtherFields,
    imageMetadata = [],
  } = input;

  const attributedGaps: AttributedGap[] = [];
  let presentCount = 0;

  for (const fieldDef of CRITICAL_FIELDS) {
    const value = extractedFields[fieldDef.field];
    const isPresent = value !== null && value !== undefined && value !== "" && value !== 0;

    if (isPresent) {
      presentCount++;
    } else {
      const gap = attributeMissingField(
        fieldDef.field,
        extractionConfidence,
        documentHasOtherFields,
        primaryDocumentType,
        fieldDef.documentLimited ?? false,
      );
      attributedGaps.push(gap);
    }
  }

  const totalFields = CRITICAL_FIELDS.length;
  const gapCount = attributedGaps.length;
  const completenessScore = Math.round((presentCount / totalFields) * 100);

  // Attribution breakdown
  const attributionBreakdown: Record<DataAttributionClass, number> = {
    CLAIMANT_DEFICIENCY: 0,
    SYSTEM_EXTRACTION_FAILURE: 0,
    DOCUMENT_LIMITATION: 0,
    INSURER_DATA_GAP: 0,
  };
  for (const gap of attributedGaps) {
    attributionBreakdown[gap.attribution]++;
  }

  // Image quality assessments
  const imageAssessments: ImageQualityAssessment[] = imageMetadata.map(img =>
    assessImageQuality(img.imageRef, img)
  );

  // FCDI adjustment: sum up penalty reductions for non-claimant gaps
  const fcdiSystemFailurePenaltyReduction = attributedGaps
    .filter(g => g.attribution !== "CLAIMANT_DEFICIENCY")
    .reduce((sum, g) => sum + g.fcdiAdjustmentFactor, 0);

  // DOE eligibility gate
  const doeEligible = completenessScore >= DOE_MIN_COMPLETENESS;
  const doeIneligibilityReason = doeEligible
    ? null
    : `Input completeness score (${completenessScore}%) is below the minimum threshold (${DOE_MIN_COMPLETENESS}%) required for decision optimisation. Manual review required.`;

  const narrative = buildNarrative(
    completenessScore,
    attributionBreakdown,
    gapCount,
    imageAssessments,
    doeEligible,
  );

  return {
    totalFieldsAssessed: totalFields,
    gapCount,
    completenessScore,
    attributionBreakdown,
    attributedGaps,
    imageAssessments,
    fcdiSystemFailurePenaltyReduction,
    doeEligible,
    doeIneligibilityReason,
    narrative,
    computedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NARRATIVE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildNarrative(
  completenessScore: number,
  breakdown: Record<DataAttributionClass, number>,
  gapCount: number,
  imageAssessments: ImageQualityAssessment[],
  doeEligible: boolean,
): string {
  if (gapCount === 0) {
    return "All critical fields were successfully extracted. Input fidelity is complete. No attribution adjustments required.";
  }

  const parts: string[] = [];

  parts.push(`Input completeness: ${completenessScore}% (${gapCount} field gap${gapCount !== 1 ? "s" : ""} detected).`);

  if (breakdown.SYSTEM_EXTRACTION_FAILURE > 0) {
    parts.push(`${breakdown.SYSTEM_EXTRACTION_FAILURE} gap${breakdown.SYSTEM_EXTRACTION_FAILURE !== 1 ? "s" : ""} attributed to system extraction failure — FCDI penalty adjusted accordingly.`);
  }
  if (breakdown.INSURER_DATA_GAP > 0) {
    parts.push(`${breakdown.INSURER_DATA_GAP} gap${breakdown.INSURER_DATA_GAP !== 1 ? "s" : ""} attributed to incomplete insurer policy records.`);
  }
  if (breakdown.DOCUMENT_LIMITATION > 0) {
    parts.push(`${breakdown.DOCUMENT_LIMITATION} gap${breakdown.DOCUMENT_LIMITATION !== 1 ? "s" : ""} are structural document limitations (not data deficiencies).`);
  }
  if (breakdown.CLAIMANT_DEFICIENCY > 0) {
    parts.push(`${breakdown.CLAIMANT_DEFICIENCY} gap${breakdown.CLAIMANT_DEFICIENCY !== 1 ? "s" : ""} attributed to claimant omissions.`);
  }

  const unusableImages = imageAssessments.filter(i => !i.usableForAnalysis).length;
  if (unusableImages > 0) {
    parts.push(`${unusableImages} of ${imageAssessments.length} submitted image${imageAssessments.length !== 1 ? "s" : ""} did not meet quality thresholds for damage analysis.`);
  }

  if (!doeEligible) {
    parts.push("Input completeness is insufficient for automated decision optimisation. Manual assessor review is required.");
  }

  return parts.join(" ");
}
