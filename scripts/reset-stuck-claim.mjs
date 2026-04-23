/**
 * Reset a stuck claim back to intake_pending so the recovery job re-triggers it.
 * Usage: node scripts/reset-stuck-claim.mjs <claimId>
 */
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const claimId = parseInt(process.argv[2] || '4590006');

// Load env
const envPath = '/home/ubuntu/kinga-replit/.env';
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^=#\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const require = createRequire(import.meta.url);
// Find mysql2 in pnpm store
import { globSync } from 'glob';
const paths = globSync('/home/ubuntu/kinga-replit/node_modules/.pnpm/mysql2*/node_modules/mysql2/promise.js');
let mysql;
if (paths.length) {
  mysql = require(paths[0].replace('/promise.js', '/promise'));
} else {
  try { mysql = require('/home/ubuntu/kinga-replit/node_modules/mysql2/promise'); }
  catch { console.error('mysql2 not found'); process.exit(1); }
}

const conn = await mysql.createConnection(dbUrl);

// Check current status
const [before] = await conn.execute('SELECT id, claim_number, status, document_processing_status, ai_assessment_triggered, updated_at FROM claims WHERE id = ?', [claimId]);
console.log('Before reset:', JSON.stringify(before[0], null, 2));

// Reset to intake_pending
await conn.execute(
  `UPDATE claims SET 
    status = 'intake_pending',
    document_processing_status = 'pending',
    ai_assessment_triggered = 0,
    ai_assessment_completed = 0,
    pipeline_current_stage = NULL,
    pipeline_error = NULL,
    updated_at = NOW()
   WHERE id = ? AND status IN ('assessment_in_progress', 'documents_received')`,
  [claimId]
);

const [after] = await conn.execute('SELECT id, claim_number, status, document_processing_status, ai_assessment_triggered, updated_at FROM claims WHERE id = ?', [claimId]);
console.log('After reset:', JSON.stringify(after[0], null, 2));
console.log('Done. The stuck-claim recovery job will re-trigger this claim within 20 minutes.');

await conn.end();
