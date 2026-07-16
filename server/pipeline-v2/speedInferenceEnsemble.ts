/**
 * speedInferenceEnsemble.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-method impact speed inference ensemble for accident reconstruction.
 *
 * DESIGN PHILOSOPHY
 * ─────────────────
 * This ensemble reasons like a forensic engineer: each independent evidence
 * stream contributes a speed estimate, contradictions between streams are
 * surfaced explicitly, and confidence DECREASES when evidence conflicts.
 *
 * The goal is not to produce a single speed number that satisfies the model.
 * The goal is to reconcile all physical evidence and explain inconsistencies.
 * That is the difference between an AI calculator and an AI forensic analyst.
 *
 * Key principles:
 *
 * 1. INDEPENDENCE — methods must have independent error modes to add information.
 *    M1 (Campbell) and the old M5 Path A used the same crush depth with the same
 *    formula. Agreement between them was not confidence — it was the same
 *    measurement counted twice. M5 Path A has been removed. M1 is the single
 *    Campbell slot.
 *
 * 2. DEFORMATION ENERGY AS INDEPENDENT METHOD (M5) — the sum of component-level
 *    deformation energies from Stage 6 vision analysis is a direct physical
 *    measurement independent of crush depth geometry. Energy efficiency correction
 *    (η) converts absorbed energy to total kinetic energy.
 *    Source: Strother et al. 1986, SAE 860924 (efficiency factor only).
 *
 * 3. M4 IS A WEIGHTED EVIDENCE CONTRIBUTOR, NOT A FLOOR — an airbag is not a
 *    speed sensor. Deployment depends on deceleration pulse, crash pulse duration,
 *    vehicle structure, sensor location, and manufacturer calibration. It tells
 *    you the vehicle experienced a crash event severe enough to trigger the
 *    restraint algorithm — not the exact speed. M4 contributes a point estimate
 *    (28 km/h typical) to the weighted mean with weight 0.40. The hard lower
 *    bound (20 km/h) is applied POST-CONSENSUS as a sanity check only. If the
 *    consensus falls below it, a physicalImpossibilityFlag is raised and the
 *    contradiction is explained — not silently overridden.
 *
 * 4. SEVERITY-ANCHORED INFERENCE (M6) — a human assessor recognises a damage
 *    signature: front structure deformation, radiator support movement, both
 *    headlamps destroyed, airbag deployed, suspension involvement. They do not
 *    calculate one formula. They recognise a pattern consistent with a range of
 *    crash energy. M6 introduces this contextual reasoning using published crash
 *    energy signature data. Language is deliberately non-prescriptive: this is a
 *    "severity-anchored estimate based on comparable crash energy signatures and
 *    observed damage pattern" — not a direct speed claim from a specific test.
 *    Weight: 0.35 (lower than direct measurements — used as a prior).
 *
 * 5. METHOD DISAGREEMENT SCORING — confidence DECREASES when evidence conflicts.
 *    A spread of 22/28/57 km/h does not produce HIGH confidence. It produces a
 *    structured disagreement report with an evidenceAgreementPct score. The
 *    adjuster sees: "Evidence agreement: 62% — Campbell and airbag estimates
 *    align, severity model indicates higher energy event." That is defensible.
 *
 * METHODS
 * ───────
 * M1 — Campbell's Stiffness Formula (crush depth × vehicle stiffness)
 *      V = √(2 × k × C² / m)
 *      depthSource='document' → HIGH, weight 0.80
 *      depthSource='vision'   → MEDIUM, weight 0.55
 *      depthSource='inferred' → LOW, weight 0.00 (excluded from consensus)
 *
 * M2 — Energy-Momentum Balance — DISABLED (repair cost is market-dependent)
 *
 * M3 — Impulse-Momentum — DISABLED (requires primary contact patch area)
 *
 * M4 — Deployment Threshold (FMVSS 208 / Euro NCAP)
 *      Point estimate: 28 km/h (airbag), 18 km/h (pretensioner). Weight: 0.40.
 *      Hard lower bound (20 km/h) applied post-consensus as sanity check only.
 *
 * M5 — Vision Deformation Energy (component-level energy sum from Stage 6)
 *      V = √(2 × E_total / (m × η))
 *      Single-zone only (damagedZoneCount ≤ 2). Weight: 0.45–0.65.
 *
 * M6 — Severity-Anchored Inference (crash energy signature data)
 *      Midpoint of published speed range for damage severity tier. Weight: 0.35.
 *      Source: SAE 2002-01-0547, NHTSA NCAP barrier test data.
 *
 * CONSENSUS ALGORITHM
 * ───────────────────
 * 1. All methods with ran=true and confidenceWeight > 0 join the weighted mean.
 * 2. Outlier rejection: methods > 2σ from initial mean are down-weighted 50%.
 * 3. Weighted mean → consensus speed.
 * 4. Method disagreement scoring: evidenceAgreementPct = f(spread, methodCount).
 *    overallConfidence is downgraded when agreement is low.
 * 5. Post-consensus: if consensus < hard lower bound AND deployment confirmed,
 *    raise physicalImpossibilityFlag and clamp. The adjuster sees the gap.
 * 6. 90% CI: ± (weighted stdDev × 1.645).
 * 7. High divergence: any two methods differ by > 40% → structured explanation.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type MethodConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MethodEstimate {
  method: 'CAMPBELL' | 'ENERGY_MOMENTUM' | 'IMPULSE' | 'DEPLOYMENT_THRESHOLD' | 'VISION_DEFORMATION' | 'SEVERITY_ANCHORED';
  label: string;
  speedKmh: number | null;
  /** Kept for schema compatibility. No active method uses lower-bound-only mode. */
  isLowerBoundOnly: boolean;
  confidenceWeight: number;
  confidence: MethodConfidence;
  basis: string;
  ran: boolean;
}

export interface SpeedInferenceResult {
  /** Consensus speed in km/h (weighted mean of all contributing methods) */
  consensusSpeedKmh: number | null;
  /** 90% confidence interval [low, high] in km/h */
  confidenceInterval: [number, number] | null;
  /**
   * Hard lower bound from deployment evidence.
   * Applied post-consensus as a sanity check only — not used to override the mean.
   */
  lowerBoundKmh: number | null;
  /** Per-method results for display and audit */
  methods: MethodEstimate[];
  /**
   * Overall confidence — DECREASES when methods disagree.
   * HIGH: spread ≤ 10 km/h and ≥ 2 medium/high methods agree.
   * MEDIUM: spread 10–25 km/h or methods partially align.
   * LOW: spread > 25 km/h or only low-confidence methods ran.
   */
  overallConfidence: MethodConfidence;
  /**
   * Evidence agreement percentage (0–100).
   * Measures how closely the contributing methods agree with each other.
   * 100% = all methods produce the same estimate.
   * Low values indicate contradictory evidence that requires investigation.
   */
  evidenceAgreementPct: number;
  /**
   * Human-readable explanation of the agreement level.
   * e.g. "Campbell and airbag estimates align; severity model indicates higher energy event."
   */
  evidenceAgreementNote: string;
  /** True if any two methods diverge by > 40% — warrants adjuster review */
  highDivergence: boolean;
  /** Human-readable summary for the report */
  summary: string;
  /** Number of methods that successfully produced a point estimate */
  methodsRan: number;
  /**
   * When highDivergence is true: structured explanation of WHY methods diverge.
   */
  divergenceExplanation?: {
    methodPair: [string, string];
    speedsKmh: [number, number];
    gapKmh: number;
    gapPct: number;
    keyInputDifference: string;
    explanation: string;
    recommendedAction: string;
  }[];
  /** Cross-validation spread across all contributing methods */
  crossValidation?: {
    spread: number;
    outlierMethods: string[];
    recommendation: string;
  };
  /**
   * Crush-depth plausibility check: compares Campbell estimate against minimum
   * speed implied by observed damage severity evidence.
   */
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
  /**
   * Physical impossibility flag: raised when post-consensus speed is below the
   * hard lower bound implied by deployment evidence.
   * Replaces the old silent M4 floor with an explicit contradiction report.
   */
  physicalImpossibilityFlag?: {
    triggered: boolean;
    consensusBeforeClamp: number;
    clampedTo: number;
    reason: string;
    possibleExplanations: string[];
  };
}

// ── Vehicle stiffness table (kN/m) ───────────────────────────────────────────
//
// Per-model stiffness values derived from NHTSA NCAP frontal barrier crash test
// data (NHTSA DOT HS 811 144, 2009) and RCAR structural test reports.
// Body-on-frame vehicles have higher stiffness than unibody equivalents.
//
// Lookup priority:
//   1. Per-model key ("make model") — most accurate
//   2. Body-type class fallback     — used when no model match
//
// CALIBRATION: Do not change values without citing a crash test source.

/** Per-model frontal stiffness (kN/m). Key = lower-case "make model" or alias. */
const VEHICLE_STIFFNESS_KNM: Record<string, number> = {
  // ── Honda (unibody) ──
  "honda fit":        750,  // GD1/GE6/GK5 — NHTSA test avg
  "honda fit gd1":    730,  "honda fit gd":   730,
  "honda fit ge6":    750,  "honda fit ge":   750,
  "honda fit gk5":    780,  "honda fit gk":   780,
  "honda jazz":       750,
  "honda cr-v":      1050,  "honda crv":     1050,  // RE4/RM1 unibody SUV
  // ── Toyota ──
  "toyota vitz":      720,  "toyota yaris":   750,  // NCP91/NCP131 small unibody
  "toyota aqua":      780,  "toyota prius c": 780,  // NHP10 hybrid reinforced floor
  "toyota corolla":   950,  // E110/E120/E140/E160 unibody sedan
  "toyota axio":      950,  "toyota allion":  950,
  "toyota belta":     720,  // SCP92 — Vitz-based platform
  "toyota ist":       780,  // NCP60/NCP110
  "toyota passo":     680,  // KGC10/NGC30 — kei-derived, lightest platform
  "toyota runx":      900,  "toyota allex":   900,  // E120 hatchback
  "toyota auris":     950,  // E150/E180 unibody
  "toyota wish":     1000,  // ANE10/ZGE20 MPV
  "toyota vanguard": 1150,  // ACA38 — RAV4-based unibody SUV
  "toyota rav4":     1150,  // XA30/XA40 unibody
  "toyota fortuner": 1450,  // AN160 body-on-frame
  "toyota hilux":    1500,  // GD-6 body-on-frame pickup
  "toyota prado":    1400,  // 150 series body-on-frame
  "toyota land cruiser prado": 1400,
  "toyota land cruiser": 1600,  // 200 series body-on-frame — heaviest platform
  "toyota mark x":   1050,  // X120/X130 FR sedan
  "toyota hiace":    1200,  // H200 van — ladder frame
  "toyota hiace commuter": 1200,
  // ── Nissan ──
  "nissan np200":     950,  "nissan np 200":  950,  // unibody-derived light pickup
  "nissan np300":    1350,  "nissan np 300": 1350,  // D23 body-on-frame
  "nissan navara":   1350,  // D40 body-on-frame
  "nissan almera":    900,  // N16/N17 unibody sedan
  "nissan note":      750,  // E11/E12 supermini
  "nissan sylphy":    950,  // B17 unibody sedan
  "nissan x-trail":  1100,  "nissan xtrail": 1100,  "nissan x trail": 1100,  // T30/T31
  "nissan hardbody": 1300,  "nissan d21":    1300,  "nissan d22":    1300,
  // ── Isuzu ──
  "isuzu d-max":     1500,  "isuzu dmax":    1500,  "isuzu d max":   1500,  // RG body-on-frame
  "isuzu d-teq":     1450,  // TF/RA older gen body-on-frame
  "isuzu mu-x":      1450,  "isuzu mux":     1450,  "isuzu mu x":    1450,  // body-on-frame SUV
  // ── Mazda ──
  "mazda axela":      950,  "mazda 3":        950,  // BK/BL unibody
  "mazda bt-50":     1450,  "mazda bt50":    1450,  // UP/UR body-on-frame
  // ── Ford ──
  "ford ranger":     1500,  // T6/T7 body-on-frame
  "ford everest":    1450,  // UA/P702 body-on-frame SUV
  // ── Body-type class fallbacks (NHTSA DOT HS 811 144, Table 3) ──
  compact:    800,  hatchback:  800,
  sedan:     1000,
  suv:       1200,  crossover: 1100,
  truck:     1400,  pickup:    1400,
  van:       1100,  minivan:   1050,
  sports:    1300,
  bus:       1600,
};

/**
 * Resolve frontal structural stiffness (kN/m) for a vehicle.
 * Lookup order: per-model key → body-type class → sedan default (1000 kN/m).
 *
 * Signature is backward-compatible:
 *   getStiffnessKnm(bodyType)              — legacy single-arg call
 *   getStiffnessKnm(make, model, bodyType) — new three-arg call with per-model lookup
 */
function getStiffnessKnm(
  bodyTypeOrMake: string | null | undefined,
  model?: string | null,
  bodyTypeFallback?: string | null,
): number {
  if (model !== undefined) {
    // Three-arg path: attempt per-model lookup first
    const make = (bodyTypeOrMake ?? '').toLowerCase().replace(/[\s\-_]+/g, ' ').trim();
    const mod  = (model ?? '').toLowerCase().replace(/[\s\-_]+/g, ' ').trim();
    const combined = `${make} ${mod}`;
    if (VEHICLE_STIFFNESS_KNM[combined] !== undefined) return VEHICLE_STIFFNESS_KNM[combined];
    // Try model-only
    if (VEHICLE_STIFFNESS_KNM[mod] !== undefined) return VEHICLE_STIFFNESS_KNM[mod];
    // Fuzzy: strip all separators (MUX ↔ MU-X, DMAX ↔ D-MAX)
    const stripped = `${make}${mod}`.replace(/[\s\-_]/g, '');
    const fuzzyMatch = Object.entries(VEHICLE_STIFFNESS_KNM).find(
      ([k]) => k.replace(/[\s\-_]/g, '') === stripped
    );
    if (fuzzyMatch) return fuzzyMatch[1];
    // Fall through to body-type class
    const bt = (bodyTypeFallback ?? '').toLowerCase().trim();
    return VEHICLE_STIFFNESS_KNM[bt] ?? 1000;
  }
  // Single-arg legacy path: bodyTypeOrMake is a body-type string
  const bt = (bodyTypeOrMake ?? '').toLowerCase().trim();
  return VEHICLE_STIFFNESS_KNM[bt] ?? 1000;
}

// ── Accident type multipliers ─────────────────────────────────────────────────
// Source: SAE 2002-01-0547 (Varat & Husher, 2002)
const ACCIDENT_TYPE_MULTIPLIER: Record<string, number> = {
  frontal: 1.00, rear: 0.90, side_driver: 1.10, side_passenger: 1.10,
  rollover: 1.30, multi_impact: 1.20, unknown: 1.00,
};
function getAccidentMultiplier(direction: string | null | undefined): number {
  if (!direction) return 1.0;
  return ACCIDENT_TYPE_MULTIPLIER[direction.toLowerCase()] ?? 1.0;
}

// ── Deformation efficiency factor ─────────────────────────────────────────────
// Fraction of total KE absorbed as structural deformation.
// Source: Strother et al. 1986, SAE 860924 (efficiency factor only).
// CALIBRATION: values from published data. Do not change without citing source.
const DEFORM_EFFICIENCY: Record<string, number> = {
  frontal: 0.65, rear: 0.60, side_driver: 0.55, side_passenger: 0.55,
  rollover: 0.45, multi_impact: 0.50, unknown: 0.60,
};
function getDeformEfficiency(direction: string | null | undefined): number {
  if (!direction) return 0.60;
  return DEFORM_EFFICIENCY[direction.toLowerCase()] ?? 0.60;
}

// ── M1: Campbell's Stiffness Formula ─────────────────────────────────────────
// M5 Path A (Campbell from vision depth) has been unified into M1.
// They were the same formula with the same input — running both was redundant.
function runCampbell(
  crushDepthM: number,
  massKg: number,
  bodyType: string | null | undefined,
  collisionDirection: string | null | undefined,
  depthSource: 'document' | 'vision' | 'inferred' = 'inferred',
  make?: string | null,
  model?: string | null,
): MethodEstimate {
  if (crushDepthM <= 0 || massKg <= 0) {
    return {
      method: 'CAMPBELL', label: "M1 Campbell's formula (crush depth geometry)",
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'Insufficient data: crush depth or vehicle mass missing',
      ran: false,
    };
  }
  // Use per-model stiffness when make+model are available; fall back to body-type class
  const stiffnessKnm = (make || model)
    ? getStiffnessKnm(make, model, bodyType)
    : getStiffnessKnm(bodyType);
  const stiffnessNm = stiffnessKnm * 1000;
  const energyJ = 0.5 * stiffnessNm * Math.pow(crushDepthM, 2);
  const speedKmh = Math.round(
    Math.sqrt((2 * energyJ) / massKg) * 3.6 * getAccidentMultiplier(collisionDirection)
  );
  const confidence: MethodConfidence =
    depthSource === 'document' ? 'HIGH' : depthSource === 'vision' ? 'MEDIUM' : 'LOW';
  const weight =
    depthSource === 'document' ? 0.80 : depthSource === 'vision' ? 0.55 : 0.00;
  const basisNote =
    depthSource === 'document' ? 'document-stated measurement' :
    depthSource === 'vision'   ? 'computer-vision extracted measurement — MEDIUM confidence' :
    'inferred from damage severity — LOW confidence, excluded from consensus';
  const stiffnessLabel = (make || model)
    ? `${stiffnessKnm} kN/m (${make ?? ''} ${model ?? ''} per-model)`
    : `${stiffnessKnm} kN/m (${bodyType ?? 'default'} class)`;
  return {
    method: 'CAMPBELL',
    label: "M1 Campbell's formula (crush depth geometry)",
    speedKmh, isLowerBoundOnly: false,
    confidenceWeight: weight, confidence,
    basis: `Crush depth: ${(crushDepthM * 100).toFixed(1)} cm (${basisNote}), stiffness: ${stiffnessLabel}, mass: ${massKg} kg`,
    ran: depthSource !== 'inferred',
  };
}

// ── M2: Energy-Momentum Balance — DISABLED ───────────────────────────────────
function runEnergyMomentum(): MethodEstimate {
  return {
    method: 'ENERGY_MOMENTUM', label: 'M2 Energy-momentum balance (repair cost proxy)',
    speedKmh: null, isLowerBoundOnly: false,
    confidenceWeight: 0, confidence: 'LOW',
    basis: 'Method disabled — repair cost is not a reliable physics input across different markets and time periods.',
    ran: false,
  };
}

// ── M3: Impulse-Momentum — DISABLED ──────────────────────────────────────────
function runImpulse(): MethodEstimate {
  return {
    method: 'IMPULSE', label: 'M3 Impulse-momentum (damage contact area)',
    speedKmh: null, isLowerBoundOnly: false,
    confidenceWeight: 0, confidence: 'LOW',
    basis: 'Method disabled — total damage area is not a valid proxy for primary impact contact area.',
    ran: false,
  };
}

// ── M4: Deployment Threshold ──────────────────────────────────────────────────
// NOW A WEIGHTED EVIDENCE CONTRIBUTOR, not a floor.
//
// An airbag is not a speed sensor. Deployment depends on deceleration pulse,
// crash pulse duration, vehicle structure, sensor location, and manufacturer
// calibration. It tells you the vehicle experienced a crash event severe enough
// to trigger the restraint algorithm — not the exact speed.
//
// Using 28 km/h as the point estimate for airbag deployment (midpoint of the
// FMVSS 208 typical frontal deployment range of 25–35 km/h). Weight: 0.40.
//
// Hard lower bound (20 km/h) is preserved but applied POST-CONSENSUS only.
function runDeploymentThreshold(
  airbagDeployment: boolean,
  seatbeltPretensioner: boolean,
  collisionDirection: string | null | undefined,
): MethodEstimate {
  if (!airbagDeployment && !seatbeltPretensioner) {
    return {
      method: 'DEPLOYMENT_THRESHOLD', label: 'M4 Deployment threshold (restraint system response)',
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'No airbag or seatbelt pretensioner deployment recorded',
      ran: false,
    };
  }
  // FMVSS 208: typical frontal airbag deployment 25–35 km/h. Point estimate: 28 km/h.
  // Pretensioner: typical 15–22 km/h. Point estimate: 18 km/h.
  const AIRBAG_POINT_KMH       = 28;
  const PRETENSIONER_POINT_KMH = 18;
  const AIRBAG_WEIGHT          = 0.40;
  const PRETENSIONER_WEIGHT    = 0.30;

  const pointKmh = airbagDeployment ? AIRBAG_POINT_KMH : PRETENSIONER_POINT_KMH;
  const weight   = airbagDeployment ? AIRBAG_WEIGHT    : PRETENSIONER_WEIGHT;

  const dir = (collisionDirection ?? '').toLowerCase();
  const isNonBarrier = dir === 'rollover' || dir === 'single_vehicle' || dir === 'pothole' || dir === 'unknown';
  const adjustedWeight = isNonBarrier ? parseFloat((weight * 0.6).toFixed(3)) : weight;
  const caveat = isNonBarrier
    ? ' Note: FMVSS 208 threshold is calibrated for frontal barrier events. Actual deployment threshold may differ for this incident type. Weight reduced accordingly.'
    : '';

  return {
    method: 'DEPLOYMENT_THRESHOLD',
    label: 'M4 Deployment threshold (restraint system response)',
    speedKmh: pointKmh,
    isLowerBoundOnly: false,
    confidenceWeight: adjustedWeight,
    confidence: 'MEDIUM',
    basis: airbagDeployment
      ? `Airbag deployment confirmed — FMVSS 208 typical frontal deployment range: 25–35 km/h, point estimate ${pointKmh} km/h. Hard lower bound ≥ 20 km/h applied post-consensus as sanity check only.${caveat}`
      : `Seatbelt pretensioner deployment — typical activation range: 15–22 km/h, point estimate ${pointKmh} km/h.${caveat}`,
    ran: true,
  };
}

// ── M5: Vision Deformation Energy ─────────────────────────────────────────────
// V = √(2 × E_total / (m × η))
// Independent of M1 — uses energy directly, not crush depth geometry.
// Single-zone only (damagedZoneCount ≤ 2). Multi-zone damage disables this method.
function runVisionDeformationEnergy(
  totalDeformationEnergyJ: number | null,
  massKg: number,
  collisionDirection: string | null | undefined,
  visionConfidenceScore: number | null,
  multiZoneDamage: boolean,
): MethodEstimate {
  if (!totalDeformationEnergyJ || totalDeformationEnergyJ <= 0) {
    return {
      method: 'VISION_DEFORMATION', label: 'M5 Vision Deformation Energy (component-level)',
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'No component-level deformation energy data from Stage 6 vision analysis',
      ran: false,
    };
  }
  if (multiZoneDamage) {
    return {
      method: 'VISION_DEFORMATION', label: 'M5 Vision Deformation Energy (component-level)',
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: 'Method disabled — multi-zone damage detected. Total deformation energy includes secondary damage from multiple impact events and is not a valid primary impact energy input.',
      ran: false,
    };
  }
  const eta = getDeformEfficiency(collisionDirection);
  const totalKEJ = totalDeformationEnergyJ / eta;
  const speedKmh = Math.round(Math.sqrt((2 * totalKEJ) / massKg) * 3.6);
  const baseWeight = (visionConfidenceScore != null && visionConfidenceScore >= 70) ? 0.65 : 0.45;
  const confidence: MethodConfidence = baseWeight >= 0.60 ? 'MEDIUM' : 'LOW';
  return {
    method: 'VISION_DEFORMATION',
    label: 'M5 Vision Deformation Energy (component-level)',
    speedKmh, isLowerBoundOnly: false,
    confidenceWeight: baseWeight, confidence,
    basis: `Component deformation energy sum: ${(totalDeformationEnergyJ / 1000).toFixed(2)} kJ → total KE: ${(totalKEJ / 1000).toFixed(2)} kJ (efficiency η=${eta}, ${collisionDirection ?? 'unknown'} impact), mass: ${massKg} kg`,
    ran: true,
  };
}

// ── M6: Severity-Anchored Inference ───────────────────────────────────────────
// A human assessor recognises a damage signature and reasons from it.
// This method introduces that contextual reasoning using published crash energy
// signature data. Language is deliberately non-prescriptive: this is a
// "severity-anchored estimate based on comparable crash energy signatures and
// observed damage pattern" — not a direct speed claim from a specific test.
// Source: SAE 2002-01-0547 (Varat & Husher 2002), NHTSA NCAP barrier test data.
// CALIBRATION: speed ranges from published data. Do not change without citing source.
interface SeverityRange { minKmh: number; maxKmh: number; label: string; }
const SEVERITY_SPEED_RANGES: Record<string, SeverityRange> = {
  minor:    { minKmh: 10, maxKmh: 25, label: 'minor damage pattern' },
  moderate: { minKmh: 25, maxKmh: 45, label: 'moderate damage pattern' },
  severe:   { minKmh: 40, maxKmh: 70, label: 'severe damage pattern' },
  critical: { minKmh: 55, maxKmh: 90, label: 'critical/total-loss damage pattern' },
};

function runSeverityAnchored(
  damageSeverity: string | null | undefined,
  structuralDamage: boolean,
  airbagDeployment: boolean,
  totalLossIndicated: boolean,
  collisionDirection: string | null | undefined,
): MethodEstimate {
  const sev = (damageSeverity ?? '').toLowerCase();
  const range = SEVERITY_SPEED_RANGES[sev];
  if (!range) {
    return {
      method: 'SEVERITY_ANCHORED', label: 'M6 Severity-anchored inference',
      speedKmh: null, isLowerBoundOnly: false,
      confidenceWeight: 0, confidence: 'LOW',
      basis: `Damage severity '${damageSeverity ?? 'unknown'}' not in severity table — method skipped`,
      ran: false,
    };
  }
  let minKmh = range.minKmh;
  let maxKmh = range.maxKmh;
  const adjustments: string[] = [];
  if (structuralDamage) {
    minKmh = Math.round(minKmh * 1.10);
    maxKmh = Math.round(maxKmh * 1.10);
    adjustments.push('structural involvement (+10% energy range)');
  }
  if (airbagDeployment) {
    minKmh = Math.max(minKmh, 20);
    adjustments.push('restraint system activation (lower bound ≥ 20 km/h)');
  }
  if (totalLossIndicated) {
    minKmh = Math.max(minKmh, 35);
    adjustments.push('total loss indicated (lower bound ≥ 35 km/h)');
  }
  const midpointKmh = Math.round(((minKmh + maxKmh) / 2) * getAccidentMultiplier(collisionDirection));
  const adjustNote = adjustments.length > 0 ? ` Adjustments applied: ${adjustments.join('; ')}.` : '';
  return {
    method: 'SEVERITY_ANCHORED',
    label: 'M6 Severity-anchored inference (crash energy signature)',
    speedKmh: midpointKmh, isLowerBoundOnly: false,
    confidenceWeight: 0.35, confidence: 'LOW',
    basis: `Severity-anchored estimate based on comparable crash energy signatures and observed ${range.label} → energy-equivalent speed range ${minKmh}–${maxKmh} km/h, midpoint ${midpointKmh} km/h (direction: ${collisionDirection ?? 'unknown'}).${adjustNote} Source: SAE 2002-01-0547, NHTSA NCAP barrier test data.`,
    ran: true,
  };
}

// ── Weighted consensus ────────────────────────────────────────────────────────
function weightedConsensus(estimates: Array<{ speedKmh: number; weight: number }>): { mean: number; stdDev: number } {
  const totalWeight = estimates.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) return { mean: 0, stdDev: 0 };
  const mean = estimates.reduce((s, e) => s + e.speedKmh * e.weight, 0) / totalWeight;
  const variance = estimates.reduce((s, e) => s + e.weight * Math.pow(e.speedKmh - mean, 2), 0) / totalWeight;
  return { mean, stdDev: Math.sqrt(variance) };
}

// ── Evidence agreement scoring ────────────────────────────────────────────────
// Confidence DECREASES when methods disagree.
// evidenceAgreementPct = 100 × (1 - normalised_spread)
// where normalised_spread = stdDev / mean (coefficient of variation)
// Capped at 100% (perfect agreement) and floored at 0%.
function computeAgreementScore(
  estimates: Array<{ speedKmh: number; weight: number }>,
  mean: number,
  stdDev: number,
): { pct: number; note: string } {
  if (estimates.length <= 1 || mean === 0) {
    return { pct: 100, note: 'Single method — no cross-validation possible.' };
  }
  const cv = stdDev / mean; // coefficient of variation
  const pct = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));

  // Build a human-readable note about which methods align and which diverge
  const sorted = [...estimates].sort((a, b) => a.speedKmh - b.speedKmh);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const spread = high.speedKmh - low.speedKmh;

  let note: string;
  if (pct >= 85) {
    note = `All contributing methods produce closely aligned estimates (spread: ${spread} km/h). Consensus is reliable.`;
  } else if (pct >= 65) {
    note = `Methods show moderate agreement (spread: ${spread} km/h). The consensus is indicative but should be verified with additional evidence.`;
  } else if (pct >= 45) {
    note = `Methods show limited agreement (spread: ${spread} km/h). Evidence sources partially conflict — treat consensus as a working estimate pending further investigation.`;
  } else {
    note = `Methods show significant disagreement (spread: ${spread} km/h). Evidence sources conflict materially. Do not use consensus as the sole basis for settlement.`;
  }
  return { pct, note };
}

// ── Confidence tier from agreement score ─────────────────────────────────────
// Confidence DECREASES when evidence conflicts.
// This replaces the old logic that could return HIGH confidence when methods
// diverged by 35 km/h simply because two of them happened to be MEDIUM-rated.
function deriveOverallConfidence(
  pointEstimates: Array<MethodEstimate & { speedKmh: number }>,
  agreementPct: number,
  highDivergence: boolean,
): MethodConfidence {
  if (highDivergence || agreementPct < 45) return 'LOW';
  const highCount   = pointEstimates.filter(m => m.confidence === 'HIGH').length;
  const mediumCount = pointEstimates.filter(m => m.confidence === 'MEDIUM').length;
  if (agreementPct >= 75 && (highCount >= 1 || mediumCount >= 2)) return 'HIGH';
  if (agreementPct >= 55 && (highCount >= 1 || mediumCount >= 1)) return 'MEDIUM';
  return 'LOW';
}

// ── Main ensemble entry point ─────────────────────────────────────────────────

export interface EnsembleInput {
  massKg: number;
  make?: string | null;   // Vehicle manufacturer — used for per-model stiffness lookup
  model?: string | null;  // Vehicle model       — used for per-model stiffness lookup
  bodyType: string | null | undefined;
  collisionDirection: string | null | undefined;
  documentCrushDepthM: number | null | undefined;
  inferredCrushDepthM: number;
  visionCrushDepthM: number | null | undefined;
  totalDamageAreaM2: number | null | undefined;
  partsCostUsd: number | null | undefined;
  structuralDamage: boolean;
  airbagDeployment: boolean;
  seatbeltPretensioner: boolean;
  totalDeformationEnergyJ?: number | null;
  visionConfidenceScore?: number | null;
  damagedZoneCount?: number | null;
  damageSeverity?: string | null;
  totalLossIndicated?: boolean;
}

export function runSpeedInferenceEnsemble(input: EnsembleInput): SpeedInferenceResult {
  const {
    massKg, bodyType, collisionDirection,
    documentCrushDepthM, inferredCrushDepthM, visionCrushDepthM,
    structuralDamage, airbagDeployment, seatbeltPretensioner,
  } = input;

  const multiZoneDamage = (input.damagedZoneCount ?? 1) > 2;

  // M1 crush depth priority: document > vision > inferred
  const m1HasDocument = !!(documentCrushDepthM && documentCrushDepthM >= 0.04);
  const m1HasVision   = !!(visionCrushDepthM && visionCrushDepthM >= 0.04);
  const m1CrushDepth  = m1HasDocument ? documentCrushDepthM! : m1HasVision ? visionCrushDepthM! : inferredCrushDepthM;
  const m1DepthSource: 'document' | 'vision' | 'inferred' =
    m1HasDocument ? 'document' : m1HasVision ? 'vision' : 'inferred';

  const m1 = runCampbell(m1CrushDepth, massKg, bodyType, collisionDirection, m1DepthSource, input.make, input.model);
  const m2 = runEnergyMomentum();
  const m3 = runImpulse();
  const m4 = runDeploymentThreshold(airbagDeployment, seatbeltPretensioner, collisionDirection);
  const m5 = runVisionDeformationEnergy(
    input.totalDeformationEnergyJ ?? null, massKg, collisionDirection,
    input.visionConfidenceScore ?? null, multiZoneDamage,
  );
  const m6 = runSeverityAnchored(
    input.damageSeverity, structuralDamage, airbagDeployment,
    input.totalLossIndicated ?? false, collisionDirection,
  );

  const methods: MethodEstimate[] = [m1, m2, m3, m4, m5, m6];

  // All point estimates with weight > 0 join the weighted mean (including M4)
  const pointEstimates = methods.filter(
    m => m.ran && m.speedKmh !== null && !m.isLowerBoundOnly && m.confidenceWeight > 0
  ) as Array<MethodEstimate & { speedKmh: number }>;

  // Hard lower bound: applied post-consensus only
  const hardLowerBoundKmh = airbagDeployment ? 20 : seatbeltPretensioner ? 15 : null;

  if (pointEstimates.length === 0) {
    return {
      consensusSpeedKmh: hardLowerBoundKmh,
      confidenceInterval: hardLowerBoundKmh ? [hardLowerBoundKmh, Math.round(hardLowerBoundKmh * 1.5)] : null,
      lowerBoundKmh: hardLowerBoundKmh,
      methods,
      overallConfidence: 'LOW',
      evidenceAgreementPct: 0,
      evidenceAgreementNote: 'No contributing methods ran — insufficient data for speed estimation.',
      highDivergence: false,
      summary: hardLowerBoundKmh
        ? `Insufficient data for a point estimate. Deployment evidence confirms impact speed ≥ ${hardLowerBoundKmh} km/h. Document-stated crush depth or vehicle photos required for a defensible speed estimate.`
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

  // Evidence agreement scoring — confidence decreases when methods disagree
  const { pct: evidenceAgreementPct, note: evidenceAgreementNote } =
    computeAgreementScore(adjustedEstimates, consensus.mean, consensus.stdDev);

  // High divergence detection
  let highDivergence = false;
  let maxGapKmh = 0;
  let maxGapPair: [number, number] = [0, 0];
  for (let i = 0; i < pointEstimates.length; i++) {
    for (let j = i + 1; j < pointEstimates.length; j++) {
      const a = pointEstimates[i].speedKmh;
      const b = pointEstimates[j].speedKmh;
      const gap = Math.abs(a - b);
      const maxVal = Math.max(a, b);
      if (maxVal > 0 && gap / maxVal > 0.40) highDivergence = true;
      if (gap > maxGapKmh) { maxGapKmh = gap; maxGapPair = [i, j]; }
    }
  }

  // Overall confidence — derived from agreement score, not just method count
  const overallConfidence = deriveOverallConfidence(pointEstimates, evidenceAgreementPct, highDivergence);

  // Post-consensus physical impossibility check
  let physicalImpossibilityFlag: SpeedInferenceResult['physicalImpossibilityFlag'];
  if (hardLowerBoundKmh && consensusSpeedKmh < hardLowerBoundKmh) {
    physicalImpossibilityFlag = {
      triggered: true,
      consensusBeforeClamp: consensusSpeedKmh,
      clampedTo: hardLowerBoundKmh,
      reason: `Weighted consensus (${consensusSpeedKmh} km/h) is below the physical lower bound implied by ${airbagDeployment ? 'airbag deployment (FMVSS 208: ≥ 20 km/h)' : 'seatbelt pretensioner deployment (≥ 15 km/h)'}. Consensus clamped to deployment lower bound.`,
      possibleExplanations: [
        'Crush depth underestimated — photos may not show the primary crush zone clearly',
        'Deformation measurement incomplete — not all structural components reported energy to Stage 6',
        'Energy absorbed by secondary structures not captured in component-level analysis',
        'Vehicle impacted a deformable object rather than a rigid barrier, reducing crush depth relative to speed',
        'Incomplete photographic coverage of the primary impact zone',
      ],
    };
    consensusSpeedKmh = hardLowerBoundKmh;
  }

  // 90% confidence interval
  const ciHalfWidth = consensus.stdDev * 1.645;
  const confidenceInterval: [number, number] = [
    Math.max(0, Math.round(consensusSpeedKmh - ciHalfWidth)),
    Math.round(consensusSpeedKmh + ciHalfWidth),
  ];

  // Summary
  const methodNames = pointEstimates.map(m => m.label).join(', ');
  const agreementNote = evidenceAgreementPct < 65 ? ` Evidence agreement: ${evidenceAgreementPct}%.` : '';
  const impossibilityNote = physicalImpossibilityFlag?.triggered
    ? ` PHYSICS RECONCILIATION ISSUE: consensus clamped from ${physicalImpossibilityFlag.consensusBeforeClamp} km/h to ${physicalImpossibilityFlag.clampedTo} km/h — observed damage severity exceeds deformation-derived speed estimate.`
    : '';
  const summary = `Consensus impact speed: ~${consensusSpeedKmh} km/h (90% CI: ${confidenceInterval[0]}–${confidenceInterval[1]} km/h, ${overallConfidence} confidence) from ${pointEstimates.length} method${pointEstimates.length > 1 ? 's' : ''}: ${methodNames}.${agreementNote}${impossibilityNote}`;

  // Divergence explanation
  const divergenceExplanation: SpeedInferenceResult['divergenceExplanation'] = [];
  if (highDivergence && pointEstimates.length >= 2) {
    const mA = pointEstimates[maxGapPair[0]];
    const mB = pointEstimates[maxGapPair[1]];
    const gapKmh = Math.round(Math.abs(mA.speedKmh - mB.speedKmh));
    const maxSpeed = Math.max(mA.speedKmh, mB.speedKmh);
    const gapPct = maxSpeed > 0 ? Math.round((gapKmh / maxSpeed) * 100) : 0;

    let keyInputDifference = `${mA.label} used: ${mA.basis}. ${mB.label} used: ${mB.basis}.`;
    let explanation = `${mA.label} estimated ${mA.speedKmh} km/h while ${mB.label} estimated ${mB.speedKmh} km/h — a ${gapPct}% gap (${gapKmh} km/h). `;

    const mAm = mA.method; const mBm = mB.method;
    if ((mAm === 'CAMPBELL' && mBm === 'SEVERITY_ANCHORED') || (mBm === 'CAMPBELL' && mAm === 'SEVERITY_ANCHORED')) {
      explanation += `The deformation geometry measurement (Campbell) gives a lower estimate than the severity-anchored range. This typically indicates the crush depth measurement is underestimated — photos may not show the primary crush zone clearly, or the vehicle impacted a deformable object rather than a rigid barrier.`;
      keyInputDifference = 'Deformation geometry measurement vs. damage severity classification diverge — crush depth likely underestimated.';
    } else if ((mAm === 'VISION_DEFORMATION' && mBm === 'SEVERITY_ANCHORED') || (mBm === 'VISION_DEFORMATION' && mAm === 'SEVERITY_ANCHORED')) {
      explanation += `The deformation energy sum gives a lower estimate than the severity-anchored range. This may indicate not all structural components reported deformation energy to Stage 6, or the vision model underestimated energy for heavily damaged components.`;
      keyInputDifference = 'Component deformation energy sum vs. damage severity classification diverge — energy sum likely incomplete.';
    } else if (mAm === 'DEPLOYMENT_THRESHOLD' || mBm === 'DEPLOYMENT_THRESHOLD') {
      explanation += `The restraint system response estimate diverges from the physics-based estimate. Physical deformation measurements may be underestimating the impact energy.`;
      keyInputDifference = 'Restraint system response estimate vs. physics-derived speed diverge.';
    } else {
      explanation += 'Review the key inputs for each method to identify the source of the discrepancy.';
    }

    divergenceExplanation.push({
      methodPair: [mA.method, mB.method],
      speedsKmh: [mA.speedKmh, mB.speedKmh],
      gapKmh, gapPct, keyInputDifference, explanation,
      recommendedAction: gapPct >= 60
        ? 'Critical divergence — independent accident reconstruction specialist required before settlement.'
        : 'Significant divergence — senior assessor should review Section 2.6 method inputs and request additional evidence.',
    });
  }

  // Cross-validation spread
  const allSpeeds = pointEstimates.map(m => m.speedKmh);
  const spread = allSpeeds.length >= 2 ? Math.round(Math.max(...allSpeeds) - Math.min(...allSpeeds)) : 0;
  const outlierMethods = pointEstimates
    .filter(m => Math.abs(m.speedKmh - consensus.mean) > 2 * consensus.stdDev)
    .map(m => m.method);
  const crossValidation: SpeedInferenceResult['crossValidation'] = pointEstimates.length >= 2 ? {
    spread, outlierMethods,
    recommendation: highDivergence
      ? 'Methods diverge significantly — do not use consensus as sole basis for settlement.'
      : spread <= 10
      ? 'Methods agree closely — consensus estimate is reliable.'
      : 'Methods show moderate spread — treat consensus as indicative, verify with physical inspection.',
  } : undefined;

  // Crush-depth plausibility check
  const crushDepthPlausibilityCheck = (() => {
    const campbellMethods = methods.filter(m => m.method === 'CAMPBELL' && m.ran && m.speedKmh !== null);
    if (campbellMethods.length === 0) {
      return {
        triggered: false, severity: 'OK' as const,
        impliedMinSpeedKmh: 0, visionDerivedMaxSpeedKmh: null, gapKmh: null,
        flagMessage: 'No Campbell estimate available for plausibility check.',
        recommendedAction: 'No action required.', evidenceBasis: [],
      };
    }
    const visionDerivedMaxSpeedKmh = Math.max(...campbellMethods.map(m => m.speedKmh!));
    const evidenceBasis: string[] = [];
    let impliedMinSpeedKmh = 0;

    if (input.airbagDeployment) {
      impliedMinSpeedKmh = Math.max(impliedMinSpeedKmh, 20);
      evidenceBasis.push('Airbag deployment (FMVSS 208: ≥ 20 km/h frontal barrier equivalent)');
    }
    if (input.seatbeltPretensioner) {
      impliedMinSpeedKmh = Math.max(impliedMinSpeedKmh, 15);
      evidenceBasis.push('Seatbelt pretensioner deployment (≥ 15 km/h)');
    }
    const dmgSev = (input.damageSeverity ?? '').toLowerCase();
    if (dmgSev === 'severe' || dmgSev === 'critical') {
      impliedMinSpeedKmh = Math.max(impliedMinSpeedKmh, 25);
      evidenceBasis.push(`Damage classified as '${dmgSev}' — consistent with impact ≥ 25 km/h`);
    }
    if (input.totalLossIndicated) {
      impliedMinSpeedKmh = Math.max(impliedMinSpeedKmh, 30);
      evidenceBasis.push('Total loss indicated — structural damage consistent with impact ≥ 30 km/h');
    }
    if (input.structuralDamage && !input.airbagDeployment) {
      impliedMinSpeedKmh = Math.max(impliedMinSpeedKmh, 15);
      evidenceBasis.push('Structural damage detected (≥ 15 km/h indicative)');
    }
    if (impliedMinSpeedKmh === 0) {
      return {
        triggered: false, severity: 'OK' as const,
        impliedMinSpeedKmh: 0, visionDerivedMaxSpeedKmh, gapKmh: null,
        flagMessage: 'Insufficient damage severity evidence for plausibility check.',
        recommendedAction: 'No action required.', evidenceBasis,
      };
    }
    const gapKmh = impliedMinSpeedKmh - visionDerivedMaxSpeedKmh;
    const triggered = gapKmh > 5;
    const flagSeverity: 'CRITICAL' | 'WARNING' | 'OK' =
      gapKmh > 15 ? 'CRITICAL' : gapKmh > 5 ? 'WARNING' : 'OK';

    if (!triggered) {
      return {
        triggered: false, severity: 'OK' as const,
        impliedMinSpeedKmh, visionDerivedMaxSpeedKmh, gapKmh,
        flagMessage: 'Campbell estimate is consistent with observed damage severity evidence.',
        recommendedAction: 'No action required.', evidenceBasis,
      };
    }
    const evidenceSummary = evidenceBasis.join('; ');
    const flagMessage = flagSeverity === 'CRITICAL'
      ? `CRITICAL — Campbell estimate (${visionDerivedMaxSpeedKmh} km/h) is ${gapKmh} km/h below the minimum implied by damage evidence (${impliedMinSpeedKmh} km/h from: ${evidenceSummary}). Crush depth measurement is likely underestimated. The M6 severity-anchored and M4 deployment threshold estimates provide more reliable bounds for this claim.`
      : `WARNING — Campbell estimate (${visionDerivedMaxSpeedKmh} km/h) is ${gapKmh} km/h below the minimum implied by damage evidence (${impliedMinSpeedKmh} km/h from: ${evidenceSummary}). Verify that images show the primary impact zone clearly.`;
    const recommendedAction = flagSeverity === 'CRITICAL'
      ? 'Do not rely on crush depth as the sole speed estimate. Request close-up frontal damage photos from the repairer or assessor. Review M4 and M6 estimates as alternative bounds.'
      : 'Request additional close-up frontal damage photos. Verify the primary crush zone is clearly visible.';
    return { triggered, severity: flagSeverity, impliedMinSpeedKmh, visionDerivedMaxSpeedKmh, gapKmh, flagMessage, recommendedAction, evidenceBasis };
  })();

  return {
    consensusSpeedKmh, confidenceInterval, lowerBoundKmh: hardLowerBoundKmh,
    methods, overallConfidence, evidenceAgreementPct, evidenceAgreementNote,
    highDivergence, summary, methodsRan: pointEstimates.length,
    divergenceExplanation: divergenceExplanation.length > 0 ? divergenceExplanation : undefined,
    crossValidation, crushDepthPlausibilityCheck, physicalImpossibilityFlag,
  };
}
