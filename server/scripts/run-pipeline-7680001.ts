/**
 * Direct pipeline trigger for claim 7680001 (DOC-20260612-169E8568)
 * Run with: npx tsx server/scripts/run-pipeline-7680001.ts
 */
import { triggerAiAssessment } from '../db.js';

const CLAIM_ID = 7680001;

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
