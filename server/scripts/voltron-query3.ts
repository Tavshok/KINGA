import { getDb } from './db';
import { claims, aiAssessments } from '../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('DB not available'); process.exit(1); }

  const [assessment] = await db.select({
    id: aiAssessments.id,
    physicsAnalysis: aiAssessments.physicsAnalysis,
    estimatedCost: aiAssessments.estimatedCost,
    fraudRiskScore: aiAssessments.fraudRiskScore,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, 8880001))
    .orderBy(desc(aiAssessments.id))
    .limit(1);

  if (!assessment) { console.log('No assessment found'); process.exit(0); }

  const physics = assessment.physicsAnalysis ?
    (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis as string) : assessment.physicsAnalysis) : null;

  console.log('=== BEFORE-FIX FULL PHYSICS ===');
  console.log(JSON.stringify(physics, null, 2));

  console.log('\n=== COST & FRAUD ===');
  console.log('estimatedCost:', assessment.estimatedCost);
  console.log('fraudRiskScore:', assessment.fraudRiskScore);
  console.log('fraudRiskLevel:', assessment.fraudRiskLevel);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
