import { describe, expect, it } from "vitest";

import { buildP0CrossValidationIndicators } from "./orchestrator";
import { buildP0FraudUnavailableAssumption } from "./stage-8-fraud";

describe("P0-B1 cross-validation fraud boundary", () => {
  it("retains material cross-validation findings without points or risk levels", () => {
    const indicators = buildP0CrossValidationIndicators([
      {
        severity: "FLAG",
        fact: "speed consistency",
        verdict: "CONTRADICTED",
        explanation:
          "The raw cross-validation finding requires independent review.",
        recommendedAction: "Obtain qualified collision measurements.",
      },
      {
        severity: "CONCERN",
        fact: "damage pattern",
        verdict: "UNRESOLVED",
        explanation: "The available visual evidence is insufficient.",
      },
      {
        severity: "INFO",
        fact: "unrelated",
        verdict: "NOTED",
        explanation: "This is not a material contradiction.",
      },
    ]);

    expect(indicators).toEqual([
      expect.objectContaining({
        indicator: "[CROSS-VALIDATION] speed consistency: CONTRADICTED",
        score: null,
        severity: "advisory",
        evidence: ["Obtain qualified collision measurements."],
      }),
      expect.objectContaining({
        indicator: "[CROSS-VALIDATION] damage pattern: UNRESOLVED",
        score: null,
        severity: "advisory",
      }),
    ]);
    expect(JSON.stringify(indicators)).not.toMatch(/25|15|high|medium|risk/i);
  });

  it("does not promote non-material cross-validation output into fraud evidence", () => {
    expect(
      buildP0CrossValidationIndicators([
        {
          severity: "INFO",
          fact: "metadata",
          verdict: "NOTED",
          explanation: "Informational only.",
        },
      ])
    ).toEqual([]);
  });

  it("records a failed fraud analysis as unavailable without a threshold value", () => {
    const assumption = buildP0FraudUnavailableAssumption("Stage 8 timed out");

    expect(assumption).toMatchObject({
      field: "fraudDecisionEligibility",
      assumedValue: "UNAVAILABLE",
      strategy: "none",
      confidence: 0,
    });
    expect(assumption.reason).toMatch(/independently verifiable/i);
    expect(JSON.stringify(assumption)).not.toMatch(/50|medium|low|moderate/i);
  });
});
