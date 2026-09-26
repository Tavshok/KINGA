import { describe, expect, it } from "vitest";

import {
  discriminateP0B1FraudDecisionResponse,
  getP0B1FraudDecisionHold,
  P0_B1_FRAUD_DECISION_HOLD,
} from "./p0FraudDecisionHoldPresentation";

describe("P0-B1 shared held-response discriminator", () => {
  it("recognizes a direct canonical hold before callers access legacy fields", () => {
    expect(getP0B1FraudDecisionHold(P0_B1_FRAUD_DECISION_HOLD)).toBe(
      P0_B1_FRAUD_DECISION_HOLD
    );
  });

  it("recognizes a nested assessment hold before callers infer zero-valued legacy fields", () => {
    const nested = {
      id: 71,
      fraudDecision: P0_B1_FRAUD_DECISION_HOLD,
      suppressedFields: ["fraudScore", "estimatedCost"],
    };

    expect(getP0B1FraudDecisionHold(nested)).toBe(P0_B1_FRAUD_DECISION_HOLD);
  });

  it("normalizes a status-only malformed sentinel to actionable shared guidance", () => {
    expect(
      getP0B1FraudDecisionHold({ status: "FRAUD_DECISION_WITHHELD" })
    ).toBe(P0_B1_FRAUD_DECISION_HOLD);
  });

  it("does not misclassify ordinary non-hold payloads", () => {
    expect(getP0B1FraudDecisionHold({ estimatedCost: 1200 })).toBeNull();
    expect(getP0B1FraudDecisionHold(null)).toBeNull();
  });

  it("returns an unavailable value for held payloads and the original value only when available", () => {
    const withheld = discriminateP0B1FraudDecisionResponse({
      id: 71,
      fraudDecision: P0_B1_FRAUD_DECISION_HOLD,
    });
    const available = discriminateP0B1FraudDecisionResponse({
      id: 72,
      estimatedCost: 1200,
    });

    expect(withheld).toMatchObject({
      kind: "WITHHELD",
      hold: P0_B1_FRAUD_DECISION_HOLD,
      value: null,
    });
    expect(available).toEqual({
      kind: "AVAILABLE",
      hold: null,
      value: { id: 72, estimatedCost: 1200 },
    });
  });
});
