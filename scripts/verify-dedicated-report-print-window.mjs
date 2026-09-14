import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputDirectory = process.env.KINGA_PRINT_FIXTURE_OUTPUT ?? "/tmp/kinga-phase2-print-fixture";
const htmlPath = path.join(outputDirectory, "dedicated-report-window.html");
const pdfPath = path.join(outputDirectory, "dedicated-report-window.pdf");

const reportDocument = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base href="https://kinga.example/insurer/claims/123/comparison">
    <style>
      @page { size: A4; margin: 14mm; }
      body { font: 14px Arial, sans-serif; color: #182230; }
      .page { min-height: 252mm; break-after: page; }
      .page:last-child { break-after: auto; }
      h1 { color: #123a63; }
    </style>
  </head>
  <body>
    <section class="page"><h1>Opening finding</h1><p>Dedicated CI/FR print document opening content.</p></section>
    <section class="page"><h1>Evidence continuation</h1><p>Intervening report content.</p></section>
    <section class="page"><h1>Closing finding</h1><p>Dedicated CI/FR print document final content.</p></section>
  </body>
</html>`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(htmlPath, reportDocument, "utf8");

await execFileAsync(process.env.CHROMIUM_PATH || "/usr/bin/chromium", [
  "--headless",
  "--no-sandbox",
  "--disable-gpu",
  "--print-to-pdf-no-header",
  `--print-to-pdf=${pdfPath}`,
  `file://${htmlPath}`,
], { timeout: 60_000 });

const { stdout: metadata } = await execFileAsync("pdfinfo", [pdfPath]);
const { stdout: extractedText } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"]);
const pageCount = Number(metadata.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
const firstPagePresent = extractedText.includes("Opening finding");
const finalPagePresent = extractedText.includes("Closing finding");

if (pageCount < 3 || !firstPagePresent || !finalPagePresent) {
  throw new Error("The direct dedicated print document did not produce populated opening and final report pages.");
}

console.log(JSON.stringify({ htmlPath, pdfPath, pageCount, firstPagePresent, finalPagePresent }));
