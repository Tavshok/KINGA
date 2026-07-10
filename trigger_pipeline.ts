
import { triggerAiAssessment } from './server/db';

const CLAIM_ID = 8880001;

console.log(`[LIVE RUN] Starting pipeline for claim ${CLAIM_ID}...`);
const start = Date.now();

try {
  await triggerAiAssessment(CLAIM_ID);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[LIVE RUN] Pipeline completed in ${elapsed}s`);
} catch (err: any) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`[LIVE RUN] Pipeline failed after ${elapsed}s: ${err.message}`);
  process.exit(1);
}
