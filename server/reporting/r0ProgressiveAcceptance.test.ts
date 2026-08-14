import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveReportCostIntegrity } from "./costIntegrity";
import { resolveReportDecisionIntegrity } from "./reportDecisionIntegrity";
import { r0QuoteEvidenceFixture, R0_QUOTE_EVIDENCE_FIXTURES } from "./r0QuoteEvidenceFixtures";

describe("R0 progressive L2 same-snapshot acceptance", () => {
  it.each(R0_QUOTE_EVIDENCE_FIXTURES)("keeps L2 intelligence active for $name while limiting only unsupported conclusions", (fixture) => {
    const cost = resolveReportCostIntegrity(fixture.costIntel, [...fixture.dbQuotes]);
    const decision = resolveReportDecisionIntegrity({
      recommendation: "APPROVE",
      workflowState: fixture.expected.complete ? "financial_decision" : "technical_approval",
      costIntegrity: cost,
    });

    expect(cost.l2Status).toBe(fixture.expected.l2Status);
    expect(cost.quoteReceiptStatus).toBe(fixture.expected.quoteReceiptStatus);
    expect(cost.l2OptimisedCostUsd ?? cost.l2EvidenceQualifiedComparisonUsd).toBe(fixture.expected.comparisonUsd);
    expect(cost.l2IsComplete).toBe(fixture.expected.complete);
    expect(decision.status).toBe(fixture.expected.conclusion === "approved" ? "APPROVED" : "REVIEW_REQUIRED");
    if (!fixture.expected.complete) expect(decision.holdReason).toContain("recommendation");
  });

  it("excludes a superseded quote from the same complete-state ledger", () => {
    const complete = r0QuoteEvidenceFixture("complete_all_in");
    const cost = resolveReportCostIntegrity(complete.costIntel, [...complete.dbQuotes]);
    expect(cost.activeQuotes.map((quote) => quote.sourceReference)).toEqual(["q-5", "q-6"]);
  });

  it("uses the shared progressive L2 evidence boundary in CL, CI, FR, and the top cost view", () => {
    for (const file of [
      resolve(import.meta.dirname, "reportDefinitions.ts"),
      resolve(import.meta.dirname, "claimsIntelligenceReport.ts"),
      resolve(import.meta.dirname, "forensicDecisionReport.ts"),
      resolve(process.cwd(), "client/src/components/KingaClaimsReport.tsx"),
    ]) {
      expect(readFileSync(file, "utf8")).toContain("evidence-qualified");
    }
  });
});
