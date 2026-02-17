/**
 * Fast-Track Engine Test Suite
 * 
 * Tests:
 * - Config hierarchy resolution (claim type → product → insurer)
 * - Threshold evaluation logic
 * - Disabled config behavior
 * - Version immutability
 * - Cross-tenant isolation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "../db";
import {
  evaluateFastTrack,
  getFastTrackHistory,
  overrideFastTrackDecision,
  FastTrackValidationError,
} from "./fast-track-engine";
import {
  fastTrackConfig,
  fastTrackRoutingLog,
  claims,
  type InsertFastTrackConfig,
  type InsertClaim,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const TEST_TENANT_ID = "test-tenant-ft-001";
const TEST_TENANT_ID_2 = "test-tenant-ft-002";
const TEST_USER_ID = 1;

describe("Fast-Track Engine", () => {
  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up test data
    await db.delete(fastTrackRoutingLog).where(eq(fastTrackRoutingLog.tenantId, TEST_TENANT_ID));
    await db.delete(fastTrackRoutingLog).where(eq(fastTrackRoutingLog.tenantId, TEST_TENANT_ID_2));
    await db.delete(fastTrackConfig).where(eq(fastTrackConfig.tenantId, TEST_TENANT_ID));
    await db.delete(fastTrackConfig).where(eq(fastTrackConfig.tenantId, TEST_TENANT_ID_2));
    await db.delete(claims).where(eq(claims.tenantId, TEST_TENANT_ID));
    await db.delete(claims).where(eq(claims.tenantId, TEST_TENANT_ID_2));
  });

  describe("Config Hierarchy Resolution", () => {
    it("should resolve most specific config (claim type + product + tenant)", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create test claim
      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-001",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      // Create configs at different specificity levels
      const tenantWideConfig: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "50.00",
        maxClaimValue: 100000,
        maxFraudScore: "30.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      const productConfig: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: 1,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "60.00",
        maxClaimValue: 150000,
        maxFraudScore: "25.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      const claimTypeConfig: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        claimType: "collision",
        fastTrackAction: "REDUCED_DOCUMENTATION",
        minConfidenceScore: "70.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      const mostSpecificConfig: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: 1,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 250000,
        maxFraudScore: "15.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values([
        tenantWideConfig,
        productConfig,
        claimTypeConfig,
        mostSpecificConfig,
      ]);

      // Evaluate with product ID and claim type - should use most specific config
      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85,
        claimValue: 100000,
        fraudScore: 10,
        claimType: "collision",
        productId: 1,
      });

      expect(result.eligible).toBe(true);
      expect(result.action).toBe("AUTO_APPROVE");
      expect(result.evaluationDetails.configSpecificity).toBe("claim_type_product");
    });

    it("should fall back to claim type config when no product-specific config exists", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-002",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      const claimTypeConfig: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        claimType: "collision",
        fastTrackAction: "REDUCED_DOCUMENTATION",
        minConfidenceScore: "70.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values(claimTypeConfig);

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 75, // >= 70
        claimValue: 150000, // <= 200000
        fraudScore: 15, // <= 20
        claimType: "collision",
        productId: 1, // Product ID provided but no product-specific config
      });

      expect(result.eligible).toBe(true);
      expect(result.action).toBe("REDUCED_DOCUMENTATION");
      expect(result.evaluationDetails.configSpecificity).toBe("claim_type");
    });

    it("should return MANUAL_REVIEW when no config found", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-003",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85,
        claimValue: 100000,
        fraudScore: 10,
        claimType: "collision",
        productId: 1,
      });

      expect(result.eligible).toBe(false);
      expect(result.action).toBe("MANUAL_REVIEW");
      expect(result.configVersion).toBeNull();
      expect(result.evaluationDetails.configSpecificity).toBe("none");
    });
  });

  describe("Threshold Evaluation", () => {
    it("should mark claim eligible when all thresholds met", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-004",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      const config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values(config);

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85, // >= 80
        claimValue: 150000, // <= 200000
        fraudScore: 15, // <= 20
        claimType: "collision",
        productId: null,
      });

      expect(result.eligible).toBe(true);
      expect(result.action).toBe("AUTO_APPROVE");
      expect(result.evaluationDetails.thresholdsMet.minConfidence).toBe(true);
      expect(result.evaluationDetails.thresholdsMet.maxClaimValue).toBe(true);
      expect(result.evaluationDetails.thresholdsMet.maxFraudScore).toBe(true);
    });

    it("should mark claim ineligible when confidence score too low", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-005",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      const config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values(config);

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 75, // < 80
        claimValue: 150000,
        fraudScore: 15,
        claimType: "collision",
        productId: null,
      });

      expect(result.eligible).toBe(false);
      expect(result.action).toBe("MANUAL_REVIEW");
      expect(result.evaluationDetails.thresholdsMet.minConfidence).toBe(false);
      expect(result.evaluationDetails.reason).toContain("confidence 75% < 80%");
    });

    it("should mark claim ineligible when claim value too high", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-006",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      const config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values(config);

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85,
        claimValue: 250000, // > 200000
        fraudScore: 15,
        claimType: "collision",
        productId: null,
      });

      expect(result.eligible).toBe(false);
      expect(result.action).toBe("MANUAL_REVIEW");
      expect(result.evaluationDetails.thresholdsMet.maxClaimValue).toBe(false);
      expect(result.evaluationDetails.reason).toContain("claim value 250000 > 200000");
    });

    it("should mark claim ineligible when fraud score too high", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-007",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      const config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values(config);

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85,
        claimValue: 150000,
        fraudScore: 25, // > 20
        claimType: "collision",
        productId: null,
      });

      expect(result.eligible).toBe(false);
      expect(result.action).toBe("MANUAL_REVIEW");
      expect(result.evaluationDetails.thresholdsMet.maxFraudScore).toBe(false);
      expect(result.evaluationDetails.reason).toContain("fraud score 25% > 20%");
    });
  });

  describe("Disabled Config Behavior", () => {
    it("should ignore disabled config and fall back to next level", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-008",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      // Disabled most specific config
      const disabledConfig: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: 1,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 250000,
        maxFraudScore: "15.00",
        enabled: 0, // Disabled
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      // Enabled fallback config
      const enabledConfig: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "70.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values([disabledConfig, enabledConfig]);

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 75, // >= 70
        claimValue: 150000, // <= 200000
        fraudScore: 15, // <= 20
        claimType: "collision",
        productId: 1,
      });

      expect(result.eligible).toBe(true);
      expect(result.action).toBe("PRIORITY_QUEUE"); // Uses enabled fallback config
      expect(result.evaluationDetails.configSpecificity).toBe("claim_type");
    });
  });

  describe("Version Immutability", () => {
    it("should use latest version when multiple versions exist", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-009",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      // Version 1 (older)
      const v1Config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "70.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(Date.now() - 86400000), // 1 day ago
        createdBy: TEST_USER_ID,
      };

      // Version 2 (newer)
      const v2Config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 250000,
        maxFraudScore: "15.00",
        enabled: 1,
        version: 2,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values([v1Config, v2Config]);

      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85, // >= 80
        claimValue: 200000, // <= 250000
        fraudScore: 12, // <= 15
        claimType: "collision",
        productId: null,
      });

      expect(result.eligible).toBe(true);
      expect(result.action).toBe("AUTO_APPROVE"); // Uses version 2
      expect(result.configVersion).toBe(2);
    });
  });

  describe("Cross-Tenant Isolation", () => {
    it("should reject evaluation for claim from different tenant", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create claim in tenant 1
      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-010",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      // Try to evaluate with tenant 2 credentials
      await expect(
        evaluateFastTrack({
          claimId,
          tenantId: TEST_TENANT_ID_2, // Different tenant
          confidenceScore: 85,
          claimValue: 100000,
          fraudScore: 10,
          claimType: "collision",
          productId: null,
        })
      ).rejects.toThrow(FastTrackValidationError);
    });

    it("should not use config from different tenant", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create claim in tenant 1
      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-011",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      // Create config for tenant 2
      const tenant2Config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID_2,
        productId: null,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 250000,
        maxFraudScore: "15.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values(tenant2Config);

      // Evaluate claim from tenant 1 - should not use tenant 2 config
      const result = await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85,
        claimValue: 100000,
        fraudScore: 10,
        claimType: "collision",
        productId: null,
      });

      expect(result.eligible).toBe(false);
      expect(result.action).toBe("MANUAL_REVIEW");
      expect(result.configVersion).toBeNull();
    });
  });

  describe("Audit Trail", () => {
    it("should log all evaluations to fastTrackRoutingLog", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-012",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      const config: InsertFastTrackConfig = {
        tenantId: TEST_TENANT_ID,
        productId: null,
        claimType: "collision",
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 200000,
        maxFraudScore: "20.00",
        enabled: 1,
        version: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
      };

      await db.insert(fastTrackConfig).values(config);

      await evaluateFastTrack({
        claimId,
        tenantId: TEST_TENANT_ID,
        confidenceScore: 85,
        claimValue: 150000,
        fraudScore: 15,
        claimType: "collision",
        productId: null,
      });

      // Check audit log
      const history = await getFastTrackHistory({
        claimId,
        tenantId: TEST_TENANT_ID,
      });

      expect(history.length).toBe(1);
      expect(history[0].decision).toBe("AUTO_APPROVE");
      expect(history[0].eligible).toBe(true);
      expect(history[0].configVersion).toBe(1);
      expect(history[0].confidenceScore).toBe(85);
      expect(history[0].claimValue).toBe(150000);
      expect(history[0].fraudScore).toBe(15);
    });
  });

  describe("Manual Override", () => {
    it("should allow manual override with justification", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-013",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      await overrideFastTrackDecision({
        claimId,
        tenantId: TEST_TENANT_ID,
        newDecision: "AUTO_APPROVE",
        overrideBy: TEST_USER_ID,
        overrideReason: "Executive decision to fast-track this claim due to customer VIP status",
        confidenceScore: 75,
        claimValue: 150000,
        fraudScore: 15,
        claimType: "collision",
        productId: null,
      });

      const history = await getFastTrackHistory({
        claimId,
        tenantId: TEST_TENANT_ID,
      });

      expect(history.length).toBe(1);
      expect(history[0].decision).toBe("AUTO_APPROVE");
      expect(history[0].override).toBe(true);
      expect(history[0].reason).toContain("[MANUAL OVERRIDE]");
      expect(history[0].reason).toContain("Executive decision");
    });

    it("should reject override with short justification", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const testClaim: InsertClaim = {
        claimantId: 1,
        claimNumber: "FT-TEST-014",
        tenantId: TEST_TENANT_ID,
        status: "submitted",
        incidentType: "collision",
      };
      const [claim] = await db.insert(claims).values(testClaim);
      const claimId = claim.insertId;

      await expect(
        overrideFastTrackDecision({
          claimId,
          tenantId: TEST_TENANT_ID,
          newDecision: "AUTO_APPROVE",
          overrideBy: TEST_USER_ID,
          overrideReason: "Too short", // Less than 20 characters
          confidenceScore: 75,
          claimValue: 150000,
          fraudScore: 15,
          claimType: "collision",
          productId: null,
        })
      ).rejects.toThrow(FastTrackValidationError);
    });
  });
});
