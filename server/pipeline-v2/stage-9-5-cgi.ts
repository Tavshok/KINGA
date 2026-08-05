/**
 * pipeline-v2/stage-9-5-cgi.ts
 *
 * STAGE 9.5 — CONTACT GEOMETRY INTELLIGENCE (CGI)
 *
 * Runs after the Stage 8 ‖ Stage 9 parallel block resolves and before Stage 10
 * (Report Generation). Consumes outputs from Stages 6, 6.5A, 6.5B, 7, 8, and 9
 * to produce a three-layer forensic geometry assessment.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *   Layer 1 — Geometry Indicators (7 indicators, pure arithmetic)
 *     Computes contact patch ratio, bumper height compatibility, overlap
 *     fraction, crush depth consistency, damage fraction vs. severity,
 *     multi-image crush depth convergence, and structural zone penetration.
 *     All inputs come from Stage 6, 6.5A, 6.5B, and the vehicle geometry DB.
 *
 *   Layer 2 — Structural Intelligence (5 indicators)
 *     Force density index, energy absorption efficiency, stiffness-adjusted
 *     severity, latent damage probability uplift, and load path coherence.
 *     Inputs from Stage 7 (physics, stiffness coefficients, latent damage).
 *
 *   Layer 3 — Forensic Conclusions
 *     Synthesises all 12 indicators into a CGI verdict, hidden damage
 *     probability (for cost engine integration), and a human-readable
 *     forensic geometry narrative.
 *
 * ── Design Principles ────────────────────────────────────────────────────────
 *
 *   1. NEVER halts the pipeline. All errors return a degraded result with
 *      available=false. Stage 10 proceeds regardless.
 *
 *   2. All calculations are pure arithmetic — no LLM calls, no DB writes,
 *      no network requests. Runtime target: < 5 ms.
 *
 *   3. Conservative thresholds in v1.1. Indicators are calibrated against
 *      IIHS and Euro NCAP published test protocols where available. Thresholds
 *      will be updated in v1.2 using production claim data.
 *
 *   4. Anti-circularity: Layer 2 stiffness calculations use the Stage 7
 *      physics engine's A/B coefficients (from the vehicle class lookup),
 *      not a speed-derived value. CGI does not feed back into Stage 7.
 *
 *   5. Fail-closed on Layer 2: if Stage 7 physics was skipped or estimated
 *      fallback, Layer 2 structural indicators are marked as unavailable
 *      rather than producing unreliable outputs.
 *
 * ── Integration Points ───────────────────────────────────────────────────────
 *
 *   → Stage 9 (cost engine): hiddenDamageProbabilityOverride replaces the
 *     fixed severity-class lookup when CGI confidence ≥ 0.6.
 *
 *   → Stage 10 (report): cgiSection is rendered as Section 2B in the
 *     Forensic Audit Report and as a summary block in the Claims Intelligence
 *     Report.
 *
 *   → Stage 8 (fraud): contactGeometryFlag is injected as a FraudIndicator
 *     when verdict is INCOHERENT or ANOMALOUS.
 *
 * ── References ───────────────────────────────────────────────────────────────
 *
 *   Campbell, K.L. (1974). Energy Basis for Collision Severity. SAE 740565.
 *   IIHS (2012). Small Overlap Frontal Crashworthiness Evaluation Protocol.
 *   Euro NCAP (2022). Frontal Impact Testing Protocol v9.2.
 *   Varat, M.S. & Husher, S.E. (2002). Vehicle Impact Response Analysis
 *     through the Use of Accelerometer Data. SAE 2002-01-0547.
 *
 * ── TDR Reference ────────────────────────────────────────────────────────────
 *
 *   TDR-001: M3 Retirement and CGI Architecture
 *   Author: Tavonga Shoko (Lead Engineer)
 *   Date: 2026-08-05
 */

import type { Stage6Output, Stage7Output, Stage8Output, Stage9Output, ClaimRecord } from './types';
import type { VGECalibrationResult } from './stage-6-5a-vge';
import type { VGRConsensusResult } from './stage-6-5b-vgr';
import { getPanelAreaM2, inferBodyType } from './vehiclePanelDimensions';
import type { VehicleBodyType } from './vehiclePanelDimensions';

// ── Output types ──────────────────────────────────────────────────────────────

export type CGIVerdict =
  | 'COHERENT'      // All indicators consistent — geometry supports the claim
  | 'MINOR_ANOMALY' // 1–2 low-severity indicators — note in report, no fraud signal
  | 'ANOMALOUS'     // 3+ indicators or 1 high-severity — concern, soft fraud signal
  | 'INCOHERENT';   // Critical geometric impossibility — hard fraud signal

export type CGIIndicatorStatus =
  | 'PASS'          // Within expected range
  | 'ADVISORY'      // Borderline — note but do not penalise
  | 'CONCERN'       // Outside expected range — contributes to verdict
  | 'FLAG'          // Significant deviation — strong contribution to verdict
  | 'UNAVAILABLE';  // Required input was absent — not counted in verdict

/**
 * Indicator availability tier.
 *
 * CORE        — Expected to be available in >90% of applicable claims.
 *               Depends only on Stage 6 damage parts, Stage 7 physics, and
 *               collision direction — all of which are present whenever the
 *               pipeline completes normally.
 *
 * CONDITIONAL — Only relevant for specific collision scenarios or when the
 *               counterpart vehicle type is known. Will legitimately be
 *               UNAVAILABLE for many claims (e.g. single-vehicle incidents,
 *               side impacts, claims without counterpart data).
 *
 * ADVANCED    — Requires richer evidence that is not always available:
 *               VGR consensus crush depth (needs ≥1 calibrated image) or
 *               multi-image VGR (needs ≥2 calibrated images).
 */
export type CGIIndicatorTier = 'CORE' | 'CONDITIONAL' | 'ADVANCED';

export interface CGIIndicator {
  id: string;
  name: string;
  layer: 1 | 2;
  /**
   * Availability tier — see CGIIndicatorTier for definitions.
   * Used by the report to show a structured availability summary rather than
   * a flat list of UNAVAILABLE entries.
   */
  tier: CGIIndicatorTier;
  status: CGIIndicatorStatus;
  /** Computed value (null when UNAVAILABLE) */
  value: number | null;
  /** Expected range [min, max] — null when UNAVAILABLE */
  expectedRange: [number, number] | null;
  /** Human-readable explanation of the finding */
  explanation: string;
  /** Data sources used to compute this indicator */
  sources: string[];
}

export interface CGIForensicConclusion {
  /** Overall geometry coherence verdict */
  verdict: CGIVerdict;
  /** Confidence in the verdict (0–1) — lower when many inputs are UNAVAILABLE */
  confidence: number;
  /** Hidden damage probability override for Stage 9 cost engine (0–1) */
  hiddenDamageProbabilityOverride: number | null;
  /**
   * Whether to inject a fraud indicator into Stage 8.
   * True when verdict is INCOHERENT or ANOMALOUS.
   */
  injectFraudIndicator: boolean;
  /** Fraud indicator score to inject (0–100) — 0 when injectFraudIndicator=false */
  fraudIndicatorScore: number;
  /** Human-readable forensic geometry narrative for the report */
  narrative: string;
  /** One-line summary for the report header */
  summary: string;
}

/**
 * Availability summary broken down by tier.
 * Enables the report to show:
 *   "7/7 Core indicators evaluated"
 *   "3/5 Conditional indicators evaluated"
 *   "0/2 Advanced indicators evaluated (insufficient evidence)"
 * instead of a flat list of UNAVAILABLE entries.
 */
export interface CGIAvailabilitySummary {
  core:        { available: number; total: number };
  conditional: { available: number; total: number };
  advanced:    { available: number; total: number };
}

export interface Stage9_5Output {
  /** Whether CGI ran successfully */
  available: boolean;
  /** Reason for unavailability (null when available=true) */
  unavailableReason: string | null;
  /** Layer 1 indicators (geometry) */
  layer1Indicators: CGIIndicator[];
  /** Layer 2 indicators (structural) */
  layer2Indicators: CGIIndicator[];
  /** Layer 3 forensic conclusions */
  conclusion: CGIForensicConclusion;
  /** All 12 indicators in order for report rendering */
  allIndicators: CGIIndicator[];
  /** Per-tier availability counts for the report header */
  availabilitySummary: CGIAvailabilitySummary;
  /** CGI engine version */
  engineVersion: string;
  /** Milliseconds taken to run */
  runtimeMs: number;
}

export interface CGIInput {
  claimRecord: ClaimRecord;
  stage6Data: Stage6Output;
  stage7Data: Stage7Output;
  stage8Data: Stage8Output;
  stage9Data: Stage9Output;
  vgeResult: VGECalibrationResult | null;
  vgrResult: VGRConsensusResult | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CGI_ENGINE_VERSION = '1.2.0';

/**
 * Minimum contact patch ratio by collision direction.
 * Source: IIHS and Euro NCAP frontal impact test protocols.
 * Full-width frontal: ≥ 60% of bumper face width engaged.
 * 40% offset: ≥ 30% of bumper face width engaged.
 * Side: ≥ 20% of door panel width engaged.
 * Rear: ≥ 50% of rear bumper face width engaged.
 */
const MIN_CPR_BY_DIRECTION: Record<string, number> = {
  front_centre:      0.60,
  front_offset_40:   0.30,
  front_offset_25:   0.20,
  rear_centre:       0.50,
  rear_offset:       0.30,
  side_driver:       0.20,
  side_passenger:    0.20,
  rollover:          0.10,
  multi_impact:      0.10,
  unknown:           0.10,
};

/**
 * Conservative margin applied to CPR thresholds in v1.1.
 * Will be calibrated against production data in v1.2.
 * A margin of 0.10 means the indicator only fires when CPR is more than
 * 10 percentage points below the minimum — avoiding false positives.
 */
const CPR_CONSERVATIVE_MARGIN_V1 = 0.10;

/**
 * Maximum acceptable bumper height mismatch (mm) before flagging.
 * Source: RCAR (Research Council for Automobile Repairs) bumper
 * compatibility guidelines — mismatches > 100 mm indicate underride/override risk.
 */
const MAX_BUMPER_HEIGHT_MISMATCH_MM = 100;

/**
 * Crush depth consistency tolerance.
 * If the VGR consensus crush depth differs from the Stage 7 physics-derived
 * crush depth by more than this fraction, flag as inconsistent.
 */
const CRUSH_DEPTH_CONSISTENCY_TOLERANCE = 0.35; // 35%

/**
 * Multi-image crush depth convergence threshold.
 * If the coefficient of variation (CV) of per-image crush depths exceeds
 * this value, the images are inconsistent with each other.
 */
const CRUSH_DEPTH_CV_FLAG_THRESHOLD = 0.40; // 40% CV

/**
 * Force density thresholds (kN/m²).
 * Below MIN: impact force too low for stated damage severity.
 * Above MAX: impact force exceeds structural yield — structural damage certain.
 * Source: Campbell (1974) and NHTSA NCAP barrier force data.
 */
const FORCE_DENSITY_MIN_KN_M2 = 200;
const FORCE_DENSITY_MAX_KN_M2 = 2500;

/**
 * Energy absorption efficiency range.
 * Ratio of energy dissipated to kinetic energy at impact.
 * Below MIN: energy not absorbed — suggests pre-existing damage or low-speed staging.
 * Above MAX: energy exceeds kinetic — physically impossible.
 */
const ENERGY_EFFICIENCY_MIN = 0.30;
const ENERGY_EFFICIENCY_MAX = 0.95;

// ── Layer 1: Geometry Indicators ─────────────────────────────────────────────

/**
 * L1-01: Contact Patch Ratio (CPR)
 *
 * Observed contact patch area / expected minimum contact patch area.
 * Uses damageFractionEstimate from Stage 6 and bumper dimensions from the
 * vehicle geometry database via vehiclePanelDimensions.getPanelAreaM2.
 *
 * A ratio < (minCPR - conservativeMargin) indicates the observed damage
 * area is inconsistent with the stated collision direction.
 */
function computeL1_01_ContactPatchRatio(
  stage6Data: Stage6Output,
  claimRecord: ClaimRecord,
): CGIIndicator {
  const id = 'L1-01';
  const name = 'Contact Patch Ratio';
  const sources = ['Stage 6 damagedParts.damageFractionEstimate', 'vehiclePanelDimensions.PANEL_AREAS', 'claimRecord.accidentDetails.collisionDirection'];

  const direction = (claimRecord.accidentDetails?.collisionDirection ?? 'unknown').toLowerCase();
  const bodyType = (claimRecord.vehicle?.bodyType ?? 'sedan') as string;

  // Identify the primary impact panel from collision direction
  const primaryPanelKey = getPrimaryPanelKey(direction);
  const TIER: CGIIndicatorTier = 'CORE';

  if (!primaryPanelKey) {
    return unavailable(id, name, 1, 'Cannot determine primary impact panel from collision direction', sources, TIER);
  }

  // Get the total area of the primary panel
  const totalPanelAreaM2 = getPanelAreaM2(bodyType as VehicleBodyType, primaryPanelKey);
  if (!totalPanelAreaM2 || totalPanelAreaM2 <= 0) {
    return unavailable(id, name, 1, `No panel area data for panel=${primaryPanelKey}, bodyType=${bodyType}`, sources, TIER);
  }

  // Get the damage fraction for the primary panel from Stage 6
  const primaryPart = stage6Data.damagedParts?.find(
    p => normalisePanelName(p.name ?? '') === primaryPanelKey
  );
  const damageFraction = primaryPart?.damageFractionEstimate ?? null;

  if (damageFraction === null || damageFraction === undefined) {
    return unavailable(id, name, 1, `No damageFractionEstimate for primary panel (${primaryPanelKey})`, sources, TIER);
  }

  // Observed contact patch area = total panel area × damage fraction
  const observedContactPatchM2 = totalPanelAreaM2 * damageFraction;

  // Expected minimum contact patch area = total panel area × minCPR
  const minCPR = MIN_CPR_BY_DIRECTION[direction] ?? MIN_CPR_BY_DIRECTION['unknown'];
  const effectiveMinCPR = Math.max(0, minCPR - CPR_CONSERVATIVE_MARGIN_V1);
  const expectedMinContactPatchM2 = totalPanelAreaM2 * effectiveMinCPR;

  // CPR = observed / (total × minCPR) — ratio of 1.0 means exactly at minimum
  const cpr = expectedMinContactPatchM2 > 0
    ? observedContactPatchM2 / expectedMinContactPatchM2
    : 1.0;

  const expectedRange: [number, number] = [effectiveMinCPR, 1.0];

  if (cpr < 0.5) {
    return indicator(id, name, 1, 'FLAG', cpr, expectedRange,
      `Contact patch ratio ${(cpr * 100).toFixed(0)}% — observed damage area (${(observedContactPatchM2 * 10000).toFixed(0)} cm²) is significantly below the minimum expected for a ${direction} impact (${(expectedMinContactPatchM2 * 10000).toFixed(0)} cm²). This is inconsistent with the stated collision scenario.`,
      sources, TIER);
  }
  if (cpr < 0.75) {
    return indicator(id, name, 1, 'CONCERN', cpr, expectedRange,
      `Contact patch ratio ${(cpr * 100).toFixed(0)}% — observed damage area is below the expected minimum for a ${direction} impact. Minor inconsistency.`,
      sources, TIER);
  }
  return indicator(id, name, 1, 'PASS', cpr, expectedRange,
    `Contact patch ratio ${(cpr * 100).toFixed(0)}% — consistent with a ${direction} impact scenario.`,
    sources, TIER);
}

/**
 * L1-02: Bumper Height Compatibility
 *
 * Checks whether the insured vehicle's bumper height is compatible with
 * the stated counterpart vehicle type. A mismatch > 100 mm indicates
 * underride/override risk — the bumpers would not engage in a standard
 * frontal impact, producing a different damage pattern than claimed.
 *
 * Uses front_bumper_height_mm from the vehicle geometry database.
 */
function computeL1_02_BumperHeightCompatibility(
  stage7Data: Stage7Output,
  claimRecord: ClaimRecord,
): CGIIndicator {
  const id = 'L1-02';
  const name = 'Bumper Height Compatibility';
  const sources = ['Stage 7 geometryEvidenceBlock.vehicleProfileUsed', 'claimRecord.accidentDetails.counterpartVehicleType'];

  const direction = (claimRecord.accidentDetails?.collisionDirection ?? 'unknown').toLowerCase();

  const TIER: CGIIndicatorTier = 'CONDITIONAL';

  // Only relevant for frontal and rear impacts
  if (!direction.includes('front') && !direction.includes('rear')) {
    return unavailable(id, name, 1, 'Bumper height compatibility only assessed for frontal/rear impacts', sources, TIER);
  }

  const vgeResult = stage7Data.geometryEvidenceBlock;
  if (!vgeResult?.vehicleProfileUsed) {
    return unavailable(id, name, 1, 'No VGE vehicle profile available — bumper height not calibrated', sources, TIER);
  }

  // Counterpart vehicle type from claim record
  const counterpartType = (claimRecord.accidentDetails as any)?.counterpartVehicleType ?? null;
  if (!counterpartType) {
    return unavailable(id, name, 1, 'No counterpart vehicle type in claim record', sources, TIER);
  }

  // Estimate bumper height mismatch from vehicle class
  // Sedan/hatchback: ~450–550 mm. SUV/bakkie: ~600–750 mm. Truck: ~800–1000 mm.
  const insuredClass = inferVehicleClass(claimRecord.vehicle?.bodyType ?? '');
  const counterpartClass = inferVehicleClass(counterpartType);

  const insuredBumperMidMm = bumperHeightMidpoint(insuredClass);
  const counterpartBumperMidMm = bumperHeightMidpoint(counterpartClass);

  if (insuredBumperMidMm === null || counterpartBumperMidMm === null) {
    return unavailable(id, name, 1, 'Cannot estimate bumper height for one or both vehicles', sources, TIER);
  }

  const mismatchMm = Math.abs(insuredBumperMidMm - counterpartBumperMidMm);
  const expectedRange: [number, number] = [0, MAX_BUMPER_HEIGHT_MISMATCH_MM];

  if (mismatchMm > MAX_BUMPER_HEIGHT_MISMATCH_MM * 2) {
    return indicator(id, name, 1, 'FLAG', mismatchMm, expectedRange,
      `Bumper height mismatch ${mismatchMm.toFixed(0)} mm — insured vehicle (${insuredClass}, ~${insuredBumperMidMm} mm) and counterpart (${counterpartClass}, ~${counterpartBumperMidMm} mm) bumpers would not engage in a standard impact. Underride/override geometry expected.`,
      sources, TIER);
  }
  if (mismatchMm > MAX_BUMPER_HEIGHT_MISMATCH_MM) {
    return indicator(id, name, 1, 'CONCERN', mismatchMm, expectedRange,
      `Bumper height mismatch ${mismatchMm.toFixed(0)} mm — partial engagement expected. Damage pattern may differ from a full-engagement impact.`,
      sources, TIER);
  }
  return indicator(id, name, 1, 'PASS', mismatchMm, expectedRange,
    `Bumper height mismatch ${mismatchMm.toFixed(0)} mm — within compatibility range. Standard bumper engagement expected.`,
    sources, TIER);
}

/**
 * L1-03: Overlap Fraction Consistency
 *
 * Checks whether the observed damage width (derived from damageFractionEstimate
 * and panel width) is consistent with the stated overlap percentage.
 * A 40% offset impact should show damage across approximately 40% of the
 * bumper face width — not 90%.
 */
function computeL1_03_OverlapFractionConsistency(
  stage6Data: Stage6Output,
  claimRecord: ClaimRecord,
): CGIIndicator {
  const id = 'L1-03';
  const name = 'Overlap Fraction Consistency';
  const sources = ['Stage 6 damagedParts.damageFractionEstimate', 'claimRecord.accidentDetails.collisionDirection'];

  const direction = (claimRecord.accidentDetails?.collisionDirection ?? 'unknown').toLowerCase();

  const TIER: CGIIndicatorTier = 'CONDITIONAL';

  // Only relevant for offset frontal impacts
  const statedOverlap = getStatedOverlapFraction(direction);
  if (statedOverlap === null) {
    return unavailable(id, name, 1, 'Overlap fraction consistency only assessed for offset frontal impacts', sources, TIER);
  }

  const bodyType = (claimRecord.vehicle?.bodyType ?? 'sedan') as string;
  const frontBumperArea = getPanelAreaM2(bodyType as VehicleBodyType, 'front_bumper');
  if (!frontBumperArea || frontBumperArea <= 0) {
    return unavailable(id, name, 1, 'No front bumper area data for this vehicle body type', sources, TIER);
  }

  const frontBumperPart = stage6Data.damagedParts?.find(
    p => normalisePanelName(p.name ?? '') === 'front_bumper'
  );
  const damageFraction = frontBumperPart?.damageFractionEstimate ?? null;

  if (damageFraction === null) {
    return unavailable(id, name, 1, 'No damageFractionEstimate for front bumper', sources, TIER);
  }

  // Tolerance: ±20 percentage points around stated overlap
  const minExpected = Math.max(0, statedOverlap - 0.20);
  const maxExpected = Math.min(1, statedOverlap + 0.20);
  const expectedRange: [number, number] = [minExpected, maxExpected];

  if (damageFraction > maxExpected + 0.20) {
    return indicator(id, name, 1, 'FLAG', damageFraction, expectedRange,
      `Observed damage fraction ${(damageFraction * 100).toFixed(0)}% of front bumper face — significantly exceeds the expected range for a ${direction} impact (${(statedOverlap * 100).toFixed(0)}% ± 20%). Full-width damage on a stated offset impact is inconsistent.`,
      sources, TIER);
  }
  if (damageFraction > maxExpected) {
    return indicator(id, name, 1, 'CONCERN', damageFraction, expectedRange,
      `Observed damage fraction ${(damageFraction * 100).toFixed(0)}% — slightly above expected range for a ${direction} impact.`,
      sources, TIER);
  }
  if (damageFraction < minExpected) {
    return indicator(id, name, 1, 'ADVISORY', damageFraction, expectedRange,
      `Observed damage fraction ${(damageFraction * 100).toFixed(0)}% — below expected minimum for a ${direction} impact. Minor inconsistency.`,
      sources, TIER);
  }
  return indicator(id, name, 1, 'PASS', damageFraction, expectedRange,
    `Observed damage fraction ${(damageFraction * 100).toFixed(0)}% — consistent with a ${direction} impact.`,
    sources, TIER);
}

/**
 * L1-04: Crush Depth Consistency (VGR vs. Physics)
 *
 * Compares the VGR consensus crush depth (photogrammetric measurement) with
 * the physics-derived crush depth from Stage 7 (Campbell model).
 * A large discrepancy suggests either the photos do not show the true damage
 * extent, or the physics model is operating outside its calibration range.
 */
function computeL1_04_CrushDepthConsistency(
  stage7Data: Stage7Output,
  vgrResult: VGRConsensusResult | null,
): CGIIndicator {
  const id = 'L1-04';
  const name = 'Crush Depth Consistency (VGR vs. Physics)';
  const sources = ['Stage 6.5B VGRConsensusResult.consensusCrushDepthM', 'Stage 7 crushDepth (Campbell model)'];

  const TIER: CGIIndicatorTier = 'ADVANCED';

  if (!vgrResult?.reconciliationAvailable || vgrResult.consensusCrushDepthM === null) {
    return unavailable(id, name, 1, 'VGR consensus crush depth not available', sources, TIER);
  }

  // Stage 7 physics-derived crush depth
  const physicsSpeedKmh = stage7Data.estimatedSpeedKmh;
  if (!physicsSpeedKmh || physicsSpeedKmh <= 0) {
    return unavailable(id, name, 1, 'Stage 7 physics speed not available — cannot derive physics crush depth', sources, TIER);
  }

  // Campbell model: C = A + B × ΔV where A ≈ 0, B ≈ 0.01 m/(km/h) for typical sedans
  // Use a conservative B coefficient of 0.008 m/(km/h) for this cross-check
  const physicsCrushDepthM = 0.008 * physicsSpeedKmh;

  const vgrCrushM = vgrResult.consensusCrushDepthM;
  const discrepancyFraction = Math.abs(vgrCrushM - physicsCrushDepthM) / Math.max(physicsCrushDepthM, 0.01);
  const expectedRange: [number, number] = [0, CRUSH_DEPTH_CONSISTENCY_TOLERANCE];

  if (discrepancyFraction > CRUSH_DEPTH_CONSISTENCY_TOLERANCE * 2) {
    return indicator(id, name, 1, 'FLAG', discrepancyFraction, expectedRange,
      `VGR crush depth ${(vgrCrushM * 1000).toFixed(0)} mm vs. physics-derived ${(physicsCrushDepthM * 1000).toFixed(0)} mm — discrepancy ${(discrepancyFraction * 100).toFixed(0)}%. Photos may not show the true damage extent, or the stated speed is inconsistent with the observed deformation.`,
      sources, TIER);
  }
  if (discrepancyFraction > CRUSH_DEPTH_CONSISTENCY_TOLERANCE) {
    return indicator(id, name, 1, 'CONCERN', discrepancyFraction, expectedRange,
      `VGR crush depth ${(vgrCrushM * 1000).toFixed(0)} mm vs. physics-derived ${(physicsCrushDepthM * 1000).toFixed(0)} mm — discrepancy ${(discrepancyFraction * 100).toFixed(0)}%. Minor inconsistency.`,
      sources, TIER);
  }
  return indicator(id, name, 1, 'PASS', discrepancyFraction, expectedRange,
    `VGR crush depth ${(vgrCrushM * 1000).toFixed(0)} mm vs. physics-derived ${(physicsCrushDepthM * 1000).toFixed(0)} mm — within tolerance (${(discrepancyFraction * 100).toFixed(0)}% discrepancy).`,
    sources, TIER);
}

/**
 * L1-05: Damage Fraction vs. Severity Consistency
 *
 * Checks whether the total damage fraction across all panels is consistent
 * with the stated accident severity. A high-severity claim with very low
 * total damage fraction is inconsistent.
 */
function computeL1_05_DamageFractionSeverityConsistency(
  stage6Data: Stage6Output,
  stage7Data: Stage7Output,
): CGIIndicator {
  const id = 'L1-05';
  const name = 'Damage Fraction vs. Severity Consistency';
  const sources = ['Stage 6 damagedParts.damageFractionEstimate', 'Stage 7 accidentSeverity'];

  const TIER: CGIIndicatorTier = 'CORE';

  const severity = stage7Data.accidentSeverity;
  if (!severity) {
    return unavailable(id, name, 1, 'Stage 7 accidentSeverity not available', sources, TIER);
  }

  const parts = stage6Data.damagedParts ?? [];
  if (parts.length === 0) {
    return unavailable(id, name, 1, 'No damagedParts in Stage 6 output', sources, TIER);
  }

  // Average damage fraction across all damaged panels
  const fractions = parts
    .map(p => p.damageFractionEstimate ?? null)
    .filter((f): f is number => f !== null);

  if (fractions.length === 0) {
    return unavailable(id, name, 1, 'No damageFractionEstimate values in Stage 6 damagedParts', sources, TIER);
  }

  const avgFraction = fractions.reduce((a, b) => a + b, 0) / fractions.length;

  // Expected average damage fraction by severity
  const expectedBySeverity: Record<string, [number, number]> = {
    'MINOR':    [0.05, 0.35],
    'MODERATE': [0.20, 0.60],
    'SEVERE':   [0.40, 0.90],
    'CRITICAL': [0.60, 1.00],
  };

  const severityKey = severity.toUpperCase();
  const expectedRange = expectedBySeverity[severityKey] ?? [0.05, 1.00];

  if (avgFraction < expectedRange[0] * 0.5) {
    return indicator(id, name, 1, 'FLAG', avgFraction, expectedRange,
      `Average damage fraction ${(avgFraction * 100).toFixed(0)}% is significantly below the expected minimum for a ${severity} severity claim (${(expectedRange[0] * 100).toFixed(0)}%–${(expectedRange[1] * 100).toFixed(0)}%). Damage extent is inconsistent with stated severity.`,
      sources, TIER);
  }
  if (avgFraction < expectedRange[0]) {
    return indicator(id, name, 1, 'CONCERN', avgFraction, expectedRange,
      `Average damage fraction ${(avgFraction * 100).toFixed(0)}% is below the expected minimum for a ${severity} severity claim.`,
      sources, TIER);
  }
  if (avgFraction > expectedRange[1]) {
    return indicator(id, name, 1, 'ADVISORY', avgFraction, expectedRange,
      `Average damage fraction ${(avgFraction * 100).toFixed(0)}% is above the expected maximum for a ${severity} severity claim. Possible pre-existing damage included.`,
      sources, TIER);
  }
  return indicator(id, name, 1, 'PASS', avgFraction, expectedRange,
    `Average damage fraction ${(avgFraction * 100).toFixed(0)}% is consistent with a ${severity} severity claim.`,
    sources, TIER);
}

/**
 * L1-06: Multi-Image Crush Depth Convergence
 *
 * Checks whether the per-image crush depth measurements from VGR are
 * consistent with each other. High coefficient of variation (CV) suggests
 * the photos show different damage states — possible staged or pre-existing damage.
 */
function computeL1_06_MultiImageCrushDepthConvergence(
  vgrResult: VGRConsensusResult | null,
): CGIIndicator {
  const id = 'L1-06';
  const name = 'Multi-Image Crush Depth Convergence';
  const sources = ['Stage 6.5B VGRConsensusResult.imageEntries'];

  const TIER: CGIIndicatorTier = 'ADVANCED';

  if (!vgrResult?.reconciliationAvailable) {
    return unavailable(id, name, 1, 'VGR not available — multi-image convergence cannot be assessed', sources, TIER);
  }

  const entries = vgrResult.imageEntries?.filter(e => e.contributesToConsensus) ?? [];
  if (entries.length < 2) {
    return unavailable(id, name, 1, `Only ${entries.length} contributing image(s) — convergence requires ≥ 2`, sources, TIER);
  }

  const depths = entries.map(e => e.calibratedCrushDepthMm);
  const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
  const variance = depths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / depths.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  const expectedRange: [number, number] = [0, CRUSH_DEPTH_CV_FLAG_THRESHOLD];

  if (cv > CRUSH_DEPTH_CV_FLAG_THRESHOLD * 1.5) {
    return indicator(id, name, 1, 'FLAG', cv, expectedRange,
      `Crush depth coefficient of variation ${(cv * 100).toFixed(0)}% across ${entries.length} images — high inconsistency. Images may show different damage states (staged, pre-existing, or different incidents).`,
      sources, TIER);
  }
  if (cv > CRUSH_DEPTH_CV_FLAG_THRESHOLD) {
    return indicator(id, name, 1, 'CONCERN', cv, expectedRange,
      `Crush depth CV ${(cv * 100).toFixed(0)}% — moderate inconsistency across ${entries.length} images.`,
      sources, TIER);
  }
  return indicator(id, name, 1, 'PASS', cv, expectedRange,
    `Crush depth CV ${(cv * 100).toFixed(0)}% — images are consistent with each other.`,
    sources, TIER);
}

/**
 * L1-07: Structural Zone Penetration Consistency
 *
 * Checks whether the damage zone classification from Stage 6 is consistent
 * with the stated collision direction. A rear impact should not produce
 * primary damage in the front crumple zone.
 */
function computeL1_07_StructuralZonePenetrationConsistency(
  stage6Data: Stage6Output,
  claimRecord: ClaimRecord,
): CGIIndicator {
  const id = 'L1-07';
  const name = 'Structural Zone Penetration Consistency';
  const sources = ['Stage 6 damagedParts[].zone', 'claimRecord.accidentDetails.collisionDirection'];

  const direction = (claimRecord.accidentDetails?.collisionDirection ?? 'unknown').toLowerCase();
  const parts = stage6Data.damagedParts ?? [];

  const TIER: CGIIndicatorTier = 'CORE';

  if (parts.length === 0) {
    return unavailable(id, name, 1, 'No damagedParts in Stage 6 output', sources, TIER);
  }

  // Get zones from damaged parts
  const zones: string[] = parts
    .map(p => ((p as any).zone ?? '').toLowerCase())
    .filter(z => z.length > 0);

  if (zones.length === 0) {
    return unavailable(id, name, 1, 'No zone data in Stage 6 damagedParts', sources, TIER);
  }

  // Check for contradictory zones
  const contradictoryZone = findContradictoryZone(direction, zones);

  if (contradictoryZone) {
    return indicator(id, name, 1, 'FLAG', null, null,
      `Structural zone "${contradictoryZone}" is inconsistent with a ${direction} impact. Primary damage should be in the ${getExpectedZone(direction)} zone.`,
      sources, TIER);
  }

  return indicator(id, name, 1, 'PASS', null, null,
    `All damaged zones (${Array.from(new Set(zones)).join(', ')}) are consistent with a ${direction} impact.`,
    sources, TIER);
}

// ── Layer 2: Structural Intelligence ─────────────────────────────────────────

/**
 * L2-01: Force Density Index (FDI)
 *
 * Estimated impact force per unit contact area.
 * FDI = (0.5 × m × ΔV²) / (contactPatchAreaM2 × crushDepthM)
 *
 * Uses Stage 7 kinetic energy and VGR crush depth.
 * FDI outside the expected range suggests the damage pattern is inconsistent
 * with the stated impact energy.
 */
function computeL2_01_ForceDensityIndex(
  stage7Data: Stage7Output,
  stage6Data: Stage6Output,
  claimRecord: ClaimRecord,
  vgrResult: VGRConsensusResult | null,
): CGIIndicator {
  const id = 'L2-01';
  const name = 'Force Density Index';
  const sources = ['Stage 7 energyDistribution.kineticEnergyJ', 'Stage 6.5B VGRConsensusResult.consensusCrushDepthM', 'Stage 6 damagedParts.damageFractionEstimate'];

  const TIER: CGIIndicatorTier = 'CONDITIONAL';

  if (stage7Data.physicsStatus === 'SKIPPED_NON_PHYSICAL' || stage7Data.physicsStatus === 'SKIPPED_NO_SPEED') {
    return unavailable(id, name, 2, 'Physics was skipped — FDI cannot be computed', sources, TIER);
  }

  const kineticEnergyJ = stage7Data.energyDistribution?.kineticEnergyJ ?? null;
  if (!kineticEnergyJ || kineticEnergyJ <= 0) {
    return unavailable(id, name, 2, 'Stage 7 kinetic energy not available', sources, TIER);
  }

  const crushDepthM = vgrResult?.consensusCrushDepthM ?? null;
  if (!crushDepthM || crushDepthM <= 0) {
    return unavailable(id, name, 2, 'VGR crush depth not available for FDI calculation', sources, TIER);
  }

  const direction = (claimRecord.accidentDetails?.collisionDirection ?? 'unknown').toLowerCase();
  const bodyType = (claimRecord.vehicle?.bodyType ?? 'sedan') as string;
  const primaryPanelKey = getPrimaryPanelKey(direction);
  const totalPanelAreaM2 = primaryPanelKey ? getPanelAreaM2(bodyType as VehicleBodyType, primaryPanelKey) : null;

  const frontBumperPart = stage6Data.damagedParts?.find(
    p => normalisePanelName(p.name ?? '') === (primaryPanelKey ?? 'front_bumper')
  );
  const damageFraction = frontBumperPart?.damageFractionEstimate ?? 0.5;
  const contactPatchM2 = (totalPanelAreaM2 ?? 0.3) * damageFraction;

  if (contactPatchM2 <= 0) {
    return unavailable(id, name, 2, 'Cannot compute contact patch area for FDI', sources, TIER);
  }

  // FDI = energy / (contact area × crush depth) → kN/m²
  const fdiKNm2 = (kineticEnergyJ / 1000) / (contactPatchM2 * crushDepthM);
  const expectedRange: [number, number] = [FORCE_DENSITY_MIN_KN_M2, FORCE_DENSITY_MAX_KN_M2];

  if (fdiKNm2 < FORCE_DENSITY_MIN_KN_M2 * 0.5) {
    return indicator(id, name, 2, 'FLAG', fdiKNm2, expectedRange,
      `Force density index ${fdiKNm2.toFixed(0)} kN/m² is significantly below the expected minimum (${FORCE_DENSITY_MIN_KN_M2} kN/m²). The stated impact energy is insufficient to produce the observed deformation pattern.`,
      sources, TIER);
  }
  if (fdiKNm2 < FORCE_DENSITY_MIN_KN_M2) {
    return indicator(id, name, 2, 'CONCERN', fdiKNm2, expectedRange,
      `Force density index ${fdiKNm2.toFixed(0)} kN/m² is below the expected minimum. Minor inconsistency between impact energy and deformation.`,
      sources, TIER);
  }
  if (fdiKNm2 > FORCE_DENSITY_MAX_KN_M2) {
    return indicator(id, name, 2, 'ADVISORY', fdiKNm2, expectedRange,
      `Force density index ${fdiKNm2.toFixed(0)} kN/m² exceeds the structural yield threshold (${FORCE_DENSITY_MAX_KN_M2} kN/m²). Structural damage to load-bearing members is highly probable.`,
      sources, TIER);
  }
  return indicator(id, name, 2, 'PASS', fdiKNm2, expectedRange,
    `Force density index ${fdiKNm2.toFixed(0)} kN/m² — within the expected range for this impact scenario.`,
    sources, TIER);
}

/**
 * L2-02: Energy Absorption Efficiency
 *
 * Ratio of energy dissipated in deformation to total kinetic energy at impact.
 * Uses Stage 7 energyDistribution fields.
 * Below MIN: energy not absorbed — suggests pre-existing damage or low-speed staging.
 * Above MAX: physically impossible — energy exceeds kinetic energy.
 */
function computeL2_02_EnergyAbsorptionEfficiency(
  stage7Data: Stage7Output,
): CGIIndicator {
  const id = 'L2-02';
  const name = 'Energy Absorption Efficiency';
  const sources = ['Stage 7 energyDistribution.kineticEnergyJ', 'Stage 7 energyDistribution.energyDissipatedJ'];

  const TIER: CGIIndicatorTier = 'CORE';

  if (stage7Data.physicsStatus === 'SKIPPED_NON_PHYSICAL' || stage7Data.physicsStatus === 'SKIPPED_NO_SPEED') {
    return unavailable(id, name, 2, 'Physics was skipped — energy absorption cannot be assessed', sources, TIER);
  }

  const kineticEnergyJ = stage7Data.energyDistribution?.kineticEnergyJ ?? null;
  const dissipatedJ = stage7Data.energyDistribution?.energyDissipatedJ ?? null;

  if (!kineticEnergyJ || kineticEnergyJ <= 0 || dissipatedJ === null) {
    return unavailable(id, name, 2, 'Stage 7 energy distribution fields not available', sources, TIER);
  }

  const efficiency = dissipatedJ / kineticEnergyJ;
  const expectedRange: [number, number] = [ENERGY_EFFICIENCY_MIN, ENERGY_EFFICIENCY_MAX];

  if (efficiency > 1.05) {
    return indicator(id, name, 2, 'FLAG', efficiency, expectedRange,
      `Energy absorption efficiency ${(efficiency * 100).toFixed(0)}% exceeds 100% — physically impossible. Energy dissipated (${(dissipatedJ / 1000).toFixed(1)} kJ) cannot exceed kinetic energy at impact (${(kineticEnergyJ / 1000).toFixed(1)} kJ).`,
      sources, TIER);
  }
  if (efficiency < ENERGY_EFFICIENCY_MIN) {
    return indicator(id, name, 2, 'CONCERN', efficiency, expectedRange,
      `Energy absorption efficiency ${(efficiency * 100).toFixed(0)}% is below the expected minimum (${(ENERGY_EFFICIENCY_MIN * 100).toFixed(0)}%). Deformation may be pre-existing or the impact was staged at low speed.`,
      sources, TIER);
  }
  return indicator(id, name, 2, 'PASS', efficiency, expectedRange,
    `Energy absorption efficiency ${(efficiency * 100).toFixed(0)}% — consistent with a genuine impact event.`,
    sources, TIER);
}

/**
 * L2-03: Stiffness-Adjusted Severity Consistency
 *
 * Checks whether the stated accident severity is consistent with the
 * vehicle's structural stiffness class and the observed crush depth.
 * A SEVERE severity claim on a high-stiffness vehicle with minimal crush
 * depth is inconsistent.
 */
function computeL2_03_StiffnessAdjustedSeverityConsistency(
  stage7Data: Stage7Output,
  vgrResult: VGRConsensusResult | null,
): CGIIndicator {
  const id = 'L2-03';
  const name = 'Stiffness-Adjusted Severity Consistency';
  const sources = ['Stage 7 accidentSeverity', 'Stage 6.5B VGRConsensusResult.consensusCrushDepthM', 'Stage 7 speedInferenceEnsemble.consensusSpeedKmh'];

  const TIER: CGIIndicatorTier = 'CONDITIONAL';

  if (stage7Data.physicsStatus === 'SKIPPED_NON_PHYSICAL') {
    return unavailable(id, name, 2, 'Non-physical incident — stiffness-adjusted severity not applicable', sources, TIER);
  }

  const severity = stage7Data.accidentSeverity;
  const crushDepthM = vgrResult?.consensusCrushDepthM ?? null;
  const speedKmh = stage7Data.speedInferenceEnsemble?.consensusSpeedKmh ?? stage7Data.estimatedSpeedKmh ?? null;

  if (!severity || !crushDepthM || !speedKmh) {
    return unavailable(id, name, 2, 'Severity, crush depth, or speed not available', sources, TIER);
  }

  // Expected crush depth range by severity (metres)
  const expectedCrushBySeverity: Record<string, [number, number]> = {
    'MINOR':    [0.005, 0.060],
    'MODERATE': [0.040, 0.150],
    'SEVERE':   [0.100, 0.350],
    'CRITICAL': [0.250, 0.600],
  };

  const severityKey = severity.toUpperCase();
  const expectedRange = expectedCrushBySeverity[severityKey] ?? [0.005, 0.600];

  if (crushDepthM < expectedRange[0] * 0.5) {
    return indicator(id, name, 2, 'FLAG', crushDepthM, expectedRange,
      `Crush depth ${(crushDepthM * 1000).toFixed(0)} mm is significantly below the expected minimum for a ${severity} severity claim (${(expectedRange[0] * 1000).toFixed(0)}–${(expectedRange[1] * 1000).toFixed(0)} mm). Severity may be overstated.`,
      sources, TIER);
  }
  if (crushDepthM < expectedRange[0]) {
    return indicator(id, name, 2, 'CONCERN', crushDepthM, expectedRange,
      `Crush depth ${(crushDepthM * 1000).toFixed(0)} mm is below the expected minimum for a ${severity} severity claim.`,
      sources, TIER);
  }
  return indicator(id, name, 2, 'PASS', crushDepthM, expectedRange,
    `Crush depth ${(crushDepthM * 1000).toFixed(0)} mm is consistent with a ${severity} severity claim.`,
    sources, TIER);
}

/**
 * L2-04: Latent Damage Probability Uplift
 *
 * Assesses whether the geometry indicates a higher probability of hidden
 * structural damage than the Stage 7 default latent damage table.
 * Triggered when FDI > structural yield threshold or crush depth > 150 mm.
 */
function computeL2_04_LatentDamageProbabilityUplift(
  stage7Data: Stage7Output,
  vgrResult: VGRConsensusResult | null,
  l2_01_fdi: CGIIndicator,
): CGIIndicator {
  const id = 'L2-04';
  const name = 'Latent Damage Probability Uplift';
  const sources = ['Stage 7 latentDamageProbability', 'Stage 6.5B VGRConsensusResult.consensusCrushDepthM', 'L2-01 Force Density Index'];

  const TIER: CGIIndicatorTier = 'CORE';

  const crushDepthM = vgrResult?.consensusCrushDepthM ?? null;
  const latentProb = stage7Data.latentDamageProbability;

  if (!latentProb) {
    return unavailable(id, name, 2, 'Stage 7 latentDamageProbability not available', sources, TIER);
  }

  // Triggers for uplift
  const highFDI = l2_01_fdi.status === 'ADVISORY' || l2_01_fdi.status === 'FLAG';
  const deepCrush = crushDepthM !== null && crushDepthM > 0.150;
  const highFrameProb = latentProb.frame > 0.5;

  const upliftTriggered = highFDI || deepCrush || highFrameProb;

  // Compute an uplift factor
  let upliftFactor = 1.0;
  if (deepCrush && crushDepthM! > 0.250) upliftFactor = 1.5;
  else if (deepCrush) upliftFactor = 1.25;
  if (highFDI) upliftFactor *= 1.2;

  const adjustedFrameProb = Math.min(0.95, latentProb.frame * upliftFactor);
  const expectedRange: [number, number] = [0, 0.5];

  if (upliftTriggered && adjustedFrameProb > 0.7) {
    return indicator(id, name, 2, 'ADVISORY', adjustedFrameProb, expectedRange,
      `Geometry-adjusted frame damage probability ${(adjustedFrameProb * 100).toFixed(0)}% (uplift factor ${upliftFactor.toFixed(2)}×). Structural inspection of load-bearing members is strongly recommended before repair authorisation.`,
      sources, TIER);
  }
  if (upliftTriggered) {
    return indicator(id, name, 2, 'ADVISORY', adjustedFrameProb, expectedRange,
      `Geometry-adjusted frame damage probability ${(adjustedFrameProb * 100).toFixed(0)}% — elevated above Stage 7 default. Structural inspection recommended.`,
      sources, TIER);
  }
  return indicator(id, name, 2, 'PASS', latentProb.frame, expectedRange,
    `Latent damage probability within normal range — no geometry-based uplift triggered.`,
    sources, TIER);
}

/**
 * L2-05: Load Path Coherence
 *
 * Checks whether the set of damaged components is consistent with the
 * expected structural load path for the stated collision direction.
 * A frontal impact should produce damage propagating from the bumper
 * through the crash rails to the firewall — not isolated door damage.
 */
function computeL2_05_LoadPathCoherence(
  stage6Data: Stage6Output,
  claimRecord: ClaimRecord,
): CGIIndicator {
  const id = 'L2-05';
  const name = 'Load Path Coherence';
  const sources = ['Stage 6 damagedParts[].name', 'claimRecord.accidentDetails.collisionDirection'];

  const direction = (claimRecord.accidentDetails?.collisionDirection ?? 'unknown').toLowerCase();
  const parts = stage6Data.damagedParts ?? [];

  const TIER: CGIIndicatorTier = 'CORE';

  if (parts.length === 0) {
    return unavailable(id, name, 2, 'No damagedParts in Stage 6 output', sources, TIER);
  }

  const partNames = parts.map(p => normalisePanelName(p.name ?? ''));

  // Expected load path components by direction
  const expectedLoadPath = getExpectedLoadPath(direction);
  if (!expectedLoadPath) {
    return unavailable(id, name, 2, 'Cannot determine expected load path for collision direction', sources, TIER);
  }

  // Check if any primary load path component is present
  const primaryComponents = expectedLoadPath.primary;
  const hasPrimaryComponent = primaryComponents.some(c => partNames.some(p => p.includes(c)));

  // Check for isolated damage in unexpected zones
  const unexpectedComponents = expectedLoadPath.unexpected;
  const hasUnexpectedComponent = unexpectedComponents.some(c => partNames.some(p => p.includes(c)));
  const hasOnlyUnexpected = !hasPrimaryComponent && hasUnexpectedComponent;

  if (hasOnlyUnexpected) {
    return indicator(id, name, 2, 'FLAG', null, null,
      `Damaged components (${partNames.slice(0, 3).join(', ')}) are not on the expected structural load path for a ${direction} impact. Primary load path components (${Array.from(primaryComponents).join(', ')}) are absent.`,
      sources, TIER);
  }
  if (hasUnexpectedComponent && hasPrimaryComponent) {
    return indicator(id, name, 2, 'CONCERN', null, null,
      `Load path includes unexpected components alongside primary components. Possible pre-existing damage or secondary impact.`,
      sources, TIER);
  }
  return indicator(id, name, 2, 'PASS', null, null,
    `Damaged components are consistent with the expected load path for a ${direction} impact.`,
    sources, TIER);
}

// ── Layer 3: Forensic Conclusions ─────────────────────────────────────────────

function computeLayer3Conclusions(
  allIndicators: CGIIndicator[],
  stage7Data: Stage7Output,
  vgrResult: VGRConsensusResult | null,
): CGIForensicConclusion {
  const available = allIndicators.filter(i => i.status !== 'UNAVAILABLE');
  const flags = allIndicators.filter(i => i.status === 'FLAG');
  const concerns = allIndicators.filter(i => i.status === 'CONCERN');
  const advisories = allIndicators.filter(i => i.status === 'ADVISORY');

  // Confidence: lower when many indicators are unavailable
  const availabilityRatio = available.length / Math.max(allIndicators.length, 1);
  const confidence = Math.min(0.95, availabilityRatio * 0.9 + 0.1);

  // Verdict logic
  let verdict: CGIVerdict;
  if (flags.length >= 2 || (flags.length === 1 && concerns.length >= 2)) {
    verdict = 'INCOHERENT';
  } else if (flags.length === 1 || concerns.length >= 3) {
    verdict = 'ANOMALOUS';
  } else if (concerns.length >= 1 || advisories.length >= 2) {
    verdict = 'MINOR_ANOMALY';
  } else {
    verdict = 'COHERENT';
  }

  // Hidden damage probability override
  const l2_04 = allIndicators.find(i => i.id === 'L2-04');
  const l2_01 = allIndicators.find(i => i.id === 'L2-01');
  let hiddenDamageProbabilityOverride: number | null = null;

  if (confidence >= 0.6) {
    const crushDepthM = vgrResult?.consensusCrushDepthM ?? null;
    const baseProb = stage7Data.latentDamageProbability?.frame ?? 0.2;
    if (l2_04?.status === 'ADVISORY' || l2_01?.status === 'ADVISORY') {
      hiddenDamageProbabilityOverride = Math.min(0.90, baseProb * 1.4);
    } else if (verdict === 'INCOHERENT' || verdict === 'ANOMALOUS') {
      hiddenDamageProbabilityOverride = Math.min(0.85, baseProb * 1.2);
    } else if (crushDepthM !== null && crushDepthM > 0.150) {
      hiddenDamageProbabilityOverride = Math.min(0.80, baseProb * 1.15);
    }
  }

  // Fraud indicator injection
  const injectFraudIndicator = verdict === 'INCOHERENT' || verdict === 'ANOMALOUS';
  const fraudIndicatorScore = verdict === 'INCOHERENT' ? 30 : verdict === 'ANOMALOUS' ? 18 : 0;

  // Narrative
  const flagDescriptions = flags.map(f => `• ${f.name}: ${f.explanation}`).join('\n');
  const concernDescriptions = concerns.map(c => `• ${c.name}: ${c.explanation}`).join('\n');

  let narrative = `Contact Geometry Intelligence Assessment (Stage 9.5)\n`;
  narrative += `Verdict: ${verdict} | Confidence: ${(confidence * 100).toFixed(0)}%\n`;
  narrative += `Indicators assessed: ${available.length}/${allIndicators.length} | `;
  narrative += `Flags: ${flags.length} | Concerns: ${concerns.length} | Advisories: ${advisories.length}\n\n`;

  if (flags.length > 0) {
    narrative += `GEOMETRY FLAGS:\n${flagDescriptions}\n\n`;
  }
  if (concerns.length > 0) {
    narrative += `GEOMETRY CONCERNS:\n${concernDescriptions}\n\n`;
  }
  if (hiddenDamageProbabilityOverride !== null) {
    narrative += `HIDDEN DAMAGE: Geometry-adjusted probability ${(hiddenDamageProbabilityOverride * 100).toFixed(0)}% — structural inspection recommended.\n\n`;
  }

  const verdictDescriptions: Record<CGIVerdict, string> = {
    COHERENT: 'The observed damage geometry is consistent with the stated collision scenario. No geometric anomalies detected.',
    MINOR_ANOMALY: 'Minor geometric inconsistencies noted. These do not individually indicate fraud but should be reviewed by the adjuster.',
    ANOMALOUS: 'Significant geometric anomalies detected. The damage pattern is not fully consistent with the stated collision scenario. Adjuster review required.',
    INCOHERENT: 'Critical geometric incoherence detected. The observed damage pattern is inconsistent with the stated collision scenario in multiple independent dimensions. Escalation recommended.',
  };
  narrative += verdictDescriptions[verdict];

  const summary = `CGI: ${verdict} (${flags.length} flag${flags.length !== 1 ? 's' : ''}, ${concerns.length} concern${concerns.length !== 1 ? 's' : ''}) — confidence ${(confidence * 100).toFixed(0)}%`;

  return {
    verdict,
    confidence,
    hiddenDamageProbabilityOverride,
    injectFraudIndicator,
    fraudIndicatorScore,
    narrative,
    summary,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function runContactGeometryIntelligence(input: CGIInput): Stage9_5Output {
  const startMs = Date.now();

  try {
    const { claimRecord, stage6Data, stage7Data, stage8Data, stage9Data, vgeResult, vgrResult } = input;

    // Layer 1 — Geometry Indicators
    const l1_01 = computeL1_01_ContactPatchRatio(stage6Data, claimRecord);
    const l1_02 = computeL1_02_BumperHeightCompatibility(stage7Data, claimRecord);
    const l1_03 = computeL1_03_OverlapFractionConsistency(stage6Data, claimRecord);
    const l1_04 = computeL1_04_CrushDepthConsistency(stage7Data, vgrResult);
    const l1_05 = computeL1_05_DamageFractionSeverityConsistency(stage6Data, stage7Data);
    const l1_06 = computeL1_06_MultiImageCrushDepthConvergence(vgrResult);
    const l1_07 = computeL1_07_StructuralZonePenetrationConsistency(stage6Data, claimRecord);

    const layer1Indicators = [l1_01, l1_02, l1_03, l1_04, l1_05, l1_06, l1_07];

    // Layer 2 — Structural Intelligence
    const l2_01 = computeL2_01_ForceDensityIndex(stage7Data, stage6Data, claimRecord, vgrResult);
    const l2_02 = computeL2_02_EnergyAbsorptionEfficiency(stage7Data);
    const l2_03 = computeL2_03_StiffnessAdjustedSeverityConsistency(stage7Data, vgrResult);
    const l2_04 = computeL2_04_LatentDamageProbabilityUplift(stage7Data, vgrResult, l2_01);
    const l2_05 = computeL2_05_LoadPathCoherence(stage6Data, claimRecord);

    const layer2Indicators = [l2_01, l2_02, l2_03, l2_04, l2_05];

    const allIndicators = [...layer1Indicators, ...layer2Indicators];

    // Layer 3 — Forensic Conclusions
    const conclusion = computeLayer3Conclusions(allIndicators, stage7Data, vgrResult);

    const availabilitySummary = computeAvailabilitySummary(allIndicators);

    return {
      available: true,
      unavailableReason: null,
      layer1Indicators,
      layer2Indicators,
      conclusion,
      allIndicators,
      availabilitySummary,
      engineVersion: CGI_ENGINE_VERSION,
      runtimeMs: Date.now() - startMs,
    };

  } catch (err) {
    const emptyAvailability: CGIAvailabilitySummary = {
      core:        { available: 0, total: 0 },
      conditional: { available: 0, total: 0 },
      advanced:    { available: 0, total: 0 },
    };
    return {
      available: false,
      unavailableReason: `CGI engine error: ${err instanceof Error ? err.message : String(err)}`,
      layer1Indicators: [],
      layer2Indicators: [],
      conclusion: {
        verdict: 'COHERENT',
        confidence: 0,
        hiddenDamageProbabilityOverride: null,
        injectFraudIndicator: false,
        fraudIndicatorScore: 0,
        narrative: 'CGI engine encountered an error and could not produce a geometry assessment.',
        summary: 'CGI: UNAVAILABLE (engine error)',
      },
      allIndicators: [],
      availabilitySummary: emptyAvailability,
      engineVersion: CGI_ENGINE_VERSION,
      runtimeMs: Date.now() - startMs,
    };
  }
}

// ── Helper functions ──────────────────────────────────────────────────────────

function unavailable(id: string, name: string, layer: 1 | 2, reason: string, sources: string[], tier: CGIIndicatorTier): CGIIndicator {
  return { id, name, layer, tier, status: 'UNAVAILABLE', value: null, expectedRange: null, explanation: reason, sources };
}

function indicator(
  id: string, name: string, layer: 1 | 2,
  status: CGIIndicatorStatus,
  value: number | null,
  expectedRange: [number, number] | null,
  explanation: string,
  sources: string[],
  tier: CGIIndicatorTier,
): CGIIndicator {
  return { id, name, layer, tier, status, value, expectedRange, explanation, sources };
}

/**
 * Compute per-tier availability counts for the report header.
 * An indicator is "available" when its status is anything other than UNAVAILABLE.
 */
function computeAvailabilitySummary(indicators: CGIIndicator[]): CGIAvailabilitySummary {
  const summary: CGIAvailabilitySummary = {
    core:        { available: 0, total: 0 },
    conditional: { available: 0, total: 0 },
    advanced:    { available: 0, total: 0 },
  };
  for (const ind of indicators) {
    const key = ind.tier.toLowerCase() as keyof CGIAvailabilitySummary;
    const bucket = summary[key];
    if (!bucket) continue; // guard against unexpected tier values
    bucket.total++;
    if (ind.status !== 'UNAVAILABLE') bucket.available++;
  }
  return summary;
}

function normalisePanelName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/front_bumper.*|bumper.*cover.*front|bumper.*front/g, 'front_bumper')
    .replace(/rear_bumper.*|bumper.*cover.*rear|bumper.*rear/g, 'rear_bumper')
    .replace(/bonnet|hood/g, 'bonnet')
    .replace(/boot.*lid|trunk.*lid|tailgate/g, 'boot_lid')
    .replace(/front.*left.*door|driver.*door.*front/g, 'front_door_left')
    .replace(/front.*right.*door|passenger.*door.*front/g, 'front_door_right')
    .replace(/rear.*left.*door|driver.*door.*rear/g, 'rear_door_left')
    .replace(/rear.*right.*door|passenger.*door.*rear/g, 'rear_door_right');
}

function getPrimaryPanelKey(direction: string): string | null {
  if (direction.includes('front')) return 'front_bumper';
  if (direction.includes('rear')) return 'rear_bumper';
  if (direction.includes('side_driver') || direction.includes('side_left')) return 'front_door_left';
  if (direction.includes('side_passenger') || direction.includes('side_right')) return 'front_door_right';
  if (direction.includes('side')) return 'front_door_left';
  return null;
}

function getStatedOverlapFraction(direction: string): number | null {
  if (direction.includes('offset_40')) return 0.40;
  if (direction.includes('offset_25')) return 0.25;
  if (direction.includes('offset_30')) return 0.30;
  return null; // Not an offset impact
}

function inferVehicleClass(bodyType: string): string {
  const b = bodyType.toLowerCase();
  if (b.includes('truck') || b.includes('lorry') || b.includes('heavy')) return 'truck';
  if (b.includes('suv') || b.includes('4x4') || b.includes('bakkie') || b.includes('pickup')) return 'suv';
  if (b.includes('van') || b.includes('minibus') || b.includes('kombi')) return 'van';
  return 'sedan';
}

function bumperHeightMidpoint(vehicleClass: string): number | null {
  const heights: Record<string, number> = {
    sedan: 500,
    suv: 680,
    van: 620,
    truck: 900,
  };
  return heights[vehicleClass] ?? null;
}

function findContradictoryZone(direction: string, zones: string[]): string | null {
  const contradictions: Record<string, string[]> = {
    front_centre:    ['rear', 'boot', 'trunk'],
    front_offset_40: ['rear', 'boot', 'trunk'],
    rear_centre:     ['front', 'bonnet', 'hood', 'radiator'],
    rear_offset:     ['front', 'bonnet', 'hood', 'radiator'],
    side_driver:     ['front_centre', 'rear_centre'],
    side_passenger:  ['front_centre', 'rear_centre'],
  };

  const dirKey = Object.keys(contradictions).find(k => direction.includes(k));
  if (!dirKey) return null;

  const contradictoryTerms = contradictions[dirKey];
  for (const zone of zones) {
    if (contradictoryTerms.some(t => zone.includes(t))) return zone;
  }
  return null;
}

function getExpectedZone(direction: string): string {
  if (direction.includes('front')) return 'front crumple zone';
  if (direction.includes('rear')) return 'rear crumple zone';
  if (direction.includes('side')) return 'side sill / B-pillar zone';
  return 'primary impact zone';
}

interface LoadPath {
  primary: string[];
  unexpected: string[];
}

function getExpectedLoadPath(direction: string): LoadPath | null {
  if (direction.includes('front')) {
    return {
      primary: ['front_bumper', 'bonnet', 'radiator', 'crash_rail', 'front_panel'],
      unexpected: ['boot', 'rear_bumper', 'rear_door'],
    };
  }
  if (direction.includes('rear')) {
    return {
      primary: ['rear_bumper', 'boot', 'boot_lid', 'rear_panel', 'rear_rail'],
      unexpected: ['bonnet', 'front_bumper', 'front_door'],
    };
  }
  if (direction.includes('side')) {
    return {
      primary: ['door', 'sill', 'pillar', 'wheel_arch'],
      unexpected: ['bonnet', 'front_bumper', 'rear_bumper'],
    };
  }
  return null;
}
