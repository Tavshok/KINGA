import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const [row] = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15900001));
  const rawJson = (row as any).costIntelligenceJson;
  const costJson = JSON.parse(rawJson as string);

  // The perComponentBenchmarks are in compositeOptimisation.compositeLineItems
  // or in a separate field - let's check all possible locations
  const compositeLineItems = costJson.compositeOptimisation?.compositeLineItems ?? [];
  console.log('compositeLineItems count:', compositeLineItems.length);
  if (compositeLineItems.length > 0) {
    console.log('First item keys:', Object.keys(compositeLineItems[0]).join(', '));
    for (const item of compositeLineItems.slice(0, 5)) {
      console.log('  component:', item.component ?? item.description,
        '| modelSource:', item.modelSource ?? item.benchmark?.modelSource ?? 'not set',
        '| vehicleSpecific:', item.vehicleMakeFiltered ?? item.vehicleSpecific ?? 'not set',
        '| sampleSize:', item.sampleSize ?? item.nTraining ?? 'not set',
        '| confidence:', item.confidence ?? 'not set');
    }
  }

  // Also check breakdown
  const breakdown = costJson.breakdown ?? [];
  console.log('\nbreakdown count:', breakdown.length);
  if (breakdown.length > 0) {
    console.log('First breakdown keys:', Object.keys(breakdown[0]).join(', '));
    for (const item of breakdown.slice(0, 5)) {
      console.log('  component:', item.component ?? item.description,
        '| modelSource:', item.modelSource ?? 'not set',
        '| vehicleMakeFiltered:', item.vehicleMakeFiltered ?? 'not set',
        '| sampleSize:', item.sampleSize ?? 'not set');
    }
  }

  // Check the quoteDeviationPct calculation source
  console.log('\nquoteDeviationPct:', costJson.quoteDeviationPct);
  console.log('savingsOpportunityCents:', costJson.savingsOpportunityCents);
  console.log('benchmarkCoverageComponents:', costJson.benchmarkCoverageComponents);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
