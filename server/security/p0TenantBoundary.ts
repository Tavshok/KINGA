/**
 * P0 Package 1 tenant-boundary guard.
 *
 * This module is intentionally narrow: it gives report, agency, and intelligence
 * procedures one fail-closed contract for session-derived tenant scope and the
 * explicit platform-super-admin exception required for system testing.
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { insurerTenants } from "../../drizzle/schema";
import { getDb } from "../db";
import { extractIp } from "../_core/trpc";
import { insertIsoAuditLog } from "../utils/audit-helpers";

export type P0ScopeContext = {
  user: { id: number; role: string; tenantId?: string | null } | null;
  req?: { headers?: Record<string, string | string[] | undefined> };
};

export type P0TenantScope = {
  tenantId: string;
  isPlatformSuperAdmin: boolean;
  isCrossTenant: boolean;
};

function denied(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

/**
 * Ordinary users are bound to ctx.user.tenantId. A platform super admin can use
 * another tenant only by supplying it explicitly; without it, their own session
 * tenant is used and foreign object IDs remain inaccessible.
 */
export function resolveP0TenantScope(
  ctx: P0ScopeContext,
  requestedTenantId: string | undefined,
  procedureName: string,
): P0TenantScope {
  if (!ctx.user) denied("Authentication is required for this operation.");
  const sessionTenantId = ctx.user.tenantId ?? null;
  const isPlatformSuperAdmin = ctx.user.role === "platform_super_admin";

  if (!isPlatformSuperAdmin) {
    if (!sessionTenantId) denied("Tenant context is required for this operation.");
    if (requestedTenantId && requestedTenantId !== sessionTenantId) {
      denied("Tenant selection does not match the authenticated session.");
    }
    return { tenantId: sessionTenantId, isPlatformSuperAdmin: false, isCrossTenant: false };
  }

  if (!requestedTenantId) {
    if (!sessionTenantId) {
      denied(`Explicit tenant selection is required for ${procedureName}.`);
    }
    return { tenantId: sessionTenantId, isPlatformSuperAdmin: true, isCrossTenant: false };
  }

  return {
    tenantId: requestedTenantId,
    isPlatformSuperAdmin: true,
    isCrossTenant: requestedTenantId !== sessionTenantId,
  };
}

/** Validates a tenant selected by a platform super admin against the tenant registry. */
export async function validateP0TenantScope(scope: P0TenantScope): Promise<void> {
  if (!scope.isPlatformSuperAdmin || !scope.isCrossTenant) return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const [tenant] = await db
    .select({ id: insurerTenants.id })
    .from(insurerTenants)
    .where(eq(insurerTenants.id, scope.tenantId))
    .limit(1);
  if (!tenant) denied("Selected tenant is not registered.");
}

/** Persist an auditable record for every platform-super-admin cross-tenant action. */
export async function auditP0CrossTenantAccess(
  ctx: P0ScopeContext,
  scope: P0TenantScope,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!scope.isPlatformSuperAdmin || !scope.isCrossTenant) return;
  if (!ctx.user) denied("Authentication is required for this operation.");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  await insertIsoAuditLog(db as any, {
    tenantId: scope.tenantId,
    userId: ctx.user.id,
    userRole: ctx.user.role,
    actionType: "view",
    resourceType: `p0_cross_tenant_${action}`.slice(0, 50),
    resourceId: resourceId.slice(0, 64),
    afterState: JSON.stringify({ selectedTenantId: scope.tenantId, action, ...metadata }),
    ipAddress: extractIp(ctx.req as any),
  });
}
