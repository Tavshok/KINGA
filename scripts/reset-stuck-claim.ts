import { getDb } from "../server/db";
import { claims } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  
  // Reset the stuck claim DOC-20260420-065AF26B (id=4500008)
  const result = await db.update(claims).set({
    status: "assessment_in_progress" as any,
    documentProcessingStatus: "pending",
    aiAssessmentTriggered: 0,
    aiAssessmentCompleted: 0,
    updatedAt: new Date().toISOString(),
  }).where(eq(claims.id, 4500008));
  
  console.log("Reset result:", JSON.stringify(result, null, 2));
  console.log("Claim DOC-20260420-065AF26B has been reset to pending state.");
  console.log("The recovery job will re-trigger it within 10 minutes, or you can click 'Reset if Stuck' in the UI.");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
