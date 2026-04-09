/**
 * Stuck Assessment Recovery Job
 *
 * Runs every 10 minutes to detect and auto-reset claims that are stuck in
 * `assessment_in_progress` but where the AI pipeline was never actually started
 * (ai_assessment_triggered = 0).
 *
 * This can happen when:
 *   1. A workflow transition sets status = "assessment_in_progress" but the
 *      triggerAiAssessment() call is never made (e.g. manual status change via DB).
 *   2. The server crashes between the status update and the async job launch.
 *   3. A race condition where the HTTP response returns before the pre-flight
 *      db.update() completes.
 *
 * Recovery actions:
 *   - CASE 1: Claims in assessment_in_progress with ai_assessment_triggered=0
 *     for > 10 minutes → reset to intake_pending (pipeline was never started).
 *   - CASE 2: Claims in assessment_in_progress with ai_assessment_triggered=1
 *     but ai_assessment_completed=0 and documentProcessingStatus='parsing'
 *     for > 20 minutes → reset to intake_pending (pipeline timed out or crashed).
 */

import { getDb } from "./db";
import { claims } from "../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const TWENTY_MINUTES_MS = 20 * 60 * 1000;

export async function runStuckAssessmentRecoveryJob(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[StuckRecovery] Database not available — skipping run");
    return;
  }

  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - TEN_MINUTES_MS).toISOString();
  const twentyMinutesAgo = new Date(now.getTime() - TWENTY_MINUTES_MS).toISOString();

  let totalReset = 0;

  try {
    // ── CASE 1: assessment_in_progress but pipeline never started ──────────
    // ai_assessment_triggered = 0 means triggerAiAssessment() was never called.
    // Reset after 10 minutes.
    const neverStarted = await db
      .select({ id: claims.id, claimNumber: claims.claimNumber })
      .from(claims)
      .where(
        and(
          eq(claims.status, "assessment_in_progress"),
          eq(claims.aiAssessmentTriggered, 0),
          lt(claims.updatedAt, tenMinutesAgo)
        )
      )
      .limit(50);

    if (neverStarted.length > 0) {
      console.log(
        `[StuckRecovery] Found ${neverStarted.length} claim(s) stuck in assessment_in_progress ` +
        `with ai_assessment_triggered=0 — resetting to intake_pending`
      );
      for (const claim of neverStarted) {
        try {
          await db.update(claims).set({
            status: "intake_pending",
            documentProcessingStatus: "pending",
            workflowState: "intake_queue",
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claim.id));
          console.log(`[StuckRecovery] Reset claim ${claim.claimNumber} (id=${claim.id}) → intake_pending [pipeline never started]`);
          totalReset++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to reset claim ${claim.id}:`, err);
        }
      }
    }

    // ── CASE 2: Pipeline started but never completed within 20 minutes ─────
    // ai_assessment_triggered=1, ai_assessment_completed=0, status still parsing.
    // The 15-minute pipeline timeout should have fired, but the failure handler
    // may not have run (e.g. server crash). Reset after 20 minutes.
    const timedOut = await db
      .select({ id: claims.id, claimNumber: claims.claimNumber })
      .from(claims)
      .where(
        and(
          eq(claims.status, "assessment_in_progress"),
          eq(claims.aiAssessmentTriggered, 1),
          eq(claims.aiAssessmentCompleted, 0),
          eq(claims.documentProcessingStatus, "parsing"),
          lt(claims.updatedAt, twentyMinutesAgo)
        )
      )
      .limit(50);

    if (timedOut.length > 0) {
      console.log(
        `[StuckRecovery] Found ${timedOut.length} claim(s) with pipeline started but ` +
        `never completed after 20min — resetting to intake_pending`
      );
      for (const claim of timedOut) {
        try {
          await db.update(claims).set({
            status: "intake_pending",
            documentProcessingStatus: "failed",
            workflowState: "intake_queue",
            aiAssessmentTriggered: 0,
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, claim.id));
          console.log(
            `[StuckRecovery] Timeout-reset claim ${claim.claimNumber} (id=${claim.id}) ` +
            `→ intake_pending [documentProcessingStatus=failed]`
          );
          totalReset++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to timeout-reset claim ${claim.id}:`, err);
        }
      }
    }

    if (totalReset === 0) {
      console.log("[StuckRecovery] No stuck claims found.");
    } else {
      console.log(`[StuckRecovery] Recovery complete — reset ${totalReset} claim(s).`);
    }
  } catch (err) {
    console.error("[StuckRecovery] Job failed:", err);
  }
}

/**
 * Start the stuck assessment recovery background job.
 * Runs every 10 minutes, with an immediate run on startup.
 */
export function startStuckAssessmentRecoveryJob(): void {
  console.log("[StuckRecovery] Initializing stuck assessment recovery job (every 10 minutes)...");

  // Run once immediately on startup to clear any claims stuck before restart
  runStuckAssessmentRecoveryJob().catch(err => {
    console.error("[StuckRecovery] Initial run failed:", err);
  });

  // Schedule to run every 10 minutes
  setInterval(() => {
    runStuckAssessmentRecoveryJob().catch(err => {
      console.error("[StuckRecovery] Scheduled run failed:", err);
    });
  }, TEN_MINUTES_MS);

  console.log("[StuckRecovery] Job initialized successfully.");
}
