/**
 * stage-uncertainty.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * KINGA Uncertainty Propagation Engine — Wave 3
 *
 * PURPOSE
 * ───────
 * Propagates measurement uncertainty analytically through the full physics
 * calculation chain:
 *
 *   crush depth (mm) → Campbell speed (km/h) → kinetic energy (kJ)
 *                                             → delta-V (km/h)
 *                                             → deformation efficiency (%)
 *
 * Each output carries a 90% confidence interval derived from the input
 * uncertainties, using first-order error propagation (Taylor expansion).
 *
 * METHODOLOGY
 * ───────────
 * For a function f(x₁, x₂, ...) with independent inputs:
 *   σ_f² ≈ (∂f/∂x₁)² σ_x₁² + (∂f/∂x₂)² σ_x₂² + ...
 *
 * 90% CI: ±1.645 × σ_f (assuming approximately normal distribution)
 *
 * For the Campbell formula v = C × √(B/m):
 *   ∂v/∂C = √(B/m)
 *   σ_v = σ_C × √(B/m)
 *
 * For kinetic energy KE = ½mv²:
 *   ∂KE/∂v = mv
 *   σ_KE = mv × σ_v
 *
 * For delta-V from two-body collision:
 *   ΔV₁ = v × m₂/(m₁+m₂)
 *   σ_ΔV = σ_v × m₂/(m₁+m₂)
 */

import type { PhysicsTruth, PhysicsMeasurement, OptionalMeasurement } from './physicsTruth';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Campbell stiffness B coefficient (N/m²) — typical passenger car */
const CAMPBELL_B = 1_200_000;

/** Z-score for 90% confidence interval (one-sided 95%) */
const Z_90 = 1.645;

/** Default mass if not available (kg) */
const DEFAULT_MASS_KG = 1400;

/** Typical second-vehicle mass for delta-V calculation (kg) */
const DEFAULT_SECOND_VEHICLE_MASS_KG = 1400;

// ── Output types ──────────────────────────────────────────────────────────────

export interface PropagatedMeasurement {
  /** Point estimate */
  value: number;
  /** Lower bound of 90% CI */
  lower90: number;
  /** Upper bound of 90% CI */
  upper90: number;
  /** Standard deviation */
  sigma: number;
  /** Relative uncertainty (sigma / value) */
  relativeUncertainty: number;
  /** Human-readable CI string e.g. "45 km/h [38–52]" */
  formatted: string;
  /** Which inputs dominated the uncertainty budget */
  dominantUncertaintySources: string[];
}

export interface UncertaintyPropagationResult {
  /** Propagated speed from canonical crush depth via Campbell */
  campbellSpeed: PropagatedMeasurement | null;
  /** Propagated kinetic energy from ensemble speed */
  kineticEnergy: PropagatedMeasurement | null;
  /** Propagated delta-V from ensemble speed and vehicle masses */
  deltaV: PropagatedMeasurement | null;
  /** Propagated deformation efficiency */
  deformationEfficiency: PropagatedMeasurement | null;
  /** Overall uncertainty grade: A (tight), B (moderate), C (wide), D (very wide) */
  overallGrade: 'A' | 'B' | 'C' | 'D';
  /** Human-readable summary of the uncertainty budget */
  summary: string;
  /** Key uncertainty drivers */
  keyDrivers: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCI(value: number, lower: number, upper: number, unit: string): string {
  return `${value.toFixed(0)} ${unit} [${lower.toFixed(0)}–${upper.toFixed(0)}]`;
}

function relUncertainty(sigma: number, value: number): number {
  if (value === 0) return 1;
  return Math.abs(sigma / value);
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runUncertaintyPropagation(pt: PhysicsTruth): UncertaintyPropagationResult {
  const massKg = pt.vehicle.massKg ?? DEFAULT_MASS_KG;
  const crush = pt.geometry.crushDepth.canonical;
  const ensembleSpeed = pt.speed.canonical;

  const keyDrivers: string[] = [];

  // ── 1. Campbell speed from crush depth ────────────────────────────────────
  let campbellSpeed: PropagatedMeasurement | null = null;

  if (crush && crush.value > 0) {
    const C = crush.value; // metres
    // sigma_C from 90% CI: CI = ±1.645σ → σ = (max - min) / (2 × 1.645)
    const sigmaC = (crush.max - crush.min) / (2 * Z_90);

    // v = C × √(B/m)
    const sqrtBm = Math.sqrt(CAMPBELL_B / massKg);
    const v_ms = C * sqrtBm;
    const v_kmh = v_ms * 3.6;

    // ∂v/∂C = √(B/m)  →  σ_v_ms = σ_C × √(B/m)
    const sigma_v_ms = sigmaC * sqrtBm;
    const sigma_v_kmh = sigma_v_ms * 3.6;

    const lower = Math.max(0, v_kmh - Z_90 * sigma_v_kmh);
    const upper = v_kmh + Z_90 * sigma_v_kmh;

    const rel = relUncertainty(sigma_v_kmh, v_kmh);
    const dominantSources: string[] = [];
    if (crush.source === 'STAGE6_LLM_VISION') dominantSources.push('uncalibrated LLM crush depth estimate (±35%)');
    else if (crush.source === 'VGE_CALIBRATED') dominantSources.push('single-image VGE calibration uncertainty');
    else if (crush.source === 'VGR_CONSENSUS') dominantSources.push('multi-image VGR consensus spread');

    campbellSpeed = {
      value: v_kmh,
      lower90: lower,
      upper90: upper,
      sigma: sigma_v_kmh,
      relativeUncertainty: rel,
      formatted: formatCI(v_kmh, lower, upper, 'km/h'),
      dominantUncertaintySources: dominantSources,
    };

    if (rel > 0.25) keyDrivers.push(`Crush depth uncertainty (${(rel * 100).toFixed(0)}% relative) propagates directly to Campbell speed`);
  }

  // ── 2. Kinetic energy from ensemble speed ─────────────────────────────────
  let kineticEnergy: PropagatedMeasurement | null = null;

  if (ensembleSpeed && ensembleSpeed.value > 0) {
    const v_ms = ensembleSpeed.value / 3.6;
    const sigma_v_ms = ((ensembleSpeed.max - ensembleSpeed.min) / (2 * Z_90)) / 3.6;

    // KE = ½mv²
    const KE_J = 0.5 * massKg * v_ms * v_ms;

    // ∂KE/∂v = mv  →  σ_KE = mv × σ_v
    const sigma_KE = massKg * v_ms * sigma_v_ms;

    const lower = Math.max(0, KE_J - Z_90 * sigma_KE);
    const upper = KE_J + Z_90 * sigma_KE;
    const rel = relUncertainty(sigma_KE, KE_J);

    // KE uncertainty is 2× speed relative uncertainty (quadratic)
    const speedRel = relUncertainty(sigma_v_ms * 3.6, ensembleSpeed.value);

    kineticEnergy = {
      value: KE_J / 1000,  // kJ
      lower90: lower / 1000,
      upper90: upper / 1000,
      sigma: sigma_KE / 1000,
      relativeUncertainty: rel,
      formatted: formatCI(KE_J / 1000, lower / 1000, upper / 1000, 'kJ'),
      dominantUncertaintySources: [`Speed uncertainty (${(speedRel * 100).toFixed(0)}%) amplified quadratically in KE`],
    };

    if (rel > 0.4) keyDrivers.push(`Kinetic energy uncertainty is ${(rel * 100).toFixed(0)}% — speed uncertainty amplifies quadratically`);
  }

  // ── 3. Delta-V from ensemble speed ────────────────────────────────────────
  let deltaV: PropagatedMeasurement | null = null;

  if (ensembleSpeed && ensembleSpeed.value > 0) {
    const v = ensembleSpeed.value; // km/h
    const sigma_v = (ensembleSpeed.max - ensembleSpeed.min) / (2 * Z_90);

    // ΔV₁ = v × m₂/(m₁+m₂)
    const m2 = DEFAULT_SECOND_VEHICLE_MASS_KG;
    const massRatio = m2 / (massKg + m2);
    const dv = v * massRatio;
    const sigma_dv = sigma_v * massRatio;

    const lower = Math.max(0, dv - Z_90 * sigma_dv);
    const upper = dv + Z_90 * sigma_dv;
    const rel = relUncertainty(sigma_dv, dv);

    deltaV = {
      value: dv,
      lower90: lower,
      upper90: upper,
      sigma: sigma_dv,
      relativeUncertainty: rel,
      formatted: formatCI(dv, lower, upper, 'km/h'),
      dominantUncertaintySources: [`Speed uncertainty propagates linearly to delta-V (mass ratio: ${massRatio.toFixed(2)})`],
    };
  }

  // ── 4. Deformation efficiency ─────────────────────────────────────────────
  let deformationEfficiency: PropagatedMeasurement | null = null;

  const deformJ = pt.energy.totalDeformationEnergyJ;
  const kineticJ = pt.energy.kineticEnergyJ;

  if (deformJ && kineticJ && kineticJ.value > 0) {
    const D = deformJ.value * 1000; // back to J
    const K = kineticJ.value * 1000;
    const eta = D / K;

    // σ_eta² = (1/K)² σ_D² + (D/K²)² σ_K²
    const sigmaD = (deformJ.max - deformJ.min) * 1000 / (2 * Z_90);
    const sigmaK = kineticEnergy
      ? kineticEnergy.sigma * 1000
      : K * 0.3; // fallback 30% if no propagated KE

    const sigma_eta = Math.sqrt(
      Math.pow(sigmaD / K, 2) +
      Math.pow(D * sigmaK / (K * K), 2)
    );

    const lower = Math.max(0, (eta - Z_90 * sigma_eta) * 100);
    const upper = Math.min(100, (eta + Z_90 * sigma_eta) * 100);
    const rel = relUncertainty(sigma_eta, eta);

    deformationEfficiency = {
      value: eta * 100,
      lower90: lower,
      upper90: upper,
      sigma: sigma_eta * 100,
      relativeUncertainty: rel,
      formatted: `${(eta * 100).toFixed(0)}% [${lower.toFixed(0)}–${upper.toFixed(0)}%]`,
      dominantUncertaintySources: ['Deformation energy estimate uncertainty (±30%)', 'Kinetic energy uncertainty'],
    };
  }

  // ── Overall grade ─────────────────────────────────────────────────────────
  // Grade based on the canonical speed relative uncertainty
  const speedRel = ensembleSpeed
    ? relUncertainty((ensembleSpeed.max - ensembleSpeed.min) / (2 * Z_90), ensembleSpeed.value)
    : 1.0;

  let overallGrade: 'A' | 'B' | 'C' | 'D';
  if (speedRel < 0.10) overallGrade = 'A';
  else if (speedRel < 0.20) overallGrade = 'B';
  else if (speedRel < 0.35) overallGrade = 'C';
  else overallGrade = 'D';

  const gradeDescriptions: Record<string, string> = {
    A: 'Tight uncertainty — photogrammetric calibration from multiple images. Speed estimate is precise to ±10%.',
    B: 'Moderate uncertainty — calibrated measurement from at least one image. Speed estimate is precise to ±20%.',
    C: 'Wide uncertainty — limited calibration data. Speed estimate has ±35% uncertainty. Additional photos recommended.',
    D: 'Very wide uncertainty — no photogrammetric calibration. Speed estimate relies on severity inference only. Physical inspection strongly recommended.',
  };

  const summary = gradeDescriptions[overallGrade];

  return {
    campbellSpeed,
    kineticEnergy,
    deltaV,
    deformationEfficiency,
    overallGrade,
    summary,
    keyDrivers,
  };
}
