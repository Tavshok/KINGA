/**
 * KINGA Claim Reports Router
 * Extracted from server/routers.ts for maintainability — Aug 2026.
 * Report generation, access control, and download procedures.
 */
import { REPORT_ACCESS } from "../reporting/reportDefinitions";
import { canAccessReport } from "./reporting";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getClaimById, createAuditEntry } from "../db";
import { claims } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { isAdminRole } from "@shared/role-permissions";

async function requireReportTenantClaim(claimId: string, tenantId: string | null | undefined) {
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  }
  const numericClaimId = Number(claimId);
  if (!Number.isInteger(numericClaimId) || numericClaimId <= 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [claim] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.id, numericClaimId), eq(claims.tenantId, tenantId)))
    .limit(1);
  if (!claim) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
  }
  return claim;
}

function requireReportTenant(ctx: { user?: { tenantId?: string | null } }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

export const claimReportsRouter = router({
  /**
   * Validate Report Data
   * 
   * Validates claim intelligence completeness before report generation.
   * 
   * @param claimId - ID of the claim to validate
   * @param role - Report role (insurer, assessor, regulatory)
   * @returns Validation report with completeness score and errors/warnings
   */
  validate: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      role: z.enum(['insurer', 'assessor', 'regulatory']),
    }))
    .query(async ({ input, ctx }) => {
      // Check permissions
      const { hasPermission } = await import('../rbac');
      if (!isAdminRole(ctx.user.role) && !hasPermission(ctx.user, 'viewAllClaims')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }

      await requireReportTenantClaim(input.claimId, ctx.user.tenantId);

      const { aggregateClaimIntelligence } = await import('../report-intelligence-aggregator');
      const { getValidationReport } = await import('../report-validation-service');

      const intelligence = await aggregateClaimIntelligence(input.claimId);
      const validationReport = getValidationReport(intelligence, input.role);

      return validationReport;
    }),

  /**
   * Generate Report PDF
   * 
   * Generates a professional PDF report for a claim.
   * 
   * @param claimId - ID of the claim
   * @param role - Report role (insurer, assessor, regulatory)
   * @param includeVisualizations - Whether to include charts and gauges
   * @param includeSupportingEvidence - Whether to include damage photos
   * @returns PDF buffer as base64 string
   */
  generate: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      role: z.enum(['insurer', 'assessor', 'regulatory']),
      includeVisualizations: z.boolean().default(true),
      includeSupportingEvidence: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check permissions
      const { hasPermission } = await import('../rbac');
      if (!isAdminRole(ctx.user.role) && !hasPermission(ctx.user, 'viewAllClaims')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }

      await requireReportTenantClaim(input.claimId, ctx.user.tenantId);

      const { aggregateClaimIntelligence } = await import('../report-intelligence-aggregator');
      const { generateReportNarrative } = await import('../report-narrative-generator');
      const { generateReportVisualizations } = await import('../report-visualization-generator');
      const { generateReportPDF } = await import('../report-pdf-generator');
      const { validateReportData } = await import('../report-validation-service');

      // Aggregate intelligence
      const intelligence = await aggregateClaimIntelligence(input.claimId);

      // Validate data
      const validation = validateReportData(intelligence, input.role);
      if (!validation.isValid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Report validation failed: ${validation.errors.join(', ')}`,
        });
      }

       // Generate narrative
      const narrative = await generateReportNarrative(intelligence, input.role);
      // ── Stage 31: Pre-export sanitisation ──────────────────────────────
      const sanitiseResult = sanitiseReportNarrative(narrative as unknown as Record<string, string>);
      if (!sanitiseResult.safe) {
        const blockErr = buildBlockError(sanitiseResult.blockedPhrases);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: blockErr.message,
          cause: blockErr,
        });
      }
      const safeNarrative = sanitiseResult.sanitised as unknown as typeof narrative;
      // ───────────────────────────────────────────────────────────────────
      // Generate visualizations
      const visualizations = generateReportVisualizations(intelligence);
      // Generate PDF
      const pdfBuffer = await generateReportPDF(
        intelligence,
        safeNarrative,
        visualizations,
        {
          role: input.role,
          includeVisualizations: input.includeVisualizations,
          includeSupportingEvidence: input.includeSupportingEvidence,
        }
      );
      // Return as base64
      return {
        pdf: pdfBuffer.toString('base64'),
        filename: `${intelligence.claim.claimNumber}-${input.role}-report.pdf`,
        sanitisationCorrections: sanitiseResult.corrections,
      };
    }),

  /**
   * Create Report Snapshot
   * 
   * Creates an immutable snapshot of claim intelligence for versioning.
   * 
   * @param claimId - ID of the claim
   * @param reportType - Type of report (insurer, assessor, regulatory)
   * @returns Snapshot ID and version number
   */
  createSnapshot: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      reportType: z.enum(['insurer', 'assessor', 'regulatory']),
    }))
    .mutation(async ({ input, ctx }) => {
      const { canGenerateReport } = await import('../report-governance-service');
      const { createReportSnapshot } = await import('../report-snapshot-service');
      const { aggregateClaimIntelligence } = await import('../report-intelligence-aggregator');
      const tenantId = requireReportTenant(ctx);

      // Check permissions
      const permissionCheck = await canGenerateReport(ctx.user, input.claimId, input.reportType);
      if (!permissionCheck.allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: permissionCheck.reason });
      }

      // Aggregate intelligence
      const intelligence = await aggregateClaimIntelligence(input.claimId);

      // Create snapshot
      // Note: claimId from input is string, but DB expects number
      // generatedBy from ctx.user.id is string, but DB expects number
      const snapshot = await createReportSnapshot({
        claimId: input.claimId as any, // TODO: Fix type mismatch between string claim IDs and number DB schema
        intelligence,
        reportType: input.reportType,
        generatedBy: ctx.user.id as any, // TODO: Fix type mismatch between string user IDs and number DB schema
        tenantId,
      });

      return snapshot;
    }),

  /**
   * Generate PDF from Snapshot
   * 
   * Generates a PDF report from an existing snapshot.
   * 
   * @param snapshotId - ID of the snapshot
   * @param includeVisualizations - Whether to include charts
   * @param includeSupportingEvidence - Whether to include photos
   * @returns PDF report ID and download URL
   */
  generatePdfFromSnapshot: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      includeVisualizations: z.boolean().default(true),
      includeSupportingEvidence: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const { canAccessReport, auditReportAccess } = await import('../report-governance-service');
      const { getSnapshotById } = await import('../report-snapshot-service');
      const { storePdfReport } = await import('../pdf-storage-service');
      const { generateReportNarrative } = await import('../report-narrative-generator');
      const { generateReportVisualizations } = await import('../report-visualization-generator');
      const { generateReportPDF } = await import('../report-pdf-generator');
      const tenantId = requireReportTenant(ctx);

      // Check permissions
      const accessCheck = await canAccessReport(ctx.user, input.snapshotId);
      if (!accessCheck.allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: accessCheck.reason });
      }

      // Get snapshot
      const snapshot = await getSnapshotById(input.snapshotId);
      if (!snapshot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
      }

      // Cast intelligence data
      const intelligence = snapshot.intelligenceData as any;
      
       // Generate narrative and visualizations from snapshot
      const narrative = await generateReportNarrative(intelligence, snapshot.reportType);
      // ── Stage 31: Pre-export sanitisation ──────────────────────────────
      const sanitiseResult = sanitiseReportNarrative(narrative as unknown as Record<string, string>);
      if (!sanitiseResult.safe) {
        const blockErr = buildBlockError(sanitiseResult.blockedPhrases);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: blockErr.message,
          cause: blockErr,
        });
      }
      const safeNarrative = sanitiseResult.sanitised as unknown as typeof narrative;
      // ───────────────────────────────────────────────────────────────────
      const visualizations = generateReportVisualizations(intelligence);
      // Generate PDF
      const pdfBuffer = await generateReportPDF(
        intelligence,
        safeNarrative,
        visualizations,
        {
          role: snapshot.reportType,
          includeVisualizations: input.includeVisualizations,
          includeSupportingEvidence: input.includeSupportingEvidence,
        }
      );

      // Store PDF
      const pdfReport = await storePdfReport({
        snapshotId: input.snapshotId,
        pdfBuffer,
        tenantId,
      });

      // Audit access
      await auditReportAccess(
        pdfReport.id,
        'pdf',
        ctx.user,
        'create'
      );

      return pdfReport;
    }),

  /**
   * Get Interactive Report
   * 
   * Retrieves interactive report data for a snapshot.
   * 
   * @param snapshotId - ID of the snapshot
   * @param accessToken - Optional access token for shared reports
   * @returns Interactive report data with drill-down capabilities
   */
  getInteractiveReport: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      accessToken: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { canAccessReport, auditReportAccess, validateTenantIsolation } = await import('../report-governance-service');
      const { getSnapshotById } = await import('../report-snapshot-service');
      const { validateAccessToken } = await import('../report-linking-service');
      const tenantId = requireReportTenant(ctx);

      // If access token provided, validate it
      if (input.accessToken) {
        const tokenValidation = await validateAccessToken(
          input.accessToken,
          tenantId
        );
        if (!tokenValidation.isValid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid access token' });
        }
      } else {
        // Check permissions
        const accessCheck = await canAccessReport(ctx.user, input.snapshotId);
        if (!accessCheck.allowed) {
          throw new TRPCError({ code: 'FORBIDDEN', message: accessCheck.reason });
        }

        // Validate tenant isolation
        const tenantCheck = await validateTenantIsolation(ctx.user, input.snapshotId);
        if (!tenantCheck.valid) {
          throw new TRPCError({ code: 'FORBIDDEN', message: tenantCheck.reason });
        }
      }

      // Get snapshot
      const snapshot = await getSnapshotById(input.snapshotId);
      if (!snapshot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
      }

      // Audit access
      await auditReportAccess(
        input.snapshotId,
        'interactive',
        ctx.user,
        'view'
      );

      return snapshot;
    }),

  /**
   * Send Report Email
   * 
   * Sends a generated report via email to specified recipients.
   * 
   * @param snapshotId - ID of the report snapshot
   * @param pdfReportId - ID of the PDF report
   * @param recipients - Array of recipient email addresses
   * @returns Email delivery status
   */
  sendEmail: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      pdfReportId: z.string(),
      recipients: z.array(z.object({
        email: z.string().email(),
        name: z.string(),
      })).optional(),
      sendToStakeholders: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const { canAccessReport } = await import('../report-governance-service');
      const { getSnapshotById } = await import('../report-snapshot-service');
      const { getPdfReportById } = await import('../pdf-storage-service');
      const { sendReportEmail, sendReportToStakeholders, getReportStakeholders } = await import('../report-email-service');
      const tenantId = requireReportTenant(ctx);

      // Check permissions
      const accessCheck = await canAccessReport(ctx.user, input.snapshotId);
      if (!accessCheck.allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: accessCheck.reason });
      }

      // Get snapshot and PDF report
      const snapshot = await getSnapshotById(input.snapshotId);
      if (!snapshot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
      }

      const pdfReport = await getPdfReportById(input.pdfReportId);
      if (!pdfReport) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'PDF report not found' });
      }

      const intelligence = snapshot.intelligenceData as any;
      const claimNumber = intelligence.claim?.claimNumber || 'Unknown';

      let totalSent = 0;
      let totalFailed = 0;

      // Send to specified recipients
      if (input.recipients && input.recipients.length > 0) {
        for (const recipient of input.recipients) {
          const success = await sendReportEmail({
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            claimNumber,
            reportType: snapshot.reportType,
            pdfUrl: pdfReport.s3Url,
            generatedBy: ctx.user.name || 'System',
            tenantId,
          });

          if (success) {
            totalSent++;
          } else {
            totalFailed++;
          }
        }
      }

      // Send to stakeholders if requested
      if (input.sendToStakeholders) {
        const stakeholders = await getReportStakeholders(
          snapshot.claimId,
          snapshot.reportType,
          tenantId
        );

        const result = await sendReportToStakeholders(
          {
            claimNumber,
            reportType: snapshot.reportType,
            pdfUrl: pdfReport.s3Url,
            generatedBy: ctx.user.name || 'System',
            tenantId,
          },
          stakeholders
        );

        totalSent += result.sent;
        totalFailed += result.failed;
      }

      return {
        sent: totalSent,
        failed: totalFailed,
        message: `Successfully sent ${totalSent} emails${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
      };
    }),

  /**
   * Get Report Access History
   * 
   * Retrieves access audit trail for a report.
   * 
   * @param snapshotId - ID of the snapshot
   * @returns Access history with timestamps and user details
   */
  getAccessHistory: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const { getReportAccessHistory } = await import('../report-governance-service');
      const tenantId = requireReportTenant(ctx);

      const history = await getReportAccessHistory(
        input.snapshotId,
        tenantId,
        ctx.user
      );

      return history;
    }),
});
