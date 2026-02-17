/**
 * Audit Router
 * 
 * Handles audit logging for security and compliance purposes.
 * Includes access denial logging for RBAC enforcement.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
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
      tenantId: z.string().nullable(),
      denialReason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      // Log the access denial attempt
      await db.insert(accessDenialLog).values({
        userId: ctx.user.id,
        attemptedRoute: input.attemptedRoute,
        userRole: input.userRole,
        insurerRole: input.insurerRole,
        tenantId: input.tenantId,
        denialReason: input.denialReason,
        // Note: IP address and user agent would need to be extracted from request headers
        // This would require passing them through the context
        ipAddress: null,
        userAgent: null,
      });

      return { success: true };
    }),
});
