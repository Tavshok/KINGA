import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();

  const [assessment] = await db.select({
    id: aiAssessments.id,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
    fraudScore: aiAssessments.fraudScore,
    createdAt: aiAssessments.createdAt,
    crossValidationJson: aiAssessments.crossValidationJson,
    directionContradictionFlagJson: aiAssessments.directionContradictionFlagJson,
    physicsAnalysis: aiAssessments.physicsAnalysis,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, 8400001))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!assessment) {
    console.log('No assessment found for claim 8400001');
    process.exit(1);
  }

  console.log('\n=== ASSESSMENT SUMMARY ===');
  console.log(`ID: ${assessment.id}`);
  console.log(`Fraud Risk Level: ${assessment.fraudRiskLevel}`);
  console.log(`Fraud Score: ${assessment.fraudScore}`);
  console.log(`Created: ${assessment.createdAt}`);

  const cv = assessment.crossValidationJson ? JSON.parse(assessment.crossValidationJson as string) : null;
  if (cv) {
    console.log('\n=== XV CROSS-VALIDATION ===');
    console.log(`Risk: ${cv.overallRisk}`);
    console.log(`Findings count: ${cv.findings?.length}`);
    
    if (cv.threeWaySpeedComparison) {
      console.log('\nThree-way speed comparison:');
      console.log(JSON.stringify(cv.threeWaySpeedComparison, null, 2));
    }
    
    if (cv.directionContradiction) {
      console.log('\nDirection contradiction:');
      console.log(JSON.stringify(cv.directionContradiction, null, 2));
    }
    
    if (cv.evidenceTiers) {
      console.log('\nEvidence tiers independenceLevel:', cv.evidenceTiers?.independenceLevel);
    }
    
    if (cv.damageClassification?.crushDepthConsistencyCheck) {
      console.log('\nCrush depth check:');
      console.log(JSON.stringify(cv.damageClassification.crushDepthConsistencyCheck, null, 2));
    }
    
    console.log('\nAll findings:');
    for (const f of (cv.findings || [])) {
      console.log(`  [${f.severity}] ${f.category} / ${f.fact}: ${f.explanation}`);
      if (f.recommendedAction) console.log(`    → ${f.recommendedAction}`);
    }
  } else {
    console.log('No cross_validation_json found');
  }

  const phys = assessment.physicsAnalysis ? JSON.parse(assessment.physicsAnalysis as string) : null;
  if (phys) {
    console.log('\n=== PHYSICS SUMMARY ===');
    console.log(`Consensus speed: ${phys.speedEnsemble?.consensusSpeedKmh} km/h`);
    console.log(`Claimed speed: ${phys.speedEnsemble?.claimedSpeedKmh} km/h`);
    console.log(`Accident severity: ${phys.accidentSeverity}`);
    console.log(`Collision direction: ${phys.impactVector?.direction}`);
    console.log(`Crush depth: ${phys.impactVector?.crushDepthM} m`);
  }

  const dir = assessment.directionContradictionFlagJson ? JSON.parse(assessment.directionContradictionFlagJson as string) : null;
  if (dir) {
    console.log('\n=== DIRECTION CONTRADICTION FLAG ===');
    console.log(JSON.stringify(dir, null, 2));
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
