/**
 * Unit tests for claim approval workflow
 * 
 * Tests the approveClaim procedure which:
 * - Updates claim status to "repair_assigned"
 * - Records the selected panel beater quote
 * - Creates audit trail entry
 */

import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { 
  createClaim, 
  createPanelBeaterQuote, 
  getClaimById, 
  getAuditTrailByClaimId,
  updateClaimStatus,
} from "./db";

describe("Claims - Approve Claim Workflow", () => {
  let testClaimId: number;
  let testQuoteId: number;
  const mockUser = {
    id: 1,
    openId: "test-insurer",
    name: "Test Insurer",
    email: "insurer@test.com",
    role: "insurer" as const,
  };

  beforeAll(async () => {
    // Create a test claim
    const claimNumber = `CLM-TEST-${Date.now()}`;
    const result = await createClaim({
      claimantId: 1,
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
    });
    testClaimId = Number(result[0].insertId);

    // Progress claim to comparison status
    await updateClaimStatus(testClaimId, "comparison");

    // Create a test quote
    const quoteResult = await createPanelBeaterQuote({
      claimId: testClaimId,
      panelBeaterId: 1,
      quotedAmount: 150000, // $1500.00
      laborCost: 80000,
      partsCost: 70000,
      estimatedDuration: 5,
      notes: "Test quote for approval",
      status: "submitted",
    });
    testQuoteId = Number(quoteResult[0].insertId);
  });

  it("should approve claim and update status to repair_assigned", async () => {
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
    const caller = appRouter.createCaller({
      user: mockUser,
      req: {} as any,
      res: {} as any,
    });

    await caller.claims.approveClaim({
      claimId: testClaimId,
      selectedQuoteId: testQuoteId,
    });

    // Verify audit trail was created
    const auditTrail = await getAuditTrailByClaimId(testClaimId);
    const approvalEntry = auditTrail.find(
      (entry) => entry.action === "claim_approved"
    );

    expect(approvalEntry).toBeDefined();
    expect(approvalEntry?.entityType).toBe("claim");
    expect(approvalEntry?.changeDescription).toContain("Claim technically approved");
    expect(approvalEntry?.changeDescription).toContain(`quote #${testQuoteId}`);
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
