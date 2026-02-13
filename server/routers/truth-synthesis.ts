/**
 * Truth Synthesis Router
 * 
 * tRPC procedures for multi-reference ground truth synthesis,
 * assessor deviation detection, and training data weighting.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  historicalClaims,
  multiReferenceTruth,
  assessorDeviationMetrics,
  trainingDataset,
  type InsertMultiReferenceTruth,
  type InsertAssessorDeviationMetrics,
} from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { synthesizeGroundTruth, saveSynthesisResult } from "../ml/truth-synthesis";

/**
 * Synthesize ground truth for a historical claim
 */
const synthesizeTruth = protectedProcedure
  .input(
    z.object({
      claimId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get claim with assessor value
    const claim = await db
      .select()
      .from(historicalClaims)
      .where(eq(historicalClaims.id, input.claimId))
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
  .query(async ({ input }) => {
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
      .where(sql`ABS(${multiReferenceTruth.assessorDeviation}) >= ${input.minDeviation}`)
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
  .query(async ({ input }) => {
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

    // Get claim and synthesis data
    const [claim, synthesis] = await Promise.all([
      db
        .select()
        .from(historicalClaims)
        .where(eq(historicalClaims.id, input.claimId))
        .limit(1),
      db
        .select()
        .from(multiReferenceTruth)
        .where(eq(multiReferenceTruth.historicalClaimId, input.claimId))
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
      .where(eq(trainingDataset.historicalClaimId, input.claimId))
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
        .where(eq(trainingDataset.id, existing[0].id));
    } else {
      // Insert new
      await db.insert(trainingDataset).values({
        historicalClaimId: input.claimId,
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
