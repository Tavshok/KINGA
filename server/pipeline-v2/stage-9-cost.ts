/**
 * pipeline-v2/stage-9-cost.ts
 *
 * STAGE 9 — COST OPTIMISATION ENGINE
 *
 * Computes expected repair cost, compares to quoted cost,
 * and identifies savings opportunities.
 *
 * Input: ClaimRecord + Stage6Output + Stage7Output
 * Output: Stage9Output (expected_cost, deviation, savings, breakdown)
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage9Output,
} from "./types";

/**
 * Base labour rates by market region (USD per hour).
 */
const LABOUR_RATES: Record<string, number> = {
  ZW: 25,
  ZA: 35,
  US: 75,
  UK: 65,
  AU: 60,
  DEFAULT: 40,
};

/**
 * Base part cost multipliers by severity.
 */
const SEVERITY_COST_MULTIPLIER: Record<string, number> = {
  cosmetic: 0.3,
  minor: 0.5,
  moderate: 1.0,
  severe: 1.8,
  catastrophic: 3.0,
};

/**
 * Estimate cost per component based on severity and repair action.
 */
function estimateComponentCost(
  componentName: string,
  severity: string,
  repairAction: string,
  labourRate: number
): { partsCents: number; labourCents: number; paintCents: number } {
  const name = (componentName || "").toLowerCase();
  const sev = (severity || "moderate").toLowerCase();
  const action = (repairAction || "repair").toLowerCase();

  // Base part cost estimation (in USD cents)
  let basePartCost = 15000; // Default $150

  // Adjust by component type
  if (/bumper|fender|wing|panel|door skin/.test(name)) basePartCost = 20000;
  if (/headl|tail|lamp|light/.test(name)) basePartCost = 25000;
  if (/hood|bonnet|trunk|boot/.test(name)) basePartCost = 35000;
  if (/door|quarter panel/.test(name)) basePartCost = 40000;
  if (/windshield|windscreen|glass/.test(name)) basePartCost = 30000;
  if (/radiator|condenser|intercooler/.test(name)) basePartCost = 45000;
  if (/frame|chassis|subframe|rail/.test(name)) basePartCost = 80000;
  if (/airbag|srs/.test(name)) basePartCost = 60000;
  if (/suspension|strut|shock|control arm/.test(name)) basePartCost = 35000;
  if (/mirror/.test(name)) basePartCost = 15000;
  if (/grille|grill/.test(name)) basePartCost = 12000;
  if (/moulding|trim|garnish/.test(name)) basePartCost = 8000;

  // Apply severity multiplier
  const multiplier = SEVERITY_COST_MULTIPLIER[sev] || 1.0;

  // If repair (not replace), reduce part cost significantly
  let partsCents = 0;
  let labourHours = 2;

  if (action === "replace") {
    partsCents = Math.round(basePartCost * multiplier);
    labourHours = 3;
  } else if (action === "repair") {
    partsCents = Math.round(basePartCost * 0.1); // Consumables only
    labourHours = 4; // More labour for repair
  } else if (action === "refinish") {
    partsCents = Math.round(basePartCost * 0.05); // Paint materials
    labourHours = 2;
  }

  const labourCents = Math.round(labourHours * labourRate * 100);
  const paintCents = action === "refinish" || action === "repair"
    ? Math.round(labourRate * 100 * 1.5) // 1.5 hours paint time
    : 0;

  return { partsCents, labourCents, paintCents };
}

export async function runCostOptimisationStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output
): Promise<StageResult<Stage9Output>> {
  const start = Date.now();
  ctx.log("Stage 9", "Cost optimisation starting");

  try {
    const region = claimRecord.marketRegion || "DEFAULT";
    const labourRate = LABOUR_RATES[region] || LABOUR_RATES.DEFAULT;
    const currency = region === "ZA" ? "ZAR" : region === "ZW" ? "USD" : "USD";

    let totalPartsCents = 0;
    let totalLabourCents = 0;
    let totalPaintCents = 0;

    // Estimate cost for each damaged component
    for (const comp of damageAnalysis.damagedParts) {
      const cost = estimateComponentCost(comp.name, comp.severity, "replace", labourRate);
      totalPartsCents += cost.partsCents;
      totalLabourCents += cost.labourCents;
      totalPaintCents += cost.paintCents;
    }

    // Hidden damage allowance based on physics analysis
    let hiddenDamageCents = 0;
    if (physicsAnalysis.physicsExecuted) {
      const latent = physicsAnalysis.latentDamageProbability;
      const latentTotal = (latent.engine + latent.transmission + latent.suspension + latent.frame + latent.electrical) / 5;
      hiddenDamageCents = Math.round(totalPartsCents * latentTotal * 0.3);
    }

    const totalExpectedCents = totalPartsCents + totalLabourCents + totalPaintCents + hiddenDamageCents;

    // Calculate quote deviation
    const quotedCents = claimRecord.repairQuote.quoteTotalCents;
    let quoteDeviationPct: number | null = null;
    let savingsOpportunityCents = 0;

    if (quotedCents && quotedCents > 0) {
      quoteDeviationPct = ((quotedCents - totalExpectedCents) / totalExpectedCents) * 100;
      if (quotedCents > totalExpectedCents) {
        savingsOpportunityCents = quotedCents - totalExpectedCents;
      }
    }

    // Recommended cost range (±20%)
    const lowCents = Math.round(totalExpectedCents * 0.8);
    const highCents = Math.round(totalExpectedCents * 1.2);

    const output: Stage9Output = {
      expectedRepairCostCents: totalExpectedCents,
      quoteDeviationPct,
      recommendedCostRange: { lowCents, highCents },
      savingsOpportunityCents,
      breakdown: {
        partsCostCents: totalPartsCents,
        labourCostCents: totalLabourCents,
        paintCostCents: totalPaintCents,
        hiddenDamageCostCents: hiddenDamageCents,
        totalCents: totalExpectedCents,
      },
      labourRateUsdPerHour: labourRate,
      marketRegion: region,
      currency,
    };

    ctx.log("Stage 9", `Cost optimisation complete. Expected: ${(totalExpectedCents/100).toFixed(2)} ${currency}, Quoted: ${quotedCents ? (quotedCents/100).toFixed(2) : 'N/A'}, Deviation: ${quoteDeviationPct !== null ? quoteDeviationPct.toFixed(1) + '%' : 'N/A'}, Savings: ${(savingsOpportunityCents/100).toFixed(2)}`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 9", `Cost optimisation failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
