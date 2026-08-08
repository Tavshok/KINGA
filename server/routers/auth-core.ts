/**
 * KINGA Auth Router
 * Extracted from server/routers.ts for maintainability — Aug 2026.
 * Authentication, session management, and user profile procedures.
 */
import { COOKIE_NAME } from "@shared/const";
import { resolveDashboardRoute, getRolePermissions, ANALYTICS_ALLOWED_ROLES, GOVERNANCE_ALLOWED_ROLES, REPORT_SCHEDULE_ALLOWED_ROLES } from "@shared/role-permissions";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getSessionCookieOptions } from "../_core/cookies";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { REPORT_ACCESS } from "../reporting/reportDefinitions";
import { canAccessReport } from "./reporting";
export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    const user = ctx.user;
    if (!user) return null;

    // Derive server-side role profile — frontend reads this, never hardcodes role strings
    const insurerRole = user.insurerRole as import("@shared/role-permissions").InsurerRole | null;
    const permissions = getRolePermissions(insurerRole);
    const dashboardRoute = resolveDashboardRoute(user.role, insurerRole);

    // Count reports this user can access
    const allowedReportCount = Object.keys(REPORT_ACCESS).filter((key) =>
      canAccessReport(key, user.role, insurerRole)
    ).length;

    // Feature flags derived from role
    const canAccessAnalytics = user.role === "admin" || (insurerRole != null && ANALYTICS_ALLOWED_ROLES.includes(insurerRole));
    const canAccessGovernance = user.role === "admin" || (insurerRole != null && GOVERNANCE_ALLOWED_ROLES.includes(insurerRole));
    const canScheduleReports  = user.role === "admin" || (insurerRole != null && REPORT_SCHEDULE_ALLOWED_ROLES.includes(insurerRole));

    return {
      ...user,
      // Server-derived profile — single source of truth for the frontend
      dashboardRoute,
      roleLabel: permissions.roleLabel,
      permissions: {
        canUploadClaim:             permissions.canUploadClaim,
        canViewClaim:               permissions.canViewClaim,
        canEditClaim:               permissions.canEditClaim,
        canDeleteClaim:             permissions.canDeleteClaim,
        canViewIntakeQueue:         permissions.canViewIntakeQueue,
        canAssignProcessor:         permissions.canAssignProcessor,
        canTriggerAIAssessment:     permissions.canTriggerAIAssessment,
        canViewAIAssessment:        permissions.canViewAIAssessment,
        canOverrideAIAssessment:    permissions.canOverrideAIAssessment,
        canPerformManualAssessment: permissions.canPerformManualAssessment,
        canAssignAssessor:          permissions.canAssignAssessor,
        canAssignToSelf:            permissions.canAssignToSelf,
        canReassignClaim:           permissions.canReassignClaim,
        canApprovePayment:          permissions.canApprovePayment,
        canApproveLowValue:         permissions.canApproveLowValue,
        canApproveModerateValue:    permissions.canApproveModerateValue,
        canApproveHighValue:        permissions.canApproveHighValue,
        canOverrideAutomation:      permissions.canOverrideAutomation,
        canChangeWorkflowState:     permissions.canChangeWorkflowState,
        canEscalateClaim:           permissions.canEscalateClaim,
        canCloseClaim:              permissions.canCloseClaim,
        canReopenClaim:             permissions.canReopenClaim,
        canFlagFraud:               permissions.canFlagFraud,
        canInvestigateFraud:        permissions.canInvestigateFraud,
        canApproveFraudCase:        permissions.canApproveFraudCase,
        canViewAnalytics:           permissions.canViewAnalytics,
        canViewExecutiveDashboard:  permissions.canViewExecutiveDashboard,
        canViewGovernanceDashboard: permissions.canViewGovernanceDashboard,
        canExportReports:           permissions.canExportReports,
        canManageUsers:             permissions.canManageUsers,
        canManageWorkflowSettings:  permissions.canManageWorkflowSettings,
        canManageAutomationPolicies:permissions.canManageAutomationPolicies,
        accessibleQueues:           permissions.accessibleQueues,
        canAccessAnalytics,
        canAccessGovernance,
        canScheduleReports,
      },
      allowedReportCount,
    };
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return {
      success: true,
    } as const;
  }),
  /**
   * Switch Role (Testing Only)
   * 
   * Temporarily switches the current user's role for testing purposes.
   * Only available to admin users.
   * 
   * @requires Admin role
   * @param role - Target role to switch to
   */
  /**
   * Switch User Role (Admin Only)
   * 
   * Allows admins to change their own role for testing/development purposes.
   * All role changes are logged to audit trail with mandatory justification.
   * 
   * Security Controls:
   * - Requires mandatory justification (min 15 chars)
   * - Prevents elevation to super-admin/system roles
   * - Enforces tenant isolation
   * - Logs all changes to roleAssignmentAudit table
   * - Prevents self-elevation to higher privilege without approval
   * 
   * @requires Admin role
   * @param role - Target role to switch to
   * @param justification - Reason for role change (min 15 chars)
   * @param approvalCode - Required for privilege elevation (optional)
   * @returns Success status and new role
   */
  /**
   * Set Insurer Role (Quick Setup)
   * 
   * Allows any authenticated user to set their role to 'insurer' with a specific insurerRole.
   * This is a convenience endpoint for development/testing to quickly configure user roles.
   * 
   * @param insurerRole - The insurer role to assign
   * @returns Success status and new roles
   */
  setInsurerRole: protectedProcedure
    .input(z.object({
      insurerRole: z.enum(["claims_processor", "assessor_internal", "assessor_external", "risk_manager", "claims_manager", "executive", "insurer_admin", "recovery_officer"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Import users table
      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      // Update current user's role and insurerRole
      await db
        .update(users)
        .set({
          role: "insurer",
          insurerRole: input.insurerRole,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, ctx.user.id));
      
      return {
        success: true,
        role: "insurer" as const,
        insurerRole: input.insurerRole,
        message: "Role updated successfully. Please refresh the page to apply changes.",
      };
    }),
  
  switchRole: protectedProcedure
    .input(z.object({
      role: z.enum(["insurer", "assessor", "panel_beater", "claimant", "admin"]),
      justification: z.string().min(15, "Justification must be at least 15 characters"),
      approvalCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Only allow admins to switch roles
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can switch roles",
        });
      }
      
      // Define role privilege hierarchy
      const rolePrivileges: Record<string, number> = {
        claimant: 1,
        panel_beater: 2,
        assessor: 3,
        insurer: 4,
        admin: 5,
      };
      
      // Prevent switching to restricted system roles
      const restrictedRoles = ["super_admin", "system"];
      if (restrictedRoles.includes(input.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot switch to restricted system roles",
        });
      }
      
      // Check for privilege elevation
      const currentPrivilege = rolePrivileges[ctx.user.role] || 0;
      const targetPrivilege = rolePrivileges[input.role] || 0;
      const isElevation = targetPrivilege > currentPrivilege;
      
      // Require approval code for privilege elevation
      if (isElevation && !input.approvalCode) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Privilege elevation requires second-admin approval code",
        });
      }
      
      // Validate approval code if provided (simple check for demo)
      if (input.approvalCode && input.approvalCode !== "ADMIN_OVERRIDE_2026") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invalid approval code",
        });
      }
      
      // Use role assignment service with audit logging
      const { assignUserRole } = await import("../services/user-management");
      
      try {
        await assignUserRole({
          userId: ctx.user.id,
          newRole: input.role as "user" | "admin" | "insurer" | "assessor" | "panel_beater" | "claimant",
          changedByUserId: ctx.user.id,
          justification: input.justification,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to switch role",
        });
      }
      
      // IMPORTANT: Role switching only updates the database.
      // The JWT session token still contains the old role.
      // Client must refresh the page or re-fetch user data after switching.
      
      return {
        success: true,
        newRole: input.role,
        message: isElevation 
          ? "Role elevated with approval. Refreshing session..."
          : "Role updated with audit trail. Refreshing session...",
      };
    }),
  /**
   * Add Secondary Role (Phase 8 — Unified Customer Identity)
   * Allows a user to hold multiple customer roles simultaneously.
   */
  addSecondaryRole: protectedProcedure
    .input(z.object({
      role: z.enum(["claimant", "fleet_manager", "fleet_driver", "fleet_admin", "agency"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const currentSecondary: string[] = (ctx.user as any).secondaryRoles ?? [];
      if (currentSecondary.includes(input.role)) return { success: true, message: "Role already assigned" };
      const updated = [...currentSecondary, input.role];
      await db.update(users).set({ secondaryRoles: updated } as any).where(eq(users.id, ctx.user.id));
      return { success: true, message: `Secondary role ${input.role} added` };
    }),
});
