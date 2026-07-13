import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT
       JSON_EXTRACT(physics_analysis, '$.damagedParts') as damaged_parts,
       JSON_EXTRACT(physics_analysis, '$.visionSourceReliability') as vision_reliability,
       JSON_EXTRACT(physics_analysis, '$.visionCrushDepthM') as vision_crush_depth
     FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  console.log('visionSourceReliability:', row?.vision_reliability);
  console.log('visionCrushDepthM:', row?.vision_crush_depth);
  if (row?.damaged_parts) {
    const parts = typeof row.damaged_parts === 'string' ? JSON.parse(row.damaged_parts) : row.damaged_parts;
    console.log(`\nDAMAGED PARTS (${Array.isArray(parts) ? parts.length : 'N/A'}):`);
    if (Array.isArray(parts)) {
      for (const p of parts) {
        console.log(`  ${p.name}: crushDepthM=${p.crushDepthM} inputSource=${p.inputSource} zone=${p.location}`);
      }
    }
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
