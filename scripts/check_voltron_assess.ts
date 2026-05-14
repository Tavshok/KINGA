// @ts-nocheck
import { getDb } from '../server/db';
import { claims, aiAssessments } from '../drizzle/schema';
import { eq, desc, like } from 'drizzle-orm';

const db = await getDb();
if (!db) { console.log('DB not available'); process.exit(1); }

// Find Voltron claim
const voltron = await db.select({ id: claims.id, claimRef: claims.claimReference, status: claims.workflowState })
  .from(claims)
  .where(like(claims.claimReference, '%6002812%'))
  .limit(3);
console.log('Voltron claims:', JSON.stringify(voltron));

for (const c of voltron) {
  const assess = await db.select({
    id: aiAssessments.id,
    physicsDeviationScore: aiAssessments.physicsDeviationScore,
    coherenceResultJson: aiAssessments.coherenceResultJson,
    costRealismJson: aiAssessments.costRealismJson,
    consistencyCheckJson: aiAssessments.consistencyCheckJson,
    contradictionGateJson: aiAssessments.contradictionGateJson,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, c.id))
    .orderBy(desc(aiAssessments.id))
    .limit(1);
  
  if (assess.length > 0) {
    const a = assess[0];
    console.log(`\nAssessment ${a.id} for claim ${c.id} (${c.claimRef}):`);
    console.log(`  physicsDeviationScore: ${a.physicsDeviationScore ?? 'NULL'}`);
    console.log(`  coherenceResult: ${a.coherenceResultJson ? 'SET' : 'NULL'}`);
    console.log(`  costRealism: ${a.costRealismJson ? 'SET' : 'NULL'}`);
    console.log(`  consistencyCheck: ${a.consistencyCheckJson ? 'SET' : 'NULL'}`);
    console.log(`  contradictionGate: ${a.contradictionGateJson ? 'SET' : 'NULL'}`);
  }
}
process.exit(0);
