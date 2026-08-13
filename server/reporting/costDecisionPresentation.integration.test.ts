import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("R0 cross-surface concise cost-decision presentation", () => {
  it("uses the shared evidence-governed report presenter in Claims Ledger, Claims Intelligence, and Forensic reports", () => {
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts", "server/reporting/forensicDecisionReport.ts"]) {
      const source = read(file);
      expect(source).toContain('from "./costDecisionPresentation"');
      expect(source).toContain("renderCostDecisionSummaryHtml");
      expect(source).toContain("costDecisionSummary");
    }
  });

  it("uses the matching concise sequence in the client top-cost view", () => {
    const source = read("client/src/components/KingaClaimsReport.tsx");
    expect(source).toContain("ClientCostDecisionStrip");
    expect(source).toContain('from "@shared/costDecisionPresentation"');
    expect(source).toContain("buildCostDecisionPresentationContract");
    expect(source).toContain("Submitted Quotations");
    expect(source).toContain("KINGA Quote Verification");
    expect(read("shared/costDecisionPresentation.ts")).toContain("KINGA Optimised Quote");
    expect(source).toContain("Quote Issues");
    expect(source).toContain("Repairability");
  });

  it("does not present benchmark cost as a replacement value in the concise opening presenter", () => {
    const source = read("server/reporting/costDecisionPresentation.ts");
    expect(source).not.toContain("l3BenchmarkReferenceCostUsd");
    expect(source).not.toContain("assessorCalibrationCostUsd");
  });

  it("passes explicit persisted repair intelligence to every report repairability surface", () => {
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts", "server/reporting/forensicDecisionReport.ts"]) {
      expect(read(file)).toContain("extractExplicitStructuralReviewEvidence");
    }
    expect(read("client/src/components/KingaClaimsReport.tsx")).toContain("structuralReviewRequired");
  });
});
