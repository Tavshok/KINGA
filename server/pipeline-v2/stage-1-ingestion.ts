/**
 * pipeline-v2/stage-1-ingestion.ts
 *
 * STAGE 1 — DOCUMENT INGESTION (Self-Healing)
 *
 * Identifies and classifies each document in the claim file.
 * WI-2: Now renders PDF pages to images using pdftoppm and uploads
 * them to S3 so stage-3 vision extraction can see all embedded photos.
 *
 * NEVER halts — if no documents are present, produces a degraded
 * output with empty document list so downstream stages can still
 * attempt recovery from claim database fields.
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
import { renderPdfToImages, extractImageUrls } from "./pdfToImages";
import { extractEmbeddedImagesFromUrl } from "./pdfEmbeddedImages";

function classifyDocument(
  fileName: string,
  mimeType: string,
  textHint?: string
): DocumentType {
  const fn = (fileName || "").toLowerCase();
  const hint = (textHint || "").toLowerCase();

  if (mimeType.startsWith("image/")) return "vehicle_photos";
  if (/police|saps|zrp|report/i.test(fn)) return "police_report";
  if (/quote|estimate|invoice|repair|panel/i.test(fn)) return "repair_quote";
  if (/claim|form|notification|fnol/i.test(fn)) return "claim_form";

  if (hint) {
    if (/police report|case number|station|officer|charge/i.test(hint)) return "police_report";
    if (/quotation|estimate|labour|parts|panel beat|repair cost/i.test(hint)) return "repair_quote";
    if (/claim form|claimant|insured|policy number/i.test(hint)) return "claim_form";
  }

  if (mimeType === "application/pdf") return "supporting_document";
  return "unknown";
}

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

    // Process the primary PDF document if present
    if (ctx.pdfUrl) {
      // ── CLOUD RUN COMPATIBILITY ─────────────────────────────────────────────
      // Native PDF page rendering (sharp/@napi-rs/canvas) is DISABLED in production.
      // Cloud Run's container does not ship the Skia native binary required by
      // @napi-rs/canvas, and sharp's libvips can OOM on large PDFs within the
      // 512MB RAM limit. The LLM reads PDFs natively via file_url in Stage 2
      // (OCR/text extraction) and Stage 6 (damage analysis), so page images are
      // NOT required for the pipeline to produce a complete assessment.
      //
      // This is the architecturally correct approach per the analysis:
      //   Old: PDF → native rendering → image generation → OCR → LLM
      //   New: PDF → LLM native document understanding → structured extraction
      // ────────────────────────────────────────────────────────────────────────
      let pdfPageImageUrls: string[] = [];
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        ctx.log(
          "Stage 1",
          "Skipping native PDF page rendering in production (Cloud Run incompatible). LLM will read PDF directly via file_url in Stage 2 and Stage 6."
        );
        recoveryActions.push({
          target: "pdf_page_rendering",
          strategy: "partial_data",
          success: true,
          description: "Native PDF rendering skipped in production. LLM reads PDF directly via file_url.",
        });
      } else {
        try {
          ctx.log("Stage 1", "Rendering PDF pages to images for vision analysis...");
          const renderResult = await renderPdfToImages(ctx.pdfUrl!, {
            dpi: 150,
            maxPages: 25,
            keyPrefix: `claims/${ctx.claimId}/pdf-pages`,
            log: (msg) => ctx.log("Stage 1 [PDF Render]", msg),
          });
          pdfPageImageUrls = extractImageUrls(renderResult);

          if (renderResult.errors.length > 0) {
            ctx.log(
              "Stage 1",
              `PDF rendering had ${renderResult.errors.length} error(s): ${renderResult.errors.join("; ")}`
            );
          }
          ctx.log(
            "Stage 1",
            `PDF rendered: ${pdfPageImageUrls.length} page image(s) uploaded to S3`
          );

          if (renderResult.truncated) {
            ctx.log(
              "Stage 1",
              `WARNING: PDF has ${renderResult.totalPagesInDocument} pages but only ${renderResult.totalPagesRendered} were rendered (limit: 25)`
            );
            recoveryActions.push({
              target: "pdf_page_rendering",
              strategy: "partial_data",
              success: true,
              description: `PDF truncated at 25 pages. ${renderResult.totalPagesInDocument - renderResult.totalPagesRendered} pages not rendered.`,
            });
          }
        } catch (renderErr) {
          ctx.log(
            "Stage 1",
            `PDF page rendering failed: ${String(renderErr)} — continuing without page images`
          );
          recoveryActions.push({
            target: "pdf_page_rendering",
            strategy: "partial_data",
            success: false,
            description: `PDF page rendering threw an error: ${String(renderErr)}. Vision analysis will be limited to text extraction.`,
          });
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Store PDF page images in context for downstream stages (Stage 6 vision fallback) ──
      if (pdfPageImageUrls.length > 0) {
        (ctx as any).pdfPageImageUrls = pdfPageImageUrls;
        ctx.log("Stage 1", `Stored ${pdfPageImageUrls.length} PDF page image URLs in context for Stage 6 vision fallback`);
      }

      const pdfDoc: IngestedDocument = {
        documentIndex: docIndex,
        documentType: classifyDocument(
          ctx.claim.sourceDocumentName || "claim-document.pdf",
          "application/pdf"
        ),
        sourceUrl: ctx.pdfUrl,
        mimeType: "application/pdf",
        fileName: ctx.claim.sourceDocumentName || "claim-document.pdf",
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
      // Self-healing: no PDF provided — log recovery action
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

    // ── EMBEDDED IMAGE EXTRACTION ──────────────────────────────────────────
    // Extract raster images physically embedded inside the PDF (damage photos,
    // scanned quote pages). These are the original full-resolution images that
    // the document author embedded — much higher quality than page screenshots.
    // Runs in both production and sandbox (pdfimages is a lightweight CLI tool).
    if (ctx.pdfUrl) {
      try {
        ctx.log("Stage 1", "Extracting embedded images from PDF...");
        const embeddedResult = await extractEmbeddedImagesFromUrl(
          ctx.pdfUrl,
          ctx.claimId,
          (msg) => ctx.log("Stage 1 [Embedded Images]", msg)
        );
        if (embeddedResult.images.length > 0) {
          const embeddedUrls = embeddedResult.images.map((img) => img.url);
          // Merge into ctx.damagePhotoUrls — these will be treated as damage photos
          // by Stage 6 (damage analysis). The LLM distinguishes between actual
          // damage photos and embedded quote scans based on image content.
          if (!ctx.damagePhotoUrls) (ctx as any).damagePhotoUrls = [];
          (ctx as any).damagePhotoUrls = [...(ctx.damagePhotoUrls ?? []), ...embeddedUrls];
          ctx.log(
            "Stage 1",
            `Embedded images: ${embeddedResult.images.length} extracted and merged into damage photo pool (${embeddedResult.totalFound} total found, ${embeddedResult.skipped} skipped)`
          );
        } else {
          ctx.log(
            "Stage 1",
            `Embedded images: none qualifying found (${embeddedResult.totalFound} total, all below size/dimension threshold)`
          );
        }
        if (embeddedResult.errors.length > 0) {
          ctx.log("Stage 1", `Embedded image extraction warnings: ${embeddedResult.errors.join("; ")}`);
        }
      } catch (embeddedErr: any) {
        ctx.log("Stage 1", `Embedded image extraction failed (non-fatal): ${String(embeddedErr)}`);
        recoveryActions.push({
          target: "embedded_image_extraction",
          strategy: "partial_data",
          success: false,
          description: `PDF embedded image extraction threw an error: ${String(embeddedErr)}. Continuing without embedded images.`,
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Process individual damage photos
    if (ctx.damagePhotoUrls && ctx.damagePhotoUrls.length > 0) {
      for (const photoUrl of ctx.damagePhotoUrls) {
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
      ctx.log("Stage 1", `Ingested ${ctx.damagePhotoUrls.length} damage photo(s)`);
    } else {
      // Self-healing: no photos — note it but continue
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

    const primaryDocumentIndex =
      ctx.pdfUrl ? 0 : documents.length > 0 ? 0 : -1;
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
      ctx.log(
        "Stage 1",
        "DEGRADED: No documents at all — pipeline will use claim DB fields only"
      );
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
  } catch (err) {
    ctx.log("Stage 1", `Ingestion failed: ${String(err)} — producing empty document set`);

    // Self-healing: even on exception, produce an empty output
    return {
      status: "degraded",
      data: {
        documents: [],
        primaryDocumentIndex: -1,
        totalDocuments: 0,
      },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [
        {
          field: "documents",
          assumedValue: "empty",
          reason: `Ingestion threw an error: ${String(err)}. Continuing with empty document set.`,
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

