/**
 * Re-trigger pipeline for claim 4320104 (BMW 318i, DIEFTRACK MARKETING)
 * Run with: npx tsx scripts/retrigger-4320104.ts
 */
import { triggerAiAssessment } from "../server/db";

const CLAIM_ID = 4320104;

console.log(`[BMW] Triggering AI assessment pipeline for claim ${CLAIM_ID}...`);
console.log(`[BMW] Started at: ${new Date().toISOString()}`);

try {
  await triggerAiAssessment(CLAIM_ID);
  console.log(`\n[BMW] ✅ Pipeline completed successfully at: ${new Date().toISOString()}`);
  console.log(`[BMW] Navigate to: /claims/${CLAIM_ID}/report`);
} catch (err: any) {
  console.error(`[BMW] ❌ Pipeline failed: ${err.message}`);
  process.exit(1);
}
