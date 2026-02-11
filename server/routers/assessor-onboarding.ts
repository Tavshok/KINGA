import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createAssessor,
  getAssessorByUserId,
  getAssessorByLicenseNumber,
  updateAssessor,
  createAssessorInsurerRelationship,
  getAssessorsByTenant,
  getMarketplaceAssessors,
  getUserByOpenId,
} from "../db";
import { users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq } from "drizzle-orm";

/**
 * Assessor Onboarding Router
 * Handles both insurer-owned and marketplace assessor onboarding workflows
 */

export const assessorOnboardingRouter = router({
  /**
   * Add Insurer-Owned Assessor
   * Insurer admin adds their existing assessor to KINGA
   */
  addInsurerOwnedAssessor: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        email: z.string().email(),
        professionalLicenseNumber: z.string().min(5),
        licenseExpiryDate: z.string(), // ISO date string
        certificationLevel: z.enum(["junior", "senior", "expert", "master"]),
        yearsOfExperience: z.number().min(0).optional(),
        specializations: z.array(z.string()).optional(),
        certifications: z.array(z.string()).optional(),
        serviceRegions: z.array(z.string()).optional(),
        maxTravelDistanceKm: z.number().min(0).default(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user is insurer admin
      if (ctx.user.role !== "insurer" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer admins can add insurer-owned assessors",
        });
      }

      const tenantId = ctx.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User must belong to a tenant organization",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if email already exists
      const existingUser = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User with this email already exists",
        });
      }

      // Check if license number already exists
      const existingAssessor = await getAssessorByLicenseNumber(input.professionalLicenseNumber);

      if (existingAssessor) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Assessor with this license number already exists",
        });
      }

      // Create user account
      const openId = `assessor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const [newUser] = await db.insert(users).values({
        openId: openId,
        email: input.email,
        name: input.name,
        role: "assessor",
        tenantId: tenantId,
        emailVerified: 0,
        loginMethod: "invitation",
      });

      const userId = newUser.insertId;

      // Create assessor profile
      const assessorResult = await createAssessor({
        userId: userId,
        professionalLicenseNumber: input.professionalLicenseNumber,
        licenseExpiryDate: new Date(input.licenseExpiryDate),
        assessorType: "insurer_owned",
        primaryTenantId: tenantId,
        marketplaceEnabled: 0,
        certificationLevel: input.certificationLevel,
        yearsOfExperience: input.yearsOfExperience,
        specializations: input.specializations ? JSON.stringify(input.specializations) : null,
        certifications: input.certifications ? JSON.stringify(input.certifications) : null,
        serviceRegions: input.serviceRegions ? JSON.stringify(input.serviceRegions) : null,
        maxTravelDistanceKm: input.maxTravelDistanceKm,
        activeStatus: 1,
        performanceScore: "70.00",
        backgroundCheckStatus: "pending",
      });

      const assessorId = assessorResult[0].insertId;

      // Create assessor-insurer relationship
      await createAssessorInsurerRelationship({
        assessorId: assessorId,
        tenantId: tenantId,
        relationshipType: "insurer_owned",
        relationshipStatus: "active",
        contractStartDate: new Date(),
      });

      return {
        success: true,
        userId,
        assessorId,
        message: "Assessor added successfully. Invitation email sent.",
      };
    }),

  /**
   * Register Marketplace Assessor
   * Independent assessor applies to join KINGA marketplace
   */
  registerMarketplaceAssessor: protectedProcedure
    .input(
      z.object({
        professionalLicenseNumber: z.string().min(5),
        licenseExpiryDate: z.string(),
        certificationLevel: z.enum(["junior", "senior", "expert", "master"]),
        yearsOfExperience: z.number().min(0),
        specializations: z.array(z.string()).min(1),
        certifications: z.array(z.string()).optional(),
        serviceRegions: z.array(z.string()).min(1),
        maxTravelDistanceKm: z.number().min(0).default(50),
        marketplaceBio: z.string().min(50).max(500),
        marketplaceHourlyRate: z.number().min(0),
        marketplaceAvailability: z.enum(["full_time", "part_time", "weekends_only", "on_demand"]),
        insuranceExpiryDate: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user already has assessor profile
      const existingAssessor = await getAssessorByUserId(ctx.user.id);

      if (existingAssessor) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have an assessor profile",
        });
      }

      // Check if license number already exists
      const existingLicense = await getAssessorByLicenseNumber(input.professionalLicenseNumber);

      if (existingLicense) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Assessor with this license number already exists",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Create assessor profile
      const assessorResult = await createAssessor({
        userId: ctx.user.id,
        professionalLicenseNumber: input.professionalLicenseNumber,
        licenseExpiryDate: new Date(input.licenseExpiryDate),
        assessorType: "marketplace",
        marketplaceEnabled: 1,
        marketplaceStatus: "pending_approval",
        marketplaceOnboardedAt: new Date(),
        marketplaceBio: input.marketplaceBio,
        marketplaceHourlyRate: input.marketplaceHourlyRate.toString(),
        marketplaceAvailability: input.marketplaceAvailability,
        certificationLevel: input.certificationLevel,
        yearsOfExperience: input.yearsOfExperience,
        specializations: JSON.stringify(input.specializations),
        certifications: input.certifications ? JSON.stringify(input.certifications) : null,
        serviceRegions: JSON.stringify(input.serviceRegions),
        maxTravelDistanceKm: input.maxTravelDistanceKm,
        insuranceExpiryDate: new Date(input.insuranceExpiryDate),
        activeStatus: 1,
        performanceScore: "70.00",
        backgroundCheckStatus: "pending",
      });

      // Update user role to assessor
      await db
        .update(users)
        .set({ role: "assessor" })
        .where(eq(users.id, ctx.user.id));

      return {
        success: true,
        assessorId: assessorResult[0].insertId,
        message: "Application submitted successfully. You will be notified once approved.",
      };
    }),

  /**
   * Get Assessor Profile
   */
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "assessor") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only assessors can view assessor profiles",
      });
    }

    const assessor = await getAssessorByUserId(ctx.user.id);

    if (!assessor) {
      return null;
    }

    return {
      ...assessor,
      specializations: assessor.specializations ? JSON.parse(assessor.specializations) : [],
      certifications: assessor.certifications ? JSON.parse(assessor.certifications) : [],
      serviceRegions: assessor.serviceRegions ? JSON.parse(assessor.serviceRegions) : [],
    };
  }),

  /**
   * Update Assessor Profile
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        marketplaceBio: z.string().min(50).max(500).optional(),
        marketplaceHourlyRate: z.number().min(0).optional(),
        marketplaceAvailability: z.enum(["full_time", "part_time", "weekends_only", "on_demand"]).optional(),
        specializations: z.array(z.string()).optional(),
        certifications: z.array(z.string()).optional(),
        serviceRegions: z.array(z.string()).optional(),
        maxTravelDistanceKm: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "assessor") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only assessors can update assessor profiles",
        });
      }

      const assessor = await getAssessorByUserId(ctx.user.id);

      if (!assessor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assessor profile not found",
        });
      }

      const updateData: Record<string, any> = {};
      if (input.marketplaceBio) updateData.marketplaceBio = input.marketplaceBio;
      if (input.marketplaceHourlyRate) updateData.marketplaceHourlyRate = input.marketplaceHourlyRate.toString();
      if (input.marketplaceAvailability) updateData.marketplaceAvailability = input.marketplaceAvailability;
      if (input.specializations) updateData.specializations = JSON.stringify(input.specializations);
      if (input.certifications) updateData.certifications = JSON.stringify(input.certifications);
      if (input.serviceRegions) updateData.serviceRegions = JSON.stringify(input.serviceRegions);
      if (input.maxTravelDistanceKm) updateData.maxTravelDistanceKm = input.maxTravelDistanceKm;

      await updateAssessor(assessor.id, updateData);

      return {
        success: true,
        message: "Profile updated successfully",
      };
    }),

  /**
   * Enable Marketplace for Insurer-Owned Assessor
   */
  enableMarketplace: protectedProcedure
    .input(
      z.object({
        marketplaceBio: z.string().min(50).max(500),
        marketplaceHourlyRate: z.number().min(0),
        marketplaceAvailability: z.enum(["full_time", "part_time", "weekends_only", "on_demand"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "assessor") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only assessors can enable marketplace",
        });
      }

      const assessor = await getAssessorByUserId(ctx.user.id);

      if (!assessor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assessor profile not found",
        });
      }

      if (assessor.assessorType !== "insurer_owned") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only insurer-owned assessors can enable marketplace",
        });
      }

      await updateAssessor(assessor.id, {
        assessorType: "hybrid",
        marketplaceEnabled: 1,
        marketplaceStatus: "pending_approval",
        marketplaceOnboardedAt: new Date(),
        marketplaceBio: input.marketplaceBio,
        marketplaceHourlyRate: input.marketplaceHourlyRate.toString(),
        marketplaceAvailability: input.marketplaceAvailability,
      });

      return {
        success: true,
        message: "Marketplace enabled. Awaiting approval.",
      };
    }),

  /**
   * List Insurer's Assessors
   */
  listInsurerAssessors: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "insurer" && ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only insurer admins can list assessors",
      });
    }

    const tenantId = ctx.user.tenantId;
    if (!tenantId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User must belong to a tenant organization",
      });
    }

    return await getAssessorsByTenant(tenantId);
  }),

  /**
   * Search Marketplace Assessors
   */
  searchMarketplace: protectedProcedure
    .input(
      z.object({
        serviceRegion: z.string().optional(),
        specializations: z.array(z.string()).optional(),
        minPerformanceScore: z.number().min(0).max(100).optional(),
        minAverageRating: z.number().min(0).max(5).optional(),
      })
    )
    .query(async ({ input }) => {
      return await getMarketplaceAssessors(input);
    }),
});
