// @ts-nocheck
/**
 * Tenant Isolation Test Suite
 * 
 * Validates that tenant isolation is effective and cross-tenant data access is prevented
 * across claims, assessments, quotes, and assessor assignments.
 * 
 * Test Coverage:
 * - Claim visibility isolation
 * - Assessor assignment isolation
 * - Quote submission isolation
 * - Assessment isolation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { 
  createClaim, 
  getClaimById,
  createPanelBeaterQuote,
  createAiAssessment,
  createAssessorEvaluation,
  getDb,
} from "./db";

describe("Tenant Isolation", () => {
  // Test data IDs
  let tenantAClaimId: number;
  let tenantBClaimId: number;
  let tenantAUserId: number;
  let tenantBUserId: number;
  let tenantAAssessorId: number;
  let tenantBAssessorId: number;
  const testRunId = Date.now();

  // Mock users for each tenant
  const tenantAInsurerUser = {
    id: 1001,
    openId: "tenant-a-insurer",
    name: "Tenant A Insurer",
    email: "insurer-a@test.com",
    role: "insurer" as const,
    tenantId: "tenant_a",
    insurerRole: "claims_processor" as const,
  };

  const tenantBInsurerUser = {
    id: 1002,
    openId: "tenant-b-insurer",
    name: "Tenant B Insurer",
    email: "insurer-b@test.com",
    role: "insurer" as const,
    tenantId: "tenant_b",
    insurerRole: "claims_processor" as const,
  };

  // Assessor users will be created dynamically with actual IDs
  let tenantAAssessorUser: any;
  let tenantBAssessorUser: any;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test users for tenant A
    const userAResult = await db.execute(
      `INSERT INTO users (email, name, role, openId) VALUES 
      ('tenant-a-user-${testRunId}@test.com', 'Tenant A User', 'insurer', 'tenant-a-user-${testRunId}')`
    );
    tenantAUserId = (userAResult as any)[0]?.insertId || (userAResult as any).insertId;

    const assessorAResult = await db.execute(
      `INSERT INTO users (email, name, role, openId) VALUES 
      ('tenant-a-assessor-${testRunId}@test.com', 'Tenant A Assessor', 'assessor', 'tenant-a-assessor-${testRunId}')`
    );
    tenantAAssessorId = (assessorAResult as any)[0]?.insertId || (assessorAResult as any).insertId;

    // Create assessor user object with actual ID
    tenantAAssessorUser = {
      id: tenantAAssessorId,
      openId: `tenant-a-assessor-${testRunId}`,
      name: "Tenant A Assessor",
      email: `tenant-a-assessor-${testRunId}@test.com`,
      role: "assessor" as const,
      tenantId: "tenant_a",
    };

    // Create test users for tenant B
    const userBResult = await db.execute(
      `INSERT INTO users (email, name, role, openId) VALUES 
      ('tenant-b-user-${testRunId}@test.com', 'Tenant B User', 'insurer', 'tenant-b-user-${testRunId}')`
    );
    tenantBUserId = (userBResult as any)[0]?.insertId || (userBResult as any).insertId;

    const assessorBResult = await db.execute(
      `INSERT INTO users (email, name, role, openId) VALUES 
      ('tenant-b-assessor-${testRunId}@test.com', 'Tenant B Assessor', 'assessor', 'tenant-b-assessor-${testRunId}')`
    );
    tenantBAssessorId = (assessorBResult as any)[0]?.insertId || (assessorBResult as any).insertId;

    // Create assessor user object with actual ID
    tenantBAssessorUser = {
      id: tenantBAssessorId,
      openId: `tenant-b-assessor-${testRunId}`,
      name: "Tenant B Assessor",
      email: `tenant-b-assessor-${testRunId}@test.com`,
      role: "assessor" as const,
      tenantId: "tenant_b",
    };

    // Create test claim for tenant A
    const claimAResult = await createClaim({
      claimantId: tenantAUserId,
      claimNumber: `TENANT-A-${testRunId}`,
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      vehicleYear: 2020,
      vehicleRegistration: "TEN-A-001",
      incidentDate: new Date(),
      incidentDescription: "Tenant A test claim",
      incidentLocation: "Tenant A Location",
      damagePhotos: JSON.stringify(["https://example.com/photo-a.jpg"]),
      policyNumber: "POL-A-001",
      tenantId: "tenant_a",
    });
    tenantAClaimId = Number(claimAResult[0].insertId);

    // Create test claim for tenant B
    const claimBResult = await createClaim({
      claimantId: tenantBUserId,
      claimNumber: `TENANT-B-${testRunId}`,
      vehicleMake: "Honda",
      vehicleModel: "Accord",
      vehicleYear: 2021,
      vehicleRegistration: "TEN-B-001",
      incidentDate: new Date(),
      incidentDescription: "Tenant B test claim",
      incidentLocation: "Tenant B Location",
      damagePhotos: JSON.stringify(["https://example.com/photo-b.jpg"]),
      policyNumber: "POL-B-001",
      tenantId: "tenant_b",
    });
    tenantBClaimId = Number(claimBResult[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup test data
    try {
      await db.execute(`DELETE FROM claims WHERE id IN (${tenantAClaimId}, ${tenantBClaimId})`);
      await db.execute(`DELETE FROM users WHERE id IN (${tenantAUserId}, ${tenantBUserId}, ${tenantAAssessorId}, ${tenantBAssessorId})`);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // CLAIM VISIBILITY ISOLATION TESTS
  // ============================================================================

  describe("Claim Visibility Isolation", () => {
    it("should only return tenant A claims for tenant A user", async () => {
      const claim = await getClaimById(tenantAClaimId, "tenant_a");
      expect(claim).toBeDefined();
      expect(claim?.tenantId).toBe("tenant_a");
      expect(claim?.claimNumber).toBe(`TENANT-A-${testRunId}`);
    });

    it("should only return tenant B claims for tenant B user", async () => {
      const claim = await getClaimById(tenantBClaimId, "tenant_b");
      expect(claim).toBeDefined();
      expect(claim?.tenantId).toBe("tenant_b");
      expect(claim?.claimNumber).toBe(`TENANT-B-${testRunId}`);
    });

    it("should return undefined when tenant A user tries to access tenant B claim", async () => {
      const claim = await getClaimById(tenantBClaimId, "tenant_a");
      expect(claim).toBeUndefined();
    });

    it("should return undefined when tenant B user tries to access tenant A claim", async () => {
      const claim = await getClaimById(tenantAClaimId, "tenant_b");
      expect(claim).toBeUndefined();
    });

    it("should enforce tenant filtering in getById tRPC procedure", async () => {
      const callerA = appRouter.createCaller({ user: tenantAInsurerUser });
      const callerB = appRouter.createCaller({ user: tenantBInsurerUser });

      // Tenant A can access their own claim
      const claimA = await callerA.claims.getById({ id: tenantAClaimId });
      expect(claimA).toBeDefined();
      expect(claimA?.tenantId).toBe("tenant_a");

      // Tenant A cannot access tenant B's claim
      const claimB = await callerA.claims.getById({ id: tenantBClaimId });
      expect(claimB).toBeUndefined();

      // Tenant B can access their own claim
      const claimB2 = await callerB.claims.getById({ id: tenantBClaimId });
      expect(claimB2).toBeDefined();
      expect(claimB2?.tenantId).toBe("tenant_b");

      // Tenant B cannot access tenant A's claim
      const claimA2 = await callerB.claims.getById({ id: tenantAClaimId });
      expect(claimA2).toBeUndefined();
    });
  });

  // ============================================================================
  // ASSESSOR ASSIGNMENT ISOLATION TESTS
  // ============================================================================

  describe("Assessor Assignment Isolation", () => {
    it("should allow tenant A assessor to be assigned to tenant A claim", async () => {
      const caller = appRouter.createCaller({ user: tenantAInsurerUser });
      
      const result = await caller.claims.assignToAssessor({
        claimId: tenantAClaimId,
        assessorId: tenantAAssessorId,
      });

      expect(result.success).toBe(true);

      // Verify assignment
      const claim = await getClaimById(tenantAClaimId, "tenant_a");
      expect(claim?.assignedAssessorId).toBe(tenantAAssessorId);
    });

    it("should prevent cross-tenant claim access via assignment", async () => {
      const callerA = appRouter.createCaller({ user: tenantAInsurerUser });

      // Tenant A insurer tries to assign assessor to tenant B's claim
      // This should fail because getClaimById will return undefined for cross-tenant access
      await expect(
        callerA.claims.assignToAssessor({
          claimId: tenantBClaimId,
          assessorId: tenantAAssessorId,
        })
      ).rejects.toThrow();
    });

    it("should only show tenant-specific claims to assessors", async () => {
      const callerA = appRouter.createCaller({ user: tenantAAssessorUser });
      const callerB = appRouter.createCaller({ user: tenantBAssessorUser });

      // Assign tenant B assessor to tenant B claim
      const db = await getDb();
      if (db) {
        await db.execute(
          `UPDATE claims SET assigned_assessor_id = ${tenantBAssessorId} WHERE id = ${tenantBClaimId}`
        );
      }

      // Tenant A assessor queries their assignments
      const assignmentsA = await callerA.claims.myAssignments();
      const tenantBClaimVisible = assignmentsA.some((c: any) => c.id === tenantBClaimId);
      expect(tenantBClaimVisible).toBe(false);

      // Tenant B assessor queries their assignments
      const assignmentsB = await callerB.claims.myAssignments();
      const tenantBClaimVisibleB = assignmentsB.some((c: any) => c.id === tenantBClaimId);
      expect(tenantBClaimVisibleB).toBe(true);
    });
  });

  // ============================================================================
  // QUOTE SUBMISSION ISOLATION TESTS
  // ============================================================================

  describe("Quote Submission Isolation", () => {
    it("should allow quote submission to tenant A claim", async () => {
      const quoteResult = await createPanelBeaterQuote({
        claimId: tenantAClaimId,
        panelBeaterId: 1,
        quotedAmount: 100000,
        estimatedDays: 5,
        notes: "Tenant A quote",
      });

      expect(quoteResult).toBeDefined();
    });

    it("should enforce tenant filtering when retrieving quotes", async () => {
      const { getQuotesByClaimId } = await import("./db");

      // Create quote for tenant A claim
      await createPanelBeaterQuote({
        claimId: tenantAClaimId,
        panelBeaterId: 1,
        quotedAmount: 100000,
        estimatedDays: 5,
      });

      // Tenant A can see quotes for their claim
      const quotesA = await getQuotesByClaimId(tenantAClaimId, "tenant_a");
      expect(quotesA.length).toBeGreaterThan(0);

      // Tenant B cannot see quotes for tenant A's claim
      const quotesB = await getQuotesByClaimId(tenantAClaimId, "tenant_b");
      expect(quotesB.length).toBe(0);
    });

    it("should prevent cross-tenant quote access via tRPC", async () => {
      const callerA = appRouter.createCaller({ user: tenantAInsurerUser });
      const callerB = appRouter.createCaller({ user: tenantBInsurerUser });

      // Create quote for tenant B claim
      await createPanelBeaterQuote({
        claimId: tenantBClaimId,
        panelBeaterId: 2,
        quotedAmount: 150000,
        estimatedDays: 7,
      });

      // Tenant A tries to get quotes for tenant B's claim
      const quotesA = await callerA.quotes.byClaim({ claimId: tenantBClaimId });
      expect(quotesA.length).toBe(0);

      // Tenant B can see their own quotes
      const quotesB = await callerB.quotes.byClaim({ claimId: tenantBClaimId });
      expect(quotesB.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // ASSESSMENT ISOLATION TESTS
  // ============================================================================

  describe("Assessment Isolation", () => {
    it("should allow tenant A users to access tenant A AI assessments", async () => {
      const { getAiAssessmentByClaimId } = await import("./db");

      // Create AI assessment for tenant A claim
      await createAiAssessment({
        claimId: tenantAClaimId,
        damageAnalysis: JSON.stringify({ severity: "moderate" }),
        estimatedCost: 50000,
        fraudRiskLevel: "low",
        confidenceScore: 0.85,
      });

      // Tenant A can access the assessment
      const assessmentA = await getAiAssessmentByClaimId(tenantAClaimId, "tenant_a");
      expect(assessmentA).toBeDefined();
      expect(assessmentA?.claimId).toBe(tenantAClaimId);
    });

    it("should prevent tenant B users from accessing tenant A AI assessments", async () => {
      const { getAiAssessmentByClaimId } = await import("./db");

      // Tenant B tries to access tenant A's assessment
      const assessmentB = await getAiAssessmentByClaimId(tenantAClaimId, "tenant_b");
      expect(assessmentB).toBeNull();
    });

    it("should allow tenant A users to access tenant A assessor evaluations", async () => {
      const { getAssessorEvaluationByClaimId } = await import("./db");

      // Create assessor evaluation for tenant A claim
      await createAssessorEvaluation({
        claimId: tenantAClaimId,
        assessorId: tenantAAssessorId,
        damageAssessment: JSON.stringify({ parts: ["bumper", "hood"] }),
        estimatedRepairCost: 60000,
        recommendedAction: "approve",
      });

      // Tenant A can access the evaluation
      const evaluationA = await getAssessorEvaluationByClaimId(tenantAClaimId, "tenant_a");
      expect(evaluationA).toBeDefined();
      expect(evaluationA?.claimId).toBe(tenantAClaimId);
    });

    it("should prevent tenant B users from accessing tenant A assessor evaluations", async () => {
      const { getAssessorEvaluationByClaimId } = await import("./db");

      // Tenant B tries to access tenant A's evaluation
      const evaluationB = await getAssessorEvaluationByClaimId(tenantAClaimId, "tenant_b");
      expect(evaluationB).toBeNull();
    });

    it("should enforce tenant isolation in assessment tRPC procedures", async () => {
      const callerA = appRouter.createCaller({ user: tenantAInsurerUser });
      const callerB = appRouter.createCaller({ user: tenantBInsurerUser });

      // Create AI assessment for tenant B claim
      await createAiAssessment({
        claimId: tenantBClaimId,
        damageAnalysis: JSON.stringify({ severity: "high" }),
        estimatedCost: 80000,
        fraudRiskLevel: "medium",
        confidenceScore: 0.75,
      });

      // Tenant A tries to access tenant B's assessment via tRPC
      // This should return null because the claim lookup will fail due to tenant filtering
      const assessmentA = await callerA.aiAssessments.byClaim({ claimId: tenantBClaimId });
      expect(assessmentA).toBeNull();

      // Tenant B can access their own assessment
      const assessmentB = await callerB.aiAssessments.byClaim({ claimId: tenantBClaimId });
      expect(assessmentB).toBeDefined();
    });
  });

  // ============================================================================
  // COMPREHENSIVE CROSS-TENANT ACCESS PREVENTION
  // ============================================================================

  describe("Comprehensive Cross-Tenant Access Prevention", () => {
    it("should prevent all cross-tenant data access vectors", async () => {
      const callerA = appRouter.createCaller({ user: tenantAInsurerUser });
      const callerB = appRouter.createCaller({ user: tenantBInsurerUser });

      // Verify tenant A cannot access any tenant B data
      const claimB = await callerA.claims.getById({ id: tenantBClaimId });
      expect(claimB).toBeUndefined();

      const quotesB = await callerA.quotes.byClaim({ claimId: tenantBClaimId });
      expect(quotesB.length).toBe(0);

      const assessmentB = await callerA.aiAssessments.byClaim({ claimId: tenantBClaimId });
      expect(assessmentB).toBeNull();

      // Verify tenant B cannot access any tenant A data
      const claimA = await callerB.claims.getById({ id: tenantAClaimId });
      expect(claimA).toBeUndefined();

      const quotesA = await callerB.quotes.byClaim({ claimId: tenantAClaimId });
      expect(quotesA.length).toBe(0);

      const assessmentA = await callerB.aiAssessments.byClaim({ claimId: tenantAClaimId });
      expect(assessmentA).toBeNull();
    });

    it("should maintain tenant isolation across all query functions", async () => {
      const { 
        getClaimById, 
        getAiAssessmentByClaimId, 
        getAssessorEvaluationByClaimId,
        getQuotesByClaimId 
      } = await import("./db");

      // Verify all query functions respect tenant filtering
      const claimA = await getClaimById(tenantAClaimId, "tenant_b");
      expect(claimA).toBeUndefined();

      const claimB = await getClaimById(tenantBClaimId, "tenant_a");
      expect(claimB).toBeUndefined();

      const assessmentA = await getAiAssessmentByClaimId(tenantAClaimId, "tenant_b");
      expect(assessmentA).toBeNull();

      const assessmentB = await getAiAssessmentByClaimId(tenantBClaimId, "tenant_a");
      expect(assessmentB).toBeNull();

      const evaluationA = await getAssessorEvaluationByClaimId(tenantAClaimId, "tenant_b");
      expect(evaluationA).toBeNull();

      const evaluationB = await getAssessorEvaluationByClaimId(tenantBClaimId, "tenant_a");
      expect(evaluationB).toBeNull();

      const quotesA = await getQuotesByClaimId(tenantAClaimId, "tenant_b");
      expect(quotesA.length).toBe(0);

      const quotesB = await getQuotesByClaimId(tenantBClaimId, "tenant_a");
      expect(quotesB.length).toBe(0);
    });
  });
});
