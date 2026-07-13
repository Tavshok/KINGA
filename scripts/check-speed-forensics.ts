import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT physics_analysis FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.physics_analysis) {
    const p = typeof row.physics_analysis === 'string' ? JSON.parse(row.physics_analysis) : row.physics_analysis;
    console.log('speedForensics:', JSON.stringify(p.speedForensics, null, 2)?.slice(0, 1000));
    console.log('\nphysicsNumerical:', JSON.stringify(p.physicsNumerical, null, 2)?.slice(0, 1000));
    console.log('\ndamageZones:', JSON.stringify(p.damageZones, null, 2)?.slice(0, 500));
    console.log('\nimpactVector:', JSON.stringify(p.impactVector, null, 2)?.slice(0, 500));
    console.log('\nvelocityRange:', JSON.stringify(p.velocityRange, null, 2));
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
