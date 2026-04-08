/**
 * pipeline-v2/animalStrikePhysicsEngine.ts
 *
 * Animal Strike Physics Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated physics reconstruction module for vehicle–animal collision events.
 * Replaces the vehicle-collision physics model when incident_type = animal_strike.
 *
 * Physics model:
 *   - Impulse-momentum theorem: F·Δt = m·Δv
 *   - Delta-V = (animal_mass × relative_speed) / (vehicle_mass + animal_mass)
 *   - Impact force = vehicle_mass × delta_v / contact_duration
 *   - Energy absorbed = 0.5 × reduced_mass × relative_speed²
 *
 * Constraints:
 *   - No third-party vehicle mass (animal is not a rigid body)
 *   - No crumple zone interaction (animal deforms, not vehicle structure)
 *   - Bullbar presence increases structural deformation tolerance
 *   - Seatbelt pre-tensioning expected at delta_v ≥ 8 km/h
 *   - Airbag deployment expected at delta_v ≥ 25 km/h (frontal)
 *   - Energy distribution MUST sum to ≤ 100%
 *   - G-forces MUST be > 0 and < 50 (realistic range)
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AnimalCategory =
  | "cattle"       // 400–600 kg
  | "horse"        // 350–550 kg
  | "donkey"       // 150–250 kg
  | "goat"         // 30–80 kg
  | "sheep"        // 40–90 kg
  | "pig"          // 80–150 kg
  | "dog"          // 10–50 kg
  | "small_animal" // < 10 kg
  | "unknown";     // default to cattle (conservative)

export type ImpactSeverity = "minor" | "moderate" | "severe" | "catastrophic";
export type ConsistencyVerdict = "CONSISTENT" | "PARTIAL" | "INCONSISTENT";
export type BullbarPresence = true | false | "unknown";

export interface AnimalStrikePhysicsInput {
  /** Speed of vehicle at time of impact in km/h */
  speed_kmh: number;
  /** Vehicle type for mass estimation */
  vehicle_type?: string | null;
  /** Damage components reported */
  damage_components: string[];
  /** Whether a bullbar/nudge bar was fitted */
  presence_of_bullbar: BullbarPresence;
  /** Animal category if known from narrative */
  animal_category?: AnimalCategory;
  /** Whether airbags deployed */
  airbags_deployed?: boolean;
  /** Whether seatbelts locked/pre-tensioned */
  seatbelts_triggered?: boolean;
}

export interface AnimalStrikePhysicsOutput {
  /** Overall impact severity classification */
  impact_severity: ImpactSeverity;
  /** Estimated change in vehicle velocity at impact (km/h) */
  delta_v_kmh: number;
  /** Estimated peak impact force (kN) */
  impact_force_kn: number;
  /** Estimated peak deceleration (G) */
  peak_deceleration_g: number;
  /** Energy absorbed by vehicle structure (kJ) */
  energy_absorbed_kj: number;
  /** Expected damage components for this impact profile */
  expected_damage: string[];
  /** Plausibility score 0–100 comparing reported vs expected damage */
  plausibility_score: number;
  /** Whether reported damage is consistent with physics */
  consistency: ConsistencyVerdict;
  /** Whether seatbelt pre-tensioning is expected at this delta-v */
  seatbelt_expected: boolean;
  /** Whether airbag deployment is expected at this delta-v */
  airbag_expected: boolean;
  /** Whether bullbar presence reduces expected structural damage */
  bullbar_effect_applied: boolean;
  /** Human-readable physics reasoning */
  reasoning: string;
  /** Internal calculation trace for audit */
  calculation_trace: {
    vehicle_mass_kg: number;
    animal_mass_kg: number;
    speed_ms: number;
    delta_v_ms: number;
    contact_duration_ms: number;
    reduced_mass_kg: number;
    kinetic_energy_kj: number;
    energy_distribution_pct: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Vehicle mass estimates by type (kg) */
const VEHICLE_MASS: Record<string, number> = {
  sedan: 1350,
  hatchback: 1200,
  suv: 1800,
  pickup: 2000,
  bakkie: 2000,
  truck: 3500,
  minibus: 2200,
  bus: 8000,
  motorcycle: 200,
  default: 1500,
};

/** Animal mass ranges (kg) — conservative midpoint used */
const ANIMAL_MASS: Record<AnimalCategory, { min: number; max: number; midpoint: number }> = {
  cattle:       { min: 400, max: 600, midpoint: 500 },
  horse:        { min: 350, max: 550, midpoint: 450 },
  donkey:       { min: 150, max: 250, midpoint: 200 },
  pig:          { min: 80,  max: 150, midpoint: 115 },
  sheep:        { min: 40,  max: 90,  midpoint: 65  },
  goat:         { min: 30,  max: 80,  midpoint: 55  },
  dog:          { min: 10,  max: 50,  midpoint: 30  },
  small_animal: { min: 1,   max: 10,  midpoint: 5   },
  unknown:      { min: 400, max: 600, midpoint: 500 }, // default to cattle (conservative)
};

/** Contact duration estimates (seconds) — varies with animal compliance */
const CONTACT_DURATION_S: Record<AnimalCategory, number> = {
  cattle:       0.12,
  horse:        0.14,
  donkey:       0.11,
  pig:          0.10,
  sheep:        0.09,
  goat:         0.09,
  dog:          0.08,
  small_animal: 0.06,
  unknown:      0.12,
};

/** Energy absorption fraction for vehicle structure (rest goes to animal deformation) */
const VEHICLE_ENERGY_FRACTION: Record<AnimalCategory, number> = {
  cattle:       0.35,
  horse:        0.38,
  donkey:       0.28,
  pig:          0.22,
  sheep:        0.18,
  goat:         0.16,
  dog:          0.12,
  small_animal: 0.05,
  unknown:      0.35,
};

/** Damage patterns by severity and animal category */
const DAMAGE_PATTERNS: Record<ImpactSeverity, Record<"large" | "medium" | "small", string[]>> = {
  minor: {
    large:  ["front bumper assembly", "grille", "bonnet leading edge"],
    medium: ["front bumper assembly", "grille"],
    small:  ["front bumper assembly"],
  },
  moderate: {
    large:  ["front bumper assembly", "bonnet/hood", "grille", "headlamp assembly", "radiator support panel", "intercooler"],
    medium: ["front bumper assembly", "bonnet/hood", "grille", "headlamp assembly"],
    small:  ["front bumper assembly", "grille"],
  },
  severe: {
    large:  ["front bumper assembly", "bonnet/hood", "radiator support panel", "headlamp assembly", "intercooler", "fan cowling", "front crossmember", "bull bar (if fitted)", "grille", "bonnet hinge"],
    medium: ["front bumper assembly", "bonnet/hood", "grille", "headlamp assembly", "radiator support panel"],
    small:  ["front bumper assembly", "bonnet/hood", "grille"],
  },
  catastrophic: {
    large:  ["front bumper assembly", "bonnet/hood", "radiator support panel", "headlamp assembly", "intercooler", "fan cowling", "front crossmember", "bull bar (if fitted)", "grille", "bonnet hinge", "windscreen", "A-pillar", "chassis/frame"],
    medium: ["front bumper assembly", "bonnet/hood", "grille", "headlamp assembly", "radiator support panel", "intercooler", "windscreen"],
    small:  ["front bumper assembly", "bonnet/hood", "grille", "headlamp assembly"],
  },
};

/** Bullbar damage reduction — reduces expected structural components */
const BULLBAR_PROTECTED_COMPONENTS = new Set([
  "radiator support panel",
  "front crossmember",
  "intercooler",
  "fan cowling",
]);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function resolveVehicleMass(vehicleType: string | null | undefined): number {
  if (!vehicleType) return VEHICLE_MASS.default;
  const key = vehicleType.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(VEHICLE_MASS)) {
    if (key.includes(k)) return v;
  }
  return VEHICLE_MASS.default;
}

function resolveAnimalCategory(
  input: AnimalStrikePhysicsInput
): AnimalCategory {
  if (input.animal_category && input.animal_category !== "unknown") {
    return input.animal_category;
  }
  // Infer from damage components
  const components = input.damage_components.join(" ").toLowerCase();
  if (components.includes("chassis") || components.includes("a-pillar") || components.includes("windscreen")) {
    return "cattle"; // Only large animals cause this level of damage
  }
  return "unknown"; // Default to cattle (conservative)
}

function getAnimalSizeClass(category: AnimalCategory): "large" | "medium" | "small" {
  if (["cattle", "horse"].includes(category)) return "large";
  if (["donkey", "pig", "sheep", "goat", "unknown"].includes(category)) return "medium";
  return "small";
}

function classifySeverity(
  deltaVKmh: number,
  animalCategory: AnimalCategory,
  hasBullbar: boolean,
  vehicleSpeedKmh: number = 0
): ImpactSeverity {
  const sizeClass = getAnimalSizeClass(animalCategory);
  // Bullbar raises the threshold for structural damage
  const bullbarOffset = hasBullbar ? 10 : 0;
  const effectiveDeltaV = deltaVKmh - bullbarOffset;

  // RULE: Vehicle speed > 70 km/h with large animal → minimum "severe"
  // regardless of delta_v (the vehicle speed determines energy at impact,
  // delta_v only reflects the velocity change — a heavy truck has low delta_v
  // but still transfers enormous energy to the animal and structure).
  const speedFloor: ImpactSeverity | null =
    vehicleSpeedKmh > 70 && sizeClass === "large" ? "severe" :
    vehicleSpeedKmh > 100 && sizeClass === "large" ? "catastrophic" :
    null;

  let computed: ImpactSeverity;
  if (sizeClass === "large") {
    if (effectiveDeltaV >= 25) computed = "catastrophic";
    else if (effectiveDeltaV >= 15) computed = "severe";
    else if (effectiveDeltaV >= 8)  computed = "moderate";
    else computed = "minor";
  } else if (sizeClass === "medium") {
    if (effectiveDeltaV >= 30) computed = "severe";
    else if (effectiveDeltaV >= 15) computed = "moderate";
    else computed = "minor";
  } else {
    // small
    computed = effectiveDeltaV >= 20 ? "moderate" : "minor";
  }

  // Apply speed floor — never downgrade below the speed-based minimum
  if (speedFloor) {
    const order: ImpactSeverity[] = ["minor", "moderate", "severe", "catastrophic"];
    if (order.indexOf(computed) < order.indexOf(speedFloor)) {
      return speedFloor;
    }
  }
  return computed;
}

function buildExpectedDamage(
  severity: ImpactSeverity,
  animalCategory: AnimalCategory,
  hasBullbar: boolean
): string[] {
  const sizeClass = getAnimalSizeClass(animalCategory);
  let components = [...DAMAGE_PATTERNS[severity][sizeClass]];
  if (hasBullbar) {
    // Bullbar absorbs some structural damage — remove protected components for minor/moderate
    if (severity === "minor" || severity === "moderate") {
      components = components.filter(c => !BULLBAR_PROTECTED_COMPONENTS.has(c));
    }
    // Add bullbar itself as expected damaged component
    if (!components.includes("bull bar (if fitted)")) {
      components.unshift("bull bar (if fitted)");
    }
  }
  return components;
}

function normaliseComponent(c: string): string {
  return c.toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computePlausibilityScore(
  reportedComponents: string[],
  expectedComponents: string[],
  severity: ImpactSeverity,
  airbagExpected: boolean,
  airbagDeployed: boolean | undefined,
  seatbeltExpected: boolean,
  seatbeltTriggered: boolean | undefined
): { score: number; verdict: ConsistencyVerdict } {
  if (expectedComponents.length === 0) return { score: 50, verdict: "PARTIAL" };

  const normReported = reportedComponents.map(normaliseComponent);
  const normExpected = expectedComponents.map(normaliseComponent);

  // Component overlap score (0–70 points)
  let matchCount = 0;
  for (const exp of normExpected) {
    if (normReported.some(r => r.includes(exp) || exp.includes(r))) {
      matchCount++;
    }
  }
  const overlapScore = (matchCount / normExpected.length) * 70;

  // Airbag consistency (0–15 points)
  let airbagScore = 7.5; // neutral if unknown
  if (airbagDeployed !== undefined) {
    if (airbagExpected && airbagDeployed) airbagScore = 15;
    else if (!airbagExpected && !airbagDeployed) airbagScore = 15;
    else if (airbagExpected && !airbagDeployed) airbagScore = 3;
    else airbagScore = 5; // deployed when not expected — unusual but possible
  }

  // Seatbelt consistency (0–15 points)
  let seatbeltScore = 7.5; // neutral if unknown
  if (seatbeltTriggered !== undefined) {
    if (seatbeltExpected && seatbeltTriggered) seatbeltScore = 15;
    else if (!seatbeltExpected && !seatbeltTriggered) seatbeltScore = 15;
    else if (seatbeltExpected && !seatbeltTriggered) seatbeltScore = 5;
    else seatbeltScore = 8;
  }

  const total = Math.round(overlapScore + airbagScore + seatbeltScore);
  const clamped = Math.min(100, Math.max(0, total));

  let verdict: ConsistencyVerdict;
  if (clamped >= 70) verdict = "CONSISTENT";
  else if (clamped >= 40) verdict = "PARTIAL";
  else verdict = "INCONSISTENT";

  return { score: clamped, verdict };
}

function buildReasoning(
  input: AnimalStrikePhysicsInput,
  animalCategory: AnimalCategory,
  animalMassKg: number,
  vehicleMassKg: number,
  deltaVKmh: number,
  impactForceKn: number,
  peakGForce: number,
  severity: ImpactSeverity,
  consistency: ConsistencyVerdict,
  plausibilityScore: number,
  seatbeltExpected: boolean,
  airbagExpected: boolean,
  bullbarApplied: boolean
): string {
  const speedKmh = input.speed_kmh;
  const bullbarNote = bullbarApplied
    ? " A bullbar was fitted, which absorbs initial impact energy and reduces structural deformation to the radiator support and crossmember."
    : "";
  const seatbeltNote = seatbeltExpected
    ? ` At delta-V of ${deltaVKmh.toFixed(1)} km/h, seatbelt pre-tensioning is expected.`
    : "";
  const airbagNote = airbagExpected
    ? ` Frontal airbag deployment is expected at this delta-V.`
    : ` Frontal airbag deployment is NOT expected at this delta-V (threshold ~25 km/h).`;

  return (
    `Animal strike physics analysis for a ${input.vehicle_type || "vehicle"} (${vehicleMassKg} kg) ` +
    `striking a ${animalCategory} (${animalMassKg} kg) at ${speedKmh} km/h. ` +
    `Estimated delta-V: ${deltaVKmh.toFixed(1)} km/h. ` +
    `Peak impact force: ${impactForceKn.toFixed(1)} kN. ` +
    `Peak deceleration: ${peakGForce.toFixed(1)} G. ` +
    `Impact severity classification: ${severity.toUpperCase()}.` +
    bullbarNote +
    seatbeltNote +
    airbagNote +
    ` Damage consistency verdict: ${consistency} (plausibility score: ${plausibilityScore}/100). ` +
    `Note: animal strike physics differ fundamentally from vehicle-to-vehicle collision — ` +
    `the animal deforms on impact, so crumple zone interaction and third-party vehicle mass ` +
    `are not applicable. Energy distribution is between vehicle structure and animal body.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function runAnimalStrikePhysics(
  input: AnimalStrikePhysicsInput
): AnimalStrikePhysicsOutput {
  // ── WI-4: Null-input guard ──────────────────────────────────────────────────────
  // Speed is the primary input. If it is 0 or missing, the physics engine
  // cannot produce a meaningful result. Return a zero-plausibility record
  // rather than fabricating a score from an invalid input.
  if (!input.speed_kmh || input.speed_kmh <= 0) {
    return {
      plausibility_score: 0,
      plausibility_tier: "INVALID_INPUT" as any,
      delta_v_kmh: 0,
      impact_force_kn: 0,
      peak_deceleration_g: 0,
      energy_absorbed_kj: 0,
      expected_damage_zones: [],
      damage_consistency: {
        matched_components: [],
        unexpected_components: [],
        missing_expected_components: [],
        consistency_score: 0,
        direction_mismatch: false,
        severity_mismatch: false,
      },
      airbag_deployment_expected: false,
      seatbelt_pretension_expected: false,
      total_loss_threshold_exceeded: false,
      confidence: 0,
      assumptions: ["speed_kmh was 0 or missing — physics engine refused to run (WI-4 null-input gate)"],
      warnings: ["INVALID INPUT: speed_kmh must be > 0 for physics analysis"],
      _meta: {
        vehicle_mass_kg: 0, animal_mass_kg: 0, animal_category: "unknown",
        delta_v_ms: 0, reduced_mass_kg: 0, contact_duration_s: 0,
        impact_force_n: 0, peak_deceleration_ms2: 0, energy_absorbed_j: 0,
        speed_ms: 0,
      },
    };
  }

  // ── 1. Resolve parameters ────────────────────────────────────────────────────────
  const speedKmh = Math.max(0, input.speed_kmh);
  const speedMs = speedKmh / 3.6;
  const vehicleMassKg = resolveVehicleMass(input.vehicle_type);
  const animalCategory = resolveAnimalCategory(input);
  const animalData = ANIMAL_MASS[animalCategory];
  const animalMassKg = animalData.midpoint;
  const contactDurationS = CONTACT_DURATION_S[animalCategory];
  const vehicleEnergyFraction = VEHICLE_ENERGY_FRACTION[animalCategory];
  const hasBullbar = input.presence_of_bullbar === true;

  // ── 2. Physics calculations ────────────────────────────────────────────────
  // Reduced mass (effective inertial mass for collision)
  const reducedMassKg = (vehicleMassKg * animalMassKg) / (vehicleMassKg + animalMassKg);

  // Delta-V: momentum transfer to vehicle
  // Δv_vehicle = (m_animal / (m_vehicle + m_animal)) × v_relative
  const deltaVMs = (animalMassKg / (vehicleMassKg + animalMassKg)) * speedMs;
  const deltaVKmh = parseFloat((deltaVMs * 3.6).toFixed(2));

  // Impact force: F = m_vehicle × Δv / Δt
  const impactForceN = vehicleMassKg * deltaVMs / contactDurationS;
  const impactForceKn = parseFloat((impactForceN / 1000).toFixed(2));

  // Peak deceleration in G (must be > 0 and < 50)
  const peakDecelerationMs2 = deltaVMs / contactDurationS;
  const peakDecelerationG = parseFloat(
    Math.min(50, Math.max(0.01, peakDecelerationMs2 / 9.81)).toFixed(2)
  );

  // Kinetic energy of system
  const kineticEnergyJ = 0.5 * reducedMassKg * speedMs * speedMs;
  const kineticEnergyKj = parseFloat((kineticEnergyJ / 1000).toFixed(2));

  // Energy absorbed by vehicle structure (must be ≤ 100%)
  const vehicleEnergyPct = parseFloat(
    Math.min(100, vehicleEnergyFraction * 100).toFixed(1)
  );

  // ── 3. Severity classification ─────────────────────────────────────────────
  const severity = classifySeverity(deltaVKmh, animalCategory, hasBullbar, speedKmh);

  // ── 4. Expected damage pattern ─────────────────────────────────────────────
  const expectedDamage = buildExpectedDamage(severity, animalCategory, hasBullbar);

  // ── 5. Safety system thresholds ───────────────────────────────────────────
  const seatbeltExpected = deltaVKmh >= 8;
  const airbagExpected = deltaVKmh >= 25;

  // ── 6. Plausibility scoring ────────────────────────────────────────────────
  const { score: plausibilityScore, verdict: consistency } = computePlausibilityScore(
    input.damage_components,
    expectedDamage,
    severity,
    airbagExpected,
    input.airbags_deployed,
    seatbeltExpected,
    input.seatbelts_triggered
  );

  // ── 7. Reasoning ──────────────────────────────────────────────────────────
  const reasoning = buildReasoning(
    input,
    animalCategory,
    animalMassKg,
    vehicleMassKg,
    deltaVKmh,
    impactForceKn,
    peakDecelerationG,
    severity,
    consistency,
    plausibilityScore,
    seatbeltExpected,
    airbagExpected,
    hasBullbar
  );

  return {
    impact_severity: severity,
    delta_v_kmh: deltaVKmh,
    impact_force_kn: impactForceKn,
    peak_deceleration_g: peakDecelerationG,
    energy_absorbed_kj: kineticEnergyKj,
    expected_damage: expectedDamage,
    plausibility_score: plausibilityScore,
    consistency,
    seatbelt_expected: seatbeltExpected,
    airbag_expected: airbagExpected,
    bullbar_effect_applied: hasBullbar,
    reasoning,
    calculation_trace: {
      vehicle_mass_kg: vehicleMassKg,
      animal_mass_kg: animalMassKg,
      speed_ms: parseFloat(speedMs.toFixed(3)),
      delta_v_ms: parseFloat(deltaVMs.toFixed(3)),
      contact_duration_ms: parseFloat((contactDurationS * 1000).toFixed(1)),
      reduced_mass_kg: parseFloat(reducedMassKg.toFixed(1)),
      kinetic_energy_kj: kineticEnergyKj,
      energy_distribution_pct: vehicleEnergyPct,
    },
  };
}
