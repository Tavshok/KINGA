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
import { insertCostLearningRecord, getActiveCalibrationMultiplier, getComponentBenchmarks, getComponentBenchmarksFromTrainingData } from "../db";
import { assessCost } from "./mlBenchmarkEngine";
import { resolveComponent } from "../../shared/vehicleParts";
import { sql as drizzleSql } from "drizzle-orm";
import { optimiseRepairCost, type InputQuote, buildCompositeQuote, classifyComponents, computeProbableHiddenDamage, type InputQuoteWithLineItems, type BenchmarkMap } from "./quoteOptimisationEngine";
import { buildCanonicalQuoteLedger } from "./canonicalQuoteLedger";
import { runCostDecision } from "./costDecisionEngine";
import { runCrossQuoteGapAnalysis, type CrossQuoteGapAnalysisResult } from "./crossQuoteGapAnalysis";
import { runQuotePhotoAgreement, type QuotePhotoAgreementResult } from "./quotePhotoAgreementEngine";
import { reconcileDamageComponents } from "./damageReconciliationEngine";
import { evaluateMechanicalAlignment } from "./mechanicalAlignmentEvaluator";
import { generateCostIntelligenceNarrative } from "./costIntelligenceNarrative";
import { scoreCostReliability } from "./costReliabilityScorer";
import { getDefaultCurrencyForCountry, COUNTRY_CURRENCY_MAP } from '../../shared/countryCurrency';
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

// Labour rates in USD/hour by country code (ISO 3166-1 alpha-2).
// ZW and ZA rates were validated against 892 real processed claims (R-E-02).
// All other entries below are PROVISIONAL ESTIMATES with no real claims data to
// verify against. They are informed by regional labour market context but should
// be treated as placeholders and recalibrated once each country has sufficient
// processing volume — the same way ZW/ZA were corrected from real data.
const LABOUR_RATES: Record<string, number> = {
  // Validated against real claims data
  ZW: 25,   // Zimbabwe — validated (R-E-02, 892 USD quotes)
  ZA: 35,   // South Africa — validated (R-E-02)
  US: 75,   // United States
  UK: 65,   // United Kingdom
  AU: 60,   // Australia
  // PROVISIONAL — no real claims data yet; recalibrate once volume exists per country
  ZM: 20,   // Zambia — provisional estimate
  BW: 30,   // Botswana — provisional estimate
  NA: 33,   // Namibia — provisional estimate
  MZ: 18,   // Mozambique — provisional estimate
  KE: 22,   // Kenya — provisional estimate
  TZ: 18,   // Tanzania — provisional estimate
  UG: 17,   // Uganda — provisional estimate
  MW: 15,   // Malawi — provisional estimate
  NG: 20,   // Nigeria — provisional estimate
  GH: 22,   // Ghana — provisional estimate
  DEFAULT: 40,
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

/**
 * Stage 9: Cost Optimisation
 *
 * Computes expected repair cost, compares to quoted cost, and identifies
 * savings opportunities. NEVER halts — produces estimated costs with minimal data.
 *
 * ── TWO OPERATING MODES ────────────────────────────────────────────────────────────
 *
 *   QUOTE mode (Step A): Quote optimisation engine runs on all submitted quotes.
 *     Includes cross-quote gap analysis, deviation matrix, and KINGA savings log.
 *     Used when the claim has at least one submitted repair quote.
 *
 *   DOCUMENT mode (Step B): Document-sourced cost breakdown only.
 *     Used when no quotes are submitted (total-loss or fast-track claims).
 *     R-E-02 severe cost cap (R 1,200,000) applies in this mode to prevent
 *     hallucinated totals. See docs/remediation/R-E-02-cost-distribution-analysis.md.
 *
 * ── KEY SUB-ENGINES ────────────────────────────────────────────────────────────────
 *
 *   quoteOptimisationEngine    — normalise, score, and rank submitted quotes
 *   crossQuoteGapAnalysis      — identify missing components across quotes
 *   costDecisionEngine         — final adjudication (approve / negotiate / reject)
 *   mlBenchmarkEngine          — P25/P50/P75 benchmarks from learning DB
 *   inputFidelityEngine        — data quality scoring for cost inputs
 *   decisionOptimisationEngine — DOE candidate generation and scoring
 *   economicContextEngine      — regional labour/parts rate resolution
 *
 * ── WHY THIS FUNCTION IS NOT SPLIT ──────────────────────────────────────────
 *
 *   The two operating modes share mutable state (quotes, benchmarks, costResult,
 *   learningRecord) and the Vision Re-Extraction Guard (lines ~921–1095) runs
 *   conditionally after mode selection. Splitting would require passing ~15
 *   variables across function boundaries. The R-E-01 through R-E-10 fixes
 *   (Batch 4) were verified against this structure; treat as a single unit.
 */
export async function runCostOptimisationStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output,
  stage3?: Stage3Output,
  /** R-D-04: Stage 8 fraud risk level passed explicitly to avoid parallel-execution race condition.
   * Stage 8 and Stage 9 run in parallel; ctx.fraudRiskLevel is never set before Stage 9 starts. */
  stage8FraudRiskLevel?: string | null
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
    // Policy currency resolution priority:
    // 1. Tenant-level override (tenants.currencyCode)
    // 2. Cross-border repair: use the repair country's default currency
    // 3. Tenant country default (via COUNTRY_CURRENCY_MAP)
    // 4. Absolute fallback: USD
    const tenantDefaultCurrency = ctx.tenantCountry ? getDefaultCurrencyForCountry(ctx.tenantCountry) : 'USD';
    const currency = ctx.tenantRates?.currencyCode ??
      (isCrossBorderRepair && extractedRepairCountry
        ? getDefaultCurrencyForCountry(extractedRepairCountry)
        : tenantDefaultCurrency);
    // Quote currency: extracted > inferred from repairCountry (via COUNTRY_CURRENCY_MAP) > same as policy currency
    const quoteCurrencyCode = extractedQuoteCurrency ??
      (isCrossBorderRepair && extractedRepairCountry
        ? getDefaultCurrencyForCountry(extractedRepairCountry)
        : currency);
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
          // Two-pass outlier-filtered query:
          // Pass 1: fetch all raw cost values for this vehicle.
          // Pass 2: compute median, exclude values outside [median/10, median*10],
          //         then average the clean set. This prevents a single data-entry
          //         error (e.g. cents stored as dollars = 100x inflation) from
          //         skewing the benchmark for all future claims of this vehicle type.
          const allRawRows = await dbConn.select({
            costCents: costLearningRecords.finalCostUsdCents,
          })
            .from(costLearningRecords)
            .where(drizzleSql`vehicle_descriptor LIKE ${`%${vehicleDesc}%`} AND final_cost_usd_cents > 0`);

          const allCosts = allRawRows
            .map((r: any) => Number(r.costCents))
            .filter((v: number) => v > 0)
            .sort((a: number, b: number) => a - b);

          let cleanAvgCents: number | null = null;
          let cleanCount = 0;
          if (allCosts.length > 0) {
            const median = allCosts[Math.floor(allCosts.length / 2)];
            // CALIBRATION: Outlier bounds (10% of median lower, 10× median upper) are
            // engineering-judgment. They are intentionally wide to avoid excluding
            // legitimate outliers in the small Zimbabwe fleet dataset.
            // Do not tighten without benchmarking against the actual learning DB distribution.
            /** Lower outlier bound: exclude values below this fraction of the median */
            const LEARNING_DB_OUTLIER_LOWER_FACTOR = 10;  // median / 10
            /** Upper outlier bound: exclude values above this multiple of the median */
            const LEARNING_DB_OUTLIER_UPPER_FACTOR = 10;  // median * 10
            const lowerBound = median / LEARNING_DB_OUTLIER_LOWER_FACTOR;
            const upperBound = median * LEARNING_DB_OUTLIER_UPPER_FACTOR;
            const cleanCosts = allCosts.filter((v: number) => v >= lowerBound && v <= upperBound);
            cleanCount = cleanCosts.length;
            cleanAvgCents = cleanCount > 0
              ? Math.round(cleanCosts.reduce((a: number, b: number) => a + b, 0) / cleanCount)
              : null;
            const excluded = allCosts.length - cleanCount;
            if (excluded > 0) {
              ctx.log("Stage 9",
                `Learning DB: excluded ${excluded} outlier(s) for '${vehicleDesc}' ` +
                `(median=${median}, bounds=[${Math.round(lowerBound)}, ${Math.round(upperBound)}])`);
            }
          }

          const rowCount = cleanCount;
          if (rowCount >= 3) {
            // Full confidence: 3+ clean claims
            learningDbBenchmarkCents = cleanAvgCents;
            learningDbSampleSize = rowCount;
            learningDbVehicleDescriptor = vehicleDesc;
            ctx.log("Stage 9", `Learning DB benchmark: ${learningDbSampleSize} historical claims for '${vehicleDesc}', clean_avg=${learningDbBenchmarkCents} cents`);
          } else if (rowCount > 0 && cleanAvgCents) {
            // Sparse DB: 1-2 clean claims — use as a partial signal
            learningDbBenchmarkCents = cleanAvgCents;
            learningDbSampleSize = rowCount;
            learningDbVehicleDescriptor = vehicleDesc;
            ctx.log("Stage 9",
              `Learning DB: ${rowCount} clean claim(s) for '${vehicleDesc}' (sparse — will blend with index fallback at ${Math.round(rowCount / 3 * 100)}% weight)`);
          }
        }
      }
    } catch (learningErr) {
      ctx.log("Stage 9", `Learning DB query failed (non-fatal): ${String(learningErr)}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COST PRINCIPLE: DOCUMENT-SOURCED COSTS ONLY
    //
    // The system deals in absolutes. Only costs that appear in submitted documents
    // (repair quotes, assessor reports, agreed cost annotations) are used.
    // The AI NEVER estimates costs for components not in the submitted quote.
    // Missing components are flagged as a Coverage Gap — a list of items the
    // adjuster must follow up on — with NO cost figure attached.
    //
    // The learning DB is used ONLY for fraud detection (is this quote suspiciously
    // cheap for this vehicle type?), not for cost estimation.
    // ─────────────────────────────────────────────────────────────────────────

    // ── Step A: Run Quote Optimisation Engine FIRST ──────────────────────────
    // Build InputQuote[] from all extracted quotes in Stage 3.
    // CRITICAL: If the quote's `components` list is empty but it has `line_items`,
    // derive the component list from line_items so the optimisation engine can
    // compute a meaningful coverage ratio. Non-part cost rows (paint, sundries,
    // labour, VAT) are excluded from the component list because they are not
    // vehicle parts and should not affect structural coverage scoring.
    // CRITICAL: Exclude parts_supplier quotes (e.g. Sarjazz) from the panel beater
    // optimisation engine. Parts suppliers are not repairers — their quotes are used
    // only for parts price benchmarking, not for L1/L2 composite optimisation.
    // resolvedExtractedQuotes: single source of truth for extracted quotes in Stage 9.
    // Priority 1: stage3.inputRecovery.extracted_quotes (from document extraction).
    // Priority 2: panel_beater_quotes DB table (written by Stage 8 quote ingestion).
    // All downstream consumers in Stage 9 MUST use this variable.
    let resolvedExtractedQuotes: any[] = stage3?.inputRecovery?.extracted_quotes ?? [];
    if (resolvedExtractedQuotes.length === 0 && ctx.db && claimRecord.claimId) {
      try {
        const { panelBeaterQuotes, panelBeaters, quoteLineItems } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Step 1: Fetch panel_beater_quotes rows with quote IDs
        const dbQuoteRows = await ctx.db
          .select({
            quoteId: panelBeaterQuotes.id,
            panelBeaterId: panelBeaterQuotes.panelBeaterId,
            quotedAmount: panelBeaterQuotes.quotedAmount,
            laborCost: panelBeaterQuotes.laborCost,
            partsCost: panelBeaterQuotes.partsCost,
            currencyCode: panelBeaterQuotes.currencyCode,
            status: panelBeaterQuotes.status,
            quoteType: panelBeaterQuotes.quoteType,
            parentQuoteId: panelBeaterQuotes.parentQuoteId,
            panelBeaterName: panelBeaters.businessName,
          })
          .from(panelBeaterQuotes)
          .leftJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
          .where(eq(panelBeaterQuotes.claimId, claimRecord.claimId));
        if (dbQuoteRows.length > 0) {
          ctx.log("Stage 9", `DB fallback: found ${dbQuoteRows.length} quote(s) in panel_beater_quotes for claim ${claimRecord.claimId} (Stage 3 extracted 0)`);
          // Step 2: Fetch all quote_line_items for these quotes in one query
          // components_json is always NULL — line items live in quote_line_items (separate table)
          const quoteIds = dbQuoteRows.map((r: any) => r.quoteId).filter(Boolean);
          let lineItemsByQuoteId: Map<number, any[]> = new Map();
          if (quoteIds.length > 0) {
            try {
              const { inArray } = await import("drizzle-orm");
              const allLineItems = await ctx.db
                .select({
                  quoteId: quoteLineItems.quoteId,
                  description: quoteLineItems.description,
                  category: quoteLineItems.category,
                  quantity: quoteLineItems.quantity,
                  unitPrice: quoteLineItems.unitPrice,
                  lineTotal: quoteLineItems.lineTotal,
                  currency: quoteLineItems.currency,
                  isRepair: quoteLineItems.isRepair,
                  isReplacement: quoteLineItems.isReplacement,
                })
                .from(quoteLineItems)
                .where(inArray(quoteLineItems.quoteId, quoteIds));
              for (const li of allLineItems) {
                const qid = li.quoteId;
                if (!lineItemsByQuoteId.has(qid)) lineItemsByQuoteId.set(qid, []);
                lineItemsByQuoteId.get(qid)!.push(li);
              }
              const totalLineItems = allLineItems.length;
              ctx.log("Stage 9", `DB fallback: fetched ${totalLineItems} line item(s) across ${quoteIds.length} quote(s) from quote_line_items`);
            } catch (liErr) {
              ctx.log("Stage 9", `DB fallback: quote_line_items fetch failed (non-fatal): ${String(liErr)}`);
            }
          }
          // Step 3: Build resolvedExtractedQuotes with real line_items attached
          resolvedExtractedQuotes = dbQuoteRows
            .filter((row: any) => (row.quotedAmount ?? 0) > 0)
            .map((row: any) => {
              const rawLineItems = lineItemsByQuoteId.get(row.quoteId) ?? [];
              // Map quote_line_items rows to the line_items shape expected by Stage 9 consumers
              // (same shape as quoteExtractionEngine output: component, line_total, is_non_part_cost, unit_cost)
              const line_items = rawLineItems.map((li: any) => ({
                component: li.description ?? '',
                description: li.description ?? '',
                line_total: li.lineTotal ? parseFloat(li.lineTotal) : 0,
                unit_cost: li.unitPrice ? parseFloat(li.unitPrice) : 0,
                quantity: li.quantity ? parseFloat(li.quantity) : 1,
                currency: li.currency ?? (row.currencyCode ?? currency),
                // is_non_part_cost: true for labour/paint/diagnostic rows
                // These are excluded from compositePartsUsd and handled via bestLabourUsd
                is_non_part_cost: li.category === 'labor' || li.category === 'paint' || li.category === 'diagnostic',
                is_repair: !!(li.isRepair),
                is_replacement: !!(li.isReplacement),
              }));
              // Derive component list from line items (parts only, not labour)
              const components = line_items
                .filter((li: any) => !li.is_non_part_cost && li.component)
                .map((li: any) => li.component as string);
              // Derive labour_cost from labour line items if not in header
              const labourFromLineItems = line_items
                .filter((li: any) => li.is_non_part_cost && /labour|labor/i.test(li.component ?? ''))
                .reduce((s: number, li: any) => s + (li.line_total ?? 0), 0);
              const effectiveLabourCost = (row.laborCost && row.laborCost > 0)
                ? row.laborCost / 100
                : (labourFromLineItems > 0 ? labourFromLineItems : null);
              return {
                panel_beater: row.panelBeaterName ?? "Panel Beater",
                panel_beater_id: row.panelBeaterId ?? null,
                quote_id: row.quoteId,
                quote_type: row.quoteType ?? "original",
                parent_quote_id: row.parentQuoteId ?? null,
                document_category: "repair_quote",
                total_cost: row.quotedAmount / 100,
                currency: row.currencyCode ?? currency,
                components,
                line_items,
                labour_defined: !!(effectiveLabourCost && effectiveLabourCost > 0),
                parts_defined: line_items.filter((li: any) => !li.is_non_part_cost).length > 0,
                labour_cost: effectiveLabourCost,
                parts_cost: row.partsCost ? row.partsCost / 100 : null,
                confidence: "medium",
              };
            });
          ctx.log("Stage 9", `DB fallback: loaded ${resolvedExtractedQuotes.length} quote(s). Totals: ${resolvedExtractedQuotes.map((q: any) => `${q.currency} ${q.total_cost?.toFixed(2)} (${(q.line_items ?? []).length} items)`).join(", ")}`);
        } else {
          ctx.log("Stage 9", `DB fallback: panel_beater_quotes has 0 rows for claim ${claimRecord.claimId}`);
        }
      } catch (dbFallbackErr) {
        ctx.log("Stage 9", `DB fallback query failed (non-fatal): ${String(dbFallbackErr)}`);
      }
    }

    // R1: Every downstream repair-quote calculation must consume the canonical
    // active ledger. Source submissions remain in the ledger for audit, but a
    // duplicate or superseded quote cannot inflate count, L1, L2, variance, or savings.
    const canonicalQuoteLedger = buildCanonicalQuoteLedger(resolvedExtractedQuotes);
    const activeRepairQuotes = canonicalQuoteLedger.activeQuotes.filter((quote: any) =>
      quote.document_category
        ? quote.document_category === "repair_quote"
        : (quote.quote_type ?? "repair") !== "parts_supplier"
    );
    const partsSupplierReferenceQuotes = resolvedExtractedQuotes.filter((quote: any) =>
      (quote.document_category === "parts_quote") || (quote.quote_type === "parts_supplier")
    );
    const activeQuotesForBenchmarking = [...activeRepairQuotes, ...partsSupplierReferenceQuotes];
    ctx.log(
      "Stage 9",
      `Canonical quote ledger: source=${resolvedExtractedQuotes.length}, active=${canonicalQuoteLedger.activeQuoteCount}, ` +
      `duplicate=${canonicalQuoteLedger.duplicateCount}, superseded=${canonicalQuoteLedger.supersededCount}, excluded=${canonicalQuoteLedger.excludedCount}`
    );

    const optimisationInputQuotes: InputQuote[] = activeRepairQuotes
      .map(q => {
      let components: string[] = q.components ?? [];
      if (components.length === 0 && Array.isArray((q as any).line_items)) {
        components = ((q as any).line_items as any[])
          .filter((li: any) => !li.is_non_part_cost && li.component)
          .map((li: any) => li.component as string);
      }
      // Derive labour_cost and parts_cost from line_items if not already set
      let labourCost: number | null = (q as any).labour_cost ?? null;
      let partsCost: number | null = (q as any).parts_cost ?? null;
      if (labourCost === null && Array.isArray((q as any).line_items)) {
        const labourItems = ((q as any).line_items as any[])
          .filter((li: any) => li.is_non_part_cost && /labour|labor/i.test(li.component ?? ''));
        if (labourItems.length > 0) {
          labourCost = labourItems.reduce((s: number, li: any) => s + (li.line_total ?? 0), 0) || null;
        }
      }
      if (partsCost === null && Array.isArray((q as any).line_items)) {
        const partsItems = ((q as any).line_items as any[])
          .filter((li: any) => !li.is_non_part_cost);
        if (partsItems.length > 0) {
          partsCost = partsItems.reduce((s: number, li: any) => s + (li.line_total ?? 0), 0) || null;
        }
      }
      return {
        panel_beater: q.panel_beater ?? null,
        total_cost: q.total_cost ?? null,
        currency: q.currency ?? "USD",
        components,
        labour_defined: q.labour_defined ?? (labourCost !== null && labourCost > 0),
        parts_defined: q.parts_defined ?? (partsCost !== null && partsCost > 0),
        labour_cost: labourCost,
        parts_cost: partsCost,
        confidence: (q.confidence as "high" | "medium" | "low") ?? "low",
      };
    });
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

    // ── Step A2: Cross-Quote Gap Analysis + Deviation Matrix ──────────────────
    // R-E-03: stage3.inputRecovery and ctx.damagePhotoUrls/classifiedImages are typed
    // in Stage3Output and PipelineContext respectively — as-any casts removed.
    // Use active repair quotes (after deduplication/revision selection) for gap analysis.
    const gapAnalysisQuotes = activeRepairQuotes;
    const damagePhotoUrlsForGap: string[] = [
      ...(ctx.damagePhotoUrls ?? []),
      // ClassifiedImage always has url: string (non-optional) — no cast needed.
      ...(ctx.classifiedImages?.damagePhotos?.map(img => img.url) ?? []),
    ].filter(Boolean);

    let crossQuoteGapAnalysis: CrossQuoteGapAnalysisResult | null = null;
    if (gapAnalysisQuotes.length >= 1) {
      try {
        crossQuoteGapAnalysis = await runCrossQuoteGapAnalysis(
          gapAnalysisQuotes,
          damageAnalysis.damagedParts.map((p: any) => p.name),
          damagePhotoUrlsForGap,
          damagePhotoUrlsForGap.length > 0
        );
        ctx.log("Stage 9", `Cross-quote gap analysis: ${gapAnalysisQuotes.length} quotes, ${crossQuoteGapAnalysis.master_component_union.length} unique components, ${crossQuoteGapAnalysis.copy_quotation_flags.length} copy flag(s)`);
        for (const pq of crossQuoteGapAnalysis.per_quote_gaps) {
          ctx.log("Stage 9", `  [${pq.panel_beater}] coverage=${(pq.coverage_ratio * 100).toFixed(0)}%, missing=${pq.missing_components.length}, est_gap_cost=USD ${(pq.gap_cost_estimate_usd ?? 0).toFixed(2)}`);
        }
        if (crossQuoteGapAnalysis.latent_damage_advisories.length > 0) {
          ctx.log("Stage 9", `LATENT DAMAGE WARNING: ${crossQuoteGapAnalysis.latent_damage_advisories.length} damaged component(s) not quoted by any panel beater: ${crossQuoteGapAnalysis.latent_damage_advisories.slice(0, 5).join(", ")}`);
        }
        if (crossQuoteGapAnalysis.copy_quotation_flags.some((f: any) => f.verdict === "likely_copy")) {
          ctx.log("Stage 9", `FRAUD SIGNAL [copy quotation]: high-severity copy quotation detected`);
        }
            } catch (gapErr) {
        ctx.log("Stage 9", `Cross-quote gap analysis failed (non-fatal): ${String(gapErr)}`);
      }
    }
    // ── Step A2b: Quote-Photo Agreement ─────────────────────────────────────
    // Cross-check quote line items against photo-detected components.
    // Flags: components visible in photos but absent from quotes (VISIBLE_NOT_QUOTED)
    // and components in quotes but not detected in photos (QUOTED_NOT_VISIBLE).
    // Note: photos are often taken post-incident at a workshop or home, so
    // QUOTED_NOT_VISIBLE is NOT a fraud signal by itself.
    let quotePhotoAgreement: QuotePhotoAgreementResult | null = null;
    if (activeRepairQuotes.length > 0 && damageAnalysis.damagedParts.length > 0) {
      try {
        quotePhotoAgreement = runQuotePhotoAgreement(
          damageAnalysis.damagedParts,
          activeRepairQuotes.map((q: any) => ({
            panel_beater: q.panel_beater ?? 'Unknown',
            components: q.components ?? [],
            line_items: q.line_items ?? [],
          }))
        );
        ctx.log('Stage 9', `Quote-photo agreement: score=${(quotePhotoAgreement.agreementScore * 100).toFixed(0)}%, visibleNotQuoted=${quotePhotoAgreement.visibleNotQuoted.length}, quotedNotVisible=${quotePhotoAgreement.quotedNotVisible.length}, structuralGaps=${quotePhotoAgreement.structuralGapsInQuotes.length}`);
        if (quotePhotoAgreement.structuralGapsInQuotes.length > 0) {
          ctx.log('Stage 9', `STRUCTURAL QUOTE GAP: ${quotePhotoAgreement.structuralGapsInQuotes.join(', ')} — structural components visible in photos but absent from all quotes`);
        }
      } catch (qpaErr) {
        ctx.log('Stage 9', `Quote-photo agreement failed (non-fatal): ${String(qpaErr)}`);
      }
    }
    // ── Step A3: Quote Deviation Matrix ──────────────────────────────────────
    // % deviation of each panel beater vs (a) lowest submitted and (b) KINGA L2 per-component benchmark.
    // NOTE: kingaL2BenchmarkUsd is populated later (after perComponentBenchmarks are built).
    // The matrix is rebuilt with the L2 value once it is available (see Step A3-patch below).
    const quoteDeviationMatrix: Array<{
      panel_beater: string;
      total_cost_usd: number;
      pct_vs_lowest: number;
      pct_vs_kinga_optimised: number | null;
      verdict: 'cheapest' | 'above_lowest' | 'below_kinga' | 'above_kinga';
    }> = [];
    let _deviationMatrixLowestCost = 0;
    if (quoteOptimisation && quoteOptimisation.selected_quotes.length > 0) {
      _deviationMatrixLowestCost = Math.min(...quoteOptimisation.selected_quotes.map(q => q.total_cost));
      // Populate with lowest-only data for now; vs_kinga will be patched after L2 is computed
      for (const q of quoteOptimisation.selected_quotes) {
        const pctVsLowest = _deviationMatrixLowestCost > 0 ? Math.round(((q.total_cost - _deviationMatrixLowestCost) / _deviationMatrixLowestCost) * 1000) / 10 : 0;
        const verdict: 'cheapest' | 'above_lowest' | 'below_kinga' | 'above_kinga' = q.total_cost === _deviationMatrixLowestCost ? 'cheapest' : 'above_lowest';
        quoteDeviationMatrix.push({ panel_beater: q.panel_beater, total_cost_usd: q.total_cost, pct_vs_lowest: pctVsLowest, pct_vs_kinga_optimised: null, verdict });
      }
    }

    // ── Step A4: KINGA Savings log ──────────────────────────────────────────
    if (quoteOptimisation) {
      if (quoteOptimisation.best_quote_by_cost) {
        ctx.log("Stage 9", `KINGA recommended quote: ${quoteOptimisation.best_quote_by_cost.panel_beater} @ USD ${quoteOptimisation.best_quote_by_cost.total_cost.toFixed(2)} (coverage=${(quoteOptimisation.best_quote_by_cost.coverage_ratio * 100).toFixed(0)}%, structurally_complete=${quoteOptimisation.best_quote_by_cost.structurally_complete})`);
      }
      // Weighted-average savings removed — L1-L2 savings are logged after composite result is built
    }

    // ── Step B: Document-sourced cost breakdown ONLY ────────────────────────────
    // Use only what is in the submitted quote. No AI estimates for missing components.
    let totalPartsCents = 0;
    let totalLabourCents = 0;
    let totalPaintCents = 0;
    const aiEstimateSource: "learning_db" | "quote_derived" | "hardcoded_fallback" | "insufficient_data" = "insufficient_data";
    const aiEstimateNote: string | null = null;

    // Use itemised parts/labour from the best selected quote if available.
    const bestSelectedQuote = quoteOptimisation && quoteOptimisation.selected_quotes.length > 0
      ? [...quoteOptimisation.selected_quotes].sort((a, b) => b.weight - a.weight)[0]
      : null;
    if (bestSelectedQuote && (bestSelectedQuote as any).parts_cost !== null && (bestSelectedQuote as any).labour_cost !== null) {
      totalPartsCents = Math.round(((bestSelectedQuote as any).parts_cost as number) * 100);
      totalLabourCents = Math.round(((bestSelectedQuote as any).labour_cost as number) * 100);
      totalPaintCents = 0;
      const quoteLabel = quoteOptimisation!.selected_quotes.length > 1
        ? `${quoteOptimisation!.selected_quotes.length} quotes (best: ${bestSelectedQuote.panel_beater})`
        : bestSelectedQuote.panel_beater;
      ctx.log("Stage 9", `Cost breakdown from quote line items [${quoteLabel}]: parts=${totalPartsCents} cents, labour=${totalLabourCents} cents`);
    }
    // NOTE: Learning DB is NOT used for cost estimation.
    // It is retained only for fraud detection (suspiciously cheap quote detection).
    // No hidden damage allowance is added — we cannot estimate what is not documented.
    if (damageAnalysis.damagedParts.length === 0) {
      isDegraded = true;
    }

    // totalExpectedCents = submitted quote total (set by QUOTE-FIRST principle below).
    // It is NOT an AI estimate. It is the document-sourced cost.
    let totalExpectedCents = 0;

    // Calibration override is not applicable — we no longer produce an AI cost estimate
    // to calibrate. The submitted quote is the only cost figure. Skip calibration.

    // WI-4: AGREED COST GATE
    // Priority: agreedCostCents (signed) > quoteTotalCents (submitted) > recovered_quote
    const agreedCostFromExtraction = claimRecord.repairQuote.agreedCostCents;
    if (agreedCostFromExtraction && agreedCostFromExtraction > 0) {
      ctx.log("Stage 9", `WI-4 AGREED COST GATE: agreedCostCents=${agreedCostFromExtraction} cents (USD ${(agreedCostFromExtraction/100).toFixed(2)}) is present — using as authoritative cost.`);
    }

    // Resolve the authoritative quoted cost from the submitted documents.
    let quotedCents = claimRecord.repairQuote.quoteTotalCents;
    if ((!quotedCents || quotedCents <= 0) && stage3?.inputRecovery?.recovered_quote) {
      const rq = stage3.inputRecovery.recovered_quote;
      quotedCents = Math.round(rq.total * 100);
      ctx.log("Stage 9", `Quote not in ClaimRecord — using recovered quote: USD ${rq.total} (${rq.confidence}, source: ${rq.source})`);
      recoveryActions.push({
        target: "quotedCents",
        strategy: "cross_document_search",
        success: true,
        description: `quoteTotalCents was null. Recovered from input recovery: USD ${rq.total} (confidence: ${rq.confidence}, source: ${rq.source}).`,
        recoveredValue: quotedCents,
      });
    }

    // DOCUMENT-SOURCED COST: The submitted quote is the ONLY authoritative cost.
    // totalExpectedCents = submitted quote total. No AI estimate is produced.
    if (quotedCents && quotedCents > 0) {
      totalExpectedCents = quotedCents;
      ctx.log("Stage 9", `Document-sourced cost: submitted quote = ${quotedCents} cents (USD ${(quotedCents/100).toFixed(2)}). No AI estimate produced.`);
      assumptions.push({
        field: "totalExpectedCents",
        assumedValue: `Submitted quote: ${(quotedCents / 100).toFixed(2)} USD`,
        reason: "Submitted repair quote is the sole authoritative cost source. The AI does not estimate costs for components not in the quote.",
        strategy: "cross_document_search",
        confidence: 95,
        stage: "Stage 9",
      });
    } else {
      isDegraded = true;
      ctx.log("Stage 9", "No submitted quote found. Cost section will show 'No quote submitted'.");
    }

    // Deviation, savings, and recommended range are initially seeded from the learning DB.
    // They are overwritten in-place by the ML/statistical benchmark aggregates in Phase 2
    // (after the perComponentBenchmarks block) once per-component P25/P50/P75 are computed.
    let quoteDeviationPct: number | null = null;
    let savingsOpportunityCents = 0;
    // Recommended cost range — initially from learning DB, overwritten by ML/stat benchmarks.
    const aiEstimatedCents: number | null = learningDbBenchmarkCents ?? null;
    const rangeBaseCents: number = aiEstimatedCents ?? (quotedCents ?? 0);
    let lowCents = rangeBaseCents > 0 ? Math.round(rangeBaseCents * 0.85) : 0;
    let highCents = rangeBaseCents > 0 ? Math.round(rangeBaseCents * 1.15) : 0;

    // ── Learning DB: fraud detection signal only ──────────────────────────────
    // The learning DB average is used ONLY to flag suspiciously cheap quotes.
    // It is NOT used to produce a cost estimate.
    let fraudCostSignal: { suspiciouslyCheap: boolean; learningDbAvgUsd: number | null; sampleSize: number } = {
      suspiciouslyCheap: false,
      learningDbAvgUsd: learningDbBenchmarkCents ? learningDbBenchmarkCents / 100 : null,
      sampleSize: learningDbSampleSize,
    };
    if (learningDbBenchmarkCents && learningDbBenchmarkCents > 0 && quotedCents && quotedCents > 0) {
      // CALIBRATION: 25% threshold for 'suspiciously cheap' fraud signal is engineering-judgment.
      // Do not change without benchmarking against a labelled fraud dataset.
      /** Fraction of learning DB average below which a quote is flagged as suspiciously cheap */
      const SUSPICIOUSLY_CHEAP_RATIO = 0.25;
      const ratio = quotedCents / learningDbBenchmarkCents;
      if (ratio < SUSPICIOUSLY_CHEAP_RATIO) {
        fraudCostSignal.suspiciouslyCheap = true;
        ctx.log("Stage 9", `Fraud signal: submitted quote (${quotedCents} cents) is ${(ratio * 100).toFixed(1)}% of learning DB avg (${learningDbBenchmarkCents} cents) — suspiciously cheap`);
      }
    }

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
    const quoteComponents: string[] = activeRepairQuotes
      ?.flatMap(q => q.components ?? []) ?? [];

    // Build a line_items lookup: normalised component name → { line_total, currency }
    // Uses the best available quote (highest confidence, then highest total_cost)
    const allLineItems = (activeRepairQuotes)
      .slice()
      .sort((a, b) => {
        const confOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const confDiff = (confOrder[b.confidence] ?? 0) - (confOrder[a.confidence] ?? 0);
        if (confDiff !== 0) return confDiff;
        return (b.total_cost ?? 0) - (a.total_cost ?? 0);
      })
      .flatMap(q => ((q as any).line_items ?? []).map((li: any) => ({ ...li, quoteCurrency: (q as any).currency ?? currency })));

    // Map: normalised component name → { line_total, quoteCurrency }
    // lineItemMap: normalised component name → { line_total, quoteCurrency, is_unpriced }
    // CRITICAL: zero-priced items are included with is_unpriced=true so they appear in
    // partsReconciliation as "quoted but unpriced" rather than being silently dropped.
    const lineItemMap = new Map<string, { line_total: number; quoteCurrency: string; is_unpriced?: boolean }>();
    for (const li of allLineItems) {
      const key = ((li.component ?? li.description ?? '') as string).toLowerCase().trim();
      if (!key) continue;
      if (!lineItemMap.has(key)) {
        const lineTotal = (typeof li.line_total === 'number' && li.line_total > 0) ? li.line_total : (typeof li.unit_cost === 'number' && li.unit_cost > 0 ? li.unit_cost * (li.quantity ?? 1) : 0);
        lineItemMap.set(key, {
          line_total: lineTotal,
          quoteCurrency: li.quoteCurrency,
          is_unpriced: lineTotal <= 0,
        });
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

      // Look up per-component quoted amount from line_items.
      // Match order:
      //   1. Exact normalised key match
      //   2. Reconciliation engine matched quote_component
      //   3. Token-overlap fuzzy scan across all line item keys
      const compKey = comp.name.toLowerCase().trim();
      let quotedEntry = lineItemMap.get(compKey);
      if (!quotedEntry && matched?.quote_component) {
        quotedEntry = lineItemMap.get(matched.quote_component.toLowerCase().trim());
      }
      if (!quotedEntry) {
        // Token-overlap fuzzy scan: find any line item key that shares a meaningful token
        const compTokens = compKey.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
        for (const [liKey, liVal] of lineItemMap.entries()) {
          const liTokens = liKey.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
          const overlap = compTokens.filter(t => liTokens.includes(t)).length;
          const maxLen = Math.max(compTokens.length, liTokens.length);
          // CALIBRATION: 0.5 token-overlap ratio for fuzzy component matching is engineering-judgment.
          /** Minimum token overlap ratio for fuzzy component-to-line-item matching */
          const FUZZY_MATCH_OVERLAP_THRESHOLD = 0.5;
          if (maxLen > 0 && overlap / maxLen >= FUZZY_MATCH_OVERLAP_THRESHOLD) {
            quotedEntry = liVal;
            break;
          }
        }
      }
      const quotedAmount = (quotedEntry && !quotedEntry.is_unpriced) ? quotedEntry.line_total : null;
      const quotedCurrency = quotedEntry?.quoteCurrency ?? null;
      const isUnpriced = quotedEntry?.is_unpriced ?? false;

      return {
        component: comp.name,
        aiEstimate: null as number | null, // not estimated — no reliable per-component cost data
        quotedAmount,
        quotedCurrency,
        variance: null as number | null,
        variancePct: null as number | null,
        // is_unpriced: component was found in the quote but has no price extracted
        is_unpriced: isUnpriced,
        flag: isMissing
          ? `missing_from_quote`
          : isUnpriced
          ? `unpriced_in_quote`
          : matched
          ? null
          : null,
        reconciliation_status: (reconciliation
          ? (matched
              ? (isUnpriced ? "matched_unpriced" : "matched")
              : isMissing ? "missing_from_quote" : "unmatched")
          : "no_quote_available") as "matched" | "matched_unpriced" | "missing_from_quote" | "unmatched" | "no_quote_available",
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
    const extractedQuotes = activeRepairQuotes;
    const narrativeInput = {
      quotes: extractedQuotes.map((q, i) => ({
        quote_id: `q${i + 1}`,
        panel_beater: q.panel_beater ?? "Unknown",
        total_cost: q.total_cost ?? 0,
        currency: q.currency ?? "USD",
      })),
      selected_quote_id: extractedQuotes.length > 0 ? "q1" : "",
      agreed_cost_usd: null,
      ai_estimate_usd: null, // Not produced — system uses document-sourced costs only
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
    const costNarrative = narrativeInput.quotes.length > 0
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
    // R1: An assessor's documented/agreed figure is comparison evidence only.
    // It may calibrate a prior human decision after L2 exists, but it must never
    // select a new-claim settlement, replace L2, or switch the engine into an
    // assessor-validated decision mode.
    const assessorComparisonCostUsd = (agreedCostFromExtraction && agreedCostFromExtraction > 0)
      ? agreedCostFromExtraction / 100
      : null;
    const costDecision = (() => {
      try {
        // Use lowest submitted quote as the optimised_cost_usd for costDecisionEngine.
          // This will be overridden with the L2 per-component benchmark once it is computed.
          const lowestSubmittedForDecision = quoteOptimisation?.selected_quotes?.length
            ? Math.min(...quoteOptimisation.selected_quotes.map(q => q.total_cost))
            : 0;
          return runCostDecision({
          cost_mode: "PRE_ASSESSMENT",
          agreed_cost_usd: null,
          optimised_cost: quoteOptimisation ? {
            optimised_cost_usd: lowestSubmittedForDecision > 0 ? lowestSubmittedForDecision : quoteOptimisation.optimised_cost_usd,
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
          extracted_quotes: activeRepairQuotes.map(q => ({
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
          ai_estimate_usd: null, // Not produced — system uses document-sourced costs only
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
    const documentedAgreedCostUsd = assessorComparisonCostUsd;
    // Phase 2B: Derive economic context from policy/tenant configuration
    let economicContext = null;
    try {
      economicContext = await deriveEconomicContext({
        tenantId: claimRecord.tenantId ? String(claimRecord.tenantId) : null,
        primaryCurrency: ctx.tenantRates?.currencyCode ?? currency,
        // Symbol lookup: tenant override > COUNTRY_CURRENCY_MAP by currency code
        primaryCurrencySymbol: ctx.tenantRates?.currencySymbol ??
          (Object.values(COUNTRY_CURRENCY_MAP).find(c => c.code === currency)?.symbol ?? '$'),
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
      // R-E-05/10: ClaimRecord.insuranceContext holds policy fields; DriverRecord.licenseNumber
      // is typed in DriverRecord. No as-any casts needed.
      // Note: ClaimRecord has no top-level .policy or .documents fields; the correct paths
      // are .insuranceContext (for policy data) and .driver.licenseNumber (for licence).
      // insuredValue is not on ClaimRecord — set to null (not extracted at this stage).
      const primaryDocType: string | null = null; // ClaimRecord has no .documents[] field
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
          policyNumber:         claimRecord.insuranceContext?.policyNumber ?? null,
          insuredValue:         null, // not available on ClaimRecord at this stage
          excess:               claimRecord.insuranceContext?.excessAmountUsd != null
                                  ? Math.round(claimRecord.insuranceContext.excessAmountUsd * 100)
                                  : null,
          driverLicence:        claimRecord.driver?.licenseNumber ?? null,
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
          overallFraudRisk: stage8FraudRiskLevel ?? 'low',  // R-D-04: use explicit param, not ctx (S8/S9 run in parallel)
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

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD documentedLineItems FROM ALL EXTRACTED QUOTES
    //
    // CRITICAL: We must capture line items from EVERY submitted quote, not just
    // the first one. Each quote's line items are tagged with source_quote_index
    // so the UI and db.ts can attribute them correctly.
    //
    // Non-vehicle-part cost rows (paint, sundries, labour, VAT) are included
    // because every cost contributes to the final claim value.
    // ─────────────────────────────────────────────────────────────────────────
    // ── Stage 9 Vision Re-Extraction Guard ──────────────────────────────────
    // When Stage 2 (OCR) or Stage 3 times out, extracted_quotes may have line
    // items with all-zero prices. In that case, Stage 9 triggers a direct
    // vision extraction using the primary PDF URL to recover the actual prices.
    // This guard runs BEFORE documentedLineItems is built so the recovered
    // prices flow through the full cost optimisation pipeline.
    let allExtractedQuotes = activeRepairQuotes;
    const totalPricedInExtracted = allExtractedQuotes.reduce((sum: number, eq: any) => {
      const items: any[] = (eq as any).line_items ?? [];
      return sum + items.filter((li: any) => typeof li.line_total === 'number' && li.line_total > 0).length;
    }, 0);
    // Fire vision guard when:
    //   (a) No quotes at all — full vision extraction to create a synthetic quote
    //   (b) ALL quotes have zero priced items — re-extract every quote via vision
    //   (c) PARTIAL: some quotes have prices but one or more individual quotes have
    //       zero priced line items (e.g. Grand Auto Premier has a total but no line items
    //       because OCR only captured the summary row, not the itemised table).
    //       In this case, run vision re-extraction ONLY for the zero-priced quotes.
    const hasPdfForVision = !!ctx.pdfUrl;
    const quotesWithNoPrices = allExtractedQuotes.filter((eq: any) => {
      const items: any[] = (eq as any).line_items ?? [];
      const priced = items.filter((li: any) => typeof li.line_total === 'number' && li.line_total > 0).length;
      return priced === 0 && !!(eq as any).total_cost; // has a total but no line items
    });
    const hasQuotesButNoPrices = (allExtractedQuotes.length > 0 && totalPricedInExtracted === 0) || allExtractedQuotes.length === 0;
    const hasPartialZeroPriceQuotes = !hasQuotesButNoPrices && quotesWithNoPrices.length > 0;
    if ((hasQuotesButNoPrices || hasPartialZeroPriceQuotes) && hasPdfForVision) {
      ctx.log("Stage 9", `Vision re-extraction guard triggered: ${allExtractedQuotes.length} quote(s), ${quotesWithNoPrices.length} with 0 priced items (partial=${hasPartialZeroPriceQuotes}). Attempting PDF vision extraction from ${ctx.pdfUrl}`);
      try {
        const { extractQuoteFromPdfVision } = await import('./quoteExtractionEngine');

        if (allExtractedQuotes.length === 0) {
          // ── No quotes at all: single vision extraction to create a synthetic quote ──
          const visionResult = await extractQuoteFromPdfVision(ctx.pdfUrl!, null, null, ctx.tenantCountry ?? null);
          const visionPricedCount = (visionResult.line_items ?? []).filter(
            (li: any) => typeof li.line_total === 'number' && li.line_total > 0
          ).length;
          ctx.log("Stage 9", `Vision re-extraction (no prior quotes): ${visionResult.line_items?.length ?? 0} items, ${visionPricedCount} priced.`);
          if (visionPricedCount > 0) {
            allExtractedQuotes = [{
              panel_beater: visionResult.panel_beater ?? null,
              total_cost: visionResult.total_cost ?? null,
              currency: visionResult.currency ?? 'USD',
              line_items: visionResult.line_items,
              components: visionResult.components ?? [],
              labour_defined: visionResult.labour_defined ?? false,
              parts_defined: visionResult.parts_defined ?? false,
              labour_cost: visionResult.labour_cost ?? null,
              parts_cost: visionResult.parts_cost ?? null,
              confidence: visionResult.confidence ?? 'low',
              extraction_warnings: visionResult.extraction_warnings ?? [],
              line_item_completeness_score: visionResult.line_item_completeness_score,
              line_items_sum: visionResult.line_items_sum,
              line_items_sum_discrepancy_pct: visionResult.line_items_sum_discrepancy_pct,
              rejected_line_items: visionResult.rejected_line_items ?? [],
              quote_type: 'repair' as const,
              _vision_reextracted: true,
              _synthetic_from_vision: true,
            }];
            ctx.log("Stage 9", `Vision re-extraction: created synthetic quote[0]. ${visionPricedCount} priced items.`);
          }
        } else {
          // ── Re-extract only the quotes that have zero priced line items ──
          // For partial mode: only re-extract zero-priced quotes; keep fully-priced quotes untouched.
          // For full mode (all zero): re-extract every quote.
          const mergedQuotes: any[] = [];
          for (let qi = 0; qi < allExtractedQuotes.length; qi++) {
            const eq = allExtractedQuotes[qi] as any;
            const existingPricedCount = (eq.line_items ?? []).filter(
              (li: any) => typeof li.line_total === 'number' && li.line_total > 0
            ).length;
            // Skip re-extraction for quotes that already have priced line items (partial mode)
            if (hasPartialZeroPriceQuotes && existingPricedCount > 0) {
              ctx.log("Stage 9", `  Quote[${qi}] "${eq.panel_beater ?? 'unknown'}": already has ${existingPricedCount} priced items — skipping vision re-extraction.`);
              mergedQuotes.push(eq);
              continue;
            }
            const panelBeater = eq.panel_beater ?? null;
            const totalCost = eq.total_cost ?? null;
            try {
              const visionResult = await extractQuoteFromPdfVision(
                ctx.pdfUrl!,
                panelBeater,
                totalCost,
                ctx.tenantCountry ?? null
              );
              const visionPricedCount = (visionResult.line_items ?? []).filter(
                (li: any) => typeof li.line_total === 'number' && li.line_total > 0
              ).length;
              ctx.log("Stage 9", `  Quote[${qi}] "${panelBeater ?? 'unknown'}": vision returned ${visionResult.line_items?.length ?? 0} items, ${visionPricedCount} priced.`);
              if (visionPricedCount > 0) {
                mergedQuotes.push({
                  ...eq,
                  line_items: visionResult.line_items,
                  components: visionResult.components?.length ? visionResult.components : eq.components,
                  line_item_completeness_score: visionResult.line_item_completeness_score,
                  line_items_sum: visionResult.line_items_sum,
                  line_items_sum_discrepancy_pct: visionResult.line_items_sum_discrepancy_pct,
                  rejected_line_items: visionResult.rejected_line_items ?? [],
                  _vision_reextracted: true,
                });
              } else {
                // Vision returned 0 priced items for this quote — keep original metadata
                ctx.log("Stage 9", `  Quote[${qi}] "${panelBeater ?? 'unknown'}": vision also returned 0 priced items — keeping original.`);
                mergedQuotes.push(eq);
              }
            } catch (qErr: any) {
              ctx.log("Stage 9", `  Quote[${qi}] vision re-extraction failed (non-fatal): ${qErr?.message}`);
              mergedQuotes.push(eq);
            }
          }
          allExtractedQuotes = mergedQuotes;
          const totalPricedAfter = allExtractedQuotes.reduce((s: number, eq: any) =>
            s + (eq.line_items ?? []).filter((li: any) => typeof li.line_total === 'number' && li.line_total > 0).length, 0);
          ctx.log("Stage 9", `Vision re-extraction complete: ${allExtractedQuotes.length} quotes, ${totalPricedAfter} total priced items.`);
        }
      } catch (visionErr: any) {
        ctx.log("Stage 9", `Vision re-extraction failed (non-fatal): ${visionErr?.message ?? String(visionErr)}`);
      }
    }
    const documentedLineItems: Array<{
      description: string;
      partNumber: string | null;
      category: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      isRepair: boolean;
      isReplacement: boolean;
      component?: string;
      unit_cost?: number | null;
      line_total?: number | null;
      part_origin?: string | null;
      source_quote_index?: number | null;
      is_non_part_cost?: boolean;
    }> = [];

    for (let qi = 0; qi < allExtractedQuotes.length; qi++) {
      const eq = allExtractedQuotes[qi];
      const lineItems = (eq as any).line_items ?? [];
      for (const li of lineItems) {
        const unitPrice = typeof li.unit_cost === 'number' ? li.unit_cost : 0;
        const lineTotal = (typeof li.line_total === 'number' && li.line_total > 0) ? li.line_total
          : (unitPrice > 0 ? unitPrice * (typeof li.quantity === 'number' ? li.quantity : 1) : 0);
        // Determine category: non-part cost rows get their own category
        const isNonPart = li.is_non_part_cost === true;
        let category = 'parts';
        if (isNonPart) {
          const desc = (li.component ?? '').toLowerCase();
          if (/labour|labor/.test(desc)) category = 'labour';
          else if (/paint|spray|respray|refinish/.test(desc)) category = 'paint';
          else if (/vat|tax|gst/.test(desc)) category = 'tax';
          else category = 'other';
        } else if (li.action === 'repair') {
          category = 'repair';
        }
        documentedLineItems.push({
          description: li.component ?? li.description ?? 'Item',
          partNumber: li.part_number ?? null,
          category,
          quantity: typeof li.quantity === 'number' ? li.quantity : 1,
          unitPrice,
          lineTotal,
          isRepair: li.action === 'repair',
          isReplacement: li.action === 'replace' || (li.action !== 'repair' && !isNonPart),
          component: li.component ?? null,
          unit_cost: typeof li.unit_cost === 'number' ? li.unit_cost : null,
          line_total: lineTotal > 0 ? lineTotal : (typeof li.line_total === 'number' && li.line_total > 0 ? li.line_total : null),
          part_origin: li.part_origin ?? null,
          source_quote_index: qi,
          is_non_part_cost: isNonPart || undefined,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD quoteLineItemGapAdvisory — per-quote completeness analysis
    //
    // For each submitted quote, compute:
    //   - How many line items were extracted
    //   - How many have a non-zero price
    //   - Which items are unpriced (adjuster must follow up)
    //   - Which items were rejected by the hallucination guard
    //   - Whether the sum of line items matches the quote total
    //   - A completeness score (0-100)
    // ─────────────────────────────────────────────────────────────────────────
    // Exclude parts suppliers from the gap advisory — they are not panel beaters
    // and should not be persisted as panel_beater_quotes rows.
    const panelBeaterExtractedQuotes = allExtractedQuotes.filter((eq: any) =>
      (eq.quote_type ?? 'repair') !== 'parts_supplier'
    );
    const quoteLineItemGapAdvisory = panelBeaterExtractedQuotes.map((eq: any, qi: number) => {
      const lineItems: any[] = eq.line_items ?? [];
      const pricedItems = lineItems.filter((li: any) => typeof li.line_total === 'number' && li.line_total > 0);
      const unpricedItems = lineItems.filter((li: any) => !(typeof li.line_total === 'number' && li.line_total > 0));
      const rejectedItems: Array<{ raw_name: string; raw_cost: number | null }> = eq.rejected_line_items ?? [];
      const lineItemsSum = pricedItems.length > 0
        ? pricedItems.reduce((s: number, li: any) => s + (li.line_total as number), 0)
        : null;
      const totalCost = eq.total_cost ?? null;
      let discrepancyPct: number | null = null;
      if (lineItemsSum !== null && totalCost !== null && totalCost > 0) {
        discrepancyPct = Math.round(((lineItemsSum - totalCost) / totalCost) * 1000) / 10;
      }
      const completenessScore: number = eq.line_item_completeness_score ?? (
        lineItems.length === 0 ? 0
        : unpricedItems.length === 0 && pricedItems.length > 0
          ? (discrepancyPct !== null && Math.abs(discrepancyPct) <= 10 ? 100 : 75)
          : pricedItems.length > 0 ? Math.round(50 * pricedItems.length / lineItems.length) : 0
      );
      let status: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
      if (lineItems.length === 0) status = 'EMPTY';
      else if (unpricedItems.length === 0 && pricedItems.length > 0) status = 'COMPLETE';
      else status = 'PARTIAL';
      // Surface warnings from extraction engine
      const warnings: string[] = [...(eq.extraction_warnings ?? [])];
      if (unpricedItems.length > 0) {
        warnings.push(`${unpricedItems.length} unpriced item(s): ${unpricedItems.map((li: any) => `"${li.component ?? 'unknown'}"`).join(', ')}`);
      }
      if (rejectedItems.length > 0) {
        warnings.push(`${rejectedItems.length} item(s) rejected by hallucination guard — manual review required: ${rejectedItems.map((r: any) => `"${r.raw_name}"`).join(', ')}`);
      }
      if (discrepancyPct !== null && Math.abs(discrepancyPct) > 10) {
        warnings.push(`Line item sum (${lineItemsSum?.toFixed(2)}) deviates ${discrepancyPct > 0 ? '+' : ''}${discrepancyPct.toFixed(1)}% from quote total (${totalCost?.toFixed(2)})`);
      }
      return {
        quote_index: qi,
        panel_beater: eq.panel_beater ?? null,
        total_cost: totalCost,
        currency: eq.currency ?? null,
        line_item_count: lineItems.length,
        priced_item_count: pricedItems.length,
        unpriced_item_count: unpricedItems.length,
        unpriced_items: unpricedItems.map((li: any) => li.component ?? 'unknown'),
        rejected_items: rejectedItems,
        line_items_sum: lineItemsSum,
        line_items_sum_discrepancy_pct: discrepancyPct,
        completeness_score: completenessScore,
        status,
        warnings,
      };
    });

    // Aggregate completeness score: average across all quotes
    const overallLineItemCompletenessScore = quoteLineItemGapAdvisory.length > 0
      ? Math.round(quoteLineItemGapAdvisory.reduce((s: number, q: any) => s + q.completeness_score, 0) / quoteLineItemGapAdvisory.length)
      : 0;

    // Log completeness summary
    for (const advisory of quoteLineItemGapAdvisory) {
      ctx.log('Stage 9',
        `Quote[${advisory.quote_index}] ${advisory.panel_beater ?? 'Unknown'}: ` +
        `${advisory.line_item_count} items, ${advisory.priced_item_count} priced, ` +
        `${advisory.unpriced_item_count} unpriced, score=${advisory.completeness_score}, status=${advisory.status}` +
        (advisory.line_items_sum_discrepancy_pct !== null ? `, sum_discrepancy=${advisory.line_items_sum_discrepancy_pct.toFixed(1)}%` : '')
      );
    }
    if (quoteLineItemGapAdvisory.some((q: any) => q.status !== 'COMPLETE')) {
      ctx.log('Stage 9',
        `⚠️  COST COMPLETENESS WARNING: ${quoteLineItemGapAdvisory.filter((q: any) => q.status !== 'COMPLETE').length} quote(s) have incomplete line item pricing. ` +
        `Overall completeness score: ${overallLineItemCompletenessScore}/100. ` +
        `Adjuster review required for unpriced items.`
      );
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
        hiddenDamageCostCents: 0, // Not computed in stage-9 (only in costRealismValidator path)
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
      assessorCostComparison: documentedAgreedCostUsd !== null
        ? {
            documentedAgreedCostUsd,
            usage: "assessor_calibration_reference_only",
            settlementEligible: false,
          }
        : null,
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
      // C-05-ARCH: Market value must be system-determined (Stage 5c valuation engine).
      // Never fall back to the raw claim form field (ctx.claim.vehicleMarketValue) as it is
      // the assessor's unverified stated value. If Stage 5c produced no value, leave null.
      marketValueUsd: claimRecord.valuation?.marketValueUsd ?? null,
      // Extracted quote line items with real pricing — used by db.ts for persistExtractedQuote.
      // These come from quoteExtractionEngine (Stage 3) and carry actual unit_cost / line_total.
      // ALL quotes are included (not just the first), tagged with source_quote_index.
      documentedLineItems: documentedLineItems.length > 0 ? documentedLineItems : undefined,
      // Per-quote line item completeness advisory — surfaces unpriced items, rejected items,
      // sum-check discrepancies, and a completeness score for each submitted quote.
      // This is the primary signal for adjuster follow-up on missing cost data.
      quoteLineItemGapAdvisory: quoteLineItemGapAdvisory.length > 0 ? quoteLineItemGapAdvisory : undefined,
      overallLineItemCompletenessScore,
      // Cross-quote gap analysis — component union, per-quote gaps, latent damage, copy detection
      crossQuoteGapAnalysis: crossQuoteGapAnalysis ?? undefined,
      // Quote-photo agreement — cross-check quote components against photo-detected components
      // QUOTED_NOT_VISIBLE is normal (photos taken post-incident). VISIBLE_NOT_QUOTED on structural
      // components is the strongest signal here.
      quotePhotoAgreement: quotePhotoAgreement ?? undefined,
      // KINGA Savings — quote optimisation dimension
      kingaSavingsQuoteOptimisation: quoteOptimisation?.savings_vs_highest_usd ?? 0,
      kingaRecommendedQuote: quoteOptimisation?.best_quote_by_cost
        ? {
            panel_beater: quoteOptimisation.best_quote_by_cost.panel_beater,
            total_cost: quoteOptimisation.best_quote_by_cost.total_cost,
            coverage_ratio: quoteOptimisation.best_quote_by_cost.coverage_ratio,
            structurally_complete: quoteOptimisation.best_quote_by_cost.structurally_complete,
          }
        : null,
    }, isDegraded ? "degraded_estimate" : "success");

    // ── Phase 2: Per-component KINGA benchmarks ─────────────────────────────
    // Fetch p25/median/p75 from componentRepairOutcomes for each damaged component.
    // This enriches the report with per-line-item over/fair/under flags.
    try {
      // Primary source: stage-6 damaged parts list.
      // Fallback: when stage-6 has no damaged parts (e.g. PRE_ASSESSMENT mode or
      // vision stage skipped), derive component names from the submitted quote
      // line items so the benchmark phase still runs and benchmarks are applied.
      let damagedComponentNames = damageAnalysis.damagedParts
        .map((p: any) => p.name)
        .filter((n: any): n is string => typeof n === 'string' && n.length > 0);
      if (damagedComponentNames.length === 0) {
        const quoteComponentNamesSet = new Set<string>();
        for (const q of activeRepairQuotes) {
          for (const li of ((q as any).line_items ?? [])) {
            const name: string = ((li.component ?? li.description ?? '') as string).trim();
            if (name && !li.is_non_part_cost) quoteComponentNamesSet.add(name);
          }
        }
        damagedComponentNames = Array.from(quoteComponentNamesSet);
        if (damagedComponentNames.length > 0) {
          ctx.log('Stage 9', `Phase 2 benchmark fallback: using ${damagedComponentNames.length} component name(s) from submitted quotes (stage-6 damagedParts was empty).`);
        }
      }
            if (damagedComponentNames.length > 0) {
        // ── HYBRID BENCHMARK LAYER ────────────────────────────────────────────
        // Tier 1: ML quantile regression (engine, boot_lid, roof, dashboard,
        //         left_front_door, right_front_door)
        // Tier 2: Statistical IQR benchmark (all 33 components)
        // Tier 3: Legacy DB benchmarks (validated outcomes + training data)
        const perComponentBenchmarks: Record<string, any> = {};
        // Repairer submissions are canonical active entries; supplier submissions
        // remain reference-only inputs for per-component benchmark enrichment.
        const allQuotes = activeQuotesForBenchmarking;
        const vehicleMake = claimRecord.vehicle?.make ?? null;
        const vehicleYear = claimRecord.vehicle?.year ?? null;
        // Build a flat line_items map for quote flag computation
        const allLineItemsFlat = allQuotes.flatMap((q: any) =>
          (q.line_items ?? []).map((li: any) => ({
            ...li,
            panel_beater: q.panel_beater ?? null,
            quoteCurrency: q.currency ?? currency,
          }))
        );

        // ── PRE-NORMALISE component names to canonical display names ──────────
        // This is the single normalisation gate: every component name from every
        // source (stage-6 damaged parts, quote line items) is resolved through
        // resolveComponent() before any comparison or benchmark lookup.
        // This ensures "LH Headlamp", "Left Head Light", "Headlight Assembly (Left)"
        // all map to the same canonical key "Headlight Assembly (Left)" and are
        // correctly matched against each other and against benchmarkMap in
        // buildCompositeQuote. Deduplication by canonical ID prevents double-counting.
        const seenCanonicalIds = new Set<string>();
        const normalisedComponentNames: string[] = [];
        for (const raw of damagedComponentNames) {
          const resolved = resolveComponent(raw);
          const canonicalName = resolved ? resolved.name : raw.trim();
          const dedupeKey = resolved ? resolved.id : canonicalName.toLowerCase();
          if (!seenCanonicalIds.has(dedupeKey)) {
            seenCanonicalIds.add(dedupeKey);
            normalisedComponentNames.push(canonicalName);
          }
        }
        // Replace damagedComponentNames with the normalised, deduplicated list
        damagedComponentNames = normalisedComponentNames;
        if (normalisedComponentNames.length < damagedComponentNames.length + normalisedComponentNames.length - normalisedComponentNames.length) {
          ctx.log('Stage 9', `Phase 2: normalised ${damagedComponentNames.length + normalisedComponentNames.length - normalisedComponentNames.length} raw names → ${normalisedComponentNames.length} canonical components (deduped)`);
        }

        let mlHits = 0;
        let statHits = 0;
        let dbHits = 0;

        for (const compName of damagedComponentNames) {
          // compName is now always a canonical display name (e.g. "Headlight Assembly (Left)")
          // Resolve to VehiclePart for componentId lookup
          const resolved = resolveComponent(compName);
          const componentId = resolved?.id ?? null;

          // Find the quoted amount for this component from line_items.
          // Match using canonical ID so "O/S/C Regas" matches "regas" etc.
          const matchedLineItem = allLineItemsFlat.find((li: any) => {
            const liRaw = (li.component ?? li.description ?? '').trim();
            const liResolved = resolveComponent(liRaw);
            if (liResolved && resolved) return liResolved.id === resolved.id;
            // Fallback: canonical name includes
            const liComp = liRaw.toLowerCase();
            const compLower = compName.toLowerCase();
            return liComp.includes(compLower) || compLower.includes(liComp.split(' ')[0]);
          });
          const quotedAmountUsd = matchedLineItem
            ? (matchedLineItem.line_total ?? matchedLineItem.unit_cost ?? 0)
            : null;

          if (componentId && quotedAmountUsd !== null && quotedAmountUsd > 0) {
            // Run hybrid assessment
            const assessment = assessCost({
              componentId,
              quotedCostUsd: quotedAmountUsd,
              vehicleMake,
              vehicleYear,
            });

            if (assessment.modelSource !== 'none') {
              // Build per-quote flags using the ML/statistical band.
              // Use canonical ID matching so variant names across repairers are unified.
              const quoteFlags: Record<string, 'over' | 'fair' | 'under' | 'no_data'> = {};
              for (const q of allQuotes) {
                const pbName = (q as any).panel_beater ?? `Quote ${allQuotes.indexOf(q) + 1}`;
                const qLineItem = ((q as any).line_items ?? []).find((li: any) => {
                  const liRaw = (li.component ?? li.description ?? '').trim();
                  const liResolved = resolveComponent(liRaw);
                  if (liResolved && resolved) return liResolved.id === resolved.id;
                  const liComp = liRaw.toLowerCase();
                  const compLower = compName.toLowerCase();
                  return liComp.includes(compLower) || compLower.includes(liComp.split(' ')[0]);
                });
                if (!qLineItem) {
                  quoteFlags[pbName] = 'no_data';
                } else {
                  const itemCostUsd = qLineItem.line_total ?? qLineItem.unit_cost ?? 0;
                  const p25 = assessment.p25 ?? 0;
                  const p75 = assessment.p75 ?? Infinity;
                  if (itemCostUsd > p75 * 1.15) quoteFlags[pbName] = 'over';
                  else if (itemCostUsd < p25 * 0.85) quoteFlags[pbName] = 'under';
                  else quoteFlags[pbName] = 'fair';
                }
              }

              perComponentBenchmarks[compName] = {
                p25Usd: assessment.p25,
                medianUsd: assessment.p50,
                p75Usd: assessment.p75,
                sampleSize: assessment.nTraining,
                vehicleMakeFiltered: vehicleMake !== null,
                modelSource: assessment.modelSource,
                modelDescription: assessment.modelDescription,
                confidence: assessment.confidence,
                verdict: assessment.verdict,
                quoteFlags,
              };

              if (assessment.modelSource === 'ml') mlHits++;
              else statHits++;
              continue; // Skip legacy DB lookup for this component
            }
          }

          // ── Legacy DB fallback (validated outcomes + training data) ──────────
          // Used when: no component ID resolved, or no quoted amount available
          perComponentBenchmarks[compName] = null; // placeholder — will be filled below
        }

        // Fill remaining nulls from legacy DB (components without ML/stat coverage)
        const needsLegacyLookup = damagedComponentNames.filter(
          n => perComponentBenchmarks[n] === null
        );
        if (needsLegacyLookup.length > 0) {
          let dbBenchmarks = await getComponentBenchmarks(needsLegacyLookup, vehicleMake);
          const dbCovered = new Set(dbBenchmarks.map(b => b.component));
          const stillUncovered = needsLegacyLookup.filter(n => !dbCovered.has(n));
          if (stillUncovered.length > 0) {
            const trainingBenchmarks = await getComponentBenchmarksFromTrainingData(
              stillUncovered, vehicleMake
            );
            dbBenchmarks = [...dbBenchmarks, ...trainingBenchmarks];
          }
          for (const b of dbBenchmarks) {
            const allQuotesInner = activeQuotesForBenchmarking;
            const bResolved = resolveComponent(b.component);
            const quoteFlags: Record<string, 'over' | 'fair' | 'under' | 'no_data'> = {};
            for (const q of allQuotesInner) {
              const pbName = (q as any).panel_beater ?? `Quote ${allQuotesInner.indexOf(q) + 1}`;
              const lineItem = ((q as any).line_items ?? []).find((li: any) => {
                const liRaw = (li.description ?? li.component ?? '').trim();
                const liResolved = resolveComponent(liRaw);
                if (liResolved && bResolved) return liResolved.id === bResolved.id;
                return liRaw.toLowerCase().includes(b.component.toLowerCase()) ||
                  b.component.toLowerCase().includes(liRaw.toLowerCase().split(' ')[0]);
              });
              if (!lineItem) {
                quoteFlags[pbName] = 'no_data';
              } else {
                const itemCostUsd = (lineItem.line_total ?? lineItem.unit_cost ?? 0) / 100;
                if (itemCostUsd > b.p75Usd * 1.15) quoteFlags[pbName] = 'over';
                else if (itemCostUsd < b.p25Usd * 0.85) quoteFlags[pbName] = 'under';
                else quoteFlags[pbName] = 'fair';
              }
            }
            perComponentBenchmarks[b.component] = {
              p25Usd: b.p25Usd,
              medianUsd: b.medianUsd,
              p75Usd: b.p75Usd,
              sampleSize: b.sampleSize,
              vehicleMakeFiltered: b.vehicleMakeFiltered,
              modelSource: 'db_legacy',
              modelDescription: 'Legacy DB benchmark',
              confidence: null,
              verdict: null,
              quoteFlags,
            };
            dbHits++;
          }
        }

        (output as any).perComponentBenchmarks = perComponentBenchmarks;
        ctx.log('Stage 9',
          `Hybrid benchmarks: ${mlHits} ML, ${statHits} statistical, ${dbHits} legacy DB, ` +
          `${damagedComponentNames.length - mlHits - statHits - dbHits} without data`);

        // ── Aggregate benchmark P25/P50/P75 → update savings, range, and deviation in-place ──
        // Only aggregate components where (a) benchmark data exists AND (b) the submitted
        // quote has a matching line item with a positive cost. This keeps the comparison
        // apples-to-apples: we compare the quoted cost for covered components only.
        let aggP25Cents = 0;
        let aggP50Cents = 0;
        let aggP75Cents = 0;
        let aggCoveredQuotedCents = 0;
        let aggComponentsWithData = 0;
        for (const compName of damagedComponentNames) {
          const bm = perComponentBenchmarks[compName];
          if (!bm || bm.p25Usd == null || bm.medianUsd == null || bm.p75Usd == null) continue;
          // Find matching line item in the submitted quote(s) using canonical ID
          const compResolved = resolveComponent(compName);
          const matchedLI = allLineItemsFlat.find((li: any) => {
            const liRaw = (li.component ?? li.description ?? '').trim();
            const liResolved = resolveComponent(liRaw);
            if (liResolved && compResolved) return liResolved.id === compResolved.id;
            const liComp = liRaw.toLowerCase();
            const compLower = compName.toLowerCase();
            return liComp.includes(compLower) || compLower.includes(liComp.split(' ')[0]);
          });
          if (!matchedLI) continue;
          const liCostUsd = matchedLI.line_total ?? matchedLI.unit_cost ?? 0;
          if (liCostUsd <= 0) continue;
          aggP25Cents += Math.round(bm.p25Usd * 100);
          aggP50Cents += Math.round(bm.medianUsd * 100);
          aggP75Cents += Math.round(bm.p75Usd * 100);
          aggCoveredQuotedCents += Math.round(liCostUsd * 100);
          aggComponentsWithData++;
        }

        if (aggComponentsWithData >= 2 && aggP50Cents > 0) {
          // Savings = amount by which covered quoted components exceed the P75 ceiling.
          // Positive means the quote is above the top quartile of market prices.
          savingsOpportunityCents = Math.max(0, aggCoveredQuotedCents - aggP75Cents);
          // Recommended range = aggregated P25–P75 across covered components.
          lowCents = aggP25Cents;
          highCents = aggP75Cents;
          // Deviation = % difference between covered quoted cost and P50 median.
          quoteDeviationPct = aggP50Cents > 0
            ? Math.round(((aggCoveredQuotedCents - aggP50Cents) / aggP50Cents) * 1000) / 10
            : null;
          // Update the already-built output object in-place.
          (output as any).savingsOpportunityCents = savingsOpportunityCents;
          (output as any).recommendedCostRange = { lowCents, highCents };
          (output as any).quoteDeviationPct = quoteDeviationPct;
          (output as any).benchmarkCoverageComponents = aggComponentsWithData;
          ctx.log('Stage 9',
            `Benchmark aggregates (${aggComponentsWithData} components): ` +
            `P25=$${(aggP25Cents/100).toFixed(2)} P50=$${(aggP50Cents/100).toFixed(2)} ` +
            `P75=$${(aggP75Cents/100).toFixed(2)} QuotedCovered=$${(aggCoveredQuotedCents/100).toFixed(2)} ` +
            `Savings=$${(savingsOpportunityCents/100).toFixed(2)} Deviation=${quoteDeviationPct?.toFixed(1)}%`);
        }

        // ── COMPOSITE QUOTE OPTIMISATION (Three-Layer Cost Model) ────────────────
        // Build L2 (composite optimised cost) and L3 (benchmark reference cost)
        // using all submitted quotes and the per-component benchmark data.
        try {
          // Convert perComponentBenchmarks to BenchmarkMap format
          const benchmarkMap: BenchmarkMap = {};
          for (const [compName, bm] of Object.entries(perComponentBenchmarks)) {
            if (bm && (bm as any).p25Usd != null) {
              benchmarkMap[compName] = {
                p25Usd: (bm as any).p25Usd,
                p50Usd: (bm as any).medianUsd ?? null,
                p75Usd: (bm as any).p75Usd,
                sampleSize: (bm as any).sampleSize ?? 0,
                modelSource: (bm as any).modelSource ?? null,
                vehicleMakeFiltered: (bm as any).vehicleMakeFiltered ?? null,
              };
            }
          }

          // ── Parts supplier benchmark injection ────────────────────────────────
          // Parts supplier quotes (e.g. Sarjazz) are NOT panel beaters and must never
          // appear as repairer columns or in any output. However, their per-component
          // prices are valuable market reference data and should silently enrich the
          // benchmarkMap so the credibility gate uses the most accurate price bands.
          //
          // Strategy: for each component a parts supplier quotes, inject its price as
          // an additional data point:
          //   - If a benchmark entry already exists: tighten p25Usd downward (min of
          //     existing p25 and supplier price) to reflect real-world parts cost floor.
          //   - If no benchmark entry exists: create one using the supplier price as
          //     both p25 and p75 (single data point, conservative range).
          const supplierQuotes = allQuotes.filter((q: any) => q.quote_type === 'parts_supplier');
          for (const sq of supplierQuotes) {
            for (const li of ((sq as any).line_items ?? [])) {
              if (li.is_non_part_cost) continue; // skip labour/paint/VAT rows
              const compRaw: string = (li.component ?? li.description ?? '').trim();
              if (!compRaw) continue;
              const costUsd: number = li.line_total ?? li.unit_cost ?? 0;
              if (costUsd <= 0) continue;
              // Try to match against existing benchmark keys (exact or partial)
              const existingKey = Object.keys(benchmarkMap).find(k =>
                k.toLowerCase().includes(compRaw.toLowerCase()) ||
                compRaw.toLowerCase().includes(k.toLowerCase())
              ) ?? compRaw;
              const existing = benchmarkMap[existingKey];
              if (existing) {
                // Tighten the lower bound: supplier price is a real parts cost floor
                benchmarkMap[existingKey] = {
                  ...existing,
                  p25Usd: existing.p25Usd !== null ? Math.min(existing.p25Usd, costUsd) : costUsd,
                  // Do not raise p75 — supplier prices are parts-only (no fitment/labour)
                };
              } else {
                // No existing benchmark: create a supplier-only reference entry
                benchmarkMap[compRaw] = {
                  p25Usd: costUsd,
                  p50Usd: costUsd,
                  p75Usd: costUsd * 1.25, // allow 25% fitment premium above parts cost
                  sampleSize: 1,
                };
              }
            }
          }

          // Build InputQuoteWithLineItems[] from all extracted quotes.
          // Exclude parts_supplier quotes (e.g. Sarjazz) from the composite matrix —
          // they are parts-only dealers, not panel beaters, and should not appear as
          // repairer columns.
          // R-A-22: Also exclude assessor_report and other non-repair documents when
          // document_category is available. Fall back to quote_type for legacy data.
          const repairQuotes = allQuotes.filter((q: any) => {
            if (q.document_category) return q.document_category === 'repair_quote';
            return q.quote_type !== 'parts_supplier';
          });
          const compositeInputQuotes: InputQuoteWithLineItems[] = repairQuotes.map((q: any) => {
            // Pass ALL line items to buildCompositeQuote with their scope flags.
            // buildCompositeQuote now groups rows by component+scope to compute the
            // total-cost-of-operation per component per quote, so it needs the full
            // picture including repair-operation rows and non-part-cost rows.
            // The isNonPartCost flag tells the engine which rows to exclude from the
            // component matrix (standalone overhead labour not tied to a component).
            const allLineItems = (q.line_items ?? [])
              .map((li: any) => ({
                componentName: li.component ?? li.description ?? '',
                costUsd: li.line_total ?? li.unit_cost ?? 0,
                isRepair: !!(li.is_repair),
                isReplacement: !!(li.is_replacement),
                isNonPartCost: !!(li.is_non_part_cost),
              }))
              .filter((li: any) => li.componentName && li.costUsd > 0);

            // labour_cost on the quote header is the summary overhead labour field.
            // With line items present, component-level labour is already in the line items.
            // Set labour_cost = null to prevent double-counting in the Step 4 overhead rule.
            const effectiveLabourCost = allLineItems.length > 0 ? null : (q.labour_cost ?? null);

            return {
              panel_beater: q.panel_beater ?? null,
              total_cost: q.total_cost ?? null,
              currency: q.currency ?? currency,
              components: q.components ?? [],
              labour_defined: q.labour_defined ?? false,
              parts_defined: q.parts_defined ?? false,
              labour_cost: effectiveLabourCost,
              parts_cost: q.parts_cost ?? null,
              confidence: (q.confidence as 'high' | 'medium' | 'low') ?? 'low',
              lineItems: allLineItems,
            };
          });

          // Build per-component severity map from damage analysis for repair/replace decisions
          const componentSeverityMap = new Map<string, string>(
            damageAnalysis.damagedParts
              .filter((p: any) => p.name && p.severity)
              .map((p: any) => [p.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim(), p.severity as string])
          );

          // L1 = lowest submitted quote total across panel beater quotes only.
          // Parts supplier quotes (e.g. Sarjazz) are excluded — they are not repairers
          // and their totals should not set the L1 baseline for the composite optimisation.
          // R-A-22: Use document_category when available (primary signal); fall back to quote_type
          // for legacy data without document_category. This prevents assessor fee invoices and
          // parts-supplier quotes from being included in the L1 baseline.
          // Use total_cost exactly as extracted (including VAT where applicable).
          const allSubmittedTotalsForL1 = allQuotes
            .filter((q: any) => {
              if (q.document_category) return q.document_category === 'repair_quote';
              return (q.quote_type ?? 'repair') !== 'parts_supplier';
            })
            .map((q: any) => q.total_cost ?? 0)
            .filter((t: number) => t > 0);
          const l1TotalUsd = allSubmittedTotalsForL1.length > 0
            ? Math.min(...allSubmittedTotalsForL1)
            : (quotedCents ? quotedCents / 100 : 0);

          if (compositeInputQuotes.length > 0 && l1TotalUsd > 0) {
            const compositeResult = buildCompositeQuote(
              compositeInputQuotes,
              benchmarkMap,
              l1TotalUsd,
              componentSeverityMap,
              damageAnalysis.damagedParts.map((part: any) => part.name).filter(Boolean)
            );

            // Component classification: quoted-not-damaged and damaged-not-quoted
            // Use components[] if populated; fall back to lineItems component names
            const allQuotedComponentNames = compositeInputQuotes
              .flatMap(q => {
                const comps = q.components ?? [];
                if (comps.length > 0) return comps;
                // Fall back to lineItems when components[] is not populated
                return (q.lineItems ?? []).map((li: any) => li.componentName).filter(Boolean);
              });
            const confirmedDamagedNames = damagedComponentNames;
            const allDamagedNames = [...new Set([...confirmedDamagedNames, ...allQuotedComponentNames])];

            const { quotedNotDamaged, damagedNotQuoted } = classifyComponents(
              confirmedDamagedNames,
              allQuotedComponentNames,
              benchmarkMap,
              compositeInputQuotes.map(q => q.panel_beater ?? 'Unknown')
            );

            // Populate damagedNotQuoted severity from damage analysis
            for (const dnq of damagedNotQuoted) {
              const damagePart = damageAnalysis.damagedParts.find(
                (p: any) => p.name?.toLowerCase().includes(dnq.componentName.toLowerCase())
              );
              if (damagePart) dnq.severity = damagePart.severity ?? 'unknown';
            }

            // Probable hidden damage advisories
            const hiddenDamageAdvisories = computeProbableHiddenDamage(
              confirmedDamagedNames,
              allQuotedComponentNames,
              allDamagedNames
            );

            // Attach composite result to output
            (output as any).compositeOptimisation = {
              l2Status: compositeResult.isComplete
                ? "complete"
                : compositeResult.allInReconciliationRequired
                  ? "reconciliation_required"
                  : "incomplete_scope",
              quoteReceiptStatus: canonicalQuoteLedger.activeQuoteCount > 0 ? "quotes_received" : "no_quotes",
              quoteScopeStatus: compositeResult.isComplete
                ? "complete"
                : compositeResult.allInReconciliationRequired
                  ? "reconciliation_required"
                  : "incomplete_scope",
              l1SubmittedCostUsd: l1TotalUsd,
              l2CompositeOptimisedCostUsd: compositeResult.compositeOptimisedCostUsd,
              partialPricedScopeUsd: compositeResult.partialPricedScopeUsd,
              isComplete: compositeResult.isComplete,
              missingRequiredComponents: compositeResult.missingRequiredComponents,
              costBasis: compositeResult.costBasis,
              l3BenchmarkReferenceCostUsd: compositeResult.benchmarkReferenceCostUsd,
              negotiationSavingsUsd: compositeResult.negotiationSavingsUsd,
              marketOverpriceDeltaUsd: compositeResult.marketOverpriceDeltaUsd,
              totalSavingsOpportunityUsd: compositeResult.totalSavingsOpportunityUsd,
              benchmarkCoverageComponents: compositeResult.benchmarkCoverageComponents,
              negotiationFeasibilityScore: compositeResult.negotiationFeasibilityScore,
              negotiationFeasibilityLabel: compositeResult.negotiationFeasibilityLabel,
              compositeLineItems: compositeResult.compositeLineItems,
              quoteReconciliations: compositeResult.quoteReconciliations,
              allInReconciliationRequired: compositeResult.allInReconciliationRequired,
              quotedNotDamaged,
              damagedNotQuoted,
              hiddenDamageAdvisories,
              quotesEvaluated: canonicalQuoteLedger.activeQuoteCount,
              sourceQuotesReceived: resolvedExtractedQuotes.length,
              duplicateQuotesExcluded: canonicalQuoteLedger.duplicateCount,
              supersededQuotesExcluded: canonicalQuoteLedger.supersededCount,
              canonicalQuoteLedger: canonicalQuoteLedger.entries,
            };

            // ── KINGA Savings: L1 (lowest submitted) minus L2 (per-component optimised) ──
            // This is the headline KINGA value: what the insurer saves by using KINGA
            // to select the per-component lowest credible price instead of approving
            // the cheapest submitted quote as-is.
            // CRITICAL: Exclude non-repair documents from L1 — these must NOT set the baseline.
            // Primary signal: document_category (LLM-classified at Stage 3 extraction time).
            //   'repair_quote'    → include in L1
            //   'parts_quote'     → exclude (parts supplier, not a panel beater)
            //   'assessor_report' → exclude (professional fee, not a repair estimate)
            //   'agreed_cost'     → exclude (settlement document, not a submitted quote)
            //   'other'           → exclude (unknown document type)
            //   undefined         → fall back to quote_type heuristic for backward compatibility
            //     with pre-classification data (claims processed before document_category was added)
            const allSubmittedTotals = (activeRepairQuotes)
              .filter((q: any) => {
                // Primary: use LLM-classified document_category when available
                if (q.document_category) {
                  const isRepair = q.document_category === 'repair_quote';
                  if (!isRepair) {
                    ctx.log('Stage 9', `L1 filter: excluding "${q.panel_beater ?? 'unknown'}" (document_category=${q.document_category}, total_cost=${q.total_cost}) — not a repair quote`);
                  }
                  return isRepair;
                }
                // Fallback for legacy data without document_category:
                // use quote_type (parts_supplier exclusion) — this is the pre-existing logic
                const qType = q.quote_type ?? 'repair';
                return qType !== 'parts_supplier';
              })
              .map((q: any) => q.total_cost ?? 0)
              .filter((t: number) => t > 0);
            // Fallback: if all extracted quotes were filtered out, use the selected_quotes totals
            // (these are already validated repair quotes from the optimisation engine)
            const fallbackTotals = allSubmittedTotals.length === 0
              ? (compositeInputQuotes ?? []).map((q: any) => q.total_cost ?? 0).filter((t: number) => t > 0)
              : allSubmittedTotals;
            const lowestSubmittedUsd = fallbackTotals.length > 0
              ? Math.min(...fallbackTotals)
              : 0;
            const l2Usd = compositeResult.compositeOptimisedCostUsd;
            if (compositeResult.isComplete && lowestSubmittedUsd > 0 && l2Usd !== null && l2Usd > 0) {
              const kingaSavingsUsd = lowestSubmittedUsd - l2Usd;
              // Override the earlier weighted-average savings with the correct L1-L2 figure
              (output as any).kingaSavingsQuoteOptimisation = kingaSavingsUsd;
              (output as any).kingaSavingsLowestSubmittedUsd = lowestSubmittedUsd;
              (output as any).kingaSavingsL2OptimisedUsd = l2Usd;
              // Backfill savingsL1vsL2Usd into compositeOptimisation so both reports
              // read the same canonical savings figure from one place.
              if ((output as any).compositeOptimisation) {
                (output as any).compositeOptimisation.savingsL1vsL2Usd = kingaSavingsUsd;
                (output as any).compositeOptimisation.l1LowestSubmittedCostUsd = lowestSubmittedUsd;
              }

              // ── Step A3-patch: backfill L2 deviation percentages into the deviation matrix ──
              // The matrix was built earlier with pct_vs_kinga_optimised=null because L2 was
              // not yet available. Now that we have l2Usd, patch each row with the real figure.
              for (const row of quoteDeviationMatrix) {
                const pctVsL2 = Math.round(((row.total_cost_usd - l2Usd) / l2Usd) * 1000) / 10;
                row.pct_vs_kinga_optimised = pctVsL2;
                // Recompute verdict now that we have both axes
                if (row.total_cost_usd === _deviationMatrixLowestCost && pctVsL2 <= 0) {
                  row.verdict = 'below_kinga'; // cheapest AND below L2 benchmark
                } else if (row.total_cost_usd === _deviationMatrixLowestCost) {
                  row.verdict = 'cheapest'; // cheapest but above L2
                } else if (pctVsL2 <= 0) {
                  row.verdict = 'below_kinga'; // not cheapest but below L2
                } else {
                  row.verdict = 'above_kinga'; // above L2 benchmark
                }
              }
              ctx.log('Stage 9', `Deviation matrix patched with L2 (${l2Usd.toFixed(2)}): ${quoteDeviationMatrix.map(r => `${r.panel_beater} pct_vs_kinga=${r.pct_vs_kinga_optimised?.toFixed(1)}% verdict=${r.verdict}`).join(', ')}`);

              const savingsLabel = kingaSavingsUsd >= 0
                ? `KINGA savings [L1-L2]: USD ${kingaSavingsUsd.toFixed(2)} (lowest submitted $${lowestSubmittedUsd.toFixed(2)} minus KINGA per-component optimised $${l2Usd.toFixed(2)})`
                : `SUPPLEMENTARY CLAIM RISK [L1-L2]: USD ${Math.abs(kingaSavingsUsd).toFixed(2)} (cheapest quote $${lowestSubmittedUsd.toFixed(2)} is below KINGA optimised $${l2Usd.toFixed(2)} — likely incomplete)`;
              ctx.log('Stage 9', savingsLabel);
            } else if (compositeResult.allInReconciliationRequired) {
              ctx.log(
                'Stage 9',
                `L2 RECONCILIATION REQUIRED: explicit itemised submitted-price comparison is available, but one or more quote headers do not reconcile to their submitted line totals. ` +
                `No residual amount is allocated; savings and settlement recommendation are suppressed.`
              );
            } else if (!compositeResult.isComplete) {
              ctx.log(
                'Stage 9',
                `L2 INCOMPLETE: ${compositeResult.missingRequiredComponents.length} required component(s) without traceable price: ` +
                `${compositeResult.missingRequiredComponents.join(', ') || 'scope/replacement data gap'}. ` +
                `Partial priced scope=$${compositeResult.partialPricedScopeUsd.toFixed(2)}; savings and settlement recommendation suppressed.`
              );
            }
            ctx.log('Stage 9',
              `Composite optimisation: L1=$${l1TotalUsd.toFixed(2)} ` +
              `L2=${l2Usd === null ? 'INCOMPLETE' : `$${l2Usd.toFixed(2)}`} ` +
              `basis=${compositeResult.costBasis} L3=$${compositeResult.benchmarkReferenceCostUsd.toFixed(2)} ` +
              `NegotiationSavings=$${compositeResult.negotiationSavingsUsd.toFixed(2)} ` +
              `NFS=${compositeResult.negotiationFeasibilityScore} (${compositeResult.negotiationFeasibilityLabel}) ` +
              `HiddenDamageAdvisories=${hiddenDamageAdvisories.length}`);

            // ── BENCHMARK LEARNING FEED ──────────────────────────────────────────────
            // Write every compositeLineItem.selectedCostUsd back to component_repair_outcomes
            // so the benchmark database grows with each processed claim.
            // This covers paint, sundries, strip & assemble, and any component that was
            // priced from a submitted quote (T3/T4) rather than a pre-existing benchmark.
            // Non-benchmark fills (T3) are the most valuable learning signal because they
            // represent real market prices from Zimbabwean repairers.
            // Fire-and-forget: never blocks the pipeline.
            setImmediate(async () => {
              try {
                const { recordFinalizedOutcome, inferCategory } = await import('./repairReplaceEngine');
                const _learningDb = await import('../db').then(m => m.getDb());
                if (!_learningDb) return;
                const _assessmentRows = await _learningDb.select({ id: (await import('../drizzle/schema')).aiAssessments.id })
                  .from((await import('../drizzle/schema')).aiAssessments)
                  .where((await import('drizzle-orm')).eq((await import('../drizzle/schema')).aiAssessments.claimId, claimRecord.claimId))
                  .limit(1);
                const _assessmentId = _assessmentRows[0]?.id;
                if (!_assessmentId) return;
                const _vehicleMake = claimRecord.vehicle?.make ?? undefined;
                const _vehicleModel = claimRecord.vehicle?.model ?? undefined;
                const _vehicleYear = claimRecord.vehicle?.year ?? undefined;
                let feedCount = 0;
                for (const li of compositeResult.compositeLineItems) {
                  if (!li.componentName || li.selectedCostUsd <= 0 || li.dataGap) continue;
                  // Skip benchmark fills — those prices came FROM the benchmark, not from market data
                  if (li.isBenchmarkFill) continue;
                  const outcome: 'repair' | 'replace' | 'write_off' =
                    li.selectedScope === 'replace' ? 'replace' : 'repair';
                  await recordFinalizedOutcome({
                    claimId: claimRecord.claimId,
                    assessmentId: _assessmentId,
                    componentName: li.componentName,
                    componentCategory: inferCategory(li.componentName),
                    severityAtDecision: 'moderate', // default — we don't have per-line-item severity
                    vehicleMake: _vehicleMake,
                    vehicleModel: _vehicleModel,
                    vehicleYear: _vehicleYear,
                    outcome,
                    aiSuggestion: outcome,
                    repairCostUsd: outcome === 'repair' ? li.selectedCostUsd : undefined,
                    replaceCostUsd: outcome === 'replace' ? li.selectedCostUsd : undefined,
                    isAdjusterCorrection: false,
                  }).catch(() => { /* non-fatal */ });
                  feedCount++;
                }
                ctx.log('Stage 9', `Benchmark learning feed: ${feedCount} composite line item(s) written to component_repair_outcomes`);
              } catch (feedErr: any) {
                ctx.log('Stage 9', `Benchmark learning feed failed (non-fatal): ${feedErr?.message ?? feedErr}`);
              }
            });
          }
        } catch (compositeErr) {
          ctx.log('Stage 9', `Composite optimisation failed (non-fatal): ${String(compositeErr)}`);
        }
      }
    } catch (benchErr) {
      ctx.log('Stage 9', `Per-component benchmark query failed (non-fatal): ${String(benchErr)}`);
    }

    ctx.log("Stage 9", `Cost optimisation complete. Expected: ${(totalExpectedCents/100).toFixed(2)} ${currency}, Quoted: ${quotedCents ? (quotedCents/100).toFixed(2) : 'N/A'}, Deviation: ${quoteDeviationPct != null ? (quoteDeviationPct as number).toFixed(1) + '%' : 'N/A'}, Savings: ${(savingsOpportunityCents/100).toFixed(2)}`);

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
            estimatedCostCents: undefined,
          })),
        // TRUE COST from costDecisionEngine — validated outcome only
        trueCostUsd: costDecision?.true_cost_usd ?? null,
        costBasis: costDecision?.cost_basis ?? null,
        decisionConfidence: costDecision?.confidence ?? undefined,
        accidentSeverity: mappedSeverity,
        selectedQuoteComponents: quoteComponents,
        collisionDirection: claimRecord.accidentDetails.collisionDirection,
        marketRegion: region,
        // CX-01-Q/R fix: pass the resolved policy currency so the learning DB record is correctly tagged
        currencyCode: currency,
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
