import { getDb } from '../server/db';
import { panelBeaterQuotes, quoteLineItems, aiAssessments } from '../drizzle/schema';
import { eq, sql, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }

  const CLAIM_ID = 6240003;

  // 1. All panel beater quotes for this claim
  console.log(`=== All panelBeaterQuotes for claim ${CLAIM_ID} ===`);
  const allQuotes = await db.execute(sql`
    SELECT id, claim_id, repairer_name, quoted_amount, status, is_lowest, source, panel_beater_id, currency_code
    FROM panel_beater_quotes
    WHERE claim_id = ${CLAIM_ID}
    ORDER BY id
  `);
  console.log(JSON.stringify(allQuotes, null, 2));

  // 2. Check the panelBeaterId for Swiss Motors quote
  console.log('\n=== Panel beater info for panelBeaterId=480001 ===');
  const pb = await db.execute(sql`SELECT id, name, business_name FROM panel_beaters WHERE id = 480001 LIMIT 1`);
  console.log(JSON.stringify(pb, null, 2));

  // 3. Check the AI assessment for this claim — what does it store for quotes?
  console.log('\n=== AI assessment for claim ===');
  const aa = await db.execute(sql`
    SELECT id, claim_id, status, cost_intelligence_json, estimated_cost
    FROM ai_assessments
    WHERE claim_id = ${CLAIM_ID}
    ORDER BY id DESC
    LIMIT 3
  `);
  for (const a of aa as any[]) {
    const cij = a.cost_intelligence_json ? JSON.parse(a.cost_intelligence_json) : null;
    console.log(`  Assessment ${a.id}: status=${a.status} | estimatedCost=${a.estimated_cost}`);
    if (cij) {
      console.log(`    costIntelligenceJson.quotes:`, JSON.stringify(cij.quotes?.map((q: any) => ({ repairer: q.repairerName, amount: q.quotedAmountUsd })) ?? 'none'));
    }
  }

  // 4. Check what the tRPC getForensicReport procedure fetches for quotes
  console.log('\n=== Checking claim_truth_layer for this claim ===');
  const ctl = await db.execute(sql`
    SELECT id, claim_id, evidence_json, cost_basis_json
    FROM claim_truth_layer
    WHERE claim_id = ${CLAIM_ID}
    ORDER BY id DESC
    LIMIT 1
  `);
  for (const c of ctl as any[]) {
    const cb = c.cost_basis_json ? JSON.parse(c.cost_basis_json) : null;
    console.log(`  CTL ${c.id}: costBasis.quotes=`, JSON.stringify(cb?.quotes?.map((q: any) => ({ repairer: q.repairerName, amount: q.quotedAmountUsd })) ?? 'none'));
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
