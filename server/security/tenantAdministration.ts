import { TRPCError } from "@trpc/server";
import { isAdminRole } from "../../shared/role-permissions";
import {
  auditP0CrossTenantAccess,
  resolveP0TenantScope,
  validateP0TenantScope,
} from "./p0TenantBoundary";

type TenantAdminContext = {
  user: { id: number; role: string; tenantId?: string | null };
  req?: { headers?: Record<string, string | string[] | undefined> };
};

/**
 * Guards a tenant-scoped administration action without making platform-super-admin
 * an implicit cross-tenant bypass. Legacy `admin` keeps its existing entitlement;
 * platform_super_admin must select a tenant through the Package 1 contract.
 */
export async function requireTenantAdministrationScope(
  ctx: TenantAdminContext,
  tenantId: string,
  action: string,
): Promise<void> {
  if (!isAdminRole(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage tenant configuration" });
  }

  if (ctx.user.role !== "platform_super_admin") return;

  const scope = resolveP0TenantScope(ctx, tenantId, `tenant.${action}`);
  await validateP0TenantScope(scope);
  await auditP0CrossTenantAccess(ctx, scope, `tenant_${action}`, tenantId, { package: "p0_package_4" });
}
