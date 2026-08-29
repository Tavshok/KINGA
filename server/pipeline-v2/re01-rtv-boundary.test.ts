/**
 * R-E-01 two-threshold repair-to-value verification.
 * 65% is an early warning; 70% is a human-overridable write-off recommendation.
 */
import { describe, expect, it } from "vitest";
import {
  COST_TIER_TOTAL_LOSS_THRESHOLD,
  RTV_ELEVATED_THRESHOLD,
  WRITE_OFF_RECOMMENDATION_THRESHOLD,
  WRITE_OFF_WARNING_THRESHOLD,
} from "./pipelineCostConstants";

function rtvDisposition(repairCost: number, marketValue: number): "REPAIR" | "WARNING" | "RECOMMENDATION" {
  const ratio = repairCost / marketValue;
  if (ratio >= WRITE_OFF_RECOMMENDATION_THRESHOLD) return "RECOMMENDATION";
  if (ratio >= WRITE_OFF_WARNING_THRESHOLD) return "WARNING";
  return "REPAIR";
}

function repairToValueComment(repairCost: number, marketValue: number): string {
  const ratio = repairCost / marketValue;
  if (ratio >= WRITE_OFF_RECOMMENDATION_THRESHOLD) return "write-off recommendation";
  if (ratio >= WRITE_OFF_WARNING_THRESHOLD) return "early warning";
  if (ratio >= RTV_ELEVATED_THRESHOLD) return "elevated";
  return "well within range";
}

describe("pipelineCostConstants", () => {
  it("defines separate 65% warning and 70% recommendation thresholds", () => {
    expect(WRITE_OFF_WARNING_THRESHOLD).toBe(0.65);
    expect(WRITE_OFF_RECOMMENDATION_THRESHOLD).toBe(0.70);
    expect(WRITE_OFF_WARNING_THRESHOLD).toBeLessThan(WRITE_OFF_RECOMMENDATION_THRESHOLD);
  });

  it("keeps the 75% learning total-loss classification distinct from both decision-support thresholds", () => {
    expect(COST_TIER_TOTAL_LOSS_THRESHOLD).toBe(0.75);
    expect(COST_TIER_TOTAL_LOSS_THRESHOLD).toBeGreaterThan(WRITE_OFF_RECOMMENDATION_THRESHOLD);
  });
});

describe("legacy 65% expectations reclassified by behavior", () => {
  it("reclassifies the former 67% economic assertion as a warning, not a recommendation", () => {
    expect(rtvDisposition(6700, 10000)).toBe("WARNING");
  });
  it("keeps 64% below the early-warning threshold", () => {
    expect(rtvDisposition(6400, 10000)).toBe("REPAIR");
  });
  it("reclassifies the former 65% write-off assertion as an early warning", () => {
    expect(rtvDisposition(6500, 10000)).toBe("WARNING");
  });
  it("keeps the former 70% write-off assertion as a recommendation", () => {
    expect(rtvDisposition(7000, 10000)).toBe("RECOMMENDATION");
  });
  it("reclassifies the former 67% narrative assertion as warning copy", () => {
    expect(repairToValueComment(6700, 10000)).toBe("early warning");
  });
  it("keeps the former 67% non-repair narrative assertion while preventing recommendation status", () => {
    expect(repairToValueComment(6700, 10000)).not.toBe("well within range");
    expect(rtvDisposition(6700, 10000)).not.toBe("RECOMMENDATION");
  });
});
