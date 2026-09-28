import { describe, expect, it } from "vitest";

import { executeFastTrackAction } from "./fast-track-dispatcher";

describe("Fast-Track Action Dispatcher — P0-B1 fraud authority hold", () => {
  it.each([
    "AUTO_APPROVE",
    "PRIORITY_QUEUE",
    "REDUCED_DOCUMENTATION",
    "STRAIGHT_TO_PAYMENT",
  ] as const)("withholds %s before any workflow mutation", async action => {
    const result = await executeFastTrackAction(
      991001,
      {
        eligible: true,
        action,
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 100,
          fraudScore: 0,
          claimValue: 1,
          reason: "forged low-risk fast-track input",
        },
      },
      1,
      true
    );

    expect(result).toMatchObject({
      success: false,
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
    });
    expect(result.error).toMatch(/qualified.*authority/i);
    expect(JSON.stringify(result)).not.toMatch(
      /forged low-risk|fraudScore|AUTO_APPROVE/i
    );
  });

  it("does not convert an ineligible claim into a different automated outcome", async () => {
    const result = await executeFastTrackAction(
      991002,
      {
        eligible: false,
        action: null,
        configVersion: 1,
        evaluationDetails: null,
      },
      1,
      false
    );

    expect(result).toMatchObject({
      success: false,
      status: "FRAUD_DECISION_WITHHELD",
    });
    expect(result).not.toHaveProperty("routingLogId");
  });
});
