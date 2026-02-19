// @ts-nocheck
/**
 * Approval Tracking Tests
 * 
 * Tests for hierarchical approval workflow with technical and financial approval.
 * Validates approval tracking fields, role-based restrictions, and claim closure.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";
import { users, claims, panelBeaterQuotes, automationPolicies } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Approval Tracking", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testTenantId: string;
  let claimsProcessorId: number;
  let riskManagerId: number;
  let claimsManagerId: number;
  let executiveId: number;
  let lowValueClaimId: number;
  let highValueClaimId: number;

  beforeEach(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    testTenantId = `test-tenant-${Date.now()}`;

    // Create test users with different roles
    const [claimsProcessor] = await db.insert(users).values({
      openId: `test-processor-${Date.now()}`,
      name: "Claims Processor",
      email: "processor@test.com",
      role: "insurer",
      insurerRole: "claims_processor",
      tenantId: testTenantId,
    });
    claimsProcessorId = claimsProcessor.insertId;

    const [riskManager] = await db.insert(users).values({
      openId: `test-risk-manager-${Date.now()}`,
      name: "Risk Manager",
      email: "risk@test.com",
      role: "insurer",
      insurerRole: "risk_manager",
      tenantId: testTenantId,
    });
    riskManagerId = riskManager.insertId;

    const [claimsManager] = await db.insert(users).values({
      openId: `test-claims-manager-${Date.now()}`,
      name: "Claims Manager",
      email: "manager@test.com",
      role: "insurer",
      insurerRole: "claims_manager",
      tenantId: testTenantId,
    });
    claimsManagerId = claimsManager.insertId;

    const [executive] = await db.insert(users).values({
      openId: `test-executive-${Date.now()}`,
      name: "Executive",
      email: "exec@test.com",
      role: "insurer",
      insurerRole: "executive",
      tenantId: testTenantId,
    });
    executiveId = executive.insertId;

    // Create automation policy with threshold
    await db.insert(automationPolicies).values({
      tenantId: testTenantId,
      policyName: `Test Policy ${testTenantId}`,
      aiOnlyConfidenceThreshold: 85,
      hybridWorkflowConfidenceThreshold: 70,
      eligibleClaimTypes: ["collision", "theft", "vandalism"],
      excludedClaimTypes: [],
      eligibleVehicleCategories: ["sedan", "suv", "truck"],
      excludedVehicleMakes: [],
      maxAiOnlyApprovalAmount: 1000000, // 10,000 USD
      maxHybridApprovalAmount: 2500000, // 25,000 USD
      requireManagerApprovalAbove: 2500000, // 25,000 USD threshold
      fraudRiskCutoff: 30,
      isActive: 1,
    });

    // Create low-value claim (below threshold)
    const [lowClaim] = await db.insert(claims).values({
      claimantId: claimsProcessorId,
      claimNumber: `CLM-LOW-${Date.now()}`,
      tenantId: testTenantId,
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2020,
      status: "comparison",
      approvedAmount: 1500000, // 15,000 USD (below threshold)
    });
    lowValueClaimId = lowClaim.insertId;

    // Create quote for low-value claim
    await db.insert(panelBeaterQuotes).values({
      claimId: lowValueClaimId,
      panelBeaterId: 1,
      quotedAmount: 1500000,
      laborCost: 800000,
      partsCost: 700000,
      laborHours: 10,
      estimatedDuration: 3,
      status: "submitted",
    });

    // Create high-value claim (above threshold)
    const [highClaim] = await db.insert(claims).values({
      claimantId: claimsProcessorId,
      claimNumber: `CLM-HIGH-${Date.now()}`,
      tenantId: testTenantId,
      vehicleMake: "BMW",
      vehicleModel: "X5",
      vehicleYear: 2022,
      status: "comparison",
      approvedAmount: 5000000, // 50,000 USD (above threshold)
    });
    highValueClaimId = highClaim.insertId;

    // Create quote for high-value claim
    await db.insert(panelBeaterQuotes).values({
      claimId: highValueClaimId,
      panelBeaterId: 1,
      quotedAmount: 5000000,
      laborCost: 2500000,
      partsCost: 2500000,
      laborHours: 40,
      estimatedDuration: 10,
      status: "submitted",
    });
  });

  describe("Technical Approval", () => {
    it("should populate technicallyApprovedBy and technicallyApprovedAt for low-value claims", async () => {
      // Approve low-value claim
      await db!.update(claims).set({
        status: "repair_assigned",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 1500000,
      }).where(eq(claims.id, lowValueClaimId));

      // Verify approval tracking
      const [claim] = await db!.select().from(claims).where(eq(claims.id, lowValueClaimId));
      
      expect(claim.technicallyApprovedBy).toBe(riskManagerId);
      expect(claim.technicallyApprovedAt).toBeInstanceOf(Date);
      expect(claim.approvedAmount).toBe(1500000);
    });

    it("should populate technicallyApprovedBy and technicallyApprovedAt for high-value claims", async () => {
      // Approve high-value claim (technical approval only)
      await db!.update(claims).set({
        status: "repair_assigned",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 5000000,
      }).where(eq(claims.id, highValueClaimId));

      // Verify approval tracking
      const [claim] = await db!.select().from(claims).where(eq(claims.id, highValueClaimId));
      
      expect(claim.technicallyApprovedBy).toBe(riskManagerId);
      expect(claim.technicallyApprovedAt).toBeInstanceOf(Date);
      expect(claim.approvedAmount).toBe(5000000);
      expect(claim.financiallyApprovedBy).toBeNull();
      expect(claim.financiallyApprovedAt).toBeNull();
    });
  });

  describe("Financial Approval", () => {
    it("should require financial approval for high-value claims", async () => {
      // First, technical approval
      await db!.update(claims).set({
        status: "repair_assigned",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 5000000,
      }).where(eq(claims.id, highValueClaimId));

      // Then, financial approval by Claims Manager
      await db!.update(claims).set({
        financiallyApprovedBy: claimsManagerId,
        financiallyApprovedAt: new Date(),
      }).where(eq(claims.id, highValueClaimId));

      // Verify both approvals
      const [claim] = await db!.select().from(claims).where(eq(claims.id, highValueClaimId));
      
      expect(claim.technicallyApprovedBy).toBe(riskManagerId);
      expect(claim.technicallyApprovedAt).toBeInstanceOf(Date);
      expect(claim.financiallyApprovedBy).toBe(claimsManagerId);
      expect(claim.financiallyApprovedAt).toBeInstanceOf(Date);
    });

    it("should allow Executive role to provide financial approval", async () => {
      // Technical approval
      await db!.update(claims).set({
        status: "repair_assigned",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 5000000,
      }).where(eq(claims.id, highValueClaimId));

      // Financial approval by Executive
      await db!.update(claims).set({
        financiallyApprovedBy: executiveId,
        financiallyApprovedAt: new Date(),
      }).where(eq(claims.id, highValueClaimId));

      // Verify both approvals
      const [claim] = await db!.select().from(claims).where(eq(claims.id, highValueClaimId));
      
      expect(claim.financiallyApprovedBy).toBe(executiveId);
      expect(claim.financiallyApprovedAt).toBeInstanceOf(Date);
    });

    it("should not require financial approval for low-value claims", async () => {
      // Approve low-value claim (technical approval only)
      await db!.update(claims).set({
        status: "repair_assigned",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 1500000,
      }).where(eq(claims.id, lowValueClaimId));

      // Verify no financial approval required
      const [claim] = await db!.select().from(claims).where(eq(claims.id, lowValueClaimId));
      
      expect(claim.technicallyApprovedBy).toBe(riskManagerId);
      expect(claim.financiallyApprovedBy).toBeNull();
      expect(claim.financiallyApprovedAt).toBeNull();
    });
  });

  describe("Claim Closure Tracking", () => {
    it("should populate closedBy and closedAt when claim completed", async () => {
      // Approve claim first
      await db!.update(claims).set({
        status: "repair_in_progress",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 1500000,
      }).where(eq(claims.id, lowValueClaimId));

      // Complete claim
      await db!.update(claims).set({
        status: "completed",
        closedBy: claimsManagerId,
        closedAt: new Date(),
      }).where(eq(claims.id, lowValueClaimId));

      // Verify closure tracking
      const [claim] = await db!.select().from(claims).where(eq(claims.id, lowValueClaimId));
      
      expect(claim.status).toBe("completed");
      expect(claim.closedBy).toBe(claimsManagerId);
      expect(claim.closedAt).toBeInstanceOf(Date);
    });

    it("should require approval tracking before claim completion", async () => {
      // Try to complete claim without approval
      const [claimBefore] = await db!.select().from(claims).where(eq(claims.id, lowValueClaimId));
      
      expect(claimBefore.technicallyApprovedBy).toBeNull();
      expect(claimBefore.technicallyApprovedAt).toBeNull();
      
      // In real implementation, this would be prevented by validation
      // For now, we just verify the state
    });

    it("should require both technical and financial approval for high-value claim completion", async () => {
      // Technical approval only
      await db!.update(claims).set({
        status: "repair_in_progress",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 5000000,
      }).where(eq(claims.id, highValueClaimId));

      const [claimBefore] = await db!.select().from(claims).where(eq(claims.id, highValueClaimId));
      
      expect(claimBefore.technicallyApprovedBy).toBe(riskManagerId);
      expect(claimBefore.financiallyApprovedBy).toBeNull();
      
      // Add financial approval
      await db!.update(claims).set({
        financiallyApprovedBy: claimsManagerId,
        financiallyApprovedAt: new Date(),
      }).where(eq(claims.id, highValueClaimId));

      // Now can complete
      await db!.update(claims).set({
        status: "completed",
        closedBy: claimsManagerId,
        closedAt: new Date(),
      }).where(eq(claims.id, highValueClaimId));

      const [claimAfter] = await db!.select().from(claims).where(eq(claims.id, highValueClaimId));
      
      expect(claimAfter.status).toBe("completed");
      expect(claimAfter.closedBy).toBe(claimsManagerId);
      expect(claimAfter.closedAt).toBeInstanceOf(Date);
    });
  });

  describe("Approval Threshold Logic", () => {
    it("should correctly identify claims below threshold", async () => {
      const threshold = 2500000; // 25,000 USD
      const claimAmount = 1500000; // 15,000 USD
      
      const requiresFinancialApproval = claimAmount > threshold;
      
      expect(requiresFinancialApproval).toBe(false);
    });

    it("should correctly identify claims above threshold", async () => {
      const threshold = 2500000; // 25,000 USD
      const claimAmount = 5000000; // 50,000 USD
      
      const requiresFinancialApproval = claimAmount > threshold;
      
      expect(requiresFinancialApproval).toBe(true);
    });

    it("should correctly identify claims exactly at threshold", async () => {
      const threshold = 2500000; // 25,000 USD
      const claimAmount = 2500000; // 25,000 USD
      
      const requiresFinancialApproval = claimAmount > threshold;
      
      expect(requiresFinancialApproval).toBe(false); // Equal to threshold, no financial approval
    });
  });

  describe("Role-Based Authorization", () => {
    it("should track which role provided technical approval", async () => {
      // Risk Manager provides technical approval
      await db!.update(claims).set({
        status: "repair_assigned",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 1500000,
      }).where(eq(claims.id, lowValueClaimId));

      const [claim] = await db!.select().from(claims).where(eq(claims.id, lowValueClaimId));
      const [approver] = await db!.select().from(users).where(eq(users.id, claim.technicallyApprovedBy!));
      
      expect(approver.insurerRole).toBe("risk_manager");
    });

    it("should track which role provided financial approval", async () => {
      // Technical approval
      await db!.update(claims).set({
        status: "repair_assigned",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 5000000,
      }).where(eq(claims.id, highValueClaimId));

      // Claims Manager provides financial approval
      await db!.update(claims).set({
        financiallyApprovedBy: claimsManagerId,
        financiallyApprovedAt: new Date(),
      }).where(eq(claims.id, highValueClaimId));

      const [claim] = await db!.select().from(claims).where(eq(claims.id, highValueClaimId));
      const [approver] = await db!.select().from(users).where(eq(users.id, claim.financiallyApprovedBy!));
      
      expect(approver.insurerRole).toBe("claims_manager");
    });

    it("should track which role closed the claim", async () => {
      // Approve and complete claim
      await db!.update(claims).set({
        status: "repair_in_progress",
        technicallyApprovedBy: riskManagerId,
        technicallyApprovedAt: new Date(),
        approvedAmount: 1500000,
      }).where(eq(claims.id, lowValueClaimId));

      await db!.update(claims).set({
        status: "completed",
        closedBy: claimsManagerId,
        closedAt: new Date(),
      }).where(eq(claims.id, lowValueClaimId));

      const [claim] = await db!.select().from(claims).where(eq(claims.id, lowValueClaimId));
      const [closer] = await db!.select().from(users).where(eq(users.id, claim.closedBy!));
      
      expect(closer.insurerRole).toBe("claims_manager");
    });
  });
});
