import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const [row] = await db.select().from(aiAssessments)
    .where(eq(aiAssessments.claimId, 8400001))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!row) { console.log('Not found'); process.exit(1); }

  console.log('=== ASSESSMENT ===');
  console.log('ID:', row.id);
  console.log('fraudScore:', (row as any).fraudScore);
  console.log('fraudRiskLevel:', (row as any).fraudRiskLevel);

  // Get the fraud analysis JSON
  const fraudJson = (row as any).fraudAnalysisJson;
  if (!fraudJson) { console.log('No fraudAnalysisJson'); }
  else {
    const fa = JSON.parse(fraudJson);
    console.log('\n=== FRAUD ANALYSIS JSON top-level keys ===', Object.keys(fa).join(', '));
    console.log('finalScore:', fa.finalScore ?? fa.score ?? fa.fraudScore);
    console.log('riskLevel:', fa.riskLevel ?? fa.fraudRiskLevel);
    console.log('categoryBreakdown:', JSON.stringify(fa.categoryBreakdown, null, 2));
    console.log('\n=== INDICATORS ===');
    const indicators = fa.indicators || fa.fraudIndicators || [];
    for (const ind of indicators) {
      console.log(`  [${ind.severity ?? ind.weight ?? '?'}] ${ind.indicator ?? ind.code}: score=${ind.score ?? ind.points ?? '?'}, category=${ind.category ?? '?'}`);
    }
  }

  // Also check the cross_validation_json to see XV findings
  const xvRaw = (row as any).crossValidationJson;
  if (xvRaw) {
    const xv = JSON.parse(xvRaw);
    console.log('\n=== XV FINDINGS ===');
    console.log('overallRisk:', xv.overallRisk);
    for (const f of (xv.findings || [])) {
      console.log(`  [${f.severity}] ${f.category}: ${f.fact?.substring(0, 60)}`);
    }
    console.log('\nXV injected into fraud score?', xv.injectedIntoFraudScore ?? 'unknown');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
