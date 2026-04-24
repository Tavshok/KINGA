/**
 * Photo Re-Extraction Worker
 *
 * Triggered when a scanned PDF has low photo sharpness (blurScore < 60).
 * Runs only the photo extraction (high-DPI) and Stage 6 damage re-analysis
 * without re-running the full pipeline.
 *
 * Job lifecycle:
 *   pending → running → completed | failed
 *
 * Results are stored in the photoReextractionJobs table and the
 * aiAssessments row is updated with the new damagePhotosJson and
 * damageDescription if the re-extraction produces better photos.
 */

import { getRawPool } from "./db";
import { extractImagesWithSummary } from "./pdf-image-extractor";
import { runDamageAnalysisStage } from "./pipeline-v2/stage-6-damage-analysis";

const HIGH_DPI = 300;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ReextractionResult {
  jobId: number;
  status: "completed" | "failed";
  photosExtracted: number;
  renderDpi: number;
  isScannedPdf: boolean;
  avgSharpness: number;
  damageDescription?: string;
  newPhotoUrls?: string[];
  error?: string;
  durationMs: number;
}

// ─── Worker ───────────────────────────────────────────────────────────────────
export async function runPhotoReextraction(jobId: number): Promise<ReextractionResult> {
  const start = Date.now();
  const pool = await getRawPool();

  if (!pool) {
    return { jobId, status: "failed", photosExtracted: 0, renderDpi: HIGH_DPI, isScannedPdf: false, avgSharpness: 0, error: "Database not available", durationMs: Date.now() - start };
  }

  // 1. Load the job record
  const [jobRows] = await pool.execute(`SELECT * FROM photo_reextraction_jobs WHERE id = ? LIMIT 1`, [jobId]);
  const jobs = jobRows as any[];

  if (jobs.length === 0) {
    return { jobId, status: "failed", photosExtracted: 0, renderDpi: 0, isScannedPdf: false, avgSharpness: 0, error: "Job not found", durationMs: Date.now() - start };
  }

  const job = jobs[0];

  // Mark as running
  await pool.execute(`UPDATE photo_reextraction_jobs SET status = 'running', started_at = NOW() WHERE id = ?`, [jobId]);

  try {
    const assessmentId = job.assessment_id as number;
    const pdfUrl = job.pdf_url as string;
    const claimId = job.claim_id as number;

    if (!pdfUrl) {
      throw new Error("No PDF URL available for re-extraction");
    }

    console.log(`🔄 [ReExtract] Job ${jobId}: Starting high-DPI (${HIGH_DPI}) re-extraction for assessment ${assessmentId}`);

    // 2. Download the PDF
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let pdfBuffer: Buffer;
    try {
      const response = await fetch(pdfUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`PDF download failed: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }

    // 3. Re-extract at 300 DPI
    const filename = pdfUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
    const summary = await extractImagesWithSummary(pdfBuffer, filename, { forceDpi: HIGH_DPI });

    console.log(
      `📸 [ReExtract] Job ${jobId}: Extracted ${summary.images.length} image(s) ` +
      `at ${summary.renderDpi} DPI (was scanned: ${summary.isScannedPdf})`
    );

    const newPhotoUrls = summary.images.map(img => img.url);
    const avgSharpness = summary.images.length > 0
      ? Math.round(summary.images.reduce((sum, img) => sum + (img.quality.blurScore ?? 0), 0) / summary.images.length)
      : 0;

    // 4. Load the existing assessment to get the claimRecord for Stage 6
    const [assessRows] = await pool.execute(`SELECT claim_record_json, tenant_id FROM ai_assessments WHERE id = ? LIMIT 1`, [assessmentId]);
    const assessments = assessRows as any[];

    if (assessments.length === 0) {
      throw new Error(`Assessment ${assessmentId} not found`);
    }

    const assessment = assessments[0];
    let damageDescription: string | undefined;

    // 5. Re-run Stage 6 damage analysis with the new high-DPI photos
    if (newPhotoUrls.length > 0 && assessment.claim_record_json) {
      try {
        const claimRecord = JSON.parse(assessment.claim_record_json as string);

        const logs: string[] = [];
        const ctx: any = {
          claimId,
          tenantId: assessment.tenant_id ? parseInt(assessment.tenant_id as string, 10) : null,
          assessmentId,
          claim: {},
          pdfUrl,
          damagePhotoUrls: newPhotoUrls,
          log: (stage: string, msg: string) => {
            const entry = `[${stage}] ${msg}`;
            logs.push(entry);
            console.log(`  ${entry}`);
          },
        };

        const stage6Result = await runDamageAnalysisStage(ctx, claimRecord);

        if (stage6Result.data) {
          // Stage6Output has overallSeverityScore (number) not overallSeverity (string).
          // Build a human-readable description from the score.
          const score = stage6Result.data.overallSeverityScore;
          const severityLabel =
            score >= 80 ? "critical" :
            score >= 60 ? "severe" :
            score >= 40 ? "moderate" :
            score >= 20 ? "minor" :
            "cosmetic";
          damageDescription = `Overall severity: ${severityLabel} (score: ${score})`;
          console.log(`✅ [ReExtract] Job ${jobId}: Stage 6 re-analysis complete. Severity score: ${score}`);
        }
      } catch (stage6Err: any) {
        console.warn(`⚠️  [ReExtract] Job ${jobId}: Stage 6 re-analysis failed (non-fatal): ${stage6Err.message}`);
      }
    }

    // 6. Update the assessment with the new photo URLs
    if (damageDescription) {
      await pool.execute(
        `UPDATE ai_assessments SET damage_photos_json = ?, image_analysis_total_count = ?, image_analysis_success_count = ?, image_analysis_success_rate = ?, damage_description = ? WHERE id = ?`,
        [JSON.stringify(newPhotoUrls), newPhotoUrls.length, newPhotoUrls.length, newPhotoUrls.length > 0 ? 100 : 0, damageDescription, assessmentId]
      );
    } else {
      await pool.execute(
        `UPDATE ai_assessments SET damage_photos_json = ?, image_analysis_total_count = ?, image_analysis_success_count = ?, image_analysis_success_rate = ? WHERE id = ?`,
        [JSON.stringify(newPhotoUrls), newPhotoUrls.length, newPhotoUrls.length, newPhotoUrls.length > 0 ? 100 : 0, assessmentId]
      );
    }

    // 7. Mark job as completed
    const durationMs = Date.now() - start;
    const resultJson = JSON.stringify({
      newPhotoUrls,
      damageDescription,
      summary: {
        isScannedPdf: summary.isScannedPdf,
        renderDpi: summary.renderDpi,
        pageCount: summary.pageCount,
        blurryCount: summary.blurryCount,
        rejectedByDimension: summary.rejectedByDimension,
      },
    });
    await pool.execute(
      `UPDATE photo_reextraction_jobs SET status = 'completed', completed_at = NOW(), photos_extracted = ?, render_dpi = ?, avg_sharpness = ?, result_json = ?, duration_ms = ? WHERE id = ?`,
      [newPhotoUrls.length, summary.renderDpi, avgSharpness, resultJson, durationMs, jobId]
    );

    console.log(`✅ [ReExtract] Job ${jobId}: Completed in ${durationMs}ms. ${newPhotoUrls.length} photos, avg sharpness ${avgSharpness}`);

    return {
      jobId,
      status: "completed",
      photosExtracted: newPhotoUrls.length,
      renderDpi: summary.renderDpi,
      isScannedPdf: summary.isScannedPdf,
      avgSharpness,
      damageDescription,
      newPhotoUrls,
      durationMs,
    };

  } catch (error: any) {
    const durationMs = Date.now() - start;
    const errorMsg = error.message || "Unknown error";
    console.error(`❌ [ReExtract] Job ${jobId}: Failed — ${errorMsg}`);

    try {
      await pool.execute(
        `UPDATE photo_reextraction_jobs SET status = 'failed', completed_at = NOW(), error_message = ?, duration_ms = ? WHERE id = ?`,
        [errorMsg, durationMs, jobId]
      );
    } catch (_) { /* best-effort */ }

    return {
      jobId,
      status: "failed",
      photosExtracted: 0,
      renderDpi: HIGH_DPI,
      isScannedPdf: false,
      avgSharpness: 0,
      error: errorMsg,
      durationMs,
    };
  }
}
