// cost_audit.mjs — Full cost derivation audit for claim 8880001
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── Query 1: estimated_value and excess_amount_cents from claims (separate query) ──
const [claimRows] = await conn.execute(
  'SELECT id, estimated_value, excess_amount_cents, policy_number FROM claims WHERE id = 8880001'
);
console.log('\n=== QUERY 1: claims table (estimated_value + excess_amount_cents) ===');
console.log(JSON.stringify(claimRows[0], null, 2));

// ── Query 2: excess_amount_cents independently ──
const [excessRows] = await conn.execute(
  'SELECT excess_amount_cents FROM claims WHERE id = 8880001'
);
console.log('\n=== QUERY 2: excess_amount_cents (independent pull) ===');
console.log('excess_amount_cents RAW:', excessRows[0].excess_amount_cents);
console.log('excess_amount_cents / 100 =', excessRows[0].excess_amount_cents / 100);

// ── Query 3: cost_intelligence_json from ai_assessments ──
const [assessRows] = await conn.execute(
  'SELECT cost_intelligence_json FROM ai_assessments WHERE claim_id = 8880001 ORDER BY created_at DESC LIMIT 1'
);
const costIntel = JSON.parse(assessRows[0].cost_intelligence_json || 'null');
console.log('\n=== QUERY 3: cost_intelligence_json top-level keys ===');
console.log(Object.keys(costIntel || {}));

// ── perComponentBenchmarks: full list ──
const benchmarks = costIntel?.perComponentBenchmarks || [];
console.log('\n=== perComponentBenchmarks: ALL', benchmarks.length, 'components ===');
let pricedSum = 0;
const priced = [];
const unpriced = [];
benchmarks.forEach((b, i) => {
  const hasPrice = b.medianUsd != null && Number(b.medianUsd) > 0;
  const row = {
    index: i + 1,
    partName: b.partName || b.componentName || b.name || '(unnamed)',
    category: b.category || b.partCategory || '(no category)',
    medianUsd: b.medianUsd ?? null,
    p50Usd: b.p50Usd ?? null,
    source: b.source || b.benchmarkSource || '(no source field)',
    priced: hasPrice,
    allKeys: Object.keys(b),
  };
  if (hasPrice) {
    pricedSum += Number(b.medianUsd);
    priced.push(row);
  } else {
    unpriced.push(row);
  }
  console.log(`  [${i+1}] ${row.partName} | cat: ${row.category} | medianUsd: ${b.medianUsd} | p50Usd: ${b.p50Usd} | keys: ${Object.keys(b).join(',')}`);
});
console.log('\n=== PRICED COMPONENTS (', priced.length, ') ===');
priced.forEach(p => console.log(`  ${p.partName}: $${p.medianUsd} (source: ${p.source})`));
console.log('  SUM OF PRICED medianUsd:', pricedSum.toFixed(2));
console.log('\n=== UNPRICED COMPONENTS (', unpriced.length, ') ===');
unpriced.forEach(u => console.log(`  ${u.partName} | cat: ${u.category} | all keys: ${u.allKeys.join(',')}`));

// ── quotes: check if quote line items match the 3 priced components ──
const quotes = costIntel?.quotes || [];
console.log('\n=== QUOTES (', quotes.length, ') ===');
quotes.forEach((q, i) => {
  console.log(`  Quote ${i+1}: ${q.repairerName || q.provider} | total: ${q.totalAmountCents} cents = $${(q.totalAmountCents/100).toFixed(2)}`);
  const items = q.lineItems || q.items || [];
  items.forEach(li => console.log(`    - ${li.description || li.partName}: $${li.amountCents ? li.amountCents/100 : li.amount}`));
});

// ── enriched_photos_json: check damage areas ──
const [photoRows] = await conn.execute(
  'SELECT enriched_photos_json FROM ai_assessments WHERE claim_id = 8880001 ORDER BY created_at DESC LIMIT 1'
);
const photos = JSON.parse(photoRows[0].enriched_photos_json || '[]');
console.log('\n=== ENRICHED PHOTOS damage areas (first 5) ===');
photos.slice(0, 5).forEach((p, i) => {
  console.log(`  Photo ${i+1}: damageArea=${p.damageArea || p.damage_area || p.zone} | confidence=${p.confidence || p.confidenceLevel}`);
});

// ── cost_decision / true_cost_usd ──
console.log('\n=== costDecision ===');
console.log(JSON.stringify(costIntel?.costDecision, null, 2));

// ── expectedRepairCostCents ──
console.log('\n=== expectedRepairCostCents ===', costIntel?.expectedRepairCostCents);
console.log('=== totalEstimatedCost ===', costIntel?.totalEstimatedCost);
console.log('=== currency ===', costIntel?.currency);

await conn.end();
