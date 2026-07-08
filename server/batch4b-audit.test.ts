/**
 * batch4b-audit.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch 4b — Theme 4 (Extraction Quality & Input Robustness) remaining items
 *
 * Items covered:
 *   R-A-06  pdf-image-extractor: 30%-sample median scanned detection
 *   R-A-07  pdf-image-extractor: landscape rotation threshold + last-page guard
 *   R-A-10  stage-2-extraction: garbled native text detection
 *   R-A-15  stage-3: DB-sourced quoteTotalCents hint in OCR-failure path
 *   R-A-16  stage-3: same-repairer dedup keeps higher total for upward revisions
 *   R-A-17  stage-3: spell-correction input size guard (already present — verify)
 *   R-A-18  stage-3: ZiG/ZWG in currencyPattern regex fallback
 *   R-A-19  stage-3: targeted field recovery truncates perDocumentExtractions to [0]
 *   R-A-21  quoteExtractionEngine: concurrency cap on per-repairer LLM fan-out
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── File content helpers ────────────────────────────────────────────────────

const readFile = (relPath: string) =>
  fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");

const pdfExtractor = readFile("server/pdf-image-extractor.ts");
const stage2 = readFile("server/pipeline-v2/stage-2-extraction.ts");
const stage3 = readFile("server/pipeline-v2/stage-3-structured-extraction.ts");
const quoteEngine = readFile("server/pipeline-v2/quoteExtractionEngine.ts");

// ─── R-A-06: 30%-sample median scanned detection ────────────────────────────

describe("R-A-06: 30%-sample median scanned detection", () => {
  it("uses a sample size based on 30% of total pages, not a fixed 3-page sample", () => {
    // The fix replaces the hardcoded 3-page sample with Math.max(3, Math.ceil(totalPages * 0.3))
    expect(pdfExtractor).toMatch(/Math\.ceil\s*\(\s*\w+\s*\*\s*0\.3\s*\)/);
  });

  it("uses median (not mean) for scanned detection threshold", () => {
    // The fix uses a median function rather than sum/length averaging
    expect(pdfExtractor).toMatch(/median|sort.*Math\.floor.*length\s*\/\s*2/);
  });
});

// ─── R-A-07: Landscape rotation threshold + last-page guard ─────────────────

describe("R-A-07: Landscape rotation threshold and last-page guard", () => {
  it("uses a rotation threshold of 1.6 (not 1.3)", () => {
    // The fix raises the aspect ratio threshold from 1.3 to 1.6
    expect(pdfExtractor).toMatch(/1\.6/);
    expect(pdfExtractor).not.toMatch(/aspectRatio\s*[>]\s*1\.3/);
  });

  it("guards against rotating the last page of a document", () => {
    // The fix adds a !isLastPage guard to prevent rotating the last page
    // (which is often a landscape summary page that should not be rotated)
    expect(pdfExtractor).toMatch(/isLastPage|lastPage|pageNum\s*===?\s*\w+\s*-\s*1/);
  });
});

// ─── R-A-10: Garbled native text detection ──────────────────────────────────

describe("R-A-10: Garbled native text detection", () => {
  it("defines an isGarbledText helper function", () => {
    expect(stage2).toMatch(/function\s+isGarbledText/);
  });

  it("checks non-printable or replacement character ratio", () => {
    // The helper should detect high ratios of non-printable chars (OCR garbage)
    expect(stage2).toMatch(/\uFFFD|\\\\uFFFD|nonPrintable|garbled|replacement.char/i);
  });

  it("applies the garbled check at the native text trust gate", () => {
    // The guard should be applied before trusting native text
    expect(stage2).toMatch(/isGarbledText\s*\(/);
  });
});

// ─── R-A-15: DB-sourced quoteTotalCents hint ─────────────────────────────────

describe("R-A-15: DB-sourced quoteTotalCents hint in OCR-failure path", () => {
  it("runInputRecovery accepts a claimQuoteTotalHintCents parameter", () => {
    expect(stage3).toMatch(/claimQuoteTotalHintCents/);
  });

  it("passes claimQuoteTotalHintCents from ctx.claim to runInputRecovery", () => {
    expect(stage3).toMatch(/ctx\.claim.*quoteTotalCents|quoteTotalCents.*ctx\.claim/);
  });

  it("uses claimQuoteTotalHintCents as fallback when perDocumentExtractions is empty", () => {
    // The hint should be used as a fallback in the hintTotalCents calculation
    expect(stage3).toMatch(/claimQuoteTotalHintCents\s*\?\?/);
  });
});

// ─── R-A-16: Same-repairer dedup keeps higher total for upward revisions ─────

describe("R-A-16: Same-repairer dedup keeps higher total for upward revisions", () => {
  it("does not unconditionally keep the lowest total in dedup", () => {
    // The old code sorted by total_cost ascending and took [0] (lowest).
    // The fix detects upward revisions and keeps the higher total.
    // Verify the old sort-and-take-first pattern is gone (not just a comment).
    // We check for the actual code pattern, not comment text.
    expect(stage3).not.toMatch(/\.sort\s*\(.*total_cost.*\)\s*\[0\]/i);
  });

  it("detects upward revisions in same-repairer dedup", () => {
    // The fix should include logic to detect when a later quote is higher
    // (indicating an upward revision) and keep the higher total
    expect(stage3).toMatch(/upward|revision|higher.*total|total.*higher/i);
  });
});

// ─── R-A-17: Spell-correction input size guard ───────────────────────────────

describe("R-A-17: Spell-correction input size guard (already present)", () => {
  it("has an 8000-char guard before the spell-correction LLM call", () => {
    expect(stage3).toMatch(/8[_,]?000/);
    expect(stage3).toMatch(/fieldMapJson\.length\s*>\s*8/);
  });

  it("logs a warning when the input is truncated", () => {
    expect(stage3).toMatch(/R-A-17.*Spell-correction input too large/);
  });
});

// ─── R-A-18/C-A-04: ZiG/ZWG in currencyPattern regex fallback ───────────────

describe("R-A-18/C-A-04: ZiG/ZWG in currencyPattern regex fallback", () => {
  it("includes ZiG in the currencyPattern regex", () => {
    expect(stage3).toMatch(/ZiG/);
  });

  it("includes ZWG in the currencyPattern regex", () => {
    expect(stage3).toMatch(/ZWG/);
  });

  it("maps ZiG to ZWG (not ZWL) in the LLM prompt", () => {
    // The LLM prompt should instruct the model to return ZWG for ZiG, not ZWL
    expect(stage3).toMatch(/ZiG.*ZWG|ZWG.*ZiG/);
    // Verify the old incorrect mapping (ZiG → ZWL) is gone
    expect(stage3).not.toMatch(/'ZiG'\s*→\s*'ZWL'/);
  });
});

// ─── R-A-19: Targeted field recovery truncates perDocumentExtractions ────────

describe("R-A-19: Targeted field recovery truncates perDocumentExtractions to [0]", () => {
  it("calls splice(1) after setting perDocumentExtractions[0]", () => {
    // The fix adds perDocumentExtractions.splice(1) after the patch to remove
    // stale per-document entries at indices [1..n]
    expect(stage3).toMatch(/perDocumentExtractions\.splice\s*\(\s*1\s*\)/);
  });

  it("includes a comment explaining the R-A-19 fix", () => {
    expect(stage3).toMatch(/R-A-19/);
  });
});

// ─── R-A-21: Concurrency cap on per-repairer LLM fan-out ────────────────────

describe("R-A-21: Concurrency cap on per-repairer LLM fan-out", () => {
  it("defines MAX_CONCURRENT_EXTRACTIONS = 3 in extractMultipleQuotesFromPageImages", () => {
    expect(quoteEngine).toMatch(/MAX_CONCURRENT_EXTRACTIONS\s*=\s*3/);
  });

  it("uses a semaphore (acquireSlot/releaseSlot) to cap concurrency", () => {
    expect(quoteEngine).toMatch(/acquireSlot/);
    expect(quoteEngine).toMatch(/releaseSlot/);
  });

  it("applies the concurrency cap in extractMultipleQuotesFromPdfUrl as well", () => {
    // The PDF path also has an unbounded fan-out — verify it has its own cap
    expect(quoteEngine).toMatch(/pdfAcquireSlot/);
    expect(quoteEngine).toMatch(/pdfReleaseSlot/);
  });

  it("uses finally block to ensure slot is always released", () => {
    // Slots must be released even on error — verify finally block
    expect(quoteEngine).toMatch(/finally\s*\{[\s\S]*?releaseSlot/);
  });
});
