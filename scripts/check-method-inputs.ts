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
    const methods = e.methods;
    console.log('METHOD 0 (Campbell):', JSON.stringify(methods[0], null, 2));
    console.log('\nMETHOD 4 (Vision Deformation):', JSON.stringify(methods[4], null, 2));
    console.log('\nMETHOD 3 (Deployment Threshold):', JSON.stringify(methods[3], null, 2));
    console.log('\nCROSS VALIDATION:', JSON.stringify(e.crossValidation, null, 2));
    console.log('\nSUMMARY:', JSON.stringify(e.summary, null, 2));
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
