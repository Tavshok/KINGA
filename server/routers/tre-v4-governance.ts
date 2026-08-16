/**
 * TRE v4.0 — Trust API v2 Router (E9 + E10)
 * Enterprise Trust Dashboard backend procedures (E9)
 * Trust API v2 enriched CTO endpoint (E10)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { aiAssessments, claims } from "../../drizzle/schema";
import { eq, desc, gte, and, isNotNull } from "drizzle-orm";

// TRE v4.0 modules
import { trustEventBus, conflictDetectedEvent } from "../pipeline-v2/trustEventBus";
import { analyseImpact, analyseMultiEventImpact } from "../pipeline-v2/trustImpactEngine";
import {
  trustResolutionQueue,
  createConflictResolutionTask,
  type ResolutionOwnerRole,
} from "../pipeline-v2/trustResolutionQueue";
import { humanTrustApprovalEngine } from "../pipeline-v2/humanTrustApproval";
import {
  trustMemoryEngine,
  type ConflictPatternType,
} from "../pipeline-v2/trustMemoryEngine";
import { aiModelGovernanceEngine } from "../pipeline-v2/aiModelGovernance";
import { trustSLAManager, type SLAOperationType } from "../pipeline-v2/trustSLAManager";
import { trustSimulationEngine } from "../pipeline-v2/trustSimulationEngine";
import type { ClaimTruthObject } from "../pipeline-v2/truthReconciliationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function requireTreV4Tenant(ctx: { user?: { tenantId?: string | null } }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

async function getCTOForAssessment(assessmentId: number, tenantId: string): Promise<ClaimTruthObject | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ claimTruthObjectJson: aiAssessments.claimTruthObjectJson })
    .from(aiAssessments)
    .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
    .where(and(
      eq(aiAssessments.id, assessmentId),
      eq(aiAssessments.tenantId, tenantId),
      eq(claims.tenantId, tenantId),
    ))
    .limit(1);
  if (!rows[0]?.claimTruthObjectJson) return null;
  try {
    return JSON.parse(rows[0].claimTruthObjectJson) as ClaimTruthObject;
  } catch {
    return null;
  }
}

async function requireTenantAssessment(assessmentId: number, tenantId: string): Promise<{ assessmentId: number; claimId: number }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [assessment] = await db
    .select({ assessmentId: aiAssessments.id, claimId: aiAssessments.claimId })
    .from(aiAssessments)
    .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
    .where(and(
      eq(aiAssessments.id, assessmentId),
      eq(aiAssessments.tenantId, tenantId),
      eq(claims.tenantId, tenantId),
    ))
    .limit(1);
  if (!assessment) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found" });
  return assessment;
}

async function requireTenantClaim(claimId: number, tenantId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [claim] = await db.select({ id: claims.id }).from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId))).limit(1);
  if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Zod schema for ResolutionOwnerRole
// ─────────────────────────────────────────────────────────────────────────────

const ownerRoleSchema = z.enum([
  "FRAUD_ANALYST",
  "CLAIMS_ASSESSOR",
  "CLAIMS_MANAGER",
  "COMPLIANCE_OFFICER",
  "SENIOR_ASSESSOR",
  "SYSTEM",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const treV4GovernanceRouter = router({

  // ── E1: Trust Event Bus ──────────────────────────────────────────────────

  getEventBusStats: protectedProcedure.query(() => {
    return trustEventBus.getStats();
  }),

  getRecentEvents: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(({ input }) => {
      return trustEventBus.getRecentEvents(input.limit);
    }),

  getClaimEvents: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ input, ctx }) => {
      const claimId = Number(input.claimId);
      if (!Number.isSafeInteger(claimId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid claim ID" });
      await requireTenantClaim(claimId, requireTreV4Tenant(ctx));
      return trustEventBus.getClaimEvents(input.claimId);
    }),

  // ── E2: Trust Impact Analysis ────────────────────────────────────────────

  analyzeImpact: protectedProcedure
    .input(z.object({
      assessmentId: z.number(),
      description: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireTenantAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      const event = conflictDetectedEvent(
        String(input.assessmentId),
        input.description,
        ["fraud", "physics"],
        "MEDIUM"
      );
      return analyseImpact(event);
    }),

  analyzeMultiEventImpact: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireTenantAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      const events = trustEventBus.getClaimEvents(String(input.assessmentId));
      return analyseMultiEventImpact(events);
    }),

  // ── E3: Autonomous Resolution Queue ─────────────────────────────────────

  getQueueStats: protectedProcedure.query(() => {
    return trustResolutionQueue.getStats();
  }),

  getPendingTasks: protectedProcedure
    .input(z.object({ ownerRole: ownerRoleSchema.optional() }))
    .query(({ input }) => {
      return trustResolutionQueue.getPendingTasks(
        input.ownerRole as ResolutionOwnerRole | undefined
      );
    }),

  enqueueConflict: protectedProcedure
    .input(z.object({
      assessmentId: z.number(),
      conflictDescription: z.string(),
      affectedSections: z.array(z.string()).default([]),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireTenantAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      const task = createConflictResolutionTask(
        String(input.assessmentId),
        input.conflictDescription,
        input.affectedSections,
        input.priority
      );
      return trustResolutionQueue.enqueue(task);
    }),

  resolveTask: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      notes: z.string(),
      evidenceProvided: z.array(z.string()).default([]),
    }))
    .mutation(({ input }) => {
      return trustResolutionQueue.resolve(input.taskId, input.notes, input.evidenceProvided);
    }),

  escalateTask: protectedProcedure
    .input(z.object({ taskId: z.string(), reason: z.string() }))
    .mutation(({ input }) => {
      return trustResolutionQueue.escalate(input.taskId, input.reason);
    }),

  // ── E4: Human-in-the-Loop Governance ────────────────────────────────────

  getPendingReviews: protectedProcedure
    .input(z.object({ role: ownerRoleSchema.optional() }))
    .query(({ input }) => {
      return humanTrustApprovalEngine.getPendingRequests(
        input.role as ResolutionOwnerRole | undefined
      );
    }),

  submitReview: protectedProcedure
    .input(z.object({
      requestId: z.string(),
      decision: z.enum(["APPROVE", "REJECT", "ESCALATE", "REQUEST_MORE_INFO"]),
      rationale: z.string().min(10),
    }))
    .mutation(({ input, ctx }) => {
      return humanTrustApprovalEngine.decide(
        input.requestId,
        input.decision,
        ctx.user.openId,
        input.rationale
      );
    }),

  getClaimReviews: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireTenantAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      return humanTrustApprovalEngine.getClaimRequests(String(input.assessmentId));
    }),

  // ── E5: Trust Memory Engine ──────────────────────────────────────────────

  getMemorySnapshot: protectedProcedure.query(() => {
    return trustMemoryEngine.getSnapshot();
  }),

  getConflictPatterns: protectedProcedure.query(() => {
    return trustMemoryEngine.getConflictPatterns();
  }),

  getMemoryInsights: protectedProcedure.query(() => {
    return trustMemoryEngine.generateInsights();
  }),

  getSimilarClaims: protectedProcedure
    .input(z.object({
      conflictPatterns: z.array(z.enum([
        "SPEED_PHYSICS_MISMATCH",
        "FRAUD_COST_INCONSISTENCY",
        "TIMELINE_IMPOSSIBILITY",
        "EVIDENCE_QUALITY_LOW",
        "MULTI_SOURCE_DISAGREEMENT",
        "MODEL_CONFIDENCE_LOW",
        "REGULATORY_THRESHOLD_BREACH",
        "ASSESSOR_OVERRIDE_PATTERN",
        "CERTIFICATE_BLOCKED_PATTERN",
        "UNKNOWN",
      ])).default([]),
      jurisdictionCode: z.string().optional(),
      limit: z.number().min(1).max(20).default(5),
    }))
    .query(({ input }) => {
      return trustMemoryEngine.getSimilarClaims(
        input.conflictPatterns as ConflictPatternType[],
        input.jurisdictionCode,
        input.limit
      );
    }),

  // ── E6: AI Model Governance ──────────────────────────────────────────────

  getActiveModels: protectedProcedure.query(() => {
    return aiModelGovernanceEngine.getActiveModels();
  }),

  getModelsWithDrift: protectedProcedure.query(() => {
    return aiModelGovernanceEngine.getModelsWithDrift();
  }),

  getModelGovernanceReport: protectedProcedure.query(() => {
    return aiModelGovernanceEngine.generateGovernanceReport();
  }),

  // ── E7: Trust SLA Management ─────────────────────────────────────────────

  getSLAPerformanceReport: protectedProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }))
    .query(({ input }) => {
      return trustSLAManager.generatePerformanceReport(input.fromDate, input.toDate);
    }),

  getClaimSLAs: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireTenantAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      return trustSLAManager.getClaimSLAs(String(input.assessmentId));
    }),

  startSLATracking: protectedProcedure
    .input(z.object({
      assessmentId: z.number(),
      operationType: z.enum([
        "FULL_PIPELINE",
        "STAGE_6_DAMAGE_ANALYSIS",
        "STAGE_7_PHYSICS",
        "STAGE_8_FRAUD",
        "STAGE_9_COST",
        "TRE_RECONCILIATION",
        "HUMAN_REVIEW",
        "FRAUD_ANALYST_REVIEW",
        "COMPLIANCE_REVIEW",
        "REPORT_GENERATION",
        "CERTIFICATE_ISSUANCE",
      ]),
      tier: z.enum(["STANDARD", "PRIORITY", "CRITICAL", "REGULATORY"]).default("STANDARD"),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireTenantAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      return trustSLAManager.start(
        String(input.assessmentId),
        input.operationType as SLAOperationType,
        input.tier
      );
    }),

  completeSLATracking: protectedProcedure
    .input(z.object({ slaId: z.string() }))
    .mutation(({ input }) => {
      return trustSLAManager.complete(input.slaId);
    }),

  // ── E8: Trust Simulation Engine ──────────────────────────────────────────

  runSimulation: protectedProcedure
    .input(z.object({
      assessmentId: z.number(),
      scenarioName: z.string(),
      description: z.string(),
      parameters: z.array(z.object({
        key: z.enum([
          "estimatedSpeedKmh", "fraudRiskScore", "optimisedCostUsd",
          "overallConfidence", "physicsConfidence", "fraudConfidence",
          "costConfidence", "visionSourceReliability", "recommendation",
        ]),
        simulatedValue: z.union([z.number(), z.string()]),
        description: z.string(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const cto = await getCTOForAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      if (!cto) throw new Error("CTO not found for assessment");
      const scenario = trustSimulationEngine.defineScenario(
        input.scenarioName,
        input.description,
        input.parameters
      );
      return trustSimulationEngine.simulate(String(input.assessmentId), cto, scenario);
    }),

  runStandardSimulations: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const cto = await getCTOForAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      if (!cto) throw new Error("CTO not found for assessment");
      const scenarios = trustSimulationEngine.getStandardScenarios();
      return trustSimulationEngine.runBatch(String(input.assessmentId), cto, scenarios);
    }),

  // ── E9: Enterprise Trust Dashboard ──────────────────────────────────────

  getEnterpriseDashboard: protectedProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenantId = requireTreV4Tenant(ctx);

      // createdAt is stored as string (mode: 'string') in the schema
      const cutoffStr = input.fromDate
        ? input.fromDate
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

      const rows = await db
        .select({
          id: aiAssessments.id,
          claimTruthObjectJson: aiAssessments.claimTruthObjectJson,
          createdAt: aiAssessments.createdAt,
        })
        .from(aiAssessments)
        .where(
          and(
            isNotNull(aiAssessments.claimTruthObjectJson),
            eq(aiAssessments.tenantId, tenantId),
            gte(aiAssessments.createdAt, cutoffStr)
          )
        )
        .orderBy(desc(aiAssessments.createdAt))
        .limit(input.limit);

      const ctos: ClaimTruthObject[] = [];
      for (const row of rows) {
        if (row.claimTruthObjectJson) {
          try {
            ctos.push(JSON.parse(row.claimTruthObjectJson));
          } catch { /* skip malformed */ }
        }
      }

      const base = {
        totalAssessments: ctos.length,
        certifiedCount: 0,
        blockedCount: 0,
        certificationRate: 0,
        averageIntegrityScore: 0,
        averageConfidence: 0,
        recommendationBreakdown: { APPROVE: 0, REVIEW: 0, ESCALATE: 0, REJECT: 0 },
        fraudRiskBreakdown: { minimal: 0, low: 0, moderate: 0, high: 0, elevated: 0 },
        visionReliabilityBreakdown: { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 },
        queueStats: trustResolutionQueue.getStats(),
        eventBusStats: trustEventBus.getStats(),
        memorySnapshot: trustMemoryEngine.getSnapshot(),
        governanceReport: aiModelGovernanceEngine.generateGovernanceReport(),
        generatedAt: new Date().toISOString(),
      };

      if (ctos.length === 0) return base;

      const certifiedCount = ctos.filter(
        (c) => c.certification.certificate.certified === "CERTIFIED"
      ).length;
      const blockedCount = ctos.filter(
        (c) => c.certification.certificate.certified === "BLOCKED"
      ).length;
      const avgIntegrity = ctos.reduce(
        (sum, c) => sum + (c.certification.certificate.integrityScore?.score ?? 0), 0
      ) / ctos.length;
      const avgConfidence = ctos.reduce(
        (sum, c) => sum + c.confidence.overallConfidence, 0
      ) / ctos.length;

      const recommendationBreakdown = { APPROVE: 0, REVIEW: 0, ESCALATE: 0, REJECT: 0 };
      const fraudBreakdown = { minimal: 0, low: 0, moderate: 0, high: 0, elevated: 0 };
      const visionBreakdown = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };

      for (const cto of ctos) {
        const rec = cto.decision.recommendation as keyof typeof recommendationBreakdown;
        if (rec in recommendationBreakdown) recommendationBreakdown[rec]++;
        const fraud = cto.fraud.fraudRiskLevel as keyof typeof fraudBreakdown;
        if (fraud in fraudBreakdown) fraudBreakdown[fraud]++;
        const vision = cto.damage.visionSourceReliability as keyof typeof visionBreakdown;
        if (vision in visionBreakdown) visionBreakdown[vision]++;
      }

      return {
        ...base,
        certifiedCount,
        blockedCount,
        certificationRate: Math.round((certifiedCount / ctos.length) * 100),
        averageIntegrityScore: Math.round(avgIntegrity),
        averageConfidence: Math.round(avgConfidence),
        recommendationBreakdown,
        fraudRiskBreakdown: fraudBreakdown,
        visionReliabilityBreakdown: visionBreakdown,
      };
    }),

  // ── E10: Trust API v2 — enriched CTO ────────────────────────────────────

  getTrustAPIv2: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const cto = await getCTOForAssessment(input.assessmentId, requireTreV4Tenant(ctx));
      if (!cto) throw new Error("CTO not found for assessment");

      const claimId = String(input.assessmentId);

      return {
        apiVersion: "4.0.0",
        assessmentId: input.assessmentId,
        generatedAt: new Date().toISOString(),
        cto,
        claimEvents: trustEventBus.getClaimEvents(claimId),
        pendingReviews: humanTrustApprovalEngine.getClaimRequests(claimId),
        claimSLAs: trustSLAManager.getClaimSLAs(claimId),
        memoryInsights: trustMemoryEngine.generateInsights(),
        queueTasks: trustResolutionQueue.getPendingTasks().filter(
          (t) => t.claimId === claimId
        ),
      };
    }),
});
