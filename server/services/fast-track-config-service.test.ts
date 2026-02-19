// @ts-nocheck
/**
 * Fast-Track Configuration Service Tests
 * 
 * Comprehensive test coverage for governance guardrails including:
 * - Invalid threshold attempts
 * - Boundary edge cases
 * - Role-based config restrictions
 * - Justification requirements
 * - Audit logging
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "../db";
import {
  createFastTrackConfig,
  getActiveGovernanceLimits,
  getGovernanceViolations,
  GovernanceViolationError,
  type CreateFastTrackConfigParams,
} from "./fast-track-config-service";
import {
  claims,
  platformGovernanceLimits,
  governanceViolationLog,
  fastTrackConfig,
} from "../../drizzle/schema";

const TEST_TENANT_ID = "test-tenant-gov-001";
const TEST_USER_ID = 1;

describe("Fast-Track Configuration Service - Governance Guardrails", () => {
  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up test data
    await db.delete(governanceViolationLog);
    await db.delete(fastTrackConfig);
    await db.delete(platformGovernanceLimits);
    await db.delete(claims);

    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Insert test governance limits
    await db.insert(platformGovernanceLimits).values({
      maxAutoApprovalLimitGlobal: 5000000, // R50,000 in cents
      minConfidenceAllowedGlobal: "85.00",
      maxFraudToleranceGlobal: "10.00",
      version: 1,
      effectiveFrom: new Date(),
      createdBy: TEST_USER_ID,
      notes: "Test platform limits",
    });
  });

  describe("Platform Governance Limits", () => {
    it("should retrieve active governance limits", async () => {
      const limits = await getActiveGovernanceLimits();

      expect(limits).toBeDefined();
      expect(limits?.maxAutoApprovalLimitGlobal).toBe(5000000);
      expect(limits?.minConfidenceAllowedGlobal).toBe("85.00");
      expect(limits?.maxFraudToleranceGlobal).toBe("10.00");
    });

    it("should return default limits if none configured", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Delete all limits
      await db.delete(platformGovernanceLimits);

      const limits = await getActiveGovernanceLimits();

      expect(limits).toBeDefined();
      expect(limits?.maxAutoApprovalLimitGlobal).toBe(5000000);
      expect(limits?.minConfidenceAllowedGlobal).toBe("85.00");
      expect(limits?.maxFraudToleranceGlobal).toBe("10.00");
    });
  });

  describe("Auto-Approval Limit Validation", () => {
    it("should reject auto-approve config exceeding global financial limit", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 6000000, // Exceeds 5000000 limit
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow("exceeds global maximum");

      // Verify violation was logged
      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      expect(violations[0].violationType).toBe("EXCEEDS_AUTO_APPROVAL_LIMIT");
      expect(violations[0].userId).toBe(TEST_USER_ID);
      expect(violations[0].userRole).toBe("ClaimsManager");
    });

    it("should allow auto-approve config at exactly the global limit", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 5000000, // Exactly at limit
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.maxClaimValue).toBe(5000000);
      expect(config.fastTrackAction).toBe("AUTO_APPROVE");
    });

    it("should allow auto-approve config below the global limit", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000, // Below limit
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.maxClaimValue).toBe(3000000);
    });
  });

  describe("Confidence Threshold Validation", () => {
    it("should reject config with confidence below global minimum", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "80.00", // Below 85.00 minimum
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow("below global minimum");

      // Verify violation was logged
      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      expect(violations[0].violationType).toBe("BELOW_MIN_CONFIDENCE");
    });

    it("should allow config with confidence at exactly the global minimum", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "85.00", // Exactly at minimum
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.minConfidenceScore).toBe("85.00");
    });

    it("should allow config with confidence above the global minimum", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "92.00", // Above minimum
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.minConfidenceScore).toBe("92.00");
    });
  });

  describe("Fraud Tolerance Validation", () => {
    it("should reject config with fraud tolerance above global maximum", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "15.00", // Exceeds 10.00 maximum
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow("exceeds global maximum");

      // Verify violation was logged
      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      expect(violations[0].violationType).toBe("EXCEEDS_MAX_FRAUD_TOLERANCE");
    });

    it("should allow config with fraud tolerance at exactly the global maximum", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "10.00", // Exactly at maximum
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.maxFraudScore).toBe("10.00");
    });

    it("should allow config with fraud tolerance below the global maximum", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00", // Below maximum
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.maxFraudScore).toBe("5.00");
    });
  });

  describe("Justification Requirements", () => {
    it("should reject AUTO_APPROVE without justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        // No justification provided
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow("at least 20 characters");

      // Verify violation was logged
      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      expect(violations[0].violationType).toBe("INSUFFICIENT_JUSTIFICATION");
    });

    it("should reject AUTO_APPROVE with insufficient justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "Too short", // Less than 20 characters
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow("at least 20 characters");
    });

    it("should accept AUTO_APPROVE with valid justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.fastTrackAction).toBe("AUTO_APPROVE");
    });

    it("should reject STRAIGHT_TO_PAYMENT without justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "STRAIGHT_TO_PAYMENT",
        minConfidenceScore: "95.00",
        maxClaimValue: 2000000,
        maxFraudScore: "3.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "Executive",
        // No justification
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow();
    });

    it("should allow PRIORITY_QUEUE without justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        // No justification required
      };

      const config = await createFastTrackConfig(params);

      expect(config).toBeDefined();
      expect(config.fastTrackAction).toBe("PRIORITY_QUEUE");
    });
  });

  describe("Audit Trail", () => {
    it("should record actor, role, and tenantId in violation log", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00", // Below minimum
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow();

      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      expect(violations[0].tenantId).toBe(TEST_TENANT_ID);
      expect(violations[0].userId).toBe(TEST_USER_ID);
      expect(violations[0].userRole).toBe("ClaimsManager");
      expect(violations[0].violationType).toBe("BELOW_MIN_CONFIDENCE");
    });

    it("should store attempted config snapshot in violation log", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 6000000, // Exceeds limit
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "Executive",
        justification: "This is a valid justification with more than 20 characters",
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow();

      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);

      const attemptedConfig = JSON.parse(violations[0].attemptedConfig);
      expect(attemptedConfig.maxClaimValue).toBe(6000000);
      expect(attemptedConfig.fastTrackAction).toBe("AUTO_APPROVE");
    });

    it("should store governance limits snapshot in violation log", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "75.00", // Below minimum
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      await expect(createFastTrackConfig(params)).rejects.toThrow();

      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);

      const limitsSnapshot = JSON.parse(violations[0].governanceLimitsSnapshot);
      expect(limitsSnapshot.maxAutoApprovalLimit).toBe(5000000);
      expect(limitsSnapshot.minConfidenceAllowed).toBe("85.00");
      expect(limitsSnapshot.maxFraudTolerance).toBe("10.00");
    });
  });

  describe("Version Immutability", () => {
    it("should increment version for each new config", async () => {
      const params1: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };

      const config1 = await createFastTrackConfig(params1);
      expect(config1.version).toBe(1);

      const params2: CreateFastTrackConfigParams = {
        ...params1,
        minConfidenceScore: "92.00",
      };

      const config2 = await createFastTrackConfig(params2);
      expect(config2.version).toBe(2);
    });
  });
});
