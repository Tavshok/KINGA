import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateComplianceReport, formatComplianceReportAsMarkdown } from "../compliance-report-generator";

/**
 * Compliance Router
 * 
 * Provides endpoints for generating compliance audit trail reports.
 */
export const complianceRouter = router({
  /**
   * Generate a compliance report for a specific period
   */
  generateReport: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        includeExecutiveOverrides: z.boolean().optional().default(true),
        includeFraudFlags: z.boolean().optional().default(true),
        format: z.enum(["json", "markdown"]).optional().default("json"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      // Only executives and admins can generate compliance reports
      if (ctx.user.role !== "admin" && (ctx.user as any).insurerRole !== "executive") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only executives and administrators can generate compliance reports",
        });
      }

      try {
        const reportData = await generateComplianceReport({
          tenantId,
          startDate: input.startDate,
          endDate: input.endDate,
          includeExecutiveOverrides: input.includeExecutiveOverrides,
          includeFraudFlags: input.includeFraudFlags,
        });

        if (input.format === "markdown") {
          const markdown = formatComplianceReportAsMarkdown(reportData);
          return {
            success: true,
            format: "markdown",
            content: markdown,
            metadata: reportData.reportMetadata,
          };
        }

        return {
          success: true,
          format: "json",
          data: reportData,
        };
      } catch (error: any) {
        console.error("Error generating compliance report:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate compliance report",
        });
      }
    }),

  /**
   * Get scheduled compliance reports
   */
  getScheduledReports: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

    // TODO: Implement scheduled reports tracking
    return {
      success: true,
      data: [
        {
          id: 1,
          name: "Monthly Compliance Report",
          frequency: "monthly",
          lastGenerated: new Date().toISOString(),
          nextScheduled: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          enabled: true,
        },
      ],
    };
  }),
});
