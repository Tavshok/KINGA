import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../client/src/components/ReportSectionThread", () => ({
  ReportSectionThread: () => null,
}));

import { ComponentCostMatrix } from "../../client/src/components/ComponentCostMatrix";
import { ClaimDecisionReportStandardView } from "../../client/src/components/ClaimDecisionReportStandardView";
import { getKingaClaimsReportAudience } from "../../client/src/lib/reportAudience";

const claimantRouteSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/ClaimDecisionReport.tsx"),
  "utf8",
);
const insurerRouteSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/InsurerComparisonView.tsx"),
  "utf8",
);

function renderMatrix(audience: "client" | "professional") {
  return renderToStaticMarkup(
    React.createElement(ComponentCostMatrix, {
      audience,
      quotes: [{ name: "Repairer Alpha", total: 1000, lineItems: [] }],
      rows: [{
        description: "Front bumper",
        cells: [{ amount: 1000 }],
        kingaAmount: 900,
        kingaSource: "Market Benchmark",
        benchmarkModelSource: "statistical",
        l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT",
        benchmarkStratum: "make_model_year_band",
        benchmarkFallbackLevel: 2,
        benchmarkSampleSize: 8,
        benchmarkSampleSufficiency: "sufficient",
      }],
      fmtMoney: (amount: number) => `USD ${amount.toFixed(2)}`,
    }),
  );
}

function renderStandardRoute(audience: "client" | "professional") {
  return renderToStaticMarkup(
    React.createElement(ClaimDecisionReportStandardView, {
      audience,
      claim: {
        id: 9001,
        claimNumber: "KNG-TEST-9001",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        vehicleYear: 2022,
        currencyCode: "USD",
      },
      aiAssessment: {
        id: 7001,
        costIntelligenceJson: JSON.stringify({
          compositeOptimisation: {
            isComplete: true,
            l2Status: "complete",
            l2CompositeOptimisedCostUsd: 900,
            l1SubmittedCostUsd: 1000,
            canonicalQuoteLedger: [{
              quoteId: "q-1",
              panelBeater: "Repairer Alpha",
              totalCostUsd: 1000,
              status: "active",
              evidenceEligibility: "final_l2_eligible",
            }],
            compositeLineItems: [{
              componentName: "Front bumper",
              selectedCostUsd: 900,
              kingaOptimisedTier: "T2",
              benchmarkModelSource: "statistical",
              l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT",
              benchmarkStratum: "make_model_year_band",
              benchmarkFallbackLevel: 2,
              benchmarkSampleSize: 8,
              benchmarkSampleSufficiency: "sufficient",
            }],
          },
        }),
      },
      enforcement: {},
      quotes: [{
        id: "q-1",
        panelBeaterName: "Repairer Alpha",
        quotedAmount: 100000,
        lineItems: [{ description: "Front bumper", lineTotal: 1000 }],
      }],
    }),
  );
}

describe("AUD-P1-014 claimant and professional report audience boundary", () => {
  it("selects concise client disclosure for the claimant route and explicit professional evidence for insurer view", () => {
    expect(getKingaClaimsReportAudience("claimant")).toBe("client");
    expect(getKingaClaimsReportAudience("insurer")).toBe("professional");
    expect(getKingaClaimsReportAudience("platform_super_admin")).toBe("professional");
    expect(claimantRouteSource).toContain("audience={getKingaClaimsReportAudience(user?.role)}");
    expect(insurerRouteSource).toContain('audience="professional"');
  });

  it("renders no benchmark mechanics for claimant-selected component evidence while retaining them for professional evidence", () => {
    const clientHtml = renderMatrix(getKingaClaimsReportAudience("claimant"));
    const professionalHtml = renderMatrix(getKingaClaimsReportAudience("insurer"));

    for (const hiddenTerm of ["Market Benchmark", "Stat n=8", "Internal comparison", "Internal fallback", "Internal sample", "Benchmark selected within 30%"] as const) {
      expect(clientHtml).not.toContain(hiddenTerm);
      expect(professionalHtml).toContain(hiddenTerm);
    }
  });

  it("renders the actual standard report section without benchmark mechanics for a claimant while preserving professional evidence", () => {
    const clientHtml = renderStandardRoute("client");
    const professionalHtml = renderStandardRoute("professional");

    expect(clientHtml).toContain("KINGA Optimised Quote");
    expect(clientHtml).toContain("Potential savings");
    expect(clientHtml).not.toContain("Severity Benchmark");
    expect(professionalHtml).not.toContain("Severity Benchmark");
    for (const hiddenTerm of ["Market Benchmark", "Stat n=8", "Internal comparison", "Internal fallback", "Internal sample", "Benchmark selected within 30%"] as const) {
      expect(clientHtml).not.toContain(hiddenTerm);
      expect(professionalHtml).toContain(hiddenTerm);
    }
  });
});
