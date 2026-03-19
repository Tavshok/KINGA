/**
 * physicsNumericalContract.ts
 * Stage 34 — Physics Numerical Output Contract
 *
 * Rules:
 * 1. delta_v is always required — derive from speed if missing.
 * 2. If speed missing: estimate velocity_range from delta_v (× 1.2 to × 1.6).
 * 3. Compute force = mass × acceleration; energy = 0.5 × mass × velocity².
 * 4. If mass unknown: use vehicle class defaults (sedan 1400 kg, SUV 1800 kg, truck 2500 kg).
 * 5. Output ALL values: delta_v, velocity_range, impact_force_kn, energy_kj, estimated.
 * 6. NEVER return "N/A" — always produce a numerical result when estimation is possible.
 */

// ─── Vehicle Class Mass Defaults ─────────────────────────────────────────────

export const VEHICLE_CLASS_MASS_KG: Record<string, number> = {
  // Explicit classes
  sedan: 1400,
  hatchback: 1300,
  coupe: 1350,
  convertible: 1400,
  wagon: 1500,
  suv: 1800,
  crossover: 1700,
  truck: 2500,
  pickup: 2200,
  van: 2000,
  minivan: 1900,
  bus: 8000,
  motorcycle: 250,
  // Fallback
  default: 1500,
};

/** Resolve vehicle mass from explicit value or body-type class default. */
export function resolveVehicleMass(
  massKg: number | null | undefined,
  bodyType: string | null | undefined
): { mass: number; estimated: boolean; source: string } {
  if (massKg && massKg > 0) {
    return { mass: massKg, estimated: false, source: "vehicle_record" };
  }
  const key = (bodyType ?? "").toLowerCase().trim();
  const classMatch = VEHICLE_CLASS_MASS_KG[key] ?? VEHICLE_CLASS_MASS_KG["default"];
  return {
    mass: classMatch,
    estimated: true,
    source: `vehicle_class_default:${key || "default"}`,
  };
}

// ─── Speed / Delta-V Estimation ───────────────────────────────────────────────

/** Speed range multipliers: speed ≈ delta_v × [1.2, 1.6] */
export const SPEED_FROM_DELTA_V_LOW = 1.2;
export const SPEED_FROM_DELTA_V_HIGH = 1.6;

export interface VelocityRange {
  low_kmh: number;
  mid_kmh: number;
  high_kmh: number;
  estimated: boolean;
}

/**
 * Derive velocity range from delta_v.
 * Used when actual speed is missing or zero.
 */
export function estimateVelocityFromDeltaV(deltaVKmh: number): VelocityRange {
  const low = deltaVKmh * SPEED_FROM_DELTA_V_LOW;
  const high = deltaVKmh * SPEED_FROM_DELTA_V_HIGH;
  return {
    low_kmh: Math.round(low * 10) / 10,
    mid_kmh: Math.round(((low + high) / 2) * 10) / 10,
    high_kmh: Math.round(high * 10) / 10,
    estimated: true,
  };
}

/**
 * Derive delta_v from speed when delta_v is missing or zero.
 * Approximation: delta_v ≈ speed × 0.6 (standard industry estimate for partial energy transfer).
 */
export const DELTA_V_FROM_SPEED_FACTOR = 0.6;

export function estimateDeltaVFromSpeed(speedKmh: number): number {
  return Math.round(speedKmh * DELTA_V_FROM_SPEED_FACTOR * 10) / 10;
}

// ─── Force & Energy Computation ───────────────────────────────────────────────

/**
 * Compute impact force using F = m × a where a = v² / (2d).
 * @param massKg Vehicle mass in kg
 * @param speedKmh Impact speed in km/h
 * @param crushDepthM Estimated crush depth in metres (default 0.3m if unknown)
 */
export function computeImpactForce(
  massKg: number,
  speedKmh: number,
  crushDepthM = 0.3
): { force_n: number; force_kn: number; deceleration_g: number } {
  const speedMs = speedKmh / 3.6;
  const decelDistance = Math.max(crushDepthM, 0.05); // minimum 5 cm
  const decelMs2 = (speedMs * speedMs) / (2 * decelDistance);
  const forceN = massKg * decelMs2;
  return {
    force_n: Math.round(forceN),
    force_kn: Math.round((forceN / 1000) * 100) / 100,
    deceleration_g: Math.round((decelMs2 / 9.81) * 100) / 100,
  };
}

/**
 * Compute kinetic energy and dissipated energy.
 * KE = 0.5 × m × v²; dissipated ≈ 60% of KE (standard deformation assumption).
 */
export function computeEnergy(
  massKg: number,
  speedKmh: number
): { kinetic_energy_j: number; energy_dissipated_j: number; energy_kj: number } {
  const speedMs = speedKmh / 3.6;
  const kineticEnergyJ = 0.5 * massKg * speedMs * speedMs;
  const energyDissipatedJ = kineticEnergyJ * 0.6;
  return {
    kinetic_energy_j: Math.round(kineticEnergyJ),
    energy_dissipated_j: Math.round(energyDissipatedJ),
    energy_kj: Math.round((energyDissipatedJ / 1000) * 10) / 10,
  };
}

// ─── Numerical Contract Output ────────────────────────────────────────────────

export interface PhysicsNumericalOutput {
  /** Delta-V in km/h — always present */
  delta_v: number;
  /** Velocity range derived from delta_v when speed was missing */
  velocity_range: VelocityRange;
  /** Impact force in kN — always present */
  impact_force_kn: number;
  /** Energy dissipated in kJ — always present */
  energy_kj: number;
  /** True if any value was estimated rather than measured */
  estimated: boolean;
  /** Breakdown of which fields were estimated and why */
  estimation_detail: {
    delta_v_estimated: boolean;
    speed_estimated: boolean;
    mass_estimated: boolean;
    mass_source: string;
    mass_kg: number;
  };
}

export interface PhysicsNumericalInput {
  /** Raw delta_v from physics engine (may be 0 or undefined) */
  deltaVKmh?: number | null;
  /** Raw speed from physics engine or claim record (may be 0 or undefined) */
  speedKmh?: number | null;
  /** Vehicle mass from record (may be null) */
  massKg?: number | null;
  /** Vehicle body type for class-based mass lookup */
  bodyType?: string | null;
  /** Crush depth in metres for force calculation (optional) */
  crushDepthM?: number | null;
}

/**
 * Apply the full physics numerical contract.
 * Guarantees all six output fields are numerical — never "N/A".
 */
export function applyPhysicsNumericalContract(
  input: PhysicsNumericalInput
): PhysicsNumericalOutput {
  // ── Step 1: Resolve mass ──────────────────────────────────────────────────
  const massResult = resolveVehicleMass(input.massKg, input.bodyType);

  // ── Step 2: Resolve delta_v ───────────────────────────────────────────────
  let deltaV = input.deltaVKmh ?? 0;
  let deltaVEstimated = false;
  const speed = input.speedKmh ?? 0;

  if (deltaV <= 0 && speed > 0) {
    // Derive delta_v from speed
    deltaV = estimateDeltaVFromSpeed(speed);
    deltaVEstimated = true;
  } else if (deltaV <= 0 && speed <= 0) {
    // Both missing — use a conservative default (30 km/h typical urban impact)
    deltaV = 18; // 30 km/h × 0.6
    deltaVEstimated = true;
  }

  // ── Step 3: Resolve speed / velocity range ────────────────────────────────
  let effectiveSpeed = speed;
  let speedEstimated = false;
  let velocityRange: VelocityRange;

  if (effectiveSpeed <= 0) {
    // Estimate speed range from delta_v
    velocityRange = estimateVelocityFromDeltaV(deltaV);
    effectiveSpeed = velocityRange.mid_kmh;
    speedEstimated = true;
  } else {
    // Speed is known — still produce velocity_range for completeness
    velocityRange = {
      low_kmh: Math.round(effectiveSpeed * 0.9 * 10) / 10,
      mid_kmh: Math.round(effectiveSpeed * 10) / 10,
      high_kmh: Math.round(effectiveSpeed * 1.1 * 10) / 10,
      estimated: false,
    };
  }

  // ── Step 4: Compute force and energy ─────────────────────────────────────
  const crushDepth = input.crushDepthM && input.crushDepthM > 0 ? input.crushDepthM : 0.3;
  const forceResult = computeImpactForce(massResult.mass, effectiveSpeed, crushDepth);
  const energyResult = computeEnergy(massResult.mass, effectiveSpeed);

  const anyEstimated = deltaVEstimated || speedEstimated || massResult.estimated;

  return {
    delta_v: Math.round(deltaV * 10) / 10,
    velocity_range: velocityRange,
    impact_force_kn: forceResult.force_kn,
    energy_kj: energyResult.energy_kj,
    estimated: anyEstimated,
    estimation_detail: {
      delta_v_estimated: deltaVEstimated,
      speed_estimated: speedEstimated,
      mass_estimated: massResult.estimated,
      mass_source: massResult.source,
      mass_kg: massResult.mass,
    },
  };
}

/**
 * Merge a PhysicsNumericalOutput into an existing Stage7Output,
 * filling in zero/missing values without overwriting valid engine data.
 */
export function mergeNumericalContract(
  stage7: {
    deltaVKmh: number;
    estimatedSpeedKmh: number;
    impactForceKn: number;
    energyDistribution: { energyDissipatedKj: number; kineticEnergyJ: number; energyDissipatedJ: number };
  },
  contract: PhysicsNumericalOutput
): {
  deltaVKmh: number;
  estimatedSpeedKmh: number;
  impactForceKn: number;
  energyDistribution: { energyDissipatedKj: number; kineticEnergyJ: number; energyDissipatedJ: number };
  velocityRange: VelocityRange;
  physicsNumerical: PhysicsNumericalOutput;
} {
  return {
    deltaVKmh: stage7.deltaVKmh > 0 ? stage7.deltaVKmh : contract.delta_v,
    estimatedSpeedKmh:
      stage7.estimatedSpeedKmh > 0
        ? stage7.estimatedSpeedKmh
        : contract.velocity_range.mid_kmh,
    impactForceKn:
      stage7.impactForceKn > 0 ? stage7.impactForceKn : contract.impact_force_kn,
    energyDistribution: {
      kineticEnergyJ:
        stage7.energyDistribution.kineticEnergyJ > 0
          ? stage7.energyDistribution.kineticEnergyJ
          : contract.energy_kj * 1000 / 0.6, // reverse the 60% dissipation factor
      energyDissipatedJ:
        stage7.energyDistribution.energyDissipatedJ > 0
          ? stage7.energyDistribution.energyDissipatedJ
          : contract.energy_kj * 1000,
      energyDissipatedKj:
        stage7.energyDistribution.energyDissipatedKj > 0
          ? stage7.energyDistribution.energyDissipatedKj
          : contract.energy_kj,
    },
    velocityRange: contract.velocity_range,
    physicsNumerical: contract,
  };
}
