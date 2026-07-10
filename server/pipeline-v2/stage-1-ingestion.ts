/**
 * pipeline-v2/stage-1-ingestion.ts
 *
 * STAGE 1 — DOCUMENT INGESTION (Self-Healing)
 *
 * Identifies and classifies each document in the claim file.
 *
 * ── EXTRACTION ARCHITECTURE ──────────────────────────────────────────────────
 *
 * PRIMARY PATH — pdf-image-extractor.ts (pdfjs-dist + @napi-rs/canvas)
 *   Pure Node.js. No system binaries. Handles both page rendering AND embedded
 *   image extraction in a single streaming pass. Has blur detection, rotation
 *   correction, and S3 upload with retry built in. Works identically in the
 *   sandbox and in Cloud Run (no poppler dependency).
 *
 * FALLBACK PATH — pdfToImages.ts + pdfEmbeddedImages.ts (poppler-utils)
 *   Used only when the primary path fails or returns 0 images. Requires
 *   pdftoppm and pdfimages system binaries. Available in the sandbox but may
 *   not be present in all Cloud Run container builds — this is exactly why it
 *   is the fallback and not the primary.
 *
 * WHY THIS MATTERS
 *   The previous implementation used poppler as the primary path. When
 *   pdftoppm/pdfimages were unavailable (cold Cloud Run container, missing apt
 *   package), extraction silently returned empty arrays and the pipeline
 *   continued with no photos. This caused intermittent failures that were hard
 *   to reproduce locally. The new primary path removes the system binary
 *   dependency entirely.
 *
 * NEVER halts — if no documents are present, produces a degraded output with
 * empty document list so downstream stages can still attempt recovery from
 * claim database fields.
 */

import type {
  PipelineContext,
  StageResult,
  Stage1Output,
  IngestedDocument,
  DocumentType,
  Assumption,
  RecoveryAction,
} from "./types";
import { extractImagesWithSummary } from "../pdf-image-extractor";
import { renderPdfToImages, extractImageUrls } from "./pdfToImages";
import { extractEmbeddedImagesFromUrl } from "./pdfEmbeddedImages";

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * R-A-01 FIX: Per-call timeout wrapper for pdf-image-extractor.
 * Previously, extractImagesWithSummary had no external timeout guard in Stage 1.
 * A malformed PDF page that causes pdf.js to hang (e.g., corrupt operator stream,
 * infinite loop in font rendering) would block the entire ingestion stage for the
 * full GLOBAL_TIMEOUT_MS (3 min) budget inside the extractor, then consume the
 * remaining Stage 1 budget waiting for the promise to resolve.
 *
 * This wrapper enforces a hard 150s deadline on the entire extraction call.
 * If exceeded, Stage 1 logs the timeout, skips primary extraction, and falls
 * through to the existing fallback path (pdfToImages + pdfEmbeddedImages).
 * The pipeline continues rather than hanging indefinitely.
 *
 * 150s is chosen to:
 *   - Allow up to 40 pages at ~3s/page (worst-case scanned at 200 DPI)
 *   - Leave headroom for the fallback path within the Stage 1 budget
 *   - Match the GLOBAL_TIMEOUT_MS (3 min) inside the extractor minus 30s margin
 */
const EXTRACTION_TIMEOUT_MS = 150_000; // 150s hard deadline for pdf-image-extractor call

async function withExtractionTimeout<T>(fn: () => Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`R-A-01: ${label} timed out after ${EXTRACTION_TIMEOUT_MS}ms — malformed PDF suspected`)),
      EXTRACTION_TIMEOUT_MS
    );
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/**
 * Classify an ingested document into one of the pipeline's DocumentType categories.
 *
 * Classification taxonomy (downstream significance):
 *   'vehicle_photos'      — image/* MIME type. Routed to Stage 6 (damage analysis) and
 *                           photo forensics. containsImages is always true.
 *   'police_report'       — PDF whose filename matches police/SAPS/ZRP keywords, or whose
 *                           first-page text contains police report markers. Stage 3 uses
 *                           this to skip quote extraction (police reports don't have quotes).
 *   'repair_quote'        — PDF whose filename matches quote/estimate/invoice/repair keywords.
 *                           Stage 3 prioritises quote extraction for this type.
 *   'claim_form'          — PDF whose filename matches claim/form/notification/FNOL keywords.
 *                           Stage 3 extracts accident description and claimant fields.
 *   'assessor_report'     — Not assigned here (Stage 3 assigns this after LLM extraction
 *                           when document_category='assessor_report' is returned).
 *   'supporting_document' — PDF that matched no keyword heuristic. Stage 3 attempts
 *                           generic extraction; Stage 9 L1 filter may exclude it.
 *   'unknown'             — Non-PDF, non-image file. Pipeline logs a warning and skips it.
 *
 * Note: documentType values are repeated string literals across Stage 1, Stage 3, and
 * the orchestrator. A shared DocumentType enum in shared/types.ts would be preferable
 * but has not been implemented (backlog item).
 */
function classifyDocument(
  fileName: string,
  mimeType: string,
  textHint?: string
): DocumentType {
  const fn = (fileName || '').toLowerCase();
  const hint = (textHint || '').toLowerCase();

  if (mimeType.startsWith('image/')) return 'vehicle_photos';
  if (/police|saps|zrp|report/i.test(fn)) return 'police_report';
  if (/quote|estimate|invoice|repair|panel/i.test(fn)) return 'repair_quote';
  if (/claim|form|notification|fnol/i.test(fn)) return 'claim_form';

  if (hint) {
    if (/police report|case number|station|officer|charge/i.test(hint)) return 'police_report';
    if (/quotation|estimate|labour|parts|panel beat|repair cost/i.test(hint)) return 'repair_quote';
    if (/claim form|claimant|insured|policy number/i.test(hint)) return 'claim_form';
  }

  if (mimeType === 'application/pdf') return 'supporting_document';
  return 'unknown';
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function runIngestionStage(
  ctx: PipelineContext
): Promise<StageResult<Stage1Output>> {
  const start = Date.now();
  ctx.log("Stage 1", "Document ingestion starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];

  try {
    const documents: IngestedDocument[] = [];
    let docIndex = 0;

    // ── PRIMARY PDF PROCESSING ────────────────────────────────────────────────
    if (ctx.pdfUrl) {
      const pdfRenderUrl = ctx.pdfDownloadUrl || ctx.pdfUrl;
      let pdfPageImageUrls: string[] = [];
      let primarySucceeded = false;

      // ── PRIMARY PATH: pdfjs-dist (pure Node.js, no system binaries) ─────────
      // Handles both page rendering and embedded image extraction in one pass.
      // Streaming: processes one page at a time — peak memory ≈ 2 page buffers.
      try {
        ctx.log("Stage 1", "PRIMARY: Extracting images via pdfjs-dist (no system binaries)...");

        // Download PDF buffer (60s timeout)
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        let pdfBuffer: Buffer;
        try {
          const res = await fetch(pdfRenderUrl, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          pdfBuffer = Buffer.from(await res.arrayBuffer());
        } finally {
          clearTimeout(timer);
        }

        const fileName = (ctx.claim as any)?.sourceDocumentName || "claim-document.pdf";
        const summary = await withExtractionTimeout(
          () => extractImagesWithSummary(pdfBuffer, fileName),
          `extractImagesWithSummary(${fileName})`
        );

        if (summary.errors.length > 0) {
          ctx.log("Stage 1", `pdfjs extraction warnings: ${summary.errors.join("; ")}`);
        }

        ctx.log(
          "Stage 1",
          `pdfjs extraction complete: ${summary.images.length} image(s) from ${summary.pageCount} pages ` +
          `(${summary.pagesRendered} rendered, ${summary.embeddedCandidates} embedded candidates, ` +
          `${summary.rejectedByDimension} rejected, ${summary.blurryCount} blurry, ` +
          `${summary.textHeavyCount} text-heavy, scanned=${summary.isScannedPdf}, dpi=${summary.renderDpi})`
        );

        if (summary.images.length > 0) {
          primarySucceeded = true;

          // Split into page renders (for LLM vision) and embedded images (for damage forensics)
          const pageRenders = summary.images.filter(img => img.source === "page_render");
          const embeddedImages = summary.images.filter(img => img.source === "embedded_image");

          // Page render URLs → pdfPageImageUrls (used by Stage 3 LLM vision)
          pdfPageImageUrls = pageRenders.map(img => img.url);

          // All images → extractedImagesWithMetadata for Stage 2.6 classifier
          ctx.extractedImagesWithMetadata = [
            ...(ctx.extractedImagesWithMetadata ?? []),
            ...summary.images.map(img => ({
              url: img.url,
              width: img.width,
              height: img.height,
              pageNumber: img.pageNumber,
              source: img.source,
              quality: img.quality,
              fromScannedPdf: img.fromScannedPdf,
              renderDpi: img.renderDpi,
            })),
          ];

          // Embedded images → damagePhotoUrls (Stage 2.6 will refine this)
          const embeddedUrls = embeddedImages.map(img => img.url);
          if (embeddedUrls.length > 0) {
            ctx.damagePhotoUrls = [...(ctx.damagePhotoUrls ?? []), ...embeddedUrls];
            ctx.log("Stage 1", `pdfjs: ${embeddedUrls.length} embedded image(s) added to damagePhotoUrls`);
          }

          ctx.log(
            "Stage 1",
            `PRIMARY succeeded: ${pdfPageImageUrls.length} page renders, ${embeddedUrls.length} embedded images`
          );
        } else {
          ctx.log("Stage 1", "pdfjs extraction returned 0 images — will try poppler fallback");
        }
      } catch (primaryErr: unknown) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        ctx.log("Stage 1", `PRIMARY (pdfjs) failed: ${msg} — trying poppler fallback`);
        recoveryActions.push({
          target: "pdf_extraction_primary",
          strategy: "partial_data",
          success: false,
          description: `pdfjs extraction threw: ${msg}. Falling back to poppler.`,
        });
      }

      // ── FALLBACK PATH: poppler-utils (pdftoppm + pdfimages) ─────────────────
      // Used only when the primary pdfjs path fails or returns 0 images.
      if (!primarySucceeded) {
        ctx.log("Stage 1", "FALLBACK: Attempting poppler-based extraction (pdftoppm + pdfimages)...");

        // Page rendering via pdftoppm
        try {
          const renderResult = await renderPdfToImages(pdfRenderUrl, {
            dpi: 100,
            maxPages: 25,
            keyPrefix: `claims/${ctx.claimId}/pdf-pages`,
            log: (msg: string) => ctx.log("Stage 1 [PDF Render Fallback]", msg),
          });
          pdfPageImageUrls = extractImageUrls(renderResult);

          if (renderResult.errors.length > 0) {
            ctx.log("Stage 1", `Poppler page render warnings: ${renderResult.errors.join("; ")}`);
          }
          if (renderResult.truncated) {
            ctx.log(
              "Stage 1",
              `WARNING: PDF truncated at 25 pages (${renderResult.totalPagesInDocument} total)`
            );
            recoveryActions.push({
              target: "pdf_page_rendering_fallback",
              strategy: "partial_data",
              success: true,
              description: `PDF truncated at 25 pages. ${renderResult.totalPagesInDocument - renderResult.totalPagesRendered} pages not rendered.`,
            });
          }
          ctx.log("Stage 1", `Poppler page render: ${pdfPageImageUrls.length} page image(s) uploaded`);
        } catch (renderErr: unknown) {
          const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
          ctx.log("Stage 1", `Poppler page render failed: ${msg} — continuing without page images`);
          recoveryActions.push({
            target: "pdf_page_rendering_fallback",
            strategy: "partial_data",
            success: false,
            description: `pdftoppm threw: ${msg}. Vision analysis limited to text extraction.`,
          });
        }

        // Embedded image extraction via pdfimages
        try {
          ctx.log("Stage 1", "FALLBACK: Extracting embedded images via pdfimages...");
          const embeddedResult = await extractEmbeddedImagesFromUrl(
            pdfRenderUrl,
            ctx.claimId,
            (msg: string) => ctx.log("Stage 1 [Embedded Fallback]", msg)
          );
          if (embeddedResult.images.length > 0) {
            ctx.extractedImagesWithMetadata = [
              ...(ctx.extractedImagesWithMetadata ?? []),
              ...embeddedResult.images.map(img => img.classifierInput),
            ];
            ctx.damagePhotoUrls = [
              ...(ctx.damagePhotoUrls ?? []),
              ...embeddedResult.images.map(img => img.url),
            ];
            ctx.log("Stage 1", `Poppler embedded: ${embeddedResult.images.length} image(s) extracted`);
          } else {
            ctx.log(
              "Stage 1",
              `Poppler embedded: none qualifying (${embeddedResult.totalFound} found, all below threshold)`
            );
          }
          if (embeddedResult.errors.length > 0) {
            ctx.log("Stage 1", `Poppler embedded warnings: ${embeddedResult.errors.join("; ")}`);
          }
        } catch (embeddedErr: unknown) {
          const msg = embeddedErr instanceof Error ? embeddedErr.message : String(embeddedErr);
          ctx.log("Stage 1", `Poppler embedded extraction failed (non-fatal): ${msg}`);
          recoveryActions.push({
            target: "embedded_image_extraction_fallback",
            strategy: "partial_data",
            success: false,
            description: `pdfimages threw: ${msg}. Continuing without embedded images.`,
          });
        }

        if (
          pdfPageImageUrls.length === 0 &&
          !(ctx.extractedImagesWithMetadata?.length)
        ) {
          ctx.log(
            "Stage 1",
            "WARNING: Both primary and fallback extraction returned 0 images. Vision analysis will be text-only."
          );
          recoveryActions.push({
            target: "pdf_extraction_all_paths",
            strategy: "partial_data",
            success: false,
            description:
              "Both pdfjs and poppler extraction paths returned 0 images. Vision analysis will be limited to text extraction.",
          });
        }
      }

      // Store page images in context for downstream stages
      if (pdfPageImageUrls.length > 0) {
        ctx.pdfPageImageUrls = pdfPageImageUrls;
        ctx.log(
          "Stage 1",
          `Stored ${pdfPageImageUrls.length} PDF page image URL(s) in context for Stage 6 vision`
        );
      }

      const pdfFileName =
        (ctx.claim as any)?.sourceDocumentName || "claim-document.pdf";
      const pdfDoc: IngestedDocument = {
        documentIndex: docIndex,
        documentType: classifyDocument(pdfFileName, "application/pdf"),
        sourceUrl: ctx.pdfUrl,
        mimeType: "application/pdf",
        fileName: pdfFileName,
        // containsImages: true means the PDF structurally contains page images that were
        // successfully rendered and stored in imageUrls. It does NOT mean the images were
        // successfully analysed or that they are damage photos. Stage 3 uses this flag to
        // determine whether to attempt vision-based extraction. A PDF with containsImages=false
        // will only be processed via text extraction paths.
        containsImages: pdfPageImageUrls.length > 0,
        imageUrls: pdfPageImageUrls,
      };
      documents.push(pdfDoc);
      docIndex++;
      ctx.log(
        "Stage 1",
        `Ingested PDF document: ${pdfDoc.documentType} — ${pdfDoc.fileName} (${pdfPageImageUrls.length} page images)`
      );
    } else {
      recoveryActions.push({
        target: "primary_pdf_document",
        strategy: "partial_data",
        success: true,
        description:
          "No PDF document provided. Will attempt to extract data from claim database fields and photos.",
      });
      ctx.log(
        "Stage 1",
        "WARNING: No PDF document provided — will use claim DB fields for recovery"
      );
    }

    // ── INDIVIDUAL DAMAGE PHOTOS ──────────────────────────────────────────────
    // These are photos uploaded directly (not embedded in a PDF).
    // They are already in ctx.damagePhotoUrls from the pipeline launcher.
    // We register them as IngestedDocument entries so Stage 2 can reference them.
    const directPhotoUrls = ctx.damagePhotoUrls?.filter(
      // Avoid double-registering URLs we just added from PDF embedded images
      url => !documents.some(d => d.imageUrls.includes(url))
    ) ?? [];

    if (directPhotoUrls.length > 0) {
      for (const photoUrl of directPhotoUrls) {
        const photoDoc: IngestedDocument = {
          documentIndex: docIndex,
          documentType: "vehicle_photos",
          sourceUrl: photoUrl,
          mimeType: "image/jpeg",
          fileName: `damage-photo-${docIndex}.jpg`,
          containsImages: true,
          imageUrls: [photoUrl],
        };
        documents.push(photoDoc);
        docIndex++;
      }
      ctx.log("Stage 1", `Ingested ${directPhotoUrls.length} direct damage photo(s)`);
    } else if (!ctx.pdfUrl) {
      recoveryActions.push({
        target: "damage_photos",
        strategy: "partial_data",
        success: true,
        description:
          "No damage photos provided. Damage assessment will rely on repair quotes and accident description.",
      });
      ctx.log(
        "Stage 1",
        "WARNING: No damage photos provided — damage analysis will use text-based inference"
      );
    }

    const primaryDocumentIndex = documents.length > 0 ? 0 : -1;
    const isDegraded = documents.length === 0;

    if (isDegraded) {
      assumptions.push({
        field: "documents",
        assumedValue: "empty",
        reason:
          "No documents or photos were provided. Pipeline will attempt to extract data from claim database fields only.",
        strategy: "partial_data",
        confidence: 30,
        stage: "Stage 1",
      });
      ctx.log("Stage 1", "DEGRADED: No documents at all — pipeline will use claim DB fields only");
    }

    const output: Stage1Output = {
      documents,
      primaryDocumentIndex,
      totalDocuments: documents.length,
    };

    ctx.log("Stage 1", `Ingestion complete. ${documents.length} document(s) classified.`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.log("Stage 1", `Ingestion failed: ${msg} — producing empty document set`);

    return {
      status: "degraded",
      data: {
        documents: [],
        primaryDocumentIndex: -1,
        totalDocuments: 0,
      },
      error: msg,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [
        {
          field: "documents",
          assumedValue: "empty",
          reason: `Ingestion threw an error: ${msg}. Continuing with empty document set.`,
          strategy: "default_value",
          confidence: 10,
          stage: "Stage 1",
        },
      ],
      recoveryActions: [
        {
          target: "ingestion_error_recovery",
          strategy: "default_value",
          success: true,
          description: `Ingestion error caught. Producing empty document set to allow pipeline to continue.`,
        },
      ],
      degraded: true,
    };
  }
}
