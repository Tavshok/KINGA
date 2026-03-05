/**
 * Platform User Role Manager Router
 *
 * Provides platform_super_admin with the ability to:
 *   - List all users across the platform (with search + role filter)
 *   - Assign / change a user's role and insurer sub-role
 *   - Write every change to the role_assignment_audit table
 *
 * Access guard: superAdminProcedure — only platform_super_admin can call these.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql, and, like, or } from "drizzle-orm";
import { router, superAdminProcedure } from "../_core/trpc";
import { users, roleAssignmentAudit } from "../../drizzle/schema";

// ─── Shared enums (kept in sync with drizzle schema) ─────────────────────────

export const PLATFORM_ROLES = [
  "claimant",
  "panel_beater",
  "assessor",
  "insurer",
  "broker",
  "platform_super_admin",
  "admin",
  "user",
  "fleet_admin",
  "fleet_manager",
  "fleet_driver",
] as const;

export const INSURER_ROLES = [
  "claims_processor",
  "internal_assessor",
  "risk_manager",
  "claims_manager",
  "executive",
] as const;

// ─── Input schemas ────────────────────────────────────────────────────────────

const listUsersInput = z.object({
  search: z.string().optional(),
  roleFilter: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

const assignRoleInput = z.object({
  targetUserId: z.number().int().positive(),
  newRole: z.enum(PLATFORM_ROLES),
  newInsurerRole: z.enum(INSURER_ROLES).optional(),
  justification: z.string().max(500).optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const platformUserRolesRouter = router({
  /**
   * List all users with optional search and role filter.
   * Returns paginated results with user details.
   */
  listUsers: superAdminProcedure
    .input(listUsersInput)
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;

      // Build where conditions
      const conditions: ReturnType<typeof sql>[] = [];

      if (input.roleFilter) {
        conditions.push(sql`${users.role} = ${input.roleFilter}`);
      }

      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(
          sql`(${users.email} LIKE ${term} OR ${users.name} LIKE ${term})`
        );
      }

      const whereClause =
        conditions.length > 0
          ? sql`${conditions.reduce((acc, c) => sql`${acc} AND ${c}`)}`
          : undefined;

      const rows = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          insurerRole: users.insurerRole,
          tenantId: users.tenantId,
          organizationId: users.organizationId,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .where(whereClause)
        .limit(input.pageSize)
        .offset(offset);

      // Count total for pagination
      const [{ total }] = await ctx.db
        .select({ total: sql<number>`COUNT(*)` })
        .from(users)
        .where(whereClause);

      return {
        users: rows,
        total: Number(total),
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(Number(total) / input.pageSize),
      };
    }),

  /**
   * Assign a new role (and optional insurer sub-role) to a user.
   * Writes the change to role_assignment_audit.
   */
  assignRole: superAdminProcedure
    .input(assignRoleInput)
    .mutation(async ({ input, ctx }) => {
      // 1. Fetch the target user
      const [target] = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          insurerRole: users.insurerRole,
          tenantId: users.tenantId,
        })
        .from(users)
        .where(eq(users.id, input.targetUserId))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found." });
      }

      // 2. Prevent self-demotion of the only super-admin
      if (
        target.id === ctx.user!.id &&
        input.newRole !== "platform_super_admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own super-admin role.",
        });
      }

      const previousRole = target.role;
      const previousInsurerRole = target.insurerRole ?? undefined;

      // 3. Build the update payload
      const updatePayload: Partial<typeof users.$inferInsert> = {
        role: input.newRole as typeof users.$inferInsert["role"],
      };

      if (input.newRole === "insurer" && input.newInsurerRole) {
        updatePayload.insurerRole =
          input.newInsurerRole as typeof users.$inferInsert["insurerRole"];
      } else if (input.newRole !== "insurer") {
        // Clear insurer sub-role when switching away from insurer
        updatePayload.insurerRole = null as any;
      }

      // 4. Apply the update
      await ctx.db
        .update(users)
        .set(updatePayload)
        .where(eq(users.id, input.targetUserId));

      // 5. Write audit record
      // roleAssignmentAudit has a tenantId NOT NULL constraint — use target's
      // tenantId if available, otherwise fall back to a platform-level sentinel.
      const auditTenantId = target.tenantId ?? "platform";

      // The schema enum for previousRole / newRole doesn't include all platform
      // roles (e.g. broker, platform_super_admin). We cast safely and only write
      // the fields that the schema accepts; extra info goes into justification.
      const safeRoles = [
        "user", "admin", "insurer", "assessor", "panel_beater", "claimant",
      ] as const;
      type SafeRole = (typeof safeRoles)[number];
      const isSafeRole = (r: string): r is SafeRole =>
        (safeRoles as readonly string[]).includes(r);

      await ctx.db.insert(roleAssignmentAudit).values({
        tenantId: auditTenantId,
        userId: input.targetUserId,
        previousRole: isSafeRole(previousRole) ? previousRole : undefined,
        newRole: isSafeRole(input.newRole) ? input.newRole : ("user" as SafeRole),
        previousInsurerRole: previousInsurerRole as any,
        newInsurerRole: (input.newInsurerRole ?? undefined) as any,
        changedByUserId: ctx.user!.id,
        justification:
          input.justification ??
          `Role changed from ${previousRole} to ${input.newRole} by platform_super_admin (id=${ctx.user!.id}). Full new role: ${input.newRole}${input.newInsurerRole ? ` / ${input.newInsurerRole}` : ""}.`,
      });

      return {
        success: true,
        user: {
          id: target.id,
          name: target.name,
          email: target.email,
          previousRole,
          newRole: input.newRole,
          newInsurerRole: input.newInsurerRole ?? null,
        },
      };
    }),

  /**
   * Fetch recent role-assignment audit entries for a specific user.
   */
  getUserAuditHistory: superAdminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db
        .select()
        .from(roleAssignmentAudit)
        .where(eq(roleAssignmentAudit.userId, input.userId))
        .orderBy(sql`${roleAssignmentAudit.timestamp} DESC`)
        .limit(20);
      return rows;
    }),
});
