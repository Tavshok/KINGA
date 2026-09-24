/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRE v3.0 GOVERNANCE ROUTER
 * Enhancement E6: Machine-Readable Truth API
 * Enhancement E10: Truth Governance Dashboard Backend
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { and, eq } from "drizzle-orm";
import { claims, aiAssessments } from "../../drizzle/schema";

// TRE v3.0 module imports
import { evaluateTruthRules, BUILT_IN_TRUTH_RULES, buildTruthRuleContext, type TruthRuleContext } from "../pipeline-v2/truthRuleEngine";
import { getRegulatoryProfile, validateAgainstProfile, type RegulatoryJurisdiction } from "../pipeline-v2/regulatoryProfiles";
import { verifyCertificateIntegrity, computeContentHash, computeTruthQualityIndex } from "../pipeline-v2/digitalTruthCertificate";
import { generateAllExplanations, generateExplanation, type ExplanationParams } from "../pipeline-v2/explainableTruthSummary";
import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function requireTreTenant(ctx: { user?: { tenantId?: string | null } | null }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

async function requireTreClaim(claimId: number, tenantId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [claim] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);
  if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
}


async function getAssessmentCTO(claimId: number, tenantId: string) {
  const db = await getDb();
  // Get claim number from claims table
  const claimRows = await db!
    .select({ id: claims.id, claimNumber: claims.claimNumber })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);
  if (!claimRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
  const claimRow = claimRows[0];

  // Get assessment data from aiAssessments table
  const assessRows = await db!
    .select({
      physicsAnalysis: aiAssessments.physicsAnalysis,
      claimTruthJson: aiAssessments.claimTruthJson,
      claimTruthObjectJson: aiAssessments.claimTruthObjectJson,
    })
    .from(aiAssessments)
    .where(and(eq(aiAssessments.claimId, claimId), eq(aiAssessments.tenantId, tenantId)))
    .orderBy(aiAssessments.createdAt)
    .limit(1);

  const assessRow = assessRows[0] ?? {};
  const cto = (assessRow as any).claimTruthObjectJson ? JSON.parse((assessRow as any).claimTruthObjectJson) : null;
  const physics = (assessRow as any).physicsAnalysis ? JSON.parse((assessRow as any).physicsAnalysis) : null;
  const claimTruth = (assessRow as any).claimTruthJson ? JSON.parse((assessRow as any).claimTruthJson) : null;

  return { row: claimRow, cto, physics, claimTruth };
}

// ─────────────────────────────────────────────────────────────────────────────
// E6: MACHINE-READABLE TRUTH API
// ─────────────────────────────────────────────────────────────────────────────

export const treGovernanceRouter = router({

  /** E6: Get the full Claim Truth Object for a claim */
  getClaimTruthObject: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  getCanonicalValues: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  verifyCertificate: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  getGovernanceSummary: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  evaluateTruthRules: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  getRegulatoryCompliance: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        jurisdiction: z.enum(["ZA", "UK", "AU", "US", "EU", "GLOBAL"]).optional(),
      })
    )
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  getExplanation: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        audience: z.enum(["CLAIMANT", "ASSESSOR", "AUDITOR"]).optional(),
      })
    )
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  getTruthQualityIndex: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      await requireTreClaim(input.claimId, tenantId);
      throwP0B1FraudDecisionHold();
    }),

  getGovernanceDashboard: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        jurisdiction: z.enum(["ZA", "UK", "AU", "US", "EU", "GLOBAL"]).default("ZA"),
      })
    )
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireTreTenant(ctx);
      void tenantId;
      void input;
      throwP0B1FraudDecisionHold();
    }),

});
