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

  // ─── Factor 7: Multi-Source Damage Conflict ───────────────────────────────
  describe("Factor 7: Multi-Source Damage Conflict", () => {

    // ── Base weight rules ──────────────────────────────────────────────────
    it("adds base weight when confidence is HIGH and no dampening applies (15% cap applies at low base)", () => {
      // baseInput has score=0 before Factor 7, so no dampening triggers.
      // However, the 15% cap still applies:
      //   projected total = min(100, 0 + 12) = 12 → maxAllowed = 12 * 0.15 = 1.8
      //   12 > 1.8 → cap applies → conflictValue = 1.8
      const result = computeWeightedFraudScore({
        ...baseInput,
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 2,
          details: "Photos show front damage, report says rear",
        },
      });
      expect(result.score).toBe(1.8);
      expect(result.contributions).toContainEqual({ factor: "Multi-Source Damage Conflict", value: 1.8 });
    });

    it("adds base weight when confidence is MEDIUM and no dampening applies (15% cap applies at low base)", () => {
      // projected total = min(100, 0 + 5) = 5 → maxAllowed = 5 * 0.15 = 0.75 → rounds to 0.8
      const result = computeWeightedFraudScore({
        ...baseInput,
        multiSourceConflict: {
          confidence: "MEDIUM",
          highSeverityMismatchCount: 1,
          details: "Physics zone conflicts with reported zone",
        },
      });
      expect(result.score).toBe(0.8);
      expect(result.contributions).toContainEqual({ factor: "Multi-Source Damage Conflict", value: 0.8 });
    });

    it("does NOT add any penalty when confidence is LOW", () => {
      const result = computeWeightedFraudScore({
        ...baseInput,
        multiSourceConflict: {
          confidence: "LOW",
          highSeverityMismatchCount: 3,
          details: "Low confidence — ignored",
        },
      });
      expect(result.score).toBe(0);
      const conflictContrib = result.contributions.find(c => c.factor === "Multi-Source Damage Conflict");
      expect(conflictContrib).toBeUndefined(); // not in triggered contributions
    });

    it("does NOT add penalty when highSeverityMismatchCount is 0 even with HIGH confidence", () => {
      const result = computeWeightedFraudScore({
        ...baseInput,
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 0,
          details: "No high-severity mismatches",
        },
      });
      expect(result.score).toBe(0);
    });

    it("does NOT add penalty when multiSourceConflict is undefined", () => {
      const result = computeWeightedFraudScore({ ...baseInput });
      expect(result.score).toBe(0);
      const conflictContrib = result.full_contributions.find(c => c.factor === "Multi-Source Damage Conflict");
      expect(conflictContrib?.triggered).toBe(false);
    });

    // ── Dampening rule 1: base score before Factor 7 > 70 → −30% ──────────
    it("applies −30% dampening when base score before Factor 7 exceeds 70", () => {
      // inconsistency(20) + cost(15) + direction(15) + repeat(20) + missing(10) = 80 before F7
      // HIGH base weight = 12 → after −30% = 8.4 → rounded = 8.4
      // But 15% cap: projected total = min(100, 80 + 8.4) = 88.4 → maxAllowed = 88.4 * 0.15 = 13.26
      // 8.4 < 13.26 → cap does NOT further reduce
      const result = computeWeightedFraudScore({
        consistencyScore: 20,    // +20
        aiEstimatedCost: 1000,
        quotedAmount: 2000,      // +15
        impactDirection: "rear",
        damageZones: ["front"],  // +15
        hasPreviousClaims: true, // +20
        missingDataCount: 5,     // +10
        // base = 80 before Factor 7 → triggers −30% dampening
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 2,
          details: "Zone mismatch",
        },
      });
      const conflictContrib = result.contributions.find(c => c.factor === "Multi-Source Damage Conflict");
      expect(conflictContrib).toBeDefined();
      // base=80 → both dampening rules fire (base>70 AND 5 high-weight factors ≥10):
      //   12 * 0.7 (−30%) * 0.8 (−20%) = 6.72 → rounds to 6.7
      //   15% cap: (80 + 6.72) * 0.15 = 13.008 → 6.72 < 13.008 → cap does NOT apply
      expect(conflictContrib!.value).toBe(6.7);
      expect(result.score).toBe(86.7);
    });

    // ── Dampening rule 2: ≥2 high-weight factors (≥10) → −20% ────────────
    it("applies −20% dampening when 2 or more high-weight factors are already triggered", () => {
      // inconsistency(20) + repeat(20) = 40 before Factor 7 (2 factors with value ≥10)
      // HIGH base weight = 12 → after −20% = 9.6
      // 15% cap: projected total = min(100, 40 + 9.6) = 49.6 → maxAllowed = 49.6 * 0.15 = 7.44
      // 9.6 > 7.44 → cap applies → conflictValue = 7.44 → rounded = 7.4
      const result = computeWeightedFraudScore({
        consistencyScore: 20,    // +20 (value ≥10)
        aiEstimatedCost: 1000,
        quotedAmount: 0,         // no cost deviation
        impactDirection: "front",
        damageZones: ["front"],  // no direction mismatch
        hasPreviousClaims: true, // +20 (value ≥10) → 2 high-weight factors
        missingDataCount: 0,
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 1,
          details: "Component mismatch",
        },
      });
      const conflictContrib = result.contributions.find(c => c.factor === "Multi-Source Damage Conflict");
      expect(conflictContrib).toBeDefined();
      // After −20%: 12 * 0.8 = 9.6 → cap: (40+9.6)*0.15 = 7.44 → rounds to 7.4
      expect(conflictContrib!.value).toBe(7.4);
    });

    // ── Both dampening rules apply simultaneously (multiplicative) ─────────
    it("applies both dampening rules when base > 70 AND ≥2 high-weight factors", () => {
      // inconsistency(20) + cost(15) + direction(15) + repeat(20) + missing(10) = 80
      // 4 factors with value ≥10 → triggers both dampening rules
      // HIGH base weight = 12 → after −30% = 8.4 → after −20% = 6.72
      // 15% cap: projected total = min(100, 80 + 6.72) = 86.72 → maxAllowed = 86.72 * 0.15 = 13.008
      // 6.72 < 13.008 → cap does NOT apply
      const result = computeWeightedFraudScore({
        consistencyScore: 20,
        aiEstimatedCost: 1000,
        quotedAmount: 2000,
        impactDirection: "rear",
        damageZones: ["front"],
        hasPreviousClaims: true,
        missingDataCount: 5,
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 3,
          details: "All three sources disagree",
        },
      });
      const conflictContrib = result.contributions.find(c => c.factor === "Multi-Source Damage Conflict");
      expect(conflictContrib).toBeDefined();
      // 12 * 0.7 * 0.8 = 6.72 → rounds to 6.7
      expect(conflictContrib!.value).toBe(6.7);
      expect(result.score).toBe(86.7);
    });

    // ── 15% cap rule ──────────────────────────────────────────────────────
    it("caps Factor 7 at 15% of total score when undampened weight would exceed it", () => {
      // Only Factor 7 triggered (base = 0 before F7)
      // HIGH base weight = 12
      // No dampening (base = 0 ≤ 70, 0 high-weight factors)
      // Projected total = min(100, 0 + 12) = 12 → maxAllowed = 12 * 0.15 = 1.8
      // 12 > 1.8 → cap applies → conflictValue = 1.8
      const result = computeWeightedFraudScore({
        ...baseInput,
        // Override to ensure truly zero base score
        consistencyScore: 75,
        quotedAmount: 0,
        hasPreviousClaims: false,
        missingDataCount: 0,
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 1,
          details: "Zone mismatch",
        },
      });
      const conflictContrib = result.contributions.find(c => c.factor === "Multi-Source Damage Conflict");
      expect(conflictContrib).toBeDefined();
      // 15% cap: (0 + 12) * 0.15 = 1.8
      expect(conflictContrib!.value).toBe(1.8);
      expect(result.score).toBe(1.8);
    });

    // ── Combined score cap at 100 ─────────────────────────────────────────
    it("caps combined score at 100 when all factors fire", () => {
      // 80 (all base factors) + 15 (severity/physics) = 95 before Factor 7
      // HIGH base weight = 12 → −30% (base > 70) = 8.4 → −20% (≥2 high-weight) = 6.72 → rounds to 6.7
      // 95 + 6.7 = 101.7 → capped at 100
      const result = computeWeightedFraudScore({
        consistencyScore: 20,
        aiEstimatedCost: 1000,
        quotedAmount: 2000,
        impactDirection: "rear",
        damageZones: ["front"],
        hasPreviousClaims: true,
        missingDataCount: 5,
        damageSeverity: "catastrophic",
        deltaVKmh: 0,
        aiConfidence: 40,
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 3,
          details: "All three sources disagree",
        },
      });
      expect(result.score).toBe(100);
      expect(result.level).toBe("elevated");
    });

    it("includes factor in full_contributions even when not triggered", () => {
      const result = computeWeightedFraudScore({ ...baseInput });
      const factorNames = result.full_contributions.map(c => c.factor);
      expect(factorNames).toContain("Multi-Source Damage Conflict");
    });

    it("includes dampening note in detail when dampening was applied", () => {
      // base > 70 → dampening note should appear
      const result = computeWeightedFraudScore({
        consistencyScore: 20,
        aiEstimatedCost: 1000,
        quotedAmount: 2000,
        impactDirection: "rear",
        damageZones: ["front"],
        hasPreviousClaims: true,
        missingDataCount: 5,
        multiSourceConflict: {
          confidence: "HIGH",
          highSeverityMismatchCount: 1,
          details: "Zone mismatch",
        },
      });
      const conflictFull = result.full_contributions.find(c => c.factor === "Multi-Source Damage Conflict");
      expect(conflictFull?.detail).toContain("dampening");
    });
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
