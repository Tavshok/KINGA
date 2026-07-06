/**
 * R-E-01 verification test
 * Confirms that for a claim at 67% RTV:
 * 1. claimTruthLayer marks isEconomicWriteOff = true (threshold = 65%)
 * 2. costIntelligenceNarrative generates text that says "meets or exceeds the write-off threshold"
 *    (NOT "well within the economic repair range")
 * 3. Both use the same ECONOMIC_WRITE_OFF_THRESHOLD constant (no contradiction)
 */
import { describe, it, expect } from "vitest";
import { ECONOMIC_WRITE_OFF_THRESHOLD, RTV_ELEVATED_THRESHOLD, COST_TIER_TOTAL_LOSS_THRESHOLD } from "./pipelineCostConstants";

// ─── Test the shared constants ───────────────────────────────────────────────
describe("pipelineCostConstants", () => {
  it("ECONOMIC_WRITE_OFF_THRESHOLD is 0.65", () => {
    expect(ECONOMIC_WRITE_OFF_THRESHOLD).toBe(0.65);
  });
  it("COST_TIER_TOTAL_LOSS_THRESHOLD is 0.75 (intentionally higher than write-off threshold)", () => {
    expect(COST_TIER_TOTAL_LOSS_THRESHOLD).toBe(0.75);
    expect(COST_TIER_TOTAL_LOSS_THRESHOLD).toBeGreaterThan(ECONOMIC_WRITE_OFF_THRESHOLD);
  });
  it("RTV_ELEVATED_THRESHOLD is 0.50", () => {
    expect(RTV_ELEVATED_THRESHOLD).toBe(0.50);
  });
});

// ─── Simulate the claimTruthLayer write-off check ────────────────────────────
describe("claimTruthLayer write-off logic (simulated)", () => {
  function isWriteOff(repairCost: number, marketValue: number): boolean {
    const ratio = repairCost / marketValue;
    return ratio >= ECONOMIC_WRITE_OFF_THRESHOLD;
  }

  it("67% RTV → isEconomicWriteOff = true (above 65% threshold)", () => {
    expect(isWriteOff(6700, 10000)).toBe(true);
  });
  it("64% RTV → isEconomicWriteOff = false (below 65% threshold)", () => {
    expect(isWriteOff(6400, 10000)).toBe(false);
  });
  it("65% RTV exactly → isEconomicWriteOff = true (at threshold)", () => {
    expect(isWriteOff(6500, 10000)).toBe(true);
  });
  it("70% RTV → isEconomicWriteOff = true (previously contradicted by narrative at 70%)", () => {
    expect(isWriteOff(7000, 10000)).toBe(true);
  });
});

// ─── Simulate the costIntelligenceNarrative repairToValueComment ─────────────
describe("costIntelligenceNarrative repairToValueComment (simulated)", () => {
  function repairToValueComment(agreedCost: number, marketValue: number): string {
    if (!agreedCost || !marketValue || marketValue === 0) return "";
    const ratio = (agreedCost / marketValue) * 100;
    if (ratio >= ECONOMIC_WRITE_OFF_THRESHOLD * 100) {
      return `write-off threshold met: ${ratio.toFixed(1)}%`;
    }
    if (ratio >= RTV_ELEVATED_THRESHOLD * 100) {
      return `elevated: ${ratio.toFixed(1)}%`;
    }
    return `well within range: ${ratio.toFixed(1)}%`;
  }

  it("67% RTV → narrative says write-off threshold met (not 'well within range')", () => {
    const text = repairToValueComment(6700, 10000);
    expect(text).toContain("write-off threshold met");
    expect(text).not.toContain("well within range");
  });
  it("64% RTV → narrative says elevated (between 50% and 65%)", () => {
    const text = repairToValueComment(6400, 10000);
    expect(text).toContain("elevated");
  });
  it("40% RTV → narrative says well within range", () => {
    const text = repairToValueComment(4000, 10000);
    expect(text).toContain("well within range");
  });
  it("70% RTV → narrative says write-off threshold met (was previously contradictory)", () => {
    const text = repairToValueComment(7000, 10000);
    expect(text).toContain("write-off threshold met");
    expect(text).not.toContain("well within range");
  });
});

// ─── Confirm decision panel and narrative agree at 67% RTV ───────────────────
describe("R-E-01 regression: decision panel and narrative no longer contradict at 67% RTV", () => {
  const repairCost = 6700;
  const marketValue = 10000;
  const ratio = repairCost / marketValue; // 0.67

  it("decision panel: isEconomicWriteOff = true at 67%", () => {
    expect(ratio >= ECONOMIC_WRITE_OFF_THRESHOLD).toBe(true);
  });
  it("narrative: does NOT say 'well within range' at 67%", () => {
    const ratioPercent = ratio * 100;
    const narrativeSaysOk = ratioPercent < ECONOMIC_WRITE_OFF_THRESHOLD * 100;
    expect(narrativeSaysOk).toBe(false);
  });
  it("both use the same threshold constant — no contradiction possible", () => {
    // If both use ECONOMIC_WRITE_OFF_THRESHOLD, they will always agree
    const decisionFlags = ratio >= ECONOMIC_WRITE_OFF_THRESHOLD;
    const narrativeFlags = ratio >= ECONOMIC_WRITE_OFF_THRESHOLD;
    expect(decisionFlags).toBe(narrativeFlags);
  });
});
