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
 *      Confidence: HIGH when crush depth is explicit; MEDIUM when inferred
 *
 * M2 — Energy-Momentum Balance (repair cost → deformation energy → speed)
 *      V = √(2 × E_deform / m)  where E_deform ≈ partsCost × energyFactor
 *      Source: NHTSA repair cost / energy correlation (Strother et al. 1986)
 *      Confidence: MEDIUM (repair cost is a proxy, not a direct measurement)
 *
 * M3 — Impulse-Momentum (damage area × contact force → speed)
 *      V = F × Δt / m  where Δt = 2C / V (iterative)
 *      Source: SAE 930899 — Impulse-momentum method for low-speed impacts
 *      Confidence: MEDIUM when damage area is available; LOW otherwise
 *
 * M4 — Deployment Threshold (airbag / seatbelt pretensioner hard bounds)
 *      Airbag deployment → V ≥ 20 km/h (FMVSS 208 threshold: 20–30 km/h)
 *      Seatbelt pretensioner → V ≥ 15 km/h
 *      Source: FMVSS 208, Euro NCAP frontal test protocols
 *      Confidence: HIGH as a lower bound; provides a hard floor only
 *
 * M5 — Computer Vision Deformation Estimate (vision-extracted crush depth)
 *      Same Campbell formula as M1 but using the crush depth extracted by
 *      the vision LLM from the damage photos, rather than the document value.
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
}

// ── Vehicle stiffness table (kN/m) ───────────────────────────────────────────
// Based on NHTSA crash test data and Campbell (1974) stiffness coefficients.
// Values represent the structural stiffness of the primary impact zone.

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

// ── Energy-to-repair-cost correlation ────────────────────────────────────────
// Empirical correlation from Strother et al. (1986) SAE 860924:
//   Parts cost in USD ≈ 0.003 × deformation energy in Joules (2024 USD adjusted)
// Inverted: E_deform (J) ≈ partsCostUsd / 0.003
// This is a rough proxy — confidence is MEDIUM.

const PARTS_COST_TO_ENERGY_FACTOR = 1 / 0.003; // J per USD

// ── M1: Campbell's Stiffness Formula ─────────────────────────────────────────

function runCampbell(
  crushDepthM: number,
  massKg: number,
  bodyType: string | null | undefined,
  collisionDirection: string | null | undefined,
  structuralDamage: boolean,
  airbagDeployment: boolean,
  isExplicitDepth: boolean,
): MethodEstimate {
  if (crushDepthM <= 0 || massKg <= 0) {
    return {
      method: 'CAMPBELL', label: "Campbell's formula (crush depth)",
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'Insufficient data: crush depth or mass missing',
      ran: false,
    };
  }

  const stiffnessNm = getStiffnessKnm(bodyType) * 1000; // kN/m → N/m
  const energyJ = 0.5 * stiffnessNm * Math.pow(crushDepthM, 2);
  let speedMs = Math.sqrt((2 * energyJ) / massKg);
  let speedKmh = speedMs * 3.6;

  // Apply accident-type multiplier
  speedKmh *= getAccidentMultiplier(collisionDirection);

  // Structural damage correction: structural deformation absorbs more energy
  if (structuralDamage) speedKmh *= 1.12;

  // Airbag floor
  if (airbagDeployment) speedKmh = Math.max(speedKmh, 22);

  speedKmh = Math.round(speedKmh);

  const confidence: MethodConfidence = isExplicitDepth ? 'HIGH' : 'MEDIUM';
  const weight = isExplicitDepth ? 0.90 : 0.60;

  return {
    method: 'CAMPBELL',
    label: "Campbell's stiffness formula",
    speedKmh,
    isLowerBoundOnly: false,
    confidenceWeight: weight,
    confidence,
    basis: `Crush depth: ${(crushDepthM * 100).toFixed(1)} cm (${isExplicitDepth ? 'document-stated' : 'inferred from damage severity'}), stiffness: ${getStiffnessKnm(bodyType)} kN/m, mass: ${massKg} kg`,
    ran: true,
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

// ── M3: Impulse-Momentum (damage area × contact pressure) ────────────────────

function runImpulse(
  totalDamageAreaM2: number | null,
  crushDepthM: number,
  massKg: number,
  collisionDirection: string | null | undefined,
): MethodEstimate {
  if (!totalDamageAreaM2 || totalDamageAreaM2 <= 0 || crushDepthM <= 0 || massKg <= 0) {
    return {
      method: 'IMPULSE', label: 'Impulse-momentum method (damage area)',
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'Insufficient data: damage area or crush depth missing',
      ran: false,
    };
  }

  // Contact pressure for vehicle body panels: ~2–8 MPa depending on material
  // Use 4 MPa as a central estimate (SAE 930899)
  const contactPressurePa = 4e6;
  const contactForceN = contactPressurePa * totalDamageAreaM2;

  // Contact duration: Δt = 2C / V (iterative — use initial estimate)
  // Start with a rough speed estimate from energy: V₀ = √(F×C/m × 2)
  const roughSpeedMs = Math.sqrt((contactForceN * crushDepthM) / massKg);
  const contactDurationS = (2 * crushDepthM) / Math.max(roughSpeedMs, 1);

  // Impulse = F × Δt = m × ΔV
  const deltaVMs = (contactForceN * contactDurationS) / massKg;
  let speedKmh = deltaVMs * 3.6;

  speedKmh *= getAccidentMultiplier(collisionDirection);
  speedKmh = Math.round(speedKmh);

  return {
    method: 'IMPULSE',
    label: 'Impulse-momentum method (damage area)',
    speedKmh,
    isLowerBoundOnly: false,
    confidenceWeight: 0.40,
    confidence: 'MEDIUM',
    basis: `Damage area: ${totalDamageAreaM2.toFixed(3)} m², contact pressure: 4 MPa (SAE 930899), crush depth: ${(crushDepthM * 100).toFixed(1)} cm`,
    ran: true,
  };
}

// ── M4: Deployment Threshold (hard lower bound) ───────────────────────────────

function runDeploymentThreshold(
  airbagDeployment: boolean,
  seatbeltPretensioner: boolean,
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

  // FMVSS 208: frontal airbags deploy at 20–30 km/h equivalent barrier speed
  // Side airbags: 15–25 km/h. Use conservative lower bound.
  const lowerBoundKmh = airbagDeployment ? 20 : 15;
  const typicalKmh = airbagDeployment ? 28 : 18;

  return {
    method: 'DEPLOYMENT_THRESHOLD',
    label: 'Deployment threshold (FMVSS 208 / Euro NCAP)',
    speedKmh: typicalKmh,
    isLowerBoundOnly: true,
    confidenceWeight: 0.70, // High confidence as a floor
    confidence: 'HIGH',
    basis: airbagDeployment
      ? 'Airbag deployment confirmed — FMVSS 208 threshold: ≥ 20 km/h (frontal). Typical deployment: 25–35 km/h.'
      : 'Seatbelt pretensioner deployment — typical activation: ≥ 15 km/h.',
    ran: true,
  };
}

// ── M5: Vision Deformation Estimate ──────────────────────────────────────────

function runVisionDeformation(
  visionCrushDepthM: number | null,
  massKg: number,
  bodyType: string | null | undefined,
  collisionDirection: string | null | undefined,
  structuralDamage: boolean,
  airbagDeployment: boolean,
  totalDeformationEnergyJ: number | null,
  visionConfidenceScore: number | null,
): MethodEstimate {
  const hasCrush = visionCrushDepthM != null && visionCrushDepthM > 0;
  const hasEnergy = totalDeformationEnergyJ != null && totalDeformationEnergyJ > 0;

  if (!hasCrush && !hasEnergy) {
    return {
      method: 'VISION_DEFORMATION', label: 'M5 Vision Deformation',
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'No vision-extracted crush depth or deformation energy available',
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
    if (structuralDamage) speedKmh *= 1.12;
    if (airbagDeployment) speedKmh = Math.max(speedKmh, 22);
    pathA = { crushDepthM: visionCrushDepthM!, speedKmh: Math.round(speedKmh) };
  }

  // ── Path B: Energy balance v = sqrt(2E/m) from total deformation energy ───
  let pathB: { deformationEnergyJ: number; speedKmh: number } | null = null;
  if (hasEnergy) {
    let speedMs = Math.sqrt((2 * totalDeformationEnergyJ!) / massKg);
    let speedKmh = speedMs * 3.6 * dirMultiplier;
    if (structuralDamage) speedKmh *= 1.12;
    if (airbagDeployment) speedKmh = Math.max(speedKmh, 22);
    pathB = { deformationEnergyJ: totalDeformationEnergyJ!, speedKmh: Math.round(speedKmh) };
  }

  // ── Cross-validation: do both paths agree within 20%? ─────────────────────
  let consensusSpeedKmh: number;
  let crossValidation: { agreement: boolean; spreadKmh: number; confidenceUpgraded: boolean } | null = null;
  if (pathA && pathB) {
    const spread = Math.abs(pathA.speedKmh - pathB.speedKmh);
    const avg = (pathA.speedKmh + pathB.speedKmh) / 2;
    const agreement = spread / Math.max(1, avg) <= 0.20;
    crossValidation = { agreement, spreadKmh: spread, confidenceUpgraded: agreement };
    // Weighted average: Path A gets 60%, Path B gets 40%
    consensusSpeedKmh = Math.round(pathA.speedKmh * 0.6 + pathB.speedKmh * 0.4);
  } else {
    consensusSpeedKmh = pathA?.speedKmh ?? pathB!.speedKmh;
  }

  // ── Dynamic confidence weight from visionConfidenceScore ─────────────────
  // Score 0–100 maps to weight 0.30–0.90. Paths agreeing upgrades by +0.10.
  const baseWeight = visionConfidenceScore != null
    ? 0.30 + (Math.min(100, Math.max(0, visionConfidenceScore)) / 100) * 0.60
    : 0.70;
  const finalWeight = crossValidation?.confidenceUpgraded ? Math.min(0.90, baseWeight + 0.10) : baseWeight;
  const confidence = finalWeight >= 0.75 ? 'HIGH' : finalWeight >= 0.55 ? 'MEDIUM' : 'LOW';

  const basisParts: string[] = [];
  if (pathA) basisParts.push(`Path A (Campbell): C=${(pathA.crushDepthM * 100).toFixed(1)} cm → ${pathA.speedKmh} km/h`);
  if (pathB) basisParts.push(`Path B (Energy): E=${(pathB.deformationEnergyJ / 1000).toFixed(2)} kJ → ${pathB.speedKmh} km/h`);
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
  /** Total damage area from Stage 6 (m²) */
  totalDamageAreaM2: number | null | undefined;
  /** Parts cost in USD (from RepairQuoteRecord) */
  partsCostUsd: number | null | undefined;
  /** Whether structural damage was detected */
  structuralDamage: boolean;
  /** Whether airbag deployment was recorded */
  airbagDeployment: boolean;
  /** Whether seatbelt pretensioner deployment was recorded */
  seatbeltPretensioner: boolean;
  /** Total deformation energy across all components from Stage 6 (Joules) */
  totalDeformationEnergyJ?: number | null;
  /** Average vision confidence score (0–100) from Stage 6 LLM measurements */
  visionConfidenceScore?: number | null;
}

export function runSpeedInferenceEnsemble(input: EnsembleInput): SpeedInferenceResult {
  const {
    massKg, bodyType, collisionDirection,
    documentCrushDepthM, inferredCrushDepthM, visionCrushDepthM,
    totalDamageAreaM2, partsCostUsd,
    structuralDamage, airbagDeployment, seatbeltPretensioner,
  } = input;

  // Choose crush depth for M1: prefer document value, fall back to inferred
  const m1CrushDepth = (documentCrushDepthM && documentCrushDepthM >= 0.04)
    ? documentCrushDepthM
    : inferredCrushDepthM;
  const m1IsExplicit = !!(documentCrushDepthM && documentCrushDepthM >= 0.04);

  // Run all five methods
  const m1 = runCampbell(m1CrushDepth, massKg, bodyType, collisionDirection, structuralDamage, airbagDeployment, m1IsExplicit);
  const m2 = runEnergyMomentum(partsCostUsd ?? null, massKg, collisionDirection, airbagDeployment);
  const m3 = runImpulse(totalDamageAreaM2 ?? null, m1CrushDepth, massKg, collisionDirection);
  const m4 = runDeploymentThreshold(airbagDeployment, seatbeltPretensioner);
  const m5 = runVisionDeformation(
    visionCrushDepthM ?? null, massKg, bodyType, collisionDirection, structuralDamage, airbagDeployment,
    input.totalDeformationEnergyJ ?? null,
    input.visionConfidenceScore ?? null,
  );

  const methods: MethodEstimate[] = [m1, m2, m3, m4, m5];

  // Collect point estimates (exclude lower-bound-only methods from mean)
  const pointEstimates = methods.filter(m => m.ran && m.speedKmh !== null && !m.isLowerBoundOnly) as Array<MethodEstimate & { speedKmh: number }>;

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
        ? `Insufficient data for a point estimate. Deployment threshold confirms impact speed ≥ ${lowerBoundKmh} km/h.`
        : 'Insufficient data to estimate impact speed from available evidence.',
      methodsRan: 0,
    };
  }

  // Initial consensus (before outlier rejection)
  const initial = weightedConsensus(pointEstimates.map(m => ({ speedKmh: m.speedKmh, weight: m.confidenceWeight })));

  // Outlier rejection: down-weight methods > 2σ from initial mean
  const adjustedEstimates = pointEstimates.map(m => {
    const deviation = Math.abs(m.speedKmh - initial.mean);
    const weight = deviation > 2 * initial.stdDev ? m.confidenceWeight * 0.5 : m.confidenceWeight;
    return { speedKmh: m.speedKmh, weight };
  });

  const consensus = weightedConsensus(adjustedEstimates);
  let consensusSpeedKmh = Math.round(consensus.mean);

  // Apply lower bound floor
  if (lowerBoundKmh && consensusSpeedKmh < lowerBoundKmh) {
    consensusSpeedKmh = lowerBoundKmh;
  }

  // 90% confidence interval (z = 1.645 for 90% CI)
  const ciHalfWidth = consensus.stdDev * 1.645;
  const confidenceInterval: [number, number] = [
    Math.max(0, Math.round(consensusSpeedKmh - ciHalfWidth)),
    Math.round(consensusSpeedKmh + ciHalfWidth),
  ];

  // Cross-validation: check for high divergence between any two estimates
  let highDivergence = false;
  for (let i = 0; i < pointEstimates.length; i++) {
    for (let j = i + 1; j < pointEstimates.length; j++) {
      const a = pointEstimates[i].speedKmh;
      const b = pointEstimates[j].speedKmh;
      const maxVal = Math.max(a, b);
      if (maxVal > 0 && Math.abs(a - b) / maxVal > 0.40) {
        highDivergence = true;
        break;
      }
    }
    if (highDivergence) break;
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

  return {
    consensusSpeedKmh,
    confidenceInterval,
    lowerBoundKmh,
    methods,
    overallConfidence,
    highDivergence,
    summary,
    methodsRan: pointEstimates.length,
  };
}
