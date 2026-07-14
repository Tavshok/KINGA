/**
 * rerun-voltron-semantic.ts
 * 
 * Directly triggers triggerAiAssessment for claim 8880001 (VOLTRON)
 * to verify the Stage 2.6B semantic classification gate fires correctly
 * and that the quotation scan (page-001.png) is excluded from Stage 6.
 * 
 * Usage: npx tsx server/rerun-voltron-semantic.ts
 */

import { triggerAiAssessment } from './db';

const CLAIM_ID = 8880001;

console.log(`[VOLTRON-SEMANTIC-RERUN] Starting pipeline for claim ${CLAIM_ID}...`);
console.log(`[VOLTRON-SEMANTIC-RERUN] Watch for 'Stage 2.6B' log lines to confirm semantic gate fires`);
console.log(`[VOLTRON-SEMANTIC-RERUN] Expected: page-001.png (quotation scan) excluded from Stage 6`);
console.log('');

triggerAiAssessment(CLAIM_ID)
  .then(() => {
    console.log(`\n[VOLTRON-SEMANTIC-RERUN] Pipeline completed for claim ${CLAIM_ID}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n[VOLTRON-SEMANTIC-RERUN] Pipeline failed:`, err);
    process.exit(1);
  });
