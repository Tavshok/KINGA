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
import {
  detectCalibrationDrift,
  buildDriftRecord,
} from "../pipeline-v2/calibrationDriftDetector";

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
   * Run the Calibration Drift Detector over validated outcomes.
   *
   * Compares AI-predicted cost and severity against actual validated values.
   * Returns drift_detected, drift_areas, severity, and recommendation.
   */
  getCalibrationDrift: protectedProcedure
    .input(
      z.object({
        scenario_filter: z.string().optional(),
        cost_drift_threshold: z.number().min(0).max(1).optional(),
        severity_mismatch_threshold: z.number().min(0).max(1).optional(),
        continuous_drift_window_count: z.number().int().min(1).optional(),
        window_size_days: z.number().int().min(1).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const drizzle = await getDb();
      if (!drizzle) {
        return {
          drift_detected: false,
          drift_areas: [],
          severity: "LOW" as const,
          recommendation: "Database unavailable.",
          statistics: {
            total_records: 0,
            records_with_cost_drift: 0,
            records_with_severity_mismatch: 0,
            mean_cost_error_pct: 0,
            median_cost_error_pct: 0,
            mean_absolute_error_usd: 0,
            over_estimate_count: 0,
            under_estimate_count: 0,
            severity_mismatch_rate: 0,
            severity_confusion: {
              minor_predicted_as_moderate: 0,
              minor_predicted_as_severe: 0,
              moderate_predicted_as_minor: 0,
              moderate_predicted_as_severe: 0,
              severe_predicted_as_minor: 0,
              severe_predicted_as_moderate: 0,
              correct: 0,
            },
            by_scenario: {},
            windows_analysed: 0,
            continuous_drift_detected: false,
          },
          metadata: {
            records_analysed: 0,
            scenario_filter: input.scenario_filter ?? null,
            cost_drift_threshold: input.cost_drift_threshold ?? 0.20,
            severity_mismatch_threshold: input.severity_mismatch_threshold ?? 0.20,
            continuous_drift_window_count: input.continuous_drift_window_count ?? 3,
            window_size_days: input.window_size_days ?? 30,
            analysis_timestamp_ms: Date.now(),
          },
        };
      }

      // Fetch assessments with cost predictions and validated outcomes
      const rows = await drizzle
        .select({
          claimId: aiAssessments.claimId,
          estimatedCost: aiAssessments.estimatedCost,
          validatedOutcomeJson: aiAssessments.validatedOutcomeJson,
          fraudRiskLevel: claims.fraudRiskLevel,
          incidentType: claims.incidentType,
          finalApprovedAmount: claims.finalApprovedAmount,
          createdAt: aiAssessments.createdAt,
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(
          and(
            isNotNull(aiAssessments.validatedOutcomeJson),
            isNotNull(aiAssessments.estimatedCost)
          )
        )
        .limit(5000);

      const driftRecords = [];
      for (const row of rows) {
        // Parse validated outcome for severity and quality tier
        let validatedOutcome: {
          quality_tier?: string;
          store?: boolean;
          ai_severity?: string;
          actual_severity?: string;
        } | null = null;
        try {
          const raw = row.validatedOutcomeJson;
          validatedOutcome = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          continue;
        }

        if (!validatedOutcome?.store) continue;

        // Use finalApprovedAmount as the actual cost (best available validated cost)
        const actualCost = row.finalApprovedAmount ? parseFloat(String(row.finalApprovedAmount)) : null;
        const aiCost = row.estimatedCost ?? null;

        // Map fraudRiskLevel to severity proxy
        // In production, a dedicated severity field from the validated outcome would be used
        const aiSeverity = validatedOutcome.ai_severity ?? (
          row.fraudRiskLevel === "high" ? "severe" :
          row.fraudRiskLevel === "medium" ? "moderate" : "minor"
        );
        const actualSeverity = validatedOutcome.actual_severity ?? (
          row.fraudRiskLevel === "high" ? "severe" :
          row.fraudRiskLevel === "medium" ? "moderate" : "minor"
        );

        const record = buildDriftRecord(
          row.claimId,
          row.incidentType ?? "unknown",
          aiCost,
          actualCost,
          aiSeverity,
          actualSeverity,
          row.createdAt ? new Date(row.createdAt).getTime() : null,
          (validatedOutcome.quality_tier as "HIGH" | "MEDIUM" | "LOW" | null) ?? null
        );

        if (record) driftRecords.push(record);
      }

      return detectCalibrationDrift({
        records: driftRecords,
        scenario_filter: input.scenario_filter ?? null,
        cost_drift_threshold: input.cost_drift_threshold ?? null,
        severity_mismatch_threshold: input.severity_mismatch_threshold ?? null,
        continuous_drift_window_count: input.continuous_drift_window_count ?? null,
        window_size_days: input.window_size_days ?? null,
      });
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
