import { describe, expect, it } from "vitest";
import { resolveKingaWriteOffRecommendation } from "../../shared/writeOffRecommendation";
import { WRITE_OFF_RECOMMENDATION_THRESHOLD, WRITE_OFF_WARNING_THRESHOLD } from "../../shared/writeOffPolicy";
import { resolveRepairabilityVerdict } from "../reporting/costDecisionPresentation";

describe("KINGA write-off recommendation boundary", () => {
  it("surfaces a 65% warning without a recommendation and reserves recommendation for 70%", () => {
    expect(WRITE_OFF_WARNING_THRESHOLD).toBe(0.65);
    expect(WRITE_OFF_RECOMMENDATION_THRESHOLD).toBe(0.7);
    const warning = resolveKingaWriteOffRecommendation({ completeL2CostUsd: 6700, verifiedMarketValueUsd: 10000, structuralDamageDetected: false, physicsExecuted: true, physicsSeverity: "moderate" });
    const recommendation = resolveKingaWriteOffRecommendation({ completeL2CostUsd: 7000, verifiedMarketValueUsd: 10000, structuralDamageDetected: false, physicsExecuted: true, physicsSeverity: "moderate" });
    expect(warning.kind).toBe("economic_write_off_warning");
    expect(warning.writeOffRecommended).toBe(false);
    expect(warning.writeOffWarning).toBe(true);
    expect(warning.detail).toContain("no write-off recommendation is made");
    expect(recommendation.kind).toBe("economic_write_off_recommended");
    expect(recommendation.writeOffRecommended).toBe(true);
    expect(recommendation.writeOffWarning).toBe(false);
  });

  it("requires both dedicated structural analysis and executed severe physics for a technical recommendation", () => {
    const technical = resolveKingaWriteOffRecommendation({ completeL2CostUsd: null, verifiedMarketValueUsd: null, structuralDamageDetected: true, physicsExecuted: true, physicsSeverity: "catastrophic" });
    const structuralOnly = resolveKingaWriteOffRecommendation({ completeL2CostUsd: null, verifiedMarketValueUsd: null, structuralDamageDetected: true, physicsExecuted: false, physicsSeverity: "catastrophic" });
    expect(technical.kind).toBe("technical_write_off_recommended");
    expect(technical.writeOffRecommended).toBe(true);
    expect(structuralOnly.kind).toBe("human_review_required");
    expect(structuralOnly.writeOffRecommended).toBe(false);
  });

  it("retains both economic and technical evidence when both recommendation conditions are present", () => {
    const result = resolveKingaWriteOffRecommendation({ completeL2CostUsd: 8500, verifiedMarketValueUsd: 10000, structuralDamageDetected: true, physicsExecuted: true, physicsSeverity: "severe" });
    expect(result.kind).toBe("economic_and_technical_write_off_recommended");
    expect(result.writeOffRecommended).toBe(true);
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, kingaRecommendation: result }).label).toBe("Economic and technical write-off recommended");
  });
});
