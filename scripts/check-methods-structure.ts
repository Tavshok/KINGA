import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble') as ensemble
     FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.ensemble) {
    const e = typeof row.ensemble === 'string' ? JSON.parse(row.ensemble) : row.ensemble;
    // Show top-level keys
    console.log('ENSEMBLE KEYS:', Object.keys(e));
    // Show methods keys if present
    if (e.methods) {
      console.log('METHODS KEYS:', Object.keys(e.methods));
      for (const [k, v] of Object.entries(e.methods as any)) {
        console.log(`  ${k}: speedKmh=${(v as any).speedKmh} confidence=${(v as any).confidence}`);
      }
    }
    console.log('consensusSpeedKmh:', e.consensusSpeedKmh);
    console.log('visionSourceReliability:', e.visionSourceReliability);
    console.log('crushDepthPlausibilityCheck:', e.crushDepthPlausibilityCheck);
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
