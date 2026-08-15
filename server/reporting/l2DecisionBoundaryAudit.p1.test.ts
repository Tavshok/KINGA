import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentationContract } from "../../shared/costDecisionPresentation";
import { assessL2EvidenceEligibility, selectLowestVerifiedEquivalent } from "../evidence-governance/evidenceEligibility";
import { buildQuoteReconciliationFinding } from "../evidence-governance/sourceEvidenceBuilder";
import type { MonetaryEvidence } from "../evidence-governance/types";
import { buildCompositeQuote } from "../pipeline-v2/quoteOptimisationEngine";
import { resolveReportCostIntegrity } from "./costIntegrity";
import { resolveReportDecisionIntegrity } from "./reportDecisionIntegrity";
import { R0_QUOTE_EVIDENCE_FIXTURES } from "./r0QuoteEvidenceFixtures";

function verifiedEvidence(overrides: Partial<MonetaryEvidence> = {}): MonetaryEvidence {
  return {
    quoteId: 1,
    quoteLineItemId: 1,
    sourceDocumentId: 10,
    sourcePage: 1,
    sourceLocation: "table:repair,row:front-bumper",
    description: "Front bumper",
    canonicalComponent: "front-bumper",
    financialRole: "component",
    amountCents: 100000,
    currency: "USD",
    taxBasis: "included",
    scopeFingerprint: "replace-front-bumper-vat-included",
    revisionStatus: "original",
    evidenceStatus: "verified",
    extractionMethod: "human_verified",
    extractionConfidence: 1,
    ...overrides,
  };
}

describe("AUD L2 and cost-decision boundary matrix — no-write", () => {
  it.each(R0_QUOTE_EVIDENCE_FIXTURES)("classifies the frozen $name quotation state without inventing a payable conclusion", (fixture) => {
    const cost = resolveReportCostIntegrity(fixture.costIntel, [...fixture.dbQuotes]);
    const presentation = buildCostDecisionPresentationContract(fixture.presentationEvidence);
    const decision = resolveReportDecisionIntegrity({
      recommendation: "APPROVE",
      workflowState: fixture.expected.complete ? "financial_decision" : "technical_approval",
      costIntegrity: cost,
    });

    expect(cost.l2Status).toBe(fixture.expected.l2Status);
    expect(presentation.quoteVerification).toBe(fixture.expected.verification);
    expect(presentation.optimisedQuoteAmount).toBe(fixture.expected.presentationAmount);
    expect(presentation.optimisedQuoteState).toBe(fixture.expected.presentationState);
    expect(decision.status).toBe(fixture.expected.conclusion === "approved" ? "APPROVED" : "REVIEW_REQUIRED");
    if (!fixture.expected.complete) {
      expect(presentation.potentialSavingsAmount).toBeNull();
      expect(presentation.optimisedQuoteState).not.toBe("complete");
    }
  });

  it("excludes a lower source-to-ledger extraction defect while retaining the higher verified equivalent source value", () => {
    const mismatch = buildQuoteReconciliationFinding({
      quoteId: 2,
      sourceDocumentId: 20,
      sourcePage: 2,
      sourceLocation: "footer:total",
      repairer: "Mismatch Repairs",
      sourceTotalCents: 120000,
      structuredTotalCents: 90000,
      currency: "USD",
    });
    const selection = selectLowestVerifiedEquivalent([
      verifiedEvidence({ quoteId: 1, amountCents: 100000 }),
      verifiedEvidence({
        quoteId: 2,
        amountCents: 90000,
        evidenceStatus: "extraction_defect",
        sourceLocation: "ledger:quoted_amount",
      }),
    ], "replace-front-bumper-vat-included", "included");

    expect(mismatch).toMatchObject({
      code: "source_to_ledger_mismatch",
      status: "extraction_defect",
      severity: "blocking",
    });
    expect(selection.selected).toMatchObject({ quoteId: 1, amountCents: 100000 });
    expect(selection.ineligibleFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "evidence_status_not_eligible" }),
    ]));
  });

  it("suppresses tax-basis and scope-difference comparisons rather than treating them as a lower eligible price", () => {
    const incompatible = verifiedEvidence({
      quoteId: 2,
      amountCents: 80000,
      taxBasis: "excluded",
      scopeFingerprint: "repair-front-bumper-tax-excluded",
    });
    const eligibility = assessL2EvidenceEligibility(
      incompatible,
      "replace-front-bumper-vat-included",
      "included",
    );
    const selection = selectLowestVerifiedEquivalent([
      verifiedEvidence({ quoteId: 1, amountCents: 100000 }),
      incompatible,
    ], "replace-front-bumper-vat-included", "included");

    expect(eligibility).toMatchObject({ eligible: false });
    expect(eligibility.reasonCodes).toEqual(expect.arrayContaining([
      "scope_not_equivalent",
      "tax_basis_not_equivalent",
    ]));
    expect(selection.selected).toMatchObject({ quoteId: 1, amountCents: 100000 });
  });

  it("uses VAT and mandatory workshop charges only when explicitly submitted, retaining an all-in basis without creating an extra cost", () => {
    const result = buildCompositeQuote([{
      panel_beater: "All-in Repairs",
      total_cost: 1180,
      currency: "USD",
      components: ["Front Bumper", "VAT", "Workshop fee"],
      confidence: "high",
      lineItems: [
        { componentName: "Front Bumper", costUsd: 1000, isRepair: false, isReplacement: true, isNonPartCost: false },
        { componentName: "VAT", costUsd: 120, isRepair: false, isReplacement: false, isNonPartCost: true },
        { componentName: "Workshop fee", costUsd: 60, isRepair: false, isReplacement: false, isNonPartCost: true },
      ],
    }], {}, 1180, undefined, ["Front Bumper", "VAT", "Workshop fee"]);

    expect(result).toMatchObject({
      isComplete: true,
      compositeOptimisedCostUsd: 1180,
      allInReconciliationRequired: false,
    });
    expect(result.compositeLineItems.map((item) => item.componentName)).toEqual(expect.arrayContaining([
      "Front Bumper",
      "vat",
      "workshop fee",
    ]));
  });
});
