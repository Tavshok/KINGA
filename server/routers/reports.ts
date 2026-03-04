// @ts-nocheck
/**
 * Reports Router
 * 
 * Generates PDF reports with optimized database queries and performance monitoring.
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { claims, aiAssessments, users, workflowAuditTrail, claimInvolvementTracking } from '../../drizzle/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { parsePhysicsAnalysis } from '../../shared/physics-types';
import PDFDocument from 'pdfkit';

/**
 * Helper function to safely convert any value to number
 */
function safeNumber(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Helper function to format currency
 */
function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Helper function to format date
 */
function formatDate(date: Date | string | null): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Generate PDF buffer from structured data
 */
async function generatePDFBuffer(data: any, reportType: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text(reportType, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Content based on report type
    if (reportType === 'Executive Report') {
      doc.fontSize(14).text('Executive Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Total Claims: ${data.totalClaims}`);
      doc.text(`Completed Claims: ${data.completedClaims}`);
      doc.text(`Pending Claims: ${data.pendingClaims}`);
      doc.text(`Average Processing Time: ${data.avgProcessingDays} days`);
      doc.text(`Total Approved Amount: ${formatCurrency(data.totalApprovedAmount)}`);
      doc.text(`Fraud Detection Rate: ${data.fraudDetectionRate}%`);
      doc.moveDown(2);

      doc.fontSize(14).text('Key Performance Indicators', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      data.kpis.forEach((kpi: any) => {
        doc.text(`${kpi.name}: ${kpi.value}`);
      });
    } else if (reportType === 'Financial Summary') {
      doc.fontSize(14).text('Financial Overview', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Total Claims Value: ${formatCurrency(data.totalClaimsValue)}`);
      doc.text(`Total Approved Amount: ${formatCurrency(data.totalApprovedAmount)}`);
      doc.text(`Total Rejected Amount: ${formatCurrency(data.totalRejectedAmount)}`);
      doc.text(`Average Claim Value: ${formatCurrency(data.avgClaimValue)}`);
      doc.text(`Approval Rate: ${data.approvalRate}%`);
      doc.moveDown(2);

      doc.fontSize(14).text('Claims by Value Band', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      data.valueBands.forEach((band: any) => {
        doc.text(`${band.range}: ${band.count} claims (${formatCurrency(band.totalValue)})`);
      });
    } else if (reportType === 'Audit Trail Report') {
      doc.fontSize(14).text('Audit Trail Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Total Audit Events: ${data.totalEvents}`);
      doc.text(`Executive Overrides: ${data.executiveOverrides}`);
      doc.text(`Role Changes: ${data.roleChanges}`);
      doc.text(`Segregation Violations: ${data.segregationViolations}`);
      doc.moveDown(2);

      doc.fontSize(14).text('Recent Audit Events', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      data.recentEvents.forEach((event: any) => {
        doc.text(`[${formatDate(event.timestamp)}] ${event.action} by ${event.user}`);
      });
    }

    doc.end();
  });
}

export const reportsRouter = router({
  /**
   * Generate Executive Report
   * 
   * Comprehensive overview of claims processing, KPIs, and performance metrics.
   */
  generateExecutiveReport: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        tenantId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const startTime = Date.now();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const tenantId = input.tenantId || ctx.user.tenantId;

      console.log('[Reports] Generating Executive Report...');

      try {
        // Single comprehensive query for all executive metrics
        const dbStartTime = Date.now();
        
        const metricsQuery = await db
          .select({
            totalClaims: sql<number>`COUNT(DISTINCT ${claims.id})`,
            completedClaims: sql<number>`SUM(CASE WHEN ${claims.status} = 'closed' THEN 1 ELSE 0 END)`,
            pendingClaims: sql<number>`SUM(CASE WHEN ${claims.status} IN ('submitted', 'under_review', 'pending_approval') THEN 1 ELSE 0 END)`,
            avgProcessingDays: sql<number>`AVG(CASE WHEN ${claims.closedAt} IS NOT NULL THEN DATEDIFF(${claims.closedAt}, ${claims.createdAt}) ELSE NULL END)`,
            totalApprovedAmount: sql<number>`SUM(CASE WHEN ${claims.status} = 'closed' THEN ${claims.finalApprovedAmount} ELSE 0 END)`,
            fraudDetected: sql<number>`COUNT(DISTINCT CASE WHEN ${aiAssessments.fraudRiskLevel} = 'high' THEN ${claims.id} ELSE NULL END)`,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(eq(claims.tenantId, tenantId));

        const dbEndTime = Date.now();
        const dbTime = dbEndTime - dbStartTime;

        console.log(`[Reports] DB query time: ${dbTime}ms`);

        if (dbTime > 100) {
          console.warn(`[Reports] WARNING: DB query time exceeded 100ms threshold: ${dbTime}ms`);
        }

        const metrics = metricsQuery[0];
        const totalClaims = safeNumber(metrics.totalClaims);
        const completedClaims = safeNumber(metrics.completedClaims);
        const pendingClaims = safeNumber(metrics.pendingClaims);
        const avgProcessingDays = safeNumber(metrics.avgProcessingDays, 0);
        const totalApprovedAmount = safeNumber(metrics.totalApprovedAmount);
        const fraudDetected = safeNumber(metrics.fraudDetected);
        const fraudDetectionRate = totalClaims > 0 ? ((fraudDetected / totalClaims) * 100).toFixed(2) : '0.00';

        // Structured JSON payload
        const reportData = {
          totalClaims,
          completedClaims,
          pendingClaims,
          avgProcessingDays: avgProcessingDays.toFixed(1),
          totalApprovedAmount,
          fraudDetectionRate,
          kpis: [
            { name: 'Completion Rate', value: totalClaims > 0 ? `${((completedClaims / totalClaims) * 100).toFixed(1)}%` : '0%' },
            { name: 'Average Claim Value', value: formatCurrency(completedClaims > 0 ? totalApprovedAmount / completedClaims : 0) },
            { name: 'Fraud Detection Rate', value: `${fraudDetectionRate}%` },
            { name: 'Processing Efficiency', value: `${avgProcessingDays.toFixed(1)} days` },
          ],
        };

        // Generate PDF
        const pdfBuffer = await generatePDFBuffer(reportData, 'Executive Report');

        const totalTime = Date.now() - startTime;
        console.log(`[Reports] Executive Report generated in ${totalTime}ms (DB: ${dbTime}ms, PDF: ${totalTime - dbTime}ms)`);

        return {
          success: true,
          pdfBuffer: pdfBuffer.toString('base64'),
          metadata: {
            reportType: 'executive',
            generatedAt: new Date().toISOString(),
            tenantId,
            totalClaims,
            dbQueryTime: dbTime,
            totalGenerationTime: totalTime,
          },
        };
      } catch (error) {
        console.error('[Reports] Executive Report generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate Executive Report',
          cause: error,
        });
      }
    }),

  /**
   * Generate Financial Summary
   * 
   * Detailed financial analysis of claims, approvals, and value distributions.
   */
  generateFinancialSummary: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        tenantId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const startTime = Date.now();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const tenantId = input.tenantId || ctx.user.tenantId;

      console.log('[Reports] Generating Financial Summary...');

      try {
        // Single comprehensive query for all financial metrics
        const dbStartTime = Date.now();
        
        const financialQuery = await db
          .select({
            totalClaimsValue: sql<number>`SUM(${claims.estimatedClaimValue})`,
            totalApprovedAmount: sql<number>`SUM(CASE WHEN ${claims.status} = 'closed' THEN ${claims.finalApprovedAmount} ELSE 0 END)`,
            totalRejectedAmount: sql<number>`SUM(CASE WHEN ${claims.status} = 'rejected' THEN ${claims.estimatedClaimValue} ELSE 0 END)`,
            avgClaimValue: sql<number>`AVG(${claims.estimatedClaimValue})`,
            approvedCount: sql<number>`COUNT(CASE WHEN ${claims.status} = 'closed' THEN 1 ELSE NULL END)`,
            totalCount: sql<number>`COUNT(*)`,
            // Value bands
            band0_5k: sql<number>`COUNT(CASE WHEN ${claims.estimatedClaimValue} < 5000 THEN 1 ELSE NULL END)`,
            band5_15k: sql<number>`COUNT(CASE WHEN ${claims.estimatedClaimValue} >= 5000 AND ${claims.estimatedClaimValue} < 15000 THEN 1 ELSE NULL END)`,
            band15_50k: sql<number>`COUNT(CASE WHEN ${claims.estimatedClaimValue} >= 15000 AND ${claims.estimatedClaimValue} < 50000 THEN 1 ELSE NULL END)`,
            band50k_plus: sql<number>`COUNT(CASE WHEN ${claims.estimatedClaimValue} >= 50000 THEN 1 ELSE NULL END)`,
            bandValue0_5k: sql<number>`SUM(CASE WHEN ${claims.estimatedClaimValue} < 5000 THEN ${claims.estimatedClaimValue} ELSE 0 END)`,
            bandValue5_15k: sql<number>`SUM(CASE WHEN ${claims.estimatedClaimValue} >= 5000 AND ${claims.estimatedClaimValue} < 15000 THEN ${claims.estimatedClaimValue} ELSE 0 END)`,
            bandValue15_50k: sql<number>`SUM(CASE WHEN ${claims.estimatedClaimValue} >= 15000 AND ${claims.estimatedClaimValue} < 50000 THEN ${claims.estimatedClaimValue} ELSE 0 END)`,
            bandValue50k_plus: sql<number>`SUM(CASE WHEN ${claims.estimatedClaimValue} >= 50000 THEN ${claims.estimatedClaimValue} ELSE 0 END)`,
          })
          .from(claims)
          .where(eq(claims.tenantId, tenantId));

        const dbEndTime = Date.now();
        const dbTime = dbEndTime - dbStartTime;

        console.log(`[Reports] DB query time: ${dbTime}ms`);

        if (dbTime > 100) {
          console.warn(`[Reports] WARNING: DB query time exceeded 100ms threshold: ${dbTime}ms`);
        }

        const financial = financialQuery[0];
        const totalClaimsValue = safeNumber(financial.totalClaimsValue);
        const totalApprovedAmount = safeNumber(financial.totalApprovedAmount);
        const totalRejectedAmount = safeNumber(financial.totalRejectedAmount);
        const avgClaimValue = safeNumber(financial.avgClaimValue);
        const approvedCount = safeNumber(financial.approvedCount);
        const totalCount = safeNumber(financial.totalCount);
        const approvalRate = totalCount > 0 ? ((approvedCount / totalCount) * 100).toFixed(2) : '0.00';

        // Structured JSON payload
        const reportData = {
          totalClaimsValue,
          totalApprovedAmount,
          totalRejectedAmount,
          avgClaimValue,
          approvalRate,
          valueBands: [
            { range: 'R0 - R5,000', count: safeNumber(financial.band0_5k), totalValue: safeNumber(financial.bandValue0_5k) },
            { range: 'R5,000 - R15,000', count: safeNumber(financial.band5_15k), totalValue: safeNumber(financial.bandValue5_15k) },
            { range: 'R15,000 - R50,000', count: safeNumber(financial.band15_50k), totalValue: safeNumber(financial.bandValue15_50k) },
            { range: 'R50,000+', count: safeNumber(financial.band50k_plus), totalValue: safeNumber(financial.bandValue50k_plus) },
          ],
        };

        // Generate PDF
        const pdfBuffer = await generatePDFBuffer(reportData, 'Financial Summary');

        const totalTime = Date.now() - startTime;
        console.log(`[Reports] Financial Summary generated in ${totalTime}ms (DB: ${dbTime}ms, PDF: ${totalTime - dbTime}ms)`);

        return {
          success: true,
          pdfBuffer: pdfBuffer.toString('base64'),
          metadata: {
            reportType: 'financial',
            generatedAt: new Date().toISOString(),
            tenantId,
            totalClaimsValue,
            dbQueryTime: dbTime,
            totalGenerationTime: totalTime,
          },
        };
      } catch (error) {
        console.error('[Reports] Financial Summary generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate Financial Summary',
          cause: error,
        });
      }
    }),

  /**
   * Generate Audit Trail Report
   * 
   * Comprehensive audit trail of workflow events, overrides, and role changes.
   */
  generateAuditTrailReport: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        tenantId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const startTime = Date.now();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const tenantId = input.tenantId || ctx.user.tenantId;

      console.log('[Reports] Generating Audit Trail Report...');

      try {
        // Single comprehensive query for all audit metrics
        const dbStartTime = Date.now();
        
        const auditQuery = await db
          .select({
            totalEvents: sql<number>`COUNT(*)`,
            executiveOverrides: sql<number>`SUM(CASE WHEN ${workflowAuditTrail.executiveOverride} = 1 THEN 1 ELSE 0 END)`,
            segregationViolations: sql<number>`COUNT(DISTINCT ${claimInvolvementTracking.claimId})`,
          })
          .from(workflowAuditTrail)
          .innerJoin(claims, eq(workflowAuditTrail.claimId, claims.id))
          .leftJoin(claimInvolvementTracking, eq(workflowAuditTrail.claimId, claimInvolvementTracking.claimId))
          .where(eq(claims.tenantId, tenantId));

        // Get recent audit events
        const recentEvents = await db
          .select({
            timestamp: workflowAuditTrail.createdAt,
            action: workflowAuditTrail.newState,
            user: users.name,
          })
          .from(workflowAuditTrail)
          .innerJoin(claims, eq(workflowAuditTrail.claimId, claims.id))
          .leftJoin(users, eq(workflowAuditTrail.userId, users.id))
          .where(eq(claims.tenantId, tenantId))
          .orderBy(desc(workflowAuditTrail.createdAt))
          .limit(10);

        const dbEndTime = Date.now();
        const dbTime = dbEndTime - dbStartTime;

        console.log(`[Reports] DB query time: ${dbTime}ms`);

        if (dbTime > 100) {
          console.warn(`[Reports] WARNING: DB query time exceeded 100ms threshold: ${dbTime}ms`);
        }

        const audit = auditQuery[0];
        const totalEvents = safeNumber(audit.totalEvents);
        const executiveOverrides = safeNumber(audit.executiveOverrides);
        const segregationViolations = safeNumber(audit.segregationViolations);

        // Structured JSON payload
        const reportData = {
          totalEvents,
          executiveOverrides,
          roleChanges: 0, // Placeholder - would need role_assignment_audit table
          segregationViolations,
          recentEvents: recentEvents.map((event) => ({
            timestamp: event.timestamp,
            action: event.action || 'Unknown',
            user: event.user || 'System',
          })),
        };

        // Generate PDF
        const pdfBuffer = await generatePDFBuffer(reportData, 'Audit Trail Report');

        const totalTime = Date.now() - startTime;
        console.log(`[Reports] Audit Trail Report generated in ${totalTime}ms (DB: ${dbTime}ms, PDF: ${totalTime - dbTime}ms)`);

        return {
          success: true,
          pdfBuffer: pdfBuffer.toString('base64'),
          metadata: {
            reportType: 'audit_trail',
            generatedAt: new Date().toISOString(),
            tenantId,
            totalEvents,
            dbQueryTime: dbTime,
            totalGenerationTime: totalTime,
          },
        };
      } catch (error) {
        console.error('[Reports] Audit Trail Report generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate Audit Trail Report',
          cause: error,
        });
      }
    }),
});
