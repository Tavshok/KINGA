/**
 * Confidence Explainability Tests
 * 
 * Tests for confidence calculation explainability metadata storage and reconstruction.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb } from "../db";
import { claims, routingHistory } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  calculateConfidenceWithExplainability,
  generateConfidenceExplanation,
  reconstructExplanationFromHistory,
  validateExplainabilityMetadata,
  DEFAULT_CONFIDENCE_WEIGHTS,
  type ConfidenceExplainability,
} from "./confidence-explainability";
import { createRoutingEvent, type CreateRoutingEventParams, type ConfidenceComponents } from "./immutable-routing";

const db = await getDb();

describe("Confidence Explainability", () => {
  const testTenantId = "test-tenant-explainability";
  let testClaimId: number;
  let createdRoutingIds: string[] = [];
  
  beforeEach(async () => {
    if (!db) throw new Error("Database not available");
    
    // Create test claim
    const [claim] = await db.insert(claims).values({
      claimantId: 1,
      claimNumber: `TEST-EXPLAIN-${Date.now()}`,
      tenantId: testTenantId,
      status: "submitted",
    }).$returningId();
    
    testClaimId = claim.id;
    createdRoutingIds = [];
  });
  
  afterEach(async () => {
    if (!db) return;
    
    // Clean up test data
    if (createdRoutingIds.length > 0) {
      for (const id of createdRoutingIds) {
        await db.delete(routingHistory).where(eq(routingHistory.id, id));
      }
    }
    
    await db.delete(claims).where(eq(claims.id, testClaimId));
  });
  
  describe("calculateConfidenceWithExplainability", () => {
    it("should calculate confidence score with explainability metadata", () => {
      const components: ConfidenceComponents = {
        fraudRisk: 80,
        aiCertainty: 90,
        quoteVariance: 70,
        claimCompleteness: 85,
        historicalRisk: 75,
      };
      
      const result = calculateConfidenceWithExplainability(components, undefined, "v1.0");
      
      expect(result.score).toBe(80); // (80+90+70+85+75)/5 = 80
      expect(result.explainability).toBeDefined();
      expect(result.explainability.weights).toEqual(DEFAULT_CONFIDENCE_WEIGHTS);
      expect(result.explainability.normalizedScore).toBe(80);
      expect(result.explainability.modelVersion).toBe("v1.0");
      expect(result.explainability.calculationTimestamp).toBeDefined();
    });
    
    it("should calculate weighted contributions correctly", () => {
      const components: ConfidenceComponents = {
        fraudRisk: 80,
        aiCertainty: 90,
        quoteVariance: 70,
        claimCompleteness: 85,
        historicalRisk: 75,
      };
      
      const result = calculateConfidenceWithExplainability(components);
      
      // With equal weights (0.2 each)
      expect(result.explainability.contributions.fraudRisk).toBe(16); // 80 * 0.2
      expect(result.explainability.contributions.aiCertainty).toBe(18); // 90 * 0.2
      expect(result.explainability.contributions.quoteVariance).toBe(14); // 70 * 0.2
      expect(result.explainability.contributions.claimCompleteness).toBe(17); // 85 * 0.2
      expect(result.explainability.contributions.historicalRisk).toBe(15); // 75 * 0.2
    });
    
    it("should support custom weights", () => {
      const components: ConfidenceComponents = {
        fraudRisk: 80,
        aiCertainty: 90,
        quoteVariance: 70,
        claimCompleteness: 85,
        historicalRisk: 75,
      };
      
      const customWeights = {
        fraudRisk: 0.3,
        aiCertainty: 0.3,
        quoteVariance: 0.2,
        claimCompleteness: 0.1,
        historicalRisk: 0.1,
      };
      
      const result = calculateConfidenceWithExplainability(components, customWeights, "v2.0");
      
      expect(result.explainability.weights).toEqual(customWeights);
      expect(result.explainability.contributions.fraudRisk).toBe(24); // 80 * 0.3
      expect(result.explainability.contributions.aiCertainty).toBe(27); // 90 * 0.3
      expect(result.explainability.normalizedScore).toBe(81); // 24+27+14+8.5+7.5 = 81
    });
    
    it("should reject weights that don't sum to 1.0", () => {
      const components: ConfidenceComponents = {
        fraudRisk: 80,
        aiCertainty: 90,
        quoteVariance: 70,
        claimCompleteness: 85,
        historicalRisk: 75,
      };
      
      const invalidWeights = {
        fraudRisk: 0.3,
        aiCertainty: 0.3,
        quoteVariance: 0.2,
        claimCompleteness: 0.1,
        historicalRisk: 0.2, // Sum = 1.1
      };
      
      expect(() => calculateConfidenceWithExplainability(components, invalidWeights)).toThrow(
        "Confidence weights must sum to 1.0"
      );
    });
  });
  
  describe("generateConfidenceExplanation", () => {
    it("should generate human-readable explanation for HIGH confidence", () => {
      const explainability: ConfidenceExplainability = {
        weights: DEFAULT_CONFIDENCE_WEIGHTS,
        contributions: {
          fraudRisk: 18, // 90 * 0.2
          aiCertainty: 18, // 90 * 0.2
          quoteVariance: 17, // 85 * 0.2
          claimCompleteness: 18, // 90 * 0.2
          historicalRisk: 17, // 85 * 0.2
        },
        normalizedScore: 88,
        modelVersion: "v1.0",
        calculationTimestamp: new Date().toISOString(),
      };
      
      const explanation = generateConfidenceExplanation(explainability, "HIGH");
      
      expect(explanation).toContain("Claim routed HIGH");
      expect(explanation).toContain("confidence score: 88.00");
      expect(explanation).toContain("fraud risk");
      expect(explanation).toContain("AI certainty");
      expect(explanation).toContain("quote variance");
      expect(explanation).toContain("claim completeness");
      expect(explanation).toContain("historical risk");
    });
    
    it("should generate human-readable explanation for MEDIUM confidence", () => {
      const explainability: ConfidenceExplainability = {
        weights: DEFAULT_CONFIDENCE_WEIGHTS,
        contributions: {
          fraudRisk: 12, // 60 * 0.2
          aiCertainty: 13, // 65 * 0.2
          quoteVariance: 11, // 55 * 0.2
          claimCompleteness: 12, // 60 * 0.2
          historicalRisk: 12, // 60 * 0.2
        },
        normalizedScore: 60,
        modelVersion: "v1.0",
        calculationTimestamp: new Date().toISOString(),
      };
      
      const explanation = generateConfidenceExplanation(explainability, "MEDIUM");
      
      expect(explanation).toContain("Claim routed MEDIUM");
      expect(explanation).toContain("confidence score: 60.00");
    });
    
    it("should generate human-readable explanation for LOW confidence", () => {
      const explainability: ConfidenceExplainability = {
        weights: DEFAULT_CONFIDENCE_WEIGHTS,
        contributions: {
          fraudRisk: 6, // 30 * 0.2
          aiCertainty: 7, // 35 * 0.2
          quoteVariance: 5, // 25 * 0.2
          claimCompleteness: 6, // 30 * 0.2
          historicalRisk: 6, // 30 * 0.2
        },
        normalizedScore: 30,
        modelVersion: "v1.0",
        calculationTimestamp: new Date().toISOString(),
      };
      
      const explanation = generateConfidenceExplanation(explainability, "LOW");
      
      expect(explanation).toContain("Claim routed LOW");
      expect(explanation).toContain("confidence score: 30.00");
    });
  });
  
  describe("Snapshot storage and reconstruction", () => {
    it("should store explainability metadata in routing history", async () => {
      if (!db) throw new Error("Database not available");
      
      const components: ConfidenceComponents = {
        fraudRisk: 85,
        aiCertainty: 90,
        quoteVariance: 80,
        claimCompleteness: 88,
        historicalRisk: 82,
      };
      
      const params: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 85,
        confidenceComponents: components,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "v1.0",
        decidedBy: "AI",
      };
      
      const result = await createRoutingEvent(params);
      createdRoutingIds.push(result.id);
      
      // Fetch routing history
      const [routing] = await db.select()
        .from(routingHistory)
        .where(eq(routingHistory.id, result.id))
        .limit(1);
      
      expect(routing).toBeDefined();
      expect(routing.explainabilityMetadata).toBeDefined();
      
      // Parse and validate explainability metadata
      const explainability: ConfidenceExplainability = JSON.parse(routing.explainabilityMetadata!);
      expect(explainability.weights).toEqual(DEFAULT_CONFIDENCE_WEIGHTS);
      expect(explainability.normalizedScore).toBe(85);
      expect(explainability.modelVersion).toBe("v1.0");
      expect(explainability.calculationTimestamp).toBeDefined();
    });
    
    it("should reconstruct explanation from stored metadata without recalculation", async () => {
      if (!db) throw new Error("Database not available");
      
      const components: ConfidenceComponents = {
        fraudRisk: 85,
        aiCertainty: 90,
        quoteVariance: 80,
        claimCompleteness: 88,
        historicalRisk: 82,
      };
      
      const params: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 85,
        confidenceComponents: components,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "v1.0",
        decidedBy: "AI",
      };
      
      const result = await createRoutingEvent(params);
      createdRoutingIds.push(result.id);
      
      // Fetch routing history
      const [routing] = await db.select()
        .from(routingHistory)
        .where(eq(routingHistory.id, result.id))
        .limit(1);
      
      // Reconstruct explanation from stored metadata (no recalculation)
      const explanation = reconstructExplanationFromHistory(
        routing.explainabilityMetadata!,
        routing.routingCategory
      );
      
      expect(explanation).toContain("Claim routed HIGH");
      expect(explanation).toContain("confidence score: 85.00");
      expect(explanation).toContain("fraud risk");
      expect(explanation).toContain("AI certainty");
    });
    
    it("should preserve historical record even if model version changes", async () => {
      if (!db) throw new Error("Database not available");
      
      const components: ConfidenceComponents = {
        fraudRisk: 85,
        aiCertainty: 90,
        quoteVariance: 80,
        claimCompleteness: 88,
        historicalRisk: 82,
      };
      
      // Create routing with v1.0
      const params1: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 85,
        confidenceComponents: components,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "v1.0",
        decidedBy: "AI",
      };
      
      const result1 = await createRoutingEvent(params1);
      createdRoutingIds.push(result1.id);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Create routing with v2.0
      const params2: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 85,
        confidenceComponents: components,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "v2.0",
        decidedBy: "AI",
      };
      
      const result2 = await createRoutingEvent(params2);
      createdRoutingIds.push(result2.id);
      
      // Fetch both routing histories
      const [routing1] = await db.select()
        .from(routingHistory)
        .where(eq(routingHistory.id, result1.id))
        .limit(1);
      
      const [routing2] = await db.select()
        .from(routingHistory)
        .where(eq(routingHistory.id, result2.id))
        .limit(1);
      
      // Verify v1.0 record is preserved
      const explainability1: ConfidenceExplainability = JSON.parse(routing1.explainabilityMetadata!);
      expect(explainability1.modelVersion).toBe("v1.0");
      
      // Verify v2.0 record has new model version
      const explainability2: ConfidenceExplainability = JSON.parse(routing2.explainabilityMetadata!);
      expect(explainability2.modelVersion).toBe("v2.0");
      
      // Both records should be independently reproducible
      const explanation1 = reconstructExplanationFromHistory(
        routing1.explainabilityMetadata!,
        routing1.routingCategory
      );
      const explanation2 = reconstructExplanationFromHistory(
        routing2.explainabilityMetadata!,
        routing2.routingCategory
      );
      
      expect(explanation1).toContain("Claim routed HIGH");
      expect(explanation2).toContain("Claim routed HIGH");
    });
  });
  
  describe("validateExplainabilityMetadata", () => {
    it("should validate correct metadata structure", () => {
      const validMetadata: ConfidenceExplainability = {
        weights: DEFAULT_CONFIDENCE_WEIGHTS,
        contributions: {
          fraudRisk: 16,
          aiCertainty: 18,
          quoteVariance: 14,
          claimCompleteness: 17,
          historicalRisk: 15,
        },
        normalizedScore: 80,
        modelVersion: "v1.0",
        calculationTimestamp: new Date().toISOString(),
      };
      
      expect(validateExplainabilityMetadata(validMetadata)).toBe(true);
    });
    
    it("should reject metadata missing weights", () => {
      const invalidMetadata = {
        contributions: {
          fraudRisk: 16,
          aiCertainty: 18,
          quoteVariance: 14,
          claimCompleteness: 17,
          historicalRisk: 15,
        },
        normalizedScore: 80,
        modelVersion: "v1.0",
        calculationTimestamp: new Date().toISOString(),
      };
      
      expect(() => validateExplainabilityMetadata(invalidMetadata)).toThrow(
        "Explainability metadata must have 'weights' object"
      );
    });
    
    it("should reject metadata missing contributions", () => {
      const invalidMetadata = {
        weights: DEFAULT_CONFIDENCE_WEIGHTS,
        normalizedScore: 80,
        modelVersion: "v1.0",
        calculationTimestamp: new Date().toISOString(),
      };
      
      expect(() => validateExplainabilityMetadata(invalidMetadata)).toThrow(
        "Explainability metadata must have 'contributions' object"
      );
    });
    
    it("should reject metadata missing normalizedScore", () => {
      const invalidMetadata = {
        weights: DEFAULT_CONFIDENCE_WEIGHTS,
        contributions: {
          fraudRisk: 16,
          aiCertainty: 18,
          quoteVariance: 14,
          claimCompleteness: 17,
          historicalRisk: 15,
        },
        modelVersion: "v1.0",
        calculationTimestamp: new Date().toISOString(),
      };
      
      expect(() => validateExplainabilityMetadata(invalidMetadata)).toThrow(
        "Explainability metadata must have 'normalizedScore' number"
      );
    });
  });
});
