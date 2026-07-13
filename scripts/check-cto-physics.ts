import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT
       id,
       JSON_EXTRACT(cto_json, '$.physics.speedInferenceEnsemble.consensusSpeedKmh') as consensus_speed,
       JSON_EXTRACT(cto_json, '$.physics.speedInferenceEnsemble.visionSourceReliability') as vision_reliability,
       JSON_EXTRACT(cto_json, '$.physics.speedInferenceEnsemble.methods') IS NOT NULL as has_methods,
       JSON_EXTRACT(cto_json, '$.physics') IS NOT NULL as has_physics
     FROM ai_assessments WHERE id IN (12930001, 13290001) ORDER BY id`
  );
  console.log('CTO physics check:', JSON.stringify(rows, null, 2));
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
