import { getDb } from "../server/db";
import { aiAssessments, claims } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const rows = await db.select({
    claimNumber: claims.claimNumber,
    costIntelligenceJson: aiAssessments.costIntelligenceJson,
  }).from(aiAssessments)
    .innerJoin(claims, eq(claims.id, aiAssessments.claimId))
    .where(inArray(claims.claimNumber, ['DOC-20260511-F75D99DD', 'DOC-20260514-14A74979']));

  for (const row of rows) {
    const ci = typeof row.costIntelligenceJson === 'string'
      ? JSON.parse(row.costIntelligenceJson)
      : row.costIntelligenceJson;
    const co = ci?.compositeOptimisation;
    console.log('\n=== ' + row.claimNumber + ' ===');
    if (!co) {
      console.log('NO compositeOptimisation in costIntelligenceJson');
      console.log('costIntelligenceJson keys:', ci ? Object.keys(ci) : 'null');
    } else {
      console.log('quotesEvaluated:', co.quotesEvaluated);
      console.log('L1 submitted:', co.l1SubmittedCostUsd);
      console.log('L2 composite:', co.l2CompositeOptimisedCostUsd);
      console.log('L3 benchmark:', co.l3BenchmarkReferenceCostUsd);
      console.log('NFS:', co.negotiationFeasibilityScore, co.negotiationFeasibilityLabel);
      console.log('Total savings opp:', co.totalSavingsOpportunityUsd);
      console.log('Composite line items:', co.compositeLineItems?.length ?? 0);
      console.log('Quoted not damaged:', co.quotedNotDamaged?.length ?? 0);
      console.log('Damaged not quoted:', co.damagedNotQuoted?.length ?? 0);
      console.log('Hidden damage advisories:', co.hiddenDamageAdvisories?.length ?? 0);
      if (co.compositeLineItems?.length > 0) {
        console.log('\nSample composite line items:');
        for (const item of co.compositeLineItems.slice(0, 3)) {
          console.log(' -', item.componentName, '| selected:', item.selectedCostUsd, '| from:', item.selectedFromQuote, '| verdict:', item.benchmarkVerdict);
        }
      }
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
