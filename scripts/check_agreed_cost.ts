import { getDb } from '../server/db';
import { aiAssessments } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }
  const rows = await db.select().from(aiAssessments).where(eq(aiAssessments.claimId, 6240003)).limit(1);
  if (rows.length === 0) { console.log('No assessment'); process.exit(0); }
  const r = rows[0];
  const ci = r.costIntelligenceJson ? JSON.parse(r.costIntelligenceJson as string) : null;
  if (ci) {
    console.log('documentedAgreedCostUsd:', ci.documentedAgreedCostUsd);
    console.log('documentedOriginalQuoteUsd:', ci.documentedOriginalQuoteUsd);
    console.log('totalEstimatedCost:', ci.totalEstimatedCost);
    console.log('compositeOptimisation.l2:', ci.compositeOptimisation?.l2CompositeOptimisedCostUsd);
    console.log('compositeOptimisation.quotesEvaluated:', ci.compositeOptimisation?.quotesEvaluated);
    console.log('bestSelectedQuote:', JSON.stringify(ci.bestSelectedQuote, null, 2));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
