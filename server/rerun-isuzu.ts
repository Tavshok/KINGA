/**
 * rerun-isuzu.ts
 *
 * Directly triggers triggerAiAssessment for claim 6240003 (ISUZU MUX).
 * Captures all console output including stage-3 extraction, stage-9 cost,
 * and the ROUTE 1 persistence logs.
 *
 * Run with: npx tsx server/rerun-isuzu.ts 2>&1 | tee /tmp/isuzu-rerun.log
 */

import { triggerAiAssessment } from './db';

const CLAIM_ID = 6240003;

console.log('══════════════════════════════════════════════════════════');
console.log('  KINGA Pipeline Re-Run — Claim', CLAIM_ID, '(ISUZU MUX)');
console.log('══════════════════════════════════════════════════════════');
console.log('Starting at', new Date().toISOString());
console.log('');

triggerAiAssessment(CLAIM_ID)
  .then(() => {
    console.log('');
    console.log('══════════════════════════════════════════════════════════');
    console.log('  Pipeline completed successfully');
    console.log('  Waiting 8s for async persistence to complete...');
    console.log('══════════════════════════════════════════════════════════');
    // The quote persistence is fire-and-forget (Promise.all.then) in saveAssessment.
    // Give it time to complete before the process exits.
    return new Promise<void>(resolve => setTimeout(resolve, 8000));
  })
  .then(() => {
    console.log('[rerun] Async persistence window complete — exiting.');
    process.exit(0);
  })
  .catch((err: any) => {
    console.error('');
    console.error('══════════════════════════════════════════════════════════');
    console.error('  Pipeline FAILED:', err.message);
    console.error(err.stack);
    console.error('══════════════════════════════════════════════════════════');
    process.exit(1);
  });
