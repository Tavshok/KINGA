/**
 * run-assessment-test.mjs
 * Directly invokes triggerAiAssessment for claim 4560001 and logs progress.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Set up environment for the server modules
process.env.NODE_ENV = 'development';

const startTime = Date.now();
console.log(`\n${'='.repeat(60)}`);
console.log('KINGA AI ASSESSMENT — LIVE TEST RUN');
console.log(`Claim: DOC-20260422-EEA25997 (id: 4560001)`);
console.log(`Started: ${new Date().toISOString()}`);
console.log(`${'='.repeat(60)}\n`);

// Poll DB for status updates every 5 seconds
const mysql = require('mysql2/promise');
let pollInterval;
let lastStatus = null;
let lastDocStatus = null;

async function pollStatus() {
  try {
    const conn = await mysql.createConnection(process.env.DATABASE_URL);
    const [rows] = await conn.execute(
      'SELECT status, document_processing_status, ai_assessment_triggered, ai_assessment_completed, ai_assessment_started_at, ai_assessment_completed_at FROM claims WHERE id = 4560001'
    );
    await conn.end();
    const r = rows[0];
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (r.status !== lastStatus || r.document_processing_status !== lastDocStatus) {
      console.log(`[${elapsed}s] STATUS: ${r.status} | DOC: ${r.document_processing_status} | triggered=${r.ai_assessment_triggered} | completed=${r.ai_assessment_completed}`);
      lastStatus = r.status;
      lastDocStatus = r.document_processing_status;
    }
    if (r.ai_assessment_completed === 1 || r.status === 'assessment_complete') {
      console.log(`\n[${elapsed}s] ✅ PIPELINE COMPLETE`);
      console.log(`  Started:   ${r.ai_assessment_started_at}`);
      console.log(`  Completed: ${r.ai_assessment_completed_at}`);
      clearInterval(pollInterval);
    }
    if (r.document_processing_status === 'failed') {
      console.log(`\n[${elapsed}s] ❌ PIPELINE FAILED — status reset to ${r.status}`);
      clearInterval(pollInterval);
    }
  } catch (e) {
    // ignore transient DB errors during polling
  }
}

// Dynamically import the server module and trigger the assessment
async function main() {
  try {
    const { triggerAiAssessment } = await import('./server/db.ts');
    console.log('[0s] Triggering AI assessment...\n');
    pollInterval = setInterval(pollStatus, 5000);
    await pollStatus(); // immediate first poll
    await triggerAiAssessment(4560001);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n[${elapsed}s] triggerAiAssessment() returned successfully`);
    clearInterval(pollInterval);
    await pollStatus();
  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n[${elapsed}s] ERROR: ${err.message}`);
    clearInterval(pollInterval);
    await pollStatus();
    process.exit(1);
  }
}

main();
