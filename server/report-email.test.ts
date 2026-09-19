// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyOwner: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: mocks.notifyOwner,
}));

import { sendReportEmail } from "./report-email-service";

describe("Report Email Service", () => {
  beforeEach(() => {
    mocks.notifyOwner.mockReset();
    mocks.notifyOwner.mockResolvedValue(true);
  });

  it("formats an insurer report notification without using the provider transport", async () => {
    const result = await sendReportEmail({
      recipientEmail: "test@example.com",
      recipientName: "Test User",
      claimNumber: "CLM-12345",
      reportType: "insurer",
      pdfUrl: "https://example.com/report.pdf",
      interactiveReportUrl: "https://example.com/interactive/report-123",
      generatedBy: "John Doe",
      tenantId: "test-tenant",
    });

    expect(result).toBe(true);
    expect(mocks.notifyOwner).toHaveBeenCalledOnce();
    expect(mocks.notifyOwner).toHaveBeenCalledWith({
      title: "Report Generated: CLM-12345 - Insurer Intelligence Report",
      content: expect.stringContaining("Dear Test User"),
    });
    const payload = mocks.notifyOwner.mock.calls[0][0];
    expect(payload.content).toContain("https://example.com/report.pdf");
    expect(payload.content).toContain(
      "https://example.com/interactive/report-123"
    );
    expect(payload.content).toContain(
      "Interactive Report (Living Intelligence)"
    );
  });

  it("formats each supported report type", async () => {
    const reportTypes = [
      ["insurer", "Insurer Intelligence Report"],
      ["assessor", "Assessor Evaluation Report"],
      ["regulatory", "Regulatory Compliance Report"],
    ] as const;

    for (const [reportType, displayName] of reportTypes) {
      const result = await sendReportEmail({
        recipientEmail: "test@example.com",
        recipientName: "Test User",
        claimNumber: "CLM-12345",
        reportType,
        pdfUrl: "https://example.com/report.pdf",
        generatedBy: "System",
        tenantId: "test-tenant",
      });

      expect(result).toBe(true);
      expect(mocks.notifyOwner).toHaveBeenLastCalledWith({
        title: `Report Generated: CLM-12345 - ${displayName}`,
        content: expect.stringContaining(
          `A new ${displayName} has been generated`
        ),
      });
    }

    expect(mocks.notifyOwner).toHaveBeenCalledTimes(reportTypes.length);
  });

  it("includes the interactive report URL when provided", async () => {
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

    expect(result).toBe(true);
    expect(mocks.notifyOwner).toHaveBeenCalledOnce();
    expect(mocks.notifyOwner.mock.calls[0][0].content).toContain(
      "https://example.com/interactive/123"
    );
  });
});
