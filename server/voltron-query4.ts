import { getDb } from './db';
import { aiAssessments } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('DB not available'); process.exit(1); }

  const [assessment] = await db.select({
    id: aiAssessments.id,
    physicsAnalysis: aiAssessments.physicsAnalysis,
    estimatedCost: aiAssessments.estimatedCost,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
    fraudScore: aiAssessments.fraudScore,
  }).from(aiAssessments)
    .where(eq(aiAssessments.id, 14190001))
    .limit(1);

  if (!assessment) { console.log('Assessment 14190001 not found'); process.exit(0); }

  const physics = assessment.physicsAnalysis ?
    (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis as string) : assessment.physicsAnalysis) : null;

  console.log('=== BEFORE-FIX FULL PHYSICS ===');
  console.log(JSON.stringify(physics, null, 2));

  console.log('\n=== COST & FRAUD ===');
  console.log('estimatedCost:', assessment.estimatedCost);
  console.log('fraudScore:', assessment.fraudScore);
  console.log('fraudRiskLevel:', assessment.fraudRiskLevel);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
