import { getDb } from "./server/db";
import { claims, aiAssessments } from "./drizzle/schema";
import { eq, or, and } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("DB not available"); return; }
  
  // Find claims that are stuck in processing
  const stuckClaims = await db.select({
    id: claims.id,
    status: claims.status,
    workflowState: claims.workflowState,
    documentProcessingStatus: claims.documentProcessingStatus,
    pipelineCurrentStage: claims.pipelineCurrentStage,
    aiAssessmentTriggered: claims.aiAssessmentTriggered,
    updatedAt: claims.updatedAt,
  }).from(claims)
    .where(
      or(
        eq(claims.documentProcessingStatus, "processing"),
        and(
          eq(claims.aiAssessmentTriggered, 1),
          eq(claims.documentProcessingStatus, "pending")
        )
      )
    )
    .limit(20);
  
  console.log("STUCK CLAIMS:", JSON.stringify(stuckClaims, null, 2));
  
  // Also check recent assessments to see pipeline run summaries
  const recentAssessments = await db.select({
    id: aiAssessments.id,
    claimId: aiAssessments.claimId,
    pipelineRunSummary: aiAssessments.pipelineRunSummary,
    updatedAt: aiAssessments.updatedAt,
  }).from(aiAssessments)
    .orderBy(aiAssessments.updatedAt)
    .limit(5);
  
  console.log("\nRECENT ASSESSMENTS:");
  for (const a of recentAssessments) {
    const summary = a.pipelineRunSummary ? JSON.parse(a.pipelineRunSummary as string) : null;
    console.log(`  Claim ${a.claimId}: stages=${JSON.stringify(Object.keys(summary?.stages ?? {}))}, status=${summary?.overallStatus ?? 'N/A'}, failureReason=${summary?.failureReason ?? 'none'}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
