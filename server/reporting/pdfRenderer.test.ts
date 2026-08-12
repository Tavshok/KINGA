/**
 * Tests for pdfRenderer.ts — M-02/M-06 reliability fixes.
 *
 * Covers:
 *  1. Concurrency limit: at most 3 renders run simultaneously.
 *  2. Retry on transient errors: retries up to 2 times before throwing.
 *  3. No retry on non-transient errors: throws immediately.
 *  4. Success path: returns RenderResult with buffer, pageCount, fileSizeBytes.
 *  5. renderAndUpload: calls storagePut and returns s3Key + url.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock factories so they are available before vi.mock() runs ──────────
const { mockPage, mockBrowser, mockStoragePut, mockLaunch } = vi.hoisted(() => {
  const mockPdfBuffer = Buffer.from("FAKE_PDF_BYTES");

  const mockPage = {
    setContent: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(mockPdfBuffer),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    version: vi.fn().mockResolvedValue("Chrome/120"),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);
  const mockStoragePut = vi.fn().mockResolvedValue({ url: "https://s3.example.com/test.pdf" });

  return { mockPage, mockBrowser, mockStoragePut, mockLaunch };
});

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("puppeteer-core", () => ({
  default: { launch: mockLaunch },
}));

vi.mock("../storage", () => ({
  storagePut: mockStoragePut,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import { renderHtmlToPdf, renderAndUpload, renderLimit } from "./pdfRenderer";

const mockPdfBuffer = Buffer.from("FAKE_PDF_BYTES");

describe("pdfRenderer — M-02/M-06 reliability fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore all mock implementations after clearAllMocks() resets them
    mockLaunch.mockResolvedValue(mockBrowser);
    mockBrowser.version.mockResolvedValue("Chrome/120");
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockPage.setContent.mockResolvedValue(undefined);
    mockPage.evaluate.mockResolvedValue(undefined);
    mockPage.pdf.mockResolvedValue(mockPdfBuffer);
    mockPage.close.mockResolvedValue(undefined);
    mockBrowser.close.mockResolvedValue(undefined);
    mockStoragePut.mockResolvedValue({ url: "https://s3.example.com/test.pdf" });
  });

  // ── 1. Success path ──────────────────────────────────────────────────────────
  describe("renderHtmlToPdf — success path", () => {
    it("returns a RenderResult with buffer, pageCount, and fileSizeBytes", async () => {
      const result = await renderHtmlToPdf("<html><body>Test</body></html>");
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
      expect(result.fileSizeBytes).toBe(result.buffer.length);
    });

    it("uses domcontentloaded (not networkidle0) for faster page load", async () => {
      await renderHtmlToPdf("<html><body>Test</body></html>");
      expect(mockPage.setContent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ waitUntil: "domcontentloaded" })
      );
    });

    it("always closes the page in the finally block", async () => {
      await renderHtmlToPdf("<html><body>Test</body></html>");
      expect(mockPage.close).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. Concurrency limit ─────────────────────────────────────────────────────
  describe("renderLimit — concurrency", () => {
    it("has a concurrency limit of 3", () => {
      expect(renderLimit.concurrency).toBe(3);
    });

    it("queues renders beyond concurrency=3 (active count never exceeds 3)", async () => {
      let activeCount = 0;
      let peakActiveCount = 0;

      mockPage.pdf.mockImplementation(async () => {
        activeCount++;
        peakActiveCount = Math.max(peakActiveCount, activeCount);
        await new Promise((resolve) => setTimeout(resolve, 30));
        activeCount--;
        return mockPdfBuffer;
      });

      const renders = Array.from({ length: 6 }, () =>
        renderHtmlToPdf("<html><body>Test</body></html>")
      );
      await Promise.all(renders);

      expect(peakActiveCount).toBeLessThanOrEqual(3);
    });
  });

  // ── 3. Retry on transient errors ─────────────────────────────────────────────
  describe("renderHtmlToPdf — retry on transient errors", () => {
    it("retries up to 2 times on timeout errors and succeeds on 3rd attempt", async () => {
      let callCount = 0;
      mockPage.setContent.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error("Navigation timeout exceeded");
        }
        return undefined;
      });

      const result = await renderHtmlToPdf("<html><body>Test</body></html>");
      expect(callCount).toBe(3);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it("throws after exhausting all retries on persistent transient errors", async () => {
      mockPage.setContent.mockRejectedValue(new Error("Navigation timeout exceeded"));

      await expect(
        renderHtmlToPdf("<html><body>Test</body></html>")
      ).rejects.toThrow("Navigation timeout exceeded");

      // 1 initial attempt + 2 retries = 3 total calls
      expect(mockPage.setContent).toHaveBeenCalledTimes(3);
    });

    it("retries on net::err errors", async () => {
      let callCount = 0;
      mockPage.setContent.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("net::err_connection_refused");
        return undefined;
      });

      const result = await renderHtmlToPdf("<html><body>Test</body></html>");
      expect(callCount).toBe(2);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it("retries on protocol error and resets browser singleton", async () => {
      let callCount = 0;
      mockPage.setContent.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("Protocol error (Page.navigate): Target closed");
        return undefined;
      });

      const result = await renderHtmlToPdf("<html><body>Test</body></html>");
      expect(callCount).toBe(2);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });
  });

  // ── 4. No retry on non-transient errors ──────────────────────────────────────
  describe("renderHtmlToPdf — no retry on non-transient errors", () => {
    it("throws immediately on non-transient errors without retrying", async () => {
      mockPage.setContent.mockRejectedValue(new Error("Unexpected token in JSON"));

      await expect(
        renderHtmlToPdf("<html><body>Test</body></html>")
      ).rejects.toThrow("Unexpected token in JSON");

      expect(mockPage.setContent).toHaveBeenCalledTimes(1);
    });

    it("throws immediately on ReferenceError without retrying", async () => {
      mockPage.pdf.mockRejectedValue(new ReferenceError("someVar is not defined"));

      await expect(
        renderHtmlToPdf("<html><body>Test</body></html>")
      ).rejects.toThrow("someVar is not defined");

      expect(mockPage.pdf).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. renderAndUpload ───────────────────────────────────────────────────────
  describe("renderAndUpload", () => {
    it("calls storagePut with the rendered buffer and returns only the opaque storage key", async () => {
      const result = await renderAndUpload(
        "<html><body>Test</body></html>",
        "reports/tenant-1/claim-42"
      );

      expect(mockStoragePut).toHaveBeenCalledTimes(1);
      const [s3Key, buffer, contentType] = mockStoragePut.mock.calls[0];
      expect(s3Key).toMatch(/^reports\/tenant-1\/claim-42-\d+\.pdf$/);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(contentType).toBe("application/pdf");

      expect(result.s3Key).toMatch(/^reports\/tenant-1\/claim-42-\d+\.pdf$/);
      expect(result).not.toHaveProperty("url");
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
      expect(result.fileSizeBytes).toBeGreaterThan(0);
    });
  });
});
