import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const phase7 = fs.readFileSync(path.join(root, "server/routers/insurance-phase7.ts"), "utf8");
const agency = fs.readFileSync(path.join(root, "server/routers/agency-insurance-service.ts"), "utf8");
const schema = fs.readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");

describe("valuation reliability integration", () => {
  it("persists standalone comparable provenance separately from insurance, policy, claim, repair, payment, and settlement records", () => {
    expect(schema).toContain('valuationComparableEvidence = mysqlTable("valuation_comparable_evidence"');
    expect(phase7).toContain("db.insert(valuationComparableEvidence)");
    const writer = phase7.split("submitValuationRequest:")[1]?.split("getTeaserReport:")[0] ?? "";
    expect(writer).toContain("clientVehicleValuationRequests");
    expect(writer).not.toContain("insurancePolicies");
    expect(writer).not.toContain("clientInsuranceServiceRequests");
    expect(writer).not.toContain("quotationRequests).values");
  });

  it("projects only bounded client evidence status and message from standalone valuation provenance", () => {
    const teaser = phase7.split("getTeaserReport:")[1]?.split("getMyRequests:")[0] ?? "";
    expect(teaser).toContain("valuationEvidenceStatus: provenance?.evidenceStatus");
    expect(teaser).toContain("valuationEvidenceMessage: provenance?.clientMessage");
    expect(teaser).not.toContain("confidenceScore");
    expect(teaser).not.toContain("professionalEvidence");
  });

  it("keeps agency and insurer evidence projections professional while suppressing raw confidence scores", () => {
    expect(agency).toContain("professionalReliability: reliability.professionalEvidence");
    expect(agency).toContain("requiresHumanReview: raw.professionalReliability?.requiresHumanReview");
    expect(agency).not.toContain("internalConfidenceScore");
    expect(agency).toContain("getInsurerDecisionSupport");
  });
});
