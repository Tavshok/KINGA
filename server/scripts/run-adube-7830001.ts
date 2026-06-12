import { triggerAiAssessment } from '../db.js';

async function main() {
  console.log("Triggering pipeline for claim 7830001 (ADube)...");
  await triggerAiAssessment(7830001);
  console.log("Pipeline complete.");
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
