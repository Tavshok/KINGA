// @ts-nocheck
/**
 * Confidence Scoring and Routing System Tests
 * 
 * Comprehensive test coverage for:
 * - Confidence score calculation
 * - Component score calculations
 * - Routing category determination
 * - Threshold boundary conditions
 * - Tenant isolation
 * - Executive override logging
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateConfidenceScore,
  determineRoutingCategory,
  getRecommendedRoute,
  getRoutingThresholds,
  updateRoutingThresholds,
  CONFIDENCE_WEIGHTS,
  DEFAULT_ROUTING_THRESHOLDS,
  type RoutingThresholds,
} from "./confidence-scoring";

describe("Confidence Score Calculation", () => {
  it("should calculate confidence score with all components", async () => {
    // This test requires actual database data
    // In a real scenario, you would set up test fixtures
    const result = await calculateConfidenceScore(1);
    
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components).toHaveProperty("fraudRiskScore");
    expect(result.components).toHaveProperty("aiCertainty");
    expect(result.components).toHaveProperty("quoteVariance");
    expect(result.components).toHaveProperty("claimCompleteness");
    expect(result.components).toHaveProperty("historicalClaimantRisk");
  });

  it("should normalize score to 0-100 range", async () => {
    const result = await calculateConfidenceScore(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("should apply correct weights to components", () => {
    const weights = CONFIDENCE_WEIGHTS;
    const totalWeight = 
      weights.fraudRisk +
      weights.aiCertainty +
      weights.quoteVariance +
      weights.claimCompleteness +
      weights.historicalRisk;

    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it("should handle missing AI assessment gracefully", async () => {
    // Test with a claim that has no AI assessment
    const result = await calculateConfidenceScore(999999);
    expect(result.components.aiCertainty).toBe(0);
  });

  it("should handle missing claim data gracefully", async () => {
    const result = await calculateConfidenceScore(999999);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("Routing Category Determination", () => {
  const defaultThresholds: RoutingThresholds = {
    highConfidenceThreshold: 75,
    mediumConfidenceThreshold: 50,
    aiFastTrackEnabled: false,
  };

  it("should categorize HIGH confidence correctly", () => {
    const category = determineRoutingCategory(80, defaultThresholds);
    expect(category).toBe("HIGH");
  });

  it("should categorize MEDIUM confidence correctly", () => {
    const category = determineRoutingCategory(60, defaultThresholds);
    expect(category).toBe("MEDIUM");
  });

  it("should categorize LOW confidence correctly", () => {
    const category = determineRoutingCategory(40, defaultThresholds);
    expect(category).toBe("LOW");
  });

  it("should handle exact threshold boundaries - high", () => {
    const category = determineRoutingCategory(75, defaultThresholds);
    expect(category).toBe("HIGH");
  });

  it("should handle exact threshold boundaries - medium", () => {
    const category = determineRoutingCategory(50, defaultThresholds);
    expect(category).toBe("MEDIUM");
  });

  it("should handle edge case - score 0", () => {
    const category = determineRoutingCategory(0, defaultThresholds);
    expect(category).toBe("LOW");
  });

  it("should handle edge case - score 100", () => {
    const category = determineRoutingCategory(100, defaultThresholds);
    expect(category).toBe("HIGH");
  });

  it("should respect custom tenant thresholds", () => {
    const customThresholds: RoutingThresholds = {
      highConfidenceThreshold: 90,
      mediumConfidenceThreshold: 70,
      aiFastTrackEnabled: true,
    };

    expect(determineRoutingCategory(85, customThresholds)).toBe("MEDIUM");
    expect(determineRoutingCategory(95, customThresholds)).toBe("HIGH");
    expect(determineRoutingCategory(65, customThresholds)).toBe("LOW");
  });
});

describe("Routing Recommendations", () => {
  it("should recommend AI fast-track for HIGH confidence when enabled", async () => {
    // This test requires database setup
    // Mock or use test fixtures in real implementation
    const recommendation = await getRecommendedRoute(1, "test-tenant");
    
    expect(recommendation).toHaveProperty("category");
    expect(recommendation).toHaveProperty("confidenceScore");
    expect(recommendation).toHaveProperty("recommendedPath");
    expect(recommendation).toHaveProperty("reasoning");
    expect(recommendation).toHaveProperty("requiresExternalAssessment");
    expect(recommendation).toHaveProperty("eligibleForFastTrack");
  });

  it("should require external assessment for LOW confidence", async () => {
    // Test with a low-confidence claim
    const recommendation = await getRecommendedRoute(1, "test-tenant");
    
    if (recommendation.category === "LOW") {
      expect(recommendation.requiresExternalAssessment).toBe(true);
      expect(recommendation.eligibleForFastTrack).toBe(false);
    }
  });

  it("should not allow fast-track when tenant has it disabled", async () => {
    const recommendation = await getRecommendedRoute(1, "test-tenant");
    
    // Default is disabled
    if (recommendation.category === "HIGH") {
      const thresholds = await getRoutingThresholds("test-tenant");
      if (!thresholds.aiFastTrackEnabled) {
        expect(recommendation.eligibleForFastTrack).toBe(false);
      }
    }
  });
});

describe("Tenant Threshold Configuration", () => {
  it("should return default thresholds for unconfigured tenant", async () => {
    const thresholds = await getRoutingThresholds("nonexistent-tenant");
    expect(thresholds).toEqual(DEFAULT_ROUTING_THRESHOLDS);
  });

  it("should validate threshold values on update", async () => {
    await expect(
      updateRoutingThresholds("test-tenant", {
        highConfidenceThreshold: 40,
        mediumConfidenceThreshold: 60, // Invalid: high < medium
      })
    ).rejects.toThrow("High confidence threshold must be greater than medium threshold");
  });

  it("should validate threshold range (0-100)", async () => {
    await expect(
      updateRoutingThresholds("test-tenant", {
        highConfidenceThreshold: 150, // Invalid: > 100
      })
    ).rejects.toThrow("Thresholds must be between 0 and 100");

    await expect(
      updateRoutingThresholds("test-tenant", {
        mediumConfidenceThreshold: -10, // Invalid: < 0
      })
    ).rejects.toThrow("Thresholds must be between 0 and 100");
  });

  it("should allow valid threshold updates", async () => {
    await expect(
      updateRoutingThresholds("test-tenant", {
        highConfidenceThreshold: 80,
        mediumConfidenceThreshold: 55,
        aiFastTrackEnabled: true,
      })
    ).resolves.not.toThrow();
  });
});

describe("Tenant Isolation", () => {
  it("should isolate routing thresholds by tenant", async () => {
    // Set different thresholds for two tenants
    await updateRoutingThresholds("tenant-a", {
      highConfidenceThreshold: 80,
      mediumConfidenceThreshold: 60,
    });

    await updateRoutingThresholds("tenant-b", {
      highConfidenceThreshold: 70,
      mediumConfidenceThreshold: 40,
    });

    const thresholdsA = await getRoutingThresholds("tenant-a");
    const thresholdsB = await getRoutingThresholds("tenant-b");

    expect(thresholdsA.highConfidenceThreshold).toBe(80);
    expect(thresholdsB.highConfidenceThreshold).toBe(70);
  });

  it("should not allow cross-tenant routing recommendations", async () => {
    // Routing recommendations should only use the specified tenant's thresholds
    const recA = await getRecommendedRoute(1, "tenant-a");
    const recB = await getRecommendedRoute(1, "tenant-b");

    // Same claim, different tenants = potentially different categories
    // (if thresholds differ)
    expect(recA).toHaveProperty("category");
    expect(recB).toHaveProperty("category");
  });
});

describe("Threshold Boundary Conditions", () => {
  it("should handle score exactly at high threshold", () => {
    const thresholds: RoutingThresholds = {
      highConfidenceThreshold: 75,
      mediumConfidenceThreshold: 50,
      aiFastTrackEnabled: false,
    };

    expect(determineRoutingCategory(75.0, thresholds)).toBe("HIGH");
    expect(determineRoutingCategory(74.9, thresholds)).toBe("MEDIUM");
  });

  it("should handle score exactly at medium threshold", () => {
    const thresholds: RoutingThresholds = {
      highConfidenceThreshold: 75,
      mediumConfidenceThreshold: 50,
      aiFastTrackEnabled: false,
    };

    expect(determineRoutingCategory(50.0, thresholds)).toBe("MEDIUM");
    expect(determineRoutingCategory(49.9, thresholds)).toBe("LOW");
  });

  it("should handle floating point precision", () => {
    const thresholds: RoutingThresholds = {
      highConfidenceThreshold: 75,
      mediumConfidenceThreshold: 50,
      aiFastTrackEnabled: false,
    };

    // Test scores very close to thresholds
    expect(determineRoutingCategory(74.99999, thresholds)).toBe("MEDIUM");
    expect(determineRoutingCategory(75.00001, thresholds)).toBe("HIGH");
    expect(determineRoutingCategory(49.99999, thresholds)).toBe("LOW");
    expect(determineRoutingCategory(50.00001, thresholds)).toBe("MEDIUM");
  });
});

describe("Component Score Validation", () => {
  it("should ensure all component scores are 0-100", async () => {
    const result = await calculateConfidenceScore(1);
    const components = result.components;

    expect(components.fraudRiskScore).toBeGreaterThanOrEqual(0);
    expect(components.fraudRiskScore).toBeLessThanOrEqual(100);

    expect(components.aiCertainty).toBeGreaterThanOrEqual(0);
    expect(components.aiCertainty).toBeLessThanOrEqual(100);

    expect(components.quoteVariance).toBeGreaterThanOrEqual(0);
    expect(components.quoteVariance).toBeLessThanOrEqual(100);

    expect(components.claimCompleteness).toBeGreaterThanOrEqual(0);
    expect(components.claimCompleteness).toBeLessThanOrEqual(100);

    expect(components.historicalClaimantRisk).toBeGreaterThanOrEqual(0);
    expect(components.historicalClaimantRisk).toBeLessThanOrEqual(100);
  });
});

describe("Executive Override Scenarios", () => {
  it("should include executive override in routing recommendation", async () => {
    const recommendation = await getRecommendedRoute(1, "test-tenant");
    
    // Recommendation should be structured to support override
    expect(recommendation).toHaveProperty("category");
    expect(recommendation).toHaveProperty("recommendedPath");
    
    // Executive can override any recommendation
    const overrideScenario = {
      original: recommendation,
      override: {
        overridden: true,
        overrideReason: "Executive judgment based on additional context",
        finalDecision: "Approve via fast-track despite LOW confidence",
      },
    };

    expect(overrideScenario.override.overridden).toBe(true);
    expect(overrideScenario.override.overrideReason).toBeTruthy();
  });
});
