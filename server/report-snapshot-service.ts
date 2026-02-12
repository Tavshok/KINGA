/**
 * Report Snapshot Service
 * 
 * Manages versioned snapshots of claim intelligence with cryptographic audit hashing
 * for the dual-layer reporting system.
 */

import crypto from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from './db';
import {
  reportSnapshots,
  type ReportSnapshot,
  type InsertReportSnapshot,
} from '../drizzle/schema';
import type { ClaimIntelligence } from './report-intelligence-aggregator';

/**
 * Parameters for creating a report snapshot
 */
export interface CreateSnapshotParams {
  claimId: number;
  intelligence: ClaimIntelligence;
  reportType: 'insurer' | 'assessor' | 'regulatory';
  generatedBy: number;
  tenantId: string;
}

/**
 * Create a new versioned snapshot of claim intelligence
 * 
 * @param params - Snapshot creation parameters
 * @returns Created snapshot with ID, version, and audit hash
 */
export async function createReportSnapshot(params: CreateSnapshotParams): Promise<{
  id: string;
  version: number;
  auditHash: string;
  generatedAt: Date;
}> {
  const { claimId, intelligence, reportType, generatedBy, tenantId } = params;
  
  // Get next version number for this claim and report type
  const latestVersion = await getLatestSnapshotVersion(claimId, reportType, tenantId);
  const version = latestVersion + 1;
  
  // Generate snapshot ID
  const timestamp = Date.now();
  const snapshotId = `SNAP-${claimId}-${reportType.toUpperCase()}-v${version}-${timestamp}`;
  
  // Calculate audit hash (SHA-256 of intelligence data)
  // Use deterministic JSON serialization (no whitespace, sorted keys)
  const intelligenceJson = JSON.stringify(intelligence, Object.keys(intelligence).sort(), 0);
  const auditHash = crypto
    .createHash('sha256')
    .update(intelligenceJson)
    .digest('hex');
  
  // Store snapshot in database
  const db = await getDb();
  await db!.insert(reportSnapshots).values({
    id: snapshotId,
    claimId,
    version,
    reportType,
    intelligenceData: intelligence as any,
    auditHash,
    generatedBy,
    generatedAt: new Date(),
    isImmutable: true,
    tenantId,
  });
  
  return {
    id: snapshotId,
    version,
    auditHash,
    generatedAt: new Date(),
  };
}

/**
 * Get the latest version number for a claim's report type
 * 
 * @param claimId - Claim ID
 * @param reportType - Report type (insurer, assessor, regulatory)
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @returns Latest version number (0 if no snapshots exist)
 */
export async function getLatestSnapshotVersion(
  claimId: number,
  reportType: 'insurer' | 'assessor' | 'regulatory',
  tenantId: string
): Promise<number> {
  const db = await getDb();
  
  const latestSnapshot = await db!
    .select({ version: reportSnapshots.version })
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.claimId, claimId),
        eq(reportSnapshots.reportType, reportType),
        eq(reportSnapshots.tenantId, tenantId)
      )
    )
    .orderBy(desc(reportSnapshots.version))
    .limit(1);
  
  return latestSnapshot.length > 0 ? latestSnapshot[0].version : 0;
}

/**
 * Get a snapshot by ID
 * 
 * @param snapshotId - Snapshot ID
 * @returns Snapshot or null if not found
 */
export async function getSnapshotById(snapshotId: string): Promise<ReportSnapshot | null> {
  const db = await getDb();
  
  const snapshots = await db!
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.id, snapshotId))
    .limit(1);
  
  return snapshots.length > 0 ? snapshots[0] : null;
}

/**
 * Get all snapshots for a claim
 * 
 * @param claimId - Claim ID
 * @param reportType - Optional report type filter
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @returns Array of snapshots ordered by version (newest first)
 */
export async function getSnapshotsForClaim(
  claimId: number,
  reportType?: 'insurer' | 'assessor' | 'regulatory',
  tenantId?: string
): Promise<ReportSnapshot[]> {
  const db = await getDb();
  
  const conditions = [eq(reportSnapshots.claimId, claimId)];
  
  if (reportType) {
    conditions.push(eq(reportSnapshots.reportType, reportType));
  }
  
  if (tenantId) {
    conditions.push(eq(reportSnapshots.tenantId, tenantId));
  }
  
  const snapshots = await db!
    .select()
    .from(reportSnapshots)
    .where(and(...conditions))
    .orderBy(desc(reportSnapshots.version));
  
  return snapshots;
}

/**
 * Verify the integrity of a snapshot by recalculating its audit hash
 * 
 * @param snapshotId - Snapshot ID
 * @returns true if hash matches (snapshot is intact), false if tampered
 * @throws Error if snapshot not found
 */
export async function verifySnapshotIntegrity(snapshotId: string): Promise<boolean> {
  const snapshot = await getSnapshotById(snapshotId);
  
  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }
  
  // Recalculate audit hash from stored intelligence data
  const intelligenceData = snapshot.intelligenceData as ClaimIntelligence;
  const intelligenceJson = JSON.stringify(
    intelligenceData,
    Object.keys(intelligenceData).sort(),
    0
  );
  const calculatedHash = crypto
    .createHash('sha256')
    .update(intelligenceJson)
    .digest('hex');
  
  // Compare with stored hash
  return calculatedHash === snapshot.auditHash;
}

/**
 * Get snapshot version history for a claim
 * 
 * @param claimId - Claim ID
 * @param reportType - Report type
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @returns Array of version metadata (without full intelligence data)
 */
export async function getSnapshotVersionHistory(
  claimId: number,
  reportType: 'insurer' | 'assessor' | 'regulatory',
  tenantId: string
): Promise<Array<{
  id: string;
  version: number;
  auditHash: string;
  generatedBy: number;
  generatedAt: Date;
}>> {
  const db = await getDb();
  
  const snapshots = await db!
    .select({
      id: reportSnapshots.id,
      version: reportSnapshots.version,
      auditHash: reportSnapshots.auditHash,
      generatedBy: reportSnapshots.generatedBy,
      generatedAt: reportSnapshots.generatedAt,
    })
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.claimId, claimId),
        eq(reportSnapshots.reportType, reportType),
        eq(reportSnapshots.tenantId, tenantId)
      )
    )
    .orderBy(desc(reportSnapshots.version));
  
  return snapshots;
}

/**
 * Check if a snapshot is immutable (cannot be modified)
 * 
 * @param snapshotId - Snapshot ID
 * @returns true if immutable, false otherwise
 */
export async function isSnapshotImmutable(snapshotId: string): Promise<boolean> {
  const snapshot = await getSnapshotById(snapshotId);
  
  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }
  
  return snapshot.isImmutable;
}

/**
 * Get the tenant ID for a snapshot (for access control)
 * 
 * @param snapshotId - Snapshot ID
 * @returns Tenant ID or null if snapshot not found
 */
export async function getTenantIdForSnapshot(snapshotId: string): Promise<string | null> {
  const snapshot = await getSnapshotById(snapshotId);
  return snapshot ? snapshot.tenantId : null;
}
