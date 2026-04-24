/**
 * Analytics Export Service Tests
 * 
 * Tests for PDF and CSV report generation functionality
 */

import { describe, it, expect, vi } from "vitest";
import {
  gatherAnalyticsData,
  generatePDFReport,
  generateCSVReport,
} from "./analytics-export";

// Mock the fast-track-analytics module
vi.mock("../fast-track-analytics", () => ({
  calculateFastTrackRate: async () => ({
    totalClaims: 1000,
    eligibleClaims: 800,
    fastTrackedClaims: 700,
    fastTrackRate: 70.0,
  }),
  calculateAutoApprovalRate: async () => ({
    totalFastTracked: 700,
    autoApproved: 560,
    autoApprovalRate: 80.0,
  }),
  calculateProcessingTime: async () => ({
    fastTrackAvgHours: 24,
    normalAvgHours: 72,
    timeSavings: 66.67,
    timeSavingsHours: 48,
  }),
  calculateExecutiveOverrides: async () => ({
    totalAutoApprovals: 560,
    overrideCount: 28,
    overrideRate: 5.0,
  }),
  calculateRiskDistribution: async () => ({
    lowRisk: 490,
    mediumRisk: 175,
    highRisk: 35,
  }),
}));

describe("Analytics Export Service", () => {
  const mockTenantId = "test-tenant-001";
  const mockDateRange = {
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-31"),
  };
  const mockMetadata = {
    tenantId: mockTenantId,
    tenantName: "Test Insurance Co.",
    generatedAt: new Date("2026-02-17"),
    generatedBy: "Test Executive",
  };

  describe("gatherAnalyticsData", () => {
    it("should gather all 5 analytics metrics successfully", async () => {
      const result = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.tenantId).toBe(mockTenantId);
      expect(result.metadata.dateRange).toEqual(mockDateRange);

      // Verify fast-track rate
      expect(result.fastTrackRate).toBeDefined();
      expect(result.fastTrackRate.totalClaims).toBe(1000);
      expect(result.fastTrackRate.fastTrackCount).toBe(700);
      expect(result.fastTrackRate.percentage).toBe(70.0);

      // Verify auto-approval rate
      expect(result.autoApprovalRate).toBeDefined();
      expect(result.autoApprovalRate.autoApprovedCount).toBe(560);
      expect(result.autoApprovalRate.totalFastTrack).toBe(700);
      expect(result.autoApprovalRate.percentage).toBe(80.0);

      // Verify processing time
      expect(result.processingTime).toBeDefined();
      expect(result.processingTime.fastTrackAvgHours).toBe(24);
      expect(result.processingTime.standardAvgHours).toBe(72);
      expect(result.processingTime.timeSavingsHours).toBe(48);

      // Verify executive override
      expect(result.executiveOverride).toBeDefined();
      expect(result.executiveOverride.overrideCount).toBe(28);
      expect(result.executiveOverride.totalFastTrack).toBe(560);
      expect(result.executiveOverride.percentage).toBe(5.0);

      // Verify risk distribution
      expect(result.riskDistribution).toBeDefined();
      expect(result.riskDistribution.LOW).toBe(490);
      expect(result.riskDistribution.MEDIUM).toBe(175);
      expect(result.riskDistribution.HIGH).toBe(35);
    });

    it("should include correct metadata in the result", async () => {
      const result = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      expect(result.metadata.tenantId).toBe(mockTenantId);
      expect(result.metadata.tenantName).toBe("Test Insurance Co.");
      expect(result.metadata.generatedBy).toBe("Test Executive");
      expect(result.metadata.dateRange).toEqual(mockDateRange);
    });
  });

  describe("generatePDFReport", () => {
    it("should generate a PDF buffer from analytics data", async () => {
      const analyticsData = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      const pdfBuffer = await generatePDFReport(analyticsData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // Verify it's a valid PDF by checking the header
      const pdfHeader = pdfBuffer.toString("utf-8", 0, 4);
      expect(pdfHeader).toBe("%PDF");
    });

    it("should include all metrics in the PDF", async () => {
      const analyticsData = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      const pdfBuffer = await generatePDFReport(analyticsData);
      const pdfContent = pdfBuffer.toString("utf-8");

      // Check for key content in the PDF
      expect(pdfContent).toContain("Fast-Track Analytics Report");
      expect(pdfContent).toContain("Fast-Track Eligibility Rate");
      expect(pdfContent).toContain("Auto-Approval Rate");
      expect(pdfContent).toContain("Processing Time Comparison");
      expect(pdfContent).toContain("Executive Override Frequency");
      expect(pdfContent).toContain("Risk Distribution");
    });
  });

  describe("generateCSVReport", () => {
    it("should generate a CSV string from analytics data", async () => {
      const analyticsData = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      const csvContent = await generateCSVReport(analyticsData);

      expect(typeof csvContent).toBe("string");
      expect(csvContent.length).toBeGreaterThan(0);
    });

    it("should include all metrics in the CSV", async () => {
      const analyticsData = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      const csvContent = await generateCSVReport(analyticsData);

      // Check for key content in the CSV
      expect(csvContent).toContain("KINGA AI - Fast-Track Analytics Report");
      expect(csvContent).toContain("Fast-Track Eligibility Rate");
      expect(csvContent).toContain("Auto-Approval Rate");
      expect(csvContent).toContain("Processing Time Comparison");
      expect(csvContent).toContain("Executive Override Frequency");
      expect(csvContent).toContain("Risk Distribution");

      // Check for actual data values
      expect(csvContent).toContain("1000"); // Total claims
      expect(csvContent).toContain("700"); // Fast-track count
      expect(csvContent).toContain("70.00%"); // Fast-track rate
      expect(csvContent).toContain("560"); // Auto-approved count
      expect(csvContent).toContain("80.00%"); // Auto-approval rate
    });

    it("should format CSV with proper structure", async () => {
      const analyticsData = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      const csvContent = await generateCSVReport(analyticsData);

      // Check for CSV structure (comma-separated values)
      const lines = csvContent.split("\n");
      expect(lines.length).toBeGreaterThan(10); // Should have multiple lines

      // Check for metadata section
      expect(csvContent).toContain("Report Period:");
      expect(csvContent).toContain("Generated:");
      expect(csvContent).toContain("Generated By:");
      expect(csvContent).toContain("Organization:");
    });
  });

  describe("Data Transformation", () => {
    it("should correctly transform fast-track rate data", async () => {
      const result = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      expect(result.fastTrackRate.fastTrackCount).toBe(700);
      expect(result.fastTrackRate.totalClaims).toBe(1000);
      expect(result.fastTrackRate.percentage).toBe(70.0);
    });

    it("should correctly transform auto-approval rate data", async () => {
      const result = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      expect(result.autoApprovalRate.autoApprovedCount).toBe(560);
      expect(result.autoApprovalRate.totalFastTrack).toBe(700);
      expect(result.autoApprovalRate.percentage).toBe(80.0);
    });

    it("should correctly transform processing time data", async () => {
      const result = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      expect(result.processingTime.fastTrackAvgHours).toBe(24);
      expect(result.processingTime.standardAvgHours).toBe(72);
      expect(result.processingTime.timeSavingsHours).toBe(48);
    });

    it("should correctly transform executive override data", async () => {
      const result = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      expect(result.executiveOverride.overrideCount).toBe(28);
      expect(result.executiveOverride.totalFastTrack).toBe(560);
      expect(result.executiveOverride.percentage).toBe(5.0);
    });

    it("should correctly transform risk distribution data", async () => {
      const result = await gatherAnalyticsData(
        mockTenantId,
        mockDateRange,
        mockMetadata
      );

      expect(result.riskDistribution.LOW).toBe(490);
      expect(result.riskDistribution.MEDIUM).toBe(175);
      expect(result.riskDistribution.HIGH).toBe(35);
    });
  });
});
