// @ts-nocheck
/**
 * Routing Re-Evaluation Tests
 * 
 * Tests for manual re-evaluation of routing decisions with role-based access control.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb } from "../db";
import { claims, routingHistory, workflowAuditTrail, routingThresholdConfig } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  reEvaluateRouting,
  createRoutingEvent,
  getRoutingHistory,
  RoutingValidationError,
  type ReEvaluateRoutingParams,
  type ConfidenceComponents,
  type CreateRoutingEventParams,
} from "./immutable-routing";
import { createThresholdVersion, type CreateThresholdVersionParams } from "./threshold-version-management";

const db = await getDb();

describe("Routing Re-Evaluation", () => {
  const testTenantId = "test-tenant-reeval";
  const executiveUserId = 100;
  const claimsManagerUserId = 101;
  const assessorUserId = 102;
  
  let testClaimId: number;
  let createdRoutingIds: string[] = [];
  let createdThresholdIds: string[] = [];
  
  beforeEach(async () => {
    if (!db) throw new Error("Database not available");
    
    // Create test claim
    const [claim] = await db.insert(claims).values({
      claimantId: 1,
      claimNumber: `TEST-REEVAL-${Date.now()}`,
      tenantId: testTenantId,
      status: "submitted",
    }).$returningId();
    
    testClaimId = claim.id;
    createdRoutingIds = [];
    createdThresholdIds = [];
  });
  
  afterEach(async () => {
    if (!db) return;
    
    // Clean up test data
    await db.delete(workflowAuditTrail).where(eq(workflowAuditTrail.claimId, testClaimId));
    
    if (createdRoutingIds.length > 0) {
      for (const id of createdRoutingIds) {
        await db.delete(routingHistory).where(eq(routingHistory.id, id));
      }
    }
    
    await db.delete(claims).where(eq(claims.id, testClaimId));
    
    if (createdThresholdIds.length > 0) {
      for (const id of createdThresholdIds) {
        await db.delete(routingThresholdConfig).where(eq(routingThresholdConfig.id, id));
      }
    }
    
    await db.delete(routingThresholdConfig).where(eq(routingThresholdConfig.tenantId, testTenantId));
  });
  
  describe("Role-based access control", () => {
    it("should allow Executive role to re-evaluate routing", async () => {
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Re-evaluating due to new information from claimant indicating additional damage",
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      const result = await reEvaluateRouting(params);
      createdRoutingIds.push(result.id);
      
      expect(result.id).toMatch(/^routing_\d+_[a-f0-9]{16}$/);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
    
    it("should allow ClaimsManager role to re-evaluate routing", async () => {
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: claimsManagerUserId,
        userRole: "claims_manager",
        justification: "Re-evaluating based on updated assessment from external assessor",
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      const result = await reEvaluateRouting(params);
      createdRoutingIds.push(result.id);
      
      expect(result.id).toMatch(/^routing_\d+_[a-f0-9]{16}$/);
    });
    
    it("should reject unauthorized role (assessor)", async () => {
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: assessorUserId,
        userRole: "assessor_internal",
        justification: "Attempting to re-evaluate routing decision",
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      await expect(reEvaluateRouting(params)).rejects.toThrow(RoutingValidationError);
      await expect(reEvaluateRouting(params)).rejects.toThrow("Unauthorized role: assessor_internal");
    });
    
    it("should reject unauthorized role (claims_processor)", async () => {
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: assessorUserId,
        userRole: "claims_processor",
        justification: "Attempting to re-evaluate routing decision",
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      await expect(reEvaluateRouting(params)).rejects.toThrow(RoutingValidationError);
      await expect(reEvaluateRouting(params)).rejects.toThrow("Unauthorized role: claims_processor");
    });
  });
  
  describe("Justification validation", () => {
    it("should reject missing justification", async () => {
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "",
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      await expect(reEvaluateRouting(params)).rejects.toThrow(RoutingValidationError);
      await expect(reEvaluateRouting(params)).rejects.toThrow("Justification must be at least 20 characters");
    });
    
    it("should reject short justification (< 20 characters)", async () => {
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Too short",
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      await expect(reEvaluateRouting(params)).rejects.toThrow(RoutingValidationError);
      await expect(reEvaluateRouting(params)).rejects.toThrow("Justification must be at least 20 characters");
    });
    
    it("should accept valid justification (>= 20 characters)", async () => {
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Valid 20 char reason", // 21 characters
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      const result = await reEvaluateRouting(params);
      createdRoutingIds.push(result.id);
      
      expect(result.id).toBeDefined();
    });
  });
  
  describe("Immutability and append-only behavior", () => {
    it("should preserve previous routing history when re-evaluating", async () => {
      // Create initial routing decision
      const initialComponents: ConfidenceComponents = {
        fraudRisk: 85,
        aiCertainty: 85,
        quoteVariance: 85,
        claimCompleteness: 85,
        historicalRisk: 85,
      };
      
      const initialRouting: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 85,
        confidenceComponents: initialComponents,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "test-model-v1",
        decidedBy: "AI",
      };
      
      const initialResult = await createRoutingEvent(initialRouting);
      createdRoutingIds.push(initialResult.id);
      
      // Re-evaluate routing
      const reEvalComponents: ConfidenceComponents = {
        fraudRisk: 45,
        aiCertainty: 45,
        quoteVariance: 45,
        claimCompleteness: 45,
        historicalRisk: 45,
      };
      
      const reEvalParams: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Re-evaluating due to new fraud indicators discovered during investigation",
        confidenceComponents: reEvalComponents,
        modelVersion: "test-model-v2",
      };
      
      const reEvalResult = await reEvaluateRouting(reEvalParams);
      createdRoutingIds.push(reEvalResult.id);
      
      // Verify both routing events exist
      const history = await getRoutingHistory({
        claimId: testClaimId,
        tenantId: testTenantId,
      });
      
      expect(history).toHaveLength(2);
      
      // Verify initial routing is unchanged
      const initialEvent = history.find(h => h.id === initialResult.id);
      expect(initialEvent).toBeDefined();
      expect(initialEvent?.routingCategory).toBe("HIGH");
      expect(initialEvent?.confidenceScore).toBe("85.00");
      
      // Verify re-evaluation event
      const reEvalEvent = history.find(h => h.id === reEvalResult.id);
      expect(reEvalEvent).toBeDefined();
      expect(reEvalEvent?.routingCategory).toBe("LOW"); // 45 < 50 (default medium threshold)
      expect(reEvalEvent?.decidedBy).toBe("USER");
      expect(reEvalEvent?.decidedByUserId).toBe(executiveUserId);
    });
    
    it("should allow multiple re-evaluations (append-only)", async () => {
      const components1: ConfidenceComponents = {
        fraudRisk: 85,
        aiCertainty: 85,
        quoteVariance: 85,
        claimCompleteness: 85,
        historicalRisk: 85,
      };
      
      // First re-evaluation
      const params1: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "First re-evaluation based on initial assessment review",
        confidenceComponents: components1,
        modelVersion: "test-model-v1",
      };
      
      const result1 = await reEvaluateRouting(params1);
      createdRoutingIds.push(result1.id);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const components2: ConfidenceComponents = {
        fraudRisk: 55,
        aiCertainty: 55,
        quoteVariance: 55,
        claimCompleteness: 55,
        historicalRisk: 55,
      };
      
      // Second re-evaluation
      const params2: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: claimsManagerUserId,
        userRole: "claims_manager",
        justification: "Second re-evaluation after receiving updated documentation",
        confidenceComponents: components2,
        modelVersion: "test-model-v2",
      };
      
      const result2 = await reEvaluateRouting(params2);
      createdRoutingIds.push(result2.id);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const components3: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      // Third re-evaluation
      const params3: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Third re-evaluation following external assessor report",
        confidenceComponents: components3,
        modelVersion: "test-model-v3",
      };
      
      const result3 = await reEvaluateRouting(params3);
      createdRoutingIds.push(result3.id);
      
      // Verify all three routing events exist
      const history = await getRoutingHistory({
        claimId: testClaimId,
        tenantId: testTenantId,
      });
      
      expect(history).toHaveLength(3);
      expect(history.map(h => h.id)).toContain(result1.id);
      expect(history.map(h => h.id)).toContain(result2.id);
      expect(history.map(h => h.id)).toContain(result3.id);
    });
    
    it("should reference previous routing decision ID", async () => {
      // Create initial routing
      const initialComponents: ConfidenceComponents = {
        fraudRisk: 85,
        aiCertainty: 85,
        quoteVariance: 85,
        claimCompleteness: 85,
        historicalRisk: 85,
      };
      
      const initialRouting: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 85,
        confidenceComponents: initialComponents,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "test-model-v1",
        decidedBy: "AI",
      };
      
      const initialResult = await createRoutingEvent(initialRouting);
      createdRoutingIds.push(initialResult.id);
      
      // Re-evaluate
      const reEvalComponents: ConfidenceComponents = {
        fraudRisk: 55,
        aiCertainty: 55,
        quoteVariance: 55,
        claimCompleteness: 55,
        historicalRisk: 55,
      };
      
      const reEvalParams: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Re-evaluating with updated confidence components",
        confidenceComponents: reEvalComponents,
        modelVersion: "test-model-v2",
      };
      
      const reEvalResult = await reEvaluateRouting(reEvalParams);
      createdRoutingIds.push(reEvalResult.id);
      
      // Verify previousRoutingId is set
      expect(reEvalResult.previousRoutingId).toBe(initialResult.id);
    });
  });
  
  describe("Current threshold version usage", () => {
    it("should use current active threshold version for re-evaluation", async () => {
      // Create threshold v1.0 with high threshold 80
      const threshold1: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: executiveUserId,
      };
      
      const thresholdResult1 = await createThresholdVersion(threshold1);
      createdThresholdIds.push(thresholdResult1.id);
      
      // Create initial routing with v1.0 (score 82 = HIGH)
      const initialComponents: ConfidenceComponents = {
        fraudRisk: 82,
        aiCertainty: 82,
        quoteVariance: 82,
        claimCompleteness: 82,
        historicalRisk: 82,
      };
      
      const initialRouting: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 82,
        confidenceComponents: initialComponents,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "test-model-v1",
        decidedBy: "AI",
      };
      
      const initialResult = await createRoutingEvent(initialRouting);
      createdRoutingIds.push(initialResult.id);
      
      // Change threshold to v1.1 with high threshold 85
      const threshold2: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.1",
        highThreshold: 85,
        mediumThreshold: 55,
        aiFastTrackEnabled: true,
        createdByUserId: executiveUserId,
      };
      
      const thresholdResult2 = await createThresholdVersion(threshold2);
      createdThresholdIds.push(thresholdResult2.id);
      
      // Re-evaluate with same score (82) - should now be MEDIUM with v1.1
      const reEvalComponents: ConfidenceComponents = {
        fraudRisk: 82,
        aiCertainty: 82,
        quoteVariance: 82,
        claimCompleteness: 82,
        historicalRisk: 82,
      };
      
      const reEvalParams: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Re-evaluating with current threshold configuration",
        confidenceComponents: reEvalComponents,
        modelVersion: "test-model-v2",
      };
      
      const reEvalResult = await reEvaluateRouting(reEvalParams);
      createdRoutingIds.push(reEvalResult.id);
      
      // Verify re-evaluation uses v1.1 and results in MEDIUM
      const history = await getRoutingHistory({
        claimId: testClaimId,
        tenantId: testTenantId,
      });
      
      const reEvalEvent = history.find(h => h.id === reEvalResult.id);
      expect(reEvalEvent?.thresholdConfigVersion).toBe("v1.1");
      expect(reEvalEvent?.routingCategory).toBe("MEDIUM"); // 82 < 85 (v1.1 high threshold)
      
      // Verify initial routing still has v1.0
      const initialEvent = history.find(h => h.id === initialResult.id);
      expect(initialEvent?.thresholdConfigVersion).toBe("v1.0");
      expect(initialEvent?.routingCategory).toBe("HIGH"); // Unchanged
    });
  });
  
  describe("Audit logging", () => {
    it("should log re-evaluation to workflowAuditTrail", async () => {
      if (!db) throw new Error("Database not available");
      
      const components: ConfidenceComponents = {
        fraudRisk: 75,
        aiCertainty: 75,
        quoteVariance: 75,
        claimCompleteness: 75,
        historicalRisk: 75,
      };
      
      const params: ReEvaluateRoutingParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        userId: executiveUserId,
        userRole: "executive",
        justification: "Re-evaluating due to new evidence from claimant",
        confidenceComponents: components,
        modelVersion: "test-model-v1",
      };
      
      const result = await reEvaluateRouting(params);
      createdRoutingIds.push(result.id);
      
      // Verify audit trail entry
      const auditEntries = await db.select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId));
      
      expect(auditEntries.length).toBeGreaterThanOrEqual(1);
      
      // Find the re-evaluation entry
      const reEvalEntry = auditEntries.find(entry => 
        entry.comments?.includes("Routing re-evaluated")
      );
      
      expect(reEvalEntry).toBeDefined();
      expect(reEvalEntry?.userId).toBe(executiveUserId);
      expect(reEvalEntry?.userRole).toBe("executive");
      expect(reEvalEntry?.comments).toContain("Routing re-evaluated");
      
      // Verify metadata
      const metadata = JSON.parse(reEvalEntry?.metadata || "{}");
      expect(metadata.action).toBe("ROUTING_RE_EVALUATION");
      expect(metadata.newRoutingId).toBe(result.id);
      expect(metadata.justification).toBe("Re-evaluating due to new evidence from claimant");
    });
  });
});
