const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [assessments] = await conn.query('SELECT id, cost_intelligence_json FROM ai_assessments WHERE claim_id = 6930001 ORDER BY id DESC LIMIT 1');
  if (!assessments.length) { console.log('No assessment'); await conn.end(); return; }
  const ci = JSON.parse(assessments[0].cost_intelligence_json);
  const sq = ci?.quoteOptimisation?.selected_quotes ?? [];
  console.log('Assessment ID:', assessments[0].id);
  console.log('selected_quotes count:', sq.length);
  sq.forEach((q, i) => {
    const lineItems = q.line_items || q.lineItems || [];
    const sumFromItems = lineItems.reduce((s, li) => s + (li.cost_usd || li.costUsd || 0), 0);
    const storedTotal = q.total_cost_usd || q.total_cost || 0;
    const diff = storedTotal - sumFromItems;
    console.log('\n' + (i+1) + '. ' + q.panel_beater);
    console.log('   Stored total:', storedTotal);
    console.log('   Sum of items:', sumFromItems.toFixed(2));
    console.log('   Difference:  ', diff.toFixed(2), diff !== 0 ? '<<< MISMATCH' : 'OK');
    console.log('   Items count: ', lineItems.length);
    if (Math.abs(diff) > 0.01) {
      console.log('   Line items:');
      lineItems.forEach(li => {
        console.log('     -', li.component_name || li.componentName, ':', li.cost_usd || li.costUsd);
      });
    }
  });
  // Also check composite
  const comp = ci?.compositeOptimisation;
  if (comp) {
    const items = comp.compositeLineItems || [];
    const sumItems = items.reduce((s, i) => s + (i.selectedCostUsd || 0), 0);
    console.log('\n=== COMPOSITE ===');
    console.log('L1 (lowest panel beater):', comp.l1LowestSubmittedCostUsd);
    console.log('L2 (KINGA optimised):    ', comp.l2CompositeOptimisedCostUsd);
    console.log('Sum of composite items:  ', sumItems.toFixed(2));
    console.log('Savings L1 vs L2:        ', comp.savingsL1vsL2Usd);
    console.log('quotesEvaluated:         ', comp.quotesEvaluated);
  }
  await conn.end();
}
main().catch(console.error);
