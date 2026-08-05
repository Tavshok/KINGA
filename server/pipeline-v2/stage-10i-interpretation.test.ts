/**
 * stage-10i-interpretation.test.ts
 *
 * Vitest unit tests for the Stage 10-I Interpretation Engine.
 * Tests cover:
 *   - deterministic finding extraction for each engine (Vision, Physics, Fraud, Cost, CGI)
 *   - InterpretedClaim output shape and required fields
 *   - graceful degradation when stage data is null
 *   - classification logic (CRITICAL / CONCERN / ATTENTION / NORMAL / UNAVAILABLE)
 *   - section structure and engine labels
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock invokeLLM BEFORE importing the module under test (vi.mock is hoisted) ─
const mockInvokeLLM = vi.fn();
vi.mock("../_core/llm", () => ({ invokeLLM: (...a: any[]) => mockInvokeLLM(...a) }));

import {
  runInterpretationEngine,
  type Stage10IInput,
  type InterpretedClaim,
  type InterpretedEngineSection,
  type InterpretedFinding,
} from "./stage-10i-interpretation";

// ── Default LLM mock return value ───────────────────────────────────────────
beforeEach(() => {
  mockInvokeLLM.mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          visionSummary: "Mock vision summary.",
          physicsSummary: "Mock physics summary.",
          fraudSummary: "Mock fraud summary.",
          costSummary: "Mock cost summary.",
          cgiSummary: "Mock CGI summary.",
          overallNarrative: "Mock LLM narrative for testing.",
          topThreeActions: ["Action 1", "Action 2", "Action 3"],
        }),
      },
    }],
  });
});

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeClaimRecord(overrides: Record<string, unknown> = {}): any {
  return {
    vehicle: { make: "Toyota", model: "Corolla", year: 2020 },
    accidentDetails: {
      collisionType: "frontal",
      collisionDirection: "front",
      estimatedSpeedKmh: 60,
    },
    policyDetails: { policyNumber: "POL-001", excess: 500 },
    ...overrides,
  };
}

function makeStage6(overrides: Record<string, unknown> = {}): any {
  return {
    damagedParts: [
      { name: "Front Bumper", severity: "moderate", zone: "front" },
      { name: "Hood", severity: "minor", zone: "front" },
    ],
    overallSeverityScore: 55,
    structuralDamageDetected: false,
    structuralDamage: false,
    photosAvailable: 4,
    photosProcessed: 4,
    ...overrides,
  };
}

function makeStage7(overrides: Record<string, unknown> = {}): any {
  return {
    estimatedSpeedKmh: 60,
    deltaVKmh: 18,
    impactForceKn: 45,
    energyDissipatedJ: 85000,
    accidentSeverity: "moderate",
    damageConsistencyScore: 78,
    physicsExecuted: true,
    physicsStatus: "EXECUTED",
    latentDamageProbability: 0.25,
    ...overrides,
  };
}

function makeStage8(overrides: Record<string, unknown> = {}): any {
  return {
    fraudRiskScore: 22,
    fraudRiskLevel: "low",
    indicators: [
      { name: "Claimant history", status: "PASS", explanation: "No prior claims" },
      { name: "Damage consistency", status: "PASS", explanation: "Consistent with impact" },
    ],
    quoteDeviation: 8.5,
    repairerHistory: { flagged: false, notes: "" },
    claimantClaimFrequency: { count: 1, flagged: false },
    ...overrides,
  };
}

function makeStage9(overrides: Record<string, unknown> = {}): any {
  return {
    expectedRepairCostCents: 450000,
    quoteDeviationPct: 12.0,
    savingsOpportunityCents: 55000,
    costDecision: { recommendation: "APPROVE", confidence: 0.85 },
    ...overrides,
  };
}

function makeStage9_5(overrides: Record<string, unknown> = {}): any {
  return {
    available: true,
    conclusion: {
      verdict: "COHERENT",
      confidence: 0.82,
      fraudIndicatorScore: 0,
      hiddenDamageProbabilityOverride: null,
      narrative: "All geometry indicators are consistent with the stated collision.",
    },
    allIndicators: [],
    availabilitySummary: {
      core:        { available: 6, total: 6 },
      conditional: { available: 2, total: 4 },
      advanced:    { available: 0, total: 2 },
    },
    engineVersion: "1.2.0",
    runtimeMs: 12,
    ...overrides,
  };
}

function makeInput(overrides: Partial<Stage10IInput> = {}): Stage10IInput {
  return {
    claimRecord: makeClaimRecord(),
    stage6Data: makeStage6(),
    stage7Data: makeStage7(),
    stage8Data: makeStage8(),
    stage9Data: makeStage9(),
    stage9_5Data: makeStage9_5(),
    ...overrides,
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function getSection(result: InterpretedClaim, engine: string): InterpretedEngineSection | undefined {
  return result.sections.find(s => s.engine === engine);
}

function getFinding(section: InterpretedEngineSection, label: string): InterpretedFinding | undefined {
  return section.findings.find(f => f.label === label);
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration: output shape
// ─────────────────────────────────────────────────────────────────────────────

describe("runInterpretationEngine — output shape", () => {
  it("returns an InterpretedClaim with all required top-level fields", async () => {
    const result = await runInterpretationEngine(makeInput());
    expect(result).toBeDefined();
    expect(typeof result.overallClassification).toBe("string");
    expect(typeof result.engineVersion).toBe("string");
    expect(typeof result.generatedAt).toBe("string");
    expect(typeof result.llmEnriched).toBe("boolean");
    expect(Array.isArray(result.sections)).toBe(true);
    expect(Array.isArray(result.topThreeActions)).toBe(true);
  });

  it("returns 5 sections (one per engine) when all stage data is present", async () => {
    const result = await runInterpretationEngine(makeInput());
    const engines = result.sections.map(s => s.engine);
    expect(engines).toContain("VISION");
    expect(engines).toContain("PHYSICS");
    expect(engines).toContain("FRAUD");
    expect(engines).toContain("COST");
    expect(engines).toContain("CGI");
    expect(result.sections.length).toBe(5);
  });

  it("each section has engine, engineLabel, findings array, summary, and keyRisk", async () => {
    const result = await runInterpretationEngine(makeInput());
    for (const sec of result.sections) {
      expect(typeof sec.engine).toBe("string");
      expect(typeof sec.engineLabel).toBe("string");
      expect(Array.isArray(sec.findings)).toBe(true);
      expect(typeof sec.summary).toBe("string");
      // keyRisk is string | null
      expect(sec.keyRisk === null || typeof sec.keyRisk === "string").toBe(true);
    }
  });

  it("each finding has label, value, classification, interpretation, businessImpact, sourceEngine", async () => {
    const result = await runInterpretationEngine(makeInput());
    for (const sec of result.sections) {
      for (const f of sec.findings) {
        expect(typeof f.label).toBe("string");
        expect(f.value !== undefined).toBe(true);
        expect(["CRITICAL","CONCERN","ATTENTION","NORMAL","UNAVAILABLE"]).toContain(f.classification);
        expect(typeof f.interpretation).toBe("string");
        expect(typeof f.businessImpact).toBe("string");
        expect(typeof f.sourceEngine).toBe("string");
      }
    }
  });

  it("llmEnriched is true when LLM mock returns a valid response", async () => {
    const result = await runInterpretationEngine(makeInput());
    expect(result.llmEnriched).toBe(true);
  });

  it("overallNarrative comes from LLM mock", async () => {
    const result = await runInterpretationEngine(makeInput());
    expect(result.overallNarrative).toBe("Mock LLM narrative for testing.");
  });

  it("topThreeActions comes from LLM mock", async () => {
    const result = await runInterpretationEngine(makeInput());
    expect(result.topThreeActions).toEqual(["Action 1", "Action 2", "Action 3"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful degradation
// ─────────────────────────────────────────────────────────────────────────────

describe("runInterpretationEngine — graceful degradation", () => {
  it("returns a valid result when all stage data is null", async () => {
    const result = await runInterpretationEngine({
      claimRecord: makeClaimRecord(),
      stage6Data: null,
      stage7Data: null,
      stage8Data: null,
      stage9Data: null,
      stage9_5Data: null,
    });
    expect(result).toBeDefined();
    expect(typeof result.overallClassification).toBe("string");
    expect(Array.isArray(result.sections)).toBe(true);
  });

  it("does not throw when stage9_5Data.available is false", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage9_5Data: { available: false, unavailableReason: "No geometry data" } as any,
    }));
    expect(result).toBeDefined();
  });

  it("omits CGI findings or returns empty findings when stage9_5Data is null", async () => {
    const result = await runInterpretationEngine(makeInput({ stage9_5Data: null }));
    const cgiSection = getSection(result, "CGI");
    if (cgiSection) {
      expect(cgiSection.findings.length).toBe(0);
    }
  });

  it("llmEnriched is false when LLM throws", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("LLM unavailable"));
    const result = await runInterpretationEngine(makeInput());
    expect(result.llmEnriched).toBe(false);
    // overallNarrative should fall back to deterministic summary
    expect(typeof result.overallNarrative).toBe("string");
    expect(result.overallNarrative.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vision section findings
// ─────────────────────────────────────────────────────────────────────────────

describe("VISION section", () => {
  it("produces a finding for Visual Damage Severity", async () => {
    const result = await runInterpretationEngine(makeInput());
    const vision = getSection(result, "VISION");
    expect(vision).toBeDefined();
    const f = getFinding(vision!, "Visual Damage Severity");
    expect(f).toBeDefined();
    expect(f!.sourceEngine).toBe("VISION");
  });

  it("classifies structural damage as CONCERN when structuralDamageDetected is true", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage6Data: makeStage6({ structuralDamageDetected: true, structuralDamage: true }),
    }));
    const vision = getSection(result, "VISION");
    const f = getFinding(vision!, "Structural Damage Detected");
    expect(f).toBeDefined();
    expect(["CONCERN", "CRITICAL"]).toContain(f!.classification);
  });

  it("classifies structural damage as NORMAL when not detected", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage6Data: makeStage6({ structuralDamageDetected: false, structuralDamage: false }),
    }));
    const vision = getSection(result, "VISION");
    const f = getFinding(vision!, "Structural Damage Detected");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("NORMAL");
  });

  it("classifies photo coverage as ATTENTION when fewer than 2 photos processed", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage6Data: makeStage6({ photosAvailable: 5, photosProcessed: 1 }),
    }));
    const vision = getSection(result, "VISION");
    const f = getFinding(vision!, "Photo Evidence Coverage");
    expect(f).toBeDefined();
    expect(["ATTENTION", "CONCERN"]).toContain(f!.classification);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Physics section findings
// ─────────────────────────────────────────────────────────────────────────────

describe("PHYSICS section", () => {
  it("produces a finding for Reconstructed Impact Speed", async () => {
    const result = await runInterpretationEngine(makeInput());
    const physics = getSection(result, "PHYSICS");
    expect(physics).toBeDefined();
    const f = getFinding(physics!, "Reconstructed Impact Speed");
    expect(f).toBeDefined();
    expect(f!.sourceEngine).toBe("PHYSICS");
  });

  it("classifies severe accident severity as CRITICAL", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage7Data: makeStage7({ accidentSeverity: "severe" }),
    }));
    const physics = getSection(result, "PHYSICS");
    const f = getFinding(physics!, "Accident Severity Classification");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CRITICAL");
  });

  it("classifies moderate accident severity as CONCERN", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage7Data: makeStage7({ accidentSeverity: "moderate" }),
    }));
    const physics = getSection(result, "PHYSICS");
    const f = getFinding(physics!, "Accident Severity Classification");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CONCERN");
  });

  it("classifies minor accident severity as ATTENTION", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage7Data: makeStage7({ accidentSeverity: "minor" }),
    }));
    const physics = getSection(result, "PHYSICS");
    const f = getFinding(physics!, "Accident Severity Classification");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("ATTENTION");
  });

  it("marks physics findings as UNAVAILABLE when physicsExecuted is false", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage7Data: makeStage7({
        physicsExecuted: false,
        physicsStatus: "SKIPPED_NO_SPEED",
        estimatedSpeedKmh: null,
        deltaVKmh: null,
        impactForceKn: null,
        energyDissipatedJ: null,
      }),
    }));
    const physics = getSection(result, "PHYSICS");
    expect(physics).toBeDefined();
    // At least one finding should be UNAVAILABLE when physics was not executed
    const unavailable = physics!.findings.filter(f => f.classification === "UNAVAILABLE");
    expect(unavailable.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fraud section findings
// ─────────────────────────────────────────────────────────────────────────────

describe("FRAUD section", () => {
  it("produces a finding for Fraud Risk Score", async () => {
    const result = await runInterpretationEngine(makeInput());
    const fraud = getSection(result, "FRAUD");
    expect(fraud).toBeDefined();
    const f = getFinding(fraud!, "Fraud Risk Score");
    expect(f).toBeDefined();
    expect(f!.sourceEngine).toBe("FRAUD");
  });

  it("classifies high fraud score (>= 70) as CRITICAL", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage8Data: makeStage8({ fraudRiskScore: 75, fraudRiskLevel: "high" }),
    }));
    const fraud = getSection(result, "FRAUD");
    const f = getFinding(fraud!, "Fraud Risk Score");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CRITICAL");
  });

  it("classifies moderate fraud score (40-69) as CONCERN", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage8Data: makeStage8({ fraudRiskScore: 55, fraudRiskLevel: "moderate" }),
    }));
    const fraud = getSection(result, "FRAUD");
    const f = getFinding(fraud!, "Fraud Risk Score");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CONCERN");
  });

  it("classifies low fraud score (< 30) as NORMAL", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage8Data: makeStage8({ fraudRiskScore: 15, fraudRiskLevel: "low" }),
    }));
    const fraud = getSection(result, "FRAUD");
    const f = getFinding(fraud!, "Fraud Risk Score");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("NORMAL");
  });

  it("classifies large quote deviation (>= 50%) as CRITICAL", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage8Data: makeStage8({ quoteDeviation: 65 }),
    }));
    const fraud = getSection(result, "FRAUD");
    const f = getFinding(fraud!, "Quote vs. Expected Cost Deviation");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CRITICAL");
  });

  it("classifies moderate quote deviation (25-49%) as CONCERN", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage8Data: makeStage8({ quoteDeviation: 30 }),
    }));
    const fraud = getSection(result, "FRAUD");
    const f = getFinding(fraud!, "Quote vs. Expected Cost Deviation");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CONCERN");
  });

  it("classifies small quote deviation (< 10%) as NORMAL", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage8Data: makeStage8({ quoteDeviation: 5 }),
    }));
    const fraud = getSection(result, "FRAUD");
    const f = getFinding(fraud!, "Quote vs. Expected Cost Deviation");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("NORMAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cost section findings
// ─────────────────────────────────────────────────────────────────────────────

describe("COST section", () => {
  it("produces a finding for KINGA Expected Repair Cost", async () => {
    const result = await runInterpretationEngine(makeInput());
    const cost = getSection(result, "COST");
    expect(cost).toBeDefined();
    const f = getFinding(cost!, "KINGA Expected Repair Cost");
    expect(f).toBeDefined();
    expect(f!.sourceEngine).toBe("COST");
  });

  it("includes Savings Opportunity finding when savingsOpportunityCents > 0", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage9Data: makeStage9({ savingsOpportunityCents: 80000 }),
    }));
    const cost = getSection(result, "COST");
    const f = getFinding(cost!, "Savings Opportunity");
    expect(f).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CGI section findings
// ─────────────────────────────────────────────────────────────────────────────

describe("CGI section", () => {
  it("produces a finding for Geometry Coherence Verdict", async () => {
    const result = await runInterpretationEngine(makeInput());
    const cgi = getSection(result, "CGI");
    expect(cgi).toBeDefined();
    const f = getFinding(cgi!, "Geometry Coherence Verdict");
    expect(f).toBeDefined();
    expect(f!.sourceEngine).toBe("CGI");
  });

  it("classifies INCOHERENT verdict as CRITICAL", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage9_5Data: makeStage9_5({
        conclusion: { verdict: "INCOHERENT", confidence: 0.9, fraudIndicatorScore: 2, hiddenDamageProbabilityOverride: null },
      }),
    }));
    const cgi = getSection(result, "CGI");
    const f = getFinding(cgi!, "Geometry Coherence Verdict");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CRITICAL");
  });

  it("classifies ANOMALOUS verdict as CONCERN", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage9_5Data: makeStage9_5({
        conclusion: { verdict: "ANOMALOUS", confidence: 0.75, fraudIndicatorScore: 1, hiddenDamageProbabilityOverride: null },
      }),
    }));
    const cgi = getSection(result, "CGI");
    const f = getFinding(cgi!, "Geometry Coherence Verdict");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("CONCERN");
  });

  it("classifies COHERENT verdict as NORMAL", async () => {
    const result = await runInterpretationEngine(makeInput());
    const cgi = getSection(result, "CGI");
    const f = getFinding(cgi!, "Geometry Coherence Verdict");
    expect(f).toBeDefined();
    expect(f!.classification).toBe("NORMAL");
  });

  it("includes Geometry Indicator Coverage finding", async () => {
    const result = await runInterpretationEngine(makeInput());
    const cgi = getSection(result, "CGI");
    const f = getFinding(cgi!, "Geometry Indicator Coverage");
    expect(f).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Overall classification
// ─────────────────────────────────────────────────────────────────────────────

describe("overallClassification", () => {
  it("is CRITICAL when any finding is CRITICAL", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage8Data: makeStage8({ fraudRiskScore: 80, fraudRiskLevel: "high" }),
    }));
    expect(result.overallClassification).toBe("CRITICAL");
  });

  it("is one of the valid classification values", async () => {
    const result = await runInterpretationEngine(makeInput());
    expect(["CRITICAL", "CONCERN", "ATTENTION", "NORMAL"]).toContain(result.overallClassification);
  });

  it("is not CRITICAL for a low-risk claim with coherent geometry", async () => {
    const result = await runInterpretationEngine(makeInput({
      stage6Data: makeStage6({ overallSeverityScore: 30, structuralDamageDetected: false }),
      stage7Data: makeStage7({ accidentSeverity: "minor", damageConsistencyScore: 95 }),
      stage8Data: makeStage8({ fraudRiskScore: 10, quoteDeviation: 3 }),
      stage9Data: makeStage9({ quoteDeviationPct: 2, savingsOpportunityCents: 0 }),
      stage9_5Data: makeStage9_5({ conclusion: { verdict: "COHERENT", confidence: 0.95, fraudIndicatorScore: 0, hiddenDamageProbabilityOverride: null } }),
    }));
    expect(result.overallClassification).not.toBe("CRITICAL");
  });
});
