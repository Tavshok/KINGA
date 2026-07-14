/**
 * Direct trigger script for claim 9330001 (Methodist / DRA test claim)
 * Replicates the tRPC claims.triggerAiAssessment procedure logic
 * without requiring auth.
 *
 * Usage: node scripts/trigger-claim-9330001.mjs
 */

// Load env
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load dotenv if available
try { require('dotenv').config(); } catch {}

const { default: mysql } = await import('mysql2/promise');

const pool = mysql.createPool(process.env.DATABASE_URL);

async function run() {
  const claimId = 9330001;

  // Step 1: Reset to intake_pending and mark as parsing (pre-flight)
  console.log(`[Trigger] Resetting claim ${claimId} to intake_pending...`);
  await pool.query(`
    UPDATE claims SET
      status = 'intake_pending',
      document_processing_status = 'parsing',
      ai_assessment_triggered = 1,
      ai_assessment_completed = 0,
      ai_assessment_started_at = NOW(),
      ai_assessment_completed_at = NULL,
      pipeline_current_stage = NULL
    WHERE id = ?
  `, [claimId]);

  // Step 2: Transition to assessment_in_progress
  await pool.query(`UPDATE claims SET status = 'assessment_in_progress' WHERE id = ?`, [claimId]);
  console.log(`[Trigger] Claim ${claimId} set to assessment_in_progress`);

  // Step 3: Import and call triggerAiAssessment
  console.log(`[Trigger] Importing triggerAiAssessment from server/db.ts...`);
  
  // We need to use tsx to run TypeScript
  const { execSync } = require('child_process');
  
  // Write a small TS runner
  const fs = require('fs');
  const runnerCode = `
import { triggerAiAssessment } from '../server/db';

console.log('[DRA-Test] Calling triggerAiAssessment(${claimId})...');
const start = Date.now();
try {
  const result = await triggerAiAssessment(${claimId});
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('[DRA-Test] Completed in', elapsed + 's');
  console.log('[DRA-Test] Result:', JSON.stringify(result, null, 2));
} catch (err) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error('[DRA-Test] FAILED after', elapsed + 's:', err.message);
  if (err.stack) console.error(err.stack.split('\\n').slice(0,5).join('\\n'));
}
process.exit(0);
`;
  fs.writeFileSync('/tmp/dra-runner.ts', runnerCode);
  console.log('[Trigger] Running pipeline via tsx...');
  
  try {
    execSync('cd /home/ubuntu/kinga-replit && npx tsx /tmp/dra-runner.ts', {
      stdio: 'inherit',
      timeout: 300_000, // 5 minutes
      env: { ...process.env }
    });
  } catch (err) {
    console.error('[Trigger] tsx execution failed:', err.message);
  }

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
