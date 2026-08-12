/**
 * Read-only report-output audit.
 * Usage: pnpm tsx scripts/audit-report-output.mts <claimId> <tenantId>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateReportHtml } from "../server/reporting/reportDefinitions";

const claimId = Number(process.argv[2]);
const tenantId = process.argv[3];

if (!Number.isInteger(claimId) || claimId <= 0 || !tenantId) {
  throw new Error("Usage: pnpm tsx scripts/audit-report-output.mts <claimId> <tenantId>");
}

const reportKeys = ["claim.assessment", "claim.intelligence", "claim.forensic"] as const;
const currencySignals = ["1,950", "2,840", "2,409.35", "993", "5,877", "5,817"];
const sectionSignals = ["Cost Intelligence", "Quote", "Line Item", "Hidden Damage", "Photo", "Impact Zone", "Risk"];

async function main() {
  const outputDir = resolve("/tmp", `kinga-report-audit-${claimId}`);
  await mkdir(outputDir, { recursive: true });

  const summary: Record<string, unknown> = { claimId, tenantId, reports: {} };
  for (const key of reportKeys) {
    const html = await generateReportHtml(key, { claimId }, tenantId);
    await writeFile(resolve(outputDir, `${key.replaceAll(".", "-")}.html`), html, "utf8");
    (summary.reports as Record<string, unknown>)[key] = {
      characters: html.length,
      currencySignals: Object.fromEntries(currencySignals.map((signal) => [signal, html.includes(signal)])),
      sectionSignals: Object.fromEntries(sectionSignals.map((signal) => [signal, html.toLowerCase().includes(signal.toLowerCase())])),
    };
  }

  const summaryPath = resolve(outputDir, "summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(summaryPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
