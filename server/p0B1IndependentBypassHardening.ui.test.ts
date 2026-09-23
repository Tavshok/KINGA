import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { validationUseQuery } = vi.hoisted(() => ({
  validationUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    aiAssessments: {
      validate: {
        useQuery: validationUseQuery,
      },
    },
  },
}));

import {
  normalizeP0FraudValidationHold,
  P0FraudValidationHold,
  ValidationGate,
} from "../client/src/components/ValidationGate";
import { P0_B1_FRAUD_DECISION_HOLD } from "../shared/p0FraudDecisionHoldPresentation";

const hold = {
  status: "FRAUD_DECISION_WITHHELD",
  explanation: "Stored fraud values have no qualified governing authority.",
  requiredEvidence: ["Claim-linked document", "Human-reviewed provenance"],
  resolver: {
    action: "Obtain qualified evidence and a documented human review.",
  },
};

describe("P0-B1 fraud hold client presentation", () => {
  it("renders the full actionable hold used by Validation Gate and Claims Manager", () => {
    const html = renderToStaticMarkup(
      React.createElement(P0FraudValidationHold, { hold })
    );

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).toContain("What is missing:");
    expect(html).toContain("Claim-linked document");
    expect(html).toContain("What resolves this:");
    expect(html).toContain("Obtain qualified evidence");
  });

  it("renders a safe compact Validation Gate state rather than dereferencing the legacy validation contract", () => {
    const html = renderToStaticMarkup(
      React.createElement(P0FraudValidationHold, { hold, compact: true })
    );

    expect(html).toContain("Fraud decision withheld");
    expect(html).toContain("manual review required");
  });

  it("recognizes the real validation endpoint hold before accessing legacy validation fields", () => {
    validationUseQuery.mockReturnValue({ data: hold, isLoading: false });

    const html = renderToStaticMarkup(
      React.createElement(ValidationGate, { claimId: 71 })
    );

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).toContain("Human-reviewed provenance");
    expect(html).not.toContain("Output Validated");
  });

  it("fails closed with actionable guidance when a sentinel hold is malformed", () => {
    const malformedHold = {
      status: "FRAUD_DECISION_WITHHELD",
      explanation: "",
      requiredEvidence: [],
      resolver: {},
    };
    validationUseQuery.mockReturnValue({
      data: malformedHold,
      isLoading: false,
    });

    const normalized = normalizeP0FraudValidationHold(malformedHold);
    const html = renderToStaticMarkup(
      React.createElement(ValidationGate, { claimId: 71 })
    );

    expect(normalized.explanation).toContain(
      "withholding response is incomplete"
    );
    expect(normalized.requiredEvidence).toEqual(
      P0_B1_FRAUD_DECISION_HOLD.requiredEvidence
    );
    expect(normalized.resolver.action).toBe(
      P0_B1_FRAUD_DECISION_HOLD.resolver.action
    );
    expect(html).toContain("withholding response is incomplete");
    expect(html).toContain("What is missing:");
    expect(html).toContain("What resolves this:");
  });
});
