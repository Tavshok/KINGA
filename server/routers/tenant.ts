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
import { insurerTenants } from "../../drizzle/schema";
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
    })
});
