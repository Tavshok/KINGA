/**
 * Workflow Governance Integration Tests
 * 
 * Comprehensive integration tests verifying that all claim state transitions
 * route through the WorkflowEngine with full governance validation.
 * 
 * Tests verify:
 * 1. All transitions create audit trail entries
 * 2. Segregation of duties is enforced
 * 3. Role-based access control is validated
 * 4. Invalid transitions are rejected
 * 5. State consistency is maintained
 */

import { describe, it, expect, beforeEach } from "vitest";
import { transitionClaimState } from "./workflow/integration";
import { getDb } from "./db";
import { claims, workflowAuditTrail, claimInvolvementTracking } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { WorkflowState } from "./workflow/types";

describe("Workflow Governance Integration Tests", () => {
  let testClaimId: number;
  let testUserId: number;
  const testTenantId = "test-tenant";

  beforeEach(async () => {
    // Create a test claim
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [result] = await db.insert(claims).values({
      claimNumber: `TEST-${Date.now()}`,
      claimantId: 1,
      vehicleRegistration: "TEST123",
      vehicleMake: "Test",
      vehicleModel: "Model",
      policyNumber: "POL123",
      incidentType: "collision",
      incidentDate: new Date(),
      workflowState: "created",
      status: "submitted",
      tenantId: testTenantId,
    });

    testClaimId = result.insertId;
    testUserId = 101;
  });

  describe("Audit Trail Logging", () => {
    it("should create audit entry for every state transition", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Perform transition
      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "claims_processor",
        tenantId: testTenantId,
        to: "intake_verified",
        action: "verify_policy",
        comments: "Policy verified successfully",
      });

      expect(result.success).toBe(true);
      expect(result.auditRecordId).toBeGreaterThan(0);

      // Verify audit entry exists
      const auditEntries = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.id, result.auditRecordId!));

      expect(auditEntries).toHaveLength(1);
      const auditEntry = auditEntries[0];

      expect(auditEntry.claimId).toBe(testClaimId);
      expect(auditEntry.userId).toBe(testUserId);
      expect(auditEntry.userRole).toBe("claims_processor");
      expect(auditEntry.previousState).toBe("created");
      expect(auditEntry.newState).toBe("intake_verified");
      expect(auditEntry.comments).toBe("Policy verified successfully");
    });

    it("should log metadata in audit trail", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "claims_processor",
        tenantId: testTenantId,
        to: "intake_verified",
        action: "verify_policy",
        comments: "Verified with AI assistance",
      });

      expect(result.success).toBe(true);

      const [auditEntry] = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.id, result.auditRecordId!));

      expect(auditEntry.metadata).toBeTruthy();
      const metadata = JSON.parse(auditEntry.metadata || "{}");
      expect(metadata.action).toBe("verify_policy");
    });
  });

  describe("Segregation of Duties Validation", () => {
    it("should allow user to perform 2 critical stages", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Stage 1: User performs assessment (first critical stage)
      await db.update(claims)
        .set({ workflowState: "under_assessment" })
        .where(eq(claims.id, testClaimId));

      const result1 = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "assessor_internal",
        tenantId: testTenantId,
        to: "internal_review",
        action: "complete_assessment",
      });

      expect(result1.success).toBe(true);

      // Stage 2: Same user performs technical_approval (second critical stage - ALLOWED)
      await db.update(claims)
        .set({ workflowState: "internal_review" })
        .where(eq(claims.id, testClaimId));

      const result2 = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId, // Same user - allowed for 2nd stage
        userRole: "risk_manager",
        tenantId: testTenantId,
        to: "technical_approval",
        action: "approve_technical",
      });

      expect(result2.success).toBe(true);
    });

    it("should prevent same user from performing 3rd critical stage", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Stage 1: User performs assessment
      await db.update(claims)
        .set({ workflowState: "under_assessment" })
        .where(eq(claims.id, testClaimId));

      const result1 = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "assessor_internal",
        tenantId: testTenantId,
        to: "internal_review",
        action: "complete_assessment",
      });
      expect(result1.success).toBe(true);

      // Stage 2: Same user performs technical_approval
      await db.update(claims)
        .set({ workflowState: "internal_review" })
        .where(eq(claims.id, testClaimId));

      const result2 = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "risk_manager",
        tenantId: testTenantId,
        to: "technical_approval",
        action: "approve_technical",
      });
      expect(result2.success).toBe(true);

      // Stage 3: Try to have same user perform financial_decision (BLOCKED)
      await db.update(claims)
        .set({ workflowState: "technical_approval" })
        .where(eq(claims.id, testClaimId));

      const result3 = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId, // Same user - attempting 3rd stage!
        userRole: "claims_manager",
        tenantId: testTenantId,
        to: "financial_decision",
        action: "approve_financial",
      });

      expect(result3.success).toBe(false);
      expect(result3.errors).toBeDefined();
      expect(result3.errors![0].code).toBe("SEGREGATION_VIOLATION");
    });

    it("should allow different users to perform all critical stages", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // User 101 performs first critical stage
      await db.update(claims)
        .set({ workflowState: "under_assessment" })
        .where(eq(claims.id, testClaimId));

      const result1 = await transitionClaimState({
        claimId: testClaimId,
        userId: 101,
        userRole: "assessor_internal",
        tenantId: testTenantId,
        to: "internal_review",
        action: "complete_assessment",
      });

      expect(result1.success).toBe(true);

      // User 102 performs second critical stage (different user)
      await db.update(claims)
        .set({ workflowState: "internal_review" })
        .where(eq(claims.id, testClaimId));

      const result2 = await transitionClaimState({
        claimId: testClaimId,
        userId: 102, // Different user!
        userRole: "risk_manager",
        tenantId: testTenantId,
        to: "technical_approval",
        action: "approve_technical",
      });

      expect(result2.success).toBe(true);
    });

    it("should track involvement for all critical stages", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Perform transition to critical stage
      await db.update(claims)
        .set({ workflowState: "under_assessment" })
        .where(eq(claims.id, testClaimId));

      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "assessor_internal",
        tenantId: testTenantId,
        to: "internal_review",
        action: "complete_assessment",
      });

      expect(result.success).toBe(true);

      // Verify involvement tracking
      const involvements = await db
        .select()
        .from(claimInvolvementTracking)
        .where(
          and(
            eq(claimInvolvementTracking.claimId, testClaimId),
            eq(claimInvolvementTracking.userId, testUserId)
          )
        );

      expect(involvements.length).toBeGreaterThan(0);
      const involvement = involvements[0];
      expect(involvement.workflowStage).toBe("assessment");
      expect(involvement.actionType).toBe("transition_state");
    });
  });

  describe("Role-Based Access Control", () => {
    it("should reject transition when role is not allowed", async () => {
      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "assessor_internal", // Wrong role for this transition
        tenantId: testTenantId,
        to: "intake_verified", // Only claims_processor can do this
        action: "verify_policy",
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe("ROLE_NOT_ALLOWED");
    });

    it("should allow transition when role is permitted", async () => {
      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "claims_processor", // Correct role
        tenantId: testTenantId,
        to: "intake_verified",
        action: "verify_policy",
      });

      expect(result.success).toBe(true);
    });

    it("should allow executive to move claims to disputed from any state", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Test from multiple states
      const states: WorkflowState[] = ["created", "intake_verified", "assigned", "under_assessment"];

      for (const state of states) {
        // Reset claim to test state
        await db.update(claims)
          .set({ workflowState: state })
          .where(eq(claims.id, testClaimId));

        const result = await transitionClaimState({
          claimId: testClaimId,
          userId: testUserId,
          userRole: "executive",
          tenantId: testTenantId,
          to: "disputed",
          action: "flag_for_investigation",
        });

        expect(result.success).toBe(true);
      }
    });
  });

  describe("Invalid Transition Handling", () => {
    it("should reject invalid state transitions", async () => {
      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "claims_processor",
        tenantId: testTenantId,
        to: "closed", // Cannot go directly from created to closed
        action: "close_claim",
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe("INVALID_TRANSITION");
    });

    it("should reject transition for non-existent claim", async () => {
      const result = await transitionClaimState({
        claimId: 999999, // Non-existent claim
        userId: testUserId,
        userRole: "claims_processor",
        tenantId: testTenantId,
        to: "intake_verified",
        action: "verify_policy",
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe("CLAIM_NOT_FOUND");
    });
  });

  describe("State Machine Consistency", () => {
    it("should maintain claim state on failed transition", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const initialState = "created";

      // Attempt invalid transition
      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "assessor_internal", // Wrong role
        tenantId: testTenantId,
        to: "intake_verified",
        action: "verify_policy",
      });

      expect(result.success).toBe(false);

      // Verify state unchanged
      const [claim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId));

      expect(claim.workflowState).toBe(initialState);
    });

    it("should update claim state on successful transition", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await transitionClaimState({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "claims_processor",
        tenantId: testTenantId,
        to: "intake_verified",
        action: "verify_policy",
      });

      expect(result.success).toBe(true);

      // Verify state changed
      const [claim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId));

      expect(claim.workflowState).toBe("intake_verified");
    });
  });

  describe("Complete Workflow Path", () => {
    it("should enforce complete workflow path with multiple users", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Step 1: Claims processor verifies intake
      const step1 = await transitionClaimState({
        claimId: testClaimId,
        userId: 101,
        userRole: "claims_processor",
        tenantId: testTenantId,
        to: "intake_verified",
        action: "verify_policy",
      });
      expect(step1.success).toBe(true);

      // Step 2: Claims processor assigns to assessor
      const step2 = await transitionClaimState({
        claimId: testClaimId,
        userId: 101,
        userRole: "claims_processor",
        tenantId: testTenantId,
        to: "assigned",
        action: "assign_assessor",
      });
      expect(step2.success).toBe(true);

      // Step 3: Assessor starts assessment
      const step3 = await transitionClaimState({
        claimId: testClaimId,
        userId: 102,
        userRole: "assessor_internal",
        tenantId: testTenantId,
        to: "under_assessment",
        action: "start_assessment",
      });
      expect(step3.success).toBe(true);

      // Step 4: Assessor completes assessment (first critical stage)
      const step4 = await transitionClaimState({
        claimId: testClaimId,
        userId: 102,
        userRole: "assessor_internal",
        tenantId: testTenantId,
        to: "internal_review",
        action: "complete_assessment",
      });
      expect(step4.success).toBe(true);

      // Step 5: User 102 also performs technical_approval (second critical stage for user 102)
      const step5 = await transitionClaimState({
        claimId: testClaimId,
        userId: 102, // Same user as step 4 - now doing 2nd critical stage
        userRole: "risk_manager",
        tenantId: testTenantId,
        to: "technical_approval",
        action: "approve_technical",
      });
      expect(step5.success).toBe(true);

      // Step 6: Attempt financial decision by user 102 (who already did 2 critical stages)
      // This should FAIL because user 102 already performed 2 critical stages (assessment + technical_approval)
      const step6Fail = await transitionClaimState({
        claimId: testClaimId,
        userId: 102, // Same user - attempting 3rd critical stage!
        userRole: "claims_manager",
        tenantId: testTenantId,
        to: "financial_decision",
        action: "approve_financial",
      });
      expect(step6Fail.success).toBe(false);
      expect(step6Fail.errors).toBeDefined();
      expect(step6Fail.errors![0].code).toBe("SEGREGATION_VIOLATION");

      // Step 6 (retry): Claims manager makes financial decision (third critical stage - must be user who hasn't done 2 stages yet)
      const step6 = await transitionClaimState({
        claimId: testClaimId,
        userId: 103, // Different user who hasn't been involved yet!
        userRole: "claims_manager",
        tenantId: testTenantId,
        to: "financial_decision",
        action: "approve_financial",
      });
      expect(step6.success).toBe(true);

      // Verify all audit entries created
      const auditEntries = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId));

      // Should have entries for: 4 non-critical transitions + 3 critical transitions + 1 violation = 8 total
      // But we only care that there's at least 6 (the successful ones + violation)
      expect(auditEntries.length).toBeGreaterThanOrEqual(6);
      
      // Verify violation attempt was logged
      const violationEntries = auditEntries.filter(e => 
        e.metadata && JSON.parse(e.metadata as string).violationAttempt === true
      );
      expect(violationEntries.length).toBe(1);
      expect(violationEntries[0].comments).toContain("SEGREGATION VIOLATION")

      // Verify segregation tracking
      const involvements = await db
        .select()
        .from(claimInvolvementTracking)
        .where(eq(claimInvolvementTracking.claimId, testClaimId));

      // Should have 3 involvement records: user 102 (assessment + technical_approval), user 103 (financial_decision)
      expect(involvements.length).toBe(3);
      
      // Verify user 102 has 2 critical stage involvements
      const user102Involvements = involvements.filter(i => i.userId === 102);
      expect(user102Involvements.length).toBe(2);
      
      // Verify user 103 has 1 critical stage involvement
      const user103Involvements = involvements.filter(i => i.userId === 103);
      expect(user103Involvements.length).toBe(1);
      expect(user103Involvements[0].workflowStage).toBe("financial_decision")
    });
  });
});
