/**
 * Phase 1 – Data Integrity & Sanitisation Gate
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is the mandatory pre-processing gate that runs BEFORE any report
 * generation, normalisation, or analytical engine.  It performs five sequential
 * checks and returns a fully validated, sanitised, and normalised data packet.
 *
 * Gates (in execution order):
 *   G1 – Temporal Integrity       (date validation & ordering)
 *   G2 – Cost Mathematical Reconciliation (parts + labour vs total)
 *   G3 – Currency Unit Auto-Correction    (cents/dollars unit shift)
 *   G4 – String Sanitisation              (strip internal artefacts)
 *   G5 – Terminology Normalisation        (locale-aware vocabulary)
 *
 * This module has NO side effects and NO database calls.
 * It is a pure transformation layer that can be tested in isolation.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type GateStatus = 'PASS' | 'WARN' | 'BLOCK';

export interface GateResult {
  gate: string;
  status: GateStatus;
  message: string;
  /** Auto-corrections applied (for audit trail) */
  corrections: string[];
}

export interface Phase1Input {
  // Claim identity
  claimNumber?: string | null;
  vehicleRegistration?: string | null;

  // Dates (ISO strings or null)
  incidentDate?: string | null;
  inspectionDate?: string | null;
  reportGenerationDate?: string | null; // defaults to now() if omitted

  // Cost fields (in dollars unless otherwise noted)
  repairerQuoteTotal?: number | null;
  partsCost?: number | null;
  labourCost?: number | null;
  aiEstimatedTotal?: number | null;

  // Photo / document flags
  photosDetected?: boolean | null;
  photosProcessed?: boolean | null;
  photosProcessedCount?: number | null;

  // Incident description (free text from claim form)
  incidentDescription?: string | null;
  incidentType?: string | null;         // already-classified type (may be null or 'N/A')

  // Police report
  policeReportNumber?: string | null;

  // Locale for terminology normalisation (default: 'en')
  locale?: string | null;

  // Arbitrary text fields to sanitise (key → value)
  textFields?: Record<string, string | null | undefined>;
}

export interface Phase1Output {
  /** Whether the full gate suite passed (BLOCK = report must not be generated) */
  overallStatus: GateStatus;

  /** Per-gate results for the audit trail */
  gates: GateResult[];

  /** All auto-corrections applied across all gates (for the audit footer) */
  allCorrections: string[];

  // ── Validated & normalised values ──────────────────────────────────────────

  /** Validated incident date in YYYY-MM-DD or null */
  incidentDate: string | null;
  /** Validated inspection date in YYYY-MM-DD or null */
  inspectionDate: string | null;
  /** Report generation timestamp (UTC ISO) */
  reportGenerationDate: string;

  /** Authoritative total cost in USD after reconciliation */
  authoritativeTotalUsd: number | null;
  /** Parts cost in USD after unit correction */
  partsUsd: number | null;
  /** Labour cost in USD after unit correction */
  labourUsd: number | null;
  /** Repairer quote in USD after unit correction */
  repairerQuoteUsd: number | null;
  /** AI estimated total in USD after unit correction */
  aiEstimatedUsd: number | null;
  /** True if parts + labour did not reconcile with the stored total */
  costReconciliationError: boolean;

  /** Resolved incident type (never 'N/A' if source text provides a match) */
  incidentType: string | null;

  /** Human-readable photo status message */
  photoStatusMessage: string;

  /** Sanitised text fields (same keys as input.textFields) */
  sanitisedTextFields: Record<string, string>;

  /** Locale used for terminology normalisation */
  locale: string;
}

// ── G1 – Temporal Integrity ───────────────────────────────────────────────────

function toYMD(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Accept ISO strings, timestamps, and common date strings
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function runG1(input: Phase1Input): { result: GateResult; incidentDate: string | null; inspectionDate: string | null; reportGenerationDate: string } {
  const corrections: string[] = [];
  const todayUTC = new Date().toISOString().slice(0, 10);

  const incidentDate = toYMD(input.incidentDate);
  const inspectionDate = toYMD(input.inspectionDate);
  const reportGenerationDate = toYMD(input.reportGenerationDate) ?? new Date().toISOString().slice(0, 19) + 'Z';

  // Check 1: Incident date in future
  if (incidentDate && incidentDate > todayUTC) {
    return {
      result: { gate: 'G1_TEMPORAL', status: 'BLOCK', message: `Incident date ${incidentDate} is in the future (today: ${todayUTC}). Report generation blocked.`, corrections },
      incidentDate,
      inspectionDate,
      reportGenerationDate,
    };
  }

  // Check 2: Inspection precedes incident
  if (incidentDate && inspectionDate && inspectionDate < incidentDate) {
    return {
      result: { gate: 'G1_TEMPORAL', status: 'BLOCK', message: `Inspection date ${inspectionDate} precedes incident date ${incidentDate}. Report generation blocked.`, corrections },
      incidentDate,
      inspectionDate,
      reportGenerationDate,
    };
  }

  // Check 3: System clock drift (report date > 1 day in future)
  const reportDate = toYMD(reportGenerationDate);
  if (reportDate && reportDate > todayUTC) {
    const diffDays = Math.round((new Date(reportDate).getTime() - new Date(todayUTC).getTime()) / 86400000);
    if (diffDays > 1) {
      return {
        result: { gate: 'G1_TEMPORAL', status: 'BLOCK', message: `System clock error: report generation date ${reportDate} is ${diffDays} day(s) ahead of today. Report generation blocked.`, corrections },
        incidentDate,
        inspectionDate,
        reportGenerationDate,
      };
    }
  }

  // Advisory: inspection date missing on a complete claim
  let status: GateStatus = 'PASS';
  let message = 'All temporal checks passed.';
  if (!inspectionDate) {
    status = 'WARN';
    message = 'Inspection date is not recorded. This is acceptable for some claim types (e.g., total loss write-offs) but should be confirmed.';
  }

  return {
    result: { gate: 'G1_TEMPORAL', status, message, corrections },
    incidentDate,
    inspectionDate,
    reportGenerationDate,
  };
}

// ── G3 – Currency Unit Auto-Correction (runs before G2 to normalise inputs) ──

const VEHICLE_REPAIR_MAX_PLAUSIBLE_USD = 150_000; // above this, likely a data error
const SINGLE_COMPONENT_MAX_PLAUSIBLE_USD = 30_000;

/**
 * Detect and correct common unit-shift errors in cost values.
 * Improvement: lower threshold is 1.00 (not 10.00) to avoid false corrections
 * on legitimate sub-$10 labour items.  Scoped to parts and quote only for the
 * sub-$1 check; labour uses a separate threshold of $0.50.
 */
function correctCostUnit(
  value: number | null | undefined,
  fieldName: string,
  corrections: string[],
): number | null {
  if (value == null || isNaN(Number(value))) return null;
  let v = Number(value);

  // Under-scale: value looks like cents (< $1.00 for parts/quote, < $0.50 for labour)
  const isLabour = fieldName.toLowerCase().includes('labour') || fieldName.toLowerCase().includes('labor');
  const underThreshold = isLabour ? 0.50 : 1.00;
  if (v > 0 && v < underThreshold) {
    const corrected = Math.round(v * 100 * 100) / 100;
    corrections.push(`G3_UNIT_CORRECTION [${fieldName}]: Normalised cents to dollars: ${v} → ${corrected}`);
    v = corrected;
  }

  // Over-scale: single value implausibly large (likely stored in cents)
  if (v > VEHICLE_REPAIR_MAX_PLAUSIBLE_USD) {
    const corrected = Math.round((v / 100) * 100) / 100;
    corrections.push(`G3_UNIT_CORRECTION [${fieldName}]: Normalised over-scaled value: ${v} → ${corrected}`);
    v = corrected;
  }

  return v > 0 ? v : null;
}

function runG3(input: Phase1Input): {
  result: GateResult;
  partsUsd: number | null;
  labourUsd: number | null;
  repairerQuoteUsd: number | null;
  aiEstimatedUsd: number | null;
} {
  const corrections: string[] = [];

  const partsUsd = correctCostUnit(input.partsCost, 'partsCost', corrections);
  const labourUsd = correctCostUnit(input.labourCost, 'labourCost', corrections);
  const repairerQuoteUsd = correctCostUnit(input.repairerQuoteTotal, 'repairerQuoteTotal', corrections);
  const aiEstimatedUsd = correctCostUnit(input.aiEstimatedTotal, 'aiEstimatedTotal', corrections);

  const status: GateStatus = corrections.length > 0 ? 'WARN' : 'PASS';
  const message = corrections.length > 0
    ? `${corrections.length} cost unit correction(s) applied. See corrections log.`
    : 'All cost values are within plausible ranges. No unit corrections required.';

  return {
    result: { gate: 'G3_UNIT_CORRECTION', status, message, corrections },
    partsUsd,
    labourUsd,
    repairerQuoteUsd,
    aiEstimatedUsd,
  };
}

// ── G2 – Cost Mathematical Reconciliation ────────────────────────────────────

function runG2(
  partsUsd: number | null,
  labourUsd: number | null,
  repairerQuoteUsd: number | null,
  aiEstimatedUsd: number | null,
): { result: GateResult; authoritativeTotalUsd: number | null; costReconciliationError: boolean } {
  const corrections: string[] = [];

  const hasBreakdown = partsUsd != null && labourUsd != null;
  const calculatedTotal = hasBreakdown ? Math.round((partsUsd! + labourUsd!) * 100) / 100 : null;

  // Determine the stored total to reconcile against (prefer repairer quote, then AI estimate)
  const storedTotal = repairerQuoteUsd ?? aiEstimatedUsd;

  let costReconciliationError = false;
  let authoritativeTotalUsd: number | null = null;

  if (calculatedTotal != null && storedTotal != null) {
    const lower = storedTotal * 0.95;
    const upper = storedTotal * 1.05;

    if (calculatedTotal < lower || calculatedTotal > upper) {
      costReconciliationError = true;
      authoritativeTotalUsd = Math.max(calculatedTotal, storedTotal);
      const diff = Math.abs(calculatedTotal - storedTotal).toFixed(2);
      corrections.push(
        `G2_COST_RECONCILIATION: Parts+Labour = $${calculatedTotal} ≠ Stored Total $${storedTotal} (diff: $${diff}). ` +
        `Authoritative total set to $${authoritativeTotalUsd} (max of both).`
      );
    } else {
      // Within tolerance — use calculated total as it is more granular
      authoritativeTotalUsd = calculatedTotal;
    }
  } else if (calculatedTotal != null) {
    authoritativeTotalUsd = calculatedTotal;
  } else if (storedTotal != null) {
    authoritativeTotalUsd = storedTotal;
  }

  const status: GateStatus = costReconciliationError ? 'WARN' : 'PASS';
  const message = costReconciliationError
    ? `Cost reconciliation error detected. Parts ($${partsUsd}) + Labour ($${labourUsd}) = $${calculatedTotal}, which differs from stored total ($${storedTotal}) by more than 5%. Authoritative total: $${authoritativeTotalUsd}.`
    : authoritativeTotalUsd != null
      ? `Cost reconciliation passed. Authoritative total: $${authoritativeTotalUsd}.`
      : 'Insufficient cost data for reconciliation check.';

  return {
    result: { gate: 'G2_COST_RECONCILIATION', status, message, corrections },
    authoritativeTotalUsd,
    costReconciliationError,
  };
}

// ── G4 – String Sanitisation ─────────────────────────────────────────────────

/** Patterns that represent internal pipeline artefacts leaking into user-facing text */
const SANITISATION_RULES: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  // Internal conflict markers from AI pipeline
  { pattern: /CONFLICT\s+Dimension\s+\d+\s+\d+\s*(?:CONFLICT)?/gi, replacement: '', label: 'CONFLICT_MARKER' },
  { pattern: /END_CONFLICT/gi, replacement: '', label: 'END_CONFLICT_MARKER' },

  // XML/JSON fragments
  { pattern: /<\?xml[^>]*\?>/gi, replacement: '', label: 'XML_DECLARATION' },
  { pattern: /<xml[^>]*>[\s\S]*?<\/xml>/gi, replacement: '', label: 'XML_BLOCK' },
  { pattern: /JSON_FRAGMENT_\w+/g, replacement: '', label: 'JSON_FRAGMENT_MARKER' },

  // LLM instruction tags that may leak from prompt templates
  { pattern: /\[INST\][\s\S]*?\[\/INST\]/gi, replacement: '', label: 'LLM_INST_TAG' },
  { pattern: /<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, replacement: '', label: 'LLM_CHAT_TAG' },

  // Malformed URLs (spaces or hyphens mid-URL)
  { pattern: /https?:\/\/\S+[\s\-]\S+/g, replacement: '[URL removed]', label: 'MALFORMED_URL' },

  // Raw flag strings that should never be shown to users
  { pattern: /\bphotos_not_ingested\b/g, replacement: 'Photos available – manual review required', label: 'PHOTOS_FLAG' },
  { pattern: /\bingestion_failure\b/g, replacement: 'Data extraction incomplete', label: 'INGESTION_FLAG' },
  { pattern: /\bdescription_not_mapped\b/g, replacement: 'Description could not be classified', label: 'DESCRIPTION_FLAG' },

  // Interactive UI strings that are invalid in static/PDF context
  { pattern: /\bRun Now\b/g, replacement: 'Analysis Pending', label: 'RUN_NOW_BUTTON' },
  { pattern: /\bHover or click\b/gi, replacement: 'See details below', label: 'HOVER_CLICK' },
  { pattern: /\bClick to expand\b/gi, replacement: '(Expandable section)', label: 'CLICK_EXPAND' },

  // Trailing whitespace / double spaces from removals
  { pattern: /[ \t]{2,}/g, replacement: ' ', label: 'WHITESPACE_NORMALISE' },
  { pattern: /\n{3,}/g, replacement: '\n\n', label: 'BLANK_LINE_NORMALISE' },
];

function sanitiseText(text: string, fieldName: string, corrections: string[]): string {
  let result = text;
  for (const rule of SANITISATION_RULES) {
    const before = result;
    result = result.replace(rule.pattern, rule.replacement);
    if (result !== before) {
      corrections.push(`G4_SANITISE [${fieldName}]: Removed/replaced pattern ${rule.label}`);
    }
  }
  return result.trim();
}

function runG4(textFields: Record<string, string | null | undefined>): {
  result: GateResult;
  sanitisedTextFields: Record<string, string>;
} {
  const corrections: string[] = [];
  const sanitisedTextFields: Record<string, string> = {};

  for (const [key, value] of Object.entries(textFields)) {
    if (value == null) {
      sanitisedTextFields[key] = '';
      continue;
    }
    sanitisedTextFields[key] = sanitiseText(String(value), key, corrections);
  }

  const status: GateStatus = corrections.length > 0 ? 'WARN' : 'PASS';
  const message = corrections.length > 0
    ? `${corrections.length} sanitisation correction(s) applied across ${Object.keys(textFields).length} text field(s).`
    : `All ${Object.keys(textFields).length} text field(s) are clean. No sanitisation required.`;

  return {
    result: { gate: 'G4_SANITISATION', status, message, corrections },
    sanitisedTextFields,
  };
}

// ── G5 – Terminology Normalisation ───────────────────────────────────────────

/**
 * Locale-aware terminology dictionary.
 * Default locale is 'en' (neutral professional insurance English).
 * Regional mappings are applied only when a specific locale is detected.
 *
 * Improvement: 'en-ZW' maps to neutral professional terms, not colloquialisms.
 * The 'hooters' → 'horn' correction is applied for all locales to ensure
 * professional output.
 */
const TERMINOLOGY_DICT: Record<string, Record<string, string>> = {
  'en': {
    // Enforce neutral professional terms regardless of locale
    'hooters': 'horn',
    'bonnet catch': 'hood latch',
    'fan cowling': 'radiator fan shroud',
    'boot lid': 'trunk lid',
    'wing mirror': 'side mirror',
    'tyre': 'tyre', // preserve ZW/UK spelling
    'windscreen': 'windscreen', // preserve ZW/UK spelling
  },
  'en-ZW': {
    // Zimbabwe English → professional insurance terms
    'hood': 'bonnet',
    'trunk': 'boot',
    'fender': 'wing',
    'windshield': 'windscreen',
    'turn signal': 'indicator',
    'parking lot': 'car park',
    // Colloquialism correction
    'hooters': 'horn',
  },
  'en-US': {
    // US English → neutral insurance terms
    'bonnet': 'hood',
    'boot': 'trunk',
    'wing': 'fender',
    'windscreen': 'windshield',
    'indicator': 'turn signal',
    'hooters': 'horn',
  },
  'en-ZA': {
    // South African English (similar to ZW)
    'hooters': 'horn',
    'bakkie': 'pickup truck',
    'tyre': 'tyre',
    'windscreen': 'windscreen',
  },
};

function detectLocale(input: Phase1Input): string {
  // Use explicit locale if provided and known
  if (input.locale && TERMINOLOGY_DICT[input.locale]) {
    return input.locale;
  }
  // Default to neutral 'en' — do not assume regional locale from claim origin
  // Regional mappings should only apply when explicitly confirmed
  return 'en';
}

function normaliseTerminology(text: string, locale: string, corrections: string[]): string {
  const dict = TERMINOLOGY_DICT[locale] ?? TERMINOLOGY_DICT['en'];
  let result = text;
  for (const [term, replacement] of Object.entries(dict)) {
    // Word-boundary aware replacement, case-insensitive
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const before = result;
    result = result.replace(pattern, (match) => {
      // Preserve original capitalisation pattern
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
    if (result !== before) {
      corrections.push(`G5_TERMINOLOGY [${locale}]: "${term}" → "${replacement}"`);
    }
  }
  return result;
}

function runG5(
  sanitisedTextFields: Record<string, string>,
  locale: string,
): { result: GateResult; normalisedTextFields: Record<string, string> } {
  const corrections: string[] = [];
  const normalisedTextFields: Record<string, string> = {};

  for (const [key, value] of Object.entries(sanitisedTextFields)) {
    normalisedTextFields[key] = normaliseTerminology(value, locale, corrections);
  }

  const status: GateStatus = corrections.length > 0 ? 'WARN' : 'PASS';
  const message = corrections.length > 0
    ? `${corrections.length} terminology normalisation(s) applied (locale: ${locale}).`
    : `No terminology corrections required (locale: ${locale}).`;

  return {
    result: { gate: 'G5_TERMINOLOGY', status, message, corrections },
    normalisedTextFields,
  };
}

// ── Incident Type Resolution (part of G1 / data completeness) ────────────────

/**
 * Keyword map for free-text incident type resolution.
 * Used when incidentType is null, empty, or 'N/A' after extraction.
 * Returns a structured incident_type string or null if no match.
 */
const INCIDENT_TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: 'animal_strike', keywords: ['hit an animal', 'animal strike', 'struck an animal', 'hit a cow', 'hit a goat', 'hit a dog', 'hit a deer', 'hit a kudu', 'hit a donkey', 'animal collision', 'livestock', 'wildlife', 'hit animal'] },
  { type: 'rear_end', keywords: ['rear-end', 'rear end', 'hit from behind', 'hit from the rear', 'rear collision', 'tailgated', 'ran into the back'] },
  { type: 'side_impact', keywords: ['side impact', 'T-bone', 't bone', 'broadsided', 'hit on the side', 'side collision'] },
  { type: 'head_on', keywords: ['head-on', 'head on', 'frontal collision', 'oncoming', 'wrong side of the road'] },
  { type: 'rollover', keywords: ['rollover', 'rolled over', 'overturned', 'flipped'] },
  { type: 'hail', keywords: ['hail', 'hailstorm', 'hail damage'] },
  { type: 'flood', keywords: ['flood', 'submerged', 'water damage', 'waterlogged'] },
  { type: 'fire', keywords: ['fire', 'burnt', 'burned', 'arson', 'engulfed in flames'] },
  { type: 'theft', keywords: ['stolen', 'theft', 'hijack', 'carjack'] },
  { type: 'vandalism', keywords: ['vandal', 'keyed', 'malicious damage', 'intentional damage'] },
  { type: 'parking_lot', keywords: ['parking lot', 'car park', 'parking', 'reversing', 'reversed into'] },
  { type: 'falling_object', keywords: ['falling object', 'tree fell', 'branch fell', 'fell on', 'debris'] },
];

function resolveIncidentType(
  rawType: string | null | undefined,
  description: string | null | undefined,
): { resolved: string | null; wasInferred: boolean } {
  // If already a valid structured type (not null, not 'N/A', not empty)
  const cleaned = (rawType ?? '').trim().toLowerCase();
  if (cleaned && cleaned !== 'n/a' && cleaned !== 'unknown' && cleaned !== 'other') {
    return { resolved: rawType!.trim(), wasInferred: false };
  }

  // Attempt keyword match against description
  const text = (description ?? '').toLowerCase();
  if (!text) return { resolved: null, wasInferred: false };

  for (const entry of INCIDENT_TYPE_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return { resolved: entry.type, wasInferred: true };
      }
    }
  }

  return { resolved: null, wasInferred: false };
}

// ── Photo Status Resolution ───────────────────────────────────────────────────

function resolvePhotoStatus(input: Phase1Input): string {
  const detected = input.photosDetected;
  const processed = input.photosProcessed;
  const count = input.photosProcessedCount;

  if (detected === true && (processed === false || count === 0)) {
    return 'Photos available – manual review required. AI image processing was not completed for this claim.';
  }
  if (detected === true && processed === true && count != null && count > 0) {
    return `${count} damage photo(s) processed by AI.`;
  }
  if (detected === true && (processed == null || count == null)) {
    return 'Photos detected in source document – processing status unknown. Manual review recommended.';
  }
  if (detected === false) {
    return 'No photos submitted with this claim.';
  }
  // Unknown / not provided
  return 'Photo submission status not determined. Verify source document.';
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Run all Phase 1 gates against the provided input.
 * Returns a Phase1Output with validated values and a gate audit trail.
 *
 * Usage:
 *   import { runPhase1 } from './phase1-data-integrity';
 *   const p1 = runPhase1(rawInput);
 *   if (p1.overallStatus === 'BLOCK') { // do not generate report }
 */
export function runPhase1(input: Phase1Input): Phase1Output {
  const gates: GateResult[] = [];
  const allCorrections: string[] = [];

  // ── G1: Temporal Integrity ────────────────────────────────────────────────
  const g1 = runG1(input);
  gates.push(g1.result);
  allCorrections.push(...g1.result.corrections);

  if (g1.result.status === 'BLOCK') {
    return {
      overallStatus: 'BLOCK',
      gates,
      allCorrections,
      incidentDate: g1.incidentDate,
      inspectionDate: g1.inspectionDate,
      reportGenerationDate: g1.reportGenerationDate,
      authoritativeTotalUsd: null,
      partsUsd: null,
      labourUsd: null,
      repairerQuoteUsd: null,
      aiEstimatedUsd: null,
      costReconciliationError: false,
      incidentType: null,
      photoStatusMessage: resolvePhotoStatus(input),
      sanitisedTextFields: {},
      locale: detectLocale(input),
    };
  }

  // ── G3: Currency Unit Auto-Correction (before G2 so G2 uses corrected values)
  const g3 = runG3(input);
  gates.push(g3.result);
  allCorrections.push(...g3.result.corrections);

  // ── G2: Cost Mathematical Reconciliation ─────────────────────────────────
  const g2 = runG2(g3.partsUsd, g3.labourUsd, g3.repairerQuoteUsd, g3.aiEstimatedUsd);
  gates.push(g2.result);
  allCorrections.push(...g2.result.corrections);

  // ── G4: String Sanitisation ───────────────────────────────────────────────
  const textFields: Record<string, string | null | undefined> = {
    incidentDescription: input.incidentDescription,
    ...(input.textFields ?? {}),
  };
  const g4 = runG4(textFields);
  gates.push(g4.result);
  allCorrections.push(...g4.result.corrections);

  // ── G5: Terminology Normalisation ─────────────────────────────────────────
  const locale = detectLocale(input);
  const g5 = runG5(g4.sanitisedTextFields, locale);
  gates.push(g5.result);
  allCorrections.push(...g5.result.corrections);

  // ── Incident Type Resolution ───────────────────────────────────────────────
  const { resolved: incidentType, wasInferred } = resolveIncidentType(
    input.incidentType,
    g5.normalisedTextFields['incidentDescription'] ?? input.incidentDescription,
  );
  if (wasInferred && incidentType) {
    allCorrections.push(`G_INCIDENT_TYPE: Inferred incident type "${incidentType}" from description text (original value was "${input.incidentType ?? 'null'}").`);
  }

  // ── Photo Status ───────────────────────────────────────────────────────────
  const photoStatusMessage = resolvePhotoStatus(input);

  // ── Overall Status ─────────────────────────────────────────────────────────
  // BLOCK if any gate blocked; WARN if any gate warned; PASS otherwise
  const overallStatus: GateStatus =
    gates.some(g => g.status === 'BLOCK') ? 'BLOCK' :
    gates.some(g => g.status === 'WARN') ? 'WARN' : 'PASS';

  return {
    overallStatus,
    gates,
    allCorrections,
    incidentDate: g1.incidentDate,
    inspectionDate: g1.inspectionDate,
    reportGenerationDate: g1.reportGenerationDate,
    authoritativeTotalUsd: g2.authoritativeTotalUsd,
    partsUsd: g3.partsUsd,
    labourUsd: g3.labourUsd,
    repairerQuoteUsd: g3.repairerQuoteUsd,
    aiEstimatedUsd: g3.aiEstimatedUsd,
    costReconciliationError: g2.costReconciliationError,
    incidentType,
    photoStatusMessage,
    sanitisedTextFields: g5.normalisedTextFields,
    locale,
  };
}

/**
 * Convenience function: sanitise a single text string through G4 + G5.
 * Use this for any ad-hoc field that needs sanitisation before rendering.
 */
export function sanitiseField(text: string | null | undefined, locale = 'en'): string {
  if (!text) return '';
  const corrections: string[] = [];
  const sanitised = sanitiseText(String(text), 'field', corrections);
  return normaliseTerminology(sanitised, locale, corrections);
}
