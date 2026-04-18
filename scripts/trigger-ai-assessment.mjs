/**
 * Directly triggers AI assessment for a specific claim by calling
 * the triggerAiAssessment function from db.ts via dynamic import.
 * 
 * Usage: node scripts/trigger-ai-assessment.mjs
 */

// We need to use tsx to run this since db.ts is TypeScript
// This script is invoked via: npx tsx scripts/trigger-ai-assessment.mjs

const CLAIM_ID = 4470001; // DOC-20260418-818D666D

console.log(`[TriggerScript] Starting AI assessment for claim ID ${CLAIM_ID}...`);

const { triggerAiAssessment } = await import('../server/db.ts');

console.log(`[TriggerScript] triggerAiAssessment loaded. Calling now...`);

try {
  await triggerAiAssessment(CLAIM_ID);
  console.log(`[TriggerScript] AI assessment completed successfully for claim ${CLAIM_ID}`);
} catch (err) {
  console.error(`[TriggerScript] AI assessment failed for claim ${CLAIM_ID}:`, err);
  process.exit(1);
}

process.exit(0);
