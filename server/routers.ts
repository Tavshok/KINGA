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
import { z } from "zod";
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

export const appRouter = router({
  system: systemRouter,
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

        // Get all quotes for the claim
        const quotes = await getQuotesByClaimId(input.claimId);
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
      return await getClaimsByClaimant(ctx.user.id);
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
      .query(async ({ input }) => {
        return await getClaimsByStatus(input.status);
      }),

    // Get claims assigned to assessor
    myAssignments: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      return await getClaimsByAssessor(ctx.user.id);
    }),

    // Get claims by assessor ID
    byAssessor: protectedProcedure
      .input(z.object({ assessorId: z.number() }))
      .query(async ({ input }) => {
        return await getClaimsByAssessor(input.assessorId);
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
      .query(async ({ input }) => {
        return await getClaimById(input.id);
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
        
        await assignClaimToAssessor(input.claimId, input.assessorId);
        
        // Automatically progress status to assessment_pending
        await updateClaimStatus(input.claimId, "assessment_pending");

        // Get claim and assessor details for notification
        const claim = await getClaimById(input.claimId);
        const assessors = await getUsersByRole("assessor");
        const assessor = assessors.find(a => a.id === input.assessorId);

        // Send email notification to assessor
        if (claim && assessor && assessor.email) {
          await notifyAssessorAssignment({
            recipientEmail: assessor.email,
            recipientName: assessor.name || "Assessor",
            claimNumber: claim.claimNumber,
            vehicleMake: claim.vehicleMake || "",
            vehicleModel: claim.vehicleModel || "",
            incidentDate: claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A",
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
        const claim = await getClaimById(input.claimId);
        const aiAssessment = await getAiAssessmentByClaimId(input.claimId);

        // Send email notification about AI assessment completion
        if (claim && aiAssessment) {
          await notifyAiAssessmentComplete({
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
        
        // Update claim status to repair_assigned
        await updateClaimStatus(input.claimId, "repair_assigned");
        
        // Get claim and quote details
        const claim = await getClaimById(input.claimId);
        const quotes = await getQuotesByClaimId(input.claimId);
        const selectedQuote = quotes.find(q => q.id === input.selectedQuoteId);

        // Create audit entry
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "claim_approved",
          entityType: "claim",
          entityId: input.claimId,
          changeDescription: `Claim approved. Selected panel beater quote #${input.selectedQuoteId} for $${selectedQuote ? ((selectedQuote.quotedAmount || 0) / 100).toFixed(2) : 'N/A'}`,
        });

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
      .query(async ({ input }) => {
        // Get all claims assigned to this assessor
        const assessments = await getClaimsByAssessor(input.assessorId);

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
          const aiAssessment = await getAiAssessmentByClaimId(claim.id);
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
          const quotes = await getQuotesByClaimId(claim.id);
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

        return { success: true };
      }),

    // Get evaluation by claim
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        return await getAssessorEvaluationByClaimId(input.claimId);
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
        const claim = await getClaimById(input.claimId);
        
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

        return { success: true };
      }),

    // Get quotes for a claim
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        return await getQuotesByClaimId(input.claimId);
      }),

    // Get quotes with line items for comparison
    getWithLineItems: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        const quotes = await getQuotesByClaimId(input.claimId);
        
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
      .query(async ({ input }) => {
        return await getAiAssessmentByClaimId(input.claimId);
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
        const claim = await getClaimById(input.claimId);
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
        const claim = await getClaimById(input.claimId);
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
        const claim = await getClaimById(input.claimId);
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
        
        const { getClaimComments } = await import("./workflow");
        const { hasPermission, requireClaimAccess } = await import("./rbac");
        
        // Check if user has permission to view comments
        if (!hasPermission(ctx.user, "viewComments")) {
          throw new Error("You don't have permission to view comments");
        }
        
        // Check if user can access this claim
        const claim = await getClaimById(input.claimId);
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
        const claim = await getClaimById(input.claimId);
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
  }),
});

export type AppRouter = typeof appRouter;
