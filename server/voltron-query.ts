import { getDb } from './db';
import { claims, aiAssessments } from '../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('DB not available'); process.exit(1); }

  const [claim] = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    vehicleMake: claims.vehicleMake,
    vehicleModel: claims.vehicleModel,
    vehicleYear: claims.vehicleYear,
    status: claims.status,
  }).from(claims).where(eq(claims.claimNumber, 'LIVE-RUN-VOLTRON-001')).limit(1);

  if (!claim) { console.error('Claim 8880001 not found'); process.exit(1); }

  console.log('=== CLAIM ===');
  console.log(JSON.stringify(claim, null, 2));

  const [assessment] = await db.select({
    id: aiAssessments.id,
    physicsAnalysis: aiAssessments.physicsAnalysis,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, claim.id))
    .orderBy(desc(aiAssessments.id))
    .limit(1);

  if (!assessment) { console.log('No assessment found'); process.exit(0); }

  console.log('\n=== ASSESSMENT ID ===', assessment.id);

  const physics = assessment.physicsAnalysis ?
    (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis as string) : assessment.physicsAnalysis) : null;

  if (physics) {
    console.log('\n=== BEFORE-FIX PHYSICS ===');
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
      (ens.methods || []).forEach((m: any) => {
        console.log(`  ${m.method}: speedKmh=${m.speedKmh}, weight=${m.confidenceWeight}, ran=${m.ran}`);
      });
    }
    const cdp = (physics as any).crushDepthPlausibilityCheck;
    if (cdp) console.log('crushDepthPlausibilityCheck:', JSON.stringify(cdp, null, 2));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
