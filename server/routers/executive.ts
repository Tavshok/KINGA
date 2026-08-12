import { router, insurerDomainProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql, eq, and, desc, gt } from "drizzle-orm";
import { claims } from "../../drizzle/schema";
import { FINANCIAL_APPROVAL_THRESHOLD_CENTS } from "../../shared/const";
import { auditP0CrossTenantAccess, resolveP0TenantScope, validateP0TenantScope } from "../security/p0TenantBoundary";

const daysSince = (d: string | null) => {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
};

/**
 * Executive Router
 *
 * All procedures use insurerDomainProcedure which guarantees:
 * - ctx.insurerTenantId is always a non-null string
 * - Every SQL query filters by this tenant ID
 * - Cross-tenant access is structurally impossible
 */

// Additional role guard for executive-level access within the insurer tenant
const executiveProcedure = insurerDomainProcedure.use(async ({ ctx, next }) => {
  const allowedRoles = ["admin", "executive", "risk_manager", "claims_manager", "insurer_admin", "platform_super_admin"];
  const userRole = (ctx.user as any).insurerRole || ctx.user.role;
  if (!allowedRoles.includes(userRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Executive access required" });
  }
  return next({ ctx });
});

export const executiveRouter = router({
  // ─── Existing procedures ────────────────────────────────────────────────────

  /**
   * Authoritative operational detail for the Executive Dashboard drill-down.
   *
   * A claim identifier selects an object; it never establishes access. The query
   * always combines that identifier with the session-derived tenant predicate.
   * Missing values remain null and are rendered by the client as unavailable.
   */
  getOperationalClaimDetail: executiveProcedure
    .input(z.object({
      claimId: z.number().int().positive().optional(),
      filter: z.enum(["all", "high_fraud", "overridden"]).default("all"),
      tenantId: z.string().min(1).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const scope = resolveP0TenantScope(ctx as any, input.tenantId, "executive operational detail");
      await validateP0TenantScope(scope);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const requestedClaim = input.claimId ? sql`AND c.id = ${input.claimId}` : sql``;
      const requestedFilter = input.filter === "high_fraud"
        ? sql`AND c.fraud_risk_score >= 70`
        : input.filter === "overridden"
          ? sql`AND EXISTS (
              SELECT 1 FROM workflow_audit_trail wat
              WHERE wat.claim_id = c.id AND wat.executive_override = 1
            )`
          : sql``;

      if (scope.isCrossTenant) {
        await auditP0CrossTenantAccess(
          ctx as any,
          scope,
          "executive_operational_detail",
          input.claimId ? String(input.claimId) : `filter:${input.filter}`,
          { filter: input.filter },
        );
      }

      const result = await db.execute(sql`
        SELECT
          c.id,
          c.claim_number AS claimNumber,
          c.status,
          c.workflow_state AS workflowState,
          c.incident_type AS incidentType,
          c.created_at AS createdAt,
          c.total_claim_amount AS totalClaimAmount,
          c.approved_amount AS approvedAmount,
          c.fraud_risk_score AS fraudRiskScore,
          c.fraud_risk_level AS fraudRiskLevel
        FROM claims c
        WHERE c.tenant_id = ${scope.tenantId}
          ${requestedClaim}
          ${requestedFilter}
        ORDER BY c.created_at DESC
        LIMIT 25
      `) as any;

      const claimRows = (result.rows ?? []) as Array<Record<string, unknown>>;
      if (input.claimId && claimRows.length === 0) {
        return {
          state: "unavailable" as const,
          reason: "No authorised claim detail is available for the requested record.",
          claims: [],
          workflowHistory: [],
          overrideHistory: [],
        };
      }

      const claimIds = claimRows.map(row => Number(row.id)).filter(Number.isFinite);
      if (claimIds.length === 0) {
        return {
          state: "unavailable" as const,
          reason: "No authorised operational claim records are available for this view.",
          claims: [],
          workflowHistory: [],
          overrideHistory: [],
        };
      }

      const historyResult = await db.execute(sql`
        SELECT
          wat.claim_id AS claimId,
          wat.created_at AS createdAt,
          wat.previous_state AS previousState,
          wat.new_state AS newState,
          wat.user_role AS userRole,
          wat.executive_override AS executiveOverride,
          wat.override_reason AS overrideReason
        FROM workflow_audit_trail wat
        INNER JOIN claims c ON c.id = wat.claim_id
        WHERE c.tenant_id = ${scope.tenantId}
          AND wat.claim_id IN (${sql.join(claimIds.map(id => sql`${id}`), sql`, `)})
        ORDER BY wat.created_at DESC
        LIMIT 100
      `) as any;

      const historyRows = (historyResult.rows ?? []) as Array<Record<string, unknown>>;
      const workflowHistory = historyRows.filter(row => Number(row.executiveOverride ?? 0) !== 1);
      const overrideHistory = historyRows.filter(row => Number(row.executiveOverride ?? 0) === 1);

      return {
        state: "available" as const,
        reason: null,
        claims: claimRows.map(row => ({
          id: Number(row.id),
          claimNumber: row.claimNumber ?? null,
          status: row.status ?? null,
          workflowState: row.workflowState ?? null,
          incidentType: row.incidentType ?? null,
          createdAt: row.createdAt ?? null,
          totalClaimAmount: row.totalClaimAmount == null ? null : Number(row.totalClaimAmount),
          approvedAmount: row.approvedAmount == null ? null : Number(row.approvedAmount),
          fraudRiskScore: row.fraudRiskScore == null ? null : Number(row.fraudRiskScore),
          fraudRiskLevel: row.fraudRiskLevel ?? null,
        })),
        workflowHistory,
        overrideHistory,
      };
    }),

  getClaimsVolumeOverTime: executiveProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { data: [], success: false };
        const { insurerTenantId } = ctx;  // guaranteed non-null
        const since = new Date();
        since.setDate(since.getDate() - input.days);
        const rows = await (db.execute(sql`
          SELECT DATE(created_at) as date, COUNT(*) as count
          FROM claims
          WHERE created_at >= ${since.toISOString()}
            AND tenant_id = ${insurerTenantId}
          GROUP BY DATE(created_at)
          ORDER BY date ASC
        `) as any);
        return { data: rows.rows as any[], success: true };
      } catch (e) {
        return { data: [], success: false };
      }
    }),

  getFraudDetectionTrends: executiveProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { data: [], success: false };
        const { insurerTenantId } = ctx;
        const since = new Date();
        since.setDate(since.getDate() - input.days);
        const rows = await (db.execute(sql`
          SELECT DATE(c.created_at) as date,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN ai.fraud_risk_level = 'medium' THEN 1 ELSE 0 END) as medium,
            SUM(CASE WHEN ai.fraud_risk_level = 'low' THEN 1 ELSE 0 END) as low
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE c.created_at >= ${since.toISOString()}
            AND c.tenant_id = ${insurerTenantId}
          GROUP BY DATE(c.created_at)
          ORDER BY date ASC
        `) as any);
        return { data: rows.rows as any[], success: true };
      } catch (e) {
        return { data: [], success: false };
      }
    }),

  getCostBreakdownByStatus: executiveProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { data: [], success: false };
        const { insurerTenantId } = ctx;
        const rows = await (db.execute(sql`
          SELECT status, COUNT(*) as count,
            AVG(approved_amount) as avg_amount,
            SUM(approved_amount) as total_amount
          FROM claims
          WHERE tenant_id = ${insurerTenantId}
          GROUP BY status
        `) as any);
        return { data: rows.rows as any[], success: true };
      } catch (e) {
        return { data: [], success: false };
      }
    }),

  getAverageProcessingTime: executiveProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { data: null, success: false };
        const { insurerTenantId } = ctx;
        const rows = await (db.execute(sql`
          SELECT
            AVG(CASE WHEN status = 'completed' AND closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, created_at, closed_at) ELSE NULL END) as avg_hours,
            AVG(CASE WHEN status = 'completed' AND closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(DAY, created_at, closed_at) ELSE NULL END) as avg_days
          FROM claims
          WHERE tenant_id = ${insurerTenantId}
        `) as any);
        return { data: (rows.rows[0] as any) || null, success: true };
      } catch (e) {
        return { data: null, success: false };
      }
    }),

  getFraudRiskDistribution: executiveProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { data: [], success: false };
        const { insurerTenantId } = ctx;
        const rows = await (db.execute(sql`
          SELECT ai.fraud_risk_level as level, COUNT(*) as count
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE ai.fraud_risk_level IS NOT NULL
            AND c.tenant_id = ${insurerTenantId}
          GROUP BY ai.fraud_risk_level
        `) as any);
        return { data: rows.rows as any[], success: true };
      } catch (e) {
        return { data: [], success: false };
      }
    }),

  // ─── NEW: Quote Optimisation & Override Analytics ───────────────────────────

  /**
   * getOverrideRate
   *
   * Returns the total number of completed optimisations for this tenant,
   * the number where the insurer overrode the AI recommendation
   * (insurerAcceptedRecommendation = 0), and the derived override percentage.
   *
   * A decision is only counted when insurerAcceptedRecommendation IS NOT NULL
   * (i.e. the insurer has actually recorded a decision).
   *
   * @returns {
   *   total_optimisations: number   — completed QOR rows for this tenant
   *   total_decisions:     number   — rows where a decision was recorded
   *   total_overrides:     number   — rows where accepted = 0
   *   override_percentage: number   — (overrides / decisions) * 100, or 0
   *   success:             boolean
   * }
   */
  getOverrideRate: executiveProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return {
          total_optimisations: 0, total_decisions: 0,
          total_overrides: 0, override_percentage: 0, success: false,
        };
        const { insurerTenantId } = ctx;
        const since = new Date();
        since.setDate(since.getDate() - input.days);
        const sinceISO = since.toISOString();

        const rows = await (db.execute(sql`
          SELECT
            COUNT(*)                                                        AS total_optimisations,
            SUM(CASE WHEN qor.insurer_accepted_recommendation IS NOT NULL
                     THEN 1 ELSE 0 END)                                    AS total_decisions,
            SUM(CASE WHEN qor.insurer_accepted_recommendation = 0
                     THEN 1 ELSE 0 END)                                    AS total_overrides
          FROM quote_optimisation_results qor
          INNER JOIN claims c ON c.id = qor.claim_id
          WHERE qor.status = 'completed'
            AND c.tenant_id = ${insurerTenantId}
            AND qor.created_at >= ${sinceISO}
        `) as any);

        const row = rows.rows[0] as any;
        const total_optimisations = Number(row?.total_optimisations ?? 0);
        const total_decisions     = Number(row?.total_decisions     ?? 0);
        const total_overrides     = Number(row?.total_overrides     ?? 0);
        const override_percentage = total_decisions > 0
          ? Math.round((total_overrides / total_decisions) * 10000) / 100
          : 0;

        return {
          total_optimisations,
          total_decisions,
          total_overrides,
          override_percentage,
          success: true,
        };
      } catch (e) {
        return {
          total_optimisations: 0, total_decisions: 0,
          total_overrides: 0, override_percentage: 0, success: false,
        };
      }
    }),

  /**
   * getMostOverriddenRepairers
   *
   * Groups completed optimisation results by the AI-recommended repairer
   * (recommended_profile_id / recommended_company_name) and counts how many
   * times the insurer overrode that recommendation.
   *
   * Only rows where the insurer recorded a decision (IS NOT NULL) are counted.
   * Returns up to 10 repairers ordered by override count descending.
   *
   * @returns {
   *   data: Array<{
   *     profile_id:     string
   *     company_name:   string
   *     total_recommended: number
   *     total_overrides:   number
   *     override_rate:     number   — percentage
   *   }>
   *   success: boolean
   * }
   */
  getMostOverriddenRepairers: executiveProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { data: [], success: false };
        const { insurerTenantId } = ctx;
        const since = new Date();
        since.setDate(since.getDate() - input.days);
        const sinceISO = since.toISOString();

        const rows = await (db.execute(sql`
          SELECT
            qor.recommended_profile_id                                              AS profile_id,
            COALESCE(qor.recommended_company_name, mp.company_name, 'Unknown')      AS company_name,
            COUNT(*)                                                                AS total_recommended,
            SUM(CASE WHEN qor.insurer_accepted_recommendation = 0 THEN 1 ELSE 0 END) AS total_overrides,
            ROUND(
              SUM(CASE WHEN qor.insurer_accepted_recommendation = 0 THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0) * 100,
            2)                                                                      AS override_rate
          FROM quote_optimisation_results qor
          INNER JOIN claims c ON c.id = qor.claim_id
          LEFT JOIN marketplace_profiles mp
            ON mp.id = qor.recommended_profile_id
          WHERE qor.status = 'completed'
            AND qor.insurer_accepted_recommendation IS NOT NULL
            AND c.tenant_id = ${insurerTenantId}
            AND qor.created_at >= ${sinceISO}
          GROUP BY qor.recommended_profile_id, company_name
          ORDER BY total_overrides DESC
          LIMIT 10
        `) as any);

        return {
          data: (rows.rows as any[]).map(r => ({
            profile_id:        r.profile_id        ?? null,
            company_name:      r.company_name      ?? "Unknown",
            total_recommended: Number(r.total_recommended ?? 0),
            total_overrides:   Number(r.total_overrides   ?? 0),
            override_rate:     Number(r.override_rate     ?? 0),
          })),
          success: true,
        };
      } catch (e) {
        return { data: [], success: false };
      }
    }),

  /**
   * getAverageCostDeltaOnOverride
   *
   * For every override (insurerAcceptedRecommendation = 0), computes the
   * difference between the accepted quote amount and the AI-recommended
   * quote amount, then returns the average delta across all overrides.
   *
   * Join strategy:
   *   - qor.recommended_profile_id  → marketplace_profiles.id → panel_beaters.marketplace_profile_id
   *     to find the AI-recommended panel_beater_quotes row
   *   - The accepted quote is the panel_beater_quotes row with status = 'accepted'
   *     for the same claim
   *
   * A positive delta means the insurer chose a more expensive repairer.
   * A negative delta means the insurer chose a cheaper repairer.
   *
   * @returns {
   *   avg_cost_delta_cents: number   — average (accepted - recommended) in cents
   *   avg_cost_delta_rands: number   — same value converted to rands (÷ 100)
   *   override_count:       number   — number of overrides with cost data
   *   success:              boolean
   * }
   */
  getAverageCostDeltaOnOverride: executiveProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return {
          avg_cost_delta_cents: 0, avg_cost_delta_rands: 0,
          override_count: 0, success: false,
        };
        const { insurerTenantId } = ctx;
        const since = new Date();
        since.setDate(since.getDate() - input.days);
        const sinceISO = since.toISOString();

        // We compute:
        //   accepted_cost  = MIN(quoted_amount) WHERE status = 'accepted' for the claim
        //                    (there should be exactly one accepted quote per claim)
        //   recommended_cost = quoted_amount of the panel_beater_quotes row whose
        //                      panel_beater_id matches the AI-recommended profile
        //
        // Since panel_beaters.marketplace_profile_id links to marketplace_profiles.id,
        // we join through panel_beaters to find the recommended quote.
        const rows = await (db.execute(sql`
          SELECT
            COUNT(*)                                            AS override_count,
            AVG(accepted_q.quoted_amount - rec_q.quoted_amount) AS avg_cost_delta_cents
          FROM quote_optimisation_results qor
          INNER JOIN claims c
            ON c.id = qor.claim_id
          -- Accepted quote for this claim
          INNER JOIN panel_beater_quotes accepted_q
            ON accepted_q.claim_id = qor.claim_id
           AND accepted_q.status   = 'accepted'
          -- Recommended quote: panel_beater whose marketplace_profile_id = qor.recommended_profile_id
          INNER JOIN panel_beaters pb_rec
            ON pb_rec.marketplace_profile_id = qor.recommended_profile_id
          INNER JOIN panel_beater_quotes rec_q
            ON rec_q.claim_id       = qor.claim_id
           AND rec_q.panel_beater_id = pb_rec.id
          WHERE qor.status                          = 'completed'
            AND qor.insurer_accepted_recommendation = 0
            AND c.tenant_id                         = ${insurerTenantId}
            AND qor.created_at                      >= ${sinceISO}
        `) as any);

        const row = rows.rows[0] as any;
        const override_count       = Number(row?.override_count       ?? 0);
        const avg_cost_delta_cents = Math.round(Number(row?.avg_cost_delta_cents ?? 0));
        const avg_cost_delta_rands = Math.round(avg_cost_delta_cents) / 100;

        return {
          avg_cost_delta_cents,
          avg_cost_delta_rands,
          override_count,
          success: true,
        };
      } catch (e) {
        return {
          avg_cost_delta_cents: 0, avg_cost_delta_rands: 0,
          override_count: 0, success: false,
        };
      }
    }),

  /**
   * getTotalAISavings
   *
   * Computes the total cost savings generated by the AI optimisation engine
   * for this tenant. A saving is realised when the insurer accepted the AI
   * recommendation (insurerAcceptedRecommendation = 1) and the accepted
   * quote is cheaper than the next-cheapest alternative.
   *
   * Saving per claim = (second_cheapest_quote - accepted_quote)
   *   where accepted_quote is the AI-recommended quote.
   *
   * Also returns the simpler aggregate:
   *   total_ai_savings_cents = SUM(second_cheapest - accepted) for accepted decisions
   *
   * @returns {
   *   total_ai_savings_cents: number
   *   total_ai_savings_rands: number
   *   accepted_count:         number   — claims where AI recommendation was accepted
   *   avg_saving_per_claim_cents: number
   *   avg_saving_per_claim_rands: number
   *   success: boolean
   * }
   */
  getTotalAISavings: executiveProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return {
          total_ai_savings_cents: 0, total_ai_savings_rands: 0,
          accepted_count: 0,
          avg_saving_per_claim_cents: 0, avg_saving_per_claim_rands: 0,
          success: false,
        };
        const { insurerTenantId } = ctx;
        const since = new Date();
        since.setDate(since.getDate() - input.days);
        const sinceISO = since.toISOString();

        // For each accepted-recommendation claim:
        //   saving = (min quote for claim that is NOT the accepted quote) - accepted_quote
        //   i.e. how much cheaper the AI choice was vs the next option
        //
        // We use a subquery to get the second-cheapest quote per claim.
        const rows = await (db.execute(sql`
          SELECT
            COUNT(*)                                                AS accepted_count,
            SUM(
              COALESCE(alt.min_other_quote, rec_q.quoted_amount)
              - rec_q.quoted_amount
            )                                                       AS total_ai_savings_cents,
            AVG(
              COALESCE(alt.min_other_quote, rec_q.quoted_amount)
              - rec_q.quoted_amount
            )                                                       AS avg_saving_per_claim_cents
          FROM quote_optimisation_results qor
          INNER JOIN claims c
            ON c.id = qor.claim_id
          -- Recommended (accepted) quote
          INNER JOIN panel_beaters pb_rec
            ON pb_rec.marketplace_profile_id = qor.recommended_profile_id
          INNER JOIN panel_beater_quotes rec_q
            ON rec_q.claim_id        = qor.claim_id
           AND rec_q.panel_beater_id = pb_rec.id
          -- Cheapest alternative quote (not the recommended panel beater)
          LEFT JOIN (
            SELECT claim_id, MIN(quoted_amount) AS min_other_quote
            FROM panel_beater_quotes
            WHERE status != 'rejected'
            GROUP BY claim_id, panel_beater_id
          ) alt
            ON alt.claim_id = qor.claim_id
           AND alt.min_other_quote > rec_q.quoted_amount
          WHERE qor.status                          = 'completed'
            AND qor.insurer_accepted_recommendation = 1
            AND c.tenant_id                         = ${insurerTenantId}
            AND qor.created_at                      >= ${sinceISO}
        `) as any);

        const row = rows.rows[0] as any;
        const accepted_count               = Number(row?.accepted_count               ?? 0);
        const total_ai_savings_cents       = Math.max(0, Math.round(Number(row?.total_ai_savings_cents       ?? 0)));
        const avg_saving_per_claim_cents   = Math.max(0, Math.round(Number(row?.avg_saving_per_claim_cents   ?? 0)));
        const total_ai_savings_rands       = total_ai_savings_cents     / 100;
        const avg_saving_per_claim_rands   = avg_saving_per_claim_cents / 100;

        return {
          total_ai_savings_cents,
          total_ai_savings_rands,
          accepted_count,
          avg_saving_per_claim_cents,
          avg_saving_per_claim_rands,
          success: true,
        };
      } catch (e) {
        return {
          total_ai_savings_cents: 0, total_ai_savings_rands: 0,
          accepted_count: 0,
          avg_saving_per_claim_cents: 0, avg_saving_per_claim_rands: 0,
          success: false,
        };
      }
    }),

  /**
   * Escalation Queue
   *
   * Returns claims in `financial_decision` state that exceed the executive
   * financial threshold (ZAR 25,000 / 2,500,000 cents). These require
   * executive sign-off before settlement can proceed.
   * Sorted by amount descending so the highest-value claim appears first.
   */
  getEscalationQueue: executiveProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const rows = await db
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        totalClaimAmount: (claims as any).totalClaimAmount,
        approvedAmount: (claims as any).approvedAmount,
        fraudRiskLevel: claims.fraudRiskLevel,
        fraudRiskScore: claims.fraudRiskScore,
        priority: claims.priority,
        vehicleRegistration: claims.vehicleRegistration,
        workflowState: claims.workflowState,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
      })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          eq(claims.workflowState as any, "financial_decision"),
          gt((claims as any).totalClaimAmount, FINANCIAL_APPROVAL_THRESHOLD_CENTS)
        )
      )
      .orderBy(desc((claims as any).totalClaimAmount))
      .limit(20);

    return {
      threshold: FINANCIAL_APPROVAL_THRESHOLD_CENTS,
      count: rows.length,
      totalExposure: rows.reduce((s, r) => s + ((r.totalClaimAmount as number) ?? 0), 0),
      items: rows.map(r => ({
        id: r.id,
        claimNumber: r.claimNumber,
        amount: (r.totalClaimAmount as number) ?? 0,
        approvedAmount: (r.approvedAmount as number) ?? null,
        fraudRiskLevel: r.fraudRiskLevel,
        fraudRiskScore: r.fraudRiskScore,
        priority: r.priority,
        vehicleRegistration: r.vehicleRegistration,
        ageDays: daysSince(r.createdAt),
        updatedAt: r.updatedAt,
      })),
    };
  }),
});
