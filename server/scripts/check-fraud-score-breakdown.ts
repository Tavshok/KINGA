import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const [row] = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15900001));
  const breakdown = JSON.parse(row.fraudScoreBreakdownJson as string);
  const xv = JSON.parse((row as any).crossValidationJson as string);

  console.log('=== FRAUD SCORE BREAKDOWN ===');
  console.log('overallScore:', breakdown.overallScore);
  console.log('level:', breakdown.level);
  console.log('');

  // Category scores
  console.log('=== CATEGORY CONTRIBUTIONS ===');
  const cats: Record<string, number> = {
    'C1 Physical Consistency (28pts budget)': breakdown.damageConsistency?.score ?? 0,
    'C2 Scenario Intelligence (22pts budget)': breakdown.scenarioFraudResult?.score ?? 0,
    'C3 Financial Anomaly (20pts budget)': breakdown.quoteSimilarity?.fraud_score_contribution ?? 0,
    'C4 Documentation (15pts budget)': breakdown.accidentDateCrossCheck?.fraudScore ?? 0,
    'C5 Entity Intelligence (10pts budget)': 0,
    'C6 Photo Forensics (5pts budget)': breakdown.photoForensics?.fraudScore ?? 0,
  };
  for (const [cat, score] of Object.entries(cats)) {
    console.log(`  ${cat}: ${score}`);
  }

  console.log('');
  console.log('crossEngineConsistency score:', breakdown.crossEngineConsistency?.score);
  console.log('damageConsistency score:', breakdown.damageConsistency?.score, '| confidence:', breakdown.damageConsistency?.confidence);
  console.log('scenarioFraud risk_level:', breakdown.scenarioFraudResult?.risk_level, '| score:', breakdown.scenarioFraudResult?.score, '| flags:', breakdown.scenarioFraudResult?.flags);
  console.log('photoForensics fraudScore:', breakdown.photoForensics?.fraudScore);
  console.log('quoteSimilarity fraud_score_contribution:', breakdown.quoteSimilarity?.fraud_score_contribution, '| risk:', breakdown.quoteSimilarity?.risk);
  console.log('accidentDateCrossCheck fraudScore:', breakdown.accidentDateCrossCheck?.fraudScore);
  console.log('confidenceAggregation:', JSON.stringify(breakdown.confidenceAggregation));

  console.log('');
  console.log('=== INDICATORS (all) ===');
  const indicators = breakdown.indicators || [];
  for (const ind of indicators) {
    console.log(`  [${ind.severity ?? '?'}] ${ind.indicator ?? ind.code} | score=${ind.score} | category=${ind.category}`);
  }

  console.log('');
  console.log('=== XV CROSS-VALIDATION ===');
  console.log('overallRisk:', xv.overallRisk);
  console.log('threeWaySpeedComparison:', JSON.stringify(xv.threeWaySpeedComparison));
  console.log('directionContradiction:', JSON.stringify(xv.directionContradiction));
  for (const f of (xv.findings || [])) {
    console.log(`  [${f.severity}] ${f.category}: ${f.fact?.substring(0, 80)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
