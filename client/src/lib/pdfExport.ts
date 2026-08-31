/**
 * Legacy public barrel for PDF exports.
 * Keep this path stable: portal callers import it directly.
 */
export { generateComparisonPDF } from "./pdfExport.comparison";
export { generateFraudAnalyticsPDF } from "./pdfExport.fraud";
export { generateDamageReportPDF } from "./pdfExport.damage";
export { generateClaimSummaryPDF } from "./pdfExport.claimSummary";
