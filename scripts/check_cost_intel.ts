import { getDb } from '../server/db';
import { aiAssessments } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }
  const rows = await db.select().from(aiAssessments).where(eq(aiAssessments.claimId, 6240003)).limit(1);
  if (rows.length === 0) { console.log('No assessment found'); process.exit(0); }
  const r = rows[0];
  console.log('estimatedCostCents:', r.estimatedCostCents, '= USD', ((r.estimatedCostCents ?? 0) / 100).toFixed(2));
  const ci = r.costIntelligenceJson ? JSON.parse(r.costIntelligenceJson as string) : null;
  if (ci) {
    console.log('totalEstimatedCost:', ci.totalEstimatedCost);
    console.log('compositeOptimisation:', JSON.stringify({
      l2: ci.compositeOptimisation?.l2CompositeOptimisedCostUsd,
      l3: ci.compositeOptimisation?.l3BenchmarkReferenceCostUsd,
      negotiationSavings: ci.compositeOptimisation?.negotiationSavingsUsd,
      compositeLineItemsCount: ci.compositeOptimisation?.compositeLineItems?.length,
      quotesEvaluated: ci.compositeOptimisation?.quotesEvaluated,
    }, null, 2));
  }
  // Also check the claim's agreed cost
  const { claims } = await import('../drizzle/schema');
  const claimRows = await db.select().from(claims).where(eq(claims.id, 6240003)).limit(1);
  if (claimRows.length > 0) {
    const c = claimRows[0];
    console.log('claim.agreedCost:', (c as any).agreedCost, '| claim.estimatedCost:', (c as any).estimatedCost);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
