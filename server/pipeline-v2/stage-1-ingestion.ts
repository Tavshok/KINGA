/**
 * pipeline-v2/stage-1-ingestion.ts
 *
 * STAGE 1 — DOCUMENT INGESTION
 *
 * Identifies and classifies each document in the claim file.
 * Extracts image URLs from PDFs. Classifies document types.
 * Returns a structured list of IngestedDocument objects.
 */

import type {
  PipelineContext,
  StageResult,
  Stage1Output,
  IngestedDocument,
  DocumentType,
} from "./types";

/**
 * Classify a document based on its filename, MIME type, and content hints.
 */
function classifyDocument(
  fileName: string,
  mimeType: string,
  textHint?: string
): DocumentType {
  const fn = (fileName || "").toLowerCase();
  const hint = (textHint || "").toLowerCase();

  // Photo uploads
  if (mimeType.startsWith("image/")) return "vehicle_photos";

  // PDF classification by filename patterns
  if (/police|saps|zrp|report/i.test(fn)) return "police_report";
  if (/quote|estimate|invoice|repair|panel/i.test(fn)) return "repair_quote";
  if (/claim|form|notification|fnol/i.test(fn)) return "claim_form";

  // If we have text hints, try to classify from content
  if (hint) {
    if (/police report|case number|station|officer|charge/i.test(hint)) return "police_report";
    if (/quotation|estimate|labour|parts|panel beat|repair cost/i.test(hint)) return "repair_quote";
    if (/claim form|claimant|insured|policy number/i.test(hint)) return "claim_form";
  }

  // Default: if it's a PDF, treat as supporting document
  if (mimeType === "application/pdf") return "supporting_document";

  return "unknown";
}

export async function runIngestionStage(
  ctx: PipelineContext
): Promise<StageResult<Stage1Output>> {
  const start = Date.now();
  ctx.log("Stage 1", "Document ingestion starting");

  try {
    const documents: IngestedDocument[] = [];
    let docIndex = 0;

    // Process the primary PDF document if present
    if (ctx.pdfUrl) {
      const pdfDoc: IngestedDocument = {
        documentIndex: docIndex,
        documentType: classifyDocument(
          ctx.claim.sourceDocumentName || "claim-document.pdf",
          "application/pdf"
        ),
        sourceUrl: ctx.pdfUrl,
        mimeType: "application/pdf",
        fileName: ctx.claim.sourceDocumentName || "claim-document.pdf",
        containsImages: true,
        imageUrls: [], // Will be populated in Stage 2 during PDF processing
      };
      documents.push(pdfDoc);
      docIndex++;
      ctx.log("Stage 1", `Ingested PDF document: ${pdfDoc.documentType} — ${pdfDoc.fileName}`);
    }

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
    }

    // Determine primary document (PDF takes priority, then first photo)
    const primaryDocumentIndex = ctx.pdfUrl ? 0 : (documents.length > 0 ? 0 : -1);

    const output: Stage1Output = {
      documents,
      primaryDocumentIndex,
      totalDocuments: documents.length,
    };

    ctx.log("Stage 1", `Ingestion complete. ${documents.length} document(s) classified.`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false, // No DB write needed for ingestion
    };
  } catch (err) {
    ctx.log("Stage 1", `Ingestion failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
