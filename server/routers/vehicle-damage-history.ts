/**
 * Vehicle Damage History — tRPC Router
 *
 * Procedures:
 *   vehicleDamageHistory.getByVehicle     — full history for a vehicle
 *   vehicleDamageHistory.getByClaim       — record(s) for a specific claim
 *   vehicleDamageHistory.getByZone        — cross-vehicle zone analysis
 *   vehicleDamageHistory.getRepeatZones   — all repeat-zone fraud signals
 *   vehicleDamageHistory.stats            — aggregate stats for the dashboard
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getDamageHistoryByVehicle,
  getDamageHistoryByClaim,
  getDamageHistoryByZone,
  getRepeatZoneRecords,
} from "../vehicle-damage-history";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const vehicleDamageHistoryRouter = router({
  /** Full damage history for a vehicle, ordered by most recent first. */
  getByVehicle: protectedProcedure
    .input(z.object({ vehicleId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return getDamageHistoryByVehicle(input.vehicleId, ctx.user.tenantId ?? undefined);
    }),

  /** Damage history record(s) for a specific claim. */
  getByClaim: protectedProcedure
    .input(z.object({ claimId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getDamageHistoryByClaim(input.claimId);
    }),

  /** Cross-vehicle analysis: all records for a given damage zone. */
  getByZone: protectedProcedure
    .input(
      z.object({
        zone: z.enum(["front", "rear", "left", "right", "roof", "undercarriage", "multiple", "unknown"]),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      return getDamageHistoryByZone(input.zone, ctx.user.tenantId ?? undefined, input.limit);
    }),

  /** All repeat-zone records — primary fraud signal feed. */
  getRepeatZones: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional())
    .query(async ({ input, ctx }) => {
      return getRepeatZoneRecords(ctx.user.tenantId ?? undefined, input?.limit ?? 100);
    }),

  /** Aggregate stats for the damage history dashboard widget. */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const tenantId = ctx.user.tenantId;
    const baseWhere = tenantId ? sql`tenant_id = ${tenantId}` : sql`1=1`;

    const [row] = await db.execute(
      sql`SELECT
            COUNT(*) AS total,
            SUM(is_repeat_zone) AS repeatZoneCount,
            SUM(has_structural_damage) AS structuralDamageCount,
            SUM(airbags_deployed) AS airbagsDeployedCount,
            AVG(fraud_risk_score) AS avgFraudScore,
            SUM(repair_cost_estimate_cents) AS totalEstimatedCents,
            SUM(actual_repair_cost_cents) AS totalActualCents,
            COUNT(DISTINCT vehicle_id) AS uniqueVehicles,
            SUM(CASE WHEN damage_zone = 'front' THEN 1 ELSE 0 END) AS frontCount,
            SUM(CASE WHEN damage_zone = 'rear' THEN 1 ELSE 0 END) AS rearCount,
            SUM(CASE WHEN damage_zone = 'left' THEN 1 ELSE 0 END) AS leftCount,
            SUM(CASE WHEN damage_zone = 'right' THEN 1 ELSE 0 END) AS rightCount,
            SUM(CASE WHEN damage_zone = 'roof' THEN 1 ELSE 0 END) AS roofCount,
            SUM(CASE WHEN damage_zone = 'undercarriage' THEN 1 ELSE 0 END) AS undercarriageCount,
            SUM(CASE WHEN damage_zone = 'multiple' THEN 1 ELSE 0 END) AS multipleCount,
            SUM(CASE WHEN severity = 'total_loss' THEN 1 ELSE 0 END) AS totalLossCount,
            SUM(CASE WHEN severity = 'severe' THEN 1 ELSE 0 END) AS severeCount
          FROM vehicle_damage_history
          WHERE ${baseWhere}`
    ) as any;

    const r = Array.isArray(row) ? row[0] : row;
    return {
      total: Number(r?.total ?? 0),
      repeatZoneCount: Number(r?.repeatZoneCount ?? 0),
      structuralDamageCount: Number(r?.structuralDamageCount ?? 0),
      airbagsDeployedCount: Number(r?.airbagsDeployedCount ?? 0),
      avgFraudScore: Math.round(Number(r?.avgFraudScore ?? 0)),
      totalEstimatedCents: Number(r?.totalEstimatedCents ?? 0),
      totalActualCents: Number(r?.totalActualCents ?? 0),
      uniqueVehicles: Number(r?.uniqueVehicles ?? 0),
      totalLossCount: Number(r?.totalLossCount ?? 0),
      severeCount: Number(r?.severeCount ?? 0),
      zoneDistribution: {
        front: Number(r?.frontCount ?? 0),
        rear: Number(r?.rearCount ?? 0),
        left: Number(r?.leftCount ?? 0),
        right: Number(r?.rightCount ?? 0),
        roof: Number(r?.roofCount ?? 0),
        undercarriage: Number(r?.undercarriageCount ?? 0),
        multiple: Number(r?.multipleCount ?? 0),
      },
    };
  }),
});
