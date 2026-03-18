/**
 * pipeline-v2/stage-9-cost.ts
 *
 * STAGE 9 — COST OPTIMISATION ENGINE (Self-Healing)
 *
 * Computes expected repair cost, compares to quoted cost,
 * and identifies savings opportunities.
 * NEVER halts — produces estimated costs even with minimal data.
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage9Output,
  Assumption,
  RecoveryAction,
} from "./types";

const LABOUR_RATES: Record<string, number> = {
  ZW: 25, ZA: 35, US: 75, UK: 65, AU: 60, DEFAULT: 40,
};

const SEVERITY_COST_MULTIPLIER: Record<string, number> = {
  cosmetic: 0.3, minor: 0.5, moderate: 1.0, severe: 1.8, catastrophic: 3.0,
};

function estimateComponentCost(
  componentName: string,
  severity: string,
  repairAction: string,
  labourRate: number
): { partsCents: number; labourCents: number; paintCents: number } {
  const name = (componentName || "").toLowerCase();
  const sev = (severity || "moderate").toLowerCase();
  const action = (repairAction || "repair").toLowerCase();

  let basePartCost = 15000;
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

  const multiplier = SEVERITY_COST_MULTIPLIER[sev] || 1.0;

  let partsCents = 0;
  let labourHours = 2;

  if (action === "replace") {
    partsCents = Math.round(basePartCost * multiplier);
    labourHours = 3;
  } else if (action === "repair") {
    partsCents = Math.round(basePartCost * 0.1);
    labourHours = 4;
  } else if (action === "refinish") {
    partsCents = Math.round(basePartCost * 0.05);
    labourHours = 2;
  }

  const labourCents = Math.round(labourHours * labourRate * 100);
  const paintCents = action === "refinish" || action === "repair"
    ? Math.round(labourRate * 100 * 1.5)
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

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const region = claimRecord.marketRegion || "DEFAULT";
    const labourRate = LABOUR_RATES[region] || LABOUR_RATES.DEFAULT;
    const currency = region === "ZA" ? "ZAR" : region === "ZW" ? "USD" : "USD";

    let totalPartsCents = 0;
    let totalLabourCents = 0;
    let totalPaintCents = 0;

    if (damageAnalysis.damagedParts.length === 0) {
      isDegraded = true;
      // Estimate from quoted cost if available
      if (claimRecord.repairQuote.quoteTotalCents) {
        totalPartsCents = Math.round(claimRecord.repairQuote.quoteTotalCents * 0.5);
        totalLabourCents = Math.round(claimRecord.repairQuote.quoteTotalCents * 0.35);
        totalPaintCents = Math.round(claimRecord.repairQuote.quoteTotalCents * 0.15);
        assumptions.push({
          field: "costBreakdown",
          assumedValue: `parts=50%, labour=35%, paint=15% of quoted total`,
          reason: "No damage components available. Estimated breakdown from quoted total using industry ratios (50/35/15).",
          strategy: "industry_average",
          confidence: 30,
          stage: "Stage 9",
        });
      } else {
        // No components and no quote — use generic estimate
        totalPartsCents = 200000; // $2000
        totalLabourCents = 150000; // $1500
        totalPaintCents = 50000; // $500
        assumptions.push({
          field: "costBreakdown",
          assumedValue: "$3,500 total estimate",
          reason: "No damage components and no repair quote available. Using generic moderate-damage estimate of $3,500.",
          strategy: "industry_average",
          confidence: 15,
          stage: "Stage 9",
        });
      }
    } else {
      for (const comp of damageAnalysis.damagedParts) {
        const cost = estimateComponentCost(comp.name, comp.severity, "replace", labourRate);
        totalPartsCents += cost.partsCents;
        totalLabourCents += cost.labourCents;
        totalPaintCents += cost.paintCents;
      }
    }

    // Hidden damage allowance
    let hiddenDamageCents = 0;
    if (physicsAnalysis.physicsExecuted) {
      const latent = physicsAnalysis.latentDamageProbability;
      const latentTotal = (latent.engine + latent.transmission + latent.suspension + latent.frame + latent.electrical) / 5;
      hiddenDamageCents = Math.round(totalPartsCents * latentTotal * 0.3);
    }

    const totalExpectedCents = totalPartsCents + totalLabourCents + totalPaintCents + hiddenDamageCents;

    const quotedCents = claimRecord.repairQuote.quoteTotalCents;
    let quoteDeviationPct: number | null = null;
    let savingsOpportunityCents = 0;

    if (quotedCents && quotedCents > 0 && totalExpectedCents > 0) {
      quoteDeviationPct = ((quotedCents - totalExpectedCents) / totalExpectedCents) * 100;
      if (quotedCents > totalExpectedCents) {
        savingsOpportunityCents = quotedCents - totalExpectedCents;
      }
    }

    const lowCents = Math.round(totalExpectedCents * 0.8);
    const highCents = Math.round(totalExpectedCents * 1.2);

    // Build per-component repair intelligence
    const repairIntelligence = damageAnalysis.damagedParts.map(comp => {
      const cost = estimateComponentCost(comp.name, comp.severity, "replace", labourRate);
      const action = comp.severity === "cosmetic" || comp.severity === "minor" ? "repair" : "replace";
      return {
        component: comp.name,
        location: comp.location,
        severity: comp.severity,
        recommendedAction: action,
        partsCost: Math.round(cost.partsCents / 100),
        labourCost: Math.round(cost.labourCents / 100),
        paintCost: Math.round(cost.paintCents / 100),
        totalCost: Math.round((cost.partsCents + cost.labourCents + cost.paintCents) / 100),
        currency,
        notes: comp.damageType === "pre-accident damage" ? "Pre-accident damage — may not be covered" : null,
      };
    });

    // Build parts reconciliation (quoted parts vs AI estimated)
    const partsReconciliation = damageAnalysis.damagedParts.map(comp => {
      const cost = estimateComponentCost(comp.name, comp.severity, "replace", labourRate);
      const aiEstimate = Math.round((cost.partsCents + cost.labourCents) / 100);
      return {
        component: comp.name,
        aiEstimate,
        quotedAmount: null as number | null, // populated when quote is available
        variance: null as number | null,
        variancePct: null as number | null,
        flag: null as string | null,
      };
    });

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
      repairIntelligence,
      partsReconciliation,
    };

    ctx.log("Stage 9", `Cost optimisation complete. Expected: ${(totalExpectedCents/100).toFixed(2)} ${currency}, Quoted: ${quotedCents ? (quotedCents/100).toFixed(2) : 'N/A'}, Deviation: ${quoteDeviationPct !== null ? quoteDeviationPct.toFixed(1) + '%' : 'N/A'}, Savings: ${(savingsOpportunityCents/100).toFixed(2)}`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 9", `Cost optimisation failed: ${String(err)} — producing baseline estimate`);

    return {
      status: "degraded",
      data: {
        expectedRepairCostCents: 350000,
        quoteDeviationPct: null,
        recommendedCostRange: { lowCents: 280000, highCents: 420000 },
        savingsOpportunityCents: 0,
        breakdown: {
          partsCostCents: 200000,
          labourCostCents: 100000,
          paintCostCents: 50000,
          hiddenDamageCostCents: 0,
          totalCents: 350000,
        },
        labourRateUsdPerHour: 40,
        marketRegion: "DEFAULT",
        currency: "USD",
        repairIntelligence: [],
        partsReconciliation: [],
      },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "costEstimate",
        assumedValue: "$3,500 baseline",
        reason: `Cost engine failed: ${String(err)}. Using baseline estimate of $3,500.`,
        strategy: "default_value",
        confidence: 10,
        stage: "Stage 9",
      }],
      recoveryActions: [{
        target: "cost_engine_error",
        strategy: "default_value",
        success: true,
        description: `Cost engine error caught. Using baseline estimate.`,
      }],
      degraded: true,
    };
  }
}
