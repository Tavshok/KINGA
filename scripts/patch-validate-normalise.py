#!/usr/bin/env python3
"""
Patch quoteExtractionEngine.ts:
Split validateAndNormalise into named sub-functions:
  coerceTotalCost, validateLineItems, deriveConfidence,
  coerceLabourAndParts, validateDocumentCategory
and update validateAndNormalise to call them.
"""
import sys

FILE = 'server/pipeline-v2/quoteExtractionEngine.ts'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# ── Find the JSDoc + function body to replace ──────────────────────────────────
OLD_FUNC_START = '/**\n * validateAndNormalise\n *\n * Ensures the LLM output conforms to the ExtractedQuote contract.\n * Fixes common LLM deviations (e.g. cost returned as string).\n */\nfunction validateAndNormalise(raw: Record<string, unknown>): ExtractedQuote {'
OLD_FUNC_END = '}\n\n/**\n * normaliseComponentName'

start_idx = content.find(OLD_FUNC_START)
end_idx = content.find(OLD_FUNC_END, start_idx)

if start_idx == -1:
    print('ERROR: validateAndNormalise start not found', file=sys.stderr)
    sys.exit(1)
if end_idx == -1:
    print('ERROR: normaliseComponentName not found after validateAndNormalise', file=sys.stderr)
    sys.exit(1)

# end_idx points to the `}` that closes validateAndNormalise, then `\n\n/**\n * normaliseComponentName`
# We want to replace from OLD_FUNC_START up to and including the closing `}`
close_brace_idx = end_idx  # the `}` is the first char of OLD_FUNC_END

REPLACEMENT = r'''/**
 * Coerce total_cost from LLM output to a number.
 * LLMs occasionally return numeric values as strings (e.g. "1234.56" or "R 1,234.56").
 * Returns null if the value is absent or unparseable, and appends a warning if coercion occurred.
 */
function coerceTotalCost(raw: Record<string, unknown>, warnings: string[]): number | null {
  if (typeof raw.total_cost === 'number') return raw.total_cost;
  if (typeof raw.total_cost === 'string') {
    const parsed = parseFloat((raw.total_cost as string).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) {
      warnings.push('total_cost was returned as string \u2014 coerced to number');
      return parsed;
    }
    warnings.push('total_cost string could not be parsed to number \u2014 set to null');
  }
  return null;
}

/**
 * Validate and extract line items from LLM output.
 *
 * Applies the hallucination guard with non-part passthrough:
 *   1. Non-vehicle-part cost categories (sundries, paint, labour, VAT, etc.) pass through unconditionally.
 *   2. Known vehicle parts are resolved via the dictionary.
 *   3. Unknown names are checked with isPlausiblePartName:
 *      - 'implausible' \u2192 hard-rejected (random chars, pure numbers)
 *      - 'plausible' or 'uncertain' \u2192 kept with is_unresolved=true for adjuster review
 *
 * R-A-22: The is_unresolved flag and non-part passthrough were introduced to prevent
 * cost gaps from silent drops. Do not remove these guards without re-verifying R-A-22 coverage.
 *
 * Also computes line item completeness score (0\u2013100) and sum discrepancy vs total_cost.
 *
 * Returns: { line_items, rejected_line_items, completenessScore, lineItemsSum, discrepancyPct, newWarnings }
 */
function validateLineItems(
  raw: Record<string, unknown>,
  totalCost: number | null,
  warnings: string[]
): {
  line_items: QuoteLineItem[];
  rejected_line_items: Array<{ raw_name: string; raw_cost: number | null }>;
  completenessScore: number;
  lineItemsSum: number | null;
  discrepancyPct: number | null;
} {
  const line_items: QuoteLineItem[] = [];
  const rejected_line_items: Array<{ raw_name: string; raw_cost: number | null }> = [];

  if (Array.isArray(raw.line_items)) {
    for (const item of raw.line_items as Record<string, unknown>[]) {
      if (!item || typeof item.component !== 'string') continue;
      const unitCost = typeof item.unit_cost === 'number' ? item.unit_cost : null;
      const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
      const lineTotal = typeof item.line_total === 'number' ? item.line_total
        : (unitCost !== null ? unitCost * qty : null);
      const rawComponentName = String(item.component);
      const _normalisedComponent = normaliseComponentName(rawComponentName);

      // \u2500\u2500 Hallucination guard with non-part passthrough \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      // Non-vehicle-part cost categories (sundries, paint, labour, VAT, etc.)
      // are valid line items in a repair quote. They must NOT be rejected by
      // the vehicle parts dictionary guard \u2014 they pass through unconditionally.
      const isNonPart = isNonPartLineItem(_normalisedComponent) || isNonPartLineItem(rawComponentName);
      let resolvedName: string;
      let isNonPartCost = false;

      if (isNonPart) {
        resolvedName = rawComponentName.trim();
        isNonPartCost = true;
      } else {
        const _resolvedComponent = resolveComponent(_normalisedComponent);
        if (!_resolvedComponent) {
          const plausibility = isPlausiblePartName(rawComponentName);
          if (plausibility === 'implausible') {
            console.warn(`\u26a0\ufe0f  Hallucination guard (quote line_items): hard-rejected "${_normalisedComponent}" (raw: "${rawComponentName}") \u2014 implausible`);
            rejected_line_items.push({ raw_name: rawComponentName, raw_cost: lineTotal });
            warnings.push(`line_item_rejected: "${rawComponentName}" failed semantic plausibility check`);
            continue;
          }
          console.warn(`\u26a0\ufe0f  Hallucination guard (quote line_items): unresolved "${_normalisedComponent}" (raw: "${rawComponentName}") \u2014 plausibility=${plausibility}, keeping with is_unresolved=true`);
          warnings.push(`line_item_unresolved: "${rawComponentName}" not in vehicle parts catalogue \u2014 verify manually`);
          resolvedName = rawComponentName.trim();
          const validOriginsUnresolved = ['oem', 'aftermarket', 'reconditioned', 'used', 'unknown'];
          const partOriginUnresolved = validOriginsUnresolved.includes(item.part_origin as string)
            ? (item.part_origin as 'oem' | 'aftermarket' | 'reconditioned' | 'used' | 'unknown')
            : 'unknown';
          line_items.push({
            component: resolvedName,
            unit_cost: unitCost,
            quantity: qty,
            line_total: lineTotal,
            action: typeof item.action === 'string' ? item.action : null,
            part_origin: partOriginUnresolved,
            is_unresolved: true,
            canonicalPartId: null,
          });
          continue;
        }
        resolvedName = _resolvedComponent.name;
      }

      const validOrigins = ['oem', 'aftermarket', 'reconditioned', 'used', 'unknown'];
      const partOrigin = validOrigins.includes(item.part_origin as string)
        ? (item.part_origin as 'oem' | 'aftermarket' | 'reconditioned' | 'used' | 'unknown')
        : 'unknown';
      line_items.push({
        component: resolvedName,
        unit_cost: unitCost,
        quantity: qty,
        line_total: lineTotal,
        action: typeof item.action === 'string' ? item.action : null,
        part_origin: partOrigin,
        is_non_part_cost: isNonPartCost || undefined,
        canonicalPartId: isNonPartCost ? null : resolveToCanonicalId(resolvedName),
      });
    }
  }

  if (rejected_line_items.length > 0) {
    warnings.push(
      `${rejected_line_items.length} line item(s) rejected by hallucination guard: ` +
      rejected_line_items.map(r => `"${r.raw_name}"${r.raw_cost !== null ? ` (cost: ${r.raw_cost})` : ''}`).join(', ') +
      `. Manual review recommended.`
    );
  }

  // \u2500\u2500 Line item completeness analysis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Non-part cost items (sundries, paint, labour) are INCLUDED in the sum because
  // they are real costs that contribute to the quote total.
  const pricedLineItems = line_items.filter(li => li.line_total !== null && li.line_total > 0);
  const unpricedLineItems = line_items.filter(li => li.line_total === null || li.line_total <= 0);
  const lineItemsSum = pricedLineItems.length > 0
    ? pricedLineItems.reduce((sum, li) => sum + (li.line_total ?? 0), 0)
    : null;

  let discrepancyPct: number | null = null;
  if (lineItemsSum !== null && totalCost !== null && totalCost > 0) {
    discrepancyPct = Math.round(((lineItemsSum - totalCost) / totalCost) * 1000) / 10;
    if (Math.abs(discrepancyPct) > 10) {
      warnings.push(
        `line_items_sum_discrepancy: sum=${lineItemsSum.toFixed(2)} vs total=${totalCost.toFixed(2)} ` +
        `(${discrepancyPct > 0 ? '+' : ''}${discrepancyPct.toFixed(1)}%). ` +
        `${unpricedLineItems.length} unpriced line item(s) may account for the gap.`
      );
    }
  }

  // Completeness score (0\u2013100):
  //   100 = all items priced AND sum matches total within 10%
  //    75 = all items priced but sum doesn\u2019t match total
  //    50 = some items priced
  //     0 = no items or no prices
  let completenessScore = 0;
  if (line_items.length === 0) {
    completenessScore = 0;
  } else if (unpricedLineItems.length === 0 && pricedLineItems.length > 0) {
    completenessScore = (discrepancyPct !== null && Math.abs(discrepancyPct) <= 10) ? 100 : 75;
  } else if (pricedLineItems.length > 0) {
    completenessScore = Math.round(50 * (pricedLineItems.length / line_items.length));
  }

  if (unpricedLineItems.length > 0) {
    warnings.push(
      `${unpricedLineItems.length} line item(s) have no price: ` +
      unpricedLineItems.map(li => `"${li.component}"`).join(', ')
    );
  }

  return { line_items, rejected_line_items, completenessScore, lineItemsSum, discrepancyPct };
}

/**
 * Derive extraction confidence from the validated data.
 * Always recomputes from the actual extracted values to override LLM errors.
 * If total_cost is null, confidence is always 'low' regardless of LLM claim.
 */
function deriveConfidence(
  raw: Record<string, unknown>,
  totalCost: number | null,
  components: string[],
  warnings: string[]
): 'high' | 'medium' | 'low' {
  if (totalCost === null) {
    if (raw.confidence !== 'low') warnings.push('confidence was recomputed from extracted data');
    return 'low';
  }
  const llmConfidence = raw.confidence;
  if (llmConfidence === 'high' || llmConfidence === 'medium' || llmConfidence === 'low') {
    return llmConfidence;
  }
  // LLM returned unexpected value \u2014 recompute
  warnings.push('confidence was recomputed from extracted data');
  if (totalCost !== null && components.length >= 3 && raw.panel_beater) return 'high';
  if (totalCost !== null) return 'medium';
  return 'low';
}

/**
 * Coerce labour_cost and parts_cost from LLM output to numbers.
 * Cross-validates: if both are present, their sum must be \u2264 total_cost * 1.05.
 * If the sum exceeds this, both are discarded (the LLM likely double-counted).
 */
function coerceLabourAndParts(
  raw: Record<string, unknown>,
  totalCost: number | null,
  warnings: string[]
): { labourCost: number | null; partsCost: number | null } {
  let labourCost: number | null = null;
  if (typeof raw.labour_cost === 'number' && raw.labour_cost > 0) {
    labourCost = raw.labour_cost;
  } else if (typeof raw.labour_cost === 'string') {
    const p = parseFloat((raw.labour_cost as string).replace(/[^0-9.]/g, ''));
    if (!isNaN(p) && p > 0) labourCost = p;
  }
  let partsCost: number | null = null;
  if (typeof raw.parts_cost === 'number' && raw.parts_cost > 0) {
    partsCost = raw.parts_cost;
  } else if (typeof raw.parts_cost === 'string') {
    const p = parseFloat((raw.parts_cost as string).replace(/[^0-9.]/g, ''));
    if (!isNaN(p) && p > 0) partsCost = p;
  }
  if (labourCost !== null && partsCost !== null && totalCost !== null) {
    if (labourCost + partsCost > totalCost * 1.05) {
      warnings.push(`labour_cost (${labourCost}) + parts_cost (${partsCost}) exceeds total_cost (${totalCost}) by >5% \u2014 discarding breakdown`);
      labourCost = null;
      partsCost = null;
    }
  }
  return { labourCost, partsCost };
}

/**
 * Validate and normalise the document_category field from LLM output.
 *
 * R-A-22 FIX (2026-06): Returns 'other' (not undefined) when the LLM returns an
 * unrecognised value. Stage 9 L1 filter treats undefined as a legacy fallback
 * (includes as repair_quote via quote_type heuristic). 'other' is truthy \u2192
 * Stage 9 primary branch \u2192 not 'repair_quote' \u2192 excluded from L1 baseline.
 * This prevents assessor fee invoices and unknown documents from inflating the L1 cost baseline.
 */
function validateDocumentCategory(raw: Record<string, unknown>): ExtractedQuote['document_category'] {
  const VALID_DOC_CATEGORIES = new Set(['repair_quote', 'parts_quote', 'assessor_report', 'agreed_cost', 'other']);
  const rawDocCategory = raw.document_category;
  return (typeof rawDocCategory === 'string' && VALID_DOC_CATEGORIES.has(rawDocCategory))
    ? rawDocCategory as ExtractedQuote['document_category']
    : 'other';
}

/**
 * validateAndNormalise
 *
 * Ensures the LLM output conforms to the ExtractedQuote contract.
 * Fixes common LLM deviations (e.g. cost returned as string).
 *
 * Sub-functions:
 *   coerceTotalCost()         \u2014 coerce total_cost string\u2192number
 *   validateLineItems()       \u2014 hallucination guard, completeness scoring (R-A-22)
 *   deriveConfidence()        \u2014 recompute confidence from extracted data
 *   coerceLabourAndParts()    \u2014 coerce labour/parts costs, cross-validate sum
 *   validateDocumentCategory() \u2014 R-A-22 document_category guard
 *   normaliseComponentName()  \u2014 shorthand expansion (called inside validateLineItems)
 */
function validateAndNormalise(raw: Record<string, unknown>): ExtractedQuote {
  const warnings: string[] = Array.isArray(raw.extraction_warnings)
    ? (raw.extraction_warnings as string[])
    : [];

  const totalCost = coerceTotalCost(raw, warnings);

  // Normalise components array (top-level, separate from line_items)
  // CRITICAL: Non-vehicle-part cost categories AND valid SA vehicle parts not yet in the
  // dictionary must NEVER be silently dropped. See validateLineItems for the same guard
  // applied to line_items[].
  const components: string[] = Array.isArray(raw.components)
    ? (raw.components as string[])
        .map(c => {
          const rawC = String(c);
          const normalised = normaliseComponentName(rawC);
          if (isNonPartLineItem(normalised) || isNonPartLineItem(rawC)) return rawC.trim();
          const resolved = resolveComponent(normalised);
          if (!resolved) {
            console.warn(`\u26a0\ufe0f  Hallucination guard (quote components): could not resolve "${normalised}" (raw: "${rawC}") \u2014 keeping raw name`);
            return rawC.trim();
          }
          return resolved.name;
        })
        .filter((c): c is string => c !== null && c.length > 0)
    : [];

  const {
    line_items,
    rejected_line_items,
    completenessScore: lineItemCompletenessScore,
    lineItemsSum,
    discrepancyPct: lineItemsSumDiscrepancyPct,
  } = validateLineItems(raw, totalCost, warnings);

  const confidence = deriveConfidence(raw, totalCost, components, warnings);
  const { labourCost, partsCost } = coerceLabourAndParts(raw, totalCost, warnings);
  const document_category = validateDocumentCategory(raw);

  return {
    panel_beater: typeof raw.panel_beater === 'string' ? raw.panel_beater : null,
    total_cost: totalCost,
    currency: typeof raw.currency === 'string' && raw.currency.length > 0 ? raw.currency.toUpperCase() : null,
    document_category,
    components,
    line_items,
    labour_defined: raw.labour_defined === true,
    parts_defined: raw.parts_defined === true,
    labour_cost: labourCost,
    parts_cost: partsCost,
    confidence,
    extraction_warnings: warnings,
    line_item_completeness_score: lineItemCompletenessScore,
    line_items_sum: lineItemsSum,
    line_items_sum_discrepancy_pct: lineItemsSumDiscrepancyPct,
    rejected_line_items,
  };
}
'''

# Find the end of the old function body (the `}` before `\n\n/**\n * normaliseComponentName`)
old_block = content[start_idx:close_brace_idx + 1]  # includes the closing `}`
content = content[:start_idx] + REPLACEMENT + content[close_brace_idx + 1:]

print(f'Replaced {len(old_block)} chars with {len(REPLACEMENT)} chars')

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
