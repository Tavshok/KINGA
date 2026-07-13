import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT forensic_analysis FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.forensic_analysis) {
    const f = typeof row.forensic_analysis === 'string' ? JSON.parse(row.forensic_analysis) : row.forensic_analysis;
    console.log('photoIngestionLog:', JSON.stringify(f.photoIngestionLog, null, 2)?.slice(0, 2000));
    // Check damagedComponents for crush depth
    if (Array.isArray(f.damagedComponents)) {
      console.log(`\ndamagedComponents (${f.damagedComponents.length}):`);
      for (const c of f.damagedComponents.slice(0, 10)) {
        console.log(`  ${c.name ?? c.component}: crushDepthM=${c.crushDepthM} zone=${c.location ?? c.zone} inputSource=${c.inputSource}`);
      }
    }
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
