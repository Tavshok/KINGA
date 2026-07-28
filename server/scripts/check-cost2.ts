import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.select({ costIntelligenceJson: aiAssessments.costIntelligenceJson }).from(aiAssessments).where(eq(aiAssessments.id, 15810001));
  if (rows.length === 0) { console.log('Not found'); process.exit(1); }
  const cost = JSON.parse(rows[0].costIntelligenceJson as string);
  
  console.log('=== DEVIATION BREAKDOWN ===');
  console.log('quoteDeviationPct:', cost.quoteDeviationPct, '%');
  console.log('expectedRepairCostCents:', cost.expectedRepairCostCents, '→ USD', (cost.expectedRepairCostCents/100).toFixed(2));
  console.log('savingsOpportunityCents:', cost.savingsOpportunityCents, '→ USD', (cost.savingsOpportunityCents/100).toFixed(2));
  console.log('recommendedRange:', JSON.stringify(cost.recommendedRange));
  console.log('totalEstimatedCost:', cost.totalEstimatedCost);
  console.log('documentedOriginalQuoteUsd:', cost.documentedOriginalQuoteUsd);
  console.log('documentedAgreedCostUsd:', cost.documentedAgreedCostUsd);
  console.log('kingaSavingsLowestSubmittedUsd:', cost.kingaSavingsLowestSubmittedUsd);
  console.log('kingaSavingsL2OptimisedUsd:', cost.kingaSavingsL2OptimisedUsd);
  
  console.log('\n=== COMPOSITE OPTIMISATION ===');
  const comp = cost.compositeOptimisation;
  if (comp) {
    console.log('l1_quoted:', comp.l1_quoted_usd);
    console.log('l2_optimised:', comp.l2_optimised_usd);
    console.log('l3_benchmark:', comp.l3_benchmark_usd);
    console.log('deviation_pct:', comp.deviation_pct);
    console.log('benchmark_source:', comp.benchmark_source);
  }
  
  console.log('\n=== PER COMPONENT BENCHMARKS (first 3) ===');
  const pcb = cost.perComponentBenchmarks;
  if (pcb) {
    const keys = Object.keys(pcb).slice(0, 3);
    keys.forEach(k => {
      const b = pcb[k];
      console.log(`  ${k}: p25=${b.p25Usd} p50=${b.p50Usd} p75=${b.p75Usd} source=${b.source}`);
    });
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
