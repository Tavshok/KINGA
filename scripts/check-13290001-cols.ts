import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT
       id,
       claim_id,
       JSON_EXTRACT(forensic_analysis, '$.visionSourceReliability') as vision_reliability,
       JSON_EXTRACT(forensic_analysis, '$.imageClassifier') IS NOT NULL as has_classifier,
       JSON_EXTRACT(forensic_analysis, '$.enrichedPhotos') IS NOT NULL as has_enriched,
       JSON_EXTRACT(forensic_analysis, '$.photoForensics') IS NOT NULL as has_photo_forensics,
       JSON_EXTRACT(forensic_analysis, '$.speedInferenceEnsemble') IS NOT NULL as has_ensemble,
       JSON_EXTRACT(forensic_analysis, '$.speedInferenceEnsemble.methods') IS NOT NULL as has_methods,
       JSON_EXTRACT(forensic_analysis, '$.speedInferenceEnsemble.consensusSpeedKmh') as consensus_speed
     FROM ai_assessments WHERE id = 13290001`
  );
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
