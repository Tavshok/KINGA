// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const db = await getDb();
  const rows = (await db.execute(sql`SELECT cost_intelligence_json, parts_reconciliation_json FROM ai_assessments WHERE claim_id = 6150002 ORDER BY id DESC LIMIT 1`))[0] as any[];
  const ci = JSON.parse(rows[0].cost_intelligence_json);
  
  console.log('=== compositeOptimisation ===');
  console.log(JSON.stringify(ci.compositeOptimisation, null, 2).substring(0, 600));
  
  console.log('\n=== costDecision ===');
  console.log(JSON.stringify(ci.costDecision, null, 2).substring(0, 400));
  
  console.log('\n=== bestSelectedQuote ===');
  console.log(JSON.stringify(ci.bestSelectedQuote, null, 2).substring(0, 400));
  
  console.log('\n=== quoteOptimisation ===');
  console.log(JSON.stringify(ci.quoteOptimisation, null, 2).substring(0, 400));
  
  console.log('\n=== reconciliationSummary ===');
  console.log(JSON.stringify(ci.reconciliationSummary, null, 2).substring(0, 400));
  
  // Parts reconciliation
  const pr = JSON.parse(rows[0].parts_reconciliation_json);
  console.log('\n=== PARTS RECONCILIATION (first 3) ===');
  (Array.isArray(pr) ? pr.slice(0, 3) : []).forEach((p: any) => {
    console.log(`  ${p.component}: aiEst=${p.aiEstimate} quoted=${p.quotedAmount} ${p.quotedCurrency} verdict=${p.verdict}`);
  });
  
  // Check quote_line_items for this claim
  const qli = (await db.execute(sql`SELECT COUNT(*) as cnt FROM quote_line_items WHERE claim_id = 6150002`))[0] as any[];
  console.log('\nQUOTE_LINE_ITEMS count:', qli[0]?.cnt ?? 0);
  
  // Check quote_optimisation_results
  const qor = (await db.execute(sql`SELECT * FROM quote_optimisation_results WHERE claim_id = 6150002 LIMIT 3`))[0] as any[];
  console.log('QUOTE_OPTIMISATION_RESULTS count:', qor.length);
  if (qor.length > 0) console.log('  KEYS:', Object.keys(qor[0]).join(', '));
  
  // Check repair_cost_intelligence
  const rci = (await db.execute(sql`SELECT * FROM repair_cost_intelligence WHERE claim_id = 6150002 LIMIT 3`))[0] as any[];
  console.log('REPAIR_COST_INTELLIGENCE count:', rci.length);
  if (rci.length > 0) console.log('  KEYS:', Object.keys(rci[0]).join(', '));
  
  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
