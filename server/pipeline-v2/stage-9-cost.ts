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
import { deriveEconomicContext } from "./economicContextEngine";
import { computeIFE, type IFEReport } from "./inputFidelityEngine";
import { buildDOECandidates, runDOE, type DOEResult } from "./decisionOptimisationEngine";
import { extractCostLearningRecord } from "./costLearningRecorder";
import { insertCostLearningRecord, getActiveCalibrationMultiplier } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import { optimiseRepairCost, type InputQuote } from "./quoteOptimisationEngine";
import { runCostDecision } from "./costDecisionEngine";
import { reconcileDamageComponents } from "./damageReconciliationEngine";
import { evaluateMechanicalAlignment } from "./mechanicalAlignmentEvaluator";
import { generateCostIntelligenceNarrative } from "./costIntelligenceNarrative";
import { scoreCostReliability } from "./costReliabilityScorer";
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
  labourRate: number,
  _vehicleBodyType?: string,  // reserved for future use — do NOT apply multipliers; use quoted costs
  paintCostPerPanelUsd?: number  // per-tenant override; defaults to $45/panel
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
  // NOTE: No vehicle class multiplier applied. The submitted repair quote is the
  // authoritative cost source. These internal estimates are only used when no
  // quote is available and should never override a submitted quotation.
  // IMPORTANT: This function produces FALLBACK index estimates only.
  // When a quote or learning DB benchmark is available, use those instead.

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
  // Paint cost: use per-tenant rate if provided, otherwise use labour-rate-based estimate
  const paintPerPanel = paintCostPerPanelUsd ?? 45;
  const paintCents = action === "refinish" || action === "repair"
    ? Math.round(paintPerPanel * 100)
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
    // ── Tenant rate overrides: use configJson rates if set, else fall back to regional defaults
    const regionalLabourRate = LABOUR_RATES[region] || LABOUR_RATES.DEFAULT;
    const labourRate = ctx.tenantRates?.labourRateUsdPerHour ?? regionalLabourRate;
    const paintCostPerPanelUsd = ctx.tenantRates?.paintCostPerPanelUsd ?? 45; // default $45/panel
    // ── Cross-border detection: use extracted repairCountry/quoteCurrency from Stage 3 ──
    // For Zimbabwean policies (region=ZW) with repairs in South Africa (repairCountry=ZA),
    // the quote will be in ZAR. The policy is paid in USD/ZWL. We detect this from Stage 3
    // extraction and apply the correct normalisation in Stage 9.
    const extractedRepairCountry = stage3?.perDocumentExtractions?.[0]?.repairCountry ?? null;
    const extractedQuoteCurrency = stage3?.perDocumentExtractions?.[0]?.quoteCurrency ?? null;
    const isCrossBorderRepair = extractedRepairCountry !== null && extractedRepairCountry !== region;
    // Policy currency: tenant override > cross-border detection > regional default
    const currency = ctx.tenantRates?.currencyCode ??
      (isCrossBorderRepair && extractedRepairCountry === 'ZA' ? 'ZAR' :
       region === 'ZA' ? 'ZAR' :
       region === 'ZW' ? 'USD' : 'USD');
    // Quote currency: extracted > inferred from repairCountry > same as policy currency
    const quoteCurrencyCode = extractedQuoteCurrency ??
      (isCrossBorderRepair && extractedRepairCountry === 'ZA' ? 'ZAR' : currency);
    if (isCrossBorderRepair) {
      ctx.log('Stage 9', `Cross-border repair detected: policy region=${region}, repair in ${extractedRepairCountry}, quoteCurrency=${quoteCurrencyCode}, policyCurrency=${currency}`);
    }
    if (ctx.tenantRates?.labourRateUsdPerHour) {
      ctx.log("Stage 9", `Tenant rate override: labour $${labourRate}/hr (regional default: $${regionalLabourRate}/hr)`);
    }
    if (ctx.tenantRates?.paintCostPerPanelUsd) {
      ctx.log("Stage 9", `Tenant rate override: paint $${paintCostPerPanelUsd}/panel`);
    }

    // ── Learning DB Benchmark Query ─────────────────────────────────────────
    // Query historical settled costs for this vehicle make/model + region.
    // This is the primary source for the AI benchmark when no quote is present.
    // Priority: learning DB (sampleSize ≥ 3) > quote total > hardcoded fallback.
    let learningDbBenchmarkCents: number | null = null;
    let learningDbSampleSize = 0;
    let learningDbVehicleDescriptor = "";
    try {
      const { costLearningRecords } = await import("../../drizzle/schema");
      const dbConn = ctx.db;
      if (dbConn && claimRecord.vehicle?.make) {
        const vehicleDesc = `${(claimRecord.vehicle.make ?? "").toLowerCase()} ${(claimRecord.vehicle.model ?? "").toLowerCase()}`.trim();
        if (vehicleDesc) {
          const rows = await dbConn.select({
            avgCost: drizzleSql`AVG(final_cost_usd_cents)`.as("avg_cost"),
            cnt: drizzleSql`COUNT(*)`.as("cnt"),
          })
            .from(costLearningRecords)
            .where(drizzleSql`vehicle_descriptor LIKE ${`%${vehicleDesc}%`}`);
          const row = rows[0] as any;
          const rowCount = row ? Number(row.cnt) : 0;
          if (rowCount >= 3) {
            // Full confidence: 3+ claims
            learningDbBenchmarkCents = row.avgCost ? Math.round(Number(row.avgCost)) : null;
            learningDbSampleSize = rowCount;
            learningDbVehicleDescriptor = vehicleDesc;
            ctx.log("Stage 9", `Learning DB benchmark: ${learningDbSampleSize} historical claims for '${vehicleDesc}', avg=${learningDbBenchmarkCents} cents`);
          } else if (rowCount > 0 && row.avgCost) {
            // Sparse DB: 1-2 claims — use as a partial signal (stored for blending below)
            // Weight = rowCount / 3 (so 1 claim = 33%, 2 claims = 67% learning DB weight)
            learningDbBenchmarkCents = Math.round(Number(row.avgCost));
            learningDbSampleSize = rowCount;
            learningDbVehicleDescriptor = vehicleDesc;
            ctx.log("Stage 9",
              `Learning DB: ${rowCount} claim(s) for '${vehicleDesc}' (sparse — will blend with index fallback at ${Math.round(rowCount / 3 * 100)}% weight)`);
          }
        }
      }
    } catch (learningErr) {
      ctx.log("Stage 9", `Learning DB query failed (non-fatal): ${String(learningErr)}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COST BREAKDOWN: QUOTE-FIRST, THEN LEARNING DB, THEN INSUFFICIENT_DATA
    //
    // Priority order (no hardcoded values ever):
    //   1. Submitted quote(s) — quoteOptimisationEngine selects the best quote
    //      when multiple quotes exist. Parts/labour come from the highest-weighted
    //      quote's actual line items (only when parts_defined/labour_defined = true).
    //   2. Learning DB benchmark (≥3 historical settled claims for this vehicle).
    //   3. Sparse learning DB (1-2 claims) — used directly, low confidence.
    //   4. No data → aiEstimateSource = "insufficient_data", all zeros.
    //      The submitted quote total is still the authoritative cost (QUOTE-FIRST
    //      principle below), but no AI benchmark breakdown is fabricated.
    // ─────────────────────────────────────────────────────────────────────────

    // ── Step A: Run Quote Optimisation Engine FIRST ──────────────────────────
    // Build InputQuote[] from all extracted quotes in Stage 3.
    const optimisationInputQuotes: InputQuote[] = (stage3?.inputRecovery?.extracted_quotes ?? []).map(q => ({
      panel_beater: q.panel_beater ?? null,
      total_cost: q.total_cost ?? null,
      currency: q.currency ?? "USD",
      components: q.components ?? [],
      labour_defined: q.labour_defined ?? false,
      parts_defined: q.parts_defined ?? false,
      labour_cost: (q as any).labour_cost ?? null,
      parts_cost: (q as any).parts_cost ?? null,
      confidence: (q.confidence as "high" | "medium" | "low") ?? "low",
    }));
    // If no extracted quotes but there is a single quoted total from the claim record,
    // synthesise a single InputQuote so the optimisation engine can still run.
    if (optimisationInputQuotes.length === 0 && claimRecord.repairQuote.quoteTotalCents && claimRecord.repairQuote.quoteTotalCents > 0) {
      optimisationInputQuotes.push({
        panel_beater: claimRecord.repairQuote.repairerName ?? claimRecord.repairQuote.repairerCompany ?? "Assessor Quote",
        total_cost: claimRecord.repairQuote.quoteTotalCents / 100,
        currency,
        components: [],
        labour_defined: !!(claimRecord.repairQuote.labourCostCents),
        parts_defined: !!(claimRecord.repairQuote.partsCostCents),
        labour_cost: claimRecord.repairQuote.labourCostCents ? claimRecord.repairQuote.labourCostCents / 100 : null,
        parts_cost: claimRecord.repairQuote.partsCostCents ? claimRecord.repairQuote.partsCostCents / 100 : null,
        confidence: "medium",
      });
    }
    const quoteOptimisation = optimisationInputQuotes.length > 0
      ? optimiseRepairCost(
          optimisationInputQuotes,
          damageAnalysis.damagedParts.map(p => p.name),
          claimRecord.vehicle.bodyType || "vehicle"
        )
      : null;
    if (quoteOptimisation) {
      ctx.log("Stage 9", `Quote optimisation: optimised_cost=USD ${quoteOptimisation.optimised_cost_usd.toFixed(2)}, confidence=${quoteOptimisation.confidence}, spread=${quoteOptimisation.cost_spread_pct}%, selected=${quoteOptimisation.selected_quotes.length}/${quoteOptimisation.quotes_evaluated}`);
    }

    // ── Step B: Derive AI benchmark breakdown from real data only ─────────────
    let totalPartsCents = 0;
    let totalLabourCents = 0;
    let totalPaintCents = 0;
    let aiEstimateSource: "learning_db" | "quote_derived" | "hardcoded_fallback" | "insufficient_data" = "insufficient_data";
    let aiEstimateNote: string | null = null;

    // B1: If the highest-weighted selected quote has itemised parts AND labour, use those directly.
    const bestSelectedQuote = quoteOptimisation && quoteOptimisation.selected_quotes.length > 0
      ? [...quoteOptimisation.selected_quotes].sort((a, b) => b.weight - a.weight)[0]
      : null;
    if (bestSelectedQuote && (bestSelectedQuote as any).parts_cost !== null && (bestSelectedQuote as any).labour_cost !== null) {
      totalPartsCents = Math.round(((bestSelectedQuote as any).parts_cost as number) * 100);
      totalLabourCents = Math.round(((bestSelectedQuote as any).labour_cost as number) * 100);
      totalPaintCents = 0; // paint is not separately itemised in most quotes
      aiEstimateSource = "quote_derived";
      const quoteLabel = quoteOptimisation!.selected_quotes.length > 1
        ? `${quoteOptimisation!.selected_quotes.length} quotes (best: ${bestSelectedQuote.panel_beater})`
        : bestSelectedQuote.panel_beater;
      ctx.log("Stage 9", `Cost breakdown from quote line items [${quoteLabel}]: parts=${totalPartsCents} cents, labour=${totalLabourCents} cents`);
      assumptions.push({
        field: "costBreakdown",
        assumedValue: `Parts: USD ${(totalPartsCents/100).toFixed(2)}, Labour: USD ${(totalLabourCents/100).toFixed(2)} (from ${quoteLabel})`,
        reason: `Parts and labour costs taken directly from the submitted repair quote (${quoteLabel}). No AI estimation applied.`,
        strategy: "cross_document_search",
        confidence: 90,
        stage: "Stage 9",
      });
    } else if (learningDbBenchmarkCents && learningDbBenchmarkCents > 0) {
      // B2: Learning DB benchmark — use proportional allocation (50/35/15 is a
      // standard industry split for body repair, not a fabricated ratio).
      // This is only used when NO submitted quote has itemised parts/labour.
      totalPartsCents = Math.round(learningDbBenchmarkCents * 0.5);
      totalLabourCents = Math.round(learningDbBenchmarkCents * 0.35);
      totalPaintCents = Math.round(learningDbBenchmarkCents * 0.15);
      aiEstimateSource = "learning_db";
      const confLevel = learningDbSampleSize >= 3 ? 70 : 20 + Math.round((learningDbSampleSize / 3) * 35);
      ctx.log("Stage 9", `AI benchmark from learning DB: ${learningDbBenchmarkCents} cents (${learningDbSampleSize} historical claims for '${learningDbVehicleDescriptor}')`);
      assumptions.push({
        field: "totalExpectedCents",
        assumedValue: `Learning DB average: USD ${(learningDbBenchmarkCents / 100).toFixed(2)} (${learningDbSampleSize} claim${learningDbSampleSize !== 1 ? "s" : ""})`,
        reason: `AI benchmark derived from ${learningDbSampleSize} historical settled claim${learningDbSampleSize !== 1 ? "s" : ""} for '${learningDbVehicleDescriptor}'. ` +
                `Industry-standard body repair split applied (parts 50%, labour 35%, paint 15%). ` +
                (learningDbSampleSize < 3 ? `Confidence is low — fewer than 3 settled claims available.` : `Confidence is adequate (${learningDbSampleSize} claims).`),
        strategy: "industry_average",
        confidence: confLevel,
        stage: "Stage 9",
      });
    } else {
      // B3: No real data — do NOT fabricate costs.
      totalPartsCents = 0;
      totalLabourCents = 0;
      totalPaintCents = 0;
      aiEstimateSource = "insufficient_data";
      aiEstimateNote = "No historical repair data or itemised quote available for this vehicle. AI benchmark cannot be produced. Cost figures are based solely on the submitted repair quote total.";
      isDegraded = true;
      ctx.log("Stage 9", `AI benchmark unavailable: no learning DB data for '${learningDbVehicleDescriptor ?? "unknown vehicle"}'. Cost will be based on submitted quote total only.`);
      assumptions.push({
        field: "totalExpectedCents",
        assumedValue: "Insufficient data — no AI benchmark produced",
        reason: "No historical settled claims exist for this vehicle type in the learning database, and the submitted quote does not contain itemised parts/labour figures. " +
                "The AI benchmark requires at least 1 settled claim or itemised quote to produce a reliable estimate.",
        strategy: "industry_average",
        confidence: 0,
        stage: "Stage 9",
      });
    }
    if (damageAnalysis.damagedParts.length === 0 && aiEstimateSource !== "quote_derived") {
      isDegraded = true;
    }

        // Hidden damage allowance
    let hiddenDamageCents = 0;
    if (physicsAnalysis.physicsExecuted) {
      const latent = physicsAnalysis.latentDamageProbability;
      const latentTotal = (latent.engine + latent.transmission + latent.suspension + latent.frame + latent.electrical) / 5;
      hiddenDamageCents = Math.round(totalPartsCents * latentTotal * 0.3);
    }

    let totalExpectedCents = totalPartsCents + totalLabourCents + totalPaintCents + hiddenDamageCents;

    // ── Calibration Override: apply approved jurisdiction multiplier ──────────
    // Look up the most recent approved calibration override for this tenant+region.
    // The multiplier corrects systematic AI over/under-estimation (e.g. 0.85 = AI
    // overestimates by ~18%, so we reduce the estimate by 15%).
    try {
      const tenantId = (ctx as any).tenantId ? String((ctx as any).tenantId) : null;
      const calibMultiplier = await getActiveCalibrationMultiplier(
        tenantId,
        region, // marketRegion (e.g. 'ZW', 'ZA', 'global')
        claimRecord.accidentDetails?.incidentType ?? null
      );
      if (calibMultiplier !== 1.0) {
        const before = totalExpectedCents;
        totalExpectedCents = Math.round(totalExpectedCents * calibMultiplier);
        ctx.log(
          "Stage 9",
          `Calibration override applied: multiplier=${calibMultiplier.toFixed(3)}, ` +
          `cost adjusted from ${before} to ${totalExpectedCents} cents ` +
          `(jurisdiction=${region}, tenant=${tenantId ?? 'none'})`
        );
        assumptions.push({
          field: "totalExpectedCents",
          assumedValue: `×${calibMultiplier.toFixed(3)} calibration multiplier`,
          reason: `Approved jurisdiction calibration override for region '${region}' ` +
                  `adjusted AI cost estimate by ${((calibMultiplier - 1) * 100).toFixed(1)}%.`,
          strategy: "industry_average",
          confidence: 85,
          stage: "Stage 9",
        });
      }
    } catch (calibErr) {
      ctx.log("Stage 9", `Calibration override lookup failed (non-fatal): ${String(calibErr)}`);
    }

    // WI-4: AGREED COST GATE
    // If the claim record has an agreedCostCents (a signed/negotiated amount from the
    // assessor or insurer), it takes absolute priority over the raw quoteTotalCents.
    // This prevents the AI estimate from overriding a signed document value.
    const agreedCostFromExtraction = claimRecord.repairQuote.agreedCostCents;
    if (agreedCostFromExtraction && agreedCostFromExtraction > 0) {
      ctx.log("Stage 9", `WI-4 AGREED COST GATE: agreedCostCents=${agreedCostFromExtraction} cents (USD ${(agreedCostFromExtraction/100).toFixed(2)}) is present — using as authoritative cost. quoteTotalCents will be used for deviation analysis only.`);
    }

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

    // ── QUOTE-FIRST PRINCIPLE ────────────────────────────────────────────────
    // When a submitted repair quote is present, it is the authoritative cost
    // source. The internal AI estimate (totalExpectedCents) becomes a reference
    // benchmark for deviation analysis only — it must NOT override the quote.
    // Internal estimates are only used when no quote has been submitted.
    const aiEstimatedCents = totalExpectedCents; // preserve for deviation analysis
    if (quotedCents && quotedCents > 0) {
      totalExpectedCents = quotedCents;
      ctx.log("Stage 9", `QUOTE-FIRST: Using submitted quote (${quotedCents} cents) as primary cost. AI estimate (${aiEstimatedCents} cents) used for deviation analysis only.`);
      assumptions.push({
        field: "totalExpectedCents",
        assumedValue: `Submitted quote: ${(quotedCents / 100).toFixed(2)} USD`,
        reason: "Submitted repair quote is present and used as the authoritative cost source. AI internal estimate is retained as a benchmark only.",
        strategy: "cross_document_search",
        confidence: 95,
        stage: "Stage 9",
      });
    }

    let quoteDeviationPct: number | null = null;
    let savingsOpportunityCents = 0;

    // Deviation is now: how much does the quote differ from the AI benchmark?
    if (quotedCents && quotedCents > 0 && aiEstimatedCents > 0) {
      quoteDeviationPct = ((quotedCents - aiEstimatedCents) / aiEstimatedCents) * 100;
      if (quotedCents > aiEstimatedCents) {
        savingsOpportunityCents = quotedCents - aiEstimatedCents;
      }
    }

    // CRITICAL FIX: recommendedCostRange must always be based on the AI benchmark estimate,
    // NOT on totalExpectedCents which has been overwritten to the submitted quote by QUOTE-FIRST.
    // The range represents "what AI thinks is a fair cost" — independent of what was quoted.
    // This prevents the paradox of the AI benchmark sitting outside its own "fair range".
    const rangeBaseCents = aiEstimatedCents > 0 ? aiEstimatedCents : totalExpectedCents;
    const lowCents = Math.round(rangeBaseCents * 0.8);
    const highCents = Math.round(rangeBaseCents * 1.2);

    // Build per-component repair intelligence
    // NOTE: Per-component cost estimates are NOT produced here because we have no
    // reliable per-component cost data without a learning DB or itemised quote.
    // The component list is informational only — it shows what was damaged and
    // the recommended repair action. Cost figures come from the submitted quote.
    const repairIntelligence = damageAnalysis.damagedParts.map(comp => {
      const action = comp.severity === "cosmetic" || comp.severity === "minor" ? "repair" : "replace";
      return {
        component: comp.name,
        location: comp.location,
        severity: comp.severity,
        recommendedAction: action,
        partsCost: null as number | null,   // not estimated — see submitted quote
        labourCost: null as number | null,  // not estimated — see submitted quote
        paintCost: null as number | null,   // not estimated — see submitted quote
        totalCost: null as number | null,   // not estimated — see submitted quote
        currency,
        notes: comp.damageType === "pre-accident damage" ? "Pre-accident damage — may not be covered" : null,
      };
    });

    // Build parts reconciliation (quoted parts vs AI estimated)
    // Step 1: Run semantic damage-vs-quote reconciliation if quote components are available
    const quoteComponents: string[] = stage3?.inputRecovery?.extracted_quotes
      ?.flatMap(q => q.components ?? []) ?? [];

    // Build a line_items lookup: normalised component name → { line_total, currency }
    // Uses the best available quote (highest confidence, then highest total_cost)
    const allLineItems = (stage3?.inputRecovery?.extracted_quotes ?? [])
      .slice()
      .sort((a, b) => {
        const confOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const confDiff = (confOrder[b.confidence] ?? 0) - (confOrder[a.confidence] ?? 0);
        if (confDiff !== 0) return confDiff;
        return (b.total_cost ?? 0) - (a.total_cost ?? 0);
      })
      .flatMap(q => ((q as any).line_items ?? []).map((li: any) => ({ ...li, quoteCurrency: (q as any).currency ?? currency })));

    // Map: normalised component name → { line_total, quoteCurrency }
    const lineItemMap = new Map<string, { line_total: number; quoteCurrency: string }>();
    for (const li of allLineItems) {
      if (li.line_total !== null && li.line_total > 0) {
        const key = (li.component as string).toLowerCase().trim();
        if (!lineItemMap.has(key)) {
          lineItemMap.set(key, { line_total: li.line_total, quoteCurrency: li.quoteCurrency });
        }
      }
    }

    const damageComponentNames = damageAnalysis.damagedParts.map(p => p.name);

    const reconciliation = quoteComponents.length > 0
      ? reconcileDamageComponents(damageComponentNames, quoteComponents)
      : null;

    // SAFEGUARD: Preserve original component names from the claim form (SA nomenclature).
    // Do NOT normalise or translate part names — use exactly what the claimant/assessor wrote.
    // aiEstimate is null — we do not produce per-component cost estimates without real data.
    const partsReconciliation = damageAnalysis.damagedParts.map(comp => {
      // Find if this component was matched in the reconciliation
      const matched = reconciliation?.matched.find(m => m.damage_component === comp.name.toLowerCase());
      const isMissing = reconciliation?.missing.some(m => m.component === comp.name.toLowerCase());

      // Look up per-component quoted amount from line_items
      // Try exact match first, then fuzzy match via the reconciliation engine's matched quote_component
      const compKey = comp.name.toLowerCase().trim();
      let quotedEntry = lineItemMap.get(compKey);
      if (!quotedEntry && matched?.quote_component) {
        quotedEntry = lineItemMap.get(matched.quote_component.toLowerCase().trim());
      }
      const quotedAmount = quotedEntry?.line_total ?? null;
      const quotedCurrency = quotedEntry?.quoteCurrency ?? null;

      return {
        component: comp.name,
        aiEstimate: null as number | null, // not estimated — no reliable per-component cost data
        quotedAmount,
        quotedCurrency,
        variance: null as number | null,
        variancePct: null as number | null,
        flag: isMissing
          ? `missing_from_quote`
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
      market_value_usd: claimRecord.valuation?.marketValueUsd
        ?? (ctx.claim?.vehicleMarketValue != null ? (ctx.claim.vehicleMarketValue as number) / 100 : null),
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

    // Step 4b: Score cost reliability
    const costReliability = scoreCostReliability({
      number_of_quotes: narrativeInput.quote_count,
      presence_of_assessor_cost: narrativeInput.agreed_cost_usd !== null,
      alignment_status: alignmentResult?.alignment_status ?? null,
      flags: narrativeInput.flags,
    });

    // Step 4c: Run Claims Cost Decision Engine
    // WI-4: QUOTATION-FIRST RULE
    // Use the actual submitted quotation as the authoritative cost in ALL cases
    // where a quotation document is present — whether signed or unsigned.
    // Priority order:
    //   1. agreedCostCents (signed/negotiated amount from assessor annotation)
    //   2. quoteTotalCents (submitted quote total, signed or unsigned)
    //   3. recovered_quote from input recovery pass
    //   4. null → PRE_ASSESSMENT mode (AI estimate used as benchmark only)
    const agreedCostUsd =
      (agreedCostFromExtraction && agreedCostFromExtraction > 0)
        ? agreedCostFromExtraction / 100
        : (quotedCents && quotedCents > 0)
          ? quotedCents / 100
          : null;
    const costDecision = (() => {
      try {
        return runCostDecision({
          cost_mode: agreedCostUsd ? "POST_ASSESSMENT" : "PRE_ASSESSMENT",
          agreed_cost_usd: agreedCostUsd,
          optimised_cost: quoteOptimisation ? {
            optimised_cost_usd: quoteOptimisation.optimised_cost_usd,
            selected_quotes: quoteOptimisation.selected_quotes.map(q => ({
              panel_beater: q.panel_beater,
              total_cost: q.total_cost,
              structurally_complete: q.structurally_complete,
              structural_gaps: q.structural_gaps,
              is_outlier: q.is_outlier,
              coverage_ratio: q.coverage_ratio,
            })),
            excluded_quotes: quoteOptimisation.excluded_quotes.map(q => ({
              panel_beater: q.panel_beater,
              total_cost: q.total_cost,
              reason: q.reason,
              exclusion_category: q.exclusion_category,
            })),
            cost_spread_pct: quoteOptimisation.cost_spread_pct,
            confidence: quoteOptimisation.confidence,
            total_structural_gaps: quoteOptimisation.total_structural_gaps,
            median_cost_usd: quoteOptimisation.median_cost_usd,
          } : null,
          extracted_quotes: (stage3?.inputRecovery?.extracted_quotes ?? []).map(q => ({
            panel_beater: q.panel_beater ?? null,
            total_cost: q.total_cost ?? null,
            currency: q.currency ?? currency,
          })),
          damage_components: damageComponentNames,
          cost_reliability: costReliability ? {
            confidence_level: costReliability.confidence_level,
            confidence_score: costReliability.score_breakdown.final_score,
            reason: costReliability.reason,
          } : null,
          alignment_result: alignmentResult ? {
            alignment_status: alignmentResult.alignment_status,
            critical_missing: alignmentResult.critical_missing,
            unrelated_items: alignmentResult.unrelated_items,
            engineering_comment: alignmentResult.engineering_comment,
            coverage_ratio: alignmentResult.coverage_ratio,
            structural_coverage_ratio: alignmentResult.structural_coverage_ratio,
          } : null,
          ai_estimate_usd: totalExpectedCents / 100,
          currency,
        });
      } catch (decisionErr) {
        ctx.log("Stage 9", `Cost decision engine failed (non-fatal): ${String(decisionErr)}`);
        return null;
      }
    })();
    if (costDecision) {
      ctx.log("Stage 9", `Cost decision: basis=${costDecision.cost_basis}, true_cost=USD ${costDecision.true_cost_usd.toFixed(2)}, recommendation=${costDecision.recommendation}, confidence=${costDecision.confidence}, anomalies=${costDecision.anomalies.length}`);
    }

    // Stage 26: apply defensive contract — add top-level ai_estimate, parts, labour, fair_range
    // Include documented quote values from the extracted claim document so db.ts
    // can persist them into costIntelligenceJson for the UI to display correctly.
    const documentedOriginalQuoteUsd = quotedCents ? quotedCents / 100 : null;
    const documentedAgreedCostUsd = claimRecord.repairQuote.agreedCostCents
      ? claimRecord.repairQuote.agreedCostCents / 100
      : null;
    // Phase 2B: Derive economic context from policy/tenant configuration
    let economicContext = null;
    try {
      economicContext = await deriveEconomicContext({
        tenantId: claimRecord.tenantId ? String(claimRecord.tenantId) : null,
        primaryCurrency: ctx.tenantRates?.currencyCode ?? currency,
        primaryCurrencySymbol: ctx.tenantRates?.currencySymbol ?? (currency === 'ZAR' ? 'R' : currency === 'ZMW' ? 'K' : '$'),
        labourRateUsdPerHour: labourRate,
        marketRegion: region,
      });
      // Propagate inflation flags from the learning database if available
      if (economicContext && costDecision?.anomalies) {
        const hasPartsInflation = costDecision.anomalies.some(a => a.category === 'overpricing' && a.severity === 'high');
        const hasLabourInflation = costDecision.anomalies.some(a => a.description?.toLowerCase().includes('labour'));
        economicContext = { ...economicContext, partsInflationDetected: hasPartsInflation, labourInflationDetected: hasLabourInflation };
      }
      ctx.log("Stage 9", `Economic context: ${economicContext.currency} (NCI=${economicContext.normalisedCostIndex.toFixed(4)}, PPP=${economicContext.pppFactor}, parts=${economicContext.partsSourceProfile}, rate_source=${economicContext.exchangeRateSource})`);
    } catch (eceErr) {
      ctx.log("Stage 9", `Economic context derivation failed (non-fatal): ${eceErr}`);
    }

    // ── Phase 4A: Input Fidelity Engine (IFE) ──────────────────────────────────
    // Compute 4-class data attribution and DOE eligibility gate.
    // Run AFTER economic context so we have the full extraction picture.
    let ifeResult: IFEReport | null = null;
    try {
      const primaryDocType = (claimRecord as any).documents?.[0]?.documentType ?? null;
      ifeResult = computeIFE({
        extractedFields: {
          claimantName:         claimRecord.driver?.claimantName ?? null,
          vehicleMake:          claimRecord.vehicle?.make ?? null,
          vehicleModel:         claimRecord.vehicle?.model ?? null,
          vehicleYear:          claimRecord.vehicle?.year ?? null,
          vehicleRegistration:  claimRecord.vehicle?.registration ?? null,
          incidentDate:         claimRecord.accidentDetails?.date ?? null,
          incidentDescription:  claimRecord.damage?.description ?? null,
          repairQuoteTotal:     claimRecord.repairQuote?.quoteTotalCents ?? null,
          agreedCost:           claimRecord.repairQuote?.agreedCostCents ?? null,
          policyNumber:         (claimRecord as any).policy?.policyNumber ?? null,
          insuredValue:         (claimRecord as any).policy?.insuredValueCents ?? null,
          excess:               (claimRecord as any).policy?.excessAmountCents ?? null,
          driverLicence:        (claimRecord as any).driver?.licenseNumber ?? null,
        },
        extractionConfidence: stage3?.perDocumentExtractions?.[0] ? 0.75 : 0.5,
        primaryDocumentType: primaryDocType,
        documentHasOtherFields: !!(claimRecord.vehicle?.make || claimRecord.driver?.claimantName),
      });
      ctx.log("Stage 9", `IFE: completeness=${ifeResult.completenessScore}%, doeEligible=${ifeResult.doeEligible}, gaps=${ifeResult.gapCount}`);
    } catch (ifeErr) {
      ctx.log("Stage 9", `IFE computation failed (non-fatal): ${String(ifeErr)}`);
    }

    // ── Phase 4A: Decision Optimisation Engine (DOE) ─────────────────────────
    // Runs AFTER IFE gate check. Cross-border currency normalisation applied:
    // ZW vehicle damaged in SA → quotes in ZAR converted to policy currency (USD/ZWL).
    let doeResult: DOEResult | null = null;
    try {
      if (quoteOptimisation && quoteOptimisation.selected_quotes.length > 0) {
        const policyCurrency = ctx.tenantRates?.currencyCode ?? currency;
        const exchangeRate = economicContext?.exchangeRateToUsd ?? 1;
        // Cross-border: if quote is in ZAR but policy is in USD, convert ZAR→USD
        // ZAR/USD rate: use ECE exchange rate if available, else use a safe fallback
        const zarToUsdRate = (quoteCurrencyCode === 'ZAR' && policyCurrency === 'USD')
          ? (economicContext?.exchangeRateToUsd ?? (1 / 18.5)) // ~18.5 ZAR per USD fallback
          : null;
        const candidates = buildDOECandidates({
          selectedQuotes: quoteOptimisation.selected_quotes.map(q => ({
            panel_beater: q.panel_beater,
            total_cost: zarToUsdRate !== null
              ? q.total_cost * zarToUsdRate  // ZAR → USD
              : (policyCurrency !== 'USD' && exchangeRate > 0
                ? q.total_cost / exchangeRate
                : q.total_cost),
            coverage_ratio: q.coverage_ratio,
            structurally_complete: q.structurally_complete,
            structural_gaps: q.structural_gaps,
            confidence: q.confidence,
          })),
          excludedQuotes: quoteOptimisation.excluded_quotes.map(q => ({
            panel_beater: q.panel_beater,
            total_cost: q.total_cost !== null && policyCurrency !== 'USD' && exchangeRate > 0
              ? q.total_cost / exchangeRate
              : (q.total_cost ?? 0),
            reason: q.reason,
            confidence: 'low' as const,
          })),
          currency: policyCurrency,
          overallFraudRisk: (ctx as any).fraudRiskLevel ?? 'low',
          fraudSignal: null,
          turnaroundDays: null,
        });
        const benchmarkInPolicyCurrency = policyCurrency !== 'USD' && exchangeRate > 0
          ? (totalExpectedCents / 100) / exchangeRate
          : totalExpectedCents / 100;
        const fcdiForDOE = ifeResult
          ? Math.max(0, 100 - ifeResult.fcdiSystemFailurePenaltyReduction)
          : 50;
        doeResult = runDOE({
          candidates,
          benchmarkCost: benchmarkInPolicyCurrency,
          fcdiScore: fcdiForDOE,
          inputCompletenessScore: ifeResult?.completenessScore ?? 50,
          doeEligible: ifeResult?.doeEligible ?? false,
          doeIneligibilityReason: ifeResult?.doeIneligibilityReason ?? null,
        });
        ctx.log("Stage 9", `DOE: status=${doeResult.status}, selected=${doeResult.selectedPanelBeater ?? 'none'}, confidence=${doeResult.decisionConfidence}`);
      } else {
        ctx.log("Stage 9", `DOE skipped: no selected quotes available`);
      }
    } catch (doeErr) {
      ctx.log("Stage 9", `DOE computation failed (non-fatal): ${String(doeErr)}`);
    }

    const output = ensureCostContract({
      expectedRepairCostCents: totalExpectedCents,
      reconciliationSummary,
      alignmentResult,
      costNarrative,
      costReliability,
      quoteOptimisation: quoteOptimisation ?? null,
      costDecision: costDecision ?? null,
      quoteDeviationPct,
      recommendedCostRange: { lowCents, highCents },
      // Transparency fields — tell the adjuster what data underpins the AI benchmark
      // Values: "learning_db" | "quote_derived" | "hardcoded_fallback" | "insufficient_data"
      aiEstimateSource,
      aiEstimateNote,
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
      // Documented quote values from the extracted claim document — passed through
      // to db.ts costIntelligenceJson so the UI can display the correct amounts.
      documentedOriginalQuoteUsd,
      documentedAgreedCostUsd,
      panelBeaterName: claimRecord.repairQuote.repairerName ?? claimRecord.repairQuote.repairerCompany ?? null,
      documentedLabourCostUsd: claimRecord.repairQuote.labourCostCents ? claimRecord.repairQuote.labourCostCents / 100 : null,
      documentedPartsCostUsd: claimRecord.repairQuote.partsCostCents ? claimRecord.repairQuote.partsCostCents / 100 : null,
      economicContext,
      ifeResult: ifeResult ?? null,
      doeResult: doeResult ?? null,
      // Multi-quote comparison — populated when multiple quotes were submitted.
      // bestSelectedQuote is the highest-weighted quote from quoteOptimisationEngine.
      // Its parts_cost and labour_cost are the authoritative breakdown when itemised.
      bestSelectedQuote: bestSelectedQuote
        ? {
            panel_beater: bestSelectedQuote.panel_beater,
            total_cost: bestSelectedQuote.total_cost,
            parts_cost: (bestSelectedQuote as any).parts_cost ?? null,
            labour_cost: (bestSelectedQuote as any).labour_cost ?? null,
            coverage_ratio: bestSelectedQuote.coverage_ratio,
            weight: bestSelectedQuote.weight,
            structurally_complete: bestSelectedQuote.structurally_complete,
            structural_gaps: bestSelectedQuote.structural_gaps,
          }
        : null,
      quoteCount: optimisationInputQuotes.length,
      // Market value — used by costIntelligenceJson for total-loss threshold display
      marketValueUsd: claimRecord.valuation?.marketValueUsd
        ?? (ctx.claim?.vehicleMarketValue != null ? (ctx.claim.vehicleMarketValue as number) / 100 : null),
    }, isDegraded ? "degraded_estimate" : "success");

    ctx.log("Stage 9", `Cost optimisation complete. Expected: ${(totalExpectedCents/100).toFixed(2)} ${currency}, Quoted: ${quotedCents ? (quotedCents/100).toFixed(2) : 'N/A'}, Deviation: ${quoteDeviationPct !== null ? quoteDeviationPct.toFixed(1) + '%' : 'N/A'}, Savings: ${(savingsOpportunityCents/100).toFixed(2)}`);

    // Step 5: Extract and persist cost intelligence learning record
    // VALIDATED-OUTCOMES-ONLY POLICY: only records with assessor_validated or
    // high-confidence system_optimised cost basis are stored.
    try {
      // Derive accident severity for the learning recorder — map pipeline AccidentSeverity
      // (which includes "none", "cosmetic", "catastrophic") to the recorder's 4-tier type
      const rawSeverity = physicsAnalysis.accidentSeverity;
      const mappedSeverity: "minor" | "moderate" | "severe" | "total_loss" =
        rawSeverity === "catastrophic" || rawSeverity === "severe" ? "severe"
        : rawSeverity === "moderate" ? "moderate"
        : "minor"; // none, cosmetic, minor all map to minor

      const { record: learningRecord, rejection } = extractCostLearningRecord({
        claimId: claimRecord.claimId,
        vehicleType: claimRecord.vehicle.bodyType,
        vehicleMake: claimRecord.vehicle.make,
        vehicleModel: claimRecord.vehicle.model,
        damageComponents: damageAnalysis.damagedParts
          .filter(p => ["cosmetic","minor","moderate","severe","catastrophic"].includes(p.severity))
          .map(p => ({
            name: p.name,
            severity: p.severity as "cosmetic" | "minor" | "moderate" | "severe" | "catastrophic",
            repairAction: (p.severity === "cosmetic" || p.severity === "minor" ? "repair" : "replace") as "repair" | "replace",
            // estimatedCostCents is null — we do not produce per-component estimates without real data.
            // The learning recorder will use the true_cost_usd from costDecisionEngine instead.
            estimatedCostCents: null,
          })),
        // TRUE COST from costDecisionEngine — validated outcome only
        trueCostUsd: costDecision?.true_cost_usd ?? null,
        costBasis: costDecision?.cost_basis ?? null,
        decisionConfidence: costDecision?.confidence ?? undefined,
        accidentSeverity: mappedSeverity,
        selectedQuoteComponents: quoteComponents,
        collisionDirection: claimRecord.accidentDetails.collisionDirection,
        marketRegion: region,
        // Legacy fallback: used only if costDecision is unavailable
        finalCostCents: quotedCents ?? null,
      });

      if (rejection) {
        ctx.log("Stage 9", `Cost learning record not stored (policy): ${rejection.rejection_reason}`);
      } else if (learningRecord) {
        // Fire-and-forget persistence — never block the pipeline
        insertCostLearningRecord(learningRecord, claimRecord.tenantId ? String(claimRecord.tenantId) : null)
          .catch(e => ctx.log("Stage 9", `Cost learning record persistence failed: ${String(e)}`));
        ctx.log("Stage 9", `Cost learning record stored: ${learningRecord.case_signature}, tier=${learningRecord.cost_tier}, drivers: [${learningRecord.high_cost_drivers.join(", ")}]`);
      }
    } catch (learningErr) {
      ctx.log("Stage 9", `Cost learning extraction failed (non-fatal): ${String(learningErr)}`);
    }

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
