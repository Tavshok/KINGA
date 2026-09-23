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

function requireTreV4Tenant(ctx: { user?: { tenantId?: string | null } | null }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

function throwP0FraudTreHold(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "TRE fraud simulation, certification, and fraud-bearing trust output are withheld pending independently verifiable claim-linked evidence, human-reviewed auditable evidence, and a future owner-approved qualified automated-decision policy.",
  });
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
      const tenantId = requireTreV4Tenant(ctx);
      await requireTenantAssessment(input.assessmentId, tenantId);
      throwP0FraudTreHold();
    }),

  runStandardSimulations: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTreV4Tenant(ctx);
      await requireTenantAssessment(input.assessmentId, tenantId);
      throwP0FraudTreHold();
    }),

  // ── E9: Enterprise Trust Dashboard ──────────────────────────────────────

  getEnterpriseDashboard: protectedProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx }) => {
      requireTreV4Tenant(ctx);
      throwP0FraudTreHold();
    }),

  // ── E10: Trust API v2 — enriched CTO ────────────────────────────────────

  getTrustAPIv2: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTreV4Tenant(ctx);
      await requireTenantAssessment(input.assessmentId, tenantId);
      throwP0FraudTreHold();
    }),
});
