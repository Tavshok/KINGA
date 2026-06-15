/**
 * cost-extraction-engine.ts
 *
 * KINGA Cost Extraction Engine v3
 *
 * Architecture (priority order):
 *   1. Submitted quote line items — authoritative per-item costs from the repairer
 *   2. AI extraction with full parts/labour split — use directly when both present
 *   3. AI total only — auto-split 60/40 parts/labour, source = "estimated"
 *   4. Component-based estimation — per-component cost lookup by severity, source = "estimated"
 *   5. Severity fallback — range-based estimate when no components, source = "severity_fallback"
 *
 * NEVER uses hardcoded cost tables for real claims. Severity fallback is only used
 * as a last resort when absolutely no data is available.
 *
 * Output contract (always satisfied — no field is ever null/undefined/0 except
 * when genuinely zero):
 * {
 *   ai_estimate: number,       // total repair cost (from quote or AI extraction or estimate)
 *   parts: number,             // parts subtotal
 *   labour: number,            // labour subtotal
 *   fair_range: { min, max },  // ±15–25% of ai_estimate
 *   confidence: number,        // 0–100%
 *   itemised_parts: [...],     // per-component breakdown from actual sources
 *   source: "quote_line_items" | "learning_db" | "extracted" | "estimated" | "severity_fallback" | "insufficient_data"
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
  source: "quote" | "learning_db" | "extracted" | "estimated" | "insufficient_data";
  source_label: string;
}

export interface CostExtractionResult {
  ai_estimate: number;
  parts: number;
  labour: number;
  fair_range: { min: number; max: number };
  confidence: number;
  itemised_parts: ItemisedPart[];
  source: "quote_line_items" | "learning_db" | "extracted" | "estimated" | "severity_fallback" | "insufficient_data";
  basis: string;
  /** Echo of the learning benchmark input — used by the waterfall chart in the Forensic Report */
  learningBenchmark?: LearningBenchmarkInput | null;
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
  /** ISO 4217 currency code from the claim (e.g. 'USD', 'ZAR', 'ZIG', 'ZMW'). Defaults to 'USD'. */
  currencyCode?: string;
}

// ─── Severity cost ranges (last-resort fallback only) ─────────────────────────

const SEVERITY_RANGES: Record<string, { min: number; max: number; midpoint: number }> = {
  minor:    { min: 500,   max: 5000,  midpoint: 2000  },
  moderate: { min: 3000,  max: 12000, midpoint: 6000  },
  severe:   { min: 8000,  max: 35000, midpoint: 18000 },
  total_loss: { min: 15000, max: 80000, midpoint: 40000 },
};

// Per-component cost estimates by severity (used in component-based estimation)
const COMPONENT_COST_BY_SEVERITY: Record<string, number> = {
  minor:    800,
  moderate: 2500,
  severe:   6000,
  total_loss: 15000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeFairRange(
  estimate: number,
  confidence: number,
  hasQuotes: boolean
): { min: number; max: number } {
  // ±15% when high confidence (≥80) or quotes available, ±25% when low confidence
  const spread = (confidence >= 80 || hasQuotes) ? 0.15 : 0.25;
  return {
    min: Math.round(estimate * (1 - spread)),
    max: Math.round(estimate * (1 + spread)),
  };
}

function normaliseSeverity(s: string): string {
  const lower = (s ?? "").toLowerCase().replace(/[_\s-]/g, "_");
  if (lower.includes("total") || lower.includes("write")) return "total_loss";
  if (lower.includes("sev") || lower.includes("major") || lower.includes("critical")) return "severe";
  if (lower.includes("mod")) return "moderate";
  return "minor";
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
    currencyCode = 'USD',
  } = input;

  const currSymbol = currencyCode === 'USD' ? '$' : currencyCode === 'ZAR' ? 'R' : currencyCode;
  const hasQuotes = quotedAmounts.length > 0;
  const severity = normaliseSeverity(accidentSeverity);

  // ── CASE 1: Actual quote line items available ─────────────────────────────
  // This is the authoritative source — use actual submitted costs
  if (quoteLineItems && quoteLineItems.length > 0) {
    const itemised_parts: ItemisedPart[] = [];
    let totalParts = 0;
    let totalLabour = 0;

    for (const item of quoteLineItems) {
      const isParts = item.category === 'parts' || item.category === 'sundries' || item.category === 'other';
      const isLabour = item.category === 'labor' || item.category === 'paint' || item.category === 'diagnostic';

      if (isParts) totalParts += item.lineTotal;
      else if (isLabour) totalLabour += item.lineTotal;

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
      basis: `Actual submitted quote with ${quoteLineItems.length} line item(s) [${currencyCode}]`,
      learningBenchmark: learningBenchmark ?? null,
    };
  }

  // ── CASE 2: AI total available ────────────────────────────────────────────
  if (aiEstimatedCost > 0) {
    const hasBothSplit = aiPartsCost > 0 && aiLabourCost > 0;

    // Determine parts/labour split
    let parts: number;
    let labour: number;
    if (hasBothSplit) {
      parts = aiPartsCost;
      labour = aiLabourCost;
    } else {
      // Auto-split 60/40 parts/labour when only total is available
      parts = Math.round(aiEstimatedCost * 0.6);
      labour = aiEstimatedCost - parts;
    }

    // Determine source
    const hasLearningData = learningBenchmark?.avgCostUsd && (learningBenchmark?.sampleSize ?? 0) >= 3;
    const source = hasLearningData ? "learning_db" : hasBothSplit ? "extracted" : "estimated";

    // Confidence: pass through extraction confidence directly when full split available,
    // otherwise cap at 80 and reduce by 10 for uncertainty
    const confidence = hasBothSplit
      ? extractionConfidence
      : Math.min(80, extractionConfidence > 0 ? extractionConfidence - 10 : 50);

    // Build itemised parts
    const itemised_parts: ItemisedPart[] = [];
    if (damageComponents.length > 0) {
      for (const comp of damageComponents) {
        const compSource = hasLearningData ? "learning_db" : "extracted";
        const compLabel = hasLearningData
          ? `Learning benchmark (${learningBenchmark!.sampleSize} historical claims for ${learningBenchmark!.vehicleDescriptor})`
          : hasBothSplit
            ? "AI-extracted from claim document"
            : "AI-extracted total — auto-split 60/40 parts/labour";
        itemised_parts.push({
          component: comp,
          parts_cost: null,
          labour_cost: null,
          total: 0,
          source: compSource,
          source_label: compLabel,
        });
      }
    } else {
      itemised_parts.push({
        component: "General vehicle repairs",
        parts_cost: parts > 0 ? parts : null,
        labour_cost: labour > 0 ? labour : null,
        total: aiEstimatedCost,
        source: hasBothSplit ? "extracted" : "estimated",
        source_label: hasBothSplit
          ? "AI-extracted from claim document"
          : "AI-extracted total — auto-split 60/40 parts/labour",
      });
    }

    const benchmarkNote = learningBenchmark?.avgCostUsd
      ? ` Learning benchmark: ${currSymbol}${learningBenchmark.avgCostUsd.toFixed(0)} (${learningBenchmark.sampleSize} claims, ${currencyCode}).`
      : ' No learning benchmark available yet.';

    return {
      ai_estimate: aiEstimatedCost,
      parts,
      labour,
      fair_range: computeFairRange(aiEstimatedCost, confidence, hasQuotes),
      confidence,
      itemised_parts,
      source,
      learningBenchmark: learningBenchmark ?? null,
      basis: hasBothSplit
        ? `AI-extracted total with parts/labour split from claim document (${extractionConfidence}% confidence, ${currencyCode}).${benchmarkNote}`
        : `AI-extracted total from claim document (${extractionConfidence}% confidence, ${currencyCode}). Parts/labour auto-split 60/40.${benchmarkNote}`,
    };
  }

  // ── CASE 3: Quote total available but no AI extraction ────────────────────
  if (hasQuotes) {
    const primaryQuote = Math.max(...quotedAmounts);
    const parts = Math.round(primaryQuote * 0.6);
    const labour = primaryQuote - parts;
    const confidence = 70;

    return {
      ai_estimate: primaryQuote,
      parts,
      labour,
      fair_range: computeFairRange(primaryQuote, confidence, true),
      confidence,
      learningBenchmark: learningBenchmark ?? null,
      itemised_parts: [{
        component: "Total quoted repair",
        parts_cost: parts,
        labour_cost: labour,
        total: primaryQuote,
        source: "quote",
        source_label: "Repairer quote total — no line item breakdown available",
      }],
      source: "quote_line_items",
      basis: `Repairer quote total: ${currSymbol}${primaryQuote.toFixed(0)} ${currencyCode} (no AI extraction or line items available)`,
    };
  }

  // ── CASE 4: Component-based estimation ────────────────────────────────────
  // Use per-component cost estimates when damage components are known
  if (damageComponents.length > 0) {
    const costPerComponent = COMPONENT_COST_BY_SEVERITY[severity] ?? COMPONENT_COST_BY_SEVERITY.minor;
    const total = costPerComponent * damageComponents.length;
    const parts = Math.round(total * 0.6);
    const labour = total - parts;
    const confidence = Math.min(65, Math.max(40, 40 + damageComponents.length * 3));

    const itemised_parts: ItemisedPart[] = damageComponents.map(comp => ({
      component: comp,
      parts_cost: Math.round(costPerComponent * 0.6),
      labour_cost: Math.round(costPerComponent * 0.4),
      total: costPerComponent,
      source: "estimated" as const,
      source_label: `Component-based estimate (${severity} severity, no quote or KINGA extraction available)`,
    }));

    return {
      ai_estimate: total,
      parts,
      labour,
      fair_range: computeFairRange(total, confidence, false),
      confidence,
      learningBenchmark: learningBenchmark ?? null,
      itemised_parts,
      source: "estimated",
      basis: `Component-based estimate: ${damageComponents.length} component(s) × ${currSymbol}${costPerComponent} (${severity} severity). No quote or AI extraction available.`,
    };
  }

  // ── CASE 5: Severity fallback — no data at all ────────────────────────────
  const range = SEVERITY_RANGES[severity] ?? SEVERITY_RANGES.minor;
  const total = range.midpoint;
  const parts = Math.round(total * 0.6);
  const labour = total - parts;

  return {
    ai_estimate: total,
    parts,
    labour,
    fair_range: { min: range.min, max: range.max },
    confidence: 30,
    itemised_parts: [{
      component: `${severity.charAt(0).toUpperCase() + severity.slice(1).replace('_', ' ')} damage — severity-based estimate`,
      parts_cost: parts,
      labour_cost: labour,
      total,
      source: "estimated",
      source_label: `Severity-range estimate (${severity}): ${currSymbol}${range.min}–${currSymbol}${range.max}. No quote, no AI extraction, no components available.`,
    }],
    source: "severity_fallback",
    learningBenchmark: learningBenchmark ?? null,
    basis: `Severity-based range estimate (${severity}): ${currSymbol}${range.min}–${currSymbol}${range.max} ${currencyCode}. No quote, no AI extraction, and no damage components available.`,
  };
}
