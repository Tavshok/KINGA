/**
 * pipeline-v2/stage-2-extraction.ts
 *
 * STAGE 2 — OCR AND TEXT EXTRACTION
 *
 * For each ingested document:
 *   - If scanned/image-based: run OCR via LLM vision
 *   - Extract full text before AI analysis
 *   - Preserve tables and structured text
 *
 * Output: ExtractedText[] with raw text, tables, and OCR metadata.
 */

import type {
  PipelineContext,
  StageResult,
  Stage1Output,
  Stage2Output,
  ExtractedText,
  ExtractedTable,
} from "./types";
import { invokeLLM } from "../_core/llm";

// Helper to bypass strict content type checking in invokeLLM
function llmCall(params: any): Promise<any> {
  return invokeLLM(params);
}

/**
 * Extract text from a PDF document using LLM vision.
 * The LLM reads the PDF and returns structured text + tables.
 */
async function extractTextFromPdf(
  pdfUrl: string,
  ctx: PipelineContext
): Promise<{ rawText: string; tables: ExtractedTable[]; ocrConfidence: number }> {
  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a document OCR and text extraction system. Extract ALL text from the provided PDF document.

RULES:
- Extract every piece of text visible in the document
- Preserve the structure of tables as JSON arrays
- If the document contains handwritten text, extract it as best you can
- Mark confidence level for OCR quality
- Do NOT interpret or analyse the content — just extract the raw text

Return a JSON object with:
{
  "rawText": "Full extracted text from the document, preserving paragraph structure",
  "tables": [
    {
      "headers": ["Column1", "Column2"],
      "rows": [["value1", "value2"]],
      "context": "Brief description of what this table contains"
    }
  ],
  "ocrConfidence": 85
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: "Extract all text and tables from this document. Return as JSON.",
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
 * Extract text from an image using LLM vision.
 */
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

  try {
    const extractedTexts: ExtractedText[] = [];
    let totalPages = 0;

    for (const doc of stage1.documents) {
      if (doc.mimeType === "application/pdf" && doc.sourceUrl) {
        // PDF: full OCR + table extraction
        ctx.log("Stage 2", `Extracting text from PDF: ${doc.fileName}`);
        const result = await extractTextFromPdf(doc.sourceUrl, ctx);
        extractedTexts.push({
          documentIndex: doc.documentIndex,
          rawText: result.rawText,
          tables: result.tables,
          ocrApplied: true,
          ocrConfidence: result.ocrConfidence,
        });
        totalPages += 1; // PDF counted as 1 unit
        ctx.log("Stage 2", `PDF extracted: ${result.rawText.length} chars, ${result.tables.length} tables, confidence: ${result.ocrConfidence}%`);
      } else if (doc.mimeType.startsWith("image/") && doc.sourceUrl) {
        // Image: OCR for any text, but primarily these are damage photos
        // We do a lightweight OCR pass — damage photos typically have no text
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
    }

    const output: Stage2Output = {
      extractedTexts,
      totalPagesProcessed: totalPages,
    };

    ctx.log("Stage 2", `Extraction complete. ${extractedTexts.length} document(s) processed, ${totalPages} pages total.`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 2", `Text extraction failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
