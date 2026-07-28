import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import { inArray, desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }
  const rows = await db.select({
    id: claims.id,
    num: claims.claimNumber,
    status: claims.status,
    dps: claims.documentProcessingStatus,
    stage: claims.pipelineCurrentStage,
    triggered: claims.aiAssessmentTriggered,
    completed: claims.aiAssessmentCompleted,
    retries: claims.recoveryRetryCount,
    updatedAt: claims.updatedAt
  }).from(claims)
  .where(inArray(claims.status, ["assessment_in_progress","document_validating","document_ready","analysis_running","recovery_attempted"] as any[]))
  .orderBy(desc(claims.updatedAt))
  .limit(15);
  
  console.log(`Found ${rows.length} in-progress claims:`);
  rows.forEach(r => console.log(JSON.stringify(r)));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
