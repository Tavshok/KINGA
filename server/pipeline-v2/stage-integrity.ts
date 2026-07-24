/**
 * stage-integrity.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * KINGA Physics Integrity Engine — Wave 3
 *
 * PURPOSE
 * ───────
 * Performs comprehensive cross-measurement contradiction detection across the
 * full PhysicsTruth object. Every check is physics-grounded, cites the
 * specific measurements that conflict, and produces an actionable adjuster
 * flag with a severity classification.
 *
 * SEVERITY LEVELS
 * ───────────────
 * CRITICAL — The contradiction is severe enough to invalidate the physics
 *             conclusion. The claim MUST be reviewed before a decision is made.
 *             Example: speed estimate 3× higher than crush depth implies.
 *
 * WARNING  — A significant inconsistency that should be investigated but does
 *             not by itself invalidate the conclusion.
 *             Example: VGR images conflict by >35%.
 *
 * INFO     — A minor observation that may affect precision but not the
 *             conclusion.
 *             Example: Only one image contributed to VGR consensus.
 *
 * CHECKS PERFORMED
 * ────────────────
 *  INT-01  Speed vs crush depth consistency (Campbell formula cross-check)
 *  INT-02  Kinetic energy vs deformation energy balance
 *  INT-03  VGR cross-image agreement
 *  INT-04  Speed ensemble method divergence
 *  INT-05  Airbag deployment vs speed threshold
 *  INT-06  Claimed speed vs physics-derived speed
 *  INT-07  SLPE structural integrity risk vs speed
 *  INT-08  Data quality score vs decision confidence
 *  INT-09  Crush depth source quality vs claim value
 *  INT-10  Deformation efficiency factor plausibility
 */

import type { PhysicsTruth } from './physicsTruth';

// ── Output types ──────────────────────────────────────────────────────────────

export type IntegritySeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface IntegrityFlag {
  /** Unique check code */
  code: string;
  /** Severity of the contradiction */
  severity: IntegritySeverity;
  /** Human-readable description of the contradiction */
  description: string;
  /** Which PhysicsTruth fields are affected */
  affectedMeasurements: string[];
  /** Specific action the adjuster should take */
  recommendation: string;
  /** Numeric values involved in the check (for report rendering) */
  evidence: Record<string, number | string | null>;
}

export interface IntegrityEngineResult {
  /** True if no CRITICAL flags were raised */
  passed: boolean;
  /** True if no CRITICAL or WARNING flags were raised */
  clean: boolean;
  /** All flags raised, sorted by severity */
  flags: IntegrityFlag[];
  /** Count by severity */
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  /** Overall integrity score 0–100 (100 = no flags, 0 = multiple CRITICAL) */
  integrityScore: number;
  /** One-sentence summary for the report header */
  summary: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Campbell stiffness coefficient A (N/m) — typical passenger car */
const CAMPBELL_A = 0;
/** Campbell stiffness coefficient B (N/m²) — typical passenger car */
const CAMPBELL_B = 1_200_000;
/** Minimum speed for airbag deployment (km/h) — frontal */
const AIRBAG_DEPLOY_MIN_KMH = 20;
/** Maximum speed for airbag deployment without severe injury (km/h) */
const AIRBAG_DEPLOY_MAX_KMH = 80;
/** Maximum plausible deformation efficiency factor */
const ETA_MAX = 0.85;
/** Minimum plausible deformation efficiency factor */
const ETA_MIN = 0.10;

// ── Main engine ───────────────────────────────────────────────────────────────

export function runIntegrityEngine(pt: PhysicsTruth): IntegrityEngineResult {
  const flags: IntegrityFlag[] = [];

  // ── INT-01: Speed vs crush depth (Campbell cross-check) ───────────────────
  const canonicalCrush = pt.geometry.crushDepth.canonical;
  const canonicalSpeed = pt.speed.canonical;

  if (canonicalCrush && canonicalSpeed) {
    const crushM = canonicalCrush.value;
    const speedKmh = canonicalSpeed.value;
    const speedMs = speedKmh / 3.6;

    // Campbell formula: v = sqrt((A*C + B*C²/2) * 2 / m)
    // Simplified (A=0): v_implied = C * sqrt(B / m)
    const massKg = pt.vehicle.massKg ?? 1400;
    const impliedSpeedMs = crushM * Math.sqrt(CAMPBELL_B / massKg);
    const impliedSpeedKmh = impliedSpeedMs * 3.6;

    const ratio = speedKmh / Math.max(impliedSpeedKmh, 1);

    if (ratio > 3.0) {
      flags.push({
        code: 'INT-01-SPEED_CRUSH_CRITICAL',
        severity: 'CRITICAL',
        description: `Physics ensemble speed (${speedKmh.toFixed(0)} km/h) is ${ratio.toFixed(1)}× higher than the speed implied by the measured crush depth (${(crushM * 1000).toFixed(0)} mm → ~${impliedSpeedKmh.toFixed(0)} km/h via Campbell formula). This magnitude of discrepancy indicates either a measurement error or that the photographed deformation is not from the primary impact zone.`,
        affectedMeasurements: ['speed.canonical', 'geometry.crushDepth.canonical'],
        recommendation: 'CRITICAL: Do not finalise decision. Verify that crush depth measurement is from the primary impact zone. Review all speed ensemble inputs for outliers. Request additional photographs of the primary crush zone.',
        evidence: { speedKmh, crushMm: crushM * 1000, impliedSpeedKmh: +impliedSpeedKmh.toFixed(1), ratio: +ratio.toFixed(2) },
      });
    } else if (ratio > 2.0) {
      flags.push({
        code: 'INT-01-SPEED_CRUSH_WARNING',
        severity: 'WARNING',
        description: `Physics ensemble speed (${speedKmh.toFixed(0)} km/h) is ${ratio.toFixed(1)}× higher than the speed implied by the measured crush depth (${(crushM * 1000).toFixed(0)} mm → ~${impliedSpeedKmh.toFixed(0)} km/h). This may indicate partial crush zone coverage in the photographs, energy absorption by a second vehicle, or a non-standard impact geometry.`,
        affectedMeasurements: ['speed.canonical', 'geometry.crushDepth.canonical'],
        recommendation: 'Review speed ensemble for outlier methods. Confirm crush depth is from the maximum deformation point. Check if a second vehicle absorbed significant energy.',
        evidence: { speedKmh, crushMm: crushM * 1000, impliedSpeedKmh: +impliedSpeedKmh.toFixed(1), ratio: +ratio.toFixed(2) },
      });
    } else if (ratio < 0.3) {
      flags.push({
        code: 'INT-01-CRUSH_SPEED_MISMATCH',
        severity: 'WARNING',
        description: `Measured crush depth (${(crushM * 1000).toFixed(0)} mm) implies a speed of ~${impliedSpeedKmh.toFixed(0)} km/h, which is ${(1 / ratio).toFixed(1)}× higher than the physics ensemble speed (${speedKmh.toFixed(0)} km/h). Possible causes: crush depth overestimated from photographs, pre-existing damage included, or speed estimate is from a low-confidence method.`,
        affectedMeasurements: ['geometry.crushDepth.canonical', 'speed.canonical'],
        recommendation: 'Verify crush depth measurement excludes pre-existing damage. Review speed ensemble confidence. Consider requesting a physical inspection.',
        evidence: { speedKmh, crushMm: crushM * 1000, impliedSpeedKmh: +impliedSpeedKmh.toFixed(1), ratio: +ratio.toFixed(2) },
      });
    }
  }

  // ── INT-02: Kinetic energy vs deformation energy balance ──────────────────
  const kineticJ = pt.energy.kineticEnergyJ?.value ?? null;
  const deformJ  = pt.energy.totalDeformationEnergyJ?.value ?? null;
  const eta      = pt.energy.deformationEfficiencyFactor;

  if (kineticJ && deformJ && kineticJ > 0) {
    const observedEta = deformJ / kineticJ;
    if (observedEta > ETA_MAX) {
      flags.push({
        code: 'INT-02-ENERGY_BALANCE_EXCEEDED',
        severity: 'WARNING',
        description: `Deformation energy (${(deformJ / 1000).toFixed(1)} kJ) exceeds ${(ETA_MAX * 100).toFixed(0)}% of kinetic energy (${(kineticJ / 1000).toFixed(1)} kJ). Observed efficiency: ${(observedEta * 100).toFixed(0)}%. Energy cannot exceed kinetic input — this indicates the deformation energy is overestimated or the speed is underestimated.`,
        affectedMeasurements: ['energy.totalDeformationEnergyJ', 'energy.kineticEnergyJ'],
        recommendation: 'Review component deformation energy estimates. Verify speed ensemble is not underestimating impact velocity.',
        evidence: { kineticKJ: +(kineticJ / 1000).toFixed(1), deformKJ: +(deformJ / 1000).toFixed(1), observedEta: +observedEta.toFixed(3) },
      });
    } else if (observedEta < ETA_MIN && deformJ > 5000) {
      flags.push({
        code: 'INT-02-ENERGY_VERY_LOW',
        severity: 'INFO',
        description: `Deformation energy (${(deformJ / 1000).toFixed(1)} kJ) is only ${(observedEta * 100).toFixed(0)}% of kinetic energy (${(kineticJ / 1000).toFixed(1)} kJ). This may indicate significant energy was absorbed by a second vehicle, the road surface, or that the deformation zone photographed is not the primary crush zone.`,
        affectedMeasurements: ['energy.totalDeformationEnergyJ', 'energy.kineticEnergyJ'],
        recommendation: 'Verify that photographs cover the primary crush zone. Check if a second vehicle or fixed object absorbed significant energy.',
        evidence: { kineticKJ: +(kineticJ / 1000).toFixed(1), deformKJ: +(deformJ / 1000).toFixed(1), observedEta: +observedEta.toFixed(3) },
      });
    }
  }

  // ── INT-03: VGR cross-image agreement ─────────────────────────────────────
  const vgrAgreement = pt.geometry.crushDepth.vgrAgreementLevel;
  if (vgrAgreement === 'CONFLICTING') {
    flags.push({
      code: 'INT-03-VGR_CONFLICT',
      severity: 'WARNING',
      description: 'Cross-image crush depth estimates conflict significantly. The VGR consensus crush depth has high uncertainty because the individual image measurements disagree beyond the expected range for multi-angle photography of the same deformation zone.',
      affectedMeasurements: ['geometry.crushDepth.vgrConsensus'],
      recommendation: 'Review individual image calibration results. Possible causes: photographs are of different damage zones, perspective distortion, or non-uniform deformation. Request a frontal photograph from directly in front of the vehicle.',
      evidence: { agreementLevel: vgrAgreement, contributingImages: pt.geometry.crushDepth.vgrContributingImages },
    });
  } else if (pt.geometry.crushDepth.vgrContributingImages === 1) {
    flags.push({
      code: 'INT-03-VGR_SINGLE_IMAGE',
      severity: 'INFO',
      description: 'Only one image contributed to the VGR crush depth consensus. Multi-image consensus requires at least 2 images from different angles to provide cross-validation.',
      affectedMeasurements: ['geometry.crushDepth.vgrConsensus'],
      recommendation: 'Request at least one additional damage photograph from a different angle (ideally a 45° or direct frontal view) to enable cross-image validation.',
      evidence: { contributingImages: 1 },
    });
  }

  // ── INT-04: Speed ensemble method divergence ───────────────────────────────
  const speedDivergence = pt.speed.highDivergence;
  const methodCount = pt.speed.methodsRan;
  const speedConf = pt.speed.canonical?.confidence ?? 0;

  if (speedDivergence) {
    flags.push({
      code: 'INT-04-SPEED_ENSEMBLE_DIVERGENCE',
      severity: 'WARNING',
      description: `The ${methodCount} speed estimation methods in the ensemble produced divergent results. The consensus speed has reduced confidence (${(speedConf * 100).toFixed(0)}%) because the methods disagree beyond the expected range. This may indicate conflicting evidence sources or an unusual impact scenario.`,
      affectedMeasurements: ['speed.canonical', 'speed.ensembleResult'],
      recommendation: 'Review individual method results in the speed ensemble. Identify which method is the outlier and whether its inputs are reliable. Consider requesting additional evidence (e.g., CCTV footage, telematics data).',
      evidence: { methodCount, speedConfidence: +(speedConf * 100).toFixed(0) },
    });
  }

  // ── INT-05: Airbag deployment vs speed threshold ───────────────────────────
  const airbagDeployed = pt.speed.lowerBoundKmh != null && pt.speed.lowerBoundKmh >= AIRBAG_DEPLOY_MIN_KMH;
  if (canonicalSpeed) {
    const speedKmh = canonicalSpeed.value;
    if (airbagDeployed && speedKmh < AIRBAG_DEPLOY_MIN_KMH) {
      flags.push({
        code: 'INT-05-AIRBAG_SPEED_LOW',
        severity: 'CRITICAL',
        description: `Airbag deployment is confirmed, but the physics ensemble speed (${speedKmh.toFixed(0)} km/h) is below the minimum deployment threshold (~${AIRBAG_DEPLOY_MIN_KMH} km/h for frontal impacts). Airbags do not deploy at this speed under normal conditions. This is a strong indicator of either a speed underestimation or a staged/fraudulent claim.`,
        affectedMeasurements: ['speed.canonical', 'speed.airbagDeploymentEvidence'],
        recommendation: 'CRITICAL: Flag for fraud investigation. Verify airbag deployment from physical inspection. Review all speed inputs for systematic underestimation.',
        evidence: { speedKmh, minDeployKmh: AIRBAG_DEPLOY_MIN_KMH },
      });
    } else if (!airbagDeployed && speedKmh > 60) {
      flags.push({
        code: 'INT-05-NO_AIRBAG_HIGH_SPEED',
        severity: 'INFO',
        description: `Physics ensemble speed (${speedKmh.toFixed(0)} km/h) is above 60 km/h but no airbag deployment is recorded. At this speed, frontal airbag deployment is expected in most modern vehicles. Possible causes: side/rear impact (airbags may not deploy), pre-existing airbag fault, or speed overestimation.`,
        affectedMeasurements: ['speed.canonical', 'speed.airbagDeploymentEvidence'],
        recommendation: 'Verify impact direction. Check vehicle service records for airbag faults. Review speed ensemble for overestimation.',
        evidence: { speedKmh },
      });
    }
  }

  // ── INT-06: Claimed speed vs physics-derived speed ─────────────────────────
  const claimedSpeed = pt.speed.claimedSpeedKmh;
  if (canonicalSpeed && claimedSpeed != null && claimedSpeed > 0) {
    const physicsSpeed = canonicalSpeed.value;
    const claimRatio = physicsSpeed / claimedSpeed;

    if (claimRatio > 2.5) {
      flags.push({
        code: 'INT-06-PHYSICS_EXCEEDS_CLAIMED',
        severity: 'WARNING',
        description: `Physics-derived speed (${physicsSpeed.toFixed(0)} km/h) is ${claimRatio.toFixed(1)}× higher than the claimant's stated speed (${claimedSpeed.toFixed(0)} km/h). A discrepancy of this magnitude is inconsistent with normal measurement uncertainty and may indicate the claimant has understated their speed.`,
        affectedMeasurements: ['speed.canonical', 'speed.claimedSpeedKmh'],
        recommendation: 'Document the discrepancy. Consider requesting a statement from the claimant explaining the speed. Review police report for any speed observations.',
        evidence: { physicsSpeedKmh: +physicsSpeed.toFixed(0), claimedSpeedKmh: claimedSpeed, ratio: +claimRatio.toFixed(2) },
      });
    } else if (claimRatio < 0.4 && physicsSpeed > 10) {
      flags.push({
        code: 'INT-06-CLAIMED_EXCEEDS_PHYSICS',
        severity: 'INFO',
        description: `Claimant's stated speed (${claimedSpeed.toFixed(0)} km/h) is ${(1 / claimRatio).toFixed(1)}× higher than the physics-derived speed (${physicsSpeed.toFixed(0)} km/h). The damage is consistent with a lower-speed impact than claimed.`,
        affectedMeasurements: ['speed.canonical', 'speed.claimedSpeedKmh'],
        recommendation: 'Note the discrepancy. The physics evidence does not support the claimed speed. This may affect liability and repair cost assessment.',
        evidence: { physicsSpeedKmh: +physicsSpeed.toFixed(0), claimedSpeedKmh: claimedSpeed, ratio: +claimRatio.toFixed(2) },
      });
    }
  }

  // ── INT-07: SLPE structural integrity risk vs speed ────────────────────────
  const slpe = pt.structuralLoadPath;
  if (slpe && canonicalSpeed) {
    const speedKmh = canonicalSpeed.value;
    const risk = slpe.structuralIntegrityRisk;

    if (risk === 'none' && speedKmh > 50) {
      flags.push({
        code: 'INT-07-SLPE_RISK_SPEED_MISMATCH',
        severity: 'INFO',
        description: `The Structural Load Path Engine found no structural penetration, but the physics ensemble speed is ${speedKmh.toFixed(0)} km/h. At this speed, some structural component involvement is expected for most vehicle classes. This may indicate the impact was oblique, the crush zone photographs do not show the primary damage, or the vehicle has unusually high structural stiffness.`,
        affectedMeasurements: ['structuralLoadPath.structuralIntegrityRisk', 'speed.canonical'],
        recommendation: 'Verify that photographs cover the primary crush zone. Check for oblique impact geometry. Consider requesting a physical inspection of the chassis rails.',
        evidence: { speedKmh, structuralRisk: risk },
      });
    } else if ((risk === 'severe' || risk === 'high') && speedKmh < 30) {
      flags.push({
        code: 'INT-07-SLPE_SEVERE_LOW_SPEED',
        severity: 'WARNING',
        description: `The Structural Load Path Engine indicates ${risk.toUpperCase()} structural integrity risk, but the physics ensemble speed is only ${speedKmh.toFixed(0)} km/h. Severe structural damage at low speed is unusual and may indicate pre-existing structural damage, a high-mass/fixed-object impact, or an error in the crush depth measurement.`,
        affectedMeasurements: ['structuralLoadPath.structuralIntegrityRisk', 'speed.canonical'],
        recommendation: 'Request a physical inspection to verify structural damage. Check for pre-existing damage in the claim history. Review crush depth measurement for accuracy.',
        evidence: { speedKmh, structuralRisk: risk },
      });
    }
  }

  // ── INT-08: Data quality score vs decision confidence ─────────────────────
  const dqs = pt.evidenceCompleteness.dataQualityScore;
  if (dqs < 30 && canonicalSpeed && canonicalSpeed.confidence > 0.7) {
    flags.push({
      code: 'INT-08-DQS_CONFIDENCE_MISMATCH',
      severity: 'WARNING',
      description: `Data quality score is low (${dqs}/100) but the speed estimate confidence is high (${(canonicalSpeed.confidence * 100).toFixed(0)}%). This inconsistency may indicate that the confidence is being driven by a single method with limited corroboration. Low data quality increases the risk of an incorrect physics conclusion.`,
      affectedMeasurements: ['evidenceCompleteness.dataQualityScore', 'speed.canonical.confidence'],
      recommendation: 'Review the speed estimation methods that are driving the high confidence. Request additional photographic evidence to improve data quality before finalising the decision.',
      evidence: { dqs, speedConfidence: +(canonicalSpeed.confidence * 100).toFixed(0) },
    });
  }

  // ── INT-09: Crush depth source quality ────────────────────────────────────
  const crushSource = pt.geometry.crushDepth.canonical?.source;
  if (crushSource === 'STAGE7_INFERRED' || crushSource === 'NOT_AVAILABLE') {
    flags.push({
      code: 'INT-09-CRUSH_DEPTH_INFERRED',
      severity: 'INFO',
      description: `The canonical crush depth is based on severity inference (not photogrammetric measurement). This means the Campbell formula speed estimate (M3) could not be calculated from direct measurement, reducing the precision of the speed ensemble.`,
      affectedMeasurements: ['geometry.crushDepth.canonical'],
      recommendation: 'Request at least one close-up, perpendicular photograph of the primary crush zone to enable photogrammetric calibration.',
      evidence: { crushDepthSource: crushSource ?? 'NOT_AVAILABLE' },
    });
  }

  // ── INT-10: Deformation efficiency factor plausibility ────────────────────
  if (eta != null) {
    if (eta > ETA_MAX) {
      flags.push({
        code: 'INT-10-ETA_TOO_HIGH',
        severity: 'INFO',
        description: `Deformation efficiency factor η = ${(eta * 100).toFixed(0)}% exceeds the physical maximum (~${(ETA_MAX * 100).toFixed(0)}%). Some kinetic energy is always converted to heat, sound, and elastic rebound. This may indicate a calculation error or that the deformation energy estimate is too high.`,
        affectedMeasurements: ['energy.deformationEfficiencyFactor'],
        recommendation: 'Review component deformation energy estimates for overestimation.',
        evidence: { eta: +eta.toFixed(3), etaMax: ETA_MAX },
      });
    }
  }

  // ── Aggregate results ─────────────────────────────────────────────────────
  const criticalCount = flags.filter(f => f.severity === 'CRITICAL').length;
  const warningCount  = flags.filter(f => f.severity === 'WARNING').length;
  const infoCount     = flags.filter(f => f.severity === 'INFO').length;

  const passed = criticalCount === 0;
  const clean  = criticalCount === 0 && warningCount === 0;

  // Score: start at 100, deduct 30 per CRITICAL, 10 per WARNING, 3 per INFO
  const integrityScore = Math.max(0, 100 - (criticalCount * 30) - (warningCount * 10) - (infoCount * 3));

  let summary: string;
  if (clean) {
    summary = 'All physics integrity checks passed — no contradictions detected.';
  } else if (criticalCount > 0) {
    summary = `${criticalCount} critical contradiction${criticalCount > 1 ? 's' : ''} detected — decision must not be finalised without review.`;
  } else {
    summary = `${warningCount} warning${warningCount > 1 ? 's' : ''}${infoCount > 0 ? ` and ${infoCount} observation${infoCount > 1 ? 's' : ''}` : ''} — review recommended before finalising.`;
  }

  // Sort: CRITICAL first, then WARNING, then INFO
  const severityOrder: Record<IntegritySeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { passed, clean, flags, criticalCount, warningCount, infoCount, integrityScore, summary };
}
