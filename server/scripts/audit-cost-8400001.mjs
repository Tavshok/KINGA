/**
 * Cost Optimisation Audit — Claim 8400001
 * Run from project root: node server/scripts/audit-cost-8400001.mjs
 */
import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Claim + assessment metadata ──────────────────────────────────────────
const [rows] = await conn.execute(`
  SELECT 
    c.id, c.claim_reference, c.vehicle_make, c.vehicle_model, c.vehicle_year,
    c.status, c.workflow_state,
    a.id AS assessment_id,
    a.estimated_cost, a.fraud_score, a.fraud_risk_level, a.recommendation,
    a.repair_to_value_ratio, a.total_loss_indicated,
    DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS assessment_date,
    LENGTH(a.cost_intelligence_json) AS cost_json_len,
    LENGTH(a.repair_intelligence_json) AS repair_json_len,
    a.cost_intelligence_json,
    a.repair_intelligence_json
  FROM claims c
  LEFT JOIN ai_assessments a ON a.claim_id = c.id
  WHERE c.id = 8400001
  ORDER BY a.created_at DESC
  LIMIT 1
`);

const row = rows[0];
console.log('=== CLAIM METADATA ===');
console.log(JSON.stringify({
  id: row.id,
  claim_reference: row.claim_reference,
  vehicle: `${row.vehicle_make} ${row.vehicle_model} ${row.vehicle_year}`,
  status: row.status,
  workflow_state: row.workflow_state,
  assessment_id: row.assessment_id,
  estimated_cost: row.estimated_cost,
  fraud_score: row.fraud_score,
  fraud_risk_level: row.fraud_risk_level,
  recommendation: row.recommendation,
  repair_to_value_ratio: row.repair_to_value_ratio,
  total_loss_indicated: row.total_loss_indicated,
  assessment_date: row.assessment_date,
  cost_json_len: row.cost_json_len,
  repair_json_len: row.repair_json_len,
}, null, 2));

// ── 2. Parse cost_intelligence_json ─────────────────────────────────────────
if (row.cost_intelligence_json) {
  const ci = JSON.parse(row.cost_intelligence_json);
  console.log('\n=== COST INTELLIGENCE TOP-LEVEL KEYS ===');
  console.log(Object.keys(ci).join(', '));

  console.log('\n=== L-COMPOSITE FIELDS ===');
  console.log('lCompositeOptimisedCostUsd:', ci.lCompositeOptimisedCostUsd);
  console.log('benchmarkCoverageComponents:', ci.benchmarkCoverageComponents);
  const items = ci.compositeLineItems || ci.composite_line_items || [];
  console.log('compositeLineItems count:', items.length);

  if (items.length > 0) {
    console.log('\n=== COMPOSITE LINE ITEMS (all fields) ===');
    items.forEach((item, i) => {
      console.log(`[${i}]`, JSON.stringify(item));
    });

    // Benchmark source breakdown
    const sourceCount = {};
    let noSource = 0;
    items.forEach(item => {
      const src = item.benchmarkModelSource || item.benchmark_model_source || null;
      if (!src) { noSource++; }
      else { sourceCount[src] = (sourceCount[src] || 0) + 1; }
    });
    console.log('\n=== BENCHMARK SOURCE BREAKDOWN ===');
    console.log('By source:', sourceCount);
    console.log('No source (unbenchmarked):', noSource);
    console.log('Total items:', items.length);
  }

  console.log('\n=== DAMAGED NOT QUOTED ===');
  console.log(JSON.stringify(ci.damagedNotQuoted || ci.damaged_not_quoted || [], null, 2));

  console.log('\n=== DEVIATION FIELDS ===');
  console.log('quoteDeviationPct:', ci.quoteDeviationPct ?? ci.quote_deviation_pct);
  console.log('totalQuotedCostUsd:', ci.totalQuotedCostUsd ?? ci.total_quoted_cost_usd);
  console.log('totalBenchmarkCostUsd:', ci.totalBenchmarkCostUsd ?? ci.total_benchmark_cost_usd);
  console.log('lCompositeOptimisedCostUsd:', ci.lCompositeOptimisedCostUsd);
  console.log('savings:', ci.savings ?? ci.savingsUsd);
  console.log('savingsPct:', ci.savingsPct);

  writeFileSync('/tmp/cost-intel-8400001.json', JSON.stringify(ci, null, 2));
  console.log('\nFull cost_intelligence_json → /tmp/cost-intel-8400001.json');
} else {
  console.log('WARNING: cost_intelligence_json is NULL');
}

// ── 3. Panel beater quotes ───────────────────────────────────────────────────
const [quotes] = await conn.execute(`
  SELECT q.id, q.quoted_amount, q.currency, q.quote_type, q.quote_congruency_score,
         q.line_items_json,
         pb.business_name
  FROM panel_beater_quotes q
  LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
  WHERE q.claim_id = 8400001
  ORDER BY q.created_at DESC
`);

console.log('\n=== PANEL BEATER QUOTES ===');
quotes.forEach((q, i) => {
  const li = q.line_items_json ? JSON.parse(q.line_items_json) : [];
  console.log(`\n[${i}] ${q.business_name || 'Unknown'} | type=${q.quote_type} | amount=$${q.quoted_amount} ${q.currency} | congruency=${q.quote_congruency_score} | line_items=${li.length}`);
  li.forEach((item, j) => {
    console.log(`  [${j}]`, JSON.stringify({
      description: item.description || item.partName || item.part_name || item.name,
      unitPrice: item.unitPrice ?? item.unit_price ?? item.cost ?? item.unitCost,
      quantity: item.quantity,
      totalCost: item.totalCost ?? item.total_cost ?? item.lineTotal ?? item.line_total,
      canonicalPartId: item.canonicalPartId || item.canonical_part_id,
    }));
  });
});

// ── 4. All assessments for this claim (to check deviation history) ───────────
const [allAssessments] = await conn.execute(`
  SELECT id, 
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
         estimated_cost, fraud_score,
         JSON_EXTRACT(cost_intelligence_json, '$.quoteDeviationPct') AS deviation_pct,
         JSON_EXTRACT(cost_intelligence_json, '$.totalQuotedCostUsd') AS total_quoted,
         JSON_EXTRACT(cost_intelligence_json, '$.lCompositeOptimisedCostUsd') AS l_composite,
         JSON_EXTRACT(cost_intelligence_json, '$.benchmarkCoverageComponents') AS benchmark_coverage,
         JSON_EXTRACT(cost_intelligence_json, '$.compositeLineItems') IS NOT NULL AS has_composite
  FROM ai_assessments
  WHERE claim_id = 8400001
  ORDER BY created_at DESC
  LIMIT 10
`);

console.log('\n=== ASSESSMENT HISTORY (deviation across runs) ===');
allAssessments.forEach((a, i) => {
  console.log(`[${i}] id=${a.id} | ${a.created_at} | cost=$${a.estimated_cost} | fraud=${a.fraud_score} | deviation=${a.deviation_pct}% | quoted=$${a.total_quoted} | l_composite=$${a.l_composite} | benchmark_coverage=${a.benchmark_coverage} | has_composite=${a.has_composite}`);
});

await conn.end();
console.log('\nDone.');
