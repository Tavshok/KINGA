// @ts-nocheck
/**
 * Tenant Management Router
 * 
 * Provides tRPC procedures for managing multi-tenant configuration:
 * - Tenant CRUD operations
 * - Role configuration management
 * - Workflow threshold management
 * - SLA configuration
 * 
 * @module routers/tenant
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { insurerTenants, tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { 
  getTenantConfig,
  createTenantConfig,
  updateTenantConfig,
  deleteTenantConfig,
  getTenantRoleConfig,
  updateTenantRoleConfig,
  getTenantWorkflowThresholds,
  updateTenantWorkflowThresholds,
  getTenantSlaConfig,
  updateTenantSlaConfig
} from "../services/tenant-config";
import { getTenantRates, updateTenantRates } from "../db";

/**
 * Tenant configuration router
 */
export const tenantRouter = router({
  /**
   * List all tenants
   */
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // For now, return all tenants. In production, filter by user permissions
      const db = await getDb();
      if (!db) return [];
      const tenants = await db.select().from(insurerTenants);
      return tenants;
    }),

  /**
   * Get tenant by ID
   */
  getById: protectedProcedure
    .input(z.object({
      tenantId: z.string()
    }))
    .query(async ({ input }) => {
      const tenant = await getTenantConfig(input.tenantId);
      
      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found"
        });
      }
      
      return tenant;
    }),

  /**
   * Create new tenant
   */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1, "Tenant name is required"),
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      isActive: z.boolean().default(true)
    }))
    .mutation(async ({ input, ctx }) => {
      // In production, check if user has admin permissions
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create tenants"
        });
      }

      const tenant = await createTenantConfig({
        name: input.name,
        logoUrl: input.logoUrl,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        isActive: input.isActive
      });

      return tenant;
    }),

  /**
   * Update tenant configuration
   */
  update: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      name: z.string().min(1).optional(),
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      // In production, check if user has admin permissions
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update tenants"
        });
      }

      const { tenantId, ...updates } = input;
      const tenant = await updateTenantConfig(tenantId, updates);

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found"
        });
      }

      return tenant;
    }),

  /**
   * Delete tenant
   */
  delete: protectedProcedure
    .input(z.object({
      tenantId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      // In production, check if user has admin permissions
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can delete tenants"
        });
      }

      const success = await deleteTenantConfig(input.tenantId);

      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found"
        });
      }

      return { success: true };
    }),

  /**
   * Get role configuration for a tenant
   */
  getRoleConfig: protectedProcedure
    .input(z.object({
      tenantId: z.string()
    }))
    .query(async ({ input }) => {
      const roleConfig = await getTenantRoleConfig(input.tenantId);
      return roleConfig;
    }),

  /**
   * Update role configuration for a tenant
   */
  updateRoleConfig: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      role: z.enum(['executive', 'claims_manager', 'claims_processor', 'internal_assessor', 'risk_manager']),
      isEnabled: z.boolean().optional(),
      canApprove: z.boolean().optional(),
      canReject: z.boolean().optional(),
      canReassign: z.boolean().optional(),
      canViewReports: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      // In production, check if user has admin permissions
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update role configuration"
        });
      }

      const { tenantId, role, ...permissions } = input;
      const roleConfig = await updateTenantRoleConfig(tenantId, role, permissions);

      return roleConfig;
    }),

  /**
   * Get workflow thresholds for a tenant
   */
  getWorkflowThresholds: protectedProcedure
    .input(z.object({
      tenantId: z.string()
    }))
    .query(async ({ input }) => {
      const thresholds = await getTenantWorkflowThresholds(input.tenantId);
      return thresholds;
    }),

  /**
   * Update workflow thresholds for a tenant
   */
  updateWorkflowThresholds: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      autoApprovalLimit: z.number().optional(),
      managerApprovalLimit: z.number().optional(),
      executiveApprovalLimit: z.number().optional(),
      complexityThresholdSimple: z.number().optional(),
      complexityThresholdModerate: z.number().optional(),
      complexityThresholdComplex: z.number().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      // In production, check if user has admin permissions
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update workflow thresholds"
        });
      }

      const { tenantId, ...thresholds } = input;
      const updated = await updateTenantWorkflowThresholds(tenantId, thresholds);

      return updated;
    }),

  /**
   * Get SLA configuration for a tenant
   */
  getSlaConfig: protectedProcedure
    .input(z.object({
      tenantId: z.string()
    }))
    .query(async ({ input }) => {
      const slaConfig = await getTenantSlaConfig(input.tenantId);
      return slaConfig;
    }),

  /**
   * Update SLA configuration for a tenant
   */
  updateSlaConfig: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      targetDaysSimple: z.number().optional(),
      targetDaysModerate: z.number().optional(),
      targetDaysComplex: z.number().optional(),
      targetDaysExceptional: z.number().optional(),
      warningThresholdPercent: z.number().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      // In production, check if user has admin permissions
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update SLA configuration"
        });
      }

      const { tenantId, ...slaConfig } = input;
      const updated = await updateTenantSlaConfig(tenantId, slaConfig);

      return updated;
    }),

  /**
   * Get the current user's tenant (includes currency settings)
   */
  getCurrent: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const tenantId = ctx.user.tenantId;
      if (!tenantId) return null;

      const rows = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          displayName: tenants.displayName,
          currencyCode: tenants.currencyCode,
          currencySymbol: tenants.currencySymbol,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      return rows[0] ?? null;
    }),

  /**
   * Update currency settings for a tenant (admin only)
   */
  updateCurrency: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      currencyCode: z.string().min(1).max(10),
      currencySymbol: z.string().min(1).max(10),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update currency settings' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      await db
        .update(tenants)
        .set({ currencyCode: input.currencyCode, currencySymbol: input.currencySymbol })
        .where(eq(tenants.id, input.tenantId));

      return { success: true };
    }),

  /**
   * Get cost rate overrides for a tenant (labour rate, paint cost per panel)
   */
  getRates: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.tenantId !== input.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      const rates = await getTenantRates(input.tenantId);
      return rates ?? {};
    }),

  /**
   * Update cost rate overrides for a tenant (admin only).
   * Pass null to clear a rate and revert to the regional default.
   */
  updateRates: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      labourRateUsdPerHour: z.number().positive().nullable().optional(),
      paintCostPerPanelUsd: z.number().positive().nullable().optional(),
      currencyCode: z.string().min(1).max(10).nullable().optional(),
      currencySymbol: z.string().min(1).max(10).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update cost rate settings' });
      }
      const { tenantId, ...rates } = input;
      await updateTenantRates(tenantId, rates);
      return { success: true };
    })
});
