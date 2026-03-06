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
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { crossClaimSignals, claims } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { runCrossClaimIntelligence } from "../cross-claim-intelligence";

export const crossClaimIntelligenceRouter = router({
  /**
   * Fetch all cross-claim signals for a specific claim.
   */
  getByClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(crossClaimSignals)
        .where(eq(crossClaimSignals.claimId, input.claimId))
        .orderBy(desc(crossClaimSignals.scoreContribution));
    }),

  /**
   * Real-time fraud feed: most recent undismissed signals across all claims.
   * Used by the fraud operations dashboard.
   */
  getFraudFeed: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [sql`is_dismissed = 0`];
      if (input.tenantId) conditions.push(eq(crossClaimSignals.tenantId, input.tenantId));
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(crossClaimSignals.signalType, input.signalType)];
      if (input.tenantId) conditions.push(eq(crossClaimSignals.tenantId, input.tenantId));

      return db
        .select()
        .from(crossClaimSignals)
        .where(and(...conditions))
        .orderBy(desc(crossClaimSignals.createdAt))
        .limit(input.limit);
    }),

  /**
   * Global cross-claim intelligence stats for the executive dashboard.
   */
  getStats: protectedProcedure
    .input(z.object({ tenantId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const conditions = input.tenantId
        ? [eq(crossClaimSignals.tenantId, input.tenantId)]
        : [];

      // Overall counts
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

      // Breakdown by signal type
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

      // Recent trend (last 30 days vs prior 30 days)
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
   */
  dismissSignal: protectedProcedure
    .input(z.object({
      signalId: z.number(),
      dismissalNote: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

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
   * Manually trigger the cross-claim intelligence engine for a specific claim.
   * Useful for re-running after new data is available or for testing.
   */
  runForClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      // Fetch claim context
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
        .where(eq(claims.id, input.claimId))
        .limit(1);

      if (!claim) throw new Error(`Claim ${input.claimId} not found`);

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
