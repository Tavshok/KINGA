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
      expect(source).toContain(
        "Assessor documented cost — calibration reference only"
      );
      expect(source).toContain("not a submitted quote, L2 value");
    }
  });

  it("uses the shared resolver rather than legacy L2 fallbacks in CL, CI, and FR", () => {
    for (const path of reportSources.slice(0, 2)) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("resolveReportCostIntegrity");
    }
    const forensicSource = readFileSync(reportSources[2], "utf8");
    const forensicModel = readFileSync(
      resolve(root, "forensicReportModel.ts"),
      "utf8"
    );
    const sharedQuoteEvidence = readFileSync(
      resolve(root, "sharedQuoteEvidencePresentation.ts"),
      "utf8"
    );
    const costEvidenceState = readFileSync(
      resolve(root, "costEvidenceStatePresentation.ts"),
      "utf8"
    );
    expect(forensicSource).toContain("resolveForensicReportModel");
    expect(forensicSource).toContain("forensicModel.executive.costIntegrity");
    expect(forensicModel).toContain(
      "resolveReportCostIntegrity(costIntel, quoteRows)"
    );
    expect(sharedQuoteEvidence).toContain(
      "L1 — lowest eligible submitted quote"
    );
    expect(sharedQuoteEvidence).toContain("L2 — KINGA Optimised");
    expect(costEvidenceState).toContain("Submitted quotation records");
  });

  it("uses a recommendation label rather than an asserted settlement agreement in FR", () => {
    const source = readFileSync(reportSources[2], "utf8");
    expect(source).toContain("Settlement Recommendation");
    expect(source).not.toContain("Settlement Agreed");
  });

  it("withholds a forensic cost recommendation while L2 scope is incomplete", () => {
    const source = readFileSync(reportSources[2], "utf8");
    expect(source).toContain(
      "const recommendedSettlement = kingaOptimised === null"
    );
    expect(source).toContain(
      "No savings or settlement recommendation is available until the scope is reconciled."
    );
  });
});
