import { describe, expect, it } from "vitest";
import { buildProgressiveL2Comparison, renderEvidenceGovernancePanel } from "./evidenceGovernancePresentation";

describe("evidence governance report presentation", () => {
  it("renders a source register and treats a pricing variance as a review signal only", () => {
    const html = renderEvidenceGovernancePanel({
      ledger: [{
        quote_id: 1,
        description: "Front bumper",
        amount_cents: 55000,
        currency: "USD",
        source_document_id: 45,
        source_page: 2,
        source_location: "table:parts,row:front-bumper",
        source_row_label: "FRONT BUMPER",
        canonical_component: "Front Bumper",
        financial_role: "component",
        tax_basis: "included",
        scope_fingerprint: "replace-front-bumper",
        revision_status: "original",
        evidence_status: "verified",
      }],
      findings: [{
        finding_code: "pricing_variance",
        title: "Material variance",
        summary: "The submitted price is outside the comparison range.",
        evidence_status: "pricing_variance_review_signal",
        severity: "review",
        source_document_id: 45,
        source_page: 2,
        source_location: "table:parts,row:front-bumper",
      }],
    });

    expect(html).toContain("L2 Evidence Reconciliation");
    expect(html).toContain("Document 45 · p2");
    expect(html).toContain("Pricing variance review signals");
    expect(html).toContain("not a fraud conclusion");
    expect(html).toContain("1 of 1 explicit source rows verified (100% evidence coverage)");
    expect(html).toContain("Evidence-qualified submitted-price L2 comparison");
  });

  it("does not invent certainty when no evidence rows have been recorded", () => {
    const html = renderEvidenceGovernancePanel({ ledger: [], findings: [] });
    expect(html).toContain("No document-backed evidence register");
    expect(html).toContain("will not treat legacy ledger values as verified");
  });

  it("keeps L2 intelligence visible when source reconciliation is incomplete", () => {
    const html = renderEvidenceGovernancePanel({
      ledger: [{
        quote_id: 2,
        description: "Spray painting",
        amount_cents: 100000,
        currency: "USD",
        source_document_id: 45,
        source_page: 3,
        source_location: "table:repairs,row:2",
        source_row_label: "SPRAY PAINTING",
        canonical_component: "Spray Painting",
        financial_role: "paint",
        tax_basis: "not_stated",
        scope_fingerprint: null,
        revision_status: "original",
        evidence_status: "verified",
      }],
      findings: [{
        finding_code: "source_arithmetic",
        title: "Source arithmetic requires reconciliation",
        summary: "A separate source amount needs clarification.",
        evidence_status: "evidence_gap",
        severity: "review",
        source_document_id: 45,
        source_page: 3,
        source_location: "table:repairs",
      }],
    });

    expect(html).toContain("Comparison available — qualification required");
    expect(html).toContain("L2 intelligence remains available while exceptions are reconciled");
    expect(html).toContain("final optimised total, savings figure, or settlement recommendation");
  });

  it("selects only active, exact-normalised verified source rows without absorbing excluded quote evidence", () => {
    const data = {
      ledger: [
        {
          quote_id: 10, description: "Front bumper", amount_cents: 90000, currency: "USD",
          source_document_id: 1, source_page: 1, source_location: "row:1", source_row_label: "FRONT BUMPER",
          canonical_component: "Front Bumper", financial_role: "component", tax_basis: "included",
          scope_fingerprint: "replace-front-bumper", revision_status: "original", evidence_status: "verified",
        },
        {
          quote_id: 11, description: "Front bumper", amount_cents: 80000, currency: "USD",
          source_document_id: 2, source_page: 1, source_location: "row:1", source_row_label: "FRONT BUMPER",
          canonical_component: "Front Bumper", financial_role: "component", tax_basis: "included",
          scope_fingerprint: "replace-front-bumper", revision_status: "original", evidence_status: "verified",
        },
        {
          quote_id: 12, description: "Front bumper", amount_cents: 10000, currency: "USD",
          source_document_id: 3, source_page: 1, source_location: "row:1", source_row_label: "FRONT BUMPER",
          canonical_component: "Front Bumper", financial_role: "component", tax_basis: "included",
          scope_fingerprint: "replace-front-bumper", revision_status: "superseded", evidence_status: "verified",
        },
        {
          quote_id: 10, description: "VAT", amount_cents: 15000, currency: "USD",
          source_document_id: 1, source_page: 1, source_location: "row:9", source_row_label: "VAT",
          canonical_component: null, financial_role: "tax", tax_basis: "stated_separately",
          scope_fingerprint: null, revision_status: "original", evidence_status: "verified",
        },
      ],
      findings: [],
    };

    const comparison = buildProgressiveL2Comparison(data, new Set(["10", "11"]));
    expect(comparison).toEqual({
      activeSourceRows: 3,
      selectedRows: 2,
      crossQuoteRows: 1,
      totalsByCurrency: [{ currency: "USD", amountCents: 95000 }],
    });
  });
});
