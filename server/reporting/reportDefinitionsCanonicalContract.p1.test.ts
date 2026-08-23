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

  it("routes the approved platform and aggregate renderers through the named aggregate contract while leaving SAR untouched", () => {
    const claimsSummary = block("async function generateClaimsSummaryReport", "async function generateFraudSummaryReport");
    const fraudSummary = block("async function generateFraudSummaryReport", "async function generateAssessorPerformanceReport");
    const dwellTime = block("async function generateDwellTimeReport", "async function generatePlatformDashboardReport");
    const platform = block("async function generatePlatformDashboardReport", "async function generateSARReport");
    const sar = block("async function generateSARReport", "async function generateRegulatoryComplianceReport");

    for (const renderer of [claimsSummary, fraudSummary, dwellTime, platform]) {
      expect(renderer).toContain("resolvePlatformReportCollection");
      expect(renderer).not.toMatch(/FROM\s+claims\b/i);
      expect(renderer).not.toMatch(/FROM\s+ai_assessments\b/i);
    }
    expect(platform).toContain("requirePlatformAggregateAuthority");
    expect(sar).toMatch(/FROM\s+claims\b/i);
    expect(sar).not.toContain("resolvePlatformReportCollection");
    expect(fs.existsSync(path.resolve(process.cwd(), "audit/deferred-report-contract-scoping-2026-08-22.md"))).toBe(true);
  });
});
