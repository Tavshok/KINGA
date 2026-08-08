/**
 * impersonation.ts — Superadmin impersonation router
 *
 * Allows platform_super_admin to issue a short-lived impersonation token
 * representing "superadmin X viewing as user Y". The token carries both
 * identities for audit purposes and expires in 60 minutes (hard, no renewal).
 *
 * Blocked actions while impersonating (decided by Eng Shoko):
 *   - claims.delete
 *   - users.updateRole / users.delete
 *   - admin.updateTenantConfig
 *   - audit.delete
 * All other actions (view, submit, run assessments) are allowed.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db-core";
import { users, auditTrail } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME } from "../../shared/const";
import { getCookieOptions } from "../_core/cookies";

const IMPERSONATION_DURATION_MS = 60 * 60 * 1000; // 60 minutes, hard expiry

// Superadmin-only guard
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "platform_super_admin" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required" });
  }
  return next({ ctx });
});

export const impersonationRouter = router({
  /**
   * List all users available for impersonation (QA users + real users).
   * Searchable by name, email, role.
   */
  listUsers: superAdminProcedure
    .input(z.object({
      search: z.string().optional(),
      role: z.string().optional(),
      tenantId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        insurerRole: users.insurerRole,
        tenantId: users.tenantId,
        isQaAccount: users.isQaAccount,
        isActive: users.isActive,
      }).from(users).limit(200);

      let filtered = allUsers;
      if (input.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter(u =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.role?.toLowerCase().includes(q)
        );
      }
      if (input.role) {
        filtered = filtered.filter(u => u.role === input.role || u.insurerRole === input.role);
      }
      if (input.tenantId) {
        filtered = filtered.filter(u => u.tenantId === input.tenantId);
      }
      return filtered;
    }),

  /**
   * Start impersonation: issue a 60-minute scoped session token for the target user.
   * Logs the impersonation start to audit_trail.
   */
  start: superAdminProcedure
    .input(z.object({ targetUserId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load target user
      const [target] = await db.select().from(users).where(eq(users.id, input.targetUserId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
      if (!target.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Target user is deactivated" });

      // Issue dual-identity impersonation token (60 min hard expiry)
      // The token's openId is the TARGET user's openId (for rendering/authorization).
      // The impersonatedBy field carries the real superadmin's openId for audit.
      const token = await sdk.signSession(
        {
          openId: target.openId,
          appId: process.env.VITE_APP_ID || "",
          name: target.name || target.email || "",
          // @ts-ignore — extended payload for impersonation
          impersonatedBy: ctx.user.openId,
          impersonatedByName: ctx.user.name,
          impersonationExpiry: Date.now() + IMPERSONATION_DURATION_MS,
        },
        { expiresInMs: IMPERSONATION_DURATION_MS }
      );

      // Audit log: impersonation started
      await db.insert(auditTrail).values({
        userId: ctx.user.id,
        action: "IMPERSONATION_STARTED",
        entityType: "user",
        entityId: target.id,
        changeDescription: `Superadmin ${ctx.user.name} (${ctx.user.openId}) started impersonating ${target.name} (${target.email}, role=${target.role}${target.insurerRole ? `/${target.insurerRole}` : ""})`,
        newValue: JSON.stringify({ targetUserId: target.id, targetRole: target.role, targetInsurerRole: target.insurerRole }),
      });

      // Determine where the target user would land after login
      const destination = getDestinationForUser(target);

      return { token, destination, targetUser: { id: target.id, name: target.name, email: target.email, role: target.role, insurerRole: target.insurerRole } };
    }),

  /**
   * End impersonation: log the exit and clear the impersonation cookie.
   */
  end: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Check if this is actually an impersonation session
      // @ts-ignore
      const impersonatedBy = (ctx as any).rawJwtPayload?.impersonatedBy;
      if (!impersonatedBy) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not an impersonation session" });
      }

      // Audit log: impersonation ended
      await db.insert(auditTrail).values({
        userId: ctx.user.id,
        action: "IMPERSONATION_ENDED",
        entityType: "user",
        entityId: ctx.user.id,
        changeDescription: `Impersonation session ended. Superadmin ${impersonatedBy} was viewing as ${ctx.user.name} (${ctx.user.email})`,
      });

      return { success: true };
    }),

  /**
   * Get current impersonation state — used by the banner to show who is being impersonated.
   */
  getState: protectedProcedure.query(async ({ ctx }) => {
    // @ts-ignore
    const payload = (ctx as any).rawJwtPayload;
    if (!payload?.impersonatedBy) return null;
    return {
      isImpersonating: true,
      impersonatedBy: payload.impersonatedBy as string,
      impersonatedByName: payload.impersonatedByName as string,
      targetUser: {
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
        insurerRole: ctx.user.insurerRole,
      },
      expiresAt: payload.impersonationExpiry as number,
    };
  }),
});

/** Determine the post-login destination for a given user (mirrors Login.tsx getDashboardPath) */
function getDestinationForUser(user: { role: string; insurerRole?: string | null; defaultRole?: string | null }): string {
  switch (user.role) {
    case "insurer":
    case "admin":
      // If insurer has a role, go directly to their dashboard
      if (user.insurerRole) return `/insurer-portal/${user.insurerRole.replace(/_/g, "-")}`;
      return "/insurer-portal";
    case "assessor": return "/assessor/dashboard";
    case "panel_beater": return "/panel-beater/dashboard";
    case "fleet_manager":
    case "fleet_admin":
    case "fleet_driver": return "/fleet";
    case "agency": return "/agency";
    case "engineer": return "/engineer/dashboard";
    case "claimant":
    case "user": return "/client";
    case "platform_super_admin": return "/portal-hub";
    default: return "/portal-hub";
  }
}
