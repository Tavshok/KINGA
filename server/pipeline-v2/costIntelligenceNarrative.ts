/**
 * costIntelligenceNarrative.ts
 *
 * COST INTELLIGENCE NARRATIVE GENERATOR
 *
 * Converts structured multi-quote, cost deviation, and alignment data
 * into a concise, professional 3–5 sentence paragraph suitable for a
 * claims decision panel.
 *
 * Rules:
 * - No mention of AI or automated systems
 * - Measured, objective tone
 * - Every sentence anchored to a measurable fact
 * - Prioritises assessor-agreed cost if available
 */

// ─── Input types ─────────────────────────────────────────────────────────────

export interface QuoteEntry {
  quote_id: string;
  panel_beater: string;
  total_cost: number; // USD
  currency?: string;
}

export interface CostNarrativeInput {
  quotes: QuoteEntry[];
  selected_quote_id: string;
  agreed_cost_usd: number | null;
  ai_estimate_usd: number | null;
  market_value_usd: number | null;
  median_cost: number | null;
  flags: string[]; // e.g. ["inflated_quote", "under_repair_risk", "structural_gap"]
  alignment_status: "FULLY_ALIGNED" | "PARTIALLY_ALIGNED" | "MISALIGNED" | null;
  critical_missing: string[]; // component names
  unrelated_items: string[]; // component names
  engineering_comment: string | null;
  coverage_ratio: number | null; // 0–1
  assessor_name: string | null;
  quote_count: number;
}

// ─── Output type ─────────────────────────────────────────────────────────────

export interface CostNarrativeOutput {
  narrative: string;           // 3–5 sentence paragraph for decision panel
  recommendation: "APPROVE" | "REVIEW" | "REJECT";
  recommendation_reason: string;
  flags_addressed: string[];
  confidence: "high" | "medium" | "low";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(usd: number): string {
  return `USD ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(a: number, b: number): string {
  if (b === 0) return "N/A";
  const diff = ((a - b) / b) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}%`;
}

function spreadDescription(quotes: QuoteEntry[]): string {
  if (quotes.length < 2) return "";
  const costs = quotes.map(q => q.total_cost).sort((a, b) => a - b);
  const low = costs[0];
  const high = costs[costs.length - 1];
  const spreadPct = ((high - low) / low) * 100;
  return `The ${quotes.length} submitted quotes ranged from ${fmt(low)} to ${fmt(high)}, a spread of ${spreadPct.toFixed(0)}%.`;
}

function inflationComment(quotes: QuoteEntry[], selectedId: string, medianCost: number | null): string {
  const inflated = quotes.filter(q => {
    if (q.quote_id === selectedId) return false;
    if (!medianCost) return false;
    return q.total_cost > medianCost * 1.3;
  });
  if (inflated.length === 0) return "";
  const names = inflated.map(q => q.panel_beater).join(" and ");
  return `The quote${inflated.length > 1 ? "s" : ""} submitted by ${names} exceeded the median cost by more than 30% and ${inflated.length > 1 ? "were" : "was"} not selected.`;
}

function selectionJustification(
  input: CostNarrativeInput,
  selectedQuote: QuoteEntry | undefined
): string {
  if (!selectedQuote) return "";
  const { agreed_cost_usd, assessor_name, quote_count } = input;

  if (agreed_cost_usd !== null && assessor_name) {
    const saving = selectedQuote.total_cost - agreed_cost_usd;
    if (saving > 0) {
      return `Following independent assessment by ${assessor_name} across ${quote_count} submitted quote${quote_count !== 1 ? "s" : ""}, the agreed repair cost was negotiated to ${fmt(agreed_cost_usd)}, representing a saving of ${fmt(saving)} against the lowest submitted quote.`;
    }
    return `The agreed repair cost of ${fmt(agreed_cost_usd)} was confirmed by ${assessor_name} following review of ${quote_count} submitted quote${quote_count !== 1 ? "s" : ""}.`;
  }

  return `The selected quote from ${selectedQuote.panel_beater} at ${fmt(selectedQuote.total_cost)} was identified as the most economically defensible option from the ${quote_count} submission${quote_count !== 1 ? "s" : ""} received.`;
}

function repairToValueComment(
  agreedCost: number | null,
  marketValue: number | null
): string {
  if (!agreedCost || !marketValue || marketValue === 0) return "";
  const ratio = (agreedCost / marketValue) * 100;
  if (ratio >= 70) {
    return `The repair-to-value ratio of ${ratio.toFixed(1)}% approaches the total-loss threshold; a write-off assessment is recommended before authorising repairs.`;
  }
  if (ratio >= 50) {
    return `The repair-to-value ratio of ${ratio.toFixed(1)}% is elevated; the insurer should confirm the vehicle's current market value before proceeding.`;
  }
  return `The repair-to-value ratio of ${ratio.toFixed(1)}% is well within the economic repair range, confirming that repair is the appropriate course of action.`;
}

function alignmentComment(input: CostNarrativeInput): string {
  const { alignment_status, critical_missing, unrelated_items, coverage_ratio } = input;
  if (!alignment_status) return "";

  if (alignment_status === "FULLY_ALIGNED") {
    const coveragePct = coverage_ratio !== null ? ` (${(coverage_ratio * 100).toFixed(0)}% component coverage)` : "";
    return `Engineering review confirms the quote is fully aligned with the assessed damage${coveragePct}.`;
  }

  if (alignment_status === "PARTIALLY_ALIGNED") {
    const missing = critical_missing.length > 0
      ? ` The following structural components are present in the damage assessment but absent from the quote: ${critical_missing.join(", ")}.`
      : "";
    return `Engineering review indicates partial alignment between the quote and the assessed damage.${missing} The insurer should seek clarification from the repairer before authorising payment.`;
  }

  if (alignment_status === "MISALIGNED") {
    const unrelated = unrelated_items.length > 0
      ? ` The following components in the quote are not consistent with the accident mechanism: ${unrelated_items.join(", ")}.`
      : "";
    return `Engineering review has identified a misalignment between the quote and the assessed damage.${unrelated} This claim requires manual review before any payment is authorised.`;
  }

  return "";
}

function flagComment(flags: string[]): string {
  const comments: string[] = [];
  if (flags.includes("under_repair_risk")) {
    comments.push("the agreed cost carries a risk of under-repair if hidden damage is identified during disassembly");
  }
  if (flags.includes("structural_gap")) {
    comments.push("one or more structural components are absent from the quote");
  }
  if (flags.includes("photos_not_ingested")) {
    comments.push("photographic evidence has not been processed and the damage consistency score remains provisional");
  }
  if (flags.includes("quote_not_mapped")) {
    comments.push("the quote could not be fully mapped to the damage component list");
  }
  if (comments.length === 0) return "";
  return `Note: ${comments.join("; ")}.`;
}

function determineRecommendation(input: CostNarrativeInput): {
  recommendation: "APPROVE" | "REVIEW" | "REJECT";
  reason: string;
} {
  const { alignment_status, flags, agreed_cost_usd, market_value_usd } = input;

  if (alignment_status === "MISALIGNED") {
    return { recommendation: "REVIEW", reason: "Quote contains components inconsistent with the accident mechanism" };
  }
  if (flags.includes("inflated_quote") && input.quotes.length === 1) {
    return { recommendation: "REVIEW", reason: "Single quote with inflation flag — additional quotes required" };
  }
  if (agreed_cost_usd && market_value_usd && (agreed_cost_usd / market_value_usd) >= 0.7) {
    return { recommendation: "REVIEW", reason: "Repair-to-value ratio approaches total-loss threshold" };
  }
  if (alignment_status === "PARTIALLY_ALIGNED" && input.critical_missing.length > 0) {
    return { recommendation: "REVIEW", reason: "Structural components missing from quote require clarification" };
  }
  return { recommendation: "APPROVE", reason: "Quote is economically defensible and engineering-aligned" };
}

function determineConfidence(input: CostNarrativeInput): "high" | "medium" | "low" {
  let score = 100;
  if (!input.agreed_cost_usd) score -= 20;
  if (!input.assessor_name) score -= 10;
  if (input.quote_count < 2) score -= 15;
  if (input.alignment_status === "PARTIALLY_ALIGNED") score -= 15;
  if (input.alignment_status === "MISALIGNED") score -= 30;
  if (input.flags.includes("photos_not_ingested")) score -= 10;
  if (input.coverage_ratio !== null && input.coverage_ratio < 0.7) score -= 15;
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

// ─── Main function ────────────────────────────────────────────────────────────

export function generateCostIntelligenceNarrative(
  input: CostNarrativeInput
): CostNarrativeOutput {
  const selectedQuote = input.quotes.find(q => q.quote_id === input.selected_quote_id);

  const sentences: string[] = [];

  // Sentence 1: Spread description
  const spread = spreadDescription(input.quotes);
  if (spread) sentences.push(spread);

  // Sentence 2: Selection justification / agreed cost
  const selection = selectionJustification(input, selectedQuote);
  if (selection) sentences.push(selection);

  // Sentence 3: Inflation comment (if applicable)
  const inflation = inflationComment(input.quotes, input.selected_quote_id, input.median_cost);
  if (inflation) sentences.push(inflation);

  // Sentence 4: Repair-to-value comment
  const rtv = repairToValueComment(input.agreed_cost_usd, input.market_value_usd);
  if (rtv) sentences.push(rtv);

  // Sentence 5: Engineering alignment comment
  const alignment = alignmentComment(input);
  if (alignment) sentences.push(alignment);

  // Sentence 6: Flags (appended only if not already covered)
  const flagNote = flagComment(
    input.flags.filter(f => f !== "inflated_quote") // inflation already handled above
  );
  if (flagNote) sentences.push(flagNote);

  // Trim to 5 sentences max (keep most important)
  const narrative = sentences.slice(0, 5).join(" ");

  const { recommendation, reason } = determineRecommendation(input);
  const confidence = determineConfidence(input);

  const flagsAddressed = [
    ...(input.flags.includes("inflated_quote") ? ["inflated_quote"] : []),
    ...(input.alignment_status === "MISALIGNED" ? ["misaligned_quote"] : []),
    ...(input.alignment_status === "PARTIALLY_ALIGNED" ? ["partially_aligned_quote"] : []),
    ...(input.flags.includes("under_repair_risk") ? ["under_repair_risk"] : []),
    ...(input.flags.includes("structural_gap") ? ["structural_gap"] : []),
    ...(input.flags.includes("photos_not_ingested") ? ["photos_not_ingested"] : []),
  ];

  return {
    narrative: narrative || "Insufficient data to generate a cost intelligence narrative.",
    recommendation,
    recommendation_reason: reason,
    flags_addressed: flagsAddressed,
    confidence,
  };
}
