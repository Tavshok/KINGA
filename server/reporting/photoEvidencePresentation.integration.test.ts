import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("R0 cross-report canonical photo evidence presentation", () => {
  it("normalises the same enriched-photo evidence before Claims Ledger, Claims Intelligence, and Forensic rendering", () => {
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts"]) {
      const source = read(file);
      expect(source).toContain('from "./photoEvidencePresentation"');
      expect(source).toContain("normaliseCanonicalPhotoEvidence");
    }
    const forensicRenderer = read("server/reporting/forensicDecisionReport.ts");
    const forensicModel = read("server/reporting/forensicReportModel.ts");
    expect(forensicRenderer).toContain("resolveForensicReportModel");
    expect(forensicRenderer).toContain("forensicModel.evidence.photos");
    expect(forensicModel).toContain('from "./photoEvidencePresentation"');
    expect(forensicModel).toContain("normaliseCanonicalPhotoEvidence");
  });

  it("keeps absence of canonical photo evidence explicit rather than manufacturing visual analysis", () => {
    const source = read("server/reporting/photoEvidencePresentation.ts");
    expect(source).toContain("const input = Array.isArray(raw) ? raw : []");
    expect(source).not.toContain("placeholder");
  });

  it("routes conflicted direction metadata into the shared qualified-label panel for every report surface", () => {
    const panel = read("server/reporting/templates/kingaDesignSystem.ts");
    expect(panel).toContain("Recorded zone:");
    expect(panel).toContain("Zone label requires verification");
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts"]) {
      const source = read(file);
      expect(source).toContain("directionContradiction");
      expect(source).toContain("photoZonePanel");
    }
    const forensicRenderer = read("server/reporting/forensicDecisionReport.ts");
    const forensicModel = read("server/reporting/forensicReportModel.ts");
    expect(forensicRenderer).toContain("photoZonePanel");
    expect(forensicRenderer).toContain("resolveForensicReportModel");
    expect(forensicModel).toContain("normaliseCanonicalPhotoEvidence");
  });
});
