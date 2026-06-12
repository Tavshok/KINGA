import { triggerAiAssessment } from '../db.js';

async function main() {
  console.log('Triggering pipeline for claim 7920001 (PDF-native extraction test)...');
  await triggerAiAssessment(7920001);
  console.log('Pipeline complete for claim 7920001');
}

main().catch(console.error);
