// @ts-nocheck
/**
 * Admin Router
 * 
 * Super-admin procedures for tenant management and system administration.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, triggerAiAssessment } from "../db";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { tenants } from "../../drizzle/schema";
import { sendInvitation, getInvitationByToken, acceptInvitation } from "../invitation-service";
import { sql } from "drizzle-orm";

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
      const { claims, users } = await import("../../drizzle/schema");
      
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      // Query for valid user IDs to use as claimants
      const validUsers = await db
        .select({ id: users.id, name: users.name, openId: users.openId })
        .from(users)
        .limit(5);

      if (validUsers.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No valid users found in database - cannot create claims without claimant users",
        });
      }

      const validUserIds = validUsers.map(u => u.id);
      console.log(`[Bulk Seed] Found ${validUsers.length} valid users for claimant assignment`);

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

            // Randomly select a valid user ID for this claim
            const randomUserIndex = Math.floor(Math.random() * validUserIds.length);
            const selectedUserId = validUserIds[randomUserIndex];

            // Insert claim
            const [claim] = await db
              .insert(claims)
              .values({
                claimNumber,
                claimantId: selectedUserId, // Use randomly selected user as claimant
                tenantId: ctx.user.tenantId || "default",
                vehicleMake: template.make,
                vehicleModel: template.model,
                vehicleYear: 2020,
                vehicleRegistration: `ABC${Math.floor(Math.random() * 9000) + 1000}`,
                incidentDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
                incidentDescription: `Test claim with ${template.severity} damage - ${imageCount} photo(s)`,
                damagePhotos: JSON.stringify(selectedImages),
                status: "assessment_pending",
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

  /**
   * Bulk generate AI assessments for claims with damage photos
   * 
   * Processes all claims that have damage_photos but no AI assessment
   * Useful for backfilling assessments after bulk claim seeding
   */
  bulkGenerateAiAssessments: superAdminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(20).default(5),
        maxClaims: z.number().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { batchSize, maxClaims } = input;

      console.log(`[Bulk AI Assessment] Starting batch generation (batch size: ${batchSize})...`);

      try {
        // Query claims with damage photos but no AI assessment
        const missingAssessments = await db.execute(sql`
          SELECT id, claim_number 
          FROM claims 
          WHERE damage_photos IS NOT NULL 
            AND damage_photos != '[]'
            AND id NOT IN (
              SELECT claim_id FROM ai_assessments
            )
          ORDER BY id
          ${maxClaims ? sql`LIMIT ${maxClaims}` : sql``}
        `);

        const claims = missingAssessments.rows as Array<{ id: number; claim_number: string }>;
        const totalClaims = claims.length;

        console.log(`[Bulk AI Assessment] Found ${totalClaims} claims missing AI assessments`);

        if (totalClaims === 0) {
          return {
            success: true,
            message: "No missing assessments found",
            processed: 0,
            successful: 0,
            failed: 0,
            errors: [],
          };
        }

        const results = {
          processed: 0,
          successful: 0,
          failed: 0,
          errors: [] as string[],
        };

        // Process in batches
        for (let i = 0; i < claims.length; i += batchSize) {
          const batch = claims.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(claims.length / batchSize);

          console.log(`[Bulk AI Assessment] Processing batch ${batchNumber}/${totalBatches} (${batch.length} claims)`);

          for (const claim of batch) {
            results.processed++;
            console.log(`[Bulk AI Assessment] [${results.processed}/${totalClaims}] Processing Claim #${claim.claim_number} (ID: ${claim.id})`);

            try {
              await triggerAiAssessment(claim.id);
              results.successful++;
              console.log(`[Bulk AI Assessment] ✓ SUCCESS: Claim #${claim.claim_number}`);
            } catch (error: any) {
              results.failed++;
              const errorMsg = `Claim #${claim.claim_number} (ID: ${claim.id}): ${error.message}`;
              results.errors.push(errorMsg);
              console.error(`[Bulk AI Assessment] ✗ ERROR: ${errorMsg}`);
            }

            // Small delay between claims to prevent overload
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // Delay between batches
          if (i + batchSize < claims.length) {
            console.log(`[Bulk AI Assessment] Waiting 2 seconds before next batch...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Calculate coverage
        const coverageQuery = await db.execute(sql`
          SELECT 
            COUNT(*) as total_claims_with_photos,
            (SELECT COUNT(*) FROM ai_assessments) as total_assessments,
            ROUND(100.0 * (SELECT COUNT(*) FROM ai_assessments) / COUNT(*), 2) as coverage_percent
          FROM claims
          WHERE damage_photos IS NOT NULL AND damage_photos != '[]'
        `);

        const coverageRow = coverageQuery.rows[0] as any;
        const coveragePercent = parseFloat(coverageRow.coverage_percent || '0');

        console.log(`[Bulk AI Assessment] Complete: ${results.successful}/${totalClaims} successful, ${results.failed} failed`);
        console.log(`[Bulk AI Assessment] Coverage: ${coveragePercent}%`);

        return {
          success: true,
          message: `Processed ${results.processed} claims: ${results.successful} successful, ${results.failed} failed`,
          processed: results.processed,
          successful: results.successful,
          failed: results.failed,
          errors: results.errors,
          coverage: {
            totalClaimsWithPhotos: parseInt(coverageRow.total_claims_with_photos || '0'),
            totalAssessments: parseInt(coverageRow.total_assessments || '0'),
            coveragePercent,
          },
        };
      } catch (error: any) {
        console.error(`[Bulk AI Assessment] Fatal error: ${error.message}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Bulk AI assessment generation failed: ${error.message}`,
        });
      }
    }),

  /**
   * Seed minimal production ecosystem with assessors and panel beaters
   */
  seedProductionEcosystem: superAdminProcedure
    .mutation(async ({ ctx }) => {
      try {
        const db = await getDb();
        const results = {
          assessorsCreated: 0,
          claimsAssigned: 0,
          panelBeatersCreated: 0,
          quotesCreated: 0,
          claimsUpdated: 0,
        };

        // 1. Get 5 random claims
        const claimsQuery = await db.execute(sql`SELECT id FROM claims ORDER BY RAND() LIMIT 5`);
        const claims = claimsQuery.rows as Array<{ id: number }>;
        const claimIds = claims.map(c => c.id);

        console.log(`[Ecosystem Seed] Found ${claimIds.length} claims for assignment`);

        // 2. Get the 3 assessor user IDs we created
        const assessorsQuery = await db.execute(sql`
          SELECT id FROM users WHERE role = 'assessor' ORDER BY id DESC LIMIT 3
        `);
        const assessors = assessorsQuery.rows as Array<{ id: number }>;
        const assessorIds = assessors.map(a => a.id);

        console.log(`[Ecosystem Seed] Found ${assessorIds.length} assessors`);

        // 3. Assign assessors to claims (round-robin)
        for (let i = 0; i < claimIds.length; i++) {
          const claimId = claimIds[i];
          const assessorId = assessorIds[i % assessorIds.length];

          await db.execute(sql`
            INSERT INTO claim_involvement_tracking (claim_id, user_id, role, assigned_at, tenant_id)
            VALUES (${claimId}, ${assessorId}, 'assessor', NOW(), ${ctx.user.tenantId})
          `);

          results.claimsAssigned++;
          console.log(`[Ecosystem Seed] Assigned assessor ${assessorId} to claim ${claimId}`);
        }

        // 4. Create 4 panel beaters
        const panelBeaterNames = [
          'AutoFix Pro',
          'Premium Body Shop',
          'Quick Repair Centre',
          'Elite Auto Restoration'
        ];

        const panelBeaterIds: number[] = [];
        for (const name of panelBeaterNames) {
          const result = await db.execute(sql`
            INSERT INTO panel_beaters (name, contact_email, phone, address, tenant_id, status)
            VALUES (
              ${name},
              ${name.toLowerCase().replace(/\s+/g, '') + '@repair.com'},
              '+27-11-555-' + LPAD(FLOOR(RAND() * 10000), 4, '0'),
              'Johannesburg, South Africa',
              ${ctx.user.tenantId},
              'approved'
            )
          `);
          
          const insertId = (result as any).insertId;
          panelBeaterIds.push(insertId);
          results.panelBeatersCreated++;
          console.log(`[Ecosystem Seed] Created panel beater: ${name} (ID: ${insertId})`);
        }

        // 5. Generate 2 quotes per claim (10 quotes total)
        for (const claimId of claimIds) {
          // Select 2 random panel beaters for this claim
          const selectedBeaters = panelBeaterIds.slice(0, 2);

          for (const beaterId of selectedBeaters) {
            const laborCost = Math.floor(Math.random() * 5000) + 2000; // R2000-R7000
            const partsCost = Math.floor(Math.random() * 15000) + 5000; // R5000-R20000
            const totalCost = laborCost + partsCost;
            const estimatedDays = Math.floor(Math.random() * 7) + 3; // 3-10 days

            await db.execute(sql`
              INSERT INTO panel_beater_quotes (
                claim_id, panel_beater_id, labor_cost, parts_cost, total_cost,
                estimated_days, quote_status, tenant_id
              )
              VALUES (
                ${claimId}, ${beaterId}, ${laborCost}, ${partsCost}, ${totalCost},
                ${estimatedDays}, 'submitted', ${ctx.user.tenantId}
              )
            `);

            results.quotesCreated++;
            console.log(`[Ecosystem Seed] Created quote for claim ${claimId} from beater ${beaterId}: R${totalCost}`);
          }

          // Update claim status to 'quotes_pending'
          await db.execute(sql`
            UPDATE claims SET status = 'quotes_pending' WHERE id = ${claimId}
          `);
          results.claimsUpdated++;
        }

        console.log(`[Ecosystem Seed] Complete:`, results);

        return {
          success: true,
          message: 'Production ecosystem seeded successfully',
          ...results,
        };
      } catch (error: any) {
        console.error(`[Ecosystem Seed] Error: ${error.message}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Ecosystem seeding failed: ${error.message}`,
        });
      }
    }),
  
  /**
   * Get observability metrics
   * Returns latest platform health metrics with color-coded status
   */
  getObservabilityMetrics: superAdminProcedure
    .query(async ({ ctx }) => {
      try {
        const { getLatestObservabilityMetrics } = await import("../observability-metrics");
        const metrics = await getLatestObservabilityMetrics(ctx.user.tenantId);
        
        return {
          success: true,
          metrics,
        };
      } catch (error: any) {
        console.error(`[Observability] Error fetching metrics: ${error.message}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch observability metrics: ${error.message}`,
        });
      }
    }),
  
  /**
   * Get pipeline stage health for all recent AI assessments
   * Shows per-stage status (success/failed/skipped), duration, and errors
   */
  getPipelineHealth: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { aiAssessments } = await import('../../drizzle/schema');
        const { desc } = await import('drizzle-orm');

        const rows = await db
          .select({
            id: aiAssessments.id,
            claimId: aiAssessments.claimId,
            createdAt: aiAssessments.createdAt,
            updatedAt: aiAssessments.updatedAt,
            pipelineRunSummary: aiAssessments.pipelineRunSummary,
            versionNumber: aiAssessments.versionNumber,
            isReanalysis: aiAssessments.isReanalysis,
            fraudRiskLevel: aiAssessments.fraudRiskLevel,
            confidenceScore: aiAssessments.confidenceScore,
            fcdiScore: aiAssessments.fcdiScore,
            forensicExecutionLedgerJson: aiAssessments.forensicExecutionLedgerJson,
            assumptionRegistryJson: aiAssessments.assumptionRegistryJson,
            forensicAnalysis: aiAssessments.forensicAnalysis,
          })
          .from(aiAssessments)
          .orderBy(desc(aiAssessments.createdAt))
          .limit(input.limit);

        return rows.map(row => {
          let parsedSummary: any = null;
          try {
            if (row.pipelineRunSummary) {
              parsedSummary = JSON.parse(row.pipelineRunSummary as string);
            }
          } catch { /* ignore parse errors */ }

          // Parse FEL for summary stats
          let felSummary: any = null;
          try {
            if (row.forensicExecutionLedgerJson) {
              const fel = JSON.parse(row.forensicExecutionLedgerJson as string);
              felSummary = {
                replayable: fel.replayable ?? false,
                stageCount: fel.stageRecords?.length ?? 0,
                timedOutStages: (fel.stageRecords ?? []).filter((s: any) => s.timedOut).map((s: any) => s.stageId),
                fallbackStages: (fel.stageRecords ?? []).filter((s: any) => s.fallbackUsed).map((s: any) => s.stageId),
              };
            }
          } catch { /* ignore */ }
          // Parse assumption registry for count
          let assumptionCount = 0;
          let highImpactAssumptions = 0;
          try {
            if (row.assumptionRegistryJson) {
              const ar = JSON.parse(row.assumptionRegistryJson as string);
              assumptionCount = ar.totalCount ?? 0;
              highImpactAssumptions = (ar.assumptions ?? []).filter((a: any) => a.impactLevel === 'HIGH').length;
            }
          } catch { /* ignore */ }
          // Parse forensicAnalysis for state machine and anomaly sentinels
          let psmSummary: any = null;
          let anomalyViolations: any[] = [];
          try {
            if (row.forensicAnalysis) {
              const fa = JSON.parse(row.forensicAnalysis as string);
              psmSummary = fa.pipelineStateMachine ?? null;
              anomalyViolations = fa.anomalySentinelViolations ?? [];
            }
          } catch { /* ignore */ }

          return {
            assessmentId: row.id,
            claimId: row.claimId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            versionNumber: row.versionNumber,
            isReanalysis: row.isReanalysis === 1,
            fraudRiskLevel: row.fraudRiskLevel,
            confidenceScore: row.confidenceScore,
            hasPipelineRunSummary: !!row.pipelineRunSummary,
            stages: parsedSummary?.stages ?? null,
            totalDurationMs: parsedSummary?.totalDurationMs ?? null,
            completedAt: parsedSummary?.completedAt ?? null,
            allSavedToDb: parsedSummary?.allSavedToDb ?? null,
            // Phase 2A additions
            fcdiScore: row.fcdiScore ?? null,
            felSummary,
            assumptionCount,
            highImpactAssumptions,
            psmCurrentState: psmSummary?.currentState ?? null,
            psmFlaggedExceptionCount: (psmSummary?.history ?? []).filter((h: any) => h.to === 'FLAGGED_EXCEPTION').length,
            anomalyViolationCount: anomalyViolations.filter((v: any) => v.violated).length,
          };
        });
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch pipeline health: ${error.message}`,
        });
      }
    }),

  /**
   * Collect and store observability metrics
   * Manually trigger metrics collection
   */
  /**
   * Server environment diagnostics — checks binary availability for PDF extraction
   */
  serverDiagnostics: superAdminProcedure
    .query(async () => {
      const { execSync } = await import('child_process');
      const check = (cmd: string): string => {
        try { return execSync(cmd, { timeout: 5000 }).toString().trim(); }
        catch (e: any) { return `NOT FOUND: ${(e.message ?? '').split('\n')[0]}`; }
      };
      return {
        pdftoppm: check('which pdftoppm 2>/dev/null && pdftoppm -v 2>&1 | head -1 || echo "NOT FOUND"'),
        pdfimages: check('which pdfimages 2>/dev/null && pdfimages -v 2>&1 | head -1 || echo "NOT FOUND"'),
        popplerUtils: check('dpkg -l poppler-utils 2>/dev/null | grep -E "^ii.*poppler" | head -1 || echo "not via dpkg"'),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        tmpWritable: check('touch /tmp/diag-test-kinga && echo writable && rm /tmp/diag-test-kinga'),
        env: {
          hasForgeApiKey: !!process.env.BUILT_IN_FORGE_API_KEY,
          hasForgeApiUrl: !!process.env.BUILT_IN_FORGE_API_URL,
          hasDatabaseUrl: !!process.env.DATABASE_URL,
        },
      };
    }),

  collectObservabilityMetrics: superAdminProcedure
    .mutation(async ({ ctx }) => {
      try {
        const { collectAndStoreObservabilityMetrics } = await import("../observability-metrics");
        await collectAndStoreObservabilityMetrics(ctx.user.tenantId);
        
        return {
          success: true,
          message: 'Observability metrics collected successfully',
        };
      } catch (error: any) {
        console.error(`[Observability] Error collecting metrics: ${error.message}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to collect observability metrics: ${error.message}`,
        });
      }
    }),
});
