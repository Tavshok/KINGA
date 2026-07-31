/**
 * physicsTruth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * KINGA Physics Truth Layer — Wave 1
 *
 * DESIGN PRINCIPLE
 * ────────────────
 * Every physical measurement in the KINGA pipeline has a single canonical
 * representation: the PhysicsTruth object. Every downstream engine (latent
 * damage, fraud scoring, report generation) MUST read from this object, not
 * from the raw stage outputs.
 *
 * The object is:
 *   - IMMUTABLE once sealed by buildPhysicsTruth()
 *   - COMPLETE — every field carries its own confidence, uncertainty, and
 *     provenance so consumers never need to go back to the source stage
 *   - TRACEABLE — every measurement records which engine produced it and
 *     which evidence it was derived from
 *   - NON-LOSSY — no intermediate result is silently discarded; if a stage
 *     ran and produced output, it is represented here
 *
 * PROVENANCE HIERARCHY
 * ────────────────────
 * For crush depth (the most important single measurement):
 *   1. VGR consensus (multi-image photogrammetric, view-angle weighted) — HIGHEST
 *   2. VGE single-image calibrated (photogrammetric, single best image)
 *   3. Stage 6 LLM vision estimate (direct model observation, uncalibrated)
 *   4. Stage 7 inferred from severity (coarse, excluded from Campbell)
 *
 * The canonical crush depth always uses the highest-quality source available.
 * The lower-quality sources are preserved as audit fields, not discarded.
 *
 * UNCERTAINTY CONVENTION
 * ──────────────────────
 * All measurements carry:
 *   value     — point estimate (best estimate)
 *   min / max — 90% confidence interval bounds
 *   confidence — 0–1 scalar (1 = certain, 0 = no information)
 *   source    — which engine produced this value
 *
 * NEVER store a measurement without its confidence. False precision is worse
 * than acknowledged uncertainty.
 */

// ── Shared measurement wrapper ────────────────────────────────────────────────

export type MeasurementSource =
  | 'VGR_CONSENSUS'          // Stage 6.5B multi-image photogrammetric consensus
  | 'VGE_CALIBRATED'         // Stage 6.5A single-image photogrammetric calibration
  | 'STAGE6_LLM_VISION'      // Stage 6 LLM direct visual estimate (uncalibrated)
  | 'STAGE7_INFERRED'        // Stage 7 inferred from damage severity (coarse)
  | 'DOCUMENT_STATED'        // Explicitly stated in a submitted document
  | 'ENSEMBLE_CONSENSUS'     // Speed ensemble weighted mean
  | 'PHYSICS_DERIVED'        // Derived from other measurements via physics formula
  | 'ENGINEER_MEASUREMENT'  // Physical measurement captured by a field engineer (Epic 3)
  | 'NOT_AVAILABLE';         // No measurement available

export interface PhysicsMeasurement {
  /** Point estimate — best available value */
  value: number;
  /** Lower bound of 90% confidence interval */
  min: number;
  /** Upper bound of 90% confidence interval */
  max: number;
  /** Confidence scalar 0–1 (1 = certain, 0 = no information) */
  confidence: number;
  /** Which engine produced this measurement */
  source: MeasurementSource;
  /** Human-readable provenance note for the report */
  provenanceNote: string;
}

/** A measurement that may not be available */
export type OptionalMeasurement = PhysicsMeasurement | null;

// ── Geometry measurements ─────────────────────────────────────────────────────

export interface CrushDepthEvidence {
  /**
   * Canonical crush depth — highest quality source available.
   * Consumers MUST use this field, not the raw stage outputs.
   */
  canonical: OptionalMeasurement;  // metres

  /** VGR multi-image photogrammetric consensus (best source) */
  vgrConsensus: OptionalMeasurement;  // metres

  /** VGE single-image calibrated (second best source) */
  vgeSingleImage: OptionalMeasurement;  // metres

  /** Stage 6 LLM direct visual estimate (uncalibrated, preserved for audit) */
  llmVisionEstimate: OptionalMeasurement;  // metres

  /** Source used for canonical: explains why this source was chosen */
  canonicalSourceReason: string;

  /** Number of images that contributed to the VGR consensus */
  vgrContributingImages: number;

  /** View-angle breakdown for VGR */
  vgrViewAngles: {
    frontal: number;
    angle45: number;
    side: number;
    unknown: number;
  };

  /** VGR cross-image agreement level */
  vgrAgreementLevel: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICTING' | 'SINGLE_IMAGE' | 'NOT_AVAILABLE';

  /** True if perspective correction was applied to any image */
  perspectiveCorrected: boolean;

  /** Vehicle profile used for reference object dimensions */
  vehicleProfileUsed: string | null;

  /** Reference objects detected (wheel, licence_plate, headlamp_spacing, etc.) */
  referenceObjectsSummary: string[];

  /** Measurement limitations noted by VGE */
  measurementLimitations: string[];

  /** Evidence acquisition recommendation when source quality is poor */
  evidenceAcquisitionRecommendation: string | null;
}

export interface StructuralGeometry {
  crushDepth: CrushDepthEvidence;

  /** Structural displacement (lateral or axial movement of structural members) */
  structuralDisplacementM: OptionalMeasurement;

  /** Overlap percentage (fraction of vehicle width in the impact zone) */
  overlapPct: OptionalMeasurement;

  /** Impact direction (frontal, rear, side_driver, side_passenger, rollover, etc.) */
  impactDirection: string | null;

  /** Primary impact zone on the vehicle body */
  impactZone: string | null;

  /** Vehicle orientation at time of impact (degrees from straight-ahead) */
  vehicleOrientationDeg: OptionalMeasurement;
}

// ── Energy measurements ───────────────────────────────────────────────────────

export interface EnergyEvidence {
  /**
   * Total deformation energy absorbed by the vehicle structure (Joules).
   * Derived from per-component Stage 6 vision estimates.
   * Used by M5 Vision Deformation Energy speed method.
   */
  totalDeformationEnergyJ: OptionalMeasurement;

  /**
   * Per-component deformation energy breakdown.
   * Preserved for load path analysis and latent damage prediction.
   */
  componentEnergies: Array<{
    componentName: string;
    deformationEnergyJ: number;
    crushDepthM: number | null;
    structuralDisplacementM: number | null;
    damageFractionEstimate: number | null;
    visionConfidenceScore: number | null;
    severity: string;
    zone: string;
  }>;

  /** Kinetic energy at impact (Joules) — derived from consensus speed + vehicle mass */
  kineticEnergyJ: OptionalMeasurement;

  /** Energy efficiency factor used (fraction of KE absorbed as structural deformation) */
  deformationEfficiencyFactor: number | null;
}

// ── Speed measurements ────────────────────────────────────────────────────────

export interface SpeedEvidence {
  /**
   * Canonical impact speed — ensemble consensus.
   * Consumers MUST use this field for speed-dependent calculations.
   */
  canonical: OptionalMeasurement;  // km/h

  /** Per-method results from the speed ensemble */
  methods: Array<{
    method: string;
    label: string;
    speedKmh: number | null;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    confidenceWeight: number;
    basis: string;
    ran: boolean;
    isLowerBoundOnly: boolean;
  }>;

  /** Number of methods that produced a usable estimate */
  methodsRan: number;

  /** Overall confidence level */
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';

  /** Evidence agreement percentage (0–100) */
  evidenceAgreementPct: number;

  /** Human-readable agreement note */
  evidenceAgreementNote: string;

  /** True if any two methods diverge by > 40% */
  highDivergence: boolean;

  /** Structured divergence explanation when highDivergence is true */
  divergenceExplanation?: Array<{
    methodPair: [string, string];
    speedsKmh: [number, number];
    gapKmh: number;
    gapPct: number;
    keyInputDifference: string;
    explanation: string;
    recommendedAction: string;
  }>;

  /** Cross-validation spread */
  crossValidation?: {
    spread: number;
    outlierMethods: string[];
    recommendation: string;
  };

  /** Crush depth plausibility check result */
  crushDepthPlausibilityCheck?: {
    triggered: boolean;
    severity: 'CRITICAL' | 'WARNING' | 'OK';
    impliedMinSpeedKmh: number;
    visionDerivedMaxSpeedKmh: number | null;
    gapKmh: number | null;
    flagMessage: string;
    recommendedAction: string;
    evidenceBasis: string[];
  };

  /** Physical impossibility flag */
  physicalImpossibilityFlag?: {
    triggered: boolean;
    consensusBeforeClamp: number;
    clampedTo: number;
    reason: string;
    possibleExplanations: string[];
  };

  /** Hard lower bound from deployment evidence (km/h) */
  lowerBoundKmh: number | null;

  /** Claimed speed from driver statement (km/h) */
  claimedSpeedKmh: number | null;

  /** Speed limit at scene (km/h) */
  speedLimitKmh: number | null;

  /** Delta-V (change in velocity at impact, km/h) */
  deltaVKmh: OptionalMeasurement;
}

// ── Latent damage ─────────────────────────────────────────────────────────────

export interface LatentDamageEvidence {
  /**
   * Per-system hidden damage probability with full reasoning chain.
   * Replaces the coarse rule-based probability table.
   */
  systems: Array<{
    system: string;          // e.g. "Engine", "Transmission", "LH Chassis Rail"
    probabilityPct: number;  // 0–100
    confidence: number;      // 0–1
    reasoning: string;       // Human-readable explanation
    loadPathBasis: string;   // Which load path implicates this system
    energyBasis: string;     // Energy / crush depth basis for the probability
    evidenceBasis: string[]; // List of evidence items that support this prediction
  }>;

  /** Overall latent damage risk level */
  overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

  /** Recommended inspection actions */
  recommendedInspections: string[];
}

// ── Physics integrity ─────────────────────────────────────────────────────────

export interface PhysicsIntegrityCheck {
  passed: boolean;
  flags: Array<{
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    code: string;
    description: string;
    affectedMeasurements: string[];
    recommendation: string;
  }>;
}

// ── Top-level PhysicsTruth object ─────────────────────────────────────────────

export interface PhysicsTruth {
  /** Schema version — increment when breaking changes are made */
  schemaVersion: '1.0';

  /** UTC timestamp when this object was sealed */
  sealedAt: string;

  /** Claim reference this object belongs to */
  claimRef: string;

  /** Pipeline run ID that produced this object */
  pipelineRunId: string | null;

  // ── Vehicle context ──────────────────────────────────────────────────────
  vehicle: {
    make: string | null;
    model: string | null;
    year: number | null;
    bodyType: string | null;
    massKg: number | null;
    powertrainType: string | null;
    /** True if body-on-frame (vs monocoque/unibody) */
    bodyOnFrame: boolean | null;
  };

  // ── Geometry ─────────────────────────────────────────────────────────────
  geometry: StructuralGeometry;

  // ── Energy ───────────────────────────────────────────────────────────────
  energy: EnergyEvidence;

  // ── Speed ────────────────────────────────────────────────────────────────
  speed: SpeedEvidence;

  // ── Latent damage ────────────────────────────────────────────────────────
  latentDamage: LatentDamageEvidence | null;

  /** Wave 2 — Structural Load Path Engine full result */
  structuralLoadPath: import('./stage-6-5c-slpe').SLPEResult | null;

  // ── Braking distance ─────────────────────────────────────────────────────
  /** Braking distance at consensus speed: d = v²/(2μg). Null if no speed available. */
  brakingDistanceM: number | null;
  /** Friction coefficient μ used for braking distance (0.3–0.7 depending on road surface) */
  brakingFrictionCoefficient: number | null;

  // ── Impact causation ─────────────────────────────────────────────────────
  /** Who was in motion in reverse at the time of impact (rear-impact scenarios only) */
  impactCausation: import('./types').ImpactCausation | null;
  /** Speed ceiling imposed by causation type (km/h). Null if no ceiling applies. */
  causationSpeedCeilingKmh: number | null;
  /** True if a SELF_REVERSING narrative contradicts named third-party evidence */
  reversingNarrativeContradiction: boolean | null;
  /** True if consensus speed exceeds the causation speed ceiling */
  causationSpeedExceedsCeiling: boolean | null;

  // ── Physics integrity ────────────────────────────────────────────────────
  integrityCheck: PhysicsIntegrityCheck;

  // ── Evidence completeness ────────────────────────────────────────────────
  evidenceCompleteness: {
    /** True if at least one SUITABLE direct photo was available for VGE */
    hasDirectPhotos: boolean;
    /** True if VGE ran and produced a calibrated crush depth */
    hasVGECalibration: boolean;
    /** True if VGR ran with 2+ images */
    hasVGRConsensus: boolean;
    /** True if airbag/pretensioner deployment is confirmed */
    hasDeploymentEvidence: boolean;
    /** True if a document-stated crush depth was available */
    hasDocumentStatedDepth: boolean;
    /** Number of damage photos processed */
    damagePhotoCount: number;
    /** Number of photos that produced usable VGE calibration */
    calibratedPhotoCount: number;
    /** Overall data quality score 0–100 */
    dataQualityScore: number;
    /** Human-readable completeness summary */
    completenessNote: string;
  };
}

// ── Physics constants ────────────────────────────────────────────────────────
/**
 * Campbell stiffness coefficient B (N/m) — typical passenger car front-end.
 * Used in v = C × √(B/m) where C is crush depth (m) and m is vehicle mass (kg).
 * Dimensional check: [m] × √([N/m]/[kg]) = [m] × √([kg·m/s²/m]/[kg]) = [m] × [1/s] = [m/s] ✓
 */
const CAMPBELL_B_NM = 1_200_000; // N/m

// ── Builder ───────────────────────────────────────────────────────────────────
/**
 * Build a PhysicsTruth object from the outputs of all pipeline stages.
 * This is the ONLY function that should create a PhysicsTruth.
 * It implements the provenance hierarchy for crush depth and all other
 * measurements, ensuring the canonical value always uses the best source.
 */
export function buildPhysicsTruth(input: {
  claimRef: string;
  pipelineRunId: string | null;
  vehicle: PhysicsTruth['vehicle'];
  vgeResult: import('./stage-6-5a-vge').VGECalibrationResult | null;
  vgrResult: import('./stage-6-5b-vgr').VGRConsensusResult | null;
  stage6Components: EnergyEvidence['componentEnergies'];
  stage6LlmCrushDepthM: number | null;
  speedEnsemble: import('./speedInferenceEnsemble').SpeedInferenceResult | null;
  deltaVKmh: number | null;
  claimedSpeedKmh: number | null;
  speedLimitKmh: number | null;
  airbagDeployment: boolean;
  seatbeltPretensioner: boolean;
  impactDirection: string | null;
  impactZone: string | null;
  slpeResult?: import('./stage-6-5c-slpe').SLPEResult | null;
  // Impact causation classification from Stage 5
  impactCausation?: import('./types').ImpactCausation | null;
  causationSpeedCeilingKmh?: number | null;
  reversingNarrativeContradiction?: boolean | null;
}): PhysicsTruth {
  const now = new Date().toISOString();

  // ── Crush depth: resolve canonical from provenance hierarchy ──────────────
  const vgrDepthM = input.vgrResult?.consensusCrushDepthM ?? null;
  const vgrMinM   = input.vgrResult?.consensusCrushDepthMinM ?? null;
  const vgrMaxM   = input.vgrResult?.consensusCrushDepthMaxM ?? null;
  const vgrConf   = input.vgrResult?.overallConfidence ?? 0;

  const vgeDepthM = input.vgeResult?.calibratedCrushDepthM ?? null;
  const vgeMinM   = input.vgeResult?.calibratedCrushDepthMinM ?? null;
  const vgeMaxM   = input.vgeResult?.calibratedCrushDepthMaxM ?? null;
  const vgeConf   = input.vgeResult?.overallCalibrationConfidence ?? 0;

  const llmDepthM = input.stage6LlmCrushDepthM;

  let canonicalCrushDepth: OptionalMeasurement = null;
  let canonicalSourceReason = 'No crush depth measurement available';

  if (vgrDepthM != null && vgrMinM != null && vgrMaxM != null && vgrConf > 0) {
    canonicalCrushDepth = {
      value: vgrDepthM,
      min: vgrMinM,
      max: vgrMaxM,
      confidence: vgrConf,
      source: 'VGR_CONSENSUS',
      provenanceNote: `Multi-image photogrammetric consensus from ${input.vgrResult!.imageEntries.filter(e => e.contributesToConsensus).length} images (view-angle weighted). Agreement: ${input.vgrResult!.agreementAssessment.agreementLevel}.`,
    };
    canonicalSourceReason = 'VGR multi-image consensus selected (highest quality — view-angle-weighted photogrammetric measurement)';
  } else if (vgeDepthM != null && vgeMinM != null && vgeMaxM != null && vgeConf > 0) {
    canonicalCrushDepth = {
      value: vgeDepthM,
      min: vgeMinM,
      max: vgeMaxM,
      confidence: vgeConf,
      source: 'VGE_CALIBRATED',
      provenanceNote: `Single-image photogrammetric calibration. Reference objects: ${(input.vgeResult!.geometryEvidenceBlock.referenceObjectsSummary ?? []).join(', ') || 'none recorded'}.`,
    };
    canonicalSourceReason = 'VGE single-image calibration selected (VGR not available — only one suitable image)';
  } else if (llmDepthM != null && llmDepthM > 0) {
    const uncertainty = llmDepthM * 0.35; // ±35% for uncalibrated LLM estimate
    canonicalCrushDepth = {
      value: llmDepthM,
      min: Math.max(0, llmDepthM - uncertainty),
      max: llmDepthM + uncertainty,
      confidence: 0.45,
      source: 'STAGE6_LLM_VISION',
      provenanceNote: 'Uncalibrated LLM visual estimate from Stage 6 damage analysis. No photogrammetric scale reference available. Uncertainty ±35%.',
    };
    canonicalSourceReason = 'LLM visual estimate used (no photogrammetric calibration available — no SUITABLE direct photos or no reference objects detected)';
  }

  // ── VGR view angle breakdown ──────────────────────────────────────────────
  const vgrEntries = input.vgrResult?.imageEntries ?? [];
  const vgrViewAngles = {
    frontal: vgrEntries.filter(e => e.viewAngle === 'FRONTAL').length,
    angle45: vgrEntries.filter(e => e.viewAngle === 'ANGLE_45').length,
    side:    vgrEntries.filter(e => e.viewAngle === 'SIDE').length,
    unknown: vgrEntries.filter(e => e.viewAngle === 'UNKNOWN').length,
  };

  // ── Deformation energy ────────────────────────────────────────────────────
  const totalDeformationEnergyJ = input.stage6Components.reduce(
    (sum, c) => sum + (c.deformationEnergyJ ?? 0), 0
  );
  const eta = getDeformEfficiencyFactor(input.impactDirection);

  // ── Speed canonical ───────────────────────────────────────────────────────
  const ensemble = input.speedEnsemble;
  let canonicalSpeed: OptionalMeasurement = null;
  if (ensemble?.consensusSpeedKmh != null) {
    const ci = ensemble.confidenceInterval;
    canonicalSpeed = {
      value: ensemble.consensusSpeedKmh,
      min: ci?.[0] ?? ensemble.consensusSpeedKmh * 0.85,
      max: ci?.[1] ?? ensemble.consensusSpeedKmh * 1.15,
      confidence: ensemble.overallConfidence === 'HIGH' ? 0.85 :
                  ensemble.overallConfidence === 'MEDIUM' ? 0.65 : 0.40,
      source: 'ENSEMBLE_CONSENSUS',
      provenanceNote: `Weighted ensemble of ${ensemble.methodsRan} method(s). Evidence agreement: ${ensemble.evidenceAgreementPct}%. ${ensemble.evidenceAgreementNote}`,
    };
  }

  // ── Delta-V ───────────────────────────────────────────────────────────────
  let deltaV: OptionalMeasurement = null;
  if (input.deltaVKmh != null) {
    deltaV = {
      value: input.deltaVKmh,
      min: input.deltaVKmh * 0.80,
      max: input.deltaVKmh * 1.20,
      confidence: canonicalSpeed?.confidence ?? 0.50,
      source: 'PHYSICS_DERIVED',
      provenanceNote: 'Derived from consensus impact speed using momentum conservation. Uncertainty ±20%.',
    };
  }

  // ── Kinetic energy ────────────────────────────────────────────────────────
  let kineticEnergyJ: OptionalMeasurement = null;
  if (canonicalSpeed && input.vehicle.massKg) {
    const vMs = canonicalSpeed.value / 3.6;
    const ke = 0.5 * input.vehicle.massKg * vMs * vMs;
    kineticEnergyJ = {
      value: ke,
      min: 0.5 * input.vehicle.massKg * Math.pow(canonicalSpeed.min / 3.6, 2),
      max: 0.5 * input.vehicle.massKg * Math.pow(canonicalSpeed.max / 3.6, 2),
      confidence: canonicalSpeed.confidence,
      source: 'PHYSICS_DERIVED',
      provenanceNote: `KE = ½mv² = ½ × ${input.vehicle.massKg} kg × (${canonicalSpeed.value.toFixed(1)} km/h)²`,
    };
  }

  // ── Evidence completeness ─────────────────────────────────────────────────
  const calibratedPhotoCount = (input.vgeResult?.perImageResults ?? [])
    .filter(r => r.scaleAvailable).length;
  const damagePhotoCount = (input.vgeResult?.perImageResults ?? []).length;
  const hasVGECalibration = (input.vgeResult?.calibrationAvailable ?? false);
  const hasVGRConsensus = (input.vgrResult?.reconciliationAvailable ?? false) &&
    (input.vgrResult?.imageEntries.filter(e => e.contributesToConsensus).length ?? 0) >= 2;
  const hasDeploymentEvidence = input.airbagDeployment || input.seatbeltPretensioner;
  const hasDirectPhotos = damagePhotoCount > 0;
  const hasDocumentStatedDepth = false; // future: detect from claim documents

  // Data quality score: weighted sum of evidence quality signals
  let dqs = 0;
  if (hasVGRConsensus)       dqs += 35;
  else if (hasVGECalibration) dqs += 20;
  else if (llmDepthM != null) dqs += 10;
  if (hasDeploymentEvidence)  dqs += 20;
  if ((ensemble?.methodsRan ?? 0) >= 3) dqs += 25;
  else if ((ensemble?.methodsRan ?? 0) >= 2) dqs += 15;
  else if ((ensemble?.methodsRan ?? 0) >= 1) dqs += 5;
  if (calibratedPhotoCount >= 3) dqs += 20;
  else if (calibratedPhotoCount >= 1) dqs += 10;

  const completenessNote = dqs >= 80
    ? 'High-quality evidence set — photogrammetric calibration and multiple independent speed methods available.'
    : dqs >= 50
    ? 'Moderate evidence quality — at least one calibrated measurement available. Additional photos would improve precision.'
    : 'Limited evidence quality — speed estimate relies primarily on severity-anchored inference. Recommend requesting additional damage photographs.';

  // ── Physics integrity checks ──────────────────────────────────────────────
  const integrityFlags: PhysicsIntegrityCheck['flags'] = [];

  // Check: large crush depth but low energy
  if (canonicalCrushDepth && totalDeformationEnergyJ > 0) {
    // E = ½kC²  [N/m × m² = N·m = J] ✓  — use CAMPBELL_B_NM for consistency with all other engines
    const impliedEnergyJ = 0.5 * CAMPBELL_B_NM * Math.pow(canonicalCrushDepth.value, 2);
    if (totalDeformationEnergyJ < impliedEnergyJ * 0.15) {
      integrityFlags.push({
        severity: 'WARNING',
        code: 'CRUSH_ENERGY_MISMATCH',
        description: `Crush depth (${(canonicalCrushDepth.value * 1000).toFixed(0)} mm) implies ~${(impliedEnergyJ / 1000).toFixed(1)} kJ absorbed energy, but component-level energy sum is only ${(totalDeformationEnergyJ / 1000).toFixed(1)} kJ (${((totalDeformationEnergyJ / impliedEnergyJ) * 100).toFixed(0)}% of expected). Possible causes: partial photo coverage, energy underestimated by vision model, or crush depth overestimated.`,
        affectedMeasurements: ['crushDepth', 'totalDeformationEnergyJ'],
        recommendation: 'Review component deformation energy estimates. Request additional photos of the crush zone.',
      });
    }
  }

  // Check: high speed but tiny deformation
  if (canonicalSpeed && canonicalCrushDepth) {
    // From KE = ½kC² → C = v × √(m/k)
    // Dimensional check: [m/s] × √([kg]/[N/m]) = [m/s] × √([kg·m/N]) = [m/s] × √([s²]) = [m] ✓
    // 1.5× factor: energy shared with second vehicle / road surface
    const v_ms_chk = canonicalSpeed.value / 3.6;
    const massKgEst = input.vehicle.massKg ?? 1200;
    const minExpectedCrushM = v_ms_chk * Math.sqrt(massKgEst / (CAMPBELL_B_NM * 1.5));
    if (canonicalCrushDepth.value < minExpectedCrushM * 0.3) {
      integrityFlags.push({
        severity: 'WARNING',
        code: 'SPEED_CRUSH_MISMATCH',
        description: `Consensus speed (${canonicalSpeed.value.toFixed(0)} km/h) implies minimum crush depth ~${(minExpectedCrushM * 1000).toFixed(0)} mm, but measured crush is only ${(canonicalCrushDepth.value * 1000).toFixed(0)} mm. Possible causes: energy absorbed by second vehicle, speed overestimated, or crush depth measurement from a non-primary impact zone.`,
        affectedMeasurements: ['speed.canonical', 'crushDepth.canonical'],
        recommendation: 'Verify crush depth measurement is from the primary impact zone. Review speed ensemble for outlier methods.',
      });
    }
  }

  // Check: VGR conflict
  if (input.vgrResult?.agreementAssessment.agreementLevel === 'CONFLICTING') {
    integrityFlags.push({
      severity: 'WARNING',
      code: 'VGR_IMAGE_CONFLICT',
      description: `Cross-image crush depth estimates conflict significantly (spread: ${input.vgrResult.agreementAssessment.spreadMm.toFixed(0)} mm, ${input.vgrResult.agreementAssessment.spreadPct.toFixed(0)}%). ${input.vgrResult.agreementAssessment.conflictDescription ?? ''}`,
      affectedMeasurements: ['crushDepth.vgrConsensus'],
      recommendation: 'Review individual image calibration results. Possible causes: different damage zones photographed, perspective distortion, or non-uniform deformation.',
    });
  }

  // Check: causation speed ceiling breach
  // If the causation type imposes a physical speed ceiling (e.g. SELF_REVERSING ≤ 20 km/h)
  // and the consensus speed exceeds it, flag as a CRITICAL integrity failure.
  const causationCeiling = input.causationSpeedCeilingKmh ?? null;
  const consensusSpeedKmh = canonicalSpeed?.value ?? null;
  const causationSpeedExceedsCeiling: boolean | null =
    causationCeiling !== null && consensusSpeedKmh !== null
      ? consensusSpeedKmh > causationCeiling
      : null;
  if (causationSpeedExceedsCeiling === true) {
    integrityFlags.push({
      severity: 'CRITICAL',
      code: 'CAUSATION_SPEED_CEILING_BREACH',
      description: `Consensus speed (${consensusSpeedKmh!.toFixed(0)} km/h) exceeds the physical ceiling for causation type "${input.impactCausation}" (max ${causationCeiling} km/h). Reverse-gear vehicles cannot exceed ~20 km/h. The stated speed is physically impossible for the claimed scenario.`,
      affectedMeasurements: ['speed.canonical', 'impactCausation'],
      recommendation: 'Review driver narrative for accuracy. If speed is correct, causation classification may be wrong (e.g. claimant was stationary, not reversing).',
    });
  }
  // Check: reversing narrative contradiction
  if (input.reversingNarrativeContradiction === true) {
    integrityFlags.push({
      severity: 'WARNING',
      code: 'REVERSING_NARRATIVE_CONTRADICTION',
      description: 'Narrative states claimant was reversing (SELF_REVERSING), but a named third party and/or police report is also present. A self-reversing scenario with a named third party typically means the third party struck the reversing claimant — the causation should be THIRD_PARTY_REAR_STRIKE or THIRD_PARTY_REVERSED_INTO_CLAIMANT. Adjuster review required.',
      affectedMeasurements: ['impactCausation', 'accidentDetails.reversingNarrativeContradiction'],
      recommendation: 'Request clarification from claimant: was the third party’s vehicle also in motion? Obtain police report to confirm who was at fault.',
    });
  }

  // Compute braking distance from canonical speed (d = v² / 2μg)
  const roadSurfaceForBraking = (input.impactDirection ?? '').toLowerCase();
  const brakingMu = roadSurfaceForBraking.includes('wet') || roadSurfaceForBraking.includes('rain') ? 0.4
    : roadSurfaceForBraking.includes('gravel') || roadSurfaceForBraking.includes('dirt') ? 0.3
    : 0.7; // dry asphalt default
  const brakingSpeedMs = canonicalSpeed ? canonicalSpeed.value / 3.6 : null;
  const brakingDistanceM = brakingSpeedMs !== null
    ? Math.round((brakingSpeedMs * brakingSpeedMs) / (2 * brakingMu * 9.81) * 100) / 100
    : null;

  return {
    schemaVersion: '1.0',
    sealedAt: now,
    claimRef: input.claimRef,
    pipelineRunId: input.pipelineRunId,

    vehicle: input.vehicle,

    geometry: {
      crushDepth: {
        canonical: canonicalCrushDepth,
        vgrConsensus: vgrDepthM != null ? {
          value: vgrDepthM,
          min: vgrMinM ?? vgrDepthM * 0.85,
          max: vgrMaxM ?? vgrDepthM * 1.15,
          confidence: vgrConf,
          source: 'VGR_CONSENSUS',
          provenanceNote: `VGR multi-image consensus. Agreement: ${input.vgrResult!.agreementAssessment.agreementLevel}.`,
        } : null,
        vgeSingleImage: vgeDepthM != null ? {
          value: vgeDepthM,
          min: vgeMinM ?? vgeDepthM * 0.85,
          max: vgeMaxM ?? vgeDepthM * 1.15,
          confidence: vgeConf,
          source: 'VGE_CALIBRATED',
          provenanceNote: 'VGE single-image calibration.',
        } : null,
        llmVisionEstimate: llmDepthM != null ? {
          value: llmDepthM,
          min: Math.max(0, llmDepthM * 0.65),
          max: llmDepthM * 1.35,
          confidence: 0.45,
          source: 'STAGE6_LLM_VISION',
          provenanceNote: 'Uncalibrated LLM visual estimate. Uncertainty ±35%.',
        } : null,
        canonicalSourceReason,
        vgrContributingImages: vgrEntries.filter(e => e.contributesToConsensus).length,
        vgrViewAngles,
        vgrAgreementLevel: input.vgrResult?.agreementAssessment.agreementLevel ?? 'NOT_AVAILABLE',
        perspectiveCorrected: input.vgeResult?.perImageResults.some(r => r.perspectiveCorrected) ?? false,
        vehicleProfileUsed: input.vgeResult?.vehicleProfileUsed ?? null,
        referenceObjectsSummary: input.vgeResult?.geometryEvidenceBlock.referenceObjectsSummary ?? [],
        measurementLimitations: input.vgeResult?.geometryEvidenceBlock.limitations ?? [],
        evidenceAcquisitionRecommendation: input.vgeResult?.geometryEvidenceBlock.evidenceAcquisitionRecommendation ?? null,
      },
      structuralDisplacementM: null, // populated from Stage 6 component max
      overlapPct: null,              // future: VGE overlap detection
      impactDirection: input.impactDirection,
      impactZone: input.impactZone,
      vehicleOrientationDeg: null,   // future: multi-image orientation estimation
    },

    energy: {
      totalDeformationEnergyJ: totalDeformationEnergyJ > 0 ? {
        value: totalDeformationEnergyJ,
        min: totalDeformationEnergyJ * 0.70,
        max: totalDeformationEnergyJ * 1.30,
        confidence: 0.55,
        source: 'STAGE6_LLM_VISION',
        provenanceNote: `Sum of per-component deformation energy estimates from Stage 6 vision analysis (${input.stage6Components.length} components). Uncertainty ±30%.`,
      } : null,
      componentEnergies: input.stage6Components,
      kineticEnergyJ,
      deformationEfficiencyFactor: eta,
    },

    speed: {
      canonical: canonicalSpeed,
      methods: ensemble?.methods.map(m => ({
        method: m.method,
        label: m.label,
        speedKmh: m.speedKmh,
        confidence: m.confidence,
        confidenceWeight: m.confidenceWeight,
        basis: m.basis,
        ran: m.ran,
        isLowerBoundOnly: m.isLowerBoundOnly,
      })) ?? [],
      methodsRan: ensemble?.methodsRan ?? 0,
      overallConfidence: ensemble?.overallConfidence ?? 'LOW',
      evidenceAgreementPct: ensemble?.evidenceAgreementPct ?? 0,
      evidenceAgreementNote: ensemble?.evidenceAgreementNote ?? 'No speed methods ran.',
      highDivergence: ensemble?.highDivergence ?? false,
      divergenceExplanation: ensemble?.divergenceExplanation,
      crossValidation: ensemble?.crossValidation,
      crushDepthPlausibilityCheck: ensemble?.crushDepthPlausibilityCheck,
      physicalImpossibilityFlag: ensemble?.physicalImpossibilityFlag,
      lowerBoundKmh: ensemble?.lowerBoundKmh ?? null,
      claimedSpeedKmh: input.claimedSpeedKmh,
      speedLimitKmh: input.speedLimitKmh,
      deltaVKmh: deltaV,
    },

    latentDamage: input.slpeResult ? {
      systems: [
        { system: 'Engine',       probabilityPct: input.slpeResult.latentDamageProbability.engine,       confidence: input.slpeResult.confidence, reasoning: 'SLPE load path cascade', loadPathBasis: 'Front load path', energyBasis: 'Crush depth energy model', evidenceBasis: [] },
        { system: 'Transmission', probabilityPct: input.slpeResult.latentDamageProbability.transmission, confidence: input.slpeResult.confidence, reasoning: 'SLPE load path cascade', loadPathBasis: 'Drivetrain path',   energyBasis: 'Crush depth energy model', evidenceBasis: [] },
        { system: 'Suspension',   probabilityPct: input.slpeResult.latentDamageProbability.suspension,   confidence: input.slpeResult.confidence, reasoning: 'SLPE load path cascade', loadPathBasis: 'Subframe path',    energyBasis: 'Crush depth energy model', evidenceBasis: [] },
        { system: 'Frame',        probabilityPct: input.slpeResult.latentDamageProbability.frame,        confidence: input.slpeResult.confidence, reasoning: 'SLPE load path cascade', loadPathBasis: 'Chassis rail',     energyBasis: 'Crush depth energy model', evidenceBasis: [] },
        { system: 'Electrical',   probabilityPct: input.slpeResult.latentDamageProbability.electrical,   confidence: input.slpeResult.confidence, reasoning: 'SLPE load path cascade', loadPathBasis: 'Wiring harness',   energyBasis: 'Crush depth energy model', evidenceBasis: [] },
      ],
      overallRiskLevel: input.slpeResult.structuralIntegrityRisk === 'severe' ? 'CRITICAL'
        : input.slpeResult.structuralIntegrityRisk === 'high' ? 'HIGH'
        : input.slpeResult.structuralIntegrityRisk === 'moderate' ? 'MODERATE' : 'LOW',
      recommendedInspections: input.slpeResult.penetratedComponents
        .filter((c: any) => c.inspectionRequired)
        .map((c: any) => `Inspect ${c.name} (${c.zone})`),
    } : null,

    structuralLoadPath: input.slpeResult ?? null,

    brakingDistanceM,
    brakingFrictionCoefficient: brakingDistanceM !== null ? brakingMu : null,

    impactCausation: input.impactCausation ?? null,
    causationSpeedCeilingKmh: input.causationSpeedCeilingKmh ?? null,
    reversingNarrativeContradiction: input.reversingNarrativeContradiction ?? null,
    causationSpeedExceedsCeiling,

    integrityCheck: {
      passed: integrityFlags.filter(f => f.severity === 'CRITICAL').length === 0,
      flags: integrityFlags,
    },

    evidenceCompleteness: {
      hasDirectPhotos,
      hasVGECalibration,
      hasVGRConsensus,
      hasDeploymentEvidence,
      hasDocumentStatedDepth,
      damagePhotoCount,
      calibratedPhotoCount,
      dataQualityScore: Math.min(100, dqs),
      completenessNote,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFORM_EFFICIENCY: Record<string, number> = {
  frontal: 0.65, rear: 0.60, side_driver: 0.55, side_passenger: 0.55,
  rollover: 0.45, multi_impact: 0.50, unknown: 0.60,
};

function getDeformEfficiencyFactor(direction: string | null | undefined): number {
  if (!direction) return 0.60;
  return DEFORM_EFFICIENCY[direction.toLowerCase()] ?? 0.60;
}
