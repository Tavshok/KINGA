// Direct pipeline trigger for BMW 318i ADP6423 final validation run
// This bypasses the HTTP layer and calls triggerAiAssessment directly

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// We need to use tsx to run TypeScript directly
// This script is meant to be run with: npx tsx run-final-bmw.mjs

const { triggerAiAssessment } = await import('./server/db.ts');

const CLAIM_ID = 4380001; // BMW318I-ADP6423-1776351529815

console.log(`[Final Validation] Triggering BMW 318i ADP6423 re-run (claimId: ${CLAIM_ID})`);
console.log('[Final Validation] Testing: normalisation layer + Stage 2.6 bypass + photosProcessed fix');

try {
  const result = await triggerAiAssessment(CLAIM_ID);
  console.log('[Final Validation] Pipeline completed');
  console.log('Recommendation:', result?.recommendation);
  console.log('Fraud Score:', result?.fraudScore);
  console.log('Export Allowed:', result?.exportAllowed);
} catch (err) {
  console.error('[Final Validation] Error:', err.message);
}
