/**
 * Quote Intelligence Orchestrator
 *
 * Combines all Repair Quote Intelligence sub-services into a single call:
 *
 *   Layer 1: Quote Comparison Statistics (median, min, max, spread, outliers)
 *   Layer 2: Repair-to-Vehicle Value Ratio (repair ratio classification)
 *   Layer 3: Historical Repair Intelligence (repair_cost_intelligence table lookup)
 *   Layer 4: Country Cost Index (normalisation context)
 *   Layer 5: Parts Certainty Score (OEM/aftermarket/unknown classification)
 *   Layer 6: AI Recommendation Output (confidence score + human-readable guidance)
 *   Layer 7: Safety Guardrails (confidence reduced when data is limited)
 *
 * Returns an EnhancedIntelligenceReport that is advisory only — it does NOT
 * modify any existing table or block any claim workflow.
 *
 * CRITICAL RULES (enforced throughout):
 *   - No fixed global pricing database for vehicle parts
 *   - No assumed part prices unless derived from quotes or historical claim data
 *   - No "expected part prices" calculation
 *   - Relative quote intelligence and historical claim comparisons only
 *   - Confidence reduced, never inflated, when data is limited
 */

import { getDb } from "../db";
import {
  aiAssessments,
  panelBeaterQuotes,
  panelBeaters,
  claims,
  repairCostIntelligence,
} from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { reconcileParts, type DetectedPart, type QuotedPart } from "./part-reconciliation";
import { calculateHistoricalDeviation, type DeviationResult } from "./cost-deviation";
import { getCountryRepairContext, type CountryRepairContext } from "./country-repair-index";
import { classifyRisk, type RiskLevel } from "./risk-classifier";
import type { ReconciliationResult } from "./part-reconciliation";
import {
  calculateQuoteComparisonStats,
  calculateRepairRatio,
  calculatePartsCertainty,
  calculateConfidenceScore,
  type QuoteEntry,
  type QuoteComparisonStats,
  type RepairRatioResult,
  type PartsCertaintyResult,
  type ConfidenceResult,
} from "./quote-comparison-stats";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Legacy report shape — kept for backwards compatibility. */
export interface IntelligenceReport {
  claimId: number;
  detectedParts: DetectedPart[];
  quotedParts: QuotedPart[];
  reconciliation: ReconciliationResult;
  historicalDeviation: DeviationResult;
  countryContext: CountryRepairContext | null;
  riskLevel: RiskLevel;
  riskFactors: string[];
  generatedAt: string;
}

/** Enhanced report shape — adds all new intelligence layers. */
export interface EnhancedIntelligenceReport extends IntelligenceReport {
  // Layer 1
  quoteComparison: QuoteComparisonStats;
  garageQuotes: GarageQuoteSummary[];
  // Layer 2
  repairRatio: RepairRatioResult;
  // Layer 3
  repairCostBenchmark: RepairCostBenchmark | null;
  // Layer 5
  partsCertainty: PartsCertaintyResult;
  // Layer 6
  confidence: ConfidenceResult;
  // Formatted recommendation text (mirrors spec output format)
  aiRecommendation: AiRecommendationOutput;
}

export interface GarageQuoteSummary {
  garageName: string;
  totalAmount: number;          // currency minor units (cents)
  isOutlier: boolean;
  deviationFromMedian: number | null; // percentage
}

export interface RepairCostBenchmark {
  vehicleMake: string;
  vehicleModel: string;
  damageCategory: string;
  country: string;
  medianRepairCost: number;     // currency minor units (cents)
  minRepairCost: number;
  maxRepairCost: number;
  claimCount: number;
  intelligenceConfidence: "low" | "medium" | "high";
}

export interface AiRecommendationOutput {
  quotesAnalysed: number;
  garageComparison: GarageComparisonLine[];
  medianRepairCost: number;     // currency minor units (cents)
  fairRangeLow: number;         // currency minor units (cents)
  fairRangeHigh: number;        // currency minor units (cents)
  repairRatioPercentage: number | null;
  repairRatioCategory: string;
  confidenceScore: number;      // 0–100
  confidenceFactors: string[];
  disclaimer: string;
}

export interface GarageComparisonLine {
  garageName: string;
  amount: number;               // currency minor units (cents)
  isOutlier: boolean;
  outlierFlag?: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Generate the Enhanced Repair Quote Intelligence report for a claim.
 *
 * @param claimId     - The claim to analyse
 * @param tenantId    - Tenant scope
 * @param countryCode - Country for repair context (default "ZW")
 */
export async function generateIntelligenceReport(
  claimId: number,
  tenantId: string,
  countryCode: string = "ZW"
): Promise<EnhancedIntelligenceReport> {
  const db = await getDb();

  // ── 1. Fetch claim for vehicle info + market value ───────────────────────
  let vehicleMake: string | null = null;
  let vehicleModel: string | null = null;
  let vehicleYear: number | null = null;
  let vehicleMarketValue: number | null = null;

  if (db) {
    const [claim] = await db
      .select({
        vehicleMake: claims.vehicleMake,
        vehicleModel: claims.vehicleModel,
        vehicleYear: claims.vehicleYear,
        vehicleMarketValue: claims.vehicleMarketValue,
      })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);

    if (claim) {
      vehicleMake = claim.vehicleMake ?? null;
      vehicleModel = claim.vehicleModel ?? null;
      vehicleYear = claim.vehicleYear ?? null;
      vehicleMarketValue = claim.vehicleMarketValue ?? null;
    }
  }

  // ── 2. Fetch detected parts from latest AI assessment ────────────────────
  let detectedParts: DetectedPart[] = [];

  if (db) {
    const [assessment] = await db
      .select({ damagedComponentsJson: aiAssessments.damagedComponentsJson })
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(desc(aiAssessments.id))
      .limit(1);

    if (assessment?.damagedComponentsJson) {
      try {
        const parsed = JSON.parse(assessment.damagedComponentsJson);
        if (Array.isArray(parsed)) {
          detectedParts = parsed as DetectedPart[];
        }
      } catch {
        // Malformed JSON — treat as no detected parts
      }
    }
  }

  // ── 3. Fetch panel beater quotes ─────────────────────────────────────────
  let quotedParts: QuotedPart[] = [];
  let quoteEntries: QuoteEntry[] = [];

  if (db) {
    const quotes = await db
      .select({
        quotedAmount: panelBeaterQuotes.quotedAmount,
        laborCost: panelBeaterQuotes.laborCost,
        partsCost: panelBeaterQuotes.partsCost,
        componentsJson: panelBeaterQuotes.componentsJson,
        partsQuality: panelBeaterQuotes.partsQuality,
        status: panelBeaterQuotes.status,
        notes: panelBeaterQuotes.notes,
        id: panelBeaterQuotes.id,
        panelBeaterId: panelBeaterQuotes.panelBeaterId,
        businessName: panelBeaters.businessName,
        panelBeaterName: panelBeaters.name,
      })
      .from(panelBeaterQuotes)
      .leftJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
      .where(eq(panelBeaterQuotes.claimId, claimId));

    // Use submitted/accepted/modified quotes; fall back to all if none
    const submitted = quotes.filter((q) =>
      ["submitted", "accepted", "modified"].includes(q.status)
    );
    const relevantQuotes = submitted.length > 0 ? submitted : quotes;

    // Build QuoteEntry list for comparison stats
    quoteEntries = relevantQuotes.map((q, idx) => ({
      // businessName (NOT NULL) → name → fallback Garage A/B/C
      garageName: q.businessName || q.panelBeaterName || `Garage ${String.fromCharCode(65 + idx)}`,
      totalAmount: q.quotedAmount ?? 0,
      laborCost: q.laborCost,
      partsCost: q.partsCost,
      partsQuality: q.partsQuality,
      componentsJson: q.componentsJson,
    }));

    // Merge all components from all relevant quotes
    for (const q of relevantQuotes) {
      if (q.componentsJson) {
        try {
          const parsed = JSON.parse(q.componentsJson);
          if (Array.isArray(parsed)) {
            quotedParts.push(...(parsed as QuotedPart[]));
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  // ── 4. Layer 1: Quote Comparison Statistics ──────────────────────────────
  const quoteComparison = calculateQuoteComparisonStats(quoteEntries);

  // Build garage comparison list with outlier flags
  const outlierAmounts = new Set(quoteComparison.outliers.map((o) => o.amount));
  const garageQuotes: GarageQuoteSummary[] = quoteEntries.map((q) => ({
    garageName: q.garageName,
    totalAmount: q.totalAmount,
    isOutlier: outlierAmounts.has(q.totalAmount),
    deviationFromMedian:
      quoteComparison.medianQuote > 0
        ? Math.round(((q.totalAmount - quoteComparison.medianQuote) / quoteComparison.medianQuote) * 1000) / 10
        : null,
  }));

  // ── 5. Layer 2: Repair-to-Vehicle Value Ratio ────────────────────────────
  const repairRatio = calculateRepairRatio(
    quoteComparison.medianQuote,
    vehicleMarketValue
  );

  // ── 6. Layer 3: Historical Repair Intelligence lookup ────────────────────
  let repairCostBenchmark: RepairCostBenchmark | null = null;

  if (db && vehicleMake && vehicleModel) {
    // Determine damage category from detected parts (use first detected part's damage type)
    const damageCategory =
      detectedParts[0]?.damageType ?? detectedParts[0]?.name ?? "general";

    try {
      const [benchmark] = await db
        .select()
        .from(repairCostIntelligence)
        .where(
          and(
            sql`LOWER(${repairCostIntelligence.vehicleMake}) = LOWER(${vehicleMake})`,
            sql`LOWER(${repairCostIntelligence.vehicleModel}) = LOWER(${vehicleModel})`,
            eq(repairCostIntelligence.country, countryCode.toUpperCase())
          )
        )
        .orderBy(desc(repairCostIntelligence.lastUpdated))
        .limit(1);

      if (benchmark) {
        repairCostBenchmark = {
          vehicleMake: benchmark.vehicleMake,
          vehicleModel: benchmark.vehicleModel,
          damageCategory: benchmark.damageCategory,
          country: benchmark.country,
          medianRepairCost: benchmark.medianRepairCost,
          minRepairCost: benchmark.minRepairCost,
          maxRepairCost: benchmark.maxRepairCost,
          claimCount: benchmark.claimCount,
          intelligenceConfidence: benchmark.intelligenceConfidence,
        };
      }
    } catch {
      // Non-fatal — proceed without benchmark
    }
  }

  // ── 7. Layer 4: Country context ──────────────────────────────────────────
  let countryContext: CountryRepairContext | null = null;
  try {
    countryContext = await getCountryRepairContext(countryCode);
  } catch {
    // Non-fatal
  }

  // ── 8. Part reconciliation ───────────────────────────────────────────────
  const reconciliation = reconcileParts(detectedParts, quotedParts);

  // ── 9. Historical deviation (existing logic) ─────────────────────────────
  const historicalDeviation = await calculateHistoricalDeviation(
    tenantId,
    quoteComparison.medianQuote,
    vehicleMake,
    vehicleModel
  );

  // ── 10. Layer 5: Parts Certainty ─────────────────────────────────────────
  const partsCertainty = calculatePartsCertainty(quoteEntries);

  // ── 11. Layer 6: Confidence Score ────────────────────────────────────────
  const confidence = calculateConfidenceScore({
    quoteCount: quoteEntries.length,
    historicalConfidence: historicalDeviation.confidence,
    partsCertainty: partsCertainty.level,
    hasVehicleMarketValue: vehicleMarketValue !== null && vehicleMarketValue > 0,
    historicalSampleSize: historicalDeviation.sampleSize,
  });

  // ── 12. Risk classification ──────────────────────────────────────────────
  const { riskLevel, riskFactors } = classifyRisk(reconciliation, historicalDeviation);

  // ── 13. Layer 6: AI Recommendation Output ───────────────────────────────
  const garageComparisonLines: GarageComparisonLine[] = garageQuotes.map((g) => ({
    garageName: g.garageName,
    amount: g.totalAmount,
    isOutlier: g.isOutlier,
    outlierFlag: g.isOutlier ? "Potential cost outlier" : undefined,
  }));

  const aiRecommendation: AiRecommendationOutput = {
    quotesAnalysed: quoteEntries.length,
    garageComparison: garageComparisonLines,
    medianRepairCost: quoteComparison.medianQuote,
    fairRangeLow: quoteComparison.fairRangeLow,
    fairRangeHigh: quoteComparison.fairRangeHigh,
    repairRatioPercentage: repairRatio.ratioPercentage,
    repairRatioCategory: repairRatio.category,
    confidenceScore: confidence.score,
    confidenceFactors: confidence.factors,
    disclaimer:
      "The claims processor remains the final decision maker. This analysis is advisory only.",
  };

  return {
    claimId,
    detectedParts,
    quotedParts,
    reconciliation,
    historicalDeviation,
    countryContext,
    riskLevel,
    riskFactors,
    generatedAt: new Date().toISOString(),
    // Enhanced layers
    quoteComparison,
    garageQuotes,
    repairRatio,
    repairCostBenchmark,
    partsCertainty,
    confidence,
    aiRecommendation,
  };
}
