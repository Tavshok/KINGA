import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComponentCostMatrix } from "../../client/src/components/ComponentCostMatrix";

describe("AUD-P1-006 client ComponentCostMatrix L2 traceability", () => {
  it("renders benchmark, outside-tolerance, and high-variance selection evidence without inventing savings or settlement treatment", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComponentCostMatrix, {
        quotes: [
          { name: "Repairer Alpha", total: 1200, lineItems: [] },
          { name: "Repairer Beta", total: 1320, lineItems: [] },
        ],
        rows: [
          {
            description: "Front bumper",
            cells: [{ amount: 400 }, { amount: 440 }],
            kingaAmount: 415,
            kingaSource: "Market Benchmark",
            l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT",
            benchmarkDeviationPct: 3.75,
          },
          {
            description: "Radiator support",
            cells: [{ amount: 600 }, { amount: 980 }],
            kingaAmount: 600,
            kingaSource: "Repairer Alpha",
            l2SelectionMethod: "LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT",
            benchmarkDeviationPct: 41.2,
          },
          {
            description: "Headlamp assembly",
            cells: [{ amount: 200 }, { amount: 320 }],
            kingaAmount: 200,
            kingaSource: "Repairer Alpha",
            l2SelectionMethod: "LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT",
            benchmarkDeviationPct: 36.4,
            highLineItemVariance: true,
            lineItemSpreadPct: 60,
            lineItemVarianceRemark: "High line-item spread; verify scope before repair authorisation.",
          },
        ],
        fmtMoney: (amount: number) => `USD ${amount.toFixed(2)}`,
      }),
    );

    expect(html).toContain("Benchmark selected within 30%");
    expect(html).toContain("3.8% variance");
    expect(html).toContain("Market Benchmark");
    expect(html).toContain("Outside 30% · lower validated value selected");
    expect(html).toContain("41.2% variance");
    expect(html).toContain("Repairer Alpha");
    expect(html).toContain("High line-item spread; verify scope before repair authorisation.");
    expect(html).not.toContain("Savings Opportunity");
    expect(html).not.toContain("Settlement authorised");
    expect(html).not.toContain("Settlement recommended");
  });
});
