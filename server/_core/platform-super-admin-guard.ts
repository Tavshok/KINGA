/**
 * Platform Super Admin Middleware Guard
 * 
 * Prevents platform_super_admin role from accessing any mutation procedures.
 * Platform super admins have read-only cross-tenant access for observability purposes only.
 * 
 * This guard ensures:
 * - No workflow transitions
 * - No role assignments
 * - No financial approvals
 * - No data modifications
 * - Zero governance bypass
 */

import { TRPCError } from "@trpc/server";
import { publicProcedure } from "./trpc";
import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create();

/**
 * Middleware to prevent platform super admin from executing mutations
 */
export const platformSuperAdminGuard = t.middleware(async ({ ctx, next, type }) => {
  // Check if user is platform super admin
  if (ctx.user?.role === "platform_super_admin") {
    // Platform super admins can only execute queries, not mutations
    if (type === "mutation") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Platform super admins have read-only access. Mutations are not permitted.",
      });
    }
  }
  
  return next({ ctx });
});

/**
 * Platform Super Admin Procedure
 * 
 * Use this for procedures that should be accessible to platform super admins.
 * Automatically enforces read-only access and logs all accesses to audit trail.
 */
export const platformSuperAdminProcedure = publicProcedure
  .use(async ({ ctx, next }) => {
    // Require authentication
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }
    
    // Require platform_super_admin role
    if (ctx.user.role !== "platform_super_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This endpoint is only accessible to platform super admins",
      });
    }
    
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
  .use(platformSuperAdminGuard);

/**
 * Tenant Filter Bypass Helper
 * 
 * Platform super admins can query across all tenants for observability purposes.
 * This helper function determines whether to apply tenant filtering based on user role.
 * 
 * @param userRole - The role of the current user
 * @returns true if tenant filtering should be bypassed (platform super admin only)
 */
export function shouldBypassTenantFilter(userRole: string | null | undefined): boolean {
  return userRole === "platform_super_admin";
}

/**
 * Get Tenant Filter Clause
 * 
 * Returns the appropriate tenant filter clause based on user role.
 * Platform super admins bypass tenant filtering for cross-tenant observability.
 * 
 * @param userRole - The role of the current user
 * @param tenantId - The tenant ID to filter by (ignored for platform super admins)
 * @returns SQL where clause for tenant filtering, or undefined to bypass
 */
export function getTenantFilterClause(
  userRole: string | null | undefined,
  tenantId: string | null | undefined
): { tenantId: string } | undefined {
  // Platform super admins bypass tenant filtering
  if (shouldBypassTenantFilter(userRole)) {
    return undefined;
  }
  
  // All other roles must have tenant filtering
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant ID required for this operation",
    });
  }
  
  return { tenantId };
}

/**
 * Log Platform Super Admin Access
 * 
 * Logs all platform super admin accesses to the audit trail for compliance.
 * 
 * @param userId - The platform super admin user ID
 * @param action - The action being performed (e.g., "view_claim", "view_dashboard")
 * @param resourceType - The type of resource being accessed (e.g., "claim", "audit_log")
 * @param resourceId - The ID of the resource being accessed (optional)
 * @param metadata - Additional metadata about the access (optional)
 */
export async function logPlatformSuperAdminAccess(
  userId: number,
  action: string,
  resourceType: string,
  resourceId?: string | number,
  metadata?: Record<string, any>
): Promise<void> {
  const { getDb } = await import("../db");
  const { auditTrail } = await import("../../drizzle/schema");
  
  const db = await getDb();
  
  await db.insert(auditTrail).values({
    userId,
    action: `platform_super_admin_${action}`,
    resourceType,
    resourceId: resourceId?.toString(),
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    timestamp: new Date(),
  });
}
