/**
 * Quote Line Item Audit — Claim 8400001
 * Run: node server/scripts/audit-quotes-8400001.mjs
 */
import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Quote header totals ───────────────────────────────────────────────────
const [quotes] = await conn.execute(
  'SELECT id, quoted_amount, labor_cost, parts_cost, currency FROM panel_beater_quotes WHERE claim_id = 8400001 ORDER BY id'
);
console.log('=== QUOTE HEADER TOTALS ===');
quotes.forEach(q => {
  console.log(`Quote ${q.id} | quoted_amount=${q.quoted_amount} | labor_cost=${q.labor_cost} | parts_cost=${q.parts_cost} | currency=${q.currency}`);
});

// ── 2. All quote line items ──────────────────────────────────────────────────
const quoteIds = quotes.map(q => q.id);
const [li] = await conn.execute(
  `SELECT quote_id, description, unit_price, quantity, line_total, is_repair, is_replacement
   FROM quote_line_items
   WHERE quote_id IN (${quoteIds.join(',')})
   ORDER BY quote_id, id`
);

console.log('\n=== QUOTE LINE ITEMS BY QUOTE ===');
const byQuote = new Map();
for (const item of li) {
  if (!byQuote.has(item.quote_id)) byQuote.set(item.quote_id, []);
  byQuote.get(item.quote_id).push(item);
}

for (const [qid, items] of byQuote.entries()) {
  const total = items.reduce((sum, i) => sum + parseFloat(i.line_total || 0), 0);
  const priced = items.filter(i => parseFloat(i.line_total || 0) > 0);
  const unpriced = items.filter(i => !(parseFloat(i.line_total || 0) > 0));
  console.log(`\nQuote ${qid} | line_items_total=${total.toFixed(2)} | priced=${priced.length} | unpriced=${unpriced.length}`);
  priced.forEach((item, j) => {
    console.log(`  [${j}] ${item.description} | unit=${item.unit_price} qty=${item.quantity} total=${item.line_total} repair=${item.is_repair} replace=${item.is_replacement}`);
  });
  if (unpriced.length > 0) {
    console.log(`  Unpriced items: ${unpriced.map(i => i.description).join(', ')}`);
  }
}

// ── 3. Check what stage-9 reads via quoteLineItems join ─────────────────────
// This mirrors the query in stage-9-cost.ts for allExtractedQuotes
const [extractedRows] = await conn.execute(`
  SELECT 
    q.id AS quoteId,
    q.quoted_amount AS totalCost,
    q.currency,
    q.quote_type,
    li.description,
    li.unit_price AS unitPrice,
    li.quantity,
    li.line_total AS lineTotal,
    li.is_repair,
    li.is_replacement
  FROM panel_beater_quotes q
  LEFT JOIN quote_line_items li ON li.quote_id = q.id
  WHERE q.claim_id = 8400001
  ORDER BY q.id, li.id
`);

console.log('\n=== PIPELINE VIEW (quote JOIN line_items) ===');
const byQuote2 = new Map();
for (const row of extractedRows) {
  if (!byQuote2.has(row.quoteId)) byQuote2.set(row.quoteId, { total: row.totalCost, currency: row.currency, type: row.quote_type, items: [] });
  if (row.description) byQuote2.get(row.quoteId).items.push(row);
}

for (const [qid, q] of byQuote2.entries()) {
  const pricedItems = q.items.filter(i => parseFloat(i.lineTotal || 0) > 0);
  const lineSum = pricedItems.reduce((s, i) => s + parseFloat(i.lineTotal || 0), 0);
  console.log(`\nQuote ${qid} | header_total=${q.total} | line_sum=${lineSum.toFixed(2)} | priced_items=${pricedItems.length}/${q.items.length} | type=${q.type}`);
  pricedItems.forEach((item, j) => {
    console.log(`  [${j}] ${item.description} | unit=${item.unitPrice} qty=${item.quantity} total=${item.lineTotal} repair=${item.is_repair} replace=${item.is_replacement}`);
  });
}

// ── 4. Check quote_optimisation_results ─────────────────────────────────────
const [qor] = await conn.execute(
  'SELECT * FROM quote_optimisation_results WHERE claim_id = 8400001 ORDER BY created_at DESC LIMIT 3'
);
console.log('\n=== QUOTE_OPTIMISATION_RESULTS ===');
if (qor.length === 0) {
  console.log('  (none — table is empty for this claim)');
} else {
  qor.forEach((r, i) => {
    console.log(`[${i}]`, JSON.stringify(r).substring(0, 300));
  });
}

await conn.end();
console.log('\nDone.');
