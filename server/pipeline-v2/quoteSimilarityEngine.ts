/**
 * pipeline-v2/quoteSimilarityEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * QUOTE SIMILARITY & COPY-QUOTATION DETECTION ENGINE
 *
 * Analyses structural and numerical similarity across multiple repair quotes
 * to detect copy quotations, collusion patterns, and per-item anomalies.
 *
 * PIPELINE ROLE: Stage 8b — called inside Stage 8 (Fraud Analysis) after
 * quote extraction (Stage 3) when ≥2 quotes are present.
 *
 * DETECTION METHODS:
 *   1. Structural fingerprint — canonical sorted component set (order-independent)
 *      Jaccard similarity on component sets: identical component lists = high risk
 *   2. Sequence similarity — Longest Common Subsequence ratio on original line-item
 *      order; matching order across independent repairers is structurally suspicious
 *   3. Amount similarity — per-matched-component cost comparison; amounts within 2%
 *      across supposedly independent quotes flag collusion
 *   4. Total cost similarity — overall quote totals within 1% = near-identical
 *   5. Labour/parts ratio similarity — same labour:parts split across quotes
 *
 * VERDICT THRESHOLDS:
 *   HIGH   (copy_quotation):   structural ≥ 0.85 AND (sequence ≥ 0.80 OR amount ≥ 0.80)
 *   MEDIUM (suspicious):       structural ≥ 0.70 OR (sequence ≥ 0.65 AND amount ≥ 0.65)
 *   LOW    (independent):      below MEDIUM thresholds
 *
 * OUTPUT:
 *   QuoteSimilarityResult — per-pair analysis + overall verdict + per-item flags
 *
 * DESIGN RULES:
 *   - Pure function (no async, no side effects) — easy to test and replay
 *   - No AI/model terminology in output text
 *   - All scores are 0–1 floats rounded to 3 decimal places
 *   - Structural completeness takes precedence over price in anomaly flagging
 *   - Missing components are flagged separately from inflated components
 *   - Professional insurance language throughout
 */

import type { ExtractedQuote, QuoteLineItem } from "./quoteExtractionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface QuotePairSimilarity {
  /** Index of quote A in the input array */
  quote_a_index: number;
  /** Panel beater name for quote A */
  quote_a_name: string;
  /** Index of quote B in the input array */
  quote_b_index: number;
  /** Panel beater name for quote B */
  quote_b_name: string;

  /** Jaccard similarity on canonical component sets (0–1) */
  structural_similarity: number;
  /** LCS ratio on original line-item description order (0–1). Null if either quote has no line items. */
  sequence_similarity: number | null;
  /** Proportion of matched components whose amounts are within 2% of each other (0–1) */
  amount_similarity: number | null;
  /** Whether total costs are within 1% of each other */
  total_cost_near_identical: boolean;
  /** Whether labour:parts ratios are within 5% of each other (null if either quote lacks breakdown) */
  labour_parts_ratio_similar: boolean | null;

  /**
   * Components present in A but absent from B.
   * These are legitimate structural gaps — B may be incomplete.
   */
  components_only_in_a: string[];
  /**
   * Components present in B but absent from A.
   */
  components_only_in_b: string[];
  /**
   * Components present in both quotes where the amounts differ by >20%.
   * Flags potential selective inflation in one quote.
   */
  amount_outlier_components: Array<{
    component: string;
    amount_a: number;
    amount_b: number;
    deviation_pct: number;
  }>;

  /** Composite similarity verdict for this pair */
  verdict: "copy_quotation" | "suspicious" | "independent";
  /** Human-readable explanation of the verdict */
  verdict_reason: string;
  /** Composite risk score for this pair (0–100) */
  pair_risk_score: number;
}

export interface PerItemFlag {
  /** Canonical component name */
  component: string;
  /** Quotes that include this component (by panel beater name) */
  present_in: string[];
  /** Quotes that are missing this component (by panel beater name) */
  absent_from: string[];
  /**
   * Whether this component appears in the damage analysis but not in any quote.
   * Populated when damageComponents is provided to the engine.
   */
  missing_from_all_quotes: boolean;
  /**
   * Whether this component appears in at least one quote but was not detected
   * in the damage analysis. May indicate items quoted for undamaged components.
   */
  not_in_damage_analysis: boolean;
  /** Per-quote amounts for this component (null if not itemised in that quote) */
  amounts: Array<{ panel_beater: string; amount: number | null; currency: string | null }>;
  /** Whether amounts vary by >30% across quotes that include this component */
  high_amount_variance: boolean;
  /** Coefficient of variation across quoted amounts (null if <2 quotes have amounts) */
  amount_cv: number | null;
}

export interface QuoteSimilarityResult {
  /** Number of quotes analysed */
  quotes_analysed: number;
  /** Per-pair similarity analysis */
  pairs: QuotePairSimilarity[];
  /**
   * Overall copy-quotation verdict across all pairs.
   * "confirmed" if any pair is copy_quotation.
   * "suspected" if any pair is suspicious.
   * "not_detected" if all pairs are independent.
   */
  overall_verdict: "confirmed" | "suspected" | "not_detected";
  /** Highest pair_risk_score across all pairs (0–100) */
  overall_risk_score: number;
  /** Per-component cross-quote analysis */
  per_item_flags: PerItemFlag[];
  /** Components detected in damage analysis but absent from all quotes */
  unquoted_damage_components: string[];
  /** Components present in at least one quote but not in damage analysis */
  extra_quoted_components: string[];
  /** Human-readable summary for the fraud report */
  summary: string;
  /** Whether this result should contribute to the fraud indicator score */
  should_flag: boolean;
  /** Recommended fraud score contribution (0–40) */
  fraud_score_contribution: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a component name to a canonical lowercase key for comparison */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jaccard similarity between two sets of strings.
 * Returns 0 if both sets are empty.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach((item) => { if (b.has(item)) intersection++; });
  const union = new Set(Array.from(a).concat(Array.from(b))).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Longest Common Subsequence length between two arrays of strings.
 * O(n*m) — only called when both arrays are non-empty.
 */
function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  // Use two-row DP to save memory
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n];
}

/** LCS ratio: lcs_length / max(len_a, len_b). Returns null if either array is empty. */
function lcsRatio(a: string[], b: string[]): number | null {
  if (a.length === 0 || b.length === 0) return null;
  const lcs = lcsLength(a, b);
  return lcs / Math.max(a.length, b.length);
}

/** Round to 3 decimal places */
function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Coefficient of variation (stddev / mean). Returns null if <2 values or mean is 0. */
function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAIR ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

function analysePair(
  a: ExtractedQuote,
  aIdx: number,
  b: ExtractedQuote,
  bIdx: number
): QuotePairSimilarity {
  const nameA = a.panel_beater ?? `Quote ${aIdx + 1}`;
  const nameB = b.panel_beater ?? `Quote ${bIdx + 1}`;

  // ── 0. Same-company guard ────────────────────────────────────────────────────
  // If both quotes are from the same company (T/A alias variants), skip fraud
  // detection — structural similarity is expected to be high.
  // Resolve "X T/A Y" → Y, strip common suffixes, then compare tokens.
  const _normForAlias = (n: string): string => {
    const ta = n.match(/^.+?\s+t\/?a\s+(.+)$/i);
    const resolved = ta ? ta[1].trim() : n;
    return resolved.toLowerCase()
      .replace(/\b(auto|motors?|panel|beaters?|body|works?|repairs?|services?|cc|pty|ltd|premier|kingfisher)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  };
  const _sameCompany = (() => {
    const na = _normForAlias(nameA);
    const nb = _normForAlias(nameB);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.startsWith(nb) || nb.startsWith(na)) return true;
    const ta = na.split(' ').filter((t: string) => t.length > 2);
    const tb = nb.split(' ').filter((t: string) => t.length > 2);
    if (ta.length === 0 || tb.length === 0) return false;
    const overlap = ta.filter((t: string) => tb.includes(t)).length;
    const minLen = Math.min(ta.length, tb.length);
    return minLen > 0 && overlap / minLen >= 0.6;
  })();
  if (_sameCompany) {
    return {
      quote_a_index: aIdx,
      quote_a_name: nameA,
      quote_b_index: bIdx,
      quote_b_name: nameB,
      structural_similarity: 1,
      sequence_similarity: null,
      amount_similarity: null,
      total_cost_near_identical: false,
      labour_parts_ratio_similar: null,
      components_only_in_a: [],
      components_only_in_b: [],
      amount_outlier_components: [],
      verdict: 'independent' as const,
      verdict_reason: `${nameA} and ${nameB} are the same company (T/A alias) — copy-fraud check skipped.`,
      pair_risk_score: 0,
    };
  }


  // ── 1. Structural fingerprint (Jaccard on component sets) ─────────────────
  const setA = new Set(a.components.map(normKey));
  const setB = new Set(b.components.map(normKey));
  const structural = r3(jaccardSimilarity(setA, setB));

  const componentsOnlyInA = Array.from(setA).filter((c) => !setB.has(c));
  const componentsOnlyInB = Array.from(setB).filter((c) => !setA.has(c));

  // ── 2. Sequence similarity (LCS on line-item description order) ───────────
  const seqA = a.line_items.map((li) => normKey(li.component));
  const seqB = b.line_items.map((li) => normKey(li.component));
  const sequence = lcsRatio(seqA, seqB);

  // ── 3. Amount similarity (per matched component) ──────────────────────────
  const amountOutliers: QuotePairSimilarity["amount_outlier_components"] = [];
  const matchedComponents = Array.from(setA).filter((c) => setB.has(c));
  let amountMatchCount = 0;
  let amountComparedCount = 0;

  // Build amount lookup from line_items
  const amountMapA = new Map<string, number>();
  const amountMapB = new Map<string, number>();
  a.line_items.forEach((li) => {
    if (li.line_total !== null) amountMapA.set(normKey(li.component), li.line_total);
  });
  b.line_items.forEach((li) => {
    if (li.line_total !== null) amountMapB.set(normKey(li.component), li.line_total);
  });

  for (const comp of matchedComponents) {
    const amtA = amountMapA.get(comp);
    const amtB = amountMapB.get(comp);
    if (amtA == null || amtB == null) continue;
    amountComparedCount++;
    const avg = (amtA + amtB) / 2;
    const devPct = avg > 0 ? Math.abs(amtA - amtB) / avg : 0;
    if (devPct <= 0.02) {
      // Within 2% — near-identical amounts
      amountMatchCount++;
    }
    if (devPct > 0.20) {
      // >20% deviation — flag as outlier
      amountOutliers.push({
        component: comp,
        amount_a: amtA,
        amount_b: amtB,
        deviation_pct: r3(devPct * 100),
      });
    }
  }
  const amountSimilarity: number | null = amountComparedCount > 0
    ? r3(amountMatchCount / amountComparedCount)
    : null;

  // ── 4. Total cost near-identical ──────────────────────────────────────────
  const totalA = a.total_cost;
  const totalB = b.total_cost;
  let totalNearIdentical = false;
  if (totalA != null && totalB != null && totalA > 0 && totalB > 0) {
    const avgTotal = (totalA + totalB) / 2;
    totalNearIdentical = Math.abs(totalA - totalB) / avgTotal <= 0.01;
  }

  // ── 5. Labour:parts ratio similarity ─────────────────────────────────────
  let labourPartsSimilar: boolean | null = null;
  if (
    a.labour_cost != null && a.parts_cost != null && a.parts_cost > 0 &&
    b.labour_cost != null && b.parts_cost != null && b.parts_cost > 0
  ) {
    const ratioA = a.labour_cost / a.parts_cost;
    const ratioB = b.labour_cost / b.parts_cost;
    const avgRatio = (ratioA + ratioB) / 2;
    labourPartsSimilar = avgRatio > 0
      ? Math.abs(ratioA - ratioB) / avgRatio <= 0.05
      : false;
  }

  // ── 6. Verdict ────────────────────────────────────────────────────────────
  let verdict: QuotePairSimilarity["verdict"];
  let verdictReason: string;
  let pairRiskScore: number;

  const isCopy =
    structural >= 0.85 &&
    (
      (sequence !== null && sequence >= 0.80) ||
      (amountSimilarity !== null && amountSimilarity >= 0.80)
    );

  const isSuspicious =
    !isCopy && (
      structural >= 0.70 ||
      (sequence !== null && sequence >= 0.65 && amountSimilarity !== null && amountSimilarity >= 0.65)
    );

  if (isCopy) {
    verdict = "copy_quotation";
    const reasons: string[] = [`structural similarity: ${(structural * 100).toFixed(0)}%`];
    if (sequence !== null) reasons.push(`line-item sequence similarity: ${(sequence * 100).toFixed(0)}%`);
    if (amountSimilarity !== null) reasons.push(`amount similarity: ${(amountSimilarity * 100).toFixed(0)}%`);
    if (totalNearIdentical) reasons.push("total costs within 1%");
    verdictReason = `Copy quotation detected between ${nameA} and ${nameB}. ` +
      `Evidence: ${reasons.join("; ")}.`;
    pairRiskScore = Math.min(100, Math.round(
      structural * 50 +
      (sequence ?? 0) * 25 +
      (amountSimilarity ?? 0) * 25
    ));
  } else if (isSuspicious) {
    verdict = "suspicious";
    const reasons: string[] = [`structural similarity: ${(structural * 100).toFixed(0)}%`];
    if (sequence !== null && sequence >= 0.65) reasons.push(`sequence similarity: ${(sequence * 100).toFixed(0)}%`);
    if (amountSimilarity !== null && amountSimilarity >= 0.65) reasons.push(`amount similarity: ${(amountSimilarity * 100).toFixed(0)}%`);
    verdictReason = `Suspicious similarity between ${nameA} and ${nameB}. ` +
      `Evidence: ${reasons.join("; ")}. Manual review recommended.`;
    pairRiskScore = Math.min(80, Math.round(
      structural * 40 +
      (sequence ?? 0) * 20 +
      (amountSimilarity ?? 0) * 20
    ));
  } else {
    verdict = "independent";
    verdictReason = `Quotes from ${nameA} and ${nameB} appear independently sourced ` +
      `(structural similarity: ${(structural * 100).toFixed(0)}%).`;
    pairRiskScore = Math.round(structural * 30);
  }

  return {
    quote_a_index: aIdx,
    quote_a_name: nameA,
    quote_b_index: bIdx,
    quote_b_name: nameB,
    structural_similarity: structural,
    sequence_similarity: sequence !== null ? r3(sequence) : null,
    amount_similarity: amountSimilarity,
    total_cost_near_identical: totalNearIdentical,
    labour_parts_ratio_similar: labourPartsSimilar,
    components_only_in_a: componentsOnlyInA,
    components_only_in_b: componentsOnlyInB,
    amount_outlier_components: amountOutliers,
    verdict,
    verdict_reason: verdictReason,
    pair_risk_score: pairRiskScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-ITEM FLAGS
// ─────────────────────────────────────────────────────────────────────────────

function buildPerItemFlags(
  quotes: ExtractedQuote[],
  damageComponents: string[]
): {
  perItemFlags: PerItemFlag[];
  unquotedDamageComponents: string[];
  extraQuotedComponents: string[];
} {
  const damageSet = new Set(damageComponents.map(normKey));

  // Collect all canonical component names across all quotes
  const allComponents = new Set<string>();
  quotes.forEach((q) => q.components.forEach((c) => allComponents.add(normKey(c))));

  // Build amount map per quote per component
  const amountMaps: Map<string, number>[] = quotes.map((q) => {
    const m = new Map<string, number>();
    q.line_items.forEach((li) => {
      if (li.line_total !== null) m.set(normKey(li.component), li.line_total);
    });
    return m;
  });

  const perItemFlags: PerItemFlag[] = [];

  for (const comp of allComponents) {
    const presentIn: string[] = [];
    const absentFrom: string[] = [];
    const amounts: PerItemFlag["amounts"] = [];

    quotes.forEach((q, qi) => {
      const name = q.panel_beater ?? `Quote ${qi + 1}`;
      const inQuote = q.components.some((c) => normKey(c) === comp);
      if (inQuote) {
        presentIn.push(name);
      } else {
        absentFrom.push(name);
      }
      const amt = amountMaps[qi].get(comp) ?? null;
      amounts.push({ panel_beater: name, amount: amt, currency: q.currency });
    });

    const knownAmounts = amounts
      .filter((a) => a.amount !== null)
      .map((a) => a.amount as number);

    const cv = coefficientOfVariation(knownAmounts);
    const highVariance = cv !== null && cv > 0.30; // >30% CV = high variance

    perItemFlags.push({
      component: comp,
      present_in: presentIn,
      absent_from: absentFrom,
      missing_from_all_quotes: presentIn.length === 0,
      not_in_damage_analysis: damageSet.size > 0 && !damageSet.has(comp),
      amounts,
      high_amount_variance: highVariance,
      amount_cv: cv !== null ? r3(cv) : null,
    });
  }

  // Components in damage analysis but absent from ALL quotes
  const unquotedDamageComponents = damageComponents.filter(
    (dc) => !allComponents.has(normKey(dc))
  );

  // Components in at least one quote but not in damage analysis
  const extraQuotedComponents = Array.from(allComponents).filter(
    (comp) => damageSet.size > 0 && !damageSet.has(comp)
  );

  return { perItemFlags, unquotedDamageComponents, extraQuotedComponents };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * analyseQuoteSimilarity
 *
 * Pure function — no async, no side effects.
 * Accepts 2+ ExtractedQuote objects and optional damage component list.
 * Returns a QuoteSimilarityResult with per-pair analysis, per-item flags,
 * and an overall verdict suitable for the fraud report.
 */
export function analyseQuoteSimilarity(
  quotes: ExtractedQuote[],
  damageComponents: string[] = []
): QuoteSimilarityResult {
  // ── Guard: need at least 2 quotes ─────────────────────────────────────────
  if (quotes.length < 2) {
    return {
      quotes_analysed: quotes.length,
      pairs: [],
      overall_verdict: "not_detected",
      overall_risk_score: 0,
      per_item_flags: [],
      unquoted_damage_components: damageComponents.filter(
        (dc) => !quotes.some((q) => q.components.some((c) => normKey(c) === normKey(dc)))
      ),
      extra_quoted_components: [],
      summary: quotes.length === 0
        ? "No quotes available for similarity analysis."
        : "Only one quote submitted — similarity analysis requires at least two quotes.",
      should_flag: false,
      fraud_score_contribution: 0,
    };
  }

  // ── Analyse all pairs ─────────────────────────────────────────────────────
  const pairs: QuotePairSimilarity[] = [];
  for (let i = 0; i < quotes.length; i++) {
    for (let j = i + 1; j < quotes.length; j++) {
      pairs.push(analysePair(quotes[i], i, quotes[j], j));
    }
  }

  // ── Overall verdict ───────────────────────────────────────────────────────
  const hasCopy = pairs.some((p) => p.verdict === "copy_quotation");
  const hasSuspicious = pairs.some((p) => p.verdict === "suspicious");
  const overallVerdict: QuoteSimilarityResult["overall_verdict"] = hasCopy
    ? "confirmed"
    : hasSuspicious
    ? "suspected"
    : "not_detected";

  const overallRiskScore = Math.max(...pairs.map((p) => p.pair_risk_score));

  // ── Per-item flags ────────────────────────────────────────────────────────
  const { perItemFlags, unquotedDamageComponents, extraQuotedComponents } =
    buildPerItemFlags(quotes, damageComponents);

  // ── Fraud score contribution ──────────────────────────────────────────────
  let fraudScoreContribution = 0;
  if (overallVerdict === "confirmed") {
    fraudScoreContribution = Math.min(40, 20 + Math.round(overallRiskScore * 0.20));
  } else if (overallVerdict === "suspected") {
    fraudScoreContribution = Math.min(20, 10 + Math.round(overallRiskScore * 0.10));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const copyPairs = pairs.filter((p) => p.verdict === "copy_quotation");
  const suspPairs = pairs.filter((p) => p.verdict === "suspicious");
  const unquotedCount = unquotedDamageComponents.length;
  const extraCount = extraQuotedComponents.length;

  let summaryParts: string[] = [];

  if (copyPairs.length > 0) {
    summaryParts.push(
      `Copy quotation confirmed: ${copyPairs.map((p) => `${p.quote_a_name} / ${p.quote_b_name}`).join("; ")}.`
    );
  } else if (suspPairs.length > 0) {
    summaryParts.push(
      `Suspicious similarity detected: ${suspPairs.map((p) => `${p.quote_a_name} / ${p.quote_b_name}`).join("; ")}.`
    );
  } else {
    summaryParts.push(`${quotes.length} quotes assessed — no copy quotation pattern detected.`);
  }

  if (unquotedCount > 0) {
    summaryParts.push(
      `${unquotedCount} damage component${unquotedCount !== 1 ? "s" : ""} absent from all quotes: ${unquotedDamageComponents.slice(0, 5).join(", ")}${unquotedCount > 5 ? ` (+${unquotedCount - 5} more)` : ""}.`
    );
  }
  if (extraCount > 0) {
    summaryParts.push(
      `${extraCount} quoted component${extraCount !== 1 ? "s" : ""} not identified in damage analysis — may indicate items quoted for undamaged areas.`
    );
  }

  const highVarianceItems = perItemFlags.filter((f) => f.high_amount_variance && f.present_in.length > 1);
  if (highVarianceItems.length > 0) {
    summaryParts.push(
      `High price variance (>30% CV) on: ${highVarianceItems.slice(0, 4).map((f) => f.component).join(", ")}${highVarianceItems.length > 4 ? ` (+${highVarianceItems.length - 4} more)` : ""}.`
    );
  }

  return {
    quotes_analysed: quotes.length,
    pairs,
    overall_verdict: overallVerdict,
    overall_risk_score: overallRiskScore,
    per_item_flags: perItemFlags,
    unquoted_damage_components: unquotedDamageComponents,
    extra_quoted_components: extraQuotedComponents,
    summary: summaryParts.join(" "),
    should_flag: overallVerdict !== "not_detected" || unquotedCount > 0,
    fraud_score_contribution: fraudScoreContribution,
  };
}
