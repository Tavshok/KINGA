/**
 * pipeline-v2/crossQuoteGapAnalysis.ts
 * Cross-Quote Gap Analysis Engine
 */

import { invokeLLM, type Message } from "../_core/llm";

export interface QuoteLineItem {
  component: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number | null;
  category?: string;
}

export interface PerQuoteGap {
  panel_beater: string;
  total_cost: number;
  items_quoted: number;
  items_in_union: number;
  coverage_ratio: number;
  missing_components: string[];
  extra_components: string[];
  vision_validated_gaps: string[];
  vision_refuted_gaps: string[];
  gap_cost_estimate_usd: number | null;
}

export interface CopyQuotationFlag {
  quote_a: string;
  quote_b: string;
  similarity_score: number;
  identical_line_items: string[];
  verdict: "likely_copy" | "suspicious" | "independent";
  reason: string;
}

export interface DeviationMatrixRow {
  panel_beater: string;
  total_cost_usd: number;
  deviation_from_lowest_pct: number;
  deviation_from_kinga_optimised_pct: number | null;
  verdict: "cheapest" | "competitive" | "above_market" | "outlier";
}

export interface CrossQuoteGapAnalysisResult {
  master_component_union: string[];
  per_quote_gaps: PerQuoteGap[];
  copy_quotation_flags: CopyQuotationFlag[];
  deviation_matrix: DeviationMatrixRow[];
  latent_damage_advisories: string[];
  composite_coverage_score: number;
  analysis_notes: string;
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(normalise(a).split(" ").filter((t) => t.length > 2));
  const tokB = new Set(normalise(b).split(" ").filter((t) => t.length > 2));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) if (tokB.has(t)) overlap++;
  return overlap / Math.max(tokA.size, tokB.size);
}

function computeSimilarity(
  itemsA: QuoteLineItem[],
  itemsB: QuoteLineItem[]
): { score: number; identical: string[] } {
  if (itemsA.length === 0 || itemsB.length === 0) return { score: 0, identical: [] };
  const identical: string[] = [];
  let matchCount = 0;
  for (const a of itemsA) {
    for (const b of itemsB) {
      const nameMatch = tokenOverlap(a.component || a.description || "", b.component || b.description || "") > 0.6;
      const priceMatch = a.line_total != null && b.line_total != null
        && Math.abs(a.line_total - b.line_total) / Math.max(a.line_total, b.line_total) < 0.02;
      if (nameMatch && priceMatch) {
        matchCount++;
        identical.push(a.component || a.description || "");
        break;
      }
    }
  }
  const score = matchCount / Math.max(itemsA.length, itemsB.length);
  return { score, identical };
}

export async function runCrossQuoteGapAnalysis(
  quotes: Array<{
    panel_beater?: string | null;
    total_cost?: number | null;
    components?: string[];
    line_items?: QuoteLineItem[];
    confidence?: string;
  }>,
  damageComponents: string[],
  damagePhotoUrls: string[],
  runVisionValidation: boolean = false
): Promise<CrossQuoteGapAnalysisResult> {
  if (quotes.length === 0) {
    return {
      master_component_union: [],
      per_quote_gaps: [],
      copy_quotation_flags: [],
      deviation_matrix: [],
      latent_damage_advisories: [],
      composite_coverage_score: 0,
      analysis_notes: "No quotes available for cross-quote gap analysis.",
    };
  }

  // 1. Build master component union
  const unionSet = new Set<string>();
  for (const q of quotes) {
    const comps = q.components ?? (q.line_items ?? []).map((li) => li.component || li.description || "").filter(Boolean);
    for (const c of comps) { if (c.trim()) unionSet.add(normalise(c.trim())); }
  }
  for (const d of damageComponents) { if (d.trim()) unionSet.add(normalise(d.trim())); }
  const masterUnion = Array.from(unionSet);

  // 2. Per-quote gap analysis
  const validQuotes = quotes.filter((q) => (q.total_cost ?? 0) > 0);
  const lowestCost = validQuotes.length > 0 ? Math.min(...validQuotes.map((q) => q.total_cost ?? Infinity)) : 0;
  const perQuoteGaps: PerQuoteGap[] = [];

  for (const q of quotes) {
    const pbName = q.panel_beater ?? "Unknown Panel Beater";
    const totalCost = q.total_cost ?? 0;
    const quotedComps = new Set(
      (q.components ?? (q.line_items ?? []).map((li) => li.component || li.description || "").filter(Boolean))
        .map((c) => normalise(c.trim()))
    );
    const missingComponents: string[] = [];
    const extraComponents: string[] = [];
    for (const uc of masterUnion) {
      if (!quotedComps.has(uc)) {
        const otherQuotesHaveIt = quotes.filter((oq) => oq !== q).some((oq) => {
          const oqComps = oq.components ?? (oq.line_items ?? []).map((li) => li.component || li.description || "").filter(Boolean);
          return oqComps.some((c) => tokenOverlap(c, uc) > 0.6);
        });
        if (otherQuotesHaveIt) missingComponents.push(uc);
      }
    }
    for (const qc of quotedComps) {
      const inDamageList = damageComponents.some((d) => tokenOverlap(d, qc) > 0.5);
      if (!inDamageList) extraComponents.push(qc);
    }
    const coverageRatio = masterUnion.length > 0
      ? Array.from(quotedComps).filter((qc) => masterUnion.some((uc) => tokenOverlap(uc, qc) > 0.6)).length / masterUnion.length
      : 1;
    perQuoteGaps.push({
      panel_beater: pbName, total_cost: totalCost,
      items_quoted: quotedComps.size, items_in_union: masterUnion.length,
      coverage_ratio: Math.round(coverageRatio * 100) / 100,
      missing_components: missingComponents, extra_components: extraComponents,
      vision_validated_gaps: [], vision_refuted_gaps: [], gap_cost_estimate_usd: null,
    });
  }

  // 3. Vision validation (optional)
  if (runVisionValidation && damagePhotoUrls.length > 0) {
    const allGaps = [...new Set(perQuoteGaps.flatMap((pq) => pq.missing_components))];
    if (allGaps.length > 0) {
      try {
        const imageContent = damagePhotoUrls.slice(0, 3).map((url) => ({
          type: "image_url" as const, image_url: { url, detail: "low" as const },
        }));
        const gapList = allGaps.map((g, i) => (i + 1) + ". " + g).join("\n");
        const prompt = "You are an automotive damage assessor reviewing repair quote gaps.\n"
          + "The following components were quoted by some panel beaters but MISSED by others:\n"
          + gapList
          + "\nFor each component determine: CONFIRMED, REFUTED, or UNCERTAIN.\n"
          + 'Respond with JSON: { "results": [{ "component": "...", "verdict": "CONFIRMED|REFUTED|UNCERTAIN" }] }';
        const visionMessage: Message = { role: "user", content: [...imageContent, { type: "text" as const, text: prompt }] };
        const response = await invokeLLM({
          messages: [visionMessage],
          response_format: { type: "json_object" },
        });
        const content = response?.choices?.[0]?.message?.content;
        if (content && typeof content === 'string') {
          const parsed = JSON.parse(content);
          const results: Array<{ component: string; verdict: string }> = parsed.results ?? [];
          for (const pqg of perQuoteGaps) {
            for (const gap of pqg.missing_components) {
              const result = results.find((r) => tokenOverlap(r.component, gap) > 0.5);
              if (result?.verdict === "CONFIRMED") pqg.vision_validated_gaps.push(gap);
              else if (result?.verdict === "REFUTED") pqg.vision_refuted_gaps.push(gap);
            }
          }
        }
      } catch { /* Vision validation is non-fatal */ }
    }
  }

  // 4. Copy quotation detection
  const copyFlags: CopyQuotationFlag[] = [];
  for (let i = 0; i < quotes.length; i++) {
    for (let j = i + 1; j < quotes.length; j++) {
      const qA = quotes[i]; const qB = quotes[j];
      const itemsA: QuoteLineItem[] = qA.line_items ?? (qA.components ?? []).map((c) => ({ component: c }));
      const itemsB: QuoteLineItem[] = qB.line_items ?? (qB.components ?? []).map((c) => ({ component: c }));
      const { score, identical } = computeSimilarity(itemsA, itemsB);
      if (score > 0.3) {
        const verdict: CopyQuotationFlag["verdict"] = score >= 0.85 ? "likely_copy" : score >= 0.6 ? "suspicious" : "independent";
        copyFlags.push({
          quote_a: qA.panel_beater ?? ("Quote " + (i + 1)),
          quote_b: qB.panel_beater ?? ("Quote " + (j + 1)),
          similarity_score: Math.round(score * 100) / 100,
          identical_line_items: identical, verdict,
          reason: Math.round(score * 100) + "% of line items match by component name and price",
        });
      }
    }
  }

  // 5. Deviation matrix
  const deviationMatrix: DeviationMatrixRow[] = validQuotes.map((q) => {
    const cost = q.total_cost ?? 0;
    const deviationFromLowest = lowestCost > 0 ? Math.round(((cost - lowestCost) / lowestCost) * 1000) / 10 : 0;
    const verdict: DeviationMatrixRow["verdict"] = cost === lowestCost ? "cheapest"
      : deviationFromLowest <= 10 ? "competitive" : deviationFromLowest <= 30 ? "above_market" : "outlier";
    return { panel_beater: q.panel_beater ?? "Unknown", total_cost_usd: cost,
      deviation_from_lowest_pct: deviationFromLowest, deviation_from_kinga_optimised_pct: null, verdict };
  });

  // 6. Latent damage advisories
  const latentAdvisories: string[] = damageComponents.filter((dc) => {
    const normDc = normalise(dc);
    return !quotes.some((q) => {
      const comps = q.components ?? (q.line_items ?? []).map((li) => li.component || li.description || "");
      return comps.some((c) => tokenOverlap(c, normDc) > 0.5);
    });
  });

  // 7. Composite coverage score
  const allQuotedNorm = new Set(quotes.flatMap((q) =>
    (q.components ?? (q.line_items ?? []).map((li) => li.component || li.description || "").filter(Boolean)).map((c) => normalise(c))
  ));
  const compositeCoverage = damageComponents.length > 0
    ? damageComponents.filter((dc) => {
        const normDc = normalise(dc);
        return Array.from(allQuotedNorm).some((qc) => tokenOverlap(qc, normDc) > 0.5);
      }).length / damageComponents.length
    : 1;

  const notes: string[] = [];
  if (copyFlags.some((f) => f.verdict === "likely_copy")) {
    notes.push("WARNING: Likely copy quotation detected between " + copyFlags.filter((f) => f.verdict === "likely_copy").map((f) => f.quote_a + " and " + f.quote_b).join(", ") + ".");
  }
  if (latentAdvisories.length > 0) {
    notes.push("WARNING: " + latentAdvisories.length + " damaged component(s) not quoted by any panel beater: " + latentAdvisories.slice(0, 5).join(", ") + (latentAdvisories.length > 5 ? "..." : "") + ".");
  }
  if (perQuoteGaps.some((pq) => pq.missing_components.length > 3)) {
    notes.push("WARNING: One or more quotes are missing significant components - adjuster review required.");
  }

  return {
    master_component_union: masterUnion,
    per_quote_gaps: perQuoteGaps,
    copy_quotation_flags: copyFlags,
    deviation_matrix: deviationMatrix,
    latent_damage_advisories: latentAdvisories,
    composite_coverage_score: Math.round(compositeCoverage * 100),
    analysis_notes: notes.join(" ") || "Cross-quote gap analysis complete.",
  };
}
