/**
 * LIVE-RUN-VOLTRON-001 direct pipeline re-run script
 * Invokes triggerAiAssessment directly (bypassing HTTP auth) to re-run the pipeline.
 */
import { getDb } from './db';
import { claims, aiAssessments } from '../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  console.log('[VOLTRON-RERUN] Starting direct pipeline re-run for claim 8880001...');
  
  const db = await getDb();
  if (!db) { console.error('DB not available'); process.exit(1); }

  // Get the claim
  const [claim] = await db.select().from(claims).where(eq(claims.id, 8880001)).limit(1);
  if (!claim) { console.error('Claim 8880001 not found'); process.exit(1); }
  console.log('[VOLTRON-RERUN] Claim:', claim.claimNumber, claim.vehicleMake, claim.vehicleModel, claim.vehicleYear);
  console.log('[VOLTRON-RERUN] Current status:', claim.status);

  // Import the pipeline trigger function
  const { triggerAiAssessment } = await import('./db');
  
  // Trigger the pipeline (fire-and-forget, it runs async)
  console.log('[VOLTRON-RERUN] Triggering pipeline (fire-and-forget)...');
  triggerAiAssessment(claim.id).catch(e => console.error('[VOLTRON-RERUN] Pipeline error:', e));
  
  console.log('[VOLTRON-RERUN] Pipeline triggered. Waiting 180s for completion...');
  await new Promise(r => setTimeout(r, 180000));
  
  // Read the new assessment
  const [newAssessment] = await db.select({
    id: aiAssessments.id,
    physicsAnalysis: aiAssessments.physicsAnalysis,
    estimatedCost: aiAssessments.estimatedCost,
    fraudScore: aiAssessments.fraudScore,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, claim.id))
    .orderBy(desc(aiAssessments.id))
    .limit(1);

  if (!newAssessment) { console.log('[VOLTRON-RERUN] No new assessment found'); process.exit(0); }
  
  console.log('\n[VOLTRON-RERUN] NEW ASSESSMENT ID:', newAssessment.id);
  
  const physics = newAssessment.physicsAnalysis ?
    (typeof newAssessment.physicsAnalysis === 'string' ? JSON.parse(newAssessment.physicsAnalysis as string) : newAssessment.physicsAnalysis) : null;

  if (physics) {
    console.log('\n=== AFTER-FIX PHYSICS ===');
    console.log('estimatedSpeedKmh:', (physics as any).estimatedSpeedKmh);
    console.log('decelerationG:', (physics as any).decelerationG);
    console.log('impactForceKn:', (physics as any).impactForceKn);
    console.log('deltaVKmh:', (physics as any).deltaVKmh);
    console.log('kineticEnergyJ:', (physics as any).kineticEnergyJ);
    console.log('brakingDistanceM:', (physics as any).brakingDistanceM ?? 'null');
    const ens = (physics as any).ensemble;
    if (ens) {
      console.log('ensemble.consensusSpeedKmh:', ens.consensusSpeedKmh);
      console.log('ensemble.overallConfidence:', ens.overallConfidence);
      console.log('ensemble.evidenceAgreementPct:', ens.evidenceAgreementPct);
      console.log('ensemble methods:');
      (ens.methods || []).forEach((m: any) => {
        console.log(`  ${m.method}: speedKmh=${m.speedKmh}, weight=${m.confidenceWeight}, ran=${m.ran}`);
      });
    }
  }

  console.log('\n=== AFTER-FIX COST & FRAUD ===');
  console.log('estimatedCost:', newAssessment.estimatedCost);
  console.log('fraudScore:', newAssessment.fraudScore);
  console.log('fraudRiskLevel:', newAssessment.fraudRiskLevel);

  process.exit(0);
}

main().catch(e => { console.error('[VOLTRON-RERUN] Error:', e); process.exit(1); });
