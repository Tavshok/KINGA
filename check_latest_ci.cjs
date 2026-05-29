const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query('SELECT id, cost_intelligence_json FROM ai_assessments WHERE id = 8040007');
  if (!rows.length) {
    console.log('Not found in ai_assessments, trying claim 6930001...');
    const [r2] = await conn.query('SELECT id, cost_intelligence_json FROM ai_assessments WHERE claim_id = 6930001 ORDER BY id DESC LIMIT 1');
    if (r2.length) rows.push(r2[0]);
  }
  if (!rows.length) { console.log('No assessment found'); await conn.end(); return; }
  const ci = JSON.parse(rows[0].cost_intelligence_json);
  const items = ci?.compositeOptimisation?.compositeLineItems ?? [];
  console.log('Assessment ID:', rows[0].id);
  console.log('Total composite items:', items.length);
  console.log('L1:', ci?.compositeOptimisation?.l1LowestSubmittedCostUsd);
  console.log('L2:', ci?.compositeOptimisation?.l2CompositeOptimisedCostUsd);
  console.log('Savings:', ci?.compositeOptimisation?.savingsL1vsL2Usd);
  console.log('quotesEvaluated:', ci?.compositeOptimisation?.quotesEvaluated);
  // Check bumper items
  const bumperItems = items.filter(i => (i.componentName || '').toLowerCase().includes('bumper'));
  console.log('\nBumper-related items:');
  bumperItems.forEach(item => {
    console.log(`  ${item.componentName}: $${item.selectedCostUsd} from ${item.selectedFromQuote} (${item.allQuotedPrices?.length || 0} prices)`);
    if (item.allQuotedPrices) {
      item.allQuotedPrices.forEach(p => {
        console.log(`    - ${p.quote}: $${p.costUsd} (${p.passedGate ? 'PASS' : 'FAIL'})`);
      });
    }
  });
  await conn.end();
}
main().catch(console.error);
