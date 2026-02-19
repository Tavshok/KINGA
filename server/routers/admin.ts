/**
 * Admin Router
 * 
 * Super-admin procedures for tenant management and system administration.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { tenants } from "../../drizzle/schema";
import { sendInvitation, getInvitationByToken, acceptInvitation } from "../invitation-service";

const db = getDb();

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

  /**
   * Bulk Seed Test Claims with Real Vehicle Damage Images
   * 
   * Creates 20 test claims with real vehicle damage photos uploaded to S3.
   * Automatically triggers AI assessment for each claim.
   * 
   * @requires Super-admin access
   * @returns Seed operation report with success/failure details
   */
  bulkSeedClaims: superAdminProcedure
    .input(z.object({
      imageDirectory: z.string().default("/home/ubuntu/upload"),
      claimCount: z.number().min(1).max(100).default(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const { readFileSync, existsSync, readdirSync } = await import("fs");
      const { join } = await import("path");
      const { storagePut } = await import("../storage");
      const { triggerAiAssessment } = await import("../db");
      const { claims } = await import("../../drizzle/schema");
      
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const report = {
        timestamp: new Date().toISOString(),
        imagesUploaded: 0,
        claimsCreated: 0,
        aiAssessmentsTriggered: 0,
        errors: [] as string[],
        uploadedImages: [] as { filename: string; s3Url: string }[],
        createdClaims: [] as { claimNumber: string; claimId: number; imageCount: number }[],
      };

      try {
        // Step 1: Find and upload vehicle damage images from directory
        console.log(`[Bulk Seed] Scanning ${input.imageDirectory} for images...`);
        
        if (!existsSync(input.imageDirectory)) {
          throw new Error(`Image directory not found: ${input.imageDirectory}`);
        }

        const imageFiles = readdirSync(input.imageDirectory)
          .filter((file) => /\.(jpg|jpeg|png)$/i.test(file))
          .slice(0, 15); // Limit to 15 images

        if (imageFiles.length === 0) {
          throw new Error(`No image files found in ${input.imageDirectory}`);
        }

        console.log(`[Bulk Seed] Found ${imageFiles.length} images`);

        // Upload images to S3
        for (const filename of imageFiles) {
          try {
            const imagePath = join(input.imageDirectory, filename);
            const imageBuffer = readFileSync(imagePath);

            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const s3Key = `seed-data/damage-photos/${timestamp}-${randomSuffix}-${filename}`;

            const { url: s3Url } = await storagePut(s3Key, imageBuffer, "image/jpeg");

            report.uploadedImages.push({ filename, s3Url });
            report.imagesUploaded++;

            console.log(`[Bulk Seed] Uploaded: ${filename} → ${s3Url}`);
          } catch (error: any) {
            report.errors.push(`Image upload failed (${filename}): ${error.message}`);
          }
        }

        if (report.uploadedImages.length === 0) {
          throw new Error("No images were successfully uploaded to S3");
        }

        // Step 2: Create test claims with damage photos
        console.log(`[Bulk Seed] Creating ${input.claimCount} test claims...`);

        const vehicleTemplates = [
          { make: "Audi", model: "A4", severity: "moderate" },
          { make: "Toyota", model: "Hilux", severity: "severe" },
          { make: "Volkswagen", model: "Amarok", severity: "moderate" },
          { make: "Jeep", model: "Grand Cherokee", severity: "moderate" },
          { make: "Toyota", model: "Corolla", severity: "minor" },
          { make: "Isuzu", model: "D-Max", severity: "minor" },
          { make: "Volvo", model: "FH16", severity: "severe" },
          { make: "Ford", model: "Ranger", severity: "moderate" },
          { make: "Nissan", model: "Navara", severity: "minor" },
          { make: "Mazda", model: "BT-50", severity: "moderate" },
        ];

        for (let i = 0; i < input.claimCount; i++) {
          try {
            const template = vehicleTemplates[i % vehicleTemplates.length];
            
            // Select 1-3 random images for this claim
            const imageCount = Math.floor(Math.random() * 3) + 1;
            const selectedImages = [];
            for (let j = 0; j < imageCount; j++) {
              const randomIndex = Math.floor(Math.random() * report.uploadedImages.length);
              selectedImages.push(report.uploadedImages[randomIndex].s3Url);
            }

            // Generate unique claim number
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            const claimNumber = `SEED-${timestamp}-${randomSuffix}`;

            // Insert claim
            const [claim] = await db
              .insert(claims)
              .values({
                claimNumber,
                claimantUserId: ctx.user.id, // Use current admin user as claimant
                tenantId: ctx.user.tenantId || "default",
                vehicleMake: template.make,
                vehicleModel: template.model,
                vehicleYear: 2020,
                vehicleRegistration: `ABC${Math.floor(Math.random() * 9000) + 1000}`,
                incidentDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
                incidentDescription: `Test claim with ${template.severity} damage - ${imageCount} photo(s)`,
                damagePhotos: JSON.stringify(selectedImages),
                status: "pending_assessment",
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .$returningId();

            report.createdClaims.push({
              claimNumber,
              claimId: claim.id,
              imageCount: selectedImages.length,
            });
            report.claimsCreated++;

            console.log(`[Bulk Seed] Created claim: ${claimNumber} (${template.make} ${template.model})`);

            // Trigger AI assessment
            try {
              await triggerAiAssessment(claim.id);
              report.aiAssessmentsTriggered++;
              console.log(`[Bulk Seed] AI assessment triggered for claim ${claimNumber}`);
            } catch (aiError: any) {
              report.errors.push(`AI assessment failed (${claimNumber}): ${aiError.message}`);
            }
          } catch (claimError: any) {
            report.errors.push(`Claim creation failed: ${claimError.message}`);
          }
        }

        console.log(`[Bulk Seed] Complete: ${report.claimsCreated} claims created, ${report.aiAssessmentsTriggered} AI assessments triggered`);

        return {
          success: true,
          report,
        };
      } catch (error: any) {
        console.error(`[Bulk Seed] Fatal error: ${error.message}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Bulk seed failed: ${error.message}`,
        });
      }
    }),
});
