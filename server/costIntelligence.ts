/**
 * server/costIntelligence.ts
 *
 * Cost Intelligence Module
 *
 * Computes an independent AI cost benchmark from:
 *   - Component list × severity × market-rate benchmarks (from repairIntelligence.ts)
 *   - Labour hours × market rate
 *   - Hidden damage probability-weighted cost (from physics energy)
 *   - Paint / refinishing cost
 *
 * The benchmark is INDEPENDENT of the document-extracted quote.
 * It is used to validate the submitted quote and detect over/under-pricing.
 *
 * All costs are in USD cents (integer). Conversion: cents / 100 = USD.
 */

import {
  classifyRepairAction,
  lookupBenchmarkCostUsd,
  LABOUR_RATE_USD_PER_HOUR,
  type RepairIntelligenceOutput,
} from "./repairIntelligence";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CostIntelligenceInput {
  claimId: number;
  damagedComponents: Array<{
    name: string;
    severity?: string;
    damageType?: string;
    location?: string;
    quotedCost?: number;
  }>;
  repairIntelligence: RepairIntelligenceOutput | null;
  physicsImpactForceKn: number;
  physicsEnergyKj: number;
  documentQuotedCostCents: number | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  marketRegion: string;
}

export interface CostIntelligenceOutput {
  // Document-extracted cost (from PDF quote — what was submitted)
  documentQuotedCostCents: number | null;
  // AI independent benchmark breakdown
  aiBenchmarkPartsCents: number;
  aiBenchmarkLaborCents: number;
  aiBenchmarkHiddenDamageCents: number;
  aiBenchmarkPaintCents: number;
  aiBenchmarkTotalCents: number;
  // Fair range: benchmark ± confidence interval
  fairRangeLowCents: number;
  fairRangeHighCents: number;
  // Variance analysis (null if no document quote)
  variancePct: number | null;
  varianceFlag: "within_range" | "overpriced" | "underpriced" | "no_quote";
  // Market context
  marketRegion: string;
  labourRateUsdPerHour: number;
  currency: string;
  // Confidence in the benchmark (higher with more components and physics data)
  benchmarkConfidence: "high" | "medium" | "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paint / refinishing cost per panel (USD).
 * Based on ZW/SA panel shop rates (2024).
 */
const PAINT_COST_PER_PANEL_USD = 45;

/**
 * Hidden damage cost factor: estimated hidden damage cost as a fraction
 * of the AI benchmark parts cost, scaled by physics energy severity.
 * At ESI=1.0 (minor): 5% of parts cost
 * At ESI=2.0 (moderate): 12% of parts cost
 * At ESI=3.0 (severe): 22% of parts cost
 */
function computeHiddenDamageFactor(physicsEnergyKj: number): number {
  const esi = Math.min(3.0, Math.max(1.0, Math.sqrt(physicsEnergyKj / 10)));
  // Linear interpolation: 0.05 at ESI=1, 0.22 at ESI=3
  return 0.05 + (esi - 1.0) * 0.085;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function computeCostIntelligence(
  input: CostIntelligenceInput
): Promise<CostIntelligenceOutput> {
  const { damagedComponents, repairIntelligence, physicsEnergyKj, documentQuotedCostCents, marketRegion } = input;

  // ── Parts cost ────────────────────────────────────────────────────────────
  let aiBenchmarkPartsCents = 0;
  const componentCount = damagedComponents.length;

  for (const comp of damagedComponents) {
    // Use repair intelligence action if available, otherwise classify inline
    const action = repairIntelligence?.actions.find(
      (a) => a.component.toLowerCase() === (comp.name || "").toLowerCase()
    )?.action ?? classifyRepairAction(comp).action;

    const benchmarkUsd = lookupBenchmarkCostUsd(comp.name || "", action, comp.severity || "moderate");
    aiBenchmarkPartsCents += benchmarkUsd * 100;
  }

  // ── Labour cost ───────────────────────────────────────────────────────────
  const laborHours = repairIntelligence?.laborHoursEstimate ?? (componentCount * 1.5);
  const aiBenchmarkLaborCents = Math.round(laborHours * LABOUR_RATE_USD_PER_HOUR * 100);

  // ── Hidden damage cost ────────────────────────────────────────────────────
  const hiddenDamageFactor = computeHiddenDamageFactor(physicsEnergyKj);
  const aiBenchmarkHiddenDamageCents = Math.round(aiBenchmarkPartsCents * hiddenDamageFactor);

  // ── Paint / refinishing cost ──────────────────────────────────────────────
  // Count panels that need painting (body panels, not mechanical/electrical)
  const paintablePanels = damagedComponents.filter((c) => {
    const n = (c.name || "").toLowerCase();
    return (
      n.includes("bumper") || n.includes("fender") || n.includes("bonnet") ||
      n.includes("hood") || n.includes("door") || n.includes("quarter") ||
      n.includes("roof") || n.includes("sill") || n.includes("trunk") ||
      n.includes("boot") || n.includes("pillar")
    );
  });
  const aiBenchmarkPaintCents = paintablePanels.length * PAINT_COST_PER_PANEL_USD * 100;

  // ── Total benchmark ───────────────────────────────────────────────────────
  const aiBenchmarkTotalCents =
    aiBenchmarkPartsCents +
    aiBenchmarkLaborCents +
    aiBenchmarkHiddenDamageCents +
    aiBenchmarkPaintCents;

  // ── Fair range: ±20% around benchmark ────────────────────────────────────
  const fairRangeLowCents = Math.round(aiBenchmarkTotalCents * 0.80);
  const fairRangeHighCents = Math.round(aiBenchmarkTotalCents * 1.20);

  // ── Variance analysis ─────────────────────────────────────────────────────
  let variancePct: number | null = null;
  let varianceFlag: CostIntelligenceOutput["varianceFlag"] = "no_quote";

  if (documentQuotedCostCents !== null && documentQuotedCostCents > 0 && aiBenchmarkTotalCents > 0) {
    variancePct = Math.round(
      ((documentQuotedCostCents - aiBenchmarkTotalCents) / aiBenchmarkTotalCents) * 100
    );
    if (documentQuotedCostCents >= fairRangeLowCents && documentQuotedCostCents <= fairRangeHighCents) {
      varianceFlag = "within_range";
    } else if (documentQuotedCostCents > fairRangeHighCents) {
      varianceFlag = "overpriced";
    } else {
      varianceFlag = "underpriced";
    }
  }

  // ── Benchmark confidence ──────────────────────────────────────────────────
  let benchmarkConfidence: CostIntelligenceOutput["benchmarkConfidence"] = "low";
  if (componentCount >= 3 && physicsEnergyKj > 0) {
    benchmarkConfidence = "high";
  } else if (componentCount >= 2 || physicsEnergyKj > 0) {
    benchmarkConfidence = "medium";
  }

  return {
    documentQuotedCostCents,
    aiBenchmarkPartsCents,
    aiBenchmarkLaborCents,
    aiBenchmarkHiddenDamageCents,
    aiBenchmarkPaintCents,
    aiBenchmarkTotalCents,
    fairRangeLowCents,
    fairRangeHighCents,
    variancePct,
    varianceFlag,
    marketRegion,
    labourRateUsdPerHour: LABOUR_RATE_USD_PER_HOUR,
    currency: "USD",
    benchmarkConfidence,
  };
}
