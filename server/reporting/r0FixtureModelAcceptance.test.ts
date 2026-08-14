import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentationContract } from "../../shared/costDecisionPresentation";
import { resolveReportCostIntegrity } from "./costIntegrity";
import { resolveReportDecisionIntegrity } from "./reportDecisionIntegrity";
import { R0_QUOTE_EVIDENCE_FIXTURES } from "./r0QuoteEvidenceFixtures";

describe("Approved R0-G reusable evidence-state fixture model", () => {
  it.each(R0_QUOTE_EVIDENCE_FIXTURES)("keeps the $name snapshot immutable and semantically aligned", (fixture) => {
    const cost = resolveReportCostIntegrity(fixture.costIntel, [...fixture.dbQuotes]);
    const presentation = buildCostDecisionPresentationContract(fixture.presentationEvidence);
    const decision = resolveReportDecisionIntegrity({
      recommendation: "APPROVE",
      workflowState: fixture.expected.complete ? "financial_decision" : "technical_approval",
      costIntegrity: cost,
    });

    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.costIntel)).toBe(true);
    expect(Object.isFrozen(fixture.presentationEvidence)).toBe(true);
    expect(cost.l2Status).toBe(fixture.expected.l2Status);
    expect(cost.quoteReceiptStatus).toBe(fixture.expected.quoteReceiptStatus);
    expect(cost.l2OptimisedCostUsd ?? cost.l2EvidenceQualifiedComparisonUsd).toBe(fixture.expected.comparisonUsd);
    expect(presentation.quoteVerification).toBe(fixture.expected.verification);
    expect(presentation.optimisedQuoteState).toBe(fixture.expected.presentationState);
    expect(presentation.optimisedQuoteDetail).toBe(fixture.expected.presentationDetail);
    expect(decision.status).toBe(fixture.expected.conclusion === "approved" ? "APPROVED" : "REVIEW_REQUIRED");
  });

  it("retains available comparison intelligence but withholds a payable conclusion for every non-complete snapshot", () => {
    for (const fixture of R0_QUOTE_EVIDENCE_FIXTURES.filter((entry) => !entry.expected.complete)) {
      const presentation = buildCostDecisionPresentationContract(fixture.presentationEvidence);
      expect(presentation.optimisedQuoteState).not.toBe("complete");
      expect(presentation.optimisedQuoteDetail).not.toContain("insurer cost recommendation");
    }
  });

  it("keeps the reusable semantic boundary wired to CL, CI, FR, and the client top view", () => {
    const root = resolve(import.meta.dirname, "../..");
    for (const relativePath of [
      "server/reporting/reportDefinitions.ts",
      "server/reporting/claimsIntelligenceReport.ts",
      "server/reporting/forensicDecisionReport.ts",
    ]) {
      const source = readFileSync(resolve(root, relativePath), "utf8");
      expect(source).toContain("evidence-qualified");
      expect(source).toContain("KINGA Optimised Quote");
    }
    const client = readFileSync(resolve(root, "client/src/components/KingaClaimsReport.tsx"), "utf8");
    expect(client).toContain("evidence-qualified");
    expect(client).toContain("costDecision.optimisedQuoteLabel");
  });
});
