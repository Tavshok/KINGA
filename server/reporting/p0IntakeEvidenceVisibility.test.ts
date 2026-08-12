import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const reportingRoot = join(process.cwd(), "server", "reporting");

describe("P0 canonical intake evidence downstream visibility", () => {
  it("keeps persisted claim-document evidence in the Claims Intelligence report path", () => {
    const source = readFileSync(join(reportingRoot, "claimsIntelligenceReport.ts"), "utf8");

    expect(source).toContain("FROM claim_documents");
    expect(source).toContain("WHERE claim_id = ?");
    expect(source).toContain("Evidence Snapshot");
  });

  it("keeps persisted claim-document evidence in the Forensic Decision report path", () => {
    const source = readFileSync(join(reportingRoot, "forensicDecisionReport.ts"), "utf8");

    expect(source).toContain("FROM claim_documents");
    expect(source).toContain("WHERE claim_id = ?");
    expect(source).toContain("photoDocuments");
  });
});
