/**
 * Direct pipeline trigger for claim 6450001 (ISUZU MUX)
 * Bypasses the HTTP layer and calls triggerAiAssessment directly.
 * Run: npx tsx server/trigger-pipeline-6450001.ts
 */
import { triggerAiAssessment } from './db';

const CLAIM_ID = 6450001;

async function main() {
  console.log(`[Trigger] Starting pipeline for claim ${CLAIM_ID}...`);
  console.log('[Trigger] This will run all 12 stages including CTL. Expected time: 3-8 minutes.');
  
  try {
    await triggerAiAssessment(CLAIM_ID);
    console.log(`[Trigger] Pipeline completed successfully for claim ${CLAIM_ID}`);
  } catch (err) {
    console.error(`[Trigger] Pipeline failed for claim ${CLAIM_ID}:`, err);
    process.exit(1);
  }
}

main();
