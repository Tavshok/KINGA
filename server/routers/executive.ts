import { router, insurerDomainProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";

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
});
