/**
 * LIVE-RUN-VOLTRON-001 re-run script
 * Directly invokes the pipeline on claim 8880001 and captures all six audit values.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env from the running server process
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set — run with: node -r dotenv/config scripts/live-rerun-voltron.mjs');
  process.exit(1);
}

// Import the DB helpers
const { getDb } = await import('../server/_core/db.js').catch(() => import('../server/db.js'));

console.log('=== LIVE-RUN-VOLTRON-001 Pre-run DB Query ===');

// Query the claim
const db = await getDb();
if (!db) { console.error('DB not available'); process.exit(1); }

const { claims, aiAssessments } = await import('../drizzle/schema.js');
const { eq, desc } = await import('drizzle-orm');

const [claim] = await db.select().from(claims).where(eq(claims.claimNumber, '8880001')).limit(1);
if (!claim) { console.error('Claim 8880001 not found'); process.exit(1); }

console.log('Claim DB id:', claim.id);
console.log('Claim number:', claim.claimNumber);
console.log('Vehicle:', claim.vehicleMake, claim.vehicleModel, claim.vehicleYear);
console.log('Status:', claim.status);

// Get the latest assessment
const [assessment] = await db.select()
  .from(aiAssessments)
  .where(eq(aiAssessments.claimId, claim.id))
  .orderBy(desc(aiAssessments.id))
  .limit(1);

if (assessment) {
  const physics = assessment.physicsAnalysis ? 
    (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis) : assessment.physicsAnalysis) : null;
  console.log('\n=== BEFORE-FIX PHYSICS VALUES ===');
  if (physics) {
    console.log('estimatedSpeedKmh:', physics.estimatedSpeedKmh);
    console.log('decelerationG:', physics.decelerationG);
    console.log('impactForceKn:', physics.impactForceKn);
    console.log('deltaVKmh:', physics.deltaVKmh);
    console.log('kineticEnergyJ:', physics.kineticEnergyJ);
    console.log('brakingDistanceM:', physics.brakingDistanceM);
    if (physics.ensemble) {
      console.log('ensemble.consensusSpeedKmh:', physics.ensemble.consensusSpeedKmh);
      console.log('ensemble.overallConfidence:', physics.ensemble.overallConfidence);
      console.log('ensemble.evidenceAgreementPct:', physics.ensemble.evidenceAgreementPct);
      console.log('ensemble methods:');
      (physics.ensemble.methods || []).forEach(m => {
        console.log(`  ${m.method}: speedKmh=${m.speedKmh}, weight=${m.confidenceWeight}, ran=${m.ran}`);
      });
    }
    if (physics.crushDepthPlausibilityCheck) {
      console.log('crushDepthPlausibilityCheck:', JSON.stringify(physics.crushDepthPlausibilityCheck, null, 2));
    }
  } else {
    console.log('No physics analysis found');
  }
  
  const claimRecord = assessment.claimRecordJson ?
    (typeof assessment.claimRecordJson === 'string' ? JSON.parse(assessment.claimRecordJson) : assessment.claimRecordJson) : null;
  if (claimRecord?.accidentDetails) {
    console.log('\n=== BEFORE-FIX ACCIDENT DETAILS ===');
    console.log('airbagDeployment:', claimRecord.accidentDetails.airbagDeployment);
    console.log('structuralDamage:', claimRecord.accidentDetails.structuralDamage);
    console.log('seatbeltPretensioner:', claimRecord.accidentDetails.seatbeltPretensioner);
  }
}

console.log('\nClaim DB id for re-run:', claim.id);
console.log('Use this ID to trigger: trpc.claims.triggerAiAssessment({ claimId:', claim.id, '})');
