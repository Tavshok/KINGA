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
  getAiAssessmentByClaimId
} from "./db";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { notifyAssessorAssignment, notifyAiAssessmentComplete, notifyQuoteSubmitted, notifyFraudDetected } from "./notifications";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
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
        selectedPanelBeaterIds: z.array(z.number()).length(3),
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

        // Create audit entry
        await createAuditEntry({
          claimId: 0, // Will be updated with actual claim ID
          userId: ctx.user.id,
          action: "claim_submitted",
          entityType: "claim",
          changeDescription: `Claim ${claimNumber} submitted`,
        });

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

        // Send notification to assessor
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

        // Send notification about AI assessment completion
        if (claim && aiAssessment) {
          await notifyAiAssessmentComplete({
            recipientEmail: ctx.user.email || "",
            recipientName: ctx.user.name || "Insurer",
            claimNumber: claim.claimNumber,
            estimatedCost: (aiAssessment.estimatedCost || 0).toString(),
            fraudRiskLevel: aiAssessment.fraudRiskLevel || "low",
            confidenceScore: (aiAssessment.confidenceScore || 0).toString(),
          });
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
          estimatedDuration: input.estimatedDuration,
          itemizedBreakdown: JSON.stringify(input.itemizedBreakdown),
          notes: input.notes,
          status: "submitted",
        });
        
        // Check if all quotes have been received (3 panel beaters)
        const allQuotes = await getQuotesByClaimId(input.claimId);
        if (allQuotes.length >= 3) {
          // All quotes received, progress to comparison stage
          await updateClaimStatus(input.claimId, "comparison");
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

  // Audit trail operations
  audit: router({
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ input }) => {
        return await getAuditTrailByClaimId(input.claimId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
