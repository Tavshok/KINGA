import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// Load env
const envPath = '/home/ubuntu/kinga-replit/.env';
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

// Find mysql2
const require = createRequire(import.meta.url);
let mysql;
try {
  mysql = require('/home/ubuntu/kinga-replit/node_modules/mysql2/promise');
} catch {
  // Try pnpm path
  const { globSync } = await import('glob');
  const paths = globSync('/home/ubuntu/kinga-replit/node_modules/.pnpm/mysql2*/node_modules/mysql2/promise.js');
  if (paths.length) mysql = require(paths[0].replace('/promise.js', '/promise'));
  else { console.error('mysql2 not found'); process.exit(1); }
}

const conn = await mysql.createConnection(dbUrl);

// Check stuck claim
const [claims] = await conn.execute(
  `SELECT id, claim_number, status, document_processing_status, 
   pipeline_current_stage, pipeline_stage_started_at, pipeline_error,
   ai_assessment_triggered, ai_assessment_completed, updated_at
   FROM claims WHERE id = 4590006 OR status IN ('assessment_in_progress','intake_pending','documents_received')
   ORDER BY updated_at DESC LIMIT 10`
);
console.log('=== Recent active claims ===');
console.log(JSON.stringify(claims, null, 2));

// Check if there are any pipeline errors logged
const [errors] = await conn.execute(
  `SELECT id, claim_id, created_at FROM ai_assessments ORDER BY created_at DESC LIMIT 5`
);
console.log('\n=== Recent AI assessments ===');
console.log(JSON.stringify(errors, null, 2));

await conn.end();
