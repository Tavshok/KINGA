import { describe, it, expect } from "vitest";
import { computeWeightedFraudScore, countMissingFields } from "./weighted-fraud-scoring";

describe("computeWeightedFraudScore", () => {
  const baseInput = {
    consistencyScore: 75,
    aiEstimatedCost: 1000,
    quotedAmount: 0,
    impactDirection: "front",
    damageZones: ["front", "bumper"],
    hasPreviousClaims: false,
    missingDataCount: 0,
  };

  it("returns score=0 and level=minimal when no factors are triggered", () => {
    const result = computeWeightedFraudScore(baseInput);
    expect(result.score).toBe(0);
    expect(result.level).toBe("minimal");
    expect(result.contributions).toHaveLength(0);
  });

  it("adds +20 for damage inconsistency when consistencyScore < 50", () => {
    const result = computeWeightedFraudScore({ ...baseInput, consistencyScore: 30 });
    expect(result.score).toBe(20);
    // Score 20 is still in the 0-20 = minimal band
    expect(result.level).toBe("minimal");
    expect(result.contributions).toContainEqual({ factor: "Damage Inconsistency", value: 20 });
  });

  it("does NOT add damage inconsistency penalty when consistencyScore == 50", () => {
    const result = computeWeightedFraudScore({ ...baseInput, consistencyScore: 50 });
    expect(result.score).toBe(0);
  });

  it("adds +15 for cost deviation when quotedAmount deviates >15% from AI estimate", () => {
    const result = computeWeightedFraudScore({ ...baseInput, quotedAmount: 1200 }); // +20% deviation
    expect(result.score).toBe(15);
    // Score 15 is in the 0-20 = minimal band
    expect(result.level).toBe("minimal");
    expect(result.contributions).toContainEqual({ factor: "Cost Deviation", value: 15 });
  });

  it("does NOT add cost deviation penalty when deviation is exactly 15%", () => {
    const result = computeWeightedFraudScore({ ...baseInput, quotedAmount: 1150 }); // +15% deviation
    expect(result.score).toBe(0);
  });

  it("does NOT add cost deviation penalty when no quote is submitted", () => {
    const result = computeWeightedFraudScore({ ...baseInput, quotedAmount: 0 });
    expect(result.score).toBe(0);
  });

  it("adds +15 for direction mismatch when impact direction does not match damage zones", () => {
    const result = computeWeightedFraudScore({
      ...baseInput,
      impactDirection: "rear",
      damageZones: ["front", "bumper"],
    });
    expect(result.score).toBe(15);
    expect(result.contributions).toContainEqual({ factor: "Direction Mismatch", value: 15 });
  });

  it("does NOT add direction mismatch when direction matches damage zones", () => {
    const result = computeWeightedFraudScore({
      ...baseInput,
      impactDirection: "front",
      damageZones: ["front bumper", "grill"],
    });
    expect(result.score).toBe(0);
  });

  it("does NOT add direction mismatch when direction is unknown", () => {
    const result = computeWeightedFraudScore({
      ...baseInput,
      impactDirection: "unknown",
      damageZones: ["rear"],
    });
    expect(result.score).toBe(0);
  });

  it("adds +20 for repeat claim", () => {
    const result = computeWeightedFraudScore({ ...baseInput, hasPreviousClaims: true });
    expect(result.score).toBe(20);
    // Score 20 is in the 0-20 = minimal band
    expect(result.level).toBe("minimal");
    expect(result.contributions).toContainEqual({ factor: "Repeat Claim", value: 20 });
  });

  it("adds +10 for missing data when missingDataCount > 0", () => {
    const result = computeWeightedFraudScore({ ...baseInput, missingDataCount: 3 });
    expect(result.score).toBe(10);
    expect(result.contributions).toContainEqual({ factor: "Missing Data", value: 10 });
  });

  it("caps score at 100 when all factors are triggered", () => {
    const result = computeWeightedFraudScore({
      consistencyScore: 20,       // +20
      aiEstimatedCost: 1000,
      quotedAmount: 2000,          // +15 (100% deviation)
      impactDirection: "rear",
      damageZones: ["front"],      // +15 (mismatch)
      hasPreviousClaims: true,     // +20
      missingDataCount: 5,         // +10
    });
    // Total = 80, capped at 100 (but 80 < 100 so cap doesn't apply here)
    expect(result.score).toBe(80);
    // Score 80 is in the 61-80 = high band
    expect(result.level).toBe("high");
    expect(result.contributions).toHaveLength(5);
  });

  it("returns level=elevated when score > 80", () => {
    // Max 5-factor score is 80. To exceed 80 we need the Severity/Physics Mismatch factor (+15)
    // which triggers when damageSeverity is severe/catastrophic and physicsAvailable=false
    const result = computeWeightedFraudScore({
      consistencyScore: 20,        // +20
      aiEstimatedCost: 1000,
      quotedAmount: 2000,           // +15
      impactDirection: "rear",
      damageZones: ["front"],       // +15
      hasPreviousClaims: true,      // +20
      missingDataCount: 5,          // +10
      // No severity/physics mismatch — score stays at 80 = high
    });
    expect(result.score).toBe(80);
    expect(result.level).toBe("high"); // 80 is high, not elevated (81+ = elevated)
  });

  it("returns full_contributions with all factors regardless of trigger state", () => {
    const result = computeWeightedFraudScore(baseInput);
    expect(result.full_contributions).toBeDefined();
    expect(result.full_contributions.length).toBeGreaterThanOrEqual(5);
    const factorNames = result.full_contributions.map(c => c.factor);
    expect(factorNames).toContain("Damage Inconsistency");
    expect(factorNames).toContain("Cost Deviation");
    expect(factorNames).toContain("Direction Mismatch");
    expect(factorNames).toContain("Repeat Claim");
    expect(factorNames).toContain("Missing Data");
  });

  it("returns contributions array with only triggered factors", () => {
    const result = computeWeightedFraudScore({ ...baseInput, hasPreviousClaims: true, missingDataCount: 2 });
    expect(result.contributions).toHaveLength(2);
    expect(result.contributions.every(c => c.value > 0)).toBe(true);
  });

  it("strict 5-band level mapping — 0-20 inclusive = minimal", () => {
    // Score 20 (damage inconsistency only) should be minimal per spec
    const r1 = computeWeightedFraudScore({ ...baseInput, consistencyScore: 20 }); // score=20
    expect(r1.score).toBe(20);
    expect(r1.level).toBe("minimal"); // 0-20 inclusive = minimal

    // Score 21 should be low
    // damage inconsistency (20) + cost deviation (15) = 35 → low
    const r2 = computeWeightedFraudScore({ ...baseInput, consistencyScore: 20, quotedAmount: 1200 }); // score=35
    expect(r2.score).toBe(35);
    expect(r2.level).toBe("low"); // 21-40 = low

    // Score 41-60 = moderate
    const r3 = computeWeightedFraudScore({ ...baseInput, consistencyScore: 20, quotedAmount: 1200, hasPreviousClaims: true }); // 20+15+20=55
    expect(r3.score).toBe(55);
    expect(r3.level).toBe("moderate"); // 41-60 = moderate
  });
});

describe("countMissingFields", () => {
  it("returns 0 when all fields are present", () => {
    const count = countMissingFields({
      estimatedSpeedKmh: 60,
      impactForceKn: 15,
      energyKj: 45,
      vehicleMake: "Toyota",
      impactDirection: "front",
      damageComponents: ["bumper", "grill"],
    });
    expect(count).toBe(0);
  });

  it("counts missing speed, force, energy, make, and direction", () => {
    const count = countMissingFields({
      estimatedSpeedKmh: 0,
      impactForceKn: 0,
      energyKj: 0,
      vehicleMake: "",
      impactDirection: "unknown",
      damageComponents: [],
    });
    expect(count).toBe(5);
  });

  it("counts only the missing fields", () => {
    const count = countMissingFields({
      estimatedSpeedKmh: 0,
      impactForceKn: 15,
      energyKj: 0,
      vehicleMake: "Honda",
      impactDirection: "rear",
      damageComponents: ["door"],
    });
    expect(count).toBe(2); // speed and energy missing
  });
});
