/**
 * Cross-Claim Intelligence — tRPC Router
 * ─────────────────────────────────────────
 * Procedures:
 *   crossClaim.getByClaim        — all signals for a specific claim
 *   crossClaim.getFraudFeed      — recent undismissed signals across all claims
 *   crossClaim.getBySignalType   — all signals of a specific type
 *   crossClaim.getStats          — global signal stats for the dashboard
 *   crossClaim.dismissSignal     — assessor dismisses a false-positive signal
 *   crossClaim.runForClaim       — manually trigger the engine for a claim
 *   crossClaim.getTopEntities    — top entities by signal count
 *
 * Tenant Isolation Model (Batch 2 — 2026-08-04)
 * ───────────────────────────────────────────────
 * All procedures enforce tenant scoping via resolveTenantScope():
 *   - Non-admin users: ctx.user.tenantId is MANDATORY; null → FORBIDDEN (fails closed)
 *   - Non-admin users: input.tenantId is IGNORED to prevent caller-supplied scope override
 *   - platform_super_admin: may omit tenantId for cross-tenant view (logged to tenant_isolation_violations)
 *   - platform_super_admin: may supply explicit input.tenantId to scope to a specific tenant
 *
 * This matches the pattern established in insurerDomainProcedure (server/_core/trpc.ts).
 * Will be refactored to use the shared requireTenantScope middleware in Ticket 2.3.
 */

import { z } from "zod";
import { router, protectedProcedure, requireTenantScope, logTenantIsolationViolation, extractIp } from "../_core/trpc";
import { getDb } from "../db";
import { crossClaimSignals, claims } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { runCrossClaimIntelligence } from "../cross-claim-intelligence";
import { TRPCError } from "@trpc/server";

// resolveTenantScope is the shared requireTenantScope from server/_core/trpc.ts
// See Ticket 2.3 — Batch 2 tenant isolation
const resolveTenantScope = requireTenantScope;

export const crossClaimIntelligenceRouter = router({
  /**
   * Fetch all cross-claim signals for a specific claim.
   * Tenant isolation: enforces session tenantId on the crossClaimSignals row.
   */
  getByClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const tenantId = resolveTenantScope(ctx, undefined, 'crossClaim.getByClaim');

      const conditions: ReturnType<typeof eq>[] = [
        eq(crossClaimSignals.claimId, input.claimId),
      ];
      if (tenantId) {
        conditions.push(eq(crossClaimSignals.tenantId, tenantId));
      }

      return db
        .select()
        .from(crossClaimSignals)
        .where(and(...conditions))
        .orderBy(desc(crossClaimSignals.scoreContribution));
    }),

  /**
   * Real-time fraud feed: most recent undismissed signals across all claims.
   * Tenant isolation: session tenantId is mandatory for non-admin; input.tenantId ignored.
   */
  getFraudFeed: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      // tenantId input is accepted for platform_super_admin scoping only;
      // non-admin callers cannot override their session tenant via this field.
      tenantId: z.string().optional(),
      confidenceFilter: z.enum(['low', 'medium', 'high']).optional(),
      signalTypeFilter: z.enum([
        'repeat_damage_signal',
        'driver_repeat_claim_signal',
        'repairer_repeat_pattern_signal',
        'vehicle_high_claim_frequency',
        'damage_zone_repeat_signal',
        'staged_accident_signal',
        'repairer_driver_collusion_signal',
        'claim_velocity_signal',
        'total_loss_repeat_signal',
      ]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const isSuperAdmin = ctx.user.role === 'platform_super_admin';
      const tenantId = resolveTenantScope(
        ctx,
        isSuperAdmin ? input.tenantId : undefined,
        'crossClaim.getFraudFeed'
      );

      const conditions: any[] = [sql`is_dismissed = 0`];
      if (tenantId) conditions.push(eq(crossClaimSignals.tenantId, tenantId));
      if (input.confidenceFilter) conditions.push(eq(crossClaimSignals.confidence, input.confidenceFilter));
      if (input.signalTypeFilter) conditions.push(eq(crossClaimSignals.signalType, input.signalTypeFilter));

      return db
        .select()
        .from(crossClaimSignals)
        .where(and(...conditions))
        .orderBy(desc(crossClaimSignals.createdAt))
        .limit(input.limit);
    }),

  /**
   * Fetch all signals of a specific type across all claims.
   * Tenant isolation: session tenantId is mandatory for non-admin.
   */
  getBySignalType: protectedProcedure
    .input(z.object({
      signalType: z.enum([
        'repeat_damage_signal',
        'driver_repeat_claim_signal',
        'repairer_repeat_pattern_signal',
        'vehicle_high_claim_frequency',
        'damage_zone_repeat_signal',
        'staged_accident_signal',
        'repairer_driver_collusion_signal',
        'claim_velocity_signal',
        'total_loss_repeat_signal',
      ]),
      limit: z.number().min(1).max(200).default(50),
      tenantId: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const isSuperAdmin = ctx.user.role === 'platform_super_admin';
      const tenantId = resolveTenantScope(
        ctx,
        isSuperAdmin ? input.tenantId : undefined,
        'crossClaim.getBySignalType'
      );

      const conditions: any[] = [eq(crossClaimSignals.signalType, input.signalType)];
      if (tenantId) conditions.push(eq(crossClaimSignals.tenantId, tenantId));

      return db
        .select()
        .from(crossClaimSignals)
        .where(and(...conditions))
        .orderBy(desc(crossClaimSignals.createdAt))
        .limit(input.limit);
    }),

  /**
   * Global cross-claim intelligence stats for the executive dashboard.
   * Tenant isolation: session tenantId is mandatory for non-admin.
   */
  getStats: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const isSuperAdmin = ctx.user.role === 'platform_super_admin';
      const tenantId = resolveTenantScope(
        ctx,
        isSuperAdmin ? input.tenantId : undefined,
        'crossClaim.getStats'
      );

      const conditions = tenantId
        ? [eq(crossClaimSignals.tenantId, tenantId)]
        : [];

      const [totals] = await db
        .select({
          totalSignals: sql<number>`COUNT(*)`,
          undismissedSignals: sql<number>`SUM(CASE WHEN is_dismissed = 0 THEN 1 ELSE 0 END)`,
          dismissedSignals: sql<number>`SUM(CASE WHEN is_dismissed = 1 THEN 1 ELSE 0 END)`,
          highConfidenceSignals: sql<number>`SUM(CASE WHEN confidence = 'high' THEN 1 ELSE 0 END)`,
          mediumConfidenceSignals: sql<number>`SUM(CASE WHEN confidence = 'medium' THEN 1 ELSE 0 END)`,
          lowConfidenceSignals: sql<number>`SUM(CASE WHEN confidence = 'low' THEN 1 ELSE 0 END)`,
          totalScoreContribution: sql<number>`SUM(score_contribution)`,
          claimsWithSignals: sql<number>`COUNT(DISTINCT claim_id)`,
        })
        .from(crossClaimSignals)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const byType = await db
        .select({
          signalType: crossClaimSignals.signalType,
          count: sql<number>`COUNT(*)`,
          avgScoreContribution: sql<number>`AVG(score_contribution)`,
          highConfidenceCount: sql<number>`SUM(CASE WHEN confidence = 'high' THEN 1 ELSE 0 END)`,
        })
        .from(crossClaimSignals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(crossClaimSignals.signalType)
        .orderBy(desc(sql`COUNT(*)`));

      const [recentTrend] = await db
        .select({
          last30Days: sql<number>`SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END)`,
          prior30Days: sql<number>`SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END)`,
        })
        .from(crossClaimSignals)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return { totals, byType, recentTrend };
    }),

  /**
   * Assessor dismisses a signal as a false positive.
   * Tenant isolation: verifies the signal belongs to the caller's tenant before updating.
   */
  dismissSignal: protectedProcedure
    .input(z.object({
      signalId: z.number(),
      dismissalNote: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      const tenantId = resolveTenantScope(ctx, undefined, 'crossClaim.dismissSignal');

      // Verify ownership before mutating — prevents cross-tenant dismissal
      const whereConditions = tenantId
        ? and(eq(crossClaimSignals.id, input.signalId), eq(crossClaimSignals.tenantId, tenantId))
        : eq(crossClaimSignals.id, input.signalId);

      const [existing] = await db
        .select({ id: crossClaimSignals.id })
        .from(crossClaimSignals)
        .where(whereConditions)
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Signal not found or access denied.',
        });
      }

      await db
        .update(crossClaimSignals)
        .set({
          isDismissed: 1,
          dismissedBy: ctx.user.id,
          dismissedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          dismissalNote: input.dismissalNote || null,
          updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        })
        .where(eq(crossClaimSignals.id, input.signalId));

      return { success: true };
    }),

  /**
   * Get Top Entities — returns the most frequently appearing entities (vehicles, drivers)
   * across cross-claim signals. Used by the Cross-Claim Intelligence panel.
   * Tenant isolation: session tenantId is mandatory for non-admin.
   */
  getTopEntities: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
      entityType: z.enum(['vehicle', 'driver', 'repairer', 'all']).default('all'),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { vehicles: [], drivers: [], repairers: [], summary: { totalSignals: 0, highConfidence: 0, dismissed: 0 } };

      const isSuperAdmin = ctx.user.role === 'platform_super_admin';
      const tenantId = resolveTenantScope(
        ctx,
        isSuperAdmin ? input.tenantId : undefined,
        'crossClaim.getTopEntities'
      );

      // Build tenant filter for raw SQL queries
      const tf = tenantId ? `ccs.tenant_id = ${JSON.stringify(tenantId)}` : '1=1';

      // Summary stats
      const summaryResult = await db.execute(sql`
        SELECT
          COUNT(*) as total_signals,
          SUM(CASE WHEN ccs.confidence = 'high' THEN 1 ELSE 0 END) as high_confidence,
          SUM(CASE WHEN ccs.is_dismissed = 1 THEN 1 ELSE 0 END) as dismissed
        FROM cross_claim_signals ccs
        WHERE ${sql.raw(tf)}
      `);
      const _sumRows = (summaryResult as any)[0];
      const sumRow = (Array.isArray(_sumRows) ? _sumRows[0] : _sumRows) as any;

      // Top vehicles by signal count
      const vehicleRows = (input.entityType === 'all' || input.entityType === 'vehicle') ? await db.execute(sql`
        SELECT
          c.vehicle_registration as entity_value,
          c.vehicle_make,
          c.vehicle_model,
          COUNT(DISTINCT ccs.id) as signal_count,
          COUNT(DISTINCT ccs.claim_id) as claim_count,
          MAX(ccs.score_contribution) as max_score,
          SUM(CASE WHEN ccs.confidence = 'high' THEN 1 ELSE 0 END) as high_conf_count
        FROM cross_claim_signals ccs
        INNER JOIN claims c ON ccs.claim_id = c.id
        WHERE ${sql.raw(tf)} AND ccs.is_dismissed = 0 AND c.vehicle_registration IS NOT NULL
        GROUP BY c.vehicle_registration, c.vehicle_make, c.vehicle_model
        ORDER BY signal_count DESC
        LIMIT ${sql.raw(String(input.limit))}
      `) : null;

      // Top drivers by signal count
      const driverRows = (input.entityType === 'all' || input.entityType === 'driver') ? await db.execute(sql`
        SELECT
          c.driver_name as entity_value,
          COUNT(DISTINCT ccs.id) as signal_count,
          COUNT(DISTINCT ccs.claim_id) as claim_count,
          MAX(ccs.score_contribution) as max_score,
          SUM(CASE WHEN ccs.confidence = 'high' THEN 1 ELSE 0 END) as high_conf_count
        FROM cross_claim_signals ccs
        INNER JOIN claims c ON ccs.claim_id = c.id
        WHERE ${sql.raw(tf)} AND ccs.is_dismissed = 0 AND c.driver_name IS NOT NULL
        GROUP BY c.driver_name
        ORDER BY signal_count DESC
        LIMIT ${sql.raw(String(input.limit))}
      `) : null;

      const parseRows = (result: any) => {
        if (!result) return [];
        const _rows = (result as any)[0];
        return (Array.isArray(_rows) ? _rows : []) as any[];
      };

      const vehicles = parseRows(vehicleRows).map((r: any) => ({
        entityValue: String(r.entity_value ?? ''),
        make: r.vehicle_make ?? null,
        model: r.vehicle_model ?? null,
        signalCount: Number(r.signal_count ?? 0),
        claimCount: Number(r.claim_count ?? 0),
        maxScore: Number(r.max_score ?? 0),
        highConfCount: Number(r.high_conf_count ?? 0),
        type: 'vehicle' as const,
      }));

      const drivers = parseRows(driverRows).map((r: any) => ({
        entityValue: String(r.entity_value ?? ''),
        make: null,
        model: null,
        signalCount: Number(r.signal_count ?? 0),
        claimCount: Number(r.claim_count ?? 0),
        maxScore: Number(r.max_score ?? 0),
        highConfCount: Number(r.high_conf_count ?? 0),
        type: 'driver' as const,
      }));

      return {
        vehicles,
        drivers,
        repairers: [],
        summary: {
          totalSignals: Number(sumRow?.total_signals ?? 0),
          highConfidence: Number(sumRow?.high_confidence ?? 0),
          dismissed: Number(sumRow?.dismissed ?? 0),
        },
      };
    }),

  /**
   * Manually trigger the cross-claim intelligence engine for a specific claim.
   * Tenant isolation: claim lookup is scoped to session tenantId.
   */
  runForClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      const tenantId = resolveTenantScope(ctx, undefined, 'crossClaim.runForClaim');

      // Fetch claim context — scoped to tenant to prevent cross-tenant engine triggers
      const claimConditions = tenantId
        ? and(eq(claims.id, input.claimId), eq(claims.tenantId, tenantId))
        : eq(claims.id, input.claimId);

      const [claim] = await db
        .select({
          vehicleRegistryId: claims.vehicleRegistryId,
          driverRegistryId: claims.driverRegistryId,
          claimantId: claims.claimantId,
          tenantId: claims.tenantId,
          createdAt: claims.createdAt,
          incidentDate: claims.incidentDate,
        })
        .from(claims)
        .where(claimConditions)
        .limit(1);

      if (!claim) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Claim ${input.claimId} not found or access denied.`,
        });
      }

      const result = await runCrossClaimIntelligence({
        claimId: input.claimId,
        vehicleRegistryId: claim.vehicleRegistryId ?? null,
        driverRegistryId: claim.driverRegistryId ?? null,
        claimantId: claim.claimantId ?? null,
        tenantId: claim.tenantId ?? null,
        claimCreatedAt: claim.createdAt ?? null,
        incidentDate: claim.incidentDate ?? null,
      });

      return {
        success: true,
        signalsDetected: result.signals.length,
        totalScoreContribution: result.totalScoreContribution,
        highestConfidence: result.highestConfidence,
        signals: result.signals,
      };
    }),
});
