/**
 * KINGA - AutoVerify AI Insurance Claims Management Platform
 * 
 * This file defines all tRPC API procedures for the application.
 * Procedures are organized by domain (claims, assessors, panel beaters, etc.)
 * and use type-safe contracts with Zod validation.
 * 
 * @module routers
 */

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { claims } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { 
  getAllApprovedPanelBeaters,
  createClaim,
  getClaimsByClaimant,
  getClaimsByStatus,
  getClaimsByAssessor,
  getClaimsForPanelBeater,
  getClaimById,
  getClaimByNumber,
  updateClaimStatus,
  assignClaimToAssessor,
  updateClaimPolicyVerification,
  triggerAiAssessment,
  getUsersByRole,
  createPanelBeaterQuote,
  getQuotesByClaimId,
  getQuotesByPanelBeater,
  createAssessorEvaluation,
  getAssessorEvaluationByClaimId,
  updateAssessorEvaluation,
  createAppointment,
  emitClaimEvent,
  getAppointmentsByAssessor,
  getAppointmentsByClaimId,
  createAuditEntry,
  getAuditTrailByClaimId,
  getAiAssessmentByClaimId,
  createPoliceReport,
  getPoliceReportByClaimId,
  updatePoliceReport,
  createVehicleMarketValuation,
  getVehicleMarketValuationByClaimId,
  getQuoteLineItemsByQuoteId
} from "./db";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { notifyAssessorAssignment, notifyAiAssessmentComplete, notifyQuoteSubmitted, notifyFraudDetected } from "./notifications";
import { invokeLLM } from "./_core/llm";
import { optimizeQuotes, calculateAssessorPerformanceScore, type QuoteAnalysis } from "./cost-optimization";
import { processExternalAssessment } from "./assessment-processor-minimal";
import { exportAssessmentPDF } from "./pdf-export";
import { assessorOnboardingRouter } from "./routers/assessor-onboarding";
import { documentIngestionRouter } from "./routers/document-ingestion";
import { historicalClaimsRouter } from "./routers/historical-claims";
import { automationPoliciesRouter } from "./routers/automation-policies";
import { claimCompletionRouter } from "./routers/claim-completion";
// import { eventIntegration } from "./events/event-integration"; // Temporarily disabled until Kafka is set up

export const appRouter = router({
  system: systemRouter,
  assessorOnboarding: assessorOnboardingRouter,
  documentIngestion: documentIngestionRouter,
  historicalClaims: historicalClaimsRouter,
  automationPolicies: automationPoliciesRouter,
  claimCompletion: claimCompletionRouter,
  insurers: router({
    // TEST: Public endpoint (no auth required)
    testPublic: publicProcedure
      .input(z.object({
        message: z.string(),
      }))
      .mutation(async ({ input }) => {
        console.log('🧪 PUBLIC TEST ENDPOINT REACHED!');
        console.log(`Message: ${input.message}`);
        
        return {
          success: true,
          echo: input.message,
          timestamp: new Date().toISOString()
        };
      }),

    // Upload external assessment document for AI analysis
    uploadExternalAssessment: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileData: z.string(), // base64 encoded PDF
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          console.log(`📤 Processing external assessment: ${input.fileName}`);
          
          // Use enhanced assessment processor with AI analysis
          const result = await processExternalAssessment(input.fileName, input.fileData);
          
          console.log(`✅ Assessment processed successfully`);
          return result;
        } catch (error: any) {
          console.error(`❌ Assessment processing failed:`, error);
          
          // Return a structured error response
          throw new Error(`Failed to process assessment: ${error.message || 'Unknown error'}`);
        }
      }),

    // Export assessment report as PDF
    exportAssessmentPDF: exportAssessmentPDF,

    /**
     * Get Cost Optimization Analysis
     * 
     * Analyzes all panel beater quotes for a claim and provides:
     * - Component-level variance analysis
     * - Negotiation strategies
     * - Fraud pattern detection
     * - Recommended quote selection
     * 
     * @requires Insurer role
     * @param claimId - ID of the claim to analyze
     * @returns Comprehensive optimization analysis
     */
    getCostOptimization: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Only insurers can access cost optimization
        if (ctx.user.role !== "insurer" && ctx.user.role !== "admin") {
          throw new Error("Only insurers can access cost optimization");
        }

        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        // Get all quotes for the claim
        const quotes = await getQuotesByClaimId(input.claimId, tenantId);
        if (quotes.length === 0) {
          return null; // No quotes yet
        }

        // Get panel beater details
        const panelBeaters = await getAllApprovedPanelBeaters();
        const panelBeaterMap = new Map(panelBeaters.map(pb => [pb.id, pb]));

        // Transform quotes into QuoteAnalysis format
        const quoteAnalyses: QuoteAnalysis[] = quotes.map(quote => {
          const panelBeater = panelBeaterMap.get(quote.panelBeaterId);
          const components = quote.componentsJson
            ? JSON.parse(quote.componentsJson)
            : [];

          return {
            quoteId: quote.id,
            panelBeaterId: quote.panelBeaterId,
            panelBeaterName: panelBeater?.businessName || "Unknown",
            totalCost: quote.quotedAmount,
            components,
            partsQuality: quote.partsQuality || "aftermarket",
            warrantyMonths: quote.warrantyMonths || 12,
            estimatedDuration: quote.estimatedDuration || 0,
          };
        });

        // Run optimization analysis
        const optimization = optimizeQuotes(quoteAnalyses);

        return optimization;
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
    switchRole: protectedProcedure
      .input(z.object({
        role: z.enum(["insurer", "assessor", "panel_beater", "claimant", "admin"])
      }))
      .mutation(async ({ ctx, input }) => {
        // Only allow admins to switch roles
        if (ctx.user.role !== "admin") {
          throw new Error("Only admins can switch roles");
        }
        
        // Import db function and schema
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }
        
        // Update user role in database
        await db.update(users)
          .set({ role: input.role })
          .where(eq(users.openId, ctx.user.openId));
        
        // IMPORTANT: Role switching only updates the database.
        // The JWT session token still contains the old role.
        // Client must refresh the page or re-fetch user data after switching.
        // For proper testing, the page will redirect and fetch fresh user data.
        
        return {
          success: true,
          newRole: input.role,
          message: "Role updated. Refreshing session..."
        };
      }),
  }),

  /**
   * Panel Beater Operations
   * 
   * Handles retrieval of approved panel beaters for claim submissions.
   * Panel beaters are pre-vetted repair shops that claimants can select.
   */
  panelBeaters: router({
    list: publicProcedure.query(async () => {
      return await getAllApprovedPanelBeaters();
    }),

    /**
     * Upload quote PDF/image to S3
     */
    uploadQuotePdf: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        fileName: z.string(),
        fileData: z.string(), // base64
        mimeType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import('./storage.ts');
        
        // Convert base64 to buffer
        const buffer = Buffer.from(input.fileData, 'base64');
        
        // Generate unique file key
        const fileExt = input.fileName.split('.').pop();
        const fileKey = `quotes/claim-${input.claimId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        // Upload to S3
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        return { url, fileKey };
      }),

    /**
     * Extract quote data from PDF/image using AI vision
     */
    extractQuoteFromPdf: protectedProcedure
      .input(z.object({
        fileUrl: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm.ts');
        
        // Prepare prompt for quote extraction
        const prompt = `You are analyzing a repair quote document (either handwritten or typed). Extract the following information:

1. Total labor cost (in USD cents)
2. Total parts cost (in USD cents)
3. Total labor hours
4. Estimated repair duration (in days)
5. List of components/parts being repaired or replaced with individual costs
6. Any additional notes or comments

Return the data in this exact JSON format:
{
  "laborCost": <number in cents>,
  "partsCost": <number in cents>,
  "laborHours": <number>,
  "estimatedDuration": <number in days>,
  "components": [
    {
      "name": "<component name>",
      "partCost": <number in cents>,
      "laborCost": <number in cents>,
      "laborHours": <number>
    }
  ],
  "notes": "<any additional notes>"
}

If any value is not found, use 0 for numbers and empty string for text.`;

        // Call LLM with vision
        const response = await invokeLLM({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: input.fileUrl } }
              ] as any // TypeScript workaround for multimodal content
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "quote_extraction",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  laborCost: { type: "integer" },
                  partsCost: { type: "integer" },
                  laborHours: { type: "number" },
                  estimatedDuration: { type: "number" },
                  components: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        partCost: { type: "integer" },
                        laborCost: { type: "integer" },
                        laborHours: { type: "number" }
                      },
                      required: ["name", "partCost", "laborCost", "laborHours"],
                      additionalProperties: false
                    }
                  },
                  notes: { type: "string" }
                },
                required: ["laborCost", "partsCost", "laborHours", "estimatedDuration", "components", "notes"],
                additionalProperties: false
              }
            }
          }
        });

        const content = response.choices[0].message.content;
        const extractedData = JSON.parse(content as string);
        
        return extractedData;
      }),
  }),

  /**
   * Claims Operations
   * 
   * Core claim lifecycle management including:
   * - Submission by claimants
   * - Retrieval by various filters (status, assessor, claimant)
   * - Policy verification by insurers
   * - Assessor assignment
   * - AI assessment triggering
   */
  claims: router({
    /**
     * Submit New Claim
     * 
     * Allows claimants to submit insurance claims with vehicle details,
     * incident information, damage photos, and selected panel beaters.
     * 
     * @requires Authentication
     * @param vehicleMake - Make of the vehicle (e.g., "Toyota")
     * @param vehicleModel - Model of the vehicle (e.g., "Camry")
     * @param vehicleYear - Year of manufacture
     * @param vehicleRegistration - License plate number
     * @param incidentDate - ISO date string of incident
     * @param incidentDescription - Detailed description of the incident
     * @param incidentLocation - Location where incident occurred
     * @param damagePhotos - Array of S3 URLs for damage photos
     * @param policyNumber - Insurance policy number
     * @param selectedPanelBeaterIds - Array of exactly 3 panel beater IDs
     * @returns Claim number and success status
     */
    submit: protectedProcedure
      .input(z.object({
        vehicleMake: z.string(),
        vehicleModel: z.string(),
        vehicleYear: z.number(),
        vehicleRegistration: z.string(),
        incidentDate: z.string(), // ISO date string
        incidentDescription: z.string(),
        incidentLocation: z.string(),
        damagePhotos: z.array(z.string()), // Array of S3 URLs
        policyNumber: z.string(),
        selectedPanelBeaterIds: z.array(z.number()).min(0).max(3), // Allow 0-3 panel beaters (0 for external assessments)
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const claimNumber = `CLM-${nanoid(10).toUpperCase()}`;
        
        await createClaim({
          claimantId: ctx.user.id,
          claimNumber,
          vehicleMake: input.vehicleMake,
          vehicleModel: input.vehicleModel,
          vehicleYear: input.vehicleYear,
          vehicleRegistration: input.vehicleRegistration,
          incidentDate: new Date(input.incidentDate),
          incidentDescription: input.incidentDescription,
          incidentLocation: input.incidentLocation,
          damagePhotos: JSON.stringify(input.damagePhotos),
          policyNumber: input.policyNumber,
          selectedPanelBeaterIds: JSON.stringify(input.selectedPanelBeaterIds),
          status: "submitted",
        });

        // Get the newly created claim to retrieve its ID
        const newClaim = await getClaimByNumber(claimNumber);
        if (!newClaim) throw new Error("Failed to retrieve newly created claim");

        // Create audit entry
        await createAuditEntry({
          claimId: newClaim.id,
          userId: ctx.user.id,
          action: "claim_submitted",
          entityType: "claim",
          changeDescription: `Claim ${claimNumber} submitted`,
        });

        // Emit claim_submitted event (Phase 2: Dataset Capture)
        const { emitClaimEvent } = await import("./dataset-capture");
        await emitClaimEvent({
          claimId: newClaim.id,
          eventType: "claim_submitted",
          payload: {
            claimNumber,
            damagePhotoCount: input.damagePhotos.length,
            policyVerified: false,
            vehicleYear: input.vehicleYear,
            vehicleMake: input.vehicleMake,
            vehicleModel: input.vehicleModel,
          },
          userId: ctx.user.id,
          userRole: ctx.user.role,
        });

        // Automatically trigger AI assessment if damage photos are provided
        if (input.damagePhotos && input.damagePhotos.length > 0) {
          try {
            await triggerAiAssessment(newClaim.id);
            console.log(`AI assessment automatically triggered for claim ${claimNumber}`);
          } catch (error) {
            console.error(`Failed to trigger AI assessment for claim ${claimNumber}:`, error);
            // Don't fail the claim submission if AI assessment fails
          }
        }

        return { success: true, claimNumber };
      }),

    // Get claims by claimant
    myClaims: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
      return await getClaimsByClaimant(ctx.user.id, tenantId);
    }),

    // Get claims by status (insurers)
    byStatus: protectedProcedure
      .input(z.object({
        status: z.enum([
          "submitted",
          "triage",
          "assessment_pending",
          "assessment_in_progress",
          "quotes_pending",
          "comparison",
          "repair_assigned",
          "repair_in_progress",
          "completed",
          "rejected"
        ]),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        return await getClaimsByStatus(input.status, tenantId);
      }),

    // Get claims assigned to assessor
    myAssignments: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
      return await getClaimsByAssessor(ctx.user.id, tenantId);
    }),

    // Get claims by assessor ID
    byAssessor: protectedProcedure
      .input(z.object({ assessorId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        return await getClaimsByAssessor(input.assessorId, tenantId);
      }),

    // Get claims for panel beater
    myQuoteRequests: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      // Need to get panel beater ID from user
      // For now, return empty array
      return [];
    }),

    // Get single claim by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        return await getClaimById(input.id, tenantId);
      }),

    /**
     * Assign Claim to Assessor
     * 
     * Allows insurers to assign a claim to a specific assessor for evaluation.
     * Creates an audit trail entry for transparency.
     * 
     * @requires Authentication (Insurer role)
     * @param claimId - ID of the claim to assign
     * @param assessorId - ID of the assessor to assign to
     * @returns Success status
     */
    assignToAssessor: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        assessorId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        
        // Verify claim belongs to user's tenant before assignment
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new Error("Claim not found or access denied");
        
        await assignClaimToAssessor(input.claimId, input.assessorId);
        
        // Automatically progress status to assessment_pending
        await updateClaimStatus(input.claimId, "assessment_pending");

        // Get assessor details for notification
        const assessors = await getUsersByRole("assessor");
        const assessor = assessors.find(a => a.id === input.assessorId);

        // Send email notification to assessor
        if (claim && assessor) {
          const { notifyAssessorAssignment: notifyAssignment } = await import('./workflow-notifications');
          const { getUserById } = await import('./db');
          
          // Get claimant details
          const claimant = await getUserById(claim.claimantId);
          
          await notifyAssignment({
            claimId: input.claimId,
            assessorId: input.assessorId,
            claimNumber: claim.claimNumber,
            claimantName: claimant?.name || 'Claimant',
            tenantId: tenantId || 'default',
          });
        }

        // Create in-app notification for assessor
        if (claim) {
          const { createNotification } = await import("./db");
          await createNotification({
            userId: input.assessorId,
            title: "New Claim Assigned",
            message: `You have been assigned to assess claim ${claim.claimNumber} for ${claim.vehicleMake} ${claim.vehicleModel}`,
            type: "claim_assigned",
            claimId: input.claimId,
            entityType: "claim",
            entityId: input.claimId,
            actionUrl: `/assessor/claims/${input.claimId}`,
            priority: "high",
          });
        }

        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "assessor_assigned",
          entityType: "claim",
          entityId: input.claimId,
          changeDescription: `Assigned to assessor ID ${input.assessorId}`,
        });

        // Emit event for analytics
        await emitClaimEvent({
          claimId: input.claimId,
          eventType: "assessor_assigned",
          userId: ctx.user.id,
          userRole: ctx.user.role,
          tenantId,
          eventPayload: { assessorId: input.assessorId },
        });

        return { success: true };
      }),

    /**
     * Verify Insurance Policy
     * 
     * Allows insurers to verify or reject a claimant's policy payment status.
     * This is a critical step before proceeding with claim processing.
     * 
     * @requires Authentication (Insurer role)
     * @param claimId - ID of the claim
     * @param verified - true to approve, false to reject
     * @returns Success status
     */
    verifyPolicy: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        verified: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        await updateClaimPolicyVerification(input.claimId, input.verified);

        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "policy_verified",
          entityType: "claim",
          entityId: input.claimId,
          changeDescription: `Policy verification: ${input.verified ? "approved" : "rejected"}`,
        });

        return { success: true };
      }),

    /**
     * Trigger AI Damage Assessment
     * 
     * Initiates automated AI analysis of damage photos to estimate repair costs
     * and detect potential fraud indicators.
     * 
     * @requires Authentication (Insurer role)
     * @param claimId - ID of the claim to assess
     * @returns Success status
     */
    triggerAiAssessment: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        await triggerAiAssessment(input.claimId);
        
        // Automatically progress status to assessment_in_progress
        await updateClaimStatus(input.claimId, "assessment_in_progress");

        // Get claim and AI assessment details for notification
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        const aiAssessment = await getAiAssessmentByClaimId(input.claimId, tenantId);

        // Send email notification about AI assessment completion
        if (claim && aiAssessment) {
          await notifyAiAssessmentComplete({
            claimId: input.claimId,
            recipientEmail: ctx.user.email || "",
            recipientName: ctx.user.name || "Insurer",
            claimNumber: claim.claimNumber,
            estimatedCost: (aiAssessment.estimatedCost || 0).toString(),
            fraudRiskLevel: aiAssessment.fraudRiskLevel || "low",
            confidenceScore: (aiAssessment.confidenceScore || 0).toString(),
          });
          
          // Create in-app notification for high fraud risk
          if (aiAssessment.fraudRiskLevel === "high") {
            const { createNotification } = await import("./db");
            await createNotification({
              userId: ctx.user.id,
              title: "⚠️ High Fraud Risk Detected",
              message: `AI assessment flagged claim ${claim.claimNumber} as high fraud risk. Immediate review recommended.`,
              type: "fraud_detected",
              claimId: input.claimId,
              entityType: "ai_assessment",
              entityId: aiAssessment.id,
              actionUrl: `/insurer/claims/${input.claimId}/comparison`,
              priority: "urgent",
            });
          } else {
            // Regular assessment completion notification
            const { createNotification } = await import("./db");
            await createNotification({
              userId: ctx.user.id,
              title: "AI Assessment Complete",
              message: `AI damage assessment completed for claim ${claim.claimNumber}. Estimated cost: $${((aiAssessment.estimatedCost || 0) / 100).toFixed(2)}`,
              type: "assessment_completed",
              claimId: input.claimId,
              entityType: "ai_assessment",
              actionUrl: `/insurer/claims/${input.claimId}/comparison`,
              priority: "medium",
            });
          }
        }

        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "ai_assessment_triggered",
          entityType: "claim",
          entityId: input.claimId,
          changeDescription: "AI damage assessment triggered and completed",
        });

        return { success: true };
      }),

    /**
     * Approve Claim and Assign Repair
     * 
     * Final approval step where insurer selects the winning panel beater quote
     * and progresses the claim to repair_assigned status.
     * 
     * @requires Authentication (Insurer role)
     * @param claimId - ID of the claim to approve
     * @param selectedQuoteId - ID of the selected panel beater quote
     * @returns Success status
     */
    approveClaim: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        selectedQuoteId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Get claim and quote details
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
        
        const quotes = await getQuotesByClaimId(input.claimId, tenantId);
        const selectedQuote = quotes.find(q => q.id === input.selectedQuoteId);
        if (!selectedQuote) throw new TRPCError({ code: "NOT_FOUND", message: "Selected quote not found" });
        
        const approvedAmount = selectedQuote.quotedAmount || 0;
        
        // Get active automation policy to determine approval threshold
        const { getActiveAutomationPolicy } = await import("./automation-policy-manager");
        const policy = await getActiveAutomationPolicy(tenantId);
        const requireManagerApprovalAbove = policy?.requireManagerApprovalAbove || 2500000; // Default 25,000 ZAR in cents
        
        // Determine if financial approval is required
        const requiresFinancialApproval = approvedAmount > requireManagerApprovalAbove;
        
        // Validate state transition to repair_assigned
        const { validateStateTransition } = await import("./workflow-validator");
        validateStateTransition(claim.status as any, "repair_assigned");
        
        // Update claim with technical approval
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.update(claims).set({
          status: "repair_assigned",
          technicallyApprovedBy: ctx.user.id,
          technicallyApprovedAt: new Date(),
          approvedAmount,
          updatedAt: new Date(),
        }).where(eq(claims.id, input.claimId));
        
        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "claim_approved",
          entityType: "claim",
          entityId: input.claimId,
          changeDescription: `Claim technically approved. Selected panel beater quote #${input.selectedQuoteId} for R${(approvedAmount / 100).toFixed(2)}. ${requiresFinancialApproval ? 'Requires financial approval (amount exceeds threshold).' : 'No financial approval required.'}`,
        });
        
        // Emit event for analytics
        await emitClaimEvent({
          claimId: input.claimId,
          eventType: "claim_approved",
          userId: ctx.user.id,
          userRole: ctx.user.role,
          tenantId,
          eventPayload: { 
            selectedQuoteId: input.selectedQuoteId,
            approvedAmount,
            requiresFinancialApproval,
            approvalType: "technical",
          },
        });
        
        console.log(`[Approval] Claim ${claim.claimNumber} technically approved by user ${ctx.user.id} for R${(approvedAmount / 100).toFixed(2)}`);

        // Send notifications
        const { notifyClaimApproval, notifyPanelBeaterSelection } = await import('./workflow-notifications');
        const { getPanelBeaterById } = await import('./db');
        
        // Get panel beater details
        const panelBeater = await getPanelBeaterById(selectedQuote.panelBeaterId);
        
        // Notify claimant of approval
        await notifyClaimApproval({
          claimId: input.claimId,
          claimNumber: claim.claimNumber,
          claimantId: claim.claimantId,
          approvedAmount,
          selectedPanelBeater: panelBeater?.businessName || 'Selected Panel Beater',
          tenantId: tenantId || 'default',
        });
        
        // Notify panel beater of selection
        await notifyPanelBeaterSelection({
          claimId: input.claimId,
          panelBeaterId: selectedQuote.panelBeaterId,
          claimNumber: claim.claimNumber,
          claimantName: 'Claimant', // TODO: Get from user table
          approvedAmount,
          tenantId: tenantId || 'default',
        });

        return { 
          success: true, 
          requiresFinancialApproval,
          approvedAmount,
          threshold: requireManagerApprovalAbove
        };
      }),
    
    // Financial approval for high-value claims
    financialApproval: protectedProcedure
      .input(z.object({
        claimId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Verify user has financial approval authority (Claims Manager, Executive, or Admin)
        if (ctx.user.role !== "admin" && ctx.user.insurerRole !== "claims_manager" && ctx.user.insurerRole !== "executive") {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "Financial approval requires Claims Manager or Executive role" 
          });
        }
        
        // Get claim
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
        
        // Verify technical approval exists
        if (!claim.technicallyApprovedBy || !claim.technicallyApprovedAt) {
          throw new TRPCError({ 
            code: "PRECONDITION_FAILED", 
            message: "Claim must be technically approved before financial approval" 
          });
        }
        
        // Update claim with financial approval
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.update(claims).set({
          financiallyApprovedBy: ctx.user.id,
          financiallyApprovedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(claims.id, input.claimId));
        
        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "financial_approval",
          entityType: "claim",
          entityId: input.claimId,
          changeDescription: `Claim financially approved for R${((claim.approvedAmount || 0) / 100).toFixed(2)}`,
        });
        
        console.log(`[Approval] Claim ${claim.claimNumber} financially approved by user ${ctx.user.id}`);

        return { success: true };
      }),
  }),

  // Assessor operations
  assessors: router({
    list: protectedProcedure.query(async () => {
      return await getUsersByRole("assessor");
    }),

    // Get performance metrics for an assessor
    getPerformanceMetrics: protectedProcedure
      .input(z.object({
        assessorId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        
        // Get all claims assigned to this assessor
        const assessments = await getClaimsByAssessor(input.assessorId, tenantId);

        const totalAssessments = assessments.length;
        if (totalAssessments === 0) {
          return {
            totalAssessments: 0,
            assessmentsThisMonth: 0,
            avgTurnaroundHours: 0,
            totalSavings: 0,
            savingsPercentage: 0,
            fraudCasesDetected: 0,
            fraudPrevented: 0,
            accuracyRate: 0,
            initialEstimates: 0,
            turnaroundBreakdown: { under24: 0, under48: 0, over48: 0 },
            fraudBreakdown: { high: 0, medium: 0 },
          };
        }

        // Calculate turnaround times
        let totalTurnaroundHours = 0;
        let under24 = 0;
        let under48 = 0;
        let over48 = 0;
        let assessmentsThisMonth = 0;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        for (const claim of assessments) {
          if (claim.createdAt && claim.updatedAt) {
            const hours = (claim.updatedAt.getTime() - claim.createdAt.getTime()) / (1000 * 60 * 60);
            totalTurnaroundHours += hours;
            if (hours < 24) under24++;
            else if (hours < 48) under48++;
            else over48++;
          }
          if (claim.createdAt && claim.createdAt >= monthStart) {
            assessmentsThisMonth++;
          }
        }

        const avgTurnaroundHours = totalTurnaroundHours / totalAssessments;

        // Get AI assessments and quotes for each claim
        let fraudCasesDetected = 0;
        let fraudPrevented = 0;
        let highRiskCases = 0;
        let mediumRiskCases = 0;
        let initialEstimates = 0;
        let finalCosts = 0;

        for (const claim of assessments) {
          // Get AI assessment
          const aiAssessment = await getAiAssessmentByClaimId(claim.id, tenantId);
          if (aiAssessment) {
            if (aiAssessment.fraudRiskLevel === "high") {
              fraudCasesDetected++;
              highRiskCases++;
              fraudPrevented += aiAssessment.estimatedCost || 0;
            } else if (aiAssessment.fraudRiskLevel === "medium") {
              fraudCasesDetected++;
              mediumRiskCases++;
              fraudPrevented += (aiAssessment.estimatedCost || 0) / 2;
            }
            finalCosts += aiAssessment.estimatedCost || 0;
          }

          // Get quotes
          const quotes = await getQuotesByClaimId(claim.id, tenantId);
          for (const quote of quotes) {
            initialEstimates += quote.quotedAmount || 0;
          }
        }

        const totalSavings = Math.max(0, initialEstimates - finalCosts);
        const savingsPercentage = initialEstimates > 0 ? (totalSavings / initialEstimates) * 100 : 0;

        return {
          totalAssessments,
          assessmentsThisMonth,
          avgTurnaroundHours,
          totalSavings,
          savingsPercentage,
          fraudCasesDetected,
          fraudPrevented,
          accuracyRate: 92.5, // Placeholder - would need actual verification data
          initialEstimates,
          turnaroundBreakdown: {
            under24,
            under48,
            over48,
          },
          fraudBreakdown: {
            high: highRiskCases,
            medium: mediumRiskCases,
          },
        };
      }),

    /**
     * Get Assessor Performance Dashboard
     * 
     * Returns performance metrics, recent assessments, and tier information
     * for the current assessor.
     * 
     * @requires Assessor role
     * @returns Performance dashboard data
     */
    getPerformanceDashboard: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "assessor" && ctx.user.role !== "admin") {
          throw new Error("Only assessors can access performance dashboard");
        }

        const { getDb } = await import("./db");
        const { users, claims, assessorEvaluations } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");

        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Get assessor's current stats
        const assessorResult = await db
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);

        const assessor = assessorResult[0];

        if (!assessor) throw new Error("Assessor not found");

        // Get recent assessments
        const recentAssessments = await db
          .select()
          .from(assessorEvaluations)
          .where(eq(assessorEvaluations.assessorId, ctx.user.id))
          .orderBy(desc(assessorEvaluations.createdAt))
          .limit(10);

        // Get assigned claims
        const assignedClaims = await db
          .select()
          .from(claims)
          .where(eq(claims.assignedAssessorId, ctx.user.id))
          .orderBy(desc(claims.createdAt))
          .limit(20);

        return {
          tier: assessor.assessorTier || "free",
          tierActivatedAt: assessor.tierActivatedAt,
          tierExpiresAt: assessor.tierExpiresAt,
          performanceScore: assessor.performanceScore || 70,
          totalAssessmentsCompleted: assessor.totalAssessmentsCompleted || 0,
          averageVarianceFromFinal: assessor.averageVarianceFromFinal,
          recentAssessments,
          assignedClaims,
        };
      }),

    /**
     * Get Assessor Leaderboard
     * 
     * Returns all assessors ranked by performance score
     * 
     * @returns Leaderboard data with rankings
     */
    getLeaderboard: protectedProcedure
      .query(async () => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");

        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Get all assessors ordered by performance score
        const assessors = await db
          .select({
            id: users.id,
            name: users.name,
            tier: users.assessorTier,
            performanceScore: users.performanceScore,
            accuracyScore: users.accuracyScore,
            avgCompletionTime: users.avgCompletionTime,
            totalAssessments: users.totalAssessmentsCompleted,
          })
          .from(users)
          .where(eq(users.role, "assessor"))
          .orderBy(desc(users.performanceScore));

        return assessors;
      }),
  }),

  // Assessor Evaluations
  assessorEvaluations: router({
    // Submit evaluation
    submit: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        assessorId: z.number(),
        estimatedRepairCost: z.number(),
        laborCost: z.number().optional(),
        partsCost: z.number().optional(),
        estimatedDuration: z.number(),
        damageAssessment: z.string(),
        recommendations: z.string().optional(),
        fraudRiskLevel: z.enum(["low", "medium", "high"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        await createAssessorEvaluation({
          claimId: input.claimId,
          assessorId: input.assessorId,
          estimatedRepairCost: input.estimatedRepairCost,
          laborCost: input.laborCost,
          partsCost: input.partsCost,
          estimatedDuration: input.estimatedDuration,
          damageAssessment: input.damageAssessment,
          recommendations: input.recommendations,
          fraudRiskLevel: input.fraudRiskLevel,
          status: "submitted",
        });
        
        // Automatically progress status to quotes_pending
        await updateClaimStatus(input.claimId, "quotes_pending");

        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "assessor_evaluation_submitted",
          entityType: "assessor_evaluation",
          changeDescription: `Assessor evaluation submitted: $${(input.estimatedRepairCost / 100).toFixed(2)}`,
        });

        // Emit event for analytics
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        await emitClaimEvent({
          claimId: input.claimId,
          eventType: "evaluation_submitted",
          userId: ctx.user.id,
          userRole: ctx.user.role,
          tenantId,
          eventPayload: { 
            assessorId: input.assessorId,
            estimatedRepairCost: input.estimatedRepairCost,
            fraudRiskLevel: input.fraudRiskLevel,
          },
        });

        return { success: true };
      }),

    // Get evaluation by claim
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        return await getAssessorEvaluationByClaimId(input.claimId, tenantId);
      }),
  }),

  // Quotes operations
  quotes: router({
    // Submit quote (panel beaters)
    submit: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        panelBeaterId: z.number(),
        quotedAmount: z.number(),
        laborCost: z.number().optional(),
        partsCost: z.number().optional(),
        laborHours: z.number().optional(),
        estimatedDuration: z.number(),
        itemizedBreakdown: z.array(z.object({
          item: z.string(),
          cost: z.number(),
        })),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        await createPanelBeaterQuote({
          claimId: input.claimId,
          panelBeaterId: input.panelBeaterId,
          quotedAmount: input.quotedAmount,
          laborCost: input.laborCost,
          partsCost: input.partsCost,
          laborHours: input.laborHours,
          estimatedDuration: input.estimatedDuration,
          itemizedBreakdown: JSON.stringify(input.itemizedBreakdown),
          notes: input.notes,
          status: "submitted",
        });
        
        // Check if all quotes have been received (3 panel beaters)
        const allQuotes = await getQuotesByClaimId(input.claimId);
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        
        if (allQuotes.length >= 3) {
          // All quotes received, progress to comparison stage
          await updateClaimStatus(input.claimId, "comparison");
          
          // Notify insurer that all quotes are ready for comparison
          if (claim) {
            const insurers = await getUsersByRole("insurer");
            const { createNotification } = await import("./db");
            
            for (const insurer of insurers) {
              await createNotification({
                userId: insurer.id,
                title: "All Quotes Received",
                message: `All panel beater quotes received for claim ${claim.claimNumber}. Ready for comparison and fraud detection.`,
                type: "quote_submitted",
                claimId: input.claimId,
                entityType: "quote",
                actionUrl: `/insurer/claims/${input.claimId}/comparison`,
                priority: "high",
              });
            }
          }
        } else {
          // Notify insurer of new quote submission
          if (claim) {
            const insurers = await getUsersByRole("insurer");
            const { createNotification } = await import("./db");
            
            for (const insurer of insurers) {
              await createNotification({
                userId: insurer.id,
                title: "New Quote Submitted",
                message: `Panel beater submitted quote for claim ${claim.claimNumber} (${allQuotes.length}/3 quotes received)`,
                type: "quote_submitted",
                claimId: input.claimId,
                entityType: "quote",
                actionUrl: `/insurer/claims/${input.claimId}/comparison`,
                priority: "medium",
              });
            }
          }
        }

        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "quote_submitted",
          entityType: "quote",
          changeDescription: `Quote submitted: $${(input.quotedAmount / 100).toFixed(2)}`,
        });

        // Emit event for analytics
        await emitClaimEvent({
          claimId: input.claimId,
          eventType: "quote_submitted",
          userId: ctx.user.id,
          userRole: ctx.user.role,
          tenantId,
          eventPayload: { 
            panelBeaterId: input.panelBeaterId,
            quotedAmount: input.quotedAmount,
            quotesReceived: allQuotes.length + 1, // Include current quote
          },
        });
        
        // Send email notification for quote submission
        if (claim) {
          const { notifyQuoteSubmission } = await import('./workflow-notifications');
          await notifyQuoteSubmission({
            claimId: input.claimId,
            panelBeaterId: input.panelBeaterId,
            claimNumber: claim.claimNumber,
            quotedAmount: input.quotedAmount,
            estimatedDays: input.estimatedDuration || 0,
            tenantId: tenantId || 'default',
          });
        }

        return { success: true };
      }),

    // Get quotes for a claim
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        return await getQuotesByClaimId(input.claimId, tenantId);
      }),

    // Get quotes with line items for comparison
    getWithLineItems: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const quotes = await getQuotesByClaimId(input.claimId, tenantId);
        
        // Fetch line items for each quote
        const quotesWithItems = await Promise.all(
          quotes.map(async (quote) => {
            const lineItems = await getQuoteLineItemsByQuoteId(quote.id);
            return {
              ...quote,
              lineItems,
            };
          })
        );
        
        return quotesWithItems;
      }),

    // Extract quote from handwritten image using OCR
    extractFromImage: protectedProcedure
      .input(z.object({ 
        claimId: z.number(),
        imageBase64: z.string() 
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");

        const { invokeLLM } = await import("./_core/llm");

        // Use AI vision to extract line items from the image
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are an expert at extracting structured data from handwritten quotations. Extract all line items with description, quantity, unit price, and calculate line totals. Return valid JSON only."
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all line items from this handwritten quotation. For each item, provide: description, part_number (if visible), quantity, unit_price, and line_total. Return as JSON array."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: input.imageBase64
                  }
                }
              ] as any // TypeScript workaround for multimodal content
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "quote_extraction",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  lineItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        partNumber: { type: "string" },
                        quantity: { type: "number" },
                        unitPrice: { type: "number" },
                        lineTotal: { type: "number" }
                      },
                      required: ["description", "quantity", "unitPrice", "lineTotal"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["lineItems"],
                additionalProperties: false
              }
            }
          }
        });

        const extracted = JSON.parse((response.choices[0].message.content as string) || "{}");

        return extracted;
      }),
  }),

  // Appointments operations
  appointments: router({
    // Create appointment (assessors)
    create: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        appointmentType: z.enum(["claimant_inspection", "panel_beater_inspection"]),
        claimantId: z.number().optional(),
        panelBeaterId: z.number().optional(),
        scheduledDate: z.string(), // ISO date string
        location: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        await createAppointment({
          claimId: input.claimId,
          assessorId: ctx.user.id,
          appointmentType: input.appointmentType,
          claimantId: input.claimantId,
          panelBeaterId: input.panelBeaterId,
          scheduledDate: new Date(input.scheduledDate),
          location: input.location,
          notes: input.notes,
          status: "scheduled",
        });

        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "appointment_scheduled",
          entityType: "appointment",
          changeDescription: `${input.appointmentType} scheduled for ${input.scheduledDate}`,
        });

        return { success: true };
      }),

    // Get appointments by assessor
    myAppointments: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      return await getAppointmentsByAssessor(ctx.user.id);
    }),

    // Get appointments by claim
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        return await getAppointmentsByClaimId(input.claimId);
      }),
  }),

  // AI Assessments
  aiAssessments: router({
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        return await getAiAssessmentByClaimId(input.claimId, tenantId);
      }),
    all: protectedProcedure
      .query(async () => {
        // Fetch all AI assessments (for batch export)
        const { getDb } = await import("./db");
        const { aiAssessments } = await import("../drizzle/schema");
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        return await db.select().from(aiAssessments);
      }),
  }),

  // Storage operations
  storage: router({
    uploadImage: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileData: z.string(), // base64 encoded
        contentType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");

        // Extract base64 data (remove data:image/...;base64, prefix)
        const base64Data = input.fileData.split(',')[1] || input.fileData;
        const buffer = Buffer.from(base64Data, 'base64');

        // Generate unique file key
        const fileExtension = input.fileName.split('.').pop() || 'jpg';
        const fileKey = `claims/${ctx.user.id}/${nanoid()}.${fileExtension}`;

        // Upload to S3
        const result = await storagePut(fileKey, buffer, input.contentType);

        return { url: result.url, key: result.key };
      }),
  }),

  /**
   * Document Management Router
   * Handles file uploads, listing, and deletion for claim-related documents
   */
  documents: router({
    // Upload a document to a claim
    upload: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        fileName: z.string(),
        fileData: z.string(), // base64 encoded
        fileSize: z.number(),
        mimeType: z.string(),
        documentTitle: z.string().optional(),
        documentDescription: z.string().optional(),
        documentCategory: z.enum([
          "damage_photo",
          "repair_quote",
          "invoice",
          "police_report",
          "medical_report",
          "insurance_policy",
          "correspondence",
          "other"
        ]).default("other"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");

        // Extract base64 data
        const base64Data = input.fileData.split(',')[1] || input.fileData;
        const buffer = Buffer.from(base64Data, 'base64');

        // Generate unique file key with random suffix to prevent enumeration
        const fileExtension = input.fileName.split('.').pop() || 'pdf';
        const randomSuffix = nanoid(10);
        const fileKey = `claim-documents/${input.claimId}/${randomSuffix}-${input.fileName}`;

        // Upload to S3
        const result = await storagePut(fileKey, buffer, input.mimeType);

        // Save document metadata to database
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new Error("Database not available");

        const { claimDocuments } = await import("../drizzle/schema");
        await db.insert(claimDocuments).values({
          claimId: input.claimId,
          uploadedBy: ctx.user.id,
          fileName: input.fileName,
          fileKey: result.key,
          fileUrl: result.url,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          documentTitle: input.documentTitle,
          documentDescription: input.documentDescription,
          documentCategory: input.documentCategory,
          visibleToRoles: JSON.stringify(["insurer", "assessor", "panel_beater", "claimant"]),
        });

        // Create audit trail entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "document_uploaded",
          entityType: "document",
          changeDescription: `Uploaded document: ${input.fileName} (${input.documentCategory})`,
        });

        return { success: true, url: result.url, key: result.key };
      }),

    // List documents for a claim
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");

        const db = await import("./db").then(m => m.getDb());
        if (!db) return [];

        const { claimDocuments } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");

        const documents = await db
          .select()
          .from(claimDocuments)
          .where(eq(claimDocuments.claimId, input.claimId))
          .orderBy(desc(claimDocuments.createdAt));

        // Filter by role-based access control
        return documents.filter(doc => {
          if (!doc.visibleToRoles) return true;
          try {
            const roles = JSON.parse(doc.visibleToRoles);
            return roles.includes(ctx.user?.role);
          } catch {
            return true;
          }
        });
      }),

    // Delete a document
    delete: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");

        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new Error("Database not available");

        const { claimDocuments } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        // Get document details
        const docs = await db
          .select()
          .from(claimDocuments)
          .where(eq(claimDocuments.id, input.documentId))
          .limit(1);

        if (docs.length === 0) {
          throw new Error("Document not found");
        }

        const doc = docs[0];

        // Only allow deletion by uploader or admin/insurer
        if (doc.uploadedBy !== ctx.user.id && !['admin', 'insurer'].includes(ctx.user.role)) {
          throw new Error("Not authorized to delete this document");
        }

        // Delete from database
        await db.delete(claimDocuments).where(eq(claimDocuments.id, input.documentId));

        // Create audit trail entry
        await createAuditEntry({
          claimId: doc.claimId,
          userId: ctx.user.id,
          action: "document_deleted",
          entityType: "document",
          entityId: input.documentId,
          changeDescription: `Deleted document: ${doc.fileName}`,
        });

        return { success: true };
      }),
  }),

  /**
   * Notifications Router
   * Handles real-time notifications for users about claim events,
   * assignments, quotes, fraud detection, and status changes
   */
  notifications: router({
    // Get all notifications for current user
    list: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { getNotificationsByUser } = await import("./db");
        return await getNotificationsByUser(ctx.user.id, input.limit || 50);
      }),

    // Get unread notification count
    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { getUnreadNotificationCount } = await import("./db");
        return { count: await getUnreadNotificationCount(ctx.user.id) };
      }),

    // Mark notification as read
    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { markNotificationAsRead } = await import("./db");
        await markNotificationAsRead(input.notificationId);
        return { success: true };
      }),

    // Mark all notifications as read
    markAllAsRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { markAllNotificationsAsRead } = await import("./db");
        await markAllNotificationsAsRead(ctx.user.id);
        return { success: true };
      }),

    // Delete a notification
    delete: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { deleteNotification } = await import("./db");
        await deleteNotification(input.notificationId);
        return { success: true };
      }),
  }),

  /**
   * Police Reports Router
   * Handles police report submission and cross-validation
   */
  policeReports: router({
    // Create a police report
    create: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        reportNumber: z.string(),
        policeStation: z.string().optional(),
        officerName: z.string().optional(),
        reportDate: z.string().optional(),
        reportedSpeed: z.number().optional(),
        reportedWeather: z.string().optional(),
        reportedRoadCondition: z.string().optional(),
        accidentLocation: z.string().optional(),
        accidentDescription: z.string().optional(),
        reportDocumentUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        if (!['assessor', 'insurer', 'admin'].includes(ctx.user.role)) {
          throw new Error("Not authorized");
        }

        // Get claim details for cross-validation
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new Error("Claim not found");

        // Calculate discrepancies
        let speedDiscrepancy = null;
        if (input.reportedSpeed && claim.incidentDescription) {
          // Try to extract speed from incident description
          const speedMatch = claim.incidentDescription.match(/(\d+)\s*km\/h/i);
          if (speedMatch) {
            const claimedSpeed = parseInt(speedMatch[1]);
            speedDiscrepancy = Math.abs(input.reportedSpeed - claimedSpeed);
          }
        }

        const reportId = await createPoliceReport({
          claimId: input.claimId,
          reportNumber: input.reportNumber,
          policeStation: input.policeStation,
          officerName: input.officerName,
          reportDate: input.reportDate ? new Date(input.reportDate) : undefined,
          reportedSpeed: input.reportedSpeed,
          reportedWeather: input.reportedWeather,
          reportedRoadCondition: input.reportedRoadCondition,
          accidentLocation: input.accidentLocation,
          accidentDescription: input.accidentDescription,
          reportDocumentUrl: input.reportDocumentUrl,
          speedDiscrepancy,
          locationMismatch: input.accidentLocation && claim.incidentLocation && 
            input.accidentLocation.toLowerCase() !== claim.incidentLocation.toLowerCase() ? 1 : 0,
        });

        // Create audit trail
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "police_report_added",
          entityType: "police_report",
          entityId: reportId,
          changeDescription: `Police report ${input.reportNumber} added`,
        });

        // If there are significant discrepancies, create fraud alert
        if (speedDiscrepancy && speedDiscrepancy > 10) {
          await notifyFraudDetected({
            claimId: input.claimId,
            recipientEmail: "admin@kinga.com",
            recipientName: "Admin",
            claimNumber: claim.claimNumber || `CLAIM-${input.claimId}`,
            fraudRiskScore: 85,
            discrepancyLevel: Math.round((speedDiscrepancy / 80) * 100),
            fraudIndicators: `Speed discrepancy: ${speedDiscrepancy} km/h between claim and police report`,
          });
        }

        return { id: reportId, speedDiscrepancy };
      }),

    // Get police report by claim ID
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        return await getPoliceReportByClaimId(input.claimId);
      }),

    // Extract physics data from police report PDF using OCR
    extractPhysicsData: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        reportDocumentUrl: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        if (!['assessor', 'insurer', 'admin'].includes(ctx.user.role)) {
          throw new Error("Not authorized");
        }

        // Import OCR service
        const { extractPhysicsDataFromPoliceReport } = await import("./policeReportOCR");

        // Extract physics data
        const extractedData = await extractPhysicsDataFromPoliceReport(input.reportDocumentUrl);

        // Update police report with extracted data
        await updatePoliceReport(input.claimId, {
          roadSurface: extractedData.roadSurface,
          vehicle1Mass: extractedData.vehicle1Mass,
          vehicle2Mass: extractedData.vehicle2Mass,
          skidMarkLength: extractedData.skidMarkLength?.toString(),
          impactSpeed: extractedData.impactSpeed,
          roadGradient: extractedData.roadGradient?.toString(),
          lightingCondition: extractedData.lightingCondition,
          trafficCondition: extractedData.trafficCondition,
          ocrExtracted: 1,
          ocrConfidence: extractedData.confidence,
          ocrNotes: extractedData.notes,
        });

        // Create audit trail
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "police_report_ocr_extracted",
          entityType: "police_report",
          entityId: input.claimId,
          changeDescription: `Physics data extracted from police report (confidence: ${extractedData.confidence}%)`,
        });

        return extractedData;
      }),
  }),

  /**
   * Vehicle Valuation Router
   * Handles AI-powered vehicle market valuation
   */
  vehicleValuation: router({
    // Trigger vehicle valuation
    trigger: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        mileage: z.number().optional(),
        condition: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        if (!['assessor', 'insurer', 'admin'].includes(ctx.user.role)) {
          throw new Error("Not authorized");
        }

        // Get claim details
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new Error("Claim not found");

        // Get assessor evaluation for repair cost
        const evaluation = await getAssessorEvaluationByClaimId(input.claimId);
        const repairCost = evaluation?.estimatedRepairCost;

        // Import valuation service
        const { valuateVehicle } = await import("./services/vehicleValuation");

        // Perform valuation
        const valuation = await valuateVehicle(
          {
            make: claim.vehicleMake || '',
            model: claim.vehicleModel || '',
            year: claim.vehicleYear || new Date().getFullYear(),
            mileage: input.mileage,
            condition: input.condition,
            country: 'Zimbabwe',
          },
          repairCost ?? undefined
        );

        // Save valuation to database
        const valuationId = await createVehicleMarketValuation({
          claimId: input.claimId,
          vehicleMake: claim.vehicleMake || '',
          vehicleModel: claim.vehicleModel || '',
          vehicleYear: claim.vehicleYear || new Date().getFullYear(),
          vehicleRegistration: claim.vehicleRegistration,
          mileage: input.mileage,
          condition: input.condition,
          estimatedMarketValue: valuation.estimatedMarketValue,
          valuationMethod: valuation.valuationMethod,
          confidenceScore: valuation.confidenceScore,
          dataPointsCount: valuation.dataPointsCount,
          priceRange: JSON.stringify(valuation.priceRange),
          conditionAdjustment: valuation.conditionAdjustment,
          mileageAdjustment: valuation.mileageAdjustment,
          marketTrendAdjustment: valuation.marketTrendAdjustment,
          finalAdjustedValue: valuation.finalAdjustedValue,
          isTotalLoss: valuation.isTotalLoss ? 1 : 0,
          totalLossThreshold: valuation.totalLossThreshold.toString(),
          repairCostToValueRatio: valuation.repairCostToValueRatio?.toString(),
          valuationDate: valuation.valuationDate,
          validUntil: valuation.validUntil,
          valuedBy: ctx.user.id,
          notes: valuation.notes.join('\n'),
        });

        // Create audit trail
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "vehicle_valuation_completed",
          entityType: "valuation",
          entityId: valuationId,
          changeDescription: `Vehicle valued at $${(valuation.finalAdjustedValue / 100).toFixed(2)}${valuation.isTotalLoss ? ' - TOTAL LOSS' : ''}`,
        });

        return valuation;
      }),

    // Get valuation by claim ID
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        const valuation = await getVehicleMarketValuationByClaimId(input.claimId);
        if (!valuation) return null;

        // Parse JSON fields
        return {
          ...valuation,
          priceRange: valuation.priceRange ? JSON.parse(valuation.priceRange) : null,
          notes: valuation.notes ? valuation.notes.split('\n') : [],
        };
      }),
  }),

  // Admin operations for tier management
  admin: router({
    /**
     * Update Assessor Tier (Manual Billing)
     * 
     * Allows admins to manually activate/deactivate Premium/Enterprise tiers
     * for assessors after payment confirmation.
     * 
     * @requires Admin role
     * @param assessorId - ID of the assessor
     * @param tier - New tier (free/premium/enterprise)
     * @param expiresAt - Optional expiration date for paid tiers
     * @returns Success status
     */
    updateAssessorTier: protectedProcedure
      .input(z.object({
        assessorId: z.number(),
        tier: z.enum(["free", "premium", "enterprise"]),
        expiresAt: z.string().optional(), // ISO date string
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Only admins can update assessor tiers");
        }

        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const updateData: any = {
          assessorTier: input.tier,
          tierActivatedAt: new Date(),
        };

        if (input.expiresAt) {
          updateData.tierExpiresAt = new Date(input.expiresAt);
        }

        await db
          .update(users)
          .set(updateData)
          .where(eq(users.id, input.assessorId));

        return { success: true, message: `Assessor tier updated to ${input.tier}` };
      }),

    /**
     * Get All Assessors with Tier Info
     * 
     * Returns list of all assessors with their tier status and performance metrics.
     * 
     * @requires Admin role
     * @returns List of assessors
     */
    getAllAssessors: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Only admins can view all assessors");
        }

        const assessors = await getUsersByRole("assessor");
        return assessors;
      }),
  }),

  // Audit trail operations
  audit: router({
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        return await getAuditTrailByClaimId(input.claimId);
      }),
  }),

  /**
   * Workflow Management (RBAC System)
   * 
   * Handles workflow state transitions, comments, and approvals
   * for the hierarchical role-based access control system.
   */
  workflow: router({
    /**
     * Transition Workflow State
     * 
     * Moves a claim to a new workflow state with permission checking.
     * Validates transitions and tracks approvals.
     * 
     * @requires Appropriate insurer role for the transition
     * @param claimId - ID of the claim
     * @param newState - Target workflow state
     * @returns Success status
     */
    transitionState: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        newState: z.enum([
          "created",
          "assigned",
          "under_assessment",
          "internal_review",
          "technical_approval",
          "financial_decision",
          "payment_authorized",
          "closed",
          "disputed"
        ]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { transitionWorkflowState } = await import("./workflow");
        const { hasPermission } = await import("./rbac");
        
        // Check if user has permission for this transition
        // Different states require different permissions
        const statePermissionMap: Record<string, string> = {
          "technical_approval": "approveTechnical",
          "payment_authorized": "approveFinancial",
          "closed": "closeClaim",
        };
        
        const requiredPermission = statePermissionMap[input.newState];
        if (requiredPermission && !hasPermission(ctx.user, requiredPermission as any)) {
          throw new Error(`You don't have permission to transition to ${input.newState}`);
        }
        
        await transitionWorkflowState(
          input.claimId,
          input.newState,
          ctx.user.id,
          ctx.user.insurerRole as any
        );
        
        return { success: true };
      }),

    /**
     * Add Comment to Claim
     * 
     * Allows authorized users to add comments/annotations to claims.
     * Supports different comment types for workflow collaboration.
     * 
     * @requires Permission to add comments
     * @param claimId - ID of the claim
     * @param commentType - Type of comment
     * @param content - Comment text
     * @returns Success status
     */
    addComment: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        commentType: z.enum(["general", "flag", "clarification_request", "technical_note"]),
        content: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { addClaimComment } = await import("./workflow");
        const { hasPermission, requireClaimAccess } = await import("./rbac");
        
        // Check if user has permission to add comments
        if (!hasPermission(ctx.user, "addComment")) {
          throw new Error("You don't have permission to add comments");
        }
        
        // Check if user can access this claim
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new Error("Claim not found");
        requireClaimAccess(ctx.user, claim);
        
        await addClaimComment({
          claimId: input.claimId,
          userId: ctx.user.id,
          userRole: ctx.user.insurerRole || ctx.user.role,
          commentType: input.commentType,
          content: input.content,
        });
        
        return { success: true };
      }),

    /**
     * Get Comments for Claim
     * 
     * Retrieves all comments for a claim with user information.
     * 
     * @requires Permission to view comments
     * @param claimId - ID of the claim
     * @returns List of comments
     */
    getComments: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const { getClaimComments } = await import("./workflow");
        const { hasPermission, requireClaimAccess } = await import("./rbac");
        
        // Check if user has permission to view comments
        if (!hasPermission(ctx.user, "viewComments")) {
          throw new Error("You don't have permission to view comments");
        }
        
        // Check if user can access this claim
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new Error("Claim not found");
        requireClaimAccess(ctx.user, claim);
        
        return await getClaimComments(input.claimId);
      }),

    /**
     * Approve Technical Basis (Risk Manager)
     * 
     * Approves the technical assessment and fraud analysis.
     * Does NOT approve payment amount.
     * 
     * @requires Risk Manager role
     * @param claimId - ID of the claim
     * @param approvalNotes - Optional notes
     * @returns Success status
     */
    approveTechnical: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        approvalNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { approveTechnicalBasis } = await import("./workflow");
        const { hasPermission } = await import("./rbac");
        
        if (!hasPermission(ctx.user, "approveTechnical")) {
          throw new Error("Only Risk Managers can approve technical basis");
        }
        
        await approveTechnicalBasis(input.claimId, ctx.user.id, input.approvalNotes);
        
        return { success: true };
      }),

    /**
     * Authorize Payment (Claims Manager)
     * 
     * Approves payment amount and authorizes disbursement.
     * 
     * @requires Claims Manager role
     * @param claimId - ID of the claim
     * @param approvedAmount - Approved amount in cents
     * @param approvalNotes - Optional notes
     * @returns Success status
     */
    authorizePayment: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        approvedAmount: z.number(),
        approvalNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { authorizePayment } = await import("./workflow");
        const { hasPermission } = await import("./rbac");
        
        if (!hasPermission(ctx.user, "approveFinancial")) {
          throw new Error("Only Claims Managers can authorize payment");
        }
        
        await authorizePayment(
          input.claimId,
          ctx.user.id,
          input.approvedAmount,
          input.approvalNotes
        );
        
        return { success: true };
      }),

    /**
     * Close Claim (Claims Manager)
     * 
     * Closes a claim after all processes are complete.
     * 
     * @requires Claims Manager role
     * @param claimId - ID of the claim
     * @param closureNotes - Optional notes
     * @returns Success status
     */
    closeClaim: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        closureNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { closeClaim } = await import("./workflow");
        const { hasPermission } = await import("./rbac");
        
        if (!hasPermission(ctx.user, "closeClaim")) {
          throw new Error("Only Claims Managers can close claims");
        }
        
        await closeClaim(input.claimId, ctx.user.id, input.closureNotes);
        
        return { success: true };
      }),

    /**
     * Get Claims by Workflow State
     * 
     * Retrieves claims in a specific workflow state.
     * 
     * @requires Appropriate permissions
     * @param state - Workflow state to filter by
     * @returns List of claims
     */
    getClaimsByState: protectedProcedure
      .input(z.object({
        state: z.enum([
          "created",
          "assigned",
          "under_assessment",
          "internal_review",
          "technical_approval",
          "financial_decision",
          "payment_authorized",
          "closed",
          "disputed"
        ]),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { getClaimsByWorkflowState } = await import("./workflow");
        const { hasPermission } = await import("./rbac");
        
        // Only users with viewAllClaims permission can see all claims by state
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("You don't have permission to view all claims");
        }
        
        return await getClaimsByWorkflowState(input.state);
      }),

    /**
     * Get High-Value Claims
     * 
     * Returns claims requiring GM consultation (>$10,000).
     * 
     * @requires Executive or Claims Manager role
     * @returns List of high-value claims
     */
    getHighValueClaims: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { getHighValueClaims } = await import("./workflow");
        const { hasPermission } = await import("./rbac");
        
        // Only executives and claims managers can view high-value claims
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("You don't have permission to view high-value claims");
        }
        
        return await getHighValueClaims();
      }),

    /**
     * Check if Claim Requires GM Consultation
     * 
     * Checks if a claim exceeds the high-value threshold.
     * 
     * @requires Appropriate permissions
     * @param claimId - ID of the claim
     * @returns Boolean indicating if GM consultation required
     */
    checkGMConsultation: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { checkGMConsultationRequired } = await import("./workflow");
        const { requireClaimAccess } = await import("./rbac");
        
        // Check if user can access this claim
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new Error("Claim not found");
        requireClaimAccess(ctx.user, claim);
        
        return await checkGMConsultationRequired(input.claimId);
      }),
  }),

  /**
   * Executive Analytics
   * 
   * Comprehensive analytics and decision-making tools for executives.
   * Includes KPIs, performance metrics, cost savings, and critical alerts.
   */
  executive: router({
    /**
     * Global Search
     * 
     * Search across all claims by vehicle registration, claim number,
     * policy number, or insured name.
     * 
     * @requires Executive role
     * @param query - Search query
     * @returns Matching claims
     */
    globalSearch: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can use global search");
        }
        
        const { globalSearch } = await import("./executive-analytics");
        return await globalSearch(input.query);
      }),

    /**
     * Get Executive KPIs
     * 
     * Returns key performance indicators for executive dashboard.
     * 
     * @requires Executive role
     * @returns KPI metrics
     */
    getKPIs: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view KPIs");
        }
        
        const { getExecutiveKPIs } = await import("./executive-analytics");
        return await getExecutiveKPIs();
      }),

    /**
     * Get Critical Alerts
     * 
     * Returns critical items requiring executive attention.
     * 
     * @requires Executive role
     * @returns Critical alerts
     */
    getCriticalAlerts: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view critical alerts");
        }
        
        const { getCriticalAlerts } = await import("./executive-analytics");
        return await getCriticalAlerts();
      }),

    /**
     * Get Assessor Performance
     * 
     * Returns performance analytics for all assessors.
     * 
     * @requires Executive role
     * @returns Assessor performance data
     */
    getAssessorPerformance: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view assessor performance");
        }
        
        const { getAssessorPerformance } = await import("./executive-analytics");
        return await getAssessorPerformance();
      }),

    /**
     * Get Panel Beater Analytics
     * 
     * Returns analytics for panel beater performance.
     * 
     * @requires Executive role
     * @returns Panel beater analytics
     */
    getPanelBeaterAnalytics: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view panel beater analytics");
        }
        
        const { getPanelBeaterAnalytics } = await import("./executive-analytics");
        return await getPanelBeaterAnalytics();
      }),

    /**
     * Get Cost Savings Trends
     * 
     * Returns cost savings trends over the last 6 months.
     * 
     * @requires Executive role
     * @returns Cost savings trends
     */
    getCostSavingsTrends: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view cost savings trends");
        }
        
        const { getCostSavingsTrends } = await import("./executive-analytics");
        return await getCostSavingsTrends();
      }),

    /**
     * Get Workflow Bottlenecks
     * 
     * Returns workflow bottleneck analysis.
     * 
     * @requires Executive role
     * @returns Workflow bottleneck data
     */
    getWorkflowBottlenecks: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view workflow bottlenecks");
        }
        
        const { getWorkflowBottlenecks } = await import("./executive-analytics");
        return await getWorkflowBottlenecks();
      }),

    /**
     * Get Financial Overview
     * 
     * Returns financial overview including payouts, reserves, and fraud prevented.
     * 
     * @requires Executive role
     * @returns Financial overview data
     */
    getFinancialOverview: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view financial overview");
        }
        
        const { getFinancialOverview } = await import("./executive-analytics");
        return await getFinancialOverview();
      }),

    /**
     * Get Claims Volume Over Time
     * 
     * Returns daily claim counts for trend analysis.
     * 
     * @requires Executive role
     * @param days - Number of days to look back (default: 30)
     * @returns Time-series claim volume data
     */
    getClaimsVolumeOverTime: protectedProcedure
      .input(z.object({ days: z.number().default(30) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (ctx.user.role !== 'admin' && !hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view claims volume trends");
        }
        
        const { getClaimsVolumeOverTime } = await import("./executive-analytics");
        return await getClaimsVolumeOverTime(input.days);
      }),

    /**
     * Get Fraud Detection Trends
     * 
     * Returns fraud detection metrics over time.
     * 
     * @requires Executive role
     * @param days - Number of days to look back (default: 30)
     * @returns Time-series fraud detection data
     */
    getFraudDetectionTrends: protectedProcedure
      .input(z.object({ days: z.number().default(30) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (ctx.user.role !== 'admin' && !hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view fraud detection trends");
        }
        
        const { getFraudDetectionTrends } = await import("./executive-analytics");
        return await getFraudDetectionTrends(input.days);
      }),

    /**
     * Get Cost Breakdown By Status
     * 
     * Returns cost analysis grouped by claim status.
     * 
     * @requires Executive role
     * @returns Cost breakdown data
     */
    getCostBreakdownByStatus: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (ctx.user.role !== 'admin' && !hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view cost breakdown");
        }
        
        const { getCostBreakdownByStatus } = await import("./executive-analytics");
        return await getCostBreakdownByStatus();
      }),

    /**
     * Get Average Processing Time
     * 
     * Returns average time spent in each claim status.
     * 
     * @requires Executive role
     * @returns Processing time metrics
     */
    getAverageProcessingTime: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (ctx.user.role !== 'admin' && !hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view processing time metrics");
        }
        
        const { getAverageProcessingTime } = await import("./executive-analytics");
        return await getAverageProcessingTime();
      }),

    /**
     * Get Fraud Risk Distribution
     * 
     * Returns distribution of claims by fraud risk level.
     * 
     * @requires Executive role
     * @returns Fraud risk distribution data
     */
    getFraudRiskDistribution: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { hasPermission } = await import("./rbac");
        if (ctx.user.role !== 'admin' && !hasPermission(ctx.user, "viewAllClaims")) {
          throw new Error("Only executives can view fraud risk distribution");
        }
        
        const { getFraudRiskDistribution } = await import("./executive-analytics");
        return await getFraudRiskDistribution();
      }),
  }),

  /**
   * Analytics Router
   * 
   * Provides endpoints for analytics dashboards:
   * - Claims Cost Trend Analytics
   * - Fraud Heatmap Visualization
   * - Fleet Risk Monitoring
   * - Panel Beater Performance
   */
  analytics: router({
    /**
     * Get Claims Cost Trend
     * 
     * Returns time-series data for claim costs with flexible grouping.
     * 
     * @param startDate - Start date for analysis period
     * @param endDate - End date for analysis period
     * @param groupBy - Grouping interval (day, week, month, quarter, year)
     * @returns Cost trend data with claim counts and costs
     */
    claimsCostTrend: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        groupBy: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
      }))
      .query(async ({ input }) => {
        const { getClaimsCostTrend, getAnalyticsSummary } = await import("./analytics-db");
        
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        
        const [trendData, summary] = await Promise.all([
          getClaimsCostTrend(startDate, endDate, input.groupBy),
          getAnalyticsSummary(),
        ]);
        
        return {
          trendData,
          summary,
        };
      }),

    /**
     * Get Cost Breakdown
     * 
     * Returns cost breakdown by various dimensions.
     * 
     * @param startDate - Start date for analysis period
     * @param endDate - End date for analysis period
     * @param breakdownBy - Dimension to break down by
     * @returns Cost breakdown data
     */
    costBreakdown: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        breakdownBy: z.enum(['claim_type', 'vehicle_make', 'damage_severity']).default('vehicle_make'),
      }))
      .query(async ({ input }) => {
        const { getCostBreakdown } = await import("./analytics-db");
        
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        
        return await getCostBreakdown(startDate, endDate, input.breakdownBy);
      }),

    /**
     * Get Fraud Heatmap
     * 
     * Returns geographic distribution of fraud cases.
     * 
     * @returns Fraud heatmap data with locations and fraud metrics
     */
    fraudHeatmap: protectedProcedure
      .query(async () => {
        const { getFraudHeatmap } = await import("./analytics-db");
        return await getFraudHeatmap();
      }),

    /**
     * Get Fraud Patterns
     * 
     * Returns fraud statistics and patterns.
     * 
     * @returns Fraud pattern data
     */
    fraudPatterns: protectedProcedure
      .query(async () => {
        const { getFraudPatterns } = await import("./analytics-db");
        return await getFraudPatterns();
      }),

    /**
     * Get Fleet Risk Overview
     * 
     * Returns aggregated fleet risk statistics.
     * 
     * @returns Fleet risk overview data
     */
    fleetRiskOverview: protectedProcedure
      .query(async () => {
        const { getFleetRiskOverview } = await import("./analytics-db");
        return await getFleetRiskOverview();
      }),

    /**
     * Get Driver Profiles
     * 
     * Returns driver risk profiles with claim history and telematics data.
     * 
     * @returns Driver profile data
     */
    driverProfiles: protectedProcedure
      .query(async () => {
        const { getDriverProfiles } = await import("./analytics-db");
        return await getDriverProfiles();
      }),

    /**
     * Get Panel Beater Performance
     * 
     * Returns performance metrics for panel beaters.
     * 
     * @returns Panel beater performance data
     */
    panelBeaterPerformance: protectedProcedure
      .query(async () => {
        const { getPanelBeaterPerformance } = await import("./analytics-db");
        return await getPanelBeaterPerformance();
      }),
  }),

  /**
   * Panel Beater Analytics Router
   * 
   * Comprehensive performance analytics for panel beaters:
   * - Quote acceptance rates
   * - Cost competitiveness
   * - Turnaround time metrics
   * - Quality and reliability scores
   */
  panelBeaterAnalytics: router({
    /**
     * Get All Panel Beater Performance Metrics
     * 
     * Returns comprehensive performance data for all panel beaters.
     * 
     * @returns Array of panel beater performance metrics
     */
    getAllPerformance: protectedProcedure
      .query(async ({ ctx }) => {
        const { getAllPanelBeaterPerformance } = await import('./panel-beater-analytics');
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        return await getAllPanelBeaterPerformance(tenantId);
      }),

    /**
     * Get Single Panel Beater Performance
     * 
     * Returns detailed performance metrics for a specific panel beater.
     * 
     * @param panelBeaterId - ID of the panel beater
     * @returns Panel beater performance metrics
     */
    getPerformance: protectedProcedure
      .input(z.object({
        panelBeaterId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const { getPanelBeaterPerformance } = await import('./panel-beater-analytics');
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        return await getPanelBeaterPerformance(input.panelBeaterId, tenantId);
      }),

    /**
     * Get Top Performing Panel Beaters
     * 
     * Returns the top N panel beaters based on composite performance score.
     * 
     * @param limit - Number of top performers to return (default: 5)
     * @returns Array of top panel beater performance metrics
     */
    getTopPerformers: protectedProcedure
      .input(z.object({
        limit: z.number().default(5),
      }))
      .query(async ({ input, ctx }) => {
        const { getTopPanelBeaters } = await import('./panel-beater-analytics');
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        return await getTopPanelBeaters(input.limit, tenantId);
      }),

    /**
     * Get Panel Beater Performance Trends
     * 
     * Returns historical performance trends for a panel beater.
     * 
     * @param panelBeaterId - ID of the panel beater
     * @param months - Number of months to include (default: 6)
     * @returns Array of monthly performance data
     */
    getTrends: protectedProcedure
      .input(z.object({
        panelBeaterId: z.number(),
        months: z.number().default(6),
      }))
      .query(async ({ input, ctx }) => {
        const { getPanelBeaterTrends } = await import('./panel-beater-analytics');
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        return await getPanelBeaterTrends(input.panelBeaterId, input.months, tenantId);
      }),

    /**
     * Compare Panel Beaters
     * 
     * Returns side-by-side performance comparison for multiple panel beaters.
     * 
     * @param panelBeaterIds - Array of panel beater IDs to compare
     * @returns Array of panel beater performance metrics
     */
    compare: protectedProcedure
      .input(z.object({
        panelBeaterIds: z.array(z.number()),
      }))
      .query(async ({ input, ctx }) => {
        const { comparePanelBeaters } = await import('./panel-beater-analytics');
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        return await comparePanelBeaters(input.panelBeaterIds, tenantId);
      }),
  }),

  /**
   * Reports Router
   * 
   * Handles intelligent report generation for claims
   */
  reports: router({
    /**
     * Validate Report Data
     * 
     * Validates claim intelligence completeness before report generation.
     * 
     * @param claimId - ID of the claim to validate
     * @param role - Report role (insurer, assessor, regulatory)
     * @returns Validation report with completeness score and errors/warnings
     */
    validate: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        role: z.enum(['insurer', 'assessor', 'regulatory']),
      }))
      .query(async ({ input, ctx }) => {
        // Check permissions
        const { hasPermission } = await import('./rbac');
        if (ctx.user.role !== 'admin' && !hasPermission(ctx.user, 'viewAllClaims')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
        }

        const { aggregateClaimIntelligence } = await import('./report-intelligence-aggregator');
        const { getValidationReport } = await import('./report-validation-service');

        const intelligence = await aggregateClaimIntelligence(input.claimId);
        const validationReport = getValidationReport(intelligence, input.role);

        return validationReport;
      }),

    /**
     * Generate Report PDF
     * 
     * Generates a professional PDF report for a claim.
     * 
     * @param claimId - ID of the claim
     * @param role - Report role (insurer, assessor, regulatory)
     * @param includeVisualizations - Whether to include charts and gauges
     * @param includeSupportingEvidence - Whether to include damage photos
     * @returns PDF buffer as base64 string
     */
    generate: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        role: z.enum(['insurer', 'assessor', 'regulatory']),
        includeVisualizations: z.boolean().default(true),
        includeSupportingEvidence: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        // Check permissions
        const { hasPermission } = await import('./rbac');
        if (ctx.user.role !== 'admin' && !hasPermission(ctx.user, 'viewAllClaims')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
        }

        const { aggregateClaimIntelligence } = await import('./report-intelligence-aggregator');
        const { generateReportNarrative } = await import('./report-narrative-generator');
        const { generateReportVisualizations } = await import('./report-visualization-generator');
        const { generateReportPDF } = await import('./report-pdf-generator');
        const { validateReportData } = await import('./report-validation-service');

        // Aggregate intelligence
        const intelligence = await aggregateClaimIntelligence(input.claimId);

        // Validate data
        const validation = validateReportData(intelligence, input.role);
        if (!validation.isValid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Report validation failed: ${validation.errors.join(', ')}`,
          });
        }

        // Generate narrative
        const narrative = await generateReportNarrative(intelligence, input.role);

        // Generate visualizations
        const visualizations = generateReportVisualizations(intelligence);

        // Generate PDF
        const pdfBuffer = await generateReportPDF(
          intelligence,
          narrative,
          visualizations,
          {
            role: input.role,
            includeVisualizations: input.includeVisualizations,
            includeSupportingEvidence: input.includeSupportingEvidence,
          }
        );

        // Return as base64
        return {
          pdf: pdfBuffer.toString('base64'),
          filename: `${intelligence.claim.claimNumber}-${input.role}-report.pdf`,
        };
      }),

    /**
     * Create Report Snapshot
     * 
     * Creates an immutable snapshot of claim intelligence for versioning.
     * 
     * @param claimId - ID of the claim
     * @param reportType - Type of report (insurer, assessor, regulatory)
     * @returns Snapshot ID and version number
     */
    createSnapshot: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        reportType: z.enum(['insurer', 'assessor', 'regulatory']),
      }))
      .mutation(async ({ input, ctx }) => {
        const { canGenerateReport } = await import('./report-governance-service');
        const { createReportSnapshot } = await import('./report-snapshot-service');
        const { aggregateClaimIntelligence } = await import('./report-intelligence-aggregator');

        // Check permissions
        const permissionCheck = await canGenerateReport(ctx.user, input.claimId, input.reportType);
        if (!permissionCheck.allowed) {
          throw new TRPCError({ code: 'FORBIDDEN', message: permissionCheck.reason });
        }

        // Aggregate intelligence
        const intelligence = await aggregateClaimIntelligence(input.claimId);

        // Create snapshot
        // Note: claimId from input is string, but DB expects number
        // generatedBy from ctx.user.id is string, but DB expects number
        const snapshot = await createReportSnapshot({
          claimId: input.claimId as any, // TODO: Fix type mismatch between string claim IDs and number DB schema
          intelligence,
          reportType: input.reportType,
          generatedBy: ctx.user.id as any, // TODO: Fix type mismatch between string user IDs and number DB schema
          tenantId: ctx.user.tenantId || 'default',
        });

        return snapshot;
      }),

    /**
     * Generate PDF from Snapshot
     * 
     * Generates a PDF report from an existing snapshot.
     * 
     * @param snapshotId - ID of the snapshot
     * @param includeVisualizations - Whether to include charts
     * @param includeSupportingEvidence - Whether to include photos
     * @returns PDF report ID and download URL
     */
    generatePdfFromSnapshot: protectedProcedure
      .input(z.object({
        snapshotId: z.string(),
        includeVisualizations: z.boolean().default(true),
        includeSupportingEvidence: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const { canAccessReport, auditReportAccess } = await import('./report-governance-service');
        const { getSnapshotById } = await import('./report-snapshot-service');
        const { storePdfReport } = await import('./pdf-storage-service');
        const { generateReportNarrative } = await import('./report-narrative-generator');
        const { generateReportVisualizations } = await import('./report-visualization-generator');
        const { generateReportPDF } = await import('./report-pdf-generator');

        // Check permissions
        const accessCheck = await canAccessReport(ctx.user, input.snapshotId);
        if (!accessCheck.allowed) {
          throw new TRPCError({ code: 'FORBIDDEN', message: accessCheck.reason });
        }

        // Get snapshot
        const snapshot = await getSnapshotById(input.snapshotId);
        if (!snapshot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        }

        // Cast intelligence data
        const intelligence = snapshot.intelligenceData as any;
        
        // Generate narrative and visualizations from snapshot
        const narrative = await generateReportNarrative(intelligence, snapshot.reportType);
        const visualizations = generateReportVisualizations(intelligence);

        // Generate PDF
        const pdfBuffer = await generateReportPDF(
          intelligence,
          narrative,
          visualizations,
          {
            role: snapshot.reportType,
            includeVisualizations: input.includeVisualizations,
            includeSupportingEvidence: input.includeSupportingEvidence,
          }
        );

        // Store PDF
        const pdfReport = await storePdfReport({
          snapshotId: input.snapshotId,
          pdfBuffer,
          tenantId: ctx.user.tenantId || 'default',
        });

        // Audit access
        await auditReportAccess(
          pdfReport.id,
          'pdf',
          ctx.user,
          'create'
        );

        return pdfReport;
      }),

    /**
     * Get Interactive Report
     * 
     * Retrieves interactive report data for a snapshot.
     * 
     * @param snapshotId - ID of the snapshot
     * @param accessToken - Optional access token for shared reports
     * @returns Interactive report data with drill-down capabilities
     */
    getInteractiveReport: protectedProcedure
      .input(z.object({
        snapshotId: z.string(),
        accessToken: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const { canAccessReport, auditReportAccess, validateTenantIsolation } = await import('./report-governance-service');
        const { getSnapshotById } = await import('./report-snapshot-service');
        const { validateAccessToken } = await import('./report-linking-service');

        // If access token provided, validate it
        if (input.accessToken) {
          const tokenValidation = await validateAccessToken(
            input.accessToken,
            ctx.user.tenantId || 'default'
          );
          if (!tokenValidation.isValid) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid access token' });
          }
        } else {
          // Check permissions
          const accessCheck = await canAccessReport(ctx.user, input.snapshotId);
          if (!accessCheck.allowed) {
            throw new TRPCError({ code: 'FORBIDDEN', message: accessCheck.reason });
          }

          // Validate tenant isolation
          const tenantCheck = await validateTenantIsolation(ctx.user, input.snapshotId);
          if (!tenantCheck.valid) {
            throw new TRPCError({ code: 'FORBIDDEN', message: tenantCheck.reason });
          }
        }

        // Get snapshot
        const snapshot = await getSnapshotById(input.snapshotId);
        if (!snapshot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        }

        // Audit access
        await auditReportAccess(
          input.snapshotId,
          'interactive',
          ctx.user,
          'view'
        );

        return snapshot;
      }),

    /**
     * Send Report Email
     * 
     * Sends a generated report via email to specified recipients.
     * 
     * @param snapshotId - ID of the report snapshot
     * @param pdfReportId - ID of the PDF report
     * @param recipients - Array of recipient email addresses
     * @returns Email delivery status
     */
    sendEmail: protectedProcedure
      .input(z.object({
        snapshotId: z.string(),
        pdfReportId: z.string(),
        recipients: z.array(z.object({
          email: z.string().email(),
          name: z.string(),
        })).optional(),
        sendToStakeholders: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const { canAccessReport } = await import('./report-governance-service');
        const { getSnapshotById } = await import('./report-snapshot-service');
        const { getPdfReportById } = await import('./pdf-storage-service');
        const { sendReportEmail, sendReportToStakeholders, getReportStakeholders } = await import('./report-email-service');

        // Check permissions
        const accessCheck = await canAccessReport(ctx.user, input.snapshotId);
        if (!accessCheck.allowed) {
          throw new TRPCError({ code: 'FORBIDDEN', message: accessCheck.reason });
        }

        // Get snapshot and PDF report
        const snapshot = await getSnapshotById(input.snapshotId);
        if (!snapshot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        }

        const pdfReport = await getPdfReportById(input.pdfReportId);
        if (!pdfReport) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'PDF report not found' });
        }

        const intelligence = snapshot.intelligenceData as any;
        const claimNumber = intelligence.claim?.claimNumber || 'Unknown';

        let totalSent = 0;
        let totalFailed = 0;

        // Send to specified recipients
        if (input.recipients && input.recipients.length > 0) {
          for (const recipient of input.recipients) {
            const success = await sendReportEmail({
              recipientEmail: recipient.email,
              recipientName: recipient.name,
              claimNumber,
              reportType: snapshot.reportType,
              pdfUrl: pdfReport.s3Url,
              generatedBy: ctx.user.name || 'System',
              tenantId: ctx.user.tenantId || 'default',
            });

            if (success) {
              totalSent++;
            } else {
              totalFailed++;
            }
          }
        }

        // Send to stakeholders if requested
        if (input.sendToStakeholders) {
          const stakeholders = await getReportStakeholders(
            snapshot.claimId,
            snapshot.reportType,
            ctx.user.tenantId || 'default'
          );

          const result = await sendReportToStakeholders(
            {
              claimNumber,
              reportType: snapshot.reportType,
              pdfUrl: pdfReport.s3Url,
              generatedBy: ctx.user.name || 'System',
              tenantId: ctx.user.tenantId || 'default',
            },
            stakeholders
          );

          totalSent += result.sent;
          totalFailed += result.failed;
        }

        return {
          sent: totalSent,
          failed: totalFailed,
          message: `Successfully sent ${totalSent} emails${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
        };
      }),

    /**
     * Get Report Access History
     * 
     * Retrieves access audit trail for a report.
     * 
     * @param snapshotId - ID of the snapshot
     * @returns Access history with timestamps and user details
     */
    getAccessHistory: protectedProcedure
      .input(z.object({
        snapshotId: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        const { getReportAccessHistory } = await import('./report-governance-service');

        const history = await getReportAccessHistory(
          input.snapshotId,
          ctx.user.tenantId || 'default',
          ctx.user
        );

        return history;
      }),
  }),

  /**
   * Fleet Management Router
   * Handles vehicle fleet registration, maintenance tracking, and service marketplace
   */
  fleet: router({
    // Create a new fleet
    createFleet: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        businessType: z.enum(["logistics", "mining", "agriculture", "public_transport", "corporate", "rental"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createFleet } = await import('./fleet/fleet-db');
        
        const fleet = await createFleet({
          fleetName: input.name,
          description: input.description || null,
          fleetType: input.businessType,
          ownerId: ctx.user.id,
          tenantId: ctx.user.tenantId || 'default',
        });
        
        return fleet;
      }),

    // Get fleets owned by current user
    getMyFleets: protectedProcedure
      .query(async ({ ctx }) => {
        const { getFleetsByOwner } = await import('./fleet/fleet-db');
        return getFleetsByOwner(ctx.user.id);
      }),

    // Get fleet by ID
    getFleetById: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .query(async ({ input }) => {
        const { getFleetById } = await import('./fleet/fleet-db');
        return getFleetById(input.id);
      }),

    // Register a single vehicle
    registerVehicle: protectedProcedure
      .input(z.object({
        fleetId: z.number().optional(),
        registrationNumber: z.string(),
        vin: z.string().optional(),
        make: z.string(),
        model: z.string(),
        year: z.number(),
        engineCapacity: z.number().optional(),
        vehicleMass: z.number().optional(),
        color: z.string().optional(),
        fuelType: z.enum(["petrol", "diesel", "electric", "hybrid"]).optional(),
        transmissionType: z.enum(["manual", "automatic"]).optional(),
        usageType: z.enum(["private", "commercial", "logistics", "mining", "agriculture", "public_transport"]).optional(),
        primaryUse: z.string().optional(),
        averageMonthlyMileage: z.number().optional(),
        currentInsurer: z.string().optional(),
        policyNumber: z.string().optional(),
        policyStartDate: z.string().optional(),
        policyEndDate: z.string().optional(),
        coverageType: z.enum(["comprehensive", "third_party", "third_party_fire_theft"]).optional(),
        purchasePrice: z.number().optional(),
        purchaseDate: z.string().optional(),
        currentValuation: z.number().optional(),
        replacementValue: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createFleetVehicle } = await import('./fleet/fleet-db');
        
        const vehicle = await createFleetVehicle({
          ...input,
          ownerId: ctx.user.id,
          tenantId: ctx.user.tenantId || 'default',
          policyStartDate: input.policyStartDate ? new Date(input.policyStartDate) : null,
          policyEndDate: input.policyEndDate ? new Date(input.policyEndDate) : null,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
          purchasePrice: input.purchasePrice ? Math.round(input.purchasePrice * 100) : null,
          currentValuation: input.currentValuation ? Math.round(input.currentValuation * 100) : null,
          replacementValue: input.replacementValue ? Math.round(input.replacementValue * 100) : null,
          status: "active",
          riskScore: 50,
          maintenanceComplianceScore: 70,
        });
        
        return vehicle;
      }),

    // Get vehicles for a fleet
    getFleetVehicles: protectedProcedure
      .input(z.object({
        fleetId: z.number(),
      }))
      .query(async ({ input }) => {
        const { getFleetVehiclesByFleetId } = await import('./fleet/fleet-db');
        return getFleetVehiclesByFleetId(input.fleetId);
      }),

    // Get all vehicles owned by current user
    getMyVehicles: protectedProcedure
      .query(async ({ ctx }) => {
        const { getFleetVehiclesByOwner } = await import('./fleet/fleet-db');
        return getFleetVehiclesByOwner(ctx.user.id);
      }),

    // Download import template
    downloadImportTemplate: protectedProcedure
      .mutation(async () => {
        const { generateImportTemplate } = await import('./fleet/bulk-import-export');
        const buffer = generateImportTemplate();
        return {
          data: buffer.toString('base64'),
          filename: 'vehicle-import-template.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      }),

    // Bulk import vehicles from Excel/CSV
    bulkImportVehicles: protectedProcedure
      .input(z.object({
        fleetId: z.number(),
        fileData: z.string(), // base64 encoded file
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { parseVehicleFile, importVehicles } = await import('./fleet/bulk-import-export');
        
        // Decode base64 file data
        const fileBuffer = Buffer.from(input.fileData, 'base64');
        
        // Parse file
        const vehicles = await parseVehicleFile(fileBuffer, input.mimeType);
        
        // Import vehicles
        const result = await importVehicles(
          vehicles,
          input.fleetId,
          ctx.user.id,
          ctx.user.tenantId || 'default'
        );
        
        return result;
      }),

    // Export fleet vehicles to Excel
    exportFleetToExcel: protectedProcedure
      .input(z.object({
        fleetId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { exportFleetVehiclesToExcel } = await import('./fleet/bulk-import-export');
        
        const buffer = await exportFleetVehiclesToExcel(input.fleetId);
        
        return {
          data: buffer.toString('base64'),
          filename: `fleet-${input.fleetId}-vehicles.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      }),

    // Export fleet vehicles to CSV
    exportFleetToCSV: protectedProcedure
      .input(z.object({
        fleetId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { exportFleetVehiclesToCSV } = await import('./fleet/bulk-import-export');
        
        const buffer = await exportFleetVehiclesToCSV(input.fleetId);
        
        return {
          data: buffer.toString('base64'),
          filename: `fleet-${input.fleetId}-vehicles.csv`,
          mimeType: 'text/csv',
        };
      }),

    // Get vehicle by ID
    getVehicleById: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .query(async ({ input }) => {
        const { getFleetVehicleById } = await import('./fleet/fleet-db');
        return getFleetVehicleById(input.id);
      }),

    // Update vehicle
    updateVehicle: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          registrationNumber: z.string().optional(),
          make: z.string().optional(),
          model: z.string().optional(),
          year: z.number().optional(),
          color: z.string().optional(),
          status: z.enum(["active", "inactive", "sold", "written_off", "under_repair"]).optional(),
          currentValuation: z.number().optional(),
          replacementValue: z.number().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const { updateFleetVehicle } = await import('./fleet/fleet-db');
        
        // Convert prices to cents if provided
        const updateData = {
          ...input.data,
          currentValuation: input.data.currentValuation ? Math.round(input.data.currentValuation * 100) : undefined,
          replacementValue: input.data.replacementValue ? Math.round(input.data.replacementValue * 100) : undefined,
        };
        
        return updateFleetVehicle(input.id, updateData);
      }),

    // Delete vehicle
    deleteVehicle: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { deleteFleetVehicle } = await import('./fleet/fleet-db');
        await deleteFleetVehicle(input.id);
        return { success: true };
      }),

    // Maintenance Intelligence Procedures

    // Get maintenance alerts for a vehicle or fleet
    getMaintenanceAlerts: protectedProcedure
      .input(z.object({
        vehicleId: z.number().optional(),
        fleetId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const { getMaintenanceAlerts } = await import('./fleet/maintenance-intelligence');
        return getMaintenanceAlerts(input.vehicleId, input.fleetId);
      }),

    // Get compliance score for a vehicle
    getComplianceScore: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
      }))
      .query(async ({ input }) => {
        const { calculateComplianceScore } = await import('./fleet/maintenance-intelligence');
        return calculateComplianceScore(input.vehicleId);
      }),

    // Create maintenance schedule
    createMaintenanceSchedule: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
        serviceType: z.string(),
        intervalMileage: z.number().optional(),
        intervalDays: z.number().optional(),
        lastServiceDate: z.string().optional(),
        lastServiceMileage: z.number().optional(),
        nextDueDate: z.string().optional(),
        nextDueMileage: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createMaintenanceSchedule } = await import('./fleet/maintenance-intelligence');
        
        return createMaintenanceSchedule({
          vehicleId: input.vehicleId,
          serviceType: input.serviceType,
          intervalMileage: input.intervalMileage,
          intervalDays: input.intervalDays,
          lastServiceDate: input.lastServiceDate ? new Date(input.lastServiceDate) : undefined,
          lastServiceMileage: input.lastServiceMileage,
          nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : undefined,
          nextDueMileage: input.nextDueMileage,
          tenantId: ctx.user.tenantId || 'default',
        });
      }),

    // Record maintenance service
    recordMaintenanceService: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
        serviceType: z.string(),
        serviceDate: z.string(),
        mileageAtService: z.number().optional(),
        serviceProvider: z.string(),
        cost: z.number(),
        description: z.string().optional(),
        nextServiceDue: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { recordMaintenanceService } = await import('./fleet/maintenance-intelligence');
        
        return recordMaintenanceService({
          vehicleId: input.vehicleId,
          serviceType: input.serviceType,
          serviceDate: new Date(input.serviceDate),
          mileageAtService: input.mileageAtService || null,
          serviceProvider: input.serviceProvider,
          cost: Math.round(input.cost * 100), // Convert to cents
          description: input.description || null,
          nextServiceDue: input.nextServiceDue ? new Date(input.nextServiceDue) : null,
          tenantId: ctx.user.tenantId || 'default',
        });
      }),

    // Get maintenance history
    getMaintenanceHistory: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
      }))
      .query(async ({ input }) => {
        const { getMaintenanceHistory } = await import('./fleet/maintenance-intelligence');
        return getMaintenanceHistory(input.vehicleId);
      }),

    // Get vehicle maintenance schedules
    getVehicleMaintenanceSchedules: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
      }))
      .query(async ({ input }) => {
        const { getVehicleMaintenanceSchedules } = await import('./fleet/maintenance-intelligence');
        return getVehicleMaintenanceSchedules(input.vehicleId);
      }),

    // Update vehicle mileage
    updateVehicleMileage: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
        newMileage: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { updateVehicleMileage } = await import('./fleet/maintenance-intelligence');
        return updateVehicleMileage(input.vehicleId, input.newMileage);
      }),

    // Service Quote Marketplace Procedures

    // Create service request
    createServiceRequest: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
        serviceType: z.string(),
        priority: z.enum(["low", "medium", "high", "urgent"]),
        description: z.string(),
        preferredDate: z.string().optional(),
        budget: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createServiceRequest } = await import('./fleet/service-marketplace');
        
        return createServiceRequest({
          vehicleId: input.vehicleId,
          serviceType: input.serviceType,
          priority: input.priority,
          description: input.description,
          preferredDate: input.preferredDate ? new Date(input.preferredDate) : undefined,
          budget: input.budget ? Math.round(input.budget * 100) : undefined,
          tenantId: ctx.user.tenantId || 'default',
        });
      }),

    // Get service requests
    getServiceRequests: protectedProcedure
      .input(z.object({
        vehicleId: z.number().optional(),
        fleetId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const { getServiceRequests } = await import('./fleet/service-marketplace');
        return getServiceRequests(input.vehicleId, input.fleetId);
      }),

    // Submit service quote
    submitServiceQuote: protectedProcedure
      .input(z.object({
        serviceRequestId: z.number(),
        providerId: z.number(),
        quotedPrice: z.number(),
        estimatedDuration: z.number(),
        validUntil: z.string(),
        description: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { submitServiceQuote } = await import('./fleet/service-marketplace');
        
        return submitServiceQuote({
          serviceRequestId: input.serviceRequestId,
          providerId: input.providerId,
          quotedPrice: Math.round(input.quotedPrice * 100),
          estimatedDuration: input.estimatedDuration,
          validUntil: new Date(input.validUntil),
          description: input.description,
          tenantId: ctx.user.tenantId || 'default',
        });
      }),

    // Get service quotes
    getServiceQuotes: protectedProcedure
      .input(z.object({
        serviceRequestId: z.number(),
      }))
      .query(async ({ input }) => {
        const { getServiceQuotes } = await import('./fleet/service-marketplace');
        return getServiceQuotes(input.serviceRequestId);
      }),

    // Accept service quote
    acceptServiceQuote: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { acceptServiceQuote } = await import('./fleet/service-marketplace');
        return acceptServiceQuote(input.quoteId);
      }),

    // Register service provider
    registerServiceProvider: protectedProcedure
      .input(z.object({
        name: z.string(),
        contactEmail: z.string(),
        contactPhone: z.string(),
        address: z.string(),
        serviceTypes: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { registerServiceProvider } = await import('./fleet/service-marketplace');
        
        return registerServiceProvider({
          name: input.name,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          address: input.address,
          serviceTypes: input.serviceTypes,
          tenantId: ctx.user.tenantId || 'default',
        });
      }),

    // Get service providers
    getServiceProviders: protectedProcedure
      .query(async () => {
        const { getServiceProviders } = await import('./fleet/service-marketplace');
        return getServiceProviders();
      }),

    // Complete service request
    completeServiceRequest: protectedProcedure
      .input(z.object({
        serviceRequestId: z.number(),
        rating: z.number().min(1).max(5),
      }))
      .mutation(async ({ input }) => {
        const { completeServiceRequest } = await import('./fleet/service-marketplace');
        return completeServiceRequest(input.serviceRequestId, input.rating);
      }),
  }),
});

export type AppRouter = typeof appRouter;
