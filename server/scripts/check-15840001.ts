import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15840001));
  if (rows.length === 0) { console.log('Not found'); process.exit(1); }
  const row = rows[0];
  const pt = row.physicsTruthJson ? JSON.parse(row.physicsTruthJson as string) : null;
  const xv = row.crossValidationJson ? JSON.parse(row.crossValidationJson as string) : null;
  const cost = row.costIntelligenceJson ? JSON.parse(row.costIntelligenceJson as string) : null;

  console.log('=== FRAUD SCORE ===');
  console.log('fraudRiskScore:', row.fraudRiskScore);

  console.log('\n=== PHYSICS TRUTH ===');
  const wave1 = pt?.wave1;
  if (wave1) {
    console.log('consensusSpeedKmh:', wave1.consensusSpeedKmh);
    console.log('claimedSpeedKmh:', wave1.claimedSpeedKmh);
    console.log('visionCrushDepthM:', wave1.visionCrushDepthM);
    console.log('crushDepthConsistencyCheck.primaryAnchorSource:', wave1.crushDepthConsistencyCheck?.primaryAnchorSource);
    console.log('crushDepthConsistencyCheck.primaryAnchorSpeedKmh:', wave1.crushDepthConsistencyCheck?.primaryAnchorSpeedKmh);
    console.log('crushDepthConsistencyCheck.verdict:', wave1.crushDepthConsistencyCheck?.verdict);
    console.log('crushDepthConsistencyCheck.observedCrushM:', wave1.crushDepthConsistencyCheck?.observedCrushM);
    console.log('crushDepthConsistencyCheck.expectedCrushM:', wave1.crushDepthConsistencyCheck?.expectedCrushM);
  } else {
    console.log('wave1 is null');
  }

  console.log('\n=== DAMAGE CLASSIFICATION ===');
  const dc = pt?.wave1?.damageClassification;
  if (dc) {
    console.log('overallClassification:', dc.overallClassification);
    console.log('possible:', dc.counts?.possible);
    console.log('impossible:', dc.counts?.impossible);
    console.log('unexplained:', dc.counts?.unexplained);
    if (dc.componentClassifications) {
      const impossible = dc.componentClassifications.filter((c: any) => c.classification === 'IMPOSSIBLE');
      console.log('IMPOSSIBLE components:', impossible.map((c: any) => c.component).join(', ') || 'NONE');
    }
  } else {
    console.log('damageClassification is null');
  }

  console.log('\n=== XV CROSS-VALIDATION ===');
  console.log('riskLevel:', xv?.riskLevel);
  console.log('findingsCount:', xv?.findings?.length);
  console.log('threeWaySpeedComparison:', JSON.stringify(xv?.threeWaySpeedComparison, null, 2));

  console.log('\n=== COST ===');
  console.log('quoteDeviationPct:', cost?.quoteDeviationPct);
  console.log('documentedAgreedCostUsd:', cost?.documentedAgreedCostUsd);
  console.log('documentedOriginalQuoteUsd:', cost?.documentedOriginalQuoteUsd);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
