import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15870001));
  if (rows.length === 0) { console.log('Not found'); process.exit(1); }
  const row = rows[0];

  const paRaw = (row as any).physicsAnalysis;
  const pa = paRaw ? JSON.parse(paRaw) : null;
  const dc = pa?.damageClassification;

  console.log('=== FRAUD SCORE ===');
  console.log('fraudScore:', (row as any).fraudScore);
  console.log('fraudRiskLevel:', (row as any).fraudRiskLevel);

  console.log('\n=== PHYSICS ===');
  console.log('accidentSeverity:', pa?.accidentSeverity);
  console.log('impactVector.direction:', pa?.impactVector?.direction);
  console.log('speedInferenceEnsemble.consensusSpeedKmh:', pa?.speedInferenceEnsemble?.consensusSpeedKmh);

  console.log('\n=== DAMAGE CLASSIFICATION ===');
  if (dc) {
    console.log('overallClassification:', dc.overallClassification);
    console.log('counts:', JSON.stringify(dc.counts));
    const impossible = [...(dc.componentClassifications || []), ...(dc.zoneClassifications || [])].filter((c: any) => c.classification === 'IMPOSSIBLE');
    console.log('IMPOSSIBLE items:', impossible.map((c: any) => c.component).join(', ') || 'NONE');
    console.log('crushDepthConsistencyCheck.primaryAnchorSource:', dc.crushDepthConsistencyCheck?.primaryAnchorSource);
    console.log('crushDepthConsistencyCheck.verdict:', dc.crushDepthConsistencyCheck?.verdict);
    console.log('crushDepthConsistencyCheck.observedCrushDepthM:', dc.crushDepthConsistencyCheck?.observedCrushDepthM);
  }

  console.log('\n=== XV ===');
  const xvRaw = (row as any).crossValidationJson;
  const xv = xvRaw ? JSON.parse(xvRaw) : null;
  console.log('riskLevel:', xv?.overallRisk);
  console.log('findingsCount:', xv?.findings?.length);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
