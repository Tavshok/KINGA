/**
 * Cost Intelligence helpers for InsurerComparisonView
 * Extracted for maintainability — Aug 2026.
 * Pure functions with no React dependencies.
 */

export const INSURER_ROLE_OPTIONS = [
  { value: "claims_processor", label: "Claims Processor" },
  { value: "assessor_internal", label: "Internal Assessor" },
  { value: "risk_manager", label: "Risk Manager" },
  { value: "claims_manager", label: "Claims Manager" },
  { value: "executive", label: "Executive" },
  { value: "underwriter", label: "Underwriter" },
  { value: "insurer_admin", label: "Insurer Admin" },
] as const;

export type CostBand = "FAIR" | "HIGH" | "LOW";

export function computeMedian(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getCostBand(amount: number, median: number): CostBand {
  if (median === 0) return "FAIR";
  const deviation = (amount - median) / median;
  if (deviation > 0.2) return "HIGH";
  if (deviation < -0.2) return "LOW";
  return "FAIR";
}

export const BAND_CONFIG: Record<CostBand, { label: string; containerClass: string; dotClass: string }> = {
  FAIR: {
    label: "FAIR",
    containerClass: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    dotClass: "bg-emerald-500",
  },
  HIGH: {
    label: "HIGH",
    containerClass: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    dotClass: "bg-red-500",
  },
  LOW: {
    label: "LOW",
    containerClass: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    dotClass: "bg-amber-500",
  },
};
