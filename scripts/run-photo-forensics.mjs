/**
 * scripts/run-photo-forensics.mjs
 *
 * Runs the photoForensicsEngine against the PNG URLs stored in enrichedPhotosJson
 * for all assessments that have null photoForensics in fraudScoreBreakdownJson.
 * Updates fraudScoreBreakdownJson with the forensics results.
 */
import { createConnection } from 'mysql2/promise';
import { runPhotoForensics } from '../server/pipeline-v2/photoForensicsEngine.js';

const conn = await createConnection(process.env.DATABASE_URL);

// Find assessments where photoForensics is null but enrichedPhotosJson has PNG URLs
const [rows] = await conn.query(`
  SELECT id, claim_id, enriched_photos_json, fraud_score_breakdown_json
  FROM ai_assessments
  WHERE enriched_photos_json IS NOT NULL
    AND enriched_photos_json != '[]'
    AND (
      fraud_score_breakdown_json IS NULL
      OR JSON_EXTRACT(fraud_score_breakdown_json, '$.photoForensics') IS NULL
    )
  ORDER BY id DESC
`);

console.log(`Found ${rows.length} assessments needing photo forensics`);

for (const row of rows) {
  const claimId = row.claim_id;
  const assessmentId = row.id;
  
  let photos;
  try {
    photos = JSON.parse(row.enriched_photos_json);
  } catch {
    console.log(`[Assessment ${assessmentId} / Claim ${claimId}] Failed to parse enrichedPhotosJson`);
    continue;
  }

  // Only process PNG URLs (skip any remaining pdf fragment URLs)
  const pngUrls = photos
    .map(p => p.url)
    .filter(url => url && !url.includes('#page=') && (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.webp')));

  if (pngUrls.length === 0) {
    console.log(`[Assessment ${assessmentId} / Claim ${claimId}] No PNG URLs found, skipping`);
    continue;
  }

  console.log(`[Assessment ${assessmentId} / Claim ${claimId}] Running photo forensics on ${pngUrls.length} PNG URLs...`);

  try {
    const forensicsResult = await runPhotoForensics(pngUrls, true);
    console.log(`  Analysed: ${forensicsResult.analysedCount}, Errors: ${forensicsResult.errorCount}`);
    
    // Check if any photo has ai_vision_description
    const withDesc = forensicsResult.photos.filter(p => p.analysisResult?.ai_vision_description);
    console.log(`  Photos with AI description: ${withDesc.length}`);

    // Update fraudScoreBreakdownJson with the new photoForensics data
    let fraudBreakdown = null;
    if (row.fraud_score_breakdown_json) {
      try {
        fraudBreakdown = JSON.parse(row.fraud_score_breakdown_json);
      } catch { /* ignore */ }
    }

    if (fraudBreakdown) {
      fraudBreakdown.photoForensics = forensicsResult;
    } else {
      // Create minimal fraud breakdown if none exists
      fraudBreakdown = {
        overallScore: 0,
        level: 'low',
        indicators: [],
        photoForensics: forensicsResult,
      };
    }

    await conn.query(
      'UPDATE ai_assessments SET fraud_score_breakdown_json = ? WHERE id = ?',
      [JSON.stringify(fraudBreakdown), assessmentId]
    );

    console.log(`  ✓ Updated fraudScoreBreakdownJson for assessment ${assessmentId}`);
  } catch (err) {
    console.error(`  ✗ Failed for assessment ${assessmentId}: ${err.message}`);
  }
}

await conn.end();
console.log('Done!');
