/**
 * output-validation-engine.ts
 *
 * KINGA Output Validation and Correction Engine
 *
 * This is the LAST stage before any claim output is presented to the UI.
 * It enforces all 10 rules defined in the Output Validation Spec:
 *
 *  Rule 1  — Terminology Validation
 *  Rule 2  — Cost Governance (no AI estimate without sufficient data; no unrealistic values)
 *  Rule 3  — Panel Beater Extraction (required field if present in source)
 *  Rule 4  — Accident Description Sanity (exclude inspection/repair actions)
 *  Rule 5  — Image Processing Visibility (flag if images exist but not processed)
 *  Rule 6  — Physics Output Visibility (require speed/force/severity if model ran)
 *  Rule 7  — UI Readability Enforcement (status maps to APPROVE/REVIEW/REJECT only)
 *  Rule 8  — Confidence Gating (suppress or mark fields < 60 confidence)
 *  Rule 9  — Data Completeness Check (flag INCOMPLETE if critical fields missing)
 *  Rule 10 — Never Invent Data (replace nulls with "not available", not guesses)
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationStatus = "VALIDATED" | "CORRECTED" | "SUPPRESSED";

export interface ValidationCorrection {
  rule: number;
  field: string;
  original: unknown;
  corrected: unknown;
  reason: string;
}

export interface ValidationFlag {
  rule: number;
  field: string;
  flag: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface OutputValidationResult {
  status: ValidationStatus;
  corrections: ValidationCorrection[];
  suppressed_fields: string[];
  flags: ValidationFlag[];
  final_output: ValidatedClaimOutput;
  notes: string;
}

export interface ValidatedClaimOutput {
  // Core identity
  claimId: number;
  claimNumber: string | null;

  // Rule 7 — only these three values allowed
  decisionVerdict: "APPROVE" | "REVIEW" | "REJECT";
  decisionLabel: string;

  // Rule 8 — confidence gate
  overallConfidence: number;
  confidenceGated: boolean;

  // Rule 3 — panel beater (required if found)
  panelBeaterName: string | null;
  panelBeaterSource: "quotation_header" | "assessor_report" | "not_found";

  // Rule 2 — cost governance
  aiEstimateUsd: number | null;         // null = suppressed (Rule 2)
  aiEstimateSuppressed: boolean;
  aiEstimateSuppressReason: string | null;
  documentedOriginalQuoteUsd: number | null;
  documentedAgreedCostUsd: number | null;
  quoteOptimisationUsd: number | null;
  costBasis: string | null;

  // Rule 4 — accident description (sanitised)
  accidentDescription: string | null;
  accidentDescriptionSanitised: boolean;

  // Rule 5 — image processing visibility
  imageCount: number;
  imageProcessingStatus: "processed" | "not_processed" | "no_images";
  imageProcessingFlag: boolean;         // true = "image_processing_missing"
  detectedDamageComponents: string[];

  // Rule 6 — physics output
  physicsExecuted: boolean;
  impactSpeedKmh: number | null;
  impactForceKn: number | null;
  severityClassification: string | null;
  showVectors: boolean;

  // Rule 9 — completeness
  isComplete: boolean;
  missingCriticalFields: string[];

  // Rule 1 — terminology (corrected terms)
  terminologyCorrected: boolean;

  // Pass-through enriched fields
  fraudScore: number;
  fraudLevel: string;
  structuralDamage: boolean;
  damagedComponents: string[];
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleRegistration: string | null;
  accidentDate: string | null;
  accidentLocation: string | null;
  accidentType: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 1: TERMINOLOGY VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known valid domain terms for insurance/automotive claims.
 * Any field value that matches a REJECTED_TERMS pattern is replaced.
 */
const REJECTED_TERMS: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  { pattern: /reconchika/gi,           replacement: "repair component",        reason: "Non-domain invented term" },
  { pattern: /\bpanel-beat\b/gi,       replacement: "panel repair",            reason: "Incorrect hyphenation" },
  { pattern: /\bsmash repair\b/gi,     replacement: "panel repair",            reason: "Informal term — use domain standard" },
  { pattern: /\bwrite-off\b/gi,        replacement: "total loss",              reason: "Use standard insurance term" },
  { pattern: /\bwrite off\b/gi,        replacement: "total loss",              reason: "Use standard insurance term" },
  { pattern: /\bundefined\b/gi,        replacement: "not available",           reason: "Raw JS undefined leaked into output" },
  { pattern: /\bnull\b/gi,             replacement: "not available",           reason: "Raw null leaked into output" },
  { pattern: /\bNaN\b/g,              replacement: "not available",           reason: "Raw NaN leaked into output" },
];

function validateTerminology(
  text: string | null | undefined,
  field: string,
  corrections: ValidationCorrection[]
): string | null {
  if (!text || typeof text !== "string") return text ?? null;
  let result = text;
  let changed = false;
  for (const { pattern, replacement, reason } of REJECTED_TERMS) {
    if (pattern.test(result)) {
      const original = result;
      result = result.replace(pattern, replacement);
      corrections.push({ rule: 1, field, original, corrected: result, reason });
      changed = true;
      pattern.lastIndex = 0; // reset stateful regex
    }
  }
  return changed ? result : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 2: COST GOVERNANCE
// ─────────────────────────────────────────────────────────────────────────────

const MIN_REALISTIC_REPAIR_USD = 50;   // below this = unrealistic
const MAX_REALISTIC_REPAIR_USD = 500_000; // above this = unrealistic

function validateCost(params: {
  aiEstimateUsd: number | null;
  documentedOriginalQuoteUsd: number | null;
  documentedAgreedCostUsd: number | null;
  confidenceScore: number;
  corrections: ValidationCorrection[];
  suppressed: string[];
}): {
  aiEstimateUsd: number | null;
  suppressed: boolean;
  suppressReason: string | null;
  quoteOptimisationUsd: number | null;
} {
  const { corrections, suppressed } = params;
  let { aiEstimateUsd, documentedOriginalQuoteUsd, documentedAgreedCostUsd, confidenceScore } = params;

  let suppressReason: string | null = null;
  let isSuppressed = false;

  // Rule 2a: no AI estimate if confidence < 60
  if (aiEstimateUsd !== null && confidenceScore < 60) {
    corrections.push({
      rule: 2,
      field: "aiEstimateUsd",
      original: aiEstimateUsd,
      corrected: null,
      reason: `Confidence ${confidenceScore} < 60 — AI estimate suppressed`,
    });
    suppressed.push("ai_estimate_usd");
    aiEstimateUsd = null;
    isSuppressed = true;
    suppressReason = `Insufficient confidence (${confidenceScore}/100) to present AI estimate`;
  }

  // Rule 2b: unrealistic value check
  if (aiEstimateUsd !== null) {
    if (aiEstimateUsd < MIN_REALISTIC_REPAIR_USD || aiEstimateUsd > MAX_REALISTIC_REPAIR_USD) {
      corrections.push({
        rule: 2,
        field: "aiEstimateUsd",
        original: aiEstimateUsd,
        corrected: null,
        reason: `Value $${aiEstimateUsd.toFixed(2)} is outside realistic repair range ($${MIN_REALISTIC_REPAIR_USD}–$${MAX_REALISTIC_REPAIR_USD.toLocaleString()})`,
      });
      suppressed.push("ai_estimate_usd");
      aiEstimateUsd = null;
      isSuppressed = true;
      suppressReason = `Unrealistic value: $${params.aiEstimateUsd?.toFixed(2)} — outside plausible repair cost range`;
    }
  }

  // Quote optimisation = original quote - agreed cost (savings)
  const quoteOptimisationUsd =
    documentedOriginalQuoteUsd !== null && documentedAgreedCostUsd !== null
      ? Math.max(0, documentedOriginalQuoteUsd - documentedAgreedCostUsd)
      : null;

  return { aiEstimateUsd, suppressed: isSuppressed, suppressReason, quoteOptimisationUsd };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 3: PANEL BEATER EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

function extractPanelBeater(params: {
  panelBeaterFromCostIntel: string | null;
  panelBeaterFromAssessor: string | null;
  repairerName: string | null;
  corrections: ValidationCorrection[];
}): { name: string | null; source: "quotation_header" | "assessor_report" | "not_found" } {
  const { panelBeaterFromCostIntel, panelBeaterFromAssessor, repairerName, corrections } = params;

  // Priority 1: quotation header (cost intelligence extraction)
  if (panelBeaterFromCostIntel && panelBeaterFromCostIntel.trim().length > 1) {
    return { name: panelBeaterFromCostIntel.trim(), source: "quotation_header" };
  }

  // Priority 2: assessor report field
  if (panelBeaterFromAssessor && panelBeaterFromAssessor.trim().length > 1) {
    return { name: panelBeaterFromAssessor.trim(), source: "assessor_report" };
  }

  // Priority 3: repairerName from claim record
  if (repairerName && repairerName.trim().length > 1) {
    return { name: repairerName.trim(), source: "assessor_report" };
  }

  corrections.push({
    rule: 3,
    field: "panelBeaterName",
    original: null,
    corrected: "not available",
    reason: "Panel beater not found in quotation header or assessor report",
  });

  return { name: null, source: "not_found" };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 4: ACCIDENT DESCRIPTION SANITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patterns that indicate repair/inspection actions — must be stripped from
 * the accident description field.
 */
const REPAIR_ACTION_PATTERNS = [
  /\bstrip(ped|ping)?\b/gi,
  /\binspect(ed|ion|ing)?\b/gi,
  /\breplace(d|ment|ments)?\b/gi,
  /\brepair(ed|ing|s)?\b/gi,
  /\bpanel beat(er|ing|s)?\b/gi,
  /\bspray paint(ed|ing)?\b/gi,
  /\bweld(ed|ing)?\b/gi,
  /\bstraighten(ed|ing)?\b/gi,
  /\bquote(d|s)?\b/gi,
  /\bassess(ed|ment|ing)?\b/gi,
  /\bworkshop\b/gi,
  /\bparts order(ed|ing)?\b/gi,
];

function sanitiseAccidentDescription(
  description: string | null | undefined,
  corrections: ValidationCorrection[]
): { text: string | null; sanitised: boolean } {
  if (!description || typeof description !== "string") return { text: description ?? null, sanitised: false };

  // Split into sentences and keep only those that describe the event/impact
  const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const kept: string[] = [];
  const removed: string[] = [];

  for (const sentence of sentences) {
    const hasRepairAction = REPAIR_ACTION_PATTERNS.some(p => {
      const result = p.test(sentence);
      p.lastIndex = 0;
      return result;
    });
    if (hasRepairAction) {
      removed.push(sentence);
    } else {
      kept.push(sentence);
    }
  }

  if (removed.length === 0) return { text: description, sanitised: false };

  const sanitised = kept.length > 0 ? kept.join(". ").trim() + "." : null;
  corrections.push({
    rule: 4,
    field: "accidentDescription",
    original: description,
    corrected: sanitised,
    reason: `Removed ${removed.length} sentence(s) describing repair/inspection actions: "${removed.join("; ")}"`,
  });

  return { text: sanitised, sanitised: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 5: IMAGE PROCESSING VISIBILITY
// ─────────────────────────────────────────────────────────────────────────────

function checkImageProcessing(params: {
  imageUrls: string[];
  damagedComponents: string[];
  imageProcessingRan: boolean;
  flags: ValidationFlag[];
}): {
  imageCount: number;
  status: "processed" | "not_processed" | "no_images";
  flagMissing: boolean;
} {
  const { imageUrls, damagedComponents, imageProcessingRan, flags } = params;
  const imageCount = imageUrls.length;

  if (imageCount === 0) {
    return { imageCount: 0, status: "no_images", flagMissing: false };
  }

  if (!imageProcessingRan || damagedComponents.length === 0) {
    flags.push({
      rule: 5,
      field: "imageProcessing",
      flag: "image_processing_missing",
      severity: "warning",
      message: `${imageCount} image(s) in evidence registry but damage component detection was not completed`,
    });
    return { imageCount, status: "not_processed", flagMissing: true };
  }

  return { imageCount, status: "processed", flagMissing: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 6: PHYSICS OUTPUT VISIBILITY
// ─────────────────────────────────────────────────────────────────────────────

function validatePhysicsOutput(params: {
  physicsExecuted: boolean;
  impactSpeedKmh: number | null;
  impactForceKn: number | null;
  severityClassification: string | null;
  hasVectors: boolean;
  flags: ValidationFlag[];
}): {
  impactSpeedKmh: number | null;
  impactForceKn: number | null;
  severityClassification: string | null;
  showVectors: boolean;
} {
  const { physicsExecuted, impactSpeedKmh, impactForceKn, severityClassification, hasVectors, flags } = params;

  if (!physicsExecuted) {
    return { impactSpeedKmh: null, impactForceKn: null, severityClassification: null, showVectors: false };
  }

  // Physics ran — all three fields are required
  if (impactSpeedKmh === null || impactForceKn === null || !severityClassification) {
    flags.push({
      rule: 6,
      field: "physicsOutput",
      flag: "physics_output_incomplete",
      severity: "warning",
      message: "Physics model executed but one or more required outputs (speed, force, severity) are missing",
    });
  }

  return {
    impactSpeedKmh,
    impactForceKn,
    severityClassification: severityClassification ?? null,
    showVectors: hasVectors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 7: UI STATUS MAPPING
// ─────────────────────────────────────────────────────────────────────────────

const VALID_VERDICTS = new Set(["APPROVE", "REVIEW", "REJECT"]);

function enforceDecisionVerdict(
  rawVerdict: string | null | undefined,
  fraudScore: number,
  confidenceScore: number,
  corrections: ValidationCorrection[]
): { verdict: "APPROVE" | "REVIEW" | "REJECT"; label: string } {
  // Map pipeline recommendation strings to the three allowed verdicts
  const VERDICT_MAP: Record<string, "APPROVE" | "REVIEW" | "REJECT"> = {
    "APPROVE": "APPROVE",
    "APPROVE_WITH_CONDITIONS": "REVIEW",
    "REVIEW": "REVIEW",
    "REVIEW_REQUIRED": "REVIEW",
    "ESCALATE_INVESTIGATION": "REJECT",
    "REJECT": "REJECT",
    "FINALISE_CLAIM": "APPROVE",
    "MANUAL_REVIEW": "REVIEW",
    "FLAG_FOR_INVESTIGATION": "REJECT",
    "HIGH_CONFIDENCE_APPROVE": "APPROVE",
  };

  const upper = (rawVerdict ?? "").toUpperCase().replace(/\s+/g, "_");
  let mapped: "APPROVE" | "REVIEW" | "REJECT" = VERDICT_MAP[upper] ?? "REVIEW";

  // Override: if fraud score > 60, force REJECT
  if (fraudScore > 60 && mapped === "APPROVE") {
    corrections.push({
      rule: 7,
      field: "decisionVerdict",
      original: mapped,
      corrected: "REJECT",
      reason: `Fraud score ${fraudScore} > 60 — verdict overridden to REJECT`,
    });
    mapped = "REJECT";
  }

  // Override: if confidence < 40, force REVIEW
  if (confidenceScore < 40 && mapped === "APPROVE") {
    corrections.push({
      rule: 7,
      field: "decisionVerdict",
      original: mapped,
      corrected: "REVIEW",
      reason: `Confidence ${confidenceScore} < 40 — verdict overridden to REVIEW`,
    });
    mapped = "REVIEW";
  }

  if (rawVerdict && !VALID_VERDICTS.has(upper) && VERDICT_MAP[upper]) {
    corrections.push({
      rule: 7,
      field: "decisionVerdict",
      original: rawVerdict,
      corrected: mapped,
      reason: `Non-standard verdict "${rawVerdict}" mapped to "${mapped}"`,
    });
  }

  const LABELS: Record<"APPROVE" | "REVIEW" | "REJECT", string> = {
    APPROVE: "Approve",
    REVIEW: "Review Required",
    REJECT: "Reject / Escalate",
  };

  return { verdict: mapped, label: LABELS[mapped] };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 8: CONFIDENCE GATING
// ─────────────────────────────────────────────────────────────────────────────

const CONFIDENCE_GATE = 60;

function applyConfidenceGating(params: {
  confidenceScore: number;
  suppressed: string[];
  flags: ValidationFlag[];
}): boolean {
  const { confidenceScore, suppressed, flags } = params;

  if (confidenceScore < CONFIDENCE_GATE) {
    flags.push({
      rule: 8,
      field: "overallConfidence",
      flag: "low_confidence",
      severity: confidenceScore < 30 ? "critical" : "warning",
      message: `Overall confidence ${confidenceScore}/100 is below the ${CONFIDENCE_GATE} threshold — high-uncertainty fields suppressed`,
    });
    return true; // gated
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 9: DATA COMPLETENESS CHECK
// ─────────────────────────────────────────────────────────────────────────────

const CRITICAL_FIELDS = ["panelBeaterName", "costBasis", "accidentType"] as const;

function checkCompleteness(params: {
  panelBeaterName: string | null;
  costBasis: string | null;
  accidentType: string | null;
  flags: ValidationFlag[];
}): { isComplete: boolean; missingFields: string[] } {
  const missing: string[] = [];

  if (!params.panelBeaterName) missing.push("panel_beater");
  if (!params.costBasis) missing.push("cost_basis");
  if (!params.accidentType) missing.push("accident_type");

  if (missing.length > 0) {
    params.flags.push({
      rule: 9,
      field: "completeness",
      flag: "INCOMPLETE",
      severity: missing.length >= 2 ? "critical" : "warning",
      message: `Output marked INCOMPLETE — missing critical fields: ${missing.join(", ")}. Do not present as final decision.`,
    });
  }

  return { isComplete: missing.length === 0, missingFields: missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 10: NEVER INVENT DATA
// ─────────────────────────────────────────────────────────────────────────────

function safeString(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "" || value === "null" || value === "undefined") {
    return null;
  }
  return value;
}

function safeNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || isNaN(value as number) || !isFinite(value as number)) {
    return null;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationEngineInput {
  claimId: number;
  claimNumber: string | null;

  // Raw pipeline outputs
  rawVerdict: string | null;
  confidenceScore: number;
  fraudScore: number;
  fraudLevel: string | null;

  // Cost fields
  aiEstimateUsd: number | null;
  documentedOriginalQuoteUsd: number | null;
  documentedAgreedCostUsd: number | null;
  costBasis: string | null;

  // Panel beater sources
  panelBeaterFromCostIntel: string | null;
  panelBeaterFromAssessor: string | null;
  repairerName: string | null;

  // Accident description
  accidentDescription: string | null;

  // Image processing
  imageUrls: string[];
  imageProcessingRan: boolean;
  damagedComponents: string[];

  // Physics
  physicsExecuted: boolean;
  impactSpeedKmh: number | null;
  impactForceKn: number | null;
  severityClassification: string | null;
  hasVectors: boolean;

  // Accident type (for completeness check)
  accidentType: string | null;

  // Pass-through
  structuralDamage: boolean;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleRegistration: string | null;
  accidentDate: string | null;
  accidentLocation: string | null;
}

export function runOutputValidation(input: ValidationEngineInput): OutputValidationResult {
  const corrections: ValidationCorrection[] = [];
  const suppressed: string[] = [];
  const flags: ValidationFlag[] = [];

  // ── Rule 10: sanitise all inputs first (never invent data) ─────────────────
  const claimNumber = safeString(input.claimNumber);
  const vehicleMake = safeString(input.vehicleMake);
  const vehicleModel = safeString(input.vehicleModel);
  const vehicleYear = safeNumber(input.vehicleYear);
  const vehicleRegistration = safeString(input.vehicleRegistration);
  const accidentDate = safeString(input.accidentDate);
  const accidentLocation = safeString(input.accidentLocation);
  const accidentType = safeString(input.accidentType);
  const fraudLevel = safeString(input.fraudLevel) ?? "unknown";
  const confidenceScore = safeNumber(input.confidenceScore) ?? 0;
  const fraudScore = safeNumber(input.fraudScore) ?? 0;

  // ── Rule 1: Terminology validation ────────────────────────────────────────
  const rawAccidentDesc = validateTerminology(input.accidentDescription, "accidentDescription", corrections);
  const rawCostBasis = validateTerminology(input.costBasis, "costBasis", corrections);
  const rawFraudLevel = validateTerminology(fraudLevel, "fraudLevel", corrections);

  // ── Rule 4: Accident description sanity ───────────────────────────────────
  const { text: accidentDescription, sanitised: accidentDescriptionSanitised } =
    sanitiseAccidentDescription(rawAccidentDesc, corrections);

  // ── Rule 8: Confidence gating ──────────────────────────────────────────────
  const confidenceGated = applyConfidenceGating({ confidenceScore, suppressed, flags });

  // ── Rule 2: Cost governance ────────────────────────────────────────────────
  const {
    aiEstimateUsd,
    suppressed: aiEstimateSuppressed,
    suppressReason: aiEstimateSuppressReason,
    quoteOptimisationUsd,
  } = validateCost({
    aiEstimateUsd: safeNumber(input.aiEstimateUsd),
    documentedOriginalQuoteUsd: safeNumber(input.documentedOriginalQuoteUsd),
    documentedAgreedCostUsd: safeNumber(input.documentedAgreedCostUsd),
    confidenceScore,
    corrections,
    suppressed,
  });

  // ── Rule 3: Panel beater extraction ───────────────────────────────────────
  const { name: panelBeaterName, source: panelBeaterSource } = extractPanelBeater({
    panelBeaterFromCostIntel: safeString(input.panelBeaterFromCostIntel),
    panelBeaterFromAssessor: safeString(input.panelBeaterFromAssessor),
    repairerName: safeString(input.repairerName),
    corrections,
  });

  // ── Rule 5: Image processing visibility ───────────────────────────────────
  const {
    imageCount,
    status: imageProcessingStatus,
    flagMissing: imageProcessingFlag,
  } = checkImageProcessing({
    imageUrls: input.imageUrls ?? [],
    damagedComponents: input.damagedComponents ?? [],
    imageProcessingRan: input.imageProcessingRan,
    flags,
  });

  // ── Rule 6: Physics output visibility ─────────────────────────────────────
  const {
    impactSpeedKmh,
    impactForceKn,
    severityClassification,
    showVectors,
  } = validatePhysicsOutput({
    physicsExecuted: input.physicsExecuted,
    impactSpeedKmh: safeNumber(input.impactSpeedKmh),
    impactForceKn: safeNumber(input.impactForceKn),
    severityClassification: safeString(input.severityClassification),
    hasVectors: input.hasVectors,
    flags,
  });

  // ── Rule 7: UI status mapping ──────────────────────────────────────────────
  const { verdict: decisionVerdict, label: decisionLabel } = enforceDecisionVerdict(
    input.rawVerdict,
    fraudScore,
    confidenceScore,
    corrections
  );

  // ── Rule 9: Data completeness check ───────────────────────────────────────
  const { isComplete, missingFields: missingCriticalFields } = checkCompleteness({
    panelBeaterName,
    costBasis: rawCostBasis,
    accidentType,
    flags,
  });

  // ── Determine final status ─────────────────────────────────────────────────
  let status: ValidationStatus = "VALIDATED";
  if (suppressed.length > 0 || flags.some(f => f.flag === "INCOMPLETE")) {
    status = "SUPPRESSED";
  } else if (corrections.length > 0) {
    status = "CORRECTED";
  }

  // ── Build notes ────────────────────────────────────────────────────────────
  const notesParts: string[] = [];
  if (corrections.length > 0) notesParts.push(`${corrections.length} correction(s) applied`);
  if (suppressed.length > 0) notesParts.push(`${suppressed.length} field(s) suppressed`);
  if (flags.length > 0) notesParts.push(`${flags.length} flag(s) raised`);
  if (isComplete && corrections.length === 0 && suppressed.length === 0) notesParts.push("Output passed all validation rules");
  const notes = notesParts.join("; ") || "No issues detected";

  const final_output: ValidatedClaimOutput = {
    claimId: input.claimId,
    claimNumber,
    decisionVerdict,
    decisionLabel,
    overallConfidence: confidenceScore,
    confidenceGated,
    panelBeaterName,
    panelBeaterSource,
    aiEstimateUsd,
    aiEstimateSuppressed,
    aiEstimateSuppressReason,
    documentedOriginalQuoteUsd: safeNumber(input.documentedOriginalQuoteUsd),
    documentedAgreedCostUsd: safeNumber(input.documentedAgreedCostUsd),
    quoteOptimisationUsd,
    costBasis: rawCostBasis,
    accidentDescription,
    accidentDescriptionSanitised,
    imageCount,
    imageProcessingStatus,
    imageProcessingFlag,
    detectedDamageComponents: input.damagedComponents ?? [],
    physicsExecuted: input.physicsExecuted,
    impactSpeedKmh,
    impactForceKn,
    severityClassification,
    showVectors,
    isComplete,
    missingCriticalFields,
    terminologyCorrected: corrections.some(c => c.rule === 1),
    fraudScore,
    fraudLevel: rawFraudLevel ?? "unknown",
    structuralDamage: input.structuralDamage ?? false,
    damagedComponents: input.damagedComponents ?? [],
    vehicleMake,
    vehicleModel,
    vehicleYear,
    vehicleRegistration,
    accidentDate,
    accidentLocation,
    accidentType,
  };

  return {
    status,
    corrections,
    suppressed_fields: suppressed,
    flags,
    final_output,
    notes,
  };
}
