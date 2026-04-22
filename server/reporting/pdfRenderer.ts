/**
 * KINGA PDF Renderer
 * Uses puppeteer-core + system Chromium to render HTML report templates to PDF.
 * All reports: black/white/grey palette. Logo top-right. Colour only in charts.
 */

import puppeteer from "puppeteer-core";
import { storagePut } from "../storage";

const CHROMIUM_PATH = "/usr/bin/chromium";

let _browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (_browser) {
    try {
      // Check if still alive
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

export interface RenderResult {
  buffer: Buffer;
  pageCount: number;
  fileSizeBytes: number;
}

/**
 * Render an HTML string to a PDF buffer.
 * A4 portrait, 18mm margins, print media.
 */
export async function renderHtmlToPdf(html: string): Promise<RenderResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    // Wait for any images (logo) to load
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
    // Estimate page count from buffer size (rough: ~50KB per page)
    const pageCount = Math.max(1, Math.ceil(buffer.length / 51200));
    return { buffer, pageCount, fileSizeBytes: buffer.length };
  } finally {
    await page.close();
  }
}

/**
 * Render HTML to PDF and upload to S3.
 * Returns the S3 key and public URL.
 */
export async function renderAndUpload(
  html: string,
  s3KeyPrefix: string
): Promise<{ s3Key: string; url: string; pageCount: number; fileSizeBytes: number }> {
  const { buffer, pageCount, fileSizeBytes } = await renderHtmlToPdf(html);
  const s3Key = `${s3KeyPrefix}-${Date.now()}.pdf`;
  const { url } = await storagePut(s3Key, buffer, "application/pdf");
  return { s3Key, url, pageCount, fileSizeBytes };
}
