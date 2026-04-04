// @ts-nocheck
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
import { publicProcedure, protectedProcedure, router, insurerDomainProcedure } from "./_core/trpc";
import { tenantRouter } from "./routers/tenant";
import { analyticsRouter } from "./routers/analytics";
import { simulationRouter } from "./routers/simulation";
import { workflowAuditRouter } from "./routers/workflow-audit";
import { workflowAnalyticsRouter } from "./routers/workflow-analytics";
import { complianceRouter } from "./routers/compliance";
import { claimReplayRouter } from "./routers/claim-replay";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { parsePhysicsAnalysis } from "./types/physics-validation";
import { claims, insuranceQuotes, insuranceProducts, insuranceCarriers, insurancePolicies, fleetVehicles, fleetDrivers, insurerTenants, ingestionDocuments } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { 
  getAllApprovedPanelBeaters,
  createClaim,
  getClaimsByClaimant,
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
import { processExternalAssessment } from "./assessment-processor";
import { exportAssessmentPDF } from "./pdf-export";
import { exportClaimPDF } from "./claim-pdf-export";
import { extractClaimFormData } from "./claim-form-extractor";
import { assessorOnboardingRouter } from "./routers/assessor-onboarding";
import { documentIngestionRouter } from "./routers/document-ingestion";
import { historicalClaimsRouter } from "./routers/historical-claims";
import { automationPoliciesRouter } from "./routers/automation-policies";
import { claimCompletionRouter } from "./routers/claim-completion";
import { mlRouter } from "./routers/ml";
import { learningRouter } from "./routers/learning";
import { decisionRouter } from "./routers/decision";
import { approvalRouter } from "./routers/approval";
import { truthSynthesisRouter } from "./routers/truth-synthesis";
import { marketQuotesRouter } from "./routers/market-quotes";
import { agencyRouter } from "./routers/agency";
import { agencyBrokerRouter } from "./routers/agency-broker";
import { fleetAccountsRouter } from "./routers/fleet-accounts";
import { vehicleRegistryRouter } from "./routers/vehicle-registry";
import { vehicleDamageHistoryRouter } from "./routers/vehicle-damage-history";
import { repairHistoryRouter } from "./routers/repair-history";
import { crossClaimIntelligenceRouter } from "./routers/cross-claim-intelligence";
import { driverRegistryRouter } from "./routers/driver-registry";
import { workflowRouter } from "./routers/workflow";
import { commentsRouter } from "./routers/comments";
import { workflowQueriesRouter } from "./routers/workflow-queries";
import { marketplaceRouter } from "./routers/marketplace";
import { platformMarketplaceRouter } from "./routers/platform-marketplace";
import { platformUserRolesRouter } from "./routers/platform-user-roles";
import { platformRouter } from "./routers/platform";
import { reviewQueueRouter } from "./routers/review-queue";
import { monetizationRouter } from "./routers/monetization";
import { operationalHealthRouter } from "./routers/operational-health";
import { platformObservabilityRouter } from "./routers/platform-observability";
import { auditRouter } from "./routers/audit";
import { governanceRouter } from "./routers/governance";
import { governanceDashboardRouter } from "./routers/governance-dashboard";
import { aiReanalysisRouter } from "./routers/ai-reanalysis";
import { intakeGateRouter } from "./routers/intake-gate";
import { aiAnalysisRouter } from "./routers/ai-analysis";
import { notificationsRouter } from "./routers/notifications";
import { adminRouter } from "./routers/admin";
import { routingPolicyVersionRouter } from "./routers/routing-policy-version";
import { policyManagementRouter } from "./routers/policy-management";
import { panelBeaterAnalyticsRouter } from './routers/panel-beater-analytics';
import { reportsRouter } from './routers/reports';
import { executiveRouter } from './routers/executive';
import { quoteIntelligenceRouter } from './repair-intelligence/router';
import { validateAiAssessmentResponse, validateClaimDetailResponse } from './apiResponseValidator';
import { sanitiseReportNarrative, buildBlockError } from './services/externalReportSanitiser';
// import { eventIntegration } from "./events/event-integration"; // Temporarily disabled until Kafka is set up

export const appRouter = router({
  truthSynthesis: truthSynthesisRouter,
  vehicleRegistry: vehicleRegistryRouter,
  vehicleDamageHistory: vehicleDamageHistoryRouter,
  driverRegistry: driverRegistryRouter,
  repairHistory: repairHistoryRouter,
  crossClaim: crossClaimIntelligenceRouter,
  system: systemRouter,
  tenant: tenantRouter,
  analytics: analyticsRouter,
  simulation: simulationRouter,
  workflowAudit: workflowAuditRouter,
  workflowAnalytics: workflowAnalyticsRouter,
  compliance: complianceRouter,
  monetization: monetizationRouter,
  operationalHealth: operationalHealthRouter,
  platformObservability: platformObservabilityRouter,
  audit: auditRouter,
  governance: governanceRouter,
  governanceDashboard: governanceDashboardRouter,
  aiReanalysis: aiReanalysisRouter,
  aiAnalysis: aiAnalysisRouter,
  notifications: notificationsRouter,
  admin: adminRouter,
  routingPolicyVersion: routingPolicyVersionRouter,
  policyManagement: policyManagementRouter,
  panelBeaterAnalytics: panelBeaterAnalyticsRouter,
  reports: reportsRouter,
  executive: executiveRouter,
  intakeGate: intakeGateRouter,
  marketQuotes: marketQuotesRouter,
  agency: agencyRouter,
  agencyBroker: agencyBrokerRouter,
  fleetAccounts: fleetAccountsRouter,
  workflow: workflowRouter,
  workflowQueries: workflowQueriesRouter,
  comments: commentsRouter,
  reviewQueue: reviewQueueRouter,
  assessorOnboarding: assessorOnboardingRouter,
  documentIngestion: documentIngestionRouter,
  historicalClaims: historicalClaimsRouter,
  claimReplay: claimReplayRouter,
  automationPolicies: automationPoliciesRouter,
  claimCompletion: claimCompletionRouter,
  marketplace: marketplaceRouter,
  platformMarketplace: platformMarketplaceRouter,
  platformUserRoles: platformUserRolesRouter,
  platform: platformRouter,
  quoteIntelligence: quoteIntelligenceRouter,
  // ── Assessor Subscription (Free / Pro Tier) ────────────────────────────
  assessorSubscription: router({
    /**
     * Get the current assessor's subscription status and monthly usage.
     * Assessors call this to see their tier, cap, and remaining assignments.
     */
    getMyStatus: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const { getOrCreateSubscription, getMonthlyAssignmentCount } = await import("./assessor-subscription");
      const sub = await getOrCreateSubscription(ctx.user.id);
      const used = await getMonthlyAssignmentCount(ctx.user.id);
      const now = new Date();
      const isExpired = sub.tier === "pro" && sub.expiresAt !== null && new Date(sub.expiresAt) < now;
      const effectiveTier = isExpired ? "free" : sub.tier;
      const cap = isExpired ? 10 : sub.maxClaimsPerMonth;
      return {
        tier: effectiveTier as "free" | "pro",
        maxClaimsPerMonth: cap,
        usedThisMonth: used,
        remaining: Math.max(0, cap - used),
        expiresAt: sub.expiresAt,
        isExpired,
        upgradeAvailable: effectiveTier === "free",
      };
    }),

    /**
     * Get subscription status for a specific assessor (insurer/admin use).
     */
    getStatusByAssessorId: protectedProcedure
      .input(z.object({ assessorId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const { getOrCreateSubscription, getMonthlyAssignmentCount } = await import("./assessor-subscription");
        const sub = await getOrCreateSubscription(input.assessorId);
        const used = await getMonthlyAssignmentCount(input.assessorId);
        const now = new Date();
        const isExpired = sub.tier === "pro" && sub.expiresAt !== null && new Date(sub.expiresAt) < now;
        const effectiveTier = isExpired ? "free" : sub.tier;
        const cap = isExpired ? 10 : sub.maxClaimsPerMonth;
        return {
          tier: effectiveTier as "free" | "pro",
          maxClaimsPerMonth: cap,
          usedThisMonth: used,
          remaining: Math.max(0, cap - used),
          expiresAt: sub.expiresAt,
          isExpired,
          upgradeAvailable: effectiveTier === "free",
        };
      }),

    /**
     * ADMIN: Upgrade or downgrade an assessor's tier.
     * Pro tier sets cap to 9999 (unlimited). Free resets to 10.
     */
    adminSetTier: protectedProcedure
      .input(z.object({
        assessorId: z.number(),
        tier: z.enum(["free", "pro"]),
        expiresAt: z.string().optional(),
        marketplaceProfileId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        if (ctx.user.role !== "admin" && ctx.user.role !== "platform_super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
        }
        const { upsertSubscription } = await import("./assessor-subscription");
        const result = await upsertSubscription(
          input.assessorId,
          input.marketplaceProfileId ?? `auto-${input.assessorId}`,
          input.tier,
          input.expiresAt ?? null
        );
        return { success: true, subscription: result };
      }),

    /**
     * ADMIN: List all assessor subscriptions with usage.
     */
    adminListAll: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      if (ctx.user.role !== "admin" && ctx.user.role !== "platform_super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const db = await getDb();
      if (!db) return [];
      const { assessorSubscriptions: asSubs } = await import("../drizzle/schema");
      return await db.select().from(asSubs).orderBy(asSubs.tier);
    }),
  }),

  quoteOptimisation: router({
    // Fetch latest AI optimisation result for a claim
    // Uses insurerDomainProcedure: ctx.insurerTenantId is always non-null
    getResult: insurerDomainProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Verify claim belongs to insurer's tenant before returning optimisation result
        const claim = await getClaimById(input.claimId, ctx.insurerTenantId);
        if (!claim) throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
        const { getLatestOptimisationResult } = await import("./quote-ai-optimisation");
        return await getLatestOptimisationResult(input.claimId);
      }),

    // Insurer records their decision (accept recommendation or override)
    // Uses insurerDomainProcedure: ctx.insurerTenantId is always non-null
    recordDecision: insurerDomainProcedure
      .input(z.object({
        claimId: z.number(),
        accepted: z.boolean(),
        overrideReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Cross-tenant guard: verify claim belongs to insurer's tenant
        const claim = await getClaimById(input.claimId, ctx.insurerTenantId);
        if (!claim) throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const { quoteOptimisationResults: qor } = await import("../drizzle/schema");
        const { eq: _eq, and: _and } = await import("drizzle-orm");
        const now = new Date().toISOString().slice(0, 19).replace("T", " ");
        await db
          .update(qor)
          .set({
            insurerAcceptedRecommendation: input.accepted ? 1 : 0,
            insurerDecisionBy: ctx.user.id,
            insurerDecisionAt: now,
            insurerOverrideReason: input.overrideReason ?? null,
            updatedAt: now,
          })
          .where(_and(
            _eq(qor.claimId, input.claimId),
            _eq(qor.status, "completed")
          ));
        return { success: true };
      }),

    // Manually re-trigger AI optimisation (insurer admin action)
    // Uses insurerDomainProcedure: ctx.insurerTenantId is always non-null
    retrigger: insurerDomainProcedure
      .input(z.object({ claimId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getClaimById, getQuotesByClaimId } = await import("./db");
        // Cross-tenant guard: only fetch claim if it belongs to insurer's tenant
        const tenantId = ctx.insurerTenantId;
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new Error("Claim not found");
        const allQuotes = await getQuotesByClaimId(input.claimId);
        if (allQuotes.length < 3) throw new Error("Not all 3 quotes have been submitted yet");
        const { runQuoteOptimisation } = await import("./quote-ai-optimisation");
        const { marketplaceProfiles: _mp } = await import("../drizzle/schema");
        const db = await getDb();
        const quoteInputs = await Promise.all(
          allQuotes.slice(0, 3).map(async (q) => {
            let profileId = `legacy-${q.panelBeaterId}`;
            let companyName = `Panel Beater #${q.panelBeaterId}`;
            if (db) {
              const { eq: _eq2 } = await import("drizzle-orm");
              const [profile] = await db
                .select({ id: _mp.id, companyName: _mp.companyName })
                .from(_mp)
                .where(_eq2(_mp.id, String(q.panelBeaterId)))
                .limit(1);
              if (profile) { profileId = profile.id; companyName = profile.companyName; }
            }
            return {
              profileId, companyName,
              totalAmount: q.quotedAmount,
              partsAmount: q.partsCost ?? 0,
              labourAmount: q.laborCost ?? 0,
              labourHours: q.laborHours ?? 0,
              itemizedBreakdown: q.itemizedBreakdown ?? null,
              partsQuality: q.partsQuality ?? "aftermarket",
            };
          })
        );
        const result = await runQuoteOptimisation(
          input.claimId,
          { vehicleMake: claim.vehicleMake ?? "Unknown", vehicleModel: claim.vehicleModel ?? "Unknown", vehicleYear: claim.vehicleYear ?? new Date().getFullYear() },
          quoteInputs,
          ctx.user.id
        );
        // ── Notify insurer(s) that AI re-optimisation is complete ────────
        if (result) {
          try {
            const { sendAiOptimisationCompleteEmail } = await import("./safe-email");
            const { getUsersByRole: _getUsers } = await import("./db");
            const insurers = await _getUsers("insurer");
            const tenantInsuers = insurers.filter(
              (u) => !claim.tenantId || u.tenantId === claim.tenantId
            );
            for (const insurer of tenantInsuers) {
              if (insurer.email) {
                await sendAiOptimisationCompleteEmail({
                  claimId: input.claimId,
                  claimNumber: claim.claimNumber ?? String(input.claimId),
                  recipientUserId: insurer.id,
                  recipientEmail: insurer.email,
                  riskScore: Number(result.riskScoreNumeric ?? 0),
                  recommendedRepairer: result.recommendedCompanyName ?? "Unknown",
                  tenantId: claim.tenantId ?? undefined,
                });
              }
            }
          } catch (emailErr) {
            console.error(`[QuoteOptimisation] Retrigger email failed for claim ${input.claimId}:`, emailErr);
          }
        }
        return result;
      }),
  }),
  ml: mlRouter,
  learning: learningRouter,
  decision: decisionRouter,
  approval: approvalRouter,
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
        insurerRole: z.enum(["claims_processor", "assessor_internal", "assessor_external", "risk_manager", "claims_manager", "executive", "insurer_admin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        // Import users table
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        // Update current user's role and insurerRole
        await db
          .update(users)
          .set({
            role: "insurer",
            insurerRole: input.insurerRole,
            updatedAt: new Date(),
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
        const { assignUserRole } = await import("./services/user-management");
        
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

        // Decode base64 to buffer
        const base64Data = input.fileData.replace(/^data:[^;]+;base64,/, "");
        const fileBuffer = Buffer.from(base64Data, "base64");

        // Extract data using AI vision
        const extracted = await extractClaimFormData(
          fileBuffer,
          input.mimeType,
          input.fileName
        );

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
     * @param triggerAI - Whether to immediately trigger AI assessment
     * @returns Claim number and ID
     */
    createOnBehalfOf: protectedProcedure
      .input(z.object({
        claimantEmail: z.string().email(),
        claimantName: z.string(),
        claimantPhone: z.string().optional(),
        vehicleMake: z.string(),
        vehicleModel: z.string(),
        vehicleYear: z.number(),
        vehicleRegistration: z.string(),
        incidentDate: z.string(),
        incidentDescription: z.string(),
        incidentLocation: z.string(),
        damagePhotos: z.array(z.string()),
        policyNumber: z.string(),
        triggerAI: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        
        // Check if user has claims processor role
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "uploadDocuments")) {
          throw new TRPCError({ 
            code: "FORBIDDEN",
            message: "Only Claims Processors can create claims on behalf of claimants"
          });
        }
        
        // Find or create claimant user
        const { getUserByEmail, createUser } = await import("./db");
        let claimant = await getUserByEmail(input.claimantEmail);
        
        if (!claimant) {
          // Create new claimant user
          await createUser({
            email: input.claimantEmail,
            name: input.claimantName,
            phone: input.claimantPhone || null,
            role: "claimant",
            tenantId: ctx.user.tenantId,
          });
          claimant = await getUserByEmail(input.claimantEmail);
          if (!claimant) throw new Error("Failed to create claimant user");
        }
        
        const claimNumber = `CLM-${nanoid(10).toUpperCase()}`;

        // Normalise the claimant's description before storing
        const { normaliseIncidentDescription } = await import("./services/intakeDescriptionNormaliser");
        const normResult = await normaliseIncidentDescription(input.incidentDescription);
        
        await createClaim({
          claimantId: claimant.id,
          claimNumber,
          vehicleMake: input.vehicleMake,
          vehicleModel: input.vehicleModel,
          vehicleYear: input.vehicleYear,
          vehicleRegistration: input.vehicleRegistration,
          incidentDate: new Date(input.incidentDate),
          incidentDescription: input.incidentDescription,
          normalisedDescription: normResult.normalisedText !== input.incidentDescription ? normResult.normalisedText : null,
          reportedCauseLabel: normResult.reportedCauseLabel,
          keyFactsJson: normResult.keyFacts.length > 0 ? JSON.stringify(normResult.keyFacts) : null,
          incidentLocation: input.incidentLocation,
          damagePhotos: JSON.stringify(input.damagePhotos),
          policyNumber: input.policyNumber,
          selectedPanelBeaterIds: JSON.stringify([]),
          status: "submitted",
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
        
        // Fire-and-forget: trigger AI assessment without blocking the HTTP response
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
        vehicleYear: z.number(),
        vehicleRegistration: z.string(),
        incidentDate: z.string(), // ISO date string
        incidentDescription: z.string(),
        incidentLocation: z.string(),
        damagePhotos: z.array(z.string()), // Array of S3 URLs
        policyNumber: z.string(),
        // Structured 3-choice panel beater selection — all must be insurer-approved
        panelBeaterChoice1: z.string().uuid(),
        panelBeaterChoice2: z.string().uuid(),
        panelBeaterChoice3: z.string().uuid(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");

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

        const { getApprovedPanelBeaterIds } = await import("./routers/marketplace");
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

        // Normalise the claimant's description before storing
        const { normaliseIncidentDescription } = await import("./services/intakeDescriptionNormaliser");
        const normResult = await normaliseIncidentDescription(input.incidentDescription);

        await createClaim({
          claimantId: ctx.user.id,
          claimNumber,
          vehicleMake: input.vehicleMake,
          vehicleModel: input.vehicleModel,
          vehicleYear: input.vehicleYear,
          vehicleRegistration: input.vehicleRegistration,
          incidentDate: new Date(input.incidentDate),
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

        // Fire-and-forget: trigger AI assessment without blocking the HTTP response
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
      const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
      return await getClaimsByClaimant(ctx.user.id, tenantId);
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

    // Get claims by status (for dashboards)
    // Uses insurerDomainProcedure: ctx.insurerTenantId is always non-null, preventing cross-tenant leakage
    byStatus: insurerDomainProcedure
      .input(z.object({ status: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // ctx.insurerTenantId guaranteed non-null by insurerDomainProcedure middleware
        return await db
          .select()
          .from(claims)
          .where(and(
            eq(claims.status, input.status as any),
            eq(claims.tenantId, ctx.insurerTenantId)   // ← strict tenant isolation
          ))
          .orderBy(desc(claims.createdAt))
          .limit(200);
      }),

    // Get single claim by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
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
        const { checkAssignmentCap } = await import("./assessor-subscription");
        await checkAssignmentCap(input.assessorId);
        // ──────────────────────────────────────────────────────────────────

        await assignClaimToAssessor(input.claimId, input.assessorId);
        
        // Automatically progress workflow state using WorkflowEngine
        const { transition } = await import('./workflow-engine');
        const { statusToWorkflowState } = await import('./workflow-migration');
        
        await transition({
          claimId: input.claimId,
          fromState: (claim.workflowState || "created") as any,
          toState: statusToWorkflowState("assessment_pending"),
          userId: ctx.user.id,
          userRole: (ctx.user.insurerRole || "claims_processor") as any,
          tenantId: claim.tenantId || "default",
          decisionData: {
            comments: `Claim assigned to assessor ${input.assessorId}`,
          },
          aiSnapshot: null,
        });

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
        const tenantIdForStatus = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const currentClaim = await getClaimById(input.claimId, tenantIdForStatus);
        if (!currentClaim) throw new Error("Claim not found");
        
        // Progress through required intermediate states to reach assessment_in_progress
        const claimTenantId = currentClaim.tenantId || "default";
        const currentStatus = currentClaim.status;
        if (currentStatus === "intake_pending") {
          // Document-ingestion claims: intake_pending → assessment_in_progress
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
        } else {
          // For other states, try direct transition (will throw if invalid)
          await updateClaimStatus(input.claimId, "assessment_in_progress", ctx.user.id, "claims_processor", claimTenantId);
        }
        
        // Capture user context for the async callback (request scope ends after return)
        const asyncUserId = ctx.user.id;
        const asyncUserEmail = ctx.user.email || "";
        const asyncUserName = ctx.user.name || "Insurer";
        const asyncUserRole = ctx.user.role;
        const asyncTenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");

        // Fire-and-forget: run the AI assessment asynchronously so the HTTP
        // mutation response returns immediately (avoids 15-45 s LLM timeout).
        // The frontend polls aiAssessments.byClaim every 5 s until a result
        // appears (see InsurerComparisonView / ClaimRiskIndicators).
        // IMPORTANT: Notifications are sent INSIDE the async callback so they
        // only fire AFTER the AI job has actually completed (not before).
        triggerAiAssessment(input.claimId)
          .then(async () => {
            try {
              // Now the AI assessment record exists — safe to read and notify
              const claim = await getClaimById(input.claimId, asyncTenantId);
              const aiAssessment = await getAiAssessmentByClaimId(input.claimId, asyncTenantId);

              if (claim && aiAssessment) {
                // Send email notification about AI assessment completion
                await notifyAiAssessmentComplete({
                  claimId: input.claimId,
                  recipientEmail: asyncUserEmail,
                  recipientName: asyncUserName,
                  claimNumber: claim.claimNumber,
                  estimatedCost: (aiAssessment.estimatedCost || 0).toString(),
                  fraudRiskLevel: aiAssessment.fraudRiskLevel || "low",
                  confidenceScore: (aiAssessment.confidenceScore || 0).toString(),
                });

                // Create in-app notification
                const { createNotification } = await import("./db");
                if (aiAssessment.fraudRiskLevel === "high") {
                  await createNotification({
                    userId: asyncUserId,
                    title: "\u26a0\ufe0f High Fraud Risk Detected",
                    message: `AI assessment flagged claim ${claim.claimNumber} as high fraud risk. Immediate review recommended.`,
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
                    title: "AI Assessment Complete",
                    message: `AI damage assessment completed for claim ${claim.claimNumber}. Estimated cost: $${(aiAssessment.estimatedCost || 0).toFixed(2)}`,
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
          .catch((err: unknown) => {
            console.error(`[AI] Background assessment failed for claim ${input.claimId}:`, err);
          });
        
        // Create audit entry for manual AI assessment trigger (immediate — before async job)
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "ai_assessment_triggered",
          entityType: "ai_assessment",
          changeDescription: `AI assessment manually triggered by ${ctx.user.role}${input.reason ? `: ${input.reason}` : ''}`,
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
        const tenantId = ctx.user.role === "admin" || ctx.user.role === "platform_super_admin" ? undefined : (ctx.user.tenantId || "default");
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

        console.log(`[AI Assessment] Claim ${input.claimId} manually reset to intake_pending by user ${ctx.user.id} (${ctx.user.role})`);
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

        const { runDebugPipeline } = await import("./pipeline-v2/debug-runner");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const tenantId = ctx.user.role === "admin" || ctx.user.role === "platform_super_admin" ? undefined : (ctx.user.tenantId || "default");
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

        const pipelineCtx = {
          claimId: input.claimId,
          tenantId: claim.tenantId ? Number(claim.tenantId) : null,
          assessmentId: 0,
          claim: claim as Record<string, any>,
          pdfUrl,
          damagePhotoUrls: damagePhotos,
          db,
          log: (stage: string, msg: string) => console.log(`[Debug][${stage}] Claim ${input.claimId}: ${msg}`),
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
        const requireManagerApprovalAbove = policy?.requireManagerApprovalAbove || 2500000; // Default 25,000 USD in cents
        
        // Determine if financial approval is required
        const requiresFinancialApproval = approvedAmount > requireManagerApprovalAbove;
        
        // Use WorkflowEngine for governance-compliant state transition
        const { transition, getCurrentState } = await import("./workflow-engine");
        const { statusToWorkflowState } = await import("./workflow-migration");
        
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
        import("./continuous-learning").then(({ feedClaimToHistorical }) => {
          feedClaimToHistorical(input.claimId).then((result) => {
            if (result.success) {
              console.log(`[ContinuousLearning] ${result.message}`);
            } else {
              console.warn(`[ContinuousLearning] ${result.message}`);
            }
          }).catch((err) => console.error("[ContinuousLearning] Error:", err));
        });

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
        
        // Backfill repairer info into vehicle_damage_history (non-blocking)
        import('./vehicle-damage-history').then(({ backfillRepairer }) => {
          backfillRepairer({
            claimId: input.claimId,
            repairerId: selectedQuote.panelBeaterId,
            repairerName: panelBeater?.businessName || 'Selected Panel Beater',
            actualRepairCostCents: approvedAmount,
          }).catch((err: any) => console.warn('[DamageHistory] Repairer backfill failed:', err.message));
        }).catch(() => {});

        // Insert repair intelligence record (non-blocking)
        import('./repair-history').then(({ insertRepairHistory, updateRepairerAggregates }) => {
          // Parse damaged components from the claim's AI assessment
          let componentsRepaired: { name: string; zone?: string | null }[] = [];
          try {
            if (claim.damagedComponentsJson) {
              const parsed = JSON.parse(claim.damagedComponentsJson);
              if (Array.isArray(parsed)) componentsRepaired = parsed;
            }
          } catch { /* ignore parse errors */ }

          insertRepairHistory({
            repairerId: selectedQuote.panelBeaterId,
            vehicleId: claim.vehicleRegistryId ?? undefined,
            claimId: input.claimId,
            componentsRepaired,
            repairCostCents: approvedAmount,
            labourCostCents: selectedQuote.labourCost ?? 0,
            partsCostCents: selectedQuote.partsCost ?? 0,
            aiEstimatedCostCents: claim.estimatedRepairCost ?? 0,
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

        return { 
          success: true, 
          requiresFinancialApproval,
          approvedAmount,
          threshold: requireManagerApprovalAbove
        };
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
          changeDescription: `Claim financially approved for $${((claim.approvedAmount || 0) / 100).toFixed(2)}`,
        });
        
        console.log(`[Approval] Claim ${claim.claimNumber} financially approved by user ${ctx.user.id}`);

        // Feed into continuous learning loop (non-blocking)
        import("./continuous-learning").then(({ feedClaimToHistorical }) => {
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
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || ctx.user.insurerTenantId || "default");
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { marketplaceProfiles, insurerMarketplaceRelationships } = await import("../drizzle/schema");

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
        const insurerTenantId = ctx.user.insurerTenantId || ctx.user.tenantId;
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
     * Supported codes: USD, ZIG, ZAR (ISO 4217)
     *
     * @requires Authentication (claims_manager, claims_processor, insurer, or admin role)
     * @param claimId - ID of the claim to update
     * @param currencyCode - ISO 4217 currency code (e.g. "USD", "ZIG", "ZAR")
     * @returns { success, currencyCode }
     */
    updateCurrency: protectedProcedure
      .input(z.object({
        claimId: z.number().int().positive(),
        currencyCode: z.enum(["USD", "ZIG", "ZAR"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const allowedRoles = ["claims_manager", "claims_processor", "insurer", "admin"];
        if (!allowedRoles.includes(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers and processors can update claim currency" });
        }
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || ctx.user.insurerTenantId || "default");
        // Verify claim exists and belongs to tenant
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const { aiAssessments: aiAssessmentsTable, panelBeaterQuotes: panelBeaterQuotesTable } = await import("../drizzle/schema");

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
        const assessment = await getAiAssessmentByClaimId(input.claimId);
        if (!assessment) throw new TRPCError({ code: 'NOT_FOUND', message: 'No AI assessment found for this claim' });

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

        await db.update(aiAssessments)
          .set({ constraintOverridesJson: JSON.stringify(existing) })
          .where(eq(aiAssessments.id, assessment.id));

        return { success: true, constraintId: input.constraintId, overrides: existing };
      }),

    /**
     * Get all constraint overrides for a claim's AI assessment.
     * Returns the full override map keyed by constraintId.
     */
    getConstraintOverrides: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const assessment = await getAiAssessmentByClaimId(input.claimId);
        if (!assessment) return {};
        return assessment.constraintOverridesJson
          ? JSON.parse(assessment.constraintOverridesJson)
          : {};
      }),
  }),
  // Assessor operationss
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
        disagreesWithAi: z.boolean().optional(),
        aiDisagreementReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Fetch claim for tenantId
        const claim = await getClaimById(input.claimId);
        if (!claim) throw new Error("Claim not found");
        
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
          disagreesWithAi: input.disagreesWithAi,
          aiDisagreementReason: input.aiDisagreementReason,
          status: "submitted",
        });
        
        // Automatically progress status to quotes_pending (legacy field only)
        await updateClaimStatus(input.claimId, "quotes_pending", ctx.user.id, "assessor_internal", claim.tenantId || "default");
        
        // Progress workflow state to internal_review (assessor completed their work)
        const { transitionWorkflowState } = await import("./workflow");
        await transitionWorkflowState(
          input.claimId,
          "internal_review",
          ctx.user.id,
          "assessor_internal"
        );

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
          // All quotes received, progress to comparison stage (legacy field only)
          await updateClaimStatus(input.claimId, "comparison", ctx.user.id, "panel_beater", claim?.tenantId || "default");

          // ── AI Cost Optimisation ─────────────────────────────────────────────
          // Trigger asynchronously so quote submission returns immediately.
          // The optimisation result is persisted to quote_optimisation_results.
          if (claim) {
            const quotesToAnalyse = allQuotes.slice(0, 3);
            setImmediate(async () => {
              try {
                const { runQuoteOptimisation } = await import("./quote-ai-optimisation");
                // Build QuoteInput from stored quotes + marketplace profile lookup
                const { getDb: _getDb } = await import("./db");
                const { marketplaceProfiles: _mp } = await import("../drizzle/schema");
                const { eq: _eq } = await import("drizzle-orm");
                const _db = await _getDb();

                const quoteInputs = await Promise.all(
                  quotesToAnalyse.map(async (q) => {
                    // Try to resolve marketplace profile for this panel beater
                    let profileId = `legacy-${q.panelBeaterId}`;
                    let companyName = `Panel Beater #${q.panelBeaterId}`;
                    if (_db) {
                      const [profile] = await _db
                        .select({ id: _mp.id, companyName: _mp.companyName })
                        .from(_mp)
                        .where(_eq(_mp.id, String(q.panelBeaterId)))
                        .limit(1);
                      if (profile) {
                        profileId = profile.id;
                        companyName = profile.companyName;
                      }
                    }
                    return {
                      profileId,
                      companyName,
                      totalAmount: q.quotedAmount,
                      partsAmount: q.partsCost ?? 0,
                      labourAmount: q.laborCost ?? 0,
                      labourHours: q.laborHours ?? 0,
                      itemizedBreakdown: q.itemizedBreakdown ?? null,
                      partsQuality: q.partsQuality ?? "aftermarket",
                    };
                  })
                );

                const optimisationResult = await runQuoteOptimisation(
                  input.claimId,
                  {
                    vehicleMake: claim.vehicleMake ?? "Unknown",
                    vehicleModel: claim.vehicleModel ?? "Unknown",
                    vehicleYear: claim.vehicleYear ?? new Date().getFullYear(),
                  },
                  quoteInputs,
                  ctx.user.id
                );
                console.log(`[QuoteOptimisation] Auto-triggered for claim ${input.claimId}`);
                // ── Notify insurer(s) that AI optimisation is complete ────────
                if (optimisationResult) {
                  try {
                    const { sendAiOptimisationCompleteEmail } = await import("./safe-email");
                    const { getUsersByRole: _getUsersByRole } = await import("./db");
                    const insurers = await _getUsersByRole("insurer");
                    // Filter to insurers in the same tenant as the claim
                    const tenantInsuers = insurers.filter(
                      (u) => !claim.tenantId || u.tenantId === claim.tenantId
                    );
                    for (const insurer of tenantInsuers) {
                      if (insurer.email) {
                        await sendAiOptimisationCompleteEmail({
                          claimId: input.claimId,
                          claimNumber: claim.claimNumber ?? String(input.claimId),
                          recipientUserId: insurer.id,
                          recipientEmail: insurer.email,
                          riskScore: Number(optimisationResult.riskScoreNumeric ?? 0),
                          recommendedRepairer: optimisationResult.recommendedCompanyName ?? "Unknown",
                          tenantId: claim.tenantId ?? undefined,
                        });
                      }
                    }
                  } catch (emailErr) {
                    console.error(`[QuoteOptimisation] Email notification failed for claim ${input.claimId}:`, emailErr);
                  }
                }
              } catch (err) {
                console.error(`[QuoteOptimisation] Auto-trigger failed for claim ${input.claimId}:`, err);
              }
            });
          }
          // ────────────────────────────────────────────────────────────────────

          // Notify insurer that all quotes are ready for comparison
          if (claim) {
            const insurers = await getUsersByRole("insurer");
            const { createNotification } = await import("./db");
            
            for (const insurer of insurers) {
              await createNotification({
                userId: insurer.id,
                title: "All Quotes Received — AI Analysis Running",
                message: `All panel beater quotes received for claim ${claim.claimNumber}. AI cost optimisation has been triggered.`,
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
        
        // Fetch panel beater details for name resolution
        const panelBeaterIds = [...new Set(quotes.map(q => q.panelBeaterId))];
        const { panelBeaters: pbTable } = await import("../drizzle/schema");
        const db = await getDb();
        const pbRows = db ? await db.select({ id: pbTable.id, businessName: pbTable.businessName, name: pbTable.name })
          .from(pbTable)
          .where(inArray(pbTable.id, panelBeaterIds.length > 0 ? panelBeaterIds : [-1])) : [];
        const pbMap = new Map(pbRows.map(pb => [pb.id, pb]));
        
        // Fetch line items for each quote
        const quotesWithItems = await Promise.all(
          quotes.map(async (quote) => {
            const lineItems = await getQuoteLineItemsByQuoteId(quote.id);
            const pb = pbMap.get(quote.panelBeaterId);
            return {
              ...quote,
              lineItems,
              panelBeaterName: pb?.businessName || pb?.name || null,
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
    historicalBenchmarks: protectedProcedure
      .input(z.object({
        vehicleMake: z.string(),
        vehicleModel: z.string().optional(),
        damageContext: z.object({
          accidentType: z.string().optional(),
          damageSeverity: z.string().optional(),
          affectedZones: z.array(z.string()).optional(),
          estimatedCost: z.number().optional(),
        }).optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.tenantId || "default";
        const { getHistoricalBenchmarks } = await import("./continuous-learning");
        return await getHistoricalBenchmarks(tenantId, input.vehicleMake, input.vehicleModel, input.damageContext);
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
    // Intelligence Enforcement Layer — applies all enforcement rules to a claim's assessment
    getEnforcement: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const { applyIntelligenceEnforcement } = await import("./intelligence-enforcement");
        const { getAiAssessmentByClaimId, getQuotesByClaimId } = await import("./db");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
        if (!assessment) return null;
        const quotes = await getQuotesByClaimId(input.claimId, tenantId);
        const quotedAmounts = quotes.map(q => (q.quotedAmount || 0) / 100); // cents → dollars
        // Parse physics analysis
        let physicsRaw: any = null;
        try {
          physicsRaw = assessment.physicsAnalysis
            ? (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis) : assessment.physicsAnalysis)
            : null;
        } catch { /* ignore */ }
        // Parse damaged components
        let damagedComponents: string[] = [];
        try {
          const comps = assessment.damagedComponentsJson
            ? (typeof assessment.damagedComponentsJson === 'string' ? JSON.parse(assessment.damagedComponentsJson) : assessment.damagedComponentsJson)
            : [];
          damagedComponents = Array.isArray(comps)
            ? comps.map((c: any) => (typeof c === 'string' ? c : c?.name || c?.component || '')).filter(Boolean)
            : [];
        } catch { /* ignore */ }
        // Parse fraud score breakdown
        let fraudScoreBreakdown: any = null;
        try {
          fraudScoreBreakdown = assessment.fraudScoreBreakdownJson
            ? (typeof assessment.fraudScoreBreakdownJson === 'string' ? JSON.parse(assessment.fraudScoreBreakdownJson) : assessment.fraudScoreBreakdownJson)
            : null;
        } catch { /* ignore */ }
        // Extract fraud score — prefer the raw pipeline score over the breakdown total
        // The breakdown JSON has {indicators: [{name, score}]} or [{indicator, score}] structure
        let fraudIndicators: Array<{ indicator: string; score: number }> = [];
        let fraudScore = assessment.fraudScore ?? 0;
        if (fraudScoreBreakdown) {
          // Try multiple JSON shapes from the AI pipeline
          const indicators = fraudScoreBreakdown.indicators ?? fraudScoreBreakdown.breakdown ?? [];
          if (Array.isArray(indicators)) {
            fraudIndicators = indicators.map((item: any) => ({
              indicator: item.indicator ?? item.name ?? item.factor ?? 'Unknown',
              score: Number(item.score ?? item.value ?? item.contribution ?? 0),
            }));
          }
          // Use pipeline total if available and > 0
          if ((fraudScoreBreakdown.totalScore ?? 0) > 0) fraudScore = fraudScoreBreakdown.totalScore;
        }
        const estimatedSpeedKmh = physicsRaw?.estimatedSpeedKmh ?? physicsRaw?.estimatedSpeed?.value ?? 0;
        const deltaVKmh = physicsRaw?.deltaVKmh ?? physicsRaw?.deltaV ?? 0;
        const impactForceKn = physicsRaw?.impactForceKn ?? 0;
        const energyKj = physicsRaw?.energyDistribution?.energyDissipatedKj ?? 0;
        const vehicleMassKg = physicsRaw?.vehicleMassKg ?? 1600;
        const accidentSeverity = (physicsRaw?.accidentSeverity ?? assessment.structuralDamageSeverity ?? 'minor') as string;
        const consistencyScore = physicsRaw?.damageConsistencyScore ?? 50;
        const impactDirection = physicsRaw?.impactVector?.direction ?? physicsRaw?.impactDirection ?? 'unknown';
        const aiEstimatedCost = (assessment.estimatedCost || 0); // already in dollars (stored as whole currency units)
        const extractionConfidence = assessment.confidenceScore ?? 75;
        const result = applyIntelligenceEnforcement({
          fraudScore: Number(fraudScore),
          fraudRiskLevel: assessment.fraudRiskLevel ?? 'low',
          estimatedSpeedKmh: Number(estimatedSpeedKmh),
          deltaVKmh: Number(deltaVKmh),
          impactForceKn: Number(impactForceKn),
          energyKj: Number(energyKj),
          vehicleMassKg: Number(vehicleMassKg),
          accidentSeverity,
          consistencyScore: Number(consistencyScore),
          impactDirection,
          damageZones: [],
          damageComponents: damagedComponents,
          aiEstimatedCost,
          quotedAmounts,
          vehicleMake: '',
          hasPreviousClaims: false,
          fraudScoreBreakdownJson: fraudIndicators.length > 0 ? fraudIndicators : null,
          extractionConfidence: Number(extractionConfidence),
        });
        // Run the Cost Extraction Engine for guaranteed populated cost object
        const { extractCosts } = await import('./cost-extraction-engine');
        const aiPartsCost = (assessment.estimatedPartsCost || 0); // already in dollars
        const aiLabourCost = (assessment.estimatedLaborCost || 0); // already in dollars
        const costExtraction = extractCosts({
          aiEstimatedCost,
          aiPartsCost,
          aiLabourCost,
          damageComponents: damagedComponents,
          accidentSeverity,
          extractionConfidence: Number(extractionConfidence),
          quotedAmounts,
        });
        // Run the Weighted Fraud Scoring Engine — deterministic, rule-based
        const { computeWeightedFraudScore, countMissingFields } = await import('./weighted-fraud-scoring');
        const primaryQuotedAmount = quotedAmounts.length > 0 ? Math.max(...quotedAmounts) : 0;
        const missingDataCount = countMissingFields({
          estimatedSpeedKmh: Number(estimatedSpeedKmh),
          impactForceKn: Number(impactForceKn),
          energyKj: Number(energyKj),
          vehicleMake: assessment.vehicleMake ?? '',
          impactDirection,
          damageComponents: damagedComponents,
        });
        // Derive damage zones from component names and impact direction
        const damageZones = damagedComponents.length > 0
          ? damagedComponents.map((c: string) => c.toLowerCase())
          : impactDirection !== 'unknown' ? [impactDirection] : [];

        // Build multi-source conflict signal from Stage 12/13 consistency check result
        // Only inject when: status == "complete" AND at least one high-severity mismatch
        // confidence HIGH → weight 12, MEDIUM → weight 5, LOW → ignored
        let multiSourceConflict: { confidence: "HIGH" | "MEDIUM" | "LOW"; highSeverityMismatchCount: number; details: string } | undefined;
        try {
          const consistencyRaw = assessment.consistencyCheckJson
            ? (typeof assessment.consistencyCheckJson === 'string'
                ? JSON.parse(assessment.consistencyCheckJson)
                : assessment.consistencyCheckJson)
            : null;
          if (
            consistencyRaw &&
            consistencyRaw.status === 'complete' &&
            Array.isArray(consistencyRaw.mismatches)
          ) {
            const highMismatches = consistencyRaw.mismatches.filter(
              (m: any) => m.severity === 'high'
            );
            const checkConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = consistencyRaw.confidence ?? 'LOW';
            if (highMismatches.length > 0 && checkConfidence !== 'LOW') {
              multiSourceConflict = {
                confidence: checkConfidence,
                highSeverityMismatchCount: highMismatches.length,
                details: highMismatches
                  .map((m: any) => m.details)
                  .slice(0, 2) // include up to 2 details in the fraud explanation
                  .join('; '),
              };
            }
          }
        } catch { /* ignore parse errors — signal simply won't be injected */ }

        const weightedFraud = computeWeightedFraudScore({
          consistencyScore: Number(consistencyScore),
          aiEstimatedCost,
          quotedAmount: primaryQuotedAmount,
          impactDirection,
          damageZones,
          hasPreviousClaims: false, // TODO: wire to claims history lookup
          missingDataCount,
          aiIndicators: fraudIndicators.map(i => ({ label: i.indicator, points: i.score })),
          multiSourceConflict,
        });
        // Stage 27: validate and auto-heal before sending to frontend
        // Include claimId so the AI_ASSESSMENT_CONTRACT critical field check passes
        const rawResponse = { ...result, costExtraction, weightedFraud, claimId: input.claimId };
        return validateAiAssessmentResponse(rawResponse as Record<string, unknown>, input.claimId) as typeof rawResponse;
      }),

    // Save an immutable Decision Snapshot — called once per decision render
    saveSnapshot: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        verdict: z.object({
          decision: z.string(),
          primaryReason: z.string(),
          confidence: z.number(),
        }),
        cost: z.object({
          aiEstimate: z.number(),
          quoted: z.number(),
          deviationPercent: z.number(),
          fairRangeMin: z.number(),
          fairRangeMax: z.number(),
          verdict: z.string(),
        }),
        fraud: z.object({
          score: z.number(),
          level: z.string(),
          contributions: z.array(z.object({ factor: z.string(), value: z.number() })),
        }),
        physics: z.object({
          deltaV: z.number(),
          velocityRange: z.string(),
          energyKj: z.number(),
          forceKn: z.number(),
          estimated: z.boolean(),
        }),
        damage: z.object({
          zones: z.array(z.string()),
          severity: z.string(),
          consistencyScore: z.number(),
        }),
        enforcementTrace: z.array(z.object({
          rule: z.string(),
          value: z.unknown(),
          threshold: z.string(),
          triggered: z.boolean(),
        })),
        confidenceBreakdown: z.array(z.object({
          factor: z.string(),
          penalty: z.number(),
        })),
        dataQuality: z.object({
          missingFields: z.array(z.string()),
          estimatedFields: z.array(z.string()),
          extractionConfidence: z.number(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        const { saveDecisionSnapshot } = await import('./db');
        const { getOrCreateLifecycle } = await import('./decision-lifecycle');
        const tenantId = ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown';
        const result = await saveDecisionSnapshot({
          ...input,
          tenantId,
          createdByUserId: ctx.user?.id,
        });
        // Ensure lifecycle record exists (creates DRAFT if new)
        const lifecycle = await getOrCreateLifecycle(input.claimId, tenantId);
        return {
          success: true,
          snapshotId: result.id,
          version: result.version,
          lifecycle_state: lifecycle.lifecycle_state,
          is_final: lifecycle.is_final,
          is_locked: lifecycle.is_locked,
        };
      }),

    // Get the latest spec-compliant snapshot JSON for a claim (verbatim snake_case, no nulls)
    getLatestSnapshot: protectedProcedure
      .input(z.object({ claimId: z.string() }))
      .query(async ({ input }) => {
        const { getLatestSnapshotJson } = await import('./db');
        const snapshot = await getLatestSnapshotJson(input.claimId);
        return snapshot ?? null;
      }),

    // Re-run current engine logic against an original snapshot and return a structured diff
    replayDecision: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        snapshotVersion: z.number().optional(), // defaults to latest
        // Optional live claim data to supplement snapshot fields
        liveData: z.object({
          damageComponents: z.array(z.string()).optional(),
          impactDirection: z.string().optional(),
          vehicleMake: z.string().optional(),
          vehicleMassKg: z.number().optional(),
          hasPreviousClaims: z.boolean().optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getLatestSnapshotJson } = await import('./db');
        const { replayDecision } = await import('./decision-replay');
        const { getOrCreateLifecycle, isReplayAllowed, saveReplayLog } = await import('./decision-lifecycle');
        const tenantId = ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown';

        // Fetch the original immutable snapshot
        const originalSnapshot = await getLatestSnapshotJson(input.claimId);
        if (!originalSnapshot) {
          throw new Error(`No snapshot found for claim ${input.claimId}`);
        }

        // LIFECYCLE GUARD: replay is blocked when state = LOCKED
        const lifecycle = await getOrCreateLifecycle(input.claimId, tenantId);
        if (!isReplayAllowed(lifecycle.lifecycle_state)) {
          throw new Error(
            `Replay blocked: claim ${input.claimId} is LOCKED. ` +
            `A LOCKED claim is an immutable legal record and cannot be replayed.`
          );
        }

        // Re-run current logic — original snapshot is NEVER modified
        const result = replayDecision(originalSnapshot, input.liveData);

        // Persist replay result to replay_logs (never overwrites original snapshot)
        await saveReplayLog({
          claimId: input.claimId,
          tenantId,
          originalSnapshotVersion: originalSnapshot.snapshot_version,
          originalVerdict: result.original_verdict,
          newVerdict: result.new_verdict,
          changed: result.changed,
          differences: result.differences,
          impactAnalysis: result.impact_analysis,
          replayResult: result,
          replayedByUserId: ctx.user?.id,
          lifecycleStateAtReplay: lifecycle.lifecycle_state,
        });

        return {
          ...result,
          lifecycle_state: lifecycle.lifecycle_state,
          is_final: lifecycle.is_final,
          is_locked: lifecycle.is_locked,
        };
      }),

    // ─── Lifecycle procedures ──────────────────────────────────────────────────

    // Get the current lifecycle state for a claim
    getLifecycle: protectedProcedure
      .input(z.object({ claimId: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getOrCreateLifecycle } = await import('./decision-lifecycle');
        const tenantId = ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown';
        return getOrCreateLifecycle(input.claimId, tenantId);
      }),

    // Mark the decision as REVIEWED (user has viewed/reviewed the decision)
    markReviewed: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        reason: z.string().min(10, 'Reason must be at least 10 characters'),
      }))
      .mutation(async ({ input, ctx }) => {
        const { transitionLifecycle } = await import('./decision-lifecycle');
        const { enforceGovernance } = await import('./decision-governance');
        const tenantId = ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown';

        // Rule 1 + Rule 5: validate reason and write audit entry
        const governance = await enforceGovernance({
          claimId: input.claimId,
          tenantId,
          action: 'REVIEWED',
          performedBy: ctx.user?.id ?? 'unknown',
          performedByName: ctx.user?.name,
          reason: input.reason,
        });
        if (!governance.action_allowed) {
          return {
            success: false,
            lifecycle_state: 'DRAFT' as const,
            is_final: false,
            is_locked: false,
            action_allowed: false,
            validation_errors: governance.validation_errors,
            override_flag: false,
          };
        }

        const result = await transitionLifecycle(input.claimId, tenantId, 'REVIEWED', {
          userId: ctx.user?.id,
        });
        if (!result.success) throw new Error(result.error);
        return {
          ...result,
          action_allowed: true,
          validation_errors: [] as string[],
          override_flag: false,
        };
      }),

    // Finalise the decision — creates authoritative snapshot, sets state = FINALISED
    finaliseDecision: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        finalDecisionChoice: z.enum(['FINALISE_CLAIM', 'REVIEW_REQUIRED', 'ESCALATE_INVESTIGATION']),
        reason: z.string().min(10, 'Reason must be at least 10 characters'),
        // Optional: AI decision for override detection
        aiDecision: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { transitionLifecycle, markAuthoritativeSnapshot } = await import('./decision-lifecycle');
        const { getDecisionSnapshots } = await import('./db');
        const { enforceGovernance } = await import('./decision-governance');
        const tenantId = ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown';

        // Rule 1 + Rule 2 + Rule 5: validate, detect override, write audit
        const governance = await enforceGovernance({
          claimId: input.claimId,
          tenantId,
          action: 'FINALISED',
          performedBy: ctx.user?.id ?? 'unknown',
          performedByName: ctx.user?.name,
          reason: input.reason,
          aiDecision: input.aiDecision,
          humanDecision: input.finalDecisionChoice,
          metadata: { finalDecisionChoice: input.finalDecisionChoice },
        });
        if (!governance.action_allowed) {
          return {
            success: false,
            lifecycle_state: 'DRAFT' as const,
            is_final: false,
            is_locked: false,
            action_allowed: false,
            validation_errors: governance.validation_errors,
            override_flag: governance.override_flag,
            authoritative_snapshot_id: null as number | null,
            final_decision_choice: input.finalDecisionChoice,
          };
        }

        // Get the latest snapshot ID to mark as authoritative
        const snapshots = await getDecisionSnapshots(input.claimId);
        const latestSnapshot = snapshots[0]; // ordered by createdAt desc
        if (!latestSnapshot) {
          throw new Error(`No snapshot found for claim ${input.claimId}. Cannot finalise without a snapshot.`);
        }

        // Transition to FINALISED
        const result = await transitionLifecycle(input.claimId, tenantId, 'FINALISED', {
          userId: ctx.user?.id,
          finalDecisionChoice: input.finalDecisionChoice,
          authoritativeSnapshotId: latestSnapshot.id,
        });
        if (!result.success) throw new Error(result.error);

        // Mark the snapshot as the authoritative final record
        await markAuthoritativeSnapshot(latestSnapshot.id);

        return {
          ...result,
          action_allowed: true,
          validation_errors: [] as string[],
          override_flag: governance.override_flag,
          override: governance.override,
          authoritative_snapshot_id: latestSnapshot.id,
          final_decision_choice: input.finalDecisionChoice,
        };
      }),

    // Lock the claim — immutable legal record, no further replays or recalculations
    lockDecision: protectedProcedure
      .input(z.object({
        claimId: z.string(),
        reason: z.string().min(10, 'Reason must be at least 10 characters'),
      }))
      .mutation(async ({ input, ctx }) => {
        const { transitionLifecycle } = await import('./decision-lifecycle');
        const { enforceGovernance } = await import('./decision-governance');
        const tenantId = ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown';

        // Rule 1 + Rule 3 + Rule 5: validate reason, verify lock conditions, write audit
        const governance = await enforceGovernance({
          claimId: input.claimId,
          tenantId,
          action: 'LOCKED',
          performedBy: ctx.user?.id ?? 'unknown',
          performedByName: ctx.user?.name,
          reason: input.reason,
        });
        if (!governance.action_allowed) {
          return {
            success: false,
            lifecycle_state: 'FINALISED' as const,
            is_final: true,
            is_locked: false,
            action_allowed: false,
            validation_errors: governance.validation_errors,
            override_flag: false,
          };
        }

        const result = await transitionLifecycle(input.claimId, tenantId, 'LOCKED', {
          userId: ctx.user?.id,
        });
        if (!result.success) throw new Error(result.error);
        return {
          ...result,
          action_allowed: true,
          validation_errors: [] as string[],
          override_flag: false,
        };
      }),

    // Get governance audit log for a claim
    getAuditLog: protectedProcedure
      .input(z.object({ claimId: z.string() }))
      .query(async ({ input }) => {
        const { getAuditLog } = await import('./decision-governance');
        return getAuditLog(input.claimId);
      }),

    // Generate full tamper-evident audit export for a claim
    getAuditExport: protectedProcedure
      .input(z.object({ claimId: z.string() }))
      .query(async ({ input }) => {
        const { generateAuditExport, validateAuditExport, AuditExportBlockedError } = await import('./audit-export');
        try {
          const result = await generateAuditExport(input.claimId);
          return { export_allowed: true as const, reason: 'All checks passed', checks: [], data: result };
        } catch (err) {
          if (err instanceof AuditExportBlockedError) {
            // Return spec-compliant blocked response — do NOT throw a TRPCError
            // so the frontend can read the structured validation details.
            return {
              export_allowed: false as const,
              reason: 'Missing or inconsistent audit data',
              checks: err.checks,
              data: null,
            };
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: err instanceof Error ? err.message : 'Audit export failed',
          });
        }
      }),

    // Validate export preconditions without generating the export
    validateAuditExport: protectedProcedure
      .input(z.object({ claimId: z.string() }))
      .query(async ({ input }) => {
        const { validateAuditExport } = await import('./audit-export');
        return validateAuditExport(input.claimId);
      }),

    // ─── Shadow Override Monitor (passive observation only) ─────────────────

    // Run a full shadow scan across all users who have ever overridden
    runShadowScan: protectedProcedure
      .mutation(async () => {
        const { runFullShadowScan } = await import('./shadow-override-monitor');
        // Shadow mode: no blocking, no escalation, no user notification
        return runFullShadowScan();
      }),

    // Get the latest stored observation for a specific user
    getShadowObservation: protectedProcedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input }) => {
        const { getLatestObservation } = await import('./shadow-override-monitor');
        return getLatestObservation(input.userId);
      }),

    // Get all stored shadow observations (latest per user)
    getAllShadowObservations: protectedProcedure
      .query(async () => {
        const { getAllObservations } = await import('./shadow-override-monitor');
        return getAllObservations();
      }),

    // ─── Shadow Monitoring Reports (role-based, observation only) ────────────

    // Generate a shadow monitoring report for a specific role
    generateShadowReport: protectedProcedure
      .input(z.object({
        role: z.enum(["claims_manager", "risk_manager", "executive"]),
        periodDays: z.number().int().min(1).max(90).default(7),
      }))
      .mutation(async ({ input }) => {
        const { generateShadowReport } = await import('./shadow-report-generator');
        return generateShadowReport(input.role, input.periodDays);
      }),

    // Generate all three role reports in a single call
    generateAllShadowReports: protectedProcedure
      .input(z.object({
        periodDays: z.number().int().min(1).max(90).default(7),
      }))
      .mutation(async ({ input }) => {
        const { generateAllShadowReports } = await import('./shadow-report-generator');
        return generateAllShadowReports(input.periodDays);
      }),

    // Get replay logs for a claim
    getReplayLogs: protectedProcedure
      .input(z.object({ claimId: z.string() }))
      .query(async ({ input }) => {
        const { getReplayLogs } = await import('./decision-lifecycle');
        return getReplayLogs(input.claimId);
      }),

    // ─── Output Validation Engine (10-Rule Spec) ────────────────────────────
    // Runs all 10 output validation rules on a stored assessment before UI render.
    // Returns: { status, corrections, suppressed_fields, flags, final_output, notes }
    validate: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const { runOutputValidation } = await import('./output-validation-engine');
        const { getAiAssessmentByClaimId, getQuotesByClaimId } = await import('./db');
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
        if (!assessment) return null;
        // Parse cost intelligence JSON
        let costIntel: any = null;
        try {
          costIntel = assessment.costIntelligenceJson
            ? (typeof assessment.costIntelligenceJson === 'string'
                ? JSON.parse(assessment.costIntelligenceJson)
                : assessment.costIntelligenceJson)
            : null;
        } catch { /* ignore */ }
        // Parse physics analysis JSON
        let physicsRaw: any = null;
        try {
          physicsRaw = assessment.physicsAnalysis
            ? (typeof assessment.physicsAnalysis === 'string'
                ? JSON.parse(assessment.physicsAnalysis)
                : assessment.physicsAnalysis)
            : null;
        } catch { /* ignore */ }
        // Parse damaged components
        let damagedComponents: string[] = [];
        try {
          const comps = assessment.damagedComponentsJson
            ? (typeof assessment.damagedComponentsJson === 'string'
                ? JSON.parse(assessment.damagedComponentsJson)
                : assessment.damagedComponentsJson)
            : [];
          damagedComponents = Array.isArray(comps)
            ? comps.map((c: any) => (typeof c === 'string' ? c : c?.name || c?.component || '')).filter(Boolean)
            : [];
        } catch { /* ignore */ }
        // Parse image URLs
        let imageUrls: string[] = [];
        try {
          const imgs = assessment.imageUrls
            ? (typeof assessment.imageUrls === 'string'
                ? JSON.parse(assessment.imageUrls)
                : assessment.imageUrls)
            : [];
          imageUrls = Array.isArray(imgs) ? imgs.filter(Boolean) : [];
        } catch { /* ignore */ }
        // Determine if physics model actually ran (has non-zero speed or force)
        const physicsExecuted = !!(physicsRaw &&
          (physicsRaw.estimatedSpeedKmh > 0 || physicsRaw.impactForceKn > 0 || physicsRaw.deltaVKmh > 0));
        const impactSpeedKmh = physicsRaw?.estimatedSpeedKmh ?? physicsRaw?.estimatedSpeed?.value ?? null;
        const impactForceKn = physicsRaw?.impactForceKn ?? null;
        const severityClassification = physicsRaw?.accidentSeverity ?? assessment.structuralDamageSeverity ?? null;
        const hasVectors = !!(physicsRaw?.impactVector?.direction && physicsRaw?.impactVector?.direction !== 'unknown');
        // Image processing ran if damagedComponents were extracted
        const imageProcessingRan = damagedComponents.length > 0;
        // AI estimate in USD (stored as dollars)
        const aiEstimateUsd = assessment.estimatedCost ? Number(assessment.estimatedCost) : null;
        // Cost intel fields
        const documentedOriginalQuoteUsd = costIntel?.documentedOriginalQuoteUsd ?? null;
        const documentedAgreedCostUsd = costIntel?.documentedAgreedCostUsd ?? null;
        const panelBeaterFromCostIntel = costIntel?.panelBeaterName ?? null;
        return runOutputValidation({
          claimId: input.claimId,
          claimNumber: assessment.claimNumber ?? null,
          rawVerdict: assessment.recommendation ?? null,
          confidenceScore: assessment.confidenceScore ?? 0,
          fraudScore: assessment.fraudScore ?? 0,
          fraudLevel: assessment.fraudRiskLevel ?? null,
          aiEstimateUsd,
          documentedOriginalQuoteUsd,
          documentedAgreedCostUsd,
          costBasis: assessment.costBasis ?? null,
          panelBeaterFromCostIntel,
          panelBeaterFromAssessor: assessment.panelBeaterName ?? null,
          repairerName: assessment.repairerName ?? null,
          accidentDescription: assessment.accidentDescription ?? null,
          imageUrls,
          imageProcessingRan,
          damagedComponents,
          physicsExecuted,
          impactSpeedKmh: impactSpeedKmh ? Number(impactSpeedKmh) : null,
          impactForceKn: impactForceKn ? Number(impactForceKn) : null,
          severityClassification,
          hasVectors,
          accidentType: assessment.accidentType ?? null,
          structuralDamage: !!(assessment.structuralDamage),
          vehicleMake: assessment.vehicleMake ?? null,
          vehicleModel: assessment.vehicleModel ?? null,
          vehicleYear: assessment.vehicleYear ? Number(assessment.vehicleYear) : null,
          vehicleRegistration: assessment.vehicleRegistration ?? null,
          accidentDate: assessment.accidentDate ?? null,
          accidentLocation: assessment.accidentLocation ?? null,
        });
      }),
    // Retrieve all snapshots for a claim (audit history)
    getSnapshots: protectedProcedure
      .input(z.object({ claimId: z.string() }))
      .query(async ({ input }) => {
        const { getDecisionSnapshots } = await import('./db');
        const snapshots = await getDecisionSnapshots(input.claimId);
        return snapshots.map(s => ({
          id: s.id,
          version: s.snapshotVersion,
          createdAt: s.createdAt,
          createdByUserId: s.createdByUserId,
          verdict: {
            decision: s.verdictDecision,
            primaryReason: s.verdictPrimaryReason,
            confidence: s.verdictConfidence,
          },
          cost: {
            aiEstimate: s.costAiEstimate,
            quoted: s.costQuoted,
            deviationPercent: s.costDeviationPercent,
            fairRangeMin: s.costFairRangeMin,
            fairRangeMax: s.costFairRangeMax,
            verdict: s.costVerdict,
          },
          fraud: {
            score: s.fraudScore,
            level: s.fraudLevel,
            contributions: JSON.parse(s.fraudContributionsJson || '[]'),
          },
          physics: {
            deltaV: s.physicsDetlaV / 10,
            velocityRange: s.physicsVelocityRange,
            energyKj: s.physicsEnergyKj,
            forceKn: s.physicsForceKn,
            estimated: s.physicsEstimated === 1,
          },
          damage: {
            zones: JSON.parse(s.damageZonesJson || '[]'),
            severity: s.damageSeverity,
            consistencyScore: s.damageConsistencyScore,
          },
          enforcementTrace: JSON.parse(s.enforcementTraceJson || '[]'),
          confidenceBreakdown: JSON.parse(s.confidenceBreakdownJson || '[]'),
          dataQuality: {
            missingFields: JSON.parse(s.missingFieldsJson || '[]'),
            estimatedFields: JSON.parse(s.estimatedFieldsJson || '[]'),
            extractionConfidence: s.extractionConfidence,
          },
        }));
      }),
  }),
  // Storage operationss
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

         // Validate vehicle details are available
        if (!claim.vehicleMake || !claim.vehicleModel) {
          throw new Error(
            `Vehicle make and model are required for valuation. ` +
            `This claim has not yet had its vehicle details extracted from the PDF. ` +
            `Please re-run the AI assessment first to extract vehicle details from the uploaded document.`
          );
        }
        // Get assessor evaluation for repair cost
        const evaluation = await getAssessorEvaluationByClaimId(input.claimId);
        const repairCost = evaluation?.estimatedRepairCost;

        // ── Mileage resolution ────────────────────────────────────────────────
        // If the user did not supply a mileage, estimate it from vehicle year/type.
        // The estimate carries LOW confidence and reduces the overall valuation
        // confidence score by 20 points.
        const { estimateMileageFromYear } = await import("./services/mileageEstimation");
        let resolvedMileage: number | undefined = input.mileage;
        let mileageEstimation: ReturnType<typeof estimateMileageFromYear> | null = null;
        if (!resolvedMileage) {
          const vehicleYear = claim.vehicleYear || new Date().getFullYear();
          mileageEstimation = estimateMileageFromYear(
            vehicleYear,
            claim.vehicleMake,
            claim.vehicleModel,
          );
          resolvedMileage = mileageEstimation.assumed_mileage_used;
        }

        // Import valuation service
        const { valuateVehicle } = await import("./services/vehicleValuation");
        // Perform valuation
        const valuation = await valuateVehicle(
          {
            make: claim.vehicleMake || '',
            model: claim.vehicleModel || '',
            year: claim.vehicleYear || new Date().getFullYear(),
            mileage: resolvedMileage,
            condition: input.condition,
            country: 'Zimbabwe',
          },
          repairCost ?? undefined
        );

        // Apply confidence penalty when mileage was estimated
        if (mileageEstimation) {
          valuation.confidenceScore = Math.max(10, (valuation.confidenceScore ?? 50) - 20);
          valuation.notes = [
            `⚠️ MILEAGE ESTIMATED: ${mileageEstimation.warning_message}`,
            `Estimated range: ${mileageEstimation.estimated_mileage_range[0].toLocaleString()}–${mileageEstimation.estimated_mileage_range[1].toLocaleString()} km (midpoint ${mileageEstimation.assumed_mileage_used.toLocaleString()} km used)`,
            ...valuation.notes,
          ];
        }

        // Save valuation to database
        const valuationId = await createVehicleMarketValuation({
          claimId: input.claimId,
          vehicleMake: claim.vehicleMake || '',
          vehicleModel: claim.vehicleModel || '',
          vehicleYear: claim.vehicleYear || new Date().getFullYear(),
          vehicleRegistration: claim.vehicleRegistration,
          mileage: resolvedMileage,
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
          changeDescription: `Vehicle valued at $${(valuation.finalAdjustedValue / 100).toFixed(2)}${valuation.isTotalLoss ? ' - TOTAL LOSS' : ''}${mileageEstimation ? ' (mileage estimated)' : ''}`,
        });

        // Sync vehicle market value to claims table for repair ratio calculation
        await getDb().update(claims).set({ vehicleMarketValue: valuation.finalAdjustedValue }).where(eq(claims.id, input.claimId));

        // Return valuation enriched with mileage estimation metadata
        return {
          ...valuation,
          mileageEstimation: mileageEstimation ? {
            estimated_mileage_range: mileageEstimation.estimated_mileage_range,
            assumed_mileage_used: mileageEstimation.assumed_mileage_used,
            confidence: mileageEstimation.confidence,
            source: mileageEstimation.source,
            warning_message: mileageEstimation.warning_message,
          } : null,
        };
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

    /**
     * Stage 11 — Enrich damage photos with vision AI analysis.
     *
     * Runs per-image vision analysis on all uploaded damage photos for a claim,
     * assigns confidence scores, and cross-checks findings against the reported
     * damage description and AI-extracted components.
     *
     * Results are stored in enrichedPhotosJson and photoInconsistenciesJson
     * on the aiAssessments record.
     */
    enrichPhotos: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const allowedRoles = ['admin', 'insurer', 'assessor'];
        if (!allowedRoles.includes(ctx.user.role)) {
          throw new Error('Insufficient permissions to run photo enrichment');
        }

        const { getDb } = await import('./db');
        const { aiAssessments, claims } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const { enrichDamagePhotos } = await import('./services/photoEnrichment');

        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // Load the claim and its latest AI assessment
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        const { getAiAssessmentByClaimId, getClaimById } = await import('./db');
        const [assessment, claim] = await Promise.all([
          getAiAssessmentByClaimId(input.claimId, tenantId),
          getClaimById(input.claimId, tenantId),
        ]);

        if (!assessment) throw new Error('No AI assessment found for this claim');
        if (!claim) throw new Error('Claim not found');

        // Extract photo URLs from damagePhotosJson
        let photoUrls: string[] = [];
        if (assessment.damagePhotosJson) {
          try {
            const parsed = JSON.parse(assessment.damagePhotosJson);
            if (Array.isArray(parsed)) {
              photoUrls = parsed.map((p: any) =>
                typeof p === 'string' ? p : (p.imageUrl || p.url || '')
              ).filter(Boolean);
            }
          } catch { /* ignore parse errors */ }
        }

        if (photoUrls.length === 0) {
          return { enriched_photos: [], inconsistencies: [], summary: { totalPhotos: 0, analyzedPhotos: 0, unusablePhotos: 0, inconsistencyCount: 0, averageConfidence: 0 } };
        }

        // Extract AI-extracted components from damagedComponentsJson
        let aiExtractedComponents: string[] = [];
        if (assessment.damagedComponentsJson) {
          try {
            const parsed = JSON.parse(assessment.damagedComponentsJson);
            if (Array.isArray(parsed)) {
              aiExtractedComponents = parsed.map((c: any) =>
                typeof c === 'string' ? c : (c.name || c.component || '')
              ).filter(Boolean);
            }
          } catch { /* ignore */ }
        }

        // Run enrichment
        const result = await enrichDamagePhotos({
          photoUrls,
          reportedDamageDescription: claim.damageDescription ?? assessment.damageDescription,
          aiExtractedComponents,
        });

        // Persist enrichment results
        await db.update(aiAssessments)
          .set({
            enrichedPhotosJson: JSON.stringify(result.enriched_photos),
            photoInconsistenciesJson: JSON.stringify(result.inconsistencies),
          })
          .where(eq(aiAssessments.id, assessment.id));

        // ─── Auto-trigger Stage 12: Damage Consistency Check ─────────────────
        // After enrichment, attempt to run the consistency check automatically.
        // The runDamageConsistencyCheck function enforces its own pre-conditions
        // internally (document components, enriched photos, physics zone) and
        // returns a pending_inputs result if any condition is unmet — so we
        // can always call it safely here.
        let consistencyResult: any = null;
        try {
          const { runDamageConsistencyCheck } = await import('./services/damageConsistency');
          const { generateMismatchNarratives } = await import('./services/mismatchNarrative');

          // Re-read the freshly persisted assessment so enrichedPhotosJson is current
          const freshAssessment = await getAiAssessmentByClaimId(input.claimId, tenantId);

          if (freshAssessment) {
            consistencyResult = await runDamageConsistencyCheck({
              damagedComponentsJson: freshAssessment.damagedComponentsJson ?? null,
              damageDescription: freshAssessment.damageDescription ?? null,
              enrichedPhotosJson: freshAssessment.enrichedPhotosJson ?? null,
              physicsAnalysisJson: freshAssessment.physicsAnalysis ?? null,
              triggerSource: 'auto',
            });

            // Attach narratives when the check completed
            if (consistencyResult.status === 'complete' && consistencyResult.mismatches.length > 0) {
              try {
                const narratives = await generateMismatchNarratives(consistencyResult.mismatches, { useLlm: false });
                const mismatchesWithNarratives = consistencyResult.mismatches.map((m: any, i: number) => ({
                  ...m,
                  narrative: narratives[i]?.explanation ?? null,
                  narrative_source: narratives[i]?.source ?? 'template',
                }));
                consistencyResult = { ...consistencyResult, mismatches: mismatchesWithNarratives };
              } catch { /* narrative failure must not block the consistency result */ }
            }

            // Persist the consistency result
            await db.update(aiAssessments)
              .set({ consistencyCheckJson: JSON.stringify(consistencyResult) })
              .where(eq(aiAssessments.id, freshAssessment.id));

            // ─── Update fraud score if consistency check completed ────────────
            // Only update when the check produced a complete result with
            // high-severity mismatches — the weighted scorer handles the
            // confidence-based weighting (HIGH→12, MEDIUM→5, LOW→0).
            if (consistencyResult.status === 'complete') {
              try {
                const { computeWeightedFraudScore } = await import('./weighted-fraud-scoring');
                const highSeverityMismatches = consistencyResult.mismatches.filter(
                  (m: any) => m.severity === 'high'
                );

                if (highSeverityMismatches.length > 0) {
                  // Build a minimal input using the consistency result
                  const fraudInput = {
                    consistencyScore: consistencyResult.consistency_score,
                    multiSourceConflict: {
                      confidence: consistencyResult.confidence as 'HIGH' | 'MEDIUM' | 'LOW',
                      highSeverityMismatchCount: highSeverityMismatches.length,
                      details: highSeverityMismatches.map((m: any) => m.details).join('; '),
                    },
                  };
                  const fraudResult = computeWeightedFraudScore(fraudInput);

                  // Persist the updated fraud score back to the assessment
                  if (freshAssessment.fraudScore !== null && freshAssessment.fraudScore !== undefined) {
                    // Blend: take the higher of the existing score and the new conflict penalty
                    const conflictPenalty = fraudResult.contributions
                      .find((c: any) => c.factor === 'Multi-Source Damage Conflict')?.value ?? 0;
                    const updatedScore = Math.min(100, (freshAssessment.fraudScore as number) + conflictPenalty);
                    await db.update(aiAssessments)
                      .set({ fraudScore: updatedScore })
                      .where(eq(aiAssessments.id, freshAssessment.id));
                  }
                }
              } catch { /* fraud score update failure must not block the enrichment response */ }
            }
          }
        } catch { /* auto-trigger failure must never block the enrichment response */ }

        return {
          ...result,
          auto_consistency_check: consistencyResult
            ? { status: consistencyResult.status, triggered: true }
            : { status: 'skipped', triggered: false },
        };
      }),

    /**
     * Stage 12: Three-source damage consistency check
     *
     * Compares document-extracted damage, photo-detected damage, and physics
     * impact zone to produce a consistency_score and typed mismatches[].
     * Stores the result in consistencyCheckJson on the aiAssessment record.
     */
    runConsistencyCheck: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const assessment = await getAiAssessmentByClaimId(input.claimId);
        if (!assessment) throw new TRPCError({ code: 'NOT_FOUND', message: 'No AI assessment found for this claim' });

        const { runDamageConsistencyCheck } = await import('./services/damageConsistency');

        // Manual trigger always passes triggerSource: 'manual'
        const result = await runDamageConsistencyCheck({
          damagedComponentsJson: assessment.damagedComponentsJson ?? null,
          damageDescription: assessment.damageDescription ?? null,
          enrichedPhotosJson: assessment.enrichedPhotosJson ?? null,
          physicsAnalysisJson: assessment.physicsAnalysis ?? null,
          triggerSource: 'manual',
        });

        // Generate natural-language narratives for each mismatch when the
        // check completed successfully. Template engine only (useLlm: false)
        // to keep response latency predictable; LLM enrichment can be added
        // as a background job in a future iteration.
        let resultWithNarratives: typeof result = result;
        if (result.status === 'complete' && result.mismatches.length > 0) {
          try {
            const { generateMismatchNarratives } = await import('./services/mismatchNarrative');
            const narratives = await generateMismatchNarratives(result.mismatches, { useLlm: false });
            // Attach narrative to each mismatch by index
            const mismatchesWithNarratives = result.mismatches.map((m, i) => ({
              ...m,
              narrative: narratives[i]?.explanation ?? null,
              narrative_source: narratives[i]?.source ?? 'template',
            }));
            resultWithNarratives = { ...result, mismatches: mismatchesWithNarratives } as typeof result;
          } catch { /* narrative generation failure must not block the consistency result */ }
        }

        // Always persist the result — including pending_inputs so the UI
        // can display which conditions are still missing.
        await db.update(aiAssessments)
          .set({ consistencyCheckJson: JSON.stringify(resultWithNarratives) })
          .where(eq(aiAssessments.id, assessment.id));

        return resultWithNarratives;
      }),

    /**
     * Record an adjuster annotation (confirm/dismiss) on a specific mismatch.
     */
    annotate: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        assessmentId: z.number(),
        mismatchType: z.string(),
        mismatchIndex: z.number().default(0),
        action: z.enum(['confirm', 'dismiss']),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        if (!['assessor', 'insurer', 'admin'].includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only assessors, insurers, and admins may annotate mismatches' });
        }
        const { recordAnnotation } = await import('./services/mismatchAnnotation');
        const result = await recordAnnotation({
          claimId: input.claimId,
          assessmentId: input.assessmentId,
          mismatchType: input.mismatchType as any,
          mismatchIndex: input.mismatchIndex,
          action: input.action,
          note: input.note,
          userId: ctx.user.id,
          userRole: ctx.user.role,
        });
        return { success: true, annotationId: result.id };
      }),

    /**
     * Get annotation stats for a specific claim.
     */
    getClaimStats: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const { getClaimAnnotationStats, getClaimAnnotations } = await import('./services/mismatchAnnotation');
        const [stats, annotations] = await Promise.all([
          getClaimAnnotationStats(input.claimId),
          getClaimAnnotations(input.claimId),
        ]);
        return { stats, annotations };
      }),

    /**
     * Get global adaptive weights across all claims.
     * Admin-only — returns system-wide confirmation rates and weight multipliers.
     */
    getAdaptiveWeights: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins may view global adaptive weights' });
        }
        const { getAdaptiveWeights } = await import('./services/mismatchAnnotation');
        return getAdaptiveWeights();
      }),

    /**
     * Get the weight adjustment log.
     * Admin-only — returns the timestamped audit trail of every adaptive
     * weight calibration event (Stage 23).
     * Optionally filtered by mismatch_type; defaults to most recent 100 entries.
     */
    getWeightAdjustmentLog: protectedProcedure
      .input(z.object({
        mismatchType: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins may view the weight adjustment log' });
        }
        const { getWeightAdjustmentLog } = await import('./services/mismatchAnnotation');
        return getWeightAdjustmentLog(
          input.mismatchType as any,
          input.limit,
        );
      }),

    /**
     * Get the full version history for all mismatch narratives in an assessment.
     * Returns rows ordered by mismatch_index ASC, version ASC.
     */
    getNarrativeVersionHistory: protectedProcedure
      .input(z.object({ assessmentId: z.number() }))
      .query(async ({ input }) => {
        const { getNarrativeVersionHistory } = await import('./services/mismatchNarrative');
        return getNarrativeVersionHistory(input.assessmentId);
      }),

  }),
  // (admin router procedures moved to server/routers/admin.ts)
  /**
   * Incident Type Override Routerr
   *
   * Allows assessors/insurers/admins to manually override the AI-detected
   * incident type, preserving the original value and re-running downstream
   * impact direction and damage consistency validations.
   */
  incidentType: router({
    /**
     * Override the incident type for a claim.
     *
     * @param claimId   - Claim to update
     * @param newType   - The corrected incident type
     * @param reason    - Mandatory reason for the override
     */
    override: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        newType: z.enum(['collision','theft','hail','fire','vandalism','flood','hijacking','other']),
        reason: z.string().min(5, 'Please provide a reason of at least 5 characters'),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        if (!['assessor', 'insurer', 'admin'].includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only assessors, insurers, and admins may override incident type' });
        }

        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });

        const previousType = claim.incidentType;

        // ── 1. Fetch AI assessment for re-validation context ──────────────
        const aiAssessment = await getAiAssessmentByClaimId(input.claimId, tenantId);

        // Extract damage zones from physics analysis if available
        let damageZones: string[] = [];
        let damagedComponents: string[] = [];
        if (aiAssessment) {
          try {
            if (aiAssessment.physicsAnalysisParsed?.impactZones) {
              damageZones = aiAssessment.physicsAnalysisParsed.impactZones.map(
                (z: any) => (typeof z === 'string' ? z : z?.zone ?? z?.name ?? '')
              ).filter(Boolean);
            }
          } catch { /* ignore parse errors */ }
          try {
            if (aiAssessment.damagedComponentsJson) {
              const parsed = JSON.parse(aiAssessment.damagedComponentsJson);
              damagedComponents = Array.isArray(parsed)
                ? parsed.map((c: any) => (typeof c === 'string' ? c : c?.name ?? c?.component ?? '')).filter(Boolean)
                : [];
            }
          } catch { /* ignore parse errors */ }
        }

        // ── 2. Run re-validation ──────────────────────────────────────────
        const { revalidateIncidentType } = await import('./services/incidentTypeRevalidation');
        const revalidation = await revalidateIncidentType({
          newIncidentType: input.newType,
          incidentDescription: claim.incidentDescription,
          damageZones,
          damagedComponents,
          aiAssessmentSummary: aiAssessment?.damageDescription,
        });

        // ── 3. Persist override + revalidation result ─────────────────────
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

        await db.update(claims).set({
          incidentType: input.newType,
          // Preserve original AI value only on first override
          aiDetectedIncidentType: claim.incidentTypeOverridden
            ? (claim.aiDetectedIncidentType ?? previousType)
            : previousType,
          incidentTypeOverridden: 1,
          incidentTypeOverrideReason: input.reason,
          incidentTypeOverriddenBy: ctx.user.id,
          incidentTypeOverriddenAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          incidentTypeRevalidationJson: JSON.stringify(revalidation),
        } as any).where(eq(claims.id, input.claimId));

        // ── 4. Audit trail ────────────────────────────────────────────────
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: 'incident_type_overridden',
          entityType: 'claim',
          entityId: input.claimId,
          previousValue: previousType ?? undefined,
          newValue: input.newType,
          changeDescription:
            `Incident type changed from "${previousType ?? 'unknown'}" to "${input.newType}" ` +
            `by ${ctx.user.role}. Reason: ${input.reason}. ` +
            `Re-validation: ${revalidation.overallStatus.toUpperCase()}`,
        });

        return {
          success: true,
          previousType,
          newType: input.newType,
          aiDetectedType: claim.incidentTypeOverridden
            ? (claim.aiDetectedIncidentType ?? previousType)
            : previousType,
          revalidation,
        };
      }),

    /**
     * Get the current incident type override status for a claim.
     */
    getOverrideStatus: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        const tenantId = ctx.user?.role === 'admin' ? undefined : (ctx.user?.tenantId || 'default');
        const claim = await getClaimById(input.claimId, tenantId);
        if (!claim) return null;
        return {
          incidentType: claim.incidentType,
          isOverridden: !!(claim as any).incidentTypeOverridden,
          aiDetectedType: (claim as any).aiDetectedIncidentType ?? null,
          overrideReason: (claim as any).incidentTypeOverrideReason ?? null,
          overriddenAt: (claim as any).incidentTypeOverriddenAt ?? null,
          revalidation: (claim as any).incidentTypeRevalidationJson
            ? JSON.parse((claim as any).incidentTypeRevalidationJson)
            : null,
        };
      }),
  }),

  /**
   * Reports Router
   * 
   * Handles intelligent report generation for claims
   */
  claimReports: router({
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
        // ── Stage 31: Pre-export sanitisation ──────────────────────────────
        const sanitiseResult = sanitiseReportNarrative(narrative as unknown as Record<string, string>);
        if (!sanitiseResult.safe) {
          const blockErr = buildBlockError(sanitiseResult.blockedPhrases);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: blockErr.message,
            cause: blockErr,
          });
        }
        const safeNarrative = sanitiseResult.sanitised as unknown as typeof narrative;
        // ───────────────────────────────────────────────────────────────────
        // Generate visualizations
        const visualizations = generateReportVisualizations(intelligence);
        // Generate PDF
        const pdfBuffer = await generateReportPDF(
          intelligence,
          safeNarrative,
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
          sanitisationCorrections: sanitiseResult.corrections,
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
        // ── Stage 31: Pre-export sanitisation ──────────────────────────────
        const sanitiseResult = sanitiseReportNarrative(narrative as unknown as Record<string, string>);
        if (!sanitiseResult.safe) {
          const blockErr = buildBlockError(sanitiseResult.blockedPhrases);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: blockErr.message,
            cause: blockErr,
          });
        }
        const safeNarrative = sanitiseResult.sanitised as unknown as typeof narrative;
        // ───────────────────────────────────────────────────────────────────
        const visualizations = generateReportVisualizations(intelligence);
        // Generate PDF
        const pdfBuffer = await generateReportPDF(
          intelligence,
          safeNarrative,
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
    onboardFleetDriver: protectedProcedure
      .input(z.object({
        fleetId: z.number(),
        userId: z.number(),
        driverLicenseNumber: z.string(),
        licenseExpiry: z.string().optional(),
        licenseClass: z.string().optional(),
        hireDate: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [result] = await db.insert(fleetDrivers).values({
          fleetId: input.fleetId,
          userId: input.userId,
          driverLicenseNumber: input.driverLicenseNumber,
          licenseExpiry: input.licenseExpiry || null,
          licenseClass: input.licenseClass || null,
          hireDate: input.hireDate || null,
          emergencyContactName: input.emergencyContactName || null,
          emergencyContactPhone: input.emergencyContactPhone || null,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).$returningId();
        return { success: true, driverId: (result as any).id };
      }),
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
          ownerId: ctx.user.id,
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
        providerName: z.string(),
        quotedPrice: z.number(),
        estimatedDuration: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { submitServiceQuote } = await import('./fleet/service-marketplace');
        
        return submitServiceQuote({
          requestId: input.serviceRequestId,
          providerId: input.providerId,
          providerName: input.providerName,
          quotedAmount: Math.round(input.quotedPrice * 100),
          estimatedDuration: input.estimatedDuration,
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

  // Insurance Agency Platform
  insurance: router({
    // Get vehicle valuation estimate
    getVehicleValuation: publicProcedure
      .input(z.object({
        make: z.string(),
        model: z.string(),
        year: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { generateVehicleValuation } = await import('./insurance/valuation-engine');
        return generateVehicleValuation(input);
      }),

    // Request insurance quote
    requestQuote: publicProcedure
      .input(z.object({
        registrationNumber: z.string(),
        make: z.string(),
        model: z.string(),
        year: z.number(),
        currentValue: z.number(),
        driverAge: z.number(),
        annualMileage: z.enum(['low', 'medium', 'high']),
        phoneNumber: z.string(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createQuote, createVehicle, getVehicleByRegistration, getAllActiveCarriers, getProductsByCarrier } = await import('./insurance/insurance-db');
        const { calculateVehicleRiskScore } = await import('./insurance/valuation-engine');
        
        // For now, use a dummy customer ID (in production, this would be the logged-in user or a guest customer)
        const customerId = 1; // TODO: Create proper customer management
        
        // Step 1: Check if vehicle exists, if not create it
        let vehicle = await getVehicleByRegistration(input.registrationNumber);
        
        if (!vehicle) {
          // Calculate risk score for new vehicle
          const riskScore = await calculateVehicleRiskScore(input.make, input.model, input.year);
          
          vehicle = await createVehicle({
            registrationNumber: input.registrationNumber,
            make: input.make,
            model: input.model,
            year: input.year,
            currentValuation: input.currentValue,
            riskScore,
            ownerId: customerId, // Use the same customer ID
            tenantId: 'default',
          });
        }
        
        // Step 2: Get default carrier and product (for now, use first active carrier)
        const carriers = await getAllActiveCarriers();
        if (carriers.length === 0) {
          throw new Error('No active insurance carriers available');
        }
        const carrier = carriers[0];
        
        const products = await getProductsByCarrier(carrier.id);
        if (products.length === 0) {
          throw new Error('No insurance products available');
        }
        const product = products[0];
        
        // Step 3: Calculate premium based on risk factors
        const basePremium = input.currentValue * 0.05; // 5% of vehicle value
        const ageFactor = input.driverAge < 25 ? 1.5 : input.driverAge > 60 ? 1.2 : 1.0;
        const mileageFactor = input.annualMileage === 'high' ? 1.3 : input.annualMileage === 'low' ? 0.9 : 1.0;
        
        const annualPremium = Math.round(basePremium * ageFactor * mileageFactor);
        const monthlyPremium = Math.round(annualPremium / 12);
        
        // Step 4: Create quote
        const quoteNumber = `QT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const quoteValidUntil = new Date();
        quoteValidUntil.setDate(quoteValidUntil.getDate() + 30); // Valid for 30 days
        
        const quote = await createQuote({
          quoteNumber,
          customerId,
          vehicleId: vehicle.id,
          carrierId: carrier.id,
          productId: product.id,
          premiumAmount: monthlyPremium,
          premiumFrequency: 'monthly',
          excessAmount: 50000, // Default $500 excess
          driverDetails: JSON.stringify({
            age: input.driverAge,
            annualMileage: input.annualMileage,
            phoneNumber: input.phoneNumber,
            email: input.email,
          }),
          riskProfile: JSON.stringify({
            vehicleRisk: vehicle.riskScore,
            driverAgeRisk: input.driverAge < 25 ? 'high' : input.driverAge > 60 ? 'medium' : 'low',
            mileageRisk: input.annualMileage,
          }),
          quoteValidUntil,
          status: 'pending',
          tenantId: 'default',
        });
        
        return {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          premiumAmount: monthlyPremium,
          annualPremium,
          validUntil: quoteValidUntil,
        };
      }),

    // Get quote details
    getQuote: publicProcedure
      .input(z.object({
        quoteId: z.number(),
      }))
      .query(async ({ input }) => {
        const { getQuoteById } = await import('./insurance/insurance-db');
        return getQuoteById(input.quoteId);
      }),

    // Submit payment proof
    submitPaymentProof: publicProcedure
      .input(z.object({
        quoteId: z.number(),
        paymentMethod: z.enum(['cash', 'bank_transfer', 'ecocash', 'onemoney', 'rtgs', 'zipit']),
        referenceNumber: z.string().optional(),
        paymentDate: z.date(),
        paymentProofBase64: z.string(),
        paymentProofFileName: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import('./storage');
        const { getQuoteById } = await import('./insurance/insurance-db');
        const db = await getDb();
        if (!db) throw new Error('Database connection failed');
        
        // Get quote to verify it exists and get premium amount
        const quote = await getQuoteById(input.quoteId);
        if (!quote) {
          throw new Error('Quote not found');
        }
        
        // Upload payment proof to S3
        const base64Data = input.paymentProofBase64.split(',')[1] || input.paymentProofBase64;
        const buffer = Buffer.from(base64Data, 'base64');
        const fileExtension = input.paymentProofFileName.split('.').pop() || 'jpg';
        const s3Key = `insurance/payment-proofs/${input.quoteId}-${Date.now()}.${fileExtension}`;
        
        const { url: s3Url } = await storagePut(s3Key, buffer, `image/${fileExtension}`);
        
        // Update quote with payment information
        await db.update(insuranceQuotes)
          .set({
            status: 'payment_submitted',
            paymentMethod: input.paymentMethod,
            paymentReferenceNumber: input.referenceNumber || null,
            paymentDate: input.paymentDate,
            paymentSubmittedAt: new Date(),
            paymentProofS3Key: s3Key,
            paymentProofS3Url: s3Url,
            paymentAmount: quote.premiumAmount, // Store the premium amount for verification
          })
          .where(eq(insuranceQuotes.id, input.quoteId));
        
        return { success: true, message: 'Payment proof submitted successfully' };
      }),

    // Get pending payments for verification
    getPendingPayments: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database connection failed');
        
        // Only insurers and admins can access this
        if (ctx.user.role !== 'insurer' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only insurers can verify payments' });
        }
        
        const pendingQuotes = await db.select()
          .from(insuranceQuotes)
          .where(eq(insuranceQuotes.status, 'payment_submitted'));
        
        return pendingQuotes;
      }),

    // Verify payment
    verifyPayment: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database connection failed');
        
        // Only insurers and admins can verify
        if (ctx.user.role !== 'insurer' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only insurers can verify payments' });
        }
        
        // Update quote status to payment_verified
        await db.update(insuranceQuotes)
          .set({
            status: 'payment_verified',
            paymentVerifiedAt: new Date(),
            paymentVerifiedBy: ctx.user.id,
          })
          .where(eq(insuranceQuotes.id, input.quoteId));
        
        // Trigger policy issuance workflow
        const { issuePolicyFromQuote } = await import('./insurance/policy-issuance');
        const policy = await issuePolicyFromQuote(input.quoteId);
        
        return { 
          success: true, 
          message: 'Payment verified and policy issued successfully',
          policyNumber: policy.policyNumber,
          policyId: policy.id,
        };
      }),

    // Reject payment
    rejectPayment: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        reason: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database connection failed');
        
        // Only insurers and admins can reject
        if (ctx.user.role !== 'insurer' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only insurers can reject payments' });
        }
        
        // Update quote status to rejected with reason
        await db.update(insuranceQuotes)
          .set({
            status: 'rejected',
            paymentRejectionReason: input.reason,
          })
          .where(eq(insuranceQuotes.id, input.quoteId));
        
        // TODO: Notify customer of rejection
        
        return { success: true, message: 'Payment rejected' };
      }),

    // Get customer's policies
    getMyPolicies: protectedProcedure
      .query(async ({ ctx }) => {
        const { getPoliciesByCustomer } = await import('./insurance/policy-issuance');
        return await getPoliciesByCustomer(ctx.user.id);
      }),

    // Get customer's quotes
    getMyQuotes: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database connection failed');
        
        return await db.select()
          .from(insuranceQuotes)
          .where(eq(insuranceQuotes.customerId, ctx.user.id));
      }),

    // Download policy PDF
    downloadPolicyPDF: protectedProcedure
      .input(z.object({
        policyId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database connection failed');
        
        // Get policy details
        const policies = await db.select()
          .from(insurancePolicies)
          .where(eq(insurancePolicies.id, input.policyId));
        
        if (!policies || policies.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Policy not found' });
        }
        
        const policy = policies[0];
        
        // Verify ownership
        if (policy.customerId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this policy' });
        }
        
        // Get vehicle details
        const vehicles = await db.select()
          .from(fleetVehicles)
          .where(eq(fleetVehicles.id, policy.vehicleId));
        
        if (!vehicles || vehicles.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Vehicle not found' });
        }
        
        const vehicle = vehicles[0];
        
        // Get carrier details
        const carriers = await db.select()
          .from(insuranceCarriers)
          .where(eq(insuranceCarriers.id, policy.carrierId));
        
        const carrier = carriers && carriers.length > 0 ? carriers[0] : null;
        
        // Get product details
        const products = await db.select()
          .from(insuranceProducts)
          .where(eq(insuranceProducts.id, policy.productId));
        
        const product = products && products.length > 0 ? products[0] : null;
        
        // Generate PDF
        const { generatePolicyPDF } = await import('./insurance/policy-pdf-generator');
        const pdfBuffer = await generatePolicyPDF({
          policyNumber: policy.policyNumber,
          customerName: ctx.user.name || 'N/A',
          customerEmail: ctx.user.email || undefined,
          customerPhone: 'N/A',
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          vehicleYear: vehicle.year,
          vehicleRegistration: vehicle.registrationNumber,
          vehicleValue: 0, // Vehicle value not stored in fleetVehicles
          productName: product?.productName || 'Comprehensive Motor Insurance',
          carrierName: carrier?.name || 'Zimbabwe Insurance Corporation',
          premiumAmount: policy.premiumAmount,
          premiumFrequency: policy.premiumFrequency,
          excessAmount: policy.excessAmount || undefined,
          coverageStartDate: new Date(policy.coverageStartDate),
          coverageEndDate: new Date(policy.coverageEndDate),
          coverageLimits: policy.coverageLimits || undefined,
        });
        
        // Convert buffer to base64 for transmission
        const base64PDF = pdfBuffer.toString('base64');
        
        return {
          success: true,
          filename: `policy-${policy.policyNumber}.pdf`,
          data: base64PDF,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
