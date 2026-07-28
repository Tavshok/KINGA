import { triggerAiAssessment } from '../db';

console.log('[TEST] Triggering KINGA pipeline for claim 11349902...');
try {
  await triggerAiAssessment(11349902);
  console.log('[TEST] Pipeline completed successfully');
} catch (err: any) {
  console.error('[TEST] Pipeline failed:', err.message);
  console.error(err.stack);
}
process.exit(0);
