/**
 * forwardDamageEstimation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FORWARD DAMAGE ESTIMATION MODEL
 *
 * Given an impact speed (km/h) and collision direction, predicts the expected
 * damage profile: which zones should be damaged, expected severity, whether
 * structural damage is expected, and whether airbag deployment is expected.
 *
 * This is the prerequisite for the Possible/Impossible/Unexplained damage
 * classification engine. The classification engine compares OBSERVED damage
 * against the EXPECTED damage profile from this model.
 *
 * DESIGN PHILOSOPHY
 * ─────────────────
 * This model reasons from physics, not from claims history. It uses:
 *   1. Speed bands derived from NHTSA NCAP and Euro NCAP test data
 *   2. Direction-specific zone maps from SAE J1100 and IIHS test protocols
 *   3. Structural damage thresholds from published crash test data
 *   4. Airbag deployment thresholds from FMVSS 208 and Euro NCAP
 *
 * The model is deliberately conservative: it predicts the MINIMUM expected
 * damage for a given speed/direction. Damage in excess of the prediction is
 * flagged as "unexplained" — not impossible, but requiring explanation.
 *
 * SPEED BANDS
 * ───────────
 * LOW:      < 20 km/h  — parking lot / low-speed manoeuvre
 * MODERATE: 20–40 km/h — urban / intersection speed
 * HIGH:     40–60 km/h — suburban / arterial road speed
 * SEVERE:   60–80 km/h — highway entry / rural road speed
 * CRITICAL: > 80 km/h  — highway / freeway speed
 *
 * SOURCES
 * ───────
 * - NHTSA NCAP frontal barrier test data (35 mph / 56 km/h)
 * - Euro NCAP full-width rigid barrier (50 km/h) and ODB (64 km/h)
 * - IIHS moderate overlap frontal (64 km/h) and small overlap (64 km/h)
 * - SAE 2002-01-0547 (Varat & Husher) — crush depth vs speed
 * - FMVSS 208 — airbag deployment thresholds
 * - RCAR low-speed structural test (15 km/h)
 * - ANCAP/NHTSA side impact (50 km/h, 32 km/h MDB)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpeedBand = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'CRITICAL';

export type CollisionDirection =
  | 'frontal'
  | 'rear'
  | 'side_driver'
  | 'side_passenger'
  | 'rollover'
  | 'multi_impact'
  | 'top'
  | 'undercarriage'
  | 'unknown';

export interface ExpectedDamageProfile {
  /** Speed band used for this prediction */
  speedBand: SpeedBand;
  /** Normalised collision direction */
  direction: CollisionDirection;
  /** Primary zones that MUST be damaged at this speed/direction */
  primaryZones: string[];
  /** Secondary zones that SHOULD be damaged at this speed/direction */
  secondaryZones: string[];
  /** Zones that are POSSIBLE but not required */
  possibleZones: string[];
  /** Whether structural damage is expected at this speed/direction */
  structuralExpected: boolean;
  /** Whether airbag deployment is expected at this speed/direction */
  airbagExpected: boolean;
  /** Whether seatbelt pretensioner activation is expected */
  pretensionerExpected: boolean;
  /** Minimum expected crush depth in metres */
  minCrushDepthM: number;
  /** Maximum expected crush depth in metres */
  maxCrushDepthM: number;
  /** Expected damage severity label */
  expectedSeverity: 'minor' | 'moderate' | 'severe' | 'critical';
  /** Human-readable summary of the expected damage profile */
  summary: string;
  /** Data sources for this prediction */
  sources: string[];
}

// ── Speed band classification ─────────────────────────────────────────────────

/**
 * Classify a speed in km/h into a speed band.
 * Uses the midpoint of each band for classification.
 */
export function classifySpeedBand(speedKmh: number): SpeedBand {
  if (speedKmh < 20)  return 'LOW';
  if (speedKmh < 40)  return 'MODERATE';
  if (speedKmh < 60)  return 'HIGH';
  if (speedKmh < 80)  return 'SEVERE';
  return 'CRITICAL';
}

// ── Direction normalisation ───────────────────────────────────────────────────

/**
 * Normalise a collision direction string to a CollisionDirection value.
 * Handles common variations from Stage 3 extraction.
 */
export function normaliseDirection(direction: string | null | undefined): CollisionDirection {
  if (!direction) return 'unknown';
  const d = direction.toLowerCase().trim();
  if (d.includes('front') || d === 'head-on' || d === 'head_on') return 'frontal';
  if (d.includes('rear') || d === 'rear-end' || d === 'rear_end') return 'rear';
  if (d.includes('side') && (d.includes('driver') || d.includes('left')))  return 'side_driver';
  if (d.includes('side') && (d.includes('passenger') || d.includes('right'))) return 'side_passenger';
  if (d.includes('side')) return 'side_driver'; // default side to driver side
  if (d.includes('rollover') || d === 'roll') return 'rollover';
  if (d.includes('multi') || d.includes('multiple')) return 'multi_impact';
  if (d.includes('top') || d.includes('roof')) return 'top';
  if (d.includes('under') || d.includes('ground')) return 'undercarriage';
  return 'unknown';
}

// ── Direction-specific zone maps ──────────────────────────────────────────────
//
// Zones are listed in order of expected damage severity (most → least).
// Based on IIHS, Euro NCAP, and NHTSA test protocols.

interface DirectionZoneMap {
  /** Zones that are ALWAYS damaged in this direction */
  primary: string[];
  /** Zones that are USUALLY damaged in this direction */
  secondary: string[];
  /** Zones that are SOMETIMES damaged in this direction */
  possible: string[];
}

const DIRECTION_ZONE_MAP: Record<CollisionDirection, DirectionZoneMap> = {
  frontal: {
    primary: [
      'front bumper', 'front bumper cover', 'bonnet', 'hood',
      'front grille', 'headlamp', 'headlight',
    ],
    secondary: [
      'radiator', 'radiator support', 'front fender', 'fender',
      'windshield', 'front windshield', 'intercooler', 'fan cowling',
      'crumple zone', 'frame rail',
    ],
    possible: [
      'airbag', 'engine', 'subframe', 'suspension', 'firewall',
      'a-pillar', 'strut tower', 'engine cradle', 'battery',
    ],
  },
  rear: {
    primary: [
      'rear bumper', 'rear bumper cover', 'boot lid', 'trunk lid', 'tailgate',
      'tail lamp', 'tail light',
    ],
    secondary: [
      'rear fender', 'quarter panel', 'rear windshield', 'rear window',
      'spare tyre', 'tow bar',
    ],
    possible: [
      'floor pan', 'chassis', 'fuel tank', 'exhaust', 'rear suspension',
      'seatbelt pretensioner',
    ],
  },
  side_driver: {
    primary: [
      'front door', 'door', 'b-pillar',
    ],
    secondary: [
      'rear door', 'rocker panel', 'sill', 'a-pillar', 'c-pillar',
      'side mirror', 'wing mirror', 'front fender',
    ],
    possible: [
      'roof', 'floor pan', 'airbag', 'curtain airbag', 'side airbag',
      'wheel arch', 'suspension',
    ],
  },
  side_passenger: {
    primary: [
      'front door', 'door', 'b-pillar',
    ],
    secondary: [
      'rear door', 'rocker panel', 'sill', 'a-pillar', 'c-pillar',
      'side mirror', 'wing mirror', 'front fender',
    ],
    possible: [
      'roof', 'floor pan', 'airbag', 'curtain airbag', 'side airbag',
      'wheel arch', 'suspension',
    ],
  },
  rollover: {
    primary: [
      'roof', 'roof panel', 'a-pillar', 'b-pillar',
    ],
    secondary: [
      'c-pillar', 'door', 'front door', 'rear door', 'windshield',
      'side mirror', 'wing mirror',
    ],
    possible: [
      'bonnet', 'hood', 'boot lid', 'trunk lid', 'quarter panel',
      'rocker panel', 'sill', 'airbag', 'curtain airbag',
    ],
  },
  multi_impact: {
    primary: [
      'front bumper', 'rear bumper', 'door',
    ],
    secondary: [
      'bonnet', 'hood', 'boot lid', 'trunk lid', 'fender', 'quarter panel',
    ],
    possible: [
      'airbag', 'radiator', 'frame rail', 'chassis', 'suspension',
    ],
  },
  top: {
    primary: [
      'roof', 'roof panel',
    ],
    secondary: [
      'a-pillar', 'b-pillar', 'c-pillar', 'windshield',
    ],
    possible: [
      'door', 'bonnet', 'hood',
    ],
  },
  undercarriage: {
    primary: [
      'floor pan', 'chassis', 'suspension',
    ],
    secondary: [
      'exhaust', 'fuel tank', 'wheel arch',
    ],
    possible: [
      'door sill', 'sill', 'rocker panel',
    ],
  },
  unknown: {
    primary: [],
    secondary: [],
    possible: [],
  },
};

// ── Speed-band × direction damage profiles ────────────────────────────────────
//
// Each entry defines the expected damage profile for a given speed band and
// direction. Structural damage and airbag thresholds are based on published
// crash test data.
//
// Sources:
//   - NHTSA NCAP frontal: structural damage at 35 mph (56 km/h)
//   - Euro NCAP ODB: structural damage at 40 mph (64 km/h)
//   - IIHS low-speed structural: structural damage at 15 km/h (RCAR)
//   - FMVSS 208: airbag deployment at 25–35 km/h (frontal barrier equivalent)
//   - ANCAP side impact: structural damage at 50 km/h
//   - SAE 2002-01-0547: crush depth vs speed tables

interface SpeedBandProfile {
  structuralExpected: boolean;
  airbagExpected: boolean;
  pretensionerExpected: boolean;
  minCrushDepthM: number;
  maxCrushDepthM: number;
  expectedSeverity: ExpectedDamageProfile['expectedSeverity'];
}

// Direction-specific speed-band profiles
// Frontal impacts produce more crush depth than rear or side at the same speed
// because frontal crumple zones are designed to absorb more energy.
const SPEED_BAND_PROFILES: Record<CollisionDirection, Record<SpeedBand, SpeedBandProfile>> = {
  frontal: {
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.08, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: false, airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.05, maxCrushDepthM: 0.18, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.12, maxCrushDepthM: 0.32, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.22, maxCrushDepthM: 0.48, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.35, maxCrushDepthM: 0.70, expectedSeverity: 'critical' },
  },
  rear: {
    // Rear crumple zones are shallower; structural damage occurs at lower speeds
    // Source: RCAR rear impact test (15 km/h structural threshold)
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.06, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.04, maxCrushDepthM: 0.14, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.10, maxCrushDepthM: 0.25, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.18, maxCrushDepthM: 0.38, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.28, maxCrushDepthM: 0.55, expectedSeverity: 'critical' },
  },
  side_driver: {
    // Side impacts: less crush depth but structural damage at lower speeds
    // Source: ANCAP side MDB (50 km/h), IIHS side (50 km/h)
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.05, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.03, maxCrushDepthM: 0.12, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.08, maxCrushDepthM: 0.22, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.14, maxCrushDepthM: 0.32, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.22, maxCrushDepthM: 0.45, expectedSeverity: 'critical' },
  },
  side_passenger: {
    // Same as side_driver — symmetric
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.05, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.03, maxCrushDepthM: 0.12, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.08, maxCrushDepthM: 0.22, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.14, maxCrushDepthM: 0.32, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.22, maxCrushDepthM: 0.45, expectedSeverity: 'critical' },
  },
  rollover: {
    // Rollover: roof crush, structural damage expected at all speeds above LOW
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.04, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.03, maxCrushDepthM: 0.10, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.06, maxCrushDepthM: 0.18, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.10, maxCrushDepthM: 0.28, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.16, maxCrushDepthM: 0.40, expectedSeverity: 'critical' },
  },
  multi_impact: {
    // Multi-impact: use frontal as the primary reference
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.08, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: false, airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.04, maxCrushDepthM: 0.16, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.10, maxCrushDepthM: 0.28, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.18, maxCrushDepthM: 0.42, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.28, maxCrushDepthM: 0.60, expectedSeverity: 'critical' },
  },
  top: {
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.04, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.02, maxCrushDepthM: 0.10, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: false, pretensionerExpected: true,  minCrushDepthM: 0.05, maxCrushDepthM: 0.18, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.08, maxCrushDepthM: 0.28, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: true,  pretensionerExpected: true,  minCrushDepthM: 0.14, maxCrushDepthM: 0.40, expectedSeverity: 'critical' },
  },
  undercarriage: {
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.03, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.02, maxCrushDepthM: 0.08, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: true,  airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.04, maxCrushDepthM: 0.14, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: true,  airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.06, maxCrushDepthM: 0.20, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: true,  airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.10, maxCrushDepthM: 0.30, expectedSeverity: 'critical' },
  },
  unknown: {
    LOW:      { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.00, maxCrushDepthM: 0.08, expectedSeverity: 'minor' },
    MODERATE: { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.04, maxCrushDepthM: 0.18, expectedSeverity: 'moderate' },
    HIGH:     { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.10, maxCrushDepthM: 0.30, expectedSeverity: 'severe' },
    SEVERE:   { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.18, maxCrushDepthM: 0.45, expectedSeverity: 'severe' },
    CRITICAL: { structuralExpected: false, airbagExpected: false, pretensionerExpected: false, minCrushDepthM: 0.28, maxCrushDepthM: 0.65, expectedSeverity: 'critical' },
  },
};

// ── Main estimation function ───────────────────────────────────────────────────

/**
 * Estimate the expected damage profile for a given speed and direction.
 *
 * @param speedKmh - Impact speed in km/h (from physics ensemble consensus)
 * @param direction - Collision direction (normalised or raw string)
 * @returns ExpectedDamageProfile with expected zones, severity, and thresholds
 */
export function estimateExpectedDamage(
  speedKmh: number,
  direction: string | null | undefined,
): ExpectedDamageProfile {
  const normDir = normaliseDirection(direction);
  const speedBand = classifySpeedBand(speedKmh);
  const zoneMap = DIRECTION_ZONE_MAP[normDir];
  const bandProfile = SPEED_BAND_PROFILES[normDir][speedBand];

  // At LOW speed, only primary zones are expected
  // At MODERATE, primary + some secondary
  // At HIGH+, primary + secondary + some possible
  let primaryZones = zoneMap.primary;
  let secondaryZones: string[] = [];
  let possibleZones: string[] = [];

  if (speedBand === 'LOW') {
    // Only the first 2 primary zones at low speed
    primaryZones = zoneMap.primary.slice(0, 2);
    secondaryZones = [];
    possibleZones = zoneMap.secondary.slice(0, 2);
  } else if (speedBand === 'MODERATE') {
    primaryZones = zoneMap.primary;
    secondaryZones = zoneMap.secondary.slice(0, 3);
    possibleZones = [...zoneMap.secondary.slice(3), ...zoneMap.possible.slice(0, 2)];
  } else if (speedBand === 'HIGH') {
    primaryZones = zoneMap.primary;
    secondaryZones = zoneMap.secondary;
    possibleZones = zoneMap.possible;
  } else {
    // SEVERE and CRITICAL: all zones expected
    primaryZones = zoneMap.primary;
    secondaryZones = zoneMap.secondary;
    possibleZones = zoneMap.possible;
  }

  const sources = [
    'NHTSA NCAP frontal barrier test data',
    'Euro NCAP ODB and full-width rigid barrier test data',
    'IIHS moderate overlap and small overlap frontal test data',
    'ANCAP/NHTSA side impact test data (50 km/h MDB)',
    'RCAR rear impact structural test (15 km/h)',
    'FMVSS 208 airbag deployment thresholds',
    'SAE 2002-01-0547 (Varat & Husher) crush depth vs speed',
  ];

  const dirLabel: Record<CollisionDirection, string> = {
    frontal:         'frontal',
    rear:            'rear',
    side_driver:     'driver-side',
    side_passenger:  'passenger-side',
    rollover:        'rollover',
    multi_impact:    'multi-impact',
    top:             'top/roof',
    undercarriage:   'undercarriage',
    unknown:         'unknown direction',
  };

  const speedBandLabel: Record<SpeedBand, string> = {
    LOW:      `low-speed (< 20 km/h, ~${speedKmh} km/h)`,
    MODERATE: `moderate-speed (20–40 km/h, ~${speedKmh} km/h)`,
    HIGH:     `high-speed (40–60 km/h, ~${speedKmh} km/h)`,
    SEVERE:   `severe-speed (60–80 km/h, ~${speedKmh} km/h)`,
    CRITICAL: `critical-speed (> 80 km/h, ~${speedKmh} km/h)`,
  };

  const summary = [
    `${speedBandLabel[speedBand]} ${dirLabel[normDir]} impact.`,
    `Expected primary damage: ${primaryZones.slice(0, 3).join(', ')}${primaryZones.length > 3 ? ` (+${primaryZones.length - 3} more)` : ''}.`,
    bandProfile.structuralExpected ? 'Structural damage expected.' : 'Structural damage not expected at this speed.',
    bandProfile.airbagExpected ? 'Airbag deployment expected.' : 'Airbag deployment not expected at this speed.',
    `Expected crush depth: ${(bandProfile.minCrushDepthM * 100).toFixed(0)}–${(bandProfile.maxCrushDepthM * 100).toFixed(0)} cm.`,
  ].join(' ');

  return {
    speedBand,
    direction: normDir,
    primaryZones,
    secondaryZones,
    possibleZones,
    structuralExpected: bandProfile.structuralExpected,
    airbagExpected: bandProfile.airbagExpected,
    pretensionerExpected: bandProfile.pretensionerExpected,
    minCrushDepthM: bandProfile.minCrushDepthM,
    maxCrushDepthM: bandProfile.maxCrushDepthM,
    expectedSeverity: bandProfile.expectedSeverity,
    summary,
    sources,
  };
}
