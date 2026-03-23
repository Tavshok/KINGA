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
  evaluateClaimDecision,
  evaluateClaimDecisionBatch,
  aggregateDecisionSummary,
  type ClaimsDecisionInput,
} from "../pipeline-v2/claimsDecisionAuthority";
import {
  generateDecisionTrace,
  buildDecisionTraceInputFromDb,
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
  routeClaimBatch as routeClaimBatchEngine,
  aggregateEscalationStats,
  type EscalationInput,
} from "../pipeline-v2/claimsEscalationRouter";
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
        fraud_result: z.object({
          fraud_risk_level: z.string().nullable().optional(),
          fraud_risk_score: z.number().nullable().optional(),
          critical_flag_count: z.number().nullable().optional(),
          scenario_fraud_flagged: z.boolean().nullable().optional(),
        }).nullable().optional(),
        physics_result: z.object({
          is_plausible: z.boolean().nullable().optional(),
          confidence: z.number().nullable().optional(),
          has_critical_inconsistency: z.boolean().nullable().optional(),
        }).nullable().optional(),
        damage_validation: z.object({
          is_consistent: z.boolean().nullable().optional(),
          consistency_score: z.number().nullable().optional(),
          has_unexplained_damage: z.boolean().nullable().optional(),
        }).nullable().optional(),
        cost_decision: z.object({
          recommendation: z.enum(["NEGOTIATE", "PROCEED_TO_ASSESSMENT", "ESCALATE"]).nullable().optional(),
          is_within_range: z.boolean().nullable().optional(),
          has_anomalies: z.boolean().nullable().optional(),
        }).nullable().optional(),
        consistency_status: z.object({
          overall_status: z.enum(["CONSISTENT", "CONFLICTED"]).nullable().optional(),
          critical_conflict_count: z.number().nullable().optional(),
          proceed: z.boolean().nullable().optional(),
        }).nullable().optional(),
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
    .query(async ({ input }) => {
      const drizzle = await getDb();
      if (!drizzle) return null;

      const rows = await drizzle
        .select({
          assessmentId: aiAssessments.id,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          confidenceScore: aiAssessments.confidenceScore,
          estimatedCost: aiAssessments.estimatedCost,
          structuralDamageSeverity: aiAssessments.structuralDamageSeverity,
          physicsAnalysis: aiAssessments.physicsAnalysis,
          damagedComponentsJson: aiAssessments.damagedComponentsJson,
          consistencyCheckJson: aiAssessments.consistencyCheckJson,
          fraudScoreBreakdownJson: aiAssessments.fraudScoreBreakdownJson,
          costRealismJson: aiAssessments.costRealismJson,
          claimId: claims.id,
          incidentType: claims.incidentType,
          finalApprovedAmount: claims.finalApprovedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
        })
        .from(aiAssessments)
        .leftJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(isNotNull(aiAssessments.fraudRiskLevel))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(input.limit);

      const batchInputs = rows.map((row) => {
        const fraudLevel = row.fraudRiskLevel as "minimal" | "low" | "medium" | "high" | "elevated" | null;
        const decisionInput: ClaimsDecisionInput = {
          scenario_type: row.incidentType ?? null,
          severity: row.structuralDamageSeverity ?? null,
          overall_confidence: row.confidenceScore ?? null,
          fraud_result: { fraud_risk_level: fraudLevel ?? null },
          costDecision: row.estimatedCost != null && row.finalApprovedAmount != null
            ? {
                recommendation: (() => {
                  const est = Number(row.estimatedCost);
                  const approved = Number(row.finalApprovedAmount);
                  if (approved === 0) return "ESCALATE" as const;
                  const dev = Math.abs(est - approved) / approved;
                  if (dev > 0.4) return "ESCALATE" as const;
                  if (dev > 0.15) return "NEGOTIATE" as const;
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
        const decisionResult = evaluateClaimDecision(decisionInput);

        const contradictionInput: ContradictionInput = {
          recommendation: decisionResult.recommendation,
          overall_confidence: row.confidenceScore ?? null,
          severity: row.structuralDamageSeverity ?? null,
          fraud_result: { fraud_risk_level: fraudLevel ?? null },
          cost_decision: decisionInput.costDecision ?? null,
        };
        return { claim_id: row.claimId ?? row.assessmentId, input: contradictionInput };
      });

      const results = detectContradictionsBatch(batchInputs);
      const stats = aggregateContradictionStats(results);

      const sampleBlocked = results
        .filter((r) => r.result.action === "BLOCK")
        .slice(0, 10)
        .map((r) => ({
          claim_id: r.claim_id,
          contradictions: r.result.contradictions.map((c) => ({
            rule_id: c.rule_id,
            severity: c.severity,
            description: c.description,
          })),
        }));

      return { stats, sample_blocked: sampleBlocked, total_evaluated: results.length };
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
        decision_basis: z.enum(["assessor_validated", "system_validated", "insufficient_data"]).nullable().optional(),
        key_drivers: z.array(z.string()).nullable().optional(),
        blocking_factors: z.array(z.string()).nullable().optional(),
        extraction: z.object({
          total_documents: z.number().nullable().optional(),
          total_pages: z.number().nullable().optional(),
          ocr_applied: z.boolean().nullable().optional(),
          ocr_confidence: z.number().nullable().optional(),
          primary_document_type: z.string().nullable().optional(),
        }).nullable().optional(),
        data_extraction: z.object({
          vehicle_make: z.string().nullable().optional(),
          vehicle_model: z.string().nullable().optional(),
          vehicle_year: z.number().nullable().optional(),
          incident_type: z.string().nullable().optional(),
          claim_amount_cents: z.number().nullable().optional(),
          damaged_components_count: z.number().nullable().optional(),
          fields_extracted: z.number().nullable().optional(),
          fields_missing: z.number().nullable().optional(),
        }).nullable().optional(),
        damage: z.object({
          damaged_components: z.array(z.string()).nullable().optional(),
          severity: z.string().nullable().optional(),
          is_consistent: z.boolean().nullable().optional(),
          consistency_score: z.number().nullable().optional(),
          has_unexplained_damage: z.boolean().nullable().optional(),
          structural_damage: z.boolean().nullable().optional(),
          summary: z.string().nullable().optional(),
        }).nullable().optional(),
        physics: z.object({
          is_plausible: z.boolean().nullable().optional(),
          confidence: z.number().nullable().optional(),
          has_critical_inconsistency: z.boolean().nullable().optional(),
          impact_direction: z.string().nullable().optional(),
          energy_level: z.string().nullable().optional(),
          summary: z.string().nullable().optional(),
        }).nullable().optional(),
        fraud: z.object({
          fraud_risk_level: z.enum(["minimal", "low", "medium", "high", "elevated"]).nullable().optional(),
          fraud_risk_score: z.number().nullable().optional(),
          critical_flag_count: z.number().nullable().optional(),
          top_indicators: z.array(z.string()).nullable().optional(),
          scenario_fraud_flagged: z.boolean().nullable().optional(),
          reasoning: z.string().nullable().optional(),
        }).nullable().optional(),
        cost: z.object({
          expected_cost_cents: z.number().nullable().optional(),
          claim_amount_cents: z.number().nullable().optional(),
          quote_deviation_pct: z.number().nullable().optional(),
          recommendation: z.enum(["NEGOTIATE", "PROCEED_TO_ASSESSMENT", "ESCALATE"]).nullable().optional(),
          is_within_range: z.boolean().nullable().optional(),
          has_anomalies: z.boolean().nullable().optional(),
          savings_opportunity_cents: z.number().nullable().optional(),
          reasoning: z.string().nullable().optional(),
        }).nullable().optional(),
        consistency: z.object({
          overall_status: z.enum(["CONSISTENT", "CONFLICTED"]).nullable().optional(),
          consistency_score: z.number().nullable().optional(),
          critical_conflict_count: z.number().nullable().optional(),
          proceed: z.boolean().nullable().optional(),
          summary: z.string().nullable().optional(),
        }).nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      return generateDecisionTrace(input as DecisionTraceInput);
    }),

  /**
   * Fetch a claim's AI assessment from the DB and generate a full decision trace.
   */
  getDecisionTrace: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const drizzle = await getDb();
      if (!drizzle) return null;

      const rows = await drizzle
        .select({
          assessmentId: aiAssessments.id,
          // aiAssessments columns
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          confidenceScore: aiAssessments.confidenceScore,
          estimatedCost: aiAssessments.estimatedCost,
          structuralDamageSeverity: aiAssessments.structuralDamageSeverity,
          physicsAnalysis: aiAssessments.physicsAnalysis,
          damagedComponentsJson: aiAssessments.damagedComponentsJson,
          consistencyCheckJson: aiAssessments.consistencyCheckJson,
          fraudScoreBreakdownJson: aiAssessments.fraudScoreBreakdownJson,
          costRealismJson: aiAssessments.costRealismJson,
          // claims columns
          claimId: claims.id,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleYear: claims.vehicleYear,
          incidentType: claims.incidentType,
          finalApprovedAmount: claims.finalApprovedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
        })
        .from(aiAssessments)
        .leftJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(eq(aiAssessments.claimId, input.claimId))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(1);

      if (rows.length === 0) return null;

      const row = rows[0];
      const fraudLevel = row.fraudRiskLevel as "minimal" | "low" | "medium" | "high" | "elevated" | null;
      const decisionInput: ClaimsDecisionInput = {
        scenario_type: row.incidentType ?? null,
        severity: row.structuralDamageSeverity ?? null,
        overall_confidence: row.confidenceScore ?? null,
        fraud_result: { fraud_risk_level: fraudLevel ?? null },
        costDecision: row.estimatedCost != null && row.finalApprovedAmount != null
          ? {
              recommendation: (() => {
                const est = Number(row.estimatedCost);
                const approved = Number(row.finalApprovedAmount);
                if (approved === 0) return "ESCALATE" as const;
                const dev = Math.abs(est - approved) / approved;
                if (dev > 0.4) return "ESCALATE" as const;
                if (dev > 0.15) return "NEGOTIATE" as const;
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
      const decisionResult = evaluateClaimDecision(decisionInput);

      const traceInput = buildDecisionTraceInputFromDb(
        row as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        {
          recommendation: decisionResult.recommendation,
          confidence: decisionResult.confidence,
          decision_basis: decisionResult.decision_basis,
          key_drivers: decisionResult.key_drivers,
          blocking_factors: decisionResult.blocking_factors,
        }
      );

      return generateDecisionTrace(traceInput);
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
          recommendation: z.enum(["APPROVE", "REVIEW", "REJECT"]).nullable().optional(),
          decision_basis: z.enum(["assessor_validated", "system_validated", "insufficient_data"]).nullable().optional(),
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
      return checkReportReadiness(input as Parameters<typeof checkReportReadiness>[0]);
    }),

  /**
   * Fetch recent claims from the DB, evaluate readiness for each,
   * and return aggregate stats + sample results.
   */
  getReadinessSummary: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ input }) => {
      const drizzle = await getDb();
      if (!drizzle) return null;

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
        .orderBy(desc(aiAssessments.id))
        .limit(input.limit);

      const batchInputs = rows.map((row) => {
        const consistencyCheck = (() => {
          try { return row.consistencyCheckJson ? JSON.parse(row.consistencyCheckJson) : null; }
          catch { return null; }
        })();

        const confidence = row.confidenceScore ? Number(row.confidenceScore) : null;
        const fraudLevel = row.fraudRiskLevel ?? null;
        const nonReadyStates = ["created", "intake_queue", "ai_assessment_pending"];
        const isDecisionReady = row.workflowState != null && !nonReadyStates.includes(row.workflowState);

        // Infer contradiction validity from fraud + consistency signals
        const hasContradiction =
          (fraudLevel === "high" || fraudLevel === "elevated") &&
          consistencyCheck?.overall_status === "CONSISTENT";

        return {
          claim_id: row.claimId ?? row.assessmentId,
          input: {
            decision_ready: {
              is_ready: isDecisionReady,
              recommendation: null,
              decision_basis: ("system_validated" as const),
              has_blocking_factors: false,
            },
            contradiction_check: {
              valid: !hasContradiction,
              action: hasContradiction ? ("BLOCK" as const) : ("ALLOW" as const),
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

      const sampleResults = results.slice(0, 20).map((r) => ({
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
      return generateExplanation(input as ExplanationInput);
    }),

  // ─── getClaimExplanation ───────────────────────────────────────────────────
  getClaimExplanation: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

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
        .where(eq(aiAssessments.claimId, input.claimId))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No assessment found for this claim" });
      }

      const row = rows[0];

      // Derive recommendation from fraud risk level and workflow state
      const fraudLevel = (row.fraudRiskLevel ?? row.fraudRiskLevelClaim ?? "low").toLowerCase();
      const rec: "APPROVE" | "REVIEW" | "REJECT" =
        fraudLevel === "high" || fraudLevel === "critical" ? "REJECT"
        : fraudLevel === "elevated" || fraudLevel === "medium" ? "REVIEW"
        : (row.workflowState === "closed" || row.workflowState === "payment_authorized" ? "APPROVE" : "REVIEW");

      // Parse fraud indicators as key drivers
      let keyDrivers: string[] = [];
      try {
        const fi = typeof row.fraudIndicators === "string"
          ? JSON.parse(row.fraudIndicators as string)
          : row.fraudIndicators;
        if (Array.isArray(fi)) keyDrivers = fi.map(String);
      } catch { /* ignore */ }

      // Parse consistency check
      let consistencyStatus: string | null = null;
      try {
        const cc = typeof row.consistencyCheckJson === "string"
          ? JSON.parse(row.consistencyCheckJson as string)
          : row.consistencyCheckJson;
        if (cc && typeof cc === "object") {
          consistencyStatus = (cc as Record<string, unknown>).status as string
            ?? (cc as Record<string, unknown>).overall_status as string
            ?? null;
        }
      } catch { /* ignore */ }

      const explanationInput: ExplanationInput = {
        recommendation: rec,
        key_drivers: keyDrivers,
        reasoning: "",
        confidence: row.confidenceScore,
        incident_type: row.incidentType,
        severity: row.structuralDamageSeverity,
        estimated_cost: row.finalApprovedAmount != null ? Number(row.finalApprovedAmount) : (row.estimatedCost != null ? Number(row.estimatedCost) : null),
        fraud_risk_level: row.fraudRiskLevel ?? row.fraudRiskLevelClaim,
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
        anomalies: z.array(z.union([
          z.string(),
          z.object({
            description: z.string().optional(),
            is_critical: z.boolean().optional(),
            type: z.string().optional(),
          }),
        ])).nullable().optional(),
        fraud_risk_level: z.string().nullable().optional(),
        fraud_flagged: z.boolean().nullable().optional(),
        critical_fraud_flag_count: z.number().int().min(0).nullable().optional(),
        is_high_value: z.boolean().nullable().optional(),
        assessor_validated: z.boolean().nullable().optional(),
        claim_reference: z.string().nullable().optional(),
        cost_escalated: z.boolean().nullable().optional(),
        physics_inconsistency: z.boolean().nullable().optional(),
        damage_inconsistent: z.boolean().nullable().optional(),
      })
    )
    .query(({ input }) => {
      return routeClaimEngine(input as EscalationInput);
    }),

  // ── routeClaimById ─────────────────────────────────────────────────────────
  routeClaimById: protectedProcedure
    .input(z.object({ claimId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await drizzle
        .select({
          recommendation: aiAssessments.recommendation,
          confidenceScore: aiAssessments.confidenceScore,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          fraudRiskScore: aiAssessments.fraudRiskScore,
          anomalyFlagsJson: aiAssessments.anomalyFlagsJson,
          estimatedCost: aiAssessments.estimatedCost,
          finalApprovedAmount: claims.finalApprovedAmount,
          claimRef: claims.id,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(eq(aiAssessments.claimId, input.claimId))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(1);
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No assessment found for this claim" });
      const row = rows[0];
      let rec: "APPROVE" | "REVIEW" | "REJECT" = "REVIEW";
      const recRaw = (row.recommendation ?? "").toUpperCase();
      if (recRaw === "APPROVE" || recRaw === "REJECT" || recRaw === "REVIEW") rec = recRaw as typeof rec;
      let anomalies: string[] = [];
      try {
        const parsed = typeof row.anomalyFlagsJson === "string"
          ? JSON.parse(row.anomalyFlagsJson as string)
          : row.anomalyFlagsJson;
        if (Array.isArray(parsed)) anomalies = parsed.map((a: unknown) => String(a));
      } catch { /* ignore */ }
      const estimatedCost = row.finalApprovedAmount != null
        ? Number(row.finalApprovedAmount)
        : row.estimatedCost != null ? Number(row.estimatedCost) : null;
      const HIGH_VALUE_THRESHOLD = 50000;
      const escalationInput: EscalationInput = {
        recommendation: rec,
        confidence: row.confidenceScore,
        anomalies,
        fraud_risk_level: row.fraudRiskLevel ?? null,
        fraud_flagged: row.fraudRiskScore != null && Number(row.fraudRiskScore) >= 70,
        is_high_value: estimatedCost != null && estimatedCost >= HIGH_VALUE_THRESHOLD,
        claim_reference: `CLM-${row.claimRef}`,
      };
      return routeClaimEngine(escalationInput);
    }),

  // ── getEscalationSummary ───────────────────────────────────────────────────
  getEscalationSummary: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ input }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const limit = input?.limit ?? 100;
      const rows = await drizzle
        .select({
          recommendation: aiAssessments.recommendation,
          confidenceScore: aiAssessments.confidenceScore,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          fraudRiskScore: aiAssessments.fraudRiskScore,
          anomalyFlagsJson: aiAssessments.anomalyFlagsJson,
          estimatedCost: aiAssessments.estimatedCost,
          finalApprovedAmount: claims.finalApprovedAmount,
          claimId: aiAssessments.claimId,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .orderBy(desc(aiAssessments.createdAt))
        .limit(limit);
      const batchItems = rows.map((row) => {
        let rec: "APPROVE" | "REVIEW" | "REJECT" = "REVIEW";
        const recRaw = (row.recommendation ?? "").toUpperCase();
        if (recRaw === "APPROVE" || recRaw === "REJECT" || recRaw === "REVIEW") rec = recRaw as typeof rec;
        let anomalies: string[] = [];
        try {
          const parsed = typeof row.anomalyFlagsJson === "string"
            ? JSON.parse(row.anomalyFlagsJson as string)
            : row.anomalyFlagsJson;
          if (Array.isArray(parsed)) anomalies = parsed.map((a: unknown) => String(a));
        } catch { /* ignore */ }
        const estimatedCost = row.finalApprovedAmount != null
          ? Number(row.finalApprovedAmount)
          : row.estimatedCost != null ? Number(row.estimatedCost) : null;
        const escalationInput: EscalationInput = {
          recommendation: rec,
          confidence: row.confidenceScore,
          anomalies,
          fraud_risk_level: row.fraudRiskLevel ?? null,
          fraud_flagged: row.fraudRiskScore != null && Number(row.fraudRiskScore) >= 70,
          is_high_value: estimatedCost != null && estimatedCost >= 50000,
          claim_reference: `CLM-${row.claimId}`,
        };
        return { claim_id: row.claimId ?? 0, input: escalationInput };
      });
      const batchResults = routeClaimBatchEngine(batchItems);
      return aggregateEscalationStats(batchResults);
    }),
});
