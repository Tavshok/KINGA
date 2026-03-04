/**
 * Platform Super Admin Guard
 *
 * Middleware and utilities for platform super admin access control.
 * Platform super admins have read-only cross-tenant visibility with full audit logging.
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { auditTrail } from "../../drizzle/schema";

/**
 * Log a platform super admin access event to the audit trail.
 */
export async function logPlatformSuperAdminAccess(
  userId: number,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(auditTrail).values({
    claimId: 0, // Platform super admin audit entries are not claim-specific
    userId,
    action: `platform_super_admin_${action}`,
    entityType: resourceType,
    entityId: parseInt(resourceId, 10) || 0,
    changeDescription: metadata ? JSON.stringify(metadata) : null,
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  });
}

/**
 * tRPC middleware that enforces read-only access for platform super admins.
 * Queries are allowed; mutations are blocked.
 */
export function platformSuperAdminGuard(opts: {
  ctx: { user?: { id: number; role: string } | null };
  next: (args: { ctx: unknown }) => Promise<unknown>;
  type: "query" | "mutation" | "subscription";
  path: string;
  rawInput: unknown;
  meta: unknown;
}): Promise<unknown> {
  const { ctx, next, type } = opts;

  if (ctx.user?.role === "platform_super_admin" && type === "mutation") {
    return Promise.reject(
      new TRPCError({
        code: "FORBIDDEN",
        message: "Platform super admins have read-only access",
      })
    );
  }

  return next({ ctx });
}

/**
 * Returns true if the given role should bypass tenant-scoped filtering.
 */
export function shouldBypassTenantFilter(role: string): boolean {
  return role === "platform_super_admin";
}

/**
 * Returns the tenant filter clause for a given role.
 * Returns undefined for platform super admins (no tenant filter).
 */
export function getTenantFilterClause(
  role: string,
  tenantId: string
): { tenantId: string } | undefined {
  if (shouldBypassTenantFilter(role)) return undefined;
  return { tenantId };
}
