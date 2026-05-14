/**
 * Export PDF reports for Voltron Mining claim 6150002
 * Run with: npx tsx scripts/export_voltron_reports.ts
 */
import fs from "fs";
import path from "path";
import { aggregateClaimIntelligence } from "../server/report-intelligence-aggregator";
import { generateReportNarrative } from "../server/report-narrative-generator";
import { generateReportVisualizations } from "../server/report-visualization-generator";
import { generateReportPDF } from "../server/report-pdf-generator";

const CLAIM_ID = "6150002";
const OUTPUT_DIR = "/tmp/voltron_reports";

async function exportReport(role: "insurer" | "assessor" | "regulatory", label: string) {
  console.log(`\nGenerating ${label} report...`);
  
  const intelligence = await aggregateClaimIntelligence(CLAIM_ID);
  const narrative = await generateReportNarrative(intelligence, role);
  const visualizations = generateReportVisualizations(intelligence);
  
  const pdfBuffer = await generateReportPDF(
    intelligence,
    narrative,
    visualizations,
    {
      role,
      includeVisualizations: true,
      includeSupportingEvidence: true,
    }
  );
  
  const filename = `VOLTRON-COR6002812-${label}-report.pdf`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`  ✓ Saved: ${outputPath} (${Math.round(pdfBuffer.length / 1024)} KB)`);
  return outputPath;
}

async function main() {
  console.log("=== Voltron Mining Report Export ===");
  console.log(`Claim ID: ${CLAIM_ID}`);
  
  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Generate both reports
  const forensicPath = await exportReport("assessor", "ForensicAudit");
  const claimsPath = await exportReport("insurer", "Claims");
  
  console.log("\n✅ Reports generated successfully:");
  console.log(`  Forensic Audit: ${forensicPath}`);
  console.log(`  Claims Report:  ${claimsPath}`);
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error("Fatal:", err.message);
  console.error(err.stack);
  process.exit(1);
});
