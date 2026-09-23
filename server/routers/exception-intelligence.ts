/**
 * exception-intelligence.ts
 *
 * Phase 5B — Exception Intelligence Hub + System Drift Monitor
 *
 * Provides:
 *   - getExceptionQueue: categorised list of claims in exception state
 *   - getExceptionAggregates: aggregated analytics (% in exception, top causes, insurer/region breakdown)
 *   - getSystemDriftReport: P0-B1-held fraud-sensitive drift surface
 *   - getActionableRecommendations: deterministic recommendations from DRM attribution patterns
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { aiAssessments, claims } from "../../drizzle/schema";
import { eq, and, desc, gte, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";

// ─── Exception category definitions ──────────────────────────────────────────

export type ExceptionCategory =
  | "GATED_LOW_FCDI"
  | "GATED_LOW_INPUT"
  | "ALL_DISQUALIFIED"
  | "MANUAL_REVIEW_REQUIRED"
  | "GATED_NO_QUOTES"
  | "FRAUD_ESCALATION"
  | "UNKNOWN";

const EXCEPTION_META: Record<ExceptionCategory, { label: string; meaning: string; severity: "critical" | "high" | "medium" }> = {
  GATED_LOW_FCDI: {
    label: "Insufficient Evidence Quality",
    meaning: "FCDI score fell below the minimum threshold for automated adjudication. Evidence quality must be improved before DOE can proceed.",
    severity: "high",
  },
  GATED_LOW_INPUT: {
    label: "Incomplete Input Data",
    meaning: "Required input fields were missing or could not be extracted. The claim cannot be adjudicated until data gaps are resolved.",
    severity: "high",
  },
  ALL_DISQUALIFIED: {
    label: "Economic Infeasibility",
    meaning: "All submitted quotes were disqualified by the DOE. Possible causes: fraud signals, benchmark deviation, or structural incompleteness.",
    severity: "critical",
  },
  MANUAL_REVIEW_REQUIRED: {
    label: "Ambiguity in Fraud or Damage",
    meaning: "The DOE could not produce a confident automated decision. Fraud signals or damage ambiguity require human assessor review.",
    severity: "medium",
  },
  GATED_NO_QUOTES: {
    label: "No Valid Quotes",
    meaning: "No panel beater quotes were available or all were structurally invalid. The claim cannot proceed to cost adjudication.",
    severity: "high",
  },
  FRAUD_ESCALATION: {
    label: "Fraud Escalation",
    meaning: "Fraud risk level is critical or elevated. The claim has been escalated for specialist review.",
    severity: "critical",
  },
  UNKNOWN: {
    label: "Unknown Exception",
    meaning: "The claim is in an exception state but the specific reason could not be determined.",
    severity: "medium",
  },
};

/**
 * Retains the legacy client response type while P0-B1 rejects every authorized
 * drift request with the canonical fraud hold. This type is not a payload and
 * does not permit the router to construct or publish drift conclusions.
 */
type P0HeldSystemDriftReportResponse = {
  windowDays: number;
  currentPeriodCount: number;
  previousPeriodCount: number;
  overallHealth: "stable" | "warning" | "critical";
  driftSummary: Array<{
    metric: string;
    current: number | string | null;
    previous: number | string | null;
    delta: number | null;
    severity: "stable" | "warning" | "critical";
    description: string;
    interpretation: string;
  }>;
  generatedAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyException(assessment: any): ExceptionCategory {
  // Parse DOE result if available
  let doeStatus: string | null = null;
  try {
    if (assessment.doeResultJson) {
      const doe = typeof assessment.doeResultJson === "string"
        ? JSON.parse(assessment.doeResultJson)
        : assessment.doeResultJson;
      doeStatus = doe?.status ?? null;
    }
  } catch { /* non-fatal */ }

  if (doeStatus === "GATED_LOW_FCDI") return "GATED_LOW_FCDI";
  if (doeStatus === "GATED_LOW_INPUT") return "GATED_LOW_INPUT";
  if (doeStatus === "ALL_DISQUALIFIED") return "ALL_DISQUALIFIED";
  if (doeStatus === "GATED_NO_QUOTES") return "GATED_NO_QUOTES";
  if (doeStatus === "MANUAL_REVIEW_REQUIRED") return "MANUAL_REVIEW_REQUIRED";

  // Fallback: classify by fraud risk level
  if (assessment.fraudRiskLevel === "critical" || assessment.fraudRiskLevel === "elevated") {
    return "FRAUD_ESCALATION";
  }

  // Fallback: classify by recommendation
  if (assessment.recommendation === "ESCALATE") return "FRAUD_ESCALATION";
  if (assessment.recommendation === "REVIEW") return "MANUAL_REVIEW_REQUIRED";

  return "UNKNOWN";
}

function isInException(assessment: any): boolean {
  // A claim is in exception if:
  // 1. DOE did not produce OPTIMISED status
  // 2. OR fraud risk is critical/elevated
  // 3. OR recommendation is ESCALATE
  let doeStatus: string | null = null;
  try {
    if (assessment.doeResultJson) {
      const doe = typeof assessment.doeResultJson === "string"
        ? JSON.parse(assessment.doeResultJson)
        : assessment.doeResultJson;
      doeStatus = doe?.status ?? null;
    }
  } catch { /* non-fatal */ }

  if (doeStatus && doeStatus !== "OPTIMISED" && doeStatus !== "NOT_RUN") return true;
  if (assessment.fraudRiskLevel === "critical" || assessment.fraudRiskLevel === "elevated") return true;
  if (assessment.recommendation === "ESCALATE") return true;
  return false;
}

function requireExceptionIntelligenceTenant(ctx: { user?: { tenantId?: string | null } | null }) {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const exceptionIntelligenceRouter = router({
  /**
   * Get paginated list of claims currently in exception state, with category and metadata.
   */
  getExceptionQueue: protectedProcedure
    .input(z.object({
      category: z.enum(["GATED_LOW_FCDI", "GATED_LOW_INPUT", "ALL_DISQUALIFIED", "MANUAL_REVIEW_REQUIRED", "GATED_NO_QUOTES", "FRAUD_ESCALATION", "UNKNOWN", "ALL"]).default("ALL"),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const tenantId = requireExceptionIntelligenceTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Fetch recent assessments
      const whereConditions = and(
        eq(aiAssessments.tenantId, tenantId),
        eq(claims.tenantId, tenantId),
        isNotNull(aiAssessments.recommendation),
      );

      const rows = await db
        .select({
          assessment: aiAssessments,
          claim: {
            id: claims.id,
            claimNumber: claims.claimNumber,
            vehicleMake: claims.vehicleMake,
            vehicleModel: claims.vehicleModel,
            tenantId: claims.tenantId,
            createdAt: claims.createdAt,
          },
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(whereConditions)
        .orderBy(desc(aiAssessments.createdAt))
        .limit(500); // fetch more than needed for client-side category filtering

      // Filter to exception claims only
      const exceptionRows = rows.filter(r => isInException(r.assessment));

      // Classify and filter by category
      const classified = exceptionRows.map(r => ({
        claimId: r.assessment.claimId,
        assessmentId: r.assessment.id,
        claimNumber: r.claim.claimNumber,
        vehicleMake: r.claim.vehicleMake,
        vehicleModel: r.claim.vehicleModel,
        tenantId: r.claim.tenantId,
        createdAt: r.assessment.createdAt,
        fcdiScore: r.assessment.fcdiScore,
        fraudRiskLevel: r.assessment.fraudRiskLevel,
        recommendation: r.assessment.recommendation,
        category: classifyException(r.assessment),
        categoryMeta: EXCEPTION_META[classifyException(r.assessment)],
      }));

      const filtered = input.category === "ALL"
        ? classified
        : classified.filter(c => c.category === input.category);

      return {
        total: filtered.length,
        items: filtered.slice(input.offset, input.offset + input.limit),
        categoryMeta: EXCEPTION_META,
      };
    }),

  /**
   * Aggregated exception analytics: % in exception, top causes, insurer-level breakdowns.
   */
  getExceptionAggregates: protectedProcedure
    .input(z.object({
      daysBack: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const tenantId = requireExceptionIntelligenceTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const since = new Date(Date.now() - input.daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

      const whereConditions = and(
        eq(aiAssessments.tenantId, tenantId),
        eq(claims.tenantId, tenantId),
        gte(aiAssessments.createdAt, since),
      );

      const rows = await db
        .select({
          assessment: aiAssessments,
          claim: {
            id: claims.id,
            tenantId: claims.tenantId,
          },
        })
        .from(aiAssessments)
        .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
        .where(whereConditions)
        .orderBy(desc(aiAssessments.createdAt))
        .limit(2000);

      const total = rows.length;
      const exceptionRows = rows.filter(r => isInException(r.assessment));
      const exceptionCount = exceptionRows.length;
      const exceptionPct = total > 0 ? Math.round((exceptionCount / total) * 100) : 0;

      // Category breakdown
      const categoryBreakdown: Record<string, number> = {};
      for (const r of exceptionRows) {
        const cat = classifyException(r.assessment);
        categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1;
      }

      // Top causes sorted by count
      const topCauses = Object.entries(categoryBreakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({
          category: category as ExceptionCategory,
          count,
          pct: exceptionCount > 0 ? Math.round((count / exceptionCount) * 100) : 0,
          meta: EXCEPTION_META[category as ExceptionCategory],
        }));

      // Insurer-level breakdown (by tenantId)
      const insurerBreakdown: Record<string, { total: number; exceptions: number; pct: number }> = {};
      for (const r of rows) {
        const tid = r.claim.tenantId ?? "unknown";
        if (!insurerBreakdown[tid]) insurerBreakdown[tid] = { total: 0, exceptions: 0, pct: 0 };
        insurerBreakdown[tid].total++;
        if (isInException(r.assessment)) insurerBreakdown[tid].exceptions++;
      }
      for (const tid of Object.keys(insurerBreakdown)) {
        const b = insurerBreakdown[tid];
        b.pct = b.total > 0 ? Math.round((b.exceptions / b.total) * 100) : 0;
      }

      // IFE attribution aggregation — which data gap types are most common
      const attributionCounts: Record<string, number> = {
        CLAIMANT_DEFICIENCY: 0,
        INSURER_DATA_GAP: 0,
        SYSTEM_EXTRACTION_FAILURE: 0,
        DOCUMENT_LIMITATION: 0,
      };
      for (const r of exceptionRows) {
        try {
          if (r.assessment.ifeResultJson) {
            const ife = typeof r.assessment.ifeResultJson === "string"
              ? JSON.parse(r.assessment.ifeResultJson as string)
              : r.assessment.ifeResultJson;
            const breakdown = ife?.attributionBreakdown ?? {};
            for (const [cls, count] of Object.entries(breakdown)) {
              if (cls in attributionCounts) {
                attributionCounts[cls] += (count as number) ?? 0;
              }
            }
          }
        } catch { /* non-fatal */ }
      }

      return {
        periodDays: input.daysBack,
        totalAssessments: total,
        exceptionCount,
        exceptionPct,
        topCauses,
        insurerBreakdown,
        attributionCounts,
        generatedAt: new Date().toISOString(),
      };
    }),

  /**
   * System Drift Monitor is fraud-sensitive because its legacy aggregate joins
   * stored fraud scores to derive threshold-capable drift conclusions. P0-B1
   * preserves session and tenant validation, then withholds the aggregate before
   * any database read until qualified fraud authority is defined.
   */
  getSystemDriftReport: protectedProcedure
    .input(z.object({
      windowDays: z.number().min(7).max(180).default(30),
    }))
    .query(async ({ ctx }): Promise<P0HeldSystemDriftReportResponse> => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      requireExceptionIntelligenceTenant(ctx);
      throwP0B1FraudDecisionHold();
    }),

  /**
   * Actionable recommendations derived from IFE attribution patterns.
   * Identifies systemic issues (e.g. insurer consistently missing a field)
   * and generates specific remediation recommendations.
   */
  getActionableRecommendations: protectedProcedure
    .input(z.object({
      daysBack: z.number().min(1).max(365).default(60),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const tenantId = requireExceptionIntelligenceTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const since = new Date(Date.now() - input.daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

      const whereConditions = and(
        eq(aiAssessments.tenantId, tenantId),
        gte(aiAssessments.createdAt, since),
        isNotNull(aiAssessments.ifeResultJson),
      );

      const rows = await db
        .select({
          ifeResultJson: aiAssessments.ifeResultJson,
          tenantId: aiAssessments.tenantId,
        })
        .from(aiAssessments)
        .where(whereConditions)
        .limit(1000);

      // Aggregate insurer gap fields
      const insurerGapFields: Record<string, number> = {};
      const systemFailureFields: Record<string, number> = {};
      const claimantGapFields: Record<string, number> = {};
      let totalWithIFE = 0;

      for (const r of rows) {
        try {
          const ife = typeof r.ifeResultJson === "string"
            ? JSON.parse(r.ifeResultJson as string)
            : r.ifeResultJson;
          if (!ife?.attributedGaps) continue;
          totalWithIFE++;
          for (const gap of ife.attributedGaps) {
            if (gap.attribution === "INSURER_DATA_GAP") {
              insurerGapFields[gap.field] = (insurerGapFields[gap.field] ?? 0) + 1;
            } else if (gap.attribution === "SYSTEM_EXTRACTION_FAILURE") {
              systemFailureFields[gap.field] = (systemFailureFields[gap.field] ?? 0) + 1;
            } else if (gap.attribution === "CLAIMANT_DEFICIENCY") {
              claimantGapFields[gap.field] = (claimantGapFields[gap.field] ?? 0) + 1;
            }
          }
        } catch { /* non-fatal */ }
      }

      const recommendations: Array<{
        type: "INSURER_ACTION" | "SYSTEM_ACTION" | "PROCESS_ACTION";
        priority: "critical" | "high" | "medium";
        title: string;
        detail: string;
        affectedField?: string;
        frequency: number;
        frequencyPct: number;
      }> = [];

      // Generate insurer gap recommendations
      for (const [field, count] of Object.entries(insurerGapFields).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        const pct = totalWithIFE > 0 ? Math.round((count / totalWithIFE) * 100) : 0;
        if (pct >= 10) {
          recommendations.push({
            type: "INSURER_ACTION",
            priority: pct >= 30 ? "critical" : pct >= 15 ? "high" : "medium",
            title: `Update policy intake form: make '${field}' mandatory`,
            detail: `The field '${field}' is missing from the insurer's own data record in ${pct}% of claims (${count} of ${totalWithIFE} assessed). This is an insurer-side data gap, not a claimant deficiency. Updating the policy intake form to require this field would eliminate this gap.`,
            affectedField: field,
            frequency: count,
            frequencyPct: pct,
          });
        }
      }

      // Generate system extraction recommendations
      for (const [field, count] of Object.entries(systemFailureFields).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
        const pct = totalWithIFE > 0 ? Math.round((count / totalWithIFE) * 100) : 0;
        if (pct >= 10) {
          recommendations.push({
            type: "SYSTEM_ACTION",
            priority: pct >= 25 ? "high" : "medium",
            title: `Improve extraction reliability for '${field}'`,
            detail: `KINGA failed to extract '${field}' in ${pct}% of claims (${count} of ${totalWithIFE}). The underlying documents likely contain this data but the extraction engine is not reliably capturing it. This is a system-side issue and should not affect claimant scoring.`,
            affectedField: field,
            frequency: count,
            frequencyPct: pct,
          });
        }
      }

      // Generate claimant process recommendations
      for (const [field, count] of Object.entries(claimantGapFields).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
        const pct = totalWithIFE > 0 ? Math.round((count / totalWithIFE) * 100) : 0;
        if (pct >= 20) {
          recommendations.push({
            type: "PROCESS_ACTION",
            priority: pct >= 40 ? "high" : "medium",
            title: `Add '${field}' to claimant submission checklist`,
            detail: `Claimants are consistently not providing '${field}' — missing in ${pct}% of claims. Adding this field to the submission checklist or making it a required upload would reduce this gap and improve FCDI scores.`,
            affectedField: field,
            frequency: count,
            frequencyPct: pct,
          });
        }
      }

      return {
        periodDays: input.daysBack,
        totalAssessedWithIFE: totalWithIFE,
        recommendations: recommendations.sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, medium: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }),
        generatedAt: new Date().toISOString(),
      };
    }),
});
