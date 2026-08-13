import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveReportCostIntegrity } from "./costIntegrity";
import { resolveReportDecisionIntegrity } from "./reportDecisionIntegrity";

type QuoteEvidenceFixture = {
  name: "no_quote" | "total_only" | "incomplete_itemised" | "complete_all_in";
  costIntel: Record<string, unknown>;
  dbQuotes: Array<Record<string, unknown>>;
  expected: {
    l2Status: "unavailable" | "evidence_qualified" | "complete";
    quoteReceiptStatus: "no_quotes" | "quotes_received";
    comparisonUsd: number | null;
    complete: boolean;
    conclusion: "review" | "approved";
  };
};

const fixtures: QuoteEvidenceFixture[] = [
  {
    name: "no_quote",
    costIntel: { compositeOptimisation: { l2Status: "unavailable", quoteScopeStatus: "not_evaluated", sourceQuotesReceived: 0 } },
    dbQuotes: [],
    expected: { l2Status: "unavailable", quoteReceiptStatus: "no_quotes", comparisonUsd: null, complete: false, conclusion: "review" },
  },
  {
    name: "total_only",
    costIntel: {
      compositeOptimisation: {
        l2Status: "evidence_qualified",
        quoteScopeStatus: "evidence_qualified",
        sourceQuotesReceived: 2,
        l1LowestSubmittedCostUsd: 1240,
        l2EvidenceQualifiedComparisonUsd: 1240,
        canonicalQuoteLedger: [
          { panelBeater: "Alpha", totalCostUsd: 1240, currency: "USD", status: "active", quoteId: "q-1" },
          { panelBeater: "Beta", totalCostUsd: 1320, currency: "USD", status: "active", quoteId: "q-2" },
        ],
      },
    },
    dbQuotes: [],
    expected: { l2Status: "evidence_qualified", quoteReceiptStatus: "quotes_received", comparisonUsd: 1240, complete: false, conclusion: "review" },
  },
  {
    name: "incomplete_itemised",
    costIntel: {
      compositeOptimisation: {
        l2Status: "evidence_qualified",
        quoteScopeStatus: "incomplete_scope",
        sourceQuotesReceived: 2,
        l1LowestSubmittedCostUsd: 1820,
        l2EvidenceQualifiedComparisonUsd: 1480,
        partialPricedScopeUsd: 1480,
        missingRequiredComponents: ["Headlamp alignment"],
        canonicalQuoteLedger: [
          { panelBeater: "Alpha", totalCostUsd: 1820, currency: "USD", status: "active", quoteId: "q-3" },
          { panelBeater: "Beta", totalCostUsd: 1980, currency: "USD", status: "active", quoteId: "q-4" },
        ],
      },
    },
    dbQuotes: [],
    expected: { l2Status: "evidence_qualified", quoteReceiptStatus: "quotes_received", comparisonUsd: 1480, complete: false, conclusion: "review" },
  },
  {
    name: "complete_all_in",
    costIntel: {
      compositeOptimisation: {
        isComplete: true,
        l2Status: "complete",
        quoteScopeStatus: "complete",
        sourceQuotesReceived: 2,
        l1LowestSubmittedCostUsd: 1850,
        l2CompositeOptimisedCostUsd: 1725,
        costBasis: "all_in_payable_repair_cost",
        canonicalQuoteLedger: [
          { panelBeater: "Alpha", totalCostUsd: 1850, currency: "USD", status: "active", quoteId: "q-5" },
          { panelBeater: "Beta", totalCostUsd: 1925, currency: "USD", status: "active", quoteId: "q-6" },
          { panelBeater: "Old Beta", totalCostUsd: 1990, currency: "USD", status: "superseded", quoteId: "q-7" },
        ],
      },
    },
    dbQuotes: [],
    expected: { l2Status: "complete", quoteReceiptStatus: "quotes_received", comparisonUsd: 1725, complete: true, conclusion: "approved" },
  },
];

describe("R0 progressive L2 same-snapshot acceptance", () => {
  it.each(fixtures)("keeps L2 intelligence active for $name while limiting only unsupported conclusions", (fixture) => {
    const cost = resolveReportCostIntegrity(fixture.costIntel, fixture.dbQuotes);
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
    if (!fixture.expected.complete) {
      expect(decision.holdReason).toContain("recommendation");
    }
  });

  it("excludes a superseded quote from the same complete-state ledger", () => {
    const complete = fixtures.find((fixture) => fixture.name === "complete_all_in")!;
    const cost = resolveReportCostIntegrity(complete.costIntel, complete.dbQuotes);
    expect(cost.activeQuotes.map((quote) => quote.sourceReference)).toEqual(["q-5", "q-6"]);
  });

  it("uses the shared progressive L2 evidence boundary in CL, CI, FR, and the top cost view", () => {
    const files = [
      resolve(__dirname, "reportDefinitions.ts"),
      resolve(__dirname, "claimsIntelligenceReport.ts"),
      resolve(__dirname, "forensicDecisionReport.ts"),
      resolve(process.cwd(), "client/src/components/KingaClaimsReport.tsx"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("evidence-qualified");
    }
  });
});
