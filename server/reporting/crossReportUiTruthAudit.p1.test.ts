import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildCostDecisionPresentationContract } from "../../shared/costDecisionPresentation";
import ClaimsManagerComparisonView from "../../client/src/pages/ClaimsManagerComparisonView";
import { r0QuoteEvidenceFixture } from "./r0QuoteEvidenceFixtures";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

vi.mock("wouter", () => ({
  useParams: () => ({ id: "101" }),
  useLocation: () => ["", vi.fn()],
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    claims: { getById: { useQuery: () => ({ data: { id: 101, claimNumber: "TRUTH-101", vehicleMake: "Toyota", vehicleModel: "Corolla", vehicleYear: 2022, status: "under_review" }, isLoading: false }) } },
    aiAssessments: { byClaim: { useQuery: () => ({ data: { estimatedCost: 1100, confidenceScore: 90, fraudRiskScore: 5, fraudRiskLevel: "low" }, isLoading: false }) } },
    assessorEvaluations: { byClaim: { useQuery: () => ({ data: null, isLoading: false }) } },
    quotes: { byClaim: { useQuery: () => ({ data: [
      { id: 1, quotedAmount: 80000, status: "cancelled", repairerName: "Withdrawn Repairs" },
      { id: 2, quotedAmount: 120000, status: "submitted", repairerName: "Eligible Repairs" },
    ], isLoading: false }) } },
  },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { role: "claims_manager" } }) }));
vi.mock("@/hooks/useTenantCurrency", () => ({ useTenantCurrency: () => ({ fmt: (value: number) => `USD ${value.toFixed(2)}` }) }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: any) => children, CardContent: ({ children }: any) => children, CardDescription: ({ children }: any) => children, CardHeader: ({ children }: any) => children, CardTitle: ({ children }: any) => children }));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: any) => children }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children }: any) => children }));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: () => null }));
vi.mock("@/components/GovernanceIndicators", () => ({ GovernanceIndicators: () => null }));
vi.mock("@/components/AiStatusBadge", () => ({ AiStatusBadge: () => null }));
vi.mock("@/components/GovernanceSummaryWidget", () => ({ GovernanceSummaryWidget: () => null }));
vi.mock("@/components/QMSCompliancePanel", () => ({ QMSCompliancePanel: () => null }));
vi.mock("@/components/VehicleStructuralIntelligencePanel", () => ({ VehicleStructuralIntelligencePanel: () => null }));
vi.stubGlobal("React", React);

describe("AUD cross-report and UI truth audit — no-write", () => {
  it("keeps CL, CI, FR, and the client top-cost surface on the shared cost-decision contract", () => {
    const complete = r0QuoteEvidenceFixture("complete_all_in");
    const presentation = buildCostDecisionPresentationContract(complete.presentationEvidence);

    expect(presentation).toMatchObject({
      quoteVerification: "PASSED",
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: 1725,
      optimisedQuoteState: "complete",
    });
    for (const file of [
      "server/reporting/reportDefinitions.ts",
      "server/reporting/claimsIntelligenceReport.ts",
      "server/reporting/forensicDecisionReport.ts",
    ]) {
      const source = read(file);
      expect(source).toContain('from "./costDecisionPresentation"');
      expect(source).toContain("renderCostDecisionSummaryHtml");
      expect(source).toContain("costDecisionSummary");
    }
    const client = read("client/src/components/KingaClaimsReport.tsx");
    expect(client).toContain("buildCostDecisionPresentationContract");
    expect(client).toContain("costDecision.optimisedQuoteLabel");
    expect(client).toContain("costDecision.potentialSavingsAmount");
  });

  it("records the Claims Manager comparison divergence from canonical L1/L2 authority", () => {
    const view = read("client/src/pages/ClaimsManagerComparisonView.tsx");
    const query = read("server/db/assessment-db.ts");

    expect(view).toContain("trpc.quotes.byClaim.useQuery({ claimId })");
    expect(view).toContain("quotes.reduce");
    expect(view).toContain("q.quotedAmount");
    expect(view).not.toContain("canonicalQuoteLedger");
    expect(view).not.toContain("l2CompositeOptimisedCostUsd");
    expect(query).toContain("where(and(eq(panelBeaterQuotes.claimId, claimId), eq(claims.tenantId, tenantId)))");
    expect(query).not.toContain("workflowStatus");
  });

  it("renders the actual Claims Manager lowest-quote summary from an ineligible raw cent value", () => {
    const html = renderToStaticMarkup(React.createElement(ClaimsManagerComparisonView));

    expect(html).toContain("Lowest Quote");
    expect(html).toContain("$80,000");
    expect(html).not.toContain("KINGA Optimised Quote");
  });
});
