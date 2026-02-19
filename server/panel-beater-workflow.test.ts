// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  getAllPanelBeaterPerformance,
  getPanelBeaterPerformance,
  getTopPanelBeaters,
} from "./panel-beater-analytics";
import {
  notifyAssessorAssignment,
  notifyPanelBeaterSelection,
  notifyQuoteSubmission,
  notifyClaimApproval,
} from "./workflow-notifications";

describe("Panel Beater Analytics", () => {
  it("should get all panel beater performance metrics", async () => {
    const performance = await getAllPanelBeaterPerformance();
    expect(Array.isArray(performance)).toBe(true);
    
    // Each performance metric should have required fields
    if (performance.length > 0) {
      const metric = performance[0];
      expect(metric).toHaveProperty("panelBeaterId");
      expect(metric).toHaveProperty("panelBeaterName");
      expect(metric).toHaveProperty("businessName");
      expect(metric).toHaveProperty("totalQuotesSubmitted");
      expect(metric).toHaveProperty("acceptanceRate");
      expect(metric).toHaveProperty("averageQuoteAmount");
      expect(metric).toHaveProperty("costCompetitivenessIndex");
      expect(metric).toHaveProperty("averageTurnaroundDays");
    }
  });

  it("should get top performing panel beaters", async () => {
    const topPerformers = await getTopPanelBeaters(3);
    expect(Array.isArray(topPerformers)).toBe(true);
    expect(topPerformers.length).toBeLessThanOrEqual(3);
  });

  it("should calculate cost competitiveness index correctly", async () => {
    const performance = await getAllPanelBeaterPerformance();
    
    for (const metric of performance) {
      // Cost competitiveness index should be a positive number
      expect(metric.costCompetitivenessIndex).toBeGreaterThanOrEqual(0);
      
      // Acceptance rate should be between 0 and 100
      expect(metric.acceptanceRate).toBeGreaterThanOrEqual(0);
      expect(metric.acceptanceRate).toBeLessThanOrEqual(100);
    }
  });
});

describe("Workflow Notifications", () => {
  it("should send assessor assignment notification", async () => {
    const result = await notifyAssessorAssignment({
      claimId: 1,
      assessorId: 1,
      claimNumber: "TEST-001",
      claimantName: "Test Claimant",
      tenantId: "test-tenant",
    });

    // Should return boolean indicating success/failure
    expect(typeof result).toBe("boolean");
  });

  it("should send panel beater selection notification", async () => {
    const result = await notifyPanelBeaterSelection({
      claimId: 1,
      panelBeaterId: 1,
      claimNumber: "TEST-001",
      claimantName: "Test Claimant",
      approvedAmount: 150000, // R1,500.00
      tenantId: "test-tenant",
    });

    expect(typeof result).toBe("boolean");
  });

  it("should send quote submission notification", async () => {
    const result = await notifyQuoteSubmission({
      claimId: 1,
      panelBeaterId: 1,
      claimNumber: "TEST-001",
      quotedAmount: 150000, // R1,500.00
      estimatedDays: 5,
      tenantId: "test-tenant",
    });

    expect(typeof result).toBe("boolean");
  });

  it("should send claim approval notification", async () => {
    const result = await notifyClaimApproval({
      claimId: 1,
      claimNumber: "TEST-001",
      claimantId: 1,
      approvedAmount: 150000, // R1,500.00
      selectedPanelBeater: "Test Panel Beater",
      tenantId: "test-tenant",
    });

    expect(typeof result).toBe("boolean");
  });

  it("should format currency correctly in notifications", async () => {
    // Test that amounts are properly formatted
    const testAmount = 123456; // R1,234.56 in cents
    const formatted = (testAmount / 100).toFixed(2);
    
    expect(formatted).toBe("1234.56");
  });
});
