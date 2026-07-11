/**
 * Bias Detection and Flagging Service
 * Detects potential biases in historical claims data to ensure fair ML training
 */

import { getDb } from "../db";
import { 
  historicalClaims,
  biasDetectionFlags
} from "../../drizzle/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";

const db = await getDb();

export type BiasType = 
  | "extreme_repair_value"
  | "panel_beater_dominance"
  | "demographic_skew"
  | "temporal_clustering"
  | "geographic_concentration";

export interface BiasDetectionResult {
  biasDetected: boolean;
  biasTypes: BiasType[];
  severity: "low" | "medium" | "high";
  details: {
    type: BiasType;
    description: string;
    affectedClaims: number;
    mitigationRecommendation: string;
  }[];
}

/**
 * Detect biases in a batch of historical claims
 */
export async function detectBatchBiases(params: {
  tenantId: string;
  batchId: number;
}): Promise<BiasDetectionResult> {
  const biasTypes: BiasType[] = [];
  const details: BiasDetectionResult["details"] = [];
  
  // Get all claims in batch
  const batchClaims = await db.select()
    .from(historicalClaims)
    .where(
      and(
        eq(historicalClaims.tenantId, params.tenantId),
        eq(historicalClaims.batchId, params.batchId)
      )
    );
  
  if (batchClaims.length === 0) {
    return {
      biasDetected: false,
      biasTypes: [],
      severity: "low",
      details: [],
    };
  }
  
  // Bias Detection 1: Extreme Repair Values
  const extremeValueBias = await detectExtremeRepairValues(batchClaims);
  if (extremeValueBias.detected) {
    biasTypes.push("extreme_repair_value");
    details.push(extremeValueBias.details);
  }
  
  // Bias Detection 2: Panel Beater Dominance
  const panelBeaterBias = await detectPanelBeaterDominance(batchClaims);
  if (panelBeaterBias.detected) {
    biasTypes.push("panel_beater_dominance");
    details.push(panelBeaterBias.details);
  }
  
  // Bias Detection 3: Demographic Skew (if data present)
  const demographicBias = await detectDemographicSkew(batchClaims);
  if (demographicBias.detected) {
    biasTypes.push("demographic_skew");
    details.push(demographicBias.details);
  }
  
  // Bias Detection 4: Temporal Clustering
  const temporalBias = await detectTemporalClustering(batchClaims);
  if (temporalBias.detected) {
    biasTypes.push("temporal_clustering");
    details.push(temporalBias.details);
  }
  
  // Determine overall severity
  let severity: "low" | "medium" | "high" = "low";
  if (biasTypes.length >= 3) {
    severity = "high";
  } else if (biasTypes.length >= 2) {
    severity = "medium";
  } else if (biasTypes.length >= 1) {
    severity = "low";
  }
  
  // Save bias flags to database
  for (const detail of details) {
    await db.insert(biasDetectionFlags).values({
      tenantId: params.tenantId,
      batchId: params.batchId,
      biasType: detail.type,
      severity,
      description: detail.description,
      affectedClaimsCount: detail.affectedClaims,
      mitigationRecommendation: detail.mitigationRecommendation,
    });
  }
  
  return {
    biasDetected: biasTypes.length > 0,
    biasTypes,
    severity,
    details,
  };
}

/**
 * Detect extreme repair value bias
 */
async function detectExtremeRepairValues(claims: any[]): Promise<{
  detected: boolean;
  details: BiasDetectionResult["details"][0];
}> {
  const claimsWithCost = claims.filter(c => c.estimatedRepairCost !== null);
  
  if (claimsWithCost.length === 0) {
    return { detected: false, details: {} as any };
  }
  
  // Calculate statistics
  const costs = claimsWithCost.map(c => c.estimatedRepairCost);
  const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
  const stdDev = Math.sqrt(
    costs.reduce((sum, cost) => sum + Math.pow(cost - mean, 2), 0) / costs.length
  );
  
  // Flag values beyond 3 standard deviations
  const extremeClaims = claimsWithCost.filter(
    c => Math.abs(c.estimatedRepairCost - mean) > 3 * stdDev
  );
  
  const extremePercentage = (extremeClaims.length / claimsWithCost.length) * 100;
  
  // Detect bias if > 10% of claims are extreme
  const detected = extremePercentage > 10;
  
  return {
    detected,
    details: {
      type: "extreme_repair_value",
      description: `${extremeClaims.length} claims (${extremePercentage.toFixed(1)}%) have extreme repair values beyond 3 standard deviations from mean (R${mean.toFixed(0)} ± R${stdDev.toFixed(0)})`,
      affectedClaims: extremeClaims.length,
      mitigationRecommendation: detected
        ? "Review extreme value claims manually. Consider capping outliers or using robust scaling methods during model training."
        : "No mitigation needed - extreme values within acceptable range.",
    },
  };
}

/**
 * Detect panel beater dominance bias
 */
async function detectPanelBeaterDominance(claims: any[]): Promise<{
  detected: boolean;
  details: BiasDetectionResult["details"][0];
}> {
  const claimsWithPanelBeater = claims.filter(
    c => c.rawExtractedData?.panelBeaterName
  );
  
  if (claimsWithPanelBeater.length === 0) {
    return { detected: false, details: {} as any };
  }
  
  // Count claims per panel beater
  const panelBeaterCounts: Record<string, number> = {};
  claimsWithPanelBeater.forEach(c => {
    const name = c.rawExtractedData.panelBeaterName;
    panelBeaterCounts[name] = (panelBeaterCounts[name] || 0) + 1;
  });
  
  // Find dominant panel beater
  const sortedPanelBeaters = Object.entries(panelBeaterCounts)
    .sort((a, b) => b[1] - a[1]);
  
  const topPanelBeater = sortedPanelBeaters[0];
  const dominancePercentage = (topPanelBeater[1] / claimsWithPanelBeater.length) * 100;
  
  // Detect bias if one panel beater has > 40% of claims
  const detected = dominancePercentage > 40;
  
  return {
    detected,
    details: {
      type: "panel_beater_dominance",
      description: `Panel beater "${topPanelBeater[0]}" appears in ${topPanelBeater[1]} claims (${dominancePercentage.toFixed(1)}% of claims with panel beater data)`,
      affectedClaims: topPanelBeater[1],
      mitigationRecommendation: detected
        ? "Dataset is skewed toward one panel beater. This may introduce pricing bias. Consider balancing training data or using panel-beater-agnostic features."
        : "Panel beater distribution is balanced - no mitigation needed.",
    },
  };
}

/**
 * Detect demographic skew bias
 */
async function detectDemographicSkew(claims: any[]): Promise<{
  detected: boolean;
  details: BiasDetectionResult["details"][0];
}> {
  // Check if demographic data is present
  const claimsWithDemographics = claims.filter(
    c => c.rawExtractedData?.claimantAge || c.rawExtractedData?.claimantGender
  );
  
  if (claimsWithDemographics.length === 0) {
    return {
      detected: false,
      details: {
        type: "demographic_skew",
        description: "No demographic data present in batch",
        affectedClaims: 0,
        mitigationRecommendation: "No demographic bias detected - data not available.",
      },
    };
  }
  
  // Analyze age distribution
  const agesPresent = claimsWithDemographics
    .filter(c => c.rawExtractedData.claimantAge)
    .map(c => c.rawExtractedData.claimantAge);
  
  let ageSkew = false;
  if (agesPresent.length > 0) {
    const avgAge = agesPresent.reduce((sum, age) => sum + age, 0) / agesPresent.length;
    const youngClaims = agesPresent.filter(age => age < 30).length;
    const oldClaims = agesPresent.filter(age => age > 60).length;
    
    const youngPercentage = (youngClaims / agesPresent.length) * 100;
    const oldPercentage = (oldClaims / agesPresent.length) * 100;
    
    // Flag if > 60% in one age group
    ageSkew = youngPercentage > 60 || oldPercentage > 60;
  }
  
  // Analyze gender distribution
  const gendersPresent = claimsWithDemographics
    .filter(c => c.rawExtractedData.claimantGender)
    .map(c => c.rawExtractedData.claimantGender);
  
  let genderSkew = false;
  if (gendersPresent.length > 0) {
    const maleClaims = gendersPresent.filter(g => g.toLowerCase() === "male").length;
    const malePercentage = (maleClaims / gendersPresent.length) * 100;
    
    // Flag if > 70% one gender
    genderSkew = malePercentage > 70 || malePercentage < 30;
  }
  
  const detected = ageSkew || genderSkew;
  
  return {
    detected,
    details: {
      type: "demographic_skew",
      description: detected
        ? `Demographic imbalance detected: ${ageSkew ? "Age distribution skewed. " : ""}${genderSkew ? "Gender distribution skewed." : ""}`
        : "Demographic distribution is balanced",
      affectedClaims: claimsWithDemographics.length,
      mitigationRecommendation: detected
        ? "Dataset shows demographic bias. Ensure model does not use protected attributes. Consider stratified sampling or fairness constraints during training."
        : "No mitigation needed - demographics are balanced.",
    },
  };
}

/**
 * Detect temporal clustering bias
 */
async function detectTemporalClustering(claims: any[]): Promise<{
  detected: boolean;
  details: BiasDetectionResult["details"][0];
}> {
  const claimsWithDate = claims.filter(c => c.claimDate);
  
  if (claimsWithDate.length === 0) {
    return { detected: false, details: {} as any };
  }
  
  // Group claims by month
  const monthCounts: Record<string, number> = {};
  claimsWithDate.forEach(c => {
    const month = c.claimDate.toISOString().slice(0, 7); // YYYY-MM
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  });
  
  const months = Object.keys(monthCounts);
  const avgClaimsPerMonth = claimsWithDate.length / months.length;
  
  // Find months with > 2x average
  const clusteredMonths = Object.entries(monthCounts)
    .filter(([_, count]) => count > avgClaimsPerMonth * 2);
  
  const detected = clusteredMonths.length > 0;
  
  return {
    detected,
    details: {
      type: "temporal_clustering",
      description: detected
        ? `${clusteredMonths.length} months have >2x average claim volume (avg: ${avgClaimsPerMonth.toFixed(1)} claims/month)`
        : "Claims are evenly distributed over time",
      affectedClaims: clusteredMonths.reduce((sum, [_, count]) => sum + count, 0),
      mitigationRecommendation: detected
        ? "Temporal clustering detected - may indicate seasonal bias or data collection artifacts. Consider time-based stratification or seasonal features."
        : "No temporal bias detected - claims evenly distributed.",
    },
  };
}

/**
 * Get bias detection summary for a batch
 */
export async function getBatchBiasSummary(params: {
  tenantId: string;
  batchId: number;
}): Promise<{
  totalFlags: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  flagsByType: Record<BiasType, number>;
}> {
  const flags = await db.select()
    .from(biasDetectionFlags)
    .where(
      and(
        eq(biasDetectionFlags.tenantId, params.tenantId),
        eq(biasDetectionFlags.batchId, params.batchId)
      )
    );
  
  const totalFlags = flags.length;
  const highSeverity = flags.filter(f => f.severity === "high").length;
  const mediumSeverity = flags.filter(f => f.severity === "medium").length;
  const lowSeverity = flags.filter(f => f.severity === "low").length;
  
  const flagsByType: Record<BiasType, number> = {
    extreme_repair_value: 0,
    panel_beater_dominance: 0,
    demographic_skew: 0,
    temporal_clustering: 0,
    geographic_concentration: 0,
  };
  
  flags.forEach(f => {
    if (f.biasType) {
      flagsByType[f.biasType as BiasType]++;
    }
  });
  
  return {
    totalFlags,
    highSeverity,
    mediumSeverity,
    lowSeverity,
    flagsByType,
  };
}
