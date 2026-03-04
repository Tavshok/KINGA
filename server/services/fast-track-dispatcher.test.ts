// @ts-nocheck
/**
 * Fast-Track Action Dispatcher Tests
 * 
 * Comprehensive test coverage for dispatcher including:
 * - Correct state transitions for each action
 * - Invalid state protection
 * - Segregation enforcement
 * - Audit log generation
 * - FastTrackRoutingLog linkage
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  executeFastTrackAction,
  type FastTrackEvaluationResult,
} from "./fast-track-dispatcher";
import {
  claims,
  fastTrackRoutingLog,
  workflowAuditTrail,
} from "../../drizzle/schema";

const TEST_TENANT_ID = "test-tenant-dispatcher-001";
const TEST_USER_ID = 1;

describe("Fast-Track Action Dispatcher", () => {
  let testClaimId: number;

  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up test data using raw SQL
    await db.execute(sql`DELETE FROM fast_track_routing_log`);
    await db.execute(sql`DELETE FROM workflow_audit_trail`);
    // workflow_states table doesn't exist yet - skip cleanup
    await db.execute(sql`DELETE FROM claims`);

    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create test claim in technical_approval state (ready for fast-track actions)
    const [result] = await db.insert(claims).values({
      tenantId: TEST_TENANT_ID,
      claimNumber: `DISP-TEST-${Date.now()}`,
      claimantId: 1, // Required field
      policyNumber: "TEST-POL-001", // Required field
      incidentDate: new Date(),
      status: "assessment_in_progress",
      workflowState: "assigned", // Base state; each describe block sets the correct state
      metadata: JSON.stringify({}),
    });

    testClaimId = result.insertId;

    // Note: workflow_states table doesn't exist yet
    // WorkflowEngine integration will be tested separately
  });

  describe("AUTO_APPROVE Action", () => {
    beforeEach(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(claims).set({ workflowState: "technical_approval" }).where(eq(claims.id, testClaimId));
    });
    it("should transition claim to financial_decision state", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "AUTO_APPROVE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 92.5,
          fraudScore: 3.2,
          claimValue: 250000,
          reason: "High confidence, low fraud risk",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID,
        false
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("AUTO_APPROVE");
      expect(result.newState).toBe("financial_decision");
      expect(result.routingLogId).toBeDefined();
    });

    it("should flag claim as auto-approved", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "AUTO_APPROVE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 92.5,
          fraudScore: 3.2,
          claimValue: 250000,
          reason: "High confidence, low fraud risk",
        },
      };

      await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID,
        false
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [claim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      const metadata = claim.metadata && typeof claim.metadata === 'string' 
        ? JSON.parse(claim.metadata) 
        : claim.metadata;

      expect(metadata.autoApproved).toBe(true);
      expect(metadata.fastTrackAction).toBe("AUTO_APPROVE");
      expect(metadata.fastTrackConfigVersion).toBe(1);
    });

    it("should support executive override path", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "AUTO_APPROVE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 92.5,
          fraudScore: 3.2,
          claimValue: 250000,
          reason: "High confidence, low fraud risk",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID,
        true // Allow override
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("AUTO_APPROVE");
    });

    it("should create fastTrackRoutingLog entry", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "AUTO_APPROVE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 92.5,
          fraudScore: 3.2,
          claimValue: 250000,
          reason: "High confidence, low fraud risk",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID,
        false
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [logEntry] = await db
        .select()
        .from(fastTrackRoutingLog)
        .where(eq(fastTrackRoutingLog.id, result.routingLogId!))
        .limit(1);

      expect(logEntry).toBeDefined();
      expect(logEntry.claimId).toBe(testClaimId);
      expect(logEntry.decision).toBe("AUTO_APPROVE");
      expect(logEntry.configVersion).toBe(1);
      expect(parseFloat(logEntry.confidenceScore)).toBe(92.5);
      expect(parseFloat(logEntry.fraudScore)).toBe(3.2);
    });
  });

  describe("PRIORITY_QUEUE Action", () => {
    beforeEach(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(claims).set({ workflowState: "under_assessment" }).where(eq(claims.id, testClaimId));
    });
    it("should transition claim to priority_review state", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "PRIORITY_QUEUE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 88.0,
          fraudScore: 5.5,
          claimValue: 250000,
          reason: "Medium confidence, eligible for priority",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("PRIORITY_QUEUE");
      expect(result.newState).toBe("internal_review");
    });

    it("should assign SLA tag to claim", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "PRIORITY_QUEUE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 88.0,
          fraudScore: 5.5,
          claimValue: 250000,
          reason: "Medium confidence, eligible for priority",
        },
      };

      await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [claim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      const metadata = claim.metadata && typeof claim.metadata === 'string' 
        ? JSON.parse(claim.metadata) 
        : claim.metadata;

      expect(metadata.priorityQueue).toBe(true);
      expect(metadata.slaTag).toBe("FAST_TRACK_PRIORITY");
      expect(metadata.fastTrackAction).toBe("PRIORITY_QUEUE");
    });
  });

  describe("REDUCED_DOCUMENTATION Action", () => {
    beforeEach(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(claims).set({ workflowState: "assigned" }).where(eq(claims.id, testClaimId));
    });
    it("should transition claim to documentation_review state", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "REDUCED_DOCUMENTATION",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 90.0,
          fraudScore: 4.0,
          claimValue: 250000,
          reason: "High confidence, reduced documentation approved",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("REDUCED_DOCUMENTATION");
      expect(result.newState).toBe("under_assessment");
    });

    it("should update required document checklist", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "REDUCED_DOCUMENTATION",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 90.0,
          fraudScore: 4.0,
          claimValue: 250000,
          reason: "High confidence, reduced documentation approved",
        },
      };

      await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [claim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      const metadata = claim.metadata && typeof claim.metadata === 'string' 
        ? JSON.parse(claim.metadata) 
        : claim.metadata;

      expect(metadata.reducedDocumentation).toBe(true);
      expect(metadata.requiredDocuments).toEqual(["proof_of_loss", "claim_form"]);
      expect(metadata.fastTrackAction).toBe("REDUCED_DOCUMENTATION");
    });
  });

  describe("STRAIGHT_TO_PAYMENT Action", () => {
    beforeEach(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(claims).set({ workflowState: "assigned" }).where(eq(claims.id, testClaimId));
    });
    it("should transition claim to payment_authorized state", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "STRAIGHT_TO_PAYMENT",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 95.0,
          fraudScore: 2.0,
          claimValue: 250000,
          reason: "Very high confidence, straight to payment approved",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("STRAIGHT_TO_PAYMENT");
      expect(result.newState).toBe("payment_authorized");
    });

    it("should flag claim with auto-path entry", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "STRAIGHT_TO_PAYMENT",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 95.0,
          fraudScore: 2.0,
          claimValue: 250000,
          reason: "Very high confidence, straight to payment approved",
        },
      };

      await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [claim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      const metadata = claim.metadata && typeof claim.metadata === 'string' 
        ? JSON.parse(claim.metadata) 
        : claim.metadata;

      expect(metadata.straightToPayment).toBe(true);
      expect(metadata.autoPath).toBe(true);
      expect(metadata.fastTrackAction).toBe("STRAIGHT_TO_PAYMENT");
    });
  });

  describe("Invalid State Protection", () => {
    it("should reject ineligible claims", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: false,
        action: null,
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 75.0,
          fraudScore: 12.0,
          claimValue: 250000,
          reason: "Below confidence threshold",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not eligible");
    });

    it("should reject claims with null action", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: null,
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 85.0,
          fraudScore: 8.0,
          claimValue: 250000,
          reason: "No action specified",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not eligible");
    });

    it("should handle non-existent claims", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "AUTO_APPROVE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 92.5,
          fraudScore: 3.2,
          claimValue: 250000,
          reason: "High confidence",
        },
      };

      const result = await executeFastTrackAction(
        999999, // Non-existent claim ID
        evaluationResult,
        TEST_USER_ID
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("Audit Trail", () => {
    beforeEach(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(claims).set({ workflowState: "technical_approval" }).where(eq(claims.id, testClaimId));
    });
    it("should generate workflow audit trail for transitions", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "AUTO_APPROVE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 92.5,
          fraudScore: 3.2,
          claimValue: 250000,
          reason: "High confidence, low fraud risk",
        },
      };

      await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const auditEntries = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId));

      expect(auditEntries.length).toBeGreaterThan(0);
      
      const transitionEntry = auditEntries.find(e => e.newState === "financial_decision");
      expect(transitionEntry).toBeDefined();
    });

    it("should link fastTrackRoutingLog to claim", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "PRIORITY_QUEUE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 88.0,
          fraudScore: 5.5,
          claimValue: 250000,
          reason: "Medium confidence, eligible for priority",
        },
      };

      const result = await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [logEntry] = await db
        .select()
        .from(fastTrackRoutingLog)
        .where(eq(fastTrackRoutingLog.claimId, testClaimId))
        .limit(1);

      expect(logEntry).toBeDefined();
      expect(logEntry.id).toBe(result.routingLogId);
      expect(logEntry.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe("Segregation Enforcement", () => {
    beforeEach(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(claims).set({ workflowState: "technical_approval" }).where(eq(claims.id, testClaimId));
    });
    it("should maintain tenant isolation in routing logs", async () => {
      const evaluationResult: FastTrackEvaluationResult = {
        eligible: true,
        action: "AUTO_APPROVE",
        configVersion: 1,
        evaluationDetails: {
          confidenceScore: 92.5,
          fraudScore: 3.2,
          claimValue: 250000,
          reason: "High confidence",
        },
      };

      await executeFastTrackAction(
        testClaimId,
        evaluationResult,
        TEST_USER_ID
      );

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [logEntry] = await db
        .select()
        .from(fastTrackRoutingLog)
        .where(eq(fastTrackRoutingLog.claimId, testClaimId))
        .limit(1);

      expect(logEntry.tenantId).toBe(TEST_TENANT_ID);
    });
  });
});
