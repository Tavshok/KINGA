// Trigger BMW re-assessment directly
// This bypasses the HTTP layer and calls triggerAiAssessment directly
process.env.NODE_ENV = 'production';

const mysql = require('mysql2/promise');

async function main() {
  console.log('[Trigger] Starting BMW re-assessment for claim 4380001...');
  
  // First, reset the claim status so the pipeline can run
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Reset to assessment_in_progress so triggerAiAssessment can run
  await conn.execute(
    "UPDATE claims SET status = 'assessment_in_progress', ai_assessment_completed = 0, ai_assessment_triggered = 0, document_processing_status = 'extracted' WHERE id = 4380001"
  );
  console.log('[Trigger] Reset claim status to assessment_in_progress');
  
  await conn.end();
  
  // Now trigger via the TypeScript function using tsx
  console.log('[Trigger] Calling triggerAiAssessment...');
  
  // Use the REST endpoint approach with a direct function call
  const { execSync } = require('child_process');
  
  // Write a small TS runner
  const fs = require('fs');
  fs.writeFileSync('/tmp/run-assessment.ts', `
import { triggerAiAssessment } from '/home/ubuntu/kinga-replit/server/db';
triggerAiAssessment(4380001)
  .then(result => {
    console.log('[Done] Result:', JSON.stringify(result));
    process.exit(0);
  })
  .catch(err => {
    console.error('[Error]', err.message);
    process.exit(1);
  });
`);
  
  console.log('[Trigger] Running tsx...');
}

main().catch(e => console.error('ERROR:', e.message));
