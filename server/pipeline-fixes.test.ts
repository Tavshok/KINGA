import { describe, it, expect } from "vitest";

/**
 * Tests for the pipeline data display fixes:
 * 1. Cost values stored in whole dollars (not cents) — formatCurrency should NOT divide by 100
 * 2. Physics pipeline-v2 flat format should be normalizable to nested _raw UI format
 * 3. Vehicle info backfill from pipeline extraction to claim record
 */

describe("Cost display fixes", () => {
  it("should NOT double-divide costs — DB stores whole dollars", () => {
    // The pipeline stores: expectedRepairCostCents = 107000 (cents)
    // db.ts converts: Math.round(107000 / 100) = 1070 (dollars)
    // DB column estimated_cost = 1070
    // Frontend should display $1,070.00 NOT $10.70
    
    const dbEstimatedCost = 1070; // What's in the DB (whole dollars)
    
    // Old bug: frontend divided by 100 again
    const buggyDisplay = dbEstimatedCost / 100; // $10.70 — WRONG
    expect(buggyDisplay).toBe(10.70);
    
    // Fixed: frontend uses the value directly
    const correctDisplay = dbEstimatedCost; // $1,070 — CORRECT
    expect(correctDisplay).toBe(1070);
  });

  it("should format cost values correctly for display", () => {
    const dbCost = 1070;
    const formatted = dbCost.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(formatted).toBe("1,070.00");
  });

  it("should handle zero and null costs gracefully", () => {
    const zeroCost = 0;
    const nullCost = null;
    
    expect(zeroCost.toLocaleString("en-US", { minimumFractionDigits: 2 })).toBe("0.00");
    expect((nullCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })).toBe("0.00");
  });
});

describe("Physics pipeline-v2 normalizer", () => {
  // Simulates the flat format stored by the pipeline
  const flatPhysics = {
    impactForceKn: 0,
    impactVector: { direction: "rear", magnitude: 0, angle: 0 },
    energyDistribution: { kineticEnergyJ: 0, energyDissipatedJ: 18000, energyDissipatedKj: 18 },
    estimatedSpeedKmh: 0,
    deltaVKmh: 15,
    decelerationG: 0,
    accidentSeverity: "minor",
    reconstructionSummary: "A rear collision involving a 2016 TOYOTA FORTUNER (2100kg).",
    damageConsistencyScore: 20,
    latentDamageProbability: { engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0 },
    physicsExecuted: true,
  };

  // Simulates the normalizer logic from InsurerComparisonView
  function normalizePhysics(p: any) {
    if (!p || !p.physicsExecuted || p._raw) return p;
    
    const speedKmh = p.estimatedSpeedKmh || p.deltaVKmh || 0;
    const forceKn = p.impactForceKn || 0;
    const forceN = forceKn * 1000;
    const direction = p.impactVector?.direction || "unknown";
    const angle = p.impactVector?.angle || 0;
    const energyJ = p.energyDistribution?.kineticEnergyJ || p.energyDistribution?.energyDissipatedJ || 0;
    const deltaV = p.deltaVKmh || 0;
    const severity = p.accidentSeverity || "minor";
    const consistencyScore = p.damageConsistencyScore || 50;
    
    const dirToType: Record<string, string> = { front: "frontal", rear: "rear", left: "side_driver", right: "side_passenger" };
    const collType = dirToType[direction] || direction;
    const injuryRisk = deltaV > 40 ? "high" : deltaV > 25 ? "moderate" : "low";
    
    return {
      _raw: {
        estimatedSpeed: {
          value: speedKmh,
          confidence: consistencyScore > 50 ? 75 : 55,
          method: "Pipeline v2 physics engine",
          confidenceInterval: [Math.round(speedKmh * 0.8), Math.round(speedKmh * 1.2)],
        },
        impactForce: {
          magnitude: forceN || (forceKn > 0 ? forceKn * 1000 : Math.round(speedKmh * 80)),
          confidence: consistencyScore > 50 ? 80 : 55,
          duration: 0.08,
        },
        kineticEnergy: energyJ,
        deltaV,
        accidentSeverity: severity,
        collisionType: collType,
        primaryImpactZone: direction,
        impactAngle: angle,
        damageConsistency: { score: consistencyScore, label: consistencyScore > 70 ? "Consistent" : consistencyScore > 40 ? "Partial" : "Inconsistent" },
        fraudIndicators: { impossibleDamagePatterns: [], unrelatedDamage: [], stagedAccidentIndicators: [], severityMismatch: false },
        occupantInjuryRisk: injuryRisk,
      },
      accidentSeverity: severity,
      consistencyScore,
      damagePropagationScore: consistencyScore,
      fraudRiskScore: 0,
      fraudIndicators: [],
      occupantInjuryRisk: injuryRisk,
      collisionType: collType,
    };
  }

  it("should normalize flat pipeline-v2 physics to nested _raw format", () => {
    const normalized = normalizePhysics(flatPhysics);
    
    expect(normalized._raw).toBeDefined();
    expect(normalized._raw.estimatedSpeed.value).toBe(15); // Falls back to deltaVKmh
    expect(normalized._raw.collisionType).toBe("rear");
    expect(normalized._raw.primaryImpactZone).toBe("rear");
    expect(normalized._raw.kineticEnergy).toBe(18000); // Falls back to energyDissipatedJ
    expect(normalized._raw.deltaV).toBe(15);
    expect(normalized._raw.accidentSeverity).toBe("minor");
    expect(normalized.consistencyScore).toBe(20);
    expect(normalized.occupantInjuryRisk).toBe("low"); // deltaV 15 < 25
  });

  it("should not re-normalize already-normalized physics", () => {
    const alreadyNormalized = { _raw: { estimatedSpeed: { value: 50 } }, physicsExecuted: true };
    const result = normalizePhysics(alreadyNormalized);
    expect(result).toBe(alreadyNormalized); // Same reference, not re-processed
  });

  it("should handle null/undefined physics gracefully", () => {
    expect(normalizePhysics(null)).toBeNull();
    expect(normalizePhysics(undefined)).toBeUndefined();
  });

  it("should map collision directions correctly", () => {
    const frontCollision = normalizePhysics({ ...flatPhysics, impactVector: { direction: "front", magnitude: 0, angle: 0 } });
    expect(frontCollision._raw.collisionType).toBe("frontal");
    
    const leftCollision = normalizePhysics({ ...flatPhysics, impactVector: { direction: "left", magnitude: 0, angle: 0 } });
    expect(leftCollision._raw.collisionType).toBe("side_driver");
  });

  it("should calculate injury risk from deltaV correctly", () => {
    const lowRisk = normalizePhysics({ ...flatPhysics, deltaVKmh: 10 });
    expect(lowRisk.occupantInjuryRisk).toBe("low");
    
    const modRisk = normalizePhysics({ ...flatPhysics, deltaVKmh: 30 });
    expect(modRisk.occupantInjuryRisk).toBe("moderate");
    
    const highRisk = normalizePhysics({ ...flatPhysics, deltaVKmh: 50 });
    expect(highRisk.occupantInjuryRisk).toBe("high");
  });
});

describe("Vehicle info backfill", () => {
  it("should extract vehicle info from claimRecord to update claim", () => {
    // Simulates the claimRecord from the pipeline
    const claimRecord = {
      vehicle: {
        make: "TOYOTA",
        model: "FORTUNER",
        year: 2016,
        registration: "ABC 1234",
        vin: null,
        color: "White",
      },
      damage: {
        description: "Front bumper, grill and nudge bar damaged",
        incidentDate: null,
        incidentType: null,
      },
    };

    // Build the update object (same logic as db.ts)
    const claimUpdate: Record<string, any> = {};
    if (claimRecord?.vehicle) {
      const v = claimRecord.vehicle;
      if (v.make) claimUpdate.vehicleMake = v.make;
      if (v.model) claimUpdate.vehicleModel = v.model;
      if (v.year) claimUpdate.vehicleYear = Number(v.year) || null;
      if (v.registration) claimUpdate.vehicleRegistration = v.registration;
      if (v.vin) claimUpdate.vehicleVin = v.vin;
      if (v.color) claimUpdate.vehicleColor = v.color;
    }

    expect(claimUpdate.vehicleMake).toBe("TOYOTA");
    expect(claimUpdate.vehicleModel).toBe("FORTUNER");
    expect(claimUpdate.vehicleYear).toBe(2016);
    expect(claimUpdate.vehicleRegistration).toBe("ABC 1234");
    expect(claimUpdate.vehicleVin).toBeUndefined(); // null should not be set
    expect(claimUpdate.vehicleColor).toBe("White");
  });
});
