/**
 * pipeline-v2/stage-9-cost.ts
 *
 * STAGE 9 — COST OPTIMISATION ENGINE (Self-Healing)
 *
 * Computes expected repair cost, compares to quoted cost,
 * and identifies savings opportunities.
 * NEVER halts — produces estimated costs even with minimal data.
 */

import { ensureCostContract } from "./engineFallback";
import { reconcileDamageComponents } from "./damageReconciliationEngine";
import { evaluateMechanicalAlignment } from "./mechanicalAlignmentEvaluator";
import { generateCostIntelligenceNarrative } from "./costIntelligenceNarrative";
import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage3Output,
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
  physicsAnalysis: Stage7Output,
  stage3?: Stage3Output
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

    // FIX (2026-03-21): If the claim record has no quote (quoteTotalCents is null/0)
    // but the input recovery pass found a quote in the raw document text, use the
    // recovered value so quoteDeviationPct is calculated against the correct baseline.
    let quotedCents = claimRecord.repairQuote.quoteTotalCents;
    if ((!quotedCents || quotedCents <= 0) && stage3?.inputRecovery?.recovered_quote) {
      const rq = stage3.inputRecovery.recovered_quote;
      quotedCents = Math.round(rq.total * 100); // convert USD to cents
      ctx.log("Stage 9", `Quote not in ClaimRecord — using recovered quote: USD ${rq.total} (${rq.confidence}, source: ${rq.source})`);
      recoveryActions.push({
        target: "quotedCents",
        strategy: "cross_document_search",
        success: true,
        description: `quoteTotalCents was null. Recovered from input recovery: USD ${rq.total} (confidence: ${rq.confidence}, source: ${rq.source}).`,
        recoveredValue: quotedCents,
      });
    }
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
    // Step 1: Run semantic damage-vs-quote reconciliation if quote components are available
    const quoteComponents: string[] = stage3?.inputRecovery?.extracted_quotes
      ?.flatMap(q => q.components ?? []) ?? [];
    const damageComponentNames = damageAnalysis.damagedParts.map(p => p.name);

    const reconciliation = quoteComponents.length > 0
      ? reconcileDamageComponents(damageComponentNames, quoteComponents)
      : null;

    const partsReconciliation = damageAnalysis.damagedParts.map(comp => {
      const cost = estimateComponentCost(comp.name, comp.severity, "replace", labourRate);
      const aiEstimate = Math.round((cost.partsCents + cost.labourCents) / 100);

      // Find if this component was matched in the reconciliation
      const matched = reconciliation?.matched.find(m => m.damage_component === comp.name.toLowerCase());
      const isMissing = reconciliation?.missing.some(m => m.component === comp.name.toLowerCase());

      return {
        component: comp.name,
        aiEstimate,
        quotedAmount: null as number | null, // populated when per-component quote amounts are available
        variance: null as number | null,
        variancePct: null as number | null,
        flag: isMissing
          ? `missing_from_quote${matched ? '' : ''}`
          : matched
          ? null
          : null,
        reconciliation_status: reconciliation
          ? (matched ? "matched" : isMissing ? "missing_from_quote" : "unmatched")
          : "no_quote_available",
        is_structural: comp.name ? /radiator support|bumper bracket|chassis|sill|diff connector|differential connector/i.test(comp.name) : false,
      };
    });

    // Step 2: Run mechanical alignment evaluation
    const physicsSummaryText =
      (claimRecord as unknown as Record<string, unknown>).accidentDescription as string ||
      stage3?.inputRecovery?.accident_description ||
      "Unknown impact";
    const alignmentResult = quoteComponents.length > 0
      ? evaluateMechanicalAlignment(damageComponentNames, quoteComponents, physicsSummaryText)
      : null;

    // Attach the full reconciliation summary to the output
    const reconciliationSummary = reconciliation ? {
      matched_count: reconciliation.matched.length,
      missing_count: reconciliation.missing.length,
      extra_count: reconciliation.extra.length,
      coverage_ratio: reconciliation.coverage_ratio,
      structural_gaps: reconciliation.structural_gaps,
      summary: reconciliation.summary,
      missing: reconciliation.missing,
      extra: reconciliation.extra,
    } : null;

    // Step 3: Generate cost intelligence narrative for decision panel
    const extractedQuotes = stage3?.inputRecovery?.extracted_quotes ?? [];
    const narrativeInput = {
      quotes: extractedQuotes.map((q, i) => ({
        quote_id: `q${i + 1}`,
        panel_beater: q.panel_beater ?? "Unknown",
        total_cost: q.total_cost ?? 0,
        currency: q.currency ?? "USD",
      })),
      selected_quote_id: extractedQuotes.length > 0 ? "q1" : "",
      agreed_cost_usd: quotedCents ? quotedCents / 100 : null,
      ai_estimate_usd: totalExpectedCents / 100,
      market_value_usd: (claimRecord as unknown as Record<string, unknown>).marketValueCents
        ? ((claimRecord as unknown as Record<string, number>).marketValueCents) / 100
        : null,
      median_cost: extractedQuotes.length > 1
        ? [...extractedQuotes].sort((a, b) => (a.total_cost ?? 0) - (b.total_cost ?? 0))[Math.floor(extractedQuotes.length / 2)]?.total_cost ?? null
        : null,
      flags: [
        ...(reconciliation && reconciliation.structural_gaps.length > 0 ? ["structural_gap"] : []),
        ...(stage3?.inputRecovery?.failure_flags ?? []),
      ],
      alignment_status: alignmentResult?.alignment_status ?? null,
      critical_missing: alignmentResult?.critical_missing.map(c => c.component) ?? [],
      unrelated_items: alignmentResult?.unrelated_items.map(u => u.component) ?? [],
      engineering_comment: alignmentResult?.engineering_comment ?? null,
      coverage_ratio: alignmentResult?.coverage_ratio ?? null,
      assessor_name: (claimRecord as unknown as Record<string, unknown>).assessorName as string | null ?? null,
      quote_count: extractedQuotes.length > 0 ? extractedQuotes.length : (quotedCents ? 1 : 0),
    };
    const costNarrative = narrativeInput.quotes.length > 0 || narrativeInput.agreed_cost_usd
      ? generateCostIntelligenceNarrative(narrativeInput)
      : null;

    // Stage 26: apply defensive contract — add top-level ai_estimate, parts, labour, fair_range
    const output = ensureCostContract({
      expectedRepairCostCents: totalExpectedCents,
      reconciliationSummary,
      alignmentResult,
      costNarrative,
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
    }, isDegraded ? "degraded_estimate" : "success");

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

    // Stage 26: apply defensive contract — mark all fallback fields, add top-level required fields
    return {
      status: "degraded",
      data: ensureCostContract({}, `engine_failure: ${String(err)}`),
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
