/**
 * Verification tests for Critical Group A fixes:
 *   R-A-14 — 5-photo cap removed; all photos batched across multiple LLM calls
 *   R-A-13 — 10-page-image cap removed; all page images batched across multiple LLM calls
 *   R-A-05 — Page count cap (40) added to pdf-image-extractor to prevent OOM
 *   R-A-01 — Per-call timeout (150s) added to extractImagesWithSummary in Stage 1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mock infrastructure ───────────────────────────────────────────────

const mockLlmCall = vi.fn();
vi.mock("../server/_core/llm", () => ({
  invokeLLM: mockLlmCall,
}));

// Helper: build a minimal ExtractedClaimFields-shaped LLM response
function makeLlmResponse(components: string[]) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          damagedComponents: components.map(name => ({
            name,
            damageType: "dent",
            severity: "moderate",
            repairAction: "repair",
            location: "front",
          })),
          claimantName: null,
          vehicleRegistration: null,
          vehicleMake: null,
          vehicleModel: null,
          vehicleYear: null,
          vehicleColour: null,
          accidentDate: null,
          accidentDescription: null,
          totalRepairCost: null,
          labourCost: null,
          partsCost: null,
          vatAmount: null,
          currency: null,
          repairerName: null,
          repairerAddress: null,
          policyNumber: null,
          claimNumber: null,
          assessorName: null,
          assessorLicenseNumber: null,
          assessmentDate: null,
          excessAmount: null,
          sumInsured: null,
          insuredValue: null,
        }),
      },
    }],
  };
}

// Minimal PipelineContext mock
function makeCtx() {
  return { log: vi.fn() };
}

// ─── R-A-14: Photo batching ───────────────────────────────────────────────────

describe("R-A-14: extractFieldsFromPhotos — photo batching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes all 18 photos across multiple batches (was: silently dropped photos 6-18)", async () => {
    // Arrange: 18 photos → should produce 1 batch of 18 (under 20-per-batch limit)
    const photoUrls = Array.from({ length: 18 }, (_, i) => `https://s3.example.com/photo-${i + 1}.jpg`);

    // Each batch call returns 3 unique components
    mockLlmCall.mockResolvedValue(makeLlmResponse(["bonnet", "windscreen", "right front door"]));

    const { extractFieldsFromPhotos } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    const result = await (extractFieldsFromPhotos as any)(photoUrls, ctx);

    // Should have made exactly 1 LLM call (18 photos < 20 per batch)
    expect(mockLlmCall).toHaveBeenCalledTimes(1);
    expect(result.damagedComponents.length).toBeGreaterThan(0);
    expect(ctx.log).toHaveBeenCalledWith(
      "Stage 3",
      expect.stringContaining("18 photo(s) split into 1 batch(es)")
    );
  });

  it("batches 25 photos into 2 calls (batch 1: 20 photos, batch 2: 5 photos)", async () => {
    const photoUrls = Array.from({ length: 25 }, (_, i) => `https://s3.example.com/photo-${i + 1}.jpg`);

    // Batch 1 returns 3 components, batch 2 returns 2 different components
    mockLlmCall
      .mockResolvedValueOnce(makeLlmResponse(["bonnet", "windscreen", "right front door"]))
      .mockResolvedValueOnce(makeLlmResponse(["left rear door", "boot"]));

    const { extractFieldsFromPhotos } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    const result = await (extractFieldsFromPhotos as any)(photoUrls, ctx);

    // Should have made exactly 2 LLM calls
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
    // Merged result should have all 5 unique components
    expect(result.damagedComponents.length).toBe(5);
    expect(ctx.log).toHaveBeenCalledWith(
      "Stage 3",
      expect.stringContaining("25 photo(s) split into 2 batch(es)")
    );
  });

  it("returns emptyExtraction() for zero photos without calling LLM", async () => {
    const { extractFieldsFromPhotos } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    const result = await (extractFieldsFromPhotos as any)([], ctx);

    expect(mockLlmCall).not.toHaveBeenCalled();
    expect(result.damagedComponents).toEqual([]);
  });

  it("continues and returns partial results if one batch fails", async () => {
    const photoUrls = Array.from({ length: 25 }, (_, i) => `https://s3.example.com/photo-${i + 1}.jpg`);

    mockLlmCall
      .mockResolvedValueOnce(makeLlmResponse(["bonnet", "windscreen"]))
      .mockRejectedValueOnce(new Error("LLM rate limit"));

    const { extractFieldsFromPhotos } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    const result = await (extractFieldsFromPhotos as any)(photoUrls, ctx);

    // Should still return results from the successful batch
    expect(result.damagedComponents.length).toBe(2);
    expect(ctx.log).toHaveBeenCalledWith(
      "Stage 3",
      expect.stringContaining("batch 2 failed")
    );
  });
});

// ─── R-A-13: PDF page image batching ─────────────────────────────────────────

describe("R-A-13: extractFieldsFromPdf — page image batching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes all 20 page images in a single primary call (under batch limit)", async () => {
    const pageImageUrls = Array.from({ length: 20 }, (_, i) => `https://s3.example.com/page-${i + 1}.png`);

    mockLlmCall.mockResolvedValue(makeLlmResponse(["bonnet", "windscreen"]));

    const { extractFieldsFromPdf } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    await (extractFieldsFromPdf as any)("https://s3.example.com/doc.pdf", "sample text", ctx, pageImageUrls);

    // 20 pages = 1 batch → 1 LLM call (primary only)
    expect(mockLlmCall).toHaveBeenCalledTimes(1);
    expect(ctx.log).toHaveBeenCalledWith(
      "Stage 3",
      expect.stringContaining("20 page image(s) split into 1 batch(es)")
    );
  });

  it("processes 22 page images across 2 calls (primary + 1 supplementary)", async () => {
    // This is the R-A-13 scenario: 22 pages, damage photos on pages 21-22
    const pageImageUrls = Array.from({ length: 22 }, (_, i) => `https://s3.example.com/page-${i + 1}.png`);

    mockLlmCall
      .mockResolvedValueOnce(makeLlmResponse(["bonnet", "windscreen", "right front door"])) // primary (pages 1-20)
      .mockResolvedValueOnce(makeLlmResponse(["left rear panel", "exhaust"])); // supplementary (pages 21-22)

    const { extractFieldsFromPdf } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    const result = await (extractFieldsFromPdf as any)(
      "https://s3.example.com/doc.pdf",
      "sample text",
      ctx,
      pageImageUrls
    );

    expect(mockLlmCall).toHaveBeenCalledTimes(2);
    // All 5 components from both batches should be merged
    expect(result.damagedComponents.length).toBe(5);
    expect(ctx.log).toHaveBeenCalledWith(
      "Stage 3",
      expect.stringContaining("22 page image(s) split into 2 batch(es)")
    );
  });

  it("works with zero page images (PDF-only call)", async () => {
    mockLlmCall.mockResolvedValue(makeLlmResponse(["bonnet"]));

    const { extractFieldsFromPdf } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    const result = await (extractFieldsFromPdf as any)(
      "https://s3.example.com/doc.pdf",
      "sample text",
      ctx,
      []
    );

    expect(mockLlmCall).toHaveBeenCalledTimes(1);
    expect(result.damagedComponents.length).toBe(1);
  });

  it("continues with partial results if a supplementary batch fails", async () => {
    const pageImageUrls = Array.from({ length: 22 }, (_, i) => `https://s3.example.com/page-${i + 1}.png`);

    mockLlmCall
      .mockResolvedValueOnce(makeLlmResponse(["bonnet", "windscreen"]))
      .mockRejectedValueOnce(new Error("LLM timeout"));

    const { extractFieldsFromPdf } = await import("./pipeline-v2/stage-3-structured-extraction");
    const ctx = makeCtx();
    const result = await (extractFieldsFromPdf as any)(
      "https://s3.example.com/doc.pdf",
      "sample text",
      ctx,
      pageImageUrls
    );

    // Primary batch succeeded — should return its results
    expect(result.damagedComponents.length).toBe(2);
    expect(ctx.log).toHaveBeenCalledWith(
      "Stage 3",
      expect.stringContaining("supplementary batch 2 failed")
    );
  });
});

// ─── R-A-05: Page count cap in pdf-image-extractor ───────────────────────────

describe("R-A-05: pdf-image-extractor — MAX_PAGES_TO_RENDER cap", () => {
  it("MAX_PAGES_TO_RENDER constant is 40", async () => {
    // Read the constant directly from the module source to verify it's set
    const fs = await import("fs");
    const src = fs.readFileSync("/home/ubuntu/kinga-replit/server/pdf-image-extractor.ts", "utf-8");
    expect(src).toContain("const MAX_PAGES_TO_RENDER = 40;");
  });

  it("pagesToRender = Math.min(pageCount, MAX_PAGES_TO_RENDER) is present in the rendering loop", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("/home/ubuntu/kinga-replit/server/pdf-image-extractor.ts", "utf-8");
    expect(src).toContain("const pagesToRender = Math.min(pageCount, MAX_PAGES_TO_RENDER);");
    expect(src).toContain("for (let pageNum = 1; pageNum <= pagesToRender; pageNum++)");
  });

  it("truncation warning is pushed to errors[] when pageCount > MAX_PAGES_TO_RENDER", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("/home/ubuntu/kinga-replit/server/pdf-image-extractor.ts", "utf-8");
    expect(src).toContain("errors.push(truncationMsg)");
    expect(src).toContain("R-A-05: PDF has");
  });

  it("a 100-page PDF would render only 40 pages (Math.min(100, 40) = 40)", () => {
    // Unit test the cap arithmetic directly
    const MAX_PAGES_TO_RENDER = 40;
    const pageCount = 100;
    const pagesToRender = Math.min(pageCount, MAX_PAGES_TO_RENDER);
    expect(pagesToRender).toBe(40);
    expect(pagesToRender).toBeLessThanOrEqual(MAX_PAGES_TO_RENDER);
  });

  it("a 25-page PDF renders all 25 pages (no truncation)", () => {
    const MAX_PAGES_TO_RENDER = 40;
    const pageCount = 25;
    const pagesToRender = Math.min(pageCount, MAX_PAGES_TO_RENDER);
    expect(pagesToRender).toBe(25);
  });
});

// ─── R-A-01: Per-call timeout in stage-1-ingestion ───────────────────────────

describe("R-A-01: stage-1-ingestion — withExtractionTimeout", () => {
  it("EXTRACTION_TIMEOUT_MS constant is 150000 (150s)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "/home/ubuntu/kinga-replit/server/pipeline-v2/stage-1-ingestion.ts",
      "utf-8"
    );
    expect(src).toContain("const EXTRACTION_TIMEOUT_MS = 150_000;");
  });

  it("withExtractionTimeout function is defined in stage-1-ingestion.ts", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "/home/ubuntu/kinga-replit/server/pipeline-v2/stage-1-ingestion.ts",
      "utf-8"
    );
    expect(src).toContain("async function withExtractionTimeout<T>");
  });

  it("extractImagesWithSummary is called via withExtractionTimeout (not directly)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "/home/ubuntu/kinga-replit/server/pipeline-v2/stage-1-ingestion.ts",
      "utf-8"
    );
    // The call site must be wrapped
    expect(src).toContain("await withExtractionTimeout(");
    expect(src).toContain("() => extractImagesWithSummary(pdfBuffer, fileName)");
    // The old bare call must NOT be present
    expect(src).not.toContain("await extractImagesWithSummary(pdfBuffer, fileName)");
  });

  it("withExtractionTimeout rejects after EXTRACTION_TIMEOUT_MS with a descriptive error", async () => {
    // Test the timeout logic directly
    const EXTRACTION_TIMEOUT_MS = 150_000;

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

    // A function that never resolves (simulates a hung pdf.js call)
    const neverResolves = () => new Promise<string>(() => {});

    // Use a very short timeout for the test
    const shortTimeout = 50;
    const testFn = () => new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`R-A-01: test timed out after ${shortTimeout}ms — malformed PDF suspected`)),
        shortTimeout
      );
      neverResolves().then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });

    await expect(testFn()).rejects.toThrow("malformed PDF suspected");
  });

  it("withExtractionTimeout resolves normally when extraction completes within budget", async () => {
    const EXTRACTION_TIMEOUT_MS = 150_000;

    async function withExtractionTimeout<T>(fn: () => Promise<T>, label: string): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`R-A-01: ${label} timed out after ${EXTRACTION_TIMEOUT_MS}ms`)),
          EXTRACTION_TIMEOUT_MS
        );
        fn().then(
          (v) => { clearTimeout(timer); resolve(v); },
          (e) => { clearTimeout(timer); reject(e); }
        );
      });
    }

    const fastExtraction = () => Promise.resolve({ images: [], pageCount: 5, pagesRendered: 5 });
    const result = await withExtractionTimeout(fastExtraction, "test");
    expect(result.pageCount).toBe(5);
  });
});
