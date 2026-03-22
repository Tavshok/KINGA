/**
 * learning.ts — tRPC router for Phase 3 Learning and Calibration Engine.
 *
 * Exposes:
 *  - learning.getCostPatternAnalysis  — run Cost Pattern Analysis Engine over stored validated outcomes
 *  - learning.getLearningStats        — summary stats for the learning dataset
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { aiAssessments, claims } from "../../drizzle/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import {
  analyseCostPatterns,
  buildLearningRecord,
  type ClaimLearningRecord,
} from "../pipeline-v2/costPatternAnalysisEngine";
import {
  analyseFraudPatterns,
  buildFraudLearningRecord,
  type FraudLearningRecord,
} from "../pipeline-v2/fraudPatternLearningEngine";

// ─── Router ───────────────────────────────────────────────────────────────────

export const learningRouter = router({
  /**
   * Run the Cost Pattern Analysis Engine over all validated learning outcomes.
   *
   * Optional filters:
   *  - scenario_filter: restrict to a specific incident type
   *  - signature_prefix: restrict to claims whose case_signature starts with this prefix
   *  - min_quality_tier: "HIGH" | "MEDIUM" | "LOW" (default: no filter)
   *  - top_n: number of top cost drivers to return (default: 5)
   *  - min_frequency: minimum number of claims a component must appear in (default: 2)
   */
  getCostPatternAnalysis: protectedProcedure
    .input(
      z.object({
        scenario_filter: z.string().optional(),
        signature_prefix: z.string().optional(),
        min_quality_tier: z.enum(["HIGH", "MEDIUM"]).optional(),
        top_n: z.number().int().min(1).max(20).optional(),
        min_frequency: z.number().int().min(1).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // 1. Fetch all assessments that have a validatedOutcomeJson and partsReconciliationJson
      const drizzle = await getDb();
      if (!drizzle) return { high_cost_drivers: [], component_weighting: {}, insights: [], metadata: null, total_stored_records: 0 };
      const rows = await drizzle
        .select({
          claimId: aiAssessments.claimId,
          partsReconciliationJson: aiAssessments.partsReconciliationJson,
          caseSignatureJson: aiAssessments.caseSignatureJson,
          validatedOutcomeJson: aiAssessments.validatedOutcomeJson,
          // From the joined claims table
          incidentType: claims.incidentType,
          finalApprovedAmount: claims.finalApprovedAmount,
          estimatedClaimValue: claims.estimatedClaimValue,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(
          and(
            isNotNull(aiAssessments.validatedOutcomeJson),
            isNotNull(aiAssessments.partsReconciliationJson)
          )
        )
        .limit(5000); // safety cap — analysis is in-memory

      // 2. Build ClaimLearningRecord objects (filters out store=false automatically)
      const learningRecords: ClaimLearningRecord[] = [];
      for (const row of rows) {
        const totalCost =
          row.finalApprovedAmount != null
            ? parseFloat(String(row.finalApprovedAmount))
            : row.estimatedClaimValue != null
            ? parseFloat(String(row.estimatedClaimValue))
            : 0;

        const record = buildLearningRecord(
          row.claimId,
          totalCost,
          row.partsReconciliationJson,
          row.caseSignatureJson,
          row.validatedOutcomeJson,
          row.incidentType ?? undefined
        );

        if (record) {
          learningRecords.push(record);
        }
      }

      // 3. Run the analysis engine with the requested filters
      const result = analyseCostPatterns({
        claims: learningRecords,
        scenario_filter: input.scenario_filter,
        signature_prefix: input.signature_prefix,
        min_quality_tier: (input.min_quality_tier ?? null) as "HIGH" | "MEDIUM" | null,
        top_n: input.top_n,
        min_frequency: input.min_frequency,
      });

      return {
        ...result,
        // Include the raw record count before filtering for UI display
        total_stored_records: learningRecords.length,
      };
    }),

  /**
   * Run the Fraud Pattern Learning Engine over all validated learning outcomes.
   *
   * Returns:
   *  - emerging_patterns: repeated fraud behaviours appearing in recent data
   *  - high_risk_indicators: flags with high precision (low false positive rate)
   *  - false_positive_patterns: flags that were flagged but later cleared by assessors
   */
  getFraudPatternAnalysis: protectedProcedure
    .input(
      z.object({
        scenario_filter: z.string().optional(),
        min_frequency: z.number().int().min(1).optional(),
        min_precision: z.number().min(0).max(1).optional(),
        emerging_window_days: z.number().int().min(1).max(365).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle)
        return {
          emerging_patterns: [],
          high_risk_indicators: [],
          false_positive_patterns: [],
          metadata: null,
          total_stored_records: 0,
        };

      // Fetch all assessments with fraud breakdown and validated outcome
      const rows = await drizzle
        .select({
          claimId: aiAssessments.claimId,
          fraudScoreBreakdownJson: aiAssessments.fraudScoreBreakdownJson,
          validatedOutcomeJson: aiAssessments.validatedOutcomeJson,
          caseSignatureJson: aiAssessments.caseSignatureJson,
          incidentType: claims.incidentType,
          fraudRiskLevel: claims.fraudRiskLevel,
          createdAt: aiAssessments.createdAt,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(
          and(
            isNotNull(aiAssessments.validatedOutcomeJson),
            isNotNull(aiAssessments.fraudScoreBreakdownJson)
          )
        )
        .limit(5000);

      // Build FraudLearningRecord objects
      const learningRecords: FraudLearningRecord[] = [];
      for (const row of rows) {
        // Map fraudRiskLevel to the engine's expected outcome string.
        // "high" risk level = likely fraud (confirmed_fraud proxy);
        // "low" = cleared proxy; "medium" = unresolved.
        // In production, a dedicated assessor_outcome field would be used.
        const outcome =
          row.fraudRiskLevel === "high"
            ? "confirmed_fraud"
            : row.fraudRiskLevel === "low"
            ? "cleared"
            : "unresolved";

        const record = buildFraudLearningRecord(
          row.claimId,
          row.incidentType ?? "unknown",
          row.fraudScoreBreakdownJson,
          row.validatedOutcomeJson,
          outcome
        );

        if (record) {
          // Attach timestamp from createdAt if available
          // createdAt is a string in this schema (mode: 'string')
          record.timestamp_ms =
            row.createdAt
              ? new Date(row.createdAt).getTime()
              : null;
          learningRecords.push(record);
        }
      }

      // Run the fraud pattern analysis
      const result = analyseFraudPatterns({
        records: learningRecords,
        scenario_filter: input.scenario_filter ?? null,
        min_frequency: input.min_frequency,
        min_precision: input.min_precision,
        emerging_window_days: input.emerging_window_days,
      });

      return {
        ...result,
        total_stored_records: learningRecords.length,
      };
    }),

  /**
   * Return summary statistics for the learning dataset.
   * Useful for the dashboard to show dataset health at a glance.
   */
  getLearningStats: protectedProcedure.query(async ({ ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) return { total_stored: 0, total_not_stored: 0, by_quality_tier: { HIGH: 0, MEDIUM: 0, LOW: 0 }, by_scenario: {}, dataset_health: "INSUFFICIENT" as const, recommendation: "Database unavailable." };
      const rows = await drizzle
      .select({
        validatedOutcomeJson: aiAssessments.validatedOutcomeJson,
        incidentType: claims.incidentType,
      })
      .from(aiAssessments)
      .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
      .where(isNotNull(aiAssessments.validatedOutcomeJson))
      .limit(10000);

    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let notStoredCount = 0;
    const scenarioCounts: Record<string, number> = {};

    for (const row of rows) {
      let outcome: { store: boolean; quality_tier: string } | null = null;
      try {
        const raw = row.validatedOutcomeJson;
        outcome = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        continue;
      }

      if (!outcome?.store) {
        notStoredCount++;
        continue;
      }

      const tier = outcome.quality_tier;
      if (tier === "HIGH") highCount++;
      else if (tier === "MEDIUM") mediumCount++;
      else lowCount++;

      const scenario = row.incidentType ?? "unknown";
      scenarioCounts[scenario] = (scenarioCounts[scenario] ?? 0) + 1;
    }

    const totalStored = highCount + mediumCount + lowCount;

    return {
      total_stored: totalStored,
      total_not_stored: notStoredCount,
      by_quality_tier: {
        HIGH: highCount,
        MEDIUM: mediumCount,
        LOW: lowCount,
      },
      by_scenario: scenarioCounts,
      dataset_health:
        totalStored >= 100
          ? "GOOD"
          : totalStored >= 20
          ? "BUILDING"
          : "INSUFFICIENT",
      recommendation:
        totalStored < 20
          ? "Fewer than 20 validated outcomes stored. Ensure assessors are reviewing and confirming claims to build the learning dataset."
          : totalStored < 100
          ? "Dataset is building. Cost pattern analysis results will improve as more HIGH-quality outcomes are stored."
          : "Dataset is sufficient for reliable cost pattern analysis.",
    };
  }),
});
