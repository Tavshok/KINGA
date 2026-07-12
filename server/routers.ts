
/**
 * KINGA AI Insurance Claims Management Platform
 * 
 * This file defines all tRPC API procedures for the application.
 * Procedures are organized by domain (claims, assessors, panel beaters, etc.)
 * and use type-safe contracts with Zod validation.
 * 
 * @module routers
 */

import { COOKIE_NAME, FINANCIAL_APPROVAL_THRESHOLD_CENTS } from "@shared/const";
import { resolveDashboardRoute, getRolePermissions, ANALYTICS_ALLOWED_ROLES, GOVERNANCE_ALLOWED_ROLES, REPORT_SCHEDULE_ALLOWED_ROLES } from "@shared/role-permissions";
import { REPORT_ACCESS } from "./reporting/reportDefinitions";
import { canAccessReport } from "./routers/reporting";
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
import { claimsManagerRouter } from "./routers/claims-manager";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { parsePhysicsAnalysis } from "./types/physics-validation";
import { claims, insuranceQuotes, insuranceProducts, insuranceCarriers, insurancePolicies, fleetVehicles, fleetDrivers, insurerTenants, ingestionDocuments, recoveryCases, recoveryCorrespondenceLog, fraudRules } from "../drizzle/schema";
import { eq, and, desc, asc, inArray, notInArray, gt, gte, lte, or, sql, count, avg, isNotNull } from "drizzle-orm";
import { 
  getAllApprovedPanelBeaters,
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
  getUsersByInsurerRoles,
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
  getQuoteLineItemsByQuoteId,
  getTenantRates
} from "./db";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { generateDemandLetter } from "./recovery/demandLetterGenerator";
import { checkSingleCaseDeadline } from "./recovery/recoveryDeadlineAlerts";
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
import { vehicleStructuralIntelligenceRouter } from "./routers/vehicle-structural-intelligence";
import { vehicleDamageHistoryRouter } from "./routers/vehicle-damage-history";
import { repairHistoryRouter } from "./routers/repair-history";
import { crossClaimIntelligenceRouter } from "./routers/cross-claim-intelligence";
import { driverRegistryRouter } from "./routers/driver-registry";
import { workflowRouter } from "./routers/workflow";
import { commentsRouter } from "./routers/comments";
import { claimCommentsRouter } from "./routers/claimComments";
import { workflowQueriesRouter } from "./routers/workflow-queries";
import { marketplaceRouter } from "./routers/marketplace";
import { platformMarketplaceRouter } from "./routers/platform-marketplace";
import { platformUserRolesRouter } from "./routers/platform-user-roles";
import { teamMembersRouter } from "./routers/team-members";
import { platformRouter } from "./routers/platform";
import { reviewQueueRouter } from "./routers/review-queue";
import { monetizationRouter } from "./routers/monetization";
import { operationalHealthRouter } from "./routers/operational-health";
import { platformObservabilityRouter } from "./routers/platform-observability";
import { auditRouter } from "./routers/audit";
import { superAuditRouter } from "./routers/super-audit";
import { governanceRouter } from "./routers/governance";
import { governanceDashboardRouter } from "./routers/governance-dashboard";
import { aiReanalysisRouter } from "./routers/ai-reanalysis";
import { photoReextractionRouter } from "./routers/photo-reextraction";
import { intakeGateRouter } from "./routers/intake-gate";
import { aiAnalysisRouter } from "./routers/ai-analysis";
import { notificationsRouter } from "./routers/notifications";
import { adminRouter } from "./routers/admin";
import { pipelineObservabilityRouter } from "./routers/pipeline-observability";
import { routingPolicyVersionRouter } from "./routers/routing-policy-version";
import { policyManagementRouter } from "./routers/policy-management";
import { panelBeaterAnalyticsRouter } from './routers/panel-beater-analytics';
import { reportsRouter } from './routers/reports';
import { executiveRouter } from './routers/executive';
import { quoteIntelligenceRouter } from './repair-intelligence/router';
import { repairReplaceRouter } from './repair-intelligence/repair-replace-router';
import { exceptionIntelligenceRouter } from './routers/exception-intelligence';
import { intelligenceRouter } from './routers/intelligence';
import { reportingRouter } from './routers/reporting';
import { validateAiAssessmentResponse, validateClaimDetailResponse } from './apiResponseValidator';
import { logger } from './logger';
import { validateClaimAnalysisResponse } from './services/apiResponseValidator';
import { sanitiseReportNarrative, buildBlockError } from './services/externalReportSanitiser';
// import { eventIntegration } from "./events/event-integration"; // Temporarily disabled until Kafka is set up

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRITY METRICS ROUTER
// Aggregates integrity gate, reconciliation, and photo ingestion data
// across all assessments for the Integrity Metrics Dashboard.
// ─────────────────────────────────────────────────────────────────────────────
export const integrityRouter = router({
  getMetrics: protectedProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      days: z.number().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // Fetch recent assessments with forensic_analysis JSON
      const tenantFilter = input.tenantId
        ? `AND a.tenant_id = ${input.tenantId}`
        : (ctx.user.role === 'admin' ? '' : `AND a.tenant_id = ${(ctx.user as any).tenantId || 0}`);

      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = await (db as any).execute(`
        SELECT
          a.id,
          a.fcdi_score,
          a.fraud_score,
          a.recommendation,
          a.created_at,
          a.forensic_analysis,
          c.claim_number
        FROM ai_assessments a
        LEFT JOIN claims c ON a.claim_id = c.id
        WHERE a.created_at >= ?
        ${tenantFilter}
        ORDER BY a.created_at DESC
        LIMIT 500
      `, [since]);

      const assessments = (rows as unknown) as any[];

      // Aggregate integrity gate outcomes
      const gateCounts = { CLEAR: 0, WARNINGS: 0, BLOCKED: 0, UNKNOWN: 0 };
      const blockingCauses: Record<string, number> = {};
      const warningCauses: Record<string, number> = {};
      const overriddenFields: Record<string, number> = {};
      const conflictingStages: Record<string, number> = {};
      let totalCongruencyScore = 0;
      let congruencyCount = 0;
      let totalPhotoReviewRequired = 0;
      let totalPhotosAvailable = 0;
      let totalNoPhotos = 0;
      let totalPhotoFailed = 0;

      for (const row of assessments) {
        let fa: any = null;
        try {
          fa = row.forensic_analysis ? JSON.parse(row.forensic_analysis) : null;
        } catch { /* skip malformed */ }

        // Integrity gate
        const gate = fa?.integrityGate;
        if (gate) {
          const status = gate.status || 'UNKNOWN';
          gateCounts[status as keyof typeof gateCounts] = (gateCounts[status as keyof typeof gateCounts] || 0) + 1;
          for (const b of (gate.blockers || [])) {
            blockingCauses[b.code || b.reason || 'unknown'] = (blockingCauses[b.code || b.reason || 'unknown'] || 0) + 1;
          }
          for (const w of (gate.warnings || [])) {
            warningCauses[w.code || w.reason || 'unknown'] = (warningCauses[w.code || w.reason || 'unknown'] || 0) + 1;
          }
        } else {
          gateCounts.UNKNOWN++;
        }

        // Reconciliation log
        const recon = fa?.reconciliationLog;
        if (recon) {
          if (typeof recon.congruencyScore === 'number') {
            totalCongruencyScore += recon.congruencyScore;
            congruencyCount++;
          }
          for (const ov of (recon.overrides || [])) {
            const field = ov.field || 'unknown';
            overriddenFields[field] = (overriddenFields[field] || 0) + 1;
            const stages = [ov.loserSource, ov.winnerSource].filter(Boolean);
            for (const s of stages) {
              conflictingStages[s] = (conflictingStages[s] || 0) + 1;
            }
          }
        }

        // Photo ingestion log
        const photoLog = fa?.photoIngestionLog;
        if (photoLog) {
          if (photoLog.requiresPhotoReview) totalPhotoReviewRequired++;
          if (photoLog.overallOutcome === 'photos_available') totalPhotosAvailable++;
          else if (photoLog.overallOutcome === 'no_photos_in_document') totalNoPhotos++;
          else if (photoLog.overallOutcome === 'extraction_failed') totalPhotoFailed++;
        }
      }

      const avgCongruencyScore = congruencyCount > 0
        ? Math.round(totalCongruencyScore / congruencyCount)
        : null;

      // Top 5 blocking causes
      const topBlockers = Object.entries(blockingCauses)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cause, count]) => ({ cause, count }));

      // Top 5 warning causes
      const topWarnings = Object.entries(warningCauses)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cause, count]) => ({ cause, count }));

      // Top 5 overridden fields
      const topOverriddenFields = Object.entries(overriddenFields)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([field, count]) => ({ field, count }));

      // Top 5 conflicting stages
      const topConflictingStages = Object.entries(conflictingStages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([stage, count]) => ({ stage, count }));

      return {
        period: { days: input.days, since: since.toISOString() },
        totalAssessments: assessments.length,
        gateDistribution: gateCounts,
        avgCongruencyScore,
        topBlockers,
        topWarnings,
        topOverriddenFields,
        topConflictingStages,
        photoIngestion: {
          photosAvailable: totalPhotosAvailable,
          noPhotos: totalNoPhotos,
          extractionFailed: totalPhotoFailed,
          requiresReview: totalPhotoReviewRequired,
        },
      };
    }),
});

export const appRouter = router({
  truthSynthesis: truthSynthesisRouter,
  vehicleRegistry: vehicleRegistryRouter,
  vehicleStructural: vehicleStructuralIntelligenceRouter,
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
  claimsManager: claimsManagerRouter,
  monetization: monetizationRouter,
  operationalHealth: operationalHealthRouter,
  platformObservability: platformObservabilityRouter,
  audit: auditRouter,
  superAudit: superAuditRouter,
  governance: governanceRouter,
  governanceDashboard: governanceDashboardRouter,
  aiReanalysis: aiReanalysisRouter,
  aiAnalysis: aiAnalysisRouter,
  notifications: notificationsRouter,
  admin: adminRouter,
  pipelineObservability: pipelineObservabilityRouter,
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
  claimComms: claimCommentsRouter,
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
  teamMembers: teamMembersRouter,
  platform: platformRouter,
  quoteIntelligence: quoteIntelligenceRouter,
  repairReplace: repairReplaceRouter,
  exceptionIntelligence: exceptionIntelligenceRouter,
  intelligence: intelligenceRouter,
  reportingEngine: reportingRouter,
  integrity: integrityRouter,
  photoReextraction: photoReextractionRouter,
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

    // Upload external assessment document for KINGA analysis
    uploadExternalAssessment: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileData: z.string(), // base64 encoded PDF
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          console.log(`📤 Processing external assessment: ${input.fileName}`);
          
          // Use enhanced assessment processor with KINGA analysis
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

        // Do NOT apply tenant filtering here — claimId already uniquely identifies the claim.
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
        const { users } = await import("../drizzle/schema");
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
   * - KINGA assessment triggering
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
            input.fileName
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
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        
        // Check if user has claims processor role
        const { hasPermission } = await import("./rbac");
        if (!hasPermission(ctx.user, "createClaim")) {
          throw new TRPCError({ 
            code: "FORBIDDEN",
            message: "Only Claims Processors can create claims on behalf of claimants"
          });
        }
        
        // Find or create claimant user
        const _claimDb3 = await getDb();
        if (!_claimDb3) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { users: _usersTable3 } = await import("../drizzle/schema");
        const { eq: _eqEmail3 } = await import("drizzle-orm");
        let [claimant] = await _claimDb3.select().from(_usersTable3).where(_eqEmail3(_usersTable3.email, input.claimantEmail)).limit(1);
        if (!claimant) {
          const { upsertUser: _upsertUser3 } = await import("./db");
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
        const { normaliseIncidentDescription } = await import("./services/intakeDescriptionNormaliser");
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
        damagePhotos: z.array(z.string()), // Array of S3 URLs
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
        panelBeaterChoice1: z.string().uuid(),
        panelBeaterChoice2: z.string().uuid(),
        panelBeaterChoice3: z.string().uuid(),
        // Company / fleet claim fields
        claimantType: z.enum(["individual", "company"]).optional().default("individual"),
        companyName: z.string().optional(),
        companyRegistration: z.string().optional(),
        claimantDepartment: z.string().max(255).optional(),
        fleetAccountId: z.number().int().positive().optional(),
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
      const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
      return await getClaimsByClaimant(ctx.user.id, tenantId);
    }),

    // Search claims by claim number, policy number, or vehicle registration
    // Claimants see only their own claims; processors/insurers see all within tenant
    searchByIdentifier: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(100) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
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

    // Get claims for panel beater (claims where this panel beater was selected)
    myQuoteRequests: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const db = await getDb();
      if (!db) return [];
      // Look up the panel beater record linked to this user account
      const { panelBeaters: pbTable } = await import('../drizzle/schema');
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
      const { panelBeaters: pbTable } = await import('../drizzle/schema');
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
      const { panelBeaters: pbTable } = await import('../drizzle/schema');
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
        const { panelBeaters: pbTable2, panelBeaterQuotes: pbqTable, claims: claimsTable } = await import('../drizzle/schema');
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
        const { panelBeaters: pbTable, panelBeaterQuotes: pbqTable, claims: claimsTable, insurerTenants: tenantsTable } = await import('../drizzle/schema');
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
        const { aiAssessments: aiAssessmentsTable } = await import("../drizzle/schema");
        const { inArray: inArrayOp } = await import("drizzle-orm");
        const qualityRows = await db
          .select({ claimId: aiAssessmentsTable.claimId, claimQualityJson: aiAssessmentsTable.claimQualityJson })
          .from(aiAssessmentsTable)
          .where(inArrayOp(aiAssessmentsTable.claimId, completedIds));
        const qualityMap = new Map<number, any>();
        for (const qr of qualityRows) {
          if (qr.claimId && qr.claimQualityJson) {
            try {
              const parsed = JSON.parse(qr.claimQualityJson as string);
              qualityMap.set(qr.claimId, { grade: parsed.grade, overallScore: parsed.overallScore, requiresManualReview: parsed.requiresManualReview });
            } catch { /* non-fatal */ }
          }
        }
        return rows.map((r: any) => ({
          ...r,
          _qualityGrade: qualityMap.get(r.id) ?? null,
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
        const { aiAssessments: aiAssessmentsTable } = await import("../drizzle/schema");
        const { inArray: inArrayOp } = await import("drizzle-orm");
        const qualityRows = await db
          .select({ claimId: aiAssessmentsTable.claimId, claimQualityJson: aiAssessmentsTable.claimQualityJson })
          .from(aiAssessmentsTable)
          .where(inArrayOp(aiAssessmentsTable.claimId, completedIds));
        const qualityMap = new Map<number, any>();
        for (const qr of qualityRows) {
          if (qr.claimId && qr.claimQualityJson) {
            try {
              const parsed = JSON.parse(qr.claimQualityJson as string);
              qualityMap.set(qr.claimId, { grade: parsed.grade, overallScore: parsed.overallScore, requiresManualReview: parsed.requiresManualReview });
            } catch { /* non-fatal */ }
          }
        }
        return rows.map((r: any) => ({
          ...r,
          _qualityGrade: qualityMap.get(r.id) ?? null,
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
          const { notifyAssessorAssignment: notifyAssignment } = await import('./workflow-notifications');
          const { getUserById } = await import('./db');
          
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
                const { createNotification } = await import("./db");
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
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
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
        const { getActiveAutomationPolicy } = await import("./automation-policy-manager");
        const policy = await getActiveAutomationPolicy(tenantId);
        const requireManagerApprovalAbove = policy?.requireManagerApprovalAbove || FINANCIAL_APPROVAL_THRESHOLD_CENTS; // Default threshold from shared/const.ts
        
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
          claimantId: claim.claimantId ?? 0,
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

        const { transition } = await import("./workflow-engine");
        const { statusToWorkflowState } = await import("./workflow-migration");
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
        const { transition } = await import("./workflow-engine");
        const { statusToWorkflowState } = await import("./workflow-migration");
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
        const { transition } = await import("./workflow-engine");
        const { statusToWorkflowState } = await import("./workflow-migration");
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
        const { notifyOwner } = await import("./_core/notification");
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
        const { transition } = await import("./workflow-engine");
        const { statusToWorkflowState } = await import("./workflow-migration");
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
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || ctx.user.tenantId || "default");
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
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || ctx.user.tenantId || "default");
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
        const { auditTrail: auditTrailTable, users: usersTable } = await import('../drizzle/schema');
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
        const { aiAssessments: _aiAssessments } = await import("../drizzle/schema");
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
        const { adjusterSignOffs } = await import('../drizzle/schema');
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
        const { adjusterSignOffs } = await import('../drizzle/schema');
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
          const { notifyOwner } = await import("./_core/notification");
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
        const { auditTrail } = await import('../drizzle/schema');
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
            const hours = (new Date(claim.updatedAt).getTime() - new Date(claim.createdAt).getTime()) / (1000 * 60 * 60);
            totalTurnaroundHours += hours;
            if (hours < 24) under24++;
            else if (hours < 48) under48++;
            else over48++;
          }
          if (claim.createdAt && new Date(claim.createdAt) >= monthStart) {
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
          // Get KINGA assessment
          const aiAssessment = await getAiAssessmentByClaimId(claim.id, tenantId);
          if (aiAssessment) {
            if (aiAssessment.fraudRiskLevel === "high") {
              fraudCasesDetected++;
              highRiskCases++;
              fraudPrevented += aiAssessment.estimatedCost || 0;
            } else if (aiAssessment.fraudRiskLevel === "moderate") {
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

        // D-06: Compute throughput this week (assessments completed in last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000);
        const throughputThisWeek = recentAssessments.filter((a: any) => {
          const ts = a.completedAt ?? a.createdAt;
          return ts && new Date(ts) >= sevenDaysAgo;
        }).length;

        return {
          tier: assessor.assessorTier || "free",
          tierActivatedAt: assessor.tierActivatedAt,
          tierExpiresAt: assessor.tierExpiresAt,
          performanceScore: assessor.performanceScore || 70,
          totalAssessmentsCompleted: assessor.totalAssessmentsCompleted || 0,
          averageVarianceFromFinal: assessor.averageVarianceFromFinal,
          // D-06: New fields for Throughput and Avg Assessment Time KPIs
          throughputThisWeek,
          avgCompletionTimeHours: assessor.avgCompletionTime ? Number(assessor.avgCompletionTime) : null,
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
    /**
     * Get the assessor's own performance trend over time, broken down by insurer.
     * Uses assessorInsurerRelationships for per-insurer summary and
     * assessorEvaluations joined through claims for time-bucketed trend data.
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
        const {
          users: usersTable,
          assessorEvaluations: evalsTable,
          assessorInsurerRelationships: relTable,
          claims: claimsTable,
          insurerTenants: tenantsTable,
        } = await import('../drizzle/schema');
        const { eq: _eq, desc: _desc } = await import('drizzle-orm');
        // Per-insurer summary from assessorInsurerRelationships
        const relationships = await db
          .select({
            tenantId: relTable.tenantId,
            insurerDisplayName: tenantsTable.displayName,
            performanceRating: relTable.performanceRating,
            totalAssignmentsCompleted: relTable.totalAssignmentsCompleted,
            averageCompletionTimeHours: relTable.averageCompletionTimeHours,
            relationshipStatus: relTable.relationshipStatus,
          })
          .from(relTable)
          .leftJoin(tenantsTable, _eq(relTable.tenantId, tenantsTable.id))
          .where(_eq(relTable.assessorId, ctx.user.id));
        const insurers = relationships
          .filter(r => r.insurerDisplayName)
          .map(r => ({ tenantId: r.tenantId, displayName: r.insurerDisplayName! }));
        const byInsurer = relationships.map(r => ({
          tenantId: r.tenantId,
          displayName: r.insurerDisplayName || r.tenantId,
          totalAssignments: r.totalAssignmentsCompleted || 0,
          performanceRating: r.performanceRating ? Number(r.performanceRating) : null,
          avgCompletionTimeHours: r.averageCompletionTimeHours ? Number(r.averageCompletionTimeHours) : null,
          relationshipStatus: r.relationshipStatus,
        }));
        // Time-bucketed trend from evaluations
        const periodDays = input.period === 'weekly' ? 7 : 30;
        const lookbackDays = 12 * periodDays;
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const rawEvals = await db
          .select({
            id: evalsTable.id,
            estimatedRepairCost: evalsTable.estimatedRepairCost,
            status: evalsTable.status,
            createdAt: evalsTable.createdAt,
            claimTenantId: claimsTable.tenantId,
            finalApprovedAmount: claimsTable.finalApprovedAmount,
            insurerDisplayName: tenantsTable.displayName,
          })
          .from(evalsTable)
          .leftJoin(claimsTable, _eq(evalsTable.claimId, claimsTable.id))
          .leftJoin(tenantsTable, _eq(claimsTable.tenantId, tenantsTable.id))
          .where(_eq(evalsTable.assessorId, ctx.user.id))
          .orderBy(_desc(evalsTable.createdAt));
        const allEvals = rawEvals.filter(e => e.createdAt && new Date(e.createdAt) >= since && e.status === 'submitted');
        const filtered = input.tenantId ? allEvals.filter(e => e.claimTenantId === input.tenantId) : allEvals;
        // Bucket by period
        const bucketMap: Record<string, { label: string; evals: typeof filtered }> = {};
        for (const e of filtered) {
          const d = new Date(e.createdAt!);
          let key: string;
          if (input.period === 'weekly') {
            const startOfYear = new Date(d.getFullYear(), 0, 1);
            const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
            key = d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
          } else {
            key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          }
          if (!bucketMap[key]) bucketMap[key] = { label: key, evals: [] };
          bucketMap[key].evals.push(e);
        }
        const trend = Object.entries(bucketMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, { label, evals: be }]) => {
            const total = be.length;
            const withVariance = be.filter(e => e.estimatedRepairCost && e.finalApprovedAmount && parseFloat(String(e.finalApprovedAmount)) > 0);
            const avgVariancePct = withVariance.length > 0
              ? Math.round(withVariance.reduce((s, e) => s + Math.abs(((e.estimatedRepairCost! - parseFloat(String(e.finalApprovedAmount!))) / parseFloat(String(e.finalApprovedAmount!))) * 100), 0) / withVariance.length)
              : null;
            return { label, totalAssessments: total, avgVariancePct };
          });
        const withVariance = filtered.filter(e => e.estimatedRepairCost && e.finalApprovedAmount && parseFloat(String(e.finalApprovedAmount)) > 0);
        const overallVariance = withVariance.length > 0
          ? Math.round(withVariance.reduce((s, e) => s + Math.abs(((e.estimatedRepairCost! - parseFloat(String(e.finalApprovedAmount!))) / parseFloat(String(e.finalApprovedAmount!))) * 100), 0) / withVariance.length)
          : null;
        return {
          insurers,
          byInsurer,
          trend,
          summary: { totalAssessments: filtered.length, overallAvgVariancePct: overallVariance },
        };
      }),

    // Get per-insurer relationship data for the logged-in assessor (external assessors)
    getMyInsurerRelationships: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const {
        assessors: assessorsTable,
        assessorInsurerRelationships: airTable,
        insurerTenants,
      } = await import('../drizzle/schema');
      const { eq: _eq, and: _and, desc: _desc } = await import('drizzle-orm');

      const [assessor] = await db
        .select()
        .from(assessorsTable)
        .where(_eq(assessorsTable.userId, ctx.user.id))
        .limit(1);
      if (!assessor) return { relationships: [], assessor: null };

      const relationships = await db
        .select({
          id: airTable.id,
          tenantId: airTable.tenantId,
          insurerName: insurerTenants.displayName,
          relationshipType: airTable.relationshipType,
          relationshipStatus: airTable.relationshipStatus,
          contractStartDate: airTable.contractStartDate,
          contractedRatePerAssessment: airTable.contractedRatePerAssessment,
          performanceRating: airTable.performanceRating,
          totalAssignmentsCompleted: airTable.totalAssignmentsCompleted,
          totalAssignmentsRejected: airTable.totalAssignmentsRejected,
          averageCompletionTimeHours: airTable.averageCompletionTimeHours,
          isPreferredVendor: airTable.isPreferredVendor,
        })
        .from(airTable)
        .leftJoin(insurerTenants, _eq(airTable.tenantId, insurerTenants.id))
        .where(_and(
          _eq(airTable.assessorId, assessor.id),
          _eq(airTable.relationshipStatus, 'active'),
        ))
        .orderBy(_desc(airTable.totalAssignmentsCompleted));

      return {
        assessor: {
          id: assessor.id,
          assessorType: assessor.assessorType,
          certificationLevel: assessor.certificationLevel,
          performanceScore: assessor.performanceScore,
          totalAssessmentsCompleted: assessor.totalAssessmentsCompleted,
          averageAccuracyScore: assessor.averageAccuracyScore,
          averageTurnaroundHours: assessor.averageTurnaroundHours,
          averageRating: assessor.averageRating,
          totalMarketplaceEarnings: assessor.totalMarketplaceEarnings,
          pendingPayout: assessor.pendingPayout,
          marketplaceEnabled: assessor.marketplaceEnabled,
          marketplaceStatus: assessor.marketplaceStatus,
          specializations: assessor.specializations,
        },
        relationships,
      };
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
        fraudRiskLevel: z.enum(["low", "moderate", "high"]),
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
          disagreesWithAi: (input.disagreesWithAi ? 1 : 0),
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

        // ── ROUTE 4 idempotency guard ─────────────────────────────────────────
        // Prevent duplicate quotes from the same panel beater for the same claim.
        // If a quote already exists (e.g. from pipeline extraction or a prior
        // submission), update it rather than inserting a second row.
        const _existingDb = await getDb();
        if (_existingDb) {
          const { panelBeaterQuotes: _pbq } = await import('../drizzle/schema');
          const { eq: _eq2, and: _and2 } = await import('drizzle-orm');
          const [_existing] = await _existingDb
            .select({ id: _pbq.id })
            .from(_pbq)
            .where(_and2(
              _eq2(_pbq.claimId, input.claimId),
              _eq2(_pbq.panelBeaterId, input.panelBeaterId),
            ))
            .limit(1);
          if (_existing) {
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            await _existingDb.update(_pbq).set({
              quotedAmount: input.quotedAmount,
              laborCost: input.laborCost ?? null,
              partsCost: input.partsCost ?? null,
              laborHours: input.laborHours ?? null,
              estimatedDuration: input.estimatedDuration,
              itemizedBreakdown: JSON.stringify(input.itemizedBreakdown),
              notes: input.notes ?? null,
              status: 'submitted',
              updatedAt: now,
            }).where(_eq2(_pbq.id, _existing.id));
            console.log(`[quotes.submit] Updated existing quote id=${_existing.id} for claim ${input.claimId} panel beater ${input.panelBeaterId}`);
            // Skip the createPanelBeaterQuote insert below and continue to post-submit logic
            const allQuotes = await getQuotesByClaimId(input.claimId);
            const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
            const claim = await getClaimById(input.claimId, tenantId);
            return { success: true, quoteId: _existing.id, allQuotesCount: allQuotes.length, claimStatus: claim?.status };
          }
        }

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
                    const { getUsersByInsurerRoles: _getInsurerRoles } = await import("./db");
                    // Only email operational roles (claims_manager) — not executive or insurer_admin
                    const insurers = await _getInsurerRoles(["claims_manager"]);
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
          // Only notify operational roles (claims_manager, insurer_admin) — not executive
          if (claim) {
            const insurers = await getUsersByInsurerRoles(["claims_manager"]);
            const tenantInsurers = insurers.filter((u) => !claim.tenantId || u.tenantId === claim.tenantId);
            const { createNotification } = await import("./db");
            
            for (const insurer of tenantInsurers) {
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
          // Only notify operational roles (claims_manager, insurer_admin) — not executive
          if (claim) {
            const insurers = await getUsersByInsurerRoles(["claims_manager"]);
            const tenantInsurers = insurers.filter((u) => !claim.tenantId || u.tenantId === claim.tenantId);
            const { createNotification } = await import("./db");
            
            for (const insurer of tenantInsurers) {
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
        // Do NOT apply tenant filtering here — claimId already uniquely identifies the claim.
        // Tenant filtering via innerJoin was causing quotes to be silently dropped when the
        // user's tenantId didn't exactly match the claim's tenantId (e.g. "default" vs actual tenant).
        const quotes = await getQuotesByClaimId(input.claimId);
        console.log(`[getWithLineItems] claimId=${input.claimId} quotes=${quotes.length} ids=${quotes.map(q=>q.id).join(',')} pbIds=${quotes.map(q=>q.panelBeaterId).join(',')}`);
        
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
            // Fall back to repairerName from the base quote (populated by getQuotesByClaimId join)
            const resolvedName = pb?.businessName || pb?.name || (quote as any).repairerName || null;
            return {
              ...quote,
              lineItems,
              panelBeaterName: resolvedName,
            };
          })
        );
        
        return quotesWithItems;
      }),

    // Assessor quote adjustment — sets modified=1, preserves original amount, records reason
    adjustByAssessor: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        adjustedAmount: z.number(), // in cents
        modificationReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { panelBeaterQuotes: _pbq } = await import('../drizzle/schema');
        const { eq: _eq } = await import('drizzle-orm');
        // Fetch current quote to preserve original amount
        const [current] = await db.select().from(_pbq).where(_eq(_pbq.id, input.quoteId)).limit(1);
        if (!current) throw new Error(`Quote ${input.quoteId} not found`);
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await db.update(_pbq).set({
          modified: 1,
          quoteType: 'assessor_adjusted',
          originalQuotedAmount: current.originalQuotedAmount ?? current.quotedAmount, // only set once
          quotedAmount: input.adjustedAmount,
          modificationReason: input.modificationReason ?? 'Assessor adjustment',
          modifiedByAssessorId: ctx.user.id,
          status: 'modified',
          updatedAt: now,
        }).where(_eq(_pbq.id, input.quoteId));
        console.log(`[quotes.adjustByAssessor] Quote ${input.quoteId} adjusted by assessor ${ctx.user.id}: $${(current.quotedAmount ?? 0) / 100} → $${input.adjustedAmount / 100}`);
        return { success: true, originalAmount: current.originalQuotedAmount ?? current.quotedAmount, adjustedAmount: input.adjustedAmount };
      }),

    // Strip & requote — insurer requested vehicle strip to expose latent damage; repairer submits new (often higher) quote
    submitStripRequote: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        panelBeaterId: z.number(),
        quotedAmount: z.number(), // in cents
        parentQuoteId: z.number(), // the original quote this supersedes
        laborCost: z.number().optional(),
        partsCost: z.number().optional(),
        laborHours: z.number().optional(),
        estimatedDuration: z.number().optional(),
        itemizedBreakdown: z.array(z.object({ item: z.string(), cost: z.number() })).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const { panelBeaterQuotes: _pbq } = await import('../drizzle/schema');
        const { eq: _eq } = await import('drizzle-orm');
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        // Mark the parent quote as superseded
        await db.update(_pbq).set({ status: 'modified', updatedAt: now }).where(_eq(_pbq.id, input.parentQuoteId));
        // Insert the new strip-requote record
        await db.insert(_pbq).values({
          claimId: input.claimId,
          panelBeaterId: input.panelBeaterId,
          quotedAmount: input.quotedAmount,
          laborCost: input.laborCost ?? null,
          partsCost: input.partsCost ?? null,
          laborHours: input.laborHours ?? null,
          estimatedDuration: input.estimatedDuration ?? 0,
          itemizedBreakdown: JSON.stringify(input.itemizedBreakdown ?? []),
          notes: input.notes ?? null,
          quoteType: 'strip_requote',
          parentQuoteId: input.parentQuoteId,
          modified: 0,
          status: 'submitted',
          tenantId: ctx.user.tenantId || 'default',
          createdAt: now,
          updatedAt: now,
        });
        console.log(`[quotes.submitStripRequote] Strip requote for claim ${input.claimId} panel beater ${input.panelBeaterId}: $${input.quotedAmount / 100} (parent quote ${input.parentQuoteId})`);
        return { success: true };
      }),

    // Supplementary quote — additional damage found during repair not in original scope
    submitSupplementary: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        panelBeaterId: z.number(),
        quotedAmount: z.number(), // in cents — the ADDITIONAL amount only
        parentQuoteId: z.number(),
        notes: z.string().optional(),
        itemizedBreakdown: z.array(z.object({ item: z.string(), cost: z.number() })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const { panelBeaterQuotes: _pbq } = await import('../drizzle/schema');
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await db.insert(_pbq).values({
          claimId: input.claimId,
          panelBeaterId: input.panelBeaterId,
          quotedAmount: input.quotedAmount,
          itemizedBreakdown: JSON.stringify(input.itemizedBreakdown ?? []),
          notes: input.notes ?? null,
          quoteType: 'supplementary',
          parentQuoteId: input.parentQuoteId,
          modified: 0,
          estimatedDuration: 0,
          status: 'submitted',
          tenantId: ctx.user.tenantId || 'default',
          createdAt: now,
          updatedAt: now,
        });
        console.log(`[quotes.submitSupplementary] Supplementary quote for claim ${input.claimId}: +$${input.quotedAmount / 100}`);
        return { success: true };
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

    // AI audit: review line items against damage analysis and annotate each with a short verdict
    runAudit: protectedProcedure
      .input(z.object({ quoteId: z.number(), claimId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const { invokeLLM } = await import("./_core/llm");
        const { getDb, getQuoteLineItemsByQuoteId, getAiAssessmentByClaimId } = await import("./db");
        const { panelBeaterQuotes, quoteLineItems: qliTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Load line items and KINGA assessment
        const lineItems = await getQuoteLineItemsByQuoteId(input.quoteId);
        if (lineItems.length === 0) return { success: false, reason: "No line items found" };
        // R-GH-16: scope to caller's tenant so cross-tenant reads are blocked
        const _tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || undefined);
        const assessment = await getAiAssessmentByClaimId(input.claimId, _tenantId);
        const damageZones: string[] = [];
        const detectedComponents: string[] = [];
        if (assessment) {
          try {
            const ci = assessment.costIntelligenceJson ? JSON.parse(assessment.costIntelligenceJson as string) : null;
            if (ci?.components) ci.components.forEach((c: any) => detectedComponents.push(c.name || c.component || ""));
            if (ci?.damage_zones) ci.damage_zones.forEach((z: any) => damageZones.push(z.zone || z.name || ""));
          } catch { /* ignore */ }
        }

        const lineItemSummary = lineItems.map((li, i) => `${i+1}. ${li.description} (${li.category}) qty:${li.quantity} unit:${li.unitPrice} total:${li.lineTotal}`).join("\n");
        const detectedSummary = detectedComponents.length > 0 ? detectedComponents.join(", ") : "(no AI component data available)";

        const prompt = `You are a motor vehicle insurance claims auditor. Review each quoted line item against the AI-detected damage components.

AI-detected damage components: ${detectedSummary}

Quoted line items:
${lineItemSummary}

For each line item, assign a short AI review tag (max 3 words, plain text, no symbols):
- "Consistent" — item matches detected damage
- "Price high" — item present but price seems disproportionate to damage severity
- "Scope broad" — item present but scope of work seems wider than damage warrants
- "Not detected" — no corresponding damage detected for this item
- "Verify qty" — quantity seems high relative to damage
- "Insufficient data" — cannot assess without more information

Also list any detected damage components that are NOT quoted (unquoted items).
Return JSON: { "lineItemReviews": [{"index": 1, "review": "Consistent"}, ...], "unquotedComponents": ["component name", ...], "congruencyScore": 0-100, "summary": "one sentence" }`;

        let auditResult: any = null;
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "You are a motor vehicle insurance claims auditor. Return valid JSON only." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_schema", json_schema: { name: "quote_audit", strict: true, schema: { type: "object", properties: { lineItemReviews: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, review: { type: "string" } }, required: ["index", "review"], additionalProperties: false } }, unquotedComponents: { type: "array", items: { type: "string" } }, congruencyScore: { type: "integer" }, summary: { type: "string" } }, required: ["lineItemReviews", "unquotedComponents", "congruencyScore", "summary"], additionalProperties: false } } },
          });
          auditResult = JSON.parse((response.choices[0].message.content as string) || "{}");
        } catch (err) {
          console.error("[QuoteAudit] LLM failed:", err);
          return { success: false, reason: "AI audit failed" };
        }

        // Persist ai_review on each line item
        if (auditResult?.lineItemReviews) {
          for (const review of auditResult.lineItemReviews) {
            const li = lineItems[review.index - 1];
            if (li) {
              await db.update(qliTable).set({ aiReview: review.review }).where(eq(qliTable.id, li.id));
            }
          }
        }

        // Persist audit summary on the quote
        await db.update(panelBeaterQuotes).set({
          quoteAuditJson: JSON.stringify({ unquotedComponents: auditResult.unquotedComponents, summary: auditResult.summary }),
          quoteCongruencyScore: String(auditResult.congruencyScore ?? 0),
        }).where(eq(panelBeaterQuotes.id, input.quoteId));

        return { success: true, congruencyScore: auditResult.congruencyScore, summary: auditResult.summary, unquotedComponents: auditResult.unquotedComponents };
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
          scheduledDate: new Date(input.scheduledDate).toISOString(),
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
        const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
        if (!assessment) return null;

        // Apply normalisation service — ensures cost, fraud, and verdict are
        // always consistent regardless of which pipeline stages ran or how
        // data was stored. This is the single authoritative transformation
        // for all report-facing data.
        const { normaliseReportData } = await import('./report-normalisation');
        const { runPhase1 } = await import('./phase1-data-integrity');
        let costIntelParsed: any = null;
        let fraudBreakdownParsed: any = null;
        let causalVerdictParsed: any = null;
        let validatedOutcomeParsed: any = null;
        try { costIntelParsed = assessment.costIntelligenceJson ? (typeof assessment.costIntelligenceJson === 'string' ? JSON.parse(assessment.costIntelligenceJson) : assessment.costIntelligenceJson) : null; } catch { /* ignore */ }
        try { fraudBreakdownParsed = assessment.fraudScoreBreakdownJson ? (typeof assessment.fraudScoreBreakdownJson === 'string' ? JSON.parse(assessment.fraudScoreBreakdownJson) : assessment.fraudScoreBreakdownJson) : null; } catch { /* ignore */ }
        try {
          // causalVerdictJson may be stored in pipelineRunSummary or a dedicated field
          const prs = assessment.pipelineRunSummary ? (typeof assessment.pipelineRunSummary === 'string' ? JSON.parse(assessment.pipelineRunSummary) : assessment.pipelineRunSummary) : null;
          causalVerdictParsed = prs?.causalVerdict ?? prs?.causal_verdict ?? null;
        } catch { /* ignore */ }

        // Run Phase 1 Data Integrity & Sanitisation gate before normalisation.
        // This validates dates, reconciles costs, corrects unit shifts, sanitises
        // text fields, and normalises terminology. The gate results are attached
        // to the response for audit trail purposes.
        // Derive photosDetected from damagePhotosJson — photosDetected is NOT a DB column.
        // Previously this always resolved to null, causing Phase 1 to report PHOTO_STATUS=NOT_APPLICABLE.
        let p1PhotoUrls: string[] = [];
        try {
          if (assessment.damagePhotosJson) {
            const _p1Photos = typeof assessment.damagePhotosJson === 'string'
              ? JSON.parse(assessment.damagePhotosJson)
              : assessment.damagePhotosJson;
            p1PhotoUrls = Array.isArray(_p1Photos) ? _p1Photos.filter((u: any) => typeof u === 'string') : [];
          }
        } catch { /* non-fatal */ }
        const p1PhotosDetected = p1PhotoUrls.length > 0 ? true : null;
        const p1 = runPhase1({
          incidentDate: (assessment as any).incidentDate ?? null,
          inspectionDate: (assessment as any).inspectionDate ?? null,
          partsCost: assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : null,
          labourCost: assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : null,
          aiEstimatedTotal: assessment.estimatedCost ? Number(assessment.estimatedCost) : null,
          repairerQuoteTotal: costIntelParsed?.documentedOriginalQuoteUsd ?? null,
          photosDetected: p1PhotosDetected,
          photosProcessed: p1PhotosDetected,
          photosProcessedCount: p1PhotoUrls.length,
          incidentType: (assessment as any).incidentType ?? null,
          incidentDescription: (assessment as any).accidentDescription ?? (assessment as any).incidentDescription ?? null,
          policeReportNumber: (assessment as any).policeReportNumber ?? null,
          textFields: {
            assessorNotes: (assessment as any).assessorNotes ?? null,
            damageDescription: (assessment as any).damageDescription ?? null,
          },
        });

        // Run a lightweight Phase 2 pass using stored assessment data.
        // This ensures the single authoritative verdict is always derived from
        // the Phase 2 Decision Engine, even on the read path.
        const { runPhase2: runP2Normalise } = await import('./phase2-decision-engine');
        let p2NormDecision: 'APPROVE' | 'REVIEW' | 'ESCALATE' | 'REJECT' | null = null;
        try {
          // Parse damage photo URLs from damagePhotosJson
          let byClaimPhotoUrls: string[] = [];
          try {
            if (assessment.damagePhotosJson) {
              const parsed = typeof assessment.damagePhotosJson === 'string'
                ? JSON.parse(assessment.damagePhotosJson)
                : assessment.damagePhotosJson;
              byClaimPhotoUrls = Array.isArray(parsed) ? parsed.filter((u: any) => typeof u === 'string') : [];
            }
          } catch { /* non-fatal */ }
          // Parse physics data for consistency score
          let byClaimPhysics: any = null;
          try {
            byClaimPhysics = assessment.physicsAnalysis
              ? (typeof assessment.physicsAnalysis === 'string' ? JSON.parse(assessment.physicsAnalysis) : assessment.physicsAnalysis)
              : null;
          } catch { /* non-fatal */ }
          const byClaimConsistency = byClaimPhysics?.damageConsistencyScore ?? 50;
          const byClaimDeltaV = byClaimPhysics?.deltaVKmh ?? byClaimPhysics?.deltaV ?? 0;
          const byClaimSeverity = assessment.structuralDamageSeverity ?? 'minor';
          const byClaimFraudScore = assessment.fraudScore ? Number(assessment.fraudScore) : 0;
          const p2Norm = runP2Normalise({
            authoritativeTotalUsd: p1.authoritativeTotalUsd ?? (assessment.estimatedCost ? Number(assessment.estimatedCost) : 0),
            incidentType: (assessment as any).incidentType ?? null,
            incidentDescription: (assessment as any).accidentDescription ?? (assessment as any).incidentDescription ?? null,
            photosDetected: byClaimPhotoUrls.length > 0 ? true : null,
            photosProcessed: byClaimPhotoUrls.length > 0 ? true : null,
            photosProcessedCount: byClaimPhotoUrls.length,
            damagePhotoUrls: byClaimPhotoUrls,
            policeReportNumber: (assessment as any).policeReportNumber ?? null,
            repairerQuoteTotal: costIntelParsed?.documentedOriginalQuoteUsd ?? null,
            deltaVKmh: Number(byClaimDeltaV),
            physicsConsistencyScore: Number(byClaimConsistency),
            structuralDamageSeverity: byClaimSeverity as string,
            fraudScore: byClaimFraudScore,
            vehicleMarketValueCents: null, // not available on read path without extra DB call
          });
          p2NormDecision = p2Norm.finalDecision;
        } catch { /* non-fatal — falls back to pipeline verdict */ }

        const normalised = normaliseReportData({
          estimatedCost: assessment.estimatedCost ? Number(assessment.estimatedCost) : null,
          estimatedPartsCost: assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : null,
          estimatedLaborCost: assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : null,
          fraudScore: assessment.fraudScore ? Number(assessment.fraudScore) : null,
          fraudRiskLevel: assessment.fraudRiskLevel,
          recommendation: assessment.recommendation,
          currencyCode: assessment.currencyCode,
          costIntelligenceJson: costIntelParsed,
          fraudScoreBreakdownJson: fraudBreakdownParsed,
          causalVerdictJson: causalVerdictParsed,
          validatedOutcomeJson: validatedOutcomeParsed,
          phase2Decision: p2NormDecision,
        });

        // Parse the full ClaimRecord JSON for the ForensicAuditReport
        let parsedClaimRecord: any = null;
        try {
          if ((assessment as any).claimRecordJson) {
            parsedClaimRecord = JSON.parse((assessment as any).claimRecordJson as string);
          }
        } catch { /* non-fatal */ }

        // Parse the dedicated narrativeAnalysisJson column (Stage 7e output).
        // Falls back to the value embedded inside claimRecord.accidentDetails.narrativeAnalysis
        // so historical assessments that pre-date the dedicated column still render correctly.
        let parsedNarrativeAnalysis: any = null;
        try {
          if ((assessment as any).narrativeAnalysisJson) {
            parsedNarrativeAnalysis = JSON.parse((assessment as any).narrativeAnalysisJson as string);
          } else if (parsedClaimRecord?.accidentDetails?.narrativeAnalysis) {
            // Fallback: extract from claimRecord for assessments before the dedicated column was added
            parsedNarrativeAnalysis = parsedClaimRecord.accidentDetails.narrativeAnalysis;
          }
        } catch { /* non-fatal */ }

        // Parse forensicAnalysis JSON to extract preGenerationCheck contradictions (C-5 fix)
        let parsedPreGenerationCheck: any = null;
        try {
          if ((assessment as any).forensicAnalysisJson) {
            const fa = JSON.parse((assessment as any).forensicAnalysisJson as string);
            parsedPreGenerationCheck = fa?.preGenerationCheck ?? null;
          }
        } catch { /* non-fatal */ }
        // Phase 4 — Parse IFE, DOE, and FEL version snapshot for Decision Narrative View
        let parsedIfeResult: any = null;
        let parsedDoeResult: any = null;
        let parsedFelVersionSnapshot: any = null;
        try {
          if ((assessment as any).ifeResultJson) {
            parsedIfeResult = typeof (assessment as any).ifeResultJson === 'string'
              ? JSON.parse((assessment as any).ifeResultJson)
              : (assessment as any).ifeResultJson;
          }
        } catch { /* non-fatal */ }
        try {
          if ((assessment as any).doeResultJson) {
            parsedDoeResult = typeof (assessment as any).doeResultJson === 'string'
              ? JSON.parse((assessment as any).doeResultJson)
              : (assessment as any).doeResultJson;
          }
        } catch { /* non-fatal */ }
        try {
          if ((assessment as any).felVersionSnapshotJson) {
            parsedFelVersionSnapshot = typeof (assessment as any).felVersionSnapshotJson === 'string'
              ? JSON.parse((assessment as any).felVersionSnapshotJson)
              : (assessment as any).felVersionSnapshotJson;
          }
        } catch { /* non-fatal */ }

        return {
          ...assessment,
          // Overwrite raw JSON strings with parsed objects so components receive
          // proper objects instead of strings that silently evaluate to null/undefined.
          costIntelligenceJson: costIntelParsed,
          fraudScoreBreakdownJson: fraudBreakdownParsed,
          // Overwrite with normalised values — these are what the UI must use
          _normalised: normalised,
          // Phase 1 gate results — for audit trail and data quality indicators
          _phase1: {
            overallStatus: p1.overallStatus,
            gates: p1.gates,
            allCorrections: p1.allCorrections,
            authoritativeTotalUsd: p1.authoritativeTotalUsd,
            costReconciliationError: p1.costReconciliationError,
            incidentType: p1.incidentType,
            photoStatusMessage: p1.photoStatusMessage,
            locale: p1.locale,
          },
          // Full ClaimRecord — all extracted fields including insurer, policy, excess, market value, etc.
          _claimRecord: parsedClaimRecord,
          // Stage 7e Narrative Analysis — dedicated field for ForensicAuditReport
          // Falls back to claimRecord.accidentDetails.narrativeAnalysis for pre-column assessments
          _narrativeAnalysis: parsedNarrativeAnalysis,
          // Pre-generation consistency check contradictions (C-5 fix)
          // Surfaces fraud score contradictions, physics indicator conflicts, and cost basis mismatches
          _preGenerationCheck: parsedPreGenerationCheck,
          // Full forensic analysis JSON — provides reconciliationLog, integrityGate, and schema validation
          // to the CongruencyPanel in ForensicAuditReport
          _forensicAnalysis: (() => {
            try {
              if ((assessment as any).forensicAnalysisJson) {
                return JSON.parse((assessment as any).forensicAnalysisJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // Phase 4 — Decision Narrative View data
          _ifeResult: parsedIfeResult,
          _doeResult: parsedDoeResult,
          _felVersionSnapshot: parsedFelVersionSnapshot,
          // Claim Quality Score — 6-dimension quality assessment with grade A-F
          _claimQuality: (() => {
            try {
              if ((assessment as any).claimQualityJson) {
                return JSON.parse((assessment as any).claimQualityJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // Stage 36: Forensic Audit Validator — 10-dimension post-pipeline validation report
          _forensicAuditValidation: (() => {
            try {
              if ((assessment as any).forensicAuditValidationJson) {
                return JSON.parse((assessment as any).forensicAuditValidationJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // Stage 12.5: Report Readiness Gate — whether the claim can be exported as a report
          _reportReadiness: (() => {
            try {
              if ((assessment as any).reportReadinessJson) {
                return JSON.parse((assessment as any).reportReadinessJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // Photo counts — ForensicAuditReport expects these as NUMBERS (not booleans).
          // imageAnalysisTotalCount = all photos linked to the claim (including deferred by vision budget)
          // imageAnalysisSuccessCount = photos successfully processed by the vision LLM
          photosDetected: Number((assessment as any).imageAnalysisTotalCount ?? 0),
          photosProcessedCount: Number((assessment as any).imageAnalysisSuccessCount ?? 0),
          // R-F-01/04/05 fix: parsed report signals — blockAutoApproval, prePublicationBlockers, costRecommendation
          _reportSignals: (() => {
            try {
              if ((assessment as any).reportSignalsJson) {
                return JSON.parse((assessment as any).reportSignalsJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
        };
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

        // ── Prior claims lookup ──────────────────────────────────────────────
        // Resolve hasPreviousClaims from the claimantHistory table using the
        // claimant linked to this claim. A claimant with totalClaims > 1 has
        // at least one prior claim on record, which adds +20 to the fraud score.
        let hasPreviousClaims = false;
        try {
          const { getDb } = await import('./db');
          const { claimantHistory, claims: claimsTable } = await import('../drizzle/schema');
          const { eq } = await import('drizzle-orm');
          const db = await getDb();
          if (db) {
            // Get the claimantId from the claims table for this claim
            const [claimRow] = await db.select({ claimantId: claimsTable.claimantId, kingaRef: claimsTable.kingaRef })
              .from(claimsTable)
              .where(eq(claimsTable.id, input.claimId))
              .limit(1);
            if (claimRow?.claimantId) {
              const [histRow] = await db.select({ totalClaims: claimantHistory.totalClaims })
                .from(claimantHistory)
                .where(eq(claimantHistory.claimantId, claimRow.claimantId))
                .limit(1);
              // totalClaims includes the current claim, so > 1 means prior claims exist
              hasPreviousClaims = (histRow?.totalClaims ?? 0) > 1;
            }
          }
        } catch { /* non-fatal: defaults to false if lookup fails */ }
        // ── ClaimRecordBridge: single authoritative data resolution ──────────
        // Resolves every field from claim_record_json first, then flat DB columns.
        // ALL downstream consumers in this procedure MUST use `bridge.*` instead
        // of reading directly from `assessment.*` to prevent split-brain data issues.
        const { resolveClaimRecord } = await import('./claim-record-bridge');
        const bridge = resolveClaimRecord(assessment as Record<string, unknown>);
        // Populate quotedAmountUsd from quotes table
        bridge.quotedAmountUsd = quotes.length > 0 ? Math.max(...quotes.map((q: any) => (q.quotedAmount || 0) / 100)) : null;

        // Run Phase 1 unit-correction gate so cost values fed to the enforcement
        // engine are already normalised (cents/dollars shift corrected, parts+labour
        // reconciled). Non-blocking — enforcement always proceeds even if WARN.
        const { runPhase1: runP1Enforcement } = await import('./phase1-data-integrity');
        const p1Enforcement = runP1Enforcement({
          partsCost: assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : null,
          labourCost: assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : null,
          aiEstimatedTotal: assessment.estimatedCost ? Number(assessment.estimatedCost) : null,
          incidentType: bridge.incidentType !== 'unknown' ? bridge.incidentType : null,
          incidentDescription: bridge.incidentDescription,
          textFields: {},
        });
        // Use Phase 1 authoritative total if available; fall back to raw DB value
        const enforcementAiCost = p1Enforcement.authoritativeTotalUsd ?? (assessment.estimatedCost || 0);
        const enforcementPartsUsd = p1Enforcement.partsUsd ?? (assessment.estimatedPartsCost ? Number(assessment.estimatedPartsCost) : 0);
        const enforcementLabourUsd = p1Enforcement.labourUsd ?? (assessment.estimatedLaborCost ? Number(assessment.estimatedLaborCost) : 0);

        // ── All field reads now go through bridge — no more ad-hoc JSON parsing ──────
        const quotedAmounts = quotes.map((q: any) => (q.quotedAmount || 0) / 100); // cents → dollars
        const damagedComponents = bridge.damagedComponents;
        const fraudIndicators = bridge.fraudIndicators;
        const fraudScore = bridge.fraudScore;
        const estimatedSpeedKmh = bridge.estimatedSpeedKmh;
        const deltaVKmh = bridge.deltaVKmh;
        const impactForceKn = bridge.impactForceKn;
        const energyKj = bridge.energyKj;
        const vehicleMassKg = bridge.vehicleMassKg;
        const accidentSeverity = bridge.structuralDamageSeverity;
        const consistencyScore = bridge.physicsConsistencyScore;
        const impactDirection = bridge.impactDirection;
        const aiEstimatedCost = enforcementAiCost; // Phase 1 unit-corrected authoritative cost
        const extractionConfidence = assessment.confidenceScore ?? bridge.dataCompletenessScore ?? 75;
        // Keep fraudScoreBreakdown for legacy consumers that still reference it below
        let fraudScoreBreakdown: any = null;
        try {
          fraudScoreBreakdown = assessment.fraudScoreBreakdownJson
            ? (typeof assessment.fraudScoreBreakdownJson === 'string' ? JSON.parse(assessment.fraudScoreBreakdownJson) : assessment.fraudScoreBreakdownJson)
            : null;
        } catch { /* ignore */ }

        // Derive damage zones from component names and impact direction.
        // Map component names to standard zone labels (Front, Rear, Left Side, Right Side, Roof, Underbody, Interior)
        const _compToZone = (comp: string): string | null => {
          const c = comp.toLowerCase();
          if (/\bfront\b|\bf\/|\bfr\b|bumper.*front|front.*bumper|windscreen|windshield|bonnet|hood|grille|headlamp|headlight|foglight|fog.lamp/.test(c)) return 'Front';
          if (/\brear\b|\br\/|\brr\b|tail|boot|trunk|back.*bumper|bumper.*rear|rear.*bumper|reverse|back.light|brake.light/.test(c)) return 'Rear';
          if (/\bleft\b|\bl\/s\b|\bl\.s\b|\bls\b|driver.side|nearside/.test(c)) return 'Left Side';
          if (/\bright\b|\br\/s\b|\br\.s\b|\brs\b|passenger.side|offside/.test(c)) return 'Right Side';
          if (/\broof\b|\bsunroof\b|\bpillar\b/.test(c)) return 'Roof';
          if (/\bunderbody\b|\bchassis\b|\bsump\b|\baxle\b|\bsuspension\b/.test(c)) return 'Underbody';
          if (/\binterior\b|\bdashboard\b|\bseat\b|\bairbag\b/.test(c)) return 'Interior';
          return null;
        };
        const _derivedZones = damagedComponents.length > 0
          ? [...new Set(damagedComponents.map((c: string) => _compToZone(c)).filter(Boolean) as string[])]
          : [];
        const damageZones = _derivedZones.length > 0
          ? _derivedZones
          : impactDirection !== 'unknown' ? [impactDirection] : [];

        const result = applyIntelligenceEnforcement({
          fraudScore: Number(fraudScore),
          fraudRiskLevel: bridge.fraudRiskLevel,
          estimatedSpeedKmh: Number(estimatedSpeedKmh),
          deltaVKmh: Number(deltaVKmh),
          impactForceKn: Number(impactForceKn),
          energyKj: Number(energyKj),
          vehicleMassKg: Number(vehicleMassKg),
          accidentSeverity,
          consistencyScore: Number(consistencyScore),
          impactDirection,
          damageZones,
          damageComponents: damagedComponents,
          aiEstimatedCost,
          quotedAmounts,
          vehicleMake: bridge.vehicleMake ?? '',
          hasPreviousClaims,
          fraudScoreBreakdownJson: fraudIndicators.length > 0 ? fraudIndicators : null,
          extractionConfidence: Number(extractionConfidence),
          incidentType: bridge.incidentType !== 'unknown' ? bridge.incidentType : undefined,
        });
        // Run the Cost Extraction Engine for guaranteed populated cost object
        const { extractCosts } = await import('./cost-extraction-engine');
        const aiPartsCost = enforcementPartsUsd; // Phase 1 unit-corrected parts cost
        const aiLabourCost = enforcementLabourUsd; // Phase 1 unit-corrected labour cost

        // ── Load actual quote line items for authoritative per-item costs ──
        let quoteLineItemsForCost: Array<{ description: string; category: string; quantity: number; unitPrice: number; lineTotal: number; isRepair?: boolean; isReplacement?: boolean }> = [];
        try {
          if (quotes.length > 0) {
            const { getQuoteLineItemsByQuoteId } = await import('./db');
            // Load line items from ALL quotes for multi-quote optimisation
            const allLineItemsByQuote: Array<{ quoteId: number; repairer: string; items: typeof quoteLineItemsForCost }> = [];
            for (const quote of quotes) {
              const lineItems = await getQuoteLineItemsByQuoteId(quote.id);
              const mappedItems = lineItems.map((li: any) => ({
                description: li.description ?? 'Unknown item',
                category: li.category ?? 'other',
                quantity: Number(li.quantity ?? 1),
                unitPrice: Number(li.unitPrice ?? 0),
                lineTotal: Number(li.lineTotal ?? 0),
                isRepair: li.isRepair === 1,
                isReplacement: li.isReplacement === 1,
              }));
              allLineItemsByQuote.push({ quoteId: quote.id, repairer: (quote as any).repairerName ?? `Repairer ${quote.id}`, items: mappedItems });
              // Use first quote as primary source for backward compat
              if (quote.id === quotes[0].id) {
                quoteLineItemsForCost = mappedItems;
              }
            }
            // Run multi-quote optimisation when more than one quote exists
            if (quotes.length > 1) {
              try {
                const { optimiseRepairCost } = await import('./pipeline-v2/quoteOptimisationEngine');
                const optimisationResult = optimiseRepairCost(allLineItemsByQuote as any, [], "unknown");
                (quoteLineItemsForCost as any).__optimisation = optimisationResult;
              } catch (optErr) {
                console.warn('[getEnforcement] Quote optimisation failed:', optErr);
              }
            }
          }
        } catch (err) {
          console.warn('[getEnforcement] Failed to load quote line items:', err);
        }

        // ── Load learning DB benchmark ──
        let learningBenchmark: { vehicleDescriptor: string; componentCount: number; collisionDirection: string; marketRegion: string; avgCostUsd: number | null; sampleSize: number } | null = null;
        try {
          const { costLearningRecords } = await import('../drizzle/schema');
          const { sql: sqlFn } = await import('drizzle-orm');
          const dbConn = await getDb();
          if (dbConn && assessment.vehicleMake) {
            const vehicleDesc = `${(assessment.vehicleMake ?? '').toLowerCase()} ${(assessment.vehicleModel ?? '').toLowerCase()}`.trim();
            if (vehicleDesc) {
              // Exclude the current claim to prevent circular self-reference in the benchmark
              const currentClaimId = input.claimId ?? 0;
              const rows = await dbConn.select({
                avgCost: sqlFn`AVG(final_cost_usd_cents)`.as('avg_cost'),
                cnt: sqlFn`COUNT(*)`.as('cnt'),
              })
                .from(costLearningRecords)
                .where(sqlFn`vehicle_descriptor LIKE ${`%${vehicleDesc}%`} AND (claim_id IS NULL OR claim_id != ${currentClaimId})`);
              const row = rows[0] as any;
              // Require at least 3 independent historical claims to avoid noise / self-reference
              if (row && Number(row.cnt) >= 3) {
                // Use claim's currency code for learning benchmark segmentation
                const claimCurrencyCode = (assessment as any).currencyCode ?? 'USD';
                learningBenchmark = {
                  vehicleDescriptor: vehicleDesc,
                  componentCount: damagedComponents.length,
                  collisionDirection: impactDirection,
                  marketRegion: claimCurrencyCode, // segmented by currency, not hardcoded country
                  avgCostUsd: row.avgCost ? Number(row.avgCost) / 100 : null, // cents → base currency unit
                  sampleSize: Number(row.cnt),
                };
              }
            }
          }
        } catch (err) {
          console.warn('[getEnforcement] Failed to query learning benchmark:', err);
        }

        const claimCurrency = (assessment as any).currencyCode ?? 'USD';
        const costExtraction = extractCosts({
          aiEstimatedCost,
          aiPartsCost,
          aiLabourCost,
          damageComponents: damagedComponents,
          accidentSeverity,
          extractionConfidence: Number(extractionConfidence),
          quotedAmounts,
          quoteLineItems: quoteLineItemsForCost,
          learningBenchmark,
          currencyCode: claimCurrency,
        });
        // Run the Weighted Fraud Scoring Engine — deterministic, rule-based
        const { computeWeightedFraudScore, countMissingFields } = await import('./weighted-fraud-scoring');
        const primaryQuotedAmount = quotedAmounts.length > 0 ? Math.max(...quotedAmounts) : 0;
        // Use bridge.dataCompletenessScore if available (from claimRecord.dataQuality),
        // otherwise fall back to countMissingFields() heuristic
        const missingDataCount = bridge.dataCompletenessScore > 0
          ? Math.round((1 - bridge.dataCompletenessScore / 100) * 10) // convert % to missing-field count
          : countMissingFields({
              estimatedSpeedKmh: Number(estimatedSpeedKmh),
              impactForceKn: Number(impactForceKn),
              energyKj: Number(energyKj),
              vehicleMake: bridge.vehicleMake ?? '',
              impactDirection,
              damageComponents: damagedComponents,
            });
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
          hasPreviousClaims,
          missingDataCount,
          aiIndicators: fraudIndicators.map(i => ({ label: i.indicator, points: i.score })),
          multiSourceConflict,
        });
        // Phase 2 — Decision & Consistency Engine
        // Runs after all scoring engines so it has the final fraud score from
        // the weighted engine. Produces the single authoritative decision.
        const { runPhase2 } = await import('./phase2-decision-engine');
        // Parse damage photo URLs from damagePhotosJson
        let phase2DamagePhotoUrls: string[] = [];
        try {
          if (assessment.damagePhotosJson) {
            const parsed = typeof assessment.damagePhotosJson === 'string'
              ? JSON.parse(assessment.damagePhotosJson)
              : assessment.damagePhotosJson;
            phase2DamagePhotoUrls = Array.isArray(parsed) ? parsed.filter((u: any) => typeof u === 'string') : [];
          }
        } catch { /* non-fatal */ }
        // Resolve vehicleMarketValue from the claims table (stored in cents)
        let phase2MarketValueCents: number | null = null;
        try {
          const { claims: claimsTable } = await import('../drizzle/schema');
          const { eq } = await import('drizzle-orm');
          const db2 = await getDb();
          if (db2) {
            const [claimRow] = await db2.select({ vehicleMarketValue: claimsTable.vehicleMarketValue })
              .from(claimsTable)
              .where(eq(claimsTable.id, input.claimId))
              .limit(1);
            phase2MarketValueCents = claimRow?.vehicleMarketValue ?? null;
          }
        } catch { /* non-fatal */ }
        // Use bridge for authoritative photo and incident data
        // FAR-2 fix: if bridge.photoUrls and damagePhotosJson are both empty, fall back to
        // damage_photo entries in claimDocuments (uploaded via the portal but not yet synced
        // into damagePhotosJson by an older pipeline run).
        let claimDocPhotoUrls: string[] = [];
        if (bridge.photoUrls.length === 0 && phase2DamagePhotoUrls.length === 0) {
          try {
            const { claimDocuments: claimDocsTable } = await import('../drizzle/schema');
            const { and: andOp } = await import('drizzle-orm');
            const db2Far = await getDb();
            if (db2Far) {
              const docs = await db2Far
                .select({ fileUrl: claimDocsTable.fileUrl })
                .from(claimDocsTable)
                .where(andOp(
                  eq(claimDocsTable.claimId, input.claimId),
                  eq(claimDocsTable.documentCategory, 'damage_photo')
                ));
              claimDocPhotoUrls = docs.map((d: any) => d.fileUrl).filter(Boolean);
            }
          } catch { /* non-fatal */ }
        }
        const phase2PhotoUrls = bridge.photoUrls.length > 0
          ? bridge.photoUrls
          : phase2DamagePhotoUrls.length > 0
            ? phase2DamagePhotoUrls
            : claimDocPhotoUrls;
        const phase2 = runPhase2({
          authoritativeTotalUsd: enforcementAiCost,
          incidentType: bridge.incidentType !== 'unknown' ? bridge.incidentType : null,
          incidentDescription: bridge.incidentDescription,
          // photosDetected: true if photos exist in source doc (even if ingestion failed)
          photosDetected: bridge.photosDetected ? true : null,
          // photosProcessed: true only if photos were actually ingested and processed
          photosProcessed: bridge.photosIngested ? true : null,
          photosProcessedCount: phase2PhotoUrls.length,
          damagePhotoUrls: phase2PhotoUrls,
          policeReportNumber: bridge.policeReportNumber,
          repairerQuoteTotal: primaryQuotedAmount > 0 ? primaryQuotedAmount : null,
          deltaVKmh: Number(deltaVKmh),
          physicsConsistencyScore: Number(consistencyScore),
          structuralDamageSeverity: accidentSeverity,
          // Use pipeline fraud score (bridge.fraudScore) not weightedFraud.totalScore
          // weightedFraud is a supplementary scoring engine; the pipeline Stage 8 score
          // is the primary authoritative fraud score.
          fraudScore: bridge.fraudScore > 0 ? bridge.fraudScore : (weightedFraud.score ?? 0),
          vehicleMarketValueCents: phase2MarketValueCents,
        });

        // Stage 27: validate and auto-heal before sending to frontend
        // Include claimId so the AI_ASSESSMENT_CONTRACT critical field check passes
        // Extract photoForensics from the stored fraudScoreBreakdownJson
        const photoForensicsData = fraudScoreBreakdown?.photoForensics ?? null;
        // Derive photosDetected (count) and photosProcessedCount from imageAnalysis DB columns.
        // The ForensicAuditReport expects these as NUMBERS (not booleans) for count display.
        // imageAnalysisTotalCount = all photos linked to the claim (including deferred)
        // imageAnalysisSuccessCount = photos successfully analysed by the vision LLM
        // NOTE: Read from `assessment` (DB row), NOT `result` (IntelligenceEnforcementResult which has no photo columns)
        const photosDetectedCount = Number((assessment as any).imageAnalysisTotalCount ?? 0);
        const photosProcessedCount = Number((assessment as any).imageAnalysisSuccessCount ?? 0);
        console.log('[DEBUG byClaim] photosDetectedCount:', photosDetectedCount, 'photosProcessedCount:', photosProcessedCount, 'imageAnalysisTotalCount raw:', (assessment as any).imageAnalysisTotalCount, 'imageAnalysisSuccessCount raw:', (assessment as any).imageAnalysisSuccessCount);
        // Resolve kingaRef from the claimRow fetched earlier in the hasPreviousClaims block
        // claimRow is scoped inside the try block above, so we re-fetch it here safely
        let _kingaRef: string | null = null;
        try {
          const { getDb: _gdb2 } = await import('./db');
          const { claims: _ct2 } = await import('../drizzle/schema');
          const { eq: _eq2 } = await import('drizzle-orm');
          const _db2 = await _gdb2();
          if (_db2) {
            const [_kr] = await _db2.select({ kingaRef: _ct2.kingaRef }).from(_ct2).where(_eq2(_ct2.id, input.claimId)).limit(1);
            _kingaRef = _kr?.kingaRef ?? null;
          }
        } catch { /* non-fatal */ }
        // Parse Claim Truth Layer from DB (unified resolution of all extraction/decision data)
        let _claimTruth: any = null;
        try {
          const ctRaw = (assessment as any).claimTruthJson;
          _claimTruth = ctRaw ? (typeof ctRaw === 'string' ? JSON.parse(ctRaw) : ctRaw) : null;
        } catch { /* non-fatal */ }
        const rawResponse = {
          ...result,
          costExtraction,
          weightedFraud,
          _phase2: phase2,
          claimId: input.claimId,
          kingaRef: _kingaRef,
          _claimTruth,
          _photoForensics: photoForensicsData,
          // Expose damageZones at top level so ForensicAuditReport Section2 VehicleDamageMap can read it
          // (IntelligenceEnforcementResult.directionFlag does NOT include damageZones — it only has mismatch/explanation)
          damageZones,
          // Physics values from bridge (actual Stage7 output) — used by report Section 2
          // These are the authoritative values; physicsEstimate is only populated when Stage7 didn't run
          _physics: (() => {
            // Parse the full physicsAnalysis JSON once so all sub-fields are available
            let physicsJson: any = null;
            try {
              const pa = (assessment as any).physicsAnalysis;
              physicsJson = pa ? (typeof pa === 'string' ? JSON.parse(pa) : pa) : null;
            } catch { /* non-fatal */ }
            return {
              deltaVKmh: Number(deltaVKmh) || 0,
              impactForceKn: Number(impactForceKn) || 0,
              energyKj: Number(energyKj) || 0,
              vehicleMassKg: Number(vehicleMassKg) || 0,
              estimatedSpeedKmh: Number(estimatedSpeedKmh) || 0,
              speedInferenceEnsemble: bridge.speedInferenceEnsemble ?? null,
              // Dual-speed forensics: claimed vs physics-inferred speed comparison
              speedForensics: physicsJson?.speedForensics ?? null,
              // Extended physics fields — stored in physicsAnalysis JSON but previously not exposed
              severityConsensus: physicsJson?.severityConsensus ?? null,
              damagePatternValidation: physicsJson?.damagePatternValidation ?? null,
              latentDamageProbability: physicsJson?.latentDamageProbability ?? null,
              velocityRange: physicsJson?.velocityRange ?? null,
              physicsNumerical: physicsJson?.physicsNumerical ?? null,
              impactVector: physicsJson?.impactVector ?? null,
              energyDistribution: physicsJson?.energyDistribution ?? null,
              decelerationG: physicsJson?.decelerationG ?? null,
              reconstructionSummary: physicsJson?.reconstructionSummary ?? null,
              damageConsistencyScore: physicsJson?.damageConsistencyScore ?? null,
              accidentSeverity: physicsJson?.accidentSeverity ?? null,
              // Physics execution status — EXECUTED / SKIPPED_NON_PHYSICAL / SKIPPED_NO_SPEED / ESTIMATED_FALLBACK
              physicsStatus: physicsJson?.physicsStatus ?? null,
              // Animal strike physics engine output (Section 2.1 animal strike block)
              animalStrikePhysics: physicsJson?.animalStrikePhysics ?? null,
              // Causal plausibility score (0–100)
              causalPlausibility: physicsJson?.causalPlausibility ?? null,
              // P6: Stage 6 image source reliability — HIGH/MEDIUM/LOW/NONE
              // LOW or NONE means imageIntelligence fallback fired; crush depths were excluded from physics consensus
              visionSourceReliability: (() => {
                // P6: visionSourceReliability is stored inside physics_analysis JSON
                // (alongside the ensemble it gates). The old code read damageAnalysisJson
                // which does not exist as a DB column — fixed to read physicsJson.
                return physicsJson?.visionSourceReliability ?? 'NONE';
              })(),
            };
          })(),
          // Override photosDetected with numeric count so ForensicAuditReport renders correctly
          photosDetected: photosDetectedCount > 0 ? photosDetectedCount : (bridge.photosDetected ? phase2PhotoUrls.length : 0),
          photosProcessedCount: photosProcessedCount > 0 ? photosProcessedCount : phase2PhotoUrls.length,
          // Expose enrichedPhotosJson from DB so Section 4 can render per-photo vision metadata.
          // The `result` spread above comes from IntelligenceEnforcementResult which does NOT
          // include DB columns — we must explicitly pull this from the `assessment` row.
          enrichedPhotosJson: (assessment as any).enrichedPhotosJson ?? null,
          // Also expose damagePhotosJson as fallback for photo URL resolution
          damagePhotosJson: (assessment as any).damagePhotosJson ?? null,
          // Expose pipeline run summary for frontend stage progress display
          // pipelineRunSummary is a DB column not in IntelligenceEnforcementResult
          pipelineRunSummary: (assessment as any).pipelineRunSummary ?? null,
          // Expose raw photo counts for frontend issue detection
          imageAnalysisTotalCount: photosDetectedCount,
          imageAnalysisSuccessCount: photosProcessedCount,
          // Expose degraded stages list for quick issue surfacing
          pipelineDegradedStagesJson: (assessment as any).pipelineDegradedStagesJson ?? null,
          // R-F-01/04/05 fix: parsed report signals — blockAutoApproval, prePublicationBlockers, costRecommendation
          _reportSignals: (() => {
            try {
              if ((assessment as any).reportSignalsJson) {
                return JSON.parse((assessment as any).reportSignalsJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // R-GH-17 (Batch 2e): add fields present in byClaim but missing from getEnforcement
          // Stage 36: Forensic Audit Validator — 10-dimension post-pipeline validation report
          _forensicAuditValidation: (() => {
            try {
              if ((assessment as any).forensicAuditValidationJson) {
                return JSON.parse((assessment as any).forensicAuditValidationJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // Stage 12.5: Report Readiness Gate — whether the claim can be exported as a report
          _reportReadiness: (() => {
            try {
              if ((assessment as any).reportReadinessJson) {
                return JSON.parse((assessment as any).reportReadinessJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // Batch 2c: decisionReadiness and degradationReasons from Stage 10
          decisionReadiness: (() => {
            try {
              if ((assessment as any).decisionReadinessJson) {
                return JSON.parse((assessment as any).decisionReadinessJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          degradationReasons: (() => {
            try {
              if ((assessment as any).degradationReasonsJson) {
                return JSON.parse((assessment as any).degradationReasonsJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          // Batch 2d: Stage 4 fieldValidation and gateDecision
          fieldValidation: (() => {
            try {
              if ((assessment as any).fieldValidationJson) {
                return JSON.parse((assessment as any).fieldValidationJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
          gateDecision: (() => {
            try {
              if ((assessment as any).gateDecisionJson) {
                return JSON.parse((assessment as any).gateDecisionJson as string);
              }
            } catch { /* non-fatal */ }
            return null;
          })(),
        };
        // Stage 27 pass 1: field contract validation (critical fields, alias mapping, fallbacks)
        // Wrapped in try-catch: validation warnings are logged server-side but never block the UI.
        // A TRPCError here causes the frontend to show "Run KINGA Assessment" for completed claims.
        let contractValidated: typeof rawResponse;
        try {
          contractValidated = validateAiAssessmentResponse(rawResponse as Record<string, unknown>, input.claimId) as typeof rawResponse;
        } catch (validationErr: any) {
          console.warn(`[getEnforcement] Stage 27 validation warning for claim ${input.claimId} (non-fatal): ${validationErr?.message ?? validationErr}`);
          contractValidated = rawResponse as typeof rawResponse;
        }
        // Stage 27 pass 2: numeric integrity, contradiction detection, NaN/Infinity clamping
        const integrityResult = validateClaimAnalysisResponse(contractValidated, `aiAssessments.byClaim(${input.claimId})`);
        return (integrityResult.passed ? integrityResult.data : contractValidated) as typeof rawResponse;
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
        const tenantId = String(ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown');
        const result = await saveDecisionSnapshot({
          ...input,
          tenantId,
          createdByUserId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
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
        const tenantId = String(ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown');

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
          replayedByUserId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
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
        const tenantId = String(ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown');
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
        const tenantId = String(ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown');

        // Rule 1 + Rule 5: validate reason and write audit entry
        const governance = await enforceGovernance({
          claimId: input.claimId,
          tenantId,
          action: 'REVIEWED',
          performedBy: String(ctx.user?.id ?? 'unknown'),
          performedByName: ctx.user?.name ?? undefined,
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
          userId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
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
        const tenantId = String(ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown');

        // Rule 1 + Rule 2 + Rule 5: validate, detect override, write audit
        const governance = await enforceGovernance({
          claimId: input.claimId,
          tenantId,
          action: 'FINALISED',
          performedBy: String(ctx.user?.id ?? 'unknown'),
          performedByName: ctx.user?.name ?? undefined,
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
          userId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
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
        const tenantId = String(ctx.user?.tenantId ?? ctx.user?.id ?? 'unknown');

        // Rule 1 + Rule 3 + Rule 5: validate reason, verify lock conditions, write audit
        const governance = await enforceGovernance({
          claimId: input.claimId,
          tenantId,
          action: 'LOCKED',
          performedBy: String(ctx.user?.id ?? 'unknown'),
          performedByName: ctx.user?.name ?? undefined,
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
          userId: ctx.user?.id !== undefined ? String(ctx.user.id) : undefined,
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
          const imgs = (assessment as any).imageUrls
            ? (typeof (assessment as any).imageUrls === 'string'
                ? JSON.parse((assessment as any).imageUrls)
                : (assessment as any).imageUrls)
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
          costBasis: (assessment as any).costBasis ?? null,
          panelBeaterFromCostIntel,
          panelBeaterFromAssessor: (assessment as any).panelBeaterName ?? null,
          repairerName: (assessment as any).repairerName ?? null,
          accidentDescription: assessment.accidentDescription ?? null,
          imageUrls,
          imageProcessingRan,
          damagedComponents,
          physicsExecuted,
          impactSpeedKmh: impactSpeedKmh ? Number(impactSpeedKmh) : null,
          impactForceKn: impactForceKn ? Number(impactForceKn) : null,
          severityClassification,
          hasVectors,
          accidentType: (assessment as any).accidentType ?? null,
          structuralDamage: !!((assessment as any).structuralDamage),
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
    // ─── Push Report to Role ─────────────────────────────────────────────────
    // Shares a completed assessment report with a specific insurer role.
    // All users with that role will receive a notification and the report will
    // appear in their Reports Centre under "Shared with Me".
    pushReportToRole: protectedProcedure
      .input(z.object({
        claimId: z.number().int(),
        targetRole: z.enum([
          "claims_processor",
          "assessor_internal",
          "risk_manager",
          "claims_manager",
          "executive",
          "underwriter",
          "insurer_admin",
        ]),
        message: z.string().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { getDb, getAiAssessmentByClaimId, createNotification } = await import("./db");
        const { getUsersByInsurerRoles: _getByRoles } = await import("./db");
        const { aiAssessments: aiAssessmentsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { claims: claimsTable } = await import("../drizzle/schema");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        // Fetch the assessment to get its ID and verify it exists
        const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
        if (!assessment) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found for this claim" });

        // Fetch claim details for the notification
        const [claimRow] = await db.select({ claimNumber: claimsTable.claimNumber, vehicleMake: claimsTable.vehicleMake, vehicleModel: claimsTable.vehicleModel })
          .from(claimsTable)
          .where(eq(claimsTable.id, input.claimId))
          .limit(1);

        // Update sharedWithRolesJson — append the new role if not already present
        let currentRoles: string[] = [];
        try {
          const raw = (assessment as any).sharedWithRolesJson;
          currentRoles = raw ? JSON.parse(raw) : [];
        } catch { /* ignore */ }
        if (!currentRoles.includes(input.targetRole)) {
          currentRoles.push(input.targetRole);
          await db.update(aiAssessmentsTable)
            .set({ sharedWithRolesJson: JSON.stringify(currentRoles) } as any)
            .where(eq(aiAssessmentsTable.id, assessment.id));
        }

        // Notify all users with the target role
        const targetUsers = await _getByRoles([input.targetRole]);
        const actorName = (ctx.user as any).name ?? "A colleague";
        const claimRef = claimRow?.claimNumber ?? `Claim #${input.claimId}`;
        const vehicleLabel = [claimRow?.vehicleMake, claimRow?.vehicleModel].filter(Boolean).join(" ") || "";
        const customMsg = input.message ? ` — "${input.message}"` : "";
        for (const targetUser of targetUsers) {
          if (targetUser.id) {
            await createNotification({
              userId: targetUser.id,
              title: `Report Shared: ${claimRef}`,
              message: `${actorName} has shared the assessment report for ${claimRef}${vehicleLabel ? ` (${vehicleLabel})` : ""} with your role${customMsg}. View it in your Reports Centre.`,
              type: "system_alert",
              claimId: input.claimId,
              entityType: "claim",
              entityId: input.claimId,
              actionUrl: `/insurer-portal/comparison/${input.claimId}`,
              priority: "medium",
            });
          }
        }

        return {
          success: true,
          sharedWithRoles: currentRoles,
          notifiedCount: targetUsers.length,
          message: `Report shared with ${targetUsers.length} user${targetUsers.length !== 1 ? "s" : ""} in the "${input.targetRole.replace(/_/g, " ")}" role.`,
        };
      }),
    // Get which roles a report has been shared with
    getSharedRoles: protectedProcedure
      .input(z.object({ claimId: z.number().int() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { getAiAssessmentByClaimId } = await import("./db");
        const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
        const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
        if (!assessment) return { sharedWithRoles: [] as string[] };
        let roles: string[] = [];
        try {
          const raw = (assessment as any).sharedWithRolesJson;
          roles = raw ? JSON.parse(raw) : [];
        } catch { /* ignore */ }
        return { sharedWithRoles: roles };
      }),
    // Get all claims whose report has been shared with the current user's insurerRole
    getSharedWithMe: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const insurerRole = (ctx.user as any).insurerRole as string | null;
      if (!insurerRole) return { claims: [] as any[] };
      const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
      const { getDb: _getDb } = await import("./db");
      const db2 = await _getDb();
      if (!db2) return { claims: [] as any[] };
      const { aiAssessments: aiAssessmentsTable2 } = await import("../drizzle/schema");
      const { claims: claimsTable2 } = await import("../drizzle/schema");
      const { eq: eq2, and: and2, isNotNull: isNotNull2 } = await import("drizzle-orm");
      const rows2 = await db2
        .select({
          assessmentId: aiAssessmentsTable2.id,
          claimId: aiAssessmentsTable2.claimId,
          sharedWithRolesJson: (aiAssessmentsTable2 as any).sharedWithRolesJson,
          fraudScore: aiAssessmentsTable2.fraudScore,
          overallRisk: (aiAssessmentsTable2 as any).overallRisk,
          createdAt: aiAssessmentsTable2.createdAt,
          claimNumber: claimsTable2.claimNumber,
          vehicleMake: claimsTable2.vehicleMake,
          vehicleModel: claimsTable2.vehicleModel,
          vehicleYear: claimsTable2.vehicleYear,
          claimStatus: claimsTable2.status,
          incidentDate: claimsTable2.incidentDate,
        })
        .from(aiAssessmentsTable2)
        .innerJoin(claimsTable2, eq2(aiAssessmentsTable2.claimId, claimsTable2.id))
        .where(
          tenantId
            ? and2(
                isNotNull2((aiAssessmentsTable2 as any).sharedWithRolesJson),
                eq2(claimsTable2.tenantId, tenantId)
              )
            : isNotNull2((aiAssessmentsTable2 as any).sharedWithRolesJson)
        )
        .orderBy(aiAssessmentsTable2.createdAt);
      const filtered2 = rows2.filter((row: any) => {
        try {
          const roles2: string[] = JSON.parse((row as any).sharedWithRolesJson ?? "[]");
          return roles2.includes(insurerRole);
        } catch { return false; }
      });
      return {
        claims: filtered2.map((row: any) => ({
          assessmentId: row.assessmentId,
          claimId: row.claimId,
          claimNumber: row.claimNumber,
          vehicleMake: row.vehicleMake,
          vehicleModel: row.vehicleModel,
          vehicleYear: row.vehicleYear,
          claimStatus: row.claimStatus,
          incidentDate: row.incidentDate,
          fraudScore: row.fraudScore,
          overallRisk: row.overallRisk,
          createdAt: row.createdAt,
        })),
      };
    }),

    // ─── Resolve PDF fragment URLs → renderable PNG URLs ─────────────────────
    // The pipeline stores PDF fragment URLs (e.g. ...pdf#page=12) in enrichedPhotosJson
    // when using pdf_single_pass_vision mode. These cannot be rendered by <img> tags.
    // This procedure renders the referenced pages to PNG, uploads to S3, and returns
    // fresh PNG URLs. Results are also written back to enrichedPhotosJson so subsequent
    // loads skip this step.
    resolvePdfPhotoUrls: protectedProcedure
      .input(z.object({
        claimId: z.number().int(),
        photos: z.array(z.object({
          index: z.number().int(),
          url: z.string(),
          pageNumber: z.number().int().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { getDb: _getDb2, getAiAssessmentByClaimId: _getAssessment } = await import("./db");
        const { aiAssessments: _aiAssessmentsTable } = await import("../drizzle/schema");
        const { eq: _eq } = await import("drizzle-orm");
        const _tenantId = ctx.user.role === "admin" ? undefined : ((ctx.user as any).tenantId || "default");
        const _db = await _getDb2();
        if (!_db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        // Separate PDF fragment URLs from already-renderable URLs
        const _pdfFragmentPattern = /\.pdf#page=(\d+)$/i;
        const _toRender = input.photos.filter(p => _pdfFragmentPattern.test(p.url));

        if (_toRender.length === 0) {
          return { resolved: input.photos.map(p => ({ index: p.index, url: p.url, resolved: false })) };
        }

        // Group by base PDF URL to minimise downloads
        const _byPdf = new Map<string, Array<{ index: number; pageNumber: number }>>();
        for (const p of _toRender) {
          const _match = p.url.match(/^(.+\.pdf)#page=(\d+)$/i);
          if (!_match) continue;
          const [, _basePdfUrl, _pageStr] = _match;
          const _pageNum = p.pageNumber ?? parseInt(_pageStr, 10);
          if (!_byPdf.has(_basePdfUrl)) _byPdf.set(_basePdfUrl, []);
          _byPdf.get(_basePdfUrl)!.push({ index: p.index, pageNumber: _pageNum });
        }

        const _resolvedMap = new Map<number, string>(); // index → PNG URL

        for (const [_basePdfUrl, _pages] of _byPdf.entries()) {
          try {
            const { storageGet: _storageGet } = await import("./storage");
            let _pdfDownloadUrl = _basePdfUrl;
            try {
              const _urlObj = new URL(_basePdfUrl);
              const _s3Key = _urlObj.pathname.slice(1);
              const { url: _presigned } = await _storageGet(_s3Key);
              _pdfDownloadUrl = _presigned;
            } catch {
              _pdfDownloadUrl = _basePdfUrl;
            }

            const _pageNumbers = _pages.map(p => p.pageNumber);
            const { renderSpecificPdfPages: _renderPages } = await import("./pipeline-v2/pdfToImages");
            const _rendered = await _renderPages(
              _pdfDownloadUrl,
              _pageNumbers,
              {
                dpi: 100,
                keyPrefix: `claims/${input.claimId}/report-photos`,
                log: (msg: string) => logger.info('resolvePdfPhotoUrls', msg, { claimId: String(input.claimId) }),
              } as any
            );

            for (const _p of _pages) {
              const _page = _rendered.get(_p.pageNumber);
              if (_page?.url) {
                _resolvedMap.set(_p.index, _page.url);
              }
            }
          } catch (_err: any) {
            console.error(`[resolvePdfPhotoUrls] Claim ${input.claimId}: Failed to render PDF ${_basePdfUrl}: ${_err.message}`);
          }
        }

        // Build resolved array
        const _resolved = input.photos.map(p => ({
          index: p.index,
          url: _resolvedMap.get(p.index) ?? p.url,
          resolved: _resolvedMap.has(p.index),
        }));

        // Write resolved PNG URLs back to enrichedPhotosJson in DB
        if (_resolvedMap.size > 0) {
          try {
            const _assessment = await _getAssessment(input.claimId, _tenantId);
            if (_assessment) {
              let _enriched: any[] = [];
              try {
                const _raw = (_assessment as any).enrichedPhotosJson;
                _enriched = _raw ? (typeof _raw === 'string' ? JSON.parse(_raw) : _raw) : [];
              } catch { _enriched = []; }
              for (const [_idx, _pngUrl] of _resolvedMap.entries()) {
                const _entry = _enriched.find((e: any) => e.index === _idx);
                if (_entry) _entry.url = _pngUrl;
                else if (_enriched[_idx]) _enriched[_idx].url = _pngUrl;
              }
              await _db.update(_aiAssessmentsTable)
                .set({ enrichedPhotosJson: JSON.stringify(_enriched) } as any)
                .where(_eq(_aiAssessmentsTable.claimId, input.claimId));
            }
          } catch (_writeErr: any) {
            console.warn(`[resolvePdfPhotoUrls] Claim ${input.claimId}: Failed to write back resolved URLs (non-fatal): ${_writeErr.message}`);
          }
        }

        return { resolved: _resolved };
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

        // ── ROUTE 2: Separate document upload → panel_beater_quotes ────────────
        // When a repair_quote or invoice document is uploaded, automatically
        // extract the quote using AI vision and persist it to panel_beater_quotes.
        // This runs fire-and-forget so upload response is never delayed.
        if (input.documentCategory === 'repair_quote' || input.documentCategory === 'invoice') {
          (async () => {
            try {
              const { invokeLLM } = await import('./_core/llm.ts');
              const extractionPrompt = `You are analyzing a motor vehicle repair quote document. Extract the following and return ONLY valid JSON:
{
  "repairerName": "<business name of the repairer/panel beater, or null>",
  "totalAmountUsd": <total quoted amount as a decimal number, 0 if not found>,
  "labourCostUsd": <labour/labor cost as decimal, 0 if not found>,
  "partsCostUsd": <parts cost as decimal, 0 if not found>,
  "currency": "<ISO currency code, default USD>",
  "lineItems": [
    { "description": "<item>", "quantity": 1, "unitPrice": 0.0, "lineTotal": 0.0, "category": "parts" }
  ]
}
If any value is not found, use null or 0. Line items category must be one of: parts, labor, paint, diagnostic, sundries, other.`;
              const visionResp = await invokeLLM({
                messages: [{ role: 'user', content: [
                  { type: 'text', text: extractionPrompt },
                  { type: 'image_url', image_url: { url: result.url } }
                ] as any }],
                response_format: { type: 'json_object' } as any,
              });
              const extracted = JSON.parse(visionResp.choices[0].message.content as string);
              if (extracted?.totalAmountUsd > 0) {
                const { persistExtractedQuote } = await import('./persistExtractedQuote');
                await persistExtractedQuote({
                  claimId: input.claimId,
                  tenantId: ctx.user.tenantId ?? null,
                  repairerName: extracted.repairerName ?? input.documentTitle ?? 'Uploaded Repairer',
                  quotedAmountUnits: extracted.totalAmountUsd,
                  labourCostUnits: extracted.labourCostUsd ?? null,
                  partsCostUnits: extracted.partsCostUsd ?? null,
                  currency: extracted.currency ?? 'USD',
                  lineItems: (extracted.lineItems ?? []).map((li: any) => ({
                    description: li.description ?? 'Item',
                    quantity: Number(li.quantity) || 1,
                    unitPrice: Number(li.unitPrice) || 0,
                    lineTotal: Number(li.lineTotal) || 0,
                    category: li.category ?? 'parts',
                  })),
                  source: 'document_upload',
                });
                console.log(`[documents.upload] Claim ${input.claimId}: Quote extracted and persisted from uploaded ${input.documentCategory}`);
              }
            } catch (e: any) {
              console.warn(`[documents.upload] Claim ${input.claimId}: Quote auto-extraction failed (non-fatal):`, e?.message);
            }
          })();
        }

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
          reportDate: input.reportDate ? new Date(input.reportDate).toISOString() : undefined,
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
   * Handles KINGA-powered vehicle market valuation
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
            `Please re-run the KINGA assessment first to extract vehicle details from the uploaded document.`
          );
        }
        // Get assessor evaluation for repair cost
        const evaluation = await getAssessorEvaluationByClaimId(input.claimId);
        const repairCost = evaluation?.estimatedRepairCost;

        // ── Year resolution ───────────────────────────────────────────────────
        // If the claim has no vehicleYear (or it was nulled by Stage 4 OCR normalisation),
        // fall back to the current year and set yearAssumed so the UI can show an amber note.
        const { normaliseOcrYear } = await import("../shared/vehicleYearValidation");
        const rawYear = claim.vehicleYear;
        const { year: normalisedYear, warning: yearNormWarning } = normaliseOcrYear(rawYear);
        const resolvedYear = normalisedYear ?? new Date().getFullYear();
        const yearAssumed = !normalisedYear; // true when year was missing or nulled
        const yearAssumedReason = yearAssumed
          ? (yearNormWarning ?? `Vehicle year not available; assumed ${resolvedYear} for valuation purposes.`)
          : null;

        // ── Mileage resolution ────────────────────────────────────────────────
        // If the user did not supply a mileage, estimate it from vehicle year/type.
        // The estimate carries LOW confidence and reduces the overall valuation
        // confidence score by 20 points.
        const { estimateMileageFromYear } = await import("./services/mileageEstimation");
        let resolvedMileage: number | undefined = input.mileage;
        let mileageEstimation: ReturnType<typeof estimateMileageFromYear> | null = null;
        if (!resolvedMileage) {
          mileageEstimation = estimateMileageFromYear(
            resolvedYear,
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
            year: resolvedYear,
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

        // Apply confidence penalty when year was assumed
        if (yearAssumed) {
          valuation.confidenceScore = Math.max(10, (valuation.confidenceScore ?? 50) - 15);
          valuation.notes = [
            `⚠️ YEAR ASSUMED: ${yearAssumedReason}`,
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
          valuationDate: valuation.valuationDate instanceof Date ? valuation.valuationDate.toISOString() : valuation.valuationDate,
          validUntil: valuation.validUntil instanceof Date ? valuation.validUntil.toISOString() : (valuation.validUntil ?? undefined),
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
        const _vDb = await getDb();
        if (_vDb) await _vDb.update(claims).set({ vehicleMarketValue: valuation.finalAdjustedValue }).where(eq(claims.id, input.claimId));

        // Return valuation enriched with mileage estimation and year assumption metadata
        return {
          ...valuation,
          mileageEstimation: mileageEstimation ? {
            estimated_mileage_range: mileageEstimation.estimated_mileage_range,
            assumed_mileage_used: mileageEstimation.assumed_mileage_used,
            confidence: mileageEstimation.confidence,
            source: mileageEstimation.source,
            warning_message: mileageEstimation.warning_message,
          } : null,
          yearAssumed,
          yearAssumedReason,
          resolvedYear,
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
     * Stage 11 — Enrich damage photos with vision KINGA analysis.
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

        // Load the claim and its latest KINGA assessment
        const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
        const { getAiAssessmentByClaimId, getClaimById } = await import('./db');
        const [assessment, claim] = await Promise.all([
          getAiAssessmentByClaimId(input.claimId, tenantId),
          getClaimById(input.claimId, tenantId),
        ]);

        if (!assessment) throw new Error('No KINGA assessment found for this claim');
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
          reportedDamageDescription: (assessment as any)?.damageDescription ?? null,
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
              } catch (narrativeErr: unknown) {
                // R-GH-16: Narrative generation failure is non-fatal but must be observable.
                console.warn(
                  `[runConsistencyCheck] Mismatch narrative generation failed for assessment ${freshAssessment.id}: ` +
                  `${narrativeErr instanceof Error ? narrativeErr.message : String(narrativeErr)}`
                );
              }
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
                    aiEstimatedCost: 0,
                    quotedAmount: 0,
                    impactDirection: 'unknown',
                    damageZones: [],
                    hasPreviousClaims: false,
                    missingDataCount: 0,
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
              } catch (fraudUpdateErr: unknown) {
                // R-GH-16: Fraud score update failure is non-fatal but must be observable.
                console.warn(
                  `[runConsistencyCheck] Fraud score update failed for assessment ${freshAssessment.id}: ` +
                  `${fraudUpdateErr instanceof Error ? fraudUpdateErr.message : String(fraudUpdateErr)}`
                );
              }
            }
          }
        } catch (autoTriggerErr: unknown) {
          // R-GH-16: Auto-trigger consistency check failure is non-fatal but must be observable.
          // Without this log, a broken import or DB error here is completely invisible.
          console.warn(
            `[enrichAssessment] Auto-trigger consistency check failed for assessment ${assessment?.id ?? 'unknown'}: ` +
            `${autoTriggerErr instanceof Error ? autoTriggerErr.message : String(autoTriggerErr)}`
          );
        }

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
        // R-GH-13: declare db and aiAssessments locally (were missing, causing pre-existing TS errors)
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { aiAssessments } = await import('../drizzle/schema');
        // R-GH-16: scope to caller's tenant so cross-tenant reads are blocked
        const tenantId = ctx.user?.role === 'admin' ? undefined : (ctx.user?.tenantId || undefined);
        const assessment = await getAiAssessmentByClaimId(input.claimId, tenantId);
        if (!assessment) throw new TRPCError({ code: 'NOT_FOUND', message: 'No KINGA assessment found for this claim' });

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

        // ── 1. Fetch KINGA assessment for re-validation context ──────────────
        const aiAssessment = await getAiAssessmentByClaimId(input.claimId, tenantId);

        // Extract damage zones from physics analysis if available
        let damageZones: string[] = [];
        let damagedComponents: string[] = [];
        if (aiAssessment) {
          try {
            // R-GH-22: impactZones was a legacy field name; damageZones is the
            // canonical typed field (added to LegacyPhysicsFields by R-GH-14).
            const _rawZones = aiAssessment.physicsAnalysisParsed?.damageZones;
            if (_rawZones) {
              damageZones = (_rawZones as any[]).map(
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
          tenantId: (ctx.user as any).tenantId ?? '',
          userId: input.userId,
          driverLicenseNumber: input.driverLicenseNumber,
          licenseExpiry: input.licenseExpiry || new Date().toISOString().split('T')[0],
          licenseClass: input.licenseClass || null,
          hireDate: input.hireDate || new Date().toISOString().split('T')[0],
          emergencyContactName: input.emergencyContactName || null,
          emergencyContactPhone: input.emergencyContactPhone || null,
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
          quoteValidUntil: quoteValidUntil.toISOString(),
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
            paymentDate: input.paymentDate instanceof Date ? input.paymentDate.toISOString() : input.paymentDate,
            paymentSubmittedAt: new Date().toISOString(),
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
            paymentVerifiedAt: new Date().toISOString(),
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

  // ── Subrogation Recovery Module ──────────────────────────────────────────
  recovery: router({
    /**
     * Get all recovery cases for the current insurer tenant.
     * Accessible by: recovery_officer, claims_manager, executive, insurer_admin
     */
    getCases: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        assignedToMe: z.boolean().optional(),
        repeatOffendersOnly: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        if (!tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No insurer tenant associated with this account' });
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access requires recovery_officer, claims_manager, executive, or insurer_admin role' });
        }
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 20;
        const offset = (page - 1) * pageSize;
        const conditions = [eq(recoveryCases.tenantId, tenantId)];
        if (input?.status) conditions.push(eq(recoveryCases.status, input.status as any));
        if (input?.assignedToMe) conditions.push(eq(recoveryCases.assignedOfficerUserId, user.id));
        if (input?.repeatOffendersOnly) conditions.push(eq(recoveryCases.isRepeatOffender, 1));
        const rows = await db
          .select()
          .from(recoveryCases)
          .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
          .where(and(...conditions))
          .orderBy(desc(recoveryCases.recoveryPotentialScore))
          .limit(pageSize)
          .offset(offset);
        return rows.map(r => ({
          ...r.recovery_cases,
          claimNumber: r.claims?.claimNumber ?? null,
          vehicleRegistration: r.claims?.vehicleRegistration ?? null,
          incidentDate: r.claims?.incidentDate ?? null,
        }));
      }),

    /**
     * Get a single recovery case by ID.
     */
    getCase: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        const [row] = await db
          .select()
          .from(recoveryCases)
          .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
          .where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId)))
          .limit(1);
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
        return {
          ...row.recovery_cases,
          claimNumber: row.claims?.claimNumber ?? null,
          vehicleRegistration: row.claims?.vehicleRegistration ?? null,
          incidentDate: row.claims?.incidentDate ?? null,
          policeReportNumber: row.recovery_cases.policeReportNumber ?? row.claims?.policeReportNumber ?? null,
          policeStation: row.recovery_cases.policeStation ?? null,
          thirdPartyNameFromClaim: row.claims?.thirdPartyName ?? null,
          thirdPartyRegistrationFromClaim: row.claims?.thirdPartyRegistration ?? null,
          thirdPartyInsurerFromClaim: row.claims?.thirdPartyInsurer ?? null,
        };
      }),

    /**
     * Update a recovery case — officer notes, status change, investigation details.
     */
    updateCase: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending_review','under_investigation','open','demand_sent','liability_denied','disputed_legal','settled_full','settled_partial','closed_no_recovery','archived']).optional(),
        officerNotes: z.string().optional(),
        recoveredAmount: z.number().optional(),
        investigationReason: z.string().optional(),
        investigationExpectedResolutionDate: z.string().optional(),
        demandLetterSentAt: z.string().optional(),
        demandResponseDueDate: z.string().optional(),
        demandResponseReceivedAt: z.string().optional(),
        settlementAgreementDate: z.string().optional(),
        settlementNotes: z.string().optional(),
        recoveryTarget: z.enum(['insurer','individual','unknown']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        const [existing] = await db
          .select({ id: recoveryCases.id })
          .from(recoveryCases)
          .where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
        const updateData: Record<string, unknown> = {};
        if (input.status !== undefined) updateData.status = input.status;
        if (input.officerNotes !== undefined) updateData.officerNotes = input.officerNotes;
        if (input.recoveredAmount !== undefined) updateData.recoveredAmount = input.recoveredAmount;
        if (input.investigationReason !== undefined) updateData.investigationReason = input.investigationReason;
        if (input.investigationExpectedResolutionDate !== undefined) updateData.investigationExpectedResolutionDate = input.investigationExpectedResolutionDate;
        if (input.demandLetterSentAt !== undefined) updateData.demandLetterSentAt = input.demandLetterSentAt;
        if (input.demandResponseDueDate !== undefined) updateData.demandResponseDueDate = input.demandResponseDueDate;
        if (input.demandResponseReceivedAt !== undefined) updateData.demandResponseReceivedAt = input.demandResponseReceivedAt;
        if (input.settlementAgreementDate !== undefined) updateData.settlementAgreementDate = input.settlementAgreementDate;
        if (input.settlementNotes !== undefined) updateData.settlementNotes = input.settlementNotes;
        if (input.recoveryTarget !== undefined) updateData.recoveryTarget = input.recoveryTarget;
        // Auto-set closedAt when terminal status is set
        if (input.status && ['settled_full','settled_partial','closed_no_recovery','archived'].includes(input.status)) {
          updateData.closedAt = new Date().toISOString().replace('T',' ').substring(0,19);
        }
         await db.update(recoveryCases).set(updateData).where(eq(recoveryCases.id, input.id));
        // Auto-log status change
        const now = new Date().toISOString().replace('T',' ').substring(0,19);
        const actorName = (user as any).name ?? (user as any).email ?? 'Unknown';
        const actorRole = (user as any).insurerRole ?? user.role ?? 'user';
        if (input.status) {
          db.insert(recoveryCorrespondenceLog).values({
            recoveryCaseId: input.id, tenantId,
            entryType: 'status_change',
            actorId: user.id.toString(), actorName, actorRole,
            subject: `Status changed to ${input.status.replace(/_/g,' ')}`,
            body: input.officerNotes ?? null,
            toStatus: input.status,
            createdAt: now,
          }).catch(() => {});
        }
        if (input.recoveryTarget) {
          db.insert(recoveryCorrespondenceLog).values({
            recoveryCaseId: input.id, tenantId,
            entryType: 'recovery_target_changed',
            actorId: user.id.toString(), actorName, actorRole,
            subject: `Recovery target changed to ${input.recoveryTarget}`,
            toTarget: input.recoveryTarget,
            createdAt: now,
          }).catch(() => {});
        }
        // Event-driven deadline check: fire immediately after any case update
        checkSingleCaseDeadline(input.id).catch(err =>
          console.error(`[RecoveryDeadlineAlerts] Event-driven check failed for RC-${input.id}:`, err)
        );
        return { success: true };
      }),
    /**
     * Assign a recovery case to a recovery officer.
     */
    assignCase: protectedProcedure
      .input(z.object({ id: z.number(), officerUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only claims managers, executives, or admins can assign recovery cases' });
        }
        await db.update(recoveryCases)
          .set({ assignedOfficerUserId: input.officerUserId, assignedAt: new Date().toISOString().replace('T',' ').substring(0,19) })
          .where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId)));
        return { success: true };
      }),

    /**
     * Generate an AI demand letter on insurer letterhead for a recovery case.
     * Returns a presigned S3 URL to the draft PDF.
     */
    generateDemandLetter: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only recovery officers, claims managers, or admins can generate demand letters' });
        }
        const [rcRow] = await db.select().from(recoveryCases).where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId))).limit(1);
        if (!rcRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
        const allowedStatuses = ['open','demand_sent','pending_review'];
        if (!allowedStatuses.includes(rcRow.status)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot generate demand letter for a case in '${rcRow.status}' status. Move the case to 'Open' first.` });
        }
        const result = await generateDemandLetter(input.id);
        // Auto-log demand letter generation
        const now = new Date().toISOString().replace('T',' ').substring(0,19);
        db.insert(recoveryCorrespondenceLog).values({
          recoveryCaseId: input.id, tenantId,
          entryType: 'demand_letter_generated',
          actorId: user.id.toString(),
          actorName: (user as any).name ?? (user as any).email ?? 'Unknown',
          actorRole: (user as any).insurerRole ?? user.role ?? 'user',
          subject: 'Demand letter generated',
          attachmentUrl: result.downloadUrl,
          createdAt: now,
        }).catch(() => {});
        return { downloadUrl: result.downloadUrl, s3Key: result.s3Key };
      }),
    /**
     * Get recovery KPIs for the current insurer tenant.
     */
    getKPIs: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        const rows = await db
          .select()
          .from(recoveryCases)
          .where(eq(recoveryCases.tenantId, tenantId));
        const total = rows.length;
        const pendingReview = rows.filter(r => r.status === 'pending_review').length;
        const open = rows.filter(r => r.status === 'open').length;
        const underInvestigation = rows.filter(r => r.status === 'under_investigation').length;
        const demandSent = rows.filter(r => r.status === 'demand_sent').length;
        const disputedLegal = rows.filter(r => r.status === 'disputed_legal').length;
        const settled = rows.filter(r => r.status === 'settled_full' || r.status === 'settled_partial').length;
        const archived = rows.filter(r => r.status === 'archived').length;
        const totalRecovered = rows.reduce((sum, r) => sum + (r.recoveredAmount ?? 0), 0);
        const totalSettlementAmount = rows.reduce((sum, r) => sum + (r.approvedSettlementAmount ?? 0), 0);
        const recoveryRate = totalSettlementAmount > 0 ? Math.round((totalRecovered / totalSettlementAmount) * 100) : 0;
        const avgRPS = total > 0 ? Math.round(rows.reduce((sum, r) => sum + r.recoveryPotentialScore, 0) / total) : 0;
        // Recovery deadline warnings: cases with deadline within 90 days
        const today = new Date();
        const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const approachingDeadlines = rows.filter(r =>
          r.recoveryDeadline && r.recoveryDeadline <= in90Days &&
          !['settled_full','settled_partial','closed_no_recovery','archived'].includes(r.status)
        ).length;
        return { total, pendingReview, open, underInvestigation, demandSent, disputedLegal, settled, archived, totalRecovered, totalSettlementAmount, recoveryRate, avgRPS, approachingDeadlines };
      }),

    /**
     * Fetch prior recovery cases by an array of IDs (for the repeat offender panel).
     */

    /**
     * Get inter-insurer intelligence — settlement rate, dispute rate, avg settlement time
     * per third-party insurer across all recovery cases for this tenant.
     * Accessible by: recovery_officer, claims_manager
     */
    getInsurerIntelligence: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        // Load all closed/settled/disputed recovery cases with a third-party insurer
        const rows = await db
          .select({
            thirdPartyInsurer: recoveryCases.thirdPartyInsurer,
            status: recoveryCases.status,
            approvedSettlementAmount: recoveryCases.approvedSettlementAmount,
            recoveredAmount: recoveryCases.recoveredAmount,
            createdAt: recoveryCases.createdAt,
            demandLetterSentAt: recoveryCases.demandLetterSentAt,
            settlementAgreementDate: recoveryCases.settlementAgreementDate,
          })
          .from(recoveryCases)
          .where(
            and(
              eq(recoveryCases.tenantId, tenantId),
              isNotNull(recoveryCases.thirdPartyInsurer)
            )
          )
          .orderBy(recoveryCases.createdAt);

        // Aggregate per insurer
        const map: Record<string, {
          insurer: string;
          total: number;
          settled: number;
          disputed: number;
          noRecovery: number;
          totalApprovedCents: number;
          totalRecoveredCents: number;
          settlementDays: number[];
        }> = {};

        for (const row of rows) {
          const ins = row.thirdPartyInsurer!;
          if (!map[ins]) {
            map[ins] = { insurer: ins, total: 0, settled: 0, disputed: 0, noRecovery: 0, totalApprovedCents: 0, totalRecoveredCents: 0, settlementDays: [] };
          }
          const entry = map[ins];
          entry.total++;
          if (row.status === 'settled_full' || row.status === 'settled_partial') {
            entry.settled++;
            // Days from demand sent to settlement
            if (row.demandLetterSentAt && row.settlementAgreementDate) {
              const days = Math.round((new Date(row.settlementAgreementDate).getTime() - new Date(row.demandLetterSentAt).getTime()) / (1000 * 60 * 60 * 24));
              if (days >= 0 && days < 3650) entry.settlementDays.push(days);
            }
          } else if (row.status === 'disputed_legal') {
            entry.disputed++;
          } else if (row.status === 'closed_no_recovery') {
            entry.noRecovery++;
          }
          if (row.approvedSettlementAmount) entry.totalApprovedCents += row.approvedSettlementAmount;
          if (row.recoveredAmount) entry.totalRecoveredCents += row.recoveredAmount;
        }

        return Object.values(map)
          .filter(e => e.total >= 1)
          .map(e => ({
            insurer: e.insurer,
            totalCases: e.total,
            settledCases: e.settled,
            disputedCases: e.disputed,
            noRecoveryCases: e.noRecovery,
            settlementRate: e.total > 0 ? Math.round((e.settled / e.total) * 100) : 0,
            disputeRate: e.total > 0 ? Math.round((e.disputed / e.total) * 100) : 0,
            avgSettlementDays: e.settlementDays.length > 0
              ? Math.round(e.settlementDays.reduce((a, b) => a + b, 0) / e.settlementDays.length)
              : null,
            totalApprovedCents: e.totalApprovedCents,
            totalRecoveredCents: e.totalRecoveredCents,
            recoveryEfficiency: e.totalApprovedCents > 0
              ? Math.round((e.totalRecoveredCents / e.totalApprovedCents) * 100)
              : 0,
          }))
          .sort((a, b) => b.totalCases - a.totalCases);
      }),

    /**
     * Get aggregated third-party profiles — individuals and insurers with case history.
     * Groups by thirdPartyName + thirdPartyRegistration, with insurer associations.
     */
    getThirdPartyProfiles: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        // Load all cases for this tenant with third-party info
        const rows = await db
          .select({
            id: recoveryCases.id,
            thirdPartyName: recoveryCases.thirdPartyName,
            thirdPartyRegistration: recoveryCases.thirdPartyRegistration,
            thirdPartyInsurer: recoveryCases.thirdPartyInsurer,
            thirdPartyPolicyNumber: recoveryCases.thirdPartyPolicyNumber,
            thirdPartyIdNumber: sql<string | null>`${recoveryCases}.third_party_id_number`,
            thirdPartyPhone: sql<string | null>`${recoveryCases}.third_party_phone`,
            thirdPartyAddress: sql<string | null>`${recoveryCases}.third_party_address`,
            thirdPartyInsurerPhone: sql<string | null>`${recoveryCases}.third_party_insurer_phone`,
            thirdPartyInsurerAddress: sql<string | null>`${recoveryCases}.third_party_insurer_address`,
            recoveryTarget: sql<string | null>`${recoveryCases}.recovery_target`,
            status: recoveryCases.status,
            approvedSettlementAmount: recoveryCases.approvedSettlementAmount,
            recoveredAmount: recoveryCases.recoveredAmount,
            currencyCode: recoveryCases.currencyCode,
            recoveryPotentialScore: recoveryCases.recoveryPotentialScore,
            isRepeatOffender: recoveryCases.isRepeatOffender,
            createdAt: recoveryCases.createdAt,
            claimNumber: claims.claimNumber,
            incidentDate: claims.incidentDate,
          })
          .from(recoveryCases)
          .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
          .where(eq(recoveryCases.tenantId, tenantId))
          .orderBy(desc(recoveryCases.createdAt));

        // Group by third-party identity key (name + registration)
        const profileMap: Record<string, {
          key: string;
          thirdPartyName: string | null;
          thirdPartyRegistration: string | null;
          thirdPartyIdNumber: string | null;
          thirdPartyPhone: string | null;
          thirdPartyAddress: string | null;
          insurers: Set<string>;
          insurerPhone: string | null;
          insurerAddress: string | null;
          cases: Array<{
            id: number;
            claimNumber: string | null;
            status: string;
            approvedSettlementAmount: number | null;
            recoveredAmount: number | null;
            currencyCode: string | null;
            recoveryPotentialScore: number | null;
            incidentDate: string | null;
            createdAt: string | null;
          }>;
          totalApprovedCents: number;
          totalRecoveredCents: number;
          settled: number;
          disputed: number;
        }> = {};

        for (const row of rows) {
          const nameKey = (row.thirdPartyName ?? '').toLowerCase().trim();
          const regKey = (row.thirdPartyRegistration ?? '').toLowerCase().trim();
          const key = nameKey || regKey ? `${nameKey}|${regKey}` : `unknown-${row.id}`;

          if (!profileMap[key]) {
            profileMap[key] = {
              key,
              thirdPartyName: row.thirdPartyName,
              thirdPartyRegistration: row.thirdPartyRegistration,
              thirdPartyIdNumber: row.thirdPartyIdNumber,
              thirdPartyPhone: row.thirdPartyPhone,
              thirdPartyAddress: row.thirdPartyAddress,
              insurers: new Set(),
              insurerPhone: row.thirdPartyInsurerPhone,
              insurerAddress: row.thirdPartyInsurerAddress,
              cases: [],
              totalApprovedCents: 0,
              totalRecoveredCents: 0,
              settled: 0,
              disputed: 0,
            };
          }
          const p = profileMap[key];
          if (row.thirdPartyInsurer) p.insurers.add(row.thirdPartyInsurer);
          if (!p.insurerPhone && row.thirdPartyInsurerPhone) p.insurerPhone = row.thirdPartyInsurerPhone;
          if (!p.insurerAddress && row.thirdPartyInsurerAddress) p.insurerAddress = row.thirdPartyInsurerAddress;
          p.cases.push({
            id: row.id,
            claimNumber: row.claimNumber ?? null,
            status: row.status,
            approvedSettlementAmount: row.approvedSettlementAmount,
            recoveredAmount: row.recoveredAmount,
            currencyCode: row.currencyCode,
            recoveryPotentialScore: row.recoveryPotentialScore,
            incidentDate: row.incidentDate ?? null,
            createdAt: row.createdAt ?? null,
          });
          if (row.approvedSettlementAmount) p.totalApprovedCents += row.approvedSettlementAmount;
          if (row.recoveredAmount) p.totalRecoveredCents += row.recoveredAmount;
          if (row.status === 'settled_full' || row.status === 'settled_partial') p.settled++;
          if (row.status === 'disputed_legal') p.disputed++;
        }

        let profiles = Object.values(profileMap).map(p => ({
          key: p.key,
          thirdPartyName: p.thirdPartyName,
          thirdPartyRegistration: p.thirdPartyRegistration,
          thirdPartyIdNumber: p.thirdPartyIdNumber,
          thirdPartyPhone: p.thirdPartyPhone,
          thirdPartyAddress: p.thirdPartyAddress,
          insurers: Array.from(p.insurers),
          insurerPhone: p.insurerPhone,
          insurerAddress: p.insurerAddress,
          totalCases: p.cases.length,
          settledCases: p.settled,
          disputedCases: p.disputed,
          totalApprovedCents: p.totalApprovedCents,
          totalRecoveredCents: p.totalRecoveredCents,
          isRepeatOffender: p.cases.length > 1,
          latestIncidentDate: p.cases[0]?.incidentDate ?? null,
          cases: p.cases.slice(0, 10), // return up to 10 most recent cases per profile
        })).sort((a, b) => b.totalCases - a.totalCases);

        // Apply search filter
        if (input.search && input.search.trim()) {
          const q = input.search.toLowerCase().trim();
          profiles = profiles.filter(p =>
            (p.thirdPartyName ?? '').toLowerCase().includes(q) ||
            (p.thirdPartyRegistration ?? '').toLowerCase().includes(q) ||
            (p.thirdPartyIdNumber ?? '').toLowerCase().includes(q) ||
            p.insurers.some(ins => ins.toLowerCase().includes(q))
          );
        }

        const total = profiles.length;
        const offset = (input.page - 1) * input.pageSize;
        return {
          profiles: profiles.slice(offset, offset + input.pageSize),
          total,
          page: input.page,
          pageSize: input.pageSize,
        };
      }),
    getPriorCases: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(20) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        const rows = await db
          .select({
            id: recoveryCases.id,
            status: recoveryCases.status,
            recoveryPotentialScore: recoveryCases.recoveryPotentialScore,
            approvedSettlementAmount: recoveryCases.approvedSettlementAmount,
            recoveredAmount: recoveryCases.recoveredAmount,
            currencyCode: recoveryCases.currencyCode,
            wrongedParty: recoveryCases.wrongedParty,
            thirdPartyLiabilityPct: recoveryCases.thirdPartyLiabilityPct,
            recoveryDeadline: recoveryCases.recoveryDeadline,
            createdAt: recoveryCases.createdAt,
            claimNumber: claims.claimNumber,
            vehicleRegistration: claims.vehicleRegistration,
            incidentDate: claims.incidentDate,
          })
          .from(recoveryCases)
          .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
          .where(
            and(
              eq(recoveryCases.tenantId, tenantId),
              inArray(recoveryCases.id, input.ids)
            )
          )
           .orderBy(recoveryCases.createdAt);
        return rows;
      }),

    // ── Correspondence Log ──────────────────────────────────────────────────
    getCorrespondenceLog: protectedProcedure
      .input(z.object({ caseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const tenantId = (ctx.user as any).tenantId ?? ctx.user.id.toString();
        const rows = await db
          .select()
          .from(recoveryCorrespondenceLog)
          .where(
            and(
              eq(recoveryCorrespondenceLog.recoveryCaseId, input.caseId),
              eq(recoveryCorrespondenceLog.tenantId, tenantId)
            )
          )
          .orderBy(desc(recoveryCorrespondenceLog.createdAt));
        return rows;
      }),

    addCorrespondenceEntry: protectedProcedure
      .input(z.object({
        caseId:        z.number(),
        entryType:     z.enum([
          "demand_letter_generated", "demand_letter_sent", "response_received",
          "follow_up_sent", "legal_escalation", "settlement_offer",
          "settlement_accepted", "settlement_rejected", "case_note",
          "status_change", "recovery_target_changed", "system_event",
        ]).default("case_note"),
        subject:       z.string().max(255).optional(),
        body:          z.string().optional(),
        attachmentUrl: z.string().max(1024).optional(),
        fromStatus:    z.string().optional(),
        toStatus:      z.string().optional(),
        fromTarget:    z.string().optional(),
        toTarget:      z.string().optional(),
        amountCents:   z.number().int().optional(),
        currencyCode:  z.string().max(8).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
        const tenantId = (ctx.user as any).tenantId ?? ctx.user.id.toString();
        const now = new Date().toISOString().replace("T", " ").substring(0, 19);
        await db.insert(recoveryCorrespondenceLog).values({
          recoveryCaseId: input.caseId,
          tenantId,
          entryType:     input.entryType,
          actorId:       ctx.user.id.toString(),
          actorName:     ctx.user.name ?? ctx.user.email ?? "Unknown",
          actorRole:     (ctx.user as any).insurerRole ?? ctx.user.role ?? "user",
          subject:       input.subject ?? null,
          body:          input.body ?? null,
          attachmentUrl: input.attachmentUrl ?? null,
          fromStatus:    input.fromStatus ?? null,
          toStatus:      input.toStatus ?? null,
          fromTarget:    input.fromTarget ?? null,
          toTarget:      input.toTarget ?? null,
          amountCents:   input.amountCents ?? null,
          currencyCode:  input.currencyCode ?? "USD",
          createdAt:     now,
        });
        return { success: true };
      }),

    /**
     * Export the correspondence log for a recovery case as a PDF.
     * Returns a base64-encoded PDF string for client-side download.
     */
    exportCorrespondenceLog: protectedProcedure
      .input(z.object({ caseId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        // Load case details
        const [rcRow] = await db.select().from(recoveryCases).where(and(eq(recoveryCases.id, input.caseId), eq(recoveryCases.tenantId, tenantId))).limit(1);
        if (!rcRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
        // Load correspondence entries
        const entries = await db
          .select()
          .from(recoveryCorrespondenceLog)
          .where(and(eq(recoveryCorrespondenceLog.recoveryCaseId, input.caseId), eq(recoveryCorrespondenceLog.tenantId, tenantId)))
          .orderBy(recoveryCorrespondenceLog.createdAt);
        // Build PDF using pdfkit
        const PDFDocument = (await import('pdfkit')).default;
        const { storagePut } = await import('./storage');
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          const doc = new PDFDocument({ margin: 50, size: 'A4' });
          doc.on('data', (chunk: Buffer) => chunks.push(chunk));
          doc.on('end', resolve);
          doc.on('error', reject);
          // Header
          doc.fontSize(18).font('Helvetica-Bold').text('Correspondence Log', { align: 'center' });
          doc.moveDown(0.3);
          doc.fontSize(11).font('Helvetica').text(`Recovery Case #${rcRow.id}`, { align: 'center' });
          doc.fontSize(9).fillColor('#666').text(`Third Party: ${rcRow.thirdPartyName ?? 'Unknown'} | Insurer: ${rcRow.thirdPartyInsurer ?? 'Unknown'}`, { align: 'center' });
          doc.moveDown(0.3);
          doc.fontSize(9).text(`Exported: ${new Date().toLocaleDateString('en-ZA')} ${new Date().toLocaleTimeString('en-ZA')} by ${user.name ?? user.email ?? 'Unknown'}`, { align: 'center' });
          doc.moveDown(1);
          // Divider
          doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
          doc.moveDown(0.5);
          if (entries.length === 0) {
            doc.fillColor('#333').fontSize(10).text('No correspondence entries recorded for this case.');
          } else {
            entries.forEach((entry, idx) => {
              const typeLabel = entry.entryType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              doc.fillColor('#1a1a2e').fontSize(10).font('Helvetica-Bold').text(`${idx + 1}. [${typeLabel}]`, { continued: true });
              if (entry.subject) doc.font('Helvetica').fillColor('#333').text(` — ${entry.subject}`, { continued: false });
              else doc.text('', { continued: false });
              doc.fontSize(8).fillColor('#666').font('Helvetica').text(`${entry.createdAt}${entry.actorName ? ' · ' + entry.actorName : ''}${entry.actorRole ? ' (' + entry.actorRole.replace(/_/g, ' ') + ')' : ''}`);
              if (entry.body) { doc.moveDown(0.2); doc.fontSize(9).fillColor('#333').font('Helvetica').text(entry.body, { indent: 10 }); }
              if (entry.amountCents) { doc.moveDown(0.2); doc.fontSize(9).fillColor('#2d6a4f').text(`Amount: ${entry.currencyCode ?? 'USD'} ${(entry.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { indent: 10 }); }
              if (entry.attachmentUrl) { doc.moveDown(0.2); doc.fontSize(8).fillColor('#5a67d8').text(`Attachment: ${entry.attachmentUrl}`, { indent: 10 }); }
              doc.moveDown(0.5);
              if (idx < entries.length - 1) { doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#eee').stroke(); doc.moveDown(0.3); }
            });
          }
          doc.end();
        });
        const pdfBuffer = Buffer.concat(chunks);
        const fileKey = `recovery-correspondence/${tenantId}/case-${input.caseId}-log-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
        return { downloadUrl: url };
      }),

    /**
     * Recovery Watchlist
     *
     * Returns four actionable recovery categories for the Claims Manager.
     * Source: recovery_cases table. Zero schema changes required.
     */
    getWatchlist: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const user = ctx.user;
        const tenantId = (user as any).tenantId;
        const allowedRoles = ['recovery_officer', 'claims_manager', 'executive', 'insurer_admin'];
        if (!allowedRoles.includes((user as any).insurerRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
        }
        const rows = await db
          .select()
          .from(recoveryCases)
          .where(eq(recoveryCases.tenantId, tenantId))
          .orderBy(desc(recoveryCases.recoveryPotentialScore));

        const today = new Date().toISOString().split('T')[0];
        const in90Days = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
        const highValueThreshold = FINANCIAL_APPROVAL_THRESHOLD_CENTS;

        const recoveryEligible = rows.filter(r =>
          ['open', 'pending_review'].includes(r.status) && r.recoveryPotentialScore >= 60
        );
        const demandOutstanding = rows.filter(r =>
          r.status === 'demand_sent' && !r.settlementAgreementDate
        );
        const deadlineApproaching = rows.filter(r =>
          r.recoveryDeadline && r.recoveryDeadline >= today && r.recoveryDeadline <= in90Days &&
          !['settled_full', 'settled_partial', 'closed_no_recovery', 'archived'].includes(r.status)
        );
        const highValueRecoveries = rows.filter(r =>
          (r.approvedSettlementAmount ?? 0) > highValueThreshold &&
          !['settled_full', 'settled_partial', 'closed_no_recovery', 'archived'].includes(r.status)
        );

        const summariseCase = (arr: typeof rows) => ({
          count: arr.length,
          totalAmount: arr.reduce((sum, r) => sum + (r.approvedSettlementAmount ?? 0), 0),
          topCases: arr.slice(0, 3).map(r => ({
            id: r.id,
            thirdPartyName: r.thirdPartyName,
            thirdPartyInsurer: r.thirdPartyInsurer,
            status: r.status,
            recoveryPotentialScore: r.recoveryPotentialScore,
            recoveryDeadline: r.recoveryDeadline,
          })),
        });

        return {
          recoveryEligible: summariseCase(recoveryEligible),
          demandOutstanding: summariseCase(demandOutstanding),
          deadlineApproaching: summariseCase(deadlineApproaching),
          highValueRecoveries: summariseCase(highValueRecoveries),
          totalWatchlistItems: new Set([
            ...recoveryEligible.map(r => r.id),
            ...demandOutstanding.map(r => r.id),
            ...deadlineApproaching.map(r => r.id),
            ...highValueRecoveries.map(r => r.id),
          ]).size,
        };
      }),
  }),
});
export type AppRouter = typeof appRouter;
