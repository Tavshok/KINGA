/**
 * extraction-retry-queue.ts
 *
 * Background job that automatically re-triggers the AI pipeline for claims
 * with documentProcessingStatus = 'extraction_failed' and extractionRetryCount < 3.
 *
 * RETRY SCHEDULE (exponential backoff):
 *   Attempt 1: 60 seconds after failure
 *   Attempt 2: 120 seconds after attempt 1
 *   Attempt 3: 240 seconds after attempt 2
 *
 * After 3 failed attempts, the claim is marked as 'extraction_permanently_failed'
 * and requires manual intervention.
 *
 * The job runs every 30 seconds to check for eligible claims.
 */
// @ts-nocheck
import { getDb } from "./db";
import { claims } from "../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { triggerAiAssessment } from "./db";

const RETRY_INTERVAL_MS = 30_000; // check every 30 seconds
const MAX_RETRIES = 3;
// Backoff delays per attempt (in seconds)
const BACKOFF_DELAYS_SECONDS = [60, 120, 240];

let isRunning = false;

async function processRetryQueue(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const now = Date.now();

    // Find claims eligible for retry:
    // - documentProcessingStatus = 'extraction_failed'
    // - extractionRetryCount < MAX_RETRIES
    // - extractionFailedAt is old enough (backoff delay has passed)
    const db = await getDb();
    const eligibleClaims = await db
      .select({
        id: claims.id,
        extractionRetryCount: claims.extractionRetryCount,
        extractionFailedAt: claims.extractionFailedAt,
      })
      .from(claims)
      .where(
        and(
          eq(claims.documentProcessingStatus, "extraction_failed"),
          lt(claims.extractionRetryCount, MAX_RETRIES)
        )
      );

    for (const claim of eligibleClaims) {
      const retryCount = claim.extractionRetryCount ?? 0;
      const failedAt = claim.extractionFailedAt ? new Date(claim.extractionFailedAt).getTime() : 0;
      const backoffDelayMs = (BACKOFF_DELAYS_SECONDS[retryCount] ?? 240) * 1000;
      const nextRetryAt = failedAt + backoffDelayMs;

      if (now < nextRetryAt) {
        // Not yet time to retry this claim
        continue;
      }

      console.log(
        `[ExtractionRetryQueue] Retrying claim ${claim.id} ` +
        `(attempt ${retryCount + 1}/${MAX_RETRIES}, ` +
        `backoff: ${BACKOFF_DELAYS_SECONDS[retryCount]}s)`
      );

      try {
        // Reset status to allow the pipeline to run
        const dbForUpdate = await getDb();
        await dbForUpdate
          .update(claims)
          .set({ documentProcessingStatus: "extraction_retry_in_progress" })
          .where(eq(claims.id, claim.id));

        // Re-trigger the pipeline
        await triggerAiAssessment(claim.id);

        console.log(`[ExtractionRetryQueue] Claim ${claim.id} re-triggered successfully`);
      } catch (err) {
        console.error(`[ExtractionRetryQueue] Failed to retry claim ${claim.id}:`, err);

        // If we've exhausted all retries, mark as permanently failed
        const newRetryCount = retryCount + 1;
        const dbForError = await getDb();
        if (newRetryCount >= MAX_RETRIES) {
          await dbForError
            .update(claims)
            .set({
              documentProcessingStatus: "extraction_permanently_failed",
              extractionRetryCount: newRetryCount,
              extractionFailedAt: new Date().toISOString(),
            })
            .where(eq(claims.id, claim.id));
          console.error(
            `[ExtractionRetryQueue] Claim ${claim.id} permanently failed after ${MAX_RETRIES} attempts. Manual intervention required.`
          );
        } else {
          // Increment retry count and reset to extraction_failed for next attempt
          await dbForError
            .update(claims)
            .set({
              documentProcessingStatus: "extraction_failed",
              extractionRetryCount: newRetryCount,
              extractionFailedAt: new Date().toISOString(),
            })
            .where(eq(claims.id, claim.id));
        }
      }
    }
  } catch (err) {
    console.error("[ExtractionRetryQueue] Queue processing error:", err);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the extraction retry queue background job.
 * Runs every 30 seconds to check for claims that need to be retried.
 */
export function startExtractionRetryQueue(): void {
  console.log("[ExtractionRetryQueue] Starting extraction retry queue (interval: 30s)");
  // Run immediately on startup, then on interval
  processRetryQueue().catch(console.error);
  setInterval(() => {
    processRetryQueue().catch(console.error);
  }, RETRY_INTERVAL_MS);
}
