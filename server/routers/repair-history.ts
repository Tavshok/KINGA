/**
 * Repair Intelligence Memory — tRPC Router
 * ─────────────────────────────────────────
 * Procedures:
 *   repairHistory.getByClaim          — all repairs for a specific claim
 *   repairHistory.getByRepairer       — all repairs for a panel beater
 *   repairHistory.getByVehicle        — all repairs for a vehicle
 *   repairHistory.getRepairerStats    — performance stats for a panel beater
 *   repairHistory.getLeaderboard      — ranked panel beater performance list
 *   repairHistory.getFraudFlagged     — repairs with active fraud signals
 *   repairHistory.getRepeatDamage     — repairs flagged for repeat damage
 *   repairHistory.markRepairComplete  — backfill repair date and recompute score
 *   repairHistory.getStats            — global repair intelligence stats
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  repairHistory,
  panelBeaters,
} from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  getRepairHistoryByClaim,
  getRepairHistoryByRepairer,
  getRepairHistoryByVehicle,
  updateRepairCompletion,
  updateRepairerAggregates,
} from "../repair-history";

export const repairHistoryRouter = router({
  /**
   * Fetch all repair records for a specific claim.
   */
  getByClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ input }) => {
      return getRepairHistoryByClaim(input.claimId);
    }),

  /**
   * Fetch repair history for a specific panel beater.
   */
  getByRepairer: protectedProcedure
    .input(z.object({
      repairerId: z.number(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      return getRepairHistoryByRepairer(input.repairerId, input.limit);
    }),

  /**
   * Fetch repair history for a specific vehicle.
   */
  getByVehicle: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      return getRepairHistoryByVehicle(input.vehicleId, input.limit);
    }),

  /**
   * Get aggregated performance stats for a specific panel beater.
   * Returns both the live panel_beaters aggregate columns and a
   * breakdown of recent repairs.
   */
  getRepairerStats: protectedProcedure
    .input(z.object({ repairerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [repairer] = await db
        .select()
        .from(panelBeaters)
        .where(eq(panelBeaters.id, input.repairerId))
        .limit(1);

      if (!repairer) return null;

      // Recent 10 repairs for sparkline data
      const recentRepairs = await getRepairHistoryByRepairer(input.repairerId, 10);

      // Monthly breakdown (last 12 months)
      const monthlyBreakdown = await db
        .select({
          month: sql<string>`DATE_FORMAT(created_at, '%Y-%m')`,
          repairCount: sql<number>`COUNT(*)`,
          avgQualityScore: sql<number>`AVG(repair_quality_score)`,
          totalCostCents: sql<number>`SUM(repair_cost_cents)`,
          fraudCount: sql<number>`SUM(is_fraud_flagged)`,
        })
        .from(repairHistory)
        .where(
          and(
            eq(repairHistory.repairerId, input.repairerId),
            sql`created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`
          )
        )
        .groupBy(sql`DATE_FORMAT(created_at, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(created_at, '%Y-%m') DESC`)
        .limit(12);

      return {
        repairer,
        recentRepairs,
        monthlyBreakdown,
      };
    }),

  /**
   * Ranked leaderboard of panel beaters by quality score.
   * Returns top N repairers with their performance tier and key metrics.
   */
  getLeaderboard: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      minRepairs: z.number().min(0).default(1),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: panelBeaters.id,
          businessName: panelBeaters.businessName,
          name: panelBeaters.name,
          city: panelBeaters.city,
          totalRepairs: panelBeaters.totalRepairs,
          avgQualityScore: panelBeaters.avgQualityScore,
          avgCostRatio: panelBeaters.avgCostRatio,
          avgRepairDurationDays: panelBeaters.avgRepairDurationDays,
          repeatDamageRatePct: panelBeaters.repeatDamageRatePct,
          warrantyRepairCount: panelBeaters.warrantyRepairCount,
          fraudFlagCount: panelBeaters.fraudFlagCount,
          performanceTier: panelBeaters.performanceTier,
          lastRepairDate: panelBeaters.lastRepairDate,
          performanceUpdatedAt: panelBeaters.performanceUpdatedAt,
        })
        .from(panelBeaters)
        .where(sql`total_repairs >= ${input.minRepairs}`)
        .orderBy(desc(panelBeaters.avgQualityScore))
        .limit(input.limit);
    }),

  /**
   * Repairs with active fraud signals (warranty re-repairs, repeat damage, etc.)
   */
  getFraudFlagged: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      tenantId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [sql`is_fraud_flagged = 1`];
      if (input.tenantId) {
        conditions.push(eq(repairHistory.tenantId, input.tenantId));
      }

      return db
        .select()
        .from(repairHistory)
        .where(and(...conditions))
        .orderBy(desc(repairHistory.createdAt))
        .limit(input.limit);
    }),

  /**
   * Repairs flagged for repeat damage within 12 months.
   */
  getRepeatDamage: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      tenantId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [sql`repeat_damage_within_12_months = 1`];
      if (input.tenantId) {
        conditions.push(eq(repairHistory.tenantId, input.tenantId));
      }

      return db
        .select()
        .from(repairHistory)
        .where(and(...conditions))
        .orderBy(desc(repairHistory.createdAt))
        .limit(input.limit);
    }),

  /**
   * Backfill repair completion date and recompute quality score.
   * Called when a repair is physically completed.
   */
  markRepairComplete: protectedProcedure
    .input(z.object({
      repairHistoryId: z.number(),
      repairDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    }))
    .mutation(async ({ input }) => {
      await updateRepairCompletion({
        repairHistoryId: input.repairHistoryId,
        repairDate: input.repairDate,
      });

      // Re-fetch to get the repairerId for aggregate update
      const db = await getDb();
      if (db) {
        const [record] = await db
          .select({ repairerId: repairHistory.repairerId })
          .from(repairHistory)
          .where(eq(repairHistory.id, input.repairHistoryId))
          .limit(1);
        if (record) {
          await updateRepairerAggregates(record.repairerId);
        }
      }

      return { success: true };
    }),

  /**
   * Global repair intelligence stats for the executive dashboard.
   */
  getStats: protectedProcedure
    .input(z.object({ tenantId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const conditions = input.tenantId
        ? [eq(repairHistory.tenantId, input.tenantId)]
        : [];

      const [stats] = await db
        .select({
          totalRepairs: sql<number>`COUNT(*)`,
          avgQualityScore: sql<number>`AVG(repair_quality_score)`,
          avgCostRatio: sql<number>`AVG(repair_cost_ratio)`,
          avgRepairDurationDays: sql<number>`AVG(repair_duration_days)`,
          totalRepairCostCents: sql<number>`SUM(repair_cost_cents)`,
          fraudFlaggedCount: sql<number>`SUM(is_fraud_flagged)`,
          repeatDamageCount: sql<number>`SUM(repeat_damage_within_12_months)`,
          warrantyRepairCount: sql<number>`SUM(is_warranty_repair)`,
          uniqueRepairers: sql<number>`COUNT(DISTINCT repairer_id)`,
          uniqueVehicles: sql<number>`COUNT(DISTINCT vehicle_id)`,
        })
        .from(repairHistory)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Tier distribution
      const tierDist = await db
        .select({
          tier: panelBeaters.performanceTier,
          count: sql<number>`COUNT(*)`,
        })
        .from(panelBeaters)
        .where(sql`total_repairs > 0`)
        .groupBy(panelBeaters.performanceTier);

      return { stats, tierDistribution: tierDist };
    }),
});
