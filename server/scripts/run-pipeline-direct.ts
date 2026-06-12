/**
 * Direct pipeline trigger for claim 7650001 (Chevrolet ADL8563)
 * Run with: npx tsx server/scripts/run-pipeline-direct.ts
 */
import { triggerAiAssessment } from '../db.js';

const CLAIM_ID = 7650001;

async function main() {
  console.log(`[${new Date().toISOString()}] Starting pipeline for claim ${CLAIM_ID}...`);
  console.log('Stage progress will be logged below:\n');

  try {
    await triggerAiAssessment(CLAIM_ID);
    console.log(`\n[${new Date().toISOString()}] ✅ Pipeline completed for claim ${CLAIM_ID}`);
  } catch (err: any) {
    console.error(`\n[${new Date().toISOString()}] ❌ Pipeline error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
