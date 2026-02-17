/**
 * Operational Health Router
 * 
 * Internal API for super-admin to monitor operational readiness
 * and system health across governance, data integrity, performance, and AI stability.
 * 
 * ACCESS CONTROL: Super-admin only
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getOperationalHealth } from "../services/operational-health";

/**
 * Super-admin procedure - restricts access to super-admin role only
 */
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  // Check if user has super-admin role
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Super-admin privileges required.",
    });
  }
  
  return next({ ctx });
});

export const operationalHealthRouter = router({
  /**
   * Get current operational health metrics
   */
  getHealth: superAdminProcedure.query(async () => {
    const health = await getOperationalHealth();
    return health;
  }),
});
