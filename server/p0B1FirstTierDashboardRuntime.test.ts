import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mocks = vi.hoisted(() => ({
  operationalClaims: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    claims: {
      getRiskManagerOperationalClaims: {
        useQuery: mocks.operationalClaims,
      },
    },
  },
}));

vi.mock("@/components/ValidationGate", () => ({
  P0FraudValidationHold: ({ hold }: { hold: { status: string } }) =>
    React.createElement("div", { "data-testid": "p0-fraud-hold" }, hold.status),
}));

let RiskManagerDashboard: React.ComponentType;

function query(data: unknown) {
  return { data, isLoading: false };
}

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("P0-B1 first-tier dashboard runtime containment", () => {
  beforeAll(async () => {
    ({ default: RiskManagerDashboard } = await import(
      "../client/src/pages/RiskManagerDashboard"
    ));
  });

  beforeEach(() => {
    mocks.operationalClaims.mockReset();
  });

  it("terminally renders the canonical hold before any Risk Manager operational output", () => {
    mocks.operationalClaims.mockReturnValue(
      query(buildP0B1FraudDecisionHold({ results: [] }))
    );

    const html = renderToStaticMarkup(
      React.createElement(RiskManagerDashboard)
    );

    expect(html).toContain("FRAUD_DECISION_WITHHELD");
    expect(html).not.toContain("Active operational claims");
    expect(html).not.toContain("Operational review");
  });

  it("does not render toxic raw fraud sentinels even if a malformed server response carries them", () => {
    mocks.operationalClaims.mockReturnValue(
      query([
        {
          id: 42,
          claimNumber: "P0-OPS-42",
          status: "intake_pending",
          workflowState: "intake_queue",
          vehicleRegistration: "P0-REG-42",
          fraudRiskScore: "P0-RAW-SCORE-99",
          fraudRiskLevel: "P0-RAW-LEVEL-CRITICAL",
          fraudFlags: "P0-RAW-FLAGS",
          earlyFraudSuspicion: "P0-RAW-SUSPICION",
        },
      ])
    );

    const html = renderToStaticMarkup(
      React.createElement(RiskManagerDashboard)
    );

    expect(html).toContain("P0-OPS-42");
    expect(html).not.toContain("P0-RAW-SCORE-99");
    expect(html).not.toContain("P0-RAW-LEVEL-CRITICAL");
    expect(html).not.toContain("P0-RAW-FLAGS");
    expect(html).not.toContain("P0-RAW-SUSPICION");
  });

  it("contains no legacy raw Risk Manager query, command, or score rendering path", () => {
    const riskManager = source("client/src/pages/RiskManagerDashboard.tsx");
    const claimsProcessor = source(
      "client/src/pages/ClaimsProcessorDashboard.tsx"
    );

    for (const forbidden of [
      "trpc.claims.byStatus",
      "trpc.claims.getActiveClaims",
      "trpc.claims.getFinancialDecisionQueue",
      "trpc.claims.getRiskPortfolioAnalytics",
      "trpc.claims.getEscalations",
      "trpc.claims.approveClaim",
      "fraudRiskScore",
      "fraudRiskLevel",
      "fraudFlags",
      "earlyFraudSuspicion",
    ]) {
      expect(riskManager, forbidden).not.toContain(forbidden);
    }

    expect(claimsProcessor).not.toContain("trpc.claims.getProcessorQueue");
    expect(claimsProcessor).not.toContain("claim.fraudRiskScore");
  });
});
