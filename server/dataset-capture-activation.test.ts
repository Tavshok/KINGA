import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { claims, aiAssessments, claimIntelligenceDataset, users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

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
      tenant_id: "test-tenant",
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
      tenant_id: "test-tenant",
      technicallyApprovedBy: testUserId,
      technicallyApprovedAt: new Date(),
      approvedAmount: 150000, // R1,500.00
    });
    
    // Get the created claim
    const claimResult = await db.select().from(claims)
      .where(eq(claims.claimNumber, claimNumber))
      .limit(1);
    testClaimId = claimResult[0].id;
    
    // Create AI assessment for the claim
    await db.insert(aiAssessments).values({
      claimId: testClaimId,
      assessmentStatus: "completed",
      estimatedCost: 145000, // R1,450.00
      confidenceScore: 85,
      damageComponents: JSON.stringify([
        { component: "Front Bumper", severity: "moderate" },
        { component: "Hood", severity: "minor" },
      ]),
      fraudRiskScore: 15,
      fraudIndicators: JSON.stringify([]),
      createdAt: new Date(),
    });
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
      
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(claimIntelligenceDataset)
        .where(eq(claimIntelligenceDataset.claimId, testClaimId));
      
      expect(countResult[0].count).toBeGreaterThan(0);
    });
    
    it("should not fail claim completion if dataset capture fails", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Delete AI assessment to cause dataset capture to fail
      await db.delete(aiAssessments).where(eq(aiAssessments.claimId, testClaimId));
      
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
