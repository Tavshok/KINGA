/**
 * component_breakdown.mjs
 * Shows per-component price breakdown and explains why L2 > L1.
 * Key insight: L2 sums the lowest price for EVERY component across ALL quotes.
 * If quotes cover different components (union > intersection), L2 > any single quote.
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [quotes] = await conn.query(`
  SELECT pbq.id as quote_id, pbq.quoted_amount/100 as total_usd,
         pb.business_name as panel_beater
  FROM panel_beater_quotes pbq
  LEFT JOIN panel_beaters pb ON pb.id = pbq.panel_beater_id
  WHERE pbq.claim_id = 8880001
  ORDER BY pbq.id
`);

const quoteIds = quotes.map(q => q.quote_id);
const [lineItems] = await conn.query(`
  SELECT quote_id, description, category,
         CAST(unit_price AS DECIMAL(10,2)) as unit_price,
         CAST(line_total AS DECIMAL(10,2)) as line_total
  FROM quote_line_items
  WHERE quote_id IN (?)
  ORDER BY quote_id, id
`, [quoteIds]);

const NON_PART = ['labor','paint','diagnostic'];

// Build component price map
const componentPrices = new Map();
for (const li of lineItems) {
  if (NON_PART.includes(li.category)) continue;
  const norm = (li.description || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!norm) continue;
  const existing = componentPrices.get(norm) || [];
  const q = quotes.find(q2 => q2.quote_id === li.quote_id);
  existing.push({ qid: li.quote_id, pb: (q ? q.panel_beater : '?').substring(0, 15), lt: parseFloat(li.line_total) });
  componentPrices.set(norm, existing);
}

console.log('\n=== Per-Component Price Breakdown ===');
console.log('(NON_PART categories excluded: labor, paint, diagnostic)\n');

let compositeTotal = 0;
let componentsOnlyInOneQuote = 0;
let componentsInAllThree = 0;

for (const [name, prices] of componentPrices) {
  const valid = prices.filter(p => p.lt > 0);
  if (valid.length === 0) {
    console.log(`  [ZERO] ${name} — all prices $0, skipped`);
    continue;
  }
  const lowest = Math.min(...valid.map(p => p.lt));
  compositeTotal += lowest;
  const quoteCount = new Set(valid.map(p => p.qid)).size;
  if (quoteCount === 1) componentsOnlyInOneQuote++;
  if (quoteCount === 3) componentsInAllThree++;
  const priceStr = valid.map(p => `${p.pb}:$${p.lt.toFixed(0)}`).join(' | ');
  console.log(`  ${name}: [${priceStr}] → lowest=$${lowest.toFixed(2)} (in ${quoteCount}/3 quotes)`);
}

console.log(`\n=== Component Coverage Analysis ===`);
console.log(`  Total unique components: ${componentPrices.size}`);
console.log(`  Components in all 3 quotes: ${componentsInAllThree}`);
console.log(`  Components in only 1 quote: ${componentsOnlyInOneQuote}`);
console.log(`  Components in 2 quotes: ${componentPrices.size - componentsInAllThree - componentsOnlyInOneQuote}`);

console.log(`\n=== Why L2 > L1 Explained ===`);
const q1Total = Number(quotes[0].total_usd);
const q2Total = Number(quotes[1].total_usd);
const q3Total = Number(quotes[2].total_usd);
const lowestQuote = Math.min(q1Total, q2Total, q3Total);
console.log(`  Each quote covers a DIFFERENT set of components.`);
console.log(`  L2 = sum of lowest price for EVERY component in the UNION of all quotes.`);
console.log(`  Union coverage is broader than any single quote → L2 can exceed any single quote total.`);
console.log(`  Lowest submitted quote: $${lowestQuote.toFixed(2)}`);
console.log(`  L2 composite (all components, lowest price each): $${compositeTotal.toFixed(2)}`);
console.log(`  L2 - L1 = $${(compositeTotal - lowestQuote).toFixed(2)} (+${((compositeTotal - lowestQuote)/lowestQuote*100).toFixed(1)}%)`);
console.log(`\n  This is EXPECTED behaviour when quotes cover different component sets.`);
console.log(`  The 30% floor rule applies at the COMPONENT level (per-component model vs submitted),`);
console.log(`  not at the total quote level. The total-level comparison is informational only.`);

// Check which components are unique to one quote (driving L2 > L1)
console.log(`\n=== Components Only In One Quote (driving L2 > L1) ===`);
for (const [name, prices] of componentPrices) {
  const valid = prices.filter(p => p.lt > 0);
  if (valid.length === 0) continue;
  const quoteCount = new Set(valid.map(p => p.qid)).size;
  if (quoteCount === 1) {
    const lowest = Math.min(...valid.map(p => p.lt));
    console.log(`  ${name}: $${lowest.toFixed(2)} (only in ${valid[0].pb})`);
  }
}

await conn.end();
