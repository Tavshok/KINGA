/**
 * VOLTRON direct pipeline re-run script.
 * Run: npx tsx scripts/voltron-pipeline-rerun.ts
 */
import { triggerAiAssessment } from '../server/db.ts';

async function main() {
  const CLAIM_ID = 8880001;
  console.log(`Starting VOLTRON re-run (claimId=${CLAIM_ID})...`);
  
  const result = await triggerAiAssessment(CLAIM_ID);
  
  console.log('\n=== PIPELINE COMPLETE ===');
  console.log('claimTruthObject present:', result?.claimTruthObject != null);
  
  if (result?.claimTruthObject) {
    const cto = result.claimTruthObject as any;
    console.log('\n=== TRE CTO FIELD VALUES (AFTER RE-RUN) ===');
    console.log('decision.recommendation:', cto.decision?.recommendation ?? 'N/A');
    console.log('evidence.completenessScore:', cto.evidence?.completenessScore ?? 'N/A');
    console.log('physics.estimatedSpeedKmh:', cto.physics?.estimatedSpeedKmh ?? 'N/A');
    console.log('workflow.claimAgeDays:', cto.workflow?.claimAgeDays ?? 'N/A');
    console.log('workflow.estimatedTurnaroundDays:', cto.workflow?.estimatedTurnaroundDays ?? 'N/A');
    console.log('certification.certificate.certified:', cto.certification?.certificate?.certified ?? 'N/A');
    console.log('certification.certificate.conflictsDetected:', cto.certification?.certificate?.conflictsDetected ?? 'N/A');
  } else {
    console.log('No CTO produced — TRE may have thrown a non-fatal error.');
    console.log('physicsAnalysis present:', result?.physicsAnalysis != null);
    console.log('claimTruth present:', result?.claimTruth != null);
  }
}

main().catch(err => {
  console.error('Re-run failed:', err.message);
  process.exit(1);
});
