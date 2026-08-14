import { describe, expect, it } from "vitest";
import { buildCanonicalQuoteLedger, canonicalRepairerKey, selectFinalL2RepairQuoteEvidence } from "./canonicalQuoteLedger";

describe("canonical repair-quote ledger", () => {
  it("collapses a duplicate panel-beater quotation despite a trading-name suffix", () => {
    const ledger = buildCanonicalQuoteLedger([
      {
        panel_beater: "SUPREME PANEL BEATERS AND SPRAY PAINTERS",
        currency: "USD",
        total_cost: 2300,
        document_category: "repair_quote",
        line_items: [{ component: "Front bumper", line_total: 1900 }, { component: "Paint", line_total: 400 }],
      },
      {
        panel_beater: "SUPREME PANEL BEATERS",
        currency: "USD",
        total_cost: 2300,
        document_category: "repair_quote",
        line_items: [{ component: "Front bumper", line_total: 1900 }, { component: "Paint", line_total: 400 }],
      },
    ]);

    expect(ledger.activeQuoteCount).toBe(1);
    expect(ledger.duplicateCount).toBe(1);
    expect(ledger.entries[1]).toMatchObject({ status: "duplicate", duplicateOfLedgerId: "quote-1" });
  });

  it("uses a durable panel-beater identifier in preference to a trading name", () => {
    expect(canonicalRepairerKey({ panel_beater: "Different Display Name", panel_beater_id: 41 })).toBe("panel:41");
  });

  it("marks an original quote as superseded when its linked revision is present", () => {
    const ledger = buildCanonicalQuoteLedger([
      { quote_id: 31, panel_beater: "Alpha Repairs", currency: "USD", total_cost: 1200, quote_type: "original" },
      { quote_id: 32, parent_quote_id: 31, panel_beater: "Alpha Repairs", currency: "USD", total_cost: 1350, quote_type: "revised" },
    ]);

    expect(ledger.entries[0]).toMatchObject({ status: "superseded" });
    expect(ledger.entries[1]).toMatchObject({ status: "active" });
    expect(ledger.activeQuoteCount).toBe(1);
  });

  it("keeps a supplementary quotation active while excluding parts-only documents", () => {
    const ledger = buildCanonicalQuoteLedger([
      { panel_beater: "Alpha Repairs", currency: "USD", total_cost: 1200, quote_type: "original" },
      { panel_beater: "Alpha Repairs", currency: "USD", total_cost: 220, quote_type: "supplementary" },
      { panel_beater: "Parts Supplier", currency: "USD", total_cost: 100, quote_type: "parts_supplier" },
    ]);

    expect(ledger.activeQuoteCount).toBe(2);
    expect(ledger.entries[1]).toMatchObject({ status: "supplementary" });
    expect(ledger.entries[2]).toMatchObject({ status: "excluded" });
  });

  it("preserves a cancelled price as historical evidence without admitting it into final L2 selection", () => {
    const ledger = buildCanonicalQuoteLedger([
      { quote_id: 41, panel_beater: "Alpha Repairs", currency: "USD", total_cost: 1200, workflow_status: "cancelled" },
      { quote_id: 42, panel_beater: "Beta Repairs", currency: "USD", total_cost: 1250, workflow_status: "submitted" },
    ]);

    expect(ledger.entries[0]).toMatchObject({ status: "historical", evidenceEligibility: "comparison_only", workflowStatus: "cancelled" });
    expect(ledger.entries[1]).toMatchObject({ status: "active", evidenceEligibility: "final_l2_eligible" });
    expect(ledger.activeQuoteCount).toBe(1);
  });

  it("retains a commercial rejection as comparison-only history while excluding an explicit integrity disqualification", () => {
    const ledger = buildCanonicalQuoteLedger([
      { quote_id: 51, panel_beater: "Alpha Repairs", currency: "USD", total_cost: 1200, workflow_status: "rejected" },
      {
        quote_id: 52,
        panel_beater: "Beta Repairs",
        currency: "USD",
        total_cost: 1250,
        workflow_status: "submitted",
        evidence_eligibility: "ineligible",
        evidence_eligibility_reason: "Quoted scope is not supported by the damage evidence.",
      },
    ]);

    expect(ledger.entries[0]).toMatchObject({ status: "historical", evidenceEligibility: "comparison_only" });
    expect(ledger.entries[1]).toMatchObject({ status: "excluded", evidenceEligibility: "ineligible" });
    expect(ledger.activeQuoteCount).toBe(0);
  });

  it("selects only eligible active repair evidence for the actual Stage 9 L2 boundary while retaining all other price history", () => {
    const ledger = buildCanonicalQuoteLedger([
      { quote_id: 61, panel_beater: "Withdrawn Repairs", currency: "USD", total_cost: 900, workflow_status: "cancelled" },
      { quote_id: 62, panel_beater: "Commercial Review", currency: "USD", total_cost: 950, workflow_status: "rejected" },
      { quote_id: 63, panel_beater: "Scope Defect", currency: "USD", total_cost: 1000, evidence_eligibility: "ineligible", evidence_eligibility_reason: "Unsupported repair scope." },
      { quote_id: 64, panel_beater: "Eligible Repairs", currency: "USD", total_cost: 1050, workflow_status: "submitted", document_category: "repair_quote" },
      { quote_id: 65, panel_beater: "Revision Parent", currency: "USD", total_cost: 1100, workflow_status: "submitted" },
      { quote_id: 66, parent_quote_id: 65, panel_beater: "Revision Parent", currency: "USD", total_cost: 1150, workflow_status: "submitted", quote_type: "revised" },
    ]);

    expect(selectFinalL2RepairQuoteEvidence(ledger).map((quote) => quote.quote_id)).toEqual([64, 66]);
    expect(ledger.entries.filter((entry) => entry.status === "historical")).toHaveLength(2);
    expect(ledger.entries.find((entry) => entry.quoteId === "63")).toMatchObject({ status: "excluded", evidenceEligibility: "ineligible" });
    expect(ledger.entries.find((entry) => entry.quoteId === "65")).toMatchObject({ status: "superseded" });
  });
});
