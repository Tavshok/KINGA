/**
 * Trigger a full pipeline re-run for a specific claim.
 * Usage: node scripts/rerun-claim.mjs <claimId>
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const claimId = parseInt(process.argv[2] || '7260001', 10);
console.log(`[ReRun] Triggering pipeline re-run for claim ${claimId}...`);

// Load environment
const dotenv = await import('dotenv');
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

// Import the triggerAiAssessment function
const { triggerAiAssessment } = await import('../server/db.ts');

try {
  console.log(`[ReRun] Starting pipeline for claim ${claimId}...`);
  await triggerAiAssessment(claimId);
  console.log(`[ReRun] Pipeline complete for claim ${claimId}`);
} catch (err) {
  console.error(`[ReRun] Pipeline failed:`, err);
  process.exit(1);
}
