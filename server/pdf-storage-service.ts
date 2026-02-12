/**
 * PDF Storage Service
 * 
 * Manages PDF report storage in S3 with immutability enforcement and metadata tracking
 * for the dual-layer reporting system.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './db';
import {
  pdfReports,
  reportSnapshots,
  type PdfReport,
  type InsertPdfReport,
} from '../drizzle/schema';
import { storagePut } from './storage';
import { getSnapshotById, isSnapshotImmutable } from './report-snapshot-service';

/**
 * Parameters for storing a PDF report
 */
export interface StorePdfParams {
  snapshotId: string;
  pdfBuffer: Buffer;
  tenantId: string;
}

/**
 * Store a PDF report in S3 and create database metadata record
 * 
 * @param params - PDF storage parameters
 * @returns PDF report metadata with S3 URL
 * @throws Error if snapshot is not immutable or doesn't exist
 */
export async function storePdfReport(params: StorePdfParams): Promise<{
  id: string;
  s3Url: string;
  fileSizeBytes: number;
}> {
  const { snapshotId, pdfBuffer, tenantId } = params;
  
  // Verify snapshot exists and is immutable
  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }
  
  if (!snapshot.isImmutable) {
    throw new Error(`Snapshot ${snapshotId} is not immutable - cannot generate PDF`);
  }
  
  // Verify tenant ID matches (multi-tenant isolation)
  if (snapshot.tenantId !== tenantId) {
    throw new Error(`Tenant ID mismatch for snapshot ${snapshotId}`);
  }
  
  // Generate PDF ID and S3 key
  const timestamp = Date.now();
  const pdfId = `PDF-${snapshotId}-${timestamp}`;
  const s3Key = `reports/pdf/${tenantId}/${snapshot.claimId}/${pdfId}.pdf`;
  
  // Upload to S3
  const { url: s3Url } = await storagePut(s3Key, pdfBuffer, 'application/pdf');
  
  // Store metadata in database
  const db = await getDb();
  await db!.insert(pdfReports).values({
    id: pdfId,
    snapshotId,
    s3Url,
    fileSizeBytes: pdfBuffer.length,
    generatedAt: new Date(),
    deletedAt: null,
    tenantId,
  });
  
  return {
    id: pdfId,
    s3Url,
    fileSizeBytes: pdfBuffer.length,
  };
}

/**
 * Get PDF report metadata by ID
 * 
 * @param pdfId - PDF report ID
 * @returns PDF report metadata or null if not found
 */
export async function getPdfReportById(pdfId: string): Promise<PdfReport | null> {
  const db = await getDb();
  
  const pdfs = await db!
    .select()
    .from(pdfReports)
    .where(eq(pdfReports.id, pdfId))
    .limit(1);
  
  return pdfs.length > 0 ? pdfs[0] : null;
}

/**
 * Get PDF report by snapshot ID
 * 
 * @param snapshotId - Snapshot ID
 * @returns PDF report metadata or null if not found
 */
export async function getPdfReportBySnapshotId(snapshotId: string): Promise<PdfReport | null> {
  const db = await getDb();
  
  const pdfs = await db!
    .select()
    .from(pdfReports)
    .where(eq(pdfReports.snapshotId, snapshotId))
    .limit(1);
  
  return pdfs.length > 0 ? pdfs[0] : null;
}

/**
 * Check if a PDF report exists for a snapshot
 * 
 * @param snapshotId - Snapshot ID
 * @returns true if PDF exists, false otherwise
 */
export async function pdfExistsForSnapshot(snapshotId: string): Promise<boolean> {
  const pdf = await getPdfReportBySnapshotId(snapshotId);
  return pdf !== null && pdf.deletedAt === null;
}

/**
 * Soft delete a PDF report (mark as deleted without removing from S3)
 * 
 * @param pdfId - PDF report ID
 * @throws Error if PDF not found
 */
export async function softDeletePdfReport(pdfId: string): Promise<void> {
  const pdf = await getPdfReportById(pdfId);
  
  if (!pdf) {
    throw new Error(`PDF report ${pdfId} not found`);
  }
  
  const db = await getDb();
  await db!
    .update(pdfReports)
    .set({ deletedAt: new Date() })
    .where(eq(pdfReports.id, pdfId));
}

/**
 * Get all PDF reports for a claim (via snapshots)
 * 
 * @param claimId - Claim ID
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @returns Array of PDF report metadata
 */
export async function getPdfReportsForClaim(
  claimId: number,
  tenantId: string
): Promise<Array<PdfReport & { snapshotVersion: number; reportType: string }>> {
  const db = await getDb();
  
  const results = await db!
    .select({
      id: pdfReports.id,
      snapshotId: pdfReports.snapshotId,
      s3Url: pdfReports.s3Url,
      fileSizeBytes: pdfReports.fileSizeBytes,
      generatedAt: pdfReports.generatedAt,
      deletedAt: pdfReports.deletedAt,
      tenantId: pdfReports.tenantId,
      snapshotVersion: reportSnapshots.version,
      reportType: reportSnapshots.reportType,
    })
    .from(pdfReports)
    .innerJoin(reportSnapshots, eq(pdfReports.snapshotId, reportSnapshots.id))
    .where(
      and(
        eq(reportSnapshots.claimId, claimId),
        eq(pdfReports.tenantId, tenantId)
      )
    );
  
  return results;
}

/**
 * Verify PDF immutability by checking if the snapshot is still immutable
 * 
 * @param pdfId - PDF report ID
 * @returns true if PDF is immutable, false otherwise
 * @throws Error if PDF not found
 */
export async function verifyPdfImmutability(pdfId: string): Promise<boolean> {
  const pdf = await getPdfReportById(pdfId);
  
  if (!pdf) {
    throw new Error(`PDF report ${pdfId} not found`);
  }
  
  // Check if underlying snapshot is still immutable
  return await isSnapshotImmutable(pdf.snapshotId);
}

/**
 * Get the tenant ID for a PDF report (for access control)
 * 
 * @param pdfId - PDF report ID
 * @returns Tenant ID or null if PDF not found
 */
export async function getTenantIdForPdf(pdfId: string): Promise<string | null> {
  const pdf = await getPdfReportById(pdfId);
  return pdf ? pdf.tenantId : null;
}
