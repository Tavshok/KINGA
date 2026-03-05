/**
 * Quote Comparison Statistics
 *
 * Layer 1: Quote Comparison Intelligence
 *   - Calculates median, min, max, spread percentage across all submitted quotes
 *   - Identifies statistical outliers using threshold = median × 1.35
 *   - Flags outliers as "Potential cost outlier" — advisory only, never rejects quotes
 *
 * Layer 2: Repair-to-Vehicle Value Ratio
 *   - repair_ratio = quote_total / vehicle_market_value
 *   - Classifies: minor (<20%), moderate (20–40%), major (40–60%), near write-off (>60%)
 *   - Only calculated when vehicle_market_value is provided
 *
 * Layer 5: Parts Certainty Score
 *   - Classifies each quoted part as OEM, Aftermarket, or Unknown
 *   - Reduces confidence score when part type is unspecified
 *
 * SAFETY GUARDRAILS:
 *   - Never fabricates expected part prices
 *   - Never guesses costs for specific parts
 *   - Reduces confidence when data is limited
 *   - All analysis is relative — based on quote comparison only
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteEntry {
  garageName: string;
  totalAmount: number;          // ZAR cents
  laborCost?: number | null;
  partsCost?: number | null;
  partsQuality?: string | null; // "oem" | "aftermarket" | "genuine" | "used" | null
  componentsJson?: string | null;
}

export interface QuoteComparisonStats {
  quoteCount: number;
  minQuote: number;             // ZAR cents
  maxQuote: number;             // ZAR cents
  medianQuote: number;          // ZAR cents
  averageQuote: number;         // ZAR cents
  spreadPercentage: number;     // (max - min) / median × 100
  outlierThreshold: number;     // median × 1.35
  outliers: OutlierEntry[];
  fairRangeLow: number;         // 5th percentile equivalent (min non-outlier)
  fairRangeHigh: number;        // outlier threshold
  recommendedQuote: number;     // lowest non-outlier quote
}

export interface OutlierEntry {
  garageName: string;
  amount: number;               // ZAR cents
  deviationFromMedian: number;  // percentage above median
  flag: "Potential cost outlier";
}

export type RepairRatioCategory =
  | "minor"
  | "moderate"
  | "major"
  | "near_write_off"
  | "unknown";

export interface RepairRatioResult {
  ratio: number | null;           // 0–1 (or null if no vehicle value)
  ratioPercentage: number | null; // 0–100
  category: RepairRatioCategory;
  vehicleMarketValue: number | null; // ZAR cents
  repairCost: number;               // ZAR cents (median quote used)
}

export type PartsCertaintyLevel = "high" | "medium" | "low";

export interface PartsCertaintyResult {
  level: PartsCertaintyLevel;
  oemCount: number;
  aftermarketCount: number;
  unknownCount: number;
  totalParts: number;
  summary: string;
}

// ─── Layer 1: Quote Comparison Statistics ────────────────────────────────────

const OUTLIER_MULTIPLIER = 1.35;

/**
 * Calculate comparative statistics across all submitted quotes.
 * Outliers are flagged at median × 1.35 — advisory only.
 */
export function calculateQuoteComparisonStats(quotes: QuoteEntry[]): QuoteComparisonStats {
  if (quotes.length === 0) {
    return {
      quoteCount: 0,
      minQuote: 0,
      maxQuote: 0,
      medianQuote: 0,
      averageQuote: 0,
      spreadPercentage: 0,
      outlierThreshold: 0,
      outliers: [],
      fairRangeLow: 0,
      fairRangeHigh: 0,
      recommendedQuote: 0,
    };
  }

  const amounts = quotes.map((q) => q.totalAmount).sort((a, b) => a - b);
  const quoteCount = amounts.length;

  const minQuote = amounts[0];
  const maxQuote = amounts[quoteCount - 1];
  const averageQuote = Math.round(amounts.reduce((s, a) => s + a, 0) / quoteCount);

  // Median
  const mid = Math.floor(quoteCount / 2);
  const medianQuote =
    quoteCount % 2 === 0
      ? Math.round((amounts[mid - 1] + amounts[mid]) / 2)
      : amounts[mid];

  const spreadPercentage =
    medianQuote > 0
      ? Math.round(((maxQuote - minQuote) / medianQuote) * 1000) / 10
      : 0;

  const outlierThreshold = Math.round(medianQuote * OUTLIER_MULTIPLIER);

  // Identify outliers
  const outliers: OutlierEntry[] = quotes
    .filter((q) => q.totalAmount > outlierThreshold)
    .map((q) => ({
      garageName: q.garageName,
      amount: q.totalAmount,
      deviationFromMedian:
        medianQuote > 0
          ? Math.round(((q.totalAmount - medianQuote) / medianQuote) * 1000) / 10
          : 0,
      flag: "Potential cost outlier" as const,
    }));

  // Fair range: non-outlier quotes
  const nonOutlierAmounts = amounts.filter((a) => a <= outlierThreshold);
  const fairRangeLow = nonOutlierAmounts.length > 0 ? nonOutlierAmounts[0] : minQuote;
  const fairRangeHigh = outlierThreshold;
  const recommendedQuote = nonOutlierAmounts.length > 0 ? nonOutlierAmounts[0] : minQuote;

  return {
    quoteCount,
    minQuote,
    maxQuote,
    medianQuote,
    averageQuote,
    spreadPercentage,
    outlierThreshold,
    outliers,
    fairRangeLow,
    fairRangeHigh,
    recommendedQuote,
  };
}

// ─── Layer 2: Repair-to-Vehicle Value Ratio ───────────────────────────────────

/**
 * Calculate the repair-to-vehicle-value ratio.
 * Uses the median quote as the repair cost reference.
 *
 * Classification:
 *   <20%  = minor repair
 *   20–40% = moderate repair
 *   40–60% = major repair
 *   >60%  = near economic write-off
 */
export function calculateRepairRatio(
  medianQuoteCents: number,
  vehicleMarketValueCents: number | null
): RepairRatioResult {
  if (!vehicleMarketValueCents || vehicleMarketValueCents <= 0) {
    return {
      ratio: null,
      ratioPercentage: null,
      category: "unknown",
      vehicleMarketValue: vehicleMarketValueCents,
      repairCost: medianQuoteCents,
    };
  }

  const ratio = medianQuoteCents / vehicleMarketValueCents;
  const ratioPercentage = Math.round(ratio * 1000) / 10;

  let category: RepairRatioCategory;
  if (ratio < 0.20) {
    category = "minor";
  } else if (ratio < 0.40) {
    category = "moderate";
  } else if (ratio < 0.60) {
    category = "major";
  } else {
    category = "near_write_off";
  }

  return {
    ratio: Math.round(ratio * 10000) / 10000,
    ratioPercentage,
    category,
    vehicleMarketValue: vehicleMarketValueCents,
    repairCost: medianQuoteCents,
  };
}

// ─── Layer 5: Parts Certainty Score ──────────────────────────────────────────

const OEM_KEYWORDS = ["oem", "genuine", "original equipment"];
const AFTERMARKET_KEYWORDS = ["aftermarket", "pattern", "non-oem", "compatible"];

/**
 * Classify parts certainty from the partsQuality field and component names.
 * If a quote does not specify part type, certainty = LOW.
 * This affects confidence score but does NOT invalidate the quote.
 */
export function calculatePartsCertainty(quotes: QuoteEntry[]): PartsCertaintyResult {
  let oemCount = 0;
  let aftermarketCount = 0;
  let unknownCount = 0;

  for (const quote of quotes) {
    const quality = (quote.partsQuality ?? "").toLowerCase();

    if (OEM_KEYWORDS.some((k) => quality.includes(k))) {
      oemCount++;
    } else if (AFTERMARKET_KEYWORDS.some((k) => quality.includes(k)) || quality === "used") {
      aftermarketCount++;
    } else {
      unknownCount++;
    }
  }

  const totalParts = quotes.length;
  const unknownRatio = totalParts > 0 ? unknownCount / totalParts : 1;

  let level: PartsCertaintyLevel;
  if (unknownRatio === 0) {
    level = "high";
  } else if (unknownRatio <= 0.5) {
    level = "medium";
  } else {
    level = "low";
  }

  const parts: string[] = [];
  if (oemCount > 0) parts.push(`${oemCount} OEM`);
  if (aftermarketCount > 0) parts.push(`${aftermarketCount} aftermarket`);
  if (unknownCount > 0) parts.push(`${unknownCount} unspecified`);

  const summary =
    parts.length > 0
      ? `Parts classification: ${parts.join(", ")}`
      : "No parts classification available";

  return { level, oemCount, aftermarketCount, unknownCount, totalParts, summary };
}

// ─── Layer 6: Confidence Score Calculator ────────────────────────────────────

export interface ConfidenceFactors {
  quoteCount: number;
  historicalConfidence: "high" | "medium" | "low";
  partsCertainty: PartsCertaintyLevel;
  hasVehicleMarketValue: boolean;
  historicalSampleSize: number;
}

export interface ConfidenceResult {
  score: number;          // 0–100
  factors: string[];      // Human-readable explanations
}

/**
 * Calculate an overall confidence score for the AI recommendation.
 *
 * Scoring:
 *   - Quote count:          +25 for 3+, +15 for 2, +0 for 1
 *   - Historical data:      +30 for high, +20 for medium, +5 for low
 *   - Parts certainty:      +20 for high, +10 for medium, +0 for low
 *   - Vehicle market value: +15 if available, +0 if not
 *   - Minimum floor:        10 (always some signal from quotes)
 *
 * SAFETY: Score is reduced, never inflated, when data is limited.
 */
export function calculateConfidenceScore(factors: ConfidenceFactors): ConfidenceResult {
  let score = 10; // baseline
  const explanations: string[] = [];

  // Quote count contribution
  if (factors.quoteCount >= 3) {
    score += 25;
    explanations.push(`${factors.quoteCount} quotes analysed`);
  } else if (factors.quoteCount === 2) {
    score += 15;
    explanations.push(`${factors.quoteCount} quotes analysed (3+ recommended)`);
  } else if (factors.quoteCount === 1) {
    score += 5;
    explanations.push("only 1 quote — comparison not possible");
  } else {
    explanations.push("no quotes available");
  }

  // Historical data contribution
  if (factors.historicalConfidence === "high") {
    score += 30;
    explanations.push(`strong historical data (${factors.historicalSampleSize} similar claims)`);
  } else if (factors.historicalConfidence === "medium") {
    score += 20;
    explanations.push(`moderate historical data (${factors.historicalSampleSize} similar claims)`);
  } else {
    score += 5;
    explanations.push(
      factors.historicalSampleSize === 0
        ? "no historical data for this vehicle/damage type"
        : `limited historical data (${factors.historicalSampleSize} similar claims)`
    );
  }

  // Parts certainty contribution
  if (factors.partsCertainty === "high") {
    score += 20;
    explanations.push("parts classification fully specified");
  } else if (factors.partsCertainty === "medium") {
    score += 10;
    explanations.push("parts classification partially specified");
  } else {
    explanations.push("parts classification unknown");
  }

  // Vehicle market value contribution
  if (factors.hasVehicleMarketValue) {
    score += 15;
    explanations.push("vehicle market value available for ratio analysis");
  } else {
    explanations.push("vehicle market value not provided — repair ratio unavailable");
  }

  return {
    score: Math.min(100, Math.max(10, score)),
    factors: explanations,
  };
}
