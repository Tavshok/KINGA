import { describe, expect, it } from "vitest";
import { assessL2EvidenceEligibility, selectLowestVerifiedEquivalent } from "./evidenceEligibility";
import type { MonetaryEvidence } from "./types";

const verifiedEvidence = (overrides: Partial<MonetaryEvidence> = {}): MonetaryEvidence => ({
  quoteId: 101,
  quoteLineItemId: 501,
  sourceDocumentId: 9001,
  sourcePage: 4,
  sourceLocation: "table:repair-lines,row:front-bumper",
  description: "Front bumper",
  canonicalComponent: "front-bumper",
  financialRole: "component",
  amountCents: 45000,
  currency: "USD",
  taxBasis: "included",
  scopeFingerprint: "replace-front-bumper-vat-included",
  revisionStatus: "original",
  evidenceStatus: "verified",
  extractionMethod: "human_verified",
  extractionConfidence: 1,
  ...overrides,
});

describe("evidence-governed L2 eligibility", () => {
  it("selects the lowest traceable, verified, equivalent submitted price", () => {
    const result = selectLowestVerifiedEquivalent([
      verifiedEvidence({ quoteId: 1, amountCents: 62000 }),
      verifiedEvidence({ quoteId: 2, amountCents: 45000 }),
    ], "replace-front-bumper-vat-included", "included");

    expect(result.selected?.quoteId).toBe(2);
    expect(result.selected?.amountCents).toBe(45000);
    expect(result.ineligibleFindings).toEqual([]);
  });

  it("excludes a lower structured amount when its source status is an extraction defect", () => {
    const result = selectLowestVerifiedEquivalent([
      verifiedEvidence({ quoteId: 1, amountCents: 650000 }),
      verifiedEvidence({
        quoteId: 2,
        amountCents: 591500,
        evidenceStatus: "extraction_defect",
        sourceLocation: "ledger:quoted_amount",
      }),
    ], "replace-front-bumper-vat-included", "included");

    expect(result.selected?.quoteId).toBe(1);
    expect(result.ineligibleFindings.some((finding) => finding.code === "evidence_status_not_eligible")).toBe(true);
  });

  it("does not compare different tax bases or repair scopes as equivalent", () => {
    const result = assessL2EvidenceEligibility(
      verifiedEvidence({ taxBasis: "excluded", scopeFingerprint: "repair-front-bumper-tax-excluded" }),
      "replace-front-bumper-vat-included",
      "included",
    );

    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["scope_not_equivalent", "tax_basis_not_equivalent"]));
  });

  it("requires document, page, and source location rather than accepting a ledger-only amount", () => {
    const result = assessL2EvidenceEligibility(
      verifiedEvidence({ sourceDocumentId: null, sourcePage: null, sourceLocation: null }),
      "replace-front-bumper-vat-included",
      "included",
    );

    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("source_provenance_incomplete");
  });
});
