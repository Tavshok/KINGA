/**
 * trigger-bmw-direct.ts
 * Direct pipeline trigger for BMW claim 4320104.
 * Run with: npx tsx server/trigger-bmw-direct.ts
 */
import { config } from 'dotenv';
config({ quiet: true });

import { triggerAiAssessment } from './db';

const CLAIM_ID = 4320104;

async function main() {
  console.log(`[BMW] Triggering AI assessment pipeline for claim ${CLAIM_ID}...`);
  console.log(`[BMW] Started at: ${new Date().toISOString()}`);
  
  try {
    await triggerAiAssessment(CLAIM_ID);
    console.log(`[BMW] ✅ Pipeline completed successfully at: ${new Date().toISOString()}`);
    console.log(`[BMW] Navigate to: /claims/${CLAIM_ID}/report`);
  } catch (err) {
    console.error(`[BMW] ❌ Pipeline failed:`, err);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
