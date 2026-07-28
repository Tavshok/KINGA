import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const [row] = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15900001));

  // Find the cost analysis JSON field
  const rawJson = (row as any).costIntelligenceJson ?? (row as any).costAnalysisJson ?? null;
  const costJson = rawJson ? JSON.parse(rawJson as string) : null;

  if (!costJson) {
    console.log('No cost JSON field found.');
    process.exit(0);
  }

  console.log('=== COST ANALYSIS TOP KEYS ===');
  console.log(Object.keys(costJson).join(', '));

  const modelSource = costJson.modelSource ?? costJson.benchmarkModelSource ?? costJson.benchmark?.modelSource;
  console.log('\nTop-level modelSource:', modelSource);

  // Check recommendedRange
  const rr = costJson.recommendedRange ?? costJson.recommended_range;
  if (rr) {
    console.log('\n=== RECOMMENDED RANGE ===');
    console.log('modelSource:', rr.modelSource ?? rr.source ?? 'not set');
    console.log('vehicleSpecific:', rr.vehicleSpecific ?? rr.vehicle_specific ?? 'not set');
    console.log('observationCount:', rr.observationCount ?? rr.observation_count ?? 'not set');
    console.log('confidence:', rr.confidence ?? 'not set');
    console.log('lowCents:', rr.lowCents, '| highCents:', rr.highCents);
  }

  // Check perComponentBenchmarks
  const perComp = costJson.perComponentBenchmarks ?? costJson.componentBenchmarks ?? [];
  if (perComp.length > 0) {
    console.log('\n=== PER-COMPONENT BENCHMARKS (first 5) ===');
    for (const c of perComp.slice(0, 5)) {
      console.log('  component:', c.component,
        '| modelSource:', c.modelSource ?? c.source ?? 'not set',
        '| vehicleSpecific:', c.vehicleSpecific ?? c.vehicle_specific ?? 'not set',
        '| observationCount:', c.observationCount ?? c.observation_count ?? 'not set',
        '| p50Cents:', c.p50Cents ?? c.p50 ?? 'not set');
    }
  }

  // Check quoteDeviationPct
  console.log('\nquoteDeviationPct:', costJson.quoteDeviationPct ?? costJson.quote_deviation_pct ?? 'not set');
  console.log('savingsOpportunityCents:', costJson.savingsOpportunityCents ?? 'not set');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
