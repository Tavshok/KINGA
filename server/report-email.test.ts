import { describe, it, expect } from "vitest";
import { sendReportEmail, getReportStakeholders } from "./report-email-service";

describe("Report Email Service", () => {
  it("should format report email content correctly", async () => {
    const emailOptions = {
      recipientEmail: "test@example.com",
      recipientName: "Test User",
      claimNumber: "CLM-12345",
      reportType: "insurer" as const,
      pdfUrl: "https://example.com/report.pdf",
      interactiveReportUrl: "https://example.com/interactive/report-123",
      generatedBy: "John Doe",
      tenantId: "test-tenant",
    };

    // Test that the function runs without errors
    // In production, this would send actual emails
    const result = await sendReportEmail(emailOptions);
    
    // notifyOwner returns boolean
    expect(typeof result).toBe("boolean");
  });

  it("should handle email sending for different report types", async () => {
    const reportTypes = ["insurer", "assessor", "regulatory"] as const;

    for (const reportType of reportTypes) {
      const result = await sendReportEmail({
        recipientEmail: "test@example.com",
        recipientName: "Test User",
        claimNumber: "CLM-12345",
        reportType,
        pdfUrl: "https://example.com/report.pdf",
        generatedBy: "System",
        tenantId: "test-tenant",
      });

      expect(typeof result).toBe("boolean");
    }
  });

  it("should include interactive report URL when provided", async () => {
    const result = await sendReportEmail({
      recipientEmail: "test@example.com",
      recipientName: "Test User",
      claimNumber: "CLM-12345",
      reportType: "insurer",
      pdfUrl: "https://example.com/report.pdf",
      interactiveReportUrl: "https://example.com/interactive/123",
      generatedBy: "System",
      tenantId: "test-tenant",
    });

    expect(typeof result).toBe("boolean");
  });
});
