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
 */

import { getDb, withDbRetry, triggerAiAssessment } from "./db";
import { claims } from "../drizzle/schema";
import { eq, and, lt, ne, or } from "drizzle-orm";

const FIVE_MINUTES_MS   =  5 * 60 * 1000;
const TEN_MINUTES_MS    = 10 * 60 * 1000;
const TWENTY_MINUTES_MS = 20 * 60 * 1000;

export async function runStuckAssessmentRecoveryJob(): Promise<void> {
  const now = new Date();
  const fiveMinutesAgo    = new Date(now.getTime() - FIVE_MINUTES_MS).toISOString();
  const tenMinutesAgo     = new Date(now.getTime() - TEN_MINUTES_MS).toISOString();
  const twentyMinutesAgo  = new Date(now.getTime() - TWENTY_MINUTES_MS).toISOString();

  let totalFixed = 0;

  try {
    // ── CASE 3 & 5A: assessment_in_progress + ai_assessment_completed=1 ──────
    // Pipeline completed and wrote the assessment record, but the final
    // claims.status update to 'assessment_complete' failed silently.
    // Direct fix: set status='assessment_complete' without re-running the pipeline.
    const completedButNotFinalised = await withDbRetry(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ id: claims.id, claimNumber: claims.claimNumber, documentProcessingStatus: claims.documentProcessingStatus })
        .from(claims)
        .where(
          and(
            eq(claims.status, "assessment_in_progress"),
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
              updatedAt: new Date().toISOString(),
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery finalise claim ${claim.id}`);
          console.log(`[StuckRecovery] Finalised claim ${claim.claimNumber} (id=${claim.id}) → assessment_complete [pipeline had completed]`);
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to finalise claim ${claim.id}:`, err);
        }
      }
    }

    // ── CASE 5B: assessment_in_progress + triggered=1 + completed=0 + dps≠'parsing' + >10 min ──
    // Pipeline ran (dps was updated away from 'parsing') but never completed.
    // Re-trigger the pipeline.
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
            ne(claims.documentProcessingStatus, "parsing"),
            lt(claims.updatedAt, tenMinutesAgo)
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
        try {
          // Reset to allow re-trigger
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              documentProcessingStatus: "pending",
              updatedAt: new Date().toISOString(),
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery reset-for-retrigger claim ${claim.id}`);
          // Re-trigger the pipeline (fire-and-forget)
          triggerAiAssessment(claim.id).catch((err: unknown) => {
            console.error(`[StuckRecovery] Re-trigger failed for claim ${claim.id}:`, err);
          });
          console.log(`[StuckRecovery] Re-triggered claim ${claim.claimNumber} (id=${claim.id}) [ran but incomplete]`);
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to re-trigger claim ${claim.id}:`, err);
        }
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
            lt(claims.updatedAt, tenMinutesAgo)
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
        try {
          // Fire-and-forget pipeline trigger
          triggerAiAssessment(claim.id).catch((err: unknown) => {
            console.error(`[StuckRecovery] Re-trigger failed for claim ${claim.id}:`, err);
          });
          console.log(`[StuckRecovery] Re-triggered claim ${claim.claimNumber} (id=${claim.id}) [pipeline never started]`);
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to re-trigger claim ${claim.id}:`, err);
        }
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
            lt(claims.updatedAt, twentyMinutesAgo)
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
        try {
          // Reset flags to allow clean re-trigger
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              documentProcessingStatus: "pending",
              updatedAt: new Date().toISOString(),
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery timeout-reset claim ${claim.id}`);
          // Re-trigger the pipeline
          triggerAiAssessment(claim.id).catch((err: unknown) => {
            console.error(`[StuckRecovery] Re-trigger failed for claim ${claim.id}:`, err);
          });
          console.log(
            `[StuckRecovery] Re-triggered claim ${claim.claimNumber} (id=${claim.id}) ` +
            `[pipeline timed out after 20min]`
          );
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to re-trigger claim ${claim.id}:`, err);
        }
      }
    }

    // ── CASE 4: intake_pending + triggered=1 + dps='failed' + >5 min ─────────
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
            lt(claims.updatedAt, fiveMinutesAgo)
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
        try {
          // Reset to clean state before re-trigger
          await withDbRetry(async () => {
            const db = await getDb();
            if (!db) return;
            return db.update(claims).set({
              status: "assessment_in_progress",
              aiAssessmentTriggered: 0,
              aiAssessmentCompleted: 0,
              documentProcessingStatus: "pending",
              workflowState: "under_assessment",
              updatedAt: new Date().toISOString(),
            }).where(eq(claims.id, claim.id));
          }, 3, 2000, `StuckRecovery case-4 reset claim ${claim.id}`);
          // Re-trigger the pipeline
          triggerAiAssessment(claim.id).catch((err: unknown) => {
            console.error(`[StuckRecovery] Re-trigger failed for claim ${claim.id}:`, err);
          });
          console.log(`[StuckRecovery] Re-triggered claim ${claim.claimNumber} (id=${claim.id}) [crashed and reset]`);
          totalFixed++;
        } catch (err) {
          console.error(`[StuckRecovery] Failed to re-trigger claim ${claim.id}:`, err);
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
