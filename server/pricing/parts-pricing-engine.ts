/**
 * Parts Pricing Engine
 * 
 * Calculates market-based pricing for automotive parts with:
 * - Part stratification (OEM, OEM Equivalent, Aftermarket, Used)
 * - Regional pricing (SA baseline + Zimbabwe/other market multipliers)
 * - Currency conversion (ZAR, USD, ZWL, BWP, JPY, AED, THB)
 * - Import cost calculation (shipping, duty, clearing, forex)
 * - Vehicle origin intelligence (ex-Japanese parts sourcing optimization)
 * 
 * Supports continuous improvement through:
 * - Supplier quote ingestion
 * - Historical claims data
 * - Web scraping (SA public sites)
 */

import { getDb } from "../db";
import { partsPricingBaseline } from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

export interface PartPricingQuery {
  partName: string;
  partNumber?: string;
  partType?: "OEM" | "OEM_Equivalent" | "Aftermarket" | "Used";
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleOrigin?: "Local_Assembly" | "Ex_Japanese" | "Ex_European" | "Ex_American" | "Ex_Chinese";
  targetRegion: string; // e.g., "Zimbabwe", "South Africa", "Botswana"
  targetCurrency: string; // e.g., "ZWL", "USD", "ZAR", "BWP"
}

export interface PartPricingResult {
  partName: string;
  partType: string;
  
  // Pricing breakdown
  basePrice: number; // In target currency
  baseCurrency: string;
  
  // Regional adjustments (for imports)
  transportCost?: number;
  customsDuty?: number;
  clearingFees?: number;
  forexCharges?: number;
  
  // Total landed cost
  totalPrice: number;
  targetCurrency: string;
  
  // Pricing range (min-max from market data)
  priceRange: {
    min: number;
    max: number;
    median: number;
    count: number; // Number of data points
  };
  
  // Sourcing intelligence
  recommendedSource: "Local" | "Import_SA" | "Import_Japan" | "Import_UAE" | "Import_Thailand";
  leadTimeDays?: number;
  
  // Data quality
  confidence: number; // 0.0-1.0 based on data freshness and quantity
  dataPoints: number; // Number of pricing records used
  lastUpdated: Date;
  
  // Sources
  sources: string[]; // e.g., ["supplier_quote", "historical_claim", "web_scrape"]
}

/**
 * Regional pricing configuration
 * Multipliers for converting SA baseline prices to other markets
 */
export const REGIONAL_MULTIPLIERS = {
  "South Africa": {
    transport: 1.0,
    duty: 1.0,
    handling: 1.0,
    forex: 1.0,
  },
  "Zimbabwe": {
    transport: 1.25, // 25% markup for transport from SA
    duty: 1.40, // 40% customs duty
    handling: 1.10, // 10% clearing/handling fees
    forex: 1.05, // 5% forex charges
  },
  "Botswana": {
    transport: 1.15,
    duty: 1.25,
    handling: 1.08,
    forex: 1.03,
  },
  "Zambia": {
    transport: 1.30,
    duty: 1.35,
    handling: 1.12,
    forex: 1.06,
  },
  "Mozambique": {
    transport: 1.20,
    duty: 1.30,
    handling: 1.10,
    forex: 1.05,
  },
};

/**
 * Default exchange rates (fallback if database/API unavailable)
 * Base currency: USD
 * In production, these are fetched from currencyExchangeRates table or live API
 */
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  ZAR: 18.50, // South African Rand
  ZWL: 27500.0, // Zimbabwe Gold
  BWP: 13.50, // Botswana Pula
  ZMW: 27.0, // Zambian Kwacha
  MZN: 63.0, // Mozambican Metical
  JPY: 150.0, // Japanese Yen
  AED: 3.67, // UAE Dirham
  THB: 35.0, // Thai Baht
  EUR: 0.92, // Euro
  GBP: 0.79, // British Pound
  CNY: 7.24, // Chinese Yuan
  // Add more as needed - system accepts any ISO currency code
};

/**
 * Part type quality multipliers
 * OEM is baseline (1.0), others are relative to OEM
 */
export const PART_TYPE_MULTIPLIERS = {
  OEM: 1.0,
  OEM_Equivalent: 0.85, // 15% cheaper than OEM
  Aftermarket: 0.65, // 35% cheaper than OEM
  Used: 0.40, // 60% cheaper than OEM
};

/**
 * Convert price from one currency to another using dynamic exchange rates
 * Supports unlimited currencies - fetches rates from database or uses defaults
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) return amount;
  
  // Try to get rates from database first
  const rates = await getExchangeRates();
  
  const fromRate = rates[fromCurrency] || DEFAULT_EXCHANGE_RATES[fromCurrency] || 1.0;
  const toRate = rates[toCurrency] || DEFAULT_EXCHANGE_RATES[toCurrency] || 1.0;
  
  // Convert to USD first, then to target currency
  const usdAmount = amount / fromRate;
  const targetAmount = usdAmount * toRate;
  
  return Math.round(targetAmount * 100) / 100; // Round to 2 decimal places
}

/**
 * Get exchange rates from database (or cache)
 * Returns Record<currencyCode, rateToUSD>
 */
let exchangeRatesCache: Record<string, number> | null = null;
let exchangeRatesCacheTime = 0;
const CACHE_TTL = 3600000; // 1 hour

export async function getExchangeRates(): Promise<Record<string, number>> {
  // Return cached rates if fresh
  if (exchangeRatesCache && Date.now() - exchangeRatesCacheTime < CACHE_TTL) {
    return exchangeRatesCache;
  }
  
  try {
    const db = await getDb();
    if (!db) {
      return DEFAULT_EXCHANGE_RATES;
    }
    
    // TODO: Query currencyExchangeRates table when it exists
    // For now, return defaults
    exchangeRatesCache = { ...DEFAULT_EXCHANGE_RATES };
    exchangeRatesCacheTime = Date.now();
    
    return exchangeRatesCache;
  } catch (error) {
    console.error("Failed to fetch exchange rates:", error);
    return DEFAULT_EXCHANGE_RATES;
  }
}

/**
 * Synchronous currency conversion using cached rates (for non-async contexts)
 */
export function convertCurrencySync(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency === toCurrency) return amount;
  
  const rates = exchangeRatesCache || DEFAULT_EXCHANGE_RATES;
  const fromRate = rates[fromCurrency] || 1.0;
  const toRate = rates[toCurrency] || 1.0;
  
  const usdAmount = amount / fromRate;
  const targetAmount = usdAmount * toRate;
  
  return Math.round(targetAmount * 100) / 100;
}

/**
 * Calculate regional adjustments for imported parts
 */
export function calculateRegionalAdjustments(
  basePrice: number,
  targetRegion: string
): {
  transportCost: number;
  customsDuty: number;
  clearingFees: number;
  forexCharges: number;
  totalPrice: number;
} {
  const multipliers = REGIONAL_MULTIPLIERS[targetRegion as keyof typeof REGIONAL_MULTIPLIERS] || {
    transport: 1.0,
    duty: 1.0,
    handling: 1.0,
    forex: 1.0,
  };
  
  const transportCost = basePrice * (multipliers.transport - 1.0);
  const customsDuty = basePrice * (multipliers.duty - 1.0);
  const clearingFees = basePrice * (multipliers.handling - 1.0);
  const forexCharges = basePrice * (multipliers.forex - 1.0);
  
  const totalPrice = basePrice + transportCost + customsDuty + clearingFees + forexCharges;
  
  return {
    transportCost: Math.round(transportCost * 100) / 100,
    customsDuty: Math.round(customsDuty * 100) / 100,
    clearingFees: Math.round(clearingFees * 100) / 100,
    forexCharges: Math.round(forexCharges * 100) / 100,
    totalPrice: Math.round(totalPrice * 100) / 100,
  };
}

/**
 * Determine optimal sourcing strategy based on vehicle origin
 */
export function determineOptimalSource(
  vehicleOrigin?: string,
  partType?: string
): "Local" | "Import_SA" | "Import_Japan" | "Import_UAE" | "Import_Thailand" {
  // Ex-Japanese vehicles: prioritize Japanese/Asian sources for OEM parts
  if (vehicleOrigin === "Ex_Japanese" && partType === "OEM") {
    return "Import_Japan";
  }
  
  // Ex-European vehicles: prioritize SA/local sources
  if (vehicleOrigin === "Ex_European") {
    return "Import_SA";
  }
  
  // Aftermarket parts: prioritize local/SA sources (cheaper, faster)
  if (partType === "Aftermarket" || partType === "Used") {
    return "Local";
  }
  
  // Default: SA import (good balance of quality, cost, lead time)
  return "Import_SA";
}

/**
 * Get market pricing for a specific part
 */
export async function getPartPricing(query: PartPricingQuery): Promise<PartPricingResult | null> {
  const dbInstance = await getDb();
  if (!dbInstance) {
    throw new Error("Database connection not available");
  }
  
  // Build query conditions
  const conditions = [
    eq(partsPricingBaseline.partName, query.partName)
  ];
  
  if (query.partNumber) {
    conditions.push(eq(partsPricingBaseline.partNumber, query.partNumber));
  }
  
  if (query.partType) {
    conditions.push(eq(partsPricingBaseline.partType, query.partType));
  }
  
  if (query.vehicleMake) {
    conditions.push(eq(partsPricingBaseline.vehicleMake, query.vehicleMake));
  }
  
  if (query.vehicleModel) {
    conditions.push(eq(partsPricingBaseline.vehicleModel, query.vehicleModel));
  }
  
  // Fetch pricing data from baseline
  const pricingData = await dbInstance
    .select()
    .from(partsPricingBaseline)
    .where(and(...conditions))
    .orderBy(desc(partsPricingBaseline.lastUpdated))
    .limit(50); // Get up to 50 recent data points
  
  if (pricingData.length === 0) {
    return null; // No pricing data available
  }
  
  // Convert all prices to target currency
  const convertedPrices = await Promise.all(
    pricingData.map(async (record: any) => {
      const price = typeof record.saBasePrice === 'string' ? parseFloat(record.saBasePrice) : record.saBasePrice;
      return await convertCurrency(price, record.currency, query.targetCurrency);
    })
  );
  
  // Calculate price range statistics
  const sortedPrices = convertedPrices.sort((a: number, b: number) => a - b);
  const minPrice = sortedPrices[0];
  const maxPrice = sortedPrices[sortedPrices.length - 1];
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
  
  // Use median as base price
  let basePrice = medianPrice;
  
  // Apply part type multiplier if querying different quality level
  if (query.partType && pricingData[0].partType !== query.partType) {
    const sourceMultiplier = PART_TYPE_MULTIPLIERS[pricingData[0].partType as keyof typeof PART_TYPE_MULTIPLIERS] || 1.0;
    const targetMultiplier = PART_TYPE_MULTIPLIERS[query.partType as keyof typeof PART_TYPE_MULTIPLIERS] || 1.0;
    basePrice = basePrice * (targetMultiplier / sourceMultiplier);
  }
  
  // Calculate regional adjustments if target region is not SA
  let regionalAdjustments = {
    transportCost: 0,
    customsDuty: 0,
    clearingFees: 0,
    forexCharges: 0,
    totalPrice: basePrice,
  };
  
  if (query.targetRegion !== "South Africa") {
    regionalAdjustments = calculateRegionalAdjustments(basePrice, query.targetRegion);
  }
  
  // Determine optimal sourcing strategy
  const recommendedSource = determineOptimalSource(query.vehicleOrigin, query.partType);
  
  // Calculate confidence based on data freshness and quantity
  const avgAge = pricingData.reduce((sum: number, record: any) => {
    const ageInDays = (Date.now() - new Date(record.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
    return sum + ageInDays;
  }, 0) / pricingData.length;
  
  const freshnessScore = Math.max(0, 1 - (avgAge / 365)); // Decay over 1 year
  const quantityScore = Math.min(1, pricingData.length / 10); // Max score at 10+ data points
  const confidence = (freshnessScore * 0.6 + quantityScore * 0.4);
  
  // Collect unique sources
  const sources = Array.from(new Set(pricingData.map((record: any) => record.source))) as string[];
  
  // Estimate lead time based on recommended source
  const leadTimeDays = 
    recommendedSource === "Local" ? 1 :
    recommendedSource === "Import_SA" ? 3 :
    recommendedSource === "Import_Japan" ? 21 :
    recommendedSource === "Import_UAE" ? 14 :
    recommendedSource === "Import_Thailand" ? 18 : 7;
  
  return {
    partName: query.partName,
    partType: query.partType || "Unknown",
    basePrice: Math.round(basePrice * 100) / 100,
    baseCurrency: query.targetCurrency,
    transportCost: regionalAdjustments.transportCost > 0 ? regionalAdjustments.transportCost : undefined,
    customsDuty: regionalAdjustments.customsDuty > 0 ? regionalAdjustments.customsDuty : undefined,
    clearingFees: regionalAdjustments.clearingFees > 0 ? regionalAdjustments.clearingFees : undefined,
    forexCharges: regionalAdjustments.forexCharges > 0 ? regionalAdjustments.forexCharges : undefined,
    totalPrice: regionalAdjustments.totalPrice,
    targetCurrency: query.targetCurrency,
    priceRange: {
      min: Math.round(minPrice * 100) / 100,
      max: Math.round(maxPrice * 100) / 100,
      median: Math.round(medianPrice * 100) / 100,
      count: pricingData.length,
    },
    recommendedSource,
    leadTimeDays,
    confidence: Math.round(confidence * 100) / 100,
    dataPoints: pricingData.length,
    lastUpdated: new Date(pricingData[0].lastUpdated),
    sources,
  };
}

/**
 * Compare quoted part price against market pricing
 * Returns deviation percentage and overcharge flag
 */
export async function compareQuotedVsMarket(
  quotedPrice: number,
  quotedCurrency: string,
  query: PartPricingQuery
): Promise<{
  quotedPrice: number;
  marketPrice: number;
  deviation: number; // Percentage deviation (positive = overcharged)
  deviationAmount: number;
  isOvercharged: boolean; // True if deviation > 20%
  confidence: number;
  marketData: PartPricingResult | null;
}> {
  const marketData = await getPartPricing(query);
  
  if (!marketData) {
    return {
      quotedPrice,
      marketPrice: 0,
      deviation: 0,
      deviationAmount: 0,
      isOvercharged: false,
      confidence: 0,
      marketData: null,
    };
  }
  
  // Convert quoted price to target currency if needed
  const quotedInTargetCurrency = await convertCurrency(quotedPrice, quotedCurrency, query.targetCurrency);
  
  // Calculate deviation
  const deviationAmount = quotedInTargetCurrency - marketData.totalPrice;
  const deviation = (deviationAmount / marketData.totalPrice) * 100;
  
  return {
    quotedPrice: quotedInTargetCurrency,
    marketPrice: marketData.totalPrice,
    deviation: Math.round(deviation * 100) / 100,
    deviationAmount: Math.round(deviationAmount * 100) / 100,
    isOvercharged: deviation > 20, // Flag if >20% above market
    confidence: marketData.confidence,
    marketData,
  };
}

/**
 * Batch pricing lookup for multiple parts
 */
export async function batchGetPartPricing(
  queries: PartPricingQuery[]
): Promise<(PartPricingResult | null)[]> {
  return Promise.all(queries.map(query => getPartPricing(query)));
}

/**
 * Get pricing statistics for a part category
 */
export async function getPartCategoryStats(
  partCategory: string,
  targetRegion: string,
  targetCurrency: string
): Promise<{
  category: string;
  totalParts: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  currency: string;
}> {
  const dbInstance = await getDb();
  if (!dbInstance) {
    throw new Error("Database connection not available");
  }
  
  const stats = await dbInstance
    .select({
      count: sql<number>`COUNT(*)`,
      avgPrice: sql<number>`AVG(${partsPricingBaseline.saBasePrice})`,
      minPrice: sql<number>`MIN(${partsPricingBaseline.saBasePrice})`,
      maxPrice: sql<number>`MAX(${partsPricingBaseline.saBasePrice})`,
    })
    .from(partsPricingBaseline)
    .where(eq(partsPricingBaseline.partCategory, partCategory));
  
  const result = stats[0];
  
  // Convert prices to target currency (assuming baseline is in ZAR)
  const avgPrice = await convertCurrency(result.avgPrice || 0, "ZAR", targetCurrency);
  const minPrice = await convertCurrency(result.minPrice || 0, "ZAR", targetCurrency);
  const maxPrice = await convertCurrency(result.maxPrice || 0, "ZAR", targetCurrency);
  
  return {
    category: partCategory,
    totalParts: result.count || 0,
    avgPrice: Math.round(avgPrice * 100) / 100,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    currency: targetCurrency,
  };
}
