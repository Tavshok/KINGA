/**
 * Historical Cost Deviation Calculator
 *
 * Queries extracted_repair_items from historical claims to calculate:
 *   - averageCost:    mean total repair cost for similar claims
 *   - medianCost:     median total repair cost
 *   - deviationPct:   % deviation of the current quote from the historical median
 *   - sampleSize:     number of historical claims used
 *   - confidence:     "high" (≥20), "medium" (5–19), "low" (<5)
 *
 * Similarity is determined by vehicle make + model when available,
 * falling back to all claims for the tenant.
 *
 * All amounts are in ZAR cents.
 */

import { getDb } from "../db";
import { extractedRepairItems, historicalClaims } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

export interface DeviationResult {
  averageCost: number | null;   // ZAR cents
  medianCost: number | null;    // ZAR cents
  deviationPct: number | null;  // % above/below median (positive = above)
  sampleSize: number;
  confidence: "high" | "medium" | "low";
}

const CONFIDENCE_THRESHOLDS = { high: 20, medium: 5 } as const;

/**
 * Calculate historical cost deviation for a claim.
 *
 * @param tenantId       - Tenant scope for the query
 * @param quotedTotal    - Total quoted amount in ZAR cents
 * @param vehicleMake    - Optional: filter by vehicle make
 * @param vehicleModel   - Optional: filter by vehicle model
 */
export async function calculateHistoricalDeviation(
  tenantId: string,
  quotedTotal: number,
  vehicleMake?: string | null,
  vehicleModel?: string | null
): Promise<DeviationResult> {
  const noData: DeviationResult = {
    averageCost: null,
    medianCost: null,
    deviationPct: null,
    sampleSize: 0,
    confidence: "low",
  };

  try {
    const db = await getDb();
    if (!db) return noData;

    // Build filter: tenant + optional vehicle make/model
    const filters = [eq(historicalClaims.tenantId, tenantId)];
    if (vehicleMake) {
      filters.push(
        sql`LOWER(${historicalClaims.vehicleMake}) = LOWER(${vehicleMake})`
      );
    }
    if (vehicleModel) {
      filters.push(
        sql`LOWER(${historicalClaims.vehicleModel}) = LOWER(${vehicleModel})`
      );
    }

    // Aggregate total repair cost per historical claim using extracted_repair_items
    // Sum line_total grouped by historical_claim_id
    const rows = await db
      .select({
        historicalClaimId: extractedRepairItems.historicalClaimId,
        totalCost: sql<number>`SUM(CAST(${extractedRepairItems.lineTotal} AS DECIMAL(12,2)))`,
      })
      .from(extractedRepairItems)
      .innerJoin(
        historicalClaims,
        eq(extractedRepairItems.historicalClaimId, historicalClaims.id)
      )
      .where(and(...filters))
      .groupBy(extractedRepairItems.historicalClaimId)
      .limit(500); // Cap at 500 records for performance

    if (rows.length === 0) {
      // Fallback: try without vehicle filter if we had one
      if (vehicleMake || vehicleModel) {
        return calculateHistoricalDeviation(tenantId, quotedTotal);
      }
      return noData;
    }

    // Convert to cents (line_total stored as decimal ZAR)
    const costs = rows
      .map((r) => Math.round(Number(r.totalCost) * 100))
      .filter((c) => c > 0)
      .sort((a, b) => a - b);

    if (costs.length === 0) return noData;

    const sampleSize = costs.length;
    const averageCost = Math.round(costs.reduce((s, c) => s + c, 0) / sampleSize);

    // Median
    const mid = Math.floor(sampleSize / 2);
    const medianCost =
      sampleSize % 2 === 0
        ? Math.round((costs[mid - 1] + costs[mid]) / 2)
        : costs[mid];

    const deviationPct =
      medianCost > 0
        ? Math.round(((quotedTotal - medianCost) / medianCost) * 1000) / 10
        : null;

    const confidence: DeviationResult["confidence"] =
      sampleSize >= CONFIDENCE_THRESHOLDS.high
        ? "high"
        : sampleSize >= CONFIDENCE_THRESHOLDS.medium
        ? "medium"
        : "low";

    return { averageCost, medianCost, deviationPct, sampleSize, confidence };
  } catch (err) {
    console.error("[CostDeviation] Error calculating deviation:", err);
    return noData;
  }
}
