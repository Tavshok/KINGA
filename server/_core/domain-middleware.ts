/**
 * Domain-Aware Middleware
 *
 * Enforces role-based access control per URL domain segment.
 * Each procedure factory validates the user's role AND (where applicable)
 * the presence of a tenantId before allowing the request to proceed.
 *
 * Domain → Allowed Roles mapping:
 *   /platform  → platform_super_admin
 *   /agency    → agency (user.role = 'agency' or user.role = 'admin')
 *   /insurer/* → insurer, admin (+ tenantId required for non-admin)
 *   /fleet     → fleet_admin, fleet_manager, fleet_driver, admin
 *   /marketplace → any authenticated user (marketplace profiles are self-managed)
 *   /portal    → claimant, driver (mapped to 'claimant' role), admin
 *
 * All mismatches throw TRPCError with code "FORBIDDEN" (HTTP 403).
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

// ─── Role Sets ──────────────────────────────────────────────────────────────

const PLATFORM_ROLES = ["platform_super_admin"] as const;
const AGENCY_ROLES = ["agency", "admin"] as const;
const INSURER_ROLES = ["insurer", "admin"] as const;
const FLEET_ROLES = ["fleet_admin", "fleet_manager", "fleet_driver", "admin"] as const;
// Marketplace: any authenticated user can browse; profile owners manage their own
const MARKETPLACE_ROLES = [
  "admin",
  "insurer",
  "assessor",
  "panel_beater",
  "agency",
  "fleet_admin",
  "fleet_manager",
  "claimant",
  "user",
  "platform_super_admin",
] as const;
const PORTAL_ROLES = ["claimant", "admin"] as const;

// ─── Helper ─────────────────────────────────────────────────────────────────

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function unauthorized(): never {
  throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
}

// ─── /platform → platform_super_admin only ──────────────────────────────────

const requirePlatform = t.middleware(({ ctx, next }) => {
  if (!ctx.user) unauthorized();
  if (!PLATFORM_ROLES.includes(ctx.user.role as typeof PLATFORM_ROLES[number])) {
    forbidden(`Access denied. /platform requires platform_super_admin role. Current role: ${ctx.user.role}`);
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const platformProcedure = t.procedure.use(requirePlatform);

// ─── /agency → agency roles only ────────────────────────────────────────────

const requireAgency = t.middleware(({ ctx, next }) => {
  if (!ctx.user) unauthorized();
  if (!AGENCY_ROLES.includes(ctx.user.role as typeof AGENCY_ROLES[number])) {
    forbidden(`Access denied. /agency requires agency role. Current role: ${ctx.user.role}`);
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const agencyDomainProcedure = t.procedure.use(requireAgency);

// ─── /insurer/{slug} → insurer/admin + tenantId required ────────────────────

const requireInsurer = t.middleware(({ ctx, next }) => {
  if (!ctx.user) unauthorized();
  if (!INSURER_ROLES.includes(ctx.user.role as typeof INSURER_ROLES[number])) {
    forbidden(`Access denied. /insurer requires insurer role. Current role: ${ctx.user.role}`);
  }
  // Admin bypasses tenant check; all other insurer users must have a tenantId
  if (ctx.user.role !== "admin" && !ctx.user.tenantId) {
    forbidden("Access denied. Insurer users must be associated with a tenant.");
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const insurerDomainProcedure = t.procedure.use(requireInsurer);

/**
 * Strict insurer procedure: requires tenantId even for admin.
 * Use this for procedures that must operate within a specific tenant scope.
 */
const requireInsurerWithTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.user) unauthorized();
  if (!INSURER_ROLES.includes(ctx.user.role as typeof INSURER_ROLES[number])) {
    forbidden(`Access denied. Requires insurer role. Current role: ${ctx.user.role}`);
  }
  if (!ctx.user.tenantId) {
    forbidden("Access denied. A tenantId is required for this operation.");
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const insurerTenantProcedure = t.procedure.use(requireInsurerWithTenant);

// ─── /fleet → fleet roles only ──────────────────────────────────────────────

const requireFleet = t.middleware(({ ctx, next }) => {
  if (!ctx.user) unauthorized();
  if (!FLEET_ROLES.includes(ctx.user.role as typeof FLEET_ROLES[number])) {
    forbidden(`Access denied. /fleet requires fleet role. Current role: ${ctx.user.role}`);
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const fleetDomainProcedure = t.procedure.use(requireFleet);

// ─── /marketplace → any authenticated user ──────────────────────────────────

const requireMarketplace = t.middleware(({ ctx, next }) => {
  if (!ctx.user) unauthorized();
  if (!MARKETPLACE_ROLES.includes(ctx.user.role as typeof MARKETPLACE_ROLES[number])) {
    forbidden(`Access denied. /marketplace requires an authenticated role. Current role: ${ctx.user.role}`);
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const marketplaceDomainProcedure = t.procedure.use(requireMarketplace);

// ─── /portal → claimant, driver (claimant role), admin ──────────────────────

const requirePortal = t.middleware(({ ctx, next }) => {
  if (!ctx.user) unauthorized();
  if (!PORTAL_ROLES.includes(ctx.user.role as typeof PORTAL_ROLES[number])) {
    forbidden(`Access denied. /portal requires claimant or driver role. Current role: ${ctx.user.role}`);
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const portalDomainProcedure = t.procedure.use(requirePortal);

// ─── Domain Role Map (for frontend reference) ───────────────────────────────

export const DOMAIN_ROLE_MAP = {
  platform: [...PLATFORM_ROLES],
  agency: [...AGENCY_ROLES],
  insurer: [...INSURER_ROLES],
  fleet: [...FLEET_ROLES],
  marketplace: [...MARKETPLACE_ROLES],
  portal: [...PORTAL_ROLES],
} as const;

export type DomainKey = keyof typeof DOMAIN_ROLE_MAP;
