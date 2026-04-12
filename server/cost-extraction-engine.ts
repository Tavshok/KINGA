/**
 * cost-extraction-engine.ts
 *
 * KINGA Cost Extraction Engine v2
 *
 * Architecture (priority order):
 *   1. Submitted quote line items — authoritative per-item costs from the repairer
 *   2. Learning DB benchmarks — historical costs from previous claims (same model/severity/region)
 *   3. Insufficient data label — clearly states "Insufficient benchmark data" instead of fabricating
 *
 * NEVER uses hardcoded cost tables. All per-item costs must come from actual data sources.
 *
 * Output contract (always satisfied):
 * {
 *   ai_estimate: number,       // total repair cost in USD (from quote or AI extraction)
 *   parts: number,             // parts subtotal in USD
 *   labour: number,            // labour subtotal in USD
 *   fair_range: { min, max },  // ±15–25% of ai_estimate
 *   confidence: number,        // 0–100%
 *   itemised_parts: [...],     // per-component breakdown from actual sources
 *   source: "quote_line_items" | "learning_db" | "extracted" | "insufficient_data"
 * }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteLineItemInput {
  description: string;
  category: string; // 'parts' | 'labor' | 'paint' | 'diagnostic' | 'sundries' | 'other'
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isRepair?: boolean;
  isReplacement?: boolean;
}

export interface LearningBenchmarkInput {
  vehicleDescriptor: string; // "make model body_type"
  componentCount: number;
  collisionDirection: string;
  marketRegion: string;
  avgCostUsd: number | null;
  sampleSize: number;
}

export interface ItemisedPart {
  component: string;
  parts_cost: number | null;
  labour_cost: number | null;
  total: number;
  source: "quote" | "learning_db" | "insufficient_data";
  source_label: string;
}

export interface CostExtractionResult {
  ai_estimate: number;
  parts: number;
  labour: number;
  fair_range: { min: number; max: number };
  confidence: number;
  itemised_parts: ItemisedPart[];
  source: "quote_line_items" | "learning_db" | "extracted" | "insufficient_data";
  basis: string;
}

export interface CostExtractionInput {
  /** AI-extracted total cost in USD (0 if not available) */
  aiEstimatedCost: number;
  /** AI-extracted parts cost in USD (0 if not available) */
  aiPartsCost: number;
  /** AI-extracted labour cost in USD (0 if not available) */
  aiLabourCost: number;
  /** Damage components detected by AI vision */
  damageComponents: string[];
  /** Accident severity from physics engine */
  accidentSeverity: string;
  /** AI extraction confidence (0–100) */
  extractionConfidence: number;
  /** Quoted amounts from panel beaters in USD */
  quotedAmounts: number[];
  /** Actual quote line items from the submitted quotation (if available) */
  quoteLineItems?: QuoteLineItemInput[];
  /** Learning DB benchmark data (if available) */
  learningBenchmark?: LearningBenchmarkInput | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeFairRange(
  estimate: number,
  confidence: number,
  hasQuotes: boolean
): { min: number; max: number } {
  // ±15% when high confidence or quotes available, ±25% when low confidence
  const spread = (confidence >= 80 || hasQuotes) ? 0.15 : 0.25;
  return {
    min: Math.round(estimate * (1 - spread)),
    max: Math.round(estimate * (1 + spread)),
  };
}

// ─── Main extraction function ─────────────────────────────────────────────────

export function extractCosts(input: CostExtractionInput): CostExtractionResult {
  const {
    aiEstimatedCost,
    aiPartsCost,
    aiLabourCost,
    damageComponents,
    accidentSeverity,
    extractionConfidence,
    quotedAmounts,
    quoteLineItems,
    learningBenchmark,
  } = input;

  const hasQuotes = quotedAmounts.length > 0;

  // ── CASE 1: Actual quote line items available ─────────────────────────────
  // This is the authoritative source — use actual submitted costs
  if (quoteLineItems && quoteLineItems.length > 0) {
    const itemised_parts: ItemisedPart[] = [];
    let totalParts = 0;
    let totalLabour = 0;

    for (const item of quoteLineItems) {
      const isParts = item.category === 'parts' || item.category === 'sundries' || item.category === 'other';
      const isLabour = item.category === 'labor' || item.category === 'paint' || item.category === 'diagnostic';

      if (isParts) {
        totalParts += item.lineTotal;
      } else if (isLabour) {
        totalLabour += item.lineTotal;
      }

      itemised_parts.push({
        component: item.description,
        parts_cost: isParts ? item.lineTotal : null,
        labour_cost: isLabour ? item.lineTotal : null,
        total: item.lineTotal,
        source: "quote",
        source_label: `Submitted quote (${item.category})`,
      });
    }

    const totalFromLineItems = itemised_parts.reduce((s, p) => s + p.total, 0);
    // Use the line items total as the authoritative cost
    const authoritativeTotal = totalFromLineItems > 0 ? totalFromLineItems : (quotedAmounts[0] ?? aiEstimatedCost);

    const confidence = Math.min(95, 85 + Math.min(10, quoteLineItems.length));
    return {
      ai_estimate: authoritativeTotal,
      parts: totalParts,
      labour: totalLabour,
      fair_range: computeFairRange(authoritativeTotal, confidence, true),
      confidence,
      itemised_parts,
      source: "quote_line_items",
      basis: `Actual submitted quote with ${quoteLineItems.length} line item(s)`,
    };
  }

  // ── CASE 2: AI total available — use it with learning DB benchmark ────────
  if (aiEstimatedCost > 0) {
    const itemised_parts: ItemisedPart[] = [];

    // If learning DB has benchmark data, use it for per-component estimates
    if (learningBenchmark && learningBenchmark.avgCostUsd && learningBenchmark.sampleSize >= 3) {
      // We have learning data — show it as benchmark
      for (const comp of damageComponents) {
        itemised_parts.push({
          component: comp,
          parts_cost: null,
          labour_cost: null,
          total: 0,
          source: "learning_db",
          source_label: `Learning benchmark (${learningBenchmark.sampleSize} historical claims for ${learningBenchmark.vehicleDescriptor})`,
        });
      }
    } else {
      // No learning data — clearly label as insufficient
      for (const comp of damageComponents) {
        itemised_parts.push({
          component: comp,
          parts_cost: null,
          labour_cost: null,
          total: 0,
          source: "insufficient_data",
          source_label: "Insufficient benchmark data — awaiting more claims for this vehicle/component combination",
        });
      }
    }

    // If no components at all, add a single summary row
    if (itemised_parts.length === 0) {
      itemised_parts.push({
        component: "General vehicle repairs",
        parts_cost: aiPartsCost > 0 ? aiPartsCost : null,
        labour_cost: aiLabourCost > 0 ? aiLabourCost : null,
        total: aiEstimatedCost,
        source: "insufficient_data",
        source_label: "AI-extracted total only — no per-component breakdown available",
      });
    }

    const confidence = Math.min(80, extractionConfidence > 0 ? extractionConfidence - 10 : 50);
    const benchmarkNote = learningBenchmark?.avgCostUsd
      ? ` Learning benchmark: $${learningBenchmark.avgCostUsd.toFixed(0)} (${learningBenchmark.sampleSize} claims).`
      : ' No learning benchmark available yet.';

    return {
      ai_estimate: aiEstimatedCost,
      parts: aiPartsCost > 0 ? aiPartsCost : 0,
      labour: aiLabourCost > 0 ? aiLabourCost : 0,
      fair_range: computeFairRange(aiEstimatedCost, confidence, hasQuotes),
      confidence,
      itemised_parts,
      source: learningBenchmark?.avgCostUsd ? "learning_db" : "extracted",
      basis: `AI-extracted total from claim document (${extractionConfidence}% confidence).${benchmarkNote}`,
    };
  }

  // ── CASE 3: Quote total available but no AI extraction ────────────────────
  if (hasQuotes) {
    const primaryQuote = Math.max(...quotedAmounts);
    const confidence = 70;

    return {
      ai_estimate: primaryQuote,
      parts: 0,
      labour: 0,
      fair_range: computeFairRange(primaryQuote, confidence, true),
      confidence,
      itemised_parts: [{
        component: "Total quoted repair",
        parts_cost: null,
        labour_cost: null,
        total: primaryQuote,
        source: "quote",
        source_label: "Repairer quote total — no line item breakdown available",
      }],
      source: "quote_line_items",
      basis: `Repairer quote total: $${primaryQuote.toFixed(0)} (no AI extraction or line items available)`,
    };
  }

  // ── CASE 4: No data at all ────────────────────────────────────────────────
  return {
    ai_estimate: 0,
    parts: 0,
    labour: 0,
    fair_range: { min: 0, max: 0 },
    confidence: 0,
    itemised_parts: [{
      component: "No cost data available",
      parts_cost: null,
      labour_cost: null,
      total: 0,
      source: "insufficient_data",
      source_label: "No quote, no AI extraction, and no learning data available for this claim",
    }],
    source: "insufficient_data",
    basis: "Insufficient data — no quote submitted, no AI extraction, and no learning benchmark available",
  };
}
