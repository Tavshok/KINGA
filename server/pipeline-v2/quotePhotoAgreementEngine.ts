/**
 * quotePhotoAgreementEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Signal 1 of the Multi-Signal Cross-Validation Architecture.
 *
 * PURPOSE
 * -------
 * Repair quotes are currently used only for cost benchmarking. This engine
 * treats them as an independent second estimator of what was damaged — derived
 * from what a repairer priced, completely independent of what the photos show.
 *
 * Cross-checks:
 *   A. Components quoted but NOT visible in photos
 *      → Possible pre-existing damage, quote inflation, or parts not yet
 *        removed for photography.
 *      → Flag as QUOTED_NOT_VISIBLE (soft signal — not fraud by itself).
 *
 *   B. Components visibly damaged in photos but absent from ALL quotes
 *      → Possible missing coverage, supplementary quote needed, or a
 *        fraud-adjacent omission (damage acknowledged visually but not priced).
 *      → Flag as VISIBLE_NOT_QUOTED (stronger signal for structural parts).
 *
 * OUTPUT
 * ------
 * quotePhotoAgreement: {
 *   agreementScore: number (0–1)  — fraction of photo components covered by ≥1 quote
 *   perComponent: ComponentAgreement[]
 *   quotedNotVisible: string[]    — in quotes but not in photos
 *   visibleNotQuoted: string[]    — in photos but not in any quote
 *   structuralGapsInQuotes: string[]  — structural components visible but unquoted
 *   summary: string
 * }
 *
 * DESIGN CONSTRAINTS
 * ------------------
 * - Uses the same normalise() and similarity() functions from damageReconciliationEngine
 *   to avoid divergent matching logic.
 * - Does NOT produce a cost estimate — this is a consistency check, not a pricing check.
 * - Does NOT flag QUOTED_NOT_VISIBLE as fraud — photos are often taken at the panel beater
 *   after disassembly, or at home days after the incident. Absence from photos ≠ fraud.
 * - VISIBLE_NOT_QUOTED on structural components is the strongest signal here.
 */

import { normalise, similarity, isStructural } from "./damageReconciliationEngine";
import type { DamageAnalysisComponent } from "./types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AgreementStatus =
  | "AGREED"           // Component appears in both photos and ≥1 quote
  | "QUOTED_NOT_VISIBLE" // In quote(s) but not detected in photos
  | "VISIBLE_NOT_QUOTED"; // Detected in photos but absent from all quotes

export interface ComponentAgreement {
  component: string;
  status: AgreementStatus;
  isStructural: boolean;
  /** Which quotes (by panel_beater name) include this component */
  quotedBy: string[];
  /** Whether this component was detected in photo analysis */
  visibleInPhotos: boolean;
  /** Best similarity score against any quote component (0–1) */
  bestMatchScore: number;
  /** Plain-language explanation for the assessor */
  note: string;
}

export interface QuotePhotoAgreementResult {
  /** Fraction of photo-detected components covered by at least one quote (0–1) */
  agreementScore: number;
  /** Per-component breakdown */
  perComponent: ComponentAgreement[];
  /** Components in quotes but not detected in photos */
  quotedNotVisible: string[];
  /** Components detected in photos but absent from all quotes */
  visibleNotQuoted: string[];
  /** Structural components visible in photos but absent from all quotes — strongest signal */
  structuralGapsInQuotes: string[];
  /** Number of quotes analysed */
  quotesAnalysed: number;
  /** Plain-language summary for the assessor */
  summary: string;
}

// ─── Quote line item shape (matches Stage 9 resolved structure) ───────────────

export interface QuoteLineItem {
  component: string;
  description?: string;
  is_non_part_cost?: boolean;
}

export interface ResolvedQuote {
  panel_beater: string;
  components: string[];
  line_items?: QuoteLineItem[];
}

// ─── Similarity threshold ─────────────────────────────────────────────────────

/** Two components are considered the same if similarity ≥ this threshold */
const MATCH_THRESHOLD = 0.55;

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * runQuotePhotoAgreement
 *
 * @param photoComponents  DamageAnalysisComponent[] from Stage 6 vision analysis
 * @param quotes           Resolved quotes from Stage 9 (with components list)
 * @returns QuotePhotoAgreementResult
 */
export function runQuotePhotoAgreement(
  photoComponents: DamageAnalysisComponent[],
  quotes: ResolvedQuote[]
): QuotePhotoAgreementResult {
  // ── 1. Collect all part-level components from all quotes ──────────────────
  // Each entry: { normalisedName, panelBeater }
  const allQuoteComponents: Array<{ norm: string; panelBeater: string }> = [];

  for (const q of quotes) {
    // Prefer the pre-derived components list; fall back to line_items
    const rawComponents: string[] = q.components?.length
      ? q.components
      : (q.line_items ?? [])
          .filter(li => !li.is_non_part_cost && (li.component || li.description))
          .map(li => li.component || li.description || "");

    for (const raw of rawComponents) {
      if (raw.trim()) {
        allQuoteComponents.push({ norm: normalise(raw), panelBeater: q.panel_beater });
      }
    }
  }

  // ── 2. Collect photo-detected components (visible only) ───────────────────
  const visiblePhotoComponents = photoComponents.filter(c => c.visible !== false);

  // ── 3. Build per-component agreement for photo components ─────────────────
  const perComponent: ComponentAgreement[] = [];
  const visibleNotQuoted: string[] = [];
  const structuralGapsInQuotes: string[] = [];

  for (const pc of visiblePhotoComponents) {
    const normPhoto = normalise(pc.name);
    const structural = isStructural(normPhoto);

    // Find best matching quote component across all quotes
    let bestScore = 0;
    const quotedBy: string[] = [];

    for (const qc of allQuoteComponents) {
      const score = similarity(normPhoto, qc.norm);
      if (score > bestScore) bestScore = score;
      if (score >= MATCH_THRESHOLD && !quotedBy.includes(qc.panelBeater)) {
        quotedBy.push(qc.panelBeater);
      }
    }

    const matched = bestScore >= MATCH_THRESHOLD;
    const status: AgreementStatus = matched ? "AGREED" : "VISIBLE_NOT_QUOTED";

    let note: string;
    if (matched) {
      note = `Detected in photos and quoted by: ${quotedBy.join(", ")}.`;
    } else if (structural) {
      note = `Structural component detected in photos but absent from all quotes — supplementary quote or scope review recommended.`;
    } else {
      note = `Component detected in photos but not priced in any quote — may be included under a broader line item or require supplementary quote.`;
    }

    perComponent.push({
      component: pc.name,
      status,
      isStructural: structural,
      quotedBy,
      visibleInPhotos: true,
      bestMatchScore: Math.round(bestScore * 100) / 100,
      note,
    });

    if (!matched) {
      visibleNotQuoted.push(pc.name);
      if (structural) structuralGapsInQuotes.push(pc.name);
    }
  }

  // ── 4. Find components in quotes but not in photos ────────────────────────
  // Deduplicate quote components first
  const uniqueQuoteNorms = new Map<string, string>(); // norm → original
  for (const qc of allQuoteComponents) {
    if (!uniqueQuoteNorms.has(qc.norm)) {
      uniqueQuoteNorms.set(qc.norm, qc.norm);
    }
  }

  const quotedNotVisible: string[] = [];
  const photoNorms = visiblePhotoComponents.map(c => normalise(c.name));

  for (const [norm] of uniqueQuoteNorms) {
    const matchedInPhotos = photoNorms.some(pn => similarity(norm, pn) >= MATCH_THRESHOLD);
    if (!matchedInPhotos) {
      quotedNotVisible.push(norm);
      // Add to perComponent as QUOTED_NOT_VISIBLE
      perComponent.push({
        component: norm,
        status: "QUOTED_NOT_VISIBLE",
        isStructural: isStructural(norm),
        quotedBy: allQuoteComponents
          .filter(qc => similarity(qc.norm, norm) >= MATCH_THRESHOLD)
          .map(qc => qc.panelBeater)
          .filter((v, i, a) => a.indexOf(v) === i),
        visibleInPhotos: false,
        bestMatchScore: 0,
        note: `Priced in quote(s) but not detected in photos. Note: photos may have been taken before disassembly or at a different time — this is not automatically a fraud indicator.`,
      });
    }
  }

  // ── 5. Compute agreement score ─────────────────────────────────────────────
  const totalPhotoComponents = visiblePhotoComponents.length;
  const agreedCount = perComponent.filter(
    c => c.visibleInPhotos && c.status === "AGREED"
  ).length;
  const agreementScore =
    totalPhotoComponents > 0
      ? Math.round((agreedCount / totalPhotoComponents) * 100) / 100
      : 1.0; // No photo components → nothing to disagree on

  // ── 6. Build summary ───────────────────────────────────────────────────────
  const summaryParts: string[] = [];
  summaryParts.push(
    `${quotes.length} quote(s) analysed against ${totalPhotoComponents} photo-detected component(s).`
  );
  summaryParts.push(
    `Agreement score: ${(agreementScore * 100).toFixed(0)}% (${agreedCount}/${totalPhotoComponents} photo components covered by ≥1 quote).`
  );

  if (visibleNotQuoted.length > 0) {
    summaryParts.push(
      `${visibleNotQuoted.length} component(s) visible in photos but absent from all quotes: ${visibleNotQuoted.slice(0, 5).join(", ")}${visibleNotQuoted.length > 5 ? ` and ${visibleNotQuoted.length - 5} more` : ""}.`
    );
  }
  if (structuralGapsInQuotes.length > 0) {
    summaryParts.push(
      `STRUCTURAL GAPS: ${structuralGapsInQuotes.join(", ")} — structural components visible but unquoted.`
    );
  }
  if (quotedNotVisible.length > 0) {
    summaryParts.push(
      `${quotedNotVisible.length} component(s) priced in quotes but not detected in photos (normal if photos taken before disassembly).`
    );
  }
  if (visibleNotQuoted.length === 0 && quotedNotVisible.length === 0) {
    summaryParts.push(`Full agreement between photo evidence and repair quotes.`);
  }

  return {
    agreementScore,
    perComponent,
    quotedNotVisible,
    visibleNotQuoted,
    structuralGapsInQuotes,
    quotesAnalysed: quotes.length,
    summary: summaryParts.join(" "),
  };
}
