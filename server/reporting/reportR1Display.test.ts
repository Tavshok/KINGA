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
    for (const path of reportSources) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("resolveReportCostIntegrity");
      expect(source).toContain("L2 incomplete");
      expect(source).toContain("Submitted quotation ledger");
      expect(source).toContain("L1 — lowest active submitted quote");
      expect(source).toContain("L2 — KINGA all-in recommendation");
      expect(source).toContain("L3 — benchmark reference");
    }
  });

  it("uses a recommendation label rather than an asserted settlement agreement in FR", () => {
    const source = readFileSync(reportSources[2], "utf8");
    expect(source).toContain("Settlement Recommendation");
    expect(source).not.toContain("Settlement Agreed");
  });
});
