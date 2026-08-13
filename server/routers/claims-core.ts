/**
 * KINGA Claims Router
 * Extracted from server/routers.ts for maintainability — Aug 2026.
 * All claims-related tRPC procedures: FNOL, assessment, status, approval, settlement.
 */
import { FINANCIAL_APPROVAL_THRESHOLD_CENTS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, insurerDomainProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { assertRestrictedAgencyAssistedCapability } from "../agency/agencyAssistedClaimantIdentity";
import { parsePhysicsAnalysis } from "../types/physics-validation";
import {
  claims, insurerTenants, ingestionDocuments, fraudRules,
  aiAssessments as aiAssessmentsTable,
  fleetDrivers, fleetVehicles,
} from "../../drizzle/schema";
import { eq, and, desc, asc, inArray, notInArray, gt, gte, lte, or, count, avg, isNotNull } from "drizzle-orm";
import {
  createClaim,
  getClaimsByClaimant,
  searchClaimsByIdentifier,
  getClaimsByAssessor,
  getClaimsForPanelBeater,
  getClaimById,
  getClaimByNumber,
  updateClaimStatus,
  assignClaimToAssessor,
  updateClaimPolicyVerification,
  triggerAiAssessment,
  getUsersByRole,
  getQuotesByClaimId,
  getQuotesByPanelBeater,
  emitClaimEvent,
  createAuditEntry,
  createNotification,
  checkAssignmentCap,
} from "../db";
import {
  getAiAssessmentByClaimId,
  getTenantRates,
} from "../db";
import {
  getPanelBeaterById,
  getUserById
} from "../db";
import { notifyAiAssessmentComplete } from "../notifications";
import { extractClaimFormData } from "../claim-form-extractor";
import { validateClaimDetailResponse } from "../apiResponseValidator";
import { exportClaimPDF } from "../claim-pdf-export";
import { logger } from "../logger";
import { nanoid } from "nanoid";
import { isAdminRole } from "@shared/role-permissions";
import { persistCanonicalClaimIntake, startCanonicalIntakeAssessment } from "../services/canonicalClaimIntake";
import { submitAndStartCanonicalIntake } from "../services/canonicalIntakeSubmission";

export const claimsRouter = router({
  /**
   * Extract Claim Form Data from Document
   * 
   * Uses AI vision to extract claim details from uploaded documents
   * (claim forms, registration books, licence discs, ID documents).
   * Returns structured data to auto-populate the claim submission form.
   */
  extractFromDocument: protectedProcedure
    .input(z.object({
      fileData: z.string(), // base64 encoded file
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_document_access");

      // Decode base64 to buffer
      const base64Data = input.fileData.replace(/^data:[^;]+;base64,/, "");
      const fileBuffer = Buffer.from(base64Data, "base64");

      // Guard: reject files larger than 15 MB (LLM API limit)
      const MAX_BYTES = 15 * 1024 * 1024;
      if (fileBuffer.length > MAX_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File is too large (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB). Please upload a file smaller than 15 MB.`,
        });
      }

      // Extract data using AI vision
      let extracted: Awaited<ReturnType<typeof extractClaimFormData>>;
      try {
        extracted = await extractClaimFormData(
          fileBuffer,
          input.mimeType,
          input.fileName,
          ctx.user.id
        );
      } catch (err: unknown) {
        // Re-throw TRPCErrors as-is; wrap everything else with a clear message
        if (err && typeof err === "object" && "code" in err) throw err;
        const msg = err instanceof Error ? err.message : "Unknown extraction error";
        console.error("[extractFromDocument] Extraction failed:", msg);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Document extraction failed: ${msg}`,
        });
      }

      // Create audit entry
      await createAuditEntry({
        claimId: 0, // No claim yet
        userId: ctx.user.id,
        action: "claim_form_extracted",
        entityType: "document",
        changeDescription: `Extracted ${extracted.documentType} - ${input.fileName} (confidence: ${extracted.confidence}%)`,
      });

      return extracted;
    }),

  /**
   * Create Claim On Behalf Of Claimant
   * 
   * Allows Claims Processors to create claims on behalf of claimants
   * (e.g., for historical claims received via email/phone).
   * 
   * @requires Claims Processor role
   * @param claimantEmail - Email of the claimant (will create user if doesn't exist)
   * @param claimantName - Name of the claimant
   * @param claimantPhone - Phone number of the claimant
   * @param vehicleMake - Make of the vehicle
   * @param vehicleModel - Model of the vehicle
   * @param vehicleYear - Year of manufacture
   * @param vehicleRegistration - License plate number
   * @param incidentDate - ISO date string of incident
   * @param incidentDescription - Detailed description
   * @param incidentLocation - Location where incident occurred
   * @param damagePhotos - Array of S3 URLs for damage photos
   * @param policyNumber - Insurance policy number
   * @param triggerAI - Whether to immediately trigger KINGA assessment
   * @returns Claim number and ID
   */
  createOnBehalfOf: protectedProcedure
    .input(z.object({
      claimantEmail: z.string().email(),
      claimantName: z.string(),
      claimantPhone: z.string().optional(),
      vehicleMake: z.string(),
      vehicleModel: z.string(),
      vehicleYear: z.number().int().min(1900).max(new Date().getFullYear() + 1, { message: `Vehicle year cannot be in the future` }),
      vehicleRegistration: z.string(),
      incidentDate: z.string(),
      incidentDescription: z.string(),
      incidentLocation: z.string(),
      damagePhotos: z.array(z.string()),
      policyNumber: z.string(),
      triggerAI: z.boolean().default(true),
    }).superRefine((data, ctx) => {
      // Temporal impossibility check: incident cannot predate vehicle manufacture year
      const incidentYear = new Date(data.incidentDate).getFullYear();
      if (!isNaN(incidentYear) && incidentYear < data.vehicleYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["incidentDate"],
          message: `Incident date (${incidentYear}) cannot be before the vehicle manufacture year (${data.vehicleYear}). A ${data.vehicleYear} vehicle cannot have been involved in an incident in ${incidentYear}.`,
        });
      }
      // Incident date cannot be in the future
      const now = new Date();
      const incidentDate = new Date(data.incidentDate);
      if (incidentDate > now) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["incidentDate"],
          message: `Incident date cannot be in the future.`,
        });
      }
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      
      // Check if user has claims processor role
      const { hasPermission } = await import("../rbac");
      if (!hasPermission(ctx.user, "createClaim")) {
        throw new TRPCError({ 
          code: "FORBIDDEN",
          message: "Only Claims Processors can create claims on behalf of claimants"
        });
      }
      
      // Find or create claimant user
      const _claimDb3 = await getDb();
      if (!_claimDb3) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { users: _usersTable3 } = await import("../../drizzle/schema");
      const { eq: _eqEmail3 } = await import("drizzle-orm");
      let [claimant] = await _claimDb3.select().from(_usersTable3).where(_eqEmail3(_usersTable3.email, input.claimantEmail)).limit(1);
      if (!claimant) {
        const { upsertUser: _upsertUser3 } = await import("../db");
        await _upsertUser3({
          openId: `email:${input.claimantEmail}`,
          email: input.claimantEmail,
          name: input.claimantName,
          role: "claimant",
          tenantId: ctx.user.tenantId,
        } as any);
        [claimant] = await _claimDb3.select().from(_usersTable3).where(_eqEmail3(_usersTable3.email, input.claimantEmail)).limit(1);
        if (!claimant) throw new Error("Failed to create claimant user");
      }
      
      const claimNumber = `CLM-${nanoid(10).toUpperCase()}`;

      // Normalise the claimant's description before storing
      const { normaliseIncidentDescription } = await import("../services/intakeDescriptionNormaliser");
      const normResult = await normaliseIncidentDescription(input.incidentDescription);
      
      await createClaim({
        claimantId: claimant.id,
        claimNumber,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        vehicleRegistration: input.vehicleRegistration,
        incidentDate: new Date(input.incidentDate).toISOString(),
        incidentDescription: input.incidentDescription,
        normalisedDescription: normResult.normalisedText !== input.incidentDescription ? normResult.normalisedText : null,
        reportedCauseLabel: normResult.reportedCauseLabel,
        keyFactsJson: normResult.keyFacts.length > 0 ? JSON.stringify(normResult.keyFacts) : null,
        incidentLocation: input.incidentLocation,
        damagePhotos: JSON.stringify(input.damagePhotos),
        policyNumber: input.policyNumber,
        selectedPanelBeaterIds: JSON.stringify([]),
        // Canonical intake state: all claim sources use intake_pending + intake_queue
        // so the pipeline trigger, recovery job, and dashboard all work consistently.
        status: "intake_pending" as any,
        workflowState: "intake_queue",
        claimSource: "processor_form",
      });
      
      const newClaim = await getClaimByNumber(claimNumber);
      if (!newClaim) throw new Error("Failed to retrieve newly created claim");
      
      // Create audit entry
      await createAuditEntry({
        claimId: newClaim.id,
        userId: ctx.user.id,
        action: "claim_created_on_behalf",
        entityType: "claim",
        changeDescription: `Claim ${claimNumber} created by processor on behalf of ${input.claimantName}`,
      });
      
      // Fire-and-forget: trigger KINGA assessment without blocking the HTTP response
      if (input.triggerAI && input.damagePhotos.length > 0) {
        triggerAiAssessment(newClaim.id).catch((err: unknown) => {
          console.error(`[AI] Background assessment failed for claim ${newClaim.id}:`, err);
        });
      }
      
      return { success: true, claimNumber, claimId: newClaim.id };
    }),

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
   * @param panelBeaterChoice1 - First insurer-approved panel beater (marketplace_profile_id UUID)
   * @param panelBeaterChoice2 - Second insurer-approved panel beater (marketplace_profile_id UUID)
   * @param panelBeaterChoice3 - Third insurer-approved panel beater (marketplace_profile_id UUID)
   * @returns Claim number and success status
   */
  submit: protectedProcedure
    .input(z.object({
      vehicleMake: z.string(),
      vehicleModel: z.string(),
      vehicleYear: z.number().int().min(1900).max(new Date().getFullYear() + 1, { message: `Vehicle year cannot be in the future` }),
      vehicleRegistration: z.string(),
      incidentDate: z.string(), // ISO date string
      incidentDescription: z.string(),
      incidentLocation: z.string(),
      idempotencyKey: z.string().uuid(),
      channel: z.enum(["claimant_portal", "web", "mobile_api", "fleet"]).default("claimant_portal"),
      damagePhotos: z.array(z.object({ key: z.string(), url: z.string().url(), fileName: z.string(), fileSize: z.number().int().nonnegative(), mimeType: z.string() })),
      supportingDocuments: z.array(z.object({ key: z.string(), url: z.string().url(), fileName: z.string(), fileSize: z.number().int().nonnegative(), mimeType: z.string(), type: z.enum(["repair_quote", "invoice", "police_report", "medical_report", "insurance_policy", "correspondence", "other"]) })).default([]),
      // NOTE: cross-field temporal validation applied via superRefine below
      policyNumber: z.string(),
      /**
       * Odometer reading in km, supplied by the claimant at intake.
       * Must be a numeric string (e.g. "85000") or omitted.
       * Free-text values such as "unknown" or "N/A" are rejected by the
       * shared validateMileageInput utility before this point, but we
       * also guard here with a Zod refinement for defence-in-depth.
       */
      vehicleMileage: z.string().optional().refine(
        (v) => {
          if (!v || v.trim() === "") return true; // blank is fine
          const stripped = v.trim().replace(/[\s,]/g, "");
          if (!/^\d+$/.test(stripped)) return false;
          const n = parseInt(stripped, 10);
          return n > 0 && n <= 2_000_000;
        },
        { message: "Odometer reading must be a positive integer in km (e.g. 85000) or left blank." }
      ),
      // Structured 3-choice panel beater selection — all must be insurer-approved
      /** ISO 4217 currency code for repair quotes and damage costs. Defaults to USD. */
      currencyCode: z.enum(["USD","ZWG","ZWL","ZAR","ZMW","BWP","NAD","MZN","MWK","TZS","KES","UGX","GBP","EUR"]).optional(),
      repairerPreferences: z.array(z.string().uuid()).default([]),
      panelBeaterChoice1: z.string().uuid().optional(),
      panelBeaterChoice2: z.string().uuid().optional(),
      panelBeaterChoice3: z.string().uuid().optional(),
      // Company / fleet claim fields
      claimantType: z.enum(["individual", "company"]).optional().default("individual"),
      companyName: z.string().optional(),
      companyRegistration: z.string().optional(),
      claimantDepartment: z.string().max(255).optional(),
      fleetAccountId: z.number().int().positive().optional(),
    }).superRefine((data, ctx) => {
      // Temporal impossibility check: incident cannot predate vehicle manufacture year
      const incidentYear = new Date(data.incidentDate).getFullYear();
      if (!isNaN(incidentYear) && incidentYear < data.vehicleYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["incidentDate"],
          message: `Incident date (${incidentYear}) cannot be before the vehicle manufacture year (${data.vehicleYear}). A ${data.vehicleYear} vehicle cannot have been involved in an incident in ${incidentYear}.`,
        });
      }
      // Incident date cannot be in the future
      const now = new Date();
      const incidentDate = new Date(data.incidentDate);
      if (incidentDate > now) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["incidentDate"],
          message: `Incident date cannot be in the future.`,
        });
      }
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const tenantId = ctx.user.tenantId ?? "";
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Unable to determine your insurer tenant." });
      const actor = { id: ctx.user.id, tenantId, role: ctx.user.role };
      const result = await submitAndStartCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment: startCanonicalIntakeAssessment }, actor, {
        idempotencyKey: input.idempotencyKey, channel: input.channel, vehicleMake: input.vehicleMake, vehicleModel: input.vehicleModel, vehicleYear: input.vehicleYear, vehicleRegistration: input.vehicleRegistration,
        incidentDate: input.incidentDate, incidentLocation: input.incidentLocation, incidentDescription: input.incidentDescription, policyNumber: input.policyNumber, vehicleMileage: input.vehicleMileage, currencyCode: input.currencyCode,
        attachments: [...input.damagePhotos.map((photo) => ({ ...photo, category: "damage_photo" as const })), ...input.supportingDocuments.map((document) => ({ key: document.key, url: document.url, fileName: document.fileName, fileSize: document.fileSize, mimeType: document.mimeType, category: document.type }))],
        repairerPreferences: input.repairerPreferences, claimantType: input.claimantType, companyName: input.companyName, companyRegistration: input.companyRegistration, claimantDepartment: input.claimantDepartment, fleetAccountId: input.fleetAccountId,
      });
      return { success: true, claimId: result.claimId, claimNumber: result.claimNumber, idempotent: result.idempotent, repairerWarnings: result.repairerWarnings, assessmentStartStatus: result.assessmentStartStatus };

      // ── Governance validation ─────────────────────────────────────────────
      // 1. No duplicates
      const choices = [input.panelBeaterChoice1, input.panelBeaterChoice2, input.panelBeaterChoice3];
      const uniqueChoices = new Set(choices);
      if (uniqueChoices.size !== 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All three panel beater selections must be different. Please choose 3 distinct repairers.",
        });
      }

      // 2. All three must be in the insurer-approved list
      const insurerTenantId = ctx.user.tenantId ?? "";
      if (!insurerTenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unable to determine your insurer. Please contact support.",
        });
      }

      const { getApprovedPanelBeaterIds } = await import("../routers/marketplace");
      const approvedIds = await getApprovedPanelBeaterIds(insurerTenantId);

      for (const choice of choices) {
        if (!approvedIds.has(choice)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected repairer is not approved by your insurer. Please contact insurer for exception.",
          });
        }
      }
       // ─────────────────────────────────────────────────────────────────────
      const claimNumber = `CLM-${nanoid(10).toUpperCase()}`;

      // Company claims submitted by an assigned Fleet Driver retain durable,
      // verified attribution for Fleet Management cost and frequency analytics.
      // The active assignment must own the stated vehicle registration.
      let fleetDriverId: number | null = null;
      if (input.claimantType === "company" && ctx.user.role === "fleet_driver") {
        const db = await getDb();
        if (db) {
          const [assignment] = await db
            .select({ id: fleetDrivers.id })
            .from(fleetDrivers)
            .innerJoin(fleetVehicles, eq(fleetVehicles.fleetId, fleetDrivers.fleetId))
            .where(and(
              eq(fleetDrivers.userId, ctx.user.id),
              eq(fleetDrivers.employmentStatus, "active"),
              eq(fleetVehicles.registrationNumber, input.vehicleRegistration),
            ))
            .limit(1);
          fleetDriverId = assignment?.id ?? null;
        }
      }

      // Normalise the claimant's description before storing
      const { normaliseIncidentDescription } = await import("../services/intakeDescriptionNormaliser");
      const normResult = await normaliseIncidentDescription(input.incidentDescription);

      await createClaim({
        claimantId: ctx.user.id,
        claimNumber,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        vehicleRegistration: input.vehicleRegistration,
        incidentDate: new Date(input.incidentDate).toISOString(),
        incidentDescription: input.incidentDescription,
        normalisedDescription: normResult.normalisedText !== input.incidentDescription ? normResult.normalisedText : null,
        reportedCauseLabel: normResult.reportedCauseLabel,
        keyFactsJson: normResult.keyFacts.length > 0 ? JSON.stringify(normResult.keyFacts) : null,
        incidentLocation: input.incidentLocation,
        damagePhotos: JSON.stringify(input.damagePhotos),
        policyNumber: input.policyNumber,
        // Store both the legacy JSON array and the new structured FK columns
        selectedPanelBeaterIds: JSON.stringify(choices),
        panelBeaterChoice1: input.panelBeaterChoice1,
        panelBeaterChoice2: input.panelBeaterChoice2,
        panelBeaterChoice3: input.panelBeaterChoice3,
        // Persist validated mileage string (e.g. "85000") for pipeline use
        vehicleMileage: input.vehicleMileage?.trim() || null,
        // ISO 4217 currency for repair quotes and damage costs; defaults to USD
        currencyCode: input.currencyCode ?? "USD",
        // Company / fleet claim fields
        claimantType: input.claimantType ?? "individual",
        claimantCompanyName: input.companyName ?? null,
        claimantCompanyReg: input.companyRegistration ?? null,
        claimantDepartment: input.claimantDepartment ?? null,
        fleetAccountId: input.fleetAccountId ?? null,
        fleetDriverId,
        // Canonical intake state: all claim sources use intake_pending + intake_queue
        // so the pipeline trigger, recovery job, and dashboard all work consistently.
        status: "intake_pending" as any,
        workflowState: "intake_queue",
        claimSource: "claimant_portal",
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
      const { emitClaimEvent } = await import("../dataset-capture");
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

      // Fire-and-forget: trigger KINGA assessment without blocking the HTTP response
      if (input.damagePhotos && input.damagePhotos.length > 0) {
        triggerAiAssessment(newClaim.id).catch((err: unknown) => {
          console.error(`[AI] Background assessment failed for claim ${newClaim.id}:`, err);
        });
      }

      return { success: true, claimNumber };
    }),

  // Get claims by claimant
  myClaims: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
    return await getClaimsByClaimant(ctx.user.id, tenantId);
  }),

  // Search claims by claim number, policy number, or vehicle registration
  // Claimants see only their own claims; processors/insurers see all within tenant
  searchByIdentifier: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
      const isClaimant = ctx.user.role === "claimant" || ctx.user.role === "user";
      return await searchClaimsByIdentifier({
        query: input.query,
        tenantId,
        claimantId: isClaimant ? ctx.user.id : undefined,
      });
    }),

  // Get claims assigned to assessor
  myAssignments: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
    return await getClaimsByAssessor(ctx.user.id, tenantId);
  }),

  // Get claims by assessor ID
  byAssessor: protectedProcedure
    .input(z.object({ assessorId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
      return await getClaimsByAssessor(input.assessorId, tenantId);
    }),

  // Get claims for panel beater (claims where this panel beater was selected)
  myQuoteRequests: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    const db = await getDb();
    if (!db) return [];
    // Look up the panel beater record linked to this user account
    const { panelBeaters: pbTable } = await import('../../drizzle/schema');
    const { eq: _pbEq } = await import('drizzle-orm');
    const [pb] = await db.select().from(pbTable).where(_pbEq(pbTable.userId, ctx.user.id)).limit(1);
    if (!pb) return [];
    const tenantId = ctx.user.tenantId || undefined;
    return await getClaimsForPanelBeater(pb.id, tenantId);
  }),
  // Get quote history for the logged-in panel beater
  myQuoteHistory: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    const db = await getDb();
    if (!db) return [];
    const { panelBeaters: pbTable } = await import('../../drizzle/schema');
    const { eq: _pbEq } = await import('drizzle-orm');
    const [pb] = await db.select().from(pbTable).where(_pbEq(pbTable.userId, ctx.user.id)).limit(1);
    if (!pb) return [];
    const tenantId = ctx.user.tenantId || undefined;
    return await getQuotesByPanelBeater(pb.id, tenantId);
  }),
  // Get the panel beater profile for the logged-in user
  myPanelBeaterProfile: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    const db = await getDb();
    if (!db) return null;
    const { panelBeaters: pbTable } = await import('../../drizzle/schema');
    const { eq: _pbEq } = await import('drizzle-orm');
     const [pb] = await db.select().from(pbTable).where(_pbEq(pbTable.userId, ctx.user.id)).limit(1);
    return pb || null;
  }),

  // Panel beater self-analytics: variance between quoted amount and AI estimated cost
  getMyAnalytics: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { panelBeaters: pbTable2, panelBeaterQuotes: pbqTable, claims: claimsTable } = await import('../../drizzle/schema');
      const { eq: _eq3, and: _and3, gte: _gte3, lte: _lte3, desc: _desc3 } = await import('drizzle-orm');
      const [pb] = await db.select().from(pbTable2).where(_eq3(pbTable2.userId, ctx.user.id)).limit(1);
      if (!pb) return { quotes: [], stats: null, profile: null };
      const conditions: any[] = [_eq3(pbqTable.panelBeaterId, pb.id)];
      if (input?.from) conditions.push(_gte3(pbqTable.createdAt, input.from));
      if (input?.to) conditions.push(_lte3(pbqTable.createdAt, input.to + ' 23:59:59'));
      const quotes = await db
        .select({
          id: pbqTable.id,
          claimId: pbqTable.claimId,
          claimNumber: claimsTable.claimNumber,
          quotedAmount: pbqTable.quotedAmount,
          laborCost: pbqTable.laborCost,
          partsCost: pbqTable.partsCost,
          status: pbqTable.status,
          partsQuality: pbqTable.partsQuality,
          warrantyMonths: pbqTable.warrantyMonths,
          quoteCongruencyScore: pbqTable.quoteCongruencyScore,
          estimatedClaimValue: claimsTable.estimatedClaimValue,
          finalApprovedAmount: claimsTable.finalApprovedAmount,
          incidentType: claimsTable.incidentType,
          vehicleMake: claimsTable.vehicleMake,
          vehicleModel: claimsTable.vehicleModel,
          createdAt: pbqTable.createdAt,
          currencyCode: pbqTable.currencyCode,
        })
        .from(pbqTable)
        .leftJoin(claimsTable, _eq3(pbqTable.claimId, claimsTable.id))
        .where(_and3(...conditions))
        .orderBy(_desc3(pbqTable.createdAt))
        .limit(200);
      const withVariance = quotes.map(q => {
        const quoted = q.quotedAmount || 0;
        const aiEstimate = parseFloat(String(q.estimatedClaimValue ?? 0));
        const approved = parseFloat(String(q.finalApprovedAmount ?? 0));
        const variancePct = aiEstimate > 0 ? Math.round(((quoted - aiEstimate) / aiEstimate) * 100) : null;
        const approvalVariancePct = approved > 0 ? Math.round(((quoted - approved) / approved) * 100) : null;
        return { ...q, variancePct, approvalVariancePct };
      });
      const accepted = withVariance.filter(q => q.status === 'accepted');
      const submitted = withVariance.filter(q => q.status !== 'draft');
      const avgVariance = submitted.length > 0
        ? Math.round(submitted.reduce((s, q) => s + (q.variancePct ?? 0), 0) / submitted.length)
        : null;
      const acceptanceRate = submitted.length > 0 ? Math.round((accepted.length / submitted.length) * 100) : null;
      const avgCongruency = submitted.length > 0
        ? Math.round(submitted.reduce((s, q) => s + Number(q.quoteCongruencyScore ?? 0), 0) / submitted.length)
        : null;
      return {
        quotes: withVariance,
        stats: {
          totalQuotes: submitted.length,
          acceptedQuotes: accepted.length,
          acceptanceRate,
          avgVariancePct: avgVariance,
          avgCongruencyScore: avgCongruency,
          avgQualityScore: pb.avgQualityScore ? Number(pb.avgQualityScore) : null,
          avgCostRatio: pb.avgCostRatio ? Number(pb.avgCostRatio) : null,
          totalRepairs: pb.totalRepairs,
          performanceTier: pb.performanceTier,
          fraudFlagCount: pb.fraudFlagCount,
        },
        profile: {
          id: pb.id,
          businessName: pb.businessName,
          city: pb.city,
          performanceTier: pb.performanceTier,
          avgQualityScore: pb.avgQualityScore ? Number(pb.avgQualityScore) : null,
        },
      };
    }),

  /**
   * Get the panel beater's own performance trend over time, broken down by insurer.
   * Returns:
   *   - insurers: list of { tenantId, displayName } the panel beater has worked with
   *   - byInsurer: per-insurer summary (total quotes, acceptance rate, avg congruency)
   *   - trend: time-bucketed data (weekly/monthly) for the selected insurer (or all)
   * period: 'weekly' (last 12 weeks) | 'monthly' (last 12 months)
   * tenantId: filter to a specific insurer, or null for all
   */
  getMyPerformanceTrend: protectedProcedure
    .input(z.object({
      period: z.enum(['weekly', 'monthly']).default('monthly'),
      tenantId: z.string().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { panelBeaters: pbTable, panelBeaterQuotes: pbqTable, claims: claimsTable, insurerTenants: tenantsTable } = await import('../../drizzle/schema');
      const { eq: _eq, desc: _desc, and: _and } = await import('drizzle-orm');
      // Resolve the panel beater record for this user
      const [myPb] = await db.select({ id: pbTable.id }).from(pbTable).where(_eq(pbTable.userId, ctx.user.id)).limit(1);
      if (!myPb) return { insurers: [], byInsurer: [], trend: [], summary: null };
      // Fetch all submitted quotes joined with claim tenantId and insurer display name
      const periodDays = input.period === 'weekly' ? 7 : 30;
      const lookbackDays = 12 * periodDays;
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const rawQuotes = await db
        .select({
          id: pbqTable.id,
          quotedAmount: pbqTable.quotedAmount,
          status: pbqTable.status,
          quoteCongruencyScore: pbqTable.quoteCongruencyScore,
          createdAt: pbqTable.createdAt,
          claimTenantId: claimsTable.tenantId,
          insurerDisplayName: tenantsTable.displayName,
        })
        .from(pbqTable)
        .leftJoin(claimsTable, _eq(pbqTable.claimId, claimsTable.id))
        .leftJoin(tenantsTable, _eq(claimsTable.tenantId, tenantsTable.id))
        .where(_eq(pbqTable.panelBeaterId, myPb.id))
        .orderBy(_desc(pbqTable.createdAt));
      // Filter to lookback window and non-draft
      const allQuotes = rawQuotes.filter(q => q.createdAt && new Date(q.createdAt) >= since && q.status !== 'draft');
      // Build insurer list
      const insurerMap = new Map<string, string>();
      for (const q of allQuotes) {
        if (q.claimTenantId && q.insurerDisplayName) {
          insurerMap.set(q.claimTenantId, q.insurerDisplayName);
        }
      }
      const insurers = Array.from(insurerMap.entries()).map(([tenantId, displayName]) => ({ tenantId, displayName }));
      // Per-insurer summary
      const byInsurer = insurers.map(({ tenantId, displayName }) => {
        const iQuotes = allQuotes.filter(q => q.claimTenantId === tenantId);
        const accepted = iQuotes.filter(q => q.status === 'accepted').length;
        const total = iQuotes.length;
        const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : null;
        const withCongruency = iQuotes.filter(q => q.quoteCongruencyScore != null);
        const avgCongruency = withCongruency.length > 0
          ? Math.round(withCongruency.reduce((s, q) => s + Number(q.quoteCongruencyScore), 0) / withCongruency.length)
          : null;
        return { tenantId, displayName, totalQuotes: total, acceptedQuotes: accepted, acceptanceRate, avgCongruencyScore: avgCongruency };
      });
      // Filter quotes for trend (by selected insurer or all)
      const filtered = input.tenantId ? allQuotes.filter(q => q.claimTenantId === input.tenantId) : allQuotes;
      // Bucket by period
      const bucketMap: Record<string, { label: string; quotes: typeof filtered }> = {};
      for (const q of filtered) {
        const d = new Date(q.createdAt!);
        let key: string;
        if (input.period === 'weekly') {
          const startOfYear = new Date(d.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
          key = d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
        } else {
          key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        if (!bucketMap[key]) bucketMap[key] = { label: key, quotes: [] };
        bucketMap[key].quotes.push(q);
      }
      const trend = Object.entries(bucketMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, { label, quotes: bq }]) => {
          const accepted = bq.filter(q => q.status === 'accepted').length;
          const total = bq.length;
          const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : null;
          const withCongruency = bq.filter(q => q.quoteCongruencyScore != null);
          const avgCongruency = withCongruency.length > 0
            ? Math.round(withCongruency.reduce((s, q) => s + Number(q.quoteCongruencyScore), 0) / withCongruency.length)
            : null;
          return { label, totalQuotes: total, acceptedQuotes: accepted, acceptanceRate, avgCongruencyScore: avgCongruency };
        });
      // Overall summary for selected filter
      const allAccepted = filtered.filter(q => q.status === 'accepted').length;
      const withCongruency = filtered.filter(q => q.quoteCongruencyScore != null);
      return {
        insurers,
        byInsurer,
        trend,
        summary: {
          totalQuotes: filtered.length,
          acceptedQuotes: allAccepted,
          overallAcceptanceRate: filtered.length > 0 ? Math.round((allAccepted / filtered.length) * 100) : null,
          overallCongruencyScore: withCongruency.length > 0
            ? Math.round(withCongruency.reduce((s, q) => s + Number(q.quoteCongruencyScore), 0) / withCongruency.length)
            : null,
        },
      };
    }),
      // Get claims by status (for dashboards)
  // Uses insurerDomainProcedure: ctx.insurerTenantId is always non-null, preventing cross-tenant leakage
  byStatus: insurerDomainProcedure
    .input(z.object({ status: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // ctx.insurerTenantId guaranteed non-null by insurerDomainProcedure middleware
      const rows = await db
        .select()
        .from(claims)
        .where(and(
          eq(claims.status, input.status as any),
          eq(claims.tenantId, ctx.insurerTenantId)   // ← strict tenant isolation
        ))
        .orderBy(desc(claims.createdAt))
        .limit(200);
      // Enrich with quality grade from ai_assessments for completed claims
      if (rows.length === 0) return rows;
      const completedIds = rows
        .filter((r: any) => r.aiAssessmentCompleted === 1)
        .map((r: any) => r.id);
      if (completedIds.length === 0) return rows;
      const { aiAssessments: aiAssessmentsTable } = await import("../../drizzle/schema");
      const { inArray: inArrayOp } = await import("drizzle-orm");
      const qualityRows = await db
        .select({ claimId: aiAssessmentsTable.claimId, claimQualityJson: aiAssessmentsTable.claimQualityJson, cgiResultJson: aiAssessmentsTable.cgiResultJson })
        .from(aiAssessmentsTable)
        .where(inArrayOp(aiAssessmentsTable.claimId, completedIds));
      const qualityMap = new Map<number, any>();
      const cgiMap = new Map<number, any>();
      for (const qr of qualityRows) {
        if (qr.claimId && qr.claimQualityJson) {
          try {
            const parsed = JSON.parse(qr.claimQualityJson as string);
            qualityMap.set(qr.claimId, { grade: parsed.grade, overallScore: parsed.overallScore, requiresManualReview: parsed.requiresManualReview });
          } catch { /* non-fatal */ }
        }
        if (qr.claimId && qr.cgiResultJson) {
          try {
            const cgi = JSON.parse(qr.cgiResultJson as string);
            cgiMap.set(qr.claimId, { contactGeometryFlag: cgi.contactGeometryFlag ?? false, forensicVerdict: cgi.forensicVerdict ?? null, hiddenDamageProbabilityOverride: cgi.hiddenDamageProbabilityOverride ?? null });
          } catch { /* non-fatal */ }
        }
      }
      return rows.map((r: any) => ({
        ...r,
        _qualityGrade: qualityMap.get(r.id) ?? null,
        _cgi: cgiMap.get(r.id) ?? null,
      }));
    }),

  // Get all claims for the insurer tenant (no status filter) — used by Risk Manager Dashboard
  allForTenant: insurerDomainProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(claims)
        .where(eq(claims.tenantId, ctx.insurerTenantId))
        .orderBy(desc(claims.createdAt))
        .limit(300);
      if (rows.length === 0) return rows;
      const completedIds = rows
        .filter((r: any) => r.aiAssessmentCompleted === 1)
        .map((r: any) => r.id);
      if (completedIds.length === 0) return rows;
      const { aiAssessments: aiAssessmentsTable } = await import("../../drizzle/schema");
      const { inArray: inArrayOp } = await import("drizzle-orm");
      const qualityRows = await db
        .select({ claimId: aiAssessmentsTable.claimId, claimQualityJson: aiAssessmentsTable.claimQualityJson, cgiResultJson: aiAssessmentsTable.cgiResultJson })
        .from(aiAssessmentsTable)
        .where(inArrayOp(aiAssessmentsTable.claimId, completedIds));
      const qualityMap = new Map<number, any>();
      const cgiMap2 = new Map<number, any>();
      for (const qr of qualityRows) {
        if (qr.claimId && qr.claimQualityJson) {
          try {
            const parsed = JSON.parse(qr.claimQualityJson as string);
            qualityMap.set(qr.claimId, { grade: parsed.grade, overallScore: parsed.overallScore, requiresManualReview: parsed.requiresManualReview });
          } catch { /* non-fatal */ }
        }
        if (qr.claimId && qr.cgiResultJson) {
          try {
            const cgi = JSON.parse(qr.cgiResultJson as string);
            // Expose top-level convenience fields so FraudAnalyticsDashboard can filter on _cgi.contactGeometryFlag
            cgiMap2.set(qr.claimId, {
              contactGeometryFlag: cgi.contactGeometryFlag ?? false,
              forensicVerdict: cgi.forensicVerdict ?? null,
              hiddenDamageProbabilityOverride: cgi.conclusion?.hiddenDamageProbabilityOverride ?? null,
            });
          } catch { /* non-fatal */ }
        }
      }
      return rows.map((r: any) => ({
        ...r,
        _qualityGrade: qualityMap.get(r.id) ?? null,
        _cgi: cgiMap2.get(r.id) ?? null,
      }));
    }),

  // ─── Claims Manager: Active Claims ─────────────────────────────────────────
  // Returns all non-terminal claims for the tenant (everything except completed/rejected/closed)
  getActiveClaims: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(), // ISO date string e.g. "2025-01-01"
      to: z.string().optional(),
      status: z.string().optional(),
      workflowState: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const terminalStatuses = ['completed', 'rejected', 'closed'] as const;
      const conditions: any[] = [
        eq(claims.tenantId, ctx.insurerTenantId),
        notInArray(claims.status, [...terminalStatuses] as any[]),
      ];
      if (input?.from) conditions.push(gte(claims.createdAt, input.from));
      if (input?.to) conditions.push(lte(claims.createdAt, input.to + ' 23:59:59'));
      if (input?.status) conditions.push(eq(claims.status, input.status as any));
      if (input?.workflowState) conditions.push(eq(claims.workflowState, input.workflowState as any));
      const rows = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          workflowState: claims.workflowState,
          fraudRiskLevel: claims.fraudRiskLevel,
          fraudRiskScore: claims.fraudRiskScore,
          approvedAmount: claims.approvedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
          finalApprovedAmount: claims.finalApprovedAmount,
          incidentType: claims.incidentType,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleYear: claims.vehicleYear,
          vehicleRegistration: claims.vehicleRegistration,
          claimantName: claims.lodgerName,
          claimantEmail: claims.claimantEmail,
          incidentDate: claims.incidentDate,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          closedAt: claims.closedAt,
          assignedAssessorId: claims.assignedAssessorId,
          assignedProcessorId: claims.assignedProcessorId,
          priority: claims.priority,
          currencyCode: claims.currencyCode,
          kingaRef: claims.kingaRef,
          policyNumber: claims.policyNumber,
        })
        .from(claims)
        .where(and(...conditions))
        .orderBy(desc(claims.createdAt))
        .limit(500);
      // Apply search filter client-side for flexibility
      if (input?.search) {
        const q = input.search.toLowerCase();
        return rows.filter(r =>
          r.claimNumber?.toLowerCase().includes(q) ||
          r.claimantName?.toLowerCase().includes(q) ||
          r.vehicleRegistration?.toLowerCase().includes(q) ||
          r.kingaRef?.toLowerCase().includes(q) ||
          r.policyNumber?.toLowerCase().includes(q)
        );
      }
      return rows;
    }),

  // ─── Claims Manager: Fraud Alerts ───────────────────────────────────────────
  // Returns claims with high/critical/elevated fraud risk or score > 70
  getFraudAlerts: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      minScore: z.number().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions: any[] = [
        eq(claims.tenantId, ctx.insurerTenantId),
        or(
          inArray(claims.fraudRiskLevel, ['high', 'critical', 'elevated'] as any[]),
          gt(claims.fraudRiskScore, input?.minScore ?? 70)
        ),
      ];
      if (input?.from) conditions.push(gte(claims.createdAt, input.from));
      if (input?.to) conditions.push(lte(claims.createdAt, input.to + ' 23:59:59'));
      const rows = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          workflowState: claims.workflowState,
          fraudRiskLevel: claims.fraudRiskLevel,
          fraudRiskScore: claims.fraudRiskScore,
          approvedAmount: claims.approvedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
          incidentType: claims.incidentType,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleYear: claims.vehicleYear,
          vehicleRegistration: claims.vehicleRegistration,
          claimantName: claims.lodgerName,
          claimantEmail: claims.claimantEmail,
          incidentDate: claims.incidentDate,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          currencyCode: claims.currencyCode,
          kingaRef: claims.kingaRef,
          policyNumber: claims.policyNumber,
        })
        .from(claims)
        .where(and(...conditions))
        .orderBy(desc(claims.fraudRiskScore))
        .limit(300);
      if (input?.search) {
        const q = input.search.toLowerCase();
        return rows.filter(r =>
          r.claimNumber?.toLowerCase().includes(q) ||
          r.claimantName?.toLowerCase().includes(q) ||
          r.vehicleRegistration?.toLowerCase().includes(q) ||
          r.kingaRef?.toLowerCase().includes(q) ||
          r.policyNumber?.toLowerCase().includes(q)
        );
      }
      return rows;
    }),

  // ─── Claims Manager: Dashboard Statistics ───────────────────────────────────
  // Aggregate counts by status, fraud risk breakdown, total claim value, avg processing time
  getDashboardStats: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // All claims for tenant within optional date range
      const conditions: any[] = [eq(claims.tenantId, ctx.insurerTenantId)];
      if (input?.from) conditions.push(gte(claims.createdAt, input.from));
      if (input?.to) conditions.push(lte(claims.createdAt, input.to + ' 23:59:59'));
      const allClaims = await db
        .select({
          id: claims.id,
          status: claims.status,
          workflowState: claims.workflowState,
          fraudRiskLevel: claims.fraudRiskLevel,
          fraudRiskScore: claims.fraudRiskScore,
          approvedAmount: claims.approvedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
          finalApprovedAmount: claims.finalApprovedAmount,
          incidentType: claims.incidentType,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          closedAt: claims.closedAt,
        })
        .from(claims)
        .where(and(...conditions))
        .orderBy(desc(claims.createdAt))
        .limit(2000);

      // Count by status
      const statusCounts: Record<string, number> = {};
      let totalAmount = 0;
      let fraudHighCount = 0;
      let closedWithTime: { ms: number }[] = [];

      for (const c of allClaims) {
        const s = c.status ?? 'unknown';
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        totalAmount += parseFloat(String(c.estimatedClaimValue ?? 0));
        if (c.fraudRiskLevel === 'high' || (c.fraudRiskLevel as string) === 'critical' || (c.fraudRiskLevel as string) === 'elevated') {
          fraudHighCount++;
        }
        if ((c.status === 'completed' || c.status === 'closed') && c.createdAt && c.updatedAt) {
          const ms = new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime();
          if (ms > 0) closedWithTime.push({ ms });
        }
      }

      const avgProcessingDays = closedWithTime.length > 0
        ? Math.round(closedWithTime.reduce((sum, x) => sum + x.ms, 0) / closedWithTime.length / 86400000)
        : null;

      const total = allClaims.length;
      const fraudRate = total > 0 ? Math.round((fraudHighCount / total) * 100) : 0;
      // Active = not in terminal state
      const terminalStatuses = new Set(['completed', 'rejected', 'closed']);
      const activeCount = allClaims.filter(c => !terminalStatuses.has(c.status ?? '')).length;
      const completedCount = allClaims.filter(c => c.status === 'completed').length;
      const rejectedCount = allClaims.filter(c => c.status === 'rejected').length;
      // Savings = sum(estimatedClaimValue - finalApprovedAmount) where both exist and approved < estimated
      let totalSavings = 0;
      let savingsCount = 0;
      // Incident type breakdown
      const incidentTypeCounts: Record<string, number> = {};
      // Workflow state breakdown
      const workflowStateCounts: Record<string, number> = {};
      for (const c of allClaims) {
        const est = parseFloat(c.estimatedClaimValue ?? '0');
        const approved = parseFloat(c.finalApprovedAmount ?? '0');
        if (est > 0 && approved > 0 && approved < est) {
          totalSavings += est - approved;
          savingsCount++;
        }
        if (c.incidentType) incidentTypeCounts[c.incidentType] = (incidentTypeCounts[c.incidentType] ?? 0) + 1;
        if (c.workflowState) workflowStateCounts[c.workflowState] = (workflowStateCounts[c.workflowState] ?? 0) + 1;
      }
      return {
        total,
        activeCount,
        completedCount,
        rejectedCount,
        fraudHighCount,
        fraudRate,
        totalAmount,
        avgProcessingDays,
        statusCounts,
        totalSavings: Math.round(totalSavings),
        savingsCount,
        incidentTypeCounts,
        workflowStateCounts,
       };
    }),
  // ─── Risk Manager: Escalations ──────────────────────────────────────────────
  // Claims in disputed/manual_review workflow states or with high/critical fraud risk
  getEscalations: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions: any[] = [
        eq(claims.tenantId, ctx.insurerTenantId),
        or(
          inArray(claims.workflowState, ['disputed', 'manual_review'] as any[]),
          inArray(claims.fraudRiskLevel, ['high', 'critical'] as any[])
        ),
      ];
      if (input?.from) conditions.push(gte(claims.createdAt, input.from));
      if (input?.to) conditions.push(lte(claims.createdAt, input.to + ' 23:59:59'));
      const rows = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          workflowState: claims.workflowState,
          fraudRiskLevel: claims.fraudRiskLevel,
          fraudRiskScore: claims.fraudRiskScore,
          approvedAmount: claims.approvedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
          incidentType: claims.incidentType,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleYear: claims.vehicleYear,
          vehicleRegistration: claims.vehicleRegistration,
          claimantName: claims.lodgerName,
          claimantEmail: claims.claimantEmail,
          incidentDate: claims.incidentDate,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          currencyCode: claims.currencyCode,
        })
        .from(claims)
        .where(and(...conditions))
        .orderBy(desc(claims.updatedAt))
        .limit(300);
      if (input?.search) {
        const q = input.search.toLowerCase();
        return rows.filter(r =>
          r.claimNumber?.toLowerCase().includes(q) ||
          r.claimantName?.toLowerCase().includes(q)
        );
      }
      return rows;
    }),
  // ─── Risk Manager: Financial Decision Queue ──────────────────────────────────────────
  // Claims awaiting financial approval, ordered by amount descending
  getFinancialDecisionQueue: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions: any[] = [
        eq(claims.tenantId, ctx.insurerTenantId),
        eq(claims.workflowState, 'financial_decision' as any),
      ];
      if (input?.from) conditions.push(gte(claims.createdAt, input.from));
      if (input?.to) conditions.push(lte(claims.createdAt, input.to + ' 23:59:59'));
      const rows = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          workflowState: claims.workflowState,
          fraudRiskLevel: claims.fraudRiskLevel,
          fraudRiskScore: claims.fraudRiskScore,
          approvedAmount: claims.approvedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
          finalApprovedAmount: claims.finalApprovedAmount,
          incidentType: claims.incidentType,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleYear: claims.vehicleYear,
          vehicleRegistration: claims.vehicleRegistration,
          claimantName: claims.lodgerName,
          claimantEmail: claims.claimantEmail,
          incidentDate: claims.incidentDate,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          currencyCode: claims.currencyCode,
          priority: claims.priority,
        })
        .from(claims)
        .where(and(...conditions))
        .orderBy(desc(claims.estimatedClaimValue))
        .limit(300);
      if (input?.search) {
        const q = input.search.toLowerCase();
        return rows.filter(r =>
          r.claimNumber?.toLowerCase().includes(q) ||
          r.claimantName?.toLowerCase().includes(q)
        );
      }
      return rows;
    }),

  // ─── Analytics: Manager Overview ─────────────────────────────────────────────
  // 6 KPIs with period-over-period deltas, status donut, 30-day cycle time trend,
  // incident type bar chart, and 3 AI-generated insight sentences.
  getManagerOverview: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const now = new Date();
      // Default: last 30 days
      const toDate = input?.to ? new Date(input.to) : now;
      const fromDate = input?.from ? new Date(input.from) : new Date(now.getTime() - 30 * 86400000);
      // Previous period (same duration)
      const duration = toDate.getTime() - fromDate.getTime();
      const prevFrom = new Date(fromDate.getTime() - duration);
      const prevTo = new Date(fromDate.getTime() - 1);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const fetchPeriod = async (pFrom: Date, pTo: Date) => {
        return db.select({
          id: claims.id,
          status: claims.status,
          workflowState: claims.workflowState,
          fraudRiskLevel: claims.fraudRiskLevel,
          fraudRiskScore: claims.fraudRiskScore,
          approvedAmount: claims.approvedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
          finalApprovedAmount: claims.finalApprovedAmount,
          incidentType: claims.incidentType,
          createdAt: claims.createdAt,
          closedAt: claims.closedAt,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.insurerTenantId),
          gte(claims.createdAt, fmt(pFrom)),
          lte(claims.createdAt, fmt(pTo) + ' 23:59:59'),
        ))
        .limit(2000);
      };

      const [current, previous] = await Promise.all([
        fetchPeriod(fromDate, toDate),
        fetchPeriod(prevFrom, prevTo),
      ]);

      const calcKpis = (rows: typeof current) => {
        const total = rows.length;
        const terminal = new Set(['completed', 'rejected', 'closed']);
        const active = rows.filter(r => !terminal.has(r.status ?? '')).length;
        const completed = rows.filter(r => r.status === 'completed').length;
        const fraudHigh = rows.filter(r => ['high','critical','elevated'].includes(r.fraudRiskLevel ?? '')).length;
        const fraudRate = total > 0 ? Math.round((fraudHigh / total) * 100) : 0;
        let savings = 0;
        let totalAmt = 0;
        let closedMs: number[] = [];
        const incidentCounts: Record<string, number> = {};
        const statusCounts: Record<string, number> = {};
        for (const r of rows) {
          totalAmt += parseFloat(String(r.estimatedClaimValue ?? 0));
          const est = parseFloat(r.estimatedClaimValue ?? '0');
          const approved = parseFloat(r.finalApprovedAmount ?? '0');
          if (est > 0 && approved > 0 && approved < est) savings += est - approved;
          if (r.closedAt && r.createdAt) {
            const ms = new Date(r.closedAt).getTime() - new Date(r.createdAt).getTime();
            if (ms > 0) closedMs.push(ms);
          }
          if (r.incidentType) incidentCounts[r.incidentType] = (incidentCounts[r.incidentType] ?? 0) + 1;
          if (r.status) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
        }
        const avgCycleDays = closedMs.length > 0
          ? Math.round(closedMs.reduce((a, b) => a + b, 0) / closedMs.length / 86400000)
          : null;
        return { total, active, completed, fraudHigh, fraudRate, totalAmt, savings: Math.round(savings), avgCycleDays, incidentCounts, statusCounts };
      };

      const cur = calcKpis(current);
      const prev = calcKpis(previous);
      const delta = (a: number | null, b: number | null) =>
        a !== null && b !== null && b > 0 ? Math.round(((a - b) / b) * 100) : null;

      // 30-day daily claim count trend
      const trendMap: Record<string, number> = {};
      for (const r of current) {
        const day = (r.createdAt ?? '').slice(0, 10);
        if (day) trendMap[day] = (trendMap[day] ?? 0) + 1;
      }
      const trend = Object.entries(trendMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      return {
        period: { from: fmt(fromDate), to: fmt(toDate) },
        kpis: {
          totalClaims: { value: cur.total, delta: delta(cur.total, prev.total) },
          activeClaims: { value: cur.active, delta: delta(cur.active, prev.active) },
          completedClaims: { value: cur.completed, delta: delta(cur.completed, prev.completed) },
          fraudRate: { value: cur.fraudRate, delta: delta(cur.fraudRate, prev.fraudRate) },
          totalSavings: { value: cur.savings, delta: delta(cur.savings, prev.savings) },
          avgCycleDays: { value: cur.avgCycleDays, delta: delta(cur.avgCycleDays, prev.avgCycleDays) },
        },
        statusDonut: cur.statusCounts,
        incidentTypeBar: cur.incidentCounts,
        cycleTrend: trend,
      };
    }),

  // ─── Analytics: Risk Portfolio Analytics ─────────────────────────────────────
  // Fraud rate trend, incident×risk heatmap matrix, frequency vs severity scatter
  getRiskPortfolioAnalytics: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const now = new Date();
      const toDate = input?.to ? new Date(input.to) : now;
      const fromDate = input?.from ? new Date(input.from) : new Date(now.getTime() - 90 * 86400000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const rows = await db.select({
        id: claims.id,
        fraudRiskLevel: claims.fraudRiskLevel,
        fraudRiskScore: claims.fraudRiskScore,
        incidentType: claims.incidentType,
        approvedAmount: claims.approvedAmount,
        estimatedClaimValue: claims.estimatedClaimValue,
        finalApprovedAmount: claims.finalApprovedAmount,
        createdAt: claims.createdAt,
        status: claims.status,
      })
      .from(claims)
      .where(and(
        eq(claims.tenantId, ctx.insurerTenantId),
        gte(claims.createdAt, fmt(fromDate)),
        lte(claims.createdAt, fmt(toDate) + ' 23:59:59'),
      ))
      .limit(3000);

      // Incident type × risk level heatmap
      const incidentTypes = ['collision','theft','hail','fire','vandalism','flood','hijacking','other'];
      const riskLevels = ['low','medium','high','critical','elevated'];
      const heatmap: Record<string, Record<string, number>> = {};
      for (const it of incidentTypes) {
        heatmap[it] = {};
        for (const rl of riskLevels) heatmap[it][rl] = 0;
      }

      // Weekly fraud rate trend
      const weekMap: Record<string, { total: number; fraud: number }> = {};
      // Frequency vs severity scatter (one point per incident type)
      const scatterMap: Record<string, { count: number; totalAmt: number }> = {};

      for (const r of rows) {
        const it = r.incidentType ?? 'other';
        const rl = r.fraudRiskLevel ?? 'low';
        if (heatmap[it]) heatmap[it][rl] = (heatmap[it][rl] ?? 0) + 1;

        // Weekly bucket
        const d = new Date(r.createdAt ?? '');
        const week = `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2,'0')}`;
        if (!weekMap[week]) weekMap[week] = { total: 0, fraud: 0 };
        weekMap[week].total++;
        if (['high','critical','elevated'].includes(rl)) weekMap[week].fraud++;

        // Scatter
        if (!scatterMap[it]) scatterMap[it] = { count: 0, totalAmt: 0 };
        scatterMap[it].count++;
        scatterMap[it].totalAmt += parseFloat(String(r.estimatedClaimValue ?? 0));
      }

      const fraudRateTrend = Object.entries(weekMap)
        .sort(([a],[b]) => a.localeCompare(b))
        .map(([week, v]) => ({ week, fraudRate: v.total > 0 ? Math.round((v.fraud / v.total) * 100) : 0, total: v.total }));

      const scatter = Object.entries(scatterMap).map(([incidentType, v]) => ({
        incidentType,
        frequency: v.count,
        avgSeverity: v.count > 0 ? Math.round(v.totalAmt / v.count) : 0,
      }));

      const totalFraud = rows.filter(r => ['high','critical','elevated'].includes(r.fraudRiskLevel ?? '')).length;
      const fraudExposure = rows
        .filter(r => ['high','critical','elevated'].includes(r.fraudRiskLevel ?? ''))
        .reduce((sum, r) => sum + parseFloat(String(r.estimatedClaimValue ?? 0)), 0);

      return {
        period: { from: fmt(fromDate), to: fmt(toDate) },
        kpis: {
          totalClaims: rows.length,
          fraudCount: totalFraud,
          fraudRate: rows.length > 0 ? Math.round((totalFraud / rows.length) * 100) : 0,
          fraudExposure: Math.round(fraudExposure),
          avgFraudScore: rows.length > 0
            ? Math.round(rows.reduce((s, r) => s + (r.fraudRiskScore ?? 0), 0) / rows.length)
            : 0,
        },
        heatmap,
        fraudRateTrend,
        scatter,
      };
    }),

  // ─── Risk Manager: Fraud Rule Accuracy (False Positive Rate) ───────────────
  /**
   * getFraudRuleAccuracy
   *
   * Aggregates truePositiveCount and falsePositiveCount across all active fraud
   * rules to compute the portfolio-level false positive rate.
   *
   * False Positive Rate = SUM(falsePositiveCount) / (SUM(TP) + SUM(FP))
   *
   * Source: fraudRules table. No schema changes required.
   */
  getFraudRuleAccuracy: insurerDomainProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    const rows = await db
      .select({
        truePositiveCount: fraudRules.truePositiveCount,
        falsePositiveCount: fraudRules.falsePositiveCount,
        timesTriggered: fraudRules.timesTriggered,
        ruleName: fraudRules.ruleName,
        severity: fraudRules.severity,
        ruleCategory: fraudRules.ruleCategory,
      })
      .from(fraudRules)
      .where(eq(fraudRules.isActive, 1));

    const totalTP = rows.reduce((s, r) => s + (r.truePositiveCount ?? 0), 0);
    const totalFP = rows.reduce((s, r) => s + (r.falsePositiveCount ?? 0), 0);
    const totalSignals = totalTP + totalFP;
    const falsePositiveRate = totalSignals > 0
      ? Math.round((totalFP / totalSignals) * 10000) / 100
      : null; // null = no signal data yet

    return {
      totalRules: rows.length,
      totalTruePositives: totalTP,
      totalFalsePositives: totalFP,
      totalSignals,
      falsePositiveRate,
      hasData: totalSignals > 0,
      topFalsePositiveRules: rows
        .filter(r => (r.falsePositiveCount ?? 0) > 0)
        .sort((a, b) => (b.falsePositiveCount ?? 0) - (a.falsePositiveCount ?? 0))
        .slice(0, 5)
        .map(r => ({
          ruleName: r.ruleName,
          severity: r.severity,
          ruleCategory: r.ruleCategory,
          truePositives: r.truePositiveCount ?? 0,
          falsePositives: r.falsePositiveCount ?? 0,
          timesTriggered: r.timesTriggered ?? 0,
        })),
    };
  }),

  // ─── Risk Manager: Geographic Risk Clustering ─────────────────────────────
  /**
   * getGeographicRiskClusters
   *
   * Groups high-risk claims (fraudRiskLevel = high/critical/elevated) by
   * incidentLocation token (first segment before comma) to identify geographic
   * hotspots. Returns top 20 clusters sorted by claim count descending.
   *
   * Source: claims table (incidentLocation free-text field).
   * No schema changes required.
   */
  getGeographicRiskClusters: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const now = new Date();
      const toDate = input?.to ? new Date(input.to) : now;
      const fromDate = input?.from ? new Date(input.from) : new Date(now.getTime() - 90 * 86400000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const rows = await db
        .select({
          incidentLocation: claims.incidentLocation,
          fraudRiskLevel: claims.fraudRiskLevel,
          fraudRiskScore: claims.fraudRiskScore,
          incidentType: claims.incidentType,
          approvedAmount: claims.approvedAmount,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.insurerTenantId),
          gte(claims.createdAt, fmt(fromDate)),
          lte(claims.createdAt, fmt(toDate) + ' 23:59:59'),
          isNotNull(claims.incidentLocation),
        ))
        .limit(5000);

      // Parse location token: first segment before comma, trimmed, max 40 chars
      const parseLocation = (loc: string | null): string => {
        if (!loc) return 'Unknown';
        const token = loc.split(',')[0].trim();
        return token.length > 40 ? token.slice(0, 40) : token || 'Unknown';
      };

      // Aggregate by location token
      const clusterMap: Record<string, {
        totalClaims: number;
        highRiskClaims: number;
        totalExposure: number;
        incidentTypes: Record<string, number>;
        avgFraudScore: number;
        fraudScoreSum: number;
      }> = {};

      for (const r of rows) {
        const loc = parseLocation(r.incidentLocation);
        if (!clusterMap[loc]) {
          clusterMap[loc] = { totalClaims: 0, highRiskClaims: 0, totalExposure: 0, incidentTypes: {}, avgFraudScore: 0, fraudScoreSum: 0 };
        }
        const c = clusterMap[loc];
        c.totalClaims++;
        if (['high', 'critical', 'elevated'].includes(r.fraudRiskLevel ?? '')) c.highRiskClaims++;
        c.totalExposure += Number(r.approvedAmount ?? 0);
        c.fraudScoreSum += r.fraudRiskScore ?? 0;
        const it = r.incidentType ?? 'other';
        c.incidentTypes[it] = (c.incidentTypes[it] ?? 0) + 1;
      }

      const clusters = Object.entries(clusterMap)
        .map(([location, c]) => ({
          location,
          totalClaims: c.totalClaims,
          highRiskClaims: c.highRiskClaims,
          fraudRate: c.totalClaims > 0 ? Math.round((c.highRiskClaims / c.totalClaims) * 100) : 0,
          totalExposure: Math.round(c.totalExposure),
          avgFraudScore: c.totalClaims > 0 ? Math.round(c.fraudScoreSum / c.totalClaims) : 0,
          dominantIncidentType: Object.entries(c.incidentTypes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other',
        }))
        .sort((a, b) => b.highRiskClaims - a.highRiskClaims || b.fraudRate - a.fraudRate)
        .slice(0, 20);

      return {
        period: { from: fmt(fromDate), to: fmt(toDate) },
        clusters,
        totalLocations: Object.keys(clusterMap).length,
        hasData: rows.length > 0,
      };
    }),


  // ─── Analytics: Executive Summary ────────────────────────────────────────────
  // 3 hero numbers with deltas, savings trend, resolution rate, ROI breakdown
  getExecutiveSummary: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const now = new Date();
      const toDate = input?.to ? new Date(input.to) : now;
      const fromDate = input?.from ? new Date(input.from) : new Date(now.getTime() - 30 * 86400000);
      const duration = toDate.getTime() - fromDate.getTime();
      const prevFrom = new Date(fromDate.getTime() - duration);
      const prevTo = new Date(fromDate.getTime() - 1);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const fetchPeriod = async (pFrom: Date, pTo: Date) =>
        db.select({
          id: claims.id,
          status: claims.status,
          approvedAmount: claims.approvedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
          finalApprovedAmount: claims.finalApprovedAmount,
          createdAt: claims.createdAt,
          closedAt: claims.closedAt,
          fraudRiskLevel: claims.fraudRiskLevel,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.insurerTenantId),
          gte(claims.createdAt, fmt(pFrom)),
          lte(claims.createdAt, fmt(pTo) + ' 23:59:59'),
        ))
        .limit(2000);

      const [cur, prev] = await Promise.all([fetchPeriod(fromDate, toDate), fetchPeriod(prevFrom, prevTo)]);

      const summarise = (rows: typeof cur) => {
        let totalEstimated = 0, totalApproved = 0, savings = 0;
        let closedMs: number[] = [];
        const terminal = new Set(['completed','rejected','closed']);
        const completed = rows.filter(r => terminal.has(r.status ?? '')).length;
        for (const r of rows) {
          const est = parseFloat(r.estimatedClaimValue ?? '0');
          const approved = parseFloat(r.finalApprovedAmount ?? '0');
          totalEstimated += est;
          totalApproved += approved > 0 ? approved : 0;
          if (est > 0 && approved > 0 && approved < est) savings += est - approved;
          if (r.closedAt && r.createdAt) {
            const ms = new Date(r.closedAt).getTime() - new Date(r.createdAt).getTime();
            if (ms > 0) closedMs.push(ms);
          }
        }
        const avgCycle = closedMs.length > 0
          ? Math.round(closedMs.reduce((a,b)=>a+b,0) / closedMs.length / 86400000) : null;
        const resolutionRate = rows.length > 0 ? Math.round((completed / rows.length) * 100) : 0;
        return { total: rows.length, completed, savings: Math.round(savings), totalEstimated: Math.round(totalEstimated), totalApproved: Math.round(totalApproved), avgCycle, resolutionRate };
      };

      const c = summarise(cur);
      const p = summarise(prev);
      const delta = (a: number | null, b: number | null) =>
        a !== null && b !== null && b > 0 ? Math.round(((a - b) / b) * 100) : null;

      // Monthly savings trend (last 6 months)
      const monthMap: Record<string, number> = {};
      for (const r of cur) {
        const month = (r.createdAt ?? '').slice(0, 7);
        const est = parseFloat(r.estimatedClaimValue ?? '0');
        const approved = parseFloat(r.finalApprovedAmount ?? '0');
        if (month && est > 0 && approved > 0 && approved < est) {
          monthMap[month] = (monthMap[month] ?? 0) + (est - approved);
        }
      }
      const savingsTrend = Object.entries(monthMap)
        .sort(([a],[b]) => a.localeCompare(b))
        .map(([month, savings]) => ({ month, savings: Math.round(savings) }));

      return {
        period: { from: fmt(fromDate), to: fmt(toDate) },
        heroNumbers: {
          totalSavings: { value: c.savings, delta: delta(c.savings, p.savings) },
          resolutionRate: { value: c.resolutionRate, delta: delta(c.resolutionRate, p.resolutionRate) },
          avgCycleDays: { value: c.avgCycle, delta: delta(c.avgCycle, p.avgCycle) },
        },
        roiBreakdown: {
          totalEstimated: c.totalEstimated,
          totalApproved: c.totalApproved,
          totalSavings: c.savings,
          savingsRate: c.totalEstimated > 0 ? Math.round((c.savings / c.totalEstimated) * 100) : 0,
        },
        savingsTrend,
        totalClaims: c.total,
        completedClaims: c.completed,
      };
    }),

  // ─── Analytics: Processor Queue ──────────────────────────────────────────────
  // AI priority-sorted queue with SLA hours, AI recommendation, confidence, missing docs
  getProcessorQueue: insurerDomainProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
      priority: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const conditions: any[] = [
        eq(claims.tenantId, ctx.insurerTenantId),
        notInArray(claims.status, ['completed','rejected','closed'] as any[]),
      ];
      if (input?.from) conditions.push(gte(claims.createdAt, input.from));
      if (input?.to) conditions.push(lte(claims.createdAt, input.to + ' 23:59:59'));
      if (input?.priority) conditions.push(eq(claims.priority, input.priority as any));
      const rows = await db.select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        status: claims.status,
        workflowState: claims.workflowState,
        fraudRiskLevel: claims.fraudRiskLevel,
        fraudRiskScore: claims.fraudRiskScore,
        approvedAmount: claims.approvedAmount,
        estimatedClaimValue: claims.estimatedClaimValue,
        incidentType: claims.incidentType,
        vehicleMake: claims.vehicleMake,
        vehicleModel: claims.vehicleModel,
        vehicleRegistration: claims.vehicleRegistration,
        claimantName: claims.lodgerName,
        incidentDate: claims.incidentDate,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
        priority: claims.priority,
        assignedProcessorId: claims.assignedProcessorId,
        currencyCode: claims.currencyCode,
        kingaRef: claims.kingaRef,
        policyNumber: claims.policyNumber,
        sourceDocumentId: claims.sourceDocumentId,
        documentProcessingStatus: claims.documentProcessingStatus,
        confidenceScore: claims.confidenceScore,
        aiAssessmentTriggered: claims.aiAssessmentTriggered,
        aiAssessmentCompleted: claims.aiAssessmentCompleted,
        aiAssessmentCompletedAt: claims.aiAssessmentCompletedAt,
        pipelineCurrentStage: claims.pipelineCurrentStage,
      })
      .from(claims)
      .where(and(...conditions))
      .orderBy(desc(claims.fraudRiskScore), asc(claims.createdAt))
      .limit(500);

      // Calculate SLA hours remaining (72h SLA from creation)
      const SLA_HOURS = 72;
      const enriched = rows.map(r => {
        const ageHours = r.createdAt
          ? Math.round((Date.now() - new Date(r.createdAt).getTime()) / 3600000)
          : 0;
        const slaHoursRemaining = SLA_HOURS - ageHours;
        const slaStatus = slaHoursRemaining < 0 ? 'breached' : slaHoursRemaining < 12 ? 'critical' : slaHoursRemaining < 24 ? 'warning' : 'ok';
        return { ...r, ageHours, slaHoursRemaining, slaStatus };
      });

      if (input?.search) {
        const q = input.search.toLowerCase();
        return enriched.filter(r =>
          r.claimNumber?.toLowerCase().includes(q) ||
          r.claimantName?.toLowerCase().includes(q) ||
          r.vehicleRegistration?.toLowerCase().includes(q) ||
          r.kingaRef?.toLowerCase().includes(q) ||
          r.policyNumber?.toLowerCase().includes(q)
        );
      }
      return enriched;
    }),

  // ─── Analytics: Tier Config ───────────────────────────────────────────────────
  // Returns the current tenant's pricing tier and feature flags
  getTierConfig: insurerDomainProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const [tenant] = await db
        .select({
          id: insurerTenants.id,
          name: insurerTenants.name,
          pricingTier: insurerTenants.pricingTier,
          monthlyPlatformFee: insurerTenants.monthlyPlatformFee,
          perClaimFee: insurerTenants.perClaimFee,
          tierFeatureFlags: insurerTenants.tierFeatureFlags,
        })
        .from(insurerTenants)
        .where(eq(insurerTenants.id, ctx.insurerTenantId))
        .limit(1);
      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND' });
      let featureFlags: Record<string, boolean> = {};
      try { featureFlags = tenant.tierFeatureFlags ? JSON.parse(tenant.tierFeatureFlags) : {}; } catch {}
      // Default feature flags per tier
      const defaults: Record<string, Record<string, boolean>> = {
        process: { fraudHeatmap: false, exportReports: false, aiRecommendations: true, leaderboard: false, benchmarking: false, executiveDashboard: false },
        protect: { fraudHeatmap: true, exportReports: true, aiRecommendations: true, leaderboard: true, benchmarking: false, executiveDashboard: true },
        prove: { fraudHeatmap: true, exportReports: true, aiRecommendations: true, leaderboard: true, benchmarking: true, executiveDashboard: true },
      };
      const tierDefaults = defaults[tenant.pricingTier ?? 'process'] ?? defaults.process;
      return {
        ...tenant,
        featureFlags: { ...tierDefaults, ...featureFlags },
        tierPricing: {
          process: { monthly: 900, perClaim: 12 },
          protect: { monthly: 1300, perClaim: 12 },
          prove: { monthly: 1600, perClaim: 12 },
        },
      };
    }),

  // ─── Admin: Update Tier Config ────────────────────────────────────────────────
  // Allows KINGA admin to update a tenant's pricing tier and feature flags
  updateTierConfig: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      pricingTier: z.enum(['process','protect','prove']).optional(),
      monthlyPlatformFee: z.number().optional(),
      perClaimFee: z.number().optional(),
      tierFeatureFlags: z.record(z.string(), z.boolean()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const updates: Record<string, any> = {};
      if (input.pricingTier) updates.pricingTier = input.pricingTier;
      if (input.monthlyPlatformFee !== undefined) updates.monthlyPlatformFee = input.monthlyPlatformFee.toString();
      if (input.perClaimFee !== undefined) updates.perClaimFee = input.perClaimFee.toString();
      if (input.tierFeatureFlags !== undefined) updates.tierFeatureFlags = JSON.stringify(input.tierFeatureFlags);
      if (Object.keys(updates).length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' });
      await db.update(insurerTenants).set(updates).where(eq(insurerTenants.id, input.tenantId));
      return { success: true };
    }),

  // Get single claim by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
      const claim = await getClaimById(input.id, tenantId);
      
      // Extend response with parsed physics validation data (forensic-grade quantitative physics)
      if (claim) {
        const aiAssessment = await getAiAssessmentByClaimId(claim.id, tenantId);

        // ── Currency fallback chain ──────────────────────────────────────────
        // Priority: claim.currencyCode → insurer_tenant.primaryCurrency → "USD"
        let resolvedCurrencyCode = claim.currencyCode ?? null;
        if (!resolvedCurrencyCode && claim.tenantId) {
          const db = await getDb();
          if (db) {
            const [insurerRow] = await db
              .select({ primaryCurrency: insurerTenants.primaryCurrency })
              .from(insurerTenants)
              .where(eq(insurerTenants.id, claim.tenantId))
              .limit(1);
            resolvedCurrencyCode = insurerRow?.primaryCurrency ?? null;
          }
        }
        resolvedCurrencyCode = resolvedCurrencyCode ?? "USD";
        // ────────────────────────────────────────────────────────────────────

        // Fetch PDF URL from source document if available
        let sourcePdfUrl: string | null = null;
        if (claim.sourceDocumentId) {
          const db = await getDb();
          if (db) {
            const [sourceDoc] = await db
              .select({ s3Url: ingestionDocuments.s3Url })
              .from(ingestionDocuments)
              .where(eq(ingestionDocuments.id, claim.sourceDocumentId))
              .limit(1);
            sourcePdfUrl = sourceDoc?.s3Url ?? null;
          }
        }

        // Stage 27: validate and auto-heal before sending to frontend
        const claimDetailRaw = {
          ...claim,
          currencyCode: resolvedCurrencyCode,
          // PDF URL from source document (for image display fallback)
          sourcePdfUrl,
          // Parse physics analysis JSON into typed PhysicsValidation object
          // Maintains backward compatibility - returns null if missing
          physicsValidation: aiAssessment?.physicsAnalysis 
            ? parsePhysicsAnalysis(aiAssessment.physicsAnalysis)
            : null
        };
        return validateClaimDetailResponse(claimDetailRaw as Record<string, unknown>, claim.id) as typeof claimDetailRaw;
      }
      
      return claim;
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
  // Uses insurerDomainProcedure: ctx.insurerTenantId is always non-null, preventing cross-tenant leakage
  assignToAssessor: insurerDomainProcedure
    .input(z.object({
      claimId: z.number(),
      assessorId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // ctx.insurerTenantId guaranteed non-null by insurerDomainProcedure middleware
      const tenantId = ctx.insurerTenantId;
      
      // Verify claim belongs to insurer's tenant before assignment (cross-tenant guard)
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });

      // ── Assessor subscription cap enforcement ──────────────────────────
      // Throws TRPCError(FORBIDDEN) if free-tier monthly cap is reached.
      const { checkAssignmentCap } = await import("../assessor-subscription");
      await checkAssignmentCap(input.assessorId);
      // ──────────────────────────────────────────────────────────────────

      await assignClaimToAssessor(input.claimId, input.assessorId);
      
      // Automatically progress workflow state using WorkflowEngine
      const { transition } = await import('../workflow-engine');
      const { statusToWorkflowState } = await import('../workflow-migration');
      
      await transition({
        claimId: input.claimId,
        fromState: (claim.workflowState || "created") as any,
        toState: statusToWorkflowState("assessment_pending"),
        userId: ctx.user.id,
        userRole: (ctx.user.insurerRole || "claims_processor") as any,
        decisionData: {
          comments: `Claim assigned to assessor ${input.assessorId}`,
        },
        aiSnapshot: undefined,
      });

      // Get assessor details for notification
      const assessors = await getUsersByRole("assessor");
      const assessor = assessors.find(a => a.id === input.assessorId);

      // Send email notification to assessor
      if (claim && assessor) {
        const { notifyAssessorAssignment: notifyAssignment } = await import('../workflow-notifications');
        const { getUserById } = await import('../db');
        
        // Get claimant details
        const claimant = claim.claimantId != null ? await getUserById(claim.claimantId) : null;
        
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
        const { createNotification } = await import("../db");
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

      // Phase 8: Plain-language in-app notification to claimant on assessor assignment
      if (claim.claimantId) {
        try {
          const { createNotification: _cn9 } = await import('../db');
          await _cn9({
            userId: claim.claimantId,
            title: 'Your Claim Is Being Assessed',
            message: `Your claim ${claim.claimNumber} has been assigned to an assessor. KINGA has completed its analysis. Your assessor will review the findings within 24 hours. No action is required from you right now.`,
            type: 'status_changed',
            claimId: input.claimId,
            entityType: 'claim',
            entityId: input.claimId,
            actionUrl: `/claimant/claims/${input.claimId}`,
            priority: 'normal',
          });
        } catch (_e9) { /* non-fatal */ }
      }
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
   * Initiates automated KINGA analysis of damage photos to estimate repair costs
   * and detect potential fraud indicators.
   * 
   * @requires Authentication (Any role can trigger for oversight)
   * @param claimId - ID of the claim to assess
   * @param reason - Optional reason for triggering (for audit trail)
   * @returns Success status
   */
  triggerAiAssessment: protectedProcedure
    .input(z.object({ 
      claimId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      
      // Get current claim status to handle multi-step transitions
      const tenantIdForStatus = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
      const currentClaim = await getClaimById(input.claimId, tenantIdForStatus);
      if (!currentClaim) throw new Error("Claim not found");
      
      // Progress through required intermediate states to reach assessment_in_progress
      const claimTenantId = currentClaim.tenantId || "default";
      const currentStatus = currentClaim.status;
      if (currentStatus === "intake_pending" || currentStatus === "document_validating" || (currentStatus as string) === "document_failed") {
        // Document-ingestion claims: intake_pending/document_validating/document_failed → assessment_in_progress
        // document_failed: pipeline previously failed (e.g. server restart); manual re-trigger resets it.
        await updateClaimStatus(input.claimId, "assessment_in_progress", ctx.user.id, "claims_processor", claimTenantId);
      } else if (currentStatus === "submitted") {
        await updateClaimStatus(input.claimId, "triage", ctx.user.id, "claims_processor", claimTenantId);
        await updateClaimStatus(input.claimId, "assessment_pending", ctx.user.id, "claims_processor", claimTenantId);
        await updateClaimStatus(input.claimId, "assessment_in_progress", ctx.user.id, "claims_processor", claimTenantId);
      } else if (currentStatus === "triage") {
        await updateClaimStatus(input.claimId, "assessment_pending", ctx.user.id, "claims_processor", claimTenantId);
        await updateClaimStatus(input.claimId, "assessment_in_progress", ctx.user.id, "claims_processor", claimTenantId);
      } else if (currentStatus === "assessment_pending") {
        await updateClaimStatus(input.claimId, "assessment_in_progress", ctx.user.id, "claims_processor", claimTenantId);
      } else if (currentStatus === "assessment_in_progress" || currentStatus === "assessment_complete") {
        // Already in progress or complete — just re-run the assessment
      } else if (
        (currentStatus as string) === "ai_assessment_completed" ||
        (currentStatus as string) === "technical_approval" ||
        (currentStatus as string) === "internal_review" ||
        (currentStatus as string) === "financial_decision"
      ) {
        // Re-run from post-assessment states: transition back to assessment_in_progress
        // WORKFLOW_TRANSITIONS now allows under_assessment from these states
        await updateClaimStatus(input.claimId, "assessment_in_progress", ctx.user.id, "claims_processor", claimTenantId);
      } else {
        // For other states, try direct transition (will throw if invalid)
        await updateClaimStatus(input.claimId, "assessment_in_progress", ctx.user.id, "claims_processor", claimTenantId);
      }
      
      // Capture user context for the async callback (request scope ends after return)
      const asyncUserId = ctx.user.id;
      const asyncUserEmail = ctx.user.email || "";
      const asyncUserName = ctx.user.name || "Insurer";
      const asyncUserRole = ctx.user.role;
      const asyncTenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
      // Detect re-run: if aiAssessmentCompleted=1 this is a re-analysis, not a first run.
      const isRerun = currentClaim.aiAssessmentCompleted === 1;

      // ── PRE-FLIGHT: Mark pipeline as triggered BEFORE firing async job ──
      // This prevents the claim from appearing stuck in assessment_in_progress
      // with ai_assessment_triggered=0 (which happens when the HTTP response
      // returns before the async job sets these fields inside triggerAiAssessment).
      // The UI uses documentProcessingStatus='parsing' to show the spinner;
      // ai_assessment_triggered=1 prevents the resetStuckClaim guard from
      // incorrectly resetting a claim that is genuinely in-flight.
      try {
        const dbPreflight = await getDb();
        if (dbPreflight) {
          await dbPreflight.update(claims).set({
            aiAssessmentTriggered: 1,
            documentProcessingStatus: "parsing",
            aiAssessmentStartedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
            aiAssessmentCompletedAt: null,
            updatedAt: new Date().toISOString(),
          }).where(eq(claims.id, input.claimId));
        }
      } catch (preflightErr) {
        console.warn(`[AI] Pre-flight status update failed for claim ${input.claimId} (non-fatal):`, preflightErr);
      }

      // Fire-and-forget: run the KINGA assessment asynchronously so the HTTP
      // mutation response returns immediately (avoids 15-45 s LLM timeout).
      // The frontend polls aiAssessments.byClaim every 5 s until a result
      // appears (see InsurerComparisonView / ClaimRiskIndicators).
      // IMPORTANT: Notifications are sent INSIDE the async callback so they
      // only fire AFTER the AI job has actually completed (not before).
      triggerAiAssessment(input.claimId)
        .then(async () => {
          try {
            // Now the KINGA assessment record exists — safe to read and notify
            const claim = await getClaimById(input.claimId, asyncTenantId);
            const aiAssessment = await getAiAssessmentByClaimId(input.claimId, asyncTenantId);

            if (claim && aiAssessment) {
              // Send email notification — skip on re-runs to avoid duplicate emails
              if (!isRerun) {
                await notifyAiAssessmentComplete({
                  claimId: input.claimId,
                  recipientEmail: asyncUserEmail,
                  recipientName: asyncUserName,
                  claimNumber: claim.claimNumber,
                  estimatedCost: (aiAssessment.estimatedCost || 0).toString(),
                  fraudRiskLevel: aiAssessment.fraudRiskLevel || "low",
                  confidenceScore: (aiAssessment.confidenceScore || 0).toString(),
                });
              }

              // Create in-app notification
              const { createNotification } = await import("../db");
              if (aiAssessment.fraudRiskLevel === "high") {
                await createNotification({
                  userId: asyncUserId,
                  title: isRerun ? "\u26a0\ufe0f High Fraud Risk — Re-Analysis" : "\u26a0\ufe0f High Fraud Risk Detected",
                  message: `KINGA ${isRerun ? 're-analysis' : 'assessment'} flagged claim ${claim.claimNumber} as high fraud risk. Immediate review recommended.`,
                  type: "fraud_detected",
                  claimId: input.claimId,
                  entityType: "ai_assessment",
                  entityId: aiAssessment.id,
                  actionUrl: `/insurer/claims/${input.claimId}/comparison`,
                  priority: "urgent",
                });
              } else {
                await createNotification({
                  userId: asyncUserId,
                  title: isRerun ? "KINGA Re-Analysis Complete" : "KINGA Assessment Complete",
                  message: isRerun
                    ? `Re-analysis complete for claim ${claim.claimNumber}. Updated estimate: $${(aiAssessment.estimatedCost || 0).toFixed(2)}`
                    : `AI damage assessment completed for claim ${claim.claimNumber}. Estimated cost: $${(aiAssessment.estimatedCost || 0).toFixed(2)}`,
                  type: "assessment_completed",
                  claimId: input.claimId,
                  entityType: "ai_assessment",
                  actionUrl: `/insurer/claims/${input.claimId}/comparison`,
                  priority: "medium",
                });
              }
            }

            // Audit entry for completion
            await createAuditEntry({
              claimId: input.claimId,
              userId: asyncUserId,
              action: "ai_assessment_completed",
              entityType: "claim",
              entityId: input.claimId,
              changeDescription: "AI damage assessment completed successfully",
            });
          } catch (notifyErr) {
            console.error(`[AI] Post-assessment notification failed for claim ${input.claimId}:`, notifyErr);
          }
        })
        .catch(async (err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack : '';
          console.error(`[AI] Background assessment FAILED for claim ${input.claimId}:`, errMsg);
          console.error(`[AI] Full stack trace:`, errStack);
          // CRITICAL: Update claim status to 'failed' so it doesn't stay stuck at 'extracting' forever
          // NOTE: The claims table does NOT have a 'notes' or 'aiAssessmentStatus' column.
          // Store error info in the audit trail instead.
          try {
            const dbFail = await getDb();
            if (dbFail) {
              await dbFail.update(claims).set({
                documentProcessingStatus: "failed",
                status: "intake_pending",
                workflowState: "intake_queue",
                aiAssessmentTriggered: 0,
                updatedAt: new Date().toISOString(),
              }).where(eq(claims.id, input.claimId));
              console.log(`[AI] Claim ${input.claimId} marked as failed. Error: ${errMsg.slice(0, 200)}`);
            }
            // Store error details in audit trail for debugging
            await createAuditEntry({
              claimId: input.claimId,
              userId: ctx.user.id,
              action: "ai_assessment_failed",
              entityType: "ai_assessment",
              changeDescription: `AI Pipeline Error: ${errMsg.slice(0, 500)}`,
            }).catch(() => {});
          } catch (failUpdateErr) {
            console.error(`[AI] CRITICAL: Could not mark claim ${input.claimId} as failed:`, failUpdateErr);
          }
        });
      
      // Create audit entry for manual KINGA assessment trigger (immediate — before async job)
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "ai_assessment_triggered",
        entityType: "ai_assessment",
        changeDescription: `KINGA assessment manually triggered by ${ctx.user.role}${input.reason ? `: ${input.reason}` : ''}`,
      });

      return { success: true };
    }),

  /**
   * Reset a stuck claim back to intake_pending
   *
   * Use when a claim is stuck in assessment_in_progress / parsing state
   * due to an LLM timeout or infrastructure error.
   * Only accessible to claims_processor, claims_manager, executive, insurer_admin, and admin.
   */
  resetStuckClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const allowedRoles = ["claims_processor", "claims_manager", "executive", "insurer_admin", "admin", "platform_super_admin"];
      if (!allowedRoles.includes(ctx.user.role || "")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }
      const tenantId = isAdminRole(ctx.user.role) || ctx.user.role === "platform_super_admin" ? undefined : (ctx.user.tenantId || "default");
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(claims).set({
        status: "intake_pending",
        workflowState: "intake_queue",  // Reset workflow state so re-run can transition cleanly
        documentProcessingStatus: "failed",
        aiAssessmentTriggered: 0,
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, input.claimId));

      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_reset_from_stuck",
        entityType: "claim",
        changeDescription: `Claim manually reset from stuck AI processing state by ${ctx.user.role}`,
      });

      console.log(`[KINGA Assessment] Claim ${input.claimId} manually reset to intake_pending by user ${ctx.user.id} (${ctx.user.role})`);
      return { success: true };
    }),

  /**
   * Debug Pipeline — Run the 10-stage pipeline in DEBUG MODE
   * 
   * Runs the full pipeline and captures ALL intermediate data at every stage.
   * This is a read-only diagnostic tool — it does NOT modify the database.
   * Returns the full diagnostic report for engineers to identify data loss.
   */
  debugPipeline: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const allowedRoles = ["claims_processor", "claims_manager", "executive", "insurer_admin", "admin", "platform_super_admin"];
      if (!allowedRoles.includes(ctx.user.role || "")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions for debug mode" });
      }

      const { runDebugPipeline } = await import("../pipeline-v2/debug-runner");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = isAdminRole(ctx.user.role) || ctx.user.role === "platform_super_admin" ? undefined : (ctx.user.tenantId || "default");
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

      // Resolve PDF URL and damage photos (same logic as triggerAiAssessment)
      let pdfUrl: string | null = null;
      let damagePhotos: string[] = [];

      if (claim.sourceDocumentId) {
        try {
          const [sourceDoc] = await db.select().from(ingestionDocuments)
            .where(eq(ingestionDocuments.id, claim.sourceDocumentId)).limit(1);
          if (sourceDoc && sourceDoc.s3Url) {
            pdfUrl = sourceDoc.s3Url;
          }
        } catch (docErr: any) {
          console.warn(`[Debug] Claim ${input.claimId}: Failed to look up source document: ${docErr.message}`);
        }
      }

      if (!pdfUrl) {
        damagePhotos = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];
      }

      // Load per-tenant cost rate overrides for debug run
      let debugTenantRates = null;
      try {
        if (claim.tenantId) debugTenantRates = await getTenantRates(claim.tenantId);
      } catch { /* non-fatal */ }
      const pipelineCtx = {
        claimId: input.claimId,
        tenantId: claim.tenantId ? Number(claim.tenantId) : null,
        assessmentId: 0,
        claim: claim as any,
        pdfUrl,
        damagePhotoUrls: damagePhotos,
        db,
        log: logger.makePipelineLog(String(input.claimId)),
        tenantRates: debugTenantRates,
      };

      const report = await runDebugPipeline(pipelineCtx);
      return report;
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
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      
      // Do NOT apply tenant filtering for quotes — claimId already uniquely identifies the claim.
      const quotes = await getQuotesByClaimId(input.claimId);
      const selectedQuote = quotes.find(q => q.id === input.selectedQuoteId);
      if (!selectedQuote) throw new TRPCError({ code: "NOT_FOUND", message: "Selected quote not found" });
      
      const approvedAmount = selectedQuote.quotedAmount || 0;

      // ── Fraud re-check at approval point (QA Finding 4.1) ──────────────────
      // Block technical approval if the current fraud risk level is 'critical',
      // regardless of how the claim was routed. This guards against fraud flags
      // added after initial routing (e.g., manual fraud escalation by risk_manager).
      if ((claim.fraudRiskLevel as string) === 'critical') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This claim has a critical fraud risk level and cannot be technically approved. Please refer it to the fraud investigation team before proceeding.',
        });
      }
      // ───────────────────────────────────────────────────────────────────────

      // Get active automation policy to determine approval threshold
      const { getActiveAutomationPolicy } = await import("../automation-policy-manager");
      const policy = await getActiveAutomationPolicy(tenantId);
      const requireManagerApprovalAbove = policy?.requireManagerApprovalAbove || FINANCIAL_APPROVAL_THRESHOLD_CENTS; // Default threshold from shared/const.ts
      
      // Determine if financial approval is required
      const requiresFinancialApproval = approvedAmount > requireManagerApprovalAbove;
      
      // Use WorkflowEngine for governance-compliant state transition
      const { transition, getCurrentState } = await import("../workflow-engine");
      const { statusToWorkflowState } = await import("../workflow-migration");
      
      const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);
      const toState = statusToWorkflowState("repair_assigned" as any);
      
      await transition({
        claimId: input.claimId,
        fromState: fromState as any,
        toState: toState as any,
        userId: ctx.user.id,
        userRole: (ctx.user.insurerRole || ctx.user.role) as any,
        decisionData: {
          approvedAmount,
          selectedPanelBeaterId: input.selectedQuoteId,
          comments: `Selected panel beater quote #${input.selectedQuoteId}. ${requiresFinancialApproval ? 'Requires financial approval (amount exceeds threshold).' : 'No financial approval required.'}`,
        },
      });
      
      // Update additional approval fields (not part of workflow state)
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(claims).set({
        technicallyApprovedBy: ctx.user.id,
        technicallyApprovedAt: new Date().toISOString(),
        approvedAmount,
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, input.claimId));
      
      // Create audit entry
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_approved",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim technically approved. Selected panel beater quote #${input.selectedQuoteId} for $${(approvedAmount / 100).toFixed(2)}. ${requiresFinancialApproval ? 'Requires financial approval (amount exceeds threshold).' : 'No financial approval required.'}`,
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
      
      console.log(`[Approval] Claim ${claim.claimNumber} technically approved by user ${ctx.user.id} for $${(approvedAmount / 100).toFixed(2)}`);

      // Feed into continuous learning loop (non-blocking)
      import("../continuous-learning").then(({ feedClaimToHistorical }) => {
        feedClaimToHistorical(input.claimId).then((result) => {
          if (result.success) {
            console.log(`[ContinuousLearning] ${result.message}`);
          } else {
            console.warn(`[ContinuousLearning] ${result.message}`);
          }
        }).catch((err) => console.error("[ContinuousLearning] Error:", err));
      });

      // Send notifications
      const { notifyClaimApproval, notifyPanelBeaterSelection } = await import('../workflow-notifications');
      const { getPanelBeaterById } = await import('../db');
      
      // Get panel beater details
      const panelBeater = await getPanelBeaterById(selectedQuote.panelBeaterId);
      
      // Notify claimant of approval
      await notifyClaimApproval({
        claimId: input.claimId,
        claimNumber: claim.claimNumber,
        claimantId: claim.claimantId ?? 0,
        approvedAmount,
        selectedPanelBeater: panelBeater?.businessName || 'Selected Panel Beater',
        tenantId: tenantId || 'default',
      });
      
      // Backfill repairer info into vehicle_damage_history (non-blocking)
      import('../vehicle-damage-history').then(({ backfillRepairer }) => {
        backfillRepairer({
          claimId: input.claimId,
          repairerId: selectedQuote.panelBeaterId,
          repairerName: panelBeater?.businessName || 'Selected Panel Beater',
          actualRepairCostCents: approvedAmount,
        }).catch((err: any) => console.warn('[DamageHistory] Repairer backfill failed:', err.message));
      }).catch(() => {});

      // Insert repair intelligence record (non-blocking)
      import('../repair-history').then(({ insertRepairHistory, updateRepairerAggregates }) => {
        // Parse damaged components from the claim's KINGA assessment
        let componentsRepaired: { name: string; zone?: string | null }[] = [];
        try {
          const aiAssessmentData = null; // assessment not available in this context
          if ((aiAssessmentData as any)?.damagedComponentsJson) {
            const parsed = JSON.parse((aiAssessmentData as any).damagedComponentsJson);
            if (Array.isArray(parsed)) componentsRepaired = parsed;
          }
        } catch { /* ignore parse errors */ }

        insertRepairHistory({
          repairerId: selectedQuote.panelBeaterId,
          vehicleId: claim.vehicleRegistryId ?? undefined,
          claimId: input.claimId,
          componentsRepaired,
          repairCostCents: approvedAmount,
          labourCostCents: selectedQuote.laborCost ?? 0,
          partsCostCents: selectedQuote.partsCost ?? 0,
          aiEstimatedCostCents: claim.estimatedCost ?? 0,
          approvalDate: new Date().toISOString().slice(0, 10),
          tenantId: tenantId || null,
        }).then(({ repairHistoryId, fraudSignals }) => {
          if (repairHistoryId) {
            // Update repairer performance aggregates
            updateRepairerAggregates(selectedQuote.panelBeaterId).catch(
              (err: any) => console.warn('[RepairHistory] Aggregate update failed:', err.message)
            );
            if (fraudSignals.length > 0) {
              console.warn(`[RepairHistory] Fraud signals on claim ${input.claimId}:`, fraudSignals);
            }
          }
        }).catch((err: any) => console.warn('[RepairHistory] Insert failed:', err.message));
      }).catch(() => {});

      // Notify panel beater of selection
      await notifyPanelBeaterSelection({
        claimId: input.claimId,
        panelBeaterId: selectedQuote.panelBeaterId,
        claimNumber: claim.claimNumber,
        claimantName: 'Claimant', // TODO: Get from user table
        approvedAmount,
        tenantId: tenantId || 'default',
      });
      // Phase 8: Plain-language in-app notification to claimant on approval
      if (claim.claimantId) {
        try {
          const { createNotification: _cn8 } = await import('../db');
          await _cn8({
            userId: claim.claimantId,
            title: 'Good News — Your Claim Has Been Approved',
            message: `Your claim ${claim.claimNumber} has been approved for repair. ${panelBeater?.businessName || 'Your selected panel beater'} will contact you to schedule the repair. No action is required from you right now.`,
            type: 'status_changed',
            claimId: input.claimId,
            entityType: 'claim',
            entityId: input.claimId,
            actionUrl: `/claimant/claims/${input.claimId}`,
            priority: 'high',
          });
        } catch (_e8) { /* non-fatal */ }
      }

      return { 
        success: true, 
        requiresFinancialApproval,
        approvedAmount,
        threshold: requireManagerApprovalAbove
      };
    }),
  
  /**
   * Send Back Claim
   *
   * Returns a claim to a previous workflow stage for further review or correction.
   * Claims managers can send back from:
   *   - technical_approval → internal_review (back to risk manager / assessor)
   *   - financial_decision  → technical_approval (back to risk manager)
   *
   * The target stage is determined automatically from the claim's current workflow state.
   * A mandatory comment is recorded in the audit trail.
   *
   * @requires Authentication — claims_manager or insurer_admin role
   * @param claimId  - The numeric ID of the claim to send back
   * @param comments - Mandatory reason for sending back (recorded in audit trail)
   * @param targetRole - Optional hint: 'risk_manager' | 'claims_processor' (informational only)
   * @returns { success, fromState, toState }
   */
  sendBackClaim: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      comments: z.string().min(1, "A reason for sending back the claim is required."),
      targetRole: z.enum(["risk_manager", "claims_processor"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const userRole = (ctx.user as any).insurerRole || ctx.user.role;
      const allowedRoles = ["claims_manager", "insurer_admin", "executive"];
      if (!allowedRoles.includes(userRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers can send back claims." });
      }
      const tenantId = (ctx.user as any).tenantId || "default";
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

      const { transition } = await import("../workflow-engine");
      const { statusToWorkflowState } = await import("../workflow-migration");
      const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);

      // Determine the correct target state based on current workflow position.
      // Validates that the transition is permitted by WORKFLOW_TRANSITIONS.
      const SEND_BACK_TRANSITIONS: Record<string, string> = {
        technical_approval: "internal_review",
        financial_decision: "technical_approval",
      };
      const toState = SEND_BACK_TRANSITIONS[fromState];
      if (!toState) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot send back a claim in state '${fromState}'. Valid states for send-back: ${Object.keys(SEND_BACK_TRANSITIONS).join(", ")}.`,
        });
      }
      // Validate targetRole is consistent with the destination state
      if (input.targetRole) {
        const roleStateMap: Record<string, string[]> = {
          risk_manager: ["internal_review", "technical_approval"],
          claims_processor: ["internal_review", "submitted"],
        };
        const validStates = roleStateMap[input.targetRole] ?? [];
        if (!validStates.includes(toState)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `targetRole '${input.targetRole}' is not consistent with destination state '${toState}'. Expected one of: ${validStates.join(", ")}.`,
          });
        }
      }

      await transition({
        claimId: input.claimId,
        fromState: fromState as any,
        toState: toState as any,
        userId: ctx.user.id,
        userRole: userRole as any,
        decisionData: {
          comments: `SENT BACK BY CLAIMS MANAGER: ${input.comments}${input.targetRole ? ` (Target: ${input.targetRole})` : ""}`,
        },
      });

      console.log(`[SendBack] Claim ${claim.claimNumber} sent back from ${fromState} → ${toState} by user ${ctx.user.id}`);
      return { success: true, fromState, toState };
    }),

  /**
   * Close for Processing
   *
   * Governs the closure of a claim from payment_authorized/repair_assigned state to closed.
   * This is a distinct governance action from technical approval.
   * Creates a claim_closed audit entry (not claim_approved).
   *
   * @requires claims_manager, executive, or insurer_admin role
   */
  closeForProcessing: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      closureReason: z.string().min(10, "Closure reason must be at least 10 characters."),
      finalApprovedAmount: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const userRole = (ctx.user as any).insurerRole || ctx.user.role;
      const allowedRoles = ["claims_manager", "insurer_admin", "executive"];
      if (!allowedRoles.includes(userRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers can close claims for processing." });
      }
      const tenantId = (ctx.user as any).tenantId || "default";
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      const { transition } = await import("../workflow-engine");
      const { statusToWorkflowState } = await import("../workflow-migration");
      const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);
      const validFromStates = ["payment_authorized", "repair_assigned", "technical_approval", "financial_decision"];
      if (!validFromStates.includes(fromState)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot close a claim in state '${fromState}'. Claim must be in payment_authorized or repair_assigned state.`,
        });
      }
      await transition({
        claimId: input.claimId,
        fromState: fromState as any,
        toState: "closed" as any,
        userId: ctx.user.id,
        userRole: userRole as any,
        decisionData: {
          comments: `CLOSED FOR PROCESSING: ${input.closureReason}`,
          ...(input.finalApprovedAmount ? { approvedAmount: input.finalApprovedAmount } : {}),
        },
      });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const updateData: any = { updatedAt: new Date() };
      if (input.finalApprovedAmount) updateData.totalClaimAmount = input.finalApprovedAmount;
      await db.update(claims).set(updateData).where(eq(claims.id, input.claimId));
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_closed",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim closed for processing by ${userRole}. Reason: ${input.closureReason}${input.finalApprovedAmount ? `. Final approved amount: $${(input.finalApprovedAmount / 100).toFixed(2)}` : ""}.`,
      });
      console.log(`[CloseForProcessing] Claim ${claim.claimNumber} closed by user ${ctx.user.id} (${userRole}) from state ${fromState}`);
      return { success: true, claimId: input.claimId, newState: "closed" };
    }),

  /**
   * Escalate Claim
   *
   * Escalates a claim to disputed or manual_review state.
   * This is a distinct governance action from send-back.
   * Creates a claim_escalated audit entry and notifies the Risk Manager.
   *
   * @requires claims_manager, executive, or insurer_admin role
   */
  escalateClaim: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      escalationReason: z.enum([
        "fraud_concern",
        "high_value_dispute",
        "policy_interpretation",
        "third_party_dispute",
        "legal_threat",
        "other",
      ]),
      escalationNotes: z.string().min(10, "Escalation notes must be at least 10 characters."),
      targetState: z.enum(["disputed", "manual_review"]).default("manual_review"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const userRole = (ctx.user as any).insurerRole || ctx.user.role;
      const allowedRoles = ["claims_manager", "insurer_admin", "executive"];
      if (!allowedRoles.includes(userRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers can escalate claims." });
      }
      const tenantId = (ctx.user as any).tenantId || "default";
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      const { transition } = await import("../workflow-engine");
      const { statusToWorkflowState } = await import("../workflow-migration");
      const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);
      const terminalStates = ["closed", "rejected", "archived"];
      if (terminalStates.includes(fromState)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot escalate a claim in terminal state '${fromState}'.`,
        });
      }
      await transition({
        claimId: input.claimId,
        fromState: fromState as any,
        toState: input.targetState as any,
        userId: ctx.user.id,
        userRole: userRole as any,
        decisionData: {
          comments: `ESCALATED: ${input.escalationReason.replace(/_/g, " ").toUpperCase()} — ${input.escalationNotes}`,
        },
      });
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_escalated",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim escalated to ${input.targetState} by ${userRole}. Reason: ${input.escalationReason}. Notes: ${input.escalationNotes}. Previous state: ${fromState}.`,
      });
      const { notifyOwner } = await import("../_core/notification");
      await notifyOwner({
        title: `Claim Escalated: ${claim.claimNumber}`,
        content: `Claim ${claim.claimNumber} has been escalated to ${input.targetState} by a Claims Manager.\nReason: ${input.escalationReason.replace(/_/g, " ")}\nNotes: ${input.escalationNotes}`,
      }).catch(() => { /* non-blocking */ });
      console.log(`[Escalate] Claim ${claim.claimNumber} escalated from ${fromState} → ${input.targetState} by user ${ctx.user.id}`);
      return { success: true, claimId: input.claimId, fromState, newState: input.targetState };
    }),

  /**
   * Reopen Claim
   *
   * Transitions a closed claim to disputed state when new information emerges
   * or the claimant raises a formal dispute. Uses the workflow engine transition
   * closed → disputed which is already defined in WORKFLOW_TRANSITIONS.
   *
   * @requires claims_manager, executive, or insurer_admin role
   */
  reopenClaim: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      reason: z.string().min(10, "A reason for reopening the claim is required (min 10 characters)."),
      disputeType: z.enum(["new_evidence", "claimant_dispute", "insurer_error", "legal_requirement", "other"]).default("claimant_dispute"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const userRole = (ctx.user as any).insurerRole || ctx.user.role;
      const allowedRoles = ["claims_manager", "insurer_admin", "executive"];
      if (!allowedRoles.includes(userRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers can reopen claims." });
      }
      const tenantId = (ctx.user as any).tenantId || "default";
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      const { transition } = await import("../workflow-engine");
      const { statusToWorkflowState } = await import("../workflow-migration");
      const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);
      if (fromState !== "closed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only closed claims can be reopened. This claim is in state '${fromState}'.`,
        });
      }
      await transition({
        claimId: input.claimId,
        fromState: "closed" as any,
        toState: "disputed" as any,
        userId: ctx.user.id,
        userRole: userRole as any,
        decisionData: {
          comments: `REOPENED: ${input.disputeType.replace(/_/g, " ").toUpperCase()} — ${input.reason}`,
        },
      });
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_reopened",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim reopened from closed to disputed by ${userRole}. Dispute type: ${input.disputeType}. Reason: ${input.reason}.`,
      });
      console.log(`[Reopen] Claim ${claim.claimNumber} reopened from closed → disputed by user ${ctx.user.id}`);
      return { success: true, claimId: input.claimId, fromState: "closed", newState: "disputed" };
    }),

  // Financial approval for high-value claims
  /**
   * Export Claim PDF
   *
   * Generates a comprehensive PDF report for a single claim, including the
   * AI Quote Optimisation Summary section (risk score, recommended repairer,
   * per-quote cost deviation, flags, AI narrative, and insurer decision).
   * Uploads the result to S3 and returns a download URL.
   *
   * @requires Authentication
   * @param claimId - The numeric ID of the claim to export
   * @returns { success, pdfUrl, fileName }
   */
  exportClaimPDF,

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
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
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
        financiallyApprovedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, input.claimId));
      
      // Create audit entry
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "financial_approval",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim financially approved for $${((claim.approvedAmount || 0) / 100).toFixed(2)}`,
      });
      
      console.log(`[Approval] Claim ${claim.claimNumber} financially approved by user ${ctx.user.id}`);

      // Feed into continuous learning loop (non-blocking)
      import("../continuous-learning").then(({ feedClaimToHistorical }) => {
        feedClaimToHistorical(input.claimId).then((result) => {
          if (result.success) {
            console.log(`[ContinuousLearning] Financial approval fed: ${result.message}`);
          }
        }).catch((err) => console.error("[ContinuousLearning] Error:", err));
      });

      return { success: true };
    }),

  /**
   * Resolve the 3 claimant panel beater choices to company names + insurer relationship flags.
   * Returns an ordered list of { rank, profileId, companyName, preferred, slaSigned }.
   * Also returns the assigned panel beater's profileId so the UI can detect a mismatch.
   */
  getPanelBeaterChoices: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || ctx.user.tenantId || "default");
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { marketplaceProfiles, insurerMarketplaceRelationships } = await import("../../drizzle/schema");

      const choiceIds = [
        claim.panelBeaterChoice1,
        claim.panelBeaterChoice2,
        claim.panelBeaterChoice3,
      ].filter(Boolean) as string[];

      if (choiceIds.length === 0) {
        return { choices: [], assignedProfileId: null };
      }

      // Fetch marketplace profiles for the three choices
      const profiles = await db
        .select({
          id: marketplaceProfiles.id,
          companyName: marketplaceProfiles.companyName,
        })
        .from(marketplaceProfiles)
        .where(inArray(marketplaceProfiles.id, choiceIds));

      // Fetch insurer relationship flags (preferred + slaSigned) for these profiles
      // Use the insurer tenant from context if available, otherwise skip flags
      const insurerTenantId = ctx.user.tenantId || ctx.user.tenantId;
      let relationshipMap: Record<string, { preferred: boolean; slaSigned: boolean }> = {};

      if (insurerTenantId) {
        const relationships = await db
          .select({
            marketplaceProfileId: insurerMarketplaceRelationships.marketplaceProfileId,
            preferred: insurerMarketplaceRelationships.preferred,
            slaSigned: insurerMarketplaceRelationships.slaSigned,
          })
          .from(insurerMarketplaceRelationships)
          .where(
            and(
              eq(insurerMarketplaceRelationships.insurerTenantId, insurerTenantId),
              inArray(insurerMarketplaceRelationships.marketplaceProfileId, choiceIds)
            )
          );

        for (const rel of relationships) {
          relationshipMap[rel.marketplaceProfileId] = {
            preferred: rel.preferred === 1,
            slaSigned: rel.slaSigned === 1,
          };
        }
      }

      const profileMap = Object.fromEntries(profiles.map(p => [p.id, p.companyName]));

      const choices = [
        claim.panelBeaterChoice1,
        claim.panelBeaterChoice2,
        claim.panelBeaterChoice3,
      ]
        .map((profileId, index) => {
          if (!profileId) return null;
          const flags = relationshipMap[profileId] ?? { preferred: false, slaSigned: false };
          return {
            rank: index + 1,
            profileId,
            companyName: profileMap[profileId] ?? "Unknown Repairer",
            preferred: flags.preferred,
            slaSigned: flags.slaSigned,
          };
        })
        .filter(Boolean) as Array<{ rank: number; profileId: string; companyName: string; preferred: boolean; slaSigned: boolean }>;

      // Resolve assigned panel beater's marketplace profile ID (if any)
      // assignedPanelBeaterId is an integer FK to marketplace_profiles.id (which is a varchar UUID)
      // We need to look it up by the integer PK if the column is actually int
      let assignedProfileId: string | null = null;
      if (claim.assignedPanelBeaterId) {
        const assigned = await db
          .select({ id: marketplaceProfiles.id })
          .from(marketplaceProfiles)
          .where(eq(marketplaceProfiles.id, String(claim.assignedPanelBeaterId)))
          .limit(1);
        assignedProfileId = assigned[0]?.id ?? null;
      }

      return { choices, assignedProfileId };
    }),

  /**
   * Update Claim Currency
   *
   * Allows a claims manager or processor to set the currency for a specific claim
   * based on the policy insured. Also propagates the currency to all related
   * AI assessments and panel beater quotes for that claim.
   *
   * Supported codes: USD, ZWG (ZiG), ZWL, ZAR, ZMW, BWP, NAD, MZN, MWK, TZS, KES, UGX, GBP, EUR (ISO 4217)
   *
   * @requires Authentication (claims_manager, claims_processor, insurer, or admin role)
   * @param claimId - ID of the claim to update
   * @param currencyCode - ISO 4217 currency code (e.g. "USD", "ZIG", "ZAR")
   * @returns { success, currencyCode }
   */
  updateCurrency: protectedProcedure
    .input(z.object({
      claimId: z.number().int().positive(),
      currencyCode: z.enum(["USD", "ZWG", "ZWL", "ZAR", "ZMW", "BWP", "NAD", "MZN", "MWK", "TZS", "KES", "UGX", "GBP", "EUR"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const allowedRoles = ["claims_manager", "claims_processor", "insurer", "admin"];
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers and processors can update claim currency" });
      }
      const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || ctx.user.tenantId || "default");
      // Verify claim exists and belongs to tenant
      const claim = await getClaimById(input.claimId, tenantId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { aiAssessments: aiAssessmentsTable, panelBeaterQuotes: panelBeaterQuotesTable } = await import("../../drizzle/schema");

      // 1. Update the claim itself
      await db
        .update(claims)
        .set({ currencyCode: input.currencyCode })
        .where(eq(claims.id, input.claimId));

      // 2. Propagate to all AI assessments for this claim
      await db
        .update(aiAssessmentsTable)
        .set({ currencyCode: input.currencyCode })
        .where(eq(aiAssessmentsTable.claimId, input.claimId));

      // 3. Propagate to all panel beater quotes for this claim
      await db
        .update(panelBeaterQuotesTable)
        .set({ currencyCode: input.currencyCode })
        .where(eq(panelBeaterQuotesTable.claimId, input.claimId));

      // 4. Audit trail
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_currency_updated",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim currency updated to ${input.currencyCode} by ${ctx.user.role}`,
      });

      return { success: true, currencyCode: input.currencyCode };
    }),

  /**
   * Get Currency Change History
   *
   * Returns all audit trail entries for currency changes on a specific claim,
   * ordered newest-first. Each entry includes the actor's name, role, the new
   * currency code, and the timestamp of the change.
   *
   * @param claimId - ID of the claim
   * @returns Array of currency change audit entries
   */
  getCurrencyHistory: protectedProcedure
    .input(z.object({
      claimId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const { auditTrail: auditTrailTable, users: usersTable } = await import('../../drizzle/schema');
      const rows = await db
        .select({
          id: auditTrailTable.id,
          changeDescription: auditTrailTable.changeDescription,
          createdAt: auditTrailTable.createdAt,
          userName: usersTable.name,
          userRole: usersTable.role,
          userInsurer: usersTable.insurerRole,
        })
        .from(auditTrailTable)
        .leftJoin(usersTable, eq(usersTable.id, auditTrailTable.userId))
        .where(
          and(
            eq(auditTrailTable.claimId, input.claimId),
            eq(auditTrailTable.action, 'claim_currency_updated'),
          )
        )
        .orderBy(desc(auditTrailTable.createdAt))
        .limit(50);
      return rows.map((r) => ({
        id: r.id,
        description: r.changeDescription ?? '',
        createdAt: r.createdAt,
        actorName: r.userName ?? 'Unknown',
        actorRole: r.userInsurer ?? r.userRole ?? 'unknown',
      }));
    }),

  /**
   * Accept a failed physics constraint with an adjuster explanation.
   * Marks the constraint as "accepted with explanation" so it no longer
   * triggers automatic fraud escalation. The override is persisted in
   * constraint_overrides_json on the ai_assessments record.
   *
   * Only assessors, insurers, and admins may accept constraints.
   */
  acceptConstraint: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      constraintId: z.string().min(1),
      explanation: z.string().min(5, 'Explanation must be at least 5 characters'),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const allowedRoles = ['assessor', 'insurer', 'admin'];
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only assessors, insurers, and admins may accept constraints' });
      }
      // R-GH-16: scope to caller's tenant so cross-tenant reads are blocked
      const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || undefined);
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) throw new TRPCError({ code: 'NOT_FOUND', message: 'No KINGA assessment found for this claim' });

      const existing: Record<string, any> = assessment.constraintOverridesJson
        ? JSON.parse(assessment.constraintOverridesJson)
        : {};

      existing[input.constraintId] = {
        accepted: true,
        explanation: input.explanation,
        overriddenBy: ctx.user.id,
        overriddenByName: ctx.user.name ?? ctx.user.email ?? 'Unknown',
        overriddenAt: new Date().toISOString(),
      };

      const _db = await getDb();
      if (!_db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { aiAssessments: _aiAssessments } = await import("../../drizzle/schema");
      await _db.update(_aiAssessments)
        .set({ constraintOverridesJson: JSON.stringify(existing) })
        .where(eq(_aiAssessments.id, assessment.id));

      return { success: true, constraintId: input.constraintId, overrides: existing };
    }),

  /**
   * Get all constraint overrides for a claim's KINGA assessment.
   * Returns the full override map keyed by constraintId.
   */
  getConstraintOverrides: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      // R-GH-16: scope to caller's tenant so cross-tenant reads are blocked
      const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || undefined);
      const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
      if (!assessment) return {};
      return assessment.constraintOverridesJson
        ? JSON.parse(assessment.constraintOverridesJson)
        : {};
    }),

  /**
   * Save (upsert) an adjuster sign-off decision on an AI report.
   */
  saveAdjusterSignOff: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      adjusterName: z.string().min(1),
      decision: z.enum(["APPROVE", "REJECT", "ESCALATE", "DEFER"]),
      notes: z.string().optional(),
      aiDecision: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const { adjusterSignOffs } = await import('../../drizzle/schema');
      const now = Date.now();
      const _adjDb = await getDb();
      if (!_adjDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await _adjDb
        .select({ id: adjusterSignOffs.id })
        .from(adjusterSignOffs)
        .where(eq(adjusterSignOffs.claimId, input.claimId))
        .limit(1);
      if (existing.length > 0) {
        await _adjDb
          .update(adjusterSignOffs)
          .set({
            adjusterName: input.adjusterName,
            adjusterUserId: ctx.user.id,
            decision: input.decision,
            notes: input.notes ?? null,
            aiDecision: input.aiDecision ?? null,
            updatedAt: now,
          })
          .where(eq(adjusterSignOffs.claimId, input.claimId));
      } else {
        await _adjDb
          .insert(adjusterSignOffs)
          .values({
            claimId: input.claimId,
            adjusterUserId: ctx.user.id,
            adjusterName: input.adjusterName,
            decision: input.decision,
            notes: input.notes ?? null,
            aiDecision: input.aiDecision ?? null,
            signedAt: now,
            updatedAt: now,
          });
      }
      return { success: true, signedAt: now };
    }),

  /**
   * Get the adjuster sign-off for a claim (if any).
   */
  getAdjusterSignOff: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const { adjusterSignOffs } = await import('../../drizzle/schema');
      const _adjDb = await getDb();
      if (!_adjDb) return null;
      const rows = await _adjDb
        .select()
        .from(adjusterSignOffs)
        .where(eq(adjusterSignOffs.claimId, input.claimId))
        .limit(1);
      return rows[0] ?? null;
    }),

  /**
   * Claimant accepts a settlement offer.
   * Transitions the claim from payment_authorized → closed.
   * Only the claimant who owns the claim may call this.
   */
  acceptSettlement: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      assertRestrictedAgencyAssistedCapability(ctx.user, "settlement_instruction");
      const _settleDb = await getDb();
      if (!_settleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const claim = await _settleDb
        .select()
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .limit(1)
        .then(r => r[0]);
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      // Only the claimant who owns the claim may accept
      if (claim.claimantId !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the claimant may accept a settlement' });
      }
      if (claim.workflowState !== 'payment_authorized') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Settlement can only be accepted when claim is in payment_authorized state (current: ${claim.workflowState})` });
      }
      await _settleDb
        .update(claims)
        .set({ workflowState: 'closed' as any, status: 'completed', updatedAt: new Date().toISOString() })
        .where(eq(claims.id, input.claimId));
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: 'settlement_accepted',
        entityType: 'claim',
        entityId: input.claimId,
        changeDescription: `Settlement accepted by claimant. Claim closed.`,
      });
      // OAT-GAP-01 fix: auto-populate vehicle_damage_history on claim closure
      // so that vehicle risk intelligence reflects completed claims.
      try {
        const { vehicleDamageHistory: vdhTable, vehicleRegistry: vrTable } = await import('../../drizzle/schema');
        const aiAssmt = await _settleDb
          .select({
            estimatedCost: aiAssessments.estimatedCost,
            fraudScore: aiAssessments.fraudScore,
            structuralDamageSeverity: aiAssessments.structuralDamageSeverity,
            damagedComponentsJson: aiAssessments.damagedComponentsJson,
            accidentType: aiAssessments.accidentType,
            airbagDeployment: aiAssessments.airbagDeployment,
          })
          .from(aiAssessments)
          .where(eq(aiAssessments.claimId, input.claimId))
          .orderBy(desc(aiAssessments.createdAt))
          .limit(1)
          .then(r => r[0]);
        const [vrRow] = await _settleDb
          .select({ id: vrTable.id })
          .from(vrTable)
          .where(eq(vrTable.registrationNumber, (claim.vehicleRegistration ?? '').toUpperCase().replace(/\s/g, '')))
          .limit(1);
        const vehicleId = vrRow?.id ?? 1;
        const sevMap: Record<string, 'minor'|'moderate'|'severe'|'total_loss'|'unknown'> = { none: 'minor', minor: 'minor', moderate: 'moderate', severe: 'severe' };
        const severity = sevMap[aiAssmt?.structuralDamageSeverity ?? ''] ?? 'unknown';
        await _settleDb.insert(vdhTable).values({
          vehicleId,
          claimId: input.claimId,
          vehicleRegistration: claim.vehicleRegistration ?? null,
          damageZone: 'unknown',
          damagedComponentsJson: aiAssmt?.damagedComponentsJson ?? null,
          impactDirection: aiAssmt?.accidentType ?? null,
          severity,
          hasStructuralDamage: (aiAssmt?.structuralDamageSeverity && aiAssmt.structuralDamageSeverity !== 'none') ? 1 : 0,
          airbagsDeployed: aiAssmt?.airbagDeployment ? 1 : 0,
          repairCostEstimateCents: aiAssmt?.estimatedCost ? Math.round(Number(aiAssmt.estimatedCost) * 100) : 0,
          fraudRiskScore: aiAssmt?.fraudScore ? Math.round(Number(aiAssmt.fraudScore)) : 0,
          isRepeatZone: 0,
          tenantId: claim.tenantId ?? null,
        });
      } catch (vdhErr) {
        // Non-blocking — log but do not fail the settlement
        console.error('[acceptSettlement] vehicle_damage_history insert failed:', vdhErr);
      }
      // Phase 8: Plain-language in-app notification to claimant on settlement acceptance
      try {
        const { createNotification: _cn10 } = await import('../db');
        const settlementAmt = claim.finalApprovedAmount || claim.approvedAmount;
        const amtStr = settlementAmt ? `$${Number(settlementAmt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'the agreed amount';
        await _cn10({
          userId: ctx.user.id,
          title: 'Your Claim Has Been Settled',
          message: `Your claim ${claim.claimNumber} has been settled. The settlement amount of ${amtStr} has been processed. Your claim is now closed. Thank you for choosing KINGA.`,
          type: 'status_changed',
          claimId: input.claimId,
          entityType: 'claim',
          entityId: input.claimId,
          actionUrl: `/claimant/claims/${input.claimId}`,
          priority: 'high',
        });
      } catch (_e10) { /* non-fatal */ }
      return { success: true, newState: 'closed' };
    }),

  /**
   * Claimant initiates a formal dispute on a closed or payment_authorized claim.
   * Transitions the claim to disputed state.
   * Only the claimant who owns the claim may call this.
   */
  initiateDispute: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      reason: z.string().min(10, 'Please provide a reason of at least 10 characters'),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      assertRestrictedAgencyAssistedCapability(ctx.user, "dispute_instruction");
      const _disputeDb = await getDb();
      if (!_disputeDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const claim = await _disputeDb
        .select()
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .limit(1)
        .then(r => r[0]);
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      if (claim.claimantId !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the claimant may initiate a dispute' });
      }
      const allowedFromStates = ['payment_authorized', 'closed', 'financial_decision'];
      if (!allowedFromStates.includes(claim.workflowState ?? '')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Dispute can only be initiated from payment_authorized, financial_decision, or closed state (current: ${claim.workflowState})` });
      }
      await _disputeDb
        .update(claims)
        .set({ workflowState: 'disputed' as any, status: 'under_review' as any, updatedAt: new Date().toISOString() })
        .where(eq(claims.id, input.claimId));
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: 'dispute_initiated',
        entityType: 'claim',
        entityId: input.claimId,
        changeDescription: `Dispute initiated by claimant. Reason: ${input.reason}`,
      });
      // Notify the platform owner (Claims Manager receives push signal)
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `Dispute Initiated \u2014 Claim ${claim.claimNumber}`,
          content: `Claimant has disputed claim ${claim.claimNumber} (${claim.vehicleRegistration ?? 'N/A'}). Reason: ${input.reason}`,
        });
      } catch {
        // Non-blocking \u2014 notification failure must not prevent dispute from being recorded
      }
      return { success: true, newState: 'disputed' };
    }),
  /**
   * Returns the most recent dispute_initiated audit entry for a claim.
   * Used by Claims Manager to read the claimant's stated dispute reason
   * without leaving the portal.
   */
  getDisputeInfo: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const { auditTrail } = await import('../../drizzle/schema');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const entry = await db
        .select({
          id: auditTrail.id,
          changeDescription: auditTrail.changeDescription,
          createdAt: auditTrail.createdAt,
        })
        .from(auditTrail)
        .where(
          and(
            eq(auditTrail.claimId, input.claimId),
            eq(auditTrail.action, 'dispute_initiated'),
          )
        )
        .orderBy(desc(auditTrail.createdAt))
        .limit(1)
        .then(r => r[0] ?? null);
      return entry;
    }),

  /**
   * SR-C03: Authorise payment — transitions financial_decision → payment_authorized.
   * Called by Internal Assessor / Finance Officer after financial decision is made.
   */
  authorizePayment: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      settlementAmountCents: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      assertRestrictedAgencyAssistedCapability(ctx.user, "payment_authority");
      const _authDb = await getDb();
      if (!_authDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const claim = await _authDb.select().from(claims).where(eq(claims.id, input.claimId)).limit(1).then(r => r[0]);
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      if (claim.workflowState !== 'financial_decision') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Payment can only be authorised from financial_decision state (current: ${claim.workflowState})` });
      }
      const updateData: Record<string, unknown> = {
        workflowState: 'payment_authorized',
        status: 'payment_authorized',
        updatedAt: new Date().toISOString(),
      };
      if (input.settlementAmountCents) {
        updateData.finalApprovedAmount = input.settlementAmountCents;
      }
      await _authDb.update(claims).set(updateData as any).where(eq(claims.id, input.claimId));
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: 'payment_authorized',
        entityType: 'claim',
        entityId: input.claimId,
        changeDescription: `Payment authorised by ${ctx.user.name || ctx.user.role}. Settlement offer ready for claimant.${input.notes ? ` Notes: ${input.notes}` : ''}`,
      });
      // SR-H04: Notify claimant that their settlement offer is ready
      if (claim.claimantId) {
        try {
          const { createNotification } = await import('../db');
          await createNotification({
            userId: claim.claimantId,
            title: 'Settlement Offer Ready',
            message: `Your claim ${claim.claimNumber || `#${input.claimId}`} has been approved. A settlement offer is ready for your review. Please log in to accept or dispute the offer.`,
            type: 'status_changed',
            claimId: input.claimId,
            entityType: 'claim',
            entityId: input.claimId,
            actionUrl: `/claims/${input.claimId}`,
            priority: 'high',
          });
        } catch (_notifErr) {
          // Non-fatal — notification failure must not block payment authorisation
        }
      }
      return { success: true, newState: 'payment_authorized' };
    }),

  /**
   * SR-C02: Reject claim — transitions to rejected workflowState.
   * Called by Claims Manager when a claim is invalid, fraudulent, or outside coverage.
   */
  rejectClaim: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      rejectionReason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
      rejectionCategory: z.enum(['fraud', 'outside_coverage', 'invalid_claim', 'duplicate', 'other']).default('other'),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const _rejectDb = await getDb();
      if (!_rejectDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const claim = await _rejectDb.select().from(claims).where(eq(claims.id, input.claimId)).limit(1).then(r => r[0]);
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      const nonRejectableStates = ['closed', 'completed', 'rejected'];
      if (nonRejectableStates.includes(claim.workflowState as string)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot reject a claim in ${claim.workflowState} state` });
      }
      // SR-H02: Write rejection audit trail to claims table
      const now = new Date().toISOString();
      await _rejectDb.update(claims).set({
        workflowState: 'rejected' as any,
        status: 'rejected',
        updatedAt: now,
        rejectionReason: input.rejectionReason,
        rejectionCategory: input.rejectionCategory,
        rejectedBy: ctx.user.id,
        rejectedAt: now,
      } as any).where(eq(claims.id, input.claimId));
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: 'claim_rejected',
        entityType: 'claim',
        entityId: input.claimId,
        changeDescription: `Claim rejected by ${ctx.user.name || ctx.user.role}. Category: ${input.rejectionCategory}. Reason: ${input.rejectionReason}`,
      });
      // SR-H04: Notify claimant that their claim has been rejected
      if (claim.claimantId) {
        try {
          const { createNotification } = await import('../db');
          await createNotification({
            userId: claim.claimantId,
            title: 'Claim Decision: Rejected',
            message: `Your claim ${claim.claimNumber || `#${input.claimId}`} has been rejected. Reason: ${input.rejectionReason}. If you believe this is incorrect, please contact your insurer or log in to dispute the decision.`,
            type: 'status_changed',
            claimId: input.claimId,
            entityType: 'claim',
            entityId: input.claimId,
            actionUrl: `/claims/${input.claimId}`,
            priority: 'high',
          });
        } catch (_notifErr) {
          // Non-fatal — notification failure must not block rejection
        }
      }
      return { success: true, newState: 'rejected', rejectionReason: input.rejectionReason };
    }),

  /**
   * SR-H03: Insurer Admin override — allows insurer_admin to override a claim decision.
   * Can force a claim to payment_authorized (approve) or rejected (reject) from any non-terminal state.
   * Requires insurer_admin or admin role.
   */
  insurerOverride: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      overrideDecision: z.enum(['approve', 'reject']),
      overrideReason: z.string().min(10, 'Override reason must be at least 10 characters'),
      settlementAmountCents: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const allowedRoles = ['insurer_admin', 'admin'];
      if (!allowedRoles.includes(ctx.user.subRole || '') && ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only Insurer Administrators can override claim decisions' });
      }
      const _overrideDb = await getDb();
      if (!_overrideDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const claim = await _overrideDb.select().from(claims).where(eq(claims.id, input.claimId)).limit(1).then(r => r[0]);
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      const terminalStates = ['closed', 'completed'];
      if (terminalStates.includes(claim.workflowState as string)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot override a claim in terminal state: ${claim.workflowState}` });
      }
      const newState = input.overrideDecision === 'approve' ? 'payment_authorized' : 'rejected';
      const newStatus = input.overrideDecision === 'approve' ? 'payment_authorized' : 'rejected';
      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = {
        workflowState: newState,
        status: newStatus,
        updatedAt: now,
      };
      if (input.overrideDecision === 'reject') {
        updateData.rejectionReason = input.overrideReason;
        updateData.rejectionCategory = 'other';
        updateData.rejectedBy = ctx.user.id;
        updateData.rejectedAt = now;
      }
      if (input.overrideDecision === 'approve' && input.settlementAmountCents) {
        updateData.finalApprovedAmount = input.settlementAmountCents;
      }
      await _overrideDb.update(claims).set(updateData as any).where(eq(claims.id, input.claimId));
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: input.overrideDecision === 'approve' ? 'payment_authorized' : 'claim_rejected',
        entityType: 'claim',
        entityId: input.claimId,
        changeDescription: `INSURER OVERRIDE by ${ctx.user.name || ctx.user.role}: ${input.overrideDecision.toUpperCase()}. Reason: ${input.overrideReason}`,
      });
      // SR-H04: Notify claimant of override decision
      if (claim.claimantId) {
        try {
          const { createNotification } = await import('../db');
          await createNotification({
            userId: claim.claimantId,
            title: input.overrideDecision === 'approve' ? 'Claim Approved — Settlement Ready' : 'Claim Decision: Rejected',
            message: input.overrideDecision === 'approve'
              ? `Your claim ${claim.claimNumber || `#${input.claimId}`} has been approved by your insurer. A settlement offer is ready for your review.`
              : `Your claim ${claim.claimNumber || `#${input.claimId}`} has been rejected by your insurer. Reason: ${input.overrideReason}`,
            type: 'status_changed',
            claimId: input.claimId,
            entityType: 'claim',
            entityId: input.claimId,
            actionUrl: `/claims/${input.claimId}`,
            priority: 'high',
          });
        } catch (_notifErr) { /* non-fatal */ }
      }
      return { success: true, newState, overrideDecision: input.overrideDecision };
    }),
});
