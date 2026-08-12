/**
 * KINGA PDF Renderer
 * Uses puppeteer-core + system Chromium to render HTML report templates to PDF.
 * All reports: black/white/grey palette. Logo top-right. Colour only in charts.
 *
 * M-02/M-06 fixes:
 *  1. Bounded concurrency — at most 3 concurrent renders via p-limit.
 *  2. Faster page load — waitUntil "domcontentloaded" instead of "networkidle0".
 *  3. Retry loop — up to 2 retries with 2s / 4s backoff on transient failures.
 */

import puppeteer from "puppeteer-core";
import pLimit from "p-limit";
import { storagePut } from "../storage";

const CHROMIUM_PATH = "/usr/bin/chromium";

// ── Browser singleton ──────────────────────────────────────────────────────────

let _browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (_browser) {
    try {
      await _browser.version();
      return _browser;
    } catch {
      _browser = null;
    }
  }
  _browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });
  return _browser;
}

// ── Concurrency limiter — max 3 concurrent Puppeteer renders ──────────────────

/**
 * Exported for testing: allows tests to inspect the active-count behaviour.
 */
export const renderLimit = pLimit(3);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RenderResult {
  buffer: Buffer;
  pageCount: number;
  fileSizeBytes: number;
}

// ── Retry helpers ──────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [2000, 4000] as const; // 2 retries → 2s then 4s backoff

function isTransientRenderError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("navigation") ||
    msg.includes("net::err") ||
    msg.includes("protocol error") ||
    msg.includes("target closed") ||
    msg.includes("session closed") ||
    msg.includes("connection refused") ||
    msg.includes("econnreset")
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Core render (single attempt, no retry) ────────────────────────────────────

async function _renderOnce(html: string): Promise<RenderResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // M-02: "domcontentloaded" is ~3× faster than "networkidle0" for self-contained HTML.
    // Reports are fully self-contained (inline CSS, base64 images) so we don't need to
    // wait for external resources.
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for any <img> elements that are still loading (e.g. data URIs that render async).
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise<void>((resolve) => {
                img.onload = img.onerror = () => resolve();
              })
          )
      );
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
      displayHeaderFooter: false,
    });

    const buffer = Buffer.from(pdfBuffer);
    // Estimate page count from buffer size (rough: ~50 KB per page)
    const pageCount = Math.max(1, Math.ceil(buffer.length / 51200));
    return { buffer, pageCount, fileSizeBytes: buffer.length };
  } finally {
    await page.close();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Render an HTML string to a PDF buffer.
 * A4 portrait, 0mm margins, print media.
 *
 * Concurrency is bounded to 3 simultaneous renders.
 * Transient errors are retried up to 2 times with exponential backoff.
 */
export async function renderHtmlToPdf(html: string): Promise<RenderResult> {
  return renderLimit(async () => {
    let lastErr: unknown;
    // Attempt 1 + up to 2 retries
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await _renderOnce(html);
      } catch (err) {
        lastErr = err;
        const isLast = attempt === RETRY_DELAYS_MS.length;
        if (isLast || !isTransientRenderError(err)) {
          throw err;
        }
        // Reset browser on protocol/session errors so next attempt gets a fresh instance
        if (
          err instanceof Error &&
          (err.message.toLowerCase().includes("protocol error") ||
            err.message.toLowerCase().includes("target closed") ||
            err.message.toLowerCase().includes("session closed"))
        ) {
          try {
            await _browser?.close();
          } catch {
            /* ignore */
          }
          _browser = null;
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw lastErr;
  });
}

/**
 * Render HTML to PDF and upload to S3.
 * Returns only the opaque S3 key. Authorised callers must obtain a short-lived
 * retrieval URL through the report lifecycle boundary, not from this renderer.
 */
export async function renderAndUpload(
  html: string,
  s3KeyPrefix: string
): Promise<{ s3Key: string; pageCount: number; fileSizeBytes: number }> {
  const { buffer, pageCount, fileSizeBytes } = await renderHtmlToPdf(html);
  const s3Key = `${s3KeyPrefix}-${Date.now()}.pdf`;
  await storagePut(s3Key, buffer, "application/pdf");
  return { s3Key, pageCount, fileSizeBytes };
}
