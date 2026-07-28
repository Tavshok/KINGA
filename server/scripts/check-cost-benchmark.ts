import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15810001));
  if (rows.length === 0) {
    console.log('Assessment 15810001 not found');
    process.exit(1);
  }
  const row = rows[0];
  const cost = row.costIntelligenceJson ? JSON.parse(row.costIntelligenceJson as string) : null;
  const xv = row.crossValidationJson ? JSON.parse(row.crossValidationJson as string) : null;

  console.log('=== COST ANALYSIS (assessment 15810001) ===');
  console.log('quoteDeviationPct:', cost?.quoteDeviationPct);
  console.log('benchmarkCoverageComponents:', cost?.benchmarkCoverageComponents);
  console.log('savingsOpportunityCents:', cost?.savingsOpportunityCents);
  console.log('recommendedCostRange:', JSON.stringify(cost?.recommendedCostRange));
  console.log('aiEstimatedCostCents:', cost?.aiEstimatedCostCents);
  console.log('quotedCostCents:', cost?.quotedCostCents);
  console.log('currency:', cost?.currency);
  console.log('costDecision:', cost?.costDecision);
  console.log('l2OptimisedCostCents:', cost?.l2OptimisedCostCents);
  console.log('l3BenchmarkCostCents:', cost?.l3BenchmarkCostCents);
  console.log('learningDbBenchmarkCents:', cost?.learningDbBenchmarkCents);
  console.log('learningDbSampleSize:', cost?.learningDbSampleSize);

  console.log('\n=== XV FINDINGS ===');
  if (xv?.findings) {
    xv.findings.forEach((f: any, i: number) => {
      console.log(`Finding ${i+1}: signal=${f.signal || f.signalId}, fact=${f.fact || f.finding}, score=${f.fraudScore || f.score}`);
    });
  }

  console.log('\n=== FULL COST JSON (top-level keys) ===');
  if (cost) {
    Object.keys(cost).forEach(k => {
      const v = cost[k];
      if (typeof v !== 'object' || v === null) {
        console.log(`  ${k}: ${v}`);
      } else {
        console.log(`  ${k}: [object]`);
      }
    });
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
