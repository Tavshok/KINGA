import { getDb } from "../server/db";
import { claims } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  
  // Find recent claims stuck in assessment_in_progress
  const result = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    status: claims.status,
    documentProcessingStatus: claims.documentProcessingStatus,
    aiAssessmentTriggered: claims.aiAssessmentTriggered,
    aiAssessmentCompleted: claims.aiAssessmentCompleted,
    updatedAt: claims.updatedAt,
  }).from(claims)
    .orderBy(desc(claims.updatedAt))
    .limit(5);
  
  console.log("Recent claims:");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
