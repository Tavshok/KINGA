import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderVehiclePassportEvidencePanel } from "../server/reporting/vehiclePassportEvidencePresentation.ts";

const root = resolve(import.meta.dirname, "..");
const output = "/tmp/kinga-phase4-passport-pagination";
mkdirSync(output, { recursive: true });

const designSource = readFileSync(resolve(root, "server/reporting/templates/kingaDesignSystem.ts"), "utf8");
const css = designSource.match(/export const KINGA_REPORT_CSS = `([\s\S]*?)`;/)?.[1];
if (!css) throw new Error("Unable to extract the shared KINGA report CSS.");

const passport = renderVehiclePassportEvidencePanel({
  snapshot: {
    requestNumber: "VP-FIXTURE-2026",
    snapshotVersion: 4,
    snapshotDate: "2026-07-01",
    exteriorCondition: "Good",
    interiorCondition: "Fair",
    mechanicalCondition: "Good",
    odometerKm: 123456,
    existingDamageNotes: "Minor pre-loss scratch, captured before the incident.",
  },
  formatDate: (value) => String(value ?? "—"),
  escapeHtml: (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
});

const rows = Array.from({ length: 120 }, (_, index) => {
  const number = index + 1;
  return `<tr><td>Ledger row ${number}</td><td>Submitted source item ${number}</td><td class="num">$${(number * 113.45).toFixed(2)}</td></tr>`;
}).join("");

const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="page"><div class="masthead"><div><div class="brand sans">KINGA<span>·</span>AI</div><div class="doc-title">Phase 4 Pagination Fixture</div></div><div class="meta">Report CSS and shared panel check</div></div>
<div class="section"><div class="section-tab sans"><span class="num">01</span> Vehicle and Source Evidence</div>${passport}
<h4 style="margin-top:14px">Long evidence ledger</h4><table class="grid-t"><thead><tr><th>Row</th><th>Submitted evidence</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table></div></div></body></html>`;

const htmlPath = resolve(output, "phase4-passport-pagination.html");
const pdfPath = resolve(output, "phase4-passport-pagination.pdf");
const firstTextPath = resolve(output, "page-1.txt");
const lastTextPath = resolve(output, "page-last.txt");
writeFileSync(htmlPath, fixture);
execFileSync("chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: "pipe" });
const pdfInfo = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
const pages = Number(pdfInfo.match(/^Pages:\s+(\d+)$/m)?.[1] ?? 0);
if (pages < 2) throw new Error(`Expected a multi-page A4 fixture; received ${pages} page(s).`);
execFileSync("pdftotext", ["-f", "1", "-l", "1", pdfPath, firstTextPath]);
execFileSync("pdftotext", ["-f", String(pages), "-l", String(pages), pdfPath, lastTextPath]);
const first = readFileSync(firstTextPath, "utf8");
const last = readFileSync(lastTextPath, "utf8");
if (!first.includes("Vehicle Passport — Pre-Loss Condition Evidence") || first.trim().length < 300) {
  throw new Error("The first A4 page is not substantively populated by the shared Vehicle Passport fixture.");
}
if (!last.includes("Ledger row 120") || last.trim().length < 80) {
  throw new Error("The final A4 page is not substantively populated by the long evidence ledger.");
}
console.log(JSON.stringify({ pdfPath, pages, firstPageCharacters: first.trim().length, finalPageCharacters: last.trim().length }));
