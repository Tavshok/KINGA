/**
 * reportReadinessGate.ts
 *
 * Report Readiness Gate — determines whether a claim can be exported.
 *
 * All three mandatory gates must pass:
 *   1. decision_ready   — Phase 1 decision must be complete and valid
 *   2. contradiction_check — no logical contradictions in the decision
 *   3. overall_confidence  — must be ≥ 40 (minimum threshold)
 *
 * Return shape (matches the prompt contract):
 * {
 *   "export_allowed": true/false,
 *   "status": "READY | HOLD",
 *   "reason": ""
 * }
 *
 * Extended output also includes:
 *   - gate_results    — per-gate pass/fail detail
 *   - hold_reasons    — ordered list of all reasons blocking export
 *   - warnings        — non-blocking advisory notes
 *   - metadata        — engine version, timestamp, gate summary
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReadinessStatus = "READY" | "HOLD";

export interface GateResult {
  /** Gate identifier */
  gate: string;
  /** Whether this gate passed */
  passed: boolean;
  /** Human-readable explanation */
  detail: string;
}

/** Input from Phase 1 — Claims Decision Authority */
export interface DecisionReadyInput {
  /** Whether the decision authority has produced a valid recommendation */
  is_ready: boolean;
  /** The recommendation produced (APPROVE / REVIEW / REJECT) */
  recommendation?: "APPROVE" | "REVIEW" | "REJECT" | null;
  /** The decision basis */
  decision_basis?: "assessor_validated" | "system_validated" | "insufficient_data" | null;
  /** Whether the decision has been assessor-validated */
  assessor_validated?: boolean | null;
  /** Whether there are any blocking factors preventing the decision */
  has_blocking_factors?: boolean | null;
}

/** Input from the Contradiction Detection Engine */
export interface ContradictionCheckInput {
  /** Whether the decision is logically valid (no contradictions) */
  valid: boolean;
  /** The action from the contradiction gate */
  action?: "ALLOW" | "BLOCK" | null;
  /** Number of critical contradictions */
  critical_count?: number | null;
  /** Number of major contradictions */
  major_count?: number | null;
  /** Number of minor contradictions */
  minor_count?: number | null;
}

export interface ReportReadinessInput {
  /** Phase 1 decision readiness */
  decision_ready: DecisionReadyInput;
  /** Contradiction check result */
  contradiction_check: ContradictionCheckInput;
  /** Overall pipeline confidence (0-100) */
  overall_confidence: number | null | undefined;
  /**
   * Optional: whether the claim has been manually reviewed by an assessor.
   * When true, the confidence threshold is relaxed to 30 (assessor override).
   */
  assessor_override?: boolean | null;
  /**
   * Optional: whether this is a draft export (lower quality bar).
   * When true, confidence threshold is relaxed to 30 and REVIEW decisions are allowed.
   */
  draft_mode?: boolean | null;
  /**
   * Optional: whether required documents are attached to the claim.
   * Missing documents are a soft hold (warning, not blocking).
   */
  documents_attached?: boolean | null;
  /**
   * Optional: whether the claim data has been fully validated by the intake gate.
   */
  intake_validated?: boolean | null;
}

export interface ReportReadinessResult {
  /** Whether the claim can be exported */
  export_allowed: boolean;
  /** READY if export is allowed, HOLD if blocked */
  status: ReadinessStatus;
  /** Primary reason for the status (first blocking reason, or success message) */
  reason: string;
  /** Per-gate pass/fail detail */
  gate_results: GateResult[];
  /** All reasons blocking export (empty if READY) */
  hold_reasons: string[];
  /** Non-blocking advisory notes */
  warnings: string[];
  /** Engine metadata */
  metadata: {
    engine: "ReportReadinessGate";
    version: "1.0.0";
    gates_passed: number;
    gates_failed: number;
    confidence_threshold_used: number;
    timestamp_utc: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIDENCE_MINIMUM = 40;
const CONFIDENCE_ASSESSOR_OVERRIDE = 30;
const CONFIDENCE_DRAFT_MODE = 30;

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a claim is ready to be exported as a report.
 *
 * @param input - Decision readiness, contradiction check, and confidence
 * @returns ReportReadinessResult with export_allowed, status, and reason
 */
export function checkReportReadiness(input: ReportReadinessInput): ReportReadinessResult {
  const gateResults: GateResult[] = [];
  const holdReasons: string[] = [];
  const warnings: string[] = [];

  // Determine effective confidence threshold
  const confidenceThreshold =
    input.assessor_override
      ? CONFIDENCE_ASSESSOR_OVERRIDE
      : input.draft_mode
        ? CONFIDENCE_DRAFT_MODE
        : CONFIDENCE_MINIMUM;

  // ── Gate 1: Decision Ready ─────────────────────────────────────────────────
  const decisionReady = input.decision_ready;
  let gate1Passed = false;
  let gate1Detail = "";

  if (!decisionReady.is_ready) {
    gate1Detail = "Decision Authority has not produced a valid recommendation. The claim must complete Phase 1 before export.";
    holdReasons.push("Decision not ready: Phase 1 must be completed first.");
  } else if (decisionReady.decision_basis === "insufficient_data") {
    gate1Detail = "Decision basis is 'insufficient_data' — the system could not produce a reliable recommendation due to missing inputs.";
    holdReasons.push("Decision basis is insufficient_data — too many inputs are missing to export reliably.");
  } else if (decisionReady.has_blocking_factors) {
    gate1Detail = "Decision has unresolved blocking factors. These must be addressed before the claim can be exported.";
    holdReasons.push("Decision has unresolved blocking factors.");
  } else {
    gate1Passed = true;
    const rec = decisionReady.recommendation ?? "unknown";
    const basis = decisionReady.decision_basis ?? "system_validated";
    gate1Detail = `Decision is ready: ${rec} (${basis}).`;

    // Advisory: REVIEW decisions are exported but flagged
    if (decisionReady.recommendation === "REVIEW" && !input.draft_mode) {
      warnings.push("Decision is REVIEW — claim is exported with a pending review flag. Assessor sign-off is recommended before final settlement.");
    }

    // Advisory: assessor validation improves export quality
    if (!decisionReady.assessor_validated && decisionReady.recommendation === "APPROVE") {
      warnings.push("Decision was not manually validated by an assessor. Consider assessor sign-off for high-value claims.");
    }
  }

  gateResults.push({ gate: "decision_ready", passed: gate1Passed, detail: gate1Detail });

  // ── Gate 2: Contradiction Check ────────────────────────────────────────────
  const contradiction = input.contradiction_check;
  let gate2Passed = false;
  let gate2Detail = "";

  if (!contradiction.valid || contradiction.action === "BLOCK") {
    const critCount = contradiction.critical_count ?? 0;
    const majCount = contradiction.major_count ?? 0;
    const minCount = contradiction.minor_count ?? 0;
    const parts: string[] = [];
    if (critCount > 0) parts.push(`${critCount} CRITICAL`);
    if (majCount > 0) parts.push(`${majCount} MAJOR`);
    if (minCount > 0) parts.push(`${minCount} MINOR`);
    const countStr = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    gate2Detail = `Contradiction check failed${countStr}. Logical inconsistencies must be resolved before export.`;
    holdReasons.push(`Contradiction gate blocked${countStr} — decision contains logical inconsistencies.`);
  } else {
    gate2Passed = true;
    const minorCount = contradiction.minor_count ?? 0;
    gate2Detail = "Contradiction check passed — no logical inconsistencies detected.";
    if (minorCount > 0) {
      warnings.push(`${minorCount} minor contradiction(s) noted but not blocking. Review recommended.`);
    }
  }

  gateResults.push({ gate: "contradiction_check", passed: gate2Passed, detail: gate2Detail });

  // ── Gate 3: Confidence Threshold ──────────────────────────────────────────
  let gate3Passed = false;
  let gate3Detail = "";

  if (input.overall_confidence == null) {
    gate3Detail = "Overall confidence is unknown — cannot verify the minimum threshold. Claim cannot be exported without a confidence score.";
    holdReasons.push("Overall confidence is unknown — confidence score required for export.");
  } else if (input.overall_confidence < confidenceThreshold) {
    gate3Detail = `Overall confidence is ${input.overall_confidence}% — below the minimum threshold of ${confidenceThreshold}%. Confidence must be raised before export.`;
    holdReasons.push(`Confidence ${input.overall_confidence}% is below the minimum threshold of ${confidenceThreshold}%.`);
  } else {
    gate3Passed = true;
    const suffix = input.assessor_override
      ? " (assessor override threshold applied)"
      : input.draft_mode
        ? " (draft mode threshold applied)"
        : "";
    gate3Detail = `Confidence is ${input.overall_confidence}% — meets the minimum threshold of ${confidenceThreshold}%${suffix}.`;

    // Advisory: confidence below 60 is marginal
    if (input.overall_confidence < 60 && !input.assessor_override) {
      warnings.push(`Confidence is ${input.overall_confidence}% — above the minimum but below the recommended 60%. Consider additional validation.`);
    }
  }

  gateResults.push({ gate: "overall_confidence", passed: gate3Passed, detail: gate3Detail });

  // ── Soft checks (warnings only, not blocking) ──────────────────────────────

  if (input.documents_attached === false) {
    warnings.push("Required documents are not attached to this claim. Attach supporting documents before final export.");
  }

  if (input.intake_validated === false) {
    warnings.push("Claim has not been validated by the intake gate. Intake validation is recommended before export.");
  }

  // ── Final determination ────────────────────────────────────────────────────

  const gatesPassed = gateResults.filter((g) => g.passed).length;
  const gatesFailed = gateResults.filter((g) => !g.passed).length;
  const exportAllowed = holdReasons.length === 0;
  const status: ReadinessStatus = exportAllowed ? "READY" : "HOLD";

  let reason: string;
  if (exportAllowed) {
    const rec = decisionReady.recommendation ?? "decision";
    const conf = input.overall_confidence ?? "unknown";
    reason = `Claim is ready for export. All ${gateResults.length} gates passed. Recommendation: ${rec} at ${conf}% confidence.`;
  } else {
    reason = holdReasons[0];
  }

  return {
    export_allowed: exportAllowed,
    status,
    reason,
    gate_results: gateResults,
    hold_reasons: holdReasons,
    warnings,
    metadata: {
      engine: "ReportReadinessGate",
      version: "1.0.0",
      gates_passed: gatesPassed,
      gates_failed: gatesFailed,
      confidence_threshold_used: confidenceThreshold,
      timestamp_utc: new Date().toISOString(),
    },
  };
}

/**
 * Evaluate readiness for a batch of claims.
 */
export function checkReportReadinessBatch(
  items: Array<{ claim_id: string | number; input: ReportReadinessInput }>
): Array<{ claim_id: string | number; result: ReportReadinessResult }> {
  return items.map((item) => ({
    claim_id: item.claim_id,
    result: checkReportReadiness(item.input),
  }));
}

/**
 * Aggregate readiness stats across a batch.
 */
export function aggregateReadinessStats(
  results: Array<{ claim_id: string | number; result: ReportReadinessResult }>
): {
  total: number;
  ready: number;
  on_hold: number;
  ready_rate_pct: number;
  top_hold_reasons: Array<{ reason_prefix: string; count: number }>;
  avg_confidence_ready: number | null;
  avg_confidence_hold: number | null;
} {
  const total = results.length;
  const ready = results.filter((r) => r.result.status === "READY").length;
  const on_hold = total - ready;
  const ready_rate_pct = total > 0 ? Math.round((ready / total) * 100) : 0;

  // Count hold reason prefixes (gate name)
  const reasonCounts = new Map<string, number>();
  for (const r of results) {
    for (const reason of r.result.hold_reasons) {
      // Extract the gate name from the reason prefix
      const prefix = reason.split(":")[0].trim().slice(0, 60);
      reasonCounts.set(prefix, (reasonCounts.get(prefix) ?? 0) + 1);
    }
  }

  const top_hold_reasons = Array.from(reasonCounts.entries())
    .map(([reason_prefix, count]) => ({ reason_prefix, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total,
    ready,
    on_hold,
    ready_rate_pct,
    top_hold_reasons,
    avg_confidence_ready: null, // populated by caller with actual confidence data
    avg_confidence_hold: null,
  };
}
