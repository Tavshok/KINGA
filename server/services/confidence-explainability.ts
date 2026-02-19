// @ts-nocheck
/**
 * Confidence Calculation Explainability
 * 
 * Provides full transparency into confidence score calculations by storing
 * complete metadata including component weights, weighted contributions,
 * and normalized scores.
 */

/**
 * Confidence component weights used in calculation
 */
export interface ConfidenceWeights {
  fraudRisk: number;
  aiCertainty: number;
  quoteVariance: number;
  claimCompleteness: number;
  historicalRisk: number;
}

/**
 * Weighted contribution of each component to final score
 */
export interface WeightedContributions {
  fraudRisk: number;
  aiCertainty: number;
  quoteVariance: number;
  claimCompleteness: number;
  historicalRisk: number;
}

/**
 * Complete explainability metadata for confidence calculation
 */
export interface ConfidenceExplainability {
  // Raw component weights (should sum to 1.0)
  weights: ConfidenceWeights;
  
  // Weighted contribution per factor (component * weight)
  contributions: WeightedContributions;
  
  // Final normalized score (0-100)
  normalizedScore: number;
  
  // Model version used for calculation
  modelVersion: string;
  
  // Calculation timestamp
  calculationTimestamp: string; // ISO 8601 format
}

/**
 * Default confidence weights (equal weighting)
 */
export const DEFAULT_CONFIDENCE_WEIGHTS: ConfidenceWeights = {
  fraudRisk: 0.2,
  aiCertainty: 0.2,
  quoteVariance: 0.2,
  claimCompleteness: 0.2,
  historicalRisk: 0.2,
};

/**
 * Calculate confidence score with full explainability metadata
 * 
 * @param components - Raw confidence components (0-100)
 * @param weights - Component weights (defaults to equal weighting)
 * @param modelVersion - Model version string
 * @returns Confidence score and explainability metadata
 */
export function calculateConfidenceWithExplainability(
  components: {
    fraudRisk: number;
    aiCertainty: number;
    quoteVariance: number;
    claimCompleteness: number;
    historicalRisk: number;
  },
  weights: ConfidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS,
  modelVersion: string = "v1.0"
): {
  score: number;
  explainability: ConfidenceExplainability;
} {
  // Validate weights sum to 1.0 (with small tolerance for floating point)
  const weightSum = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(`Confidence weights must sum to 1.0, got ${weightSum}`);
  }
  
  // Calculate weighted contributions
  const contributions: WeightedContributions = {
    fraudRisk: components.fraudRisk * weights.fraudRisk,
    aiCertainty: components.aiCertainty * weights.aiCertainty,
    quoteVariance: components.quoteVariance * weights.quoteVariance,
    claimCompleteness: components.claimCompleteness * weights.claimCompleteness,
    historicalRisk: components.historicalRisk * weights.historicalRisk,
  };
  
  // Calculate final normalized score (sum of weighted contributions)
  const normalizedScore = Object.values(contributions).reduce((sum, c) => sum + c, 0);
  
  // Create explainability metadata
  const explainability: ConfidenceExplainability = {
    weights,
    contributions,
    normalizedScore,
    modelVersion,
    calculationTimestamp: new Date().toISOString(),
  };
  
  return {
    score: normalizedScore,
    explainability,
  };
}

/**
 * Generate human-readable explanation from explainability metadata
 * 
 * @param explainability - Confidence explainability metadata
 * @param routingCategory - Routing category (HIGH/MEDIUM/LOW)
 * @returns Human-readable explanation string
 */
export function generateConfidenceExplanation(
  explainability: ConfidenceExplainability,
  routingCategory: "HIGH" | "MEDIUM" | "LOW"
): string {
  const { contributions, normalizedScore } = explainability;
  
  // Determine risk level for each component (inverse for fraud risk)
  const fraudRiskLevel = contributions.fraudRisk < 20 ? "low" : contributions.fraudRisk < 60 ? "moderate" : "high";
  const aiCertaintyLevel = contributions.aiCertainty < 20 ? "low" : contributions.aiCertainty < 60 ? "moderate" : "high";
  const varianceLevel = contributions.quoteVariance < 20 ? "low" : contributions.quoteVariance < 60 ? "moderate" : "high";
  const completenessLevel = contributions.claimCompleteness < 20 ? "low" : contributions.claimCompleteness < 60 ? "moderate" : "high";
  const historicalRiskLevel = contributions.historicalRisk < 20 ? "low" : contributions.historicalRisk < 60 ? "moderate" : "high";
  
  // Format contributions to 2 decimal places
  const formatContribution = (value: number) => value.toFixed(2);
  
  // Generate explanation
  const explanation = `Claim routed ${routingCategory} (confidence score: ${normalizedScore.toFixed(2)}) based on: ` +
    `fraud risk ${fraudRiskLevel} (${formatContribution(contributions.fraudRisk)}), ` +
    `AI certainty ${aiCertaintyLevel} (${formatContribution(contributions.aiCertainty)}), ` +
    `quote variance ${varianceLevel} (${formatContribution(contributions.quoteVariance)}), ` +
    `claim completeness ${completenessLevel} (${formatContribution(contributions.claimCompleteness)}), ` +
    `historical risk ${historicalRiskLevel} (${formatContribution(contributions.historicalRisk)}).`;
  
  return explanation;
}

/**
 * Reconstruct explanation from stored routing history metadata
 * 
 * This function demonstrates that no recalculation is required -
 * all necessary information is stored in the explainability metadata.
 * 
 * @param explainabilityJson - JSON string from routingHistory.explainabilityMetadata
 * @param routingCategory - Routing category from routingHistory
 * @returns Human-readable explanation
 */
export function reconstructExplanationFromHistory(
  explainabilityJson: string,
  routingCategory: "HIGH" | "MEDIUM" | "LOW"
): string {
  const explainability: ConfidenceExplainability = JSON.parse(explainabilityJson);
  return generateConfidenceExplanation(explainability, routingCategory);
}

/**
 * Validate explainability metadata structure
 * 
 * @param metadata - Explainability metadata to validate
 * @returns True if valid, throws error otherwise
 */
export function validateExplainabilityMetadata(metadata: unknown): metadata is ConfidenceExplainability {
  if (typeof metadata !== "object" || metadata === null) {
    throw new Error("Explainability metadata must be an object");
  }
  
  const m = metadata as Record<string, unknown>;
  
  // Validate weights
  if (typeof m.weights !== "object" || m.weights === null) {
    throw new Error("Explainability metadata must have 'weights' object");
  }
  
  // Validate contributions
  if (typeof m.contributions !== "object" || m.contributions === null) {
    throw new Error("Explainability metadata must have 'contributions' object");
  }
  
  // Validate normalizedScore
  if (typeof m.normalizedScore !== "number") {
    throw new Error("Explainability metadata must have 'normalizedScore' number");
  }
  
  // Validate modelVersion
  if (typeof m.modelVersion !== "string") {
    throw new Error("Explainability metadata must have 'modelVersion' string");
  }
  
  // Validate calculationTimestamp
  if (typeof m.calculationTimestamp !== "string") {
    throw new Error("Explainability metadata must have 'calculationTimestamp' string");
  }
  
  return true;
}
