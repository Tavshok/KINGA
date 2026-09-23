import { describe, expect, it } from "vitest";

import {
  buildP0B1FraudAbstentionText,
  redactP0B1FraudReportPayload,
  renderP0B1FraudAbstentionMarker,
} from "./p0FraudPresentation";

describe("P0-B1 fraud presentation boundary", () => {
  it("renders an actionable fraud abstention instead of score or risk evidence", () => {
    const html = renderP0B1FraudAbstentionMarker();

    expect(html).toContain('data-p0-fraud-decision="withheld"');
    expect(html).toContain("Fraud Decision Withheld — Manual Review Required");
    expect(html).toContain("What is missing:");
    expect(html).toContain("What resolves this:");
    expect(html).not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
  });

  it("recursively strips fraud-specific fields while preserving independently supported content", () => {
    const result = redactP0B1FraudReportPayload({
      vehicle: "Toyota Hilux",
      cost: { submittedQuoteUsd: 9200 },
      fraudScore: 91,
      fraudRiskLevel: "critical",
      nested: [{ riskRating: "high", documentName: "Quote.pdf" }],
    }) as Record<string, any>;

    expect(result).toMatchObject({
      vehicle: "Toyota Hilux",
      cost: { submittedQuoteUsd: 9200 },
      nested: [{ documentName: "Quote.pdf" }],
      fraudDecision: { status: "FRAUD_DECISION_WITHHELD" },
    });
    expect(result).not.toHaveProperty("fraudScore");
    expect(result).not.toHaveProperty("fraudRiskLevel");
    expect(result.nested[0]).not.toHaveProperty("riskRating");
  });

  it("provides an actionable plaintext marker for non-HTML exports", () => {
    const text = buildP0B1FraudAbstentionText();

    expect(text).toContain("Fraud Decision Withheld — Manual Review Required");
    expect(text).toContain("What is missing:");
    expect(text).toContain("What resolves this:");
  });
});
