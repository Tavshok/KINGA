/**
 * pipeline-v2/stage-2-extraction.ts
 *
 * STAGE 2 — OCR AND TEXT EXTRACTION (Self-Healing, Field-Triggered)
 *
 * Architecture:
 *   1. SINGLE STRONG PRIMARY PASS — extracts all text, tables, handwriting, and
 *      returns field-level confidence scores per critical field.
 *   2. DETERMINISTIC TRIGGER LOGIC — specialist passes fire only when the primary
 *      pass data itself shows a gap (not based on unreliable overall confidence).
 *      - Handwriting pass: only if agreedCost is null AND semantic hint found in text
 *      - Table pass: only if quoteTotalCents is null OR total is inconsistent
 *      - Secondary pass: only if critical fields are missing AND text is very short
 *   3. FIELD RECOVERY ENGINE (Stage 3) is the primary fallback for individual fields.
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
import { invokeLLM, withRetry } from "../_core/llm";
import { preprocessDocument } from "./documentPreprocessor";

// Default LLM call — used for short structured calls (45s timeout, no retry needed)
function llmCall(params: any): Promise<any> {
  return invokeLLM(params);
}

// Retrying LLM call for large PDF extraction — 90s timeout, 3 attempts with exponential backoff
// Handles transient API timeouts that cause Stage 2 to degrade unnecessarily.
function llmCallWithRetry(params: any, ctx: PipelineContext, label: string): Promise<any> {
  return withRetry(
    () => invokeLLM({ ...params, timeoutMs: 90_000 }),
    3,
    [2000, 4000, 8000],
    (attempt, err) => {
      ctx.log('Stage 2', `[${label}] Attempt ${attempt} failed (${(err as Error)?.message ?? err}). Retrying in ${[2, 4, 8][attempt - 1]}s...`);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD-LEVEL CONFIDENCE TYPE
// Returned by the primary pass so downstream triggers are data-driven.
// ─────────────────────────────────────────────────────────────────────────────
interface FieldConfidence {
  claimId: number;
  vehicleRegistration: number;
  accidentDate: number;
  incidentType: number;
  estimatedSpeed: number;
  policeReportNumber: number;
  repairQuoteTotal: number;
  agreedCost: number;
  damageDescription: number;
}

interface PrimaryExtractionResult {
  rawText: string;
  tables: ExtractedTable[];
  ocrConfidence: number;
  fieldConfidence: FieldConfidence;
  /** Semantic flags detected in text — used for deterministic trigger logic */
  flags: {
    agreedCostHintFound: boolean;   // "agreed", "approved", "auth", "authorised" near a number
    repairQuoteDetected: boolean;   // table with totals detected
    quoteTotalInconsistent: boolean; // line items sum ≠ stated total
    textTooShort: boolean;          // rawText < 300 chars (document barely read)
    criticalFieldsMissing: number;  // count of fields with confidence < 40
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC TRIGGER THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum text length for a readable document — below this the primary pass failed */
const MIN_TEXT_LENGTH_CHARS = 300;

/** Field confidence below this is considered "missing" for trigger purposes */
const FIELD_CONFIDENCE_MISSING = 40;

/** Number of missing critical fields that justifies a full secondary OCR re-read */
const SECONDARY_OCR_MISSING_FIELD_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC HINT PATTERNS — deterministic checks on extracted text
// ─────────────────────────────────────────────────────────────────────────────
const AGREED_COST_PATTERNS = [
  /\bagreed\b/i,
  /\bapproved\b/i,
  /\bauthori[sz]ed?\b/i,
  /\bauth(?:orised?)?\s*(?:cost|amount|usd|$)/i,
  /\bcost\s+agreed\b/i,
  /\bnegotiated\b/i,
  /\bsettled\s+(?:at|for|amount)\b/i,
];

function hasAgreedCostHint(text: string): boolean {
  return AGREED_COST_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY EXTRACTION PASS — single strong call covering all content types
// ─────────────────────────────────────────────────────────────────────────────
async function extractTextFromPdf(
  pdfUrl: string,
  ctx: PipelineContext
): Promise<PrimaryExtractionResult> {
  // Wrap the entire LLM call + JSON.parse in withRetry so truncated responses are retried.
  const parsed = await withRetry(
    async () => {
      const response = await invokeLLM({
        timeoutMs: 90_000,
        maxTokens: 16384, // Full PDF extraction can produce 10k+ tokens for dense insurance forms
    messages: [
      {
        role: "system",
        content: `You are a specialist insurance document OCR and text extraction system for the Zimbabwean market.
Your job is to extract ALL text from the provided PDF with maximum fidelity, then report field-level confidence.

═══════════════════════════════════════════════════════════════
EXTRACTION RULES
═══════════════════════════════════════════════════════════════

1. FORM FIELDS — Extract as "Label: Value" pairs on separate lines.
   - Every labelled field must be extracted verbatim, including the label.
   - Examples: "Speed at time of accident: 90KM/HRS", "Policy Number: ZIM/2024/00123"
   - NEVER omit field labels or their values.

2. TABLES — Extract every row of every table verbatim.
   - Repair quotations: include every line item (description, qty, unit price, total).
   - Include subtotals, VAT lines, and grand totals.
   - Preserve column structure: "Item | Description | Qty | Unit Price | Total"
   - The LAST row of a repair quote is usually the grand total — ALWAYS include it.
   - Example: "Total (Incl) | | | | 591.33" → output exactly as shown.

3. HANDWRITING — Extract ALL handwritten text, stamps, and annotations.
   CRITICAL: Assessors often write agreed/authorised amounts by hand on the repair quote.
   Look specifically for:
   - "Agreed USD 462.33", "Cost Agreed", "Authorised: 380.00", "Auth $450"
   - Any handwritten number near the words "agreed", "approved", "auth", "authorised"
   - Officer names, badge numbers, witness signatures, date stamps
   - Any corrections or annotations in margins
   These are financially critical — do NOT skip them.

4. PAGE COMPLETENESS — Read EVERY page. Do not stop early.
   - Repair quotations are typically on the LAST pages.
   - Police report numbers are often on a separate page.
   - Handwritten agreed costs are often on the same page as the repair quote.

5. VERBATIM — Do NOT paraphrase, summarise, or interpret. Extract exact text.

═══════════════════════════════════════════════════════════════
FIELD-LEVEL CONFIDENCE
═══════════════════════════════════════════════════════════════
After extraction, rate your confidence (0-100) for each critical field:
- 90-100: Field clearly present and legible in document
- 60-89:  Field present but partially unclear or inferred
- 30-59:  Field may be present but uncertain (handwriting, damage, etc.)
- 0-29:   Field not found or completely illegible

Return JSON with this exact structure:
{
  "rawText": "Full verbatim text...",
  "tables": [{"headers": [...], "rows": [[...]], "context": "..."}],
  "ocrConfidence": 85,
  "fieldConfidence": {
    "claimId": 90,
    "vehicleRegistration": 85,
    "accidentDate": 80,
    "incidentType": 75,
    "estimatedSpeed": 60,
    "policeReportNumber": 70,
    "repairQuoteTotal": 85,
    "agreedCost": 30,
    "damageDescription": 80
  }
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Extract ALL text from every page of this insurance claim document. Return as JSON.

PRIORITY ITEMS:
1. Form fields with labels → output as "Label: Value" (e.g. "Speed: 90KM/HRS")
2. Repair quotation tables → include EVERY line item AND the grand total row
3. Handwritten agreed/authorised cost amounts → look carefully on the quote pages
4. Police report number → often on a separate page at the end
5. ALL pages → do not stop after page 1

After extracting, rate your confidence per field in fieldConfidence (0-100).`,
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
        name: "text_extraction_v2",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rawText: { type: "string", description: "Full verbatim extracted text" },
            tables: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  headers: { type: "array", items: { type: "string" } },
                  rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                  context: { type: "string" },
                },
                required: ["headers", "rows", "context"],
                additionalProperties: false,
              },
            },
            ocrConfidence: { type: "integer", description: "Overall OCR quality 0-100" },
            fieldConfidence: {
              type: "object",
              description: "Per-field confidence scores 0-100",
              properties: {
                claimId: { type: "integer" },
                vehicleRegistration: { type: "integer" },
                accidentDate: { type: "integer" },
                incidentType: { type: "integer" },
                estimatedSpeed: { type: "integer" },
                policeReportNumber: { type: "integer" },
                repairQuoteTotal: { type: "integer" },
                agreedCost: { type: "integer" },
                damageDescription: { type: "integer" },
              },
              required: ["claimId", "vehicleRegistration", "accidentDate", "incidentType", "estimatedSpeed", "policeReportNumber", "repairQuoteTotal", "agreedCost", "damageDescription"],
              additionalProperties: false,
            },
          },
          required: ["rawText", "tables", "ocrConfidence", "fieldConfidence"],
          additionalProperties: false,
        },
      },
    },
      });
      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent : (Array.isArray(rawContent) ? (rawContent as any[]).map((c: any) => (c.text ?? '')).join('') : '');
      if (!content || content.trim() === '' || content.trim() === '{}') {
        throw new Error('Empty or truncated LLM response');
      }
      return JSON.parse(content);
    },
    3,
    [2000, 4000, 8000],
    (attempt, err) => {
      ctx.log('Stage 2', `[extractTextFromPdf] Attempt ${attempt} failed: ${(err as Error)?.message ?? err}. Retrying...`);
    },
  );

  const rawText: string = parsed.rawText || "";
  const ocrConfidence: number = parsed.ocrConfidence || 50;
  const fc = parsed.fieldConfidence || {};

  const fieldConfidence: FieldConfidence = {
    claimId: fc.claimId ?? 50,
    vehicleRegistration: fc.vehicleRegistration ?? 50,
    accidentDate: fc.accidentDate ?? 50,
    incidentType: fc.incidentType ?? 50,
    estimatedSpeed: fc.estimatedSpeed ?? 50,
    policeReportNumber: fc.policeReportNumber ?? 50,
    repairQuoteTotal: fc.repairQuoteTotal ?? 50,
    agreedCost: fc.agreedCost ?? 50,
    damageDescription: fc.damageDescription ?? 50,
  };

  // ── Compute deterministic flags from extracted data ──────────────────────
  const criticalFieldsMissing = Object.values(fieldConfidence)
    .filter(v => v < FIELD_CONFIDENCE_MISSING).length;

  const flags = {
    agreedCostHintFound: hasAgreedCostHint(rawText),
    repairQuoteDetected: (parsed.tables || []).length > 0 || /total\s*\(incl/i.test(rawText) || /grand\s*total/i.test(rawText),
    quoteTotalInconsistent: false, // computed below if tables present
    textTooShort: rawText.length < MIN_TEXT_LENGTH_CHARS,
    criticalFieldsMissing,
  };

  // Check if quote total is inconsistent with line items (simple heuristic)
  if (flags.repairQuoteDetected && (parsed.tables || []).length > 0) {
    for (const table of (parsed.tables || [])) {
      const rows: string[][] = table.rows || [];
      if (rows.length > 2) {
        // Try to sum numeric values in last column and compare to last row
        const lineItems = rows.slice(0, -1).map((r: string[]) => {
          const last = r[r.length - 1]?.replace(/[^0-9.]/g, "");
          return last ? parseFloat(last) : 0;
        }).filter((v: number) => v > 0);
        const lastRow = rows[rows.length - 1];
        const statedTotal = parseFloat((lastRow[lastRow.length - 1] || "").replace(/[^0-9.]/g, ""));
        if (lineItems.length > 0 && statedTotal > 0) {
          const computedSum = lineItems.reduce((a: number, b: number) => a + b, 0);
          // Flag if difference > 10% (allows for VAT, discounts)
          if (Math.abs(computedSum - statedTotal) / statedTotal > 0.10) {
            flags.quoteTotalInconsistent = true;
          }
        }
      }
    }
  }

  return {
    rawText,
    tables: (parsed.tables || []).map((t: any) => ({
      headers: t.headers || [],
      rows: t.rows || [],
      context: t.context || "",
    })),
    ocrConfidence,
    fieldConfidence,
    flags,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKED EXTRACTION — for large PDFs (>8 pages) that exceed LLM output limits
// Splits page images into chunks of 6, extracts in parallel, merges results.
// This prevents the "Unterminated string in JSON" truncation error on 18+ page PDFs.
// ─────────────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 4; // pages per chunk — 4 pages keeps JSON output under 16k tokens per chunk

async function extractChunk(
  pageImageUrls: string[],
  chunkIndex: number,
  ctx: PipelineContext
): Promise<{ rawText: string; tables: ExtractedTable[]; ocrConfidence: number }> {
  const parsed = await withRetry(
    async () => {
      const imageContent = pageImageUrls.map(url => ({
        type: "image_url" as const,
        image_url: { url, detail: "high" as const },
      }));
      const response = await invokeLLM({
        timeoutMs: 90_000,
        maxTokens: 16384, // Dense insurance forms can exceed 8k tokens per 4-page chunk
        messages: [
          {
            role: "system",
            content: `You are a specialist insurance document OCR system.
Extract ALL text from the provided page images verbatim. Return JSON with:
- rawText: full verbatim text from all pages
- tables: array of tables found (headers, rows, context)
- ocrConfidence: overall quality 0-100

Rules:
1. Extract form fields as "Label: Value" pairs
2. Extract all table rows including totals
3. Extract all handwritten text and stamps
4. Do NOT paraphrase or summarise`,
          },
          {
            role: "user",
            content: [
              { type: "text" as const, text: `Extract ALL text from these ${pageImageUrls.length} document page(s). Return as JSON.` },
              ...imageContent,
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "chunk_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                rawText: { type: "string" },
                tables: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      headers: { type: "array", items: { type: "string" } },
                      rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                      context: { type: "string" },
                    },
                    required: ["headers", "rows", "context"],
                    additionalProperties: false,
                  },
                },
                ocrConfidence: { type: "integer" },
              },
              required: ["rawText", "tables", "ocrConfidence"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent : (Array.isArray(rawContent) ? (rawContent as any[]).map((c: any) => (c.text ?? '')).join('') : '');
      if (!content || content.trim() === '' || content.trim() === '{}') {
        throw new Error('Empty or truncated LLM response');
      }
      return JSON.parse(content);
    },
    3,
    [2000, 4000, 8000],
    (attempt, err) => {
      ctx.log('Stage 2', `[chunk ${chunkIndex}] Attempt ${attempt} failed: ${(err as Error)?.message ?? err}. Retrying...`);
    },
  );
  return {
    rawText: parsed.rawText || '',
    tables: (parsed.tables || []).map((t: any) => ({ headers: t.headers || [], rows: t.rows || [], context: t.context || '' })),
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

async function extractTextFromPdfChunked(
  pdfUrl: string,
  pageImageUrls: string[],
  ctx: PipelineContext
): Promise<PrimaryExtractionResult> {
  // For large PDFs, use the file_url approach — send the full PDF directly to the LLM.
  // This is more reliable than image chunks because:
  //   1. The LLM handles pagination internally — no token truncation from per-chunk limits.
  //   2. No S3 upload overhead for each page image.
  //   3. The LLM can cross-reference pages (e.g. repair quote on page 12 + agreed cost on page 13).
  // The extractTextFromPdf function already uses file_url and works for any page count.
  ctx.log('Stage 2', `[chunked->file_url] ${pageImageUrls.length} pages — using full-PDF file_url extraction (more reliable than image chunks)`);
  return extractTextFromPdf(pdfUrl, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDWRITING SPECIALIST PASS
// Triggered only when: agreedCost confidence is low AND semantic hint found in text
// ─────────────────────────────────────────────────────────────────────────────
async function handwritingOcrPass(
  pdfUrl: string,
  handwrittenPageHints: string,
  ctx: PipelineContext
): Promise<{ rawText: string; ocrConfidence: number }> {
  ctx.log("Stage 2", "Running targeted handwriting OCR pass (trigger: agreedCost missing + semantic hint)");
  const response = await llmCallWithRetry({
    messages: [
      {
        role: "system",
        content: `You are a specialist handwriting OCR system for insurance documents.
Focus ONLY on handwritten text, stamps, annotations, and signatures.
Common handwritten content in insurance claims:
- Agreed/authorised cost amounts (e.g. 'Agreed USD 462.33', 'Auth $380', 'Cost Agreed')
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
            text: `Extract ALL handwritten text, stamps, and annotations from this document.
Pay special attention to any agreed/authorised cost amounts written by hand on the repair quote pages.
Known handwritten sections hint: ${handwrittenPageHints.substring(0, 500)}`,
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
  }, ctx, 'handwritingOcrPass');
  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || "",
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// TABLE SPECIALIST PASS
// Triggered only when: repairQuoteTotal confidence is low OR total is inconsistent
// ─────────────────────────────────────────────────────────────────────────────
async function tableOcrPass(
  pdfUrl: string,
  tableHint: string,
  ctx: PipelineContext
): Promise<{ rawText: string; ocrConfidence: number }> {
  ctx.log("Stage 2", "Running targeted table OCR pass (trigger: quote total missing or inconsistent)");
  const response = await llmCallWithRetry({
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
            text: `Extract all table content from this repair quotation document.
Table hint: ${tableHint.substring(0, 300)}`,
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
  }, ctx, 'tableOcrPass');
  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || "",
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// SECONDARY OCR PASS
// Triggered only when: document text is very short AND many critical fields missing
// (i.e. the primary pass barely read the document at all)
// ─────────────────────────────────────────────────────────────────────────────
async function secondaryOcrPass(
  pdfUrl: string,
  previousText: string,
  ctx: PipelineContext
): Promise<{ rawText: string; ocrConfidence: number }> {
  ctx.log("Stage 2", "Running secondary OCR pass (trigger: document barely read + many missing fields)");
  const response = await llmCallWithRetry({
    messages: [
      {
        role: "system",
        content: `You are a specialist OCR system for difficult-to-read documents. The previous OCR pass produced very little text, suggesting the document was not properly read.
Please re-read this document very carefully.

FOCUS ON:
- Handwritten text that may have been missed
- Faded or low-contrast text
- Stamps, seals, or annotations
- Numbers that may have been misread (dates, amounts, registration numbers)

Previous extraction (for reference, may be incomplete):
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
  }, ctx, 'secondaryOcrPass');
  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    rawText: parsed.rawText || previousText,
    ocrConfidence: parsed.ocrConfidence || 50,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE OCR PASS — for image-type documents (not PDFs)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN STAGE RUNNER
// ─────────────────────────────────────────────────────────────────────────────
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

    // ── PHASE 4: Parallel multi-document extraction ──────────────────────────
    // Each document is fully independent — all processed concurrently.
    type DocResult = {
      extracted: ExtractedText;
      docAssumptions: Assumption[];
      docRecoveryActions: RecoveryAction[];
      docDegraded: boolean;
    };

    const processDoc = async (doc: (typeof stage1.documents)[number]): Promise<DocResult> => {
      const docAssumptions: Assumption[] = [];
      const docRecoveryActions: RecoveryAction[] = [];
      let docDegraded = false;

      try {
        if (doc.mimeType === "application/pdf" && doc.sourceUrl) {
          ctx.log("Stage 2", `[doc ${doc.documentIndex}] Extracting text from PDF: ${doc.fileName}`);

          // ── STEP 1: Single strong primary pass ─────────────────────────────
          // Use chunked extraction for large PDFs (>6 pages) to avoid LLM output truncation.
          const primary = await extractTextFromPdfChunked(
            doc.sourceUrl,
            doc.imageUrls || [],
            ctx
          );
          let result = {
            rawText: primary.rawText,
            tables: primary.tables,
            ocrConfidence: primary.ocrConfidence,
          };

          ctx.log("Stage 2",
            `[doc ${doc.documentIndex}] Primary pass: ${result.rawText.length} chars, ` +
            `confidence=${result.ocrConfidence}%, ` +
            `fieldConf={agreedCost:${primary.fieldConfidence.agreedCost}, ` +
            `quoteTotal:${primary.fieldConfidence.repairQuoteTotal}, ` +
            `claimId:${primary.fieldConfidence.claimId}}, ` +
            `flags={agreedHint:${primary.flags.agreedCostHintFound}, ` +
            `quoteDetected:${primary.flags.repairQuoteDetected}, ` +
            `totalInconsistent:${primary.flags.quoteTotalInconsistent}, ` +
            `textShort:${primary.flags.textTooShort}, ` +
            `missingFields:${primary.flags.criticalFieldsMissing}}`
          );

          // ── STEP 2: Document pre-processor (deterministic, no LLM) ─────────
          const preprocessed = preprocessDocument(result.rawText);

          // ── STEP 3: DETERMINISTIC TRIGGER LOGIC ────────────────────────────
          // Specialist passes fire based on DATA GAPS, not overall confidence score.

          // TRIGGER A: Handwriting pass
          // Fires when: agreedCost field confidence is low AND semantic hint found in text
          // Rationale: The agreed cost is financially critical and often handwritten.
          // The primary pass already reads handwriting — this pass only fires if it
          // specifically failed to find an agreed cost that the text hints at.
          const needsHandwritingPass =
            primary.fieldConfidence.agreedCost < FIELD_CONFIDENCE_MISSING &&
            primary.flags.agreedCostHintFound;

          if (needsHandwritingPass && doc.sourceUrl) {
            ctx.log("Stage 2", `[doc ${doc.documentIndex}] TRIGGER A: Handwriting pass — agreedCost confidence=${primary.fieldConfidence.agreedCost}% + semantic hint found`);
            try {
              const handwrittenChunks = preprocessed.chunks.filter(c => c.likelyHandwritten);
              const hwHint = handwrittenChunks.length > 0
                ? handwrittenChunks.map(c => c.text.substring(0, 200)).join(" | ")
                : "agreed cost annotation on repair quote page";
              const hwResult = await handwritingOcrPass(doc.sourceUrl, hwHint, ctx);
              if (hwResult.rawText.trim().length > 20) {
                result = {
                  ...result,
                  rawText: result.rawText + "\n\n[HANDWRITING_OCR]\n" + hwResult.rawText,
                  ocrConfidence: Math.max(result.ocrConfidence, hwResult.ocrConfidence),
                };
                docRecoveryActions.push({
                  target: `document_${doc.documentIndex}_handwriting`,
                  strategy: "secondary_ocr",
                  success: true,
                  description: `Handwriting OCR pass added ${hwResult.rawText.length} chars (trigger: agreedCost confidence=${primary.fieldConfidence.agreedCost}% + semantic hint).`,
                  recoveredValue: hwResult.rawText.substring(0, 200),
                });
                ctx.log("Stage 2", `[doc ${doc.documentIndex}] Handwriting OCR: added ${hwResult.rawText.length} chars`);
              }
            } catch (hwErr) {
              ctx.log("Stage 2", `[doc ${doc.documentIndex}] Handwriting OCR pass failed: ${String(hwErr)} — continuing`);
            }
          }

          // TRIGGER B: Table OCR pass
          // Fires when: repairQuoteTotal confidence is low OR total is inconsistent
          // Rationale: Repair quote totals drive cost estimates and fraud detection.
          // Only re-read the table if the primary pass specifically failed on totals.
          const needsTablePass =
            primary.flags.repairQuoteDetected && (
              primary.fieldConfidence.repairQuoteTotal < FIELD_CONFIDENCE_MISSING ||
              primary.flags.quoteTotalInconsistent
            );

          if (needsTablePass && doc.sourceUrl) {
            const triggerReason = primary.flags.quoteTotalInconsistent
              ? `total inconsistent`
              : `repairQuoteTotal confidence=${primary.fieldConfidence.repairQuoteTotal}%`;
            ctx.log("Stage 2", `[doc ${doc.documentIndex}] TRIGGER B: Table pass — ${triggerReason}`);
            try {
              const tableHint = preprocessed.repairQuoteText.substring(0, 400);
              const tableResult = await tableOcrPass(doc.sourceUrl, tableHint, ctx);
              if (tableResult.rawText.trim().length > 20) {
                result = {
                  ...result,
                  rawText: result.rawText + "\n\n[TABLE_OCR]\n" + tableResult.rawText,
                  ocrConfidence: Math.max(result.ocrConfidence, tableResult.ocrConfidence),
                };
                docRecoveryActions.push({
                  target: `document_${doc.documentIndex}_table`,
                  strategy: "secondary_ocr",
                  success: true,
                  description: `Table OCR pass added ${tableResult.rawText.length} chars (trigger: ${triggerReason}).`,
                  recoveredValue: tableResult.rawText.substring(0, 200),
                });
                ctx.log("Stage 2", `[doc ${doc.documentIndex}] Table OCR: added ${tableResult.rawText.length} chars`);
              }
            } catch (tableErr) {
              ctx.log("Stage 2", `[doc ${doc.documentIndex}] Table OCR pass failed: ${String(tableErr)} — continuing`);
            }
          }

          // TRIGGER C: Secondary full re-read
          // Fires when: document text is very short AND many critical fields are missing
          // Rationale: The primary pass barely read the document at all (e.g. scanned image
          // PDF that the LLM failed to process). A full re-read is justified.
          // This does NOT fire for normal documents with some uncertain fields — the
          // field recovery engine handles those individually in Stage 3.
          const needsSecondaryPass =
            primary.flags.textTooShort &&
            primary.flags.criticalFieldsMissing >= SECONDARY_OCR_MISSING_FIELD_THRESHOLD;

          if (needsSecondaryPass && doc.sourceUrl) {
            ctx.log("Stage 2", `[doc ${doc.documentIndex}] TRIGGER C: Secondary pass — text=${result.rawText.length} chars, missingFields=${primary.flags.criticalFieldsMissing}`);
            const secondaryAction: RecoveryAction = {
              target: `document_${doc.documentIndex}_ocr`,
              strategy: "secondary_ocr",
              success: false,
              description: `Primary OCR produced only ${result.rawText.length} chars with ${primary.flags.criticalFieldsMissing} missing fields. Attempting full re-read.`,
            };
            docRecoveryActions.push(secondaryAction);
            try {
              const secondary = await secondaryOcrPass(doc.sourceUrl, result.rawText, ctx);
              if (secondary.rawText.length > result.rawText.length) {
                result = { ...result, rawText: secondary.rawText, ocrConfidence: secondary.ocrConfidence };
                secondaryAction.success = true;
                secondaryAction.recoveredValue = `Improved text length to ${secondary.rawText.length} chars`;
                ctx.log("Stage 2", `[doc ${doc.documentIndex}] Secondary OCR improved text to ${secondary.rawText.length} chars`);
              } else {
                secondaryAction.description += ` Secondary pass did not improve text length.`;
                docDegraded = true;
                docAssumptions.push({
                  field: `document_${doc.documentIndex}_text`,
                  assumedValue: "low_confidence_text",
                  reason: `Document appears to be a very poor quality scan. Extracted text may be incomplete.`,
                  strategy: "secondary_ocr",
                  confidence: result.ocrConfidence,
                  stage: "Stage 2",
                });
              }
            } catch (secondaryErr) {
              ctx.log("Stage 2", `[doc ${doc.documentIndex}] Secondary OCR failed: ${String(secondaryErr)} — using primary result`);
            }
          }

          ctx.log("Stage 2", `[doc ${doc.documentIndex}] PDF extraction complete: ${result.rawText.length} chars, ${result.tables.length} tables, confidence: ${result.ocrConfidence}%`);
          return {
            extracted: {
              documentIndex: doc.documentIndex,
              rawText: result.rawText,
              tables: result.tables,
              ocrApplied: true,
              ocrConfidence: result.ocrConfidence,
            },
            docAssumptions,
            docRecoveryActions,
            docDegraded,
          };

        } else if (doc.mimeType.startsWith("image/") && doc.sourceUrl) {
          const imageResult = await extractTextFromImage(doc.sourceUrl, ctx);
          return {
            extracted: {
              documentIndex: doc.documentIndex,
              rawText: imageResult.rawText,
              tables: [],
              ocrApplied: true,
              ocrConfidence: imageResult.ocrConfidence,
            },
            docAssumptions,
            docRecoveryActions,
            docDegraded,
          };
        }

        // Unknown mime type — skip
        return {
          extracted: { documentIndex: doc.documentIndex, rawText: "", tables: [], ocrApplied: false, ocrConfidence: 0 },
          docAssumptions,
          docRecoveryActions,
          docDegraded: false,
        };

      } catch (docErr) {
        ctx.log("Stage 2", `[doc ${doc.documentIndex}] Failed to extract: ${String(docErr)} — skipping`);
        return {
          extracted: { documentIndex: doc.documentIndex, rawText: "", tables: [], ocrApplied: false, ocrConfidence: 0 },
          docAssumptions: [],
          docRecoveryActions: [{
            target: `document_${doc.documentIndex}`,
            strategy: "partial_data",
            success: true,
            description: `Extraction failed for ${doc.fileName}: ${String(docErr)}. Skipping this document and continuing.`,
          }],
          docDegraded: true,
        };
      }
    };

    // Fire all document extractions concurrently
    const docResults = await Promise.all(stage1.documents.map(processDoc));

    // Merge results in document order
    for (const dr of docResults) {
      extractedTexts.push(dr.extracted);
      totalPages += dr.extracted.ocrApplied ? 1 : 0;
      assumptions.push(...dr.docAssumptions);
      recoveryActions.push(...dr.docRecoveryActions);
      if (dr.docDegraded) isDegraded = true;
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

