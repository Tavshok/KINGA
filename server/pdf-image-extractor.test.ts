/**
 * Tests for the PDF Image Extractor dual-strategy pipeline.
 *
 * The extractor must:
 * 1. Always run pdftoppm (page renders) as the primary strategy
 * 2. Also run pdfimages (embedded images) as a supplemental strategy
 * 3. Return results from both strategies combined
 * 4. Gracefully handle failures in either strategy
 *
 * Implementation note:
 *   readdirSync is called TWICE inside extractImagesFromPDFBuffer:
 *   - First call (after pdftoppm): filters files starting with 'page'
 *   - Second call (after pdfimages): filters files starting with 'emb'
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { storagePut } from "./storage";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

// Sharp mock — persistent instance to avoid clearAllMocks issues
const mockSharpInstance = {
  metadata: vi.fn(),
  png: vi.fn(),
  toBuffer: vi.fn(),
};
mockSharpInstance.png.mockReturnValue(mockSharpInstance);

vi.mock("sharp", () => ({
  default: vi.fn(() => mockSharpInstance),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("test-session-id"),
}));

// ─── Typed mock references ────────────────────────────────────────────────────

const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
const mockReaddirSync = readdirSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockStoragePut = storagePut as unknown as ReturnType<typeof vi.fn>;

// ─── Helper: restore all mock defaults ───────────────────────────────────────

function restoreMockDefaults() {
  mockSharpInstance.metadata.mockResolvedValue({ width: 800, height: 600 });
  mockSharpInstance.png.mockReturnValue(mockSharpInstance);
  mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from("fake-png-data"));
  mockStoragePut.mockResolvedValue({ url: "https://cdn.example.com/test-image.png" });
  mockReadFileSync.mockReturnValue(Buffer.from("fake-image-data"));
}

// ─── Helper: setup mocks for a test ──────────────────────────────────────────

/**
 * Setup mock filesystem:
 * - First readdirSync call (after pdftoppm): returns pageFiles
 * - Second readdirSync call (after pdfimages): returns embeddedFiles
 */
function setupMocks(
  pageFiles: string[],
  embeddedFiles: string[],
  execSyncImpl?: (cmd: string) => void,
) {
  let callCount = 0;
  mockReaddirSync.mockImplementation(() => {
    callCount++;
    return callCount === 1 ? pageFiles : embeddedFiles;
  });

  if (execSyncImpl) {
    mockExecSync.mockImplementation(execSyncImpl);
  } else {
    mockExecSync.mockImplementation(() => {}); // Both commands succeed
  }
}

// ─── Import the module under test ────────────────────────────────────────────

import { extractImagesFromPDFBuffer } from "./pdf-image-extractor";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PDF Image Extractor — Dual-Strategy Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreMockDefaults();
  });

  it("always runs pdftoppm as the primary strategy", async () => {
    setupMocks(["page-1.png", "page-2.png"], []);

    await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    const calls = mockExecSync.mock.calls.map((c: any[]) => c[0] as string);
    const pdftoppmCall = calls.find((c) => c.includes("pdftoppm"));
    expect(pdftoppmCall).toBeDefined();
    expect(pdftoppmCall).toContain("-png");
    expect(pdftoppmCall).toContain("-r 150");
  });

  it("also runs pdfimages as a supplemental strategy", async () => {
    setupMocks(["page-1.png"], ["emb-000.png"]);

    await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    const calls = mockExecSync.mock.calls.map((c: any[]) => c[0] as string);
    const pdfimagesCall = calls.find((c) => c.includes("pdfimages"));
    expect(pdfimagesCall).toBeDefined();
    expect(pdfimagesCall).toContain("-all");
  });

  it("returns page renders even when pdfimages fails", async () => {
    setupMocks(["page-1.png", "page-2.png"], [], (cmd: string) => {
      if (cmd.includes("pdfimages")) {
        throw new Error("pdfimages: command not found");
      }
      // pdftoppm succeeds (no-op)
    });

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    // Should still return results from page renders
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns empty array when pdftoppm fails and no embedded images", async () => {
    setupMocks([], [], (cmd: string) => {
      if (cmd.includes("pdftoppm")) {
        throw new Error("pdftoppm failed");
      }
      // pdfimages succeeds but finds nothing
    });

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    expect(result).toEqual([]);
  });

  it("filters out images smaller than 300px for page renders", async () => {
    setupMocks(["page-1.png"], []);

    // Override sharp mock to return a small image (below 300px threshold)
    mockSharpInstance.metadata.mockResolvedValue({ width: 100, height: 100 });

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    // Small images should be filtered out
    expect(result).toEqual([]);
  });

  it("includes images at exactly the 300px threshold for page renders", async () => {
    setupMocks(["page-1.png"], []);

    // Image at exactly 300x300 should pass the filter
    mockSharpInstance.metadata.mockResolvedValue({ width: 300, height: 300 });

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    expect(result.length).toBe(1);
  });
});

describe("PDF Image Extractor — Document-Style PDF Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreMockDefaults();
  });

  it("extracts pages from document-style PDFs where pdfimages returns nothing", async () => {
    // Simulate: pdfimages succeeds but finds 0 embedded images (document PDF)
    // pdftoppm renders 3 pages
    setupMocks(
      ["page-1.png", "page-2.png", "page-3.png"], // First readdirSync: page renders
      [],                                           // Second readdirSync: no embedded images
    );

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "assessor-report.pdf");

    // Should return 3 page renders
    expect(result.length).toBe(3);
    expect(result.every((img: any) => img.source === "page_render")).toBe(true);
  });

  it("combines page renders and embedded images from the same PDF", async () => {
    // Simulate a PDF with both rendered pages AND embedded damage photos
    setupMocks(
      ["page-1.png", "page-2.png"],   // 2 page renders
      ["emb-000.png", "emb-001.png"], // 2 embedded images
    );

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "combined.pdf");

    // Should return 4 images total (2 page renders + 2 embedded)
    expect(result.length).toBe(4);
  });

  it("marks page renders with source=page_render", async () => {
    setupMocks(["page-1.png"], []);

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    expect(result[0]?.source).toBe("page_render");
  });

  it("marks embedded images with source=embedded_image", async () => {
    setupMocks([], ["emb-000.png"]);

    // For embedded images, the minimum dimension is 150px
    mockSharpInstance.metadata.mockResolvedValue({ width: 200, height: 200 });

    const result = await extractImagesFromPDFBuffer(Buffer.from("fake-pdf"), "test.pdf");

    expect(result[0]?.source).toBe("embedded_image");
  });
});
