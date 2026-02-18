/**
 * Admin Router
 * 
 * Super-admin procedures for tenant management and system administration.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";

// Super-admin middleware
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "platform_super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super-admin access required",
    });
  }
  return next({ ctx });
});

export const adminRouter = router({
  /**
   * Create a new tenant organization
   */
  createTenant: superAdminProcedure
    .input(
      z.object({
        id: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/, "Tenant ID must contain only lowercase letters, numbers, and hyphens"),
        displayName: z.string().min(1).max(255),
        contactEmail: z.string().email(),
        billingEmail: z.string().email(),
        plan: z.enum(["free", "standard", "premium", "enterprise"]),
        workflowConfig: z.object({
          intakeEscalationHours: z.number().min(1).max(168),
          intakeEscalationEnabled: z.boolean(),
          intakeEscalationMode: z.enum(["auto_assign", "escalate_only"]),
        }),
        aiRerunLimitPerHour: z.number().min(1).max(100),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Check if tenant ID already exists
      const existingTenant = await db.query.tenants.findFirst({
        where: (tenants, { eq }) => eq(tenants.id, input.id),
      });

      if (existingTenant) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Tenant with ID "${input.id}" already exists`,
        });
      }

      // Create tenant
      const [newTenant] = await db.insert(tenants).values({
        id: input.id,
        displayName: input.displayName,
        contactEmail: input.contactEmail,
        billingEmail: input.billingEmail,
        plan: input.plan,
        workflowConfig: JSON.stringify({
          intakeEscalationHours: input.workflowConfig.intakeEscalationHours,
          intakeEscalationEnabled: input.workflowConfig.intakeEscalationEnabled ? 1 : 0,
          intakeEscalationMode: input.workflowConfig.intakeEscalationMode,
        }),
        intakeEscalationHours: input.workflowConfig.intakeEscalationHours,
        intakeEscalationEnabled: input.workflowConfig.intakeEscalationEnabled ? 1 : 0,
        intakeEscalationMode: input.workflowConfig.intakeEscalationMode,
        aiRerunLimitPerHour: input.aiRerunLimitPerHour,
      });

      console.log(`[Admin] Tenant created: ${input.id} by ${ctx.user.name}`);

      return {
        id: input.id,
        displayName: input.displayName,
        contactEmail: input.contactEmail,
        billingEmail: input.billingEmail,
        plan: input.plan,
      };
    }),

  /**
   * Get all tenants (for tenant management dashboard)
   */
  getAllTenants: superAdminProcedure.query(async () => {
    const db = await getDb();
    const allTenants = await db.query.tenants.findMany({
      orderBy: (tenants, { desc }) => [desc(tenants.createdAt)],
    });

    return allTenants.map((tenant) => ({
      id: tenant.id,
      displayName: tenant.displayName,
      contactEmail: tenant.contactEmail,
      billingEmail: tenant.billingEmail,
      plan: tenant.plan,
      createdAt: tenant.createdAt,
    }));
  }),
});
