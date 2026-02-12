import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getDb } from "../db";
import { claims, aiAssessments, vehicleMarketValuations } from "../../drizzle/schema";

/**
 * Vehicle Valuation Engine
 * 
 * Leverages existing KINGA claims data to generate accurate vehicle valuations.
 * Uses historical claims, repair costs, and market data to estimate current vehicle value.
 */

export interface VehicleValuationRequest {
  make: string;
  model: string;
  year: number;
  registrationNumber?: string;
  condition?: "excellent" | "good" | "fair" | "poor";
  mileage?: number;
}

export interface VehicleValuationResult {
  estimatedValue: number; // In cents
  confidence: number; // 0-100
  source: string;
  factors: {
    baseValue: number;
    conditionAdjustment: number;
    ageAdjustment: number;
    marketDemand: number;
  };
  comparables: Array<{
    claimId: number;
    vehicleYear: number;
    estimatedValue: number;
    date: Date;
  }>;
}

/**
 * Generate vehicle valuation using KINGA claims intelligence
 */
export async function generateVehicleValuation(
  request: VehicleValuationRequest
): Promise<VehicleValuationResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Step 1: Check if we have recent market valuation data
  const marketValuation = await getMarketValuation(request.make, request.model, request.year);
  if (marketValuation) {
    return {
      estimatedValue: marketValuation.estimatedMarketValue || 0,
      confidence: marketValuation.confidenceScore || 90,
      source: "Market Data",
      factors: {
        baseValue: marketValuation.estimatedMarketValue || 0,
        conditionAdjustment: 0,
        ageAdjustment: 0,
        marketDemand: 0,
      },
      comparables: [],
    };
  }

  // Step 2: Use claims data to estimate value
  const claimsValuation = await getClaimsBasedValuation(request.make, request.model, request.year);
  
  // Step 3: Apply condition and age adjustments
  const baseValue = claimsValuation.averageValue;
  const conditionAdjustment = calculateConditionAdjustment(baseValue, request.condition || "good");
  const ageAdjustment = calculateAgeAdjustment(baseValue, request.year);
  const marketDemand = calculateMarketDemand(claimsValuation.claimFrequency);

  const estimatedValue = Math.round(
    baseValue + conditionAdjustment + ageAdjustment + marketDemand
  );

  return {
    estimatedValue,
    confidence: claimsValuation.confidence,
    source: "KINGA Claims Intelligence",
    factors: {
      baseValue,
      conditionAdjustment,
      ageAdjustment,
      marketDemand,
    },
    comparables: claimsValuation.comparables,
  };
}

/**
 * Get market valuation from vehicle_market_valuations table
 */
async function getMarketValuation(
  make: string,
  model: string,
  year: number
): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db
    .select()
    .from(vehicleMarketValuations)
    .where(
      and(
        eq(vehicleMarketValuations.vehicleMake, make),
        eq(vehicleMarketValuations.vehicleModel, model),
        eq(vehicleMarketValuations.vehicleYear, year)
      )
    )
    .orderBy(desc(vehicleMarketValuations.id))
    .limit(1);

  return result[0] || null;
}

/**
 * Calculate valuation based on historical claims data
 */
async function getClaimsBasedValuation(
  make: string,
  model: string,
  year: number
): Promise<{
  averageValue: number;
  confidence: number;
  claimFrequency: number;
  comparables: Array<{
    claimId: number;
    vehicleYear: number;
    estimatedValue: number;
    date: Date;
  }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Find similar vehicles in claims database
  const similarClaims = await db
    .select({
      claimId: claims.id,
      vehicleYear: claims.vehicleYear,
      estimatedValue: aiAssessments.estimatedVehicleValue,
      createdAt: claims.createdAt,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(
      and(
        eq(claims.vehicleMake, make),
        eq(claims.vehicleModel, model),
        gte(claims.vehicleYear, year - 2), // Within 2 years
        sql`${aiAssessments.estimatedVehicleValue} IS NOT NULL`
      )
    )
    .orderBy(desc(claims.createdAt))
    .limit(20);

  if (similarClaims.length === 0) {
    // No data available, use fallback estimation
    return {
      averageValue: estimateFallbackValue(year),
      confidence: 30,
      claimFrequency: 0,
      comparables: [],
    };
  }

  // Calculate average value from similar claims
  const values = similarClaims
    .filter((c: any) => c.estimatedValue !== null)
    .map((c: any) => c.estimatedValue as number);

  const averageValue = Math.round(values.reduce((sum: number, val: number) => sum + val, 0) / values.length);

  // Confidence based on sample size and recency
  const confidence = Math.min(30 + similarClaims.length * 3, 85);

  // Claim frequency (how common this vehicle is)
  const claimFrequency = similarClaims.length;

  const comparables = similarClaims.map((c: any) => ({
    claimId: c.claimId,
    vehicleYear: c.vehicleYear || year,
    estimatedValue: c.estimatedValue || 0,
    date: c.createdAt,
  }));

  return {
    averageValue,
    confidence,
    claimFrequency,
    comparables,
  };
}

/**
 * Calculate condition adjustment factor
 */
function calculateConditionAdjustment(
  baseValue: number,
  condition: "excellent" | "good" | "fair" | "poor"
): number {
  const adjustments = {
    excellent: 0.15, // +15%
    good: 0, // No adjustment
    fair: -0.15, // -15%
    poor: -0.30, // -30%
  };

  return Math.round(baseValue * adjustments[condition]);
}

/**
 * Calculate age-based depreciation adjustment
 */
function calculateAgeAdjustment(baseValue: number, year: number): number {
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;

  // Depreciation rate: 15% first year, then 10% per year
  let depreciationRate = 0;
  if (age === 0) {
    depreciationRate = 0;
  } else if (age === 1) {
    depreciationRate = 0.15;
  } else {
    depreciationRate = 0.15 + (age - 1) * 0.10;
  }

  // Cap depreciation at 80%
  depreciationRate = Math.min(depreciationRate, 0.80);

  return Math.round(-baseValue * depreciationRate);
}

/**
 * Calculate market demand adjustment based on claim frequency
 */
function calculateMarketDemand(claimFrequency: number): number {
  // Higher claim frequency indicates higher market presence/demand
  // Adjust value slightly based on popularity
  if (claimFrequency > 15) {
    return 50000; // Popular vehicle, +$500
  } else if (claimFrequency > 10) {
    return 25000; // Moderate demand, +$250
  } else if (claimFrequency > 5) {
    return 0; // Average demand
  } else {
    return -25000; // Low demand, -$250
  }
}

/**
 * Fallback estimation when no claims data available
 */
function estimateFallbackValue(year: number): number {
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;

  // Start with average vehicle value
  const baseValue = 1500000; // $15,000 base

  // Apply depreciation
  const depreciationRate = age === 0 ? 0 : 0.15 + (age - 1) * 0.10;
  const depreciation = Math.min(depreciationRate, 0.80);

  return Math.round(baseValue * (1 - depreciation));
}

/**
 * Calculate risk score for vehicle based on claims history
 */
export async function calculateVehicleRiskScore(
  make: string,
  model: string,
  year: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Get claims for this vehicle type
  const vehicleClaims = await db
    .select({
      claimId: claims.id,
      fraudRiskScore: claims.fraudRiskScore,
      totalLoss: aiAssessments.totalLossIndicated,
    })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(
      and(
        eq(claims.vehicleMake, make),
        eq(claims.vehicleModel, model),
        gte(claims.vehicleYear, year - 3) // Last 3 years
      )
    );

  if (vehicleClaims.length === 0) {
    return 50; // Default medium risk
  }

  // Calculate risk factors
  const totalLossRate = vehicleClaims.filter((c: any) => c.totalLoss === 1).length / vehicleClaims.length;
  const avgFraudScore =
    vehicleClaims
      .filter((c: any) => c.fraudRiskScore !== null)
      .reduce((sum: number, c: any) => sum + (c.fraudRiskScore || 0), 0) / vehicleClaims.length;

  // Risk score: 0-100 (higher = more risky)
  const claimFrequencyRisk = Math.min(vehicleClaims.length * 2, 40);
  const totalLossRisk = totalLossRate * 30;
  const fraudRisk = (avgFraudScore / 100) * 30;

  const riskScore = Math.round(claimFrequencyRisk + totalLossRisk + fraudRisk);

  return Math.min(Math.max(riskScore, 0), 100);
}

/**
 * Get maintenance score for vehicle (if available)
 */
export async function getMaintenanceScore(registrationNumber: string): Promise<number> {
  // TODO: Integrate with maintenance records when available
  // For now, return default score
  return 70; // Default: good maintenance
}
