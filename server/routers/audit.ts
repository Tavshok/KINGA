/**
 * Audit Router
 *
 * Handles audit logging for security and compliance purposes.
 * Includes access denial logging for RBAC enforcement.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { z } from "zod";
import { accessDenialLog } from "../../drizzle/schema";

export const auditRouter = router({
  /**
   * Log Access Denial
   *
   * Records when a user attempts to access a route or resource
   * without proper permissions. Used by RoleGuard component.
   */
  logAccessDenial: protectedProcedure
    .input(z.object({
      attemptedRoute: z.string(),
      userRole: z.string(),
      insurerRole: z.string().nullable(),
      denialReason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const tenantId = ctx.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required for access-denial audit logging.",
        });
      }
      // Audit attribution is derived solely from the authenticated session.
      // Callers cannot choose or spoof the tenant recorded for their denial.
      await db.insert(accessDenialLog).values({
        userId: ctx.user.id,
        attemptedRoute: input.attemptedRoute,
        userRole: input.userRole,
        insurerRole: input.insurerRole,
        tenantId,
        denialReason: input.denialReason,
        // Note: IP address and user agent would need to be extracted from request headers
        ipAddress: null,
        userAgent: null,
      });

      return { success: true };
    }),
});
