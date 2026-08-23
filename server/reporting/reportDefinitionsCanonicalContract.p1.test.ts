import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/reporting/reportDefinitions.ts"), "utf8");

function block(from: string, to: string) {
  return source.slice(source.indexOf(from), source.indexOf(to));
}

describe("individual report canonical record contract", () => {
  it("routes every tenant-scoped individual claim renderer through resolveReportRecord", () => {
    const claimAssessment = block("async function generateClaimAssessment", "async function generateForensicReport");
    const forensic = block("async function generateForensicReport", "async function generateAuditTrailReport");
    const auditTrail = block("async function generateAuditTrailReport", "async function generateCostComparisonReport");
    const costComparison = block("async function generateCostComparisonReport", "async function generateRepairDecisionReport");
    const repairDecision = block("async function generateRepairDecisionReport", "async function generateClaimsSummaryReport");

    for (const renderer of [claimAssessment, forensic, auditTrail, costComparison, repairDecision]) {
      expect(renderer).toContain("resolveReportRecord");
      expect(renderer).not.toMatch(/FROM\s+claims\b/i);
      expect(renderer).not.toMatch(/FROM\s+ai_assessments\b/i);
    }
  });

  it("keeps the approved platform, SAR, and aggregate raw-SQL renderers outside this individual-report migration", () => {
    const deferred = block("async function generatePlatformDashboardReport", "async function generateSARReport");
    expect(deferred).toMatch(/FROM\s+claims\b/i);
    expect(fs.existsSync(path.resolve(process.cwd(), "audit/deferred-report-contract-scoping-2026-08-22.md"))).toBe(true);
  });
});
