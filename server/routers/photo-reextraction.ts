/**
 * Photo Re-Extraction Router
 *
 * Exposes four procedures:
 *   - photoReextraction.trigger           — creates a job and starts the worker
 *   - photoReextraction.getStatus         — polls job status and result
 *   - photoReextraction.getLatest         — fetches the most recent job for an assessment
 *   - photoReextraction.classifyPhotoUrls — C-09: LLM-classify S3 photo URLs to filter
 *                                            document/form images from the damage gallery
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { runPhotoReextraction } from "../photo-reextraction-worker";
import mysql from 'mysql2/promise';
import { invokeLLM } from "../_core/llm";
import { TRPCError } from "@trpc/server";

function requirePhotoReextractionTenant(ctx: { user?: { tenantId?: string | null } }) {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

async function requirePhotoAssessmentScope(db: any, tenantId: string, assessmentId: number, claimId?: number) {
  const [rows] = await db.execute(
    `SELECT a.id FROM ai_assessments a INNER JOIN claims c ON c.id = a.claim_id
     WHERE a.id = ? AND a.tenant_id = ? AND c.tenant_id = ?${claimId === undefined ? "" : " AND a.claim_id = ?"} LIMIT 1`,
    claimId === undefined ? [assessmentId, tenantId, tenantId] : [assessmentId, tenantId, tenantId, claimId],
  );
  if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found" });
}

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
      if (!db) throw new Error("Database unavailable");
      const tenantId = requirePhotoReextractionTenant(ctx);
      await requirePhotoAssessmentScope(db, tenantId, input.assessmentId, input.claimId);

      // Check if there's already a running or pending job for this assessment
      const [existingRows] = await (db as any).execute(
        `SELECT id, status FROM photo_reextraction_jobs WHERE assessment_id = ? AND status IN ('pending','running') LIMIT 1`,
        [input.assessmentId]
      );
      const existingJobs = existingRows as any[];
      if (existingJobs.length > 0) {
        return { jobId: existingJobs[0].id as number, status: existingJobs[0].status as string, alreadyRunning: true };
      }

      // Get the PDF URL from the claim's source documents
      const [docRows] = await (db as any).execute(
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
      const [insertResult] = await (db as any).execute(
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenantId = requirePhotoReextractionTenant(ctx);
      const [rows] = await (db as any).execute(
        `SELECT j.* FROM photo_reextraction_jobs j INNER JOIN claims c ON c.id = j.claim_id
         WHERE j.id = ? AND c.tenant_id = ? LIMIT 1`,
        [input.jobId, tenantId]
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
   * C-09: Classify an array of S3 photo URLs using the LLM image classifier.
   *
   * Returns a classification for each URL:
   *   - category: 'damage_photo' | 'vehicle_overview' | 'quotation_scan' | 'document_page' | 'other'
   *   - confidence: 0.0–1.0
   *   - reasoning: brief explanation
   *
   * The ForensicAuditReport uses this to filter document/form images out of the
   * damage photo gallery and show them in a separate "Excluded" section.
   *
   * Max 12 URLs per call. Results are returned in the same order as the input.
   * On LLM failure, all URLs are returned with category 'damage_photo' and
   * confidence 0.5 so the gallery degrades gracefully.
   */
  classifyPhotoUrls: protectedProcedure
    .input(z.object({
      urls: z.array(z.string().url()).max(50),
      assessmentId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      const { urls, assessmentId } = input;
      if (urls.length === 0) return { classifications: [], source: 'empty' as const };
      const tenantId = requirePhotoReextractionTenant(ctx);
      const scopedDb = await getDb();
      if (!scopedDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await requirePhotoAssessmentScope(scopedDb, tenantId, assessmentId);

      type PhotoCategory = 'damage_photo' | 'vehicle_overview' | 'quotation_scan' | 'document_page' | 'other';
      const validCategories: PhotoCategory[] = ['damage_photo', 'vehicle_overview', 'quotation_scan', 'document_page', 'other'];

      // ── CACHE-FIRST: Check DB for existing classification ─────────────────────
      if (assessmentId) {
        try {
          const db = await getDb();
          if (db) {
            const [rows] = await (db as any).execute(
              `SELECT photo_classification_json FROM ai_assessments WHERE id = ? LIMIT 1`,
              [assessmentId]
            );
            const cached = (rows as any[])[0]?.photo_classification_json;
            if (cached) {
              const cachedEntries = JSON.parse(cached) as Array<{ url: string; category: string; confidence: number }>;
              // Match cached entries to the requested URLs
              const cachedMap = new Map(cachedEntries.map((e) => [e.url, e]));
              const allCached = urls.every((url) => cachedMap.has(url));
              if (allCached) {
                return {
                  classifications: urls.map((url) => ({
                    url,
                    category: (cachedMap.get(url)?.category ?? 'damage_photo') as PhotoCategory,
                    confidence: cachedMap.get(url)?.confidence ?? 0.9,
                    reasoning: 'Loaded from pipeline classification cache',
                  })),
                  source: 'cache' as const,
                };
              }
              // Partial cache hit — only classify uncached URLs
              const uncachedUrls = urls.filter((url) => !cachedMap.has(url));
              if (uncachedUrls.length < urls.length) {
                // Run LLM only on uncached URLs, then merge
                const llmResult = await classifyUrlsWithLLM(uncachedUrls, validCategories);
                const merged = urls.map((url) => {
                  if (cachedMap.has(url)) {
                    return {
                      url,
                      category: (cachedMap.get(url)?.category ?? 'damage_photo') as PhotoCategory,
                      confidence: cachedMap.get(url)?.confidence ?? 0.9,
                      reasoning: 'Loaded from pipeline classification cache',
                    };
                  }
                  return llmResult.find((r) => r.url === url) ?? {
                    url,
                    category: 'damage_photo' as PhotoCategory,
                    confidence: 0.5,
                    reasoning: 'Classification unavailable — defaulting to damage_photo',
                  };
                });
                // Persist merged result back to cache
                await persistClassificationCache(db, assessmentId, tenantId, [
                  ...cachedEntries,
                  ...llmResult.map((r) => ({ url: r.url, category: r.category, confidence: r.confidence })),
                ]);
                return { classifications: merged, source: 'partial_cache' as const };
              }
            }
          }
        } catch (cacheErr) {
          console.warn('[classifyPhotoUrls] Cache lookup failed (non-fatal):', String(cacheErr));
        }
      }

      try {
        // Delegate to shared helper (also used in partial-cache path above)
        const classifications = await classifyUrlsWithLLM(urls, validCategories);

        // Persist LLM result to DB cache for future report loads
        if (assessmentId) {
          try {
            const db = await getDb();
            if (db) {
              await persistClassificationCache(
                db,
                assessmentId,
                tenantId,
                classifications.map((c) => ({ url: c.url, category: c.category, confidence: c.confidence }))
              );
            }
          } catch (persistErr) {
            console.warn('[classifyPhotoUrls] Failed to persist classification cache (non-fatal):', String(persistErr));
          }
        }

        return { classifications, source: 'llm' as const };
      } catch (err) {
        // On LLM failure, return all as damage_photo so the gallery degrades gracefully
        console.error('[classifyPhotoUrls] LLM classification failed (non-fatal):', String(err));
        return {
          classifications: urls.map((url) => ({
            url,
            category: 'damage_photo' as PhotoCategory,
            confidence: 0.5,
            reasoning: 'LLM classification unavailable — defaulting to damage_photo',
          })),
          source: 'llm_error' as const,
        };
      }
    }),

  /**
   * Get the most recent re-extraction job for an assessment.
   * Used to show the last re-extraction result in the report panel.
   */
  getLatest: protectedProcedure
    .input(z.object({
      assessmentId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenantId = requirePhotoReextractionTenant(ctx);
      await requirePhotoAssessmentScope(db, tenantId, input.assessmentId);
      const [rows] = await (db as any).execute(
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

// ── Helper: classify a list of URLs using the LLM vision model ───────────────
// Extracted so it can be called both from the main procedure and the partial-cache path.
async function classifyUrlsWithLLM(
  urls: string[],
  validCategories: Array<'damage_photo' | 'vehicle_overview' | 'quotation_scan' | 'document_page' | 'other'>
): Promise<Array<{ url: string; category: 'damage_photo' | 'vehicle_overview' | 'quotation_scan' | 'document_page' | 'other'; confidence: number; reasoning: string }>> {
  if (urls.length === 0) return [];

  // IMPORTANT: Use image_url (not file_url) — the Forge proxy authenticates S3 requests
  // for image_url content, matching the pattern used in stage-2-extraction.ts (line 362).
  // file_url only supports audio/video/PDF mime types; image/png requires image_url.
  const imageContent = urls.map((url, idx) => ([
    { type: "text" as const, text: `Image ${idx} (URL: ${url.substring(url.lastIndexOf('/') + 1).substring(0, 40)}):` },
    { type: "image_url" as const, image_url: { url, detail: "low" as const } },
  ])).flat();

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an image classifier for a South African motor insurance claims processing system.

Classify each image into EXACTLY ONE of these categories:

1. **damage_photo** — Shows actual vehicle damage (dents, scratches, broken parts, deformation, impact marks).
2. **vehicle_overview** — Shows a full or partial vehicle WITHOUT visible damage.
3. **quotation_scan** — Shows a repair quotation, invoice, or price list with line items and costs.
4. **document_page** — Shows a form, claim document, police report, ID document, or any text-heavy administrative page.
5. **other** — Does not fit any of the above.

RULES:
- If an image shows a vehicle WITH visible damage → "damage_photo"
- If an image is mostly text, checkboxes, or a form → "document_page"
- Return confidence 0.0–1.0 where 1.0 = absolutely certain

Return ONLY valid JSON: { "classifications": [ { "index": 0, "category": "...", "confidence": 0.9, "reasoning": "..." } ] }`,
      },
      {
        role: "user",
        content: [
          { type: "text" as const, text: `Classify each of the following ${urls.length} image(s). Return one classification per image by its 0-based index.` },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "photo_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            classifications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer" },
                  category: { type: "string", enum: validCategories },
                  confidence: { type: "number" },
                  reasoning: { type: "string" },
                },
                required: ["index", "category", "confidence", "reasoning"],
                additionalProperties: false,
              },
            },
          },
          required: ["classifications"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content || "{}";
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  const parsed = JSON.parse(content) as { classifications: Array<{ index: number; category: string; confidence: number; reasoning: string }> };

  const resultMap = new Map<number, { category: typeof validCategories[number]; confidence: number; reasoning: string }>();
  for (const cls of (parsed.classifications ?? [])) {
    if (cls.index >= 0 && cls.index < urls.length) {
      const cat = validCategories.includes(cls.category as typeof validCategories[number]) ? cls.category as typeof validCategories[number] : 'other';
      resultMap.set(cls.index, {
        category: cat,
        confidence: Math.max(0, Math.min(1, cls.confidence)),
        reasoning: cls.reasoning || '',
      });
    }
  }

  return urls.map((url, idx) => ({
    url,
    category: resultMap.get(idx)?.category ?? 'damage_photo',
    confidence: resultMap.get(idx)?.confidence ?? 0.5,
    reasoning: resultMap.get(idx)?.reasoning ?? 'Classification unavailable — defaulting to damage_photo',
  }));
}

// ── Helper: persist photo classification result to the DB cache ───────────────
async function persistClassificationCache(
  _db: any,
  assessmentId: number,
  tenantId: string,
  entries: Array<{ url: string; category: string; confidence: number }>
): Promise<void> {
  // Use a raw mysql2 connection — the Drizzle ORM instance returned by getDb()
  // does not support positional ? placeholders in .execute(), causing silent failures.
  const DB_URL = process.env.DATABASE_URL;
  if (!DB_URL) return;
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(DB_URL);
    await conn.execute(
      'UPDATE ai_assessments SET photo_classification_json = ? WHERE id = ? AND tenant_id = ?',
      [JSON.stringify(entries), assessmentId, tenantId]
    );
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}
