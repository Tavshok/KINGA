import { getDb } from './server/_core/db';
import { claims, aiAssessments } from './drizzle/schema';
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
  }).from(claims).where(eq(claims.claimNumber, '8880001')).limit(1);

  if (!claim) { console.error('Claim 8880001 not found'); process.exit(1); }

  console.log('=== CLAIM ===');
  console.log(JSON.stringify(claim, null, 2));

  const [assessment] = await db.select({
    id: aiAssessments.id,
    physicsAnalysis: aiAssessments.physicsAnalysis,
    claimRecordJson: (aiAssessments as any).claimRecordJson,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, claim.id))
    .orderBy(desc(aiAssessments.id))
    .limit(1);

  if (!assessment) { console.log('No assessment found'); return; }

  console.log('\n=== ASSESSMENT ID ===', assessment.id);

  const physics = assessment.physicsAnalysis ?
    (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis as string) : assessment.physicsAnalysis) : null;

  if (physics) {
    console.log('\n=== BEFORE-FIX PHYSICS ===');
    console.log('estimatedSpeedKmh:', physics.estimatedSpeedKmh);
    console.log('decelerationG:', physics.decelerationG);
    console.log('impactForceKn:', physics.impactForceKn);
    console.log('deltaVKmh:', physics.deltaVKmh);
    console.log('kineticEnergyJ:', physics.kineticEnergyJ);
    console.log('brakingDistanceM:', physics.brakingDistanceM ?? 'null (not yet computed)');
    if (physics.ensemble) {
      console.log('ensemble.consensusSpeedKmh:', physics.ensemble.consensusSpeedKmh);
      console.log('ensemble.overallConfidence:', physics.ensemble.overallConfidence);
      console.log('ensemble.evidenceAgreementPct:', physics.ensemble.evidenceAgreementPct);
      console.log('ensemble methods:');
      (physics.ensemble.methods || []).forEach((m: any) => {
        console.log(`  ${m.method}: speedKmh=${m.speedKmh}, weight=${m.confidenceWeight}, ran=${m.ran}`);
      });
    }
    if (physics.crushDepthPlausibilityCheck) {
      console.log('crushDepthPlausibilityCheck:', JSON.stringify(physics.crushDepthPlausibilityCheck, null, 2));
    }
  }

  const claimRecord = assessment.claimRecordJson ?
    (typeof assessment.claimRecordJson === 'string' ? JSON.parse(assessment.claimRecordJson as string) : assessment.claimRecordJson) : null;

  if (claimRecord?.accidentDetails) {
    console.log('\n=== BEFORE-FIX ACCIDENT DETAILS ===');
    console.log('airbagDeployment:', claimRecord.accidentDetails.airbagDeployment);
    console.log('structuralDamage:', claimRecord.accidentDetails.structuralDamage);
    console.log('seatbeltPretensioner:', claimRecord.accidentDetails.seatbeltPretensioner);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
