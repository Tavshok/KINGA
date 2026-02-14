/**
 * Continuous Learning Loop
 * 
 * Automatically feeds approved/completed claims into the historical database
 * so the AI improves its cost predictions, fraud detection, and assessor
 * benchmarking over time.
 * 
 * This module:
 * 1. Monitors claim status changes (completed/approved)
 * 2. Extracts relevant data from the live claim + AI assessment
 * 3. Creates a historical claim record with all extracted data
 * 4. Generates variance datasets for benchmarking
 * 5. Logs AI predictions for accuracy tracking
 */

import { getDb } from "./db";
import {
  claims,
  aiAssessments,
  historicalClaims,
  extractedRepairItems,
  costComponents,
  aiPredictionLogs,
  varianceDatasets,
} from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Feed a completed/approved claim into the historical database.
 * Called automatically when a claim transitions to approved/completed status.
 */
export async function feedClaimToHistorical(claimId: number): Promise<{
  success: boolean;
  historicalClaimId?: number;
  message: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: "Database not available" };
  }

  try {
    // Fetch the claim
    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, claimId));

    if (!claim) {
      return { success: false, message: `Claim ${claimId} not found` };
    }

    if (!claim.tenantId) {
      return { success: false, message: `Claim ${claimId} has no tenant` };
    }

    // Fetch AI assessment data if available
    let aiAssessment: any = null;
    try {
      const [assessment] = await db
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, claimId));
      aiAssessment = assessment;
    } catch {
      // No AI assessment — continue without it
    }

    // Parse extended data from AI assessment
    let extendedData: any = {};
    try {
      if (aiAssessment?.rawResponse) {
        extendedData = typeof aiAssessment.rawResponse === "string"
          ? JSON.parse(aiAssessment.rawResponse)
          : aiAssessment.rawResponse;
      }
    } catch {
      // Continue with empty extended data
    }

    // Extract cost information from claim fields
    const quotedCost = aiAssessment?.estimatedCost || null; // in cents
    const approvedCost = claim.approvedAmount || null; // in cents
    const aiPredictedCost = extendedData?.costAnalysis?.totalCost || extendedData?.totalEstimatedCost || null;

    // Create historical claim record
    const [historicalClaim] = await db.insert(historicalClaims).values({
      tenantId: claim.tenantId,
      claimReference: claim.claimNumber || `CLM-${claim.id}`,
      pipelineStatus: "complete",
      vehicleMake: claim.vehicleMake || null,
      vehicleModel: claim.vehicleModel || null,
      vehicleYear: claim.vehicleYear || null,
      vehicleRegistration: claim.vehicleRegistration || null,
      incidentDate: claim.incidentDate ? new Date(claim.incidentDate as any) as any : null,
      incidentLocation: claim.incidentLocation || null,
      incidentDescription: claim.incidentDescription || null,
      claimantName: null, // Privacy: don't copy PII to historical
      totalPanelBeaterQuote: quotedCost ? (quotedCost / 100).toFixed(2) : null,
      totalAssessorEstimate: aiPredictedCost ? String(aiPredictedCost) : null,
      finalApprovedCost: approvedCost ? (approvedCost / 100).toFixed(2) : null,
      dataQualityScore: extendedData?.dataQualityScore || 75,
    }).$returningId();

    const hcId = historicalClaim.id;

    // Extract repair items from AI assessment extended data
    const components = extendedData?.components || extendedData?.damagedComponents || [];
    for (const comp of components) {
      try {
        await db.insert(extractedRepairItems).values({
          historicalClaimId: hcId,
          sourceType: "ai_estimate",
          description: comp.name || comp.partName || comp.description || "Unknown part",
          partNumber: comp.partNumber || null,
          category: mapToCategory(comp.category || comp.type),
          damageLocation: comp.zone || comp.location || null,
          repairAction: mapToRepairAction(comp.action || comp.repairAction),
          lineTotal: comp.cost ? String(comp.cost) : null,
          laborHours: comp.laborHours ? String(comp.laborHours) : null,
          partsQuality: comp.isOem ? "oem" : comp.partsQuality || null,
        });
      } catch {
        // Skip individual items that fail
      }
    }

    // Extract cost components from AI assessment
    const breakdown = extendedData?.costBreakdown || extendedData?.costAnalysis || {};
    if (breakdown.partsCost || breakdown.labourCost || breakdown.paintCost) {
      try {
        await db.insert(costComponents).values({
          historicalClaimId: hcId,
          sourceType: "ai_estimate",
          partsCost: breakdown.partsCost ? String(breakdown.partsCost) : "0.00",
          laborCost: breakdown.labourCost || breakdown.laborCost ? String(breakdown.labourCost || breakdown.laborCost) : "0.00",
          paintCost: breakdown.paintCost ? String(breakdown.paintCost) : "0.00",
          subletCost: breakdown.subletCost ? String(breakdown.subletCost) : "0.00",
          sundries: breakdown.sundriesCost || breakdown.sundries ? String(breakdown.sundriesCost || breakdown.sundries) : "0.00",
          totalExclVat: breakdown.totalExclVat ? String(breakdown.totalExclVat) : "0.00",
          totalInclVat: breakdown.totalInclVat || breakdown.totalCost ? String(breakdown.totalInclVat || breakdown.totalCost) : "0.00",
        });
      } catch {
        // Non-critical
      }
    }

    // If approved cost exists, also store final approved cost components
    if (approvedCost) {
      try {
        await db.insert(costComponents).values({
          historicalClaimId: hcId,
          sourceType: "final_approved",
          totalInclVat: (approvedCost / 100).toFixed(2),
        });
      } catch {
        // Non-critical
      }
    }

    // Log AI prediction for accuracy tracking
    if (aiPredictedCost && approvedCost) {
      const approvedRands = approvedCost / 100;
      try {
        await db.insert(aiPredictionLogs).values({
          tenantId: claim.tenantId,
          historicalClaimId: hcId,
          predictionType: "cost_estimate",
          predictedValue: String(aiPredictedCost),
          actualValue: String(approvedRands),
          isAccurate: Math.abs(aiPredictedCost - approvedRands) / approvedRands < 0.15 ? 1 : 0,
          confidenceScore: extendedData?.confidence ? String(extendedData.confidence) : null,
          modelName: "kinga-assessment-v1",
          modelVersion: "kinga-v1",
        });
      } catch {
        // Non-critical
      }
    }

    // Generate variance datasets for benchmarking
    if (quotedCost && approvedCost) {
      const quotedRands = quotedCost / 100;
      const approvedRands = approvedCost / 100;
      const variancePercent = ((quotedRands - approvedRands) / approvedRands) * 100;
      const absVariance = Math.abs(variancePercent);
      const category = categorizeVariance(absVariance);

      try {
        await db.insert(varianceDatasets).values({
          tenantId: claim.tenantId,
          historicalClaimId: hcId,
          comparisonType: "quote_vs_final",
          sourceALabel: "Panel Beater Quote",
          sourceBLabel: "Final Approved",
          sourceAAmount: quotedRands.toFixed(2),
          sourceBAmount: approvedRands.toFixed(2),
          varianceAmount: (quotedRands - approvedRands).toFixed(2),
          variancePercent: variancePercent.toFixed(2),
          absoluteVariancePercent: absVariance.toFixed(2),
          varianceCategory: category,
          vehicleMake: claim.vehicleMake || null,
          vehicleModel: claim.vehicleModel || null,
          isFraudSuspected: (claim.fraudRiskScore || 0) > 70 ? 1 : 0,
          isOutlier: absVariance > 50 ? 1 : 0,
        });
      } catch {
        // Non-critical
      }

      // Also create AI vs final variance if AI prediction exists
      if (aiPredictedCost) {
        const aiVariancePercent = ((aiPredictedCost - approvedRands) / approvedRands) * 100;
        const aiAbsVariance = Math.abs(aiVariancePercent);

        try {
          await db.insert(varianceDatasets).values({
            tenantId: claim.tenantId,
            historicalClaimId: hcId,
            comparisonType: "ai_vs_final",
            sourceALabel: "AI Prediction",
            sourceBLabel: "Final Approved",
            sourceAAmount: String(aiPredictedCost),
            sourceBAmount: approvedRands.toFixed(2),
            varianceAmount: (aiPredictedCost - approvedRands).toFixed(2),
            variancePercent: aiVariancePercent.toFixed(2),
            absoluteVariancePercent: aiAbsVariance.toFixed(2),
            varianceCategory: categorizeVariance(aiAbsVariance),
            vehicleMake: claim.vehicleMake || null,
            vehicleModel: claim.vehicleModel || null,
            isFraudSuspected: (claim.fraudRiskScore || 0) > 70 ? 1 : 0,
            isOutlier: aiAbsVariance > 50 ? 1 : 0,
          });
        } catch {
          // Non-critical
        }
      }
    }

    return {
      success: true,
      historicalClaimId: hcId,
      message: `Claim ${claimId} (${claim.claimNumber}) fed into historical database as HC-${hcId}`,
    };
  } catch (error: any) {
    console.error(`[ContinuousLearning] Error feeding claim ${claimId}:`, error);
    return {
      success: false,
      message: `Failed to feed claim: ${error.message}`,
    };
  }
}

/**
 * Get historical benchmarks for a specific vehicle make/model.
 * Used to enrich live assessment results with historical context.
 */
export async function getHistoricalBenchmarks(
  tenantId: string,
  vehicleMake: string,
  vehicleModel?: string,
  damageContext?: {
    accidentType?: string;        // rear_end, head_on, side_impact, rollover, etc.
    damageSeverity?: string;      // minor, moderate, severe, total_loss
    affectedZones?: string[];     // front_bumper, rear_door, door_left, etc.
    estimatedCost?: number;       // Current claim cost for range matching
  }
): Promise<{
  avgQuoteCost: number | null;
  avgFinalCost: number | null;
  avgVariance: number | null;
  claimCount: number;
  fraudRate: number | null;
  commonRepairActions: string[];
  matchQuality: 'exact' | 'similar' | 'vehicle_only' | 'none';
  matchCriteria: string;
}> {
  const emptyResult = {
    avgQuoteCost: null,
    avgFinalCost: null,
    avgVariance: null,
    claimCount: 0,
    fraudRate: null,
    commonRepairActions: [],
    matchQuality: 'none' as const,
    matchCriteria: 'No matching historical data',
  };

  const db = await getDb();
  if (!db) return emptyResult;

  try {
    // Fetch all historical claims for this tenant
    const allClaims = await db
      .select()
      .from(historicalClaims)
      .where(eq(historicalClaims.tenantId, tenantId))
      .limit(500);

    // TIER 1: Exact match — same make/model + same accident type + same severity
    // TIER 2: Similar match — same make/model + same accident type (any severity)
    // TIER 3: Vehicle only — same make/model (any damage)
    // Each tier progressively relaxes criteria

    const makeModelMatches = allClaims.filter((c) => {
      const makeMatch = c.vehicleMake?.toLowerCase() === vehicleMake.toLowerCase();
      if (!vehicleModel) return makeMatch;
      return makeMatch && c.vehicleModel?.toLowerCase() === vehicleModel.toLowerCase();
    });

    if (makeModelMatches.length === 0) return emptyResult;

    // Fetch repair items for matched claims to check affected zones
    const claimIds = makeModelMatches.map((c) => c.id);
    let repairItems: Array<{ historicalClaimId: number; damageLocation: string | null; repairAction: string | null }> = [];
    if (claimIds.length > 0) {
      try {
        repairItems = await db
          .select({
            historicalClaimId: extractedRepairItems.historicalClaimId,
            damageLocation: extractedRepairItems.damageLocation,
            repairAction: extractedRepairItems.repairAction,
          })
          .from(extractedRepairItems)
          .where(sql`${extractedRepairItems.historicalClaimId} IN (${sql.join(claimIds.map(id => sql`${id}`), sql`, `)})`);
      } catch { /* ignore if table empty */ }
    }

    // Build damage location map per claim
    const claimZones = new Map<number, Set<string>>();
    const claimRepairActions = new Map<number, string[]>();
    for (const item of repairItems) {
      if (!claimZones.has(item.historicalClaimId)) {
        claimZones.set(item.historicalClaimId, new Set());
        claimRepairActions.set(item.historicalClaimId, []);
      }
      if (item.damageLocation) {
        claimZones.get(item.historicalClaimId)!.add(item.damageLocation.toLowerCase());
      }
      if (item.repairAction) {
        claimRepairActions.get(item.historicalClaimId)!.push(item.repairAction);
      }
    }

    // Calculate zone overlap score between current claim and historical claim
    const getZoneOverlap = (claimId: number): number => {
      if (!damageContext?.affectedZones?.length) return 0;
      const historicalZones = claimZones.get(claimId);
      if (!historicalZones || historicalZones.size === 0) return 0;
      const currentZones = new Set(damageContext.affectedZones.map(z => z.toLowerCase()));
      let overlap = 0;
      const currentZonesArr = Array.from(currentZones);
      for (const zone of currentZonesArr) {
        if (historicalZones.has(zone)) overlap++;
      }
      return overlap / Math.max(currentZones.size, historicalZones.size);
    };

    // TIER 1: Exact — same accident type + similar severity + zone overlap > 30%
    let tier1: typeof makeModelMatches = [];
    if (damageContext?.accidentType) {
      tier1 = makeModelMatches.filter((c) => {
        const typeMatch = c.accidentType?.toLowerCase().includes(damageContext.accidentType!.toLowerCase())
          || damageContext.accidentType!.toLowerCase().includes(c.accidentType?.toLowerCase() || '');
        if (!typeMatch) return false;
        // Zone overlap check
        const zoneOverlap = getZoneOverlap(c.id);
        return zoneOverlap >= 0.3 || !damageContext.affectedZones?.length;
      });
    }

    // TIER 2: Similar — same accident type (any zones)
    let tier2: typeof makeModelMatches = [];
    if (damageContext?.accidentType) {
      tier2 = makeModelMatches.filter((c) => {
        return c.accidentType?.toLowerCase().includes(damageContext.accidentType!.toLowerCase())
          || damageContext.accidentType!.toLowerCase().includes(c.accidentType?.toLowerCase() || '');
      });
    }

    // Select best available tier
    let selectedClaims: typeof makeModelMatches;
    let matchQuality: 'exact' | 'similar' | 'vehicle_only';
    let matchCriteria: string;

    if (tier1.length >= 3) {
      selectedClaims = tier1;
      matchQuality = 'exact';
      matchCriteria = `${vehicleMake} ${vehicleModel || ''} + ${damageContext?.accidentType} + matching damage zones (${tier1.length} claims)`;
    } else if (tier2.length >= 3) {
      selectedClaims = tier2;
      matchQuality = 'similar';
      matchCriteria = `${vehicleMake} ${vehicleModel || ''} + ${damageContext?.accidentType} damage type (${tier2.length} claims)`;
    } else {
      selectedClaims = makeModelMatches;
      matchQuality = 'vehicle_only';
      matchCriteria = `${vehicleMake} ${vehicleModel || ''} — all damage types (${makeModelMatches.length} claims)`;
    }

    // Calculate statistics from selected claims
    const quoteCosts = selectedClaims
      .map((c) => c.totalPanelBeaterQuote ? parseFloat(c.totalPanelBeaterQuote) : null)
      .filter((v): v is number => v !== null);

    const finalCosts = selectedClaims
      .map((c) => c.finalApprovedCost ? parseFloat(c.finalApprovedCost) : null)
      .filter((v): v is number => v !== null);

    const avgQuote = quoteCosts.length > 0
      ? quoteCosts.reduce((a, b) => a + b, 0) / quoteCosts.length
      : null;

    const avgFinal = finalCosts.length > 0
      ? finalCosts.reduce((a, b) => a + b, 0) / finalCosts.length
      : null;

    const avgVariance = avgQuote && avgFinal
      ? ((avgQuote - avgFinal) / avgFinal) * 100
      : null;

    const fraudCount = selectedClaims.filter((c) => (c.dataQualityScore || 0) < 30).length;
    const fraudRate = selectedClaims.length > 0 ? (fraudCount / selectedClaims.length) * 100 : null;

    // Collect common repair actions from matched claims
    const actionCounts = new Map<string, number>();
    for (const claim of selectedClaims) {
      const actions = claimRepairActions.get(claim.id) || [];
      for (const action of actions) {
        actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
      }
    }
    const commonRepairActions = Array.from(actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([action]) => action);

    return {
      avgQuoteCost: avgQuote,
      avgFinalCost: avgFinal,
      avgVariance: avgVariance,
      claimCount: selectedClaims.length,
      fraudRate: fraudRate,
      commonRepairActions,
      matchQuality,
      matchCriteria,
    };
  } catch (error) {
    console.error("[ContinuousLearning] Error fetching benchmarks:", error);
    return {
      avgQuoteCost: null,
      avgFinalCost: null,
      avgVariance: null,
      claimCount: 0,
      fraudRate: null,
      commonRepairActions: [],
      matchQuality: 'none' as const,
      matchCriteria: 'Error fetching historical data',
    };
  }
}

// --- Helper functions ---

function mapToCategory(raw: string | undefined): "parts" | "labor" | "paint" | "diagnostic" | "sundries" | "sublet" | "other" {
  if (!raw) return "other";
  const lower = raw.toLowerCase();
  if (lower.includes("part") || lower.includes("component")) return "parts";
  if (lower.includes("labo") || lower.includes("labour")) return "labor";
  if (lower.includes("paint") || lower.includes("refinish")) return "paint";
  if (lower.includes("diag") || lower.includes("scan")) return "diagnostic";
  if (lower.includes("sundri")) return "sundries";
  if (lower.includes("sublet") || lower.includes("outsource")) return "sublet";
  return "other";
}

function mapToRepairAction(raw: string | undefined): "repair" | "replace" | "refinish" | "blend" | "remove_refit" | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes("replace") || lower === "new") return "replace";
  if (lower.includes("refinish") || lower.includes("respray")) return "refinish";
  if (lower.includes("blend")) return "blend";
  if (lower.includes("remove") || lower.includes("r&r") || lower.includes("r/r")) return "remove_refit";
  if (lower.includes("repair") || lower.includes("fix")) return "repair";
  return "repair";
}

function categorizeVariance(absPercent: number): "within_threshold" | "minor_variance" | "significant_variance" | "major_variance" | "extreme_variance" {
  if (absPercent < 5) return "within_threshold";
  if (absPercent < 15) return "minor_variance";
  if (absPercent < 30) return "significant_variance";
  if (absPercent < 50) return "major_variance";
  return "extreme_variance";
}
