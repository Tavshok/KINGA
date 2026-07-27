import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT 
    JSON_UNQUOTE(JSON_EXTRACT(claim_record_json, '$.accidentDetails.estimatedSpeedKmh')) as estimatedSpeedKmh,
    JSON_UNQUOTE(JSON_EXTRACT(claim_record_json, '$.accidentDetails.collisionDirection')) as collisionDirection,
    JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble') as speedInferenceEnsemble,
    JSON_EXTRACT(physics_analysis, '$.claimedSpeedDeviationFlag') as claimedSpeedDeviationFlag
  FROM ai_assessments ORDER BY id DESC LIMIT 1
`);

const row = rows[0];
console.log('estimatedSpeedKmh:', row.estimatedSpeedKmh);
console.log('collisionDirection:', row.collisionDirection);
if (row.speedInferenceEnsemble) {
  const ensemble = typeof row.speedInferenceEnsemble === 'string' ? JSON.parse(row.speedInferenceEnsemble) : row.speedInferenceEnsemble;
  console.log('speedInferenceEnsemble.consensusKmh:', ensemble.consensusKmh);
  console.log('speedInferenceEnsemble.claimedSpeedDeviationFlag:', JSON.stringify(ensemble.claimedSpeedDeviationFlag, null, 2));
  console.log('speedInferenceEnsemble.methods:', ensemble.methods?.map(m => m.method + '=' + m.estimatedKmh + 'km/h').join(', '));
} else {
  console.log('speedInferenceEnsemble: NULL');
}
console.log('top-level claimedSpeedDeviationFlag:', row.claimedSpeedDeviationFlag);

await conn.end();
