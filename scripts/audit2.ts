// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const db = await getDb();
  
  // Check panel_beater_quotes columns
  const cols = (await db.execute(sql`SHOW COLUMNS FROM panel_beater_quotes LIMIT 10`))[0] as any[];
  console.log('PBQ COLS:', cols.map((c:any) => c.Field).join(', '));
  
  // Get quotes for claim
  const quotes = (await db.execute(sql`SELECT * FROM panel_beater_quotes WHERE claim_id = 6150002 LIMIT 5`))[0] as any[];
  console.log('QUOTES COUNT:', quotes.length);
  if (quotes.length > 0) {
    const q = quotes[0];
    console.log('QUOTE KEYS:', Object.keys(q).join(', '));
    console.log('QUOTE[0]:', JSON.stringify(q).substring(0, 300));
  }
  
  // Get pipeline run summary stages
  const rows = (await db.execute(sql`SELECT pipeline_run_summary FROM ai_assessments WHERE claim_id = 6150002 ORDER BY id DESC LIMIT 1`))[0] as any[];
  const ai = rows[0];
  if (ai?.pipeline_run_summary) {
    const prs = JSON.parse(ai.pipeline_run_summary);
    console.log('\nPIPELINE STAGES:');
    Object.entries(prs.stages || {}).forEach(([k, v]: [string, any]) => {
      console.log(`  ${k}: status=${v.status} dur=${v.durationMs}ms err=${v.error || 'none'}`);
    });
  }
  
  // Check cost_intelligence_json structure
  const rows2 = (await db.execute(sql`SELECT cost_intelligence_json, parts_reconciliation_json, validated_outcome_json FROM ai_assessments WHERE claim_id = 6150002 ORDER BY id DESC LIMIT 1`))[0] as any[];
  const ai2 = rows2[0];
  if (ai2?.cost_intelligence_json) {
    const ci = JSON.parse(ai2.cost_intelligence_json);
    console.log('\nCOST INTELLIGENCE KEYS:', Object.keys(ci).join(', '));
    console.log('  expectedRepairCostCents:', ci.expectedRepairCostCents);
    console.log('  quoteDeviationPct:', ci.quoteDeviationPct);
    console.log('  nfs:', ci.nfs ?? ci.netFairSettlement ?? ci.net_fair_settlement ?? 'NOT FOUND');
    console.log('  optimised:', ci.optimisedTotal ?? ci.totalOptimised ?? ci.optimised_total ?? 'NOT FOUND');
  }
  if (ai2?.validated_outcome_json) {
    const vo = JSON.parse(ai2.validated_outcome_json);
    console.log('\nVALIDATED OUTCOME KEYS:', Object.keys(vo).join(', '));
    console.log('  store:', vo.store);
    console.log('  reason:', vo.reason);
  }
  if (ai2?.parts_reconciliation_json) {
    const pr = JSON.parse(ai2.parts_reconciliation_json);
    console.log('\nPARTS RECONCILIATION (first 2):');
    (Array.isArray(pr) ? pr.slice(0, 2) : []).forEach((p: any) => {
      console.log(`  ${p.component}: aiEst=${p.aiEstimate} quoted=${p.quotedAmount} currency=${p.quotedCurrency}`);
    });
  }
  
  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
