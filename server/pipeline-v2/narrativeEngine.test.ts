/**
 * narrativeEngine.test.ts
 *
 * Stage 39 — Evidence-Anchored Narrative Engine
 *
 * Test groups:
 *  1. Hedge detection (detectHedges, containsHedge, HEDGE_PATTERNS)
 *  2. OEC formatter (oec, buildResult)
 *  3. buildDamageNarrative — all branches
 *  4. buildPhysicsNarrative — all branches
 *  5. buildFraudNarrative — all branches
 *  6. buildCostNarrative — all branches
 *  7. buildCoherenceNarrative — all branches
 *  8. buildEvidenceNarrative — all branches
 *  9. buildCostRealismNarrative — all branches
 * 10. No hedge violations in any builder output
 * 11. OEC structure validation
 * 12. Edge cases (nulls, zeros, empty arrays)
 */

import { describe, it, expect } from "vitest";
import {
  detectHedges,
  containsHedge,
  oec,
  buildDamageNarrative,
  buildPhysicsNarrative,
  buildFraudNarrative,
  buildCostNarrative,
  buildCoherenceNarrative,
  buildEvidenceNarrative,
  buildCostRealismNarrative,
  HEDGE_PATTERNS,
  type OECSentence,
  type NarrativeResult,
} from "./narrativeEngine";
import type { Stage6Output, Stage7Output, Stage8Output, Stage9Output } from "./types";
import type { DamagePhysicsCoherenceResult } from "./damagePhysicsCoherence";
import type { EvidenceBundle } from "./evidenceStrengthScorer";
import type { CostRealismResult } from "./costRealismValidator";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeStage6(overrides: Partial<Stage6Output> = {}): Stage6Output {
  return {
    damagedParts: [
      { name: "Front Bumper", location: "front", damageType: "deformation", severity: "moderate", repairAction: "replace", estimatedCostCents: 50000, confidenceScore: 85 },
      { name: "Hood", location: "front", damageType: "deformation", severity: "moderate", repairAction: "replace", estimatedCostCents: 80000, confidenceScore: 80 },
      { name: "Radiator", location: "front", damageType: "deformation", severity: "severe", repairAction: "replace", estimatedCostCents: 120000, confidenceScore: 75 },
    ],
    damageZones: [
      { zone: "front", componentCount: 3, maxSeverity: "severe", totalEstimatedCostCents: 250000 },
    ],
    overallSeverityScore: 65,
    structuralDamageDetected: false,
    totalDamageArea: 1.2,
    ...overrides,
  } as Stage6Output;
}

function makeStage7(overrides: Partial<Stage7Output> = {}): Stage7Output {
  return {
    physicsExecuted: true,
    impactForceKn: 85.5,
    impactVector: { direction: "frontal", angle: 0, confidence: 90 },
    energyDistribution: { kineticEnergyJ: 120000, energyDissipatedKj: 95 },
    estimatedSpeedKmh: 45,
    deltaVKmh: 18.5,
    decelerationG: 4.2,
    accidentSeverity: "moderate",
    accidentReconstructionSummary: "Moderate frontal impact at 45 km/h.",
    damageConsistencyScore: 82,
    latentDamageProbability: { chassis: 0.15, suspension: 0.35, airbag: 0.10 },
    ...overrides,
  } as Stage7Output;
}

function makeStage8(overrides: Partial<Stage8Output> = {}): Stage8Output {
  return {
    fraudRiskScore: 25,
    fraudRiskLevel: "low",
    indicators: [
      { indicator: "excessive_damage_count", category: "pattern", score: 15, description: "Unusually high number of damaged components (18)." },
    ],
    damageConsistencyScore: 85,
    damageConsistencyNotes: "Damage pattern aligns with reported incident.",
    quoteDeviation: 12.5,
    vehicleClaimHistory: { flagged: false, notes: null },
    claimantClaimFrequency: { flagged: false, notes: null },
    repairerHistory: { flagged: false, notes: null },
    ...overrides,
  } as Stage8Output;
}

function makeStage9(overrides: Partial<Stage9Output> = {}): Stage9Output {
  return {
    expectedRepairCostCents: 250000,
    currency: "ZAR",
    recommendedCostRange: { lowCents: 200000, highCents: 300000 },
    savingsOpportunityCents: 15000,
    quoteDeviationPct: 18.5,
    breakdown: {
      partsCostCents: 150000,
      labourCostCents: 75000,
      paintCostCents: 20000,
      hiddenDamageCostCents: 5000,
      totalCents: 250000,
    },
    labourRateUsdPerHour: 45,
    marketRegion: "ZA",
    repairIntelligence: [
      { component: "Front Bumper", action: "replace", estimatedCostCents: 50000, marketBenchmarkCents: 48000, flag: null, variancePct: 4.2 },
    ],
    partsReconciliation: [
      { component: "Radiator", quotedCents: 180000, benchmarkCents: 120000, variancePct: 50.0, flag: "overpriced" },
    ],
    ...overrides,
  } as Stage9Output;
}

function makeCoherence(overrides: Partial<DamagePhysicsCoherenceResult> = {}): DamagePhysicsCoherenceResult {
  return {
    has_mismatch: false,
    high_severity_mismatch_count: 0,
    mismatches: [],
    confidence_reduction_factor: 1.0,
    fraud_penalty_triggered: false,
    coherent_zone_count: 1,
    zones_checked: 1,
    direction_checked: "frontal",
    summary: "All zones coherent.",
    ...overrides,
  };
}

function makeEvidenceBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  const tag = (label: "HIGH" | "MEDIUM" | "LOW", score: number) => ({
    value: 0,
    evidence_strength: score,
    evidence_label: label,
    estimated: false,
    rationale: "test",
  });
  return {
    damage: tag("HIGH", 0.85),
    physics: tag("HIGH", 0.90),
    fraud: tag("MEDIUM", 0.65),
    cost: tag("MEDIUM", 0.60),
    reconstruction: tag("HIGH", 0.80),
    composite: tag("HIGH", 0.78),
    ...overrides,
  } as EvidenceBundle;
}

function makeCostRealism(overrides: Partial<CostRealismResult> = {}): CostRealismResult {
  return {
    validated_cost: true,
    adjustments_applied: false,
    validated_breakdown: {
      parts_cost_cents: 150000,
      labour_cost_cents: 75000,
      paint_cost_cents: 20000,
      hidden_damage_cost_cents: 5000,
      total_cents: 250000,
    },
    labour_ratio: 0.30,
    confidence_multiplier: 1.0,
    issues: [],
    adjustments: [],
    severity_cost_consistent: true,
    severity_used: "moderate",
    summary: "All checks passed.",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Hedge detection
// ─────────────────────────────────────────────────────────────────────────────

describe("detectHedges", () => {
  it("returns empty array for clean text", () => {
    expect(detectHedges("Front bumper deformation detected — 3 components affected.")).toEqual([]);
  });

  it("detects 'appears to be'", () => {
    expect(detectHedges("The damage appears to be consistent with a frontal impact.")).toContain("appears to be");
  });

  it("detects 'likely'", () => {
    expect(detectHedges("The vehicle likely sustained structural damage.")).toContain("likely");
  });

  it("detects 'suggests'", () => {
    expect(detectHedges("The evidence suggests a rear impact.")).toContain("suggests");
  });

  it("detects 'may indicate'", () => {
    expect(detectHedges("High component count may indicate pre-existing damage.")).toContain("may indicate");
  });

  it("detects 'could be'", () => {
    expect(detectHedges("The damage could be pre-existing.")).toContain("could be");
  });

  it("detects 'possibly'", () => {
    expect(detectHedges("The vehicle was possibly travelling at high speed.")).toContain("possibly");
  });

  it("detects 'potentially'", () => {
    expect(detectHedges("The chassis is potentially compromised.")).toContain("potentially");
  });

  it("detects 'might be'", () => {
    expect(detectHedges("The quote might be inflated.")).toContain("might be");
  });

  it("is case-insensitive", () => {
    expect(detectHedges("The damage APPEARS TO BE minor.")).toContain("appears to be");
  });

  it("detects multiple hedges in one string", () => {
    const violations = detectHedges("The damage likely suggests a rear impact.");
    expect(violations).toContain("likely");
    expect(violations).toContain("suggests");
  });

  it("HEDGE_PATTERNS has at least 10 entries", () => {
    expect(HEDGE_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });
});

describe("containsHedge", () => {
  it("returns true when hedge present", () => {
    expect(containsHedge("This likely indicates fraud.")).toBe(true);
  });

  it("returns false when no hedge present", () => {
    expect(containsHedge("Fraud risk score: 25/100 — level: low.")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. OEC formatter
// ─────────────────────────────────────────────────────────────────────────────

describe("oec", () => {
  it("returns an OECSentence with all three parts", () => {
    const s = oec("Front bumper deformed", "3 components in front zone (Stage 6)", "repair requires replacement");
    expect(s.observation).toBe("Front bumper deformed");
    expect(s.evidence).toBe("3 components in front zone (Stage 6)");
    expect(s.conclusion).toBe("repair requires replacement");
  });

  it("formats text as [observation], based on [evidence] — [conclusion].", () => {
    const s = oec("Obs", "Ev", "Con");
    expect(s.text).toBe("Obs, based on Ev — Con.");
  });

  it("text does not contain hedge phrases", () => {
    const s = oec("Damage detected", "3 components", "repair required");
    expect(containsHedge(s.text)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. buildDamageNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDamageNarrative", () => {
  it("returns NarrativeResult with sentences and full_text", () => {
    const r = buildDamageNarrative(makeStage6(), ["img1.jpg", "img2.jpg"], "Front end damage.");
    expect(r.sentences.length).toBeGreaterThan(0);
    expect(r.full_text.length).toBeGreaterThan(0);
  });

  it("mentions primary zone in output", () => {
    const r = buildDamageNarrative(makeStage6(), [], null);
    expect(r.full_text).toContain("front");
  });

  it("mentions component count", () => {
    const r = buildDamageNarrative(makeStage6(), [], null);
    expect(r.full_text).toMatch(/3|component/i);
  });

  it("mentions severity score", () => {
    const r = buildDamageNarrative(makeStage6(), [], null);
    expect(r.full_text).toContain("65");
  });

  it("flags structural damage when detected", () => {
    const r = buildDamageNarrative(makeStage6({ structuralDamageDetected: true }), [], null);
    expect(r.full_text.toLowerCase()).toContain("structural");
  });

  it("flags no photo evidence when imageUrls is empty", () => {
    const r = buildDamageNarrative(makeStage6(), [], null);
    expect(r.full_text.toLowerCase()).toContain("no photo evidence");
  });

  it("reports photo count when images present", () => {
    const r = buildDamageNarrative(makeStage6(), ["a.jpg", "b.jpg", "c.jpg"], null);
    expect(r.full_text).toContain("3 photo");
  });

  it("flags missing description", () => {
    const r = buildDamageNarrative(makeStage6(), [], null);
    expect(r.full_text.toLowerCase()).toContain("no damage description");
  });

  it("does not flag missing description when description provided", () => {
    const r = buildDamageNarrative(makeStage6(), [], "Front end damage.");
    expect(r.full_text.toLowerCase()).not.toContain("no damage description");
  });

  it("mentions multiple zones when present", () => {
    const multi = makeStage6({
      damageZones: [
        { zone: "front", componentCount: 3, maxSeverity: "severe", totalEstimatedCostCents: 250000 },
        { zone: "rear", componentCount: 1, maxSeverity: "minor", totalEstimatedCostCents: 30000 },
      ],
    });
    const r = buildDamageNarrative(multi, [], null);
    expect(r.full_text).toContain("2 damage zone");
  });

  it("has no hedge violations", () => {
    const r = buildDamageNarrative(makeStage6(), ["img.jpg"], "Some damage.");
    expect(r.hedge_violations).toEqual([]);
  });

  it("each sentence has observation, evidence, conclusion", () => {
    const r = buildDamageNarrative(makeStage6(), [], null);
    for (const s of r.sentences) {
      expect(s.observation.length).toBeGreaterThan(0);
      expect(s.evidence.length).toBeGreaterThan(0);
      expect(s.conclusion.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. buildPhysicsNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPhysicsNarrative", () => {
  it("returns NarrativeResult", () => {
    const r = buildPhysicsNarrative(makeStage7());
    expect(r.sentences.length).toBeGreaterThan(0);
  });

  it("mentions impact direction", () => {
    const r = buildPhysicsNarrative(makeStage7());
    expect(r.full_text).toContain("frontal");
  });

  it("mentions delta-V value", () => {
    const r = buildPhysicsNarrative(makeStage7({ deltaVKmh: 18.5 }));
    expect(r.full_text).toContain("18.5");
  });

  it("mentions impact force", () => {
    const r = buildPhysicsNarrative(makeStage7({ impactForceKn: 85.5 }));
    expect(r.full_text).toContain("85.5");
  });

  it("mentions damage consistency score", () => {
    const r = buildPhysicsNarrative(makeStage7({ damageConsistencyScore: 82 }));
    expect(r.full_text).toContain("82");
  });

  it("flags latent damage risk when probability >= 0.30", () => {
    const r = buildPhysicsNarrative(makeStage7({ latentDamageProbability: { suspension: 0.45, chassis: 0.10 } }));
    expect(r.full_text.toLowerCase()).toContain("latent damage");
    expect(r.full_text).toContain("suspension");
  });

  it("does not flag latent damage when all probabilities < 0.30", () => {
    const r = buildPhysicsNarrative(makeStage7({ latentDamageProbability: { suspension: 0.10, chassis: 0.05 } }));
    expect(r.full_text.toLowerCase()).not.toContain("latent damage");
  });

  it("handles physicsExecuted=false", () => {
    const r = buildPhysicsNarrative(makeStage7({ physicsExecuted: false }));
    expect(r.full_text.toLowerCase()).toContain("not executed");
    expect(r.sentences.length).toBe(1);
  });

  it("high delta-V triggers structural loading note", () => {
    const r = buildPhysicsNarrative(makeStage7({ deltaVKmh: 35 }));
    expect(r.full_text.toLowerCase()).toContain("latent damage inspection");
  });

  it("has no hedge violations", () => {
    const r = buildPhysicsNarrative(makeStage7());
    expect(r.hedge_violations).toEqual([]);
  });

  it("each sentence has OEC structure", () => {
    const r = buildPhysicsNarrative(makeStage7());
    for (const s of r.sentences) {
      expect(s.text).toContain("based on");
      expect(s.text).toContain("—");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. buildFraudNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe("buildFraudNarrative", () => {
  it("returns NarrativeResult", () => {
    const r = buildFraudNarrative(makeStage8());
    expect(r.sentences.length).toBeGreaterThan(0);
  });

  it("mentions fraud risk score", () => {
    const r = buildFraudNarrative(makeStage8({ fraudRiskScore: 25 }));
    expect(r.full_text).toContain("25");
  });

  it("mentions fraud risk level", () => {
    const r = buildFraudNarrative(makeStage8({ fraudRiskLevel: "low" }));
    expect(r.full_text).toContain("low");
  });

  it("mentions active indicator", () => {
    const r = buildFraudNarrative(makeStage8());
    expect(r.full_text).toContain("excessive_damage_count");
  });

  it("reports no indicators when list is empty", () => {
    const r = buildFraudNarrative(makeStage8({ indicators: [] }));
    expect(r.full_text.toLowerCase()).toContain("no fraud indicators");
  });

  it("mentions quote deviation", () => {
    const r = buildFraudNarrative(makeStage8({ quoteDeviation: 12.5 }));
    expect(r.full_text).toContain("12.5");
  });

  it("flags high quote deviation", () => {
    const r = buildFraudNarrative(makeStage8({ quoteDeviation: 45.0 }));
    expect(r.full_text.toLowerCase()).toContain("independent verification");
  });

  it("flags missing quote deviation", () => {
    const r = buildFraudNarrative(makeStage8({ quoteDeviation: null }));
    expect(r.full_text.toLowerCase()).toContain("could not be computed");
  });

  it("mentions damage consistency score", () => {
    const r = buildFraudNarrative(makeStage8({ damageConsistencyScore: 85 }));
    expect(r.full_text).toContain("85");
  });

  it("flags vehicle history when flagged", () => {
    const r = buildFraudNarrative(makeStage8({ vehicleClaimHistory: { flagged: true, notes: "3 prior claims" } }));
    expect(r.full_text.toLowerCase()).toContain("vehicle claim history flagged");
  });

  it("flags claimant frequency when flagged", () => {
    const r = buildFraudNarrative(makeStage8({ claimantClaimFrequency: { flagged: true, notes: "5 claims in 2 years" } }));
    expect(r.full_text.toLowerCase()).toContain("claimant claim frequency flagged");
  });

  it("high fraud score triggers escalation note", () => {
    const r = buildFraudNarrative(makeStage8({ fraudRiskScore: 75, fraudRiskLevel: "high" }));
    expect(r.full_text.toLowerCase()).toContain("escalation threshold");
  });

  it("has no hedge violations", () => {
    const r = buildFraudNarrative(makeStage8());
    expect(r.hedge_violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. buildCostNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCostNarrative", () => {
  it("returns NarrativeResult", () => {
    const r = buildCostNarrative(makeStage9(), 290000);
    expect(r.sentences.length).toBeGreaterThan(0);
  });

  it("mentions expected repair cost", () => {
    const r = buildCostNarrative(makeStage9({ expectedRepairCostCents: 250000 }), null);
    expect(r.full_text).toContain("2500.00");
  });

  it("mentions labour ratio", () => {
    const r = buildCostNarrative(makeStage9(), null);
    // labour 75000 / (150000+75000+20000+5000) = 30% but total is 250000 so 75000/250000 = 30%
    // actual implementation uses breakdown.labourCostCents / breakdown.totalCents
    expect(r.full_text).toMatch(/\d+\.\d+%/);
    expect(r.full_text.toLowerCase()).toContain("labour");
  });

  it("mentions quote deviation", () => {
    const r = buildCostNarrative(makeStage9({ quoteDeviationPct: 18.5 }), 290000);
    expect(r.full_text).toContain("18.5");
  });

  it("flags high quote deviation", () => {
    const r = buildCostNarrative(makeStage9({ quoteDeviationPct: 45.0 }), 360000);
    expect(r.full_text.toLowerCase()).toContain("independent quote verification");
  });

  it("flags missing quote deviation", () => {
    const r = buildCostNarrative(makeStage9({ quoteDeviationPct: null }), null);
    expect(r.full_text.toLowerCase()).toContain("not computed");
  });

  it("mentions savings opportunity", () => {
    const r = buildCostNarrative(makeStage9({ savingsOpportunityCents: 15000 }), null);
    expect(r.full_text).toContain("150.00");
  });

  it("mentions flagged parts in reconciliation", () => {
    const r = buildCostNarrative(makeStage9(), null);
    expect(r.full_text).toContain("Radiator");
  });

  it("does not mention savings when zero", () => {
    const r = buildCostNarrative(makeStage9({ savingsOpportunityCents: 0 }), null);
    expect(r.full_text.toLowerCase()).not.toContain("savings opportunity");
  });

  it("has no hedge violations", () => {
    const r = buildCostNarrative(makeStage9(), 290000);
    expect(r.hedge_violations).toEqual([]);
  });

  it("each sentence has OEC structure", () => {
    const r = buildCostNarrative(makeStage9(), null);
    for (const s of r.sentences) {
      expect(s.text).toContain("based on");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. buildCoherenceNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCoherenceNarrative", () => {
  it("returns NarrativeResult", () => {
    const r = buildCoherenceNarrative(makeCoherence());
    expect(r.sentences.length).toBeGreaterThan(0);
  });

  it("reports coherent zones when no mismatches", () => {
    const r = buildCoherenceNarrative(makeCoherence());
    expect(r.full_text.toLowerCase()).toContain("coherent");
  });

  it("mentions zones_checked count", () => {
    const r = buildCoherenceNarrative(makeCoherence({ zones_checked: 2 }));
    expect(r.full_text).toContain("2");
  });

  it("reports mismatch when present", () => {
    const r = buildCoherenceNarrative(makeCoherence({
      has_mismatch: true,
      mismatches: [{
        zone: "rear",
        actual_direction: "frontal",
        expected_directions: ["rear", "side_driver"],
        explanation: "Frontal impact but rear damage detected.",
        severity: "high",
        fraud_penalty_trigger: true,
      }],
      confidence_reduction_factor: 0.80,
      fraud_penalty_triggered: true,
    }));
    expect(r.full_text.toLowerCase()).toContain("mismatch");
    expect(r.full_text).toContain("rear");
    expect(r.full_text).toContain("frontal");
  });

  it("mentions confidence reduction factor", () => {
    const r = buildCoherenceNarrative(makeCoherence({
      has_mismatch: true,
      mismatches: [{
        zone: "rear",
        actual_direction: "frontal",
        expected_directions: ["rear"],
        explanation: "Mismatch.",
        severity: "high",
        fraud_penalty_trigger: true,
      }],
      confidence_reduction_factor: 0.80,
      fraud_penalty_triggered: true,
    }));
    expect(r.full_text).toContain("0.80");
  });

  it("mentions fraud penalty when triggered", () => {
    const r = buildCoherenceNarrative(makeCoherence({
      has_mismatch: true,
      mismatches: [{ zone: "rear", actual_direction: "frontal", expected_directions: ["rear"], explanation: "X", severity: "high", fraud_penalty_trigger: true }],
      confidence_reduction_factor: 0.80,
      fraud_penalty_triggered: true,
    }));
    expect(r.full_text.toLowerCase()).toContain("fraud penalty");
  });

  it("has no hedge violations", () => {
    const r = buildCoherenceNarrative(makeCoherence());
    expect(r.hedge_violations).toEqual([]);
  });

  it("medium severity mismatch mentions adjuster verification", () => {
    const r = buildCoherenceNarrative(makeCoherence({
      has_mismatch: true,
      mismatches: [{ zone: "side_driver", actual_direction: "rear", expected_directions: ["side_driver"], explanation: "X", severity: "medium", fraud_penalty_trigger: false }],
      confidence_reduction_factor: 0.90,
      fraud_penalty_triggered: false,
    }));
    expect(r.full_text.toLowerCase()).toContain("adjuster verification");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. buildEvidenceNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceNarrative", () => {
  it("returns NarrativeResult", () => {
    const r = buildEvidenceNarrative(makeEvidenceBundle());
    expect(r.sentences.length).toBeGreaterThan(0);
  });

  it("mentions composite evidence label", () => {
    const r = buildEvidenceNarrative(makeEvidenceBundle());
    expect(r.full_text).toContain("HIGH");
  });

  it("mentions composite evidence percentage", () => {
    const r = buildEvidenceNarrative(makeEvidenceBundle());
    expect(r.full_text).toContain("78%");
  });

  it("HIGH composite triggers automated processing note", () => {
    const r = buildEvidenceNarrative(makeEvidenceBundle());
    expect(r.full_text.toLowerCase()).toContain("automated decision processing");
  });

  it("MEDIUM composite triggers adjuster confirmation note", () => {
    const tag = (label: "HIGH" | "MEDIUM" | "LOW", score: number) => ({
      value: 0, evidence_strength: score, evidence_label: label, estimated: false, rationale: "test",
    });
    const r = buildEvidenceNarrative({
      damage: tag("MEDIUM", 0.60),
      physics: tag("MEDIUM", 0.55),
      fraud: tag("MEDIUM", 0.58),
      cost: tag("MEDIUM", 0.52),
      reconstruction: tag("MEDIUM", 0.60),
      composite: tag("MEDIUM", 0.57),
    } as EvidenceBundle);
    expect(r.full_text.toLowerCase()).toContain("adjuster confirmation");
  });

  it("LOW composite triggers manual review note", () => {
    const tag = (label: "HIGH" | "MEDIUM" | "LOW", score: number) => ({
      value: 0, evidence_strength: score, evidence_label: label, estimated: false, rationale: "test",
    });
    const r = buildEvidenceNarrative({
      damage: tag("LOW", 0.25),
      physics: tag("LOW", 0.20),
      fraud: tag("LOW", 0.30),
      cost: tag("LOW", 0.22),
      reconstruction: tag("LOW", 0.18),
      composite: tag("LOW", 0.23),
    } as EvidenceBundle);
    expect(r.full_text.toLowerCase()).toContain("manual review");
  });

  it("flags estimated=true in output", () => {
    const bundle = makeEvidenceBundle();
    bundle.composite.estimated = true;
    const r = buildEvidenceNarrative(bundle);
    expect(r.full_text.toLowerCase()).toContain("estimated");
  });

  it("flags LOW engines by name", () => {
    const tag = (label: "HIGH" | "MEDIUM" | "LOW", score: number) => ({
      value: 0, evidence_strength: score, evidence_label: label, estimated: false, rationale: "test",
    });
    const bundle = makeEvidenceBundle({
      cost: tag("LOW", 0.25),
    });
    const r = buildEvidenceNarrative(bundle);
    expect(r.full_text.toLowerCase()).toContain("cost");
  });

  it("has no hedge violations", () => {
    const r = buildEvidenceNarrative(makeEvidenceBundle());
    expect(r.hedge_violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. buildCostRealismNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCostRealismNarrative", () => {
  it("returns NarrativeResult", () => {
    const r = buildCostRealismNarrative(makeCostRealism());
    expect(r.sentences.length).toBeGreaterThan(0);
  });

  it("reports no adjustments when all passed", () => {
    const r = buildCostRealismNarrative(makeCostRealism());
    expect(r.full_text.toLowerCase()).toContain("passed without adjustments");
  });

  it("mentions labour ratio", () => {
    const r = buildCostRealismNarrative(makeCostRealism());
    expect(r.full_text).toContain("30.0%");
  });

  it("reports labour issue when adjustments applied", () => {
    const r = buildCostRealismNarrative(makeCostRealism({
      adjustments_applied: true,
      issues: [{ rule: "labour_ratio", description: "Labour ratio 15% below 20% minimum.", actual_value: 0.15, expected_value: "20–60%", severity: "high" }],
      adjustments: [{ rule: "labour_ratio", description: "Adjusted labour up.", field: "labour_cost_cents", original_value_cents: 37500, adjusted_value_cents: 50000, confidence_reduced: true, confidence_multiplier: 0.85 }],
    }));
    expect(r.full_text.toLowerCase()).toContain("labour ratio");
    // fmtCents(37500) = "R 375.00" (cents/100)
    expect(r.full_text).toContain("375");
  });

  it("reports parts issue when adjustments applied", () => {
    const r = buildCostRealismNarrative(makeCostRealism({
      adjustments_applied: true,
      issues: [{ rule: "parts_alignment", description: "Parts cost 55% above expected.", actual_value: 232500, expected_value: "150000", severity: "medium" }],
      adjustments: [{ rule: "parts_alignment", description: "Clamped parts cost.", field: "parts_cost_cents", original_value_cents: 232500, adjusted_value_cents: 150000, confidence_reduced: false, confidence_multiplier: 1.0 }],
    }));
    expect(r.full_text.toLowerCase()).toContain("parts cost");
  });

  it("reports severity mismatch", () => {
    const r = buildCostRealismNarrative(makeCostRealism({
      adjustments_applied: true,
      severity_cost_consistent: false,
      severity_used: "cosmetic",
      validated_breakdown: { parts_cost_cents: 150000, labour_cost_cents: 75000, paint_cost_cents: 20000, hidden_damage_cost_cents: 5000, total_cents: 250000 },
    }));
    expect(r.full_text.toLowerCase()).toContain("severity mismatch");
    expect(r.full_text).toContain("cosmetic");
  });

  it("has no hedge violations", () => {
    const r = buildCostRealismNarrative(makeCostRealism());
    expect(r.hedge_violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. No hedge violations in any builder output (integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("no hedge violations across all builders", () => {
  it("buildDamageNarrative — structural damage, no photos, no description", () => {
    const r = buildDamageNarrative(makeStage6({ structuralDamageDetected: true }), [], null);
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildPhysicsNarrative — high delta-V, latent damage", () => {
    const r = buildPhysicsNarrative(makeStage7({ deltaVKmh: 40, latentDamageProbability: { chassis: 0.5 } }));
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildFraudNarrative — high risk, flagged history", () => {
    const r = buildFraudNarrative(makeStage8({
      fraudRiskScore: 80,
      fraudRiskLevel: "high",
      vehicleClaimHistory: { flagged: true, notes: "3 claims" },
      claimantClaimFrequency: { flagged: true, notes: "5 claims" },
    }));
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildCostNarrative — high deviation, flagged parts", () => {
    const r = buildCostNarrative(makeStage9({ quoteDeviationPct: 55.0 }), 390000);
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildCoherenceNarrative — high severity mismatch", () => {
    const r = buildCoherenceNarrative(makeCoherence({
      has_mismatch: true,
      mismatches: [{ zone: "rear", actual_direction: "frontal", expected_directions: ["rear"], explanation: "X", severity: "high", fraud_penalty_trigger: true }],
      confidence_reduction_factor: 0.65,
      fraud_penalty_triggered: true,
    }));
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildEvidenceNarrative — LOW composite", () => {
    const tag = (label: "HIGH" | "MEDIUM" | "LOW", score: number) => ({
      value: 0, evidence_strength: score, evidence_label: label, estimated: true, rationale: "test",
    });
    const r = buildEvidenceNarrative({
      damage: tag("LOW", 0.20),
      physics: tag("LOW", 0.15),
      fraud: tag("LOW", 0.25),
      cost: tag("LOW", 0.18),
      reconstruction: tag("LOW", 0.12),
      composite: tag("LOW", 0.18),
    } as EvidenceBundle);
    expect(r.hedge_violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. OEC structure validation
// ─────────────────────────────────────────────────────────────────────────────

describe("OEC structure validation", () => {
  function assertOEC(result: NarrativeResult) {
    for (const s of result.sentences) {
      expect(s.observation.length, `observation empty in: ${s.text}`).toBeGreaterThan(0);
      expect(s.evidence.length, `evidence empty in: ${s.text}`).toBeGreaterThan(0);
      expect(s.conclusion.length, `conclusion empty in: ${s.text}`).toBeGreaterThan(0);
      expect(s.text, `text missing 'based on' in: ${s.text}`).toContain("based on");
      expect(s.text, `text missing ' — ' in: ${s.text}`).toContain(" — ");
    }
  }

  it("buildDamageNarrative sentences all have OEC structure", () => {
    assertOEC(buildDamageNarrative(makeStage6(), ["img.jpg"], "desc"));
  });

  it("buildPhysicsNarrative sentences all have OEC structure", () => {
    assertOEC(buildPhysicsNarrative(makeStage7()));
  });

  it("buildFraudNarrative sentences all have OEC structure", () => {
    assertOEC(buildFraudNarrative(makeStage8()));
  });

  it("buildCostNarrative sentences all have OEC structure", () => {
    assertOEC(buildCostNarrative(makeStage9(), 290000));
  });

  it("buildCoherenceNarrative sentences all have OEC structure", () => {
    assertOEC(buildCoherenceNarrative(makeCoherence()));
  });

  it("buildEvidenceNarrative sentences all have OEC structure", () => {
    assertOEC(buildEvidenceNarrative(makeEvidenceBundle()));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("buildDamageNarrative handles empty damagedParts and damageZones", () => {
    const r = buildDamageNarrative(makeStage6({ damagedParts: [], damageZones: [] }), [], null);
    expect(r.sentences.length).toBeGreaterThan(0);
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildPhysicsNarrative handles null latentDamageProbability", () => {
    const r = buildPhysicsNarrative(makeStage7({ latentDamageProbability: null as any }));
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildPhysicsNarrative handles null deltaVKmh", () => {
    const r = buildPhysicsNarrative(makeStage7({ deltaVKmh: null as any }));
    expect(r.full_text).toContain("not recorded");
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildFraudNarrative handles null quoteDeviation", () => {
    const r = buildFraudNarrative(makeStage8({ quoteDeviation: null }));
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildCostNarrative handles null quoteDeviationPct", () => {
    const r = buildCostNarrative(makeStage9({ quoteDeviationPct: null }), null);
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildCostNarrative handles zero savingsOpportunityCents", () => {
    const r = buildCostNarrative(makeStage9({ savingsOpportunityCents: 0 }), null);
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildCoherenceNarrative handles empty mismatches array", () => {
    const r = buildCoherenceNarrative(makeCoherence({ mismatches: [] }));
    expect(r.sentences.length).toBe(1);
    expect(r.hedge_violations).toEqual([]);
  });

  it("buildEvidenceNarrative handles no LOW engines", () => {
    const r = buildEvidenceNarrative(makeEvidenceBundle());
    // No LOW engines in default fixture — should not mention LOW engine list
    expect(r.full_text.toLowerCase()).not.toContain("engine(s) returned low");
  });

  it("buildCostRealismNarrative handles no issues and no adjustments", () => {
    const r = buildCostRealismNarrative(makeCostRealism());
    expect(r.sentences.length).toBe(1);
    expect(r.hedge_violations).toEqual([]);
  });

  it("full_text is non-empty for all builders", () => {
    const results = [
      buildDamageNarrative(makeStage6(), [], null),
      buildPhysicsNarrative(makeStage7()),
      buildFraudNarrative(makeStage8()),
      buildCostNarrative(makeStage9(), null),
      buildCoherenceNarrative(makeCoherence()),
      buildEvidenceNarrative(makeEvidenceBundle()),
      buildCostRealismNarrative(makeCostRealism()),
    ];
    for (const r of results) {
      expect(r.full_text.length).toBeGreaterThan(10);
    }
  });
});
