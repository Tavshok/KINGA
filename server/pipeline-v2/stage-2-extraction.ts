/**
 * pipeline-v2/stage-2-extraction.ts
 *
 * STAGE 2 — OCR AND TEXT EXTRACTION (Self-Healing)
 *
 * For each ingested document:
 *   - If scanned/image-based: run OCR via LLM vision
 *   - If OCR confidence is low: attempt secondary OCR extraction
 *   - Reconstruct likely text using context for uncertain fields
 *   - Mark uncertain fields with lower confidence scores
 *
 * NEVER halts — if all OCR fails, produces empty text with degraded status.
 */

import type {
  PipelineContext,
  StageResult,
  Stage1Output,
  Stage2Output,
  ExtractedText,
  ExtractedTable,
  Assumption,
  RecoveryAction,
} from "./types";
import { invokeLLM } from "../_core/llm";
import { preprocessDocument } from "./documentPreprocessor";

function llmCall(params: any): Promise<any> {
  return invokeLLM(params);
}

const LOW_CONFIDENCE_THRESHOLD = 60;
const HANDWRITING_CONFIDENCE_THRESHOLD = 75;

async function extractTextFromPdf(
  pdfUrl: string,
  ctx: PipelineContext
): Promise<{ rawText: string; tables: ExtractedTable[]; ocrConfidence: number }> {
  const response = await llmCall({
    messages: [
      {
        role: "system",
         content: `You are a specialist insurance document OCR and text extraction system.
Your ONLY job is to extract ALL text from the provided PDF — every character, every field, every table row.

CRITICAL RULES:
1. FORM FIELDS: Insurance claim forms have labelled fields. Extract them as "Label: Value" pairs on separate lines.
   Example: "Speed at time of accident: 90KM/HRS" → output exactly "Speed at time of accident: 90KM/HRS"
   Example: "What was your speed?: 90" → output exactly "What was your speed?: 90"
   NEVER omit field labels or their values — they are the most important data.

2. TABLES: Extract every row of every table verbatim. For repair quotations:
   - Include every line item: description, quantity, unit price, total
   - Include subtotals, VAT lines, and grand totals
   - Preserve the column structure: "Item | Description | Qty | Unit Price | Total"
   - The LAST row of a repair quote table is usually the grand total — ALWAYS include it
   - Example: "Total (Incl) | | | | 591.33" → output exactly as shown

3. HANDWRITING: Extract all handwritten text, stamps, and annotations.
   - Agreed/authorised cost amounts: "Agreed USD 462.33", "Cost Agreed"
   - Signatures, dates, officer names

4. PAGE COMPLETENESS: Read EVERY page. Do not stop early.
   - Repair quotations are typically on the LAST pages
   - Police report numbers are often on a separate page

5. VERBATIM: Do NOT paraphrase, summarise, or interpret. Extract the exact text.

Return JSON:
{
  "rawText": "Full verbatim text with form fields as Label: Value pairs and table rows preserved",
  "tables": [{"headers": [...], "rows": [[...]], "context": "..."}],
  "ocrConfidence": 85
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Extract ALL text from every page of this document. Return as JSON.

PAY SPECIAL ATTENTION TO:
1. Form fields with labels — output as "Label: Value" on each line (e.g. "Speed: 90KM/HRS")
2. Repair quotation tables — include every line item and the grand total row
3. Handwritten annotations — especially agreed/authorised cost amounts
4. The LAST pages — they usually contain the repair quote and police report

Do NOT stop reading after the first page. Read ALL pages completely.`,
          },
          {
            type: "file_url" as const,
            file_url: {
              url: pdfUrl,
              mime_type: "application/pdf" as const,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "text_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rawText: { type: "string", description: "Full extracted text" },
            tables: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  headers: { type: "array", items: { type: "string" } },
                  rows: {
                    type: "array",
                    items: { type: "array", items: { type: "string" } },
                  },
                  context: { type: "string" },
                },
                required: ["headers", "rows", "context"],
                additionalProperties: false,
              },
            },
            ocrConfidence: { type: "integer", description: "OCR quality confidence 0-100" },
          },
          required: ["rawText", "tables", "ocrConfidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || "",
    tables: (parsed.tables || []).map((t: any) => ({
      headers: t.headers || [],
      rows: t.rows || [],
      context: t.context || "",
    })),
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

/**
 * Targeted handwriting OCR pass — invoked when the preprocessor detects
 * pages that likely contain handwritten annotations (e.g. agreed cost,
 * officer signatures, witness statements).
 */
async function handwritingOcrPass(
  pdfUrl: string,
  handwrittenPageHints: string,
  ctx: PipelineContext
): Promise<{ rawText: string; ocrConfidence: number }> {
  ctx.log("Stage 2", "Running targeted handwriting OCR pass");
  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a specialist handwriting OCR system for insurance documents.
Focus ONLY on handwritten text, stamps, annotations, and signatures.
Common handwritten content in insurance claims:
- Agreed/authorised cost amounts (e.g. 'Agreed USD 462.33')
- Officer names and badge numbers
- Witness signatures and names
- Date stamps and case reference numbers
- Assessor annotations and corrections
Return JSON: { "rawText": "all handwritten text found", "ocrConfidence": 80 }`,
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Extract ALL handwritten text, stamps, and annotations from this document.\nKnown handwritten sections hint: ${handwrittenPageHints.substring(0, 500)}`,
          },
          {
            type: "file_url" as const,
            file_url: { url: pdfUrl, mime_type: "application/pdf" as const },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "handwriting_ocr",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rawText: { type: "string" },
            ocrConfidence: { type: "integer" },
          },
          required: ["rawText", "ocrConfidence"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || "",
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

/**
 * Targeted table OCR pass — invoked when the preprocessor detects
 * table-like regions (repair quotations, parts lists, labour schedules).
 * Uses a table-focused prompt to improve line-item extraction accuracy.
 */
async function tableOcrPass(
  pdfUrl: string,
  tableHint: string,
  ctx: PipelineContext
): Promise<{ rawText: string; ocrConfidence: number }> {
  ctx.log("Stage 2", "Running targeted table OCR pass for repair quotation");
  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a specialist OCR system for tabular data in vehicle repair quotations.
Extract ALL table content with precise alignment:
- Each row on its own line
- Preserve column order: item | description | qty | unit price | total
- Include ALL rows — do not truncate long tables
- Capture subtotals, VAT lines, and grand totals
- Capture any handwritten totals or agreed amounts
Return JSON: { "rawText": "full table text", "ocrConfidence": 85 }`,
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Extract all table content from this repair quotation document.\nTable hint: ${tableHint.substring(0, 300)}`,
          },
          {
            type: "file_url" as const,
            file_url: { url: pdfUrl, mime_type: "application/pdf" as const },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "table_ocr",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rawText: { type: "string" },
            ocrConfidence: { type: "integer" },
          },
          required: ["rawText", "ocrConfidence"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || "",
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

/**
 * Secondary OCR pass — asks the LLM to re-read with enhanced focus
 * on unclear/handwritten text and low-quality scans.
 */
async function secondaryOcrPass(
  pdfUrl: string,
  previousText: string,
  ctx: PipelineContext
): Promise<{ rawText: string; ocrConfidence: number }> {
  ctx.log("Stage 2", "Running secondary OCR pass for low-confidence document");
  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a specialist OCR system for difficult-to-read documents. The previous OCR pass produced low-confidence results. Please re-read this document very carefully.

FOCUS ON:
- Handwritten text that may have been missed
- Faded or low-contrast text
- Stamps, seals, or annotations
- Numbers that may have been misread (dates, amounts, registration numbers)

Previous extraction (for reference, may contain errors):
${previousText.substring(0, 2000)}

Return JSON: { "rawText": "...", "ocrConfidence": 75 }`,
      },
      {
        role: "user",
        content: [
          { type: "text" as const, text: "Re-extract all text from this document with enhanced focus on unclear areas." },
          {
            type: "file_url" as const,
            file_url: { url: pdfUrl, mime_type: "application/pdf" as const },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "secondary_ocr",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rawText: { type: "string" },
            ocrConfidence: { type: "integer" },
          },
          required: ["rawText", "ocrConfidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || previousText,
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

async function extractTextFromImage(
  imageUrl: string,
  ctx: PipelineContext
): Promise<{ rawText: string; ocrConfidence: number }> {
  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a document OCR system. Extract any visible text from this image.
If this is a vehicle damage photo with no text, return an empty string for rawText.
Return JSON: { "rawText": "...", "ocrConfidence": 80 }`,
      },
      {
        role: "user",
        content: [
          { type: "text" as const, text: "Extract text from this image." },
          {
            type: "image_url" as const,
            image_url: { url: imageUrl, detail: "high" as const },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "image_ocr",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rawText: { type: "string" },
            ocrConfidence: { type: "integer" },
          },
          required: ["rawText", "ocrConfidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || "",
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

export async function runExtractionStage(
  ctx: PipelineContext,
  stage1: Stage1Output
): Promise<StageResult<Stage2Output>> {
  const start = Date.now();
  ctx.log("Stage 2", "OCR and text extraction starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const extractedTexts: ExtractedText[] = [];
    let totalPages = 0;

    if (stage1.documents.length === 0) {
      // Self-healing: no documents at all — produce empty extraction
      isDegraded = true;
      assumptions.push({
        field: "extractedTexts",
        assumedValue: "empty",
        reason: "No documents were ingested. Text extraction skipped. Will rely on claim database fields.",
        strategy: "partial_data",
        confidence: 20,
        stage: "Stage 2",
      });
      ctx.log("Stage 2", "DEGRADED: No documents to extract text from");
    }

    for (const doc of stage1.documents) {
      try {
        if (doc.mimeType === "application/pdf" && doc.sourceUrl) {
          ctx.log("Stage 2", `Extracting text from PDF: ${doc.fileName}`);
          let result = await extractTextFromPdf(doc.sourceUrl, ctx);

          // Self-healing: if OCR confidence is low, attempt secondary pass
          if (result.ocrConfidence < LOW_CONFIDENCE_THRESHOLD) {
            ctx.log("Stage 2", `Low OCR confidence (${result.ocrConfidence}%) — attempting secondary OCR pass`);
            recoveryActions.push({
              target: `document_${doc.documentIndex}_ocr`,
              strategy: "secondary_ocr",
              success: false, // will update below
              description: `Primary OCR confidence was ${result.ocrConfidence}%. Attempting secondary extraction.`,
            });

            try {
              const secondary = await secondaryOcrPass(doc.sourceUrl, result.rawText, ctx);
              if (secondary.ocrConfidence > result.ocrConfidence) {
                result = { ...result, rawText: secondary.rawText, ocrConfidence: secondary.ocrConfidence };
                recoveryActions[recoveryActions.length - 1].success = true;
                recoveryActions[recoveryActions.length - 1].recoveredValue = `Improved confidence to ${secondary.ocrConfidence}%`;
                ctx.log("Stage 2", `Secondary OCR improved confidence to ${secondary.ocrConfidence}%`);
              } else {
                recoveryActions[recoveryActions.length - 1].description += ` Secondary pass did not improve (${secondary.ocrConfidence}%).`;
                ctx.log("Stage 2", `Secondary OCR did not improve confidence (${secondary.ocrConfidence}%)`);
              }
            } catch (secondaryErr) {
              ctx.log("Stage 2", `Secondary OCR failed: ${String(secondaryErr)} — using primary result`);
            }

            if (result.ocrConfidence < LOW_CONFIDENCE_THRESHOLD) {
              isDegraded = true;
              assumptions.push({
                field: `document_${doc.documentIndex}_text`,
                assumedValue: "low_confidence_text",
                reason: `OCR confidence remains low (${result.ocrConfidence}%) after secondary pass. Extracted text may contain errors.`,
                strategy: "secondary_ocr",
                confidence: result.ocrConfidence,
                stage: "Stage 2",
              });
            }
          }

          // ── ENHANCEMENT: Document Pre-Processor ──────────────────────────
          // Run the preprocessor on the extracted text to detect section types,
          // handwritten regions, and table-like structures.
          const preprocessed = preprocessDocument(result.rawText);
          ctx.log("Stage 2", `Preprocessor: ${preprocessed.totalChunks} chunks, multiDoc=${preprocessed.hasMultipleDocuments}, quoteChunks=${preprocessed.repairQuoteChunks.length}, handwrittenChunks=${preprocessed.chunks.filter(c => c.likelyHandwritten).length}`);

          // ── ENHANCEMENT: Targeted handwriting OCR pass ────────────────────
          // If any chunk is flagged as likely handwritten, run a dedicated
          // handwriting-focused OCR pass and append the result to the raw text.
          const handwrittenChunks = preprocessed.chunks.filter(c => c.likelyHandwritten);
          if (handwrittenChunks.length > 0 && doc.sourceUrl) {
            try {
              const hwHint = handwrittenChunks.map(c => c.text.substring(0, 200)).join(" | ");
              const hwResult = await handwritingOcrPass(doc.sourceUrl, hwHint, ctx);
              if (hwResult.rawText.trim().length > 20) {
                result = {
                  ...result,
                  rawText: result.rawText + "\n\n[HANDWRITING_OCR]\n" + hwResult.rawText,
                  ocrConfidence: Math.max(result.ocrConfidence, hwResult.ocrConfidence),
                };
                recoveryActions.push({
                  target: `document_${doc.documentIndex}_handwriting`,
                  strategy: "secondary_ocr",
                  success: true,
                  description: `Handwriting OCR pass added ${hwResult.rawText.length} chars from ${handwrittenChunks.length} handwritten section(s).`,
                  recoveredValue: hwResult.rawText.substring(0, 200),
                });
                ctx.log("Stage 2", `Handwriting OCR: added ${hwResult.rawText.length} chars`);
              }
            } catch (hwErr) {
              ctx.log("Stage 2", `Handwriting OCR pass failed: ${String(hwErr)} — continuing`);
            }
          }

          // ── ENHANCEMENT: Targeted table OCR pass ─────────────────────────
          // If repair quote chunks were detected and the primary confidence is
          // below the handwriting threshold, run a table-focused re-extraction
          // on the quote section specifically.
          if (preprocessed.repairQuoteChunks.length > 0 && result.ocrConfidence < HANDWRITING_CONFIDENCE_THRESHOLD && doc.sourceUrl) {
            try {
              const tableHint = preprocessed.repairQuoteText.substring(0, 400);
              const tableResult = await tableOcrPass(doc.sourceUrl, tableHint, ctx);
              if (tableResult.rawText.trim().length > 20) {
                result = {
                  ...result,
                  rawText: result.rawText + "\n\n[TABLE_OCR]\n" + tableResult.rawText,
                  ocrConfidence: Math.max(result.ocrConfidence, tableResult.ocrConfidence),
                };
                recoveryActions.push({
                  target: `document_${doc.documentIndex}_table`,
                  strategy: "secondary_ocr",
                  success: true,
                  description: `Table OCR pass added ${tableResult.rawText.length} chars from repair quote section.`,
                  recoveredValue: tableResult.rawText.substring(0, 200),
                });
                ctx.log("Stage 2", `Table OCR: added ${tableResult.rawText.length} chars`);
              }
            } catch (tableErr) {
              ctx.log("Stage 2", `Table OCR pass failed: ${String(tableErr)} — continuing`);
            }
          }

          extractedTexts.push({
            documentIndex: doc.documentIndex,
            rawText: result.rawText,
            tables: result.tables,
            ocrApplied: true,
            ocrConfidence: result.ocrConfidence,
          });
          totalPages += 1;
          ctx.log("Stage 2", `PDF extracted: ${result.rawText.length} chars, ${result.tables.length} tables, confidence: ${result.ocrConfidence}%`);

        } else if (doc.mimeType.startsWith("image/") && doc.sourceUrl) {
          const result = await extractTextFromImage(doc.sourceUrl, ctx);
          extractedTexts.push({
            documentIndex: doc.documentIndex,
            rawText: result.rawText,
            tables: [],
            ocrApplied: true,
            ocrConfidence: result.ocrConfidence,
          });
          totalPages += 1;
        }
      } catch (docErr) {
        // Self-healing: individual document extraction failed — continue with others
        ctx.log("Stage 2", `Failed to extract document ${doc.documentIndex}: ${String(docErr)} — skipping`);
        isDegraded = true;
        recoveryActions.push({
          target: `document_${doc.documentIndex}`,
          strategy: "partial_data",
          success: true,
          description: `Extraction failed for ${doc.fileName}: ${String(docErr)}. Skipping this document and continuing.`,
        });
        extractedTexts.push({
          documentIndex: doc.documentIndex,
          rawText: "",
          tables: [],
          ocrApplied: false,
          ocrConfidence: 0,
        });
      }
    }

    const output: Stage2Output = {
      extractedTexts,
      totalPagesProcessed: totalPages,
    };

    ctx.log("Stage 2", `Extraction complete. ${extractedTexts.length} document(s) processed, ${totalPages} pages total.`);

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
    ctx.log("Stage 2", `Text extraction failed completely: ${String(err)} — producing empty output`);

    // Self-healing: total failure — produce empty extraction
    return {
      status: "degraded",
      data: {
        extractedTexts: [],
        totalPagesProcessed: 0,
      },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "extractedTexts",
        assumedValue: "empty",
        reason: `Complete extraction failure: ${String(err)}. Pipeline will rely on claim database fields.`,
        strategy: "default_value",
        confidence: 10,
        stage: "Stage 2",
      }],
      recoveryActions: [{
        target: "extraction_error_recovery",
        strategy: "default_value",
        success: true,
        description: `Extraction error caught. Producing empty text set to allow pipeline to continue.`,
      }],
      degraded: true,
    };
  }
}
