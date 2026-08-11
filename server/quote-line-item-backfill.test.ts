import { describe, expect, it } from "vitest";
import { buildHistoricalLineItemValues, normaliseHistoricalCategory } from "./quote-line-item-backfill";

describe("historical quote line-item backfill", () => {
  it("normalises historical Stage 9 categories to quote-line-item categories", () => {
    expect(normaliseHistoricalCategory("labour")).toBe("labor");
    expect(normaliseHistoricalCategory("repair")).toBe("parts");
    expect(normaliseHistoricalCategory("VAT")).toBe("sundries");
    expect(normaliseHistoricalCategory("unrecognised")).toBe("other");
  });

  it("preserves priced, identifiable Stage 9 line items and excludes ambiguous zero-value rows", () => {
    const values = buildHistoricalLineItemValues(44, "USD", [
      { component: "Front bumper", quantity: 1, unit_cost: 325, line_total: 325, category: "replacement" },
      { description: "Labour", quantity: 2, unitPrice: 75, lineTotal: 150, category: "labour", isRepair: true },
      { description: "Unpriced note", quantity: 1, unit_cost: 0, line_total: 0 },
    ]);

    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({ quoteId: 44, category: "parts", lineTotal: "325.00" });
    expect(values[1]).toMatchObject({ quoteId: 44, category: "labor", isRepair: 1, lineTotal: "150.00" });
  });
});
