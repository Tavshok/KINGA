/**
 * batch5-audit.test.ts
 *
 * Batch 5 — Theme 5: Scoring & Threshold Consistency
 * Items: R-D-02, R-D-04, R-D-05
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const readFile = (rel: string) =>
  fs.readFileSync(path.join(__dirname, rel), "utf8");

// ─── R-D-02: ClaimTruthInput accepts stage8FraudScore/Level ─────────────────
describe("R-D-02: ClaimTruthInput stage8 fraud fields", () => {
  const ctl = readFile("pipeline-v2/claimTruthLayer.ts");

  it("ClaimTruthInput interface has stage8FraudScore field", () => {
    expect(ctl).toMatch(/stage8FraudScore\?:\s*(number|null)/);
  });

  it("ClaimTruthInput interface has stage8FraudLevel field", () => {
    expect(ctl).toMatch(/stage8FraudLevel\?:/);
  });

  it("ClaimTruth.meta stores stage8FraudScore and stage8FraudLevel", () => {
    expect(ctl).toMatch(/stage8FraudScore\?:\s*number\s*\|\s*null/);
    expect(ctl).toMatch(/stage8FraudLevel\?:/);
  });

  it("buildClaimTruth stores stage8FraudScore in meta", () => {
    expect(ctl).toMatch(/stage8FraudScore:\s*input\.stage8FraudScore/);
  });

  it("buildClaimTruth stores stage8FraudLevel in meta", () => {
    expect(ctl).toMatch(/stage8FraudLevel:\s*input\.stage8FraudLevel/);
  });

  it("resolveDecision accepts stage8FraudScore and stage8FraudLevel parameters", () => {
    // The function signature should have these optional parameters
    expect(ctl).toMatch(/resolveDecision\([^)]*stage8FraudScore/s);
  });

  it("enrichClaimTruthWithPhysics passes stage8 fraud data through re-evaluation", () => {
    expect(ctl).toMatch(/truth\.meta\.stage8FraudScore/);
    expect(ctl).toMatch(/truth\.meta\.stage8FraudLevel/);
  });
});

// ─── R-D-02: Orchestrator passes stage8 fraud data to buildClaimTruth ────────
describe("R-D-02: Orchestrator passes stage8 fraud data to CTL", () => {
  const orch = readFile("pipeline-v2/orchestrator.ts");

  it("orchestrator passes stage8FraudScore to buildClaimTruth", () => {
    expect(orch).toMatch(/stage8FraudScore:\s*stage8Data\?\.fraudRiskScore/);
  });

  it("orchestrator passes stage8FraudLevel to buildClaimTruth", () => {
    expect(orch).toMatch(/stage8FraudLevel:\s*stage8Data\?\.fraudRiskLevel/);
  });
});

// ─── R-D-04: Stage 9 uses explicit stage8FraudRiskLevel parameter ────────────
describe("R-D-04: Stage 9 DOE uses explicit fraud risk level (not ctx)", () => {
  const s9 = readFile("pipeline-v2/stage-9-cost.ts");

  it("runCostOptimisationStage accepts stage8FraudRiskLevel parameter", () => {
    expect(s9).toMatch(/stage8FraudRiskLevel\?:\s*string\s*\|\s*null/);
  });

  it("DOE call uses stage8FraudRiskLevel, not ctx.fraudRiskLevel", () => {
    // Must NOT use the old ctx as-any pattern
    expect(s9).not.toMatch(/\(ctx as any\)\.fraudRiskLevel/);
    // Must use the new explicit parameter
    expect(s9).toMatch(/overallFraudRisk:\s*stage8FraudRiskLevel/);
  });

  it("orchestrator passes stage8Data.fraudRiskLevel to runCostOptimisationStage", () => {
    const orch = readFile("pipeline-v2/orchestrator.ts");
    expect(orch).toMatch(/runCostOptimisationStage\([^)]*stage8Data\?\.fraudRiskLevel/s);
  });
});

// ─── R-D-05: narrativeEngine uses five-tier level string for action text ──────
describe("R-D-05: narrativeEngine fraud narrative covers all five tiers", () => {
  const ne = readFile("pipeline-v2/narrativeEngine.ts");

  it("handles 'high' fraud risk tier", () => {
    expect(ne).toMatch(/level === "high"/);
    expect(ne).toMatch(/investigator assignment/);
  });

  it("handles 'elevated' fraud risk tier", () => {
    expect(ne).toMatch(/level === "elevated"/);
    // Engine uses 'investigator assignment' for elevated tier (not 'escalation')
    expect(ne).toMatch(/ELEVATED.*investigator|investigator.*ELEVATED/i);
  });

  it("handles 'moderate' fraud risk tier", () => {
    // Engine uses 'moderate' (not 'medium') as the middle tier per KINGA-FSS-2026-001
    expect(ne).toMatch(/level === "moderate"/);
    expect(ne).toMatch(/manual review threshold/);
  });

  it("handles 'low' fraud risk tier", () => {
    expect(ne).toMatch(/level === "low"/);
    expect(ne).toMatch(/normal parameters/);
  });

  it("handles 'minimal' fraud risk tier", () => {
    expect(ne).toMatch(/minimal/);
    expect(ne).toMatch(/no fraud indicators of concern/);
  });

  it("does NOT use hardcoded score thresholds (70/40) for action text", () => {
    // The old pattern was: score >= 70 ? "escalation" : score >= 40 ? "manual review"
    // This should no longer exist in the action text block
    expect(ne).not.toMatch(/score >= 70\s*\?\s*"score exceeds escalation/);
    expect(ne).not.toMatch(/score >= 40\s*\?\s*"score exceeds manual review/);
  });
});

// ─── R-C-01: rollover multiplier is display-only (confirmed closed) ───────────
describe("R-C-01: rollover multiplier is display-only (closed)", () => {
  const s7 = readFile("pipeline-v2/stage-7-physics.ts");

  it("rolloverMultiplier is not used in any cost calculation in stage-7", () => {
    // rolloverMultiplier should only appear in output/display context, not in arithmetic
    // Check that rolloverMultiplier (the variable) is not used in arithmetic expressions.
    // The string literal 'rollover' (e.g. in direction maps) is not a concern.
    const rolloverLines = s7.split("\n").filter(l => /rolloverMultiplier/.test(l));
    const calcLines = rolloverLines.filter(l =>
      /[\*\/\+\-]\s*rolloverMultiplier|rolloverMultiplier\s*[\*\/\+\-]/.test(l) &&
      !/^\/\//.test(l.trim()) // skip comment lines
    );
    expect(calcLines).toHaveLength(0);
  });
});
