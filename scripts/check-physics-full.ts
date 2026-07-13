import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT physics_analysis FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.physics_analysis) {
    const p = typeof row.physics_analysis === 'string' ? JSON.parse(row.physics_analysis) : row.physics_analysis;
    console.log('TOP-LEVEL KEYS:', Object.keys(p));
    console.log('visionSourceReliability:', p.visionSourceReliability);
    console.log('visionCrushDepthM:', p.visionCrushDepthM);
    console.log('_forensicAnalysis:', JSON.stringify(p._forensicAnalysis));
    console.log('damagedParts:', JSON.stringify(p.damagedParts)?.slice(0, 500));
    console.log('enrichedPhotos count:', Array.isArray(p.enrichedPhotos) ? p.enrichedPhotos.length : 'N/A');
    if (Array.isArray(p.enrichedPhotos)) {
      for (const ph of p.enrichedPhotos.slice(0, 5)) {
        console.log(`  photo: classification=${ph.classification} crushDepthM=${ph.crushDepthM} zone=${ph.impactZone}`);
      }
    }
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
