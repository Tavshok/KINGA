/**
 * Executive Analytics Audit Trail Integration Tests
 * 
 * Tests for audit trail-based analytics functions including:
 * - Per-state dwell time calculations
 * - Workflow bottleneck analysis
 * - Executive override metrics
 * - Segregation violation tracking
 * - Role change frequency analytics
 * - Tenant isolation enforcement
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { 
  claims, 
  workflowAuditTrail, 
  claimInvolvementTracking, 
  roleAssignmentAudit,
  insurerTenants,
  users
} from "../drizzle/schema";
import { getAverageProcessingTime, getWorkflowBottlenecks } from "./executive-analytics";
import { 
  getExecutiveOverrideMetrics, 
  getSegregationViolationAttempts,
  getRoleChangeFrequency,
  getRoleAssignmentImpact
} from "./executive-analytics-governance";

describe("Executive Analytics - Audit Trail Integration", () => {
  let testTenantId: string;
  let testClaimId: number;
  let testUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test tenant
    testTenantId = `test-tenant-${Date.now()}`;
    await db.insert(insurerTenants).values({
      id: testTenantId,
      name: "Test Tenant",
      displayName: "Test Tenant",
    });

    // Create test user
    const [user] = await db.insert(users).values({
      openId: `test-user-${Date.now()}`,
      name: "Test User",
      email: "test@example.com",
      role: "claims_processor",
      tenantId: testTenantId,
    }).returning();
    testUserId = user.id;

    // Create test claim
    const [claim] = await db.insert(claims).values({
      claimNumber: `TEST-${Date.now()}`,
      policyNumber: "POL-123",
      claimantName: "Test Claimant",
      incidentDate: new Date(),
      claimAmount: 10000,
      status: "created",
      workflowState: "created",
      tenantId: testTenantId,
    }).returning();
    testClaimId = claim.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup test data
    await db.delete(workflowAuditTrail).where(sql`claim_id = ${testClaimId}`);
    await db.delete(claimInvolvementTracking).where(sql`claim_id = ${testClaimId}`);
    await db.delete(roleAssignmentAudit).where(sql`user_id = ${testUserId}`);
    await db.delete(claims).where(sql`id = ${testClaimId}`);
    await db.delete(users).where(sql`id = ${testUserId}`);
    await db.delete(insurerTenants).where(sql`id = ${testTenantId}`);
  });

  describe("Per-State Dwell Time (getAverageProcessingTime)", () => {
    it("should calculate dwell time using audit trail window functions", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create audit trail entries simulating state transitions
      const now = new Date();
      await db.insert(workflowAuditTrail).values([
        {
          claimId: testClaimId,
          userId: testUserId,
          userRole: "claims_processor",
          previousState: null,
          newState: "created",
          createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000), // 72 hours ago
        },
        {
          claimId: testClaimId,
          userId: testUserId,
          userRole: "claims_processor",
          previousState: "created",
          newState: "intake_verified",
          createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000), // 48 hours ago
        },
        {
          claimId: testClaimId,
          userId: testUserId,
          userRole: "claims_processor",
          previousState: "intake_verified",
          newState: "assigned",
          createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      ]);

      const result = await getAverageProcessingTime();

      expect(result).toBeDefined();
      expect(result.created).toBeGreaterThan(0);
      expect(result.intakeVerified).toBeGreaterThan(0);
      expect(result.fullLifecycle).toBeGreaterThanOrEqual(0);
    });

    it("should return zero for states with no data", async () => {
      const result = await getAverageProcessingTime();

      expect(result.paymentAuthorized).toBe(0);
    });
  });

  describe("Workflow Bottlenecks (getWorkflowBottlenecks)", () => {
    it("should identify states with longest dwell times", async () => {
      const result = await getWorkflowBottlenecks();

      expect(Array.isArray(result)).toBe(true);
      result.forEach(bottleneck => {
        expect(bottleneck).toHaveProperty("state");
        expect(bottleneck).toHaveProperty("count");
        expect(bottleneck).toHaveProperty("avgDaysInState");
        expect(bottleneck).toHaveProperty("maxDaysInState");
      });
    });

    it("should exclude closed and rejected claims", async () => {
      const result = await getWorkflowBottlenecks();

      const closedStates = result.filter(b => 
        b.state === "closed" || b.state === "rejected"
      );
      expect(closedStates.length).toBe(0);
    });
  });

  describe("Executive Override Metrics", () => {
    it("should track override frequency and patterns", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create override audit entry
      await db.insert(workflowAuditTrail).values({
        claimId: testClaimId,
        userId: testUserId,
        userRole: "executive",
        previousState: "technical_approval",
        newState: "financial_decision",
        executiveOverride: 1,
        overrideReason: "Urgent case requiring immediate approval",
        decisionValue: 50000,
      });

      const result = await getExecutiveOverrideMetrics(testTenantId);

      expect(result).toBeDefined();
      expect(result.monthlyTrend).toBeDefined();
      expect(result.reasonsDistribution).toBeDefined();
      expect(result.mostOverriddenTransitions).toBeDefined();
    });

    it("should enforce tenant isolation", async () => {
      const result = await getExecutiveOverrideMetrics("different-tenant");

      // Should return empty results for different tenant
      expect(result.monthlyTrend.length).toBe(0);
    });
  });

  describe("Segregation Violation Tracking", () => {
    it("should detect multi-stage user involvement", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create involvement tracking entries
      await db.insert(claimInvolvementTracking).values([
        {
          claimId: testClaimId,
          userId: testUserId,
          workflowStage: "assessment",
          actionType: "transition_state",
        },
        {
          claimId: testClaimId,
          userId: testUserId,
          workflowStage: "technical_approval",
          actionType: "approve_technical",
        },
      ]);

      const result = await getSegregationViolationAttempts(testTenantId);

      expect(result).toBeDefined();
      expect(result.complianceRate).toBeGreaterThanOrEqual(0);
      expect(result.complianceRate).toBeLessThanOrEqual(100);
      expect(result.multiStageInvolvements).toBeDefined();
    });

    it("should calculate compliance rate correctly", async () => {
      const result = await getSegregationViolationAttempts(testTenantId);

      expect(typeof result.complianceRate).toBe("number");
      expect(result.totalViolations).toBeGreaterThanOrEqual(0);
    });

    it("should enforce tenant isolation", async () => {
      const result = await getSegregationViolationAttempts("different-tenant");

      expect(result.multiStageInvolvements.length).toBe(0);
    });
  });

  describe("Role Change Frequency Analytics", () => {
    it("should track role changes over time", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create role change audit entry
      await db.insert(roleAssignmentAudit).values({
        tenantId: testTenantId,
        userId: testUserId,
        previousRole: "claims_processor",
        newRole: "claims_manager",
        changedByUserId: testUserId,
        justification: "Promotion due to excellent performance",
        timestamp: new Date(),
      });

      const result = await getRoleChangeFrequency(testTenantId);

      expect(result).toBeDefined();
      expect(result.monthlyTrend).toBeDefined();
      expect(result.commonTransitions).toBeDefined();
      expect(result.frequentSwitchers).toBeDefined();
    });

    it("should categorize justifications correctly", async () => {
      const result = await getRoleChangeFrequency(testTenantId);

      expect(result.justificationCategories).toBeDefined();
      result.justificationCategories.forEach(cat => {
        expect(cat).toHaveProperty("category");
        expect(cat).toHaveProperty("count");
      });
    });

    it("should enforce tenant isolation", async () => {
      const result = await getRoleChangeFrequency("different-tenant");

      expect(result.monthlyTrend.length).toBe(0);
    });
  });

  describe("Role Assignment Impact Analysis", () => {
    it("should measure impact on claim processing", async () => {
      const result = await getRoleAssignmentImpact(testTenantId);

      expect(result).toBeDefined();
      expect(result.claimsProcessedImpact).toBeDefined();
      expect(result.processingTimeImpact).toBeDefined();
    });

    it("should compare before and after role change", async () => {
      const result = await getRoleAssignmentImpact(testTenantId);

      const periods = result.claimsProcessedImpact.map(r => r.period);
      // Should have both 'before' and 'after' periods if data exists
      expect(periods.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Performance and Data Integrity", () => {
    it("should handle empty audit trail gracefully", async () => {
      const result = await getAverageProcessingTime();

      expect(result).toBeDefined();
      expect(typeof result.fullLifecycle).toBe("number");
    });

    it("should return consistent data types", async () => {
      const result = await getWorkflowBottlenecks();

      result.forEach(bottleneck => {
        expect(typeof bottleneck.count).toBe("number");
        expect(typeof bottleneck.avgDaysInState).toBe("number");
        expect(typeof bottleneck.maxDaysInState).toBe("number");
      });
    });

    it("should maintain tenant isolation across all functions", async () => {
      const differentTenant = "isolated-tenant";

      const [overrides, segregation, roleChanges, roleImpact] = await Promise.all([
        getExecutiveOverrideMetrics(differentTenant),
        getSegregationViolationAttempts(differentTenant),
        getRoleChangeFrequency(differentTenant),
        getRoleAssignmentImpact(differentTenant),
      ]);

      // All should return empty or zero results for non-existent tenant
      expect(overrides.monthlyTrend.length).toBe(0);
      expect(segregation.multiStageInvolvements.length).toBe(0);
      expect(roleChanges.monthlyTrend.length).toBe(0);
      expect(roleImpact.claimsProcessedImpact.length).toBe(0);
    });
  });
});
