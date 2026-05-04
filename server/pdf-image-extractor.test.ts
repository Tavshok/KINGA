/**
 * Tests for the PDF Image Extractor — pdfjs-dist + @napi-rs/canvas pipeline.
 *
 * All vi.mock factories are self-contained (no external variable references)
 * because vi.mock is hoisted before variable declarations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/test-image.png" }),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("test-session-id"),
}));

vi.mock("sharp", () => {
  const inst = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, format: "png" }),
    png: vi.fn(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png-data")),
  };
  inst.png.mockReturnValue(inst);
  return { default: vi.fn(() => inst) };
});

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => {
  const page = {
    getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    getTextContent: vi.fn().mockResolvedValue({
      items: [{ str: "hello world sample text content for detection purposes" }],
    }),
    getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
    cleanup: vi.fn(),
    objs: { has: vi.fn().mockReturnValue(false), get: vi.fn() },
    commonObjs: { has: vi.fn().mockReturnValue(false), get: vi.fn() },
  };
  const pdfDoc = { numPages: 1, getPage: vi.fn().mockResolvedValue(page) };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(pdfDoc) }),
    GlobalWorkerOptions: { workerSrc: "" },
  };
});

vi.mock("@napi-rs/canvas", () => {
  const canvas = {
    getContext: vi.fn().mockReturnValue({}),
    toBuffer: vi.fn().mockReturnValue(Buffer.from("fake-png-data")),
    width: 800,
    height: 600,
  };
  return { createCanvas: vi.fn().mockReturnValue(canvas) };
});

import { storagePut } from "./storage";
import sharp from "sharp";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

const mockStoragePut = storagePut as unknown as ReturnType<typeof vi.fn>;
const mockGetDocument = getDocument as unknown as ReturnType<typeof vi.fn>;
const mockSharp = sharp as unknown as ReturnType<typeof vi.fn>;
const mockCreateCanvas = createCanvas as unknown as ReturnType<typeof vi.fn>;

function makePage(overrides: { textItems?: any[]; operatorFns?: number[] } = {}) {
  return {
    getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    getTextContent: vi.fn().mockResolvedValue({
      items: overrides.textItems ?? [{ str: "hello world sample text content for detection purposes" }],
    }),
    getOperatorList: vi.fn().mockResolvedValue({ fnArray: overrides.operatorFns ?? [], argsArray: [] }),
    cleanup: vi.fn(),
    objs: { has: vi.fn().mockReturnValue(false), get: vi.fn() },
    commonObjs: { has: vi.fn().mockReturnValue(false), get: vi.fn() },
  };
}

function makeSharpInst(width = 800, height = 600) {
  const inst = {
    metadata: vi.fn().mockResolvedValue({ width, height, format: "png" }),
    png: vi.fn(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png-data")),
  };
  inst.png.mockReturnValue(inst);
  return inst;
}

function restoreMockDefaults(numPages = 1) {
  mockStoragePut.mockResolvedValue({ url: "https://cdn.example.com/test-image.png" });
  mockSharp.mockReturnValue(makeSharpInst());
  const canvas = {
    getContext: vi.fn().mockReturnValue({}),
    toBuffer: vi.fn().mockReturnValue(Buffer.from("fake-png-data")),
    width: 800,
    height: 600,
  };
  mockCreateCanvas.mockReturnValue(canvas);
  const page = makePage();
  const pdfDoc = { numPages, getPage: vi.fn().mockResolvedValue(page) };
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
}

import { extractImagesFromPDFBuffer } from "./pdf-image-extractor";

describe("PDF Image Extractor — pdfjs-dist Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreMockDefaults(1);
  });

  it("returns an array of ExtractedImage objects for a normal PDF", async () => {
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(Array.isArray(results)).toBe(true);
    expect(mockStoragePut).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("page_render");
    expect(results[0].url).toBe("https://cdn.example.com/test-image.png");
  });

  it("returns page renders with correct source=page_render", async () => {
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results[0].source).toBe("page_render");
  });

  it("rejects images below the 300px minimum dimension threshold", async () => {
    mockSharp.mockReturnValue(makeSharpInst(100, 100));
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results).toHaveLength(0);
    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("accepts images at exactly the 300px threshold", async () => {
    mockSharp.mockReturnValue(makeSharpInst(300, 300));
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results).toHaveLength(1);
  });

  it("returns empty array when PDF loading fails", async () => {
    mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF structure")) });
    const results = await extractImagesFromPDFBuffer(Buffer.from("bad-pdf"), "bad.pdf");
    expect(results).toHaveLength(0);
  });

  it("handles S3 upload failure gracefully", async () => {
    mockStoragePut.mockResolvedValue({ url: null });
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results).toHaveLength(0);
  });

  it("processes multiple pages and returns one image per page", async () => {
    restoreMockDefaults(3);
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");
    expect(results).toHaveLength(3);
    expect(mockStoragePut).toHaveBeenCalledTimes(3);
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
    const page = makePage({ textItems: Array(50).fill({ str: "word " }) });
    const pdfDoc = { numPages: 3, getPage: vi.fn().mockResolvedValue(page) };
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "doc.pdf");
    expect(results).toHaveLength(3);
  });

  it("uses higher DPI for scanned PDFs (few text chars)", async () => {
    const page = makePage({ textItems: [] });
    const pdfDoc = { numPages: 1, getPage: vi.fn().mockResolvedValue(page) };
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "scanned.pdf");
    expect(results).toHaveLength(1);
    expect(results[0].fromScannedPdf).toBe(true);
  });

  it("returns empty array for empty PDF (0 pages)", async () => {
    const pdfDoc = { numPages: 0, getPage: vi.fn() };
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDoc) });
    const results = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "empty.pdf");
    expect(results).toHaveLength(0);
  });
});
