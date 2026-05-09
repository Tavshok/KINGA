// @ts-nocheck
/**
 * Team Members Router
 *
 * Allows an insurer_admin to manage their own tenant's users:
 *   - list all users in the tenant
 *   - invite a new user (creates a tenantInvitations record)
 *   - update an existing user's insurer sub-role
 *   - deactivate a user (sets role → "user", clears insurerRole & tenantId)
 *   - list pending invitations for the tenant
 *   - cancel a pending invitation
 *
 * KINGA super-admin retains full override via platformUserRoles.assignRole.
 *
 * Tenant isolation: every procedure filters strictly by ctx.insurerTenantId.
 */

import { router, insurerDomainProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { users, tenantInvitations, roleAssignmentAudit } from "../../drizzle/schema";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { sendInvitation } from "../invitation-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INSURER_ROLES = [
  "claims_processor",
  "assessor_internal",
  "risk_manager",
  "claims_manager",
  "executive",
  "insurer_admin",
  "recovery_officer",
] as const;

type InsurerRole = (typeof INSURER_ROLES)[number];

/** Verify the calling user has insurer_admin sub-role */
function requireInsurerAdmin(ctx: any) {
  if (ctx.user.insurerRole !== "insurer_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Insurer Admins can manage team members.",
    });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const teamMembersRouter = router({
  /**
   * List all users belonging to this tenant.
   */
  list: insurerDomainProcedure.query(async ({ ctx }) => {
    requireInsurerAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        insurerRole: users.insurerRole,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .where(
        and(
          eq(users.tenantId, ctx.insurerTenantId),
          eq(users.role, "insurer")
        )
      )
      .orderBy(sql`${users.createdAt} DESC`);

    return rows;
  }),

  /**
   * Invite a new user to this tenant by email.
   * Creates a tenantInvitations record; the user completes sign-up via the
   * invitation acceptance flow.
   */
  invite: insurerDomainProcedure
    .input(
      z.object({
        email: z.string().email("Please enter a valid email address"),
        insurerRole: z.enum(INSURER_ROLES, {
          errorMap: () => ({ message: "Please select a valid role" }),
        }),
        expirationDays: z.number().min(1).max(30).default(7),
        origin: z.string().url().optional(), // frontend origin for building the invite URL
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireInsurerAdmin(ctx);

      const result = await sendInvitation({
        tenantId: ctx.insurerTenantId,
        email: input.email,
        role: "insurer",
        insurerRole: input.insurerRole,
        expirationDays: input.expirationDays,
        createdBy: ctx.user.id,
      });

      // Build the acceptance URL so the caller can share it
      const base = input.origin ?? "https://app.kinga.ai";
      const inviteUrl = `${base}/invite/accept/${result.token}`;

      return {
        ...result,
        inviteUrl,
        message: `Invitation sent to ${input.email}. They have ${input.expirationDays} day(s) to accept.`,
      };
    }),

  /**
   * Update an existing tenant user's insurer sub-role.
   * Cannot demote yourself if you are the only insurer_admin.
   */
  updateRole: insurerDomainProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        newInsurerRole: z.enum(INSURER_ROLES),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireInsurerAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Fetch target — must belong to same tenant
      const [target] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          insurerRole: users.insurerRole,
          tenantId: users.tenantId,
        })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.insurerTenantId)))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found in your tenant." });
      }

      // Prevent self-demotion from insurer_admin if you are the last one
      if (
        target.id === ctx.user.id &&
        target.insurerRole === "insurer_admin" &&
        input.newInsurerRole !== "insurer_admin"
      ) {
        // Count remaining insurer_admins
        const [{ count }] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(users)
          .where(
            and(
              eq(users.tenantId, ctx.insurerTenantId),
              eq(users.insurerRole, "insurer_admin"),
              eq(users.role, "insurer")
            )
          );
        if (Number(count) <= 1) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot remove your own admin role — there must be at least one Insurer Admin.",
          });
        }
      }

      const previousInsurerRole = target.insurerRole;

      await db
        .update(users)
        .set({ insurerRole: input.newInsurerRole })
        .where(eq(users.id, input.userId));

      // Audit
      await db.insert(roleAssignmentAudit).values({
        tenantId: ctx.insurerTenantId,
        userId: input.userId,
        previousRole: "insurer",
        newRole: "insurer",
        previousInsurerRole: previousInsurerRole as any,
        newInsurerRole: input.newInsurerRole as any,
        changedByUserId: ctx.user.id,
        justification: `Insurer sub-role changed from ${previousInsurerRole ?? "none"} to ${input.newInsurerRole} by insurer_admin (id=${ctx.user.id}).`,
      });

      return { success: true, userId: input.userId, newInsurerRole: input.newInsurerRole };
    }),

  /**
   * Deactivate a user: clear their tenantId and insurerRole so they lose
   * access to this tenant. Their account is NOT deleted.
   */
  deactivate: insurerDomainProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireInsurerAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Must belong to same tenant
      const [target] = await db
        .select({ id: users.id, insurerRole: users.insurerRole, tenantId: users.tenantId })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.insurerTenantId)))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found in your tenant." });
      }

      // Cannot deactivate yourself
      if (target.id === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot deactivate your own account." });
      }

      await db
        .update(users)
        .set({ role: "user", insurerRole: null as any, tenantId: null as any })
        .where(eq(users.id, input.userId));

      // Audit
      await db.insert(roleAssignmentAudit).values({
        tenantId: ctx.insurerTenantId,
        userId: input.userId,
        previousRole: "insurer",
        newRole: "user",
        previousInsurerRole: target.insurerRole as any,
        newInsurerRole: null as any,
        changedByUserId: ctx.user.id,
        justification: `User deactivated from tenant ${ctx.insurerTenantId} by insurer_admin (id=${ctx.user.id}).`,
      });

      return { success: true };
    }),

  /**
   * List pending (not yet accepted, not expired) invitations for this tenant.
   */
  listInvitations: insurerDomainProcedure.query(async ({ ctx }) => {
    requireInsurerAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const rows = await db
      .select({
        id: tenantInvitations.id,
        email: tenantInvitations.email,
        insurerRole: tenantInvitations.insurerRole,
        expiresAt: tenantInvitations.expiresAt,
        createdAt: tenantInvitations.createdAt,
        acceptedAt: tenantInvitations.acceptedAt,
      })
      .from(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.tenantId, ctx.insurerTenantId),
          isNull(tenantInvitations.acceptedAt),
          gt(tenantInvitations.expiresAt, new Date())
        )
      )
      .orderBy(sql`${tenantInvitations.createdAt} DESC`);

    return rows;
  }),

  /**
   * Cancel a pending invitation.
   */
  cancelInvitation: insurerDomainProcedure
    .input(z.object({ invitationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireInsurerAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [inv] = await db
        .select({ id: tenantInvitations.id, tenantId: tenantInvitations.tenantId })
        .from(tenantInvitations)
        .where(eq(tenantInvitations.id, input.invitationId))
        .limit(1);

      if (!inv || inv.tenantId !== ctx.insurerTenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }

      // Mark as cancelled by setting expiresAt to now (simplest approach without schema change)
      await db
        .update(tenantInvitations)
        .set({ expiresAt: new Date() } as any)
        .where(eq(tenantInvitations.id, input.invitationId));

      return { success: true };
    }),

  /**
   * Get the last 20 role-assignment audit entries for this tenant.
   * Used by the InsurerAdminDashboard audit log panel.
   */
  getAuditLog: insurerDomainProcedure.query(async ({ ctx }) => {
    requireInsurerAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const rows = await db
      .select({
        id: roleAssignmentAudit.id,
        userId: roleAssignmentAudit.userId,
        changedByUserId: roleAssignmentAudit.changedByUserId,
        previousInsurerRole: roleAssignmentAudit.previousInsurerRole,
        newInsurerRole: roleAssignmentAudit.newInsurerRole,
        previousRole: roleAssignmentAudit.previousRole,
        newRole: roleAssignmentAudit.newRole,
        justification: roleAssignmentAudit.justification,
        timestamp: roleAssignmentAudit.timestamp,
      })
      .from(roleAssignmentAudit)
      .where(eq(roleAssignmentAudit.tenantId, ctx.insurerTenantId))
      .orderBy(sql`${roleAssignmentAudit.timestamp} DESC`)
      .limit(20);

    if (rows.length === 0) return [];

    // Resolve user names in a single query
    const userIds = [...new Set(rows.flatMap((r) => [r.userId, r.changedByUserId]).filter(Boolean))];
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);

    const userMap = Object.fromEntries(
      userRows.map((u) => [u.id, u.name ?? u.email ?? `User #${u.id}`])
    );

    return rows.map((r) => ({
      id: r.id,
      subjectName: userMap[r.userId] ?? `User #${r.userId}`,
      actorName: userMap[r.changedByUserId] ?? `User #${r.changedByUserId}`,
      previousInsurerRole: r.previousInsurerRole,
      newInsurerRole: r.newInsurerRole,
      previousRole: r.previousRole,
      newRole: r.newRole,
      justification: r.justification,
      timestamp: r.timestamp,
    }));
  }),

  /**
   * Resend an invitation: cancel the existing pending token and create a
   * fresh one (new token, new 7-day expiry). A new invitation email is fired
   * automatically by sendInvitation.
   */
  resendInvitation: insurerDomainProcedure
    .input(
      z.object({
        invitationId: z.number().int().positive(),
        origin: z.string().url().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireInsurerAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Fetch the existing invitation
      const [inv] = await db
        .select({
          id: tenantInvitations.id,
          tenantId: tenantInvitations.tenantId,
          email: tenantInvitations.email,
          role: tenantInvitations.role,
          insurerRole: tenantInvitations.insurerRole,
          acceptedAt: tenantInvitations.acceptedAt,
        })
        .from(tenantInvitations)
        .where(eq(tenantInvitations.id, input.invitationId))
        .limit(1);

      if (!inv || inv.tenantId !== ctx.insurerTenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }
      if (inv.acceptedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has already been accepted." });
      }

      // Cancel the old token by expiring it immediately
      await db
        .update(tenantInvitations)
        .set({ expiresAt: new Date() } as any)
        .where(eq(tenantInvitations.id, input.invitationId));

      // Create a fresh invitation (fires email automatically)
      const result = await sendInvitation({
        tenantId: ctx.insurerTenantId,
        email: inv.email,
        role: inv.role as any,
        insurerRole: inv.insurerRole as any,
        createdBy: ctx.user.id,
        expirationDays: 7,
        origin: input.origin,
      });

      return {
        success: true,
        email: result.email,
        expiresAt: result.expiresAt,
        token: result.token,
      };
    }),
});
