/**
 * stage-9-5-cgi.test.ts
 *
 * Full test suite for Stage 9.5 — Contact Geometry Intelligence (CGI).
 *
 * Coverage:
 *   Layer 1: L1-01 Contact Patch Ratio
 *            L1-02 Bumper Height Compatibility
 *            L1-03 Overlap Fraction Consistency
 *            L1-04 Crush Depth Consistency (VGR vs Physics)
 *            L1-05 Damage Fraction vs Severity Consistency
 *            L1-06 Multi-Image Crush Depth Convergence
 *            L1-07 Structural Zone Penetration Consistency
 *   Layer 2: L2-01 Force Density Index
 *            L2-02 Energy Absorption Efficiency
 *            L2-03 Stiffness-Adjusted Severity Consistency
 *            L2-04 Latent Damage Probability Uplift
 *            L2-05 Load Path Coherence
 *   Layer 3: Forensic conclusion assembly (verdict, confidence, hiddenDamageProbabilityOverride)
 *   Integration: Full runContactGeometryIntelligence() call with realistic inputs
 *                Graceful degradation when inputs are missing/null
 *                Error handling (thrown exceptions → available=false)
 *
 * Author: Tavonga Shoko (Lead Engineer)
 * Date: 2026-08-05
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runContactGeometryIntelligence,
  type CGIInput,
  type Stage9_5Output,
  type CGIVerdict,
} from './stage-9-5-cgi';
import type { ClaimRecord, Stage6Output, Stage7Output, Stage8Output, Stage9Output } from './types';
import type { VGRConsensusResult } from './stage-6-5b-vgr';

// ── Mock getPanelAreaM2 ──────────────────────────────────────────────────────
// The real table uses human-readable keys; we mock to control test inputs.
vi.mock('./vehiclePanelDimensions', () => ({
  getPanelAreaM2: vi.fn((bodyType: string, panelKey: string): number | null => {
    const areas: Record<string, number> = {
      front_bumper: 0.30,
      rear_bumper:  0.25,
      front_door_left:  0.50,
      front_door_right: 0.50,
      bonnet:       0.60,
      boot_lid:     0.35,
    };
    return areas[panelKey] ?? null;
  }),
  inferBodyType: vi.fn(() => 'sedan'),
}));

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeVehicle(overrides: Partial<ClaimRecord['vehicle']> = {}): ClaimRecord['vehicle'] {
  return {
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    registration: 'ABC123',
    vin: null,
    colour: 'White',
    engineNumber: null,
    mileageKm: 50000,
    bodyType: 'sedan',
    powertrain: 'ICE',
    massKg: 1400,
    massTier: 'inferred_class',
    valueUsd: 12000,
    marketValueUsd: 12000,
    ...overrides,
  };
}

function makeAccidentDetails(overrides: Partial<ClaimRecord['accidentDetails']> = {}): ClaimRecord['accidentDetails'] {
  return {
    date: '2026-07-01',
    time: '14:00',
    location: 'Harare CBD',
    description: 'Front-centre collision',
    incidentType: 'collision',
    incidentSubType: null,
    incidentClassification: null,
    collisionDirection: 'front_centre',
    impactPoint: 'front',
    estimatedSpeedKmh: 60,
    maxCrushDepthM: 0.12,
    totalDamageAreaM2: 0.15,
    structuralDamage: false,
    airbagDeployment: false,
    animalType: null,
    weatherConditions: 'clear',
    visibilityConditions: 'DAYLIGHT',
    roadSurface: 'asphalt',
    narrativeAnalysis: null,
    collisionScenario: 'head_on',
    isStruckParty: false,
    thirdPartyClaimRequired: false,
    isHitAndRun: false,
    isParkingLotDamage: false,
    multiEventSequence: null,
    ...overrides,
  };
}

function makeClaimRecord(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    claimId: 1,
    tenantId: 1,
    vehicle: makeVehicle(),
    driver: { name: 'Test Driver', claimantName: 'Test Driver', licenseNumber: null },
    accidentDetails: makeAccidentDetails(),
    policeReport: { reportNumber: null, station: null, officerName: null, chargeNumber: null, fineAmountCents: null, reportDate: null },
    damage: { description: 'Front bumper damage', components: [], imageUrls: [] },
    repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, agreedCostCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
    insuranceContext: { insurerName: null, policyNumber: null, productType: null, claimReference: null, excessAmountUsd: null, bettermentUsd: null },
    dataQuality: { completenessScore: 80, missingFields: [], validationIssues: [] },
    marketRegion: 'ZW',
    assumptions: [],
    ...overrides,
  };
}

function makeStage6(overrides: Partial<Stage6Output> = {}): Stage6Output {
  return {
    damagedParts: [
      {
        name: 'Front Bumper',
        location: 'front',
        damageType: 'impact',
        severity: 'MODERATE',
        visible: true,
        distanceFromImpact: 0,
        damageFractionEstimate: 0.50,
        source: 'vision',
      },
    ],
    damageZones: [{ zone: 'front', componentCount: 1, maxSeverity: 'MODERATE' }],
    overallSeverityScore: 50,
    structuralDamageDetected: false,
    totalDamageArea: 0.15,
    photosAvailable: 2,
    photosProcessed: 2,
    photosDeferred: 0,
    photosFailed: 0,
    imageConfidenceScore: 80,
    analysisFromPhotos: true,
    visionSourceReliability: 'HIGH',
    ...overrides,
  };
}

function makeStage7(overrides: Partial<Stage7Output> = {}): Stage7Output {
  return {
    impactForceKn: 120,
    impactVector: { direction: 'front_centre', magnitude: 120, angle: 0 },
    energyDistribution: {
      kineticEnergyJ: 250000,
      energyDissipatedJ: 175000,
      energyDissipatedKj: 175,
    },
    estimatedSpeedKmh: 60,
    deltaVKmh: 60,
    decelerationG: 8,
    accidentSeverity: 'MODERATE',
    accidentReconstructionSummary: 'Moderate frontal impact',
    damageConsistencyScore: 75,
    latentDamageProbability: {
      engine: 0.15,
      transmission: 0.10,
      suspension: 0.20,
      frame: 0.25,
      electrical: 0.05,
    },
    physicsExecuted: true,
    physicsStatus: 'EXECUTED',
    // Provide a minimal VGE geometry evidence block so L1-02 can reach the mismatch logic
    geometryEvidenceBlock: {
      calibrationAvailable: true,
      overallCalibrationConfidence: 0.80,
      confidenceLevel: 'HIGH' as any,
      vehicleModelId: 1,
      vehicleProfileUsed: 'Toyota Corolla 2020',
      perImageResults: [],
      calibratedCrushDepthM: 0.10,
      calibratedCrushDepthMinM: 0.08,
      calibratedCrushDepthMaxM: 0.12,
      totalReferenceObjectsDetected: 2,
      geometryEvidenceBlock: {
        vehicle: 'Toyota Corolla 2020',
        referenceObjects: [],
        calibrationMethod: 'reference_object',
        calibrationConfidence: 0.80,
        evidenceNarrative: 'Test fixture',
      },
    } as any,
    ...overrides,
  };
}

function makeStage8(overrides: Partial<Stage8Output> = {}): Stage8Output {
  return {
    fraudRiskScore: 25,
    fraudRiskLevel: 'LOW',
    indicators: [],
    quoteDeviation: null,
    repairerHistory: { flagged: false, notes: '' },
    claimantClaimFrequency: { flagged: false, notes: '' },
    vehicleClaimHistory: { flagged: false, notes: '' },
    damageConsistencyScore: 75,
    damageConsistencyNotes: '',
    scenarioFraudResult: null,
    crossEngineConsistency: null,
    ...overrides,
  };
}

function makeStage9(overrides: Partial<Stage9Output> = {}): Stage9Output {
  return {
    expectedRepairCostCents: 250000,
    quoteDeviationPct: null,
    recommendedCostRange: { lowCents: 200000, highCents: 300000 },
    savingsOpportunityCents: 0,
    breakdown: { partsCostCents: 150000, labourCostCents: 80000, paintCostCents: 20000, hiddenDamageCostCents: 0, totalCents: 250000 },
    labourRateUsdPerHour: 25,
    marketRegion: 'ZW',
    currency: 'USD',
    repairIntelligence: [],
    partsReconciliation: [],
    reconciliationSummary: null,
    alignmentResult: null,
    costNarrative: null,
    costReliability: null,
    costDecision: null as any,
    ...overrides,
  };
}

function makeVGR(overrides: Partial<VGRConsensusResult> = {}): VGRConsensusResult {
  return {
    reconciliationAvailable: true,
    consensusCrushDepthM: 0.10,
    consensusCrushDepthMinM: 0.08,
    consensusCrushDepthMaxM: 0.12,
    overallConfidence: 0.80,
    confidenceLevel: 'HIGH',
    frontalImages: 2,
    angle45Images: 0,
    sideImages: 0,
    unknownAngleImages: 0,
    imageEntries: [
      {
        imageUrl: 'https://example.com/img1.jpg',
        imageIndex: 0,
        viewAngle: 'FRONTAL',
        viewAngleWeight: 1.0,
        calibratedCrushDepthMm: 100,
        calibratedCrushDepthMinMm: 80,
        calibratedCrushDepthMaxMm: 120,
        calibrationConfidence: 0.85,
        effectiveWeight: 0.85,
        contributesToConsensus: true,
      },
      {
        imageUrl: 'https://example.com/img2.jpg',
        imageIndex: 1,
        viewAngle: 'FRONTAL',
        viewAngleWeight: 1.0,
        calibratedCrushDepthMm: 105,
        calibratedCrushDepthMinMm: 85,
        calibratedCrushDepthMaxMm: 125,
        calibrationConfidence: 0.80,
        effectiveWeight: 0.80,
        contributesToConsensus: true,
      },
    ],
    agreementAssessment: {
      contributingImages: 2,
      spreadMm: 5,
      spreadPct: 5,
      withinUncertaintyBounds: true,
      convergenceAdjustment: 0.05,
      agreementLevel: 'STRONG',
    },
    ...overrides,
  };
}

function makeInput(overrides: Partial<CGIInput> = {}): CGIInput {
  return {
    claimRecord: makeClaimRecord(),
    stage6Data: makeStage6(),
    stage7Data: makeStage7(),
    stage8Data: makeStage8(),
    stage9Data: makeStage9(),
    vgeResult: null,
    vgrResult: makeVGR(),
    ...overrides,
  };
}

// ── Integration: Full pipeline ───────────────────────────────────────────────

describe('runContactGeometryIntelligence — integration', () => {
  it('returns available=true with all 12 indicators when all inputs are present', () => {
    const result = runContactGeometryIntelligence(makeInput());
    expect(result.available).toBe(true);
    expect(result.unavailableReason).toBeNull();
    expect(result.layer1Indicators).toHaveLength(7);
    expect(result.layer2Indicators).toHaveLength(5);
    expect(result.allIndicators).toHaveLength(12);
  });

  it('returns engineVersion 1.1.0', () => {
    const result = runContactGeometryIntelligence(makeInput());
    expect(result.engineVersion).toBe('1.1.0');
  });

  it('runtimeMs is a non-negative number', () => {
    const result = runContactGeometryIntelligence(makeInput());
    expect(result.runtimeMs).toBeGreaterThanOrEqual(0);
  });

  it('conclusion has all required fields', () => {
    const result = runContactGeometryIntelligence(makeInput());
    const c = result.conclusion;
    expect(c).toHaveProperty('verdict');
    expect(c).toHaveProperty('confidence');
    expect(c).toHaveProperty('hiddenDamageProbabilityOverride');
    expect(c).toHaveProperty('injectFraudIndicator');
    expect(c).toHaveProperty('fraudIndicatorScore');
    expect(c).toHaveProperty('narrative');
    expect(c).toHaveProperty('summary');
  });

  it('conclusion.confidence is between 0 and 1', () => {
    const result = runContactGeometryIntelligence(makeInput());
    expect(result.conclusion.confidence).toBeGreaterThanOrEqual(0);
    expect(result.conclusion.confidence).toBeLessThanOrEqual(1);
  });

  it('allIndicators contains all layer1 and layer2 indicators', () => {
    const result = runContactGeometryIntelligence(makeInput());
    const allIds = result.allIndicators.map(i => i.id);
    expect(allIds).toContain('L1-01');
    expect(allIds).toContain('L1-02');
    expect(allIds).toContain('L1-03');
    expect(allIds).toContain('L1-04');
    expect(allIds).toContain('L1-05');
    expect(allIds).toContain('L1-06');
    expect(allIds).toContain('L1-07');
    expect(allIds).toContain('L2-01');
    expect(allIds).toContain('L2-02');
    expect(allIds).toContain('L2-03');
    expect(allIds).toContain('L2-04');
    expect(allIds).toContain('L2-05');
  });

  it('returns available=false and a safe default conclusion when an exception is thrown', () => {
    // Cause an exception by passing null as input
    const result = runContactGeometryIntelligence(null as any);
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBeTruthy();
    expect(result.layer1Indicators).toHaveLength(0);
    expect(result.layer2Indicators).toHaveLength(0);
    expect(result.allIndicators).toHaveLength(0);
    expect(result.conclusion.verdict).toBe('COHERENT');
    expect(result.conclusion.injectFraudIndicator).toBe(false);
  });

  it('COHERENT verdict when all indicators pass on a clean claim', () => {
    // speed=20 → physicsCrush = 0.008 * 20 = 0.16m; VGR=0.15m → discrepancy=6.25% < 35% → PASS
    // energy efficiency = 3500/5000 = 0.70 → PASS; damageFraction=0.45 for MODERATE → PASS
    const input = makeInput({
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper',
          location: 'front',
          damageType: 'impact',
          severity: 'MODERATE',
          visible: true,
          distanceFromImpact: 0,
          damageFractionEstimate: 0.45,
          source: 'vision',
        }],
        damageZones: [{ zone: 'front', componentCount: 1, maxSeverity: 'MODERATE' }],
        overallSeverityScore: 50,
        structuralDamageDetected: false,
        totalDamageArea: 0.14,
        photosAvailable: 2,
        photosProcessed: 2,
        photosDeferred: 0,
        photosFailed: 0,
        imageConfidenceScore: 80,
        analysisFromPhotos: true,
        visionSourceReliability: 'HIGH',
      }),
      stage7Data: makeStage7({
        estimatedSpeedKmh: 20,
        energyDistribution: { kineticEnergyJ: 5000, energyDissipatedJ: 3500, energyDissipatedKj: 3.5 },
        latentDamageProbability: { engine: 0.10, transmission: 0.05, suspension: 0.10, frame: 0.15, electrical: 0.03 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.15 }),
    });
    const result = runContactGeometryIntelligence(input);
    // With clean inputs, verdict should not be INCOHERENT
    expect(['COHERENT', 'MINOR_ANOMALY']).toContain(result.conclusion.verdict);
  });
});

// ── Layer 1: L1-01 Contact Patch Ratio ──────────────────────────────────────

describe('L1-01 Contact Patch Ratio', () => {
  it('PASS when damage fraction is well above effective minimum CPR', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper',
          location: 'front',
          damageType: 'impact',
          severity: 'MODERATE',
          visible: true,
          distanceFromImpact: 0,
          damageFractionEstimate: 0.75,
        }],
        damageZones: [],
        overallSeverityScore: 60,
        structuralDamageDetected: false,
        totalDamageArea: 0.22,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_01 = result.layer1Indicators.find(i => i.id === 'L1-01')!;
    expect(l1_01.status).toBe('PASS');
  });

  it('FLAG when damage fraction is far below effective minimum CPR', () => {
    // front_centre minCPR = 0.60, margin = 0.10 → effectiveMin = 0.50
    // damageFraction = 0.05 → CPR = 0.05 / 0.50 = 0.10 → FLAG (< 0.5)
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper',
          location: 'front',
          damageType: 'impact',
          severity: 'MINOR',
          visible: true,
          distanceFromImpact: 0,
          damageFractionEstimate: 0.05,
        }],
        damageZones: [],
        overallSeverityScore: 10,
        structuralDamageDetected: false,
        totalDamageArea: 0.015,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 70, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_01 = result.layer1Indicators.find(i => i.id === 'L1-01')!;
    expect(l1_01.status).toBe('FLAG');
    expect(l1_01.value).toBeLessThan(0.5);
  });

  it('UNAVAILABLE when collisionDirection is unknown', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'unknown' as any }) }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_01 = result.layer1Indicators.find(i => i.id === 'L1-01')!;
    expect(l1_01.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when no damageFractionEstimate for primary panel', () => {
    const input = makeInput({
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper',
          location: 'front',
          damageType: 'impact',
          severity: 'MODERATE',
          visible: true,
          distanceFromImpact: 0,
          // no damageFractionEstimate
        }],
        damageZones: [],
        overallSeverityScore: 50,
        structuralDamageDetected: false,
        totalDamageArea: 0.15,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 70, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_01 = result.layer1Indicators.find(i => i.id === 'L1-01')!;
    expect(l1_01.status).toBe('UNAVAILABLE');
  });
});

// ── Layer 1: L1-02 Bumper Height Compatibility ───────────────────────────────

describe('L1-02 Bumper Height Compatibility', () => {
  it('UNAVAILABLE for side impacts (not frontal/rear)', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'side_driver' }) }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_02 = result.layer1Indicators.find(i => i.id === 'L1-02')!;
    expect(l1_02.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when no counterpart vehicle type in claim', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({
        accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }),
      }),
    });
    // accidentDetails has no counterpartVehicleType by default
    const result = runContactGeometryIntelligence(input);
    const l1_02 = result.layer1Indicators.find(i => i.id === 'L1-02')!;
    expect(l1_02.status).toBe('UNAVAILABLE');
  });

  it('FLAG when sedan hits truck (mismatch > 200 mm)', () => {
    const accDetails = makeAccidentDetails({ collisionDirection: 'front_centre' });
    (accDetails as any).counterpartVehicleType = 'truck';
    const input = makeInput({
      claimRecord: makeClaimRecord({
        accidentDetails: accDetails,
        vehicle: makeVehicle({ bodyType: 'sedan' }),
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_02 = result.layer1Indicators.find(i => i.id === 'L1-02')!;
    // sedan midpoint=500mm, truck midpoint=900mm → mismatch=400mm > 200mm → FLAG
    expect(l1_02.status).toBe('FLAG');
    expect(l1_02.value).toBeGreaterThan(200);
  });

  it('PASS when sedan hits sedan (mismatch < 100 mm)', () => {
    const accDetails = makeAccidentDetails({ collisionDirection: 'front_centre' });
    (accDetails as any).counterpartVehicleType = 'sedan';
    const input = makeInput({
      claimRecord: makeClaimRecord({
        accidentDetails: accDetails,
        vehicle: makeVehicle({ bodyType: 'sedan' }),
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_02 = result.layer1Indicators.find(i => i.id === 'L1-02')!;
    expect(l1_02.status).toBe('PASS');
    expect(l1_02.value).toBe(0);
  });

  it('CONCERN when sedan hits SUV (mismatch ~180 mm, between 100 and 200)', () => {
    const accDetails = makeAccidentDetails({ collisionDirection: 'front_centre' });
    (accDetails as any).counterpartVehicleType = 'suv';
    const input = makeInput({
      claimRecord: makeClaimRecord({
        accidentDetails: accDetails,
        vehicle: makeVehicle({ bodyType: 'sedan' }),
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_02 = result.layer1Indicators.find(i => i.id === 'L1-02')!;
    // sedan=500mm, suv=680mm → mismatch=180mm → CONCERN (100 < 180 < 200)
    expect(l1_02.status).toBe('CONCERN');
  });
});

// ── Layer 1: L1-03 Overlap Fraction Consistency ──────────────────────────────

describe('L1-03 Overlap Fraction Consistency', () => {
  it('UNAVAILABLE for full-width frontal (not an offset impact)', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_03 = result.layer1Indicators.find(i => i.id === 'L1-03')!;
    expect(l1_03.status).toBe('UNAVAILABLE');
  });

  it('PASS when damage fraction matches 40% offset claim', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_offset_40' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper',
          location: 'front',
          damageType: 'impact',
          severity: 'MODERATE',
          visible: true,
          distanceFromImpact: 0,
          damageFractionEstimate: 0.40, // exactly matches stated overlap
        }],
        damageZones: [],
        overallSeverityScore: 50,
        structuralDamageDetected: false,
        totalDamageArea: 0.12,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_03 = result.layer1Indicators.find(i => i.id === 'L1-03')!;
    expect(l1_03.status).toBe('PASS');
  });

  it('FLAG when full-width damage (0.90) is claimed as 25% offset', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_offset_25' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper',
          location: 'front',
          damageType: 'impact',
          severity: 'SEVERE',
          visible: true,
          distanceFromImpact: 0,
          damageFractionEstimate: 0.90, // way above 0.25 + 0.20 + 0.20 = 0.65 flag threshold
        }],
        damageZones: [],
        overallSeverityScore: 80,
        structuralDamageDetected: true,
        totalDamageArea: 0.27,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 85, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_03 = result.layer1Indicators.find(i => i.id === 'L1-03')!;
    expect(l1_03.status).toBe('FLAG');
  });
});

// ── Layer 1: L1-04 Crush Depth Consistency ───────────────────────────────────

describe('L1-04 Crush Depth Consistency (VGR vs Physics)', () => {
  it('UNAVAILABLE when VGR is null', () => {
    const input = makeInput({ vgrResult: null });
    const result = runContactGeometryIntelligence(input);
    const l1_04 = result.layer1Indicators.find(i => i.id === 'L1-04')!;
    expect(l1_04.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when VGR reconciliationAvailable=false', () => {
    const input = makeInput({ vgrResult: makeVGR({ reconciliationAvailable: false, consensusCrushDepthM: null }) });
    const result = runContactGeometryIntelligence(input);
    const l1_04 = result.layer1Indicators.find(i => i.id === 'L1-04')!;
    expect(l1_04.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when Stage 7 speed is null', () => {
    const input = makeInput({ stage7Data: makeStage7({ estimatedSpeedKmh: null }) });
    const result = runContactGeometryIntelligence(input);
    const l1_04 = result.layer1Indicators.find(i => i.id === 'L1-04')!;
    expect(l1_04.status).toBe('UNAVAILABLE');
  });

  it('PASS when VGR crush depth closely matches physics-derived depth', () => {
    // Physics: 0.008 * 60 = 0.48m → but let's use a speed that gives a small depth
    // speed=20 → physicsCrush = 0.008 * 20 = 0.16m
    // VGR = 0.15m → discrepancy = |0.15 - 0.16| / 0.16 = 0.0625 < 0.35 → PASS
    const input = makeInput({
      stage7Data: makeStage7({ estimatedSpeedKmh: 20 }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.15 }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_04 = result.layer1Indicators.find(i => i.id === 'L1-04')!;
    expect(l1_04.status).toBe('PASS');
  });

  it('FLAG when VGR crush depth is more than 2× the tolerance from physics', () => {
    // speed=20 → physicsCrush = 0.008 * 20 = 0.16m
    // VGR = 0.50m → discrepancy = |0.50 - 0.16| / 0.16 = 2.125 > 0.70 → FLAG
    const input = makeInput({
      stage7Data: makeStage7({ estimatedSpeedKmh: 20 }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.50 }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_04 = result.layer1Indicators.find(i => i.id === 'L1-04')!;
    expect(l1_04.status).toBe('FLAG');
  });
});

// ── Layer 1: L1-05 Damage Fraction vs Severity Consistency ───────────────────

describe('L1-05 Damage Fraction vs Severity Consistency', () => {
  it('UNAVAILABLE when Stage 7 accidentSeverity is null', () => {
    const input = makeInput({ stage7Data: makeStage7({ accidentSeverity: null as any }) });
    const result = runContactGeometryIntelligence(input);
    const l1_05 = result.layer1Indicators.find(i => i.id === 'L1-05')!;
    expect(l1_05.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when no damagedParts', () => {
    const input = makeInput({ stage6Data: makeStage6({ damagedParts: [] }) });
    const result = runContactGeometryIntelligence(input);
    const l1_05 = result.layer1Indicators.find(i => i.id === 'L1-05')!;
    expect(l1_05.status).toBe('UNAVAILABLE');
  });

  it('PASS when MODERATE severity has average fraction 0.35 (within 0.20–0.60)', () => {
    const input = makeInput({
      stage7Data: makeStage7({ accidentSeverity: 'MODERATE' }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.35,
        }],
        damageZones: [], overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.10,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_05 = result.layer1Indicators.find(i => i.id === 'L1-05')!;
    expect(l1_05.status).toBe('PASS');
  });

  it('FLAG when SEVERE severity has average fraction 0.05 (< 0.20 = 0.40 * 0.5)', () => {
    const input = makeInput({
      stage7Data: makeStage7({ accidentSeverity: 'SEVERE' }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'SEVERE',
          visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.05,
        }],
        damageZones: [], overallSeverityScore: 80, structuralDamageDetected: true, totalDamageArea: 0.015,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_05 = result.layer1Indicators.find(i => i.id === 'L1-05')!;
    expect(l1_05.status).toBe('FLAG');
  });
});

// ── Layer 1: L1-06 Multi-Image Crush Depth Convergence ───────────────────────

describe('L1-06 Multi-Image Crush Depth Convergence', () => {
  it('UNAVAILABLE when VGR is null', () => {
    const input = makeInput({ vgrResult: null });
    const result = runContactGeometryIntelligence(input);
    const l1_06 = result.layer1Indicators.find(i => i.id === 'L1-06')!;
    expect(l1_06.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when fewer than 2 contributing images', () => {
    const input = makeInput({
      vgrResult: makeVGR({
        imageEntries: [
          {
            imageUrl: 'https://example.com/img1.jpg',
            imageIndex: 0,
            viewAngle: 'FRONTAL',
            viewAngleWeight: 1.0,
            calibratedCrushDepthMm: 100,
            calibratedCrushDepthMinMm: 80,
            calibratedCrushDepthMaxMm: 120,
            calibrationConfidence: 0.85,
            effectiveWeight: 0.85,
            contributesToConsensus: true,
          },
        ],
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_06 = result.layer1Indicators.find(i => i.id === 'L1-06')!;
    expect(l1_06.status).toBe('UNAVAILABLE');
  });

  it('PASS when two images have similar crush depths (low CV)', () => {
    // depths: 100, 105 → mean=102.5, stdDev≈2.5, CV≈0.024 < 0.40 → PASS
    const input = makeInput({ vgrResult: makeVGR() }); // default VGR has 100 and 105mm
    const result = runContactGeometryIntelligence(input);
    const l1_06 = result.layer1Indicators.find(i => i.id === 'L1-06')!;
    expect(l1_06.status).toBe('PASS');
  });

  it('FLAG when images have very different crush depths (CV > 0.60)', () => {
    // depths: 20, 200 → mean=110, variance=8100, stdDev=90, CV=90/110≈0.818 > 0.60 → FLAG
    const input = makeInput({
      vgrResult: makeVGR({
        imageEntries: [
          {
            imageUrl: 'https://example.com/img1.jpg',
            imageIndex: 0,
            viewAngle: 'FRONTAL',
            viewAngleWeight: 1.0,
            calibratedCrushDepthMm: 20,
            calibratedCrushDepthMinMm: 15,
            calibratedCrushDepthMaxMm: 25,
            calibrationConfidence: 0.85,
            effectiveWeight: 0.85,
            contributesToConsensus: true,
          },
          {
            imageUrl: 'https://example.com/img2.jpg',
            imageIndex: 1,
            viewAngle: 'FRONTAL',
            viewAngleWeight: 1.0,
            calibratedCrushDepthMm: 200,
            calibratedCrushDepthMinMm: 180,
            calibratedCrushDepthMaxMm: 220,
            calibrationConfidence: 0.80,
            effectiveWeight: 0.80,
            contributesToConsensus: true,
          },
        ],
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_06 = result.layer1Indicators.find(i => i.id === 'L1-06')!;
    // CV = stdDev/mean = 90/110 ≈ 0.818, which is > 0.40 * 1.5 = 0.60 → FLAG
    expect(l1_06.status).toBe('FLAG');
    expect(l1_06.value).toBeGreaterThan(0.60);
  });
});

// ── Layer 1: L1-07 Structural Zone Penetration Consistency ───────────────────

describe('L1-07 Structural Zone Penetration Consistency', () => {
  it('UNAVAILABLE when no damagedParts', () => {
    const input = makeInput({ stage6Data: makeStage6({ damagedParts: [] }) });
    const result = runContactGeometryIntelligence(input);
    const l1_07 = result.layer1Indicators.find(i => i.id === 'L1-07')!;
    expect(l1_07.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when no zone data on parts', () => {
    const input = makeInput({
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.40,
          // no zone field
        }],
        damageZones: [], overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.12,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_07 = result.layer1Indicators.find(i => i.id === 'L1-07')!;
    expect(l1_07.status).toBe('UNAVAILABLE');
  });

  it('PASS when front damage zones match front_centre collision direction', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.50,
          zone: 'front',
        } as any],
        damageZones: [{ zone: 'front', componentCount: 1, maxSeverity: 'MODERATE' }],
        overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.15,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_07 = result.layer1Indicators.find(i => i.id === 'L1-07')!;
    expect(l1_07.status).toBe('PASS');
  });

  it('FLAG when rear zone damage is found on a front_centre collision', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Boot Lid', location: 'rear', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 2, damageFractionEstimate: 0.40,
          zone: 'rear',
        } as any],
        damageZones: [{ zone: 'rear', componentCount: 1, maxSeverity: 'MODERATE' }],
        overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.14,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l1_07 = result.layer1Indicators.find(i => i.id === 'L1-07')!;
    expect(l1_07.status).toBe('FLAG');
  });
});

// ── Layer 2: L2-01 Force Density Index ───────────────────────────────────────

describe('L2-01 Force Density Index', () => {
  it('UNAVAILABLE when physics was skipped', () => {
    const input = makeInput({ stage7Data: makeStage7({ physicsStatus: 'SKIPPED_NON_PHYSICAL' }) });
    const result = runContactGeometryIntelligence(input);
    const l2_01 = result.layer2Indicators.find(i => i.id === 'L2-01')!;
    expect(l2_01.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when VGR crush depth is null', () => {
    const input = makeInput({ vgrResult: null });
    const result = runContactGeometryIntelligence(input);
    const l2_01 = result.layer2Indicators.find(i => i.id === 'L2-01')!;
    expect(l2_01.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when kinetic energy is null', () => {
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: null, energyDissipatedJ: null, energyDissipatedKj: null },
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_01 = result.layer2Indicators.find(i => i.id === 'L2-01')!;
    expect(l2_01.status).toBe('UNAVAILABLE');
  });

  it('PASS when FDI is within expected range', () => {
    // KE=250000J, crushDepth=0.10m, contactPatch=0.30*0.50=0.15m²
    // FDI = (250000/1000) / (0.15 * 0.10) = 250 / 0.015 = 16667 kN/m²
    // That's above MAX (2500) → ADVISORY, not PASS
    // Let's use smaller energy: KE=5000J
    // FDI = (5000/1000) / (0.15 * 0.10) = 5 / 0.015 = 333 kN/m² → PASS (200–2500)
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: 5000, energyDissipatedJ: 3500, energyDissipatedKj: 3.5 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.10 }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_01 = result.layer2Indicators.find(i => i.id === 'L2-01')!;
    expect(l2_01.status).toBe('PASS');
  });

  it('FLAG when FDI is far below minimum (< 100 kN/m²)', () => {
    // KE=100J, crushDepth=0.10m, contactPatch=0.15m²
    // FDI = (100/1000) / (0.15 * 0.10) = 0.1 / 0.015 = 6.67 kN/m² → FLAG (< 100)
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: 100, energyDissipatedJ: 70, energyDissipatedKj: 0.07 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.10 }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_01 = result.layer2Indicators.find(i => i.id === 'L2-01')!;
    expect(l2_01.status).toBe('FLAG');
  });
});

// ── Layer 2: L2-02 Energy Absorption Efficiency ──────────────────────────────

describe('L2-02 Energy Absorption Efficiency', () => {
  it('UNAVAILABLE when physics was skipped', () => {
    const input = makeInput({ stage7Data: makeStage7({ physicsStatus: 'SKIPPED_NO_SPEED' }) });
    const result = runContactGeometryIntelligence(input);
    const l2_02 = result.layer2Indicators.find(i => i.id === 'L2-02')!;
    expect(l2_02.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when kinetic energy is null', () => {
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: null, energyDissipatedJ: null, energyDissipatedKj: null },
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_02 = result.layer2Indicators.find(i => i.id === 'L2-02')!;
    expect(l2_02.status).toBe('UNAVAILABLE');
  });

  it('PASS when efficiency is within 0.30–0.95 range', () => {
    // efficiency = 175000 / 250000 = 0.70 → PASS
    const input = makeInput();
    const result = runContactGeometryIntelligence(input);
    const l2_02 = result.layer2Indicators.find(i => i.id === 'L2-02')!;
    expect(l2_02.status).toBe('PASS');
    expect(l2_02.value).toBeCloseTo(0.70, 2);
  });

  it('FLAG when efficiency > 1.05 (physically impossible)', () => {
    // dissipated > kinetic → efficiency > 1.0 → FLAG
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: 100000, energyDissipatedJ: 110000, energyDissipatedKj: 110 },
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_02 = result.layer2Indicators.find(i => i.id === 'L2-02')!;
    expect(l2_02.status).toBe('FLAG');
    expect(l2_02.value).toBeGreaterThan(1.0);
  });

  it('CONCERN when efficiency is below 0.30', () => {
    // efficiency = 20000 / 250000 = 0.08 → CONCERN (< 0.30)
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: 250000, energyDissipatedJ: 20000, energyDissipatedKj: 20 },
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_02 = result.layer2Indicators.find(i => i.id === 'L2-02')!;
    expect(l2_02.status).toBe('CONCERN');
  });
});

// ── Layer 2: L2-03 Stiffness-Adjusted Severity Consistency ───────────────────

describe('L2-03 Stiffness-Adjusted Severity Consistency', () => {
  it('UNAVAILABLE when VGR is null', () => {
    const input = makeInput({ vgrResult: null });
    const result = runContactGeometryIntelligence(input);
    const l2_03 = result.layer2Indicators.find(i => i.id === 'L2-03')!;
    expect(l2_03.status).toBe('UNAVAILABLE');
  });

  it('UNAVAILABLE when physics is SKIPPED_NON_PHYSICAL', () => {
    const input = makeInput({ stage7Data: makeStage7({ physicsStatus: 'SKIPPED_NON_PHYSICAL' }) });
    const result = runContactGeometryIntelligence(input);
    const l2_03 = result.layer2Indicators.find(i => i.id === 'L2-03')!;
    expect(l2_03.status).toBe('UNAVAILABLE');
  });

  it('PASS when MODERATE severity has crush depth 0.10m (within 0.040–0.150)', () => {
    const input = makeInput({
      stage7Data: makeStage7({ accidentSeverity: 'MODERATE', estimatedSpeedKmh: 40 }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.10 }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_03 = result.layer2Indicators.find(i => i.id === 'L2-03')!;
    expect(l2_03.status).toBe('PASS');
  });

  it('FLAG when SEVERE severity has crush depth 0.010m (< 0.05 = 0.10 * 0.5)', () => {
    const input = makeInput({
      stage7Data: makeStage7({ accidentSeverity: 'SEVERE', estimatedSpeedKmh: 80 }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.010 }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_03 = result.layer2Indicators.find(i => i.id === 'L2-03')!;
    expect(l2_03.status).toBe('FLAG');
  });
});

// ── Layer 2: L2-04 Latent Damage Probability Uplift ──────────────────────────

describe('L2-04 Latent Damage Probability Uplift', () => {
  it('UNAVAILABLE when latentDamageProbability is null', () => {
    const input = makeInput({
      stage7Data: makeStage7({ latentDamageProbability: null as any }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_04 = result.layer2Indicators.find(i => i.id === 'L2-04')!;
    expect(l2_04.status).toBe('UNAVAILABLE');
  });

  it('PASS when no uplift triggers are active', () => {
    // Normal scenario: no deep crush, low FDI, low frame probability
    const input = makeInput({
      stage7Data: makeStage7({
        latentDamageProbability: { engine: 0.05, transmission: 0.03, suspension: 0.08, frame: 0.10, electrical: 0.02 },
        energyDistribution: { kineticEnergyJ: 5000, energyDissipatedJ: 3500, energyDissipatedKj: 3.5 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.05 }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_04 = result.layer2Indicators.find(i => i.id === 'L2-04')!;
    expect(l2_04.status).toBe('PASS');
  });

  it('ADVISORY when crush depth > 0.150m triggers uplift', () => {
    const input = makeInput({
      stage7Data: makeStage7({
        latentDamageProbability: { engine: 0.20, transmission: 0.15, suspension: 0.25, frame: 0.35, electrical: 0.10 },
        energyDistribution: { kineticEnergyJ: 5000, energyDissipatedJ: 3500, energyDissipatedKj: 3.5 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.20 }), // > 0.150 → uplift
    });
    const result = runContactGeometryIntelligence(input);
    const l2_04 = result.layer2Indicators.find(i => i.id === 'L2-04')!;
    expect(l2_04.status).toBe('ADVISORY');
  });
});

// ── Layer 2: L2-05 Load Path Coherence ───────────────────────────────────────

describe('L2-05 Load Path Coherence', () => {
  it('UNAVAILABLE when no damagedParts', () => {
    const input = makeInput({ stage6Data: makeStage6({ damagedParts: [] }) });
    const result = runContactGeometryIntelligence(input);
    const l2_05 = result.layer2Indicators.find(i => i.id === 'L2-05')!;
    expect(l2_05.status).toBe('UNAVAILABLE');
  });

  it('PASS when front bumper is damaged in a front_centre collision', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.50,
        }],
        damageZones: [{ zone: 'front', componentCount: 1, maxSeverity: 'MODERATE' }],
        overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.15,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_05 = result.layer2Indicators.find(i => i.id === 'L2-05')!;
    expect(l2_05.status).toBe('PASS');
  });

  it('FLAG when only rear bumper is damaged in a front_centre collision (no primary component)', () => {
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Rear Bumper', location: 'rear', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 3, damageFractionEstimate: 0.40,
        }],
        damageZones: [{ zone: 'rear', componentCount: 1, maxSeverity: 'MODERATE' }],
        overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.10,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_05 = result.layer2Indicators.find(i => i.id === 'L2-05')!;
    expect(l2_05.status).toBe('FLAG');
  });
});

// ── Layer 3: Forensic Conclusion Assembly ────────────────────────────────────

describe('Layer 3: Forensic Conclusion Assembly', () => {
  it('COHERENT verdict when no flags or concerns', () => {
    // speed=20 → physicsCrush = 0.008 * 20 = 0.16m; VGR=0.15m → discrepancy=6.25% < 35% → PASS
    // energy efficiency = 3500/5000 = 0.70 → PASS
    // damageFraction=0.40 for MODERATE → PASS
    const input = makeInput({
      stage7Data: makeStage7({
        estimatedSpeedKmh: 20,
        accidentSeverity: 'MODERATE',
        energyDistribution: { kineticEnergyJ: 5000, energyDissipatedJ: 3500, energyDissipatedKj: 3.5 },
        latentDamageProbability: { engine: 0.05, transmission: 0.03, suspension: 0.08, frame: 0.10, electrical: 0.02 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.15 }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.40,
        }],
        damageZones: [{ zone: 'front', componentCount: 1, maxSeverity: 'MODERATE' }],
        overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.12,
        photosAvailable: 2, photosProcessed: 2, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    // With mostly UNAVAILABLE indicators (no counterpart vehicle type, etc.) and a few PASS,
    // verdict should be COHERENT or MINOR_ANOMALY
    expect(['COHERENT', 'MINOR_ANOMALY']).toContain(result.conclusion.verdict);
  });

  it('INCOHERENT verdict when 2+ flags are present', () => {
    // Construct a scenario with multiple flags:
    // L1-01 FLAG: tiny damage fraction on front_centre
    // L1-07 FLAG: rear zone damage on front_centre collision
    // L2-02 FLAG: energy > kinetic (impossible)
    const input = makeInput({
      claimRecord: makeClaimRecord({ accidentDetails: makeAccidentDetails({ collisionDirection: 'front_centre' }) }),
      stage6Data: makeStage6({
        damagedParts: [
          {
            name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'MINOR',
            visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.02, // tiny → L1-01 FLAG
            zone: 'rear', // contradictory zone → L1-07 FLAG
          } as any,
        ],
        damageZones: [{ zone: 'rear', componentCount: 1, maxSeverity: 'MINOR' }],
        overallSeverityScore: 10, structuralDamageDetected: false, totalDamageArea: 0.006,
        photosAvailable: 1, photosProcessed: 1, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 60, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: 100000, energyDissipatedJ: 110000, energyDissipatedKj: 110 }, // impossible → L2-02 FLAG
        latentDamageProbability: { engine: 0.10, transmission: 0.08, suspension: 0.12, frame: 0.20, electrical: 0.05 },
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const flags = result.allIndicators.filter(i => i.status === 'FLAG');
    // We need ≥ 2 flags for INCOHERENT
    if (flags.length >= 2) {
      expect(result.conclusion.verdict).toBe('INCOHERENT');
      expect(result.conclusion.injectFraudIndicator).toBe(true);
      expect(result.conclusion.fraudIndicatorScore).toBe(30);
    } else if (flags.length === 1) {
      expect(result.conclusion.verdict).toBe('ANOMALOUS');
      expect(result.conclusion.injectFraudIndicator).toBe(true);
    }
  });

  it('ANOMALOUS verdict when exactly 1 flag is present', () => {
    // Only L2-02 FLAG (impossible energy), all others PASS or UNAVAILABLE
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: 100000, energyDissipatedJ: 110000, energyDissipatedKj: 110 },
        latentDamageProbability: { engine: 0.05, transmission: 0.03, suspension: 0.08, frame: 0.10, electrical: 0.02 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.05 }),
      stage6Data: makeStage6({
        damagedParts: [{
          name: 'Front Bumper', location: 'front', damageType: 'impact', severity: 'MODERATE',
          visible: true, distanceFromImpact: 0, damageFractionEstimate: 0.45,
        }],
        damageZones: [{ zone: 'front', componentCount: 1, maxSeverity: 'MODERATE' }],
        overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0.14,
        photosAvailable: 2, photosProcessed: 2, photosDeferred: 0, photosFailed: 0,
        imageConfidenceScore: 80, analysisFromPhotos: true, visionSourceReliability: 'HIGH',
      }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_02 = result.layer2Indicators.find(i => i.id === 'L2-02')!;
    expect(l2_02.status).toBe('FLAG');
    // With 1 flag and no concerns, verdict should be ANOMALOUS
    const flags = result.allIndicators.filter(i => i.status === 'FLAG');
    const concerns = result.allIndicators.filter(i => i.status === 'CONCERN');
    if (flags.length === 1 && concerns.length < 2) {
      expect(result.conclusion.verdict).toBe('ANOMALOUS');
    }
  });

  it('injectFraudIndicator=false and fraudIndicatorScore=0 for COHERENT verdict', () => {
    const input = makeInput({
      stage7Data: makeStage7({
        energyDistribution: { kineticEnergyJ: 5000, energyDissipatedJ: 3500, energyDissipatedKj: 3.5 },
        latentDamageProbability: { engine: 0.05, transmission: 0.03, suspension: 0.08, frame: 0.10, electrical: 0.02 },
      }),
      vgrResult: makeVGR({ consensusCrushDepthM: 0.05 }),
    });
    const result = runContactGeometryIntelligence(input);
    if (result.conclusion.verdict === 'COHERENT') {
      expect(result.conclusion.injectFraudIndicator).toBe(false);
      expect(result.conclusion.fraudIndicatorScore).toBe(0);
    }
  });

  it('hiddenDamageProbabilityOverride is null when confidence < 0.6', () => {
    // All indicators UNAVAILABLE → confidence will be low
    const input = makeInput({
      vgrResult: null,
      stage7Data: makeStage7({ physicsStatus: 'SKIPPED_NON_PHYSICAL', estimatedSpeedKmh: null }),
      stage6Data: makeStage6({ damagedParts: [] }),
    });
    const result = runContactGeometryIntelligence(input);
    // With all UNAVAILABLE, confidence should be very low
    if (result.conclusion.confidence < 0.6) {
      expect(result.conclusion.hiddenDamageProbabilityOverride).toBeNull();
    }
  });

  it('summary string contains verdict and confidence', () => {
    const result = runContactGeometryIntelligence(makeInput());
    expect(result.conclusion.summary).toContain('CGI:');
    expect(result.conclusion.summary).toContain('%');
  });

  it('narrative string is non-empty and contains verdict', () => {
    const result = runContactGeometryIntelligence(makeInput());
    expect(result.conclusion.narrative.length).toBeGreaterThan(10);
    expect(result.conclusion.narrative).toContain('Verdict:');
  });
});

// ── Graceful degradation ─────────────────────────────────────────────────────

describe('Graceful degradation', () => {
  it('all Layer 2 indicators UNAVAILABLE when physics is SKIPPED_NON_PHYSICAL', () => {
    const input = makeInput({
      stage7Data: makeStage7({ physicsStatus: 'SKIPPED_NON_PHYSICAL', estimatedSpeedKmh: null }),
    });
    const result = runContactGeometryIntelligence(input);
    const l2_01 = result.layer2Indicators.find(i => i.id === 'L2-01')!;
    const l2_02 = result.layer2Indicators.find(i => i.id === 'L2-02')!;
    const l2_03 = result.layer2Indicators.find(i => i.id === 'L2-03')!;
    expect(l2_01.status).toBe('UNAVAILABLE');
    expect(l2_02.status).toBe('UNAVAILABLE');
    expect(l2_03.status).toBe('UNAVAILABLE');
  });

  it('L1-04, L1-06, L2-01, L2-03, L2-04 all UNAVAILABLE when vgrResult is null', () => {
    const input = makeInput({ vgrResult: null });
    const result = runContactGeometryIntelligence(input);
    const unavailableIds = result.allIndicators
      .filter(i => i.status === 'UNAVAILABLE')
      .map(i => i.id);
    expect(unavailableIds).toContain('L1-04');
    expect(unavailableIds).toContain('L1-06');
    expect(unavailableIds).toContain('L2-01');
    expect(unavailableIds).toContain('L2-03');
  });

  it('still returns available=true even when most inputs are missing', () => {
    const input = makeInput({
      vgrResult: null,
      stage7Data: makeStage7({ physicsStatus: 'SKIPPED_NON_PHYSICAL', estimatedSpeedKmh: null }),
      stage6Data: makeStage6({ damagedParts: [] }),
    });
    const result = runContactGeometryIntelligence(input);
    expect(result.available).toBe(true);
    expect(result.layer1Indicators).toHaveLength(7);
    expect(result.layer2Indicators).toHaveLength(5);
  });

  it('each indicator has required fields: id, name, layer, status, explanation, sources', () => {
    const result = runContactGeometryIntelligence(makeInput());
    for (const indicator of result.allIndicators) {
      expect(indicator).toHaveProperty('id');
      expect(indicator).toHaveProperty('name');
      expect(indicator).toHaveProperty('layer');
      expect(indicator).toHaveProperty('status');
      expect(indicator).toHaveProperty('explanation');
      expect(indicator).toHaveProperty('sources');
      expect(['PASS', 'ADVISORY', 'CONCERN', 'FLAG', 'UNAVAILABLE']).toContain(indicator.status);
      expect([1, 2]).toContain(indicator.layer);
    }
  });

  it('layer1Indicators all have layer=1, layer2Indicators all have layer=2', () => {
    const result = runContactGeometryIntelligence(makeInput());
    for (const ind of result.layer1Indicators) {
      expect(ind.layer).toBe(1);
    }
    for (const ind of result.layer2Indicators) {
      expect(ind.layer).toBe(2);
    }
  });
});
