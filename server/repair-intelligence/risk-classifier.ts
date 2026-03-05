/**
 * Risk Classifier
 *
 * Combines part reconciliation results and historical cost deviation
 * to produce a risk level for the submitted quote.
 *
 * Risk levels:
 *   low    — quote is well-aligned with detected damage and historical costs
 *   medium — minor discrepancies that warrant review
 *   high   — significant discrepancies requiring processor attention
 *
 * This module is advisory only. It does NOT block any claim workflow.
 */

import type { ReconciliationResult } from "./part-reconciliation";
import type { DeviationResult } from "./cost-deviation";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskClassification {
  riskLevel: RiskLevel;
  riskFactors: string[];
}

/**
 * Classify the risk level of a quote.
 *
 * @param reconciliation - Output from reconcileParts()
 * @param deviation      - Output from calculateHistoricalDeviation()
 */
export function classifyRisk(
  reconciliation: ReconciliationResult,
  deviation: DeviationResult
): RiskClassification {
  const factors: string[] = [];
  let maxRisk: RiskLevel = "low";

  const escalate = (level: RiskLevel) => {
    if (level === "high") maxRisk = "high";
    else if (level === "medium" && maxRisk !== "high") maxRisk = "medium";
  };

  // ── Part Coverage ────────────────────────────────────────────────────────
  if (reconciliation.detectedCount > 0) {
    if (reconciliation.coverageScore < 0.5) {
      escalate("high");
      factors.push(
        `Low part coverage: ${Math.round(reconciliation.coverageScore * 100)}% of detected damage parts are quoted ` +
          `(${reconciliation.missingParts.length} missing)`
      );
    } else if (reconciliation.coverageScore < 0.8) {
      escalate("medium");
      factors.push(
        `Partial part coverage: ${Math.round(reconciliation.coverageScore * 100)}% of detected parts quoted ` +
          `(${reconciliation.missingParts.length} missing)`
      );
    }
  }

  // ── Extra Parts ──────────────────────────────────────────────────────────
  if (reconciliation.extraParts.length > 3) {
    escalate("medium");
    factors.push(
      `${reconciliation.extraParts.length} parts quoted that were not detected in damage assessment`
    );
  } else if (reconciliation.extraParts.length > 0) {
    factors.push(
      `${reconciliation.extraParts.length} additional part(s) quoted beyond detected damage`
    );
  }

  // ── Historical Cost Deviation ────────────────────────────────────────────
  if (deviation.confidence !== "low" && deviation.deviationPct !== null) {
    if (deviation.deviationPct > 40) {
      escalate("high");
      factors.push(
        `Quote is ${deviation.deviationPct.toFixed(1)}% above the historical median ` +
          `(${deviation.confidence} confidence, n=${deviation.sampleSize})`
      );
    } else if (deviation.deviationPct > 20) {
      escalate("medium");
      factors.push(
        `Quote is ${deviation.deviationPct.toFixed(1)}% above the historical median ` +
          `(${deviation.confidence} confidence, n=${deviation.sampleSize})`
      );
    } else if (deviation.deviationPct < -20) {
      // Unusually low quotes can also be a concern (quality risk)
      factors.push(
        `Quote is ${Math.abs(deviation.deviationPct).toFixed(1)}% below the historical median — ` +
          "verify parts quality and completeness"
      );
    }
  } else if (deviation.confidence === "low") {
    factors.push(
      `Insufficient historical data for cost comparison (${deviation.sampleSize} similar claim${deviation.sampleSize === 1 ? "" : "s"} on record)`
    );
  }

  // ── No risk factors ──────────────────────────────────────────────────────
  if (factors.length === 0) {
    factors.push("Quote aligns with detected damage and historical cost benchmarks");
  }

  return { riskLevel: maxRisk, riskFactors: factors };
}
