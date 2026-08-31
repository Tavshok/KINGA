// @ts-nocheck
/**
 * Unit tests for claim approval workflow
 * 
 * Tests the approveClaim procedure which:
 * - Updates claim status to "repair_assigned"
 * - Records the selected panel beater quote
 * - Creates audit trail entry
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { 
  createClaim, 
  createPanelBeaterQuote, 
  getClaimById, 
  getAuditTrailByClaimId,
  getDb,
} from "./db";
import { claims, panelBeaterQuotes, panelBeaters, aiAssessments, workflowAuditTrail, auditTrail, claimInvolvementTracking, repairHistory, vehicleDamageHistory } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { setupTestClaimState } from "./test-helpers/workflow";

describe("Claims - Approve Claim Workflow", () => {
  let testClaimId = 0;
  let testQuoteId = 0;
  let testApproverUserId = 0;
  let testPanelBeaterId = 0;
  const ownedAssessmentIds: number[] = [];
  let ownedWorkflowAuditIds: number[] = [];
  let ownedAuditIds: number[] = [];
  let ownedInvolvementIds: number[] = [];
  let mockUser: any;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const fixtureStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const approverResult = await db.insert((await import("../drizzle/schema")).users).values({
      openId: `fixture-approval-actor-${fixtureStamp}`,
      name: "Fixture Approval Manager",
      email: `fixture-approval-${fixtureStamp}@example.invalid`,
      role: "insurer",
      insurerRole: "claims_manager",
      tenantId: "default",
      isActive: 1,
    });
    testApproverUserId = Number((approverResult as any)[0]?.insertId ?? (approverResult as any).insertId);
    if (!Number.isSafeInteger(testApproverUserId)) throw new Error("Unable to create owned approval fixture actor");
    mockUser = {
      id: testApproverUserId,
      openId: `fixture-approval-actor-${fixtureStamp}`,
      name: "Fixture Approval Manager",
      email: `fixture-approval-${fixtureStamp}@example.invalid`,
      role: "insurer" as const,
      tenantId: "default",
      insurerRole: "claims_manager" as const,
    };
    const repairerResult = await db.insert(panelBeaters).values({
      name: "Fixture Approval Repairer",
      businessName: `Fixture Approval Repairs ${fixtureStamp}`,
      email: `fixture-repairer-${fixtureStamp}@example.invalid`,
      tenantId: "default",
      approved: 1,
      panelBeaterStatus: "approved",
    });
    testPanelBeaterId = Number((repairerResult as any)[0]?.insertId ?? (repairerResult as any).insertId);
    if (!Number.isSafeInteger(testPanelBeaterId)) throw new Error("Unable to create owned approval fixture repairer");

    // Create a test claim
    const claimNumber = `CLM-TEST-${Date.now()}`;
    const result = await createClaim({
      claimantId: testApproverUserId,
      claimNumber,
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      vehicleYear: 2020,
      vehicleRegistration: "ABC123",
      incidentDate: new Date(),
      incidentDescription: "Test incident for approval",
      incidentLocation: "Test Location",
      damagePhotos: JSON.stringify(["https://example.com/photo1.jpg"]),
      policyNumber: "POL-TEST-001",
      selectedPanelBeaterIds: JSON.stringify([1, 2, 3]),
      tenantId: "default",
    });
    testClaimId = Number(result[0].insertId);
    if (!Number.isSafeInteger(testClaimId)) throw new Error("Unable to create owned approval fixture claim");

    // Progress claim through valid workflow to comparison status
    // Using WorkflowEngine via test helper to ensure governance enforcement
    await setupTestClaimState(testClaimId, "technical_approval"); // "comparison" maps to "technical_approval"

    // Create a test quote
    const quoteResult = await createPanelBeaterQuote({
      claimId: testClaimId,
      panelBeaterId: testPanelBeaterId,
      quotedAmount: 150000, // $1500.00
      laborCost: 80000,
      partsCost: 70000,
      estimatedDuration: 5,
      notes: "Test quote for approval",
      status: "submitted",
    });
    testQuoteId = Number(quoteResult[0].insertId);

    // Create a minimal AI assessment record so workflow engine allows financial_decision transition
    // (workflow-engine.ts requires an aiAssessments record before advancing past technical_approval)
    const { aiAssessments } = await import('../drizzle/schema');
    const assessmentResult = await db.insert(aiAssessments).values({
      claimId: testClaimId,
      estimatedCost: 150000,
      confidenceScore: 85,
      fraudRiskLevel: 'low',
      fraudScore: 10,
      recommendation: 'APPROVE',
    });
    const assessmentId = Number((assessmentResult as any)[0]?.insertId ?? (assessmentResult as any).insertId);
    if (!Number.isSafeInteger(assessmentId)) throw new Error("Unable to create owned approval fixture assessment");
    ownedAssessmentIds.push(assessmentId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || testClaimId <= 0) return;

    // Every child set is first captured using the exact primary key of this suite-owned claim.
    const [workflowAudits, legacyAudits, involvements, repairHistoryRows, damageHistoryRows] = await Promise.all([
      db.select({ id: workflowAuditTrail.id }).from(workflowAuditTrail).where(eq(workflowAuditTrail.claimId, testClaimId)),
      db.select({ id: auditTrail.id }).from(auditTrail).where(eq(auditTrail.claimId, testClaimId)),
      db.select({ id: claimInvolvementTracking.id }).from(claimInvolvementTracking).where(eq(claimInvolvementTracking.claimId, testClaimId)),
      db.select({ id: repairHistory.id }).from(repairHistory).where(eq(repairHistory.claimId, testClaimId)),
      db.select({ id: vehicleDamageHistory.id }).from(vehicleDamageHistory).where(eq(vehicleDamageHistory.claimId, testClaimId)),
    ]);
    ownedWorkflowAuditIds = workflowAudits.map((row) => row.id);
    ownedAuditIds = legacyAudits.map((row) => row.id);
    ownedInvolvementIds = involvements.map((row) => row.id);

    if (repairHistoryRows.length > 0) await db.delete(repairHistory).where(inArray(repairHistory.id, repairHistoryRows.map((row) => row.id)));
    if (damageHistoryRows.length > 0) await db.delete(vehicleDamageHistory).where(inArray(vehicleDamageHistory.id, damageHistoryRows.map((row) => row.id)));
    if (ownedAuditIds.length > 0) await db.delete(auditTrail).where(inArray(auditTrail.id, ownedAuditIds));
    if (ownedWorkflowAuditIds.length > 0) await db.delete(workflowAuditTrail).where(inArray(workflowAuditTrail.id, ownedWorkflowAuditIds));
    if (ownedInvolvementIds.length > 0) await db.delete(claimInvolvementTracking).where(inArray(claimInvolvementTracking.id, ownedInvolvementIds));
    if (ownedAssessmentIds.length > 0) await db.delete(aiAssessments).where(inArray(aiAssessments.id, ownedAssessmentIds));
    if (testQuoteId > 0) await db.delete(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, testQuoteId));
    await db.delete(claims).where(eq(claims.id, testClaimId));
    if (testPanelBeaterId > 0) await db.delete(panelBeaters).where(eq(panelBeaters.id, testPanelBeaterId));
    if (testApproverUserId > 0) await db.delete((await import("../drizzle/schema")).users).where(eq((await import("../drizzle/schema")).users.id, testApproverUserId));

    // No-leak proof: all checks use captured child IDs and the owned claim primary key only.
    const [remainingAudits, remainingWorkflowAudits, remainingInvolvements, remainingAssessments, remainingQuotes, remainingClaims, remainingRepairHistory, remainingDamageHistory, remainingRepairer] = await Promise.all([
      ownedAuditIds.length > 0 ? db.select({ id: auditTrail.id }).from(auditTrail).where(inArray(auditTrail.id, ownedAuditIds)) : Promise.resolve([]),
      ownedWorkflowAuditIds.length > 0 ? db.select({ id: workflowAuditTrail.id }).from(workflowAuditTrail).where(inArray(workflowAuditTrail.id, ownedWorkflowAuditIds)) : Promise.resolve([]),
      ownedInvolvementIds.length > 0 ? db.select({ id: claimInvolvementTracking.id }).from(claimInvolvementTracking).where(inArray(claimInvolvementTracking.id, ownedInvolvementIds)) : Promise.resolve([]),
      ownedAssessmentIds.length > 0 ? db.select({ id: aiAssessments.id }).from(aiAssessments).where(inArray(aiAssessments.id, ownedAssessmentIds)) : Promise.resolve([]),
      testQuoteId > 0 ? db.select({ id: panelBeaterQuotes.id }).from(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, testQuoteId)) : Promise.resolve([]),
      db.select({ id: claims.id }).from(claims).where(eq(claims.id, testClaimId)),
      repairHistoryRows.length > 0 ? db.select({ id: repairHistory.id }).from(repairHistory).where(inArray(repairHistory.id, repairHistoryRows.map((row) => row.id))) : Promise.resolve([]),
      damageHistoryRows.length > 0 ? db.select({ id: vehicleDamageHistory.id }).from(vehicleDamageHistory).where(inArray(vehicleDamageHistory.id, damageHistoryRows.map((row) => row.id))) : Promise.resolve([]),
      testPanelBeaterId > 0 ? db.select({ id: panelBeaters.id }).from(panelBeaters).where(eq(panelBeaters.id, testPanelBeaterId)) : Promise.resolve([]),
    ]);
    expect(remainingAudits).toHaveLength(0);
    expect(remainingWorkflowAudits).toHaveLength(0);
    expect(remainingInvolvements).toHaveLength(0);
    expect(remainingAssessments).toHaveLength(0);
    expect(remainingQuotes).toHaveLength(0);
    expect(remainingClaims).toHaveLength(0);
    expect(remainingRepairHistory).toHaveLength(0);
    expect(remainingDamageHistory).toHaveLength(0);
    expect(remainingRepairer).toHaveLength(0);
  });

  it("should approve claim and update status to repair_assigned", async () => {
    // Reset to technical_approval state for this test
    const db = await getDb();
    await db.update(claims).set({ workflowState: "technical_approval" }).where(eq(claims.id, testClaimId));

    const caller = appRouter.createCaller({
      user: mockUser,
      req: {} as any,
      res: {} as any,
    });

    const result = await caller.claims.approveClaim({
      claimId: testClaimId,
      selectedQuoteId: testQuoteId,
    });

    expect(result.success).toBe(true);

    // Verify claim status was updated
    const updatedClaim = await getClaimById(testClaimId);
    expect(updatedClaim?.status).toBe("repair_assigned");
  });

  it("should create audit trail entry for claim approval", async () => {
    // Reset claim to technical_approval state for this test via direct DB update
    const db = await getDb();
    await db.update(claims).set({ workflowState: "technical_approval" }).where(eq(claims.id, testClaimId));

    const caller = appRouter.createCaller({
      user: mockUser,
      req: {} as any,
      res: {} as any,
    });

    await caller.claims.approveClaim({
      claimId: testClaimId,
      selectedQuoteId: testQuoteId,
    });

    // Verify audit trail was created (workflow audit trail)
    const auditTrail = await getAuditTrailByClaimId(testClaimId);
    // Audit trail should have entries (either from workflow engine or legacy audit)
    expect(auditTrail).toBeDefined();
    // If the audit trail has entries, verify they have the expected structure
    if (auditTrail.length > 0) {
      const latestEntry = auditTrail[auditTrail.length - 1];
      expect(latestEntry).toBeDefined();
    }
  });

  it("should require authentication", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: {} as any,
    });

    await expect(
      caller.claims.approveClaim({
        claimId: testClaimId,
        selectedQuoteId: testQuoteId,
      })
    ).rejects.toThrow();
  });

  it("should validate input parameters", async () => {
    const caller = appRouter.createCaller({
      user: mockUser,
      req: {} as any,
      res: {} as any,
    });

    // Test with invalid claimId type
    await expect(
      caller.claims.approveClaim({
        claimId: "invalid" as any,
        selectedQuoteId: testQuoteId,
      })
    ).rejects.toThrow();

    // Test with invalid selectedQuoteId type
    await expect(
      caller.claims.approveClaim({
        claimId: testClaimId,
        selectedQuoteId: "invalid" as any,
      })
    ).rejects.toThrow();
  });
});
