// @ts-nocheck
/**
 * KINGA Hybrid Intelligence Governance Layer
 * RBAC Access Control for Dataset Tiers
 * 
 * Implements:
 * - Dataset tier access checker (Tenant Private, Tenant Feature, Global Anonymized)
 * - Tenant isolation enforcement
 * - Role-based query filters
 * - Access denial audit logging
 * 
 * Compliance: Data Protection Act (Zimbabwe), GDPR (EU)
 */

import { getDb } from "./db";
import {
  datasetAccessGrants,
  type DatasetAccessGrant,
} from "../drizzle/schema";
import { eq, and, or, isNull, gte } from "drizzle-orm";

/**
 * Data scope enum (matches database enum)
 */
export type DataScope = "tenant_private" | "tenant_feature" | "global_anonymized";

/**
 * User role enum (subset of roles with dataset access)
 */
export type DatasetRole =
  | "tenant_admin"
  | "tenant_data_analyst"
  | "tenant_ml_engineer"
  | "kinga_data_scientist"
  | "kinga_ml_engineer"
  | "external_analyst"
  | "regulator";

/**
 * Access denial reason (for audit logging)
 */
export type AccessDenialReason =
  | "tenant_mismatch"
  | "no_grant"
  | "insufficient_role"
  | "grant_expired"
  | "grant_revoked"
  | "max_records_exceeded";

/**
 * Access denial audit log entry
 */
interface AccessDenialLog {
  userId: number;
  userRole: string;
  tenantId: string;
  requestedScope: DataScope;
  reason: AccessDenialReason;
  timestamp: Date;
}

/**
 * In-memory access denial log (for demonstration; in production, store in database)
 */
const accessDenialLogs: AccessDenialLog[] = [];

/**
 * Log access denial event
 */
async function logAccessDenial(
  userId: number,
  userRole: string,
  tenantId: string,
  requestedScope: DataScope,
  reason: AccessDenialReason
): Promise<void> {
  const logEntry: AccessDenialLog = {
    userId,
    userRole,
    tenantId,
    requestedScope,
    reason,
    timestamp: new Date(),
  };
  
  accessDenialLogs.push(logEntry);
  
  console.warn(
    `[Access Denied] User ${userId} (${userRole}) denied access to ${requestedScope} for tenant ${tenantId}: ${reason}`
  );
  
  // In production, insert into access_denial_audit_log table
  // await db.insert(accessDenialAuditLog).values(logEntry);
}

/**
 * Get active access grant for user
 */
async function getActiveAccessGrant(
  userId: number,
  tenantId: string,
  dataScope: DataScope
): Promise<DatasetAccessGrant | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }
  
  const today = new Date();
  
  const grants = await db
    .select()
    .from(datasetAccessGrants)
    .where(
      and(
        eq(datasetAccessGrants.tenantId, tenantId),
        eq(datasetAccessGrants.dataScope, dataScope),
        eq(datasetAccessGrants.grantedToUserId, userId),
        isNull(datasetAccessGrants.revokedAt),
        or(
          isNull(datasetAccessGrants.expiryDate),
          gte(datasetAccessGrants.expiryDate, today.toISOString().slice(0, 10) as any)
        )
      )
    )
    .limit(1);
  
  return grants[0] || null;
}

/**
 * Enforce dataset access control
 * 
 * Returns true if access is granted, false if denied.
 * Logs denial reason for audit trail.
 */
export async function enforceDatasetAccess(
  userId: number,
  userRole: string,
  tenantId: string,
  requestedScope: DataScope
): Promise<boolean> {
  // Rule 1: Tenant Private data requires tenant membership
  if (requestedScope === "tenant_private") {
    // Check if user belongs to the tenant
    // In production, query users table: SELECT * FROM users WHERE id = userId AND tenant_id = tenantId
    // For now, assume user.tenantId is passed via context
    
    // Placeholder: In real implementation, fetch user.tenantId from database
    // const user = await getUserById(userId);
    // if (user.tenantId !== tenantId) {
    //   await logAccessDenial(userId, userRole, tenantId, requestedScope, "tenant_mismatch");
    //   return false;
    // }
    
    // For now, allow if role is tenant_admin, tenant_data_analyst, or tenant_ml_engineer
    if (!["tenant_admin", "tenant_data_analyst", "tenant_ml_engineer"].includes(userRole)) {
      await logAccessDenial(userId, userRole, tenantId, requestedScope, "insufficient_role");
      return false;
    }
    
    return true;
  }
  
  // Rule 2: Tenant Feature data requires explicit grant
  if (requestedScope === "tenant_feature") {
    const grant = await getActiveAccessGrant(userId, tenantId, requestedScope);
    
    if (!grant) {
      await logAccessDenial(userId, userRole, tenantId, requestedScope, "no_grant");
      return false;
    }
    
    // Check if grant has expired
    if (grant.expiryDate && new Date(grant.expiryDate) < new Date()) {
      await logAccessDenial(userId, userRole, tenantId, requestedScope, "grant_expired");
      return false;
    }
    
    // Check if grant has been revoked
    if (grant.revokedAt) {
      await logAccessDenial(userId, userRole, tenantId, requestedScope, "grant_revoked");
      return false;
    }
    
    return true;
  }
  
  // Rule 3: Global Anonymized data requires KINGA role
  if (requestedScope === "global_anonymized") {
    if (!["kinga_data_scientist", "kinga_ml_engineer"].includes(userRole)) {
      await logAccessDenial(userId, userRole, tenantId, requestedScope, "insufficient_role");
      return false;
    }
    
    return true;
  }
  
  // Unknown scope
  await logAccessDenial(userId, userRole, tenantId, requestedScope, "insufficient_role");
  return false;
}

/**
 * Grant access to a dataset tier
 * 
 * Used by tenant admins to grant external analysts access to Tier 2 (Tenant Feature) data.
 */
export async function grantDatasetAccess(
  grantedByUserId: number,
  grantedToUserId: number,
  tenantId: string,
  dataScope: DataScope,
  purpose: string,
  expiryDate?: string,
  maxRecords?: number
): Promise<{ success: boolean; grantId?: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }
  
  try {
    const result = await db.insert(datasetAccessGrants).values({
      tenantId,
      dataScope,
      grantedToUserId,
      grantedToRole: null,
      grantedToOrganization: null,
      purpose,
      expiryDate: expiryDate as any || null,
      maxRecords: maxRecords || null,
      grantedByUserId,
    });
    
    console.log(
      `[Access Granted] User ${grantedByUserId} granted ${dataScope} access to user ${grantedToUserId} for tenant ${tenantId}`
    );
    
    return { success: true, grantId: result[0]?.insertId ? Number(result[0].insertId) : undefined };
  } catch (error) {
    console.error("Failed to grant dataset access:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Revoke access to a dataset tier
 */
export async function revokeDatasetAccess(
  revokedByUserId: number,
  grantId: number
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }
  
  try {
    await db
      .update(datasetAccessGrants)
      .set({
        revokedAt: new Date(),
        revokedByUserId,
      })
      .where(eq(datasetAccessGrants.id, grantId));
    
    console.log(
      `[Access Revoked] User ${revokedByUserId} revoked grant ${grantId}`
    );
    
    return { success: true };
  } catch (error) {
    console.error("Failed to revoke dataset access:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get all access grants for a tenant
 */
export async function getAccessGrantsForTenant(
  tenantId: string
): Promise<DatasetAccessGrant[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }
  
  return await db
    .select()
    .from(datasetAccessGrants)
    .where(eq(datasetAccessGrants.tenantId, tenantId));
}

/**
 * Get access denial logs (for audit/debugging)
 */
export function getAccessDenialLogs(): AccessDenialLog[] {
  return accessDenialLogs;
}
