import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL!);

// 1. Find all claims matching Voltron
const [claims] = await conn.execute(`
  SELECT id, claim_number, ai_assessment_completed, workflow_state, updated_at
  FROM claims
  WHERE claim_number LIKE '%VOLTRON%' OR claim_number LIKE '%610D961C%' OR claim_number LIKE '%6002812%'
  ORDER BY id DESC LIMIT 5
`);
console.log('\n=== MATCHING CLAIMS ===');
console.log(JSON.stringify(claims, null, 2));

// 2. Find the most recent assessments (last 5)
const [recent] = await conn.execute(`
  SELECT a.id, a.claim_id, a.recommendation, a.confidence_score,
         a.image_analysis_total_count, a.image_analysis_success_count,
         a.created_at, a.updated_at,
         c.claim_number
  FROM ai_assessments a
  LEFT JOIN claims c ON a.claim_id = c.id
  ORDER BY a.id DESC LIMIT 5
`);
console.log('\n=== MOST RECENT 5 ASSESSMENTS ===');
console.log(JSON.stringify(recent, null, 2));

// 3. Get full pipeline_run_summary for the most recent assessment
const latestId = (recent as any[])[0]?.id;
if (latestId) {
  const [detail] = await conn.execute(`
    SELECT id, pipeline_run_summary, damage_photos_json,
           image_analysis_total_count, image_analysis_success_count,
           recommendation, confidence_score
    FROM ai_assessments WHERE id = ?
  `, [latestId]);
  const row = (detail as any[])[0];
  console.log(`\n=== ASSESSMENT ${latestId} FULL DETAIL ===`);
  console.log(`Recommendation: ${row.recommendation}, Confidence: ${row.confidence_score}%`);
  console.log(`Images: total=${row.image_analysis_total_count}, success=${row.image_analysis_success_count}`);
  
  // Parse damage photos
  try {
    const photos = JSON.parse(row.damage_photos_json || '[]');
    console.log(`Damage photos JSON: ${Array.isArray(photos) ? photos.length : 0} entries`);
  } catch { console.log('Damage photos JSON: (parse error)'); }
  
  // Parse pipeline run summary
  try {
    const summary = JSON.parse(row.pipeline_run_summary || '{}');
    const stages = summary.stages || [];
    console.log(`\nStage breakdown (${stages.length} stages):`);
    for (const s of stages) {
      console.log(`  Stage ${s.stageId} (${s.stageName}): ${s.status} [${s.durationMs}ms]`);
      if (s.recoveryActions?.length) {
        console.log(`    Recovery: ${s.recoveryActions.join(', ')}`);
      }
      if (s.errorMessage) {
        console.log(`    Error: ${s.errorMessage}`);
      }
    }
    if (summary.pdfVisionUsed !== undefined) {
      console.log(`\npdfVisionUsed: ${summary.pdfVisionUsed}`);
    }
  } catch (e: any) { console.log('Pipeline summary: (parse error)', e.message); }
}

await conn.end();
