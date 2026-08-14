import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../client/src/components/ReportSectionThread", () => ({
  ReportSectionThread: () => null,
}));

import { ClientCostDecisionStrip } from "../../client/src/components/KingaClaimsReport";

describe("AUD-L2-002 client top-cost warning presentation", () => {
  it("publishes KINGA Optimised Quote while retaining provenance and extraction review findings", () => {
    const html = renderToStaticMarkup(createElement(ClientCostDecisionStrip, {
      costIntelligence: {
          compositeOptimisation: {
            isComplete: true,
            l2Status: "complete",
            l2CompositeOptimisedCostUsd: 1000,
            l1SubmittedCostUsd: 1100,
            canonicalQuoteLedger: [{
              quoteId: "q-1",
              panelBeater: "Repairer A",
              totalCostUsd: 1100,
              status: "active",
              evidenceEligibility: "final_l2_eligible",
            }, {
              quoteId: "q-defective",
              panelBeater: "Defective Extraction",
              totalCostUsd: 900,
              status: "supplementary",
              evidenceEligibility: "final_l2_eligible",
            }],
            evidenceGovernance: {
              findings: [
                { code: "source_provenance_pending", title: "Source provenance pending", summary: "Document and page provenance requires confirmation." },
                { code: "line_pricing_not_source_verified", title: "Extraction review", summary: "One or more submitted line prices require extraction review." },
              ],
            },
          },
        },
      quotes: [],
      fmtCurrency: (amount: number | null | undefined) => `USD ${amount?.toFixed(2) ?? "—"}`,
      totalLossIndicated: false,
      repairToValueRatio: 25,
    }));

    expect(html).toContain("KINGA Optimised Quote");
    expect(html).toContain("USD 1000.00");
    expect(html).toContain("REVIEW REQUIRED");
    expect(html).toContain("Defective Extraction");
    expect(html).toContain("Document and page provenance requires confirmation.");
    expect(html).toContain("One or more submitted line prices require extraction review.");
  });

  it("keeps KINGA Optimised Quote visible as a review-required priced scope with a separate whole-quote anchor", () => {
    const html = renderToStaticMarkup(createElement(ClientCostDecisionStrip, {
      costIntelligence: {
        compositeOptimisation: {
          isComplete: false,
          l2Status: "incomplete_scope",
          partialPricedScopeUsd: 1480,
          l1SubmittedCostUsd: 1820,
          missingRequiredComponents: ["Headlamp alignment"],
          canonicalQuoteLedger: [{ quoteId: "q-1", panelBeater: "Repairer A", totalCostUsd: 1820, status: "active", evidenceEligibility: "final_l2_eligible" }],
        },
      },
      quotes: [], fmtCurrency: (amount: number | null | undefined) => `USD ${amount?.toFixed(2) ?? "—"}`,
      totalLossIndicated: false, repairToValueRatio: 25,
    }));
    expect(html).toContain("KINGA Optimised Quote");
    expect(html).toContain("Review-required priced scope · USD 1480.00");
    expect(html).toContain("not all-in");
    expect(html).toContain("Eligible submitted whole-quote anchor (not component-optimised) · USD 1820.00");
    expect(html).toContain("Missing submitted price: Headlamp alignment.");
  });

  it("keeps KINGA Optimised Quote visible when only an eligible whole-quote anchor exists", () => {
    const html = renderToStaticMarkup(createElement(ClientCostDecisionStrip, {
      costIntelligence: {
        compositeOptimisation: {
          isComplete: false,
          l2Status: "evidence_qualified",
          l1SubmittedCostUsd: 1240,
          canonicalQuoteLedger: [{ quoteId: "q-total-only", panelBeater: "Repairer Total", totalCostUsd: 1240, status: "active", evidenceEligibility: "final_l2_eligible" }],
        },
      },
      quotes: [], fmtCurrency: (amount: number | null | undefined) => `USD ${amount?.toFixed(2) ?? "—"}`,
      totalLossIndicated: false, repairToValueRatio: 25,
    }));
    expect(html).toContain("KINGA Optimised Quote");
    expect(html).toContain("Human review required");
    expect(html).toContain("no supported submitted component amount");
    expect(html).toContain("Eligible submitted whole-quote anchor (not component-optimised) · USD 1240.00");
  });

  it("keeps the full remaining-eligible quotation matrix transparent without suppressing KINGA Optimised Quote", () => {
    const html = renderToStaticMarkup(createElement(ClientCostDecisionStrip, {
      costIntelligence: {
        compositeOptimisation: {
          isComplete: true, l2Status: "complete", l2CompositeOptimisedCostUsd: 1000, l1SubmittedCostUsd: 900,
          canonicalQuoteLedger: [
            { quoteId: "q-eligible", panelBeater: "Eligible Repairs", totalCostUsd: 1100, status: "active", evidenceEligibility: "final_l2_eligible" },
            { quoteId: "q-defective", panelBeater: "Defective Extraction", totalCostUsd: 900, status: "supplementary", evidenceEligibility: "final_l2_eligible" },
            { quoteId: "q-total", panelBeater: "Total-only Quote", totalCostUsd: 1300, status: "active", evidenceEligibility: "final_l2_eligible" },
            { quoteId: "q-incomplete", panelBeater: "Incomplete Scope", totalCostUsd: 1250, status: "active", evidenceEligibility: "final_l2_eligible" },
            { quoteId: "q-cancelled", panelBeater: "Cancelled Quote", totalCostUsd: 600, status: "historical", evidenceEligibility: "comparison_only" },
            { quoteId: "q-rejected", panelBeater: "Rejected Quote", totalCostUsd: 650, status: "historical", evidenceEligibility: "comparison_only" },
            { quoteId: "q-ineligible", panelBeater: "Unsupported Scope", totalCostUsd: 500, status: "excluded", evidenceEligibility: "ineligible" },
            { quoteId: "q-original", panelBeater: "Revised Repairer", totalCostUsd: 1500, status: "superseded", evidenceEligibility: "final_l2_eligible" },
            { quoteId: "q-revised", panelBeater: "Revised Repairer", totalCostUsd: 1400, status: "active", evidenceEligibility: "final_l2_eligible" },
          ],
          evidenceGovernance: { findings: [{ code: "line_pricing_not_source_verified", title: "Extraction review", summary: "Defective Extraction requires line-price review." }] },
        },
      },
      quotes: [], fmtCurrency: (amount: number | null | undefined) => `USD ${amount?.toFixed(2) ?? "—"}`,
      totalLossIndicated: false, repairToValueRatio: 25,
    }));
    expect(html).toContain("KINGA Optimised Quote");
    expect(html).toContain("USD 1000.00");
    expect(html).toContain("Defective Extraction requires line-price review.");
    expect(html).toContain("Qualified quotation history — not used for active comparison");
    for (const name of ["Defective Extraction", "Total-only Quote", "Incomplete Scope", "Cancelled Quote", "Rejected Quote", "Unsupported Scope", "Revised Repairer"]) {
      expect(html).toContain(name);
    }
  });
});
