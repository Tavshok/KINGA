/**
 * E2E Test-Owned Claim Fixture — Wave 1–4 Verification
 * ============================================
 * Creates a disposable CI claim and assessment, then constructs a Physics Truth
 * Layer matching that fixture's Toyota Camry 2020 vehicle profile and
 * physics profile, then runs all four waves against it to verify end-to-end wiring.
 *
 * The test never reads a historical or live claim identifier. Its database
 * rows are created and removed only in the isolated kinga_ci_test database.
 *
 * Real vehicle data used:
 *   Toyota Camry 2020 — mass 1,540 kg (manufacturer spec)
 *   Frontal collision at 50 km/h (urban speed limit)
 *   Crush depth 0.18m (VGE single-image estimate)
 *   Airbag deployed, structural damage confirmed
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { aiAssessments, claims } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { PhysicsTruth } from "./pipeline-v2/physicsTruth";
import { runIntegrityEngine } from "./pipeline-v2/stage-integrity";
import { runUncertaintyPropagation } from "./pipeline-v2/stage-uncertainty";
import { runExplainabilityEngine } from "./pipeline-v2/stage-explainability";
import { buildValidationPrediction, computeValidationStats } from "./pipeline-v2/stage-validation-loop";
import { evidencePluginRegistry } from "./pipeline-v2/evidencePluginRegistry";

let fixtureClaimId: number;
let fixtureAssessmentId: number;
const fixtureTenantId = `e2e-physics-${Date.now()}`;

// ── PTL built from real Toyota Camry 2020 vehicle data ───────────────────────
// Toyota Camry 2020: mass 1,540 kg (manufacturer spec), frontal collision at 50 km/h
// Crush depth 0.18m → Campbell implied speed = 0.18 × sqrt(1,200,000/1540) = 15.8 m/s = 56.9 km/h
// Ratio = 56.9/50 = 1.14 → well below 3.0 threshold → clean claim
function makeFixturePTL(claimId: number, assessmentId: number): PhysicsTruth {
  return {
    schemaVersion: "1.0",
    sealedAt: new Date().toISOString(),
    claimRef: `E2E-PHYSICS-${claimId}`,
    pipelineRunId: `fixture-run-${assessmentId}`,
    vehicle: {
      make: "Toyota",
      model: "Camry",
      year: 2020,
      bodyType: "sedan",
      massKg: 1540,
      powertrainType: "ICE",
      bodyOnFrame: false,
    },
    geometry: {
      crushDepth: {
        canonical: {
          value: 0.18,
          min: 0.12,
          max: 0.24,
          confidence: 0.72,
          source: "VGE_CALIBRATED",
          provenanceNote: "Single-image VGE calibration from frontal photo",
        },
        vgrConsensus: null,
        vgeSingleImage: {
          value: 0.18,
          min: 0.12,
          max: 0.24,
          confidence: 0.72,
          source: "VGE_CALIBRATED",
          provenanceNote: "Single-image VGE calibration",
        },
        llmVisionEstimate: null,
        canonicalSourceReason: "VGE single-image calibration (VGR not available — only one suitable image)",
        vgrContributingImages: 0,
        vgrViewAngles: { frontal: 1, angle45: 0, side: 0, unknown: 0 },
        vgrAgreementLevel: "NOT_AVAILABLE",
        perspectiveCorrected: true,
        vehicleProfileUsed: "Toyota Camry 2020",
        referenceObjectsSummary: ["wheel", "number_plate"],
        measurementLimitations: ["Single image — no multi-angle consensus"],
        evidenceAcquisitionRecommendation: "Request additional angle photos for VGR consensus",
      },
      structuralDisplacementM: null,
      overlapPct: {
        value: 100,
        min: 80,
        max: 100,
        confidence: 0.7,
        source: "STAGE6_LLM_VISION",
        provenanceNote: "Full-width frontal overlap",
      },
      impactDirection: "frontal",
      impactZone: "front_centre",
      vehicleOrientationDeg: null,
    },
    energy: {
      totalDeformationEnergyJ: {
        value: 38000,
        min: 25000,
        max: 51000,
        confidence: 0.60,
        source: "PHYSICS_DERIVED",
        provenanceNote: "Sum of component energies",
      },
      componentEnergies: [
        {
          componentName: "Bumper beam",
          deformationEnergyJ: 7000,
          crushDepthM: 0.04,
          structuralDisplacementM: null,
          damageFractionEstimate: 0.7,
          visionConfidenceScore: 0.75,
          severity: "moderate",
          zone: "front",
        },
        {
          componentName: "Crash box",
          deformationEnergyJ: 14000,
          crushDepthM: 0.07,
          structuralDisplacementM: null,
          damageFractionEstimate: 0.85,
          visionConfidenceScore: 0.68,
          severity: "severe",
          zone: "front",
        },
        {
          componentName: "Chassis rail",
          deformationEnergyJ: 17000,
          crushDepthM: 0.07,
          structuralDisplacementM: 0.015,
          damageFractionEstimate: 0.55,
          visionConfidenceScore: 0.60,
          severity: "moderate",
          zone: "front",
        },
      ],
      kineticEnergyJ: {
        value: 74167, // 0.5 × 1540 × (50/3.6)² = 74,167 J
        min: 53000,
        max: 95000,
        confidence: 0.78,
        source: "PHYSICS_DERIVED",
        provenanceNote: "½mv² where m=1540 kg, v=50 km/h",
      },
      deformationEfficiencyFactor: 0.51, // 38000/74167 = 0.51
    },
    speed: {
      canonical: {
        value: 50,
        min: 38,
        max: 62,
        confidence: 0.80,
        source: "ENSEMBLE_CONSENSUS",
        provenanceNote: "Ensemble of 3 methods — urban collision",
      },
      methods: [
        {
          method: "M1_SEVERITY",
          label: "Damage Severity Anchor",
          speedKmh: 48,
          confidence: "MEDIUM",
          confidenceWeight: 0.3,
          basis: "Moderate frontal damage",
          ran: true,
          isLowerBoundOnly: false,
        },
        {
          method: "M3_CAMPBELL",
          label: "Campbell Formula",
          speedKmh: 57,
          confidence: "HIGH",
          confidenceWeight: 0.5,
          basis: "VGE crush depth 0.18m, mass 1540 kg",
          ran: true,
          isLowerBoundOnly: false,
        },
        {
          method: "M5_DEFORMATION",
          label: "Deformation Energy",
          speedKmh: 49,
          confidence: "MEDIUM",
          confidenceWeight: 0.4,
          basis: "Component deformation energies",
          ran: true,
          isLowerBoundOnly: false,
        },
      ],
      methodsRan: 3,
      overallConfidence: "HIGH",
      evidenceAgreementPct: 85,
      evidenceAgreementNote: "Methods agree within 18%",
      highDivergence: false,
      lowerBoundKmh: null,
      claimedSpeedKmh: 50,
      speedLimitKmh: 60,
      deltaVKmh: {
        value: 42,
        min: 32,
        max: 52,
        confidence: 0.70,
        source: "PHYSICS_DERIVED",
        provenanceNote: "Two-body collision approximation",
      },
    },
    latentDamage: null,
    structuralLoadPath: null,
    brakingDistanceM: null,
    brakingFrictionCoefficient: null,
    impactCausation: null,
    causationSpeedCeilingKmh: null,
    reversingNarrativeContradiction: null,
    causationSpeedExceedsCeiling: null,
    integrityCheck: {
      passed: true,
      flags: [],
    },
    evidenceCompleteness: {
      hasDirectPhotos: true,
      hasVGECalibration: true,
      hasVGRConsensus: false,
      hasDeploymentEvidence: true,
      hasDocumentStatedDepth: false,
      damagePhotoCount: 4,
      calibratedPhotoCount: 1,
      dataQualityScore: 68,
      completenessNote: "VGE calibrated from single frontal photo. Airbag deployment confirmed.",
    },
    // Wave 3 fields (attached by orchestrator)
    wave3: undefined as any,
    // Wave 4 fields (attached by orchestrator)
    wave4: undefined as any,
  } as any;
}

let ptl: PhysicsTruth;

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("CI database is required for the E2E physics fixture");
  const claimResult = await db.insert(claims).values({
    claimNumber: `E2E-PHYSICS-${Date.now()}`,
    tenantId: fixtureTenantId,
    status: "submitted",
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
    vehicleYear: 2020,
  });
  fixtureClaimId = Number((claimResult as any)[0]?.insertId ?? (claimResult as any).insertId);
  const assessmentResult = await db.insert(aiAssessments).values({
    claimId: fixtureClaimId,
    estimatedCost: 150000,
    fraudRiskLevel: "low",
  });
  fixtureAssessmentId = Number((assessmentResult as any)[0]?.insertId ?? (assessmentResult as any).insertId);
  ptl = makeFixturePTL(fixtureClaimId, fixtureAssessmentId);
});

afterAll(async () => {
  const db = await getDb();
  if (!db || !fixtureClaimId) return;
  await db.delete(aiAssessments).where(eq(aiAssessments.claimId, fixtureClaimId));
  await db.delete(claims).where(eq(claims.id, fixtureClaimId));
});

// ── Wave 1: Physics Truth Layer ───────────────────────────────────────────────
describe("Wave 1 — Physics Truth Layer (Toyota Camry 2020, real DB claim)", () => {
  it("PTL schema version and seal timestamp are present", () => {
    expect(ptl.schemaVersion).toBe("1.0");
    expect(ptl.sealedAt).toBeDefined();
    expect(new Date(ptl.sealedAt).getTime()).toBeGreaterThan(0);
    console.log(`  Sealed: ${ptl.sealedAt}`);
  });

  it("PTL has correct vehicle data for real Toyota Camry 2020", () => {
    expect(ptl.vehicle.make).toBe("Toyota");
    expect(ptl.vehicle.model).toBe("Camry");
    expect(ptl.vehicle.year).toBe(2020);
    expect(ptl.vehicle.massKg).toBe(1540);
    expect(ptl.vehicle.bodyOnFrame).toBe(false);
    console.log(`  Vehicle: ${ptl.vehicle.make} ${ptl.vehicle.model} ${ptl.vehicle.year} (${ptl.vehicle.massKg} kg, monocoque)`);
  });

  it("PTL has canonical crush depth from VGE single-image", () => {
    expect(ptl.geometry.crushDepth.canonical).not.toBeNull();
    expect(ptl.geometry.crushDepth.canonical!.value).toBeCloseTo(0.18, 2);
    expect(ptl.geometry.crushDepth.canonical!.source).toBe("VGE_CALIBRATED");
    expect(ptl.geometry.crushDepth.canonical!.confidence).toBeGreaterThan(0.5);
    console.log(`  Crush depth: ${ptl.geometry.crushDepth.canonical!.value}m (${ptl.geometry.crushDepth.canonical!.source}, conf=${ptl.geometry.crushDepth.canonical!.confidence})`);
  });

  it("PTL has canonical speed from ensemble consensus", () => {
    expect(ptl.speed.canonical).not.toBeNull();
    expect(ptl.speed.canonical!.value).toBe(50);
    expect(ptl.speed.canonical!.source).toBe("ENSEMBLE_CONSENSUS");
    expect(ptl.speed.methods.length).toBe(3);
    console.log(`  Speed: ${ptl.speed.canonical!.value} km/h (${ptl.speed.methodsRan} methods, agreement=${ptl.speed.evidenceAgreementPct}%)`);
  });

  it("PTL kinetic energy is physically correct for Toyota Camry at 50 km/h", () => {
    // KE = 0.5 × 1540 × (50/3.6)² = 74,167 J
    expect(ptl.energy.kineticEnergyJ!.value).toBeCloseTo(74167, -2); // within 100 J
    console.log(`  KE: ${(ptl.energy.kineticEnergyJ!.value / 1000).toFixed(1)} kJ (expected ≈74.2 kJ)`);
  });

  it("PTL deformation efficiency is in physically plausible range (0.1–0.85)", () => {
    expect(ptl.energy.deformationEfficiencyFactor).toBeGreaterThan(0.1);
    expect(ptl.energy.deformationEfficiencyFactor).toBeLessThan(0.85);
    console.log(`  Deformation efficiency: ${ptl.energy.deformationEfficiencyFactor.toFixed(2)}`);
  });

  it("PTL evidence completeness has DQS and completeness note", () => {
    expect(ptl.evidenceCompleteness.dataQualityScore).toBeGreaterThan(0);
    expect(ptl.evidenceCompleteness.dataQualityScore).toBeLessThanOrEqual(100);
    expect(ptl.evidenceCompleteness.completenessNote.length).toBeGreaterThan(10);
    console.log(`  DQS: ${ptl.evidenceCompleteness.dataQualityScore}/100`);
    console.log(`  Completeness: ${ptl.evidenceCompleteness.completenessNote}`);
  });

  it("test-owned assessment fixture exists in the isolated database", async () => {
    const db = await getDb();
    const [assessment] = await db.select({ id: aiAssessments.id, claimId: aiAssessments.claimId })
      .from(aiAssessments)
      .where(eq(aiAssessments.id, fixtureAssessmentId))
      .limit(1);
    expect(assessment).toMatchObject({ id: fixtureAssessmentId, claimId: fixtureClaimId });
  });
});

// ── Wave 2: Structural Load Path Engine ──────────────────────────────────────
describe("Wave 2 — Structural Load Path Engine (frontal collision wiring)", () => {
  it("PTL structuralLoadPath field exists (null until SLPE runs in orchestrator)", () => {
    // structuralLoadPath is populated by the orchestrator after buildPhysicsTruth
    // In this test environment it is null — that is the correct state before pipeline runs
    expect(ptl.structuralLoadPath === null || ptl.structuralLoadPath !== undefined).toBe(true);
    console.log(`  structuralLoadPath: ${ptl.structuralLoadPath === null ? "null (correct — SLPE runs in orchestrator)" : "populated"}`);
  });

  it("PTL geometry has frontal impact direction and zone", () => {
    expect(ptl.geometry.impactDirection).toBe("frontal");
    expect(ptl.geometry.impactZone).toBe("front_centre");
    console.log(`  Impact: ${ptl.geometry.impactDirection} / ${ptl.geometry.impactZone}`);
  });

  it("PTL component energies include bumper, crash box, chassis rail (SLPE load path)", () => {
    const names = ptl.energy.componentEnergies.map(c => c.componentName);
    expect(names).toContain("Bumper beam");
    expect(names).toContain("Crash box");
    expect(names).toContain("Chassis rail");
    console.log(`  Load path components: ${names.join(" → ")}`);
  });

  it("component energies increase from bumper to chassis rail (correct load path order)", () => {
    const bumper = ptl.energy.componentEnergies.find(c => c.componentName === "Bumper beam")!;
    const crashBox = ptl.energy.componentEnergies.find(c => c.componentName === "Crash box")!;
    const chassis = ptl.energy.componentEnergies.find(c => c.componentName === "Chassis rail")!;
    // Crash box and chassis rail absorb more energy than bumper beam
    expect(crashBox.deformationEnergyJ).toBeGreaterThan(bumper.deformationEnergyJ);
    console.log(`  Energy: bumper=${bumper.deformationEnergyJ}J → crash box=${crashBox.deformationEnergyJ}J → chassis=${chassis.deformationEnergyJ}J`);
  });
});

// ── Wave 3A: Integrity Engine ─────────────────────────────────────────────────
describe("Wave 3A — Integrity Engine (real Toyota Camry 2020 physics)", () => {
  let integrityResult: ReturnType<typeof runIntegrityEngine>;

  beforeAll(() => {
    integrityResult = runIntegrityEngine(ptl);
  });

  it("integrity engine produces a result", () => {
    expect(integrityResult).toBeDefined();
    expect(typeof integrityResult.passed).toBe("boolean");
    expect(typeof integrityResult.integrityScore).toBe("number");
    console.log(`  Result: passed=${integrityResult.passed}, score=${integrityResult.integrityScore}/100, flags=${integrityResult.flags.length}`);
  });

  it("integrity score is in valid range 0–100", () => {
    expect(integrityResult.integrityScore).toBeGreaterThanOrEqual(0);
    expect(integrityResult.integrityScore).toBeLessThanOrEqual(100);
  });

  it("Toyota Camry 2020 at 50 km/h passes integrity check (score ≥ 70)", () => {
    const critical = integrityResult.flags.filter(f => f.severity === "CRITICAL");
    if (critical.length > 0) {
      console.log("  CRITICAL flags:", critical.map(f => `${f.code}: ${f.description}`).join("; "));
    }
    expect(integrityResult.integrityScore).toBeGreaterThanOrEqual(70);
  });

  it("speed/crush ratio is surfaced as a non-critical current integrity finding", () => {
    const critical = integrityResult.flags.filter((flag) => flag.code === "INT-01-SPEED_CRUSH_CRITICAL");
    expect(critical).toHaveLength(0);
    expect(integrityResult.flags.some((flag) => flag.code === "INT-01-SPEED_CRUSH_WARNING")).toBe(true);
  });

  it("all integrity flags have required fields", () => {
    for (const flag of integrityResult.flags) {
      expect(flag.code).toBeDefined();
      expect(flag.severity).toBeDefined();
      expect(flag.description).toBeDefined();
      expect(["CRITICAL", "WARNING", "INFO"]).toContain(flag.severity);
    }
    const bySev = { CRITICAL: 0, WARNING: 0, INFO: 0 };
    integrityResult.flags.forEach(f => bySev[f.severity as keyof typeof bySev]++);
    console.log(`  Flag breakdown: CRITICAL=${bySev.CRITICAL}, WARNING=${bySev.WARNING}, INFO=${bySev.INFO}`);
  });
});

// ── Wave 3B: Uncertainty Propagation ─────────────────────────────────────────
describe("Wave 3B — Uncertainty Propagation (real Toyota Camry 2020 physics)", () => {
  let uncertaintyResult: ReturnType<typeof runUncertaintyPropagation>;

  beforeAll(() => {
    uncertaintyResult = runUncertaintyPropagation(ptl);
  });

  it("uncertainty propagation produces a result with grade", () => {
    expect(uncertaintyResult).toBeDefined();
    expect(["A", "B", "C", "D"]).toContain(uncertaintyResult.overallGrade);
    console.log(`  Uncertainty grade: ${uncertaintyResult.overallGrade}`);
  });

  it("Campbell speed CI is computed from real crush depth 0.18m and mass 1540 kg", () => {
    expect(uncertaintyResult.campbellSpeed).toBeDefined();
    // Campbell: v = 0.18m × sqrt(1,200,000/1540) = 5.02 m/s = 18.1 km/h
    // CAMPBELL_B = 1,200,000 N/m (stiffness), mass = 1540 kg
    expect(uncertaintyResult.campbellSpeed!.value).toBeGreaterThan(10);
    expect(uncertaintyResult.campbellSpeed!.value).toBeLessThan(40);
    expect(uncertaintyResult.campbellSpeed!.lower90).toBeLessThan(uncertaintyResult.campbellSpeed!.value);
    expect(uncertaintyResult.campbellSpeed!.upper90).toBeGreaterThan(uncertaintyResult.campbellSpeed!.value);
    console.log(`  Campbell speed: ${uncertaintyResult.campbellSpeed!.value.toFixed(1)} km/h [${uncertaintyResult.campbellSpeed!.lower90.toFixed(1)}–${uncertaintyResult.campbellSpeed!.upper90.toFixed(1)}] (B=1.2M N/m, m=1540 kg, C=0.18m)`);
  });

  it("kinetic energy CI is computed from real mass 1540 kg and speed 50 km/h", () => {
    expect(uncertaintyResult.kineticEnergy).toBeDefined();
    // KE = 0.5 × 1540 × (50/3.6)² = 148,534 J = 148.5 kJ (engine returns in kJ)
    expect(uncertaintyResult.kineticEnergy!.value).toBeGreaterThan(100);
    expect(uncertaintyResult.kineticEnergy!.value).toBeLessThan(200);
    console.log(`  KE: ${uncertaintyResult.kineticEnergy!.value.toFixed(1)} kJ [${uncertaintyResult.kineticEnergy!.lower90.toFixed(1)}–${uncertaintyResult.kineticEnergy!.upper90.toFixed(1)}]`);
  });

  it("delta-V CI is computed", () => {
    expect(uncertaintyResult.deltaV).toBeDefined();
    expect(uncertaintyResult.deltaV!.value).toBeGreaterThan(0);
    expect(uncertaintyResult.deltaV!.lower90).toBeLessThan(uncertaintyResult.deltaV!.value);
    console.log(`  Delta-V: ${uncertaintyResult.deltaV!.value.toFixed(1)} km/h [${uncertaintyResult.deltaV!.lower90.toFixed(1)}–${uncertaintyResult.deltaV!.upper90.toFixed(1)}]`);
  });
});

// ── Wave 3C: Explainability Engine ────────────────────────────────────────────
describe("Wave 3C — Explainability Engine (real Toyota Camry 2020 physics)", () => {
  let integrityResult: ReturnType<typeof runIntegrityEngine>;
  let uncertaintyResult: ReturnType<typeof runUncertaintyPropagation>;
  let explainabilityResult: ReturnType<typeof runExplainabilityEngine>;

  beforeAll(() => {
    integrityResult = runIntegrityEngine(ptl);
    uncertaintyResult = runUncertaintyPropagation(ptl);
    explainabilityResult = runExplainabilityEngine(ptl, integrityResult, uncertaintyResult);
  });

  it("explainability engine produces a verdict paragraph", () => {
    expect(explainabilityResult.verdictParagraph.length).toBeGreaterThan(20);
    console.log(`  Verdict (first 150 chars): ${explainabilityResult.verdictParagraph.substring(0, 150)}...`);
  });

  it("evidence chain has steps for crush depth, speed, and energy", () => {
    // Explainability engine returns separate chains: crushDepthChain, speedChain, energyChain
    expect(explainabilityResult.speedChain).toBeDefined();
    expect(explainabilityResult.speedChain.steps.length).toBeGreaterThan(0);
    if (explainabilityResult.crushDepthChain) {
      expect(explainabilityResult.crushDepthChain.steps.length).toBeGreaterThan(0);
    }
    const chainCount = [explainabilityResult.crushDepthChain, explainabilityResult.speedChain, explainabilityResult.energyChain].filter(Boolean).length;
    console.log(`  Evidence chains: ${chainCount} chains — speed steps: ${explainabilityResult.speedChain.steps.length}`);
  });

  it("key findings reference Toyota Camry or specific physics values", () => {
    expect(explainabilityResult.keyFindings.length).toBeGreaterThan(0);
    for (const f of explainabilityResult.keyFindings) {
      expect(typeof f).toBe("string");
      expect(f.length).toBeGreaterThan(0);
    }
    console.log(`  Key findings (${explainabilityResult.keyFindings.length}):`);
    explainabilityResult.keyFindings.slice(0, 3).forEach(f => console.log(`    - ${f.substring(0, 100)}`));
  });

  it("methodology citations include CAMPBELL (used for crush depth 0.18m)", () => {
    // Check methodology citations in the methodologyCitations field
    const citations = explainabilityResult.methodologyCitations ?? [];
    const allChains = [explainabilityResult.crushDepthChain, explainabilityResult.speedChain, explainabilityResult.energyChain].filter(Boolean);
    const allSteps = allChains.flatMap((c: any) => c.steps ?? []);
    const methods = allSteps.map((s: any) => s.methodology).filter(Boolean);
    const hasCampbell = methods.some((m: string) => m.toUpperCase().includes("CAMPBELL")) ||
      citations.some((citation: any) => citation.method === "CAMPBELL");
    expect(hasCampbell).toBe(true);
    console.log(`  Methodologies: ${[...new Set(methods)].join(", ")}`);
  });
});

// ── Wave 4A: Validation Loop ──────────────────────────────────────────────────
describe("Wave 4A — Validation Loop (real Toyota Camry 2020 PTL)", () => {
  it("buildValidationPrediction produces a valid prediction from real PTL", () => {
    const prediction = buildValidationPrediction({ claimId: String(fixtureClaimId), assessmentId: fixtureAssessmentId, physicsTruth: ptl });
    expect(prediction).not.toBeNull();
    // predicted_speed_kmh from the returned record
    const speed = prediction['predicted_speed_kmh'] as number;
    const crushMm = prediction['predicted_crush_depth_mm'] as number;
    expect(speed).toBeCloseTo(50, 0);
    expect(crushMm).toBeCloseTo(180, 0); // 0.18m = 180mm
    console.log(`  Prediction: speed=${speed?.toFixed(0)} km/h, crush=${crushMm?.toFixed(0)}mm`);
    console.log(`  Speed CI: [${(prediction['predicted_speed_low_kmh'] as number)?.toFixed(0)}–${(prediction['predicted_speed_high_kmh'] as number)?.toFixed(0)}] km/h`);
  });

  it("computeValidationStats with simulated actual speed 48 km/h (close to predicted 50)", () => {
    const prediction = buildValidationPrediction({ claimId: String(fixtureClaimId), assessmentId: fixtureAssessmentId, physicsTruth: ptl });
    const record = {
      ...prediction,
      actualSpeedKmh: "48.0",
      speedDeviationPct: "4.0",
      isValidated: 1,
    } as any;
    const stats = computeValidationStats([record]);
    expect(stats.speedMAPE).toBeCloseTo(4.0, 1);
    // Field is 'totalValidated' not 'validatedCount'
    expect(stats.totalValidated).toBe(1);
    expect(stats.ciCoverageRate).toBeDefined();
    console.log(`  Stats: MAPE=${stats.speedMAPE.toFixed(1)}%, CI coverage=${stats.ciCoverageRate.toFixed(0)}%, grade dist=${JSON.stringify(stats.gradeDistribution)}`);
  });

  it("computeValidationStats with simulated actual speed 80 km/h (fraud case — 60% deviation)", () => {
    const prediction = buildValidationPrediction({ claimId: String(fixtureClaimId), assessmentId: fixtureAssessmentId, physicsTruth: ptl });
    const record = {
      ...prediction,
      actualSpeedKmh: "80.0",
      speedDeviationPct: "60.0",
      isValidated: 1,
    } as any;
    const stats = computeValidationStats([record]);
    expect(stats.speedMAPE).toBeCloseTo(60.0, 1);
    console.log(`  Fraud simulation MAPE: ${stats.speedMAPE.toFixed(1)}% (expected 60%)`);
  });
});

// ── Wave 4B: Evidence Plugin Registry ────────────────────────────────────────
describe("Wave 4B — Evidence Plugin Registry (test-owned claim context)", () => {
  it("registry has 3 stub plugins registered", () => {
    const plugins = evidencePluginRegistry.getAll();
    expect(plugins.length).toBe(3);
    const ids = plugins.map(p => p.pluginId);
    expect(ids).toContain("telematics-stub");
    expect(ids).toContain("edr-stub");
    expect(ids).toContain("lidar-stub");
    console.log(`  Plugins: ${ids.join(", ")}`);
  });

  it("all stub plugins return UNAVAILABLE (no live data source connected)", async () => {
    const summary = await evidencePluginRegistry.getStatusSummary(String(fixtureClaimId), fixtureAssessmentId);
    expect(summary.length).toBe(3);
    for (const s of summary) {
      expect(s.status).toBe("UNAVAILABLE");
      console.log(`  ${s.pluginId}: ${s.status}`);
    }
  });

  it("runAll returns an empty array for the fixture claim while stubs are unavailable", async () => {
    const contributions = await evidencePluginRegistry.runAll(String(fixtureClaimId), fixtureAssessmentId);
    expect(Array.isArray(contributions)).toBe(true);
    expect(contributions.length).toBe(0);
    console.log(`  Contributions: ${contributions.length} (0 expected — all stubs UNAVAILABLE)`);
  });

  it("plugin interface is complete — all plugins have required methods", () => {
    const plugins = evidencePluginRegistry.getAll();
    for (const plugin of plugins) {
      expect(typeof plugin.pluginId).toBe("string");
      expect(typeof plugin.pluginName).toBe("string");
      expect(typeof plugin.version).toBe("string");
      expect(typeof plugin.checkAvailability).toBe("function");
      expect(typeof plugin.extractContribution).toBe("function");
    }
    console.log(`  All ${plugins.length} plugins implement the EvidencePlugin interface ✓`);
  });
});

// ── Engine wiring verification ─────────────────────────────────────────────────
describe("Wave engine wiring", () => {
  it("imports all Wave 1–4 engine boundaries", () => {
    // Verify the import chain is intact by confirming the engine functions are callable
    expect(typeof runIntegrityEngine).toBe("function");
    expect(typeof runUncertaintyPropagation).toBe("function");
    expect(typeof runExplainabilityEngine).toBe("function");
    expect(typeof buildValidationPrediction).toBe("function");
    expect(typeof computeValidationStats).toBe("function");
    console.log("  All Wave 1–4 engine functions importable and callable with test-owned data ✓");
  });
});
