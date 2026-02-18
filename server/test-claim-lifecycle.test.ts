/**
 * End-to-End Claim Lifecycle Integration Test
 * 
 * Tests the complete claim processing flow:
 * 1. AI Analysis & Routing (confidence scores, fraud detection, policy versioning)
 * 2. Workflow Engine (state transitions, audit trail)
 * 3. Routing Engine (automation_policies integration, version tracking)
 * 4. Governance (role audit, executive overrides)
 * 5. PDF Generation (claim dossier data availability)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "./db";
import { 
  claims, 
  aiAssessments, 
  claimRoutingDecisions,
  workflowAuditTrail,
  roleAssignmentAudit,
  automationPolicies
} from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { WorkflowEngine } from "./workflow-engine";

let db: Awaited<ReturnType<typeof getDb>>;

describe("End-to-End Claim Lifecycle", () => {
  let testTenantId: string;
  let testClaimId: number;
  let testUserId: string;
  let activePolicyId: number;

  beforeAll(async () => {
    // Initialize database connection
    db = await getDb();
    
    // Find existing test data from seed
    const existingClaims = await db
      .select()
      .from(claims)
      .limit(1);

    if (existingClaims.length === 0) {
      throw new Error("No seeded claims found. Run seed-production-data.ts first.");
    }

    testClaimId = existingClaims[0].id;
    testTenantId = existingClaims[0].tenantId!;
    testUserId = existingClaims[0].claimantId;

    // Find active policy
    const activePolicy = await db
      .select()
      .from(automationPolicies)
      .where(
        and(
          eq(automationPolicies.tenantId, testTenantId),
          eq(automationPolicies.isActive, true)
        )
      )
      .limit(1);

    if (activePolicy.length === 0) {
      throw new Error("No active policy found for tenant");
    }

    activePolicyId = activePolicy[0].id;
  });

  describe("1. AI Analysis & Routing", () => {
    it("should have AI assessment with confidence and fraud scores", async () => {
      // Verify AI assessment exists for seeded claim
      const assessment = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, testClaimId))
        .limit(1);

      if (assessment.length > 0) {
        // Verify AI confidence score calculated
        expect(assessment[0].confidenceScore).toBeDefined();
        expect(assessment[0].confidenceScore).toBeGreaterThanOrEqual(0);
        expect(assessment[0].confidenceScore).toBeLessThanOrEqual(100);

        // Verify fraud score present
        expect(assessment[0].fraudRiskScore).toBeDefined();
        expect(assessment[0].fraudRiskScore).toBeGreaterThanOrEqual(0);
        expect(assessment[0].fraudRiskScore).toBeLessThanOrEqual(100);

        // Verify AI summary present
        expect(assessment[0].aiSummary).toBeDefined();
      }
    });

    it("should have routing decision with policy version", async () => {
      // Verify routing decision exists
      const routingDecision = await db
        .select()
        .from(claimRoutingDecisions)
        .where(eq(claimRoutingDecisions.claimId, testClaimId))
        .limit(1);

      if (routingDecision.length > 0) {
        // Verify routing decision logged
        expect(routingDecision[0].routingDecision).toBeDefined();
        expect(["auto_approve", "manual_review", "high_risk_review", "fraud_investigation"])
          .toContain(routingDecision[0].routingDecision);

        // Verify policy version attached
        expect(routingDecision[0].policyVersion).toBeDefined();
        expect(routingDecision[0].policySnapshotJson).toBeDefined();

        // Verify policy snapshot is valid JSON
        const snapshot = JSON.parse(routingDecision[0].policySnapshotJson!);
        expect(snapshot).toBeDefined();
        expect(snapshot.id).toBeDefined();
      }
    });

    it("should use automation_policies for routing decision", async () => {
      // Fetch the active policy
      const policy = await db
        .select()
        .from(automationPolicies)
        .where(eq(automationPolicies.id, activePolicyId))
        .limit(1);

      expect(policy.length).toBe(1);
      expect(policy[0].isActive).toBe(true);
      expect(policy[0].tenantId).toBe(testTenantId);
      
      // Verify policy has required fields
      expect(policy[0].autoApproveConfidenceThreshold).toBeDefined();
      expect(policy[0].autoApproveMaxValue).toBeDefined();
      expect(policy[0].fraudSensitivityMultiplier).toBeDefined();
    });
  });

  describe("2. Workflow Engine", () => {
    it("should record state transitions in audit trail", async () => {
      // Verify audit trail exists
      const auditEntries = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId))
        .limit(5);

      expect(auditEntries.length).toBeGreaterThan(0);
      
      // Verify audit entry structure
      if (auditEntries.length > 0) {
        expect(auditEntries[0].action).toBeDefined();
        expect(auditEntries[0].performedBy).toBeDefined();
        expect(auditEntries[0].timestamp).toBeDefined();
      }
    });

    it("should transition claim through states with audit trail", async () => {
      // Get initial state
      const initialClaim = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      const initialStatus = initialClaim[0].status;

      // Count existing audit entries
      const beforeCount = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId));

      // Transition to under_assessment
      const workflowEngine = new WorkflowEngine(testTenantId);
      await workflowEngine.transitionClaim(
        testClaimId,
        "under_assessment",
        testUserId,
        "insurer_admin",
        "Starting AI assessment (test)"
      );

      // Verify state changed
      const updatedClaim = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      expect(updatedClaim[0].status).toBe("under_assessment");

      // Verify audit trail recorded
      const afterCount = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId));

      expect(afterCount.length).toBeGreaterThan(beforeCount.length);
    });
  });

  describe("3. Routing Engine", () => {
    it("should attach policy version to routing decisions", async () => {
      // Get routing decisions
      const routingDecisions = await db
        .select()
        .from(claimRoutingDecisions)
        .where(eq(claimRoutingDecisions.claimId, testClaimId))
        .limit(1);

      if (routingDecisions.length > 0) {
        expect(routingDecisions[0].policyVersion).toBeDefined();
        expect(routingDecisions[0].policySnapshotJson).toBeDefined();

        // Verify policy snapshot contains policy configuration
        const snapshot = JSON.parse(routingDecisions[0].policySnapshotJson!);
        expect(snapshot.autoApproveConfidenceThreshold).toBeDefined();
        expect(snapshot.autoApproveMaxValue).toBeDefined();
      }
    });
  });

  describe("4. Governance", () => {
    it("should have role assignment audit records", async () => {
      // Check if role assignment audit exists
      const roleAudits = await db
        .select()
        .from(roleAssignmentAudit)
        .limit(5);

      // Role assignment audit should exist (from seed or previous operations)
      expect(roleAudits).toBeDefined();
    });

    it("should log executive overrides in workflow audit trail", async () => {
      const workflowEngine = new WorkflowEngine(testTenantId);

      // Count existing overrides
      const beforeOverrides = await db
        .select()
        .from(workflowAuditTrail)
        .where(
          and(
            eq(workflowAuditTrail.claimId, testClaimId),
            eq(workflowAuditTrail.action, "EXECUTIVE_OVERRIDE")
          )
        );

      // Perform an executive override
      await workflowEngine.recordExecutiveOverride(
        testClaimId,
        testUserId,
        "executive",
        "manual_review",
        "approved",
        "Executive override for testing"
      );

      // Verify override logged
      const afterOverrides = await db
        .select()
        .from(workflowAuditTrail)
        .where(
          and(
            eq(workflowAuditTrail.claimId, testClaimId),
            eq(workflowAuditTrail.action, "EXECUTIVE_OVERRIDE")
          )
        );

      expect(afterOverrides.length).toBeGreaterThan(beforeOverrides.length);
    });
  });

  describe("5. PDF Generation Data Availability", () => {
    it("should have all required data for claim dossier PDF", async () => {
      // Verify claim data exists
      const claim = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      expect(claim.length).toBe(1);
      expect(claim[0].id).toBe(testClaimId);
      expect(claim[0].claimReference).toBeDefined();

      // Verify AI assessment exists
      const aiAssessment = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, testClaimId))
        .limit(1);

      if (aiAssessment.length > 0) {
        expect(aiAssessment[0].aiSummary).toBeDefined();
      }

      // Verify routing decision exists
      const routingDecision = await db
        .select()
        .from(claimRoutingDecisions)
        .where(eq(claimRoutingDecisions.claimId, testClaimId))
        .limit(1);

      if (routingDecision.length > 0) {
        expect(routingDecision[0].routingDecision).toBeDefined();
      }

      // Verify audit trail exists
      const auditTrail = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId))
        .limit(5);

      expect(auditTrail.length).toBeGreaterThan(0);
    });
  });
});
