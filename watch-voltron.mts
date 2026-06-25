/**
 * watch-voltron.mts
 * Polls the database every 20 seconds and prints the current pipeline state
 * for the most recent assessment on the Voltron claim (DOC-20260624-610D961C).
 *
 * Column names verified from drizzle/schema.ts:
 *   ai_assessments: id, recommendation, confidence_score, damage_photos_json,
 *                   pipeline_run_summary, image_analysis_total_count,
 *                   image_analysis_success_count, created_at, updated_at
 *   claims: ai_assessment_completed (tinyint), claim_number
 */
import { createConnection } from 'mysql2/promise';

const CLAIM_NUMBER = 'DOC-20260624-610D961C';
const POLL_INTERVAL_MS = 20_000;

const conn = await createConnection(process.env.DATABASE_URL!);

let lastAssessmentId: number | null = null;
let iteration = 0;

async function poll() {
  iteration++;
  const [rows] = await conn.execute(`
    SELECT
      a.id,
      a.recommendation,
      a.confidence_score,
      a.damage_photos_json,
      a.pipeline_run_summary,
      a.image_analysis_total_count,
      a.image_analysis_success_count,
      a.created_at,
      a.updated_at,
      c.claim_number,
      c.ai_assessment_completed
    FROM ai_assessments a
    JOIN claims c ON a.claim_id = c.id
    WHERE c.claim_number = ?
    ORDER BY a.id DESC
    LIMIT 1
  `, [CLAIM_NUMBER]);

  const row = (rows as any[])[0];
  if (!row) {
    console.log(`[${new Date().toISOString()}] Poll #${iteration}: No assessment found for ${CLAIM_NUMBER} yet...`);
    return;
  }

  const isNew = row.id !== lastAssessmentId;
  lastAssessmentId = row.id;

  // Parse pipeline_run_summary for stage statuses
  let stageInfo = '';
  try {
    const summary = JSON.parse(row.pipeline_run_summary || '{}');
    const stages = summary.stages || [];
    stageInfo = stages.map((s: any) =>
      `  Stage ${s.stageId} (${s.stageName}): ${s.status} [${s.durationMs}ms]${s.recoveryActions?.length ? ` ⚠️ ${s.recoveryActions.length} recovery` : ''}`
    ).join('\n');
  } catch { stageInfo = '  (no stage data yet)'; }

  // Parse damage photos
  let photoCount = 0;
  try {
    const photos = JSON.parse(row.damage_photos_json || '[]');
    photoCount = Array.isArray(photos) ? photos.length : 0;
  } catch { photoCount = 0; }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${new Date().toISOString()}] Poll #${iteration}${isNew ? ' 🆕 NEW ASSESSMENT' : ''}`);
  console.log(`Assessment ID : ${row.id}`);
  console.log(`Completed     : ${row.ai_assessment_completed}`);
  console.log(`Recommendation: ${row.recommendation ?? '(pending)'}`);
  console.log(`Confidence    : ${row.confidence_score ?? '(pending)'}%`);
  console.log(`Photos found  : ${photoCount} (image_analysis_total=${row.image_analysis_total_count}, success=${row.image_analysis_success_count})`);
  console.log(`Updated at    : ${row.updated_at}`);
  console.log(`\nStage breakdown:`);
  console.log(stageInfo || '  (no stage data yet)');
  console.log(`${'='.repeat(70)}`);
}

console.log(`Watching ${CLAIM_NUMBER} — polling every ${POLL_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.\n`);

// Poll immediately then on interval
await poll();
const interval = setInterval(async () => {
  try { await poll(); } catch (e: any) { console.error('Poll error:', e.message); }
}, POLL_INTERVAL_MS);

// Keep alive
process.on('SIGINT', async () => {
  clearInterval(interval);
  await conn.end();
  process.exit(0);
});
