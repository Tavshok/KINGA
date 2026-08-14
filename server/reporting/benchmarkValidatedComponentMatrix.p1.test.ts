import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComponentCostMatrix } from "../../client/src/components/ComponentCostMatrix";

describe("benchmark-validated L2 component matrix acceptance", () => {
  it("renders benchmark selection, outside-tolerance selection, and high-variance remarks from composite rows", () => {
    const html = renderToStaticMarkup(createElement(ComponentCostMatrix, {
      quotes: [{
        name: "Repairer One",
        total: 280,
        lineItems: [
          { description: "Front bumper", lineTotal: 110 },
          { description: "Headlamp", lineTotal: 170 },
        ],
      }],
      rows: [
        {
          description: "Front bumper",
          cells: [{ amount: 110 }],
          kingaAmount: 100,
          kingaSource: "P50 benchmark",
          l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT",
          benchmarkDeviationPct: 10,
        },
        {
          description: "Headlamp",
          cells: [{ amount: 170 }],
          kingaAmount: 120,
          kingaSource: "Submitted active price",
          l2SelectionMethod: "LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT",
          benchmarkDeviationPct: 41.7,
          highLineItemVariance: true,
          lineItemSpreadPct: 25,
          lineItemVarianceRemark: "High submitted-price spread; verify like-for-like scope.",
        },
      ],
      l1Total: 280,
      l2Total: 220,
      savingsUsd: 60,
      fmtMoney: (value) => `$${value.toFixed(2)}`,
    }));

    expect(html).toContain("Benchmark selected within 30% · 10.0% variance");
    expect(html).toContain("Outside 30% · lower validated value selected · 41.7% variance");
    expect(html).toContain("High submitted-price spread; verify like-for-like scope.");
    expect(html).toContain("$100.00");
    expect(html).toContain("$120.00");
  });
});
