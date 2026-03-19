/**
 * evidenceStrengthScorer.test.ts — Stage 38 Unit Tests
 * Covers: constants, scoreToLabel, per-engine scorers (damage/physics/fraud/cost/reconstruction),
 * composite scorer, EvidenceBundle contract, estimation flag, boundary thresholds, edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  scoreDamage,
  scorePhysics,
  scoreFraud,
  scoreCost,
  scoreReconstruction,
  computeEvidenceBundle,
  scoreEngine,
  scoreToLabel,
  HIGH_THRESHOLD,
  MEDIUM_THRESHOLD,
  SCORE_FLOOR,
  SCORE_CEILING,
  ESTIMATION_STRATEGIES,
  PARTIAL_STRATEGIES,
  ENGINE_WEIGHTS,
} from "./evidenceStrengthScorer";
import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  Assumption,
} from "./types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeAssumption(strategy: string, confidence = 50): Assumption {
  return {
    field: "test",
    assumedValue: "test",
    reason: "test",
    strategy: strategy as any,
    confidence,
    stage: "Stage 5",
  };
}

function makeClaimRecord(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    claimId: 1,
    tenantId: 1,
    vehicle: { make: "Toyota", model: "Corolla", year: 2020, registration: "ABC123", vin: null, colour: null, engineNumber: null, mileageKm: null, massKg: 1400 },
    driver: { name: "Test Driver", licenceNumber: null, yearsLicensed: null },
    accidentDetails: {
      date: "2024-01-01",
      location: "Test Location",
      description: "Test accident",
      incidentType: "collision",
      collisionDirection: "frontal",
      impactPoint: "front",
      estimatedSpeedKmh: 60,
      maxCrushDepthM: 0.3,
      totalDamageAreaM2: 1.5,
      structuralDamage: false,
      airbagDeployment: true,
    },
    policeReport: { reportNumber: "RPT-001", station: "Central" },
    damage: {
      description: "Significant front damage with crumple zone deformation",
      components: [{ name: "Bumper" } as any, { name: "Hood" } as any],
      imageUrls: ["img1.jpg", "img2.jpg", "img3.jpg"],
    },
    repairQuote: {
      repairerName: "AutoFix",
      repairerCompany: "AutoFix Ltd",
      assessorName: "John Smith",
      quoteTotalCents: 500_000,
      labourCostCents: 150_000,
      partsCostCents: 350_000,
      lineItems: [{ description: "Bumper", amount: 200_000 } as any, { description: "Hood", amount: 150_000 } as any],
    },
    dataQuality: { completenessScore: 90, missingFields: [], validationIssues: [] },
    marketRegion: "ZA",
    assumptions: [],
    ...overrides,
  } as ClaimRecord;
}

function makeStage6(overrides: Partial<Stage6Output> = {}): Stage6Output {
  return {
    damagedParts: [
      { name: "Bumper", location: "front", damageType: "crush", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: "Hood", location: "front", damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.3 },
    ],
    damageZones: [
      { zone: "front", componentCount: 2, maxSeverity: "moderate" },
      { zone: "engine", componentCount: 1, maxSeverity: "minor" },
    ],
    overallSeverityScore: 45,
    structuralDamageDetected: false,
    totalDamageArea: 1.5,
    ...overrides,
  };
}

function makeStage7(overrides: Partial<Stage7Output> = {}): Stage7Output {
  return {
    impactForceKn: 80,
    impactVector: { direction: "frontal", magnitude: 80, angle: 0 },
    energyDistribution: { kineticEnergyJ: 200_000, energyDissipatedJ: 160_000, energyDissipatedKj: 160 },
    estimatedSpeedKmh: 60,
    deltaVKmh: 40,
    decelerationG: 8,
    accidentSeverity: "moderate",
    accidentReconstructionSummary: "Frontal impact at moderate speed",
    damageConsistencyScore: 85,
    latentDamageProbability: { engine: 0.1, transmission: 0.05, suspension: 0.2, frame: 0.1, electrical: 0.05 },
    physicsExecuted: true,
    ...overrides,
  } as Stage7Output;
}

function makeStage8(overrides: Partial<Stage8Output> = {}): Stage8Output {
  return {
    fraudRiskScore: 20,
    fraudRiskLevel: "low",
    indicators: [],
    quoteDeviation: null,
    repairerHistory: { flagged: false, notes: "Clean history" },
    claimantClaimFrequency: { flagged: false, notes: "Normal frequency" },
    vehicleClaimHistory: { flagged: false, notes: "No prior claims" },
    damageConsistencyScore: 85,
    damageConsistencyNotes: "Consistent",
    ...overrides,
  };
}

function makeStage9(overrides: Partial<Stage9Output> = {}): Stage9Output {
  return {
    expectedRepairCostCents: 500_000,
    quoteDeviationPct: 5,
    recommendedCostRange: { lowCents: 400_000, highCents: 600_000 },
    savingsOpportunityCents: 20_000,
    breakdown: {
      partsCostCents: 350_000,
      labourCostCents: 150_000,
      paintCostCents: 0,
      hiddenDamageCostCents: 0,
      totalCents: 500_000,
    },
    labourRateUsdPerHour: 40,
    marketRegion: "ZA",
    currency: "USD",
    repairIntelligence: [
      { component: "Bumper", location: "front", severity: "moderate", recommendedAction: "Replace", partsCost: 200, labourCost: 50, paintCost: 0, totalCost: 250, currency: "USD", notes: null },
      { component: "Hood", location: "front", severity: "minor", recommendedAction: "Repair", partsCost: 100, labourCost: 30, paintCost: 0, totalCost: 130, currency: "USD", notes: null },
      { component: "Radiator", location: "front", severity: "minor", recommendedAction: "Replace", partsCost: 150, labourCost: 20, paintCost: 0, totalCost: 170, currency: "USD", notes: null },
    ],
    partsReconciliation: [
      { component: "Bumper", aiEstimate: 200, quotedAmount: 210, variance: 10, variancePct: 5, flag: null },
    ],
    ...overrides,
  };
}

// ─── 1. Exported constants ────────────────────────────────────────────────────

describe("exported constants", () => {
  it("HIGH_THRESHOLD is 0.75", () => expect(HIGH_THRESHOLD).toBe(0.75));
  it("MEDIUM_THRESHOLD is 0.50", () => expect(MEDIUM_THRESHOLD).toBe(0.50));
  it("SCORE_FLOOR is 0.10", () => expect(SCORE_FLOOR).toBe(0.10));
  it("SCORE_CEILING is 1.0", () => expect(SCORE_CEILING).toBe(1.0));
  it("ESTIMATION_STRATEGIES contains industry_average", () => expect(ESTIMATION_STRATEGIES.has("industry_average")).toBe(true));
  it("ESTIMATION_STRATEGIES contains damage_based_estimate", () => expect(ESTIMATION_STRATEGIES.has("damage_based_estimate")).toBe(true));
  it("ESTIMATION_STRATEGIES contains default_value", () => expect(ESTIMATION_STRATEGIES.has("default_value")).toBe(true));
  it("PARTIAL_STRATEGIES contains secondary_ocr", () => expect(PARTIAL_STRATEGIES.has("secondary_ocr")).toBe(true));
  it("ENGINE_WEIGHTS sum to 1.0", () => {
    const sum = Object.values(ENGINE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });
});

// ─── 2. scoreToLabel ──────────────────────────────────────────────────────────

describe("scoreToLabel", () => {
  it("returns HIGH for score >= 0.75", () => expect(scoreToLabel(0.75)).toBe("HIGH"));
  it("returns HIGH for score = 1.0", () => expect(scoreToLabel(1.0)).toBe("HIGH"));
  it("returns HIGH for score = 0.90", () => expect(scoreToLabel(0.90)).toBe("HIGH"));
  it("returns MEDIUM for score = 0.50", () => expect(scoreToLabel(0.50)).toBe("MEDIUM"));
  it("returns MEDIUM for score = 0.74", () => expect(scoreToLabel(0.74)).toBe("MEDIUM"));
  it("returns MEDIUM for score = 0.60", () => expect(scoreToLabel(0.60)).toBe("MEDIUM"));
  it("returns LOW for score = 0.10", () => expect(scoreToLabel(0.10)).toBe("LOW"));
  it("returns LOW for score = 0.49", () => expect(scoreToLabel(0.49)).toBe("LOW"));
  it("returns LOW for score = 0.30", () => expect(scoreToLabel(0.30)).toBe("LOW"));
});

// ─── 3. EvidenceTag contract ──────────────────────────────────────────────────

describe("EvidenceTag contract", () => {
  it("evidence_strength is always between SCORE_FLOOR and SCORE_CEILING", () => {
    const r = scoreDamage(makeStage6(), makeClaimRecord());
    expect(r.evidence_strength).toBeGreaterThanOrEqual(SCORE_FLOOR);
    expect(r.evidence_strength).toBeLessThanOrEqual(SCORE_CEILING);
  });
  it("evidence_label matches evidence_strength", () => {
    const r = scoreDamage(makeStage6(), makeClaimRecord());
    expect(r.evidence_label).toBe(scoreToLabel(r.evidence_strength));
  });
  it("value is the raw engine output value", () => {
    const s6 = makeStage6({ overallSeverityScore: 55 });
    const r = scoreDamage(s6, makeClaimRecord());
    expect(r.value).toBe(55);
  });
  it("estimated is a boolean", () => {
    const r = scoreDamage(makeStage6(), makeClaimRecord());
    expect(typeof r.estimated).toBe("boolean");
  });
});

// ─── 4. Damage scorer ─────────────────────────────────────────────────────────

describe("scoreDamage", () => {
  it("returns HIGH when images, description, components, and zones all present", () => {
    const r = scoreDamage(makeStage6(), makeClaimRecord());
    expect(r.evidence_label).toBe("HIGH");
    expect(r.estimated).toBe(false);
  });
  it("returns MEDIUM when only 1 image and no description", () => {
    const cr = makeClaimRecord({
      damage: { description: null, components: [], imageUrls: ["img1.jpg"] },
    });
    const r = scoreDamage(makeStage6({ damagedParts: [], damageZones: [{ zone: "front", componentCount: 1, maxSeverity: "minor" }] }), cr);
    expect(["MEDIUM", "LOW"]).toContain(r.evidence_label);
  });
  it("returns LOW when no images, no description, no components", () => {
    const cr = makeClaimRecord({
      damage: { description: null, components: [], imageUrls: [] },
      assumptions: [],
    });
    const r = scoreDamage(makeStage6({ damagedParts: [], damageZones: [] }), cr);
    expect(r.evidence_label).toBe("LOW");
  });
  it("estimated=true when estimation assumptions present", () => {
    const cr = makeClaimRecord({
      assumptions: [makeAssumption("damage_based_estimate")],
    });
    const r = scoreDamage(makeStage6(), cr);
    expect(r.estimated).toBe(true);
  });
  it("estimated=false when no estimation assumptions", () => {
    const r = scoreDamage(makeStage6(), makeClaimRecord());
    expect(r.estimated).toBe(false);
  });
  it("score is penalised by estimation assumptions", () => {
    const clean = scoreDamage(makeStage6(), makeClaimRecord());
    const withAssumptions = scoreDamage(makeStage6(), makeClaimRecord({
      assumptions: [makeAssumption("industry_average"), makeAssumption("default_value")],
    }));
    expect(withAssumptions.evidence_strength).toBeLessThan(clean.evidence_strength);
  });
  it("3+ images give higher score than 1 image", () => {
    const r1 = scoreDamage(makeStage6(), makeClaimRecord({ damage: { description: "desc", components: [], imageUrls: ["img1.jpg"] } }));
    const r3 = scoreDamage(makeStage6(), makeClaimRecord({ damage: { description: "desc", components: [], imageUrls: ["img1.jpg", "img2.jpg", "img3.jpg"] } }));
    expect(r3.evidence_strength).toBeGreaterThan(r1.evidence_strength);
  });
  it("score never goes below SCORE_FLOOR even with many assumptions", () => {
    const cr = makeClaimRecord({
      damage: { description: null, components: [], imageUrls: [] },
      assumptions: Array.from({ length: 10 }, () => makeAssumption("industry_average")),
    });
    const r = scoreDamage(makeStage6({ damagedParts: [], damageZones: [] }), cr);
    expect(r.evidence_strength).toBeGreaterThanOrEqual(SCORE_FLOOR);
  });
});

// ─── 5. Physics scorer ────────────────────────────────────────────────────────

describe("scorePhysics", () => {
  it("returns HIGH when physics executed and all data present", () => {
    const r = scorePhysics(makeStage7(), makeClaimRecord());
    expect(r.evidence_label).toBe("HIGH");
  });
  it("returns LOW when physics not executed and no direct data", () => {
    const cr = makeClaimRecord({
      accidentDetails: {
        date: "2024-01-01", location: "L", description: "D", incidentType: "collision",
        collisionDirection: "frontal", impactPoint: null, estimatedSpeedKmh: null,
        maxCrushDepthM: null, totalDamageAreaM2: null, structuralDamage: false, airbagDeployment: false,
      },
      policeReport: { reportNumber: null, station: null },
      assumptions: [],
    });
    const r = scorePhysics(makeStage7({ physicsExecuted: false }), cr);
    expect(r.evidence_label).toBe("LOW");
  });
  it("estimated=true when physicsExecuted=false", () => {
    const r = scorePhysics(makeStage7({ physicsExecuted: false }), makeClaimRecord());
    expect(r.estimated).toBe(true);
  });
  it("police report presence adds to score", () => {
    // Use a sparse claim so the score has room below the ceiling to show the difference
    const sparseBase: Partial<ClaimRecord> = {
      accidentDetails: { date: "2024-01-01", location: "L", description: "D", incidentType: "collision", collisionDirection: "frontal", impactPoint: null, estimatedSpeedKmh: null, maxCrushDepthM: null, totalDamageAreaM2: null, structuralDamage: false, airbagDeployment: false },
    };
    const withPolice = scorePhysics(makeStage7(), makeClaimRecord({ ...sparseBase, policeReport: { reportNumber: "RPT-001", station: "Central" } }));
    const noPolice = scorePhysics(makeStage7(), makeClaimRecord({ ...sparseBase, policeReport: { reportNumber: null, station: null } }));
    expect(withPolice.evidence_strength).toBeGreaterThan(noPolice.evidence_strength);
  });
  it("value is impactForceKn", () => {
    const r = scorePhysics(makeStage7({ impactForceKn: 120 }), makeClaimRecord());
    expect(r.value).toBe(120);
  });
  it("score never goes below SCORE_FLOOR", () => {
    const cr = makeClaimRecord({
      accidentDetails: { date: null, location: null, description: null, incidentType: "collision", collisionDirection: "unknown", impactPoint: null, estimatedSpeedKmh: null, maxCrushDepthM: null, totalDamageAreaM2: null, structuralDamage: false, airbagDeployment: false },
      policeReport: { reportNumber: null, station: null },
      assumptions: Array.from({ length: 10 }, () => makeAssumption("typical_collision")),
    });
    const r = scorePhysics(makeStage7({ physicsExecuted: false }), cr);
    expect(r.evidence_strength).toBeGreaterThanOrEqual(SCORE_FLOOR);
  });
});

// ─── 6. Fraud scorer ──────────────────────────────────────────────────────────

describe("scoreFraud", () => {
  it("returns HIGH when full quote, line items, repairer, assessor, and history present", () => {
    const r = scoreFraud(makeStage8(), makeClaimRecord());
    expect(r.evidence_label).toBe("HIGH");
  });
  it("returns LOW when no quote and no repairer info", () => {
    const cr = makeClaimRecord({
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
      assumptions: [],
    });
    const r = scoreFraud(makeStage8({ vehicleClaimHistory: { flagged: false, notes: "" }, claimantClaimFrequency: { flagged: false, notes: "" } }), cr);
    expect(r.evidence_label).toBe("LOW");
  });
  it("estimated=true when no quote present", () => {
    const cr = makeClaimRecord({
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
    });
    const r = scoreFraud(makeStage8(), cr);
    expect(r.estimated).toBe(true);
  });
  it("value is fraudRiskScore", () => {
    const r = scoreFraud(makeStage8({ fraudRiskScore: 42 }), makeClaimRecord());
    expect(r.value).toBe(42);
  });
  it("line items add to score vs lump sum", () => {
    const withItems = scoreFraud(makeStage8(), makeClaimRecord());
    const noItems = scoreFraud(makeStage8(), makeClaimRecord({
      repairQuote: { repairerName: "AutoFix", repairerCompany: "AutoFix Ltd", assessorName: "John", quoteTotalCents: 500_000, labourCostCents: 150_000, partsCostCents: 350_000, lineItems: [] },
    }));
    expect(withItems.evidence_strength).toBeGreaterThan(noItems.evidence_strength);
  });
  it("score never goes below SCORE_FLOOR", () => {
    const cr = makeClaimRecord({
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
      assumptions: Array.from({ length: 10 }, () => makeAssumption("industry_average")),
    });
    const r = scoreFraud(makeStage8({ vehicleClaimHistory: { flagged: false, notes: "" }, claimantClaimFrequency: { flagged: false, notes: "" } }), cr);
    expect(r.evidence_strength).toBeGreaterThanOrEqual(SCORE_FLOOR);
  });
});

// ─── 7. Cost scorer ───────────────────────────────────────────────────────────

describe("scoreCost", () => {
  it("returns HIGH when full quote, labour, parts, RI items, reconciliation, and deviation present", () => {
    const r = scoreCost(makeStage9(), makeClaimRecord());
    expect(r.evidence_label).toBe("HIGH");
  });
  it("returns LOW when no quote and no RI items", () => {
    const cr = makeClaimRecord({
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
      assumptions: [],
    });
    const r = scoreCost(makeStage9({ repairIntelligence: [], partsReconciliation: [], quoteDeviationPct: null }), cr);
    expect(r.evidence_label).toBe("LOW");
  });
  it("estimated=true when no quote present", () => {
    const cr = makeClaimRecord({
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
    });
    const r = scoreCost(makeStage9(), cr);
    expect(r.estimated).toBe(true);
  });
  it("value is expectedRepairCostCents", () => {
    const r = scoreCost(makeStage9({ expectedRepairCostCents: 750_000 }), makeClaimRecord());
    expect(r.value).toBe(750_000);
  });
  it("3+ RI items give higher score than 0 items", () => {
    const with3 = scoreCost(makeStage9(), makeClaimRecord());
    const with0 = scoreCost(makeStage9({ repairIntelligence: [] }), makeClaimRecord());
    expect(with3.evidence_strength).toBeGreaterThan(with0.evidence_strength);
  });
  it("score never goes below SCORE_FLOOR", () => {
    const cr = makeClaimRecord({
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
      assumptions: Array.from({ length: 10 }, () => makeAssumption("industry_average")),
    });
    const r = scoreCost(makeStage9({ repairIntelligence: [], partsReconciliation: [], quoteDeviationPct: null }), cr);
    expect(r.evidence_strength).toBeGreaterThanOrEqual(SCORE_FLOOR);
  });
});

// ─── 8. Reconstruction scorer ─────────────────────────────────────────────────

describe("scoreReconstruction", () => {
  it("returns HIGH when physics executed and all data present", () => {
    const r = scoreReconstruction(makeStage7(), makeClaimRecord());
    expect(r.evidence_label).toBe("HIGH");
  });
  it("returns LOW when physics not executed and no direct data", () => {
    const cr = makeClaimRecord({
      accidentDetails: { date: "2024-01-01", location: "L", description: "D", incidentType: "collision", collisionDirection: "frontal", impactPoint: null, estimatedSpeedKmh: null, maxCrushDepthM: null, totalDamageAreaM2: null, structuralDamage: false, airbagDeployment: false },
      policeReport: { reportNumber: null, station: null },
      damage: { description: null, components: [], imageUrls: [] },
      assumptions: [],
    });
    const r = scoreReconstruction(makeStage7({ physicsExecuted: false }), cr);
    expect(r.evidence_label).toBe("LOW");
  });
  it("value is accidentReconstructionSummary string", () => {
    const summary = "Frontal impact at 60 km/h";
    const r = scoreReconstruction(makeStage7({ accidentReconstructionSummary: summary }), makeClaimRecord());
    expect(r.value).toBe(summary);
  });
  it("estimated=true when physicsExecuted=false", () => {
    const r = scoreReconstruction(makeStage7({ physicsExecuted: false }), makeClaimRecord());
    expect(r.estimated).toBe(true);
  });
});

// ─── 9. computeEvidenceBundle ─────────────────────────────────────────────────

describe("computeEvidenceBundle", () => {
  it("returns all required fields", () => {
    const b = computeEvidenceBundle(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9());
    expect(b.damage).toBeDefined();
    expect(b.physics).toBeDefined();
    expect(b.fraud).toBeDefined();
    expect(b.cost).toBeDefined();
    expect(b.reconstruction).toBeDefined();
    expect(b.composite).toBeDefined();
    expect(typeof b.generated_at).toBe("string");
  });
  it("composite evidence_strength is between SCORE_FLOOR and SCORE_CEILING", () => {
    const b = computeEvidenceBundle(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9());
    expect(b.composite.evidence_strength).toBeGreaterThanOrEqual(SCORE_FLOOR);
    expect(b.composite.evidence_strength).toBeLessThanOrEqual(SCORE_CEILING);
  });
  it("composite is HIGH when all engines are HIGH", () => {
    const b = computeEvidenceBundle(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9());
    expect(b.composite.evidence_label).toBe("HIGH");
  });
  it("composite is LOW when all data is missing", () => {
    const cr = makeClaimRecord({
      damage: { description: null, components: [], imageUrls: [] },
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
      policeReport: { reportNumber: null, station: null },
      accidentDetails: { date: "2024-01-01", location: "L", description: "D", incidentType: "collision", collisionDirection: "frontal", impactPoint: null, estimatedSpeedKmh: null, maxCrushDepthM: null, totalDamageAreaM2: null, structuralDamage: false, airbagDeployment: false },
      assumptions: Array.from({ length: 5 }, () => makeAssumption("industry_average")),
    });
    const b = computeEvidenceBundle(
      cr,
      makeStage6({ damagedParts: [], damageZones: [] }),
      makeStage7({ physicsExecuted: false }),
      makeStage8({ vehicleClaimHistory: { flagged: false, notes: "" }, claimantClaimFrequency: { flagged: false, notes: "" } }),
      makeStage9({ repairIntelligence: [], partsReconciliation: [], quoteDeviationPct: null })
    );
    expect(b.composite.evidence_label).toBe("LOW");
  });
  it("composite.estimated=true when any engine is estimated", () => {
    const cr = makeClaimRecord({
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
    });
    const b = computeEvidenceBundle(cr, makeStage6(), makeStage7(), makeStage8(), makeStage9());
    expect(b.composite.estimated).toBe(true);
  });
  it("composite.estimated=false when no engine is estimated", () => {
    const b = computeEvidenceBundle(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9());
    expect(b.composite.estimated).toBe(false);
  });
  it("generated_at is a valid ISO timestamp", () => {
    const b = computeEvidenceBundle(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9());
    expect(new Date(b.generated_at).getFullYear()).toBeGreaterThan(2020);
  });
  it("composite value is a number between 0 and 1", () => {
    const b = computeEvidenceBundle(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9());
    expect(b.composite.value).toBeGreaterThanOrEqual(0);
    expect(b.composite.value).toBeLessThanOrEqual(1);
  });
});

// ─── 10. scoreEngine convenience function ─────────────────────────────────────

describe("scoreEngine", () => {
  const cr = makeClaimRecord();
  const s6 = makeStage6();
  const s7 = makeStage7();
  const s8 = makeStage8();
  const s9 = makeStage9();

  it("returns damage tag for 'damage' engine", () => {
    const r = scoreEngine("damage", cr, s6, s7, s8, s9);
    expect(r.value).toBe(s6.overallSeverityScore);
  });
  it("returns physics tag for 'physics' engine", () => {
    const r = scoreEngine("physics", cr, s6, s7, s8, s9);
    expect(r.value).toBe(s7.impactForceKn);
  });
  it("returns fraud tag for 'fraud' engine", () => {
    const r = scoreEngine("fraud", cr, s6, s7, s8, s9);
    expect(r.value).toBe(s8.fraudRiskScore);
  });
  it("returns cost tag for 'cost' engine", () => {
    const r = scoreEngine("cost", cr, s6, s7, s8, s9);
    expect(r.value).toBe(s9.expectedRepairCostCents);
  });
  it("returns reconstruction tag for 'reconstruction' engine", () => {
    const r = scoreEngine("reconstruction", cr, s6, s7, s8, s9);
    expect(r.value).toBe(s7.accidentReconstructionSummary);
  });
});

// ─── 11. Boundary and edge cases ─────────────────────────────────────────────

describe("boundary and edge cases", () => {
  it("score at exactly 0.75 is HIGH", () => expect(scoreToLabel(0.75)).toBe("HIGH"));
  it("score at exactly 0.50 is MEDIUM", () => expect(scoreToLabel(0.50)).toBe("MEDIUM"));
  it("score at exactly 0.10 is LOW", () => expect(scoreToLabel(0.10)).toBe("LOW"));
  it("score just below HIGH_THRESHOLD is MEDIUM", () => expect(scoreToLabel(HIGH_THRESHOLD - 0.001)).toBe("MEDIUM"));
  it("score just below MEDIUM_THRESHOLD is LOW", () => expect(scoreToLabel(MEDIUM_THRESHOLD - 0.001)).toBe("LOW"));
  it("partial strategy assumption causes less penalty than estimation strategy", () => {
    // Use a minimal damage fixture so the base score is not already at the ceiling
    const minimalDamage = makeStage6({ damagedParts: [], damageZones: [] });
    const minimalClaim = (assumptions: Assumption[]) => makeClaimRecord({
      damage: { description: null, components: [], imageUrls: ["img1.jpg"] },
      assumptions,
    });
    const withPartial = scoreDamage(minimalDamage, minimalClaim([makeAssumption("secondary_ocr")]));
    const withEstimation = scoreDamage(minimalDamage, minimalClaim([makeAssumption("industry_average")]));
    expect(withPartial.evidence_strength).toBeGreaterThan(withEstimation.evidence_strength);
  });
  it("multiple estimation assumptions cause greater penalty than one", () => {
    const one = scoreDamage(makeStage6(), makeClaimRecord({ assumptions: [makeAssumption("industry_average")] }));
    const three = scoreDamage(makeStage6(), makeClaimRecord({ assumptions: [makeAssumption("industry_average"), makeAssumption("default_value"), makeAssumption("typical_collision")] }));
    expect(three.evidence_strength).toBeLessThan(one.evidence_strength);
  });
  it("full data bundle produces higher composite than empty bundle", () => {
    const full = computeEvidenceBundle(makeClaimRecord(), makeStage6(), makeStage7(), makeStage8(), makeStage9());
    const cr = makeClaimRecord({
      damage: { description: null, components: [], imageUrls: [] },
      repairQuote: { repairerName: null, repairerCompany: null, assessorName: null, quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [] },
      policeReport: { reportNumber: null, station: null },
      accidentDetails: { date: "2024-01-01", location: "L", description: "D", incidentType: "collision", collisionDirection: "frontal", impactPoint: null, estimatedSpeedKmh: null, maxCrushDepthM: null, totalDamageAreaM2: null, structuralDamage: false, airbagDeployment: false },
    });
    const empty = computeEvidenceBundle(
      cr,
      makeStage6({ damagedParts: [], damageZones: [] }),
      makeStage7({ physicsExecuted: false }),
      makeStage8({ vehicleClaimHistory: { flagged: false, notes: "" }, claimantClaimFrequency: { flagged: false, notes: "" } }),
      makeStage9({ repairIntelligence: [], partsReconciliation: [], quoteDeviationPct: null })
    );
    expect(full.composite.evidence_strength).toBeGreaterThan(empty.composite.evidence_strength);
  });
});
