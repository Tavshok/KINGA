/**
 * documentPreprocessor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document Pre-Processor — runs BEFORE Stage 2 OCR extraction.
 *
 * Responsibilities:
 *   1. PAGE-AWARE CHUNKING: splits the raw extracted text into logical page
 *      sections so the LLM can be directed to specific pages.
 *   2. SECTION TAGGING: labels each chunk as claim_form | police_report |
 *      repair_quote | photos | supporting_document.
 *   3. TABLE DETECTION: identifies table-like regions in raw text for
 *      targeted re-extraction with the table-focused prompt.
 *   4. HANDWRITING HINT: flags pages that likely contain handwritten content
 *      so Stage 2 can apply the enhanced handwriting OCR prompt.
 *   5. MULTI-DOCUMENT DETECTION: detects when a single PDF contains multiple
 *      concatenated documents (e.g. claim form + police report + quote).
 *
 * This module is PURE — it does not call the LLM. It operates only on the
 * raw text already extracted by Stage 2, enriching it for Stage 3.
 */

export interface DocumentChunk {
  /** 0-based page index estimate */
  pageEstimate: number;
  /** Classified section type */
  sectionType:
    | "claim_form"
    | "police_report"
    | "repair_quote"
    | "vehicle_photos"
    | "supporting_document"
    | "unknown";
  /** Raw text for this chunk */
  text: string;
  /** Whether this chunk likely contains handwritten text */
  likelyHandwritten: boolean;
  /** Whether this chunk contains a table-like structure */
  containsTable: boolean;
  /** Confidence in the section classification 0-100 */
  classificationConfidence: number;
}

export interface PreprocessorOutput {
  chunks: DocumentChunk[];
  totalChunks: number;
  hasMultipleDocuments: boolean;
  repairQuoteChunks: DocumentChunk[];
  claimFormChunks: DocumentChunk[];
  policeReportChunks: DocumentChunk[];
  /** Concatenated text from repair quote sections only — for targeted extraction */
  repairQuoteText: string;
  /** Concatenated text from claim form sections only — for targeted extraction */
  claimFormText: string;
  /** Concatenated text from police report sections only */
  policeReportText: string;
  /** Full concatenated text of all chunks */
  fullText: string;
}

// ─── Section detection patterns ───────────────────────────────────────────────

const CLAIM_FORM_PATTERNS = [
  /claim\s*(form|number|no\.?|ref)/i,
  /policy\s*(number|no\.?)/i,
  /insured\s*(name|person)/i,
  /claimant/i,
  /date\s*of\s*(accident|incident|loss)/i,
  /motor\s*vehicle\s*accident/i,
  /fnol/i,
  /first\s*notification/i,
];

const POLICE_REPORT_PATTERNS = [
  /police\s*(report|station|case|ref)/i,
  /rb\s*no\.?/i,
  /cr\s*no\.?/i,
  /cid\s*\//i,
  /officer\s*(name|badge|rank)/i,
  /charge\s*(sheet|number)/i,
  /investigating\s*officer/i,
  /case\s*number/i,
];

const REPAIR_QUOTE_PATTERNS = [
  /quotation/i,
  /repair\s*(estimate|quote|cost)/i,
  /panel\s*beat/i,
  /labour\s*(cost|charge|rate)/i,
  /parts?\s*(cost|list|total)/i,
  /total\s*(incl|excl|vat|repair)/i,
  /grand\s*total/i,
  /skinners/i,
  /workshop/i,
  /body\s*shop/i,
  /invoice\s*(no\.?|number)/i,
];

const HANDWRITING_HINTS = [
  /agreed\s*(cost|amount|usd|zwd)/i,
  /signed\s*by/i,
  /authorised\s*by/i,
  /witness\s*signature/i,
  /\[handwritten\]/i,
  /\(signed\)/i,
];

const TABLE_HINTS = [
  /\|\s*\w+\s*\|/,           // pipe-delimited
  /\t\w+\t\w+/,              // tab-delimited
  /^\s*\d+\.\s+\w.+\$\s*[\d,]+/m,  // numbered list with prices
  /description\s+qty\s+unit/i,
  /item\s+description\s+amount/i,
  /labour\s+parts\s+total/i,
];

// ─── Page splitter ────────────────────────────────────────────────────────────

/**
 * splitIntoPages
 *
 * Attempts to split raw text into page-sized chunks using common page
 * boundary markers. Falls back to character-count-based splitting if
 * no markers are found.
 */
function splitIntoPages(rawText: string): string[] {
  // Try form-feed characters (standard PDF page break)
  if (rawText.includes("\f")) {
    return rawText.split("\f").map(p => p.trim()).filter(p => p.length > 0);
  }

  // Try "Page X of Y" markers
  const pageMarker = /(?:^|\n)(?:page\s+\d+\s+of\s+\d+|---\s*page\s*\d+\s*---|={3,})/gi;
  const parts = rawText.split(pageMarker).map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length > 1) return parts;

  // Try double-newline paragraph blocks as pseudo-pages
  const paragraphs = rawText.split(/\n{3,}/).map(p => p.trim()).filter(p => p.length > 50);
  if (paragraphs.length > 1) return paragraphs;

  // Fall back: split by ~2000 character windows with sentence boundary respect
  if (rawText.length > 3000) {
    const chunks: string[] = [];
    const windowSize = 2500;
    let pos = 0;
    while (pos < rawText.length) {
      let end = Math.min(pos + windowSize, rawText.length);
      // Try to break at a sentence boundary
      const sentenceEnd = rawText.lastIndexOf(".", end);
      if (sentenceEnd > pos + 500) end = sentenceEnd + 1;
      chunks.push(rawText.slice(pos, end).trim());
      pos = end;
    }
    return chunks.filter(c => c.length > 0);
  }

  return [rawText];
}

// ─── Section classifier ───────────────────────────────────────────────────────

function classifyChunk(text: string): {
  sectionType: DocumentChunk["sectionType"];
  confidence: number;
} {
  let claimScore = 0;
  let policeScore = 0;
  let quoteScore = 0;

  for (const p of CLAIM_FORM_PATTERNS) if (p.test(text)) claimScore++;
  for (const p of POLICE_REPORT_PATTERNS) if (p.test(text)) policeScore++;
  for (const p of REPAIR_QUOTE_PATTERNS) if (p.test(text)) quoteScore++;

  const max = Math.max(claimScore, policeScore, quoteScore);
  if (max === 0) return { sectionType: "unknown", confidence: 30 };

  if (quoteScore === max && quoteScore >= 2) {
    return { sectionType: "repair_quote", confidence: Math.min(95, 50 + quoteScore * 10) };
  }
  if (policeScore === max && policeScore >= 2) {
    return { sectionType: "police_report", confidence: Math.min(95, 50 + policeScore * 10) };
  }
  if (claimScore === max && claimScore >= 2) {
    return { sectionType: "claim_form", confidence: Math.min(95, 50 + claimScore * 10) };
  }

  // Single-match classification — lower confidence
  if (quoteScore > 0) return { sectionType: "repair_quote", confidence: 45 };
  if (policeScore > 0) return { sectionType: "police_report", confidence: 45 };
  if (claimScore > 0) return { sectionType: "claim_form", confidence: 45 };

  return { sectionType: "supporting_document", confidence: 35 };
}

// ─── Main preprocessor ───────────────────────────────────────────────────────

/**
 * preprocessDocument
 *
 * Entry point. Takes the full raw text from Stage 2 and returns a
 * PreprocessorOutput with labelled chunks and targeted text slices.
 */
export function preprocessDocument(rawText: string): PreprocessorOutput {
  if (!rawText || rawText.trim().length === 0) {
    return {
      chunks: [],
      totalChunks: 0,
      hasMultipleDocuments: false,
      repairQuoteChunks: [],
      claimFormChunks: [],
      policeReportChunks: [],
      repairQuoteText: "",
      claimFormText: "",
      policeReportText: "",
      fullText: "",
    };
  }

  const pages = splitIntoPages(rawText);
  const chunks: DocumentChunk[] = pages.map((text, idx) => {
    const { sectionType, confidence } = classifyChunk(text);
    const likelyHandwritten = HANDWRITING_HINTS.some(p => p.test(text));
    const containsTable = TABLE_HINTS.some(p => p.test(text));

    return {
      pageEstimate: idx,
      sectionType,
      text,
      likelyHandwritten,
      containsTable,
      classificationConfidence: confidence,
    };
  });

  // Detect multi-document: if we see 2+ distinct section types each with ≥2 chunks
  const typeCounts = new Map<string, number>();
  for (const c of chunks) {
    typeCounts.set(c.sectionType, (typeCounts.get(c.sectionType) || 0) + 1);
  }
  const hasMultipleDocuments =
    [...typeCounts.entries()].filter(([k, v]) => k !== "unknown" && v >= 1).length >= 2;

  const repairQuoteChunks = chunks.filter(c => c.sectionType === "repair_quote");
  const claimFormChunks = chunks.filter(c => c.sectionType === "claim_form");
  const policeReportChunks = chunks.filter(c => c.sectionType === "police_report");

  // If no chunks were classified as repair_quote, use the last 40% of the document
  // (quotes are almost always at the end)
  const effectiveQuoteChunks =
    repairQuoteChunks.length > 0
      ? repairQuoteChunks
      : chunks.slice(Math.floor(chunks.length * 0.6));

  return {
    chunks,
    totalChunks: chunks.length,
    hasMultipleDocuments,
    repairQuoteChunks: effectiveQuoteChunks,
    claimFormChunks: claimFormChunks.length > 0 ? claimFormChunks : chunks.slice(0, Math.ceil(chunks.length * 0.4)),
    policeReportChunks,
    repairQuoteText: effectiveQuoteChunks.map(c => c.text).join("\n\n"),
    claimFormText: (claimFormChunks.length > 0 ? claimFormChunks : chunks.slice(0, Math.ceil(chunks.length * 0.4))).map(c => c.text).join("\n\n"),
    policeReportText: policeReportChunks.map(c => c.text).join("\n\n"),
    fullText: rawText,
  };
}
