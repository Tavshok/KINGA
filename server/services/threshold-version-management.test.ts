/**
 * Threshold Version Management Tests
 * 
 * Tests for version-controlled threshold configurations with strict governance controls.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb } from "../db";
import { routingThresholdConfig, claims, routingHistory } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  getActiveThresholdConfig,
  createThresholdVersion,
  deactivateThresholdVersion,
  getThresholdVersionHistory,
  getDefaultThresholdConfig,
  calculateRoutingCategoryWithThresholds,
  ThresholdValidationError,
  type CreateThresholdVersionParams,
} from "./threshold-version-management";
import {
  createRoutingEvent,
  getRoutingHistory,
  type ConfidenceComponents,
  type CreateRoutingEventParams,
} from "./immutable-routing";

const db = await getDb();

describe("Threshold Version Management", () => {
  const testTenantId = "test-tenant-threshold";
  const testUserId = 1;
  let createdThresholdIds: string[] = [];
  
  beforeEach(async () => {
    if (!db) throw new Error("Database not available");
    createdThresholdIds = [];
  });
  
  afterEach(async () => {
    if (!db) return;
    
    // Clean up test data
    if (createdThresholdIds.length > 0) {
      for (const id of createdThresholdIds) {
        await db.delete(routingThresholdConfig).where(eq(routingThresholdConfig.id, id));
      }
    }
    
    // Clean up any remaining test tenant configs
    await db.delete(routingThresholdConfig).where(eq(routingThresholdConfig.tenantId, testTenantId));
  });
  
  describe("createThresholdVersion", () => {
    it("should create new threshold version", async () => {
      const params: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result = await createThresholdVersion(params);
      createdThresholdIds.push(result.id);
      
      expect(result.id).toMatch(/^threshold_\d+_[a-f0-9]{16}$/);
      expect(result.version).toBe("v1.0");
      
      // Verify it's active
      const active = await getActiveThresholdConfig(testTenantId);
      expect(active).not.toBeNull();
      expect(active?.version).toBe("v1.0");
      expect(active?.highThreshold).toBe(80);
      expect(active?.mediumThreshold).toBe(50);
    });
    
    it("should reject invalid threshold values", async () => {
      const params: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 150, // Invalid
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      await expect(createThresholdVersion(params)).rejects.toThrow(ThresholdValidationError);
      await expect(createThresholdVersion(params)).rejects.toThrow("High threshold must be between 0 and 100");
    });
    
    it("should reject medium threshold >= high threshold", async () => {
      const params: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 85, // Invalid (>= high)
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      await expect(createThresholdVersion(params)).rejects.toThrow(ThresholdValidationError);
      await expect(createThresholdVersion(params)).rejects.toThrow("Medium threshold (85) must be less than high threshold (80)");
    });
    
    it("should reject duplicate version for same tenant", async () => {
      const params: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result1 = await createThresholdVersion(params);
      createdThresholdIds.push(result1.id);
      
      // Try to create same version again
      await expect(createThresholdVersion(params)).rejects.toThrow(ThresholdValidationError);
      await expect(createThresholdVersion(params)).rejects.toThrow("Threshold version v1.0 already exists");
    });
    
    it("should deactivate previous active version when creating new version", async () => {
      // Create v1.0
      const params1: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result1 = await createThresholdVersion(params1);
      createdThresholdIds.push(result1.id);
      
      // Create v1.1 (should deactivate v1.0)
      const params2: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.1",
        highThreshold: 85,
        mediumThreshold: 55,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result2 = await createThresholdVersion(params2);
      createdThresholdIds.push(result2.id);
      
      // Verify only v1.1 is active
      const active = await getActiveThresholdConfig(testTenantId);
      expect(active?.version).toBe("v1.1");
      expect(active?.highThreshold).toBe(85);
      
      // Verify v1.0 is inactive
      const history = await getThresholdVersionHistory(testTenantId);
      const v1_0 = history.find(h => h.version === "v1.0");
      expect(v1_0?.isActive).toBe(false);
    });
    
    it("should enforce only one active version per tenant", async () => {
      if (!db) throw new Error("Database not available");
      
      // Create v1.0
      const params1: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result1 = await createThresholdVersion(params1);
      createdThresholdIds.push(result1.id);
      
      // Create v1.1
      const params2: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.1",
        highThreshold: 85,
        mediumThreshold: 55,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result2 = await createThresholdVersion(params2);
      createdThresholdIds.push(result2.id);
      
      // Count active versions
      const activeVersions = await db.select()
        .from(routingThresholdConfig)
        .where(
          and(
            eq(routingThresholdConfig.tenantId, testTenantId),
            eq(routingThresholdConfig.isActive, true)
          )
        );
      
      expect(activeVersions).toHaveLength(1);
      expect(activeVersions[0].version).toBe("v1.1");
    });
  });
  
  describe("getActiveThresholdConfig", () => {
    it("should return active threshold config", async () => {
      const params: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result = await createThresholdVersion(params);
      createdThresholdIds.push(result.id);
      
      const active = await getActiveThresholdConfig(testTenantId);
      
      expect(active).not.toBeNull();
      expect(active?.version).toBe("v1.0");
      expect(active?.highThreshold).toBe(80);
      expect(active?.mediumThreshold).toBe(50);
      expect(active?.aiFastTrackEnabled).toBe(true);
    });
    
    it("should return null if no active config exists", async () => {
      const active = await getActiveThresholdConfig("nonexistent-tenant");
      expect(active).toBeNull();
    });
  });
  
  describe("deactivateThresholdVersion", () => {
    it("should deactivate threshold version", async () => {
      const params: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result = await createThresholdVersion(params);
      createdThresholdIds.push(result.id);
      
      await deactivateThresholdVersion({
        tenantId: testTenantId,
        version: "v1.0",
      });
      
      const active = await getActiveThresholdConfig(testTenantId);
      expect(active).toBeNull();
    });
    
    it("should throw error if version not found", async () => {
      await expect(
        deactivateThresholdVersion({
          tenantId: testTenantId,
          version: "nonexistent",
        })
      ).rejects.toThrow(ThresholdValidationError);
    });
  });
  
  describe("getThresholdVersionHistory", () => {
    it("should return version history ordered by creation date", async () => {
      // Create multiple versions
      const params1: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result1 = await createThresholdVersion(params1);
      createdThresholdIds.push(result1.id);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const params2: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.1",
        highThreshold: 85,
        mediumThreshold: 55,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result2 = await createThresholdVersion(params2);
      createdThresholdIds.push(result2.id);
      
      const history = await getThresholdVersionHistory(testTenantId);
      
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe("v1.0");
      expect(history[1].version).toBe("v1.1");
      expect(history[0].isActive).toBe(false);
      expect(history[1].isActive).toBe(true);
    });
  });
  
  describe("Integration with routing decisions", () => {
    let testClaimId: number;
    
    beforeEach(async () => {
      if (!db) throw new Error("Database not available");
      
      // Create test claim
      const [claim] = await db.insert(claims).values({
        claimantId: 1,
        claimNumber: `TEST-THRESHOLD-${Date.now()}`,
        tenantId: testTenantId,
        status: "submitted",
      }).$returningId();
      
      testClaimId = claim.id;
    });
    
    afterEach(async () => {
      if (!db) return;
      
      // Clean up test data
      await db.delete(routingHistory).where(eq(routingHistory.claimId, testClaimId));
      await db.delete(claims).where(eq(claims.id, testClaimId));
    });
    
    it("should use active threshold version for new routing decisions", async () => {
      // Create threshold v1.0 with high threshold 80
      const thresholdParams: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const thresholdResult = await createThresholdVersion(thresholdParams);
      createdThresholdIds.push(thresholdResult.id);
      
      // Create routing event with confidence score 82 (should be HIGH with threshold 80)
      const components: ConfidenceComponents = {
        fraudRisk: 82,
        aiCertainty: 82,
        quoteVariance: 82,
        claimCompleteness: 82,
        historicalRisk: 82,
      };
      
      const routingParams: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 82,
        confidenceComponents: components,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "test-model-v1",
        decidedBy: "AI",
      };
      
      await createRoutingEvent(routingParams);
      
      // Verify routing event captured threshold version
      const history = await getRoutingHistory({
        claimId: testClaimId,
        tenantId: testTenantId,
      });
      
      expect(history).toHaveLength(1);
      expect(history[0].thresholdConfigVersion).toBe("v1.0");
      expect(history[0].routingCategory).toBe("HIGH");
    });
    
    it("should not affect past routing decisions when thresholds change", async () => {
      // Create threshold v1.0 with high threshold 80
      const threshold1: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result1 = await createThresholdVersion(threshold1);
      createdThresholdIds.push(result1.id);
      
      // Create routing event with v1.0 (score 82 = HIGH with threshold 80)
      const components: ConfidenceComponents = {
        fraudRisk: 82,
        aiCertainty: 82,
        quoteVariance: 82,
        claimCompleteness: 82,
        historicalRisk: 82,
      };
      
      const routing1: CreateRoutingEventParams = {
        claimId: testClaimId,
        tenantId: testTenantId,
        confidenceScore: 82,
        confidenceComponents: components,
        routingCategory: "HIGH",
        routingDecision: "AI_FAST_TRACK",
        thresholdConfigVersion: "v1.0",
        modelVersion: "test-model-v1",
        decidedBy: "AI",
      };
      
      await createRoutingEvent(routing1);
      
      // Change threshold to v1.1 with high threshold 85
      const threshold2: CreateThresholdVersionParams = {
        tenantId: testTenantId,
        version: "v1.1",
        highThreshold: 85,
        mediumThreshold: 55,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result2 = await createThresholdVersion(threshold2);
      createdThresholdIds.push(result2.id);
      
      // Verify past routing decision is unchanged
      const history = await getRoutingHistory({
        claimId: testClaimId,
        tenantId: testTenantId,
      });
      
      expect(history).toHaveLength(1);
      expect(history[0].thresholdConfigVersion).toBe("v1.0");
      expect(history[0].routingCategory).toBe("HIGH"); // Still HIGH, not affected by v1.1
      expect(history[0].confidenceScore).toBe("82.00");
    });
  });
  
  describe("calculateRoutingCategoryWithThresholds", () => {
    it("should calculate HIGH category correctly", () => {
      const thresholds = {
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
      };
      
      expect(calculateRoutingCategoryWithThresholds(85, thresholds)).toBe("HIGH");
      expect(calculateRoutingCategoryWithThresholds(80, thresholds)).toBe("HIGH");
    });
    
    it("should calculate MEDIUM category correctly", () => {
      const thresholds = {
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
      };
      
      expect(calculateRoutingCategoryWithThresholds(75, thresholds)).toBe("MEDIUM");
      expect(calculateRoutingCategoryWithThresholds(50, thresholds)).toBe("MEDIUM");
    });
    
    it("should calculate LOW category correctly", () => {
      const thresholds = {
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
      };
      
      expect(calculateRoutingCategoryWithThresholds(45, thresholds)).toBe("LOW");
      expect(calculateRoutingCategoryWithThresholds(0, thresholds)).toBe("LOW");
    });
    
    it("should use custom thresholds correctly", () => {
      const customThresholds = {
        highThreshold: 90,
        mediumThreshold: 70,
        aiFastTrackEnabled: true,
      };
      
      expect(calculateRoutingCategoryWithThresholds(85, customThresholds)).toBe("MEDIUM"); // Would be HIGH with default
      expect(calculateRoutingCategoryWithThresholds(65, customThresholds)).toBe("LOW"); // Would be MEDIUM with default
    });
  });
  
  describe("Tenant isolation", () => {
    it("should isolate threshold configs by tenant", async () => {
      const tenant1 = "tenant-1";
      const tenant2 = "tenant-2";
      
      // Create threshold for tenant 1
      const params1: CreateThresholdVersionParams = {
        tenantId: tenant1,
        version: "v1.0",
        highThreshold: 80,
        mediumThreshold: 50,
        aiFastTrackEnabled: true,
        createdByUserId: testUserId,
      };
      
      const result1 = await createThresholdVersion(params1);
      createdThresholdIds.push(result1.id);
      
      // Create threshold for tenant 2
      const params2: CreateThresholdVersionParams = {
        tenantId: tenant2,
        version: "v1.0",
        highThreshold: 90,
        mediumThreshold: 60,
        aiFastTrackEnabled: false,
        createdByUserId: testUserId,
      };
      
      const result2 = await createThresholdVersion(params2);
      createdThresholdIds.push(result2.id);
      
      // Verify tenant 1 config
      const active1 = await getActiveThresholdConfig(tenant1);
      expect(active1?.highThreshold).toBe(80);
      expect(active1?.aiFastTrackEnabled).toBe(true);
      
      // Verify tenant 2 config
      const active2 = await getActiveThresholdConfig(tenant2);
      expect(active2?.highThreshold).toBe(90);
      expect(active2?.aiFastTrackEnabled).toBe(false);
      
      // Clean up
      if (db) {
        await db.delete(routingThresholdConfig).where(eq(routingThresholdConfig.tenantId, tenant1));
        await db.delete(routingThresholdConfig).where(eq(routingThresholdConfig.tenantId, tenant2));
      }
    });
  });
});
