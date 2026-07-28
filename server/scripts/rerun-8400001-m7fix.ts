/**
 * Re-run pipeline for claim 8400001 to verify M7 immutable speed fix.
 * Claim: DOC-20260626-33B1FDFE (Isuzu MU-X, road depression)
 * Expected: M7 receives claimedSpeedKmh=70 (not 41), deviation flagged
 */
import { triggerAiAssessment } from "../db";

const CLAIM_ID = 8400001;

async function main() {
  console.log(`[M7-FIX-VERIFY] Starting pipeline re-run for claim ${CLAIM_ID}`);
  console.log(`[M7-FIX-VERIFY] Expected: M7 claimedSpeedKmh=70, consensus~41, deviation=43%`);
  console.log(`[M7-FIX-VERIFY] Started at: ${new Date().toISOString()}`);
  
  try {
    await triggerAiAssessment(CLAIM_ID);
    console.log(`[M7-FIX-VERIFY] Pipeline completed at: ${new Date().toISOString()}`);
  } catch (err) {
    console.error(`[M7-FIX-VERIFY] Pipeline error:`, err);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
