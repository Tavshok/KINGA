/**
 * Repair Intelligence Memory — Helper Module
 * ──────────────────────────────────────────
 * Provides all business logic for the repair_history table:
 *   - insertRepairHistory()          — create a repair record on claim approval
 *   - updateRepairCompletion()       — backfill repair date and duration when repair is done
 *   - flagRepeatDamage()             — mark repeat damage within 12 months
 *   - computeRepairQualityScore()    — pure function, 0–100 score
 *   - computeCostDeviation()         — pure function, % deviation from AI estimate
 *   - computeComponentMatchScore()   — pure function, 0–100 match score
 *   - updateRepairerAggregates()     — roll up stats to panel_beaters table
 *   - getRepairHistoryByClaim()      — fetch all repairs for a claim
 *   - getRepairHistoryByRepairer()   — fetch all repairs for a repairer
 *   - getRepairHistoryByVehicle()    — fetch all repairs for a vehicle
 */

import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import {
  repairHistory,
  vehicleDamageHistory,
  panelBeaters,
  claims,
  type InsertRepairHistory,
} from "../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepairedComponent {
  name: string;
  zone?: string | null;
  partType?: "OEM" | "aftermarket" | "used" | "unknown" | null;
  laborHours?: number | null;
  partCostCents?: number | null;
  laborCostCents?: number | null;
}

export interface InsertRepairHistoryParams {
  repairerId: number;
  vehicleId?: number | null;
  claimId: number;
  componentsRepaired: RepairedComponent[];
  repairCostCents: number;
  labourCostCents?: number;
  partsCostCents?: number;
  aiEstimatedCostCents?: number;
  approvalDate?: string | null;
  repairDate?: string | null;
  tenantId?: string | null;
}

// ─── Pure analytics functions ─────────────────────────────────────────────────

/**
 * Compute % deviation of actual cost from AI estimate.
 * Positive = actual > estimate (over-run); negative = under-run.
 * Returns null if estimate is 0 (avoid division by zero).
 */
export function computeCostDeviation(
  actualCents: number,
  estimatedCents: number
): number | null {
  if (!estimatedCents || estimatedCents === 0) return null;
  return Math.round(((actualCents - estimatedCents) / estimatedCents) * 10000) / 100;
}

/**
 * Compute cost ratio (actual / estimated). Returns null if estimate is 0.
 */
export function computeCostRatio(
  actualCents: number,
  estimatedCents: number
): number | null {
  if (!estimatedCents || estimatedCents === 0) return null;
  return Math.round((actualCents / estimatedCents) * 1000) / 1000;
}

/**
 * Compute component match score (0–100).
 * Compares the number of repaired components against the number of
 * originally damaged components from the vehicle_damage_history record.
 *
 * 100 = exact match
 * <100 = fewer components repaired than damaged (scope reduction)
 * Capped at 100 (we don't penalise for repairing more than quoted)
 */
export function computeComponentMatchScore(
  repairedCount: number,
  damagedCount: number
): number {
  if (damagedCount === 0) return 100;
  const ratio = repairedCount / damagedCount;
  return Math.min(100, Math.round(ratio * 100));
}

/**
 * Compute repair quality score (0–100).
 *
 * Weights:
 *   - Component match score     40%
 *   - Cost deviation            30%  (0% deviation = 100 pts; ±50% = 0 pts)
 *   - Repair duration           20%  (≤7 days = 100; ≥30 days = 0)
 *   - Repeat damage penalty     10%  (no repeat = 100; repeat = 0)
 */
export function computeRepairQualityScore(params: {
  componentMatchScore: number;
  costDeviationPct: number | null;
  repairDurationDays: number | null;
  repeatDamageWithin12Months: boolean;
}): number {
  const { componentMatchScore, costDeviationPct, repairDurationDays, repeatDamageWithin12Months } = params;

  // Component match (40%)
  const componentScore = Math.min(100, Math.max(0, componentMatchScore));

  // Cost deviation (30%) — penalise both over and under-runs
  let costScore = 100;
  if (costDeviationPct !== null) {
    const absDev = Math.abs(costDeviationPct);
    // 0% deviation = 100; 50% deviation = 0; linear
    costScore = Math.max(0, Math.round(100 - absDev * 2));
  }

  // Repair duration (20%) — ≤7 days = 100; ≥30 days = 0; linear
  let durationScore = 100;
  if (repairDurationDays !== null) {
    if (repairDurationDays <= 7) {
      durationScore = 100;
    } else if (repairDurationDays >= 30) {
      durationScore = 0;
    } else {
      durationScore = Math.round(100 - ((repairDurationDays - 7) / 23) * 100);
    }
  }

  // Repeat damage penalty (10%)
  const repeatScore = repeatDamageWithin12Months ? 0 : 100;

  const total = Math.round(
    componentScore * 0.4 +
    costScore * 0.3 +
    durationScore * 0.2 +
    repeatScore * 0.1
  );

  return Math.min(100, Math.max(0, total));
}

/**
 * Derive performance tier from average quality score.
 * A ≥80, B 60–79, C 40–59, D <40
 */
export function derivePerformanceTier(avgQualityScore: number | null): string {
  if (avgQualityScore === null) return "unrated";
  if (avgQualityScore >= 80) return "A";
  if (avgQualityScore >= 60) return "B";
  if (avgQualityScore >= 40) return "C";
  return "D";
}

// ─── Database helpers ─────────────────────────────────────────────────────────

/**
 * Insert a repair_history record when a claim is approved and a panel beater
 * is selected. Also:
 *   - Links to vehicle_damage_history rows for the same vehicle/claim
 *   - Detects warranty re-repairs (same component, same repairer, <90 days)
 *   - Detects repeat damage (same component, same vehicle, <12 months)
 *   - Computes quality score, cost deviation, and cost ratio
 *   - Pushes fraud signals if warranted
 */
export async function insertRepairHistory(
  params: InsertRepairHistoryParams
): Promise<{ repairHistoryId: number | null; fraudSignals: string[] }> {
  const db = await getDb();
  if (!db) return { repairHistoryId: null, fraudSignals: [] };

  const fraudSignals: string[] = [];

  // ── Link to vehicle_damage_history ────────────────────────────────────────
  let damageHistoryIds: number[] = [];
  if (params.vehicleId) {
    const damageRows = await db
      .select({ id: vehicleDamageHistory.id })
      .from(vehicleDamageHistory)
      .where(
        and(
          eq(vehicleDamageHistory.vehicleId, params.vehicleId),
          eq(vehicleDamageHistory.claimId, params.claimId)
        )
      );
    damageHistoryIds = damageRows.map((r) => r.id);
  }

  // ── Get damaged component count from damage history ───────────────────────
  let damagedComponentCount = 0;
  if (damageHistoryIds.length > 0 && params.vehicleId) {
    const [damageRow] = await db
      .select({ damagedComponentsJson: vehicleDamageHistory.damagedComponentsJson })
      .from(vehicleDamageHistory)
      .where(
        and(
          eq(vehicleDamageHistory.vehicleId, params.vehicleId),
          eq(vehicleDamageHistory.claimId, params.claimId)
        )
      )
      .limit(1);
    if (damageRow?.damagedComponentsJson) {
      try {
        const components = JSON.parse(damageRow.damagedComponentsJson);
        damagedComponentCount = Array.isArray(components) ? components.length : 0;
      } catch {
        damagedComponentCount = 0;
      }
    }
  }

  // ── Detect warranty re-repair ─────────────────────────────────────────────
  // Same repairer, same vehicle, overlapping component names, within 90 days
  let isWarrantyRepair = false;
  let originalRepairId: number | null = null;

  if (params.vehicleId && params.componentsRepaired.length > 0) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

    const recentRepairs = await db
      .select({
        id: repairHistory.id,
        componentsRepairedJson: repairHistory.componentsRepairedJson,
        repairDate: repairHistory.repairDate,
      })
      .from(repairHistory)
      .where(
        and(
          eq(repairHistory.repairerId, params.repairerId),
          eq(repairHistory.vehicleId, params.vehicleId!),
          sql`repair_date >= ${ninetyDaysAgoStr}`
        )
      )
      .orderBy(desc(repairHistory.createdAt))
      .limit(5);

    const newComponentNames = new Set(
      params.componentsRepaired.map((c) => c.name.toLowerCase().trim())
    );

    for (const prev of recentRepairs) {
      if (!prev.componentsRepairedJson) continue;
      try {
        const prevComponents: RepairedComponent[] = JSON.parse(prev.componentsRepairedJson);
        const overlap = prevComponents.some((c) =>
          newComponentNames.has(c.name.toLowerCase().trim())
        );
        if (overlap) {
          isWarrantyRepair = true;
          originalRepairId = prev.id;
          fraudSignals.push(
            `Warranty re-repair detected: same component repaired by same repairer within 90 days (original repair #${prev.id})`
          );
          break;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // ── Detect repeat damage within 12 months ────────────────────────────────
  // Same vehicle, same component name, within 12 months (any repairer)
  let repeatDamageWithin12Months = false;

  if (params.vehicleId && params.componentsRepaired.length > 0) {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().slice(0, 10);

    const previousRepairs = await db
      .select({ componentsRepairedJson: repairHistory.componentsRepairedJson })
      .from(repairHistory)
      .where(
        and(
          eq(repairHistory.vehicleId, params.vehicleId!),
          sql`repair_date >= ${twelveMonthsAgoStr}`,
          sql`claim_id != ${params.claimId}`
        )
      )
      .limit(10);

    const newComponentNames = new Set(
      params.componentsRepaired.map((c) => c.name.toLowerCase().trim())
    );

    for (const prev of previousRepairs) {
      if (!prev.componentsRepairedJson) continue;
      try {
        const prevComponents: RepairedComponent[] = JSON.parse(prev.componentsRepairedJson);
        const overlap = prevComponents.some((c) =>
          newComponentNames.has(c.name.toLowerCase().trim())
        );
        if (overlap) {
          repeatDamageWithin12Months = true;
          fraudSignals.push(
            `Repeat damage within 12 months: same component was repaired on this vehicle within the last year`
          );
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  // ── Compute analytics ─────────────────────────────────────────────────────
  const componentMatchScore = computeComponentMatchScore(
    params.componentsRepaired.length,
    damagedComponentCount
  );

  const costDeviationPct = computeCostDeviation(
    params.repairCostCents,
    params.aiEstimatedCostCents ?? 0
  );

  const costRatio = computeCostRatio(
    params.repairCostCents,
    params.aiEstimatedCostCents ?? 0
  );

  // Duration is null at approval time — backfilled when repair is completed
  const qualityScore = computeRepairQualityScore({
    componentMatchScore,
    costDeviationPct,
    repairDurationDays: null,
    repeatDamageWithin12Months,
  });

  const isFraudFlagged = fraudSignals.length > 0;

  // ── Insert repair_history row ─────────────────────────────────────────────
  const insertData: InsertRepairHistory = {
    repairerId: params.repairerId,
    vehicleId: params.vehicleId ?? null,
    claimId: params.claimId,
    componentsRepairedJson: JSON.stringify(params.componentsRepaired),
    componentCount: params.componentsRepaired.length,
    componentMatchScore,
    repairCostCents: params.repairCostCents,
    labourCostCents: params.labourCostCents ?? 0,
    partsCostCents: params.partsCostCents ?? 0,
    aiEstimatedCostCents: params.aiEstimatedCostCents ?? 0,
    costDeviationPct: costDeviationPct?.toString() ?? null,
    approvalDate: params.approvalDate ?? new Date().toISOString().slice(0, 10),
    repairDate: params.repairDate ?? null,
    repairDurationDays: null,
    repeatDamageWithin12Months: repeatDamageWithin12Months ? 1 : 0,
    repairCostRatio: costRatio?.toString() ?? null,
    repairQualityScore: qualityScore,
    isWarrantyRepair: isWarrantyRepair ? 1 : 0,
    originalRepairId,
    isFraudFlagged: isFraudFlagged ? 1 : 0,
    fraudSignalsJson: fraudSignals.length > 0 ? JSON.stringify(fraudSignals) : null,
    damageHistoryIdsJson: damageHistoryIds.length > 0 ? JSON.stringify(damageHistoryIds) : null,
    damageHistoryLinkCount: damageHistoryIds.length,
    tenantId: params.tenantId ?? null,
  } as any;

  const [insertResult] = await db.insert(repairHistory).values(insertData);
  const repairHistoryId = (insertResult as any)?.insertId ?? null;

  if (repairHistoryId) {
    console.log(
      `[RepairHistory] Created record #${repairHistoryId} for claim ${params.claimId}, repairer ${params.repairerId}` +
      ` | quality=${qualityScore} | costDev=${costDeviationPct?.toFixed(1) ?? 'N/A'}%` +
      (isWarrantyRepair ? " | WARRANTY_REPAIR" : "") +
      (repeatDamageWithin12Months ? " | REPEAT_DAMAGE" : "")
    );
  }

  return { repairHistoryId, fraudSignals };
}

/**
 * Backfill repair date and duration when a repair is marked as complete.
 * Also re-computes the quality score with the actual duration.
 */
export async function updateRepairCompletion(params: {
  repairHistoryId: number;
  repairDate: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [record] = await db
    .select()
    .from(repairHistory)
    .where(eq(repairHistory.id, params.repairHistoryId))
    .limit(1);

  if (!record) return;

  // Compute duration
  let repairDurationDays: number | null = null;
  if (record.approvalDate) {
    const approvalMs = new Date(record.approvalDate).getTime();
    const repairMs = new Date(params.repairDate).getTime();
    if (!isNaN(approvalMs) && !isNaN(repairMs)) {
      repairDurationDays = Math.max(0, Math.round((repairMs - approvalMs) / (1000 * 60 * 60 * 24)));
    }
  }

  // Re-compute quality score with actual duration
  const updatedQualityScore = computeRepairQualityScore({
    componentMatchScore: record.componentMatchScore ?? 100,
    costDeviationPct: record.costDeviationPct !== null ? Number(record.costDeviationPct) : null,
    repairDurationDays,
    repeatDamageWithin12Months: record.repeatDamageWithin12Months === 1,
  });

  await db
    .update(repairHistory)
    .set({
      repairDate: params.repairDate,
      repairDurationDays,
      repairQualityScore: updatedQualityScore,
    })
    .where(eq(repairHistory.id, params.repairHistoryId));

  console.log(
    `[RepairHistory] Completion backfill #${params.repairHistoryId}: duration=${repairDurationDays}d quality=${updatedQualityScore}`
  );
}

/**
 * Flag repeat damage on an existing repair_history record.
 * Called when a new claim is filed for the same vehicle and component.
 */
export async function flagRepeatDamage(repairHistoryId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [record] = await db
    .select()
    .from(repairHistory)
    .where(eq(repairHistory.id, repairHistoryId))
    .limit(1);

  if (!record || record.repeatDamageWithin12Months === 1) return;

  const existingSignals: string[] = record.fraudSignalsJson
    ? JSON.parse(record.fraudSignalsJson)
    : [];
  existingSignals.push("Repeat damage within 12 months flagged on a subsequent claim");

  const updatedQualityScore = computeRepairQualityScore({
    componentMatchScore: record.componentMatchScore ?? 100,
    costDeviationPct: record.costDeviationPct !== null ? Number(record.costDeviationPct) : null,
    repairDurationDays: record.repairDurationDays ?? null,
    repeatDamageWithin12Months: true,
  });

  await db
    .update(repairHistory)
    .set({
      repeatDamageWithin12Months: 1,
      isFraudFlagged: 1,
      fraudSignalsJson: JSON.stringify(existingSignals),
      repairQualityScore: updatedQualityScore,
    })
    .where(eq(repairHistory.id, repairHistoryId));
}

/**
 * Roll up repair_history stats to the panel_beaters table.
 * Called after every insert or update to keep aggregates current.
 */
export async function updateRepairerAggregates(repairerId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [agg] = await db
    .select({
      totalRepairs: sql<number>`COUNT(*)`,
      avgQualityScore: sql<number>`AVG(repair_quality_score)`,
      avgCostRatio: sql<number>`AVG(repair_cost_ratio)`,
      avgRepairDurationDays: sql<number>`AVG(repair_duration_days)`,
      repeatDamageCount: sql<number>`SUM(repeat_damage_within_12_months)`,
      warrantyRepairCount: sql<number>`SUM(is_warranty_repair)`,
      fraudFlagCount: sql<number>`SUM(is_fraud_flagged)`,
      lastRepairDate: sql<string>`MAX(repair_date)`,
    })
    .from(repairHistory)
    .where(eq(repairHistory.repairerId, repairerId));

  if (!agg) return;

  const totalRepairs = Number(agg.totalRepairs ?? 0);
  const avgQualityScore = agg.avgQualityScore !== null ? Number(agg.avgQualityScore) : null;
  const repeatDamageRate =
    totalRepairs > 0
      ? Math.round((Number(agg.repeatDamageCount ?? 0) / totalRepairs) * 10000) / 100
      : null;

  const performanceTier = derivePerformanceTier(avgQualityScore);

  await db
    .update(panelBeaters)
    .set({
      totalRepairs,
      avgQualityScore: avgQualityScore?.toFixed(2) ?? null,
      avgCostRatio: agg.avgCostRatio !== null ? Number(agg.avgCostRatio).toFixed(3) : null,
      avgRepairDurationDays: agg.avgRepairDurationDays !== null ? Number(agg.avgRepairDurationDays).toFixed(1) : null,
      repeatDamageRatePct: repeatDamageRate?.toFixed(2) ?? null,
      warrantyRepairCount: Number(agg.warrantyRepairCount ?? 0),
      fraudFlagCount: Number(agg.fraudFlagCount ?? 0),
      performanceTier,
      lastRepairDate: agg.lastRepairDate ?? null,
      performanceUpdatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    } as any)
    .where(eq(panelBeaters.id, repairerId));

  console.log(
    `[RepairHistory] Repairer #${repairerId} aggregates updated: tier=${performanceTier} quality=${avgQualityScore?.toFixed(1) ?? 'N/A'} repairs=${totalRepairs}`
  );
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getRepairHistoryByClaim(claimId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairHistory)
    .where(eq(repairHistory.claimId, claimId))
    .orderBy(desc(repairHistory.createdAt));
}

export async function getRepairHistoryByRepairer(
  repairerId: number,
  limit = 50
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairHistory)
    .where(eq(repairHistory.repairerId, repairerId))
    .orderBy(desc(repairHistory.createdAt))
    .limit(limit);
}

export async function getRepairHistoryByVehicle(
  vehicleId: number,
  limit = 50
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairHistory)
    .where(eq(repairHistory.vehicleId, vehicleId))
    .orderBy(desc(repairHistory.createdAt))
    .limit(limit);
}
