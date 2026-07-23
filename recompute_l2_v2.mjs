/**
 * Recompute L2 using the new total-cost-of-operation architecture.
 * This replicates the logic now in buildCompositeQuote after the Part B fixes.
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Fetch quotes for claim 8880001
// 8880001 is the internal claim_id (primary key), not claim_number
const claimId = 8880001;

const [quotes] = await conn.execute(
  `SELECT q.id as quoteId, pb.business_name as panel_beater, q.quoted_amount as total_cost,
          q.labor_cost, q.parts_cost, q.currency
   FROM panel_beater_quotes q
   LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
   WHERE q.claim_id = ?`,
  [claimId]
);

const quoteIds = quotes.map(q => q.quoteId);
// quoted_amount is stored in cents in the DB
const parsedQuotes = quotes.map(q => ({
  ...q,
  total_cost_usd: (q.total_cost || 0) / 100,
}));
console.log(`\nQuotes: ${parsedQuotes.map(q => `${q.panel_beater} ($${q.total_cost_usd.toFixed(2)})`).join(', ')}`);

// Fetch all line items
if (!quoteIds.length) { console.error('No quotes found for claim 8880001'); process.exit(1); }
const [lineItems] = await conn.execute(
  `SELECT quote_id as quoteId, description, category, quantity, unit_price as unitPrice,
          line_total as lineTotal, is_repair as isRepair, is_replacement as isReplacement
   FROM quote_line_items
   WHERE quote_id IN (${quoteIds.map(() => '?').join(',')})`,
  quoteIds
);

await conn.end();

// Map quoteId -> panel_beater
const quoteMap = new Map(quotes.map(q => [q.quoteId, q.panel_beater]));

// Safety-critical replace-only set
const SAFETY_CRITICAL = new Set([
  'airbag', 'driver airbag', 'passenger airbag', 'knee airbag', 'curtain airbag',
  'side airbag', 'airbag module', 'airbag control module', 'srs module',
  'seat belt', 'seatbelt', 'seat belt pretensioner', 'seat belt buckle',
  'chassis', 'subframe', 'chassis frame', 'chassis frame subframe',
  'front subframe', 'rear subframe', 'engine subframe',
]);

function normalise(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Determine scope for each line item
function getScope(li) {
  if (li.isRepair) return 'repair';
  if (li.isReplacement) return 'replace';
  return 'bundled';
}

// Determine if a row is a standalone non-component overhead (no component name, or pure labour/paint/VAT)
function isStandaloneOverhead(li) {
  const desc = normalise(li.description);
  if (!desc) return true;
  // Rows that are non-part-cost AND not a repair operation tied to a component
  const isNonPart = li.category === 'labor' || li.category === 'paint' || li.category === 'diagnostic';
  if (isNonPart && !li.isRepair) return true;
  return false;
}

// Step 1: Accumulate per-quote, per-component, per-scope totals
const scopeAccumulator = new Map(); // key: normName|||repairer|||scope

for (const li of lineItems) {
  const lineTotal = Number(li.lineTotal);
  if (!lineTotal || lineTotal <= 0) continue;
  if (isStandaloneOverhead(li)) continue;

  const normName = normalise(li.description);
  const repairer = quoteMap.get(li.quoteId) || `Quote ${li.quoteId}`;
  const scope = getScope(li);
  const key = `${normName}|||${repairer}|||${scope}`;

  const existing = scopeAccumulator.get(key);
  if (existing) {
    existing.totalCost += lineTotal;
  } else {
    scopeAccumulator.set(key, { normName, repairer, scope, totalCost: lineTotal });
  }
}

// Step 2: Build component matrix
const componentMatrix = new Map(); // normName -> [{repairer, costUsd, scope}]
for (const entry of scopeAccumulator.values()) {
  if (!componentMatrix.has(entry.normName)) componentMatrix.set(entry.normName, []);
  componentMatrix.get(entry.normName).push({
    repairer: entry.repairer,
    costUsd: entry.totalCost,
    scope: entry.scope,
  });
}

// Step 3: Select best price per component with scope filtering
let compositePartsUsd = 0;
const compositeLineItems = [];
const dataGaps = [];

// Simulate damage severity (from real pipeline: cosmetic/minor → repair ok; moderate+ → replace)
// For this test, we'll use 'moderate' for all components (conservative default)
const SEVERITY = 'moderate'; // In production this comes from damageAnalysis.damagedParts

for (const [normName, allPrices] of componentMatrix.entries()) {
  const isSafetyCritical = SAFETY_CRITICAL.has(normName);
  // For moderate severity: replace-only rule applies
  const severityRequiresReplace = SEVERITY === 'severe' || SEVERITY === 'catastrophic';
  const replaceOnlyRule = isSafetyCritical ? 'SAFETY_CRITICAL_REPLACE_ONLY' :
    severityRequiresReplace ? 'SEVERITY_REPLACE_ONLY' : null;

  const validPrices = replaceOnlyRule
    ? allPrices.filter(p => p.scope === 'replace' || p.scope === 'bundled')
    : allPrices;

  if (replaceOnlyRule && validPrices.length === 0) {
    dataGaps.push({ normName, rule: replaceOnlyRule, allPrices });
    continue;
  }

  if (validPrices.length === 0) continue;

  const best = validPrices.reduce((a, b) => a.costUsd <= b.costUsd ? a : b);
  compositePartsUsd += best.costUsd;

  const hasMultipleScopes = new Set(validPrices.map(p => p.scope)).size > 1;
  const scopeRule = replaceOnlyRule ?? (hasMultipleScopes ? 'COST_COMPARISON' : 'SINGLE_SCOPE_AVAILABLE');

  compositeLineItems.push({
    normName,
    selectedCost: best.costUsd,
    selectedFrom: best.repairer,
    selectedScope: best.scope,
    scopeRule,
    allPrices: allPrices.map(p => `${p.repairer}[${p.scope}]:$${Number(p.costUsd).toFixed(2)}`).join(', '),
  });
}

// Sort by cost descending for readability
compositeLineItems.sort((a, b) => b.selectedCost - a.selectedCost);

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('KINGA L2 COMPOSITE — PER-COMPONENT BREAKDOWN (Total-Cost-of-Operation)');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log(`${'Component'.padEnd(35)} ${'Selected'.padStart(10)} ${'From'.padEnd(20)} ${'Scope'.padEnd(10)} Rule`);
console.log('─'.repeat(100));
for (const item of compositeLineItems) {
  console.log(
    `${item.normName.padEnd(35)} $${Number(item.selectedCost).toFixed(2).padStart(9)} ${item.selectedFrom.padEnd(20)} ${item.selectedScope.padEnd(10)} ${item.scopeRule}`
  );
  console.log(`  All prices: ${item.allPrices}`);
}

const l1 = Math.min(...parsedQuotes.map(q => q.total_cost_usd));
const savings = l1 - compositePartsUsd;

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`Composite Parts Total (L2):  $${compositePartsUsd.toFixed(2)}`);
console.log(`L1 (lowest submitted total): $${l1.toFixed(2)}`);
console.log(`Savings (L1 - L2):           $${savings.toFixed(2)} (${savings >= 0 ? 'KINGA saves' : 'L2 above L1'})`);

if (dataGaps.length > 0) {
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('DATA GAPS (components requiring replacement-scope quotes):');
  for (const gap of dataGaps) {
    console.log(`  ⚠ ${gap.normName} [${gap.rule}]`);
    console.log(`    Available: ${gap.allPrices.map(p => `${p.repairer}[${p.scope}]:$${p.costUsd.toFixed(2)}`).join(', ')}`);
  }
}

// Parts/labour reconciliation per quote
console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('PARTS/LABOUR RECONCILIATION PER QUOTE:');
for (const q of parsedQuotes) {
  const qItems = lineItems.filter(li => li.quoteId === q.quoteId);
  const partsTotal = qItems.filter(li => !isStandaloneOverhead(li) && !li.isRepair).reduce((s, li) => s + Number(li.lineTotal || 0), 0);
  const repairOpsTotal = qItems.filter(li => !isStandaloneOverhead(li) && li.isRepair).reduce((s, li) => s + Number(li.lineTotal || 0), 0);
  const overheadTotal = qItems.filter(li => isStandaloneOverhead(li)).reduce((s, li) => s + Number(li.lineTotal || 0), 0);
  const lineItemsSum = qItems.reduce((s, li) => s + Number(li.lineTotal || 0), 0);
  const residual = q.total_cost_usd - lineItemsSum;
  console.log(`\n  ${q.panel_beater} (header total: $${q.total_cost_usd.toFixed(2)}):`);
  console.log(`    Parts/replacement rows:  $${partsTotal.toFixed(2)}`);
  console.log(`    Repair-operation rows:   $${repairOpsTotal.toFixed(2)}`);
  console.log(`    Overhead (labour/paint): $${overheadTotal.toFixed(2)}`);
  console.log(`    Line items sum:          $${lineItemsSum.toFixed(2)}`);
  console.log(`    Residual (header - sum): $${residual.toFixed(2)} ${Math.abs(residual) < 100 ? '✓ OK' : '⚠ LARGE RESIDUAL'}`);
}
