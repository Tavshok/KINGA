import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL!);

// Get the full record for assessment 10380001
const [rows] = await conn.execute(`
  SELECT a.*, c.claim_number, c.workflow_state
  FROM ai_assessments a
  LEFT JOIN claims c ON a.claim_id = c.id
  WHERE a.id = 10380001
`);

const row = (rows as any[])[0];
if (!row) { console.log('Not found'); await conn.end(); process.exit(1); }

console.log('=== ASSESSMENT 10380001 ===');
console.log(`Claim: ${row.claim_number} (${row.claim_id})`);
console.log(`Recommendation: ${row.recommendation}`);
console.log(`Confidence: ${row.confidence_score}%`);
console.log(`Images total: ${row.image_analysis_total_count}, success: ${row.image_analysis_success_count}`);
console.log(`Updated: ${row.updated_at}`);

// Damage photos
try {
  const photos = JSON.parse(row.damage_photos_json || '[]');
  console.log(`\nDamage photos (${photos.length}):`);
  for (const p of photos.slice(0, 5)) {
    console.log(`  - ${JSON.stringify(p).substring(0, 120)}`);
  }
} catch { console.log('damage_photos_json: parse error'); }

// Enriched photos
try {
  const enriched = JSON.parse(row.enriched_photos_json || '[]');
  console.log(`\nEnriched photos (${enriched.length}):`);
  for (const p of enriched.slice(0, 3)) {
    console.log(`  - ${JSON.stringify(p).substring(0, 200)}`);
  }
} catch { console.log('enriched_photos_json: not available or parse error'); }

// Photo classification
try {
  const classified = JSON.parse(row.photo_classification_json || '{}');
  console.log(`\nPhoto classification: ${JSON.stringify(classified).substring(0, 300)}`);
} catch { console.log('photo_classification_json: not available'); }

// Pipeline run summary
try {
  const summary = JSON.parse(row.pipeline_run_summary || '{}');
  console.log(`\n=== PIPELINE RUN SUMMARY ===`);
  // Print top-level keys
  for (const [k, v] of Object.entries(summary)) {
    if (k !== 'stages') {
      console.log(`  ${k}: ${JSON.stringify(v).substring(0, 200)}`);
    }
  }
  const stages = Array.isArray(summary) ? summary : (summary.stages || summary.stageResults || []);
  console.log(`\nStages (${stages.length}):`);
  for (const s of stages) {
    const name = s.stageName || s.name || s.stage || '';
    const id = s.stageId || s.id || '';
    const status = s.status || '';
    const dur = s.durationMs || s.duration || 0;
    const err = s.errorMessage || s.error || '';
    console.log(`  Stage ${id} (${name}): ${status} [${dur}ms]${err ? ` ERROR: ${err.substring(0, 100)}` : ''}`);
    if (s.recoveryActions?.length) {
      console.log(`    Recovery: ${s.recoveryActions.join(', ')}`);
    }
  }
} catch (e: any) {
  console.log(`Pipeline summary parse error: ${e.message}`);
  console.log(`Raw (first 500 chars): ${String(row.pipeline_run_summary).substring(0, 500)}`);
}

// Also check if there's a newer assessment for claim 8310001 (Voltron)
const [voltron] = await conn.execute(`
  SELECT a.id, a.recommendation, a.confidence_score,
         a.image_analysis_total_count, a.image_analysis_success_count,
         a.created_at, a.updated_at
  FROM ai_assessments a
  WHERE a.claim_id = 8310001
  ORDER BY a.id DESC LIMIT 3
`);
console.log('\n=== VOLTRON CLAIM (8310001) ASSESSMENTS ===');
console.log(JSON.stringify(voltron, null, 2));

await conn.end();
