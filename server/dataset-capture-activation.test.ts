// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  aiAssessments,
  auditTrail,
  claimEvents,
  claimInvolvementTracking,
  claimIntelligenceDataset,
  claims,
  modelTrainingQueue,
  recoveryCases,
  recoveryCorrespondenceLog,
  users,
  workflowAuditTrail,
} from "../drizzle/schema";
import { eq, inArray, sql } from "drizzle-orm";

describe("Dataset Capture Activation", () => {
  let testClaimId: number;
  let testUserId: number;
  
  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Create test user with stable email
    const testEmail = `test-dataset-${Date.now()}@example.com`;
    await db.insert(users).values({
      openId: `openid-dataset-${Date.now()}`,
      email: testEmail,
      name: "Dataset Test User",
      role: "admin",
      insurerRole: "claims_manager",
      tenantId: "test-tenant",
    });
    
    // Get the created user
    const userResult = await db.select().from(users)
      .where(eq(users.email, testEmail))
      .limit(1);
    testUserId = userResult[0].id;
    
    // Create test claim in repair_in_progress status with approval tracking
    const claimNumber = `CLM-DATASET-${Date.now()}`;
    await db.insert(claims).values({
      claimantId: testUserId,
      claimNumber,
      policyNumber: "POL-TEST-001",
      vehicleRegistration: "ABC123GP",
      incidentDate: new Date(),
      reportedDate: new Date(),
      status: "repair_in_progress",
      tenantId: "test-tenant",
      technicallyApprovedBy: testUserId,
      technicallyApprovedAt: new Date(),
      approvedAmount: 150000, // R1,500.00
    });
    
    // Get the created claim
    const claimResult = await db.select().from(claims)
      .where(eq(claims.claimNumber, claimNumber))
      .limit(1);
    testClaimId = claimResult[0].id;
    
    // Create KINGA assessment for the claim
    await db.insert(aiAssessments).values({
      claimId: testClaimId,
      estimatedCost: 145000, // R1,450.00
      confidenceScore: 85,
      detectedDamageTypes: JSON.stringify(["bumper", "hood"]),
      damagedComponentsJson: JSON.stringify([
        { component: "Front Bumper", severity: "moderate" },
        { component: "Hood", severity: "minor" },
      ]),
      fraudScore: 15,
      fraudRiskLevel: "low",
      fraudIndicators: JSON.stringify([]),
      createdAt: new Date(),
    });
  });

  afterEach(async () => {
    const db = await getDb();
    if (!db || !testClaimId) return;

    const recoveryCaseIds = (await db.select({ id: recoveryCases.id })
      .from(recoveryCases)
      .where(eq(recoveryCases.claimId, testClaimId)))
      .map((row) => row.id);

    await db.delete(modelTrainingQueue).where(eq(modelTrainingQueue.claimId, testClaimId));
    await db.delete(claimIntelligenceDataset).where(eq(claimIntelligenceDataset.claimId, testClaimId));
    await db.delete(claimInvolvementTracking).where(eq(claimInvolvementTracking.claimId, testClaimId));
    await db.delete(workflowAuditTrail).where(eq(workflowAuditTrail.claimId, testClaimId));
    await db.delete(auditTrail).where(eq(auditTrail.claimId, testClaimId));
    await db.delete(claimEvents).where(eq(claimEvents.claimId, testClaimId));
    if (recoveryCaseIds.length > 0) {
      await db.delete(recoveryCorrespondenceLog).where(inArray(recoveryCorrespondenceLog.recoveryCaseId, recoveryCaseIds));
      await db.delete(recoveryCases).where(eq(recoveryCases.claimId, testClaimId));
    }
    await db.delete(aiAssessments).where(eq(aiAssessments.claimId, testClaimId));
    await db.delete(claims).where(eq(claims.id, testClaimId));
    await db.delete(users).where(eq(users.id, testUserId));
  });
  
  describe("Claim Completion with Dataset Capture", () => {
    it("should trigger dataset capture on claim completion", async () => {
      const caller = appRouter.createCaller({
        user: {
          id: testUserId,
          email: "test@example.com",
          role: "admin",
          insurerRole: "claims_manager",
          tenantId: "test-tenant",
        },
      });
      
      // Complete the claim
      const result = await caller.claimCompletion.completeClaim({
        claimId: testClaimId,
      });
      
      expect(result.success).toBe(true);
      
      // Verify dataset was captured by checking count
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(claimIntelligenceDataset)
        .where(eq(claimIntelligenceDataset.claimId, testClaimId));
      
      expect(countResult[0].count).toBeGreaterThan(0);
    });
    
    it("should populate intelligence fields in dataset", async () => {
      const caller = appRouter.createCaller({
        user: {
          id: testUserId,
          email: "test@example.com",
          role: "admin",
          insurerRole: "claims_manager",
          tenantId: "test-tenant",
        },
      });
      
      // Complete the claim
      await caller.claimCompletion.completeClaim({
        claimId: testClaimId,
      });
      
      // Verify dataset was captured
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [dataset] = await db.select()
        .from(claimIntelligenceDataset)
        .where(eq(claimIntelligenceDataset.claimId, testClaimId));
      
      expect(dataset).toMatchObject({
        claimId: testClaimId,
        tenantId: "test-tenant",
        aiEstimatedCost: 145000,
        finalFraudOutcome: "legitimate",
      });
    });
    
    it("should not fail claim completion if dataset capture fails", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Reset claim state to repair_in_progress for this test
      await db.update(claims).set({ status: "repair_in_progress" }).where(eq(claims.id, testClaimId));
      // Keep the assessment required by the workflow, but corrupt only its owned
      // dataset field so capture fails after the governance transition succeeds.
      await db.update(aiAssessments)
        .set({ detectedDamageTypes: "{not-valid-json" })
        .where(eq(aiAssessments.claimId, testClaimId));
      
      const caller = appRouter.createCaller({
        user: {
          id: testUserId,
          email: "test@example.com",
          role: "admin",
          insurerRole: "claims_manager",
          tenantId: "test-tenant",
        },
      });
      
      // Complete the claim - should succeed despite dataset capture failure
      const result = await caller.claimCompletion.completeClaim({
        claimId: testClaimId,
      });
      
      expect(result.success).toBe(true);
      
      // Verify claim is completed
      const updatedClaim = await db.select()
        .from(claims)
        .where(eq(claims.id, testClaimId))
        .limit(1);
      
      expect(updatedClaim[0].status).toBe("completed");
      expect(updatedClaim[0].closedBy).toBe(testUserId);
      expect(updatedClaim[0].closedAt).toBeDefined();

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(claimIntelligenceDataset)
        .where(eq(claimIntelligenceDataset.claimId, testClaimId));
      expect(countResult[0].count).toBe(0);
    });
    
    it("should only capture dataset on successful completion", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Set claim to invalid status for completion
      await db.update(claims).set({
        status: "submitted",
      }).where(eq(claims.id, testClaimId));
      
      const caller = appRouter.createCaller({
        user: {
          id: testUserId,
          email: "test@example.com",
          role: "admin",
          insurerRole: "claims_manager",
          tenantId: "test-tenant",
        },
      });
      
      // Attempt to complete the claim - should fail
      await expect(
        caller.claimCompletion.completeClaim({
          claimId: testClaimId,
        })
      ).rejects.toThrow();
      
      // Verify no dataset was captured
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(claimIntelligenceDataset)
        .where(eq(claimIntelligenceDataset.claimId, testClaimId));
      
      expect(countResult[0].count).toBe(0);
    });
  });
});
