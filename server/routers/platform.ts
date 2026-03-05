/**
 * Platform Router
 *
 * Provides admin-level role management accessible to users with role="admin"
 * (as opposed to platformUserRoles which requires platform_super_admin).
 *
 * Procedures:
 *   - platform.assignUserRole  — assign a role (and optional insurer sub-role) to any user
 *   - platform.listAllUsers    — list all users for the admin role-setup table
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { users } from "../../drizzle/schema";

// ─── Enums (kept in sync with drizzle schema) ─────────────────────────────────
const ASSIGNABLE_ROLES = [
  "claimant",
  "insurer",
  "admin",
] as const;

// Note: these values must match the mysqlEnum in drizzle/schema.ts users.insurerRole
const INSURER_ROLES = [
  "claims_processor",
  "internal_assessor",
  "risk_manager",
  "claims_manager",
  "executive",
] as const;

// ─── Input schemas ─────────────────────────────────────────────────────────────
const assignUserRoleInput = z.object({
  userId: z.number().int().positive(),
  role: z.enum(ASSIGNABLE_ROLES),
  // The spec uses "assessor" and "underwriter" as friendly names;
  // map them to the canonical schema values on the frontend.
  insurerRole: z.enum(INSURER_ROLES).optional(),
});

// ─── Router ────────────────────────────────────────────────────────────────────
export const platformRouter = router({
  /**
   * Assign a role (and optional insurer sub-role) to a user.
   * Only accessible by users with role="admin".
   */
  assignUserRole: adminProcedure
    .input(assignUserRoleInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      // Prevent admins from accidentally demoting themselves
      if (ctx.user.id === input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role.",
        });
      }

      // Verify target user exists
      const [target] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      // Build update payload — only set insurerRole when role is "insurer"
      const updatePayload: {
        role: (typeof ASSIGNABLE_ROLES)[number];
        insurerRole?: (typeof INSURER_ROLES)[number] | null;
      } = {
        role: input.role,
        insurerRole: input.role === "insurer" ? (input.insurerRole ?? null) : null,
      };

      await db
        .update(users)
        .set(updatePayload)
        .where(eq(users.id, input.userId));

      return {
        success: true,
        userId: input.userId,
        newRole: input.role,
        newInsurerRole: updatePayload.insurerRole ?? null,
      };
    }),

  /**
   * List all users for the admin role-setup table.
   * Returns id, name, email, role, insurerRole.
   */
  listAllUsers: adminProcedure.query(async ({ ctx }) => {
    const db = ctx.db;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        insurerRole: users.insurerRole,
      })
      .from(users)
      .orderBy(users.email);

    return rows;
  }),
});
