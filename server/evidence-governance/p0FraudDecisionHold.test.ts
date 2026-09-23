import { describe, expect, it } from "vitest";

import {
  buildP0B1FraudDecisionHold,
  P0_B1_FRAUD_DECISION_HOLD,
} from "./p0FraudDecisionHold";

describe("P0-B1 fraud decision hold", () => {
  it("fails closed with actionable missing-evidence and resolution guidance", () => {
    const hold = buildP0B1FraudDecisionHold({ claimId: 71 });

    expect(hold).toMatchObject({
      claimId: 71,
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
      actionAllowed: false,
    });
    expect(hold.allowedActions).toEqual([]);
    expect(hold.requiredEvidence).toHaveLength(3);
    expect(hold.explanation).toContain("no qualified governing authority");
    expect(hold.resolver.action).toContain(
      "future owner-approved qualified automated-decision policy"
    );
  });

  it("copies nested values so a consumer cannot alter the shared hold contract", () => {
    const first = buildP0B1FraudDecisionHold();
    const second = buildP0B1FraudDecisionHold();

    first.requiredEvidence.push("consumer mutation");
    first.resolver.action = "consumer mutation";

    expect(second.requiredEvidence).toEqual(
      P0_B1_FRAUD_DECISION_HOLD.requiredEvidence
    );
    expect(second.resolver.action).toBe(
      P0_B1_FRAUD_DECISION_HOLD.resolver.action
    );
  });
});
