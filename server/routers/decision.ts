/**
 * decision.ts — tRPC router for the Claims Decision Authority
 *
 * Procedures:
 * - evaluateClaimDecision  — evaluate a single claim and return APPROVE/REVIEW/REJECT
 * - evaluateClaimBatch     — evaluate multiple claims in one call
 * - getDecisionSummary     — aggregate decision stats across recent claims in the DB
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  evaluateClaimDecision,
  evaluateClaimDecisionBatch,
  aggregateDecisionSummary,
  type ClaimsDecisionInput,
} from "../pipeline-v2/claimsDecisionAuthority";
import { getDb } from "../db";
import { aiAssessments, claims } from "../../drizzle/schema";
import { desc, isNotNull, eq } from "drizzle-orm";

// ─── Input Schemas ────────────────────────────────────────────────────────────

const PhysicsResultSchema = z.object({
  is_plausible: z.boolean().nullable().optional(),
  confidence: z.number().nullable().optional(),
  has_critical_inconsistency: z.boolean().nullable().optional(),
  summary: z.string().nullable().optional(),
});

const DamageValidationSchema = z.object({
  is_consistent: z.boolean().nullable().optional(),
  consistency_score: z.number().nullable().optional(),
  has_unexplained_damage: z.boolean().nullable().optional(),
  summary: z.string().nullable().optional(),
});

const FraudResultSchema = z.object({
  fraud_risk_level: z.enum(["minimal", "low", "medium", "high", "elevated"]).nullable().optional(),
  fraud_risk_score: z.number().nullable().optional(),
  critical_flag_count: z.number().nullable().optional(),
  scenario_fraud_flagged: z.boolean().nullable().optional(),
  reasoning: z.string().nullable().optional(),
});

const CostDecisionSchema = z.object({
  recommendation: z.enum(["NEGOTIATE", "PROCEED_TO_ASSESSMENT", "ESCALATE"]).nullable().optional(),
  is_within_range: z.boolean().nullable().optional(),
  confidence: z.number().nullable().optional(),
  has_anomalies: z.boolean().nullable().optional(),
  reasoning: z.string().nullable().optional(),
});

const ConsistencyStatusSchema = z.object({
  overall_status: z.enum(["CONSISTENT", "CONFLICTED"]).nullable().optional(),
  critical_conflict_count: z.number().nullable().optional(),
  proceed: z.boolean().nullable().optional(),
  summary: z.string().nullable().optional(),
});

const ClaimsDecisionInputSchema = z.object({
  scenario_type: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  physics_result: PhysicsResultSchema.nullable().optional(),
  damage_validation: DamageValidationSchema.nullable().optional(),
  fraud_result: FraudResultSchema.nullable().optional(),
  costDecision: CostDecisionSchema.nullable().optional(),
  overall_confidence: z.number().min(0).max(100).nullable().optional(),
  consistency_status: ConsistencyStatusSchema.nullable().optional(),
  assessor_validated: z.boolean().nullable().optional(),
  is_high_value: z.boolean().nullable().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const decisionRouter = router({
  /**
   * Evaluate a single claim and return the final recommendation.
   */
  evaluateClaimDecision: protectedProcedure
    .input(ClaimsDecisionInputSchema)
    .mutation(({ input }) => {
      return evaluateClaimDecision(input as ClaimsDecisionInput);
    }),

  /**
   * Evaluate multiple claims in one call.
   */
  evaluateClaimBatch: protectedProcedure
    .input(
      z.object({
        claims: z.array(
          z.object({
            claim_id: z.union([z.string(), z.number()]),
            input: ClaimsDecisionInputSchema,
          })
        ).max(200),
      })
    )
    .mutation(({ input }) => {
      const results = evaluateClaimDecisionBatch(
        input.claims.map((c) => ({
          claim_id: c.claim_id,
          input: c.input as ClaimsDecisionInput,
        }))
      );
      const summary = aggregateDecisionSummary(results);
      return { results, summary };
    }),

  /**
   * Aggregate decision statistics across recent AI assessments in the DB.
   * Reads aiAssessments + claims to reconstruct decision inputs and run
   * the engine over them, returning a summary of APPROVE/REVIEW/REJECT rates.
   */
  getDecisionSummary: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const drizzle = await getDb();
      if (!drizzle) {
        return {
          summary: aggregateDecisionSummary([]),
          sample_decisions: [],
          total_evaluated: 0,
        };
      }

      // Fetch recent AI assessments with their claims
      const rows = await drizzle
        .select({
          assessmentId: aiAssessments.id,
          claimId: aiAssessments.claimId,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          confidenceScore: aiAssessments.confidenceScore,
          estimatedCost: aiAssessments.estimatedCost,
          structuralDamageSeverity: aiAssessments.structuralDamageSeverity,
          fraudScoreBreakdownJson: aiAssessments.fraudScoreBreakdownJson,
          finalApprovedAmount: claims.finalApprovedAmount,
          incidentType: claims.incidentType,
        })
        .from(aiAssessments)
        .leftJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(isNotNull(aiAssessments.fraudRiskLevel))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(input.limit);

      if (rows.length === 0) {
        return {
          summary: aggregateDecisionSummary([]),
          sample_decisions: [],
          total_evaluated: 0,
        };
      }

      // Build decision inputs from DB rows
      const batchInputs = rows.map((row) => {
        const fraudLevel = row.fraudRiskLevel as "minimal" | "low" | "medium" | "high" | "elevated" | null;
        const decisionInput: ClaimsDecisionInput = {
          scenario_type: row.incidentType ?? null,
          severity: row.structuralDamageSeverity ?? null,
          overall_confidence: row.confidenceScore ?? null,
          fraud_result: {
            fraud_risk_level: fraudLevel ?? null,
          },
          costDecision: row.estimatedCost != null && row.finalApprovedAmount != null
            ? {
                recommendation: (() => {
                  const est = Number(row.estimatedCost);
                  const approved = Number(row.finalApprovedAmount);
                  if (approved === 0) return "ESCALATE" as const;
                  const deviation = Math.abs(est - approved) / approved;
                  if (deviation > 0.4) return "ESCALATE" as const;
                  if (deviation > 0.15) return "NEGOTIATE" as const;
                  return "PROCEED_TO_ASSESSMENT" as const;
                })(),
                is_within_range: (() => {
                  const est = Number(row.estimatedCost);
                  const approved = Number(row.finalApprovedAmount);
                  if (approved === 0) return null;
                  return Math.abs(est - approved) / approved <= 0.4;
                })(),
              }
            : null,
        };
        return { claim_id: row.claimId ?? row.assessmentId, input: decisionInput };
      });

      const results = evaluateClaimDecisionBatch(batchInputs);
      const summary = aggregateDecisionSummary(results);

      // Return first 20 as sample
      const sampleDecisions = results.slice(0, 20).map((r) => ({
        claim_id: r.claim_id,
        recommendation: r.result.recommendation,
        confidence: r.result.confidence,
        decision_basis: r.result.decision_basis,
        key_drivers: r.result.key_drivers.slice(0, 3),
      }));

      return {
        summary,
        sample_decisions: sampleDecisions,
        total_evaluated: results.length,
      };
    }),
});
