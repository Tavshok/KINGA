import { getDb } from "../server/db";
import { claims } from "../drizzle/schema";
import { desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  const rows = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    status: claims.documentProcessingStatus,
    triggered: claims.aiAssessmentTriggered,
    completed: claims.aiAssessmentCompleted,
    sourceDocId: claims.sourceDocumentId,
  }).from(claims).orderBy(desc(claims.id)).limit(10);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
