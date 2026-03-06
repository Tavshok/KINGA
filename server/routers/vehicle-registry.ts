/**
 * Vehicle Intelligence Registry — tRPC Router
 * Procedures:
 *   vehicleRegistry.getById         — fetch a single vehicle record
 *   vehicleRegistry.findByVinOrReg  — look up by VIN or registration
 *   vehicleRegistry.getClaimHistory — all claims linked to a vehicle
 *   vehicleRegistry.list            — paginated list sorted by risk score
 *   vehicleRegistry.listHighRisk    — vehicles above a risk threshold
 *   vehicleRegistry.stats           — aggregate stats for the dashboard
 *   vehicleRegistry.setFlag         — manually set isSalvageTitle/isStolen/isWrittenOff
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getVehicleRegistryById,
  findVehicleRegistry,
  getVehicleClaimHistory,
  listVehicleRegistry,
  listHighRiskVehicles,
  normaliseVin,
  normaliseRegistration,
  computeVehicleRiskScore,
} from "../vehicle-registry";
import { getDb } from "../db";
import { vehicleRegistry } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

export const vehicleRegistryRouter = router({
  /** Get a vehicle registry record by its internal ID. */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const record = await getVehicleRegistryById(input.id);
      if (!record) return null;
      // Tenant isolation
      if (record.tenantId && record.tenantId !== ctx.user.tenantId) return null;
      return record;
    }),

  /** Find a vehicle by VIN or registration number. */
  findByVinOrReg: protectedProcedure
    .input(
      z.object({
        vin: z.string().optional(),
        registration: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const record = await findVehicleRegistry(input.vin, input.registration);
      if (!record) return null;
      if (record.tenantId && record.tenantId !== ctx.user.tenantId) return null;
      return record;
    }),

  /** Get all claims linked to a vehicle registry record. */
  getClaimHistory: protectedProcedure
    .input(z.object({ vehicleRegistryId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return getVehicleClaimHistory(input.vehicleRegistryId, ctx.user.tenantId ?? undefined);
    }),

  /** Paginated list of all vehicles, sorted by risk score descending. */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      return listVehicleRegistry(ctx.user.tenantId ?? undefined, input.limit, input.offset);
    }),

  /** Vehicles with risk score above a threshold. */
  listHighRisk: protectedProcedure
    .input(
      z.object({
        minRiskScore: z.number().int().min(0).max(100).default(25),
      })
    )
    .query(async ({ input, ctx }) => {
      return listHighRiskVehicles(ctx.user.tenantId ?? undefined, input.minRiskScore);
    }),

  /** Dashboard aggregate stats. */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const tenantId = ctx.user.tenantId;

    const baseWhere = tenantId
      ? sql`tenant_id = ${tenantId}`
      : sql`1=1`;

    const [totalRow] = await db.execute(
      sql`SELECT
            COUNT(*) AS total,
            SUM(is_repeat_claimer) AS repeatClaimers,
            SUM(has_suspicious_damage_pattern) AS suspiciousPattern,
            SUM(is_salvage_title) AS salvageTitles,
            SUM(is_stolen) AS stolenVehicles,
            SUM(is_written_off) AS writtenOff,
            AVG(vehicle_risk_score) AS avgRiskScore,
            SUM(total_claims_count) AS totalClaimsLinked,
            SUM(total_repair_cost_cents) AS totalRepairCostCents
          FROM vehicle_registry
          WHERE ${baseWhere}`
    ) as any;

    const row = Array.isArray(totalRow) ? totalRow[0] : totalRow;
    return {
      total: Number(row?.total ?? 0),
      repeatClaimers: Number(row?.repeatClaimers ?? 0),
      suspiciousPattern: Number(row?.suspiciousPattern ?? 0),
      salvageTitles: Number(row?.salvageTitles ?? 0),
      stolenVehicles: Number(row?.stolenVehicles ?? 0),
      writtenOff: Number(row?.writtenOff ?? 0),
      avgRiskScore: Math.round(Number(row?.avgRiskScore ?? 0)),
      totalClaimsLinked: Number(row?.totalClaimsLinked ?? 0),
      totalRepairCostCents: Number(row?.totalRepairCostCents ?? 0),
    };
  }),

  /** Manually set a risk flag on a vehicle record (assessor override). */
  setFlag: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        flag: z.enum(["isSalvageTitle", "isStolen", "isWrittenOff"]),
        value: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const record = await getVehicleRegistryById(input.id);
      if (!record) throw new Error("Vehicle not found");
      if (record.tenantId && record.tenantId !== ctx.user.tenantId) {
        throw new Error("Access denied");
      }

      const flagMap: Record<string, keyof typeof vehicleRegistry.$inferSelect> = {
        isSalvageTitle: "isSalvageTitle",
        isStolen: "isStolen",
        isWrittenOff: "isWrittenOff",
      };

      const col = flagMap[input.flag];
      const newVal = input.value ? 1 : 0;

      // Recompute risk score with the new flag
      const newRiskScore = computeVehicleRiskScore({
        totalClaimsCount: record.totalClaimsCount,
        hasSuspiciousDamagePattern: record.hasSuspiciousDamagePattern === 1,
        isSalvageTitle:
          input.flag === "isSalvageTitle" ? input.value : record.isSalvageTitle === 1,
        isStolen: input.flag === "isStolen" ? input.value : record.isStolen === 1,
        isWrittenOff: input.flag === "isWrittenOff" ? input.value : record.isWrittenOff === 1,
      });

      await db
        .update(vehicleRegistry)
        .set({
          [col]: newVal,
          vehicleRiskScore: newRiskScore,
          updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        })
        .where(eq(vehicleRegistry.id, input.id));

      return { success: true, newRiskScore };
    }),
});
