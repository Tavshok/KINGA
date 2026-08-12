import { describe, expect, it } from "vitest";
import { buildCanonicalQuoteLedger, canonicalRepairerKey } from "./canonicalQuoteLedger";

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
});
