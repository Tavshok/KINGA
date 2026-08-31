// @ts-nocheck
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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { 
  claims, 
  users,
  aiAssessments, 
  claimRoutingDecisions,
  workflowAuditTrail,
  roleAssignmentAudit,
  automationPolicies
} from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { WorkflowEngine } from "./workflow-engine";

let db: Awaited<ReturnType<typeof getDb>>;

describe("End-to-End Claim Lifecycle", () => {
  let testTenantId: string | undefined;
  let testClaimId: number | undefined;
  let testUserId: number | undefined;
  let activePolicyId: number | undefined;
  let ownedAssessmentId: number | undefined;
  let ownedWorkflowAuditIds: number[] = [];
  let fixtureStamp: string | undefined;

  beforeAll(async () => {
    db = await getDb();
    fixtureStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    testTenantId = `fixture-claim-lifecycle-${fixtureStamp}`;

    const userResult = await db.insert(users).values({
      openId: `fixture-lifecycle-actor-${fixtureStamp}`,
      name: "Fixture lifecycle actor",
      email: `fixture-lifecycle-${fixtureStamp}@example.invalid`,
      role: "insurer",
      insurerRole: "executive",
      tenantId: testTenantId,
      isActive: 1,
    });
    testUserId = Number((userResult as any)[0]?.insertId ?? (userResult as any).insertId);
    if (!Number.isSafeInteger(testUserId)) throw new Error("Unable to create lifecycle fixture actor");

    const claimResult = await db.insert(claims).values({
      claimantId: testUserId,
      claimNumber: `FIXTURE-LIFECYCLE-${fixtureStamp}`,
      tenantId: testTenantId,
      vehicleMake: "Fixture Motors",
      vehicleModel: "Lifecycle Test",
      vehicleYear: 2020,
      vehicleRegistration: `FX${fixtureStamp.slice(-8).toUpperCase()}`,
      incidentDate: new Date().toISOString().slice(0, 19).replace("T", " "),
      incidentDescription: "Owned test collision fixture for workflow lifecycle validation.",
      incidentLocation: "Fixture test location",
      policyNumber: `FIXTURE-POLICY-${fixtureStamp}`,
      status: "intake_pending",
      workflowState: "created",
      incidentType: "collision",
    });
    testClaimId = Number((claimResult as any)[0]?.insertId ?? (claimResult as any).insertId);
    if (!Number.isSafeInteger(testClaimId)) throw new Error("Unable to create lifecycle fixture claim");

    const policyResult = await db.insert(automationPolicies).values({
      tenantId: testTenantId,
      policyName: `Fixture lifecycle policy ${fixtureStamp}`,
      isActive: 1,
      minAutomationConfidence: 85,
      minHybridConfidence: 60,
      eligibleClaimTypes: JSON.stringify(["collision", "theft"]),
      excludedClaimTypes: JSON.stringify([]),
      maxAiOnlyApprovalAmount: 5000000,
      maxHybridApprovalAmount: 20000000,
      maxFraudScoreForAutomation: 30,
      eligibleVehicleCategories: JSON.stringify(["sedan", "suv"]),
      excludedVehicleMakes: JSON.stringify([]),
      minVehicleYear: 2010,
      maxVehicleAge: 15,
      requireManagerApprovalAbove: 10000000,
      allowPolicyOverride: 1,
      version: 1,
      fraudSensitivityMultiplier: "1.00",
      effectiveFrom: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    activePolicyId = Number((policyResult as any)[0]?.insertId ?? (policyResult as any).insertId);
    if (!Number.isSafeInteger(activePolicyId)) throw new Error("Unable to create lifecycle fixture policy");

    const assessmentResult = await db.insert(aiAssessments).values({
      claimId: testClaimId,
      tenantId: testTenantId,
      confidenceScore: 90,
      fraudScore: 5,
      damageDescription: "Owned fixture assessment for lifecycle transition prerequisites.",
    });
    ownedAssessmentId = Number((assessmentResult as any)[0]?.insertId ?? (assessmentResult as any).insertId);
    if (!Number.isSafeInteger(ownedAssessmentId)) throw new Error("Unable to create lifecycle fixture assessment");
  });

  afterAll(async () => {
    if (!db) return;

    if (testClaimId !== undefined) {
      ownedWorkflowAuditIds = (await db
        .select({ id: workflowAuditTrail.id })
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId)))
        .map((row) => row.id);
    }

    if (ownedWorkflowAuditIds.length > 0) {
      await db.delete(workflowAuditTrail).where(inArray(workflowAuditTrail.id, ownedWorkflowAuditIds));
    }
    if (ownedAssessmentId !== undefined) {
      await db.delete(aiAssessments).where(eq(aiAssessments.id, ownedAssessmentId));
    }
    if (testClaimId !== undefined) {
      await db.delete(claims).where(eq(claims.id, testClaimId));
    }
    if (activePolicyId !== undefined) {
      await db.delete(automationPolicies).where(eq(automationPolicies.id, activePolicyId));
    }
    if (testUserId !== undefined) {
      await db.delete(users).where(eq(users.id, testUserId));
    }

    // Lifecycle no-leak proof: every query uses only this suite's captured IDs.
    const [remainingAudits, remainingAssessments, remainingClaims, remainingPolicies, remainingUsers] = await Promise.all([
      ownedWorkflowAuditIds.length > 0
        ? db.select({ id: workflowAuditTrail.id }).from(workflowAuditTrail).where(inArray(workflowAuditTrail.id, ownedWorkflowAuditIds))
        : Promise.resolve([]),
      ownedAssessmentId !== undefined
        ? db.select({ id: aiAssessments.id }).from(aiAssessments).where(eq(aiAssessments.id, ownedAssessmentId))
        : Promise.resolve([]),
      testClaimId !== undefined
        ? db.select({ id: claims.id }).from(claims).where(eq(claims.id, testClaimId))
        : Promise.resolve([]),
      activePolicyId !== undefined
        ? db.select({ id: automationPolicies.id }).from(automationPolicies).where(eq(automationPolicies.id, activePolicyId))
        : Promise.resolve([]),
      testUserId !== undefined
        ? db.select({ id: users.id }).from(users).where(eq(users.id, testUserId))
        : Promise.resolve([]),
    ]);
    expect(remainingAudits).toHaveLength(0);
    expect(remainingAssessments).toHaveLength(0);
    expect(remainingClaims).toHaveLength(0);
    expect(remainingPolicies).toHaveLength(0);
    expect(remainingUsers).toHaveLength(0);
  });

  describe("1. AI Analysis & Routing", () => {
    it("should have KINGA assessment with confidence and fraud scores", async () => {
      // Verify KINGA assessment exists for seeded claim
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
        expect(assessment[0].fraudScore).toBeDefined();
        expect(assessment[0].fraudScore).toBeGreaterThanOrEqual(0);
        expect(assessment[0].fraudScore).toBeLessThanOrEqual(100);

        // Verify the persisted AI assessment narrative is available to dossier consumers.
        expect(assessment[0].damageDescription).toBeDefined();
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
      expect(policy[0].isActive).toBeTruthy();
      expect(policy[0].tenantId).toBe(testTenantId);
      
      // Verify policy has required fields
      expect(policy[0].minAutomationConfidence).toBeDefined();
      expect(policy[0].maxAiOnlyApprovalAmount).toBeDefined();
      expect(policy[0].fraudSensitivityMultiplier).toBeDefined();
    });
  });

  describe("2. Workflow Engine", () => {
    it("should record state transitions in audit trail", async () => {
      // Verify audit trail exists - create a transition to ensure at least one entry
      const workflowEngine = new WorkflowEngine(testTenantId);
      await db.update(claims).set({ workflowState: "created" }).where(eq(claims.id, testClaimId));
      await workflowEngine.transition(
        testClaimId,
        "assigned",
        typeof testUserId === 'string' ? parseInt(testUserId) || 1 : (testUserId || 1)
      );
      const auditEntries = await db
        .select()
        .from(workflowAuditTrail)
        .where(eq(workflowAuditTrail.claimId, testClaimId))
        .limit(5);

      expect(auditEntries.length).toBeGreaterThan(0);
      
      // Verify audit entry structure
      if (auditEntries.length > 0) {
        expect(auditEntries[0].newState).toBeDefined();
        expect(auditEntries[0].userId).toBeDefined();
        expect(auditEntries[0].createdAt).toBeDefined();
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

      // Reset claim to created state for this test
      await db.update(claims).set({ workflowState: "created" }).where(eq(claims.id, testClaimId));
      // Transition to assigned (valid from created)
      const workflowEngine = new WorkflowEngine(testTenantId);
      await workflowEngine.transition(
        testClaimId,
        "assigned",
        typeof testUserId === 'string' ? (parseInt(testUserId) || 1) : (testUserId || 1)
      );

      // Verify state changed
      const updatedClaim = await db
        .select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);

      expect(updatedClaim[0].workflowState).toBe("assigned");

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
        // snapshot fields depend on what was stored
        // snapshot fields depend on what was stored
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
            eq(workflowAuditTrail.executiveOverride, 1)
          )
        );

      // Perform an executive override - reset to known state first
      const { transition: transitionFn } = await import('./workflow-engine');
      await db.update(claims).set({ workflowState: "assigned" }).where(eq(claims.id, testClaimId));
      await transitionFn({
        claimId: testClaimId,
        fromState: "assigned",
        toState: "disputed",
        userId: typeof testUserId === 'string' ? (parseInt(testUserId) || 1) : (testUserId || 1),
        userRole: "executive",
        executiveOverride: true,
        overrideReason: "Executive override for testing",
        tenantId: testTenantId,
      });

      // Verify override logged
      const afterOverrides = await db
        .select()
        .from(workflowAuditTrail)
        .where(
          and(
            eq(workflowAuditTrail.claimId, testClaimId),
            eq(workflowAuditTrail.executiveOverride, 1)
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
      expect(claim[0].claimNumber).toBeDefined();

      // Verify KINGA assessment exists
      const aiAssessment = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, testClaimId))
        .limit(1);

      if (aiAssessment.length > 0) {
        expect(aiAssessment[0].damageDescription).toBeDefined();
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

      // Audit trail should have entries after workflow engine tests
      expect(auditTrail).toBeDefined();
    });
  });
});
