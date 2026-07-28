/**
 * damageClassificationEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POSSIBLE / IMPOSSIBLE / UNEXPLAINED DAMAGE CLASSIFICATION ENGINE
 *
 * Classifies each observed damage component and each detected image zone as:
 *
 *   POSSIBLE     — damage is physically consistent with the stated speed
 *                  and collision direction. No anomaly.
 *
 *   IMPOSSIBLE   — damage is physically inconsistent with the stated speed
 *                  and/or direction. The physics model cannot produce this
 *                  damage pattern from the stated incident.
 *                  Examples:
 *                    - Airbag deployed at < 15 km/h stated speed
 *                    - Structural damage at < 20 km/h stated speed (frontal)
 *                    - Rear damage only in a stated frontal impact
 *                    - Crush depth 0.35 m at 30 km/h stated speed
 *
 *   UNEXPLAINED  — damage exists that is not explained by the stated incident
 *                  but is not physically impossible. The damage may be from a
 *                  prior incident, a different impact event, or a secondary
 *                  contact not described in the claim.
 *                  Examples:
 *                    - Side damage in a stated frontal impact
 *                    - Damage to zones not in the expected zone map
 *                    - Damage severity exceeds the expected range for the speed
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. NEVER conclude fraud. The classification is physical, not intentional.
 *    "Impossible" means the physics model cannot produce this result from the
 *    stated inputs — not that the claimant is lying.
 *
 * 2. CONSERVATIVE thresholds. An "impossible" classification requires strong
 *    physical evidence. When in doubt, classify as "unexplained" rather than
 *    "impossible". The adjuster makes the final determination.
 *
 * 3. DIRECTION-AWARE. The expected zone map is direction-specific. A zone
 *    that is "unexplained" in a frontal impact may be "possible" in a rear
 *    impact. The engine uses the normalised direction from Stage 3.
 *
 * 4. SPEED-STRATIFIED. The expected damage profile is speed-stratified.
 *    Structural damage at 15 km/h frontal is "unexplained"; at 50 km/h it
 *    is "possible". The engine uses the ensemble consensus speed from Stage 7.
 *
 * 5. EVIDENCE-BASED EXPLANATIONS. Every classification includes a plain-
 *    language explanation and the specific evidence basis for the finding.
 *    Adjusters must be able to explain the classification to a claimant.
 *
 * SOURCES
 * ───────
 * - FMVSS 208: airbag deployment thresholds (25–35 km/h frontal barrier)
 * - RCAR rear impact structural test (15 km/h structural threshold)
 * - SAE 2002-01-0547 (Varat & Husher): crush depth vs speed
 * - NHTSA NCAP frontal barrier test data
 * - Euro NCAP ODB and full-width rigid barrier test data
 * - ANCAP/NHTSA side impact test data
 */

import {
  estimateExpectedDamage,
  normaliseDirection,
  classifySpeedBand,
  type ExpectedDamageProfile,
  type CollisionDirection,
  type SpeedBand,
} from './forwardDamageEstimation';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DamageClass = 'POSSIBLE' | 'IMPOSSIBLE' | 'UNEXPLAINED';

export interface ComponentClassification {
  /** The damage component or zone being classified */
  component: string;
  /** Classification result */
  classification: DamageClass;
  /** Confidence in this classification (0–1) */
  confidence: number;
  /** Plain-language explanation */
  reason: string;
  /** Physical evidence basis for the classification */
  evidenceBasis: string[];
}

export interface DamageClassificationInput {
  /** Physics ensemble consensus speed in km/h (from Stage 7) */
  consensusSpeedKmh: number | null;
  /** Collision direction (raw string from Stage 3) */
  collisionDirection: string | null | undefined;
  /** Damage components from Stage 6 vision analysis */
  observedComponents: string[];
  /** Image-detected zones from Stage 6 vision analysis */
  imageDetectedZones?: string[];
  /** Whether airbag deployment was observed */
  airbagDeploymentObserved: boolean | null;
  /** Whether seatbelt pretensioner activation was observed */
  pretensionerObserved: boolean | null;
  /** Whether structural damage was detected */
  structuralDamageDetected: boolean;
  /** Crush depth from VGE or document (metres) */
  crushDepthM: number | null;
  /** Damage severity from Stage 6 */
  damageSeverity: string | null | undefined;
  /**
   * Claimant-stated speed from claim documents (km/h).
   * COMPARISON INPUT ONLY — never used as an anchor or ground-truth input for
   * any evidence-based check. It is only ever compared against other signals
   * (consensus speed, severity-implied speed) as a cross-validation input.
   * The crush depth check uses Stage 6 severity/structural as its anchor, not this.
   */
  claimedSpeedKmh?: number | null;
}

export interface DamageClassificationResult {
  /** Overall classification summary */
  overallClassification: 'CONSISTENT' | 'ANOMALOUS' | 'CONTRADICTORY';
  /** Expected damage profile used for comparison */
  expectedProfile: ExpectedDamageProfile;
  /** Per-component classifications */
  componentClassifications: ComponentClassification[];
  /** Per-zone classifications */
  zoneClassifications: ComponentClassification[];
  /** Summary counts */
  counts: {
    possible: number;
    impossible: number;
    unexplained: number;
  };
  /** Impossible findings (highest priority) */
  impossibleFindings: ComponentClassification[];
  /** Unexplained findings */
  unexplainedFindings: ComponentClassification[];
  /** Airbag/pretensioner consistency check */
  restraintConsistencyCheck: {
    airbagConsistent: boolean | null;
    pretensionerConsistent: boolean | null;
    airbagNote: string;
    pretensionerNote: string;
  };
  /** Crush depth consistency check */
  crushDepthConsistencyCheck: {
    consistent: boolean | null;
    observedCrushDepthM: number | null;
    expectedMinM: number;
    expectedMaxM: number;
    note: string;
    /** Speed used as the primary anchor for the expected range (severity-derived midpoint or consensus fallback) */
    primaryAnchorSpeedKmh: number;
    /** Source of the primary anchor */
    primaryAnchorSource: 'SEVERITY_DERIVED' | 'CONSENSUS_FALLBACK';
    /** Secondary internal-consistency check against consensus speed */
    internalConsistencyNote: string | null;
  };
  /** Plain-language summary for the adjuster */
  summary: string;
  /** Recommended adjuster action */
  recommendedAction: string;
}

// ── Zone normalisation ────────────────────────────────────────────────────────

/**
 * Normalise a component or zone string for fuzzy matching.
 * Removes punctuation, lowercases, and trims whitespace.
 */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, ' ').trim();
}

/**
 * Check if an observed component/zone matches any expected zone.
 * Uses substring matching to handle variations (e.g. "front bumper cover" → "front bumper").
 */
function matchesAnyZone(observed: string, expectedZones: string[]): boolean {
  const obs = normalise(observed);
  return expectedZones.some(z => {
    const exp = normalise(z);
    return obs.includes(exp) || exp.includes(obs);
  });
}

// ── Direction mismatch detection ──────────────────────────────────────────────

/**
 * Zone-to-direction affinity map.
 * Each zone has a list of directions where it is the PRIMARY impact zone.
 * Zones not in this map are considered direction-neutral.
 */
const ZONE_DIRECTION_AFFINITY: Record<string, CollisionDirection[]> = {
  // Front-specific zones
  'front bumper':       ['frontal'],
  'front bumper cover': ['frontal'],
  'bonnet':             ['frontal'],
  'hood':               ['frontal'],
  'front grille':       ['frontal'],
  'headlamp':           ['frontal'],
  'headlight':          ['frontal'],
  'radiator':           ['frontal'],
  'radiator support':   ['frontal'],
  'intercooler':        ['frontal'],
  // Rear-specific zones
  'rear bumper':        ['rear'],
  'rear bumper cover':  ['rear'],
  'boot lid':           ['rear'],
  'trunk lid':          ['rear'],
  'tailgate':           ['rear'],
  'tail lamp':          ['rear'],
  'tail light':         ['rear'],
  // Side-specific zones
  'b-pillar':           ['side_driver', 'side_passenger'],
  'rocker panel':       ['side_driver', 'side_passenger'],
  'sill':               ['side_driver', 'side_passenger'],
  // Roof-specific zones
  'roof':               ['rollover', 'top'],
  'roof panel':         ['rollover', 'top'],
};

/**
 * Determine if an observed zone is directionally inconsistent with the
 * stated collision direction.
 *
 * Returns:
 *   'impossible'   — zone is the primary zone for a DIFFERENT direction
 *   'unexplained'  — zone is not expected for this direction but not impossible
 *   'possible'     — zone is consistent with this direction
 */
function checkDirectionConsistency(
  zone: string,
  direction: CollisionDirection,
  expectedProfile: ExpectedDamageProfile,
): 'possible' | 'unexplained' | 'impossible' {
  const allExpected = [
    ...expectedProfile.primaryZones,
    ...expectedProfile.secondaryZones,
    ...expectedProfile.possibleZones,
  ];
  if (matchesAnyZone(zone, allExpected)) return 'possible';

  // Check if this zone is the primary zone for a conflicting direction
  const normZone = normalise(zone);
  for (const [affinityZone, affinityDirs] of Object.entries(ZONE_DIRECTION_AFFINITY)) {
    if (normZone.includes(normalise(affinityZone)) || normalise(affinityZone).includes(normZone)) {
      // This zone has a direction affinity
      if (!affinityDirs.includes(direction)) {
        // Zone belongs to a different direction — this is directionally inconsistent
        // If the stated direction is completely opposite (front vs rear), it's impossible
        const opposites: Partial<Record<CollisionDirection, CollisionDirection[]>> = {
          frontal: ['rear'],
          rear:    ['frontal'],
        };
        const isOpposite = opposites[direction]?.some(d => affinityDirs.includes(d)) ?? false;
        return isOpposite ? 'impossible' : 'unexplained';
      }
    }
  }
  return 'unexplained';
}

// ── Main classification function ──────────────────────────────────────────────

export function classifyDamage(input: DamageClassificationInput): DamageClassificationResult {
  const {
    consensusSpeedKmh, collisionDirection,
    observedComponents, imageDetectedZones,
    airbagDeploymentObserved, pretensionerObserved,
    structuralDamageDetected, crushDepthM, damageSeverity,
    claimedSpeedKmh,
  } = input;

  const normDir = normaliseDirection(collisionDirection);
  const speedKmh = consensusSpeedKmh ?? 0;
  const speedBand = classifySpeedBand(speedKmh);
  const expectedProfile = estimateExpectedDamage(speedKmh, collisionDirection);

  // ── Independent crush depth anchor (anti-circularity) ─────────────────────
  // PRIMARY anchor for the crush depth check = Stage 6 severity/structural rating.
  // Rationale:
  //   - Consensus speed (M1–M6) is derived substantially from crush depth via M1/M5,
  //     so comparing crush depth against consensus-derived expected range is circular.
  //   - Claimed speed is claimant-controlled and is exactly what M7 exists to validate;
  //     using it as a grading anchor would allow a claimant to satisfy the check by
  //     simply stating a speed convenient for their damage story.
  //   - Stage 6 severity/structural is an independent holistic judgment from vision
  //     analysis of damage photographs — distinct from the specific crush-depth
  //     measurement and not derived from any claimant input.
  // Fallback: consensus speed, labeled 'CONSENSUS_FALLBACK' so the report cannot
  //   present it as an independent check.
  // Claimed speed (claimedSpeedKmh) is NEVER used as an anchor here — it is
  //   a comparison input only and must not flow into any evidence-grading calculation.
  const SEVERITY_MIDPOINTS: Record<string, number> = {
    minor: 17,    // midpoint of 10–25 km/h
    moderate: 35, // midpoint of 25–45 km/h
    severe: 55,   // midpoint of 40–70 km/h
    critical: 72, // midpoint of 55–90 km/h
  };
  let primaryAnchorSpeedKmh: number;
  let primaryAnchorSource: 'SEVERITY_DERIVED' | 'CONSENSUS_FALLBACK';
  // NOTE: 'CLAIMED_SPEED' is intentionally absent — claimed speed must never anchor
  // an evidence-based check. It is a comparison input only (see M7).
  const severityMidpoint = SEVERITY_MIDPOINTS[(damageSeverity ?? '').toLowerCase()];
  if (severityMidpoint != null) {
    primaryAnchorSpeedKmh = severityMidpoint;
    primaryAnchorSource = 'SEVERITY_DERIVED';
  } else {
    // Fallback: consensus speed. Labeled explicitly so reports cannot misrepresent
    // this as an independent check.
    primaryAnchorSpeedKmh = speedKmh;
    primaryAnchorSource = 'CONSENSUS_FALLBACK';
  }
  const primaryExpectedProfile = estimateExpectedDamage(primaryAnchorSpeedKmh, collisionDirection);

  // ── Component classifications ─────────────────────────────────────────────

  const componentClassifications: ComponentClassification[] = observedComponents.map(component => {
    const dirResult = checkDirectionConsistency(component, normDir, expectedProfile);

    if (dirResult === 'impossible') {
      return {
        component,
        classification: 'IMPOSSIBLE' as DamageClass,
        confidence: 0.80,
        reason: `${component} is the primary damage zone for a different impact direction (${normDir} impact stated). This component is not physically reachable as a primary impact zone in a ${normDir} collision.`,
        evidenceBasis: [
          `Stated direction: ${collisionDirection ?? 'unknown'}`,
          `Component direction affinity: inconsistent with ${normDir}`,
          'Zone-direction affinity analysis (SAE J1100)',
        ],
      };
    }

    if (dirResult === 'unexplained') {
      return {
        component,
        classification: 'UNEXPLAINED' as DamageClass,
        confidence: 0.65,
        reason: `${component} is not in the expected damage zone for a ${normDir} impact at ${speedKmh} km/h. This damage may be from a prior incident, a secondary contact, or an impact event not described in the claim.`,
        evidenceBasis: [
          `Stated direction: ${collisionDirection ?? 'unknown'}`,
          `Expected zones for ${normDir} at ${speedBand}: ${expectedProfile.primaryZones.slice(0, 3).join(', ')}`,
          'Forward damage estimation model',
        ],
      };
    }

    return {
      component,
      classification: 'POSSIBLE' as DamageClass,
      confidence: 0.85,
      reason: `${component} is consistent with a ${normDir} impact at ${speedKmh} km/h.`,
      evidenceBasis: [
        `Stated direction: ${collisionDirection ?? 'unknown'}`,
        `Component is in the expected zone map for ${normDir} at ${speedBand}`,
      ],
    };
  });

  // ── Zone classifications ──────────────────────────────────────────────────

  const allZones = imageDetectedZones ?? [];
  const zoneClassifications: ComponentClassification[] = allZones.map(zone => {
    const dirResult = checkDirectionConsistency(zone, normDir, expectedProfile);

    if (dirResult === 'impossible') {
      return {
        component: zone,
        classification: 'IMPOSSIBLE' as DamageClass,
        confidence: 0.85,
        reason: `Image zone '${zone}' is the primary impact zone for a different direction. In a stated ${normDir} impact, this zone should not be the primary damage zone.`,
        evidenceBasis: [
          `Stated direction: ${collisionDirection ?? 'unknown'}`,
          `Zone direction affinity: inconsistent with ${normDir}`,
          'Image zone analysis (Stage 6 vision)',
          'Zone-direction affinity analysis (SAE J1100)',
        ],
      };
    }

    if (dirResult === 'unexplained') {
      return {
        component: zone,
        classification: 'UNEXPLAINED' as DamageClass,
        confidence: 0.70,
        reason: `Image zone '${zone}' is not expected for a ${normDir} impact at ${speedKmh} km/h. This zone may indicate a secondary impact or prior damage.`,
        evidenceBasis: [
          `Stated direction: ${collisionDirection ?? 'unknown'}`,
          `Expected zones for ${normDir}: ${expectedProfile.primaryZones.slice(0, 3).join(', ')}`,
          'Image zone analysis (Stage 6 vision)',
        ],
      };
    }

    return {
      component: zone,
      classification: 'POSSIBLE' as DamageClass,
      confidence: 0.85,
      reason: `Image zone '${zone}' is consistent with a ${normDir} impact at ${speedKmh} km/h.`,
      evidenceBasis: [
        `Stated direction: ${collisionDirection ?? 'unknown'}`,
        'Image zone analysis (Stage 6 vision)',
      ],
    };
  });

  // ── Restraint system consistency check ───────────────────────────────────

  // Airbag: FMVSS 208 — deployment requires ≥ ~25 km/h frontal barrier equivalent
  // For non-frontal impacts, threshold is higher (side airbags: ~30 km/h)
  const AIRBAG_THRESHOLD_FRONTAL_KMH = 25;
  const AIRBAG_THRESHOLD_SIDE_KMH    = 30;
  const PRETENSIONER_THRESHOLD_KMH   = 15;

  let airbagConsistent: boolean | null = null;
  let airbagNote = 'No airbag deployment data available.';
  let pretensionerConsistent: boolean | null = null;
  let pretensionerNote = 'No pretensioner data available.';

  if (airbagDeploymentObserved === true) {
    const airbagThreshold = (normDir === 'side_driver' || normDir === 'side_passenger')
      ? AIRBAG_THRESHOLD_SIDE_KMH
      : AIRBAG_THRESHOLD_FRONTAL_KMH;
    airbagConsistent = speedKmh >= airbagThreshold;
    if (airbagConsistent) {
      airbagNote = `Airbag deployment is consistent with the physics-derived speed (${speedKmh} km/h ≥ ${airbagThreshold} km/h threshold for ${normDir} impact). Source: FMVSS 208.`;
    } else {
      airbagNote = `INCONSISTENCY: Airbag deployment observed but physics-derived speed (${speedKmh} km/h) is below the typical deployment threshold (${airbagThreshold} km/h for ${normDir} impact). This may indicate the crush depth is underestimated, or the impact involved a rigid barrier at a higher speed than the consensus estimate. Source: FMVSS 208.`;
    }
  } else if (airbagDeploymentObserved === false) {
    airbagConsistent = true; // No deployment is consistent with any speed
    airbagNote = 'No airbag deployment — consistent with any speed (deployment not guaranteed).';
  }

  if (pretensionerObserved === true) {
    pretensionerConsistent = speedKmh >= PRETENSIONER_THRESHOLD_KMH;
    if (pretensionerConsistent) {
      pretensionerNote = `Seatbelt pretensioner activation is consistent with the physics-derived speed (${speedKmh} km/h ≥ ${PRETENSIONER_THRESHOLD_KMH} km/h threshold). Source: FMVSS 208.`;
    } else {
      pretensionerNote = `INCONSISTENCY: Seatbelt pretensioner activation observed but physics-derived speed (${speedKmh} km/h) is below the typical activation threshold (${PRETENSIONER_THRESHOLD_KMH} km/h). Source: FMVSS 208.`;
    }
  } else if (pretensionerObserved === false) {
    pretensionerConsistent = true;
    pretensionerNote = 'No pretensioner activation — consistent with any speed.';
  }

  // ── Crush depth consistency check (anti-circular dual-anchor) ───────────
  // PRIMARY check: uses primaryExpectedProfile (anchored to claimedSpeedKmh or
  //   severity-derived speed — NOT consensus speed, which is partly derived from
  //   crush depth via M1/M5 and would make this check circular).
  // SECONDARY check: internal consistency against consensus speed, clearly labeled.
  // Tolerance: min(1.5 cm, 15% of range width) — small enough to catch implausibly
  //   shallow crush depths, unlike the old 5 cm flat tolerance which disabled the floor.

  let crushDepthConsistent: boolean | null = null;
  let crushDepthNote = 'No crush depth measurement available.';
  let internalConsistencyNote: string | null = null;

  if (crushDepthM != null && crushDepthM > 0) {
    const { minCrushDepthM: primaryMin, maxCrushDepthM: primaryMax } = primaryExpectedProfile;
    const primarySpeedBand = classifySpeedBand(primaryAnchorSpeedKmh);
    const primaryNormDir = normaliseDirection(collisionDirection);
    // Tolerance: 15% of range width, capped at 1.5 cm, minimum 0.5 cm
    const rangeWidth = primaryMax - primaryMin;
    const TOLERANCE = Math.min(0.015, Math.max(0.005, rangeWidth * 0.15));

    const anchorLabel = primaryAnchorSource === 'SEVERITY_DERIVED'
      ? `Stage 6 severity-derived ${primaryAnchorSpeedKmh} km/h`
      : `consensus fallback ${primaryAnchorSpeedKmh} km/h (non-independent)`;

    if (crushDepthM < primaryMin - TOLERANCE) {
      crushDepthConsistent = false;
      crushDepthNote = `FAIL (primary check — ${anchorLabel}): Observed crush depth (${(crushDepthM * 100).toFixed(0)} cm) is below the expected minimum (${(primaryMin * 100).toFixed(0)} cm, tolerance ±${(TOLERANCE * 100).toFixed(1)} cm) for a ${primarySpeedBand.toLowerCase()} ${primaryNormDir} impact. The crush depth is implausibly shallow — measurement may be underestimated or the actual impact speed is lower than the severity rating implies. Source: SAE 2002-01-0547.`;
    } else if (crushDepthM > primaryMax + TOLERANCE) {
      crushDepthConsistent = false;
      crushDepthNote = `FAIL (primary check — ${anchorLabel}): Observed crush depth (${(crushDepthM * 100).toFixed(0)} cm) exceeds the expected maximum (${(primaryMax * 100).toFixed(0)} cm, tolerance ±${(TOLERANCE * 100).toFixed(1)} cm) for a ${primarySpeedBand.toLowerCase()} ${primaryNormDir} impact. The crush depth exceeds what is expected for the observed damage severity — the actual impact speed may be higher than the severity rating implies, or the vehicle struck a rigid barrier. Source: SAE 2002-01-0547.`;
    } else {
      crushDepthConsistent = true;
      crushDepthNote = `PASS (primary check — ${anchorLabel}): Observed crush depth (${(crushDepthM * 100).toFixed(0)} cm) is within the expected range (${(primaryMin * 100).toFixed(0)}–${(primaryMax * 100).toFixed(0)} cm, tolerance ±${(TOLERANCE * 100).toFixed(1)} cm) for a ${primarySpeedBand.toLowerCase()} ${primaryNormDir} impact. Source: SAE 2002-01-0547.`;
    }

    // Secondary: internal consistency against consensus speed (labeled as such)
    if (primaryAnchorSource !== 'CONSENSUS_FALLBACK') {
      const { minCrushDepthM: consMin, maxCrushDepthM: consMax } = expectedProfile;
      const consRangeWidth = consMax - consMin;
      const consTolerance = Math.min(0.015, Math.max(0.005, consRangeWidth * 0.15));
      if (crushDepthM < consMin - consTolerance) {
        internalConsistencyNote = `INTERNAL CONSISTENCY (consensus ${speedKmh} km/h): crush depth (${(crushDepthM * 100).toFixed(0)} cm) is below the consensus-derived floor (${(consMin * 100).toFixed(0)} cm). Note: consensus speed is partly derived from crush depth via M1/M5 — this is not an independent check.`;
      } else if (crushDepthM > consMax + consTolerance) {
        internalConsistencyNote = `INTERNAL CONSISTENCY (consensus ${speedKmh} km/h): crush depth (${(crushDepthM * 100).toFixed(0)} cm) exceeds the consensus-derived ceiling (${(consMax * 100).toFixed(0)} cm). Note: consensus speed is partly derived from crush depth via M1/M5 — this is not an independent check.`;
      } else {
        internalConsistencyNote = `INTERNAL CONSISTENCY (consensus ${speedKmh} km/h): crush depth (${(crushDepthM * 100).toFixed(0)} cm) is within the consensus-derived range (${(consMin * 100).toFixed(0)}–${(consMax * 100).toFixed(0)} cm). Note: consensus speed is partly derived from crush depth via M1/M5 — this is not an independent check.`;
      }
    }
  }

  // ── Structural damage consistency check ──────────────────────────────────

  // Add structural damage classification to component list if detected
  if (structuralDamageDetected && !expectedProfile.structuralExpected) {
    componentClassifications.push({
      component: 'structural damage',
      classification: 'UNEXPLAINED',
      confidence: 0.75,
      reason: `Structural damage detected but not expected for a ${speedBand.toLowerCase()} ${normDir} impact at ${speedKmh} km/h. Structural damage typically requires higher impact energy for this direction. This may indicate the speed estimate is too low, or there was a secondary impact.`,
      evidenceBasis: [
        `Stated direction: ${collisionDirection ?? 'unknown'}`,
        `Speed band: ${speedBand} (${speedKmh} km/h)`,
        `Structural damage threshold for ${normDir}: ${speedBand === 'LOW' ? 'not expected' : 'borderline'}`,
        'Forward damage estimation model',
        'RCAR structural test data',
      ],
    });
  }

  // Add airbag impossible finding if deployed at very low speed
  if (airbagDeploymentObserved === true && speedKmh < 15) {
    componentClassifications.push({
      component: 'airbag deployment',
      classification: 'IMPOSSIBLE',
      confidence: 0.90,
      reason: `Airbag deployment at ${speedKmh} km/h is physically impossible. FMVSS 208 minimum frontal deployment threshold is 25 km/h. Airbags cannot deploy at this speed under normal circumstances.`,
      evidenceBasis: [
        `Physics-derived speed: ${speedKmh} km/h`,
        'FMVSS 208 airbag deployment threshold: 25 km/h (frontal barrier equivalent)',
        'Euro NCAP airbag deployment data',
      ],
    });
  }

  // ── Summary counts ────────────────────────────────────────────────────────

  const allClassifications = [...componentClassifications, ...zoneClassifications];
  const counts = {
    possible:    allClassifications.filter(c => c.classification === 'POSSIBLE').length,
    impossible:  allClassifications.filter(c => c.classification === 'IMPOSSIBLE').length,
    unexplained: allClassifications.filter(c => c.classification === 'UNEXPLAINED').length,
  };

  const impossibleFindings = allClassifications.filter(c => c.classification === 'IMPOSSIBLE');
  const unexplainedFindings = allClassifications.filter(c => c.classification === 'UNEXPLAINED');

  // ── Overall classification ────────────────────────────────────────────────

  let overallClassification: DamageClassificationResult['overallClassification'];
  if (impossibleFindings.length > 0) {
    overallClassification = 'CONTRADICTORY';
  } else if (unexplainedFindings.length > 0) {
    overallClassification = 'ANOMALOUS';
  } else {
    overallClassification = 'CONSISTENT';
  }

  // ── Summary and recommended action ───────────────────────────────────────

  const totalComponents = allClassifications.length;
  const possiblePct = totalComponents > 0 ? Math.round((counts.possible / totalComponents) * 100) : 100;

  let summary: string;
  let recommendedAction: string;

  if (overallClassification === 'CONTRADICTORY') {
    summary = `CONTRADICTORY: ${impossibleFindings.length} physically impossible finding(s) detected. ` +
      `${impossibleFindings.map(f => f.component).join(', ')} cannot be explained by the stated ${normDir} impact at ${speedKmh} km/h. ` +
      `${unexplainedFindings.length > 0 ? `Additionally, ${unexplainedFindings.length} unexplained finding(s) require investigation. ` : ''}` +
      `${possiblePct}% of observed damage is consistent with the stated incident.`;
    recommendedAction = 'ESCALATE: Physically impossible damage findings require senior assessor review. ' +
      'Request additional evidence (CCTV, witness statements, police report) before settlement. ' +
      'Consider independent accident reconstruction if findings cannot be resolved.';
  } else if (overallClassification === 'ANOMALOUS') {
    summary = `ANOMALOUS: ${unexplainedFindings.length} unexplained finding(s) detected. ` +
      `${unexplainedFindings.map(f => f.component).slice(0, 3).join(', ')}${unexplainedFindings.length > 3 ? ` (+${unexplainedFindings.length - 3} more)` : ''} ` +
      `are not explained by the stated ${normDir} impact at ${speedKmh} km/h. ` +
      `${possiblePct}% of observed damage is consistent with the stated incident.`;
    recommendedAction = 'REVIEW: Unexplained damage findings require adjuster investigation. ' +
      'Determine whether unexplained damage is from a prior incident or a secondary contact. ' +
      'Request repair history and prior damage declaration from the claimant.';
  } else {
    summary = `CONSISTENT: All observed damage is consistent with the stated ${normDir} impact at ${speedKmh} km/h. ` +
      `${totalComponents} component(s)/zone(s) classified as possible.`;
    recommendedAction = 'No anomalies detected. Proceed with standard assessment.';
  }

  return {
    overallClassification,
    expectedProfile,
    componentClassifications,
    zoneClassifications,
    counts,
    impossibleFindings,
    unexplainedFindings,
    restraintConsistencyCheck: {
      airbagConsistent,
      pretensionerConsistent,
      airbagNote,
      pretensionerNote,
    },
    crushDepthConsistencyCheck: {
      consistent: crushDepthConsistent,
      observedCrushDepthM: crushDepthM,
      expectedMinM: primaryExpectedProfile.minCrushDepthM,
      expectedMaxM: primaryExpectedProfile.maxCrushDepthM,
      note: crushDepthNote,
      primaryAnchorSpeedKmh,
      primaryAnchorSource,
      internalConsistencyNote,
    },
    summary,
    recommendedAction,
  };
}
