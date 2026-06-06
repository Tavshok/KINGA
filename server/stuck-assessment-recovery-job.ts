/**
 * Stuck Assessment Recovery Job
 *
 * Runs every 10 minutes to detect and auto-recover claims that are stuck in
 * transient states where the AI pipeline has not completed or the final status
 * update was not applied.
 *
 * Recovery cases handled:
 *
 *   CASE 1 — assessment_in_progress, ai_assessment_triggered=0, >10 min
 *     Pipeline was never started (manual status change or race condition).
 *     Action: Re-trigger the AI pipeline.
 *
 *   CASE 2 — assessment_in_progress, ai_assessment_triggered=1,
 *             ai_assessment_completed=0, documentProcessingStatus='parsing', >20 min
 *     Pipeline started but never completed (timeout or server crash).
 *     Action: Re-trigger the AI pipeline.
 *
 *   CASE 3 — assessment_in_progress, ai_assessment_completed=1
 *     Pipeline completed and wrote the assessment record, but the final
 *     claims.status update to 'assessment_complete' failed silently.
 *     Action: Directly set status='assessment_complete' (no re-run needed).
 *
 *   CASE 4 — intake_pending, ai_assessment_triggered=1,
 *             documentProcessingStatus='failed', >5 min
 *     Pipeline crashed and the safety net reset status to intake_pending but
 *     left ai_assessment_triggered=1. The recovery job was previously missing
 *     these because it only looked at assessment_in_progress.
 *     Action: Re-trigger the AI pipeline.
 *
 *   CASE 5 — assessment_in_progress, ai_assessment_triggered=1,
 *             documentProcessingStatus NOT 'parsing' (e.g. 'extracted', 'failed'), >10 min
 *     Pipeline ran (documentProcessingStatus was updated) but status was never
 *     set to assessment_complete. Treat as Case 3 if ai_assessment_completed=1,
 *     otherwise re-trigger.
 *     Action: Set status='assessment_complete' or re-trigger.
 *
 *   CASE 6 — assessment_in_progress, documentProcessingStatus='extracting'|'analysing', >10 min
 *     Pipeline set dps to an active transient state but then died (DB error, OOM, unhandled
 *     promise rejection) without triggering the safety net in db.ts. The startup cleanup
 *     handles this on server restart, but if the server stays up the claim is stuck forever.
 *     Action: Reset to pending and re-trigger.
 *
 *   CASE 7 — assessment_in_progress, any dps, >30 min
 *     Hard wall-clock guard. No matter what state the claim is in, if it has been in
 *     assessment_in_progress for more than 30 minutes without completing, something is
 *     fundamentally wrong. Reset to failed — do NOT auto-re-trigger (requires manual action).
 *     Action: Reset to intake_pending with dps=failed. Manual re-trigger required.
 *
 * PERSISTENT RETRY COUNTER:
 *   Each claim has a recoveryRetryCount column in the DB. Every time the recovery job
 *   re-triggers a claim, it increments this counter. When the counter reaches
 *   MAX_RECOVERY_RETRIES (3), the claim is marked as permanently failed and the recovery
 *   job will NOT re-trigger it again — even across server restarts. The counter is only
 *   reset when a claim successfully completes (aiAssessmentCompleted=1) or when the user
 *   manually resets it via the "Reset if Stuck" button.
 *
 * TIMEZONE FIX: All time comparisons use DB-side SQL expressions (DATE_SUB(NOW(), INTERVAL N MINUTE))
 * instead of JavaScript's new Date(). This is critical because the DB server clock may be in a
 * different timezone than the Node.js process, causing JS-computed ISO strings to be hours off
 * from the stored timestamp values. Using DB-side NOW() ensures both sides of the comparison
 * use the same clock reference.
 */

import { getDb, withDbRetry, triggerAiAssessment } from "./db";
import { claims } from "../drizzle/schema";
import { eq, and, or, notInArray, inArray, sql, lt } from "drizzle-orm";

const TEN_MINUTES_MS    = 10 * 60 * 1000;
const MAX_RECOVERY_RETRIES = 3;

/**
 * Build a DB-side "older than N minutes" condition using NOW() from the database.
 * This avoids the timezone mismatch between Node.js (UTC) and the DB server (may be UTC+N).
 * Works with any timestamp column (updatedAt or aiAssessmentStartedAt).
 */
function olderThanMinutes(column: any, minutes: number) {
  return sql`${column} < DATE_SUB(NOW(), INTERVAL ${minutes} MINUTE)`;
}

/**
 * Check if a claim can be re-triggered based on its persistent DB retry counter.
 * Returns true if recoveryRetryCount < MAX_RECOVERY_RETRIES.
 */
async function canRetrigger(claimId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const rows = await db
      .select({ recoveryRetryCount: claims.recoveryRetryCount })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);
    const count = rows[0]?.recoveryRetryCount ?? 0;
    return count < MAX_RECOVERY_RETRIES;
  } catch {
    return false;
  }
}

/**
 * Increment the persistent DB retry counter for a claim.
 * Returns the new count.
 */
async function incrementRetryCount(claimId: number): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;
    await db.update(claims)
      .set({ recoveryRetryCount: sql`COALESCE(${claims.recoveryRetryCount}, 0) + 1` })
      .where(eq(claims.id, claimId));
    const rows = await db
      .select({ recoveryRetryCount: claims.recoveryRetryCount })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);
    return rows[0]?.recoveryRetryCount ?? 0;
  } catch {
    return 0;
  }
}

/**
 * When max retries are reached, mark the claim as processing_failed and reset to
 * intake_pending so it appears in the UI as a failed claim that needs manual attention.
 * This prevents claims from being silently stuck forever.
 */
async function markAsFailedAfterMaxRetries(claimId: number, claimNumber: string, caseName: string): Promise<void> {
  console.warn(
    `[StuckRecovery] Claim ${claimNumber} (id=${claimId}) — max retries (${MAX_RECOVERY_RETRIES}) reached in ${caseName}. ` +
    `Marking as processing_failed so it surfaces in the UI. Use 'Reset if Stuck' to manually re-queue.`
  );
  try {
    await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return;
      return db.update(claims).set({
        status: "intake_pending",
        workflowState: "intake_queue",
        documentProcessingStatus: "failed",
        aiAssessmentTriggered: 0,
        aiAssessmentCompleted: 0,
        updatedAt: new Date().toISOString() as any,
      }).where(eq(claims.id, claimId));
    }, 3, 2000, `StuckRecovery markFailed claim ${claimId}`);
  } catch (err) {
    console.error(`[StuckRecovery] Failed to mark claim ${claimId} as failed:`, err);
  }
}

/**
 * Re-trigger a claim's AI pipeline with persistent retry tracking.
 * Increments the DB retry counter before triggering.
 * If max retries reached, marks as failed instead.
 */
async function retriggerWithTracking(
  claimId: number,
  claimNumber: string,
  caseName: string,
  preResetFn?: () => Promise<void>
): Promise<boolean> {
  const ok = await canRetrigger(claimId);
  if (!ok) {
    await markAsFailedAfterMaxRetries(claimId, claimNumber, caseName);
    return false;
  }

  try {
    // Run any pre-reset (e.g. clearing aiAssessmentTriggered) before incrementing counter
    if (preResetFn) await preResetFn();

    const newCount = await incrementRetryCount(claimId);
    console.log(
      `[StuckRecovery] ${caseName}: Re-triggering claim ${claimNumber} (id=${claimId}) ` +
      `[retry ${newCount}/${MAX_RECOVERY_RETRIES}]`
    );

    if (newCount >= MAX_RECOVERY_RETRIES) {
      console.warn(
        `[StuckRecovery] Claim ${claimNumber} (id=${claimId}) has now reached max retries. ` +
        `This will be the last automatic re-trigger.`
      );
    }

    triggerAiAssessment(claimId).catch((err: unknown) => {
      console.error(`[StuckRecovery] Re-trigger failed for claim ${claimId}:`, err);
    });
    return true;
  } catch (err) {
    console.error(`[StuckRecovery] Failed to re-trigger claim ${claimId}:`, err);
    return false;
  }
}

/**
 * Startup cleanup — runs ONCE on server start.
 * Any claim still in an active transient state (extracting/analysing/parsing)
 * from a previous server run is guaranteed dead. Reset them immediately so
 * the recovery job can re-trigger them on its first cycle.
 * Uses DB-side time comparison to avoid timezone issues.
 */
export async function runStartupCleanup(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const orphaned = await db
      .select({ id: claims.id, claimNumber: claims.claimNumber, documentProcessingStatus: claims.documentProcessingStatus })
      .from(claims)
      .where(
        and(
          eq(claims.status, "assessment_in_progress" as any),
          inArray(claims.documentProcessingStatus, ["extracting", "analysing", "parsing"]),
          // Use 1 minute threshold — any claim in a transient state for >1 min on server
          // start is guaranteed orphaned (the pipeline process was killed with the server).
          olderThanMinutes(claims.updatedAt, 1)
        )
      )
      .limit(50);
    if (orphaned.length === 0) {
      console.log("[StartupCleanup] No orphaned pipeline claims found.");
      return;
    }
    console.log(`[StartupCleanup] Found ${orphaned.length} orphaned claim(s) in active transient state — resetting to pending.`);
    for (const claim of orphaned) {
      // Only reset if under retry limit — don't loop forever on persistently broken claims
      const ok = await canRetrigger(claim.id);
      if (!ok) {
        console.warn(`[StartupCleanup] Claim ${claim.claimNumber} (id=${claim.id}) has reached max retries — skipping reset.`);
        await db.update(claims).set({
          documentProcessingStatus: "failed",
          aiAssessmentTriggered: 0,
          updatedAt: new Date().toISOString() as any,
        }).where(eq(claims.id, claim.id));
        continue;
      }
      await db.update(claims).set({
        documentProcessingStatus: "pending",
        aiAssessmentTriggered: 0,
        updatedAt: new Date().toISOString() as any,
      }).where(eq(claims.id, claim.id));
      console.log(`[StartupCleanup] Reset claim ${claim.claimNumber} (id=${claim.id}) from '${claim.documentProcessingStatus}' → 'pending'`);
    }
  } catch (err) {
    console.error("[StartupCleanup] Failed:", err);
  }
}

export async function runStuckAssessmentRecoveryJob(): Promise<void> {
  let totalFixed = 0;

  try {
    // ── CASE 3 & 5A: ai_assessment_completed=1 but status is NOT assessment_complete ──────
    // Pipeline completed and wrote the assessment record, but the final
    // claims.status update to 'assessment_complete' failed silently.
    // This can happen when:
    //   a) status is still 'assessment_in_progress' (classic Case 3)
    //   b) status was reset to 'intake_pending' by Case 7 (30-min hard wall-clock guard)
    //      AFTER the pipeline completed — the pipeline finished but Case 7 ran first.
    // Direct fix: set status='assessment_complete' without re-running the pipeline.
    const completedButNotFinalised = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, documentProcessingStatus: claims.documentProcessingStatus })
        .from(claims)
        .where(
          and(
            // Catch both assessment_in_progress (classic) and intake_pending (Case-7 reset)
            or(
              eq(claims.status, "assessment_in_progress"),
              eq(claims.status, "intake_pending"),
            ),
            eq(claims.aiAssessmentCompleted, 1),
          )
        )
        .limit(50);
    }, 3, 2000, 'StuckRecovery case-3 query');

    if (completedButNotFinalised.length > 0) {
      console.log(
        `[StuckRecovery] Found ${completedButNotFinalised.length} claim(s) in assessment_in_progress ` +
        `with ai_assessment_completed=1 — finalising to assessment_complete`
      );
      for (const claim of completedButNotFinalised) {
        try {
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              status: "assessment_complete",
              documentProcessingStatus: "extracted",
              // Reset retry counter on successful completion
              recoveryRetryCount: 0,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery finalise claim ${claim.id}`);
          console.log(`[StuckRecovery] Finalised claim ${claim.claimNumber} (id=${claim.id}) → assessment_complete [pipeline had completed]`);
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to finalise claim ${claim.id}:`, err);
        }
      }
    }

    // ── CASE 5B: assessment_in_progress + triggered=1 + completed=0 + dps in terminal state + >10 min ──
    // Pipeline ran (dps was updated away from 'parsing') but never completed.
    // IMPORTANT: Only re-trigger if dps is in a terminal/idle state.
    // 'extracting' and 'analysing' mean the pipeline is still actively running — do NOT interrupt.
    const ranButIncomplete = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_in_progress"),
            eq(claims.aiAssessmentTriggered, 1),
            eq(claims.aiAssessmentCompleted, 0),
            // Exclude transient active states — pipeline is still running in these states
            notInArray(claims.documentProcessingStatus, ["parsing", "extracting", "analysing", "pending"]),
            olderThanMinutes(claims.updatedAt, 10)
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-5b query');

    if (ranButIncomplete.length > 0) {
      console.log(
        `[StuckRecovery] Found ${ranButIncomplete.length} claim(s) in assessment_in_progress ` +
        `with pipeline ran but incomplete — re-triggering`
      );
      for (const claim of ranButIncomplete) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case5B',
          async () => {
            const db = await getDb();
            if (!db) return;
            await db.update(claims).set({
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              documentProcessingStatus: "pending",
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++; // also count the markAsFailed action
      }
    }

    // ── CASE 1: assessment_in_progress + triggered=0 + >10 min ──────────────
    // Pipeline was never started. Re-trigger it.
    const neverStarted = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_in_progress"),
            eq(claims.aiAssessmentTriggered, 0),
            olderThanMinutes(claims.updatedAt, 10)
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-1 query');

    if (neverStarted.length > 0) {
      console.log(
        `[StuckRecovery] Found ${neverStarted.length} claim(s) stuck in assessment_in_progress ` +
        `with ai_assessment_triggered=0 — re-triggering pipeline`
      );
      for (const claim of neverStarted) {
        const triggered = await retriggerWithTracking(claim.id, claim.claimNumber, 'Case1');
        if (triggered) totalFixed++;
        else totalFixed++;
      }
    }

    // ── CASE 2: assessment_in_progress + triggered=1 + completed=0 + dps='parsing' + >20 min ──
    // Pipeline started but timed out or crashed. Re-trigger.
    const timedOut = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_in_progress"),
            eq(claims.aiAssessmentTriggered, 1),
            eq(claims.aiAssessmentCompleted, 0),
            eq(claims.documentProcessingStatus, "parsing"),
            olderThanMinutes(claims.updatedAt, 20)
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-2 query');

    if (timedOut.length > 0) {
      console.log(
        `[StuckRecovery] Found ${timedOut.length} claim(s) with pipeline timed out ` +
        `after 20min — re-triggering`
      );
      for (const claim of timedOut) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case2',
          async () => {
            const db = await getDb();
            if (!db) return;
            await db.update(claims).set({
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              documentProcessingStatus: "pending",
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++;
      }
    }

    // ── CASE 4: intake_pending + triggered=1 + dps='failed'|'parsing' + >5 min ─────────
    // Safety net reset the claim to intake_pending after a crash but left
    // ai_assessment_triggered=1. Re-trigger the pipeline.
    const crashedAndReset = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber })
        .from(claims)
        .where(
          and(
            eq(claims.status, "intake_pending"),
            eq(claims.aiAssessmentTriggered, 1),
            eq(claims.aiAssessmentCompleted, 0),
            or(
              eq(claims.documentProcessingStatus, "failed"),
              eq(claims.documentProcessingStatus, "parsing"),
            ),
            olderThanMinutes(claims.updatedAt, 5)
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-4 query');

    if (crashedAndReset.length > 0) {
      console.log(
        `[StuckRecovery] Found ${crashedAndReset.length} claim(s) in intake_pending ` +
        `with ai_assessment_triggered=1 and dps=failed — re-triggering pipeline`
      );
      for (const claim of crashedAndReset) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case4',
          async () => {
            const db = await getDb();
            if (!db) return;
            await db.update(claims).set({
              status: "assessment_in_progress",
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              documentProcessingStatus: "pending",
              workflowState: "under_assessment",
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++;
      }
    }

    // ── CASE 6: assessment_in_progress + dps='parsing'|'extracting'|'analysing' + >10 min ─────
    // Pipeline set dps to an active transient state but then died without triggering the safety net.
    const stuckInActiveTransient = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, documentProcessingStatus: claims.documentProcessingStatus })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_in_progress"),
            inArray(claims.documentProcessingStatus, ["parsing", "extracting", "analysing"]),
            olderThanMinutes(claims.updatedAt, 10)
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-6 query');

    if (stuckInActiveTransient.length > 0) {
      console.log(
        `[StuckRecovery] Found ${stuckInActiveTransient.length} claim(s) stuck in active transient state ` +
        `(extracting/analysing) >10min — resetting and re-triggering`
      );
      for (const claim of stuckInActiveTransient) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case6',
          async () => {
            const db = await getDb();
            if (!db) return;
            await db.update(claims).set({
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              documentProcessingStatus: "pending",
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++;
      }
    }

    // ── CASE 7: assessment_in_progress + any dps + >30 min (hard wall-clock guard) ──────────
    // Hard wall-clock guard. Claims stuck >30 min are reset to failed.
    // IMPORTANT: This case does NOT auto-re-trigger. The claim must be manually re-queued
    // via the "Reset if Stuck" button in the UI. This prevents infinite loops where
    // CASE 7 resets to intake_pending and CASE 4 immediately re-triggers it.
    const hardWallClock = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, documentProcessingStatus: claims.documentProcessingStatus })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_in_progress"),
            eq(claims.aiAssessmentCompleted, 0),
            // Use aiAssessmentStartedAt if available, otherwise fall back to updatedAt.
            // This prevents onStageStart updatedAt refreshes from resetting the clock.
            sql`COALESCE(${claims.aiAssessmentStartedAt}, ${claims.updatedAt}) < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-7 query');

    if (hardWallClock.length > 0) {
      console.log(
        `[StuckRecovery] CASE 7: Found ${hardWallClock.length} claim(s) stuck in assessment_in_progress ` +
        `for >30 minutes — hard reset to failed (manual re-trigger required)`
      );
      for (const claim of hardWallClock) {
        try {
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              status: "intake_pending",
              workflowState: "intake_queue",
              // Use 'failed' so it surfaces in the UI as needing attention
              // but set aiAssessmentTriggered=0 so CASE 4 does NOT re-trigger it
              documentProcessingStatus: "failed",
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery case-7 reset claim ${claim.id}`);
          console.log(
            `[StuckRecovery] CASE 7: Hard-reset claim ${claim.claimNumber} (id=${claim.id}) ` +
            `[stuck >30min in ${claim.documentProcessingStatus}] → intake_pending/failed. Manual re-trigger required.`
          );
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to hard-reset claim ${claim.id}:`, err);
        }
      }
    }

    // ── CASE 8: status='submitted' OR workflowState='created', >2 hours, no ai_assessment_triggered ──
    // Claims that were submitted but never picked up by the intake pipeline.
    const stuckSubmitted = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, status: claims.status })
        .from(claims)
        .where(
          and(
            inArray(claims.status, ["submitted"] as any[]),
            eq(claims.aiAssessmentTriggered, 0),
            olderThanMinutes(claims.createdAt, 120)
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-8 query');

    if (stuckSubmitted.length > 0) {
      console.log(
        `[StuckRecovery] CASE 8: Found ${stuckSubmitted.length} claim(s) stuck in 'submitted' ` +
        `for >2 hours without AI pipeline trigger — re-triggering`
      );
      for (const claim of stuckSubmitted) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case8',
          async () => {
            const db = await getDb();
            if (!db) return;
            await db.update(claims).set({
              status: "assessment_in_progress",
              workflowState: "under_assessment",
              documentProcessingStatus: "pending",
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++;
      }
    }

    // ── CASE 9: status='assessment_complete' + dps still in a transient/active state ──────────
    // The pipeline completed and set status='assessment_complete', but documentProcessingStatus
    // was never updated to 'extracted' (e.g. partial MySQL write on truncation, or the stuck-
    // recovery Case 3 set status without updating dps). The UI checks dps='parsing' to show
    // the spinner — so these claims show "Re-running KINGA analysis..." even though the report
    // is ready. Fix: set dps='extracted' and clear pipelineCurrentStage. No re-trigger needed.
    const completedWithStaleDps = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, documentProcessingStatus: claims.documentProcessingStatus })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_complete"),
            inArray(claims.documentProcessingStatus, ["parsing", "processing", "extracting", "analysing", "pending"])
          )
        )
        .limit(50);
    }, 3, 2000, 'StuckRecovery case-9 query');

    if (completedWithStaleDps.length > 0) {
      console.log(
        `[StuckRecovery] CASE 9: Found ${completedWithStaleDps.length} claim(s) in assessment_complete ` +
        `with stale documentProcessingStatus — fixing dps to 'extracted'`
      );
      for (const claim of completedWithStaleDps) {
        try {
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              documentProcessingStatus: "extracted",
              pipelineCurrentStage: null,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery case-9 fix claim ${claim.id}`);
          console.log(
            `[StuckRecovery] CASE 9: Fixed claim ${claim.claimNumber} (id=${claim.id}) ` +
            `dps '${claim.documentProcessingStatus}' → 'extracted' (report was already ready)`
          );
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] CASE 9: Failed to fix claim ${claim.id}:`, err);
        }
      }
    }

    if (totalFixed === 0) {
      console.log("[StuckRecovery] No stuck claims found.");
    } else {
      console.log(`[StuckRecovery] Recovery complete — fixed ${totalFixed} claim(s).`);
    }
  } catch (err) {
    console.error("[StuckRecovery] Job failed:", err);
  }
}

/**
 * Start the stuck assessment recovery background job.
 * Runs every 10 minutes, with an immediate run on startup.
 * Also runs a one-time startup cleanup to reset orphaned pipeline claims.
 */
export function startStuckAssessmentRecoveryJob(): void {
  console.log("[StuckRecovery] Initializing stuck assessment recovery job (every 10 minutes)...");
  // Run startup cleanup FIRST to reset any orphaned claims from previous server run
  runStartupCleanup().then(() => {
    // Then run the full recovery job immediately
    return runStuckAssessmentRecoveryJob();
  }).catch(err => {
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
