import { describe, expect, it } from "vitest";
import { buildValuationReliabilityEvidence } from "./valuationReliabilityEvidence";

const asOf = new Date("2026-08-13T00:00:00.000Z");
const vehicle = { make: "Toyota", model: "Corolla", year: 2020, mileage: 60000, condition: "good" };

describe("valuation reliability evidence", () => {
  it("marks a fresh, sufficiently supported market record as market-supported without exposing a confidence score", () => {
    const result = buildValuationReliabilityEvidence({
      vehicle,
      asOf,
      source: "market_data",
      reportedSourceCount: 4,
      adjustments: [],
      ledger: [{ sourceType: "market_valuation_record", sourceReference: "market-valuation:7", observedValueCents: 1500000, observedAt: "2026-08-01T00:00:00.000Z", vehicleYear: 2020, vehicleMatch: { year: "exact" }, adjustment: null, limitation: null }],
    });
    expect(result.clientEvidenceState).toBe("market_supported");
    expect(result.clientMessage).not.toMatch(/confidence/i);
    expect(result.professionalEvidence.requiresHumanReview).toBe(false);
  });

  it("requires review when source coverage is absent or stale rather than inventing support", () => {
    const result = buildValuationReliabilityEvidence({
      vehicle: { make: "Toyota", model: "Corolla", year: 2020 },
      asOf,
      source: "fallback",
      adjustments: [],
      ledger: [],
    });
    expect(result.clientEvidenceState).toBe("review_required");
    expect(result.professionalEvidence.requiresHumanReview).toBe(true);
    expect(result.professionalEvidence.limitations).toContain("No comparable evidence was available; the result is a provisional fallback indication.");
  });

  it("records stale comparable evidence as a limitation even when a comparable exists", () => {
    const result = buildValuationReliabilityEvidence({
      vehicle,
      asOf,
      source: "historical_claims",
      adjustments: [],
      ledger: [{ sourceType: "historical_claim", sourceReference: "claim:11", observedValueCents: 1300000, observedAt: "2025-01-01T00:00:00.000Z", vehicleYear: 2020, vehicleMatch: { year: "exact" }, adjustment: null, limitation: null }],
    });
    expect(result.professionalEvidence.recency.staleSourceCount).toBe(1);
    expect(result.clientEvidenceState).toBe("review_required");
  });
});
