/**
 * Tenant Context Middleware
 * 
 * Extracts tenant ID from JWT and injects into request context.
 * Enforces tenant isolation at the middleware level.
 */

import { TRPCError } from '@trpc/server';
import type { TrpcContext } from './context';

export interface Tenant {
  id: string;
  name: string;
  tier: 'tier-basic' | 'tier-professional' | 'tier-enterprise';
  status: 'active' | 'inactive' | 'suspended';
  encryption_key_id: string | null;
}

/**
 * Extract tenant context from JWT and validate tenant access
 */
export async function extractTenantContext(ctx: TrpcContext): Promise<Tenant | null> {
  // If user is not authenticated, no tenant context
  if (!ctx.user) {
    return null;
  }
  
  // Admin users can access all tenants (for platform administration)
  if (ctx.user.role === 'admin') {
    return null;
  }
  
  // Extract tenant ID from user record
  const tenantId = ctx.user.tenantId;
  
  if (!tenantId) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'User record missing tenant ID'
    });
  }
  
  // Fetch tenant details from database
  const { getDb } = await import('../db');
  const db = await getDb();
  
  if (!db) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database connection not available'
    });
  }
  
  const { tenants } = await import('../../drizzle/schema');
  const { eq } = await import('drizzle-orm');
  
  const tenantResult = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  
  if (tenantResult.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Tenant not found'
    });
  }
  
  const tenant = tenantResult[0];
  
  // Check tenant status
  if (tenant.status !== 'active') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Tenant is ${tenant.status}. Please contact support.`
    });
  }
  
  return {
    id: tenant.id,
    name: tenant.name,
    tier: tenant.tier as any,
    status: tenant.status as any,
    encryption_key_id: tenant.encryptionKeyId
  };
}

/**
 * Set PostgreSQL session variables for tenant context
 * This enables Row-Level Security (RLS) policies to work correctly
 */
export async function setTenantContext(tenantId: string, userId: string, userRole: string): Promise<void> {
  const { getDb } = await import('../db');
  const db = await getDb();
  
  if (!db) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database connection not available'
    });
  }
  
  // Set session variables for RLS policies
  await db.execute(`SET app.current_tenant = '${tenantId}'`);
  await db.execute(`SET app.current_user_id = '${userId}'`);
  await db.execute(`SET app.current_user_role = '${userRole}'`);
  
  // Set search_path to tenant schema (if using schema-per-tenant)
  // Uncomment when schema-per-tenant is implemented:
  // await db.execute(`SET search_path TO tenant_${tenantId}, public`);
}

/**
 * Validate that the requested resource belongs to the current tenant
 * Prevents cross-tenant data access attempts
 */
export function validateTenantAccess(resourceTenantId: string, contextTenantId: string): void {
  if (resourceTenantId !== contextTenantId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied: resource belongs to a different tenant'
    });
  }
}

/**
 * Middleware to enforce tenant context on all protected procedures
 */
export function requireTenantContext() {
  return async (ctx: TrpcContext & { tenant?: Tenant }) => {
    if (!ctx.tenant) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Tenant context required for this operation'
      });
    }
    
    // Set tenant context in database session
    await setTenantContext(ctx.tenant.id, String(ctx.user!.id), ctx.user!.role);
    
    return ctx;
  };
}

/**
 * Get tenant-specific encryption key for data encryption
 */
export async function getTenantEncryptionKey(tenantId: string): Promise<string> {
  const { getDb } = await import('../db');
  const db = await getDb();
  
  if (!db) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database connection not available'
    });
  }
  
  const { tenants } = await import('../../drizzle/schema');
  const { eq } = await import('drizzle-orm');
  
  const tenantResult = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  
  if (tenantResult.length === 0 || !tenantResult[0].encryptionKeyId) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Tenant encryption key not found'
    });
  }
  
  return tenantResult[0].encryptionKeyId;
}

/**
 * Get tenant-specific ClickHouse connection for analytics
 */
export function getTenantAnalyticsConnection(tenantId: string): {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
} {
  // In production, these would come from Kubernetes service discovery
  return {
    host: `clickhouse.analytics-${tenantId}.svc.cluster.local`,
    port: 8123,
    database: tenantId,
    username: `${tenantId}_user`,
    password: process.env[`CLICKHOUSE_PASSWORD_${tenantId.toUpperCase()}`] || process.env.CLICKHOUSE_PASSWORD || ''
  };
}

/**
 * Get tenant-specific S3 bucket names
 */
export function getTenantS3Buckets(tenantId: string): {
  claims: string;
  documents: string;
  exports: string;
} {
  return {
    claims: `kinga-${tenantId}-claims`,
    documents: `kinga-${tenantId}-documents`,
    exports: `kinga-${tenantId}-exports`
  };
}
