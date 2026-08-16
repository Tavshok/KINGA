
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
import { isAssignedAssessorActor, isExternalAssessor } from "./assessor-role-authority";
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
import { claims, insuranceQuotes, insuranceProducts, insuranceCarriers, insurancePolicies, fleetVehicles, fleetDrivers, insurerTenants, ingestionDocuments, recoveryCases, recoveryCorrespondenceLog, fraudRules, aiAssessments as aiAssessmentsTable } from "../drizzle/schema";
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
  getTenantRates,
  acceptClaimAssessorAssignment,
  hasAcceptedClaimAssessorAssignment,
  getAcceptedClaimAssessorAssignment,
  getAssessorReportReviewer,
  createAssessorReportDraft,
  addAssessorReportAttachment,
  getAssessorReportById,
  getLatestAssessorReportVersion,
  attestAssessorReport,
  submitAssessorReportForReview,
  decideAssessorReportReview,
  getAssessorReportReviewQueue,
  getLatestAcceptedAssessorEvaluation,
} from "./db";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { generateDemandLetter } from "./recovery/demandLetterGenerator";
import { checkSingleCaseDeadline } from "./recovery/recoveryDeadlineAlerts";
import { notifyAssessorAssignment, notifyAiAssessmentComplete, notifyQuoteSubmitted, notifyFraudDetected } from "./notifications";
import { invokeLLM } from "./_core/llm";
import { getAuthorizedClaimDocumentContext } from "./documents/claimDocumentAuthority";
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
import { agencyInsuranceServiceRouter } from "./routers/agency-insurance-service";
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
import { platformOperationsRouter } from "./routers/platform-operations"; // Epic 5-C
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
import { treGovernanceRouter } from './routers/tre-governance';
import { insurancePhase7Router } from './routers/insurance-phase7';
import { personalVehiclesRouter } from './routers/personal-vehicles';
import { treV4GovernanceRouter } from './routers/tre-v4-governance';
import { globalSearchRouter } from './routers/global-search'; // Epic 5-A
import { inspectionsRouter } from './routers/inspections'; // Epic 3
import { vehiclePassportRouter } from './routers/vehicle-passport'; // Epic 4
import { assetPassportRouter } from './routers/asset-passport'; // Epic 4
import {
  crossModuleIntelligenceRouter,
  fleetIntelligenceRouter,
  engineeringIntelligenceRouter,
  portfolioIntelligenceRouter,
  timelineIntelligenceRouter,
  predictiveAnalyticsRouter,
} from './routers/intelligence-platform'; // Epic 4 Wave 4
import { recoveryRouter } from "./routers/recovery"; // TECH-02: extracted Aug 2026
import { fleetCoreRouter } from "./routers/fleet-core"; // TECH-02: extracted Aug 2026
import { insuranceCoreRouter } from "./routers/insurance-core"; // TECH-02: extracted Aug 2026
import { vehicleValuationCoreRouter } from "./routers/vehicle-valuation-core"; // TECH-02: extracted Aug 2026
import { claimsRouter } from "./routers/claims-core"; // SPLIT-R01: extracted Aug 2026
import { aiAssessmentsRouter } from "./routers/ai-assessments-core"; // SPLIT-R02: extracted Aug 2026
import { quotesRouter } from "./routers/quotes-core"; // SPLIT-R03: extracted Aug 2026
import { assessorsRouter } from "./routers/assessors-core"; // SPLIT-R04: extracted Aug 2026
import { authRouter } from "./routers/auth-core"; // SPLIT-R05: extracted Aug 2026
import { panelBeatersRouter } from "./routers/panel-beaters-core"; // SPLIT-R06: extracted Aug 2026
import { claimReportsRouter } from "./routers/claim-reports-core"; // SPLIT-R07: extracted Aug 2026
import { impersonationRouter } from "./routers/impersonation"; // Batch 2: superadmin impersonation
import { isAdminRole } from "@shared/role-permissions";
import { assertRestrictedAgencyAssistedCapability } from "./agency/agencyAssistedClaimantIdentity";
// import { eventIntegration } from "./events/event-integration"; // Temporarily disabled until Kafka is set up

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRITY METRICS ROUTER
// Aggregates integrity gate, reconciliation, and photo ingestion data
// across all assessments for the Integrity Metrics Dashboard.
// ─────────────────────────────────────────────────────────────────────────────
export const integrityRouter = router({
  getMetrics: protectedProcedure
    .input(z.object({
      // tenantId is a string (varchar) — matches users.tenantId and aiAssessments.tenantId
      tenantId: z.string().optional(),
      days: z.number().default(30),
    }))
    .query(async ({ ctx, input }) => {
      assertRestrictedAgencyAssistedCapability(ctx.user, "fraud_authority");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // Determine effective tenant ID using typed session context — no raw SQL interpolation
      const effectiveTenantId: string | null =
        input.tenantId ?? (ctx.user.role === 'admin' ? null : (ctx.user.tenantId ?? null));

      // Build parameterised Drizzle query — eliminates SQL injection risk
      const whereConditions = [
        gte(aiAssessmentsTable.createdAt, since.toISOString()),
        ...(effectiveTenantId ? [eq(aiAssessmentsTable.tenantId, effectiveTenantId)] : []),
      ];

      const assessments = await db
        .select({
          id: aiAssessmentsTable.id,
          fcdiScore: aiAssessmentsTable.fcdiScore,
          fraudScore: aiAssessmentsTable.fraudScore,
          recommendation: aiAssessmentsTable.recommendation,
          createdAt: aiAssessmentsTable.createdAt,
          forensicAnalysis: aiAssessmentsTable.forensicAnalysis,
        })
        .from(aiAssessmentsTable)
        .where(and(...whereConditions))
        .orderBy(desc(aiAssessmentsTable.createdAt))
        .limit(500);

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
          fa = row.forensicAnalysis ? JSON.parse(row.forensicAnalysis) : null;
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
  globalSearch: globalSearchRouter, // Epic 5-A
  vehiclePassport: vehiclePassportRouter,
  agencyInsuranceService: agencyInsuranceServiceRouter,
  assetPassport: assetPassportRouter,
  crossModuleIntelligence: crossModuleIntelligenceRouter,
  fleetIntelligence: fleetIntelligenceRouter,
  engineeringIntelligence: engineeringIntelligenceRouter,
  portfolioIntelligence: portfolioIntelligenceRouter,
  timelineIntelligence: timelineIntelligenceRouter,
  predictiveAnalytics: predictiveAnalyticsRouter,
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
  platformOperations: platformOperationsRouter, // Epic 5-C
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
  inspections: inspectionsRouter,
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
  validationLoop: router({
    /**
     * Wave 4A: Get physics accuracy statistics from the historical validation loop.
     * Returns aggregated MAPE, CI coverage, grade distribution, and per-method accuracy.
     * Accessible to admin and platform_super_admin roles.
     */
    getStats: protectedProcedure
      .input(z.object({
        days: z.number().default(90),
        limit: z.number().default(200),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'platform_super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required.' });
        }
        const { getValidationRecords } = await import('./db-validation');
        const { computeValidationStats } = await import('./pipeline-v2/stage-validation-loop');
        const { evidencePluginRegistry } = await import('./pipeline-v2/evidencePluginRegistry');

        const allRecords = await getValidationRecords({ limit: input.limit });

        // Filter by days
        const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
        const recentRecords = allRecords.filter(r =>
          r.createdAt ? new Date(r.createdAt) >= since : true
        );

        // Compute aggregate stats
        const stats = computeValidationStats(
          recentRecords.map(r => ({
            speedDeviationPct: r.speedDeviationPct != null ? parseFloat(r.speedDeviationPct) : null,
            costDeviationPct: r.costDeviationPct != null ? parseFloat(r.costDeviationPct) : null,
            speedWithinCI: r.speedWithinCI,
            calibrationFeedbackJson: null,
            uncertaintyGrade: r.uncertaintyGrade,
            createdAt: r.createdAt ?? new Date(),
          }))
        );

        // Plugin registry status (stub summary — no live claim context needed)
        const pluginSummary = evidencePluginRegistry.getAll().map(p => ({
          pluginId: p.pluginId,
          pluginName: p.pluginName,
          category: p.category,
          version: p.version,
          status: 'UNAVAILABLE' as const,
        }));

        // Recent records for the table view (last 50)
        const recentTable = recentRecords.slice(0, 50).map(r => ({
          id: r.id,
          claimId: r.claimId,
          predictedSpeedKmh: r.predictedSpeedKmh ? parseFloat(r.predictedSpeedKmh) : null,
          predictedSpeedLowKmh: r.predictedSpeedLowKmh ? parseFloat(r.predictedSpeedLowKmh) : null,
          predictedSpeedHighKmh: r.predictedSpeedHighKmh ? parseFloat(r.predictedSpeedHighKmh) : null,
          predictedCrushDepthMm: r.predictedCrushDepthMm ? parseFloat(r.predictedCrushDepthMm) : null,
          uncertaintyGrade: r.uncertaintyGrade,
          integrityScore: r.integrityScore,
          actualSpeedKmh: r.actualSpeedKmh ? parseFloat(r.actualSpeedKmh) : null,
          speedDeviationPct: r.speedDeviationPct ? parseFloat(r.speedDeviationPct) : null,
          speedWithinCI: r.speedWithinCI,
          validationStatus: r.validationStatus,
          createdAt: r.createdAt?.toISOString() ?? null,
        }));

        return {
          period: { days: input.days, since: since.toISOString() },
          totalRecords: recentRecords.length,
          pendingValidation: recentRecords.filter(r => r.validationStatus === 'pending').length,
          validated: recentRecords.filter(r => r.validationStatus === 'validated').length,
          stats,
          pluginRegistry: pluginSummary,
          recentRecords: recentTable,
        };
      }),
  }),
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
      return await db.select().from(asSubs).orderBy(asSubs.tier).limit(200); // M-01: cap subscription tier list
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
  auth: authRouter,

  /**
   * Panel Beater Operations
   * 
   * Handles retrieval of approved panel beaters for claim submissions.
   * Panel beaters are pre-vetted repair shops that claimants can select.
   */
  panelBeaters: panelBeatersRouter,

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
  claims: claimsRouter,
  // Assessor operationss
  assessors: assessorsRouter,

  // Assessor Evaluations
  assessorEvaluations: router({
    acceptAssignment: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const actorTenantId = ctx.user.tenantId;
        if (!actorTenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });

        const claim = await getClaimById(input.claimId, actorTenantId);
        if (!claim || claim.tenantId !== actorTenantId || !isAssignedAssessorActor(ctx.user) || claim.assignedAssessorId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
        }

        await acceptClaimAssessorAssignment({ claimId: input.claimId, tenantId: actorTenantId, assessorId: ctx.user.id });

        const { transition } = await import("./workflow-engine");
        await transition({
          claimId: input.claimId,
          fromState: (claim.workflowState || "assigned") as any,
          toState: "under_assessment",
          userId: ctx.user.id,
          // Workflow audit uses the established insurer workflow vocabulary;
          // authenticated assessor identity has already been verified above.
          userRole: (isExternalAssessor(ctx.user) ? "assessor_external" : "assessor_internal") as any,
          decisionData: { comments: "Assessor accepted assigned claim" },
        });

        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "assessor_assignment_accepted",
          entityType: "claim_assignment",
          changeDescription: "Authenticated assessor accepted the in-app assignment",
        });

        return { success: true };
      }),
    // Legacy direct summary submission is retired. An assessor report must be
    // attested and accepted through assessorReports before it becomes an
    // authoritative evaluator projection.
    submit: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        // Retained as an optional compatibility input only. The authenticated,
        // claim-assigned assessor is the sole authoritative evaluator identity.
        assessorId: z.number().optional(),
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
      .mutation(async () => {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Submit an attested assessor report for review; direct evaluation summaries are not authoritative." });
      }),

    // Get evaluation by claim
    byClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const actorTenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
        const claim = await getClaimById(input.claimId, actorTenantId);
        if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
        return await getLatestAcceptedAssessorEvaluation(input.claimId, claim.tenantId);
      }),
  }),

  assessorReports: router({
    createDraft: protectedProcedure
      .input(z.object({
        claimId: z.number(),
        creationMethod: z.enum(["native_upload", "kinga_assisted"]),
        title: z.string().min(1),
        reportPayload: z.record(z.string(), z.unknown()).optional(),
        kingaExtractionJson: z.record(z.string(), z.unknown()).optional(),
        fileName: z.string().optional(),
        fileBase64: z.string().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user.tenantId;
        const claim = tenantId ? await getClaimById(input.claimId, tenantId) : null;
        if (!tenantId || !claim || !isAssignedAssessorActor(ctx.user) || claim.assignedAssessorId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Claim not found or access denied" });
        }
        const assignment = await getAcceptedClaimAssessorAssignment({ claimId: input.claimId, tenantId, assessorId: ctx.user.id });
        if (!assignment) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Accept the assessor assignment before creating a report" });
        if (Boolean(input.fileName) !== Boolean(input.fileBase64)) throw new TRPCError({ code: "BAD_REQUEST", message: "Report file name and contents must be supplied together" });
        if (input.creationMethod === "native_upload" && (!input.fileName || !input.fileBase64)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A native assessor report requires its original uploaded file" });
        }

        let sourceStorageKey: string | undefined;
        let sourceFileUrl: string | undefined;
        let sourceFileHash: string | undefined;
        if (input.fileBase64 && input.fileName) {
          const buffer = Buffer.from(input.fileBase64, "base64");
          sourceFileHash = await import("node:crypto").then(({ createHash }) => createHash("sha256").update(buffer).digest("hex"));
          sourceStorageKey = `assessor-reports/${tenantId}/${input.claimId}/${nanoid()}-${input.fileName}`;
          const stored = await storagePut(sourceStorageKey, buffer, input.mimeType || "application/octet-stream");
          sourceFileUrl = stored.url;
        }
        const prior = await getLatestAssessorReportVersion(input.claimId, tenantId);
        const reportId = await createAssessorReportDraft({
          claimId: input.claimId,
          tenantId,
          assessorUserId: ctx.user.id,
          assignmentId: assignment.id,
          parentReportId: prior?.id,
          versionNumber: (prior?.versionNumber || 0) + 1,
          creationMethod: input.creationMethod,
          title: input.title,
          sourceFileName: input.fileName,
          sourceStorageKey,
          sourceFileUrl,
          sourceMimeType: input.mimeType,
          sourceFileHash,
          reportPayload: input.reportPayload,
          kingaExtractionJson: input.kingaExtractionJson,
        });
        if (sourceStorageKey && sourceFileUrl && input.fileName) {
          await addAssessorReportAttachment({ reportId, tenantId, originalFileName: input.fileName, storageKey: sourceStorageKey, fileUrl: sourceFileUrl, mimeType: input.mimeType, fileHash: sourceFileHash, attachmentRole: "original_report" });
        }
        await createAuditEntry({ claimId: input.claimId, userId: ctx.user.id, action: "assessor_report_draft_created", entityType: "assessor_report", changeDescription: `Assessor ${input.creationMethod} report draft created` });
        return { reportId };
      }),
    attest: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user.tenantId;
        const report = tenantId ? await getAssessorReportById(input.reportId, tenantId) : null;
        if (!tenantId || !report || !isAssignedAssessorActor(ctx.user) || report.assessorUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Report not found or access denied" });
        await attestAssessorReport(input.reportId, tenantId, ctx.user.id);
        await createAuditEntry({ claimId: report.claimId, userId: ctx.user.id, action: "assessor_report_attested", entityType: "assessor_report", changeDescription: "Assessor attested the report as their professional conclusion" });
        return { success: true };
      }),
    submitForReview: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user.tenantId;
        const report = tenantId ? await getAssessorReportById(input.reportId, tenantId) : null;
        if (!tenantId || !report || !isAssignedAssessorActor(ctx.user) || report.assessorUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Report not found or access denied" });
        const reviewer = await getAssessorReportReviewer({ claimId: report.claimId, tenantId });
        const reviewId = await submitAssessorReportForReview({ reportId: input.reportId, tenantId, ...reviewer });
        await createAuditEntry({ claimId: report.claimId, userId: ctx.user.id, action: "assessor_report_submitted_for_review", entityType: "assessor_report", changeDescription: `Routed to ${reviewer.reviewerRole}` });
        return { reviewId, ...reviewer };
      }),
    decideReview: protectedProcedure
      .input(z.object({ reviewId: z.number(), decision: z.enum(["accepted", "returned", "rejected"]), decisionReason: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = ctx.user.tenantId;
        if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Review access denied" });
        const result = await decideAssessorReportReview({ reviewId: input.reviewId, tenantId, reviewerUserId: ctx.user.id, decision: input.decision, decisionReason: input.decisionReason });
        const report = await getAssessorReportById(result.review.reportId, tenantId);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
        if (input.decision === "accepted") {
          const payload = (report.reportPayload || {}) as Record<string, unknown>;
          if (!Number(payload.estimatedRepairCost) || !Number(payload.estimatedDuration) || !String(payload.damageAssessment || "").trim()) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An accepted assessor report requires repair cost, duration, and damage assessment" });
          }
          await createAssessorEvaluation({
            claimId: report.claimId, assessorId: report.assessorUserId, tenantId,
            estimatedRepairCost: Number(payload.estimatedRepairCost || 0), laborCost: payload.laborCost ? Number(payload.laborCost) : undefined,
            partsCost: payload.partsCost ? Number(payload.partsCost) : undefined, estimatedDuration: Number(payload.estimatedDuration || 0),
            damageAssessment: String(payload.damageAssessment || "Accepted assessor report"), recommendations: payload.recommendations ? String(payload.recommendations) : undefined,
            fraudRiskLevel: (payload.fraudRiskLevel as any) || "low", status: "completed", sourceReportId: report.id, sourceReportVersion: report.versionNumber, acceptedReviewId: input.reviewId,
          } as any);
        }
        await createAuditEntry({ claimId: report.claimId, userId: ctx.user.id, action: `assessor_report_review_${input.decision}`, entityType: "assessor_report_review", changeDescription: input.decisionReason });
        return { success: true };
      }),
    myReviewQueue: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Review access denied" });
      }
      return getAssessorReportReviewQueue(tenantId, ctx.user.id);
    }),
  }),

  // Quotes operations
  quotes: quotesRouter,

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
  aiAssessments: aiAssessmentsRouter,
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
        await getAuthorizedClaimDocumentContext(ctx.user, input.claimId);

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
          visibleToRoles: JSON.stringify(["insurer", "assessor", "panel_beater", "claimant", "fleet_manager", "fleet_admin", "fleet_driver"]),
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
        await getAuthorizedClaimDocumentContext(ctx.user, input.claimId);

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
        await getAuthorizedClaimDocumentContext(ctx.user, doc.claimId);

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

    // ── Unified document list: merges ingestion_documents (original upload) + claim_documents ──
    // The original uploaded PDF lives in ingestion_documents (via claims.source_document_id).
    // claim_documents holds manually-uploaded supplementary files.
    // This procedure returns both, so DocumentList shows ALL files for a claim.
    allByClaim: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const claimContext = await getAuthorizedClaimDocumentContext(ctx.user, input.claimId);
        const db = await getDb();
        if (!db) return [];
        const { claimDocuments: cdTable, ingestionDocuments: idTable, claims: claimsTable } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");

        // 1. claim_documents rows (manually uploaded supplementary files)
        const cdRows = await db
          .select()
          .from(cdTable)
          .where(eq(cdTable.claimId, input.claimId))
          .orderBy(desc(cdTable.createdAt));

        // Filter by role-based access
        const filteredCd = cdRows.filter(doc => {
          if (!doc.visibleToRoles) return true;
          try {
            const roles = JSON.parse(doc.visibleToRoles);
            return roles.includes(ctx.user?.role);
          } catch { return true; }
        });

        // 2. ingestion document (original upload via multipart endpoint)
        const sourceDocId = claimContext.sourceDocumentId;
        let ingRow: (typeof idTable.$inferSelect) | null = null;
        if (sourceDocId) {
          const ingRows = await db
            .select()
            .from(idTable)
            .where(eq(idTable.id, sourceDocId))
            .limit(1);
          ingRow = ingRows[0] ?? null;
        }

        // Normalise ingestion document to the same shape as claim_documents
        const ingNormalised = ingRow ? [{
          id: ingRow.id,
          fileName: ingRow.originalFilename,
          fileUrl: ingRow.s3Url,
          fileSize: ingRow.fileSizeBytes,
          mimeType: ingRow.mimeType,
          documentTitle: ingRow.originalFilename,
          documentCategory: ingRow.documentType ?? 'other',
          createdAt: ingRow.createdAt,
          source: 'ingestion_document' as const,
        }] : [];

        // Deduplicate: skip claim_documents whose filename matches the ingestion document
        const ingFilenames = new Set(ingNormalised.map(r => r.fileName));
        const cdNormalised = filteredCd
          .filter(r => !ingFilenames.has(r.fileName))
          .map(r => ({
            id: r.id,
            fileName: r.fileName,
            fileUrl: r.fileUrl,
            fileSize: r.fileSize,
            mimeType: r.mimeType,
            documentTitle: r.documentTitle ?? r.fileName,
            documentCategory: r.documentCategory,
            createdAt: r.createdAt,
            source: 'claim_document' as const,
          }));

        // Ingestion document first (primary source), then supplementary files
        return [...ingNormalised, ...cdNormalised];
      }),
    getClaimContext: protectedProcedure
      .input(z.object({ claimId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getAuthorizedClaimDocumentContext(ctx.user, input.claimId);
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
        const tenantId = isAdminRole(ctx.user.role) ? undefined : (ctx.user.tenantId || "default");
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
  vehicleValuation: vehicleValuationCoreRouter,
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
  claimReports: claimReportsRouter,

  /**
   * Fleet Management Router
   * Handles vehicle fleet registration, maintenance tracking, and service marketplace
   */
  fleet: fleetCoreRouter,

  // Insurance Agency Platform
  insurance: insuranceCoreRouter,

  // ── Subrogation Recovery Module ──────────────────────────────────────────
  insuranceV2: insurancePhase7Router,
  personalVehicles: personalVehiclesRouter,
  treGovernance: treGovernanceRouter,
  treV4Governance: treV4GovernanceRouter,
  recovery: recoveryRouter,
  impersonation: impersonationRouter,
});
export type AppRouter = typeof appRouter;
