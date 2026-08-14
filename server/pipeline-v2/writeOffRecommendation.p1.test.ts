import { describe, expect, it } from "vitest";
import {
  KINGA_ECONOMIC_WRITE_OFF_THRESHOLD,
  resolveKingaWriteOffRecommendation,
} from "../../shared/writeOffRecommendation";
import { resolveRepairabilityVerdict } from "../reporting/costDecisionPresentation";

describe("KINGA write-off recommendation boundary", () => {
  it("uses one 70% economic threshold and does not recommend write-off below it", () => {
    expect(KINGA_ECONOMIC_WRITE_OFF_THRESHOLD).toBe(0.7);

    const below = resolveKingaWriteOffRecommendation({
      completeL2CostUsd: 6999,
      verifiedMarketValueUsd: 10_000,
      structuralDamageDetected: false,
      physicsExecuted: true,
      physicsSeverity: "moderate",
    });
    const atThreshold = resolveKingaWriteOffRecommendation({
      ...{
        completeL2CostUsd: 7000,
        verifiedMarketValueUsd: 10_000,
        structuralDamageDetected: false,
        physicsExecuted: true,
        physicsSeverity: "moderate",
      },
    });

    expect(below.kind).toBe("repair_recommended");
    expect(below.writeOffRecommended).toBe(false);
    expect(atThreshold.kind).toBe("economic_write_off_recommended");
    expect(atThreshold.writeOffRecommended).toBe(true);
    expect(atThreshold.repairToValueRatio).toBe(0.7);
  });

  it("requires both dedicated structural analysis and executed severe physics for a technical write-off recommendation", () => {
    const technical = resolveKingaWriteOffRecommendation({
      completeL2CostUsd: null,
      verifiedMarketValueUsd: null,
      structuralDamageDetected: true,
      physicsExecuted: true,
      physicsSeverity: "catastrophic",
    });
    const structuralOnly = resolveKingaWriteOffRecommendation({
      completeL2CostUsd: null,
      verifiedMarketValueUsd: null,
      structuralDamageDetected: true,
      physicsExecuted: false,
      physicsSeverity: "catastrophic",
    });

    expect(technical.kind).toBe("technical_write_off_recommended");
    expect(technical.writeOffRecommended).toBe(true);
    expect(structuralOnly.kind).toBe("human_review_required");
    expect(structuralOnly.writeOffRecommended).toBe(false);
  });

  it("retains both economic and technical evidence when both recommendation conditions are present", () => {
    const result = resolveKingaWriteOffRecommendation({
      completeL2CostUsd: 8500,
      verifiedMarketValueUsd: 10_000,
      structuralDamageDetected: true,
      physicsExecuted: true,
      physicsSeverity: "severe",
    });

    expect(result.kind).toBe("economic_and_technical_write_off_recommended");
    expect(result.writeOffRecommended).toBe(true);
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, kingaRecommendation: result }).label)
      .toBe("Economic and technical write-off recommended");
  });

  it("does not create an economic write-off from an incomplete L2 or missing market value", () => {
    const missingMarket = resolveKingaWriteOffRecommendation({
      completeL2CostUsd: 8500,
      verifiedMarketValueUsd: null,
      structuralDamageDetected: false,
      physicsExecuted: true,
      physicsSeverity: "moderate",
    });

    expect(missingMarket.kind).toBe("human_review_required");
    expect(missingMarket.writeOffRecommended).toBe(false);
    expect(missingMarket.detail).toContain("complete KINGA Optimised Quote and/or verified market value is unavailable");
  });
});
