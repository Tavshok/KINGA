// BMW 318i ADP6423 pipeline re-run with enrichedPhotosJson DB write fix
// Run with: node_modules/.bin/tsx run-bmw-enriched-fix.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { triggerAiAssessment } = await import('./server/db.ts');
const mysql = (await import('mysql2/promise')).default;

const CLAIM_ID = 4380001;

// Reset claim to intake_pending
const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.execute('UPDATE claims SET status=?, ai_assessment_completed=0 WHERE id=?', ['intake_pending', CLAIM_ID]);
console.log('[Fix] Reset claim to intake_pending');
await conn.end();

console.log('[Fix] Running pipeline with enrichedPhotosJson DB write fix...');
try {
  const result = await triggerAiAssessment(CLAIM_ID);
  console.log('[Fix] Pipeline completed');
  console.log('Recommendation:', result?.recommendation);
  console.log('Fraud Score:', result?.fraudScore);
  console.log('Export Allowed:', result?.exportAllowed);
  
  // Check if enrichedPhotosJson was saved
  const conn2 = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn2.execute('SELECT enriched_photos_json, image_analysis_success_count, image_analysis_total_count FROM ai_assessments WHERE claim_id=? ORDER BY id DESC LIMIT 1', [CLAIM_ID]);
  const row = rows[0];
  const enriched = JSON.parse(row.enriched_photos_json || '[]');
  console.log('enriched_photos_json saved:', enriched.length, 'photos');
  console.log('image_analysis_success_count:', row.image_analysis_success_count);
  console.log('image_analysis_total_count:', row.image_analysis_total_count);
  
  // Re-assign tenant
  await conn2.execute('UPDATE claims SET tenant_id=? WHERE id=?', ['tenant-1771335377063', CLAIM_ID]);
  console.log('[Fix] Tenant re-assigned');
  await conn2.end();
} catch (err) {
  console.error('[Fix] Error:', err.message);
  process.exit(1);
}
