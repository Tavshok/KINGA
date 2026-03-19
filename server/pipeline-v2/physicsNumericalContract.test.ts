/**
 * physicsNumericalContract.test.ts
 * Stage 34 — Physics Numerical Output Contract Tests
 */
import { describe, it, expect } from "vitest";
import {
  resolveVehicleMass,
  estimateVelocityFromDeltaV,
  estimateDeltaVFromSpeed,
  computeImpactForce,
  computeEnergy,
  applyPhysicsNumericalContract,
  mergeNumericalContract,
  VEHICLE_CLASS_MASS_KG,
  SPEED_FROM_DELTA_V_LOW,
  SPEED_FROM_DELTA_V_HIGH,
  DELTA_V_FROM_SPEED_FACTOR,
  type PhysicsNumericalInput,
} from "./physicsNumericalContract";

// ─── Rule 4: Vehicle class mass defaults ─────────────────────────────────────

describe("resolveVehicleMass", () => {
  it("uses explicit mass when provided and > 0", () => {
    const result = resolveVehicleMass(1600, "sedan");
    expect(result.mass).toBe(1600);
    expect(result.estimated).toBe(false);
    expect(result.source).toBe("vehicle_record");
  });

  it("falls back to sedan class default when mass is null", () => {
    const result = resolveVehicleMass(null, "sedan");
    expect(result.mass).toBe(VEHICLE_CLASS_MASS_KG.sedan);
    expect(result.estimated).toBe(true);
  });

  it("falls back to SUV class default (1800 kg)", () => {
    const result = resolveVehicleMass(null, "suv");
    expect(result.mass).toBe(1800);
    expect(result.estimated).toBe(true);
  });

  it("falls back to truck class default (2500 kg)", () => {
    const result = resolveVehicleMass(null, "truck");
    expect(result.mass).toBe(2500);
    expect(result.estimated).toBe(true);
  });

  it("uses default class (1500 kg) when body type is unknown", () => {
    const result = resolveVehicleMass(null, "spaceship");
    expect(result.mass).toBe(VEHICLE_CLASS_MASS_KG.default);
    expect(result.estimated).toBe(true);
  });

  it("uses default class when body type is null", () => {
    const result = resolveVehicleMass(null, null);
    expect(result.mass).toBe(VEHICLE_CLASS_MASS_KG.default);
    expect(result.estimated).toBe(true);
  });

  it("uses default class when mass is 0", () => {
    const result = resolveVehicleMass(0, "sedan");
    expect(result.mass).toBe(VEHICLE_CLASS_MASS_KG.sedan);
    expect(result.estimated).toBe(true);
  });

  it("source string includes the body type key", () => {
    const result = resolveVehicleMass(null, "suv");
    expect(result.source).toContain("suv");
  });
});

// ─── Rule 2: Speed estimation from delta_v ────────────────────────────────────

describe("estimateVelocityFromDeltaV", () => {
  it("low_kmh = delta_v × 1.2", () => {
    const result = estimateVelocityFromDeltaV(20);
    expect(result.low_kmh).toBeCloseTo(20 * SPEED_FROM_DELTA_V_LOW, 1);
  });

  it("high_kmh = delta_v × 1.6", () => {
    const result = estimateVelocityFromDeltaV(20);
    expect(result.high_kmh).toBeCloseTo(20 * SPEED_FROM_DELTA_V_HIGH, 1);
  });

  it("mid_kmh is the average of low and high", () => {
    const result = estimateVelocityFromDeltaV(20);
    const expected = (result.low_kmh + result.high_kmh) / 2;
    expect(result.mid_kmh).toBeCloseTo(expected, 1);
  });

  it("estimated flag is true", () => {
    expect(estimateVelocityFromDeltaV(30).estimated).toBe(true);
  });

  it("handles zero delta_v gracefully", () => {
    const result = estimateVelocityFromDeltaV(0);
    expect(result.low_kmh).toBe(0);
    expect(result.high_kmh).toBe(0);
  });
});

describe("estimateDeltaVFromSpeed", () => {
  it("delta_v ≈ speed × 0.6", () => {
    expect(estimateDeltaVFromSpeed(50)).toBeCloseTo(50 * DELTA_V_FROM_SPEED_FACTOR, 1);
  });

  it("handles zero speed", () => {
    expect(estimateDeltaVFromSpeed(0)).toBe(0);
  });
});

// ─── Rule 3: Force and energy computation ─────────────────────────────────────

describe("computeImpactForce", () => {
  it("force_n = mass × (v² / 2d)", () => {
    const mass = 1400, speedKmh = 50, crush = 0.3;
    const speedMs = speedKmh / 3.6;
    const decelMs2 = (speedMs * speedMs) / (2 * crush);
    const expectedN = mass * decelMs2;
    const result = computeImpactForce(mass, speedKmh, crush);
    expect(result.force_n).toBeCloseTo(expectedN, -1); // within 10N
  });

  it("force_kn = force_n / 1000", () => {
    const result = computeImpactForce(1400, 50, 0.3);
    expect(result.force_kn).toBeCloseTo(result.force_n / 1000, 2);
  });

  it("deceleration_g = decel_ms2 / 9.81", () => {
    const result = computeImpactForce(1400, 50, 0.3);
    expect(result.deceleration_g).toBeGreaterThan(0);
  });

  it("uses minimum crush depth of 0.05m to avoid division by zero", () => {
    expect(() => computeImpactForce(1400, 50, 0)).not.toThrow();
    const result = computeImpactForce(1400, 50, 0);
    expect(result.force_kn).toBeGreaterThan(0);
  });

  it("uses default crush depth of 0.3m when not provided", () => {
    const withDefault = computeImpactForce(1400, 50);
    const withExplicit = computeImpactForce(1400, 50, 0.3);
    expect(withDefault.force_kn).toBe(withExplicit.force_kn);
  });
});

describe("computeEnergy", () => {
  it("kinetic_energy_j = 0.5 × mass × v²", () => {
    const mass = 1400, speedKmh = 50;
    const speedMs = speedKmh / 3.6;
    const expected = 0.5 * mass * speedMs * speedMs;
    const result = computeEnergy(mass, speedKmh);
    expect(result.kinetic_energy_j).toBeCloseTo(expected, -1);
  });

  it("energy_dissipated_j ≈ 60% of kinetic energy", () => {
    const result = computeEnergy(1400, 50);
    expect(result.energy_dissipated_j).toBeCloseTo(result.kinetic_energy_j * 0.6, -1);
  });

  it("energy_kj = energy_dissipated_j / 1000", () => {
    const result = computeEnergy(1400, 50);
    expect(result.energy_kj).toBeCloseTo(result.energy_dissipated_j / 1000, 1);
  });
});

// ─── Rule 5 & 6: Full contract output — always numerical ─────────────────────

describe("applyPhysicsNumericalContract", () => {
  it("returns all five required fields", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 50, massKg: 1400 });
    expect(result).toHaveProperty("delta_v");
    expect(result).toHaveProperty("velocity_range");
    expect(result).toHaveProperty("impact_force_kn");
    expect(result).toHaveProperty("energy_kj");
    expect(result).toHaveProperty("estimated");
  });

  it("estimated=false when all inputs are real", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 50, massKg: 1400 });
    expect(result.estimated).toBe(false);
  });

  it("estimated=true when mass is missing", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 50, massKg: null });
    expect(result.estimated).toBe(true);
    expect(result.estimation_detail.mass_estimated).toBe(true);
  });

  it("estimated=true when speed is missing — derives from delta_v", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 0, massKg: 1400 });
    expect(result.estimated).toBe(true);
    expect(result.estimation_detail.speed_estimated).toBe(true);
    expect(result.velocity_range.estimated).toBe(true);
  });

  it("estimated=true when delta_v is missing — derives from speed", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 0, speedKmh: 50, massKg: 1400 });
    expect(result.estimated).toBe(true);
    expect(result.estimation_detail.delta_v_estimated).toBe(true);
    expect(result.delta_v).toBeCloseTo(50 * DELTA_V_FROM_SPEED_FACTOR, 1);
  });

  it("NEVER returns zero delta_v — uses conservative default when both missing", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 0, speedKmh: 0, massKg: 1400 });
    expect(result.delta_v).toBeGreaterThan(0);
  });

  it("NEVER returns zero impact_force_kn", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 0, speedKmh: 0, massKg: null });
    expect(result.impact_force_kn).toBeGreaterThan(0);
  });

  it("NEVER returns zero energy_kj", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 0, speedKmh: 0, massKg: null });
    expect(result.energy_kj).toBeGreaterThan(0);
  });

  it("velocity_range.low < mid < high", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 0, massKg: 1400 });
    expect(result.velocity_range.low_kmh).toBeLessThan(result.velocity_range.mid_kmh);
    expect(result.velocity_range.mid_kmh).toBeLessThan(result.velocity_range.high_kmh);
  });

  it("uses sedan default mass (1400 kg) when body type is sedan and mass is null", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 50, massKg: null, bodyType: "sedan" });
    expect(result.estimation_detail.mass_kg).toBe(1400);
  });

  it("uses SUV default mass (1800 kg) when body type is suv and mass is null", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 50, massKg: null, bodyType: "suv" });
    expect(result.estimation_detail.mass_kg).toBe(1800);
  });

  it("uses truck default mass (2500 kg) when body type is truck and mass is null", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 50, massKg: null, bodyType: "truck" });
    expect(result.estimation_detail.mass_kg).toBe(2500);
  });

  it("velocity_range.estimated=false when speed is provided", () => {
    const result = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 50, massKg: 1400 });
    expect(result.velocity_range.estimated).toBe(false);
  });

  it("handles null input gracefully — all fields are numerical", () => {
    const input: PhysicsNumericalInput = { deltaVKmh: null, speedKmh: null, massKg: null, bodyType: null };
    const result = applyPhysicsNumericalContract(input);
    expect(typeof result.delta_v).toBe("number");
    expect(typeof result.impact_force_kn).toBe("number");
    expect(typeof result.energy_kj).toBe("number");
    expect(result.delta_v).toBeGreaterThan(0);
    expect(result.impact_force_kn).toBeGreaterThan(0);
    expect(result.energy_kj).toBeGreaterThan(0);
  });
});

// ─── mergeNumericalContract ───────────────────────────────────────────────────

describe("mergeNumericalContract", () => {
  const contract = applyPhysicsNumericalContract({ deltaVKmh: 20, speedKmh: 0, massKg: null });

  it("preserves valid stage7 deltaVKmh when > 0", () => {
    const merged = mergeNumericalContract(
      { deltaVKmh: 25, estimatedSpeedKmh: 50, impactForceKn: 100, energyDistribution: { kineticEnergyJ: 500000, energyDissipatedJ: 300000, energyDissipatedKj: 300 } },
      contract
    );
    expect(merged.deltaVKmh).toBe(25);
  });

  it("fills in contract delta_v when stage7 deltaVKmh is 0", () => {
    const merged = mergeNumericalContract(
      { deltaVKmh: 0, estimatedSpeedKmh: 0, impactForceKn: 0, energyDistribution: { kineticEnergyJ: 0, energyDissipatedJ: 0, energyDissipatedKj: 0 } },
      contract
    );
    expect(merged.deltaVKmh).toBe(contract.delta_v);
  });

  it("fills in contract force when stage7 impactForceKn is 0", () => {
    const merged = mergeNumericalContract(
      { deltaVKmh: 0, estimatedSpeedKmh: 0, impactForceKn: 0, energyDistribution: { kineticEnergyJ: 0, energyDissipatedJ: 0, energyDissipatedKj: 0 } },
      contract
    );
    expect(merged.impactForceKn).toBe(contract.impact_force_kn);
  });

  it("fills in contract energy when stage7 energyDissipatedKj is 0", () => {
    const merged = mergeNumericalContract(
      { deltaVKmh: 0, estimatedSpeedKmh: 0, impactForceKn: 0, energyDistribution: { kineticEnergyJ: 0, energyDissipatedJ: 0, energyDissipatedKj: 0 } },
      contract
    );
    expect(merged.energyDistribution.energyDissipatedKj).toBe(contract.energy_kj);
  });

  it("always attaches physicsNumerical to the merged output", () => {
    const merged = mergeNumericalContract(
      { deltaVKmh: 25, estimatedSpeedKmh: 50, impactForceKn: 100, energyDistribution: { kineticEnergyJ: 500000, energyDissipatedJ: 300000, energyDissipatedKj: 300 } },
      contract
    );
    expect(merged.physicsNumerical).toBeDefined();
    expect(merged.physicsNumerical.estimated).toBeDefined();
  });

  it("always attaches velocityRange to the merged output", () => {
    const merged = mergeNumericalContract(
      { deltaVKmh: 25, estimatedSpeedKmh: 50, impactForceKn: 100, energyDistribution: { kineticEnergyJ: 500000, energyDissipatedJ: 300000, energyDissipatedKj: 300 } },
      contract
    );
    expect(merged.velocityRange).toBeDefined();
    expect(merged.velocityRange).toHaveProperty("low_kmh");
    expect(merged.velocityRange).toHaveProperty("mid_kmh");
    expect(merged.velocityRange).toHaveProperty("high_kmh");
  });
});
