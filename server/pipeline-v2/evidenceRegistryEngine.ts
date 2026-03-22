/**
 * pipeline-v2/evidenceRegistryEngine.ts
 *
 * Evidence Registry Engine — Stage 0
 *
 * PURPOSE: Pure document inventory. This engine does NOT interpret, analyse,
 * or infer anything about the claim. Its sole responsibility is to catalogue
 * every piece of evidence present in the submitted document set and classify
 * each item strictly as PRESENT, ABSENT, or UNKNOWN.
 *
 * RULES:
 *   - Do NOT infer missing data.
 *   - Do NOT guess.
 *   - If unsure → mark UNKNOWN.
 *   - No analytical conclusions of any kind.
 *   - Output is a structured JSON registry consumed by all downstream stages.
 *
 * INTEGRATION:
 *   - Runs immediately after Stage 1 (document ingestion).
 *   - Receives Stage1Output + Stage2Output (raw text) as inputs.
 *   - Produces EvidenceRegistry stored on the pipeline context.
 *   - The Decision Readiness Gate (Stage 10 pre-check) uses this registry
 *     to enforce the minimum evidence set before a recommendation is generated.
 */

import type { Stage1Output, Stage2Output } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceStatus = "PRESENT" | "ABSENT" | "UNKNOWN";

export interface DocumentSummary {
  total_pages: number;
  has_images: boolean;
  estimated_image_pages: number;
  total_documents: number;
  document_types_detected: string[];
}

export interface EvidenceItems {
  /** Motor claim form or equivalent structured claim submission */
  claim_form: EvidenceStatus;
  /** Driver's own narrative statement describing the incident */
  driver_statement: EvidenceStatus;
  /** Incident details: date, time, location, circumstances */
  incident_details: EvidenceStatus;
  /** Vehicle details: make, model, year, registration */
  vehicle_details: EvidenceStatus;
  /** At least one repair quotation from a panel beater or repairer */
  repair_quote: EvidenceStatus;
  /** More than one repair quotation (for comparison) */
  multi_quotes: EvidenceStatus;
  /** Assessor's report or loss adjuster's findings */
  assessor_report: EvidenceStatus;
  /** Damage photographs of the vehicle */
  damage_photos: EvidenceStatus;
  /** Police report reference, report number, or confirmation of police notification */
  police_report_info: EvidenceStatus;
  /** Digital or wet signature confirming document authorisation */
  digital_signature: EvidenceStatus;
}

export interface EvidenceRegistry {
  document_summary: DocumentSummary;
  evidence_registry: EvidenceItems;
  /** Minimum evidence set check for motor claims */
  completeness_check: CompletenessCheck;
  notes: string[];
  /** ISO timestamp of when the registry was built */
  registry_built_at: string;
}

export interface CompletenessCheck {
  /** Whether the minimum evidence set for a motor claim is satisfied */
  minimum_set_satisfied: boolean;
  /** Items from the minimum set that are ABSENT */
  missing_mandatory_items: string[];
  /** Items that are UNKNOWN and require clarification */
  unknown_items: string[];
  /** Recommended action before pipeline proceeds */
  recommended_action: "PROCEED" | "REQUEST_MISSING_EVIDENCE" | "MANUAL_REVIEW";
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTION PATTERNS
// These are keyword/phrase sets used to detect evidence presence in raw text.
// They are intentionally broad — the goal is to detect presence, not extract values.
// ─────────────────────────────────────────────────────────────────────────────

const CLAIM_FORM_PATTERNS = [
  /claim\s*(form|number|ref|reference|no\.?)/i,
  /policy\s*(number|no\.?|holder)/i,
  /insured\s*(name|party)/i,
  /claimant/i,
  /motor\s*claim/i,
  /claim\s*details/i,
  /section\s*[a-z0-9]/i,
  /date\s*of\s*(accident|loss|incident)/i,
  /nature\s*of\s*(loss|claim|damage)/i,
];

const DRIVER_STATEMENT_PATTERNS = [
  /i\s+was\s+(driving|travelling|traveling)/i,
  /driver('s)?\s*(statement|narrative|account|description)/i,
  /as\s+i\s+was/i,
  /i\s+(tried|attempted|could not|could't)/i,
  /the\s+(vehicle|car|truck|bakkie)\s+(was|hit|struck|collided)/i,
  /i\s+immediately/i,
  /i\s+(reported|notified|called)/i,
  /what\s+happened/i,
  /circumstances\s*of\s*(the\s*)?(accident|incident|loss)/i,
];

const INCIDENT_DETAILS_PATTERNS = [
  /date\s*of\s*(accident|incident|loss|event)/i,
  /time\s*of\s*(accident|incident|loss|event)/i,
  /place\s*of\s*(accident|incident|loss)/i,
  /location\s*of\s*(accident|incident|loss)/i,
  /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,  // date pattern
  /\d{1,2}:\d{2}/,                         // time pattern
  /km\s*peg/i,
  /road\s*(name|number|between)/i,
  /harare|bulawayo|beitbridge|mutare|gweru|masvingo|kwekwe/i,
  /highway|road|street|avenue|route/i,
];

const VEHICLE_DETAILS_PATTERNS = [
  /vehicle\s*(make|model|year|registration|reg\.?|vin|chassis)/i,
  /make\s*[:\-]/i,
  /model\s*[:\-]/i,
  /reg(istration)?\s*(no\.?|number|plate)/i,
  /engine\s*(number|no\.?)/i,
  /chassis\s*(number|no\.?)/i,
  /colour\s*[:\-]/i,
  /year\s*of\s*(manufacture|registration)/i,
  /\b(mazda|toyota|ford|nissan|isuzu|mitsubishi|honda|hyundai|volkswagen|vw|bmw|mercedes|land\s*rover|range\s*rover)\b/i,
];

const REPAIR_QUOTE_PATTERNS = [
  /quotation/i,
  /quote\s*(no\.?|number|ref)/i,
  /panel\s*beat(er|ing)/i,
  /repair\s*(cost|estimate|quote|total)/i,
  /parts\s*(cost|total|subtotal)/i,
  /labour\s*(cost|total|hours|rate)/i,
  /total\s*(incl\.?|excl\.?|amount)/i,
  /supply\s+and\s+(fit|install|replace)/i,
  /r&r|remove\s*(&|and)\s*(refit|replace)/i,
  /skinners|panel\s*shop|body\s*shop|auto\s*body/i,
];

const MULTI_QUOTE_PATTERNS = [
  /quote\s*[23456789]/i,
  /second\s*quote/i,
  /alternative\s*quote/i,
  /comparison\s*of\s*quotes/i,
  /quotation\s*[23456789]/i,
  /panel\s*beater\s*[23456789]/i,
];

const ASSESSOR_PATTERNS = [
  /assessor/i,
  /loss\s*adjuster/i,
  /surveyor/i,
  /inspection\s*(report|date|by)/i,
  /assessed\s*(by|value|cost)/i,
  /agreed\s*(cost|amount|value)/i,
  /cost\s*agreed/i,
  /creative\s*risk/i,
  /clarance|clarence/i,
  /garatsa/i,
  /risk\s*manager/i,
  /authoris(e|z)/i,
];

const DAMAGE_PHOTO_PATTERNS = [
  /photo(graph)?s?\s*(of|showing|attached)/i,
  /image[s]?\s*(of|showing|attached)/i,
  /picture[s]?\s*(of|showing|attached)/i,
  /damage\s*(photo|image|picture)/i,
  /see\s*(attached|enclosed)\s*(photo|image|picture)/i,
  /visual\s*(evidence|documentation)/i,
];

const POLICE_REPORT_PATTERNS = [
  /police\s*(report|reference|case|number|no\.?|station)/i,
  /reported\s*(to|at)\s*(the\s*)?police/i,
  /police\s*(were|was)\s*(notified|informed|called)/i,
  /cr\s*(number|no\.?)/i,
  /case\s*(number|no\.?|ref)/i,
  /traffic\s*(police|officer|report)/i,
  /zrp|zimbabwe\s*republic\s*police/i,
  /immediately\s*reported/i,
];

const DIGITAL_SIGNATURE_PATTERNS = [
  /signed\s*(by|on|at)/i,
  /signature/i,
  /signeasy|docusign|adobe\s*sign|hellosign/i,
  /electronically\s*signed/i,
  /digital\s*(signature|certificate)/i,
  /audit\s*trail/i,
  /fingerprint\s*[:\-]/i,
  /verification\s*link/i,
  /signed\s*on\s*\d/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// CORE DETECTION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function detectPresence(text: string, patterns: RegExp[]): EvidenceStatus {
  if (!text || text.trim().length === 0) return "UNKNOWN";
  const matched = patterns.some((p) => p.test(text));
  return matched ? "PRESENT" : "ABSENT";
}

/**
 * Detect evidence across ALL extracted texts combined.
 * Returns PRESENT if any document in the set contains the pattern.
 */
function detectAcrossTexts(
  allTexts: string[],
  patterns: RegExp[]
): EvidenceStatus {
  if (allTexts.length === 0) return "UNKNOWN";
  const combined = allTexts.join("\n");
  if (combined.trim().length === 0) return "UNKNOWN";
  return detectPresence(combined, patterns);
}

/**
 * Detect multi-quote presence: requires either the multi-quote patterns
 * OR evidence of two or more distinct quotation blocks in the text.
 */
function detectMultiQuotes(allTexts: string[]): EvidenceStatus {
  if (allTexts.length === 0) return "UNKNOWN";
  const combined = allTexts.join("\n");
  if (combined.trim().length === 0) return "UNKNOWN";

  // Check explicit multi-quote patterns
  if (MULTI_QUOTE_PATTERNS.some((p) => p.test(combined))) return "PRESENT";

  // Count distinct quotation blocks: look for multiple "Quotation No" or "Quote No" occurrences
  const quotationMatches = combined.match(/quotation\s*(no\.?|number)/gi);
  if (quotationMatches && quotationMatches.length >= 2) return "PRESENT";

  // Count distinct panel beater names in quote context
  const panelBeaterMatches = combined.match(/panel\s*beat(er|ing)/gi);
  if (panelBeaterMatches && panelBeaterMatches.length >= 2) return "PRESENT";

  return "ABSENT";
}

/**
 * Detect damage photos: checks both image metadata from Stage 1
 * AND text references to photographs in Stage 2.
 */
function detectDamagePhotos(
  stage1: Stage1Output,
  allTexts: string[]
): EvidenceStatus {
  // Primary: Stage 1 image metadata — most reliable signal
  const hasImages = stage1.documents.some(
    (doc) => doc.containsImages && doc.imageUrls && doc.imageUrls.length > 0
  );
  if (hasImages) return "PRESENT";

  // Secondary: text references to photos
  const textSignal = detectAcrossTexts(allTexts, DAMAGE_PHOTO_PATTERNS);
  if (textSignal === "PRESENT") return "PRESENT";

  // If Stage 1 ran but found no images and text has no photo references → ABSENT
  if (stage1.documents.length > 0) return "ABSENT";

  // Stage 1 produced no documents at all → cannot determine
  return "UNKNOWN";
}

/**
 * Count estimated image pages across all documents.
 */
function countImagePages(stage1: Stage1Output): number {
  return stage1.documents.reduce((total, doc) => {
    return total + (doc.imageUrls?.length ?? 0);
  }, 0);
}

/**
 * Detect digital signature: checks for Signeasy/DocuSign audit trail patterns
 * and explicit signature blocks.
 */
function detectDigitalSignature(allTexts: string[]): EvidenceStatus {
  if (allTexts.length === 0) return "UNKNOWN";
  const combined = allTexts.join("\n");
  if (combined.trim().length === 0) return "UNKNOWN";

  // Strong signal: audit trail from known e-signature platforms
  const strongPatterns = [
    /signeasy/i,
    /docusign/i,
    /adobe\s*sign/i,
    /audit\s*trail/i,
    /fingerprint\s*[:\-]/i,
    /verification\s*link/i,
    /electronically\s*signed/i,
  ];
  if (strongPatterns.some((p) => p.test(combined))) return "PRESENT";

  // Weaker signal: generic signature language
  return detectPresence(combined, DIGITAL_SIGNATURE_PATTERNS);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETENESS CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum evidence set for a motor claim.
 * These items must be PRESENT before the pipeline may generate a recommendation.
 */
const MOTOR_CLAIM_MANDATORY_ITEMS: Array<keyof EvidenceItems> = [
  "claim_form",
  "driver_statement",
  "incident_details",
  "vehicle_details",
  "repair_quote",
  "damage_photos",
];

function buildCompletenessCheck(items: EvidenceItems): CompletenessCheck {
  const missingMandatory: string[] = [];
  const unknownItems: string[] = [];

  for (const key of MOTOR_CLAIM_MANDATORY_ITEMS) {
    const status = items[key];
    if (status === "ABSENT") missingMandatory.push(key);
    else if (status === "UNKNOWN") unknownItems.push(key);
  }

  const minimumSetSatisfied =
    missingMandatory.length === 0 && unknownItems.length === 0;

  let recommendedAction: CompletenessCheck["recommended_action"];
  if (minimumSetSatisfied) {
    recommendedAction = "PROCEED";
  } else if (missingMandatory.length > 0) {
    recommendedAction = "REQUEST_MISSING_EVIDENCE";
  } else {
    // Only UNKNOWN items — cannot confirm but cannot block
    recommendedAction = "MANUAL_REVIEW";
  }

  return {
    minimum_set_satisfied: minimumSetSatisfied,
    missing_mandatory_items: missingMandatory,
    unknown_items: unknownItems,
    recommended_action: recommendedAction,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTES BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildNotes(
  items: EvidenceItems,
  stage1: Stage1Output,
  completeness: CompletenessCheck
): string[] {
  const notes: string[] = [];

  if (stage1.totalDocuments === 0) {
    notes.push("No documents were ingested by Stage 1. All evidence items are UNKNOWN.");
    return notes;
  }

  if (items.damage_photos === "ABSENT") {
    notes.push(
      "No damage photographs were detected in the document set. " +
      "Photograph evidence is mandatory for motor claims. " +
      "Request photographic evidence before proceeding to analytical stages."
    );
  }

  if (items.damage_photos === "PRESENT") {
    const imagePageCount = countImagePages(stage1);
    if (imagePageCount > 0) {
      notes.push(
        `${imagePageCount} image page(s) detected across the document set. ` +
        "Image processing must be completed before physics and damage analysis stages run."
      );
    }
  }

  if (items.police_report_info === "ABSENT") {
    notes.push(
      "No police report reference or confirmation of police notification was detected. " +
      "Note: for animal strike incidents on rural roads, the absence of a formal police report " +
      "number is not necessarily anomalous. Verify incident type before treating this as a gap."
    );
  }

  if (items.multi_quotes === "ABSENT") {
    notes.push(
      "Only one repair quotation was detected. " +
      "A single quote limits the cost optimisation engine's ability to validate pricing. " +
      "Consider requesting a second quotation if the claim value is above the single-quote threshold."
    );
  }

  if (items.assessor_report === "ABSENT") {
    notes.push(
      "No assessor report was detected. " +
      "The cost decision engine will operate in PRE_ASSESSMENT mode " +
      "and will not be able to produce an APPROVE/REJECT recommendation."
    );
  }

  if (items.digital_signature === "ABSENT") {
    notes.push(
      "No digital or wet signature was detected. " +
      "Document authorisation status is unconfirmed."
    );
  }

  if (completeness.missing_mandatory_items.length > 0) {
    notes.push(
      `Missing mandatory evidence items: ${completeness.missing_mandatory_items.join(", ")}. ` +
      "The pipeline should not generate a final recommendation until these items are provided."
    );
  }

  if (completeness.unknown_items.length > 0) {
    notes.push(
      `Evidence status is UNKNOWN for: ${completeness.unknown_items.join(", ")}. ` +
      "Manual review is recommended to confirm or deny presence before proceeding."
    );
  }

  return notes;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Evidence Registry from Stage 1 and Stage 2 outputs.
 *
 * This function is deterministic and synchronous. It does not call any
 * external service, does not perform any inference, and does not modify
 * any pipeline state. It only reads and classifies.
 *
 * @param stage1 - Document ingestion output (metadata, image URLs)
 * @param stage2 - OCR/text extraction output (raw text per document)
 * @returns EvidenceRegistry — the complete inventory of available evidence
 */
export function buildEvidenceRegistry(
  stage1: Stage1Output,
  stage2: Stage2Output | null
): EvidenceRegistry {
  // Collect all raw texts for cross-document pattern matching
  const allTexts: string[] = (stage2?.extractedTexts ?? []).map(
    (et) => et.rawText ?? ""
  );

  // Document summary
  const hasImages = stage1.documents.some(
    (doc) => doc.containsImages && doc.imageUrls && doc.imageUrls.length > 0
  );
  const imagePageCount = countImagePages(stage1);
  const documentTypesDetected = Array.from(
    new Set(stage1.documents.map((d) => d.documentType))
  );

  const documentSummary: DocumentSummary = {
    total_pages: stage2?.totalPagesProcessed ?? stage1.totalDocuments,
    has_images: hasImages,
    estimated_image_pages: imagePageCount,
    total_documents: stage1.totalDocuments,
    document_types_detected: documentTypesDetected,
  };

  // Evidence classification — pure pattern matching, no inference
  const evidenceItems: EvidenceItems = {
    claim_form: detectAcrossTexts(allTexts, CLAIM_FORM_PATTERNS),
    driver_statement: detectAcrossTexts(allTexts, DRIVER_STATEMENT_PATTERNS),
    incident_details: detectAcrossTexts(allTexts, INCIDENT_DETAILS_PATTERNS),
    vehicle_details: detectAcrossTexts(allTexts, VEHICLE_DETAILS_PATTERNS),
    repair_quote: detectAcrossTexts(allTexts, REPAIR_QUOTE_PATTERNS),
    multi_quotes: detectMultiQuotes(allTexts),
    assessor_report: detectAcrossTexts(allTexts, ASSESSOR_PATTERNS),
    damage_photos: detectDamagePhotos(stage1, allTexts),
    police_report_info: detectAcrossTexts(allTexts, POLICE_REPORT_PATTERNS),
    digital_signature: detectDigitalSignature(allTexts),
  };

  // Completeness check
  const completenessCheck = buildCompletenessCheck(evidenceItems);

  // Notes
  const notes = buildNotes(evidenceItems, stage1, completenessCheck);

  return {
    document_summary: documentSummary,
    evidence_registry: evidenceItems,
    completeness_check: completenessCheck,
    notes,
    registry_built_at: new Date().toISOString(),
  };
}

/**
 * Serialise the registry to the exact JSON schema specified in the
 * Evidence Registry Engine contract. Used for API responses and report output.
 */
export function serialiseRegistry(registry: EvidenceRegistry): {
  document_summary: {
    total_pages: number;
    has_images: boolean;
    estimated_image_pages: number;
  };
  evidence_registry: Record<keyof EvidenceItems, EvidenceStatus>;
  notes: string[];
} {
  return {
    document_summary: {
      total_pages: registry.document_summary.total_pages,
      has_images: registry.document_summary.has_images,
      estimated_image_pages: registry.document_summary.estimated_image_pages,
    },
    evidence_registry: { ...registry.evidence_registry },
    notes: registry.notes,
  };
}
