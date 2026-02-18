/**
 * Admin Router
 * 
 * Super-admin procedures for tenant management and system administration.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import { sendInvitation, getInvitationByToken, acceptInvitation } from "../invitation-service";

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

  /**
   * Send invitation to join a tenant
   */
  sendInvitation: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string(),
        email: z.string().email(),
        role: z.enum(["user", "admin", "insurer", "assessor", "panel_beater", "claimant", "platform_super_admin", "fleet_admin", "fleet_manager", "fleet_driver"]),
        insurerRole: z.enum(["claims_processor", "assessor_internal", "assessor_external", "risk_manager", "claims_manager", "executive", "insurer_admin"]).optional(),
        expirationDays: z.number().min(1).max(30).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await sendInvitation({
        ...input,
        createdBy: ctx.user.id,
      });
    }),

  /**
   * Get invitation details by token (public)
   */
  getInvitationByToken: publicProcedure
    .input(
      z.object({
        token: z.string(),
      })
    )
    .query(async ({ input }) => {
      return await getInvitationByToken(input.token);
    }),

  /**
   * Accept invitation and create user account (public)
   */
  acceptInvitation: publicProcedure
    .input(
      z.object({
        token: z.string(),
        name: z.string(),
        openId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return await acceptInvitation(input);
    }),
});
