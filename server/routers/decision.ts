/**
 * decision.ts — tRPC router for the Claims Decision Authority
 *
 * Procedures:
 * - evaluateClaimDecision  — evaluate a single claim and return APPROVE/REVIEW/REJECT
 * - evaluateClaimBatch     — evaluate multiple claims in one call
 * - getDecisionSummary     — aggregate decision stats across recent claims in the DB
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  evaluateP0GatedClaimDecision,
  aggregateDecisionSummary,
  type ClaimsDecisionInput,
} from "../pipeline-v2/claimsDecisionAuthority";
import {
  generateDecisionTrace,
  buildDecisionTraceInputFromDb,
  buildP0B1DecisionTraceHold,
  type DecisionTraceInput,
} from "../pipeline-v2/decisionTraceGenerator";
import {
  checkReportReadiness,
  checkReportReadinessBatch,
  aggregateReadinessStats,
} from "../pipeline-v2/reportReadinessGate";
import {
  detectContradictions,
  detectContradictionsBatch,
  aggregateContradictionStats,
  type ContradictionInput,
} from "../pipeline-v2/contradictionDetectionEngine";
import {
  generateClaimExplanation as generateExplanation,
  type ExplanationInput,
} from "../pipeline-v2/claimsExplanationEngine";
import {
  routeClaim as routeClaimEngine,
  aggregateEscalationStats,
  type EscalationInput,
} from "../pipeline-v2/claimsEscalationRouter";
import {
  generateEscalationReason,
  type EscalationReasoningInput,
} from "../pipeline-v2/escalationReasoningEngine";
import { getDb } from "../db";
import { aiAssessments, claims } from "../../drizzle/schema";
import { and, desc, isNotNull, eq } from "drizzle-orm";

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
  fraud_risk_level: z
    .enum(["minimal", "low", "moderate", "high", "elevated"])
    .nullable()
    .optional(),
  fraud_risk_score: z.number().nullable().optional(),
  critical_flag_count: z.number().nullable().optional(),
  scenario_fraud_flagged: z.boolean().nullable().optional(),
  reasoning: z.string().nullable().optional(),
});

const CostDecisionSchema = z.object({
  recommendation: z
    .enum(["NEGOTIATE", "PROCEED_TO_ASSESSMENT", "ESCALATE"])
    .nullable()
    .optional(),
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

/**
 * P0-B1 routing boundary. Stored or caller-supplied fraud fields are not
 * source-bound authority, so they cannot select an automatic routing outcome.
 */
function p0ManualReviewRouteInput(input: EscalationInput): EscalationInput {
  return {
    ...input,
    recommendation: "REVIEW",
    fraud_risk_level: null,
    fraud_flagged: false,
    critical_fraud_flag_count: 0,
    is_high_value: false,
    cost_escalated: false,
    physics_inconsistency: false,
    damage_inconsistent: false,
    anomalies: [
      "P0-B1 withheld automated fraud routing: obtain independently verifiable claim-linked fraud evidence and a qualified automated-decision authority.",
    ],
  };
}

function routeP0ManualReview(input: EscalationInput) {
  const route = routeClaimEngine(p0ManualReviewRouteInput(input));
  const reason =
    "P0-B1 withheld automated fraud routing: obtain independently verifiable claim-linked fraud evidence and a qualified automated-decision authority before changing the route.";
  return {
    ...route,
    reason,
    metadata: {
      ...route.metadata,
      routing_rule: "P0_B1_FRAUD_EVIDENCE_WITHHELD",
    },
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const decisionRouter = router({
  /**
   * Evaluate a single claim and return the final recommendation.
   */
  evaluateClaimDecision: protectedProcedure
    .input(ClaimsDecisionInputSchema)
    .mutation(({ input }) => {
      return evaluateP0GatedClaimDecision(input as ClaimsDecisionInput);
    }),

  /**
   * Evaluate multiple claims in one call.
   */
  evaluateClaimBatch: protectedProcedure
    .input(
      z.object({
        claims: z
          .array(
          z.object({
            claim_id: z.union([z.string(), z.number()]),
            input: ClaimsDecisionInputSchema,
          })
          )
          .max(200),
      })
    )
    .mutation(({ input }) => {
      const results = input.claims.map(c => ({
          claim_id: c.claim_id,
        result: evaluateP0GatedClaimDecision(c.input as ClaimsDecisionInput),
      }));
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
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) {
        return {
          summary: aggregateDecisionSummary([]),
          sample_decisions: [],
          total_evaluated: 0,
        };
      }

      const tenantId = ctx.user?.tenantId;
      if (!tenantId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required",
        });

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
        .where(
          and(
          isNotNull(aiAssessments.fraudRiskLevel),
          eq(aiAssessments.tenantId, tenantId),
            eq(claims.tenantId, tenantId)
          )
        )
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
      const batchInputs = rows.map(row => {
        const fraudLevel = row.fraudRiskLevel as
          | "minimal"
          | "low"
          | "moderate"
          | "high"
          | "elevated"
          | null;
        const decisionInput: ClaimsDecisionInput = {
          scenario_type: row.incidentType ?? null,
          severity: row.structuralDamageSeverity ?? null,
          overall_confidence: row.confidenceScore ?? null,
          fraud_result: {
            fraud_risk_level: fraudLevel ?? null,
          },
          costDecision:
            row.estimatedCost != null && row.finalApprovedAmount != null
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
        return {
          claim_id: row.claimId ?? row.assessmentId,
          input: decisionInput,
        };
      });

      const results = batchInputs.map(({ claim_id, input }) => ({
        claim_id,
        result: evaluateP0GatedClaimDecision(input),
      }));
      const summary = aggregateDecisionSummary(results);

      // Return first 20 as sample
      const sampleDecisions = results.slice(0, 20).map(r => ({
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

  /**
   * Check a single decision for logical contradictions.
   * Returns contradictions list, valid flag, and ALLOW/BLOCK action.
   */
  checkContradictions: protectedProcedure
    .input(
      z.object({
        recommendation: z.enum(["APPROVE", "REVIEW", "REJECT"]),
        overall_confidence: z.number().nullable().optional(),
        assessor_validated: z.boolean().nullable().optional(),
        is_high_value: z.boolean().nullable().optional(),
        severity: z.string().nullable().optional(),
        fraud_result: z
          .object({
          fraud_risk_level: z.string().nullable().optional(),
          fraud_risk_score: z.number().nullable().optional(),
          critical_flag_count: z.number().nullable().optional(),
          scenario_fraud_flagged: z.boolean().nullable().optional(),
          })
          .nullable()
          .optional(),
        physics_result: z
          .object({
          is_plausible: z.boolean().nullable().optional(),
          confidence: z.number().nullable().optional(),
          has_critical_inconsistency: z.boolean().nullable().optional(),
          })
          .nullable()
          .optional(),
        damage_validation: z
          .object({
          is_consistent: z.boolean().nullable().optional(),
          consistency_score: z.number().nullable().optional(),
          has_unexplained_damage: z.boolean().nullable().optional(),
          })
          .nullable()
          .optional(),
        cost_decision: z
          .object({
            recommendation: z
              .enum(["NEGOTIATE", "PROCEED_TO_ASSESSMENT", "ESCALATE"])
              .nullable()
              .optional(),
          is_within_range: z.boolean().nullable().optional(),
          has_anomalies: z.boolean().nullable().optional(),
          })
          .nullable()
          .optional(),
        consistency_status: z
          .object({
            overall_status: z
              .enum(["CONSISTENT", "CONFLICTED"])
              .nullable()
              .optional(),
          critical_conflict_count: z.number().nullable().optional(),
          proceed: z.boolean().nullable().optional(),
          })
          .nullable()
          .optional(),
      })
    )
    .mutation(({ input }) => {
      return detectContradictions(input as ContradictionInput);
    }),

  /**
   * Fetch recent claims from the DB, run contradiction detection on each,
   * and return aggregate stats + sample blocked decisions.
   */
  getContradictionStats: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ ctx }) => {
      const tenantId = ctx.user?.tenantId;
      if (!tenantId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required",
        });

      return {
        status: "CONTRADICTION_DECISION_WITHHELD" as const,
        reviewRequired: true,
        requiredEvidence: [
          "An independently verifiable documentary, metadata, or human-reviewed fraud finding linked to the claim",
          "A future owner-approved qualified fraud-evidence policy that binds the finding to an automated decision purpose",
        ],
        resolver:
          "A designated human fraud reviewer obtains and verifies the claim-linked finding; the policy owner approves the qualified automated-decision authority.",
        stats: null,
        sample_blocked: [],
        total_evaluated: 0,
      };
    }),

  /**
   * Generate a structured audit trail from pre-computed stage data.
   * Accepts all stage outputs + final decision and returns a decision_trace array.
   */
  generateDecisionTrace: protectedProcedure
    .input(
      z.object({
        final_recommendation: z.enum(["APPROVE", "REVIEW", "REJECT"]),
        final_confidence: z.number().min(0).max(100),
        decision_basis: z
          .enum(["assessor_validated", "system_validated", "insufficient_data"])
          .nullable()
          .optional(),
        key_drivers: z.array(z.string()).nullable().optional(),
        blocking_factors: z.array(z.string()).nullable().optional(),
        extraction: z
          .object({
          total_documents: z.number().nullable().optional(),
          total_pages: z.number().nullable().optional(),
          ocr_applied: z.boolean().nullable().optional(),
          ocr_confidence: z.number().nullable().optional(),
          primary_document_type: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        data_extraction: z
          .object({
          vehicle_make: z.string().nullable().optional(),
          vehicle_model: z.string().nullable().optional(),
          vehicle_year: z.number().nullable().optional(),
          incident_type: z.string().nullable().optional(),
          claim_amount_cents: z.number().nullable().optional(),
          damaged_components_count: z.number().nullable().optional(),
          fields_extracted: z.number().nullable().optional(),
          fields_missing: z.number().nullable().optional(),
          })
          .nullable()
          .optional(),
        damage: z
          .object({
          damaged_components: z.array(z.string()).nullable().optional(),
          severity: z.string().nullable().optional(),
          is_consistent: z.boolean().nullable().optional(),
          consistency_score: z.number().nullable().optional(),
          has_unexplained_damage: z.boolean().nullable().optional(),
          structural_damage: z.boolean().nullable().optional(),
          summary: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        physics: z
          .object({
          is_plausible: z.boolean().nullable().optional(),
          confidence: z.number().nullable().optional(),
          has_critical_inconsistency: z.boolean().nullable().optional(),
          impact_direction: z.string().nullable().optional(),
          energy_level: z.string().nullable().optional(),
          summary: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        fraud: z
          .object({
            fraud_risk_level: z
              .enum(["minimal", "low", "moderate", "high", "elevated"])
              .nullable()
              .optional(),
          fraud_risk_score: z.number().nullable().optional(),
          critical_flag_count: z.number().nullable().optional(),
          top_indicators: z.array(z.string()).nullable().optional(),
          scenario_fraud_flagged: z.boolean().nullable().optional(),
          reasoning: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        cost: z
          .object({
          expected_cost_cents: z.number().nullable().optional(),
          claim_amount_cents: z.number().nullable().optional(),
          quote_deviation_pct: z.number().nullable().optional(),
            recommendation: z
              .enum(["NEGOTIATE", "PROCEED_TO_ASSESSMENT", "ESCALATE"])
              .nullable()
              .optional(),
          is_within_range: z.boolean().nullable().optional(),
          has_anomalies: z.boolean().nullable().optional(),
          savings_opportunity_cents: z.number().nullable().optional(),
          reasoning: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        consistency: z
          .object({
            overall_status: z
              .enum(["CONSISTENT", "CONFLICTED"])
              .nullable()
              .optional(),
          consistency_score: z.number().nullable().optional(),
          critical_conflict_count: z.number().nullable().optional(),
          proceed: z.boolean().nullable().optional(),
          summary: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
      })
    )
    .mutation(() => buildP0B1DecisionTraceHold()),

  /**
   * Fetch a claim's KINGA assessment from the DB and generate a full decision trace.
   */
  getDecisionTrace: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user?.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const [assessment] = await db
        .select({ id: aiAssessments.id })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(and(
          eq(aiAssessments.claimId, input.claimId),
          eq(aiAssessments.tenantId, tenantId),
          eq(claims.tenantId, tenantId),
        ))
        .limit(1);

      if (!assessment) {
        return null;
      }

      return buildP0B1DecisionTraceHold();
    }),

  /**
   * Check whether a claim is ready to be exported as a report.
   * Validates decision_ready, contradiction_check, and overall_confidence.
   */
  checkReportReadiness: protectedProcedure
    .input(
      z.object({
        decision_ready: z.object({
          is_ready: z.boolean(),
          recommendation: z
            .enum(["APPROVE", "REVIEW", "REJECT"])
            .nullable()
            .optional(),
          decision_basis: z
            .enum([
              "assessor_validated",
              "system_validated",
              "insufficient_data",
            ])
            .nullable()
            .optional(),
          assessor_validated: z.boolean().nullable().optional(),
          has_blocking_factors: z.boolean().nullable().optional(),
        }),
        contradiction_check: z.object({
          valid: z.boolean(),
          action: z.enum(["ALLOW", "BLOCK"]).nullable().optional(),
          critical_count: z.number().nullable().optional(),
          major_count: z.number().nullable().optional(),
          minor_count: z.number().nullable().optional(),
        }),
        overall_confidence: z.number().nullable().optional(),
        assessor_override: z.boolean().nullable().optional(),
        draft_mode: z.boolean().nullable().optional(),
        documents_attached: z.boolean().nullable().optional(),
        intake_validated: z.boolean().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      return checkReportReadiness(
        input as Parameters<typeof checkReportReadiness>[0]
      );
    }),

  /**
   * Fetch recent claims from the DB, evaluate readiness for each,
   * and return aggregate stats + sample results.
   */
  getReadinessSummary: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) return null;

      const tenantId = ctx.user?.tenantId;
      if (!tenantId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required",
        });

      const rows = await drizzle
        .select({
          assessmentId: aiAssessments.id,
          claimId: aiAssessments.claimId,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          confidenceScore: aiAssessments.confidenceScore,
          estimatedCost: aiAssessments.estimatedCost,
          consistencyCheckJson: aiAssessments.consistencyCheckJson,
          finalApprovedAmount: claims.finalApprovedAmount,
          workflowState: claims.workflowState,
        })
        .from(aiAssessments)
        .leftJoin(claims, eq(claims.id, aiAssessments.claimId))
        .where(
          and(
            eq(aiAssessments.tenantId, tenantId),
            eq(claims.tenantId, tenantId)
          )
        )
        .orderBy(desc(aiAssessments.id))
        .limit(input.limit);

      const batchInputs = rows.map(row => {
        const confidence = row.confidenceScore ? Number(row.confidenceScore) : null;
        // P0-B1: report readiness is an automated publication sink. Do not use
        // stored fraud levels or consistency values to allow/block a report.
        const isDecisionReady = false;
        const hasContradiction = false;

        return {
          claim_id: row.claimId ?? row.assessmentId,
          input: {
            decision_ready: {
              is_ready: isDecisionReady,
              recommendation: null,
              decision_basis: "insufficient_data" as const,
              has_blocking_factors: true,
            },
            contradiction_check: {
              valid: !hasContradiction,
              action: hasContradiction
                ? ("BLOCK" as const)
                : ("ALLOW" as const),
              critical_count: hasContradiction ? 1 : 0,
              major_count: 0,
              minor_count: 0,
            },
            overall_confidence: confidence,
          },
        };
      });

      const results = checkReportReadinessBatch(batchInputs);
      const stats = aggregateReadinessStats(results);

      const sampleResults = results.slice(0, 20).map(r => ({
        claim_id: r.claim_id,
        status: r.result.status,
        export_allowed: r.result.export_allowed,
        reason: r.result.reason,
        gates_passed: r.result.metadata.gates_passed,
        gates_failed: r.result.metadata.gates_failed,
      }));

      return {
        stats,
        sample_results: sampleResults,
        total_evaluated: results.length,
      };
    }),

  // ─── generateClaimExplanation ──────────────────────────────────────────────
  generateClaimExplanation: protectedProcedure
    .input(
      z.object({
        recommendation: z.enum(["APPROVE", "REVIEW", "REJECT"]),
        key_drivers: z.array(z.string()),
        reasoning: z.string(),
        confidence: z.number().min(0).max(100).nullable().optional(),
        decision_basis: z
          .enum(["assessor_validated", "system_validated", "insufficient_data"])
          .nullable()
          .optional(),
        claim_reference: z.string().nullable().optional(),
        incident_type: z.string().nullable().optional(),
        severity: z.string().nullable().optional(),
        estimated_cost: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
        fraud_risk_level: z.string().nullable().optional(),
        physics_plausible: z.boolean().nullable().optional(),
        damage_consistent: z.boolean().nullable().optional(),
        consistency_status: z.string().nullable().optional(),
        blocking_factors: z.array(z.string()).nullable().optional(),
        warnings: z.array(z.string()).nullable().optional(),
      })
    )
    .query(({ input }) => {
      return generateExplanation({
        ...input,
        recommendation: "REVIEW",
        fraud_risk_level: null,
        key_drivers: [
          "Automated fraud decision withheld: independently verifiable claim-linked fraud evidence and a qualified automated-decision authority are required.",
        ],
        reasoning:
          "P0-B1 withheld automated fraud reasoning pending independently verifiable claim-linked fraud evidence and a qualified automated-decision authority.",
      } as ExplanationInput);
    }),

  // ─── getClaimExplanation ───────────────────────────────────────────────────
  getClaimExplanation: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB unavailable",
        });

      const tenantId = ctx.user?.tenantId;
      if (!tenantId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required",
        });

      const rows = await drizzle
        .select({
          id: aiAssessments.id,
          confidenceScore: aiAssessments.confidenceScore,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          estimatedCost: aiAssessments.estimatedCost,
          structuralDamageSeverity: aiAssessments.structuralDamageSeverity,
          consistencyCheckJson: aiAssessments.consistencyCheckJson,
          fraudIndicators: aiAssessments.fraudIndicators,
          incidentType: claims.incidentType,
          finalApprovedAmount: claims.finalApprovedAmount,
          fraudRiskLevelClaim: claims.fraudRiskLevel,
          workflowState: claims.workflowState,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(claims.id, aiAssessments.claimId))
        .where(
          and(
          eq(aiAssessments.claimId, input.claimId),
          eq(aiAssessments.tenantId, tenantId),
            eq(claims.tenantId, tenantId)
          )
        )
        .orderBy(desc(aiAssessments.createdAt))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No assessment found for this claim",
        });
      }

      const row = rows[0];

      // P0-B1: persisted pre-P0 fraud fields cannot author an explanation or
      // routing recommendation. Keep the claim visibly held for manual review.
      const rec: "REVIEW" = "REVIEW";

      // P0-B1: persisted indicator labels may originate in an unqualified
      // score-bearing Stage 8 run, so do not republish them as decision drivers.
      const keyDrivers: string[] = [];

      // Parse consistency check
      let consistencyStatus: string | null = null;
      try {
        const cc =
          typeof row.consistencyCheckJson === "string"
          ? JSON.parse(row.consistencyCheckJson as string)
          : row.consistencyCheckJson;
        if (cc && typeof cc === "object") {
          consistencyStatus =
            ((cc as Record<string, unknown>).status as string) ??
            ((cc as Record<string, unknown>).overall_status as string) ??
            null;
        }
      } catch {
        /* ignore */
        }

      const explanationInput: ExplanationInput = {
        recommendation: rec,
        key_drivers: keyDrivers,
        reasoning: "",
        confidence: row.confidenceScore,
        incident_type: row.incidentType,
        severity: row.structuralDamageSeverity,
        estimated_cost:
          row.finalApprovedAmount != null
            ? Number(row.finalApprovedAmount)
            : row.estimatedCost != null
              ? Number(row.estimatedCost)
              : null,
        fraud_risk_level: null,
        consistency_status: consistencyStatus,
      };

      return generateExplanation(explanationInput);
    }),

  // ── routeClaim ─────────────────────────────────────────────────────────────
  routeClaim: protectedProcedure
    .input(
      z.object({
        recommendation: z.enum(["APPROVE", "REVIEW", "REJECT"]),
        confidence: z.number().min(0).max(100).nullable().optional(),
        anomalies: z
          .array(
            z.union([
          z.string(),
          z.object({
            description: z.string().optional(),
            is_critical: z.boolean().optional(),
            type: z.string().optional(),
          }),
            ])
          )
          .nullable()
          .optional(),
        fraud_risk_level: z.string().nullable().optional(),
        fraud_flagged: z.boolean().nullable().optional(),
        critical_fraud_flag_count: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional(),
        is_high_value: z.boolean().nullable().optional(),
        assessor_validated: z.boolean().nullable().optional(),
        claim_reference: z.string().nullable().optional(),
        cost_escalated: z.boolean().nullable().optional(),
        physics_inconsistency: z.boolean().nullable().optional(),
        damage_inconsistent: z.boolean().nullable().optional(),
      })
    )
    .query(({ input }) => {
      return routeP0ManualReview(input as EscalationInput);
    }),

  // ── routeClaimById ─────────────────────────────────────────────────────────
  routeClaimById: protectedProcedure
    .input(z.object({ claimId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });
      const tenantId = ctx.user?.tenantId;
      if (!tenantId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required",
        });
      const rows = await drizzle
        .select({
          confidenceScore: aiAssessments.confidenceScore,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          fraudScoreBreakdownJson: aiAssessments.fraudScoreBreakdownJson,
          estimatedCost: aiAssessments.estimatedCost,
          finalApprovedAmount: claims.finalApprovedAmount,
          claimRef: claims.id,
          fraudRiskLevelClaim: claims.fraudRiskLevel,
          claimFraudRiskScore: claims.fraudRiskScore,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(
          and(
          eq(aiAssessments.claimId, input.claimId),
          eq(aiAssessments.tenantId, tenantId),
            eq(claims.tenantId, tenantId)
          )
        )
        .orderBy(desc(aiAssessments.createdAt))
        .limit(1);
      if (rows.length === 0)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No assessment found for this claim",
        });
      const row = rows[0];
      const rec: "REVIEW" = "REVIEW";
      const estimatedCost =
        row.finalApprovedAmount != null
        ? Number(row.finalApprovedAmount)
          : row.estimatedCost != null
            ? Number(row.estimatedCost)
            : null;
      const HIGH_VALUE_THRESHOLD = 50000;
      const escalationInput: EscalationInput = {
        recommendation: rec,
        confidence: row.confidenceScore,
        anomalies: [],
        fraud_risk_level: null,
        fraud_flagged: false,
        is_high_value:
          estimatedCost != null && estimatedCost >= HIGH_VALUE_THRESHOLD,
        claim_reference: `CLM-${row.claimRef}`,
      };
      return routeP0ManualReview(escalationInput);
    }),

  // ── getEscalationSummary ───────────────────────────────────────────────────
  getEscalationSummary: protectedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(500).default(100) })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });
      const limit = input?.limit ?? 100;
      const tenantId = ctx.user?.tenantId;
      if (!tenantId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A tenant-scoped session is required",
        });
      const rows = await drizzle
        .select({
          confidenceScore: aiAssessments.confidenceScore,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          estimatedCost: aiAssessments.estimatedCost,
          finalApprovedAmount: claims.finalApprovedAmount,
          claimId: aiAssessments.claimId,
          fraudRiskLevelClaim: claims.fraudRiskLevel,
          claimFraudRiskScore: claims.fraudRiskScore,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(
          and(
            eq(aiAssessments.tenantId, tenantId),
            eq(claims.tenantId, tenantId)
          )
        )
        .orderBy(desc(aiAssessments.createdAt))
        .limit(limit);

      const batchItems = rows.map(row => {
        const rec: "REVIEW" = "REVIEW";
        const estimatedCost =
          row.finalApprovedAmount != null
          ? Number(row.finalApprovedAmount)
            : row.estimatedCost != null
              ? Number(row.estimatedCost)
              : null;
        const escalationInput: EscalationInput = {
          recommendation: rec,
          confidence: row.confidenceScore,
          anomalies: [],
          fraud_risk_level: null,
          fraud_flagged: false,
          is_high_value: estimatedCost != null && estimatedCost >= 50000,
          claim_reference: `CLM-${row.claimId}`,
        };
        return {
          claim_id: row.claimId ?? 0,
          input: p0ManualReviewRouteInput(escalationInput),
        };
      });

      const batchResults = batchItems.map(item => ({
        claim_id: item.claim_id,
        result: routeP0ManualReview(item.input),
      }));
      const summary = aggregateEscalationStats(batchResults);

      // ── Generate per-claim operational reasons via the Reasoning Engine ──
      // We run reasoning for the first 50 claims only (UI pagination limit)
      // to keep response time acceptable. Falls back gracefully per claim.
      const reasoningItems = batchResults.slice(0, 50).map(r => {
        const row = rows.find(ro => (ro.claimId ?? 0) === r.claim_id);
        const reasoningInput: EscalationReasoningInput = {
          route: r.result.route_to,
          decision_recommendation: r.result.metadata.recommendation,
          confidence: r.result.metadata.confidence,
          anomalies: [],
          fraud_score: null,
          evidence_completeness: null,
          structural_gaps_count: 0,
          out_of_domain: false,
          claim_reference: r.result.metadata.claim_reference,
        };
        return { claim_id: r.claim_id, input: reasoningInput };
      });

      // Run reasoning in parallel (capped at 5 concurrent by the engine)
      const reasoningResults = await Promise.all(
        reasoningItems.map(async item => ({
          claim_id: item.claim_id,
          reasoning: await generateEscalationReason(item.input),
        }))
      );

      // Build per-claim detail list for the UI
      const claimDetails = batchResults.slice(0, 50).map(r => {
        const rr = reasoningResults.find(x => x.claim_id === r.claim_id);
        return {
          claim_id: r.claim_id,
          route: r.result.route_to,
          priority: rr?.reasoning.priority ?? r.result.priority,
          reason: rr?.reasoning.reason ?? r.result.reason,
          flags: rr?.reasoning.flags ?? [],
          confidence: r.result.metadata.confidence,
          fraud_detected: r.result.metadata.fraud_detected,
          routed_at: r.result.metadata.routed_at,
          reasoning_source: rr?.reasoning.source ?? "fallback",
        };
      });

      return { ...summary, claim_details: claimDetails };
    }),
});
