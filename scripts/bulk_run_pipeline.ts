/**
 * bulk_run_pipeline.ts
 *
 * Server-side script to re-run the KINGA pipeline for all failed/pending
 * production claims. Runs sequentially (one at a time) to avoid LLM rate limits.
 * Captures per-stage results and errors for gap analysis.
 *
 * Usage:  npx tsx scripts/bulk_run_pipeline.ts
 */

import { getDb } from "../server/db";
import { triggerAiAssessment } from "../server/db";
import { claims, aiAssessments } from "../drizzle/schema";
import { inArray, eq, and, notLike, sql } from "drizzle-orm";

interface ClaimRun {
  id: number;
  claimNumber: string;
  status: "pending" | "running" | "success" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  stages?: Record<string, any>;
  fraudScore?: number | null;
  totalQuoteUsd?: number | null;
  reportGenerated?: boolean;
}

async function getFailedClaims() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Only target real production claims:
  // - DOC-* prefix = document-ingestion claims uploaded via the UI
  // - KNG-* prefix = KINGA-generated claims
  // - Must be in failed or uploaded state (not yet successfully processed)
  const rows = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      documentProcessingStatus: claims.documentProcessingStatus,
      status: claims.status,
      aiAssessmentTriggered: claims.aiAssessmentTriggered,
      aiAssessmentCompleted: claims.aiAssessmentCompleted,
    })
    .from(claims)
    .where(
      and(
        inArray(claims.documentProcessingStatus as any, ["failed", "uploaded"]),
        sql`(${claims.claimNumber} LIKE 'DOC-%' OR ${claims.claimNumber} LIKE 'KNG-%')`,
      )
    )
    .limit(50);

  return rows;
}

async function checkReportGenerated(claimId: number): Promise<{ generated: boolean; fraudScore: number | null; totalUsd: number | null; stages: any }> {
  const db = await getDb();
  if (!db) return { generated: false, fraudScore: null, totalUsd: null, stages: {} };

  const rows = await db
    .select({
      fraudScore: aiAssessments.fraudScore,
      pipelineRunSummary: aiAssessments.pipelineRunSummary,
      costIntelligenceJson: aiAssessments.costIntelligenceJson,
    })
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .limit(1);

  if (!rows.length) return { generated: false, fraudScore: null, totalUsd: null, stages: {} };

  const row = rows[0];
  let stages: any = {};
  let totalUsd: number | null = null;

  try {
    if (row.pipelineRunSummary) {
      stages = JSON.parse(row.pipelineRunSummary as string);
    }
  } catch {}

  try {
    if (row.costIntelligenceJson) {
      const ci = JSON.parse(row.costIntelligenceJson as string);
      totalUsd = ci?.totalQuoteUsd ?? ci?.totalRepairCostUsd ?? null;
    }
  } catch {}

  return {
    generated: true,
    fraudScore: row.fraudScore as number | null,
    totalUsd,
    stages,
  };
}

async function main() {
  console.log("=".repeat(70));
  console.log("KINGA BULK PIPELINE RUNNER");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  const failedClaims = await getFailedClaims();
  console.log(`\nFound ${failedClaims.length} claims to process:\n`);
  failedClaims.forEach(c => {
    console.log(`  [${c.id}] ${c.claimNumber} — status: ${c.documentProcessingStatus}`);
  });

  if (failedClaims.length === 0) {
    console.log("\nNo claims to process. Exiting.");
    process.exit(0);
  }

  const results: ClaimRun[] = failedClaims.map(c => ({
    id: c.id,
    claimNumber: c.claimNumber,
    status: "pending",
  }));

  const logFile = `/tmp/pipeline_run_${Date.now()}.log`;
  const logLines: string[] = [];

  function log(msg: string) {
    console.log(msg);
    logLines.push(msg);
  }

  // Process sequentially
  for (let i = 0; i < results.length; i++) {
    const run = results[i];
    log(`\n${"─".repeat(60)}`);
    log(`[${i + 1}/${results.length}] Processing claim ${run.claimNumber} (ID: ${run.id})`);
    log(`Started at: ${new Date().toISOString()}`);

    run.status = "running";
    run.startedAt = new Date();

    try {
      await triggerAiAssessment(run.id);
      run.completedAt = new Date();
      run.durationMs = run.completedAt.getTime() - run.startedAt!.getTime();

      // Check what was generated
      const reportCheck = await checkReportGenerated(run.id);
      run.reportGenerated = reportCheck.generated;
      run.fraudScore = reportCheck.fraudScore;
      run.totalQuoteUsd = reportCheck.totalUsd;
      run.stages = reportCheck.stages;

      if (reportCheck.generated) {
        run.status = "success";
        log(`✓ SUCCESS — Report generated`);
        log(`  Fraud Score: ${run.fraudScore ?? "N/A"}`);
        log(`  Total Quote: USD ${run.totalQuoteUsd?.toFixed(2) ?? "N/A"}`);
        const stageKeys = Object.keys(run.stages || {});
        log(`  Stages completed: ${stageKeys.length > 0 ? stageKeys.join(", ") : "unknown"}`);
      } else {
        run.status = "failed";
        run.error = "Pipeline completed but no aiAssessments record found";
        log(`✗ FAILED — No report generated after pipeline run`);
      }
    } catch (err: any) {
      run.completedAt = new Date();
      run.durationMs = run.completedAt.getTime() - run.startedAt!.getTime();
      run.status = "failed";
      run.error = err?.message || String(err);
      log(`✗ FAILED — ${run.error}`);
    }

    log(`Duration: ${((run.durationMs || 0) / 1000).toFixed(1)}s`);

    // Brief pause between claims to avoid hammering LLM rate limits
    if (i < results.length - 1) {
      log(`Waiting 5s before next claim...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Summary
  log(`\n${"=".repeat(70)}`);
  log(`PIPELINE RUN SUMMARY`);
  log(`Completed: ${new Date().toISOString()}`);
  log(`${"=".repeat(70)}`);

  const succeeded = results.filter(r => r.status === "success");
  const failed = results.filter(r => r.status === "failed");

  log(`\nTotal:   ${results.length}`);
  log(`Success: ${succeeded.length}`);
  log(`Failed:  ${failed.length}`);

  if (succeeded.length > 0) {
    log(`\n✓ SUCCESSFUL CLAIMS:`);
    succeeded.forEach(r => {
      log(`  [${r.id}] ${r.claimNumber}`);
      log(`    Fraud: ${r.fraudScore ?? "N/A"} | Quote: USD ${r.totalQuoteUsd?.toFixed(2) ?? "N/A"} | Duration: ${((r.durationMs || 0) / 1000).toFixed(1)}s`);
    });
  }

  if (failed.length > 0) {
    log(`\n✗ FAILED CLAIMS:`);
    failed.forEach(r => {
      log(`  [${r.id}] ${r.claimNumber}`);
      log(`    Error: ${r.error}`);
    });
  }

  // Write log file
  const fs = await import("fs");
  fs.writeFileSync(logFile, logLines.join("\n") + "\n");
  log(`\nFull log saved to: ${logFile}`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
