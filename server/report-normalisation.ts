/**
 * Report Normalisation Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all monetary, fraud, and verdict values shown in
 * the KINGA comparison report.  Every report-generating path MUST call
 * `normaliseReportData()` before rendering — this ensures that:
 *
 *  1. Cost figures are always internally consistent (parts + labour = total).
 *  2. The fraud score is always a valid 0-100 integer.
 *  3. The recommendation/verdict is always a single authoritative string.
 *  4. All values are labelled with their source so the UI can show provenance.
 *  5. Contradictions are detected and flagged rather than silently displayed.
 *
 * This module has NO side effects and NO database calls — it is a pure
 * transformation layer that can be tested in isolation.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CostSource =
  | 'agreed_cost'       // Documented agreed cost from the claim document (most authoritative)
  | 'original_quote'    // Panel beater original quote from the claim document
  | 'ai_estimate'       // AI-computed expected repair cost
  | 'parts_labour_sum'  // Derived: parts + labour from AI breakdown
  | 'unknown';          // No cost data available

export type VerdictSource =
  | 'cost_decision'     // From costDecision.recommendation (Stage 9 output)
  | 'causal_verdict'    // From causal reasoning engine
  | 'output_validation' // From output validation engine
  | 'fraud_threshold'   // Derived from fraud score threshold
  | 'fallback';         // Default when no authoritative source exists

export type NormalisedVerdict =
  | 'APPROVE'
  | 'REVIEW'
  | 'REJECT'
  | 'ESCALATE'
  | 'NEGOTIATE'
  | 'PROCEED_TO_ASSESSMENT'
  | 'PENDING';

export interface NormalisedCosts {
  /** The single authoritative total repair cost in USD. Always parts + labour if both available. */
  totalUsd: number | null;
  /** Parts cost in USD */
  partsUsd: number | null;
  /** Labour cost in USD */
  labourUsd: number | null;
  /** Original panel beater quote from document */
  documentedQuoteUsd: number | null;
  /** Agreed/settled cost from document */
  documentedAgreedUsd: number | null;
  /** AI estimate (before document reconciliation) */
  aiEstimateUsd: number | null;
  /** Which source was used for totalUsd */
  source: CostSource;
  /** ISO 4217 currency code */
  currency: string;
  /** True if parts + labour sum does NOT match the stored total (contradiction detected) */
  hasCostContradiction: boolean;
  /** Human-readable explanation of the contradiction if present */
  contradictionNote: string | null;
}

export interface NormalisedFraud {
  /** Fraud score 0-100. Always an integer. */
  score: number;
  /** Risk level label */
  level: 'minimal' | 'low' | 'moderate' | 'high' | 'elevated';
  /** True if the score was derived from JSON rather than the first-class column */
  derivedFromJson: boolean;
}

export interface NormalisedVerdictResult {
  /** The single authoritative recommendation */
  verdict: NormalisedVerdict;
  /** Which pipeline stage produced this verdict */
  source: VerdictSource;
  /** True if different pipeline stages produced contradictory verdicts */
  hasVerdictContradiction: boolean;
  /** Human-readable explanation of the contradiction if present */
  contradictionNote: string | null;
}

export interface NormalisedReportData {
  costs: NormalisedCosts;
  fraud: NormalisedFraud;
  verdict: NormalisedVerdictResult;
  /** ISO timestamp of normalisation — for audit trails */
  normalisedAt: string;
}

// ── Raw input shape (from the DB row + parsed JSON blobs) ────────────────────

export interface RawAssessmentData {
  // First-class DB columns
  estimatedCost?: number | null;
  estimatedPartsCost?: number | null;
  estimatedLaborCost?: number | null;
  fraudScore?: number | null;
  fraudRiskLevel?: string | null;
  recommendation?: string | null;
  currencyCode?: string | null;

  // Parsed JSON blobs (already parsed by the router)
  costIntelligenceJson?: {
    documentedOriginalQuoteUsd?: number | null;
    documentedAgreedCostUsd?: number | null;
    documentedPartsCostUsd?: number | null;
    documentedLabourCostUsd?: number | null;
    expectedRepairCostCents?: number | null;
    breakdown?: {
      partsCostCents?: number | null;
      labourCostCents?: number | null;
    } | null;
    costDecision?: {
      recommendation?: string | null;
      true_cost_usd?: number | null;
      confidence?: number | null;
    } | null;
    currency?: string | null;
  } | null;

  fraudScoreBreakdownJson?: {
    overallScore?: number | null;
    overall_score?: number | null;
  } | null;

  causalVerdictJson?: {
    decision?: string | null;
    decision_outcome?: string | null;
    recommendation?: string | null;
  } | null;

  validatedOutcomeJson?: {
    recommendation?: string | null;
    verdict?: string | null;
  } | null;

  /**
   * Phase 2 single authoritative decision — if present, this is Priority 0
   * and overrides all pipeline-stage verdicts. Set by the getEnforcement
   * procedure after running runPhase2().
   */
  phase2Decision?: 'APPROVE' | 'REVIEW' | 'ESCALATE' | 'REJECT' | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toUsd(cents: number | null | undefined): number | null {
  if (cents == null || isNaN(Number(cents))) return null;
  const v = Number(cents) / 100;
  return v > 0 ? Math.round(v * 100) / 100 : null;
}

function toDollars(val: number | null | undefined): number | null {
  if (val == null || isNaN(Number(val))) return null;
  const v = Number(val);
  return v > 0 ? Math.round(v * 100) / 100 : null;
}

function clampScore(v: number | null | undefined): number {
  if (v == null || isNaN(Number(v))) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(v))));
}

// Thresholds aligned with intelligence-enforcement.ts enforceFraudLevel and
// weighted-fraud-scoring.ts scoreToLevel so all three engines agree on band names.
const FRAUD_THRESHOLDS: Array<[number, NormalisedFraud['level']]> = [
  [81, 'elevated'],
  [61, 'high'],
  [41, 'moderate'],
  [21, 'low'],
  [0,  'minimal'],
];

function scoreToLevel(score: number): NormalisedFraud['level'] {
  for (const [threshold, level] of FRAUD_THRESHOLDS) {
    if (score >= threshold) return level;
  }
  return 'low';
}

const VALID_VERDICTS = new Set([
  'APPROVE', 'REVIEW', 'REJECT', 'ESCALATE', 'NEGOTIATE', 'PROCEED_TO_ASSESSMENT',
]);

function toVerdict(v: string | null | undefined): NormalisedVerdict | null {
  if (!v) return null;
  const upper = v.toUpperCase().trim();
  return VALID_VERDICTS.has(upper) ? upper as NormalisedVerdict : null;
}

// ── Main normalisation function ───────────────────────────────────────────────

/**
 * Normalise all cost, fraud, and verdict values from a raw assessment record.
 *
 * Priority rules (documented in comments below) are the single authoritative
 * specification for how these values are derived.  Any change to these rules
 * must be reflected in the corresponding tests in report-normalisation.test.ts.
 */
export function normaliseReportData(raw: RawAssessmentData): NormalisedReportData {
  const currency = raw.currencyCode || raw.costIntelligenceJson?.currency || 'USD';

  // ── COSTS ─────────────────────────────────────────────────────────────────
  //
  // Priority for parts cost:
  //   1. costIntelligenceJson.documentedPartsCostUsd (from OCR of claim document)
  //   2. costIntelligenceJson.breakdown.partsCostCents (AI breakdown)
  //   3. estimatedPartsCost (DB column, same as #2 but pre-converted)
  //
  // Priority for labour cost:
  //   1. costIntelligenceJson.documentedLabourCostUsd
  //   2. costIntelligenceJson.breakdown.labourCostCents
  //   3. estimatedLaborCost (DB column)
  //
  // Priority for total cost:
  //   1. documentedAgreedCostUsd (agreed/settled amount — most authoritative)
  //   2. documentedOriginalQuoteUsd (panel beater quote)
  //   3. parts + labour sum (if both are available)
  //   4. costIntelligenceJson.costDecision.true_cost_usd
  //   5. costIntelligenceJson.expectedRepairCostCents
  //   6. estimatedCost (DB column)

  const ci = raw.costIntelligenceJson;

  const partsUsd =
    toDollars(ci?.documentedPartsCostUsd) ??
    toUsd(ci?.breakdown?.partsCostCents) ??
    toDollars(raw.estimatedPartsCost);

  const labourUsd =
    toDollars(ci?.documentedLabourCostUsd) ??
    toUsd(ci?.breakdown?.labourCostCents) ??
    toDollars(raw.estimatedLaborCost);

  const documentedAgreedUsd = toDollars(ci?.documentedAgreedCostUsd);
  const documentedQuoteUsd  = toDollars(ci?.documentedOriginalQuoteUsd);
  const aiEstimateUsd       = toUsd(ci?.expectedRepairCostCents) ?? toDollars(raw.estimatedCost);
  const partsLabourSum      = (partsUsd != null && labourUsd != null) ? Math.round((partsUsd + labourUsd) * 100) / 100 : null;
  const costDecisionTotal   = toDollars(ci?.costDecision?.true_cost_usd);

  let totalUsd: number | null;
  let costSource: CostSource;

  if (documentedAgreedUsd != null) {
    totalUsd = documentedAgreedUsd;
    costSource = 'agreed_cost';
  } else if (documentedQuoteUsd != null) {
    totalUsd = documentedQuoteUsd;
    costSource = 'original_quote';
  } else if (partsLabourSum != null) {
    totalUsd = partsLabourSum;
    costSource = 'parts_labour_sum';
  } else if (costDecisionTotal != null) {
    totalUsd = costDecisionTotal;
    costSource = 'ai_estimate';
  } else if (aiEstimateUsd != null) {
    totalUsd = aiEstimateUsd;
    costSource = 'ai_estimate';
  } else {
    totalUsd = null;
    costSource = 'unknown';
  }

  // Detect contradiction: if parts + labour sum differs from the stored total by > 5%
  let hasCostContradiction = false;
  let costContradictionNote: string | null = null;
  if (
    partsLabourSum != null &&
    totalUsd != null &&
    costSource !== 'parts_labour_sum' &&
    Math.abs(partsLabourSum - totalUsd) / Math.max(totalUsd, 1) > 0.05
  ) {
    hasCostContradiction = true;
    costContradictionNote =
      `Parts (${currency} ${partsUsd?.toFixed(2)}) + Labour (${currency} ${labourUsd?.toFixed(2)}) = ` +
      `${currency} ${partsLabourSum.toFixed(2)}, but total shows ${currency} ${totalUsd.toFixed(2)}. ` +
      `Total is sourced from ${costSource}.`;
  }

  const costs: NormalisedCosts = {
    totalUsd,
    partsUsd,
    labourUsd,
    documentedQuoteUsd,
    documentedAgreedUsd,
    aiEstimateUsd,
    source: costSource,
    currency,
    hasCostContradiction,
    contradictionNote: costContradictionNote,
  };

  // ── FRAUD ─────────────────────────────────────────────────────────────────
  //
  // Priority:
  //   1. fraudScore DB column (integer, 0-100)
  //   2. fraudScoreBreakdownJson.overallScore
  //   3. 0 (safe default — never show inflated fraud score)

  let fraudScore: number;
  let derivedFromJson = false;

  if (raw.fraudScore != null && raw.fraudScore > 0) {
    fraudScore = clampScore(raw.fraudScore);
  } else if (raw.fraudScoreBreakdownJson?.overallScore != null) {
    fraudScore = clampScore(raw.fraudScoreBreakdownJson.overallScore);
    derivedFromJson = true;
  } else if (raw.fraudScoreBreakdownJson?.overall_score != null) {
    fraudScore = clampScore(raw.fraudScoreBreakdownJson.overall_score);
    derivedFromJson = true;
  } else {
    fraudScore = 0;
  }

  // Translate legacy DB enum values to the canonical vocabulary used by all
  // three scoring engines (intelligence-enforcement, weighted-fraud-scoring,
  // and this normalisation layer).
  //   'medium'   → 'moderate'  (old label, same band: 41-60)
  //   'critical' → 'elevated'  (old label, same band: 81+)
  const LEGACY_LEVEL_MAP: Record<string, NormalisedFraud['level']> = {
    medium:   'moderate',
    critical: 'elevated',
  };
  const rawStoredLevel = raw.fraudRiskLevel as string | null | undefined;
  const storedLevel: NormalisedFraud['level'] | null | undefined = rawStoredLevel
    ? (LEGACY_LEVEL_MAP[rawStoredLevel] ?? rawStoredLevel as NormalisedFraud['level'])
    : undefined;
  const derivedLevel = scoreToLevel(fraudScore);
  const fraudLevel: NormalisedFraud['level'] = storedLevel ?? derivedLevel;

  const fraud: NormalisedFraud = {
    score: fraudScore,
    level: fraudLevel,
    derivedFromJson,
  };

  // ── VERDICT ───────────────────────────────────────────────────────────────
  //
  // Priority:
  //   0. phase2Decision (Phase 2 Decision Engine — single authoritative decision)
  //      If present, this ALWAYS wins. All other sources are suppressed.
  //   1. recommendation DB column (populated from costDecision.recommendation)
  //   2. costIntelligenceJson.costDecision.recommendation
  //   3. causalVerdictJson.decision_outcome or .decision
  //   4. validatedOutcomeJson.recommendation
  //   5. fraud_threshold (derived from score >= 70)
  //   6. 'PENDING' (safe default)

  const v0 = raw.phase2Decision ? toVerdict(raw.phase2Decision) : null;
  const v1 = toVerdict(raw.recommendation);
  const v2 = toVerdict(ci?.costDecision?.recommendation);
  const v3 = toVerdict(raw.causalVerdictJson?.decision_outcome ?? raw.causalVerdictJson?.decision);
  const v4 = toVerdict(raw.validatedOutcomeJson?.recommendation ?? raw.validatedOutcomeJson?.verdict);

  let verdict: NormalisedVerdict;
  let verdictSource: VerdictSource;

  if (v0) {
    // Phase 2 is the single authority — suppress all conflicting pipeline outputs
    verdict = v0;
    verdictSource = 'cost_decision'; // reuse existing VerdictSource type; Phase 2 subsumes all
  } else if (v1) {
    verdict = v1;
    verdictSource = 'cost_decision';
  } else if (v2) {
    verdict = v2;
    verdictSource = 'cost_decision';
  } else if (v3) {
    verdict = v3;
    verdictSource = 'causal_verdict';
  } else if (v4) {
    verdict = v4;
    verdictSource = 'output_validation';
  } else if (fraudScore >= 70) {
    // High fraud score → always escalate regardless of cost decision
    verdict = 'ESCALATE';
    verdictSource = 'fraud_threshold';
  } else {
    verdict = 'PENDING';
    verdictSource = 'fallback';
  }

  // Detect contradiction: cost decision says APPROVE but causal verdict says ESCALATE (or vice versa)
  let hasVerdictContradiction = false;
  let verdictContradictionNote: string | null = null;
  const approveSet = new Set(['APPROVE', 'PROCEED_TO_ASSESSMENT']);
  const escalateSet = new Set(['ESCALATE', 'REJECT']);
  if (
    v2 && v3 &&
    ((approveSet.has(v2) && escalateSet.has(v3)) || (escalateSet.has(v2) && approveSet.has(v3)))
  ) {
    hasVerdictContradiction = true;
    verdictContradictionNote =
      `Cost Decision Engine recommends ${v2} but Causal Reasoning Engine recommends ${v3}. ` +
      `Using ${verdict} (from ${verdictSource}). Manual review advised.`;
  }

  const verdictResult: NormalisedVerdictResult = {
    verdict,
    source: verdictSource,
    hasVerdictContradiction,
    contradictionNote: verdictContradictionNote,
  };

  return {
    costs,
    fraud,
    verdict: verdictResult,
    normalisedAt: new Date().toISOString(),
  };
}

// ── Convenience: format a cost value for display ─────────────────────────────

export function formatCost(usd: number | null, currency = 'USD'): string {
  if (usd == null) return 'Not available';
  return `${currency} ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Convenience: human-readable verdict label ─────────────────────────────────

const VERDICT_LABELS: Record<string, string> = {
  APPROVE: 'Approved for Payment',
  REVIEW: 'Requires Review',
  REJECT: 'Rejected',
  ESCALATE: 'Escalated for Investigation',
  NEGOTIATE: 'Negotiate Cost',
  PROCEED_TO_ASSESSMENT: 'Proceed to Assessment',
  PENDING: 'Pending Assessment',
};

export function verdictLabel(verdict: string): string {
  return VERDICT_LABELS[verdict] ?? verdict;
}

// ── Convenience: human-readable cost source label ─────────────────────────────

const COST_SOURCE_LABELS: Record<CostSource, string> = {
  agreed_cost: 'Documented agreed cost',
  original_quote: 'Panel beater original quote',
  ai_estimate: 'AI cost estimate',
  parts_labour_sum: 'Parts + labour breakdown',
  unknown: 'Not available',
};

export function costSourceLabel(source: CostSource): string {
  return COST_SOURCE_LABELS[source] ?? source;
}
