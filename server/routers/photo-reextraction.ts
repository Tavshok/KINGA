/**
 * Photo Re-Extraction Router
 *
 * Exposes three procedures:
 *   - photoReextraction.trigger    — creates a job and starts the worker
 *   - photoReextraction.getStatus  — polls job status and result
 *   - photoReextraction.getLatest  — fetches the most recent job for an assessment
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { photoReextractionJobs, aiAssessments, claimDocuments } from "../../drizzle/schema";
import { runPhotoReextraction } from "../photo-reextraction-worker";

export const photoReextractionRouter = router({
  /**
   * Trigger a high-DPI photo re-extraction for an assessment.
   * Looks up the PDF URL from the claim's source documents,
   * creates a job record, and starts the worker asynchronously.
   */
  trigger: protectedProcedure
    .input(z.object({
      assessmentId: z.number().int().positive(),
      claimId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const db = await getDb();

      // Check if there's already a running or pending job for this assessment
      const [existingRows] = await db.execute(
        `SELECT id, status FROM photo_reextraction_jobs WHERE assessment_id = ? AND status IN ('pending','running') LIMIT 1`,
        [input.assessmentId]
      );
      const existingJobs = existingRows as any[];
      if (existingJobs.length > 0) {
        return { jobId: existingJobs[0].id as number, status: existingJobs[0].status as string, alreadyRunning: true };
      }

      // Verify the assessment exists
      const [assessRows] = await db.execute(
        `SELECT id FROM ai_assessments WHERE id = ? LIMIT 1`,
        [input.assessmentId]
      );
      if ((assessRows as any[]).length === 0) {
        throw new Error(`Assessment ${input.assessmentId} not found`);
      }

      // Get the PDF URL from the claim's source documents
      const [docRows] = await db.execute(
        `SELECT document_url, document_category FROM claim_documents WHERE claim_id = ? LIMIT 10`,
        [input.claimId]
      );
      const docs = docRows as any[];

      // Prefer claim_form documents; fall back to any document with a URL
      const pdfDoc = docs.find((d: any) => d.document_category === "claim_form" || d.document_category === "other")
        ?? docs.find((d: any) => d.document_url);

      if (!pdfDoc?.document_url) {
        throw new Error("No PDF document found for this claim");
      }

      // Create the job record
      const [insertResult] = await db.execute(
        `INSERT INTO photo_reextraction_jobs (assessment_id, claim_id, pdf_url, status, requested_dpi, created_at, triggered_by_user_id)
         VALUES (?, ?, ?, 'pending', 300, NOW(), ?)`,
        [input.assessmentId, input.claimId, pdfDoc.document_url, ctx.user.id]
      );
      const jobId = (insertResult as any).insertId as number;

      // Start the worker asynchronously (fire-and-forget)
      // The client polls getStatus to track progress
      runPhotoReextraction(jobId).catch((err: any) => {
        console.error(`[PhotoReextraction] Worker failed for job ${jobId}: ${err.message}`);
      });

      return { jobId, status: "pending" as const, alreadyRunning: false };
    }),

  /**
   * Poll the status of a re-extraction job.
   * Returns the current status, progress info, and result when complete.
   */
  getStatus: protectedProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT * FROM photo_reextraction_jobs WHERE id = ? LIMIT 1`,
        [input.jobId]
      );
      const jobs = rows as any[];

      if (jobs.length === 0) {
        throw new Error(`Job ${input.jobId} not found`);
      }

      const job = jobs[0];
      let result: any = null;

      if (job.status === "completed" && job.result_json) {
        try {
          result = JSON.parse(job.result_json as string);
        } catch (_) {}
      }

      return {
        jobId: job.id as number,
        status: job.status as string,
        requestedDpi: job.requested_dpi as number,
        photosExtracted: job.photos_extracted as number | null,
        renderDpi: job.render_dpi as number | null,
        avgSharpness: job.avg_sharpness as number | null,
        errorMessage: job.error_message as string | null,
        createdAt: job.created_at as string,
        startedAt: job.started_at as string | null,
        completedAt: job.completed_at as string | null,
        durationMs: job.duration_ms as number | null,
        result,
      };
    }),

  /**
   * Get the most recent re-extraction job for an assessment.
   * Used to show the last re-extraction result in the report panel.
   */
  getLatest: protectedProcedure
    .input(z.object({
      assessmentId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT * FROM photo_reextraction_jobs WHERE assessment_id = ? ORDER BY id DESC LIMIT 1`,
        [input.assessmentId]
      );
      const jobs = rows as any[];

      if (jobs.length === 0) return null;

      const latest = jobs[0];
      let result: any = null;
      if (latest.status === "completed" && latest.result_json) {
        try { result = JSON.parse(latest.result_json as string); } catch (_) {}
      }

      return {
        jobId: latest.id as number,
        status: latest.status as string,
        requestedDpi: latest.requested_dpi as number,
        photosExtracted: latest.photos_extracted as number | null,
        renderDpi: latest.render_dpi as number | null,
        avgSharpness: latest.avg_sharpness as number | null,
        errorMessage: latest.error_message as string | null,
        createdAt: latest.created_at as string,
        completedAt: latest.completed_at as string | null,
        durationMs: latest.duration_ms as number | null,
        result,
      };
    }),
});
