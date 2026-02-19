// @ts-nocheck
/**
 * Report Governance Service
 * 
 * Implements RBAC, multi-tenant isolation, and audit trail enforcement
 * for the dual-layer reporting system.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { reportSnapshots, pdfReports, reportAccessAudit } from '../drizzle/schema';
import { hasPermission } from './rbac';
import type { users } from '../drizzle/schema';

type User = typeof users.$inferSelect;

/**
 * Check if user has permission to access a report
 */
export async function canAccessReport(
  user: User,
  snapshotId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const db = await getDb();
  
  // Admin users can access all reports
  if (user.role === 'admin') {
    return { allowed: true };
  }
  
  // Get snapshot to check tenant
  const [snapshot] = await db!
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.id, snapshotId))
    .limit(1);
  
  if (!snapshot) {
    return { allowed: false, reason: 'Report not found' };
  }
  
  // Check tenant isolation
  if (snapshot.tenantId !== user.tenantId) {
    return { allowed: false, reason: 'Access denied: different tenant' };
  }
  
  // Check role-based permissions based on report type
  const reportType = snapshot.reportType;
  
  if (reportType === 'insurer') {
    if (!hasPermission(user, 'viewAllClaims')) {
      return { allowed: false, reason: 'Insufficient permissions for insurer reports' };
    }
  } else if (reportType === 'assessor') {
    if (!hasPermission(user, 'viewAllClaims')) {
      return { allowed: false, reason: 'Insufficient permissions for assessor reports' };
    }
  } else if (reportType === 'regulatory') {
    if (!hasPermission(user, 'viewAllClaims')) {
      return { allowed: false, reason: 'Insufficient permissions for regulatory reports' };
    }
  }
  
  return { allowed: true };
}

/**
 * Check if user can generate a report for a claim
 */
export async function canGenerateReport(
  user: User,
  claimId: string,
  reportType: 'insurer' | 'assessor' | 'regulatory'
): Promise<{ allowed: boolean; reason?: string }> {
  // Admin users can generate all reports
  if (user.role === 'admin') {
    return { allowed: true };
  }
  
  // Check role-based permissions
  if (reportType === 'insurer') {
    if (!hasPermission(user, 'viewAllClaims')) {
      return { allowed: false, reason: 'Insufficient permissions to generate insurer reports' };
    }
  } else if (reportType === 'assessor') {
    if (!hasPermission(user, 'viewAllClaims')) {
      return { allowed: false, reason: 'Insufficient permissions to generate assessor reports' };
    }
  } else if (reportType === 'regulatory') {
    if (!hasPermission(user, 'viewAllClaims')) {
      return { allowed: false, reason: 'Insufficient permissions to generate regulatory reports' };
    }
  }
  
  return { allowed: true };
}

/**
 * Enforce immutability of PDF reports
 */
export async function enforcePdfImmutability(
  pdfReportId: string,
  tenantId: string
): Promise<{ immutable: boolean; reason?: string }> {
  const db = await getDb();
  
  const [pdf] = await db!
    .select()
    .from(pdfReports)
    .where(
      and(
        eq(pdfReports.id, pdfReportId),
        eq(pdfReports.tenantId, tenantId)
      )
    )
    .limit(1);
  
  if (!pdf) {
    return { immutable: false, reason: 'PDF report not found' };
  }
  
  // Check if PDF has been soft-deleted
  if (pdf.deletedAt) {
    return { immutable: false, reason: 'PDF report has been deleted' };
  }
  
  // PDF reports are immutable - they cannot be modified after creation
  // Only soft deletion is allowed
  return { immutable: true };
}

/**
 * Audit report access
 */
export async function auditReportAccess(
  reportId: string,
  reportType: 'pdf' | 'interactive',
  user: User,
  accessType: 'view' | 'download' | 'export' | 'create',
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  const db = await getDb();
  
  await db!.insert(reportAccessAudit).values({
    reportId,
    reportType,
    accessedBy: user.id,
    accessType,
    accessedAt: new Date(),
    ipAddress: metadata?.ipAddress || null,
    userAgent: metadata?.userAgent || null,
    tenantId: user.tenantId || 'default',
  });
}

/**
 * Get report access history for audit purposes
 */
export async function getReportAccessHistory(
  reportId: string,
  tenantId: string,
  user: User
): Promise<Array<{
  id: number;
  reportType: 'pdf' | 'interactive';
  accessedBy: number;
  accessType: 'view' | 'download' | 'export' | 'create';
  accessedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}>> {
  // Only admin and users with viewAllClaims permission can view access history
  if (user.role !== 'admin' && !hasPermission(user, 'viewAllClaims')) {
    return [];
  }
  
  const db = await getDb();
  
  const history = await db!
    .select()
    .from(reportAccessAudit)
    .where(
      and(
        eq(reportAccessAudit.reportId, reportId),
        eq(reportAccessAudit.tenantId, tenantId)
      )
    );
  
  return history;
}

/**
 * Validate tenant isolation for report operations
 */
export async function validateTenantIsolation(
  user: User,
  snapshotId: string
): Promise<{ valid: boolean; reason?: string }> {
  // Admin users bypass tenant isolation
  if (user.role === 'admin') {
    return { valid: true };
  }
  
  const db = await getDb();
  
  const [snapshot] = await db!
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.id, snapshotId))
    .limit(1);
  
  if (!snapshot) {
    return { valid: false, reason: 'Snapshot not found' };
  }
  
  if (snapshot.tenantId !== user.tenantId) {
    return { valid: false, reason: 'Tenant mismatch: access denied' };
  }
  
  return { valid: true };
}

/**
 * Check if a snapshot can be modified (version control)
 */
export async function canModifySnapshot(
  snapshotId: string,
  tenantId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const db = await getDb();
  
  const [snapshot] = await db!
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.id, snapshotId),
        eq(reportSnapshots.tenantId, tenantId)
      )
    )
    .limit(1);
  
  if (!snapshot) {
    return { allowed: false, reason: 'Snapshot not found' };
  }
  
  // Snapshots are immutable - they cannot be modified after creation
  // Only new versions can be created
  return { allowed: false, reason: 'Snapshots are immutable. Create a new version instead.' };
}

/**
 * Enforce report retention policy
 */
export async function enforceRetentionPolicy(
  snapshotId: string,
  tenantId: string,
  retentionDays: number = 2555 // ~7 years default for insurance compliance
): Promise<{ shouldRetain: boolean; reason?: string }> {
  const db = await getDb();
  
  const [snapshot] = await db!
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.id, snapshotId),
        eq(reportSnapshots.tenantId, tenantId)
      )
    )
    .limit(1);
  
  if (!snapshot) {
    return { shouldRetain: false, reason: 'Snapshot not found' };
  }
  
  const generatedAt = new Date(snapshot.generatedAt);
  const now = new Date();
  const daysSinceGeneration = Math.floor((now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceGeneration > retentionDays) {
    return { shouldRetain: false, reason: `Retention period expired (${retentionDays} days)` };
  }
  
  return { shouldRetain: true };
}
