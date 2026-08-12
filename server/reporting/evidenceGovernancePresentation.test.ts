import { describe, expect, it } from "vitest";
import { renderEvidenceGovernancePanel } from "./evidenceGovernancePresentation";

describe("evidence governance report presentation", () => {
  it("renders a source register and treats a pricing variance as a review signal only", () => {
    const html = renderEvidenceGovernancePanel({
      ledger: [{
        description: "Front bumper",
        amount_cents: 55000,
        currency: "USD",
        source_document_id: 45,
        source_page: 2,
        source_location: "table:parts,row:front-bumper",
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

    expect(html).toContain("Cost Evidence &amp; Comparability");
    expect(html).toContain("Document 45 · p2");
    expect(html).toContain("Pricing variance review signals");
    expect(html).toContain("not a fraud conclusion");
  });

  it("does not invent certainty when no evidence rows have been recorded", () => {
    const html = renderEvidenceGovernancePanel({ ledger: [], findings: [] });
    expect(html).toContain("No document-backed evidence register");
    expect(html).toContain("will not treat legacy ledger values as verified");
  });
});
