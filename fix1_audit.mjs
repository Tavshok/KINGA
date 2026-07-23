/**
 * fix1_audit.mjs
 * Fix 1: Audit all components for sub-line mismatch.
 * A sub-line mismatch occurs when the "selected lowest" price for a component
 * is a partial/sub-line item rather than the full job cost.
 * Heuristic: selected price is < 50% of the next-lowest quote's price for the same component.
 *
 * Also: for Front Bumper specifically, sum all Swiss Motors rows under "front bumper"
 * to determine the true full-job cost.
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [quotes] = await conn.query(`
  SELECT pbq.id as quote_id, pbq.quoted_amount/100 as total_usd, pb.business_name as panel_beater
  FROM panel_beater_quotes pbq
  LEFT JOIN panel_beaters pb ON pb.id = pbq.panel_beater_id
  WHERE pbq.claim_id = 8880001 ORDER BY pbq.id
`);

const quoteIds = quotes.map(q => q.quote_id);
const [lineItems] = await conn.query(`
  SELECT id, quote_id, description, category,
         CAST(unit_price AS DECIMAL(10,2)) as unit_price,
         CAST(line_total AS DECIMAL(10,2)) as line_total,
         is_repair, is_replacement
  FROM quote_line_items WHERE quote_id IN (?) ORDER BY quote_id, id
`, [quoteIds]);

// Labour / overhead categories — these are NOT parts
const NON_PART_CATS = ['labor', 'labour', 'paint', 'diagnostic'];
function isLabour(li) {
  if (NON_PART_CATS.includes((li.category || '').toLowerCase())) return true;
  // Grand Auto flat-rate repair blocks: is_repair=1 AND unit_price=0
  if (li.is_repair === 1 && parseFloat(li.unit_price) === 0) return true;
  return false;
}

// Normalise description for matching
function norm(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// ── Step 1: Build per-quote, per-component price map ─────────────────────────
// For Fix 2 (repair/replace deduplication) we collapse Grand Auto to single price per component.
// For Fix 1 we want to see ALL rows to identify sub-line issues.

// Map: normName → [ {quoteId, pb, lineTotal, isLabour, isRepair, unitPrice, id, description} ]
const componentMap = new Map();
for (const li of lineItems) {
  if (isLabour(li)) continue; // skip labour rows entirely for parts comparison
  const n = norm(li.description);
  if (!n) continue;
  const existing = componentMap.get(n) || [];
  const q = quotes.find(q2 => q2.quote_id === li.quote_id);
  existing.push({
    id: li.id, quoteId: li.quote_id, pb: (q ? q.panel_beater : '?').substring(0, 22),
    lineTotal: parseFloat(li.line_total), unitPrice: parseFloat(li.unit_price),
    isRepair: li.is_repair, isReplacement: li.is_replacement,
    category: li.category, description: li.description,
  });
  componentMap.set(n, existing);
}

// ── Step 2: Front Bumper deep-dive ───────────────────────────────────────────
console.log('\n=== FRONT BUMPER DEEP-DIVE ===');
const fbRows = lineItems.filter(li => norm(li.description).includes('front bumper'));
for (const li of fbRows) {
  const q = quotes.find(q2 => q2.quote_id === li.quote_id);
  const lab = isLabour(li);
  console.log(`  [${lab ? 'LAB' : 'PRT'}] ${(q ? q.panel_beater : '?').substring(0, 20)} | id=${li.id} | "${li.description}" | cat=${li.category} | is_repair=${li.is_repair} | unit_price=$${parseFloat(li.unit_price).toFixed(2)} | line_total=$${parseFloat(li.line_total).toFixed(2)}`);
}

// Swiss Motors bumper-related rows (all rows that could be part of a full bumper job)
const swissId = quotes.find(q => q.panel_beater.includes('SWISS')).quote_id;
const swissBumperRows = lineItems.filter(li => li.quote_id === swissId && !isLabour(li) && (
  norm(li.description).includes('bumper') ||
  norm(li.description).includes('grille') ||
  norm(li.description).includes('front')
));
const swissBumperSum = swissBumperRows.reduce((s, li) => s + parseFloat(li.line_total), 0);
console.log(`\n  Swiss Motors bumper-related parts rows:`);
for (const li of swissBumperRows) {
  console.log(`    id=${li.id} "${li.description}" $${parseFloat(li.line_total).toFixed(2)}`);
}
console.log(`  Swiss bumper-related sum: $${swissBumperSum.toFixed(2)}`);

// Swiss Motors ALL front-bumper-labelled rows
const swissFBRows = lineItems.filter(li => li.quote_id === swissId && norm(li.description) === 'front bumper');
const swissFBSum = swissFBRows.reduce((s, li) => s + parseFloat(li.line_total), 0);
console.log(`\n  Swiss Motors rows with exact description "Front Bumper":`);
for (const li of swissFBRows) {
  console.log(`    id=${li.id} is_repair=${li.is_repair} unit_price=$${parseFloat(li.unit_price).toFixed(2)} line_total=$${parseFloat(li.line_total).toFixed(2)}`);
}
console.log(`  Sum of all Swiss "Front Bumper" rows: $${swissFBSum.toFixed(2)}`);

// ── Step 3: Per-component sub-line mismatch audit ────────────────────────────
console.log('\n\n=== SUB-LINE MISMATCH AUDIT (all components with 2+ quotes) ===');
console.log('Flagged = selected price is < 50% of next-lowest quote price\n');

const SUBLNE_THRESHOLD = 0.50; // flag if selected < 50% of next-lowest
const flagged = [];
const clean = [];

for (const [name, rows] of componentMap) {
  // Group by quote, sum all rows for this component per quote
  const byQuote = new Map();
  for (const r of rows) {
    const existing = byQuote.get(r.quoteId) || { quoteId: r.quoteId, pb: r.pb, rows: [], sum: 0 };
    existing.rows.push(r);
    existing.sum += r.lineTotal;
    byQuote.set(r.quoteId, existing);
  }
  const quoteEntries = [...byQuote.values()].filter(e => e.sum > 0);
  if (quoteEntries.length < 2) continue; // can't compare with only 1 quote

  // Sort by sum ascending
  quoteEntries.sort((a, b) => a.sum - b.sum);
  const lowest = quoteEntries[0];
  const nextLowest = quoteEntries[1];
  const ratio = lowest.sum / nextLowest.sum;

  if (ratio < SUBLNE_THRESHOLD) {
    flagged.push({ name, lowest, nextLowest, ratio, quoteEntries });
  } else {
    clean.push({ name, lowest, nextLowest, ratio, quoteEntries });
  }
}

console.log(`FLAGGED components (selected < 50% of next-lowest):`);
if (flagged.length === 0) {
  console.log('  None.');
} else {
  for (const c of flagged) {
    console.log(`\n  "${c.name}":`);
    for (const e of c.quoteEntries) {
      const rowDescs = e.rows.map(r => `    row id=${r.id} is_repair=${r.isRepair} unit_price=$${r.unitPrice.toFixed(2)} line_total=$${r.lineTotal.toFixed(2)}`).join('\n');
      console.log(`    ${e.pb}: sum=$${e.sum.toFixed(2)} (${e.rows.length} row(s))\n${rowDescs}`);
    }
    console.log(`    → Selected: $${c.lowest.sum.toFixed(2)} from ${c.lowest.pb} | Next-lowest: $${c.nextLowest.sum.toFixed(2)} | Ratio: ${(c.ratio * 100).toFixed(1)}%`);
  }
}

console.log(`\nCLEAN components (selected >= 50% of next-lowest): ${clean.length}`);
for (const c of clean) {
  console.log(`  "${c.name}": selected=$${c.lowest.sum.toFixed(2)} (${c.lowest.pb}) | next=$${c.nextLowest.sum.toFixed(2)} | ratio=${(c.ratio * 100).toFixed(1)}%`);
}

// ── Step 4: Per-quote sum of all "front bumper" rows (for Fix 1 resolution) ──
console.log('\n\n=== FRONT BUMPER: PER-QUOTE AGGREGATED COST ===');
for (const q of quotes) {
  const rows = lineItems.filter(li => li.quote_id === q.quote_id && norm(li.description) === 'front bumper');
  const partsRows = rows.filter(li => !isLabour(li));
  const labRows = rows.filter(li => isLabour(li));
  const partsSum = partsRows.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const labSum = labRows.reduce((s, li) => s + parseFloat(li.line_total), 0);
  console.log(`  ${q.panel_beater.substring(0, 25)}: parts sum=$${partsSum.toFixed(2)}, labour sum=$${labSum.toFixed(2)}, total=$${(partsSum + labSum).toFixed(2)}`);
  for (const r of rows) {
    const lab = isLabour(r);
    console.log(`    [${lab ? 'LAB' : 'PRT'}] id=${r.id} is_repair=${r.is_repair} unit_price=$${parseFloat(r.unit_price).toFixed(2)} line_total=$${parseFloat(r.line_total).toFixed(2)}`);
  }
}

await conn.end();
