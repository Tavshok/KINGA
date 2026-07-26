/**
 * Tests for the PDF Image Extractor — pdftoppm pipeline.
 *
 * The engine uses renderPdfToImages (./pipeline-v2/pdfToImages) as its primary
 * rendering path. pdfjs-dist is used only for scan-type detection (Step 1).
 *
 * All vi.mock factories are self-contained (no external variable references)
 * because vi.mock is hoisted before variable declarations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock: pdfjs-dist (used for scan detection in Step 1) ─────────────────────
// Plain vi.fn() — return value is set per-test in restoreMockDefaults().
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

// ── Mock: pdfToImages (primary rendering path via pdftoppm) ──────────────────
vi.mock("./pipeline-v2/pdfToImages", () => ({
  renderPdfToImages: vi.fn(),
  extractEmbeddedImages: vi.fn().mockResolvedValue({
    imagesFound: 0, imageUrls: [], rejectedCount: 0, error: null, durationMs: 10,
  }),
  extractPdfText: vi.fn().mockResolvedValue({
    success: true, text: "hello world sample text content for detection purposes",
    charCount: 50, error: null, durationMs: 10,
  }),
}));

// ── Mock: storage ─────────────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/test-image.png" }),
}));

// ── Mock: nanoid ──────────────────────────────────────────────────────────────
vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("test-session-id"),
}));

// ── Mock: sharp (full chain for quality analysis + metadata) ──────────────────
vi.mock("sharp", () => {
  // Non-uniform buffer: alternating 50/200 pixel values → stddev ~75 → not uniform
  function makeNonUniformBuf(size: number) {
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buf[i] = i % 2 === 0 ? 50 : 200;
    return buf;
  }
  function makeInst(width = 800, height = 600) {
    const fakePng = makeNonUniformBuf(width * height);
    const inst: any = {
      metadata: vi.fn().mockResolvedValue({ width, height, format: "png" }),
      png: vi.fn(),
      resize: vi.fn(),
      greyscale: vi.fn(),
      raw: vi.fn(),
      toBuffer: vi.fn(),
      rotate: vi.fn(),
    };
    inst.png.mockReturnValue(inst);
    inst.resize.mockReturnValue(inst);
    inst.greyscale.mockReturnValue(inst);
    inst.raw.mockReturnValue(inst);
    inst.rotate.mockReturnValue(inst);
    inst.toBuffer.mockImplementation((opts?: any) => {
      if (opts && opts.resolveWithObject) {
        return Promise.resolve({ data: fakePng, info: { width, height, channels: 1 } });
      }
      return Promise.resolve(fakePng);
    });
    return inst;
  }
  const sharpFn: any = vi.fn(() => makeInst());
  sharpFn.concurrency = vi.fn(); // engine calls sharp.concurrency(1) after lazy-load
  return { default: sharpFn };
});

// ── Mock: @napi-rs/canvas (not used by pdftoppm path, kept for safety) ────────
vi.mock("@napi-rs/canvas", () => {
  const canvas = {
    getContext: vi.fn().mockReturnValue({}),
    toBuffer: vi.fn().mockReturnValue(Buffer.from("fake-png-data")),
    width: 800,
    height: 600,
  };
  return { createCanvas: vi.fn().mockReturnValue(canvas) };
});

// ── Imports ───────────────────────────────────────────────────────────────────
import { storagePut } from "./storage";
import sharp from "sharp";
import { renderPdfToImages } from "./pipeline-v2/pdfToImages";
import * as pdfjsMock from "pdfjs-dist/legacy/build/pdf.mjs";

const mockStoragePut = storagePut as unknown as ReturnType<typeof vi.fn>;
const mockRenderPdfToImages = renderPdfToImages as unknown as ReturnType<typeof vi.fn>;
const mockSharp = sharp as unknown as ReturnType<typeof vi.fn>;
const mockGetDocument = pdfjsMock.getDocument as unknown as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fake PdfToImagesResult with N pages */
function makePdfToImagesResult(numPages = 1, width = 800, height = 600) {
  const pages = Array.from({ length: numPages }, (_, i) => ({
    pageNumber: i + 1,
    url: "https://cdn.example.com/test-image.png",
    key: `pages/page-${String(i + 1).padStart(3, "0")}.png`,
    fileSizeBytes: 12345,
    width,
    height,
    quality: {
      blurScore: 120,
      colourVariance: 80,
      isBlurry: false,
      isTextHeavy: false,
      isUniform: false,
      aspectRatio: width / height,
      pixelArea: width * height,
    },
  }));
  return {
    pages,
    totalPagesRendered: numPages,
    totalPagesInDocument: numPages,
    truncated: false,
    errors: [],
  };
}

/** Non-uniform buffer: alternating 50/200 → stddev ~75 → passes quality filter */
function makeNonUniformBuf(size: number) {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = i % 2 === 0 ? 50 : 200;
  return buf;
}

/** Mock global fetch to return a non-uniform PNG buffer */
function mockFetch(width = 800, height = 600) {
  const buf = makeNonUniformBuf(width * height);
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(buf.buffer),
  } as any);
}

function makeSharpInst(width = 800, height = 600) {
  const fakePng = makeNonUniformBuf(width * height);
  const inst: any = {
    metadata: vi.fn().mockResolvedValue({ width, height, format: "png" }),
    png: vi.fn(),
    resize: vi.fn(),
    greyscale: vi.fn(),
    raw: vi.fn(),
    toBuffer: vi.fn(),
    rotate: vi.fn(),
  };
  inst.png.mockReturnValue(inst);
  inst.resize.mockReturnValue(inst);
  inst.greyscale.mockReturnValue(inst);
  inst.raw.mockReturnValue(inst);
  inst.rotate.mockReturnValue(inst);
  inst.toBuffer.mockImplementation((opts?: any) => {
    if (opts && opts.resolveWithObject) {
      return Promise.resolve({ data: fakePng, info: { width, height, channels: 1 } });
    }
    return Promise.resolve(fakePng);
  });
  return inst;
}

function makePdfjsPage(textItems?: any[]) {
  return {
    getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    getTextContent: vi.fn().mockResolvedValue({
      items: textItems ?? [{ str: "hello world sample text content for detection purposes" }],
    }),
    getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
    cleanup: vi.fn(),
    objs: { has: vi.fn().mockReturnValue(false), get: vi.fn() },
    commonObjs: { has: vi.fn().mockReturnValue(false), get: vi.fn() },
  };
}

function restoreMockDefaults(numPages = 1, width = 800, height = 600) {
  mockStoragePut.mockResolvedValue({ url: "https://cdn.example.com/test-image.png" });
  mockRenderPdfToImages.mockResolvedValue(makePdfToImagesResult(numPages, width, height));
  // Restore sharp mock: each call returns a fresh inst; also restore concurrency fn
  mockSharp.mockImplementation(() => makeSharpInst(width, height));
  if (!(mockSharp as any).concurrency) (mockSharp as any).concurrency = vi.fn();
  mockFetch(width, height);
  // Wire pdfjs getDocument so Step 1 (scan detection) resolves correctly
  const page = makePdfjsPage();
  const pdfDoc = { numPages, getPage: vi.fn().mockResolvedValue(page) };
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
}

import { extractImagesFromPDFBuffer } from "./pdf-image-extractor";

// ─────────────────────────────────────────────────────────────────────────────
describe("PDF Image Extractor — pdfjs-dist Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreMockDefaults(1);
  });

  it("returns an array of ExtractedImage objects for a normal PDF", async () => {
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("page_render");
    expect(results[0].url).toBe("https://cdn.example.com/test-image.png");
  });

  it("returns page renders with correct source=page_render", async () => {
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results[0].source).toBe("page_render");
  });

  it("rejects uniform/blank pages (isUniform=true → skipped)", async () => {
    // Make sharp return a uniform (all-128) buffer → stddev=0 → isUniform=true → skipped
    restoreMockDefaults(1);
    const uniformBuf = Buffer.alloc(800 * 600, 128); // all same value → stddev=0
    mockSharp.mockImplementation(() => {
      const inst: any = {
        metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, format: "png" }),
        png: vi.fn(),
        resize: vi.fn(),
        greyscale: vi.fn(),
        raw: vi.fn(),
        toBuffer: vi.fn(),
        rotate: vi.fn(),
      };
      inst.png.mockReturnValue(inst);
      inst.resize.mockReturnValue(inst);
      inst.greyscale.mockReturnValue(inst);
      inst.raw.mockReturnValue(inst);
      inst.rotate.mockReturnValue(inst);
      inst.toBuffer.mockImplementation((opts?: any) => {
        if (opts && opts.resolveWithObject) {
          return Promise.resolve({ data: uniformBuf, info: { width: 800, height: 600, channels: 1 } });
        }
        return Promise.resolve(uniformBuf);
      });
      return inst;
    });
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results).toHaveLength(0);
  });

  it("accepts images at exactly the 300px threshold", async () => {
    restoreMockDefaults(1, 300, 300);
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results).toHaveLength(1);
  });

  it("returns empty array when PDF loading fails", async () => {
    mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF structure")) });
    const results = await extractImagesFromPDFBuffer(Buffer.from("bad-pdf"), "bad.pdf");
    expect(results).toHaveLength(0);
  });

  it("handles S3 upload failure gracefully (null url → page included with original url)", async () => {
    // When storagePut returns null url, the engine falls back to page.url from renderPdfToImages
    mockStoragePut.mockResolvedValue({ url: null });
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    // Engine includes page with original url from renderPdfToImages result
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://cdn.example.com/test-image.png");
  });

  it("processes multiple pages and returns one image per page", async () => {
    restoreMockDefaults(3);
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results).toHaveLength(3);
  });

  it("marks page renders with pageNumber matching the PDF page", async () => {
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results[0].pageNumber).toBe(1);
  });
});

describe("PDF Image Extractor — Document-Style PDF Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreMockDefaults(1);
  });

  it("extracts pages from document-style PDFs (text-heavy, not scanned)", async () => {
    // Many text items → native PDF (not scanned) → still renders pages via pdftoppm
    const page = makePdfjsPage(Array(50).fill({ str: "word " }));
    const pdfDoc = { numPages: 3, getPage: vi.fn().mockResolvedValue(page) };
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
    mockRenderPdfToImages.mockResolvedValue(makePdfToImagesResult(3));
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "doc.pdf");
    expect(results).toHaveLength(3);
  });

  it("uses pdftoppm rendering path for all PDFs", async () => {
    // Scanned PDF (no text) → renderPdfToImages called with higher DPI
    const page = makePdfjsPage([]);
    const pdfDoc = { numPages: 1, getPage: vi.fn().mockResolvedValue(page) };
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "scanned.pdf");
    expect(results).toHaveLength(1);
    expect(mockRenderPdfToImages).toHaveBeenCalledTimes(1);
  });

  it("returns empty array for empty PDF (0 pages)", async () => {
    const pdfDoc = { numPages: 0, getPage: vi.fn() };
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
    mockRenderPdfToImages.mockResolvedValue(makePdfToImagesResult(0));
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "empty.pdf");
    expect(results).toHaveLength(0);
  });
});
