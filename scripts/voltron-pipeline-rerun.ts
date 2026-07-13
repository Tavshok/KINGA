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
    console.log('\n=== TRE CTO FIELD VALUES (AFTER FIXES) ===');
    console.log('decision.recommendation:', cto.decision?.recommendation ?? 'N/A');
    console.log('evidence.completenessScore:', cto.evidence?.completenessScore ?? 'N/A');
    // Speed fix: should now show ensemble consensus (28), not driver-stated (70)
    console.log('physics.estimatedSpeedKmh:', cto.physics?.estimatedSpeedKmh ?? 'N/A', ' ← should be 28 (ensemble consensus)');
    console.log('physics.speedInferenceEnsemble.consensusSpeedKmh:', cto.physics?.speedInferenceEnsemble?.consensusSpeedKmh ?? 'N/A');
    // Day-count fix: should now show daysToLodge (4402) and claimProcessingDays (~3)
    console.log('workflow.daysToLodge:', cto.workflow?.daysToLodge ?? 'N/A', ' ← late-submission gap (4402 = 12+ years)');
    console.log('workflow.claimProcessingDays:', cto.workflow?.claimProcessingDays ?? 'N/A', ' ← days since claim entered KINGA');
    console.log('workflow.claimAgeDays (legacy):', cto.workflow?.claimAgeDays ?? 'N/A');
    console.log('workflow.estimatedTurnaroundDays:', cto.workflow?.estimatedTurnaroundDays ?? 'N/A');
    console.log('certification.certificate.certified:', cto.certification?.certificate?.certified ?? 'N/A');
    console.log('certification.certificate.conflictsDetected:', cto.certification?.certificate?.conflictsDetected ?? 'N/A');
    // Stage 7 raw speed (should still be 70 — TRE now reads ensemble instead)
    console.log('\n=== STAGE 7 RAW (for comparison) ===');
    const s7 = result.physicsAnalysis as any;
    console.log('stage7.estimatedSpeedKmh:', s7?.estimatedSpeedKmh ?? 'N/A', ' ← raw Stage 7 (driver-stated, not used by TRE)');
    console.log('stage7.speedInferenceEnsemble.consensusSpeedKmh:', s7?.speedInferenceEnsemble?.consensusSpeedKmh ?? 'N/A');
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
