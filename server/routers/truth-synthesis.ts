/**
 * Truth Synthesis Router
 * 
 * tRPC procedures for multi-reference ground truth synthesis,
 * assessor deviation detection, and training data weighting.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { z } from "zod";
import {
  historicalClaims,
  multiReferenceTruth,
  assessorDeviationMetrics,
  trainingDataset,
} from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { synthesizeGroundTruth, saveSynthesisResult } from "../ml/truth-synthesis";

function requireTruthTenant(ctx: { user?: { tenantId?: string | null } }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

/**
 * Synthesize ground truth for a historical claim
 */
const synthesizeTruth = protectedProcedure
  .input(
    z.object({
      claimId: z.number(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get claim with assessor value
    const claim = await db
      .select()
      .from(historicalClaims)
      .where(and(
        eq(historicalClaims.id, input.claimId),
        eq(historicalClaims.tenantId, requireTruthTenant(ctx)),
      ))
      .limit(1);

    if (claim.length === 0) {
      throw new Error("Claim not found");
    }

    const assessorValue = Number(claim[0].totalAssessorEstimate || 0);

    if (assessorValue === 0) {
      throw new Error("No assessor estimate available");
    }

    // Synthesize truth from multiple sources
    const synthesis = await synthesizeGroundTruth(input.claimId, assessorValue);

    // Save synthesis results
    await saveSynthesisResult(input.claimId, assessorValue, synthesis);

    return {
      success: true,
      synthesis,
    };
  });

/**
 * Get claims with high assessor deviation (for review queue)
 */
const getHighDeviationClaims = protectedProcedure
  .input(
    z.object({
      minDeviation: z.number().default(20), // Minimum % deviation
      limit: z.number().default(50),
    })
  )
  .query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get claims with synthesized truth and high deviation
    const claims = await db
      .select({
        claimId: multiReferenceTruth.historicalClaimId,
        claimReference: historicalClaims.claimReference,
        vehicleMake: historicalClaims.vehicleMake,
        vehicleModel: historicalClaims.vehicleModel,
        assessorValue: historicalClaims.totalAssessorEstimate,
        synthesizedValue: multiReferenceTruth.synthesizedValue,
        deviationPercent: multiReferenceTruth.assessorDeviation,
        deviationAbsolute: multiReferenceTruth.deviationAbsolute,
        synthesisQuality: multiReferenceTruth.synthesisQuality,
        createdAt: historicalClaims.createdAt,
      })
      .from(multiReferenceTruth)
      .innerJoin(
        historicalClaims,
        eq(multiReferenceTruth.historicalClaimId, historicalClaims.id)
      )
      .where(and(
        eq(historicalClaims.tenantId, requireTruthTenant(ctx)),
        sql`ABS(${multiReferenceTruth.assessorDeviation}) >= ${input.minDeviation}`,
      ))
      .orderBy(desc(sql`ABS(${multiReferenceTruth.assessorDeviation})`))
      .limit(input.limit);

    return claims;
  });

/**
 * Get assessor variance analytics
 */
const getAssessorVarianceAnalytics = protectedProcedure
  .input(
    z.object({
      assessorName: z.string().optional(),
      limit: z.number().default(100),
    })
  )
  .query(async ({ input, ctx }) => {
    // assessor_deviation_metrics has no tenant key. It cannot be safely
    // presented as tenant intelligence until a governed attribution migration
    // exists, so restrict the aggregate to explicit platform observability.
    if (ctx.user.role !== "platform_super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Platform observability access is required" });
    }
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    let query = db
      .select()
      .from(assessorDeviationMetrics)
      .orderBy(desc(assessorDeviationMetrics.id))
      .limit(input.limit);

    if (input.assessorName) {
      query = query.where(
        eq(assessorDeviationMetrics.assessorName, input.assessorName)
      ) as any;
    }

    const metrics = await query;

    return metrics;
  });

/**
 * Approve claim for training dataset with weighted label
 */
const approveForTraining = protectedProcedure
  .input(
    z.object({
      claimId: z.number(),
      useAssessorValue: z.boolean(), // true = use assessor, false = use synthesized truth
      trainingWeight: z.number().min(0).max(1), // 0.0-1.0
      deviationReason: z.enum(["none", "negotiation", "fraud", "regional_variance", "data_quality"]).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const tenantId = requireTruthTenant(ctx);

    // Get claim and synthesis data
    const [claim, synthesis] = await Promise.all([
      db
        .select()
        .from(historicalClaims)
        .where(and(eq(historicalClaims.id, input.claimId), eq(historicalClaims.tenantId, tenantId)))
        .limit(1),
      db
        .select()
        .from(multiReferenceTruth)
        .innerJoin(historicalClaims, eq(multiReferenceTruth.historicalClaimId, historicalClaims.id))
        .where(and(eq(multiReferenceTruth.historicalClaimId, input.claimId), eq(historicalClaims.tenantId, tenantId)))
        .limit(1),
    ]);

    if (claim.length === 0) {
      throw new Error("Claim not found");
    }

    const groundTruthValue = input.useAssessorValue
      ? claim[0].totalAssessorEstimate
      : synthesis[0]?.synthesizedValue;

    if (!groundTruthValue) {
      throw new Error("No ground truth value available");
    }

    // Check if already in training dataset
    const existing = await db
      .select()
      .from(trainingDataset)
      .where(and(eq(trainingDataset.historicalClaimId, input.claimId), eq(trainingDataset.tenantId, tenantId)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(trainingDataset)
        .set({
          trainingWeight: input.trainingWeight.toString(),
          negotiatedAdjustment: input.useAssessorValue ? 0 : 1,
          deviationReason: input.deviationReason || "none",
        })
        .where(and(eq(trainingDataset.id, existing[0].id), eq(trainingDataset.tenantId, tenantId)));
    } else {
      // Insert new
      await db.insert(trainingDataset).values({
        historicalClaimId: input.claimId,
        tenantId,
        datasetVersion: "v1.0",
        includedBy: ctx.user.id,
        trainingWeight: input.trainingWeight.toString(),
        negotiatedAdjustment: input.useAssessorValue ? 0 : 1,
        deviationReason: input.deviationReason || "none",
      });
    }

    return {
      success: true,
      message: "Claim approved for training dataset",
    };
  });

export const truthSynthesisRouter = router({
  synthesizeTruth,
  getHighDeviationClaims,
  getAssessorVarianceAnalytics,
  approveForTraining,
});
