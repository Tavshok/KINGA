/**
 * Pipeline retest — resets claim 5490001 and calls triggerAiAssessment directly.
 * Run with: npx tsx retest-pipeline.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

const CLAIM_ID = 5490001;

async function main() {
  // Step 1: Reset the claim in the DB
  console.log('[RESET] Resetting claim to intake_pending...');
  const mysql = await import('mysql2/promise');
  const conn = await mysql.default.createConnection(process.env.DATABASE_URL);
  await conn.execute(
    `UPDATE claims SET 
      status = 'intake_pending',
      document_processing_status = 'pending',
      ai_assessment_triggered = 0,
      ai_assessment_completed = 0,
      ai_assessment_started_at = NULL,
      pipeline_current_stage = NULL
    WHERE id = ?`,
    [CLAIM_ID]
  );
  const [rows] = await conn.execute(
    'SELECT id, claim_number, status, document_processing_status, source_document_id, damage_photos FROM claims WHERE id = ?',
    [CLAIM_ID]
  );
  const claim = rows[0];
  console.log('[RESET] Done. Claim:', claim.claim_number, '| Status:', claim.status);
  console.log('[RESET] sourceDocumentId:', claim.source_document_id ?? 'null');
  console.log('[RESET] damagePhotos:', claim.damage_photos ? JSON.parse(claim.damage_photos).length + ' cached' : 'none');
  await conn.end();

  // Step 2: Run the pipeline via triggerAiAssessment
  console.log('\n[PIPELINE] Starting full pipeline via triggerAiAssessment...');
  const startTime = Date.now();

  // Patch console.log to show stage progress clearly
  const origLog = console.log;
  console.log = (...args) => {
    const msg = args.join(' ');
    // Highlight stage transitions and key events
    if (msg.includes('[Stage ') || msg.includes('Stage ') || msg.includes('STAGE') ||
        msg.includes('complete') || msg.includes('Complete') || msg.includes('ERROR') ||
        msg.includes('FAIL') || msg.includes('incident') || msg.includes('fraud') ||
        msg.includes('physics') || msg.includes('report') || msg.includes('Pipeline') ||
        msg.includes('PIPELINE') || msg.includes('Assessment') || msg.includes('Watchdog') ||
        msg.includes('WATCHDOG') || msg.includes('timeout') || msg.includes('stuck')) {
      origLog(...args);
    }
  };

  try {
    const { triggerAiAssessment } = await import('./server/db.ts');
    const result = await triggerAiAssessment(CLAIM_ID);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log = origLog;
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`[RESULT] Pipeline completed in ${elapsed}s`);
    console.log('[RESULT]', JSON.stringify(result, null, 2));
    console.log('═══════════════════════════════════════════════════════');
  } catch (err) {
    console.log = origLog;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[PIPELINE FAILED after ${elapsed}s]`, err.message);
    console.error(err.stack?.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }

  // Step 3: Check final DB state
  const conn2 = await mysql.default.createConnection(process.env.DATABASE_URL);
  const [finalRows] = await conn2.execute(
    `SELECT id, claim_number, status, document_processing_status, pipeline_current_stage, ai_assessment_completed
     FROM claims WHERE id = ?`,
    [CLAIM_ID]
  );
  const [assessRows] = await conn2.execute(
    `SELECT id, fraud_risk_level, total_loss_indicated, estimated_cost, structural_damage_severity
     FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1`,
    [CLAIM_ID]
  );
  await conn2.end();

  console.log('\n[FINAL DB STATE]');
  console.log('Claim:', JSON.stringify(finalRows[0], null, 2));
  console.log('Assessment:', assessRows[0] ? JSON.stringify(assessRows[0], null, 2) : 'NOT FOUND');

  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  console.error(err.stack);
  process.exit(1);
});
