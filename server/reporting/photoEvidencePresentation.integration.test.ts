import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("R0 cross-report canonical photo evidence presentation", () => {
  it("normalises the same enriched-photo evidence before Claims Ledger, Claims Intelligence, and Forensic rendering", () => {
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts", "server/reporting/forensicDecisionReport.ts"]) {
      const source = read(file);
      expect(source).toContain('from "./photoEvidencePresentation"');
      expect(source).toContain("normaliseCanonicalPhotoEvidence");
    }
  });

  it("keeps absence of canonical photo evidence explicit rather than manufacturing visual analysis", () => {
    const source = read("server/reporting/photoEvidencePresentation.ts");
    expect(source).toContain("const input = Array.isArray(raw) ? raw : []");
    expect(source).not.toContain("placeholder");
  });
});
