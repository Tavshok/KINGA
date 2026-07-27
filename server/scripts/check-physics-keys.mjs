import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT id, physics_analysis FROM ai_assessments ORDER BY id DESC LIMIT 1
`);

const row = rows[0];
console.log('Assessment ID:', row.id);
if (row.physics_analysis) {
  const pa = JSON.parse(row.physics_analysis);
  console.log('physics_analysis keys:', Object.keys(pa));
  console.log('speedEnsemble:', pa.speedEnsemble ? JSON.stringify(pa.speedEnsemble, null, 2) : 'MISSING');
  console.log('claimedSpeedDeviationFlag:', pa.claimedSpeedDeviationFlag ?? 'MISSING');
  console.log('damageClassification:', pa.damageClassification ? JSON.stringify(pa.damageClassification, null, 2) : 'MISSING');
} else {
  console.log('physics_analysis is NULL');
}

await conn.end();
