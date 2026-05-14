// @ts-nocheck
import { getDb } from '../server/db';
import { aiAssessments } from '../drizzle/schema';

const db = await getDb();
if (!db) { console.log('DB not available'); process.exit(1); }

const rows = await db.select({
  id: aiAssessments.id,
  claimId: aiAssessments.claimId,
  physicsDeviationScore: aiAssessments.physicsDeviationScore,
  coherenceResultJson: aiAssessments.coherenceResultJson,
  costRealismJson: aiAssessments.costRealismJson,
  consistencyCheckJson: aiAssessments.consistencyCheckJson,
  contradictionGateJson: aiAssessments.contradictionGateJson,
}).from(aiAssessments).orderBy(aiAssessments.id).limit(5);

for (const r of rows) {
  console.log(`Assessment ${r.id} (claim ${r.claimId}):`);
  console.log(`  physicsDeviationScore: ${r.physicsDeviationScore ?? 'NULL'}`);
  console.log(`  coherenceResult: ${r.coherenceResultJson ? 'SET' : 'NULL'}`);
  console.log(`  costRealism: ${r.costRealismJson ? 'SET' : 'NULL'}`);
  console.log(`  consistencyCheck: ${r.consistencyCheckJson ? 'SET' : 'NULL'}`);
  console.log(`  contradictionGate: ${r.contradictionGateJson ? 'SET' : 'NULL'}`);
}
process.exit(0);
