/**
 * KINGA-N-03 — repair-to-value decision-support policy.
 *
 * These ratios are not settlement or disposal authority. The warning alerts an
 * assessor or reviewer; the recommendation remains subject to human override.
 */

/** 65%: surface an assessor/reviewer warning; do not recommend write-off. */
export const WRITE_OFF_WARNING_THRESHOLD = 0.65;

/** 70%: allow a human-overridable KINGA economic write-off recommendation. */
export const WRITE_OFF_RECOMMENDATION_THRESHOLD = 0.70;

export type WriteOffPolicyBand = "REPAIR" | "WARNING" | "RECOMMENDATION";

export function classifyRepairToValueRatio(ratio: number | null | undefined): WriteOffPolicyBand {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "REPAIR";
  if (ratio >= WRITE_OFF_RECOMMENDATION_THRESHOLD) return "RECOMMENDATION";
  if (ratio >= WRITE_OFF_WARNING_THRESHOLD) return "WARNING";
  return "REPAIR";
}

/**
 * Short on-canvas/inline marker text shared by every live UI and chart surface that
 * draws both thresholds side by side (ForensicDecisionPanel, ReportComponents), so
 * the two surfaces cannot drift apart in spelling.
 */
export const WRITE_OFF_UI_LABELS = {
  warning: "65% review warning",
  recommendation: "70% recommendation",
} as const;
