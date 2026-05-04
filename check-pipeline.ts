import { getDb } from "./server/db";
import { claims, aiAssessments } from "./drizzle/schema";
import { desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("DB not available"); return; }
  
  // Get all claims with their status
  const allClaims = await db.select({
    id: claims.id,
    status: claims.status,
    workflowState: claims.workflowState,
    documentProcessingStatus: claims.documentProcessingStatus,
    pipelineCurrentStage: claims.pipelineCurrentStage,
    aiAssessmentTriggered: claims.aiAssessmentTriggered,
    updatedAt: claims.updatedAt,
  }).from(claims)
    .orderBy(desc(claims.updatedAt))
    .limit(20);
  
  console.log("\n=== ALL RECENT CLAIMS ===");
  for (const c of allClaims) {
    console.log(`  Claim ${c.id}: status=${c.status}, workflow=${c.workflowState}, docStatus=${c.documentProcessingStatus}, stage=${c.pipelineCurrentStage ?? 'none'}, aiTriggered=${c.aiAssessmentTriggered}`);
  }
  
  // Get all assessments with pipeline run summaries
  const allAssessments = await db.select({
    id: aiAssessments.id,
    claimId: aiAssessments.claimId,
    recommendation: aiAssessments.recommendation,
    fraudScore: aiAssessments.fraudScore,
    pipelineRunSummary: aiAssessments.pipelineRunSummary,
    updatedAt: aiAssessments.updatedAt,
  }).from(aiAssessments)
    .orderBy(desc(aiAssessments.updatedAt))
    .limit(10);
  
  console.log("\n=== RECENT ASSESSMENTS ===");
  for (const a of allAssessments) {
    let summaryInfo = "no summary";
    if (a.pipelineRunSummary) {
      try {
        const s = JSON.parse(a.pipelineRunSummary as string);
        const stageStatuses = Object.entries(s.stages ?? {}).map(([k, v]: [string, any]) => `${k}:${v.status}`).join(", ");
        summaryInfo = `overall=${s.overallStatus ?? 'N/A'}, stages=[${stageStatuses}], duration=${s.totalDurationMs ?? 'N/A'}ms`;
        if (s.failureReason) summaryInfo += `, FAILURE: ${s.failureReason}`;
      } catch {
        summaryInfo = "parse error";
      }
    }
    console.log(`  Assessment ${a.id} (claim ${a.claimId}): rec=${a.recommendation ?? 'N/A'}, fraud=${a.fraudScore ?? 'N/A'}`);
    console.log(`    Pipeline: ${summaryInfo}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
