import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mocks = vi.hoisted(() => ({
  getEscalations: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    claims: {
      getEscalations: { useQuery: mocks.getEscalations },
    },
  },
}));

let EscalationCentre: React.ComponentType;

const hold = buildP0B1FraudDecisionHold({
  scope: "escalation_centre_runtime_proof",
});

const rawFraudSentinel = "P0-ESCALATION-RAW-FRAUD-SENTINEL";

describe("P0-B1 Escalation Centre held-response runtime containment", () => {
  beforeAll(async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    ({ EscalationCentre } = await import(
      "../client/src/components/EscalationCentre"
    ));
  });

  beforeEach(() => {
    mocks.getEscalations.mockReset();
  });

  it("terminally renders the canonical hold instead of fraud escalations or all-clear reassurance", () => {
    mocks.getEscalations.mockReturnValue({
      data: hold,
      isLoading: false,
    });

    const html = renderToStaticMarkup(React.createElement(EscalationCentre));

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).toContain("Manual Review Required");
    expect(html).not.toContain("Critical Fraud");
    expect(html).not.toContain("High Fraud Risk");
    expect(html).not.toContain("No active escalations");
    expect(html).not.toContain("All claims are progressing normally");
  });

  it("does not render raw-fraud rows as an all-clear after a held response", () => {
    mocks.getEscalations.mockReturnValue({
      data: {
        ...hold,
        claimNumber: rawFraudSentinel,
        fraudRiskLevel: "critical",
        fraudRiskScore: 99,
      },
      isLoading: false,
    });

    const html = renderToStaticMarkup(React.createElement(EscalationCentre));

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).not.toContain(rawFraudSentinel);
    expect(html).not.toContain("99");
    expect(html).not.toContain("All claims are progressing normally");
  });
});
