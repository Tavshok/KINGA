import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15840001));
  if (rows.length === 0) { console.log('Not found'); process.exit(1); }
  const row = rows[0];

  // Print all non-null JSON field names and their top-level keys
  console.log('=== FIELD INVENTORY ===');
  const allKeys = Object.keys(row) as (keyof typeof row)[];
  for (const key of allKeys) {
    const val = row[key];
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && val.startsWith('{')) {
      try {
        const parsed = JSON.parse(val);
        console.log(`${key}: [JSON] top-level keys = ${Object.keys(parsed).join(', ')}`);
      } catch {
        // not JSON
      }
    } else if (typeof val !== 'object') {
      console.log(`${key}: ${val}`);
    }
  }

  console.log('\n=== FRAUD SCORE (direct fields) ===');
  console.log('fraudScore:', (row as any).fraudScore);
  console.log('fraudRiskLevel:', (row as any).fraudRiskLevel);
  console.log('fraudRiskScore:', (row as any).fraudRiskScore);

  // Try physicsTruthJson
  const ptRaw = (row as any).physicsTruthJson;
  if (ptRaw) {
    const pt = JSON.parse(ptRaw);
    console.log('\n=== PHYSICS TRUTH JSON top-level keys ===', Object.keys(pt).join(', '));
    // Try wave1
    if (pt.wave1) {
      console.log('wave1 keys:', Object.keys(pt.wave1).join(', '));
      console.log('consensusSpeedKmh:', pt.wave1.consensusSpeedKmh);
      console.log('claimedSpeedKmh:', pt.wave1.claimedSpeedKmh);
      console.log('visionCrushDepthM:', pt.wave1.visionCrushDepthM);
      const dc = pt.wave1.damageClassification;
      if (dc) {
        console.log('\ndamageClassification.overallClassification:', dc.overallClassification);
        console.log('damageClassification.counts:', JSON.stringify(dc.counts));
        const impossible = (dc.componentClassifications || []).filter((c: any) => c.classification === 'IMPOSSIBLE');
        console.log('IMPOSSIBLE components:', impossible.map((c: any) => c.component).join(', ') || 'NONE');
      }
    } else {
      // Try direct keys
      console.log('consensusSpeedKmh:', pt.consensusSpeedKmh);
      console.log('claimedSpeedKmh:', pt.claimedSpeedKmh);
      console.log('visionCrushDepthM:', pt.visionCrushDepthM);
      if (pt.damageClassification) {
        const dc = pt.damageClassification;
        console.log('damageClassification.overallClassification:', dc.overallClassification);
        console.log('damageClassification.counts:', JSON.stringify(dc.counts));
        const impossible = (dc.componentClassifications || []).filter((c: any) => c.classification === 'IMPOSSIBLE');
        console.log('IMPOSSIBLE components:', impossible.map((c: any) => c.component).join(', ') || 'NONE');
      }
    }
  }

  // Try physicsAnalysis
  const paRaw = (row as any).physicsAnalysis;
  if (paRaw) {
    const pa = JSON.parse(paRaw);
    console.log('\n=== PHYSICS ANALYSIS JSON top-level keys ===', Object.keys(pa).join(', '));
    console.log('speedEnsemble:', JSON.stringify(pa.speedEnsemble));
    console.log('accidentSeverity:', pa.accidentSeverity);
    console.log('impactVector:', JSON.stringify(pa.impactVector));
    console.log('visionCrushDepthM:', pa.visionCrushDepthM);
    const dc = pa.damageClassification;
    if (dc) {
      console.log('\ndamageClassification.overallClassification:', dc.overallClassification);
      console.log('damageClassification.counts:', JSON.stringify(dc.counts));
      const impossible = (dc.componentClassifications || []).filter((c: any) => c.classification === 'IMPOSSIBLE');
      console.log('IMPOSSIBLE components:', impossible.map((c: any) => c.component).join(', ') || 'NONE');
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
