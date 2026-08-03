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
 *   CASE 7 — ANY pipeline-running status, any dps, >30 min
 *     Hard wall-clock guard. Any claim in a pipeline-running status
 *     (assessment_in_progress, analysis_running, document_validating, document_ready,
 *     analysis_running, recovery_attempted) for more than 30 minutes without completing
 *     is fundamentally stuck. Reset to document_failed so Case 11 can auto-retry it.
 *     Action: Reset to document_failed. Case 11 will auto-retry after 5 min.
 *
 *   CASE 11 — document_failed + sourceDocumentId IS NOT NULL + >5 min
 *     Claims that reached document_failed because the watchdog fired (server restart killed
 *     the setImmediate trigger) or a transient error occurred during pipeline startup.
 *     These claims have a source document and CAN be re-processed.
 *     Action: Reset to intake_pending and re-trigger. Auto-retry up to MAX_RECOVERY_RETRIES.
 *
  *   CASE 12 — intake_pending + ai_assessment_triggered=1 + aiAssessmentCompleted=0 + sourceDocumentId IS NOT NULL + >3 min
 *     Recovery for the 'upload and disappear' bug — but ONLY for claims that were explicitly
 *     routed to KINGA AI assessment (aiAssessmentTriggered=1).
 *     The setImmediate trigger was lost (server restart, tsx watch reload, or in-process crash).
 *     Claims with aiAssessmentTriggered=0 have NOT been approved for KINGA processing — the
 *     claims processor may be routing them to a human assessor or waiting for documentation.
 *     Action: Fire the pipeline immediately. No pre-reset needed.
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
import { claims, ingestionDocuments } from "../drizzle/schema";
import { eq, and, or, notInArray, inArray, sql, lt, isNotNull } from "drizzle-orm";

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

    // ── Part A: Reset orphaned pipeline claims (active transient states) ──────────────────
    // Any claim still in extracting/analysing/parsing from a previous server run is dead.
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
    if (orphaned.length > 0) {
      console.log(`[StartupCleanup] Found ${orphaned.length} orphaned claim(s) in active transient state — resetting to pending.`);
      for (const claim of orphaned) {
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
    } else {
      console.log("[StartupCleanup] No orphaned pipeline claims found.");
    }

    // ── Part B: Recover intake_pending claims whose setImmediate was lost on restart ────────
    // On every server start, find intake_pending claims that were EXPLICITLY routed to KINGA
    // (aiAssessmentTriggered=1) but whose pipeline trigger was lost (server restart, tsx watch
    // reload, or in-process crash before the trigger fired).
    //
    // CRITICAL GUARD — aiAssessmentTriggered=1 is REQUIRED:
    // Claims with aiAssessmentTriggered=0 have NOT been approved for KINGA processing.
    // The claims processor may be:
    //   - Routing to a human assessor instead
    //   - Waiting for additional documentation (police report, medical cert, etc.)
    //   - Holding for dispute / legal review
    // We must NOT auto-run KINGA on those claims — doing so overrides the processor's
    // deliberate routing decision and violates the platform governance principle that
    // the system must not act on claims without explicit approval.
    const untriggered = await db
      .select({ id: claims.id, claimNumber: claims.claimNumber })
      .from(claims)
      .innerJoin(ingestionDocuments, eq(claims.sourceDocumentId, ingestionDocuments.id))
      .where(
        and(
          eq(claims.status, "intake_pending" as any),
          eq(claims.aiAssessmentTriggered, 1),
          eq(claims.aiAssessmentCompleted, 0),
          isNotNull(ingestionDocuments.s3Url)
        )
      )
      .limit(20);
    if (untriggered.length > 0) {
      console.log(`[StartupCleanup] Found ${untriggered.length} intake_pending claim(s) with untriggered pipeline — firing now.`);
      for (const claim of untriggered) {
        const ok = await canRetrigger(claim.id);
        if (!ok) {
          console.warn(`[StartupCleanup] Claim ${claim.claimNumber} (id=${claim.id}) has reached max retries — routing to document_failed.`);
          await db.update(claims).set({
            status: "document_failed" as any,
            documentProcessingStatus: "DOCUMENT_FAILED",
            workflowState: "intake_queue",
            aiAssessmentTriggered: 0,
            updatedAt: new Date().toISOString() as any,
          }).where(eq(claims.id, claim.id));
          continue;
        }
        // Fire-and-forget: trigger the pipeline immediately on startup
        // Use a short stagger (500ms per claim) to avoid thundering herd on restart
        const staggerMs = untriggered.indexOf(claim) * 500;
        setTimeout(() => {
          triggerAiAssessment(claim.id).catch((err: unknown) => {
            console.error(`[StartupCleanup] Pipeline trigger failed for claim ${claim.id}:`, err);
          });
        }, staggerMs);
        console.log(`[StartupCleanup] Queued pipeline trigger for intake_pending claim ${claim.claimNumber} (id=${claim.id}) in ${staggerMs}ms`);
      }
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
              status: "analysis_complete",
              documentProcessingStatus: "ANALYSIS_COMPLETE",
              // Reset retry counter on successful completion
              recoveryRetryCount: 0,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery finalise claim ${claim.id}`);
          console.log(`[StuckRecovery] Finalised claim ${claim.claimNumber} (id=${claim.id}) → analysis_complete [DRA: pipeline had completed]`);
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

        // ── CASE 7: ANY pipeline-running status + >30 min (hard wall-clock guard) ──────────
    // Covers ALL pipeline-running statuses: assessment_in_progress, analysis_running,
    // document_validating, document_ready, recovery_attempted.
    // Claims stuck >30 min are reset to document_failed so Case 11 auto-retries them.
    const PIPELINE_RUNNING_STATUSES = [
      "assessment_in_progress",
      "analysis_running",
      "document_validating",
      "document_ready",
      "recovery_attempted",
    ] as const;
    const hardWallClock = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, status: claims.status, documentProcessingStatus: claims.documentProcessingStatus, sourceDocumentId: claims.sourceDocumentId })
        .from(claims)
        .where(
          and(
            inArray(claims.status, PIPELINE_RUNNING_STATUSES as unknown as string[]),
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
        `[StuckRecovery] CASE 7: Found ${hardWallClock.length} claim(s) stuck in a pipeline-running status ` +
        `for >30 minutes — resetting to document_failed for Case 11 auto-retry`
      );
      for (const claim of hardWallClock) {
        try {
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              // Reset to document_failed so Case 11 picks it up and auto-retries
              // (Case 11 checks sourceDocumentId IS NOT NULL, so claims without a
              // source doc will stay in document_failed and require manual action)
              status: "document_failed" as any,
              workflowState: "intake_queue",
              documentProcessingStatus: "DOCUMENT_FAILED",
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery case-7 reset claim ${claim.id}`);
          const hasDoc = claim.sourceDocumentId ? '(has source doc — Case 11 will auto-retry)' : '(no source doc — manual re-trigger required)';
          console.log(
            `[StuckRecovery] CASE 7: Hard-reset claim ${claim.claimNumber} (id=${claim.id}) ` +
            `[stuck >30min in ${claim.status}/${claim.documentProcessingStatus}] → document_failed ${hasDoc}`
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

    // ── CASE 9: status in success terminal + dps still in a transient/active state ──────────
    // DRA Phase 2: The pipeline completed and set status='assessment_complete' or
    // 'analysis_complete', but documentProcessingStatus was never updated to a terminal
    // state. The UI checks dps to show the spinner — fix dps to ANALYSIS_COMPLETE.
    const completedWithStaleDps = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, documentProcessingStatus: claims.documentProcessingStatus })
        .from(claims)
        .where(
          and(
            inArray(claims.status as any, ["assessment_complete", "analysis_complete"]),
            inArray(claims.documentProcessingStatus, ["parsing", "processing", "extracting", "analysing", "pending", "DOCUMENT_VALIDATING", "DOCUMENT_READY", "ANALYSIS_RUNNING", "RECOVERY_ATTEMPTED"])
          )
        )
        .limit(50);
    }, 3, 2000, 'StuckRecovery case-9 query');

    if (completedWithStaleDps.length > 0) {
      console.log(
        `[StuckRecovery] CASE 9: Found ${completedWithStaleDps.length} claim(s) in success terminal ` +
        `with stale documentProcessingStatus — fixing dps to ANALYSIS_COMPLETE`
      );
      for (const claim of completedWithStaleDps) {
        try {
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              documentProcessingStatus: "ANALYSIS_COMPLETE",
              pipelineCurrentStage: null,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery case-9 fix claim ${claim.id}`);
          console.log(
            `[StuckRecovery] CASE 9: Fixed claim ${claim.claimNumber} (id=${claim.id}) ` +
            `dps '${claim.documentProcessingStatus}' → 'ANALYSIS_COMPLETE' (report was already ready)`
          );
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] CASE 9: Failed to fix claim ${claim.id}:`, err);
        }
      }
    }

    // ── CASE 10: assessment_pending + aiAssessmentTriggered=1 + aiAssessmentCompleted=0 + >30 min ──
    // A claim in assessment_pending with aiAssessmentTriggered=1 means the claims processor
    // explicitly chose KINGA AI assessment, but the pipeline start step failed silently
    // (e.g. server crash between setting the flag and calling triggerAiAssessment).
    //
    // CRITICAL GUARD — aiAssessmentTriggered=1 is REQUIRED:
    // A claim in assessment_pending WITHOUT this flag was intentionally placed there by the
    // claims processor and has NOT been routed to KINGA. They may be:
    //   - Assigning it to a human assessor instead
    //   - Waiting for additional documentation (police report, medical cert, etc.)
    //   - Holding it for dispute / legal review
    // We must NOT auto-run KINGA on those claims — doing so would override the processor's
    // deliberate routing decision.
    const stuckAssessmentPending = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, status: claims.status })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_pending" as any),
            eq(claims.aiAssessmentTriggered, 1),
            eq(claims.aiAssessmentCompleted, 0),
            olderThanMinutes(claims.updatedAt, 30)
          )
        )
        .limit(20);
    }, 3, 2000, 'StuckRecovery case-10 query');

    if (stuckAssessmentPending.length > 0) {
      console.log(
        `[StuckRecovery] CASE 10: Found ${stuckAssessmentPending.length} claim(s) stuck in 'assessment_pending' ` +
        `for >30 minutes — re-triggering AI pipeline`
      );
      for (const claim of stuckAssessmentPending) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case10',
          async () => {
            const db = await getDb();
            if (!db) return;
            // Reset to intake_pending so the standard pipeline trigger path picks it up
            await db.update(claims).set({
              status: "intake_pending" as any,
              workflowState: "intake_queue",
              documentProcessingStatus: "pending",
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++;
        console.log(
          `[StuckRecovery] CASE 10: Reset claim ${claim.claimNumber} (id=${claim.id}) ` +
          `from assessment_pending → intake_pending for AI pipeline re-trigger`
        );
      }
    }

    // ── CASE 11: status='document_failed' + sourceDocumentId IS NOT NULL + >5 min ──────────────────────
    // Claims that reached document_failed because:
    //   a) The watchdog timer fired (server restart killed the setImmediate trigger)
    //   b) A transient error occurred during pipeline startup
    // These claims have a source document (PDF/photos) and CAN be re-processed.
    // Auto-retry once; after MAX_RECOVERY_RETRIES, leave as document_failed for manual action.
    const stuckDocumentFailed = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber })
        .from(claims)
        .innerJoin(ingestionDocuments, eq(claims.sourceDocumentId, ingestionDocuments.id))
        .where(
          and(
            eq(claims.status, "document_failed" as any),
            eq(claims.aiAssessmentCompleted, 0),
            isNotNull(ingestionDocuments.s3Url),
            olderThanMinutes(claims.updatedAt, 5)
          )
        )
        .limit(10);
    }, 3, 2000, 'StuckRecovery case-11 query');
    if (stuckDocumentFailed.length > 0) {
      console.log(
        `[StuckRecovery] CASE 11: Found ${stuckDocumentFailed.length} claim(s) in 'document_failed' ` +
        `with source document — auto-retrying pipeline`
      );
      for (const claim of stuckDocumentFailed) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case11',
          async () => {
            const db = await getDb();
            if (!db) return;
            // Reset to intake_pending so the standard pipeline trigger path picks it up
            await db.update(claims).set({
              status: "intake_pending" as any,
              workflowState: "intake_queue",
              documentProcessingStatus: "pending",
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              updatedAt: new Date().toISOString() as any,
            }).where(eq(claims.id, claim.id));
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++;
        console.log(
          `[StuckRecovery] CASE 11: Reset claim ${claim.claimNumber} (id=${claim.id}) ` +
          `from document_failed → intake_pending for AI pipeline re-trigger`
        );
      }
    }

    // ── CASE 12: status='intake_pending' + ai_assessment_triggered=1 + aiAssessmentCompleted=0 + sourceDocumentId IS NOT NULL + >3 min ──
    // Recovery for the 'upload and disappear' bug — ONLY for claims explicitly routed to KINGA.
    // These are claims where aiAssessmentTriggered was set to 1 (KINGA was chosen) but the
    // setImmediate pipeline trigger was lost (server restart, tsx watch reload, in-process crash).
    //
    // CRITICAL GUARD — aiAssessmentTriggered=1 is REQUIRED:
    // Claims with aiAssessmentTriggered=0 have NOT been approved for KINGA processing.
    // The claims processor may be routing them to a human assessor, waiting for additional
    // documentation, or holding for legal review. The system must NOT auto-trigger KINGA
    // on those claims — doing so overrides the processor's deliberate routing decision.
    const untriggeredIntakePending = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber })
        .from(claims)
        .innerJoin(ingestionDocuments, eq(claims.sourceDocumentId, ingestionDocuments.id))
        .where(
          and(
            eq(claims.status, "intake_pending" as any),
            eq(claims.aiAssessmentTriggered, 1),
            eq(claims.aiAssessmentCompleted, 0),
            isNotNull(ingestionDocuments.s3Url),
            olderThanMinutes(claims.updatedAt, 3)
          )
        )
        .limit(10);
    }, 3, 2000, 'StuckRecovery case-12 query');
    if (untriggeredIntakePending.length > 0) {
      console.log(
        `[StuckRecovery] CASE 12: Found ${untriggeredIntakePending.length} intake_pending claim(s) ` +
        `with source document but no trigger — firing pipeline now`
      );
      for (const claim of untriggeredIntakePending) {
        const triggered = await retriggerWithTracking(
          claim.id, claim.claimNumber, 'Case12',
          async () => {
            // No pre-reset needed — claim is already in intake_pending with triggered=1
            // Just increment the retry counter and fire the lost trigger
          }
        );
        if (triggered) totalFixed++;
        else totalFixed++;
        console.log(
          `[StuckRecovery] CASE 12: Triggered pipeline for intake_pending claim ` +
          `${claim.claimNumber} (id=${claim.id}) — KINGA was approved but trigger was lost on previous server start`
        );
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
