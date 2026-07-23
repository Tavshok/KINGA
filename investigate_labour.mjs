/**
 * investigate_labour.mjs
 * Data investigation — NO code changes.
 * Answers the three-part prompt on labour treatment across the three quotes.
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── Fetch quotes ─────────────────────────────────────────────────────────────
const [quotes] = await conn.query(`
  SELECT pbq.id as quote_id,
         pbq.quoted_amount/100 as total_usd,
         pbq.labor_cost/100 as labor_usd,
         pbq.parts_cost/100 as parts_usd,
         pb.business_name as panel_beater
  FROM panel_beater_quotes pbq
  LEFT JOIN panel_beaters pb ON pb.id = pbq.panel_beater_id
  WHERE pbq.claim_id = 8880001
  ORDER BY pbq.id
`);

// ── Fetch ALL line items with full detail ─────────────────────────────────────
const quoteIds = quotes.map(q => q.quote_id);
const [lineItems] = await conn.query(`
  SELECT id, quote_id, description, category,
         CAST(unit_price AS DECIMAL(10,2)) as unit_price,
         CAST(line_total AS DECIMAL(10,2)) as line_total,
         quantity, currency, is_repair, is_replacement
  FROM quote_line_items
  WHERE quote_id IN (?)
  ORDER BY quote_id, id
`, [quoteIds]);

// ── Helper ────────────────────────────────────────────────────────────────────
const LABOUR_CATEGORIES = ['labor', 'labour', 'paint', 'diagnostic'];
const LABOUR_KEYWORDS = ['labour', 'labor', 'strip', 'assemble', 'repair', 'fit', 'fitting', 'regas', 'reprogram', 'polish', 'panel beat', 'straighten', 'weld', 'align'];

function isLabourLike(li) {
  if (LABOUR_CATEGORIES.includes((li.category || '').toLowerCase())) return true;
  if (li.is_repair === 1 && parseFloat(li.unit_price) === 0) return true;
  const desc = (li.description || '').toLowerCase();
  return LABOUR_KEYWORDS.some(kw => desc.includes(kw));
}

// ── Part 1: Per-quote analysis ────────────────────────────────────────────────
for (const q of quotes) {
  const items = lineItems.filter(li => li.quote_id === q.quote_id);
  const labourLike = items.filter(isLabourLike);
  const partsOnly = items.filter(li => !isLabourLike(li));
  const partsSum = partsOnly.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const labourSum = labourLike.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const totalSum = items.reduce((s, li) => s + parseFloat(li.line_total), 0);
  const headerTotal = parseFloat(q.total_usd);
  const residual = headerTotal - partsSum;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`QUOTE ${q.quote_id} — ${q.panel_beater}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Header total: $${headerTotal.toFixed(2)} | Header labor: $${parseFloat(q.labor_usd||0).toFixed(2)} | Header parts: $${parseFloat(q.parts_usd||0).toFixed(2)}`);
  console.log(`Line items: ${items.length} | Sum: $${totalSum.toFixed(2)}`);
  console.log(`Parts-only items: ${partsOnly.length} | Parts sum: $${partsSum.toFixed(2)}`);
  console.log(`Labour-like items: ${labourLike.length} | Labour sum: $${labourSum.toFixed(2)}`);
  console.log(`Residual (header − parts-only sum): $${residual.toFixed(2)}`);

  if (labourLike.length > 0) {
    console.log(`\n  Labour-like line items:`);
    for (const li of labourLike) {
      console.log(`    [id=${li.id}] "${li.description}" | cat=${li.category} | is_repair=${li.is_repair} | unit_price=$${parseFloat(li.unit_price).toFixed(2)} | line_total=$${parseFloat(li.line_total).toFixed(2)} | qty=${li.quantity}`);
    }
  } else {
    console.log(`\n  No labour-like line items found.`);
  }

  console.log(`\n  All line items (full detail):`);
  for (const li of items) {
    const flag = isLabourLike(li) ? '[LABOUR]' : '[PART  ]';
    console.log(`    ${flag} [id=${li.id}] "${li.description}" | cat=${li.category} | is_repair=${li.is_repair} | is_replacement=${li.is_replacement} | unit_price=$${parseFloat(li.unit_price).toFixed(2)} | line_total=$${parseFloat(li.line_total).toFixed(2)}`);
  }
}

// ── Part 2: Grand Auto repair rows specifically ───────────────────────────────
const grandAuto = quotes.find(q => q.panel_beater.includes('GRAND'));
if (grandAuto) {
  const grandItems = lineItems.filter(li => li.quote_id === grandAuto.quote_id);
  const repairRows = grandItems.filter(li => li.is_repair === 1);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`GRAND AUTO — is_repair=1 rows (${repairRows.length} total)`);
  console.log(`${'='.repeat(70)}`);
  for (const li of repairRows) {
    console.log(`  [id=${li.id}] "${li.description}" | cat=${li.category} | unit_price=$${parseFloat(li.unit_price).toFixed(2)} | line_total=$${parseFloat(li.line_total).toFixed(2)} | is_replacement=${li.is_replacement}`);
  }

  // Check for dual-entry: same component with both is_repair=1 and is_replacement=1
  const repairDescs = new Set(repairRows.map(li => (li.description||'').toLowerCase().trim()));
  const replacementRows = grandItems.filter(li => li.is_replacement === 1);
  const dualEntry = replacementRows.filter(li => repairDescs.has((li.description||'').toLowerCase().trim()));
  if (dualEntry.length > 0) {
    console.log(`\n  Components with BOTH repair and replacement rows in Grand Auto:`);
    for (const li of dualEntry) {
      console.log(`    "${li.description}" — replacement line_total=$${parseFloat(li.line_total).toFixed(2)}`);
    }
  } else {
    console.log(`\n  No components found with both repair AND replacement rows in Grand Auto.`);
  }
}

// ── Part 3: Per-component price treatment comparability ───────────────────────
console.log(`\n${'='.repeat(70)}`);
console.log(`PER-COMPONENT PRICE TREATMENT COMPARABILITY`);
console.log(`${'='.repeat(70)}`);

// Build component map: normName → [{quoteId, pb, lineTotal, isLabour}]
const componentMap = new Map();
for (const li of lineItems) {
  const norm = (li.description || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!norm) continue;
  const existing = componentMap.get(norm) || [];
  const q = quotes.find(q2 => q2.quote_id === li.quote_id);
  existing.push({
    quoteId: li.quote_id,
    pb: (q ? q.panel_beater : '?').substring(0, 20),
    lineTotal: parseFloat(li.line_total),
    isLabour: isLabourLike(li),
    isRepair: li.is_repair,
    isReplacement: li.is_replacement,
    category: li.category,
    unitPrice: parseFloat(li.unit_price),
  });
  componentMap.set(norm, existing);
}

// For each component in the composite (lowest price selected), check if treatment differs
let mixedTreatmentComponents = [];
let cleanComponents = [];

for (const [name, prices] of componentMap) {
  const validPrices = prices.filter(p => p.lineTotal > 0);
  if (validPrices.length < 2) continue; // only appears in one quote, can't compare

  const labourEntries = validPrices.filter(p => p.isLabour);
  const partEntries = validPrices.filter(p => !p.isLabour);

  if (labourEntries.length > 0 && partEntries.length > 0) {
    // Mixed: some quotes treat this as labour, others as parts
    const lowest = validPrices.reduce((a, b) => a.lineTotal < b.lineTotal ? a : b);
    mixedTreatmentComponents.push({ name, prices: validPrices, lowest, labourEntries, partEntries });
  } else {
    cleanComponents.push({ name, prices: validPrices });
  }
}

console.log(`\nComponents with MIXED treatment (some quotes: part, others: labour-like):`);
if (mixedTreatmentComponents.length === 0) {
  console.log(`  None found — all multi-quote components have consistent treatment.`);
} else {
  for (const c of mixedTreatmentComponents) {
    console.log(`\n  "${c.name}":`);
    for (const p of c.prices) {
      console.log(`    ${p.pb}: $${p.lineTotal.toFixed(2)} | isLabour=${p.isLabour} | cat=${p.category} | is_repair=${p.isRepair}`);
    }
    console.log(`    → Selected (lowest): $${c.lowest.lineTotal.toFixed(2)} from ${c.lowest.pb} [isLabour=${c.lowest.isLabour}]`);
  }
}

// Also check: for components where Grand Auto's is_repair=1 row was selected as lowest
const grandAutoId = grandAuto ? grandAuto.quote_id : null;
console.log(`\nComponents where Grand Auto's is_repair=1 row is the LOWEST price selected:`);
let found = false;
for (const [name, prices] of componentMap) {
  const validPrices = prices.filter(p => p.lineTotal > 0);
  if (validPrices.length === 0) continue;
  const lowest = validPrices.reduce((a, b) => a.lineTotal < b.lineTotal ? a : b);
  if (lowest.quoteId === grandAutoId && lowest.isRepair === 1) {
    found = true;
    const others = validPrices.filter(p => p.quoteId !== grandAutoId);
    console.log(`  "${name}": Grand Auto repair=$${lowest.lineTotal.toFixed(2)} | others: ${others.map(p => p.pb.substring(0,12)+':$'+p.lineTotal.toFixed(0)).join(', ')}`);
  }
}
if (!found) console.log(`  None — Grand Auto's repair rows are not the selected lowest for any component.`);

await conn.end();
