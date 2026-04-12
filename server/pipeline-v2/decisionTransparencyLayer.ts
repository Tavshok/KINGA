/**
 * decisionTransparencyLayer.ts
 *
 * Phase 4C — Decision Transparency Layer (DTL)
 *
 * Generates a structured, human-readable breakdown of the DOE's decision,
 * including:
 *   - Which panel beater was selected and why
 *   - Per-candidate score breakdown (cost, quality, fraud, turnaround)
 *   - Which candidates were disqualified and on what grounds
 *   - The FCDI score at time of decision
 *   - Whether the decision is DOE-optimised or requires manual review
 *
 * The DTL is designed to prevent assessors from bypassing the DOE by making
 * the automated decision fully visible and auditable in the Forensic Audit Report.
 *
 * Output is included in the Forensic Audit Report under
 * `fullReport.sections.decisionTransparencyLayer`.
 */

import type { DOEResult, DOEScoreBreakdown, DOEDisqualification } from "./decisionOptimisationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface DTLCandidateSummary {
  panelBeater: string;
  compositeScore: number;
  costScore: number;
  qualityScore: number;
  fraudRiskScore: number;
  turnaroundScore: number;
  selected: boolean;
  disqualified: boolean;
  disqualificationReason: string | null;
}

export interface DecisionTransparencyLayer {
  /** DOE execution status */
  doeStatus: string;
  /** Whether the decision was automated (DOE) or requires manual review */
  decisionMode: "AUTOMATED" | "MANUAL_REVIEW_REQUIRED";
  /** Selected panel beater (null if manual review required) */
  selectedPanelBeater: string | null;
  /** Selected cost */
  selectedCost: number | null;
  /** Currency */
  currency: string | null;
  /** Benchmark deviation % */
  benchmarkDeviationPct: number | null;
  /** Decision confidence */
  decisionConfidence: "high" | "medium" | "low";
  /** FCDI score at time of decision */
  fcdiScoreAtDecision: number;
  /** Per-candidate summary for the report */
  candidates: DTLCandidateSummary[];
  /** Disqualified candidates */
  disqualifications: DOEDisqualification[];
  /** Human-readable decision rationale */
  rationale: string;
  /** Narrative for the Forensic Audit Report */
  narrative: string;
  /** ISO timestamp */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildDecisionMode(doeStatus: string): "AUTOMATED" | "MANUAL_REVIEW_REQUIRED" {
  return doeStatus === "OPTIMISED" ? "AUTOMATED" : "MANUAL_REVIEW_REQUIRED";
}

function buildCandidateSummary(
  breakdown: DOEScoreBreakdown,
  selectedPanelBeater: string | null,
  disqualifications: DOEDisqualification[]
): DTLCandidateSummary {
  const disq = disqualifications.find((d) => d.panelBeater === breakdown.panelBeater);
  return {
    panelBeater: breakdown.panelBeater,
    compositeScore: breakdown.totalScore,
    costScore: breakdown.costScore,
    qualityScore: breakdown.qualityScore,
    fraudRiskScore: breakdown.fraudRiskScore,
    turnaroundScore: breakdown.turnaroundScore,
    selected: breakdown.panelBeater === selectedPanelBeater,
    disqualified: breakdown.disqualified || !!disq,
    disqualificationReason: breakdown.disqualificationReason ?? disq?.reason ?? null,
  };
}

function buildNarrative(dtl: Omit<DecisionTransparencyLayer, "narrative" | "generatedAt">): string {
  const parts: string[] = [];

  if (dtl.decisionMode === "AUTOMATED") {
    parts.push(
      `The Decision Optimisation Engine (DOE) completed automated analysis of ` +
      `${dtl.candidates.length} repair quote${dtl.candidates.length !== 1 ? "s" : ""}.`
    );
    if (dtl.selectedPanelBeater && dtl.selectedCost != null && dtl.currency) {
      const deviationStr = dtl.benchmarkDeviationPct != null
        ? ` (${dtl.benchmarkDeviationPct > 0 ? "+" : ""}${dtl.benchmarkDeviationPct.toFixed(1)}% vs benchmark)`
        : "";
      const costStr = dtl.selectedCost != null && dtl.currency
        ? ` at ${dtl.currency} ${dtl.selectedCost.toLocaleString()}`
        : "";
      parts.push(
        `The optimal repairer is ${dtl.selectedPanelBeater}${costStr}${deviationStr}. ` +
        `Decision confidence: ${dtl.decisionConfidence.toUpperCase()}.`
      );
    }
  } else {
    const reasonMap: Record<string, string> = {
      GATED_LOW_FCDI: "the Forensic Confidence Degradation Index (FCDI) score is below the minimum threshold for automated decision optimisation",
      GATED_LOW_INPUT: "input completeness is below the minimum threshold for automated decision optimisation",
      GATED_NO_QUOTES: "no repair quotes were available for optimisation",
      ALL_DISQUALIFIED: "all submitted repair quotes were disqualified on fraud risk grounds",
    };
    const reason = reasonMap[dtl.doeStatus] ?? "automated decision optimisation could not be completed";
    parts.push(
      `Automated decision optimisation was not completed because ${reason}. ` +
      `Manual assessor review is required before a cost decision is made.`
    );
  }

  if (dtl.disqualifications.length > 0) {
    const disqNames = dtl.disqualifications.map((d) => `${d.panelBeater} (${d.reason})`).join("; ");
    parts.push(
      `${dtl.disqualifications.length} quote${dtl.disqualifications.length !== 1 ? "s were" : " was"} ` +
      `disqualified: ${disqNames}.`
    );
  }

  parts.push(
    `FCDI score at time of decision: ${dtl.fcdiScoreAtDecision}%.`
  );

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Decision Transparency Layer from a DOE result.
 *
 * Returns a structured, human-readable breakdown of the DOE's decision
 * for inclusion in the Forensic Audit Report.
 */
export function buildDecisionTransparencyLayer(
  doeResult: DOEResult | null
): DecisionTransparencyLayer {
  const generatedAt = new Date().toISOString();

  if (!doeResult) {
    return {
      doeStatus: "NOT_RUN",
      decisionMode: "MANUAL_REVIEW_REQUIRED",
      selectedPanelBeater: null,
      selectedCost: null,
      currency: null,
      benchmarkDeviationPct: null,
      decisionConfidence: "low",
      fcdiScoreAtDecision: 0,
      candidates: [],
      disqualifications: [],
      rationale: "The Decision Optimisation Engine was not executed for this claim.",
      narrative:
        "The Decision Optimisation Engine (DOE) was not executed for this claim. " +
        "Manual assessor review is required before a cost decision is made.",
      generatedAt,
    };
  }

  const candidates = doeResult.scoreBreakdown.map((b) =>
    buildCandidateSummary(b, doeResult.selectedPanelBeater, doeResult.disqualifications)
  );

  const decisionMode = buildDecisionMode(doeResult.status);

  const partial: Omit<DecisionTransparencyLayer, "narrative" | "generatedAt"> = {
    doeStatus: doeResult.status,
    decisionMode,
    selectedPanelBeater: doeResult.selectedPanelBeater,
    selectedCost: doeResult.selectedCost,
    currency: doeResult.currency,
    benchmarkDeviationPct: doeResult.benchmarkDeviationPct,
    decisionConfidence: doeResult.decisionConfidence,
    fcdiScoreAtDecision: doeResult.fcdiScoreAtExecution,
    candidates,
    disqualifications: doeResult.disqualifications,
    rationale: doeResult.rationale,
  };

  return {
    ...partial,
    narrative: buildNarrative(partial),
    generatedAt,
  };
}
