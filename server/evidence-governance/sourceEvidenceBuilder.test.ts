import { describe, expect, it } from "vitest";
import { buildQuoteReconciliationFinding, buildSourceEvidence } from "./sourceEvidenceBuilder";
import { buildReportEvidencePresentation } from "./reportPresentation";

describe("document-backed quote evidence", () => {
  it("marks a precisely locatable submitted source row as verified", () => {
    const evidence = buildSourceEvidence({
      quoteId: 10620003,
      sourceDocumentId: 4650001,
      sourcePage: 13,
      sourceLocation: "footer:VAT",
      description: "VAT",
      financialRole: "vat",
      amountCents: 108400,
      currency: "USD",
      taxBasis: "separately_stated",
      scopeFingerprint: "stylin-auto-quote-1245",
      revisionStatus: "original",
      extractionMethod: "human_verified",
      extractionConfidence: 1,
    });

    expect(evidence.evidenceStatus).toBe("verified");
    expect(evidence.amountCents).toBe(108400);
  });

  it("keeps missing page or location evidence reconstructed rather than overstating certainty", () => {
    const evidence = buildSourceEvidence({
      quoteId: 1,
      sourceDocumentId: 99,
      sourcePage: null,
      sourceLocation: null,
      description: "Right front door",
      financialRole: "component",
      amountCents: 47000,
      currency: "USD",
      taxBasis: "not_stated",
      revisionStatus: "original",
      extractionMethod: "ocr",
    });

    expect(evidence.evidenceStatus).toBe("reconstructed");
  });

  it("treats source-to-ledger differences as an extraction defect rather than a price or fraud conclusion", () => {
    const finding = buildQuoteReconciliationFinding({
      quoteId: 10620001,
      sourceDocumentId: 4650001,
      sourcePage: 12,
      sourceLocation: "footer:Total Amount",
      repairer: "The Dent Doctor",
      sourceTotalCents: 650000,
      structuredTotalCents: 591500,
      currency: "USD",
    });

    expect(finding).toMatchObject({ status: "extraction_defect", severity: "blocking", code: "source_to_ledger_mismatch" });
    expect(finding?.summary).toContain("585.00 USD");
  });

  it("presents reconciliation facts and keeps pricing variance separate from a fraud conclusion", () => {
    const evidence = buildSourceEvidence({
      quoteId: 1,
      sourceDocumentId: 99,
      sourcePage: 2,
      sourceLocation: "table:parts,row:front-bumper",
      description: "Front bumper",
      financialRole: "component",
      amountCents: 55000,
      currency: "USD",
      taxBasis: "included",
      revisionStatus: "original",
      extractionMethod: "human_verified",
    });
    const report = buildReportEvidencePresentation([evidence], [{
      code: "pricing_variance",
      status: "pricing_variance_review_signal",
      severity: "review",
      title: "Material pricing variance",
      summary: "Review recommended.",
    }]);

    expect(report.heading).toBe("Cost Evidence & Comparability");
    expect(report.pricingVarianceReviewSignals).toHaveLength(1);
    expect(report.boundaryStatement).not.toMatch(/fraud/i);
  });
});
