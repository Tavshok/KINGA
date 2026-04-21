/**
 * Repair-vs-Replace tRPC Router
 *
 * Procedures:
 *   repairReplace.scoreComponents  — score repair probability for all components on a claim
 *   repairReplace.recordOutcome    — record adjuster's confirmed repair/replace decision
 *                                    (feeds the learning DB silently)
 *
 * The scoring is advisory only — it surfaces probabilities, not mandates.
 * The recordOutcome procedure is designed to feel like a normal adjuster
 * annotation tool, not a model training interface.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { claims, aiAssessments } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { scoreAllComponents, recordAdjusterOutcome, inferCategory } from "../pipeline-v2/repairReplaceEngine";

export const repairReplaceRouter = router({
  /**
   * Score repair probability for all detected components on a claim.
   *
   * Reads the repairIntelligenceJson from the claim's latest AI assessment,
   * extracts the component list with severity, and runs the probability engine.
   *
   * Returns an array of RepairProbabilityResult — one per component.
   */
  scoreComponents: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const isSuperUser = user.role === "admin" || user.role === "platform_super_admin";
      const tenantId = isSuperUser ? null : user.tenantId;

      const db = await getDb();

      // Fetch the claim to get vehicle context
      const claimRows = await db
        .select()
        .from(claims)
        .where(
          tenantId
            ? and(eq(claims.id, input.claimId), eq(claims.tenantId, tenantId))
            : eq(claims.id, input.claimId)
        )
        .limit(1);

      if (!claimRows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }

      const claim = claimRows[0];

      // Fetch the latest AI assessment for this claim
      const assessmentRows = await db
        .select({
          id: aiAssessments.id,
          repairIntelligenceJson: aiAssessments.repairIntelligenceJson,
          damageAnalysisJson: aiAssessments.damageAnalysisJson,
        })
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, input.claimId))
        .limit(1);

      if (!assessmentRows.length) {
        return { components: [], vehicleContext: {}, message: "No AI assessment found for this claim" };
      }

      const assessment = assessmentRows[0];

      // Parse component list from repairIntelligenceJson or damageAnalysisJson
      let componentSignals: Array<{ componentName: string; componentCategory?: string; severity: string }> = [];

      try {
        if (assessment.repairIntelligenceJson) {
          const ri = JSON.parse(assessment.repairIntelligenceJson as string);
          if (Array.isArray(ri)) {
            componentSignals = ri.map((c: any) => ({
              componentName: c.componentName ?? c.component ?? c.name ?? "Unknown",
              componentCategory: c.category ?? inferCategory(c.componentName ?? c.component ?? ""),
              severity: c.severity ?? c.damageLevel ?? "moderate",
            }));
          } else if (ri?.components && Array.isArray(ri.components)) {
            componentSignals = ri.components.map((c: any) => ({
              componentName: c.componentName ?? c.component ?? c.name ?? "Unknown",
              componentCategory: c.category ?? inferCategory(c.componentName ?? c.component ?? ""),
              severity: c.severity ?? c.damageLevel ?? "moderate",
            }));
          }
        }

        // Fallback to damageAnalysisJson if repairIntelligenceJson has no components
        if (componentSignals.length === 0 && assessment.damageAnalysisJson) {
          const da = JSON.parse(assessment.damageAnalysisJson as string);
          const damagedParts = da?.damagedParts ?? da?.damaged_parts ?? da?.components ?? [];
          if (Array.isArray(damagedParts)) {
            componentSignals = damagedParts.map((c: any) => ({
              componentName: c.part ?? c.component ?? c.name ?? "Unknown",
              componentCategory: inferCategory(c.part ?? c.component ?? c.name ?? ""),
              severity: c.severity ?? c.damage_level ?? c.damageLevel ?? "moderate",
            }));
          }
        }
      } catch {
        // JSON parse failure is non-fatal
      }

      if (componentSignals.length === 0) {
        return { components: [], vehicleContext: {}, message: "No components detected in assessment" };
      }

      // Build vehicle context from claim record
      const vehicleContext = {
        make: (claim as any).vehicleMake ?? undefined,
        model: (claim as any).vehicleModel ?? undefined,
        year: (claim as any).vehicleYear ?? undefined,
      };

      // Score all components
      const results = await scoreAllComponents(componentSignals, vehicleContext);

      return {
        assessmentId: assessment.id,
        components: results,
        vehicleContext,
        message: null,
      };
    }),

  /**
   * Record the adjuster's confirmed repair/replace decision for a component.
   *
   * This is the learning write-back — it silently improves future predictions.
   * The UI presents this as a normal "confirm annotation" action.
   */
  recordOutcome: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        assessmentId: z.number().int().positive(),
        componentName: z.string().min(1),
        componentCategory: z.string().optional(),
        severityAtDecision: z.string(),
        vehicleMake: z.string().optional(),
        vehicleModel: z.string().optional(),
        vehicleYear: z.number().int().optional(),
        outcome: z.enum(["repair", "replace", "write_off"]),
        aiSuggestion: z.enum(["repair", "replace", "uncertain"]),
        repairCostUsd: z.number().optional(),
        replaceCostUsd: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await recordAdjusterOutcome({
        ...input,
        adjusterUserId: ctx.user.id,
      });
      return { success: true };
    }),
});
