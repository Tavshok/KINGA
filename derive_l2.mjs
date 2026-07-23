/**
 * derive_l2.mjs
 * Re-derives the KINGA L2 Composite Estimate from scratch using the real
 * quote_line_items data for claim 8880001.
 *
 * Replicates the buildCompositeQuote logic:
 *   1. For each component, collect all submitted prices across quotes
 *   2. selectedCostUsd = min(lowestSubmitted, modelP50) subject to 30% floor
 *   3. compositePartsUsd = sum of selectedCostUsd for all parts items
 *   4. bestLabourUsd = lowest labour total across quotes
 *   5. compositeOptimisedCostUsd = compositePartsUsd + bestLabourUsd
 *
 * Since we don't have the trained model P50 values in this script, we simulate
 * the T3/T4 case (model >= submitted) which means selectedCostUsd = lowestSubmitted.
 * This gives the LOWER BOUND of the L2 estimate (best case for insurer).
 * The actual pipeline adds model P50 where available, which can only push the
 * estimate DOWN (or keep it the same if model > submitted).
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── Step 1: Fetch quotes ─────────────────────────────────────────────────────
const [quotes] = await conn.query(`
  SELECT pbq.id as quote_id,
         pbq.quoted_amount/100 as total_usd,
         pbq.labor_cost/100 as labor_usd,
         pbq.parts_cost/100 as parts_usd,
         pbq.currency_code,
         pb.business_name as panel_beater
  FROM panel_beater_quotes pbq
  LEFT JOIN panel_beaters pb ON pb.id = pbq.panel_beater_id
  WHERE pbq.claim_id = 8880001
  ORDER BY pbq.id
`);

const quoteIds = quotes.map(q => q.quote_id);
console.log('\n=== CLAIM 8880001: Quote Headers ===');
for (const q of quotes) {
  console.log(`  [${q.quote_id}] ${q.panel_beater}: total=$${Number(q.total_usd).toFixed(2)}, labor=$${Number(q.labor_usd||0).toFixed(2)}, parts=$${Number(q.parts_usd||0).toFixed(2)}`);
}

// ── Step 2: Fetch line items ─────────────────────────────────────────────────
const [lineItems] = await conn.query(`
  SELECT quote_id, description, category,
         CAST(unit_price AS DECIMAL(10,2)) as unit_price,
         CAST(line_total AS DECIMAL(10,2)) as line_total,
         currency, is_repair, is_replacement
  FROM quote_line_items
  WHERE quote_id IN (?)
  ORDER BY quote_id, id
`, [quoteIds]);

console.log(`\n=== Line Items: ${lineItems.length} total ===`);

// ── Step 3: Routing sanity check (is_non_part_cost logic) ───────────────────
// Matches the DB fallback fix: category in ('labor','paint','diagnostic') = is_non_part_cost
const NON_PART_CATEGORIES = new Set(['labor', 'paint', 'diagnostic']);

for (const q of quotes) {
  const items = lineItems.filter(li => li.quote_id === q.quote_id);
  const partsItems = items.filter(li => !NON_PART_CATEGORIES.has(li.category));
  const labourItems = items.filter(li => li.category === 'labor');
  const paintItems = items.filter(li => li.category === 'paint');
  const otherItems = items.filter(li => li.category === 'other' || li.category === 'sundries');

  const partsTotal = partsItems.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const labourTotal = labourItems.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const paintTotal = paintItems.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const otherTotal = otherItems.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const lineItemsSum = items.reduce((s, li) => s + parseFloat(li.line_total), 0);

  const headerTotal = Number(q.total_usd);
  const diff = Math.abs(lineItemsSum - headerTotal);
  const diffPct = headerTotal > 0 ? (diff / headerTotal * 100).toFixed(1) : 'N/A';

  console.log(`\n--- Quote ${q.quote_id} (${q.panel_beater}) ---`);
  console.log(`  Header total: $${headerTotal.toFixed(2)} | Header labor: $${Number(q.labor_usd||0).toFixed(2)} | Header parts: $${Number(q.parts_usd||0).toFixed(2)}`);
  console.log(`  Line items: ${items.length} | Sum: $${lineItemsSum.toFixed(2)} | Diff vs header: $${diff.toFixed(2)} (${diffPct}%)`);
  console.log(`  Parts items (non-labour/paint/diag): ${partsItems.length} | Parts total: $${partsTotal.toFixed(2)}`);
  console.log(`  Labour items: ${labourItems.length} | Labour total: $${labourTotal.toFixed(2)}`);
  console.log(`  Paint items: ${paintItems.length} | Paint total: $${paintTotal.toFixed(2)}`);
  console.log(`  Other/sundries items: ${otherItems.length} | Other total: $${otherTotal.toFixed(2)}`);
  console.log(`  ROUTING CHECK: parts+labour+paint+other = $${(partsTotal+labourTotal+paintTotal+otherTotal).toFixed(2)} vs header $${headerTotal.toFixed(2)}`);
}

// ── Step 4: Per-component lowest price across all quotes ─────────────────────
// Build a map: normalised component name → array of {quoteId, lineTotal}
function normalise(name) {
  return (name || '').toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s\/\(\)]/g, '');
}

const componentPrices = new Map(); // normName → [{quoteId, panelBeater, lineTotal, category}]

for (const li of lineItems) {
  if (NON_PART_CATEGORIES.has(li.category)) continue; // skip labour/paint/diagnostic
  const norm = normalise(li.description);
  if (!norm) continue;
  if (!componentPrices.has(norm)) componentPrices.set(norm, []);
  const q = quotes.find(q => q.quote_id === li.quote_id);
  componentPrices.get(norm).push({
    quoteId: li.quote_id,
    panelBeater: q ? q.panel_beater : 'unknown',
    lineTotal: parseFloat(li.line_total),
    category: li.category,
  });
}

console.log(`\n=== Per-Component Price Analysis (${componentPrices.size} unique components) ===`);

let compositePartsUsd = 0;
const compositeLineItems = [];

for (const [normName, prices] of componentPrices) {
  const validPrices = prices.filter(p => p.lineTotal > 0);
  if (validPrices.length === 0) {
    // All quotes have $0 for this component — skip (benchmark fill would be needed)
    console.log(`  [SKIP-ZERO] ${normName}: all prices = $0`);
    continue;
  }
  const lowestSubmitted = Math.min(...validPrices.map(p => p.lineTotal));
  // In the absence of model P50, selectedCostUsd = lowestSubmitted (T3/T4 case)
  // This is the LOWER BOUND — actual pipeline may use model P50 if it's lower
  const selectedCostUsd = lowestSubmitted;
  compositePartsUsd += selectedCostUsd;
  compositeLineItems.push({ component: normName, selectedCostUsd, lowestSubmitted, priceCount: validPrices.length });
}

// ── Step 5: Best labour cost ─────────────────────────────────────────────────
// bestLabourUsd = lowest labour total across all quotes that have labour items
const labourTotalsByQuote = [];
for (const q of quotes) {
  const items = lineItems.filter(li => li.quote_id === q.quote_id && li.category === 'labor');
  const labourTotal = items.reduce((s, li) => s + parseFloat(li.line_total), 0);
  if (labourTotal > 0) labourTotalsByQuote.push({ quoteId: q.quote_id, panelBeater: q.panel_beater, labourTotal });
}
// Also check header-level labor_cost as fallback
for (const q of quotes) {
  const headerLabour = Number(q.labor_usd || 0);
  if (headerLabour > 0 && !labourTotalsByQuote.find(l => l.quoteId === q.quote_id)) {
    labourTotalsByQuote.push({ quoteId: q.quote_id, panelBeater: q.panel_beater, labourTotal: headerLabour, source: 'header' });
  }
}

const bestLabourUsd = labourTotalsByQuote.length > 0
  ? Math.min(...labourTotalsByQuote.map(l => l.labourTotal))
  : 0;

console.log(`\n=== Labour Analysis ===`);
for (const l of labourTotalsByQuote) {
  console.log(`  Quote ${l.quoteId} (${l.panelBeater}): labour = $${l.labourTotal.toFixed(2)}${l.source ? ' ['+l.source+']' : ''}`);
}
console.log(`  Best labour: $${bestLabourUsd.toFixed(2)}`);

// ── Step 6: Composite L2 Estimate ───────────────────────────────────────────
const compositeOptimisedCostUsd = compositePartsUsd + bestLabourUsd;

// ── Step 7: 30% floor rule check ─────────────────────────────────────────────
const allTotals = quotes.map(q => Number(q.total_usd));
const lowestSubmittedTotal = Math.min(...allTotals);
const MAX_MODEL_DISCOUNT_PCT = 0.30;
const floorPrice = lowestSubmittedTotal * (1 - MAX_MODEL_DISCOUNT_PCT);

console.log(`\n=== 30% Floor Rule Check ===`);
console.log(`  Lowest submitted quote total: $${lowestSubmittedTotal.toFixed(2)}`);
console.log(`  30% floor (lowestSubmitted × 0.70): $${floorPrice.toFixed(2)}`);
console.log(`  Composite L2 (parts+labour): $${compositeOptimisedCostUsd.toFixed(2)}`);
if (compositeOptimisedCostUsd < floorPrice) {
  console.log(`  FLOOR ENGAGED: L2 $${compositeOptimisedCostUsd.toFixed(2)} < floor $${floorPrice.toFixed(2)} → use floor $${floorPrice.toFixed(2)}`);
} else {
  console.log(`  FLOOR NOT ENGAGED: L2 $${compositeOptimisedCostUsd.toFixed(2)} >= floor $${floorPrice.toFixed(2)} → L2 stands`);
}

const effectiveL2 = Math.max(compositeOptimisedCostUsd, floorPrice);

// ── Step 8: Savings & Excess-proximity ───────────────────────────────────────
console.log(`\n=== Savings & Excess-Proximity Check ===`);
const savingsUsd = lowestSubmittedTotal - effectiveL2;
const savingsPct = (savingsUsd / lowestSubmittedTotal * 100);
console.log(`  L1 (lowest submitted): $${lowestSubmittedTotal.toFixed(2)}`);
console.log(`  L2 (effective, after floor): $${effectiveL2.toFixed(2)}`);
console.log(`  KINGA Savings (L1 - L2): $${savingsUsd.toFixed(2)} (${savingsPct.toFixed(1)}%)`);
console.log(`  Savings plausible? ${Math.abs(savingsPct) < 30 ? 'YES (< 30%)' : savingsPct < 0 ? 'NEGATIVE — L2 > L1 (check data)' : 'HIGH — verify'}`);

// Excess proximity check — typical excess ~$2,000–$2,500
const TYPICAL_EXCESS = 2000;
const excessDiff = Math.abs(effectiveL2 - TYPICAL_EXCESS);
console.log(`  Excess proximity: |L2 - $${TYPICAL_EXCESS}| = $${excessDiff.toFixed(2)} ${excessDiff < 200 ? '⚠ SUSPICIOUS (near-identical to excess)' : '✓ OK'}`);

// ── Step 9: Summary ──────────────────────────────────────────────────────────
console.log(`\n=== FINAL DOLLAR RECONCILIATION TABLE ===`);
console.log(`  Composite parts total (per-component lowest):  $${compositePartsUsd.toFixed(2)}`);
console.log(`  Best labour total:                             $${bestLabourUsd.toFixed(2)}`);
console.log(`  Composite L2 (parts + labour):                 $${compositeOptimisedCostUsd.toFixed(2)}`);
console.log(`  30% floor price:                               $${floorPrice.toFixed(2)}`);
console.log(`  Effective L2 (after floor):                    $${effectiveL2.toFixed(2)}`);
console.log(`  L1 (lowest submitted quote):                   $${lowestSubmittedTotal.toFixed(2)}`);
console.log(`  KINGA Savings (L1 - L2):                       $${savingsUsd.toFixed(2)} (${savingsPct.toFixed(1)}%)`);
console.log(`  Old stale estimate (pre-fix):                  $2,123.15`);
console.log(`  Unique components in composite:                ${compositeLineItems.length}`);
console.log(`  Floor rule engaged:                            ${compositeOptimisedCostUsd < floorPrice ? 'YES' : 'NO'}`);

await conn.end();
