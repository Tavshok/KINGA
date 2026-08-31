import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Wave 1 PDF export split public contract", () => {
  const barrel = readFileSync(resolve(process.cwd(), "client/src/lib/pdfExport.ts"), "utf8");

  it("preserves the four established PDF generator exports at the legacy path", () => {
    expect(barrel).toContain('export { generateComparisonPDF } from "./pdfExport.comparison";');
    expect(barrel).toContain('export { generateFraudAnalyticsPDF } from "./pdfExport.fraud";');
    expect(barrel).toContain('export { generateDamageReportPDF } from "./pdfExport.damage";');
    expect(barrel).toContain('export { generateClaimSummaryPDF } from "./pdfExport.claimSummary";');
  });
});
