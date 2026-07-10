/**
 * speedInferenceEnsemble.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-method impact speed inference ensemble for accident reconstruction.
 *
 * DESIGN PHILOSOPHY
 * ─────────────────
 * No single formula is sufficient for reliable speed inference — each method
 * has different sensitivity to input quality and different failure modes.
 * This ensemble runs up to FIVE independent methods in parallel and produces
 * a weighted consensus with internal cross-validation.
 *
 * All methods are pure mathematics — zero LLM calls, zero external API calls.
 * Execution time: < 1 ms on any modern CPU.
 *
 * METHODS
 * ───────
 * M1 — Campbell's Stiffness Formula (crush depth × vehicle stiffness)
 *      V = √(2 × k × C² / m)
 *      Source: Campbell (1974), NHTSA crash test correlation
 *      Confidence: HIGH when crush depth is document-stated; LOW when inferred
 *      NOTE: Inferred crush depth from damage severity is circular (severity
 *      depends on speed) — LOW confidence only, not used for consensus.
 *
 * M2 — Energy-Momentum Balance — DISABLED
 *      Repair cost is market-dependent and cannot be reliably converted to
 *      deformation energy across different markets and time periods.
 *
 * M3 — Impulse-Momentum (primary impact contact area × contact pressure) — DISABLED
 *      Requires vision-derived primary impact contact area from M5.
 *      totalDamageAreaM2 (sum of all damaged component areas) is NOT a valid
 *      input — it includes secondary damage from rollovers, multi-impacts, etc.
 *      Re-enable only when M5 provides a measured primary contact patch area.
 *
 * M4 — Deployment Threshold (airbag / seatbelt pretensioner hard bounds)
 *      Airbag deployment → V ≥ 20 km/h (FMVSS 208 frontal barrier equivalent)
 *      Seatbelt pretensioner → V ≥ 15 km/h
 *      Source: FMVSS 208, Euro NCAP frontal test protocols
 *      Confidence: HIGH as a lower bound for frontal/barrier events.
 *      NOTE: For non-barrier events (pothole, rollover, single-vehicle),
 *      the FMVSS 208 threshold may not apply directly — flagged accordingly.
 *
 * M5 — Computer Vision Deformation Estimate (vision-extracted crush depth)
 *      Path A: Campbell formula using vision-extracted crush depth from photos.
 *      Path B: Energy balance using primary-impact deformation energy — only
 *      valid when damage is concentrated in a single impact zone (≤ 2 zones).
 *      Multi-zone damage (rollover, multi-impact) disables Path B.
 *      Confidence: MEDIUM-HIGH when vision depth is available
 *
 * CONSENSUS ALGORITHM
 * ───────────────────
 * 1. Each method produces: { speedKmh, confidenceWeight, method, basis }
 * 2. Methods that produce a lower bound only (M4) are excluded from the
 *    weighted average but used to floor the consensus.
 * 3. Outlier rejection: methods whose estimate deviates by more than 2σ
 *    from the initial mean are down-weighted by 50%.
 * 4. Weighted mean of remaining estimates → consensus speed.
 * 5. Confidence interval: ± (weighted standard deviation × 1.645) for 90% CI.
 * 6. Cross-validation flag: if any two estimates differ by > 40%, a
 *    HIGH_DIVERGENCE flag is set and the adjuster is notified.
 *
 * OUTPUT
 * ──────
 * SpeedInferenceResult — consumed by Stage 7 and surfaced in Section 2 of
 * the Forensic Audit Report.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type MethodConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MethodEstimate {
  /** Method identifier */
  method: 'CAMPBELL' | 'ENERGY_MOMENTUM' | 'IMPULSE' | 'DEPLOYMENT_THRESHOLD' | 'VISION_DEFORMATION';
  /** Human-readable method name */
  label: string;
  /** Estimated speed in km/h (null if method cannot produce an estimate) */
  speedKmh: number | null;
  /** Whether this is a lower bound only (not a point estimate) */
  isLowerBoundOnly: boolean;
  /** Confidence weight 0–1 used in weighted consensus */
  confidenceWeight: number;
  /** Qualitative confidence tier */
  confidence: MethodConfidence;
  /** Key inputs used — for audit trail */
  basis: string;
  /** Whether this method had sufficient data to run */
  ran: boolean;
}

export interface SpeedInferenceResult {
  /** Consensus speed in km/h (weighted mean of valid point estimates) */
  consensusSpeedKmh: number | null;
  /** 90% confidence interval [low, high] in km/h */
  confidenceInterval: [number, number] | null;
  /** Hard lower bound from deployment thresholds */
  lowerBoundKmh: number | null;
  /** Per-method results for display and audit */
  methods: MethodEstimate[];
  /** Overall confidence in the consensus */
  overallConfidence: MethodConfidence;
  /** True if two or more methods diverge by > 40% — warrants adjuster review */
  highDivergence: boolean;
  /** Human-readable summary for the report */
  summary: string;
  /** Number of methods that successfully produced a point estimate */
  methodsRan: number;
  /**
   * When highDivergence is true: structured explanation of WHY methods diverge.
   * Each entry identifies the two most divergent methods, their key inputs,
   * and a plain-English reason for the gap. Used by the report to explain
   * conflicts to adjusters rather than just flagging them.
   */
  divergenceExplanation?: {
    /** The two method IDs that are furthest apart */
    methodPair: [string, string];
    /** Speed estimates for each method */
    speedsKmh: [number, number];
    /** Absolute gap in km/h */
    gapKmh: number;
    /** Percentage divergence */
    gapPct: number;
    /** Key input difference driving the gap (e.g. crush depth discrepancy) */
    keyInputDifference: string;
    /** Plain-English adjuster-facing explanation */
    explanation: string;
    /** Recommended adjuster action */
    recommendedAction: string;
  }[];
  /**
   * Cross-validation spread across all contributing methods (km/h).
   * Populated when >= 2 methods ran.
   */
  crossValidation?: {
    spread: number;
    outlierMethods: string[];
    recommendation: string;
  };
}

// ── Vehicle stiffness table (kN/m) ───────────────────────────────────────────
// Based on NHTSA crash test data and Campbell (1974) stiffness coefficients.
// Values represent the structural stiffness of the primary impact zone.
// Source: NHTSA Technical Report DOT HS 811 144 (2009), Table 3.
// NOTE: These are published-data values grounded in NHTSA crash tests.
// They are NOT engineering-judgment estimates and should not be tagged CALIBRATION.
// To update, cite the new source explicitly.

const STIFFNESS_KNM: Record<string, number> = {
  compact:  800,
  sedan:   1000,
  suv:     1200,
  truck:   1400,
  van:     1100,
  sports:  1300,
  pickup:  1350,
  bus:     1600,
  minivan: 1050,
};

function getStiffnessKnm(bodyType: string | null | undefined): number {
  if (!bodyType) return 1000;
  const key = bodyType.toLowerCase().trim();
  return STIFFNESS_KNM[key] ?? 1000;
}

// ── Accident type multipliers ─────────────────────────────────────────────────
// Accounts for the fraction of kinetic energy absorbed by the primary structure.
// Rear impacts have less crumple zone; side impacts have less protection.
// Source: SAE 2002-01-0547 (Varat & Husher, 2002) — directional energy absorption.
// NOTE: Published-data values from SAE 2002-01-0547. Not engineering-judgment estimates.

const ACCIDENT_TYPE_MULTIPLIER: Record<string, number> = {
  frontal:          1.00,
  rear:             0.90,  // Less crumple zone in rear
  side_driver:      1.10,  // Less protection, more damage per unit speed
  side_passenger:   1.10,
  rollover:         1.30,  // Complex multi-zone energy dissipation
  multi_impact:     1.20,
  unknown:          1.00,
};

function getAccidentMultiplier(direction: string | null | undefined): number {
  if (!direction) return 1.0;
  return ACCIDENT_TYPE_MULTIPLIER[direction.toLowerCase()] ?? 1.0;
}

// ── M1: Campbell's Stiffness Formula ─────────────────────────────────────────
// V = √(2 × k × C² / m)
// Source: Campbell (1974), NHTSA crash test correlation.
//
// IMPORTANT NOTES ON CONFIDENCE:
// - 'document': document-stated crush depth → HIGH confidence, weight 0.80
// - 'vision':   computer-vision extracted crush depth → MEDIUM confidence, weight 0.55
//               Vision depth is a real measurement (not circular) so it participates
//               in the consensus at reduced weight relative to document-stated depth.
// - 'inferred': derived from damage severity (circular reasoning) → LOW confidence,
//               weight 0.00 — shown for transparency but excluded from consensus.
//
// The internal airbag floor has been removed — M4 (Deployment Threshold)
// handles the lower bound independently. Applying it inside M1 would
// double-count the deployment evidence.
//
// The structural damage multiplier (×1.12) has been removed — it was an
// arbitrary coefficient not grounded in published crash test data.

function runCampbell(
  crushDepthM: number,
  massKg: number,
  bodyType: string | null | undefined,
  collisionDirection: string | null | undefined,
  isExplicitDepth: boolean,
  depthSource: 'document' | 'vision' | 'inferred' = 'inferred',
): MethodEstimate {
  if (crushDepthM <= 0 || massKg <= 0) {
    return {
      method: 'CAMPBELL', label: "Campbell's formula (crush depth)",
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'Insufficient data: crush depth or vehicle mass missing',
      ran: false,
    };
  }

  const stiffnessNm = getStiffnessKnm(bodyType) * 1000; // kN/m → N/m
  const energyJ = 0.5 * stiffnessNm * Math.pow(crushDepthM, 2);
  let speedMs = Math.sqrt((2 * energyJ) / massKg);
  let speedKmh = speedMs * 3.6;

  // Apply accident-type directional multiplier
  speedKmh *= getAccidentMultiplier(collisionDirection);

  speedKmh = Math.round(speedKmh);

  // Confidence and weight by depth source:
  // - 'document': HIGH confidence, weight 0.80 (court-defensible measurement)
  // - 'vision':   MEDIUM confidence, weight 0.55 (real measurement, not circular)
  // - 'inferred': LOW confidence, weight 0.00 (excluded from consensus)
  const confidence: MethodConfidence = depthSource === 'document' ? 'HIGH' : depthSource === 'vision' ? 'MEDIUM' : 'LOW';
  const weight = depthSource === 'document' ? 0.80 : depthSource === 'vision' ? 0.55 : 0.00;
  const basisNote = depthSource === 'document'
    ? 'document-stated measurement'
    : depthSource === 'vision'
    ? 'computer-vision extracted measurement — MEDIUM confidence'
    : 'inferred from damage severity — LOW confidence, excluded from consensus';

  return {
    method: 'CAMPBELL',
    label: "Campbell's stiffness formula",
    speedKmh,
    isLowerBoundOnly: false,
    confidenceWeight: weight,
    confidence,
    basis: `Crush depth: ${(crushDepthM * 100).toFixed(1)} cm (${basisNote}), stiffness: ${getStiffnessKnm(bodyType)} kN/m (${bodyType ?? 'default'}), mass: ${massKg} kg`,
    ran: depthSource !== 'inferred', // Counts as "ran" for document and vision depths
  };
}

// ── M2: Energy-Momentum Balance — DISABLED ───────────────────────────────────
// This method used repair cost as a proxy for deformation energy (Strother et al.
// 1986, SAE 860924). It has been disabled because repair costs are market-dependent
// and region-specific — the 1986 US-market cost/energy correlation does not transfer
// reliably to other markets or time periods. Using cost as a physics input introduces
// more noise than signal and risks producing misleading speed estimates.
// The method slot is preserved in the output schema for UI consistency.

function runEnergyMomentum(
  _partsCostUsd: number | null,
  _massKg: number,
  _collisionDirection: string | null | undefined,
  _airbagDeployment: boolean,
): MethodEstimate {
  return {
    method: 'ENERGY_MOMENTUM',
    label: 'Energy-momentum balance (repair cost proxy)',
    speedKmh: null,
    isLowerBoundOnly: false,
    confidenceWeight: 0,
    confidence: 'LOW',
    basis: 'Method disabled — repair cost is not a reliable physics input across different markets and time periods.',
    ran: false,
  };
}

// ── M3: Impulse-Momentum — DISABLED ──────────────────────────────────────────
// The impulse-momentum method requires the PRIMARY IMPACT CONTACT AREA —
// the physical zone where force was transferred during the collision event.
//
// The available input (totalDamageAreaM2) is the sum of all damaged component
// areas across the entire vehicle. This is NOT the contact area. Examples of
// why this is wrong:
//   - A vehicle hitting a tree at 40 km/h and rolling will have damage on all
//     4 sides. totalDamageAreaM2 could be 4–6 m², but the impact contact area
//     was ~0.3 m² (the tree contact patch).
//   - A pothole impact damages underbody, suspension, and wheels — total area
//     may be 2+ m², but the contact was a single wheel hitting a depression.
//
// Applying the impulse formula to totalDamageAreaM2 produces speed estimates
// that are 3–10× too high and cannot be defended in court.
//
// M3 will be re-enabled when M5 computer vision provides a measured primary
// impact contact patch area (width × height of the deformed zone at the
// primary impact point). This requires the vision model to identify and
// measure the primary impact zone specifically, not the total damage footprint.

function runImpulse(
  _totalDamageAreaM2: number | null,
  _crushDepthM: number,
  _massKg: number,
  _collisionDirection: string | null | undefined,
): MethodEstimate {
  return {
    method: 'IMPULSE',
    label: 'Impulse-momentum method (damage area)',
    speedKmh: null,
    isLowerBoundOnly: false,
    confidenceWeight: 0,
    confidence: 'LOW',
    basis: 'Method disabled — total damage area is not a valid proxy for primary impact contact area. Secondary damage from rollovers, multi-impacts, and cascading failures inflates the area and produces unreliable speed estimates. Re-enable when computer vision provides a measured primary contact patch area.',
    ran: false,
  };
}

// ── M4: Deployment Threshold (hard lower bound) ───────────────────────────────
// Source: FMVSS 208 (Federal Motor Vehicle Safety Standard 208),
// Euro NCAP frontal test protocols.
//
// IMPORTANT: The FMVSS 208 threshold (20–30 km/h) is calibrated for
// FRONTAL BARRIER EQUIVALENT speed — i.e., a direct frontal collision with
// a fixed barrier. For non-barrier events (pothole impacts, rollovers,
// single-vehicle collisions with deformable objects), the airbag sensor
// algorithm uses a different deceleration profile and the threshold may
// be higher (typically >30 km/h for non-barrier events).
//
// This method provides a HARD LOWER BOUND only — it is not a point estimate.
// It is excluded from the weighted mean but used to floor the consensus.

function runDeploymentThreshold(
  airbagDeployment: boolean,
  seatbeltPretensioner: boolean,
  collisionDirection: string | null | undefined,
): MethodEstimate {
  if (!airbagDeployment && !seatbeltPretensioner) {
    return {
      method: 'DEPLOYMENT_THRESHOLD', label: 'Deployment threshold (FMVSS 208)',
      speedKmh: null, isLowerBoundOnly: true,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'No airbag or seatbelt pretensioner deployment recorded',
      ran: false,
    };
  }

  // FMVSS 208: frontal airbags deploy at 20–30 km/h equivalent barrier speed.
  // Side airbags: 15–25 km/h. Use conservative lower bound.
  // Source: FMVSS 208, Euro NCAP frontal test protocols (published standards).
  /** Frontal airbag FMVSS 208 lower bound (km/h) — published standard */
  const AIRBAG_LOWER_BOUND_KMH      = 20;
  /** Seatbelt pretensioner lower bound (km/h) — published standard */
  const PRETENSIONER_LOWER_BOUND_KMH = 15;
  /** Frontal airbag typical deployment speed (km/h) — published standard */
  const AIRBAG_TYPICAL_KMH          = 28;
  /** Seatbelt pretensioner typical speed (km/h) — published standard */
  const PRETENSIONER_TYPICAL_KMH    = 18;

  const lowerBoundKmh = airbagDeployment ? AIRBAG_LOWER_BOUND_KMH : PRETENSIONER_LOWER_BOUND_KMH;
  const typicalKmh    = airbagDeployment ? AIRBAG_TYPICAL_KMH     : PRETENSIONER_TYPICAL_KMH;

  // Check if this is a non-barrier event where FMVSS 208 may not apply directly
  const dir = (collisionDirection ?? '').toLowerCase();
  const isNonBarrier = dir === 'rollover' || dir === 'single_vehicle' || dir === 'pothole' || dir === 'unknown';
  const caveat = isNonBarrier
    ? ' Note: FMVSS 208 threshold is calibrated for frontal barrier events. For this incident type, actual deployment threshold may be higher (>30 km/h). Use as indicative lower bound only.'
    : '';

  return {
    method: 'DEPLOYMENT_THRESHOLD',
    label: 'Deployment threshold (FMVSS 208 / Euro NCAP)',
    speedKmh: typicalKmh,
    isLowerBoundOnly: true,
    // CALIBRATION: 0.70 confidence weight for deployment threshold as a floor.
  // This is engineering judgment, not derived from a published standard.
  // Do not change without benchmarking.
  confidenceWeight: 0.70, // High confidence as a floor for barrier events
    confidence: 'HIGH',
    basis: airbagDeployment
      ? `Airbag deployment confirmed — FMVSS 208 threshold: ≥ ${lowerBoundKmh} km/h (frontal barrier equivalent). Typical deployment: 25–35 km/h.${caveat}`
      : `Seatbelt pretensioner deployment — typical activation: ≥ ${lowerBoundKmh} km/h.${caveat}`,
    ran: true,
  };
}

// ── M5: Computer Vision Deformation Estimate ──────────────────────────────────
// Source: Vision LLM analysis of damage photographs.
//
// Path A: Campbell formula using vision-extracted crush depth.
//   V = √(2 × k × C_vision² / m)
//   This is the most reliable path when the vision model correctly identifies
//   the primary impact crush depth from photographs.
//
// Path B: Energy balance using primary-impact deformation energy.
//   V = √(2 × E_primary / m)
//   ONLY valid when damage is concentrated in a single impact zone (≤ 2 zones).
//   For multi-zone damage (rollover, multi-impact), the total deformation energy
//   includes secondary damage and does NOT represent the primary impact energy.
//   Path B is disabled when multiZoneDamage = true.

function runVisionDeformation(
  visionCrushDepthM: number | null,
  massKg: number,
  bodyType: string | null | undefined,
  collisionDirection: string | null | undefined,
  structuralDamage: boolean,
  airbagDeployment: boolean,
  totalDeformationEnergyJ: number | null,
  visionConfidenceScore: number | null,
  multiZoneDamage: boolean,
): MethodEstimate {
  const hasCrush = visionCrushDepthM != null && visionCrushDepthM > 0;
  // Path B is only valid for single-zone impacts
  const hasEnergy = totalDeformationEnergyJ != null && totalDeformationEnergyJ > 0 && !multiZoneDamage;

  if (!hasCrush && !hasEnergy) {
    return {
      method: 'VISION_DEFORMATION', label: 'M5 Vision Deformation',
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: hasCrush === false && multiZoneDamage
        ? 'No vision-extracted crush depth available. Path B (deformation energy) disabled — multi-zone damage detected; total deformation energy includes secondary damage and is not a valid primary impact energy input.'
        : 'No vision-extracted crush depth or deformation energy available',
      ran: false,
    };
  }

  const stiffnessNm = getStiffnessKnm(bodyType) * 1000;
  const dirMultiplier = getAccidentMultiplier(collisionDirection);

  // ── Path A: Campbell formula from vision-extracted crush depth ────────────
  let pathA: { crushDepthM: number; speedKmh: number } | null = null;
  if (hasCrush) {
    const energyJ = 0.5 * stiffnessNm * Math.pow(visionCrushDepthM!, 2);
    let speedMs = Math.sqrt((2 * energyJ) / massKg);
    let speedKmh = speedMs * 3.6 * dirMultiplier;
    // Note: no arbitrary structural damage multiplier — not grounded in published data
    // Airbag floor is handled by M4, not here
    pathA = { crushDepthM: visionCrushDepthM!, speedKmh: Math.round(speedKmh) };
  }

  // ── Path B: Energy balance v = sqrt(2E/m) from primary-impact deformation energy
  // Only runs for single-zone impacts (multiZoneDamage = false)
  let pathB: { deformationEnergyJ: number; speedKmh: number } | null = null;
  if (hasEnergy) {
    let speedMs = Math.sqrt((2 * totalDeformationEnergyJ!) / massKg);
    let speedKmh = speedMs * 3.6 * dirMultiplier;
    pathB = { deformationEnergyJ: totalDeformationEnergyJ!, speedKmh: Math.round(speedKmh) };
  }

  // ── Cross-validation: do both paths agree within 20%? ─────────────────────
  // CALIBRATION: 20% agreement threshold, 60/40 path weighting, and confidence
  // weight range (0.30–0.90) are engineering-judgment values.
  // Do not change without benchmarking against a labelled claim sample.

  /** M5 Path A/B agreement threshold: paths agree if spread/avg ≤ this value */
  const M5_PATH_AGREEMENT_THRESHOLD = 0.20;
  /** M5 Path A weight in the A+B consensus (Path B gets 1 − this) */
  const M5_PATH_A_WEIGHT = 0.60;
  /** M5 minimum confidence weight when visionConfidenceScore is 0 */
  const M5_WEIGHT_MIN    = 0.30;
  /** M5 maximum confidence weight when visionConfidenceScore is 100 */
  const M5_WEIGHT_MAX    = 0.90;
  /** M5 weight range (MAX − MIN) for linear interpolation */
  const M5_WEIGHT_RANGE  = M5_WEIGHT_MAX - M5_WEIGHT_MIN;
  /** M5 default weight when visionConfidenceScore is unavailable */
  const M5_WEIGHT_DEFAULT = 0.70;
  /** M5 confidence upgrade when both paths agree */
  const M5_WEIGHT_UPGRADE = 0.10;
  /** M5 confidence threshold for HIGH label */
  const M5_HIGH_THRESHOLD  = 0.75;
  /** M5 confidence threshold for MEDIUM label */
  const M5_MEDIUM_THRESHOLD = 0.55;

  let consensusSpeedKmh: number;
  let crossValidation: { agreement: boolean; spreadKmh: number; confidenceUpgraded: boolean } | null = null;
  if (pathA && pathB) {
    const spread = Math.abs(pathA.speedKmh - pathB.speedKmh);
    const avg = (pathA.speedKmh + pathB.speedKmh) / 2;
    const agreement = spread / Math.max(1, avg) <= M5_PATH_AGREEMENT_THRESHOLD;
    crossValidation = { agreement, spreadKmh: spread, confidenceUpgraded: agreement };
    // Weighted average: Path A gets M5_PATH_A_WEIGHT, Path B gets the remainder
    consensusSpeedKmh = Math.round(pathA.speedKmh * M5_PATH_A_WEIGHT + pathB.speedKmh * (1 - M5_PATH_A_WEIGHT));
  } else {
    consensusSpeedKmh = pathA?.speedKmh ?? pathB!.speedKmh;
  }

  // ── Dynamic confidence weight from visionConfidenceScore ─────────────────
  // Score 0–100 maps linearly from M5_WEIGHT_MIN to M5_WEIGHT_MAX.
  // Paths agreeing upgrades weight by M5_WEIGHT_UPGRADE.
  const baseWeight = visionConfidenceScore != null
    ? M5_WEIGHT_MIN + (Math.min(100, Math.max(0, visionConfidenceScore)) / 100) * M5_WEIGHT_RANGE
    : M5_WEIGHT_DEFAULT;
  const finalWeight = crossValidation?.confidenceUpgraded ? Math.min(M5_WEIGHT_MAX, baseWeight + M5_WEIGHT_UPGRADE) : baseWeight;
  const confidence = finalWeight >= M5_HIGH_THRESHOLD ? 'HIGH' : finalWeight >= M5_MEDIUM_THRESHOLD ? 'MEDIUM' : 'LOW';

  const basisParts: string[] = [];
  if (pathA) basisParts.push(`Path A (Campbell from vision): C=${(pathA.crushDepthM * 100).toFixed(1)} cm → ${pathA.speedKmh} km/h`);
  if (pathB) basisParts.push(`Path B (Energy, single-zone): E=${(pathB.deformationEnergyJ / 1000).toFixed(2)} kJ → ${pathB.speedKmh} km/h`);
  if (multiZoneDamage && !pathB) basisParts.push('Path B disabled: multi-zone damage (rollover/multi-impact) — total deformation energy is not primary impact energy');
  if (crossValidation) basisParts.push(crossValidation.agreement ? `✓ Paths agree (Δ${crossValidation.spreadKmh} km/h)` : `! Paths diverge (Δ${crossValidation.spreadKmh} km/h)`);

  return {
    method: 'VISION_DEFORMATION',
    label: 'M5 Vision Deformation (AI photo analysis)',
    speedKmh: consensusSpeedKmh,
    isLowerBoundOnly: false,
    confidenceWeight: parseFloat(finalWeight.toFixed(3)),
    confidence,
    basis: basisParts.join(' | '),
    ran: true,
    // Expose sub-paths for report display
    pathA: pathA ?? undefined,
    pathB: pathB ?? undefined,
    crossValidation: crossValidation ?? undefined,
  } as any;
}

// ── Weighted consensus ────────────────────────────────────────────────────────

function weightedConsensus(
  estimates: Array<{ speedKmh: number; weight: number }>,
): { mean: number; stdDev: number } {
  const totalWeight = estimates.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) return { mean: 0, stdDev: 0 };

  const mean = estimates.reduce((s, e) => s + e.speedKmh * e.weight, 0) / totalWeight;

  const variance = estimates.reduce((s, e) => {
    return s + e.weight * Math.pow(e.speedKmh - mean, 2);
  }, 0) / totalWeight;

  return { mean, stdDev: Math.sqrt(variance) };
}

// ── Main ensemble entry point ─────────────────────────────────────────────────

export interface EnsembleInput {
  /** Vehicle mass in kg */
  massKg: number;
  /** Vehicle body type (sedan, suv, truck, etc.) */
  bodyType: string | null | undefined;
  /** Collision direction (frontal, rear, side_driver, etc.) */
  collisionDirection: string | null | undefined;
  /** Crush depth from claim document (metres) — null if not stated */
  documentCrushDepthM: number | null | undefined;
  /** Crush depth inferred from damage severity (metres) — from inferCrushDepth() */
  inferredCrushDepthM: number;
  /** Crush depth extracted by vision LLM from photos (metres) — null if not available */
  visionCrushDepthM: number | null | undefined;
  /** Total damage area from Stage 6 (m²) — NOT used for physics (see M3 notes) */
  totalDamageAreaM2: number | null | undefined;
  /** Parts cost in USD (from RepairQuoteRecord) — NOT used for physics (M2 disabled) */
  partsCostUsd: number | null | undefined;
  /** Whether structural damage was detected */
  structuralDamage: boolean;
  /** Whether airbag deployment was recorded */
  airbagDeployment: boolean;
  /** Whether seatbelt pretensioner deployment was recorded */
  seatbeltPretensioner: boolean;
  /** Total deformation energy across all components from Stage 6 (Joules)
   *  Only used by M5 Path B when damage is single-zone (not rollover/multi-impact) */
  totalDeformationEnergyJ?: number | null;
  /** Average vision confidence score (0–100) from Stage 6 LLM measurements */
  visionConfidenceScore?: number | null;
  /** Number of distinct damage zones (from Stage 6). When > 2, M5 Path B is disabled. */
  damagedZoneCount?: number | null;
}

export function runSpeedInferenceEnsemble(input: EnsembleInput): SpeedInferenceResult {
  const {
    massKg, bodyType, collisionDirection,
    documentCrushDepthM, inferredCrushDepthM, visionCrushDepthM,
    totalDamageAreaM2, partsCostUsd,
    structuralDamage, airbagDeployment, seatbeltPretensioner,
  } = input;

  // Multi-zone damage check: if damage spans > 2 zones, M5 Path B is unreliable
  const multiZoneDamage = (input.damagedZoneCount ?? 1) > 2;

  // M1: Crush depth priority chain:
  //   1. Document-stated crush depth (explicit, highest defensibility) → HIGH confidence
  //   2. Vision-extracted crush depth (computer vision measurement)   → MEDIUM confidence
  //   3. Inferred crush depth (from damage severity — circular)       → LOW, excluded
  const m1HasDocument = !!(documentCrushDepthM && documentCrushDepthM >= 0.04);
  const m1HasVision   = !!(visionCrushDepthM && visionCrushDepthM >= 0.04);
  const m1CrushDepth  = m1HasDocument ? documentCrushDepthM!
                      : m1HasVision   ? visionCrushDepthM!
                      : inferredCrushDepthM;
  const m1DepthSource: 'document' | 'vision' | 'inferred' =
    m1HasDocument ? 'document' : m1HasVision ? 'vision' : 'inferred';
  const m1HasExplicit = m1HasDocument || m1HasVision; // kept for downstream compat

  // Run all five methods
  const m1 = runCampbell(m1CrushDepth, massKg, bodyType, collisionDirection, m1HasExplicit, m1DepthSource);
  const m2 = runEnergyMomentum(partsCostUsd ?? null, massKg, collisionDirection, airbagDeployment);
  const m3 = runImpulse(totalDamageAreaM2 ?? null, m1CrushDepth, massKg, collisionDirection);
  const m4 = runDeploymentThreshold(airbagDeployment, seatbeltPretensioner, collisionDirection);
  const m5 = runVisionDeformation(
    visionCrushDepthM ?? null, massKg, bodyType, collisionDirection, structuralDamage, airbagDeployment,
    input.totalDeformationEnergyJ ?? null,
    input.visionConfidenceScore ?? null,
    multiZoneDamage,
  );

  const methods: MethodEstimate[] = [m1, m2, m3, m4, m5];

  // Collect point estimates (exclude lower-bound-only methods and zero-weight methods from mean)
  const pointEstimates = methods.filter(m => m.ran && m.speedKmh !== null && !m.isLowerBoundOnly && m.confidenceWeight > 0) as Array<MethodEstimate & { speedKmh: number }>;

  // Hard lower bound from deployment thresholds
  const lowerBoundKmh = methods
    .filter(m => m.ran && m.isLowerBoundOnly && m.speedKmh !== null)
    .reduce((max, m) => Math.max(max, m.speedKmh!), 0) || null;

  if (pointEstimates.length === 0) {
    // No point estimates — return lower bound only if available
    return {
      consensusSpeedKmh: lowerBoundKmh,
      confidenceInterval: lowerBoundKmh ? [lowerBoundKmh, lowerBoundKmh * 1.5] : null,
      lowerBoundKmh,
      methods,
      overallConfidence: 'LOW',
      highDivergence: false,
      summary: lowerBoundKmh
        ? `Insufficient data for a point estimate. Deployment threshold confirms impact speed ≥ ${lowerBoundKmh} km/h. Document-stated crush depth or vehicle photos are required for a defensible speed estimate.`
        : 'Insufficient data to estimate impact speed from available evidence. Document-stated crush depth or vehicle damage photographs are required.',
      methodsRan: 0,
    };
  }

  // Initial consensus (before outlier rejection)
  const initial = weightedConsensus(pointEstimates.map(m => ({ speedKmh: m.speedKmh, weight: m.confidenceWeight })));

  // Outlier rejection: down-weight methods > 2σ from initial mean
  // CALIBRATION: 2σ outlier threshold and 0.5 down-weight factor are engineering-judgment values.
  // Do not change without benchmarking.
  /** Outlier rejection sigma multiplier: methods beyond this many stdDevs are down-weighted */
  const OUTLIER_SIGMA_THRESHOLD = 2;
  /** Factor by which outlier method weights are reduced */
  const OUTLIER_WEIGHT_FACTOR   = 0.5;

  const adjustedEstimates = pointEstimates.map(m => {
    const deviation = Math.abs(m.speedKmh - initial.mean);
    const weight = deviation > OUTLIER_SIGMA_THRESHOLD * initial.stdDev
      ? m.confidenceWeight * OUTLIER_WEIGHT_FACTOR
      : m.confidenceWeight;
    return { speedKmh: m.speedKmh, weight };
  });

  const consensus = weightedConsensus(adjustedEstimates);
  let consensusSpeedKmh = Math.round(consensus.mean);

  // Apply lower bound floor
  if (lowerBoundKmh && consensusSpeedKmh < lowerBoundKmh) {
    consensusSpeedKmh = lowerBoundKmh;
  }

  // 90% confidence interval (z = 1.645 for 90% CI)
  // Source: standard normal distribution z-score for 90% CI (published statistics).
  /** Z-score for 90% confidence interval (standard normal distribution) */
  const Z_90_CI = 1.645;
  const ciHalfWidth = consensus.stdDev * Z_90_CI;
  const confidenceInterval: [number, number] = [
    Math.max(0, Math.round(consensusSpeedKmh - ciHalfWidth)),
    Math.round(consensusSpeedKmh + ciHalfWidth),
  ];

  // Cross-validation: check for high divergence between any two estimates
  let highDivergence = false;
  let maxGapKmh = 0;
  let maxGapPair: [number, number] = [0, 0]; // indices into pointEstimates
  for (let i = 0; i < pointEstimates.length; i++) {
    for (let j = i + 1; j < pointEstimates.length; j++) {
      const a = pointEstimates[i].speedKmh;
      const b = pointEstimates[j].speedKmh;
      const maxVal = Math.max(a, b);
      const gap = Math.abs(a - b);
      // CALIBRATION: 40% divergence threshold is engineering-judgment.
      // Do not change without benchmarking.
      /** Divergence threshold: methods diverging by more than this fraction trigger HIGH_DIVERGENCE */
      const HIGH_DIVERGENCE_THRESHOLD = 0.40;
      if (maxVal > 0 && gap / maxVal > HIGH_DIVERGENCE_THRESHOLD) {
        highDivergence = true;
      }
      if (gap > maxGapKmh) {
        maxGapKmh = gap;
        maxGapPair = [i, j];
      }
    }
  }

  // Overall confidence: based on number of methods and their individual confidence
  const highConfidenceMethods = pointEstimates.filter(m => m.confidence === 'HIGH').length;
  const overallConfidence: MethodConfidence =
    highConfidenceMethods >= 2 ? 'HIGH' :
    pointEstimates.length >= 2 ? 'MEDIUM' : 'LOW';

  // Build summary
  const methodNames = pointEstimates.map(m => m.label).join(', ');
  const divergenceNote = highDivergence
    ? ' Note: methods show significant divergence — independent assessment recommended.'
    : '';
  const summary = `Consensus impact speed: ~${consensusSpeedKmh} km/h (90% CI: ${confidenceInterval[0]}–${confidenceInterval[1]} km/h) derived from ${pointEstimates.length} method${pointEstimates.length > 1 ? 's' : ''}: ${methodNames}.${divergenceNote}`;

  // Build divergence explanation when methods conflict
  const divergenceExplanation: SpeedInferenceResult['divergenceExplanation'] = [];
  if (highDivergence && pointEstimates.length >= 2) {
    const mA = pointEstimates[maxGapPair[0]];
    const mB = pointEstimates[maxGapPair[1]];
    const gapKmh = Math.round(Math.abs(mA.speedKmh - mB.speedKmh));
    const maxSpeed = Math.max(mA.speedKmh, mB.speedKmh);
    const gapPct = maxSpeed > 0 ? Math.round((gapKmh / maxSpeed) * 100) : 0;

    let keyInputDifference = `${mA.label} used: ${mA.basis}. ${mB.label} used: ${mB.basis}.`;
    let explanation = `${mA.label} estimated ${mA.speedKmh} km/h while ${mB.label} estimated ${mB.speedKmh} km/h — a ${gapPct}% gap (${gapKmh} km/h). `;

    if ((mA.method === 'CAMPBELL' || mA.method === 'VISION_DEFORMATION') &&
        (mB.method === 'CAMPBELL' || mB.method === 'VISION_DEFORMATION')) {
      explanation += `Both methods use crush depth but from different sources. `;
      explanation += `If the document-stated crush depth differs from the photo-measured depth, this indicates the damage documentation may not accurately reflect the physical deformation. `;
      explanation += `The photo-measured value (${mB.method === 'VISION_DEFORMATION' ? mB.speedKmh : mA.speedKmh} km/h) is typically more reliable for recent impacts.`;
      keyInputDifference = `Document crush depth vs photo-measured crush depth discrepancy.`;
    } else if (mA.method === 'DEPLOYMENT_THRESHOLD' || mB.method === 'DEPLOYMENT_THRESHOLD') {
      explanation += `The deployment threshold provides a hard lower bound (not a point estimate) based on airbag/pretensioner activation. `;
      explanation += `If the other method estimates a speed below the deployment threshold, the physical evidence (airbag deployed) overrides it.`;
      keyInputDifference = `Airbag/pretensioner deployment confirms speed exceeded the activation threshold.`;
    } else {
      explanation += `Review the key inputs for each method to identify the source of the discrepancy.`;
    }

    divergenceExplanation.push({
      methodPair: [mA.method, mB.method],
      speedsKmh: [mA.speedKmh, mB.speedKmh],
      gapKmh,
      gapPct,
      keyInputDifference,
      explanation,
      recommendedAction: gapPct >= 60
        ? 'Critical divergence — independent accident reconstruction specialist required before settlement.'
        : 'Significant divergence — senior assessor should review Section 2.6 method inputs and request additional evidence.',
    });
  }

  // Cross-validation spread summary
  const allSpeeds = pointEstimates.map(m => m.speedKmh);
  const spread = allSpeeds.length >= 2
    ? Math.round(Math.max(...allSpeeds) - Math.min(...allSpeeds))
    : 0;
  const outlierMethods = pointEstimates
    .filter(m => Math.abs(m.speedKmh - consensus.mean) > 2 * consensus.stdDev)
    .map(m => m.method);
  // CALIBRATION: spread <= 10 km/h for 'agree closely' is engineering-judgment.
  // Do not change without benchmarking.
  /** Spread threshold (km/h) below which methods are considered to agree closely */
  const SPREAD_CLOSE_THRESHOLD = 10;
  const crossValidation: SpeedInferenceResult['crossValidation'] = pointEstimates.length >= 2 ? {
    spread,
    outlierMethods,
    recommendation: highDivergence
      ? 'Methods diverge significantly — do not use consensus as sole basis for settlement.'
      : spread <= SPREAD_CLOSE_THRESHOLD
      ? 'Methods agree closely — consensus estimate is reliable.'
      : 'Methods show moderate spread — treat consensus as indicative, verify with physical inspection.',
  } : undefined;

  return {
    consensusSpeedKmh,
    confidenceInterval,
    lowerBoundKmh,
    methods,
    overallConfidence,
    highDivergence,
    summary,
    methodsRan: pointEstimates.length,
    divergenceExplanation: divergenceExplanation.length > 0 ? divergenceExplanation : undefined,
    crossValidation,
  };
}
