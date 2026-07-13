import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT forensic_analysis FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.forensic_analysis) {
    const f = typeof row.forensic_analysis === 'string' ? JSON.parse(row.forensic_analysis) : row.forensic_analysis;
    console.log('FORENSIC TOP-LEVEL KEYS:', Object.keys(f));
    // Look for enrichedPhotos
    if (f.enrichedPhotos) {
      console.log(`\nenrichedPhotos count: ${f.enrichedPhotos.length}`);
      for (const ph of f.enrichedPhotos) {
        console.log(`  page=${ph.pageIndex ?? ph.pageNumber ?? '?'} classification=${ph.classification} crushDepthM=${ph.crushDepthM} zone=${ph.impactZone}`);
      }
    }
    // Look for photoForensics
    if (f.photoForensics) {
      console.log('\nphotoForensics.visionCrushDepthM:', f.photoForensics.visionCrushDepthM);
      console.log('photoForensics.analysedCount:', f.photoForensics.analysedCount);
    }
    // Look for visionCrushDepthM at top level
    console.log('\nvisionCrushDepthM (top):', f.visionCrushDepthM);
    console.log('visionSourceReliability (top):', f.visionSourceReliability);
  } else {
    console.log('NO forensic_analysis for 13290001');
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
