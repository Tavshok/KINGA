import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Check both VOLTRON assessments for photo_classification_json
  const [rows] = await conn.execute(
    `SELECT id,
       photo_classification_json IS NOT NULL as has_photo_class,
       LENGTH(photo_classification_json) as photo_class_len
     FROM ai_assessments WHERE id IN (12930001, 13290001) ORDER BY id`
  );
  console.log('PHOTO_CLASSIFICATION_JSON presence:', JSON.stringify(rows, null, 2));

  // Get the forensic_analysis for 13290001 — specifically the imageClassifier section
  const [rows2] = await conn.execute(
    `SELECT id FROM ai_assessments WHERE id = 13290001`
  );
  console.log('Assessment 13290001 exists:', (rows2 as any[]).length > 0);

  // Get the enrichedPhotos from forensic_analysis to see what was classified
  const [rows3] = await conn.execute(
    `SELECT
       JSON_EXTRACT(forensic_analysis, '$.enrichedPhotos') as enriched_photos,
       JSON_EXTRACT(forensic_analysis, '$.imageClassifier') as image_classifier,
       JSON_EXTRACT(forensic_analysis, '$.visionSourceReliability') as vision_reliability
     FROM ai_assessments WHERE id = 13290001`
  );
  const row3 = (rows3 as any[])[0];
  if (row3) {
    const enriched = row3.enriched_photos;
    const classifier = row3.image_classifier;
    const reliability = row3.vision_reliability;
    console.log('\nVISION_SOURCE_RELIABILITY:', reliability);
    console.log('\nIMAGE_CLASSIFIER:', typeof classifier === 'string' ? classifier.slice(0, 2000) : JSON.stringify(classifier, null, 2)?.slice(0, 2000));
    if (enriched) {
      const photos = typeof enriched === 'string' ? JSON.parse(enriched) : enriched;
      console.log(`\nENRICHED_PHOTOS count: ${Array.isArray(photos) ? photos.length : 'not array'}`);
      if (Array.isArray(photos)) {
        for (const p of photos.slice(0, 10)) {
          console.log(`  page=${p.pageIndex ?? p.pageNumber ?? '?'} classification=${p.classification ?? '?'} conf=${p.confidence ?? '?'} zone=${p.impactZone ?? '?'}`);
        }
      }
    }
  }

  await conn.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
