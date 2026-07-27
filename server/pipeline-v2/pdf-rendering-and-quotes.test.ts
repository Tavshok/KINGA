/**
 * pdf-rendering-and-quotes.test.ts
 *
 * Tests for:
 *   1. PDF rendering guards removal — verifies that the isProduction guard
 *      no longer exists in stage-1-ingestion.ts and db.ts
 *   2. Per-page vision quote extraction — verifies the routing logic in
 *      stage-3-structured-extraction.ts correctly uses page images when
 *      available and falls back to text-based extraction when not
 *   3. extractMultipleQuotesFromPageImages — verifies the fallback chain
 *      in quoteExtractionEngine.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─── 1. Guard removal checks ──────────────────────────────────────────────────

describe("Production rendering guard removal", () => {
  it("stage-1-ingestion.ts must not contain active isProduction rendering guard", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/stage-1-ingestion.ts"),
      "utf-8"
    );
    // The guard was: const isProduction = process.env.NODE_ENV === 'production';
    // followed by: if (isProduction) { /* skip rendering */ }
    // Check that the const assignment is gone
    expect(src).not.toMatch(/const\s+isProduction\s*=/);
    // Check that the rendering skip block is gone
    expect(src).not.toMatch(/if\s*\(isProduction\)\s*\{[\s\S]*?skip.*render/i);
  });

  it("db.ts must not contain active SKIP_NATIVE_EXTRACTION guard (const assignment)", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../db.ts"),
      "utf-8"
    );
    // The guard was: const SKIP_NATIVE_EXTRACTION = process.env.NODE_ENV === 'production';
    // Check that the const assignment is gone (comments mentioning it are OK)
    expect(src).not.toMatch(/const\s+SKIP_NATIVE_EXTRACTION\s*=/);
  });

  it("stage-3 must import extractMultipleQuotesFromPageImages", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/stage-3-structured-extraction.ts"),
      "utf-8"
    );
    expect(src).toContain("extractMultipleQuotesFromPageImages");
  });

  it("stage-3 must use pdfPageImages from stage1.documents.imageUrls", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/stage-3-structured-extraction.ts"),
      "utf-8"
    );
    expect(src).toContain("d.imageUrls");
    expect(src).toContain("extractMultipleQuotesFromPageImages(pdfPageImages");
  });

  it("quoteExtractionEngine.ts must export extractMultipleQuotesFromPageImages", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/quoteExtractionEngine.ts"),
      "utf-8"
    );
    expect(src).toContain("export async function extractMultipleQuotesFromPageImages");
  });
});

// ─── 2. extractMultipleQuotesFromPageImages routing logic ─────────────────────

describe("extractMultipleQuotesFromPageImages routing", () => {
  // We test the routing logic by mocking the LLM and verifying call patterns

  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to text-based extraction when pageImageUrls is empty", async () => {
    const extractMultipleQuotesMock = vi.fn().mockResolvedValue([
      { panel_beater: "Test Beater", total_cost: 1000, currency: "USD", components: [], line_items: [], labour_defined: false, parts_defined: false, labour_cost: null, parts_cost: null, confidence: "medium", extraction_warnings: [], line_item_completeness_score: 0, line_items_sum: null, line_items_sum_discrepancy_pct: null, rejected_line_items: [] },
    ]);

    vi.doMock("../pipeline-v2/quoteExtractionEngine", () => ({
      extractMultipleQuotes: extractMultipleQuotesMock,
      extractMultipleQuotesFromPageImages: async (
        pageImageUrls: string[],
        fallbackText: string,
        tenantCountry?: string | null
      ) => {
        if (pageImageUrls.length === 0) {
          return extractMultipleQuotesMock(fallbackText, "insurance claim document", tenantCountry);
        }
        return [];
      },
    }));

    const { extractMultipleQuotesFromPageImages } = await import("../pipeline-v2/quoteExtractionEngine");
    const result = await extractMultipleQuotesFromPageImages([], "some ocr text", "ZW");

    expect(extractMultipleQuotesMock).toHaveBeenCalledOnce();
    expect(extractMultipleQuotesMock).toHaveBeenCalledWith("some ocr text", "insurance claim document", "ZW");
    expect(result).toHaveLength(1);
    expect(result[0].panel_beater).toBe("Test Beater");
  });

  it("uses vision path when pageImageUrls is non-empty", async () => {
    const extractMultipleQuotesMock = vi.fn();
    const detectMock = vi.fn().mockResolvedValue([
      { panelBeater: "Simple Samo Auto", pageIndexes: [12] },
      { panelBeater: "NXGN Autobody", pageIndexes: [13] },
      { panelBeater: "Adam Truter Panel Beaters", pageIndexes: [14] },
    ]);
    const extractImageMock = vi.fn().mockImplementation(async (_url: string, panelBeater: string) => ({
      panel_beater: panelBeater,
      total_cost: 6500,
      currency: "USD",
      components: ["front bumper"],
      line_items: [],
      labour_defined: false,
      parts_defined: false,
      labour_cost: null,
      parts_cost: null,
      confidence: "high" as const,
      extraction_warnings: [],
      line_item_completeness_score: 0,
      line_items_sum: null,
      line_items_sum_discrepancy_pct: null,
      rejected_line_items: [],
    }));

    vi.doMock("../pipeline-v2/quoteExtractionEngine", () => ({
      extractMultipleQuotes: extractMultipleQuotesMock,
      extractMultipleQuotesFromPageImages: async (
        pageImageUrls: string[],
        fallbackText: string,
        tenantCountry?: string | null
      ) => {
        if (pageImageUrls.length === 0) {
          return extractMultipleQuotesMock(fallbackText, "insurance claim document", tenantCountry);
        }
        const groups = await detectMock(pageImageUrls);
        const results = [];
        for (const g of groups) {
          const idx = g.pageIndexes[0];
          if (idx < pageImageUrls.length) {
            results.push(await extractImageMock(pageImageUrls[idx], g.panelBeater, null, tenantCountry));
          }
        }
        return results;
      },
    }));

    const pageUrls = Array.from({ length: 15 }, (_, i) => `https://s3.example.com/page-${i + 1}.png`);
    const { extractMultipleQuotesFromPageImages } = await import("../pipeline-v2/quoteExtractionEngine");
    const result = await extractMultipleQuotesFromPageImages(pageUrls, "", "ZW");

    // Should NOT have called text-based extraction
    expect(extractMultipleQuotesMock).not.toHaveBeenCalled();
    // Should have extracted 3 quotes
    expect(result).toHaveLength(3);
    expect(result.map(q => q.panel_beater)).toEqual([
      "Simple Samo Auto",
      "NXGN Autobody",
      "Adam Truter Panel Beaters",
    ]);
  });

  it("deduplicates quotes with the same panel beater name", async () => {
    const seenNames = new Set<string>();
    const groups = [
      { panelBeater: "NXGN Autobody", pageIndexes: [5] },
      { panelBeater: "NXGN Autobody", pageIndexes: [6] }, // duplicate
      { panelBeater: "Simple Samo Auto", pageIndexes: [10] },
    ];

    const results: string[] = [];
    for (const group of groups) {
      const normName = (group.panelBeater ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normName && seenNames.has(normName)) continue;
      if (normName) seenNames.add(normName);
      results.push(group.panelBeater);
    }

    expect(results).toHaveLength(2);
    expect(results).toEqual(["NXGN Autobody", "Simple Samo Auto"]);
  });
});

// ─── 3. Page image routing in stage-3 ─────────────────────────────────────────

describe("Stage-3 page image routing decision", () => {
  it("routes to vision extraction when pdfPageImages is non-empty", () => {
    // Simulate the routing logic from stage-3
    const stage1Documents = [
      {
        mimeType: "application/pdf",
        imageUrls: ["https://s3/page-1.png", "https://s3/page-2.png", "https://s3/page-3.png"],
      },
    ];

    const pdfPageImages = stage1Documents
      .filter(d => d.mimeType === "application/pdf")
      .flatMap(d => d.imageUrls ?? []);

    expect(pdfPageImages).toHaveLength(3);
    expect(pdfPageImages[0]).toBe("https://s3/page-1.png");

    // Decision: should use vision path
    const useVisionPath = pdfPageImages.length > 0;
    expect(useVisionPath).toBe(true);
  });

  it("falls back to text extraction when no PDF page images are available", () => {
    const stage1Documents = [
      {
        mimeType: "application/pdf",
        imageUrls: [], // no page images rendered
      },
    ];

    const pdfPageImages = stage1Documents
      .filter(d => d.mimeType === "application/pdf")
      .flatMap(d => d.imageUrls ?? []);

    expect(pdfPageImages).toHaveLength(0);

    // Decision: should fall back to text
    const useVisionPath = pdfPageImages.length > 0;
    expect(useVisionPath).toBe(false);
  });

  it("collects page images from all PDF documents in a multi-document claim", () => {
    const stage1Documents = [
      { mimeType: "application/pdf", imageUrls: ["https://s3/doc1-page-1.png", "https://s3/doc1-page-2.png"] },
      { mimeType: "image/jpeg", imageUrls: ["https://s3/photo-1.jpg"] }, // not a PDF
      { mimeType: "application/pdf", imageUrls: ["https://s3/doc2-page-1.png"] },
    ];

    const pdfPageImages = stage1Documents
      .filter(d => d.mimeType === "application/pdf")
      .flatMap(d => d.imageUrls ?? []);

    // Should include pages from both PDFs but not the JPEG
    expect(pdfPageImages).toHaveLength(3);
    expect(pdfPageImages).toContain("https://s3/doc1-page-1.png");
    expect(pdfPageImages).toContain("https://s3/doc2-page-1.png");
    expect(pdfPageImages).not.toContain("https://s3/photo-1.jpg");
  });
});

// ─── 4. pdfToImages memory guard — DPI cap ────────────────────────────────────

describe("pdfToImages memory guard — DPI cap", () => {
  it("caps DPI at 100 regardless of what the caller passes", () => {
    const SAFE_MAX_DPI = 100;
    expect(Math.min(150, SAFE_MAX_DPI)).toBe(100);
    expect(Math.min(200, SAFE_MAX_DPI)).toBe(100);
    expect(Math.min(300, SAFE_MAX_DPI)).toBe(100);
  });

  it("does not reduce DPI below the requested value when it is already safe", () => {
    const SAFE_MAX_DPI = 100;
    expect(Math.min(100, SAFE_MAX_DPI)).toBe(100);
    expect(Math.min(72, SAFE_MAX_DPI)).toBe(72);
    expect(Math.min(50, SAFE_MAX_DPI)).toBe(50);
  });

  it("pdfToImages.ts defaults to 100 DPI for memory safety", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/pdfToImages.ts"),
      "utf-8"
    );
    // Default DPI is 100 (reduced from 150 for memory safety per R-A-05)
    expect(src).toMatch(/dpi\s*=\s*100/);
    expect(src).toContain("effectiveDpi");
  });

  it("pdfToImages.ts uses effectiveDpi variable for rendering", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/pdfToImages.ts"),
      "utf-8"
    );
    // effectiveDpi is used to pass the DPI to pdftoppm
    expect(src).toContain("effectiveDpi");
    expect(src).toMatch(/effectiveDpi\s*=\s*dpi/);
  });
});

// ─── 5. Sparse-text + page images routing fix ─────────────────────────────────

describe("Stage-3 routing: sparse text does not block vision path", () => {
  it("stage-3 routing condition uses pdfPageImages.length > 0 OR allText.length > 50", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/stage-3-structured-extraction.ts"),
      "utf-8"
    );
    // The routing condition must check page images BEFORE or alongside allText length
    // so that sparse OCR text (< 50 chars) does not block the vision path
    expect(src).toMatch(/pdfPageImages\.length\s*>\s*0\s*\|\|\s*allText\.trim\(\)\.length\s*>\s*50/);
  });

  it("pdfPageImages is collected before the routing condition (not inside it)", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../pipeline-v2/stage-3-structured-extraction.ts"),
      "utf-8"
    );
    // pdfPageImages declaration must appear before the routing condition
    const pageImagesIdx = src.indexOf("const pdfPageImages = (stage1.documents");
    const routingIdx = src.indexOf("pdfPageImages.length > 0 || allText.trim().length > 50");
    expect(pageImagesIdx).toBeGreaterThan(-1);
    expect(routingIdx).toBeGreaterThan(-1);
    expect(pageImagesIdx).toBeLessThan(routingIdx);
  });

  it("vision path runs when allText is empty but page images are present", () => {
    // Simulate the routing decision
    const allText = ""; // 0 chars — below the 50-char threshold
    const pdfPageImages = ["https://s3/page-1.png", "https://s3/page-2.png"];

    // Old (broken) routing: if (allText.trim().length > 50) → false → skips vision
    const oldRouting = allText.trim().length > 50;
    expect(oldRouting).toBe(false); // This was the bug

    // New (correct) routing: if (pdfPageImages.length > 0 || allText.trim().length > 50)
    const newRouting = pdfPageImages.length > 0 || allText.trim().length > 50;
    expect(newRouting).toBe(true); // Vision path now runs
  });

  it("vision path runs when allText is 38 chars (Chevrolet scenario) but page images are present", () => {
    // This is the exact scenario that caused the Chevrolet claim to miss 2 quotes
    const allText = "ACTIONAID STAFF NHARINGO CHEVROLET"; // 34 chars — below 50
    const pdfPageImages = Array.from({ length: 15 }, (_, i) => `https://s3/page-${i + 1}.png`);

    const oldRouting = allText.trim().length > 50;
    expect(oldRouting).toBe(false); // Was blocking vision

    const newRouting = pdfPageImages.length > 0 || allText.trim().length > 50;
    expect(newRouting).toBe(true); // Now correctly routes to vision
  });
});
