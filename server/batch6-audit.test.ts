/**
 * Batch 6 Audit Tests — Architecture & Type Safety
 *
 * Covers all 12 Batch 6 remediation items:
 *   R-B-03/04/05 — enrichedPhotosJson/pdfPageImageUrls as-any casts removed
 *   R-C-03       — Stage7Output physics fields made number | null
 *   R-C-04       — seatbeltPretensioner/speedLimitKmh added to AccidentDetails
 *   R-C-05       — _forensicAnalysis added to ClaimRecord; as-any casts removed
 *   R-D-02       — scenarioFraudEngine 3-tier log clarified
 *   R-D-05       — PHYSICS_ONLY_SIGNALS maintenance trap fixed
 *   R-E-02       — costRealismValidator severe upper bound raised
 *   R-E-03/05/10 — stage-9-cost.ts unnecessary as-any casts removed
 *
 * All tests are static analysis (grep-based) — no runtime required.
 */

import { readFileSync } from "fs";
import { describe, it, expect } from "vitest";

const readFile = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf-8");

// ─── R-B-03/04/05 ────────────────────────────────────────────────────────────

describe("R-B-03: enrichedPhotosJson typed in PipelineContext", () => {
  it("types.ts: enrichedPhotosJson is string | null, not unknown", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toContain("enrichedPhotosJson?: string | null");
    expect(src).not.toMatch(/enrichedPhotosJson\?:\s*unknown/);
  });

  it("stage-6: no as-any cast on ctx.enrichedPhotosJson", () => {
    const src = readFile("server/pipeline-v2/stage-6-damage-analysis.ts");
    expect(src).not.toMatch(/\(ctx as any\)\.enrichedPhotosJson/);
  });

  it("orchestrator: no as-any cast on ctx.enrichedPhotosJson", () => {
    const src = readFile("server/pipeline-v2/orchestrator.ts");
    expect(src).not.toMatch(/\(ctx as any\)\.enrichedPhotosJson/);
  });

  it("stage-7-unified: no as-any cast on ctx.enrichedPhotosJson", () => {
    const src = readFile("server/pipeline-v2/stage-7-unified.ts");
    expect(src).not.toMatch(/\(ctx as any\)\.enrichedPhotosJson/);
  });
});

describe("R-B-04/05: pdfPageImageUrls typed in PipelineContext", () => {
  it("types.ts: pdfPageImageUrls is string[], not unknown", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toMatch(/pdfPageImageUrls\?:\s*string\[\]/);
  });

  it("stage-6: no as-any cast on ctx.pdfPageImageUrls", () => {
    const src = readFile("server/pipeline-v2/stage-6-damage-analysis.ts");
    expect(src).not.toMatch(/\(ctx as any\)\.pdfPageImageUrls/);
  });

  it("stage-10: no as-any cast on ctx.pdfPageImageUrls", () => {
    const src = readFile("server/pipeline-v2/stage-10-report.ts");
    expect(src).not.toMatch(/\(ctx as any\)\.pdfPageImageUrls/);
  });
});

// ─── R-C-03 ──────────────────────────────────────────────────────────────────

describe("R-C-03: Stage7Output physics fields are number | null", () => {
  it("types.ts: impactForceKn is number | null", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toMatch(/impactForceKn:\s*number \| null/);
  });

  it("types.ts: estimatedSpeedKmh is number | null", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toMatch(/estimatedSpeedKmh:\s*number \| null/);
  });

  it("types.ts: deltaVKmh is number | null", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toMatch(/deltaVKmh:\s*number \| null/);
  });

  it("types.ts: decelerationG is number | null", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toMatch(/decelerationG:\s*number \| null/);
  });

  it("stage-7-physics: no null-as-unknown-as-number casts", () => {
    const src = readFile("server/pipeline-v2/stage-7-physics.ts");
    expect(src).not.toContain("null as unknown as number");
  });

  it("physicsNumericalContract: mergeNumericalContract accepts number | null inputs", () => {
    const src = readFile("server/pipeline-v2/physicsNumericalContract.ts");
    expect(src).toMatch(/deltaVKmh:\s*number \| null/);
    expect(src).toMatch(/impactForceKn:\s*number \| null/);
  });
});

// ─── R-C-04 ──────────────────────────────────────────────────────────────────

describe("R-C-04: seatbeltPretensioner/speedLimitKmh in AccidentDetails", () => {
  it("types.ts: AccidentDetails has seatbeltPretensioner field", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toMatch(/seatbeltPretensioner\?:\s*boolean \| null/);
  });

  it("types.ts: AccidentDetails has speedLimitKmh field", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toMatch(/speedLimitKmh\?:\s*number \| null/);
  });

  it("stage-7-physics: no as-any cast on accidentDetails.seatbeltPretensioner", () => {
    const src = readFile("server/pipeline-v2/stage-7-physics.ts");
    expect(src).not.toMatch(/accidentDetails as any\)\.seatbeltPretensioner/);
  });

  it("stage-7-physics: no as-any cast on accidentDetails.speedLimitKmh", () => {
    const src = readFile("server/pipeline-v2/stage-7-physics.ts");
    expect(src).not.toMatch(/accidentDetails as any\)\.speedLimitKmh/);
  });
});

// ─── R-C-05 ──────────────────────────────────────────────────────────────────

describe("R-C-05: _forensicAnalysis typed in ClaimRecord", () => {
  it("types.ts: ClaimRecord has _forensicAnalysis field", () => {
    const src = readFile("server/pipeline-v2/types.ts");
    expect(src).toContain("_forensicAnalysis?:");
    expect(src).toContain("visionCrushDepthM?: number | null");
  });

  it("stage-7-physics: no as-any cast on claimRecord._forensicAnalysis", () => {
    const src = readFile("server/pipeline-v2/stage-7-physics.ts");
    expect(src).not.toMatch(/claimRecord as any\)\._forensicAnalysis/);
  });

  it("stage-8-fraud: no as-any cast on claimRecord._forensicAnalysis", () => {
    const src = readFile("server/pipeline-v2/stage-8-fraud.ts");
    expect(src).not.toMatch(/claimRecord as any\)\._forensicAnalysis/);
  });
});

// ─── R-D-02 ──────────────────────────────────────────────────────────────────

describe("R-D-02: scenarioFraudEngine 3-tier log clarified", () => {
  it("stage-8-fraud: log message labels 3-tier source", () => {
    const src = readFile("server/pipeline-v2/stage-8-fraud.ts");
    expect(src).toContain("Scenario fraud engine (3-tier):");
  });

  it("stage-8-fraud: comment explains 3-tier vs 5-tier distinction", () => {
    const src = readFile("server/pipeline-v2/stage-8-fraud.ts");
    expect(src).toMatch(/3-tier.*risk_level|risk_level.*3-tier/i);
  });
});

// ─── R-D-05 ──────────────────────────────────────────────────────────────────

describe("R-D-05: PHYSICS_ONLY_SIGNALS maintenance trap fixed", () => {
  it("stage-8-fraud: PHYSICS_ONLY_SIGNAL_CODES exported constant exists", () => {
    const src = readFile("server/pipeline-v2/stage-8-fraud.ts");
    expect(src).toContain("export const PHYSICS_ONLY_SIGNAL_CODES");
    expect(src).toContain("NARRATIVE_PHYSICS_MISMATCH");
  });

  it("stage-8-fraud: no inline new Set([\"NARRATIVE_PHYSICS_MISMATCH\"]) at usage site", () => {
    const src = readFile("server/pipeline-v2/stage-8-fraud.ts");
    // The inline Set should be replaced by reference to the constant
    expect(src).not.toContain('const PHYSICS_ONLY_SIGNALS = new Set(["NARRATIVE_PHYSICS_MISMATCH"])');
  });

  it("stage-8-fraud: PHYSICS_ONLY_SIGNALS references the module constant", () => {
    const src = readFile("server/pipeline-v2/stage-8-fraud.ts");
    expect(src).toContain("const PHYSICS_ONLY_SIGNALS = PHYSICS_ONLY_SIGNAL_CODES");
  });

  it("stage-8-fraud: PHYSICS_ONLY_SIGNAL_CODES has derivation rule comment", () => {
    const src = readFile("server/pipeline-v2/stage-8-fraud.ts");
    expect(src).toMatch(/Derivation rule:/);
  });
});

// ─── R-E-02 ──────────────────────────────────────────────────────────────────

describe("R-E-02: costRealismValidator severe upper bound raised", () => {
  it('costRealismValidator: severe maxCents is 15_000_000 (USD 150k) — data-driven calibration', () => {
    const src = readFile("server/pipeline-v2/costRealismValidator.ts");
    // severe.maxCents should be 15_000_000 (USD $150k) — data-driven from 892 processed quotes
    expect(src).toContain('15_000_000');
  });

  it('costRealismValidator: old 5_000_000 cap for severe is removed', () => {
    const src = readFile("server/pipeline-v2/costRealismValidator.ts");
    // The old value 5_000_000 should not appear as severe's maxCents
    // (it may still appear as catastrophic's minCents which is 2_000_000)
    const severeMatch = src.match(/severe:\s*\{[^}]+\}/s);
    expect(severeMatch).not.toBeNull();
    if (severeMatch) {
      expect(severeMatch[0]).not.toContain("maxCents: 5_000_000");
    }
  });

  it('costRealismValidator: R-E-02 recalibration comment present', () => {
    const src = readFile("server/pipeline-v2/costRealismValidator.ts");
    expect(src).toContain('R-E-02 (recalibrated');
  });
});

// ─── R-E-03/05/10 ────────────────────────────────────────────────────────────

describe("R-E-03: stage-9-cost.ts stage3/ctx as-any casts removed", () => {
  it("stage-9-cost: no (stage3 as any) cast for inputRecovery", () => {
    const src = readFile("server/pipeline-v2/stage-9-cost.ts");
    expect(src).not.toMatch(/\(stage3 as any\)\?\.inputRecovery/);
  });

  it("stage-9-cost: no (ctx as any).damagePhotoUrls cast", () => {
    const src = readFile("server/pipeline-v2/stage-9-cost.ts");
    expect(src).not.toMatch(/\(ctx as any\)\.damagePhotoUrls/);
  });

  it("stage-9-cost: no (ctx as any).classifiedImages cast", () => {
    const src = readFile("server/pipeline-v2/stage-9-cost.ts");
    expect(src).not.toMatch(/\(ctx as any\)\.classifiedImages/);
  });
});

describe("R-E-05/10: stage-9-cost.ts claimRecord as-any casts removed", () => {
  it("stage-9-cost: no (claimRecord as any).policy cast", () => {
    const src = readFile("server/pipeline-v2/stage-9-cost.ts");
    expect(src).not.toMatch(/\(claimRecord as any\)\.policy/);
  });

  it("stage-9-cost: no (claimRecord as any).documents cast", () => {
    const src = readFile("server/pipeline-v2/stage-9-cost.ts");
    expect(src).not.toMatch(/\(claimRecord as any\)\.documents/);
  });

  it("stage-9-cost: uses claimRecord.insuranceContext for policy fields", () => {
    const src = readFile("server/pipeline-v2/stage-9-cost.ts");
    expect(src).toContain("claimRecord.insuranceContext?.policyNumber");
  });

  it("stage-9-cost: uses claimRecord.driver.licenseNumber without as-any", () => {
    const src = readFile("server/pipeline-v2/stage-9-cost.ts");
    expect(src).toContain("claimRecord.driver?.licenseNumber");
    // Ensure it's not wrapped in as-any
    expect(src).not.toMatch(/\(claimRecord as any\)\.driver\?\.licenseNumber/);
  });
});
