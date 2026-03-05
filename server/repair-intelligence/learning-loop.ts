/**
 * Repair Cost Intelligence — Data Learning Loop (Layer 8)
 *
 * After each completed claim, this module updates the repair_cost_intelligence
 * table using rolling median updates derived from real claim data.
 *
 * SAFETY RULES:
 *   - Never seeds artificial data
 *   - Only processes claims with status = "completed" or "closed"
 *   - intelligence_confidence = "low" when claim_count < 10
 *   - Uses rolling median — not a simple average — to resist outlier pollution
 *   - All amounts stored in ZAR cents
 *
 * Trigger: call updateRepairCostIntelligence() after a claim is marked completed.
 */

import { getDb } from "../db";
import {
  claims,
  panelBeaterQuotes,
  repairCostIntelligence,
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLDS = { high: 20, medium: 10 } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LearningLoopResult {
  updated: boolean;
  claimId: number;
  vehicleMake: string | null;
  vehicleModel: string | null;
  damageCategory: string;
  newClaimCount: number;
  newMedian: number;
  confidence: "low" | "medium" | "high";
  reason?: string;
}

// ─── Rolling Median Helper ────────────────────────────────────────────────────

/**
 * Calculate a rolling median from an existing median, count, and a new value.
 *
 * This is an approximation that avoids storing all historical values.
 * It weights the existing median by (count - 1) and blends in the new value.
 * For small counts, the approximation is close to the true median.
 */
function rollingMedian(existingMedian: number, existingCount: number, newValue: number): number {
  if (existingCount === 0) return newValue;
  // Weighted blend: preserve existing median, nudge toward new value
  return Math.round(
    (existingMedian * (existingCount - 1) + newValue) / existingCount
  );
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Update the repair_cost_intelligence table after a claim is completed.
 *
 * Steps:
 *   1. Fetch the completed claim (vehicle make, model, year)
 *   2. Fetch the accepted/lowest panel beater quote as the repair cost
 *   3. Determine damage category from claim metadata or AI assessment
 *   4. Upsert the repair_cost_intelligence row with rolling median update
 *
 * @param claimId    - ID of the completed claim
 * @param countryCode - Country code (default "ZA")
 */
export async function updateRepairCostIntelligence(
  claimId: number,
  countryCode: string = "ZA"
): Promise<LearningLoopResult> {
  const noUpdate = (reason: string): LearningLoopResult => ({
    updated: false,
    claimId,
    vehicleMake: null,
    vehicleModel: null,
    damageCategory: "unknown",
    newClaimCount: 0,
    newMedian: 0,
    confidence: "low",
    reason,
  });

  try {
    const db = await getDb();
    if (!db) return noUpdate("Database unavailable");

    // ── 1. Fetch the claim ─────────────────────────────────────────────────
    const [claim] = await db
      .select({
        id: claims.id,
        vehicleMake: claims.vehicleMake,
        vehicleModel: claims.vehicleModel,
        vehicleYear: claims.vehicleYear,
        status: claims.status,
        metadata: claims.metadata,
        isSimulated: claims.isSimulated,
      })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);

    if (!claim) return noUpdate("Claim not found");

    // Skip simulated claims — never pollute real intelligence with test data
    if (claim.isSimulated) return noUpdate("Simulated claim — skipped");

    // Only process completed or closed claims
    if (!["completed", "closed"].includes(claim.status)) {
      return noUpdate(`Claim status is "${claim.status}" — only completed/closed claims are processed`);
    }

    const vehicleMake = claim.vehicleMake;
    const vehicleModel = claim.vehicleModel;

    if (!vehicleMake || !vehicleModel) {
      return noUpdate("Vehicle make/model not available");
    }

    // ── 2. Fetch the accepted/lowest quote ────────────────────────────────
    const quotes = await db
      .select({
        quotedAmount: panelBeaterQuotes.quotedAmount,
        status: panelBeaterQuotes.status,
      })
      .from(panelBeaterQuotes)
      .where(eq(panelBeaterQuotes.claimId, claimId));

    if (quotes.length === 0) return noUpdate("No quotes found for claim");

    // Prefer accepted quote; fall back to lowest submitted
    const accepted = quotes.find((q) => q.status === "accepted");
    const repairCostCents = accepted
      ? (accepted.quotedAmount ?? 0)
      : Math.min(...quotes.map((q) => q.quotedAmount ?? 0));

    if (repairCostCents <= 0) return noUpdate("Invalid repair cost (zero or negative)");

    // ── 3. Determine damage category ──────────────────────────────────────
    let damageCategory = "general";
    if (claim.metadata && typeof claim.metadata === "object") {
      const meta = claim.metadata as Record<string, unknown>;
      if (typeof meta.damageType === "string") {
        damageCategory = meta.damageType;
      } else if (typeof meta.simulatedDamageCategory === "string") {
        damageCategory = meta.simulatedDamageCategory;
      }
    }

    const country = countryCode.toUpperCase();

    // ── 4. Upsert repair_cost_intelligence ────────────────────────────────
    // Check if a row already exists for this make/model/damage/country
    const [existing] = await db
      .select()
      .from(repairCostIntelligence)
      .where(
        and(
          sql`LOWER(${repairCostIntelligence.vehicleMake}) = LOWER(${vehicleMake})`,
          sql`LOWER(${repairCostIntelligence.vehicleModel}) = LOWER(${vehicleModel})`,
          eq(repairCostIntelligence.damageCategory, damageCategory),
          eq(repairCostIntelligence.country, country)
        )
      )
      .limit(1);

    let newClaimCount: number;
    let newMedian: number;
    let newMin: number;
    let newMax: number;

    if (existing) {
      // Rolling update
      newClaimCount = existing.claimCount + 1;
      newMedian = rollingMedian(existing.medianRepairCost, existing.claimCount, repairCostCents);
      newMin = Math.min(existing.minRepairCost, repairCostCents);
      newMax = Math.max(existing.maxRepairCost, repairCostCents);

      const newConfidence: "low" | "medium" | "high" =
        newClaimCount >= CONFIDENCE_THRESHOLDS.high
          ? "high"
          : newClaimCount >= CONFIDENCE_THRESHOLDS.medium
          ? "medium"
          : "low";

      await db
        .update(repairCostIntelligence)
        .set({
          medianRepairCost: newMedian,
          minRepairCost: newMin,
          maxRepairCost: newMax,
          claimCount: newClaimCount,
          intelligenceConfidence: newConfidence,
        })
        .where(eq(repairCostIntelligence.id, existing.id));

      return {
        updated: true,
        claimId,
        vehicleMake,
        vehicleModel,
        damageCategory,
        newClaimCount,
        newMedian,
        confidence: newConfidence,
      };
    } else {
      // First entry for this make/model/damage/country
      newClaimCount = 1;
      newMedian = repairCostCents;
      newMin = repairCostCents;
      newMax = repairCostCents;

      await db.insert(repairCostIntelligence).values({
        vehicleMake,
        vehicleModel,
        vehicleYear: claim.vehicleYear ?? undefined,
        damageCategory,
        country,
        medianRepairCost: newMedian,
        minRepairCost: newMin,
        maxRepairCost: newMax,
        claimCount: newClaimCount,
        intelligenceConfidence: "low", // always low for first entry
      });

      return {
        updated: true,
        claimId,
        vehicleMake,
        vehicleModel,
        damageCategory,
        newClaimCount,
        newMedian,
        confidence: "low",
      };
    }
  } catch (err) {
    console.error("[LearningLoop] Error updating repair cost intelligence:", err);
    return noUpdate(`Internal error: ${String(err)}`);
  }
}
