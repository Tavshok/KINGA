import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT physics_analysis FROM ai_assessments WHERE claim_id = 8880001 ORDER BY id DESC LIMIT 1'
);
await conn.end();

if (!rows.length) { console.log('No rows'); process.exit(1); }
const pa = JSON.parse(rows[0].physics_analysis || '{}');

console.log('=== DAMAGE CLASSIFICATION ===');
const dc = pa.damageClassification;
if (!dc) { console.log('damageClassification: null'); process.exit(0); }
console.log('Overall:', dc.overallClassification);
console.log('Counts:', JSON.stringify(dc.counts));
console.log('Summary:', dc.summary);
console.log('Recommended Action:', dc.recommendedAction);
console.log('\nImpossible findings:', dc.impossibleFindings?.length ?? 0);
dc.impossibleFindings?.forEach(f => console.log(' -', f.component, ':', f.reason?.slice(0, 80)));
console.log('\nUnexplained findings:', dc.unexplainedFindings?.length ?? 0);
dc.unexplainedFindings?.forEach(f => console.log(' -', f.component, ':', f.reason?.slice(0, 80)));
console.log('\nRestraint check:');
console.log('  Airbag consistent:', dc.restraintConsistencyCheck?.airbagConsistent);
console.log('  Airbag note:', dc.restraintConsistencyCheck?.airbagNote?.slice(0, 100));
console.log('  Pretensioner consistent:', dc.restraintConsistencyCheck?.pretensionerConsistent);
console.log('\nCrush depth check:');
console.log('  Consistent:', dc.crushDepthConsistencyCheck?.consistent);
console.log('  Note:', dc.crushDepthConsistencyCheck?.note?.slice(0, 100));
console.log('\nExpected profile:');
console.log('  Speed band:', dc.expectedProfile?.speedBand);
console.log('  Direction:', dc.expectedProfile?.direction);
console.log('  Structural expected:', dc.expectedProfile?.structuralExpected);
console.log('  Airbag expected:', dc.expectedProfile?.airbagExpected);
console.log('  Min crush depth (m):', dc.expectedProfile?.minCrushDepthM);
console.log('  Max crush depth (m):', dc.expectedProfile?.maxCrushDepthM);

console.log('\n=== M7 CLAIMED SPEED DEVIATION ===');
const m7 = pa.speedInferenceEnsemble?.claimedSpeedDeviationFlag;
console.log(JSON.stringify(m7, null, 2));
