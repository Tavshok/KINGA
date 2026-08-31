import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = __dirname;
const reportSources = [
  resolve(root, "reportDefinitions.ts"),
  resolve(root, "claimsIntelligenceReport.ts"),
  resolve(root, "forensicDecisionReport.ts"),
];

describe("R1 report cost provenance disclosures", () => {
  it("labels documented assessor cost as calibration-only in CL, CI, and FR", () => {
    for (const path of reportSources) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("Assessor documented cost — calibration reference only");
      expect(source).toContain("not a submitted quote, L2 value");
    }
  });

  it("uses the shared resolver rather than legacy L2 fallbacks in CL, CI, and FR", () => {
    for (const path of reportSources.slice(0, 2)) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("resolveReportCostIntegrity");
      expect(source).toContain("L2 incomplete");
      expect(source).toContain("Submitted quotation ledger");
      expect(source).toContain("L1 — lowest active submitted quote");
      expect(source).toContain("L2 — KINGA Optimised Quote");
      expect(source).toContain("L3 — benchmark reference");
    }
    const forensicSource = readFileSync(reportSources[2], "utf8");
    const forensicModel = readFileSync(resolve(root, "forensicReportModel.ts"), "utf8");
    expect(forensicSource).toContain("resolveForensicReportModel");
    expect(forensicSource).toContain("forensicModel.executive.costIntegrity");
    expect(forensicSource).toContain("L2 incomplete");
    expect(forensicSource).toContain("Submitted quotation ledger");
    expect(forensicSource).toContain("L1 — lowest active submitted quote");
    expect(forensicSource).toContain("L2 — KINGA Optimised Quote");
    expect(forensicSource).toContain("L3 — benchmark reference");
    expect(forensicModel).toContain("resolveReportCostIntegrity(costIntel, quoteRows)");
  });

  it("uses a recommendation label rather than an asserted settlement agreement in FR", () => {
    const source = readFileSync(reportSources[2], "utf8");
    expect(source).toContain("Settlement Recommendation");
    expect(source).not.toContain("Settlement Agreed");
  });

  it("quarantines legacy Forensic interpretation cost findings while L2 scope is incomplete", () => {
    const source = readFileSync(reportSources[2], "utf8");
    expect(source).toContain("const isCostSection");
    expect(source).toContain("isCostSection && kingaOptimised === null");
    expect(source).toContain("L2 repair scope incomplete — cost optimisation unavailable.");
  });
});
