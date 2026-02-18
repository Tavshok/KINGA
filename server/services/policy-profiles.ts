/**
 * Policy Profile Templates Service
 * 
 * Provides preset automation policy configurations for different risk appetites.
 * Profiles: Conservative, Balanced, Aggressive, Fraud-Sensitive, Custom
 * 
 * All profiles maintain automation_policies as single source of truth.
 */

import { InsertAutomationPolicy } from "../../drizzle/schema";

export type PolicyProfileType = "conservative" | "balanced" | "aggressive" | "fraud_sensitive" | "custom";

export interface PolicyProfileTemplate {
  profileType: PolicyProfileType;
  policyName: string;
  description: string;
  minAutomationConfidence: number;
  minHybridConfidence: number;
  maxAiOnlyApprovalAmount: number; // in cents
  maxHybridApprovalAmount: number; // in cents
  maxFraudScoreForAutomation: number;
  fraudSensitivityMultiplier: number;
  eligibleClaimTypes: string[];
  excludedClaimTypes: string[];
  eligibleVehicleCategories: string[];
  excludedVehicleMakes: string[];
  minVehicleYear: number;
  maxVehicleAge: number;
  requireManagerApprovalAbove: number; // in cents
  allowPolicyOverride: boolean;
}

/**
 * Conservative Profile
 * 
 * Risk Appetite: Very Low
 * Use Case: New insurers, high-risk markets, regulatory caution
 * 
 * Characteristics:
 * - High confidence thresholds (90% automation, 75% hybrid)
 * - Low financial limits ($50k AI-only, $100k hybrid)
 * - Strict fraud sensitivity (2.0x multiplier)
 * - Limited claim type eligibility
 * - Manager approval required above $100k
 */
export const CONSERVATIVE_PROFILE: PolicyProfileTemplate = {
  profileType: "conservative",
  policyName: "Conservative Automation Policy",
  description: "High confidence thresholds, low financial limits, strict fraud controls. Ideal for new insurers or high-risk markets.",
  minAutomationConfidence: 90,
  minHybridConfidence: 75,
  maxAiOnlyApprovalAmount: 5000000, // $50,000 (in cents)
  maxHybridApprovalAmount: 10000000, // $100,000 (in cents)
  maxFraudScoreForAutomation: 20, // Very strict (only 0-20 fraud score)
  fraudSensitivityMultiplier: 2.0, // 2x stricter fraud detection
  eligibleClaimTypes: ["collision", "comprehensive"], // Limited to common types
  excludedClaimTypes: ["theft", "total_loss", "fire", "vandalism"], // Exclude high-risk types
  eligibleVehicleCategories: ["passenger_vehicle"], // Only standard passenger vehicles
  excludedVehicleMakes: ["exotic", "luxury", "commercial"], // Exclude high-value/complex vehicles
  minVehicleYear: 2015, // Recent vehicles only
  maxVehicleAge: 10, // Max 10 years old
  requireManagerApprovalAbove: 10000000, // $100,000
  allowPolicyOverride: false, // No overrides allowed
};

/**
 * Balanced Profile
 * 
 * Risk Appetite: Moderate
 * Use Case: Established insurers with mature processes
 * 
 * Characteristics:
 * - Moderate confidence thresholds (85% automation, 65% hybrid)
 * - Moderate financial limits ($75k AI-only, $200k hybrid)
 * - Standard fraud sensitivity (1.0x multiplier)
 * - Broad claim type eligibility
 * - Manager approval required above $250k
 */
export const BALANCED_PROFILE: PolicyProfileTemplate = {
  profileType: "balanced",
  policyName: "Balanced Automation Policy",
  description: "Moderate confidence thresholds and financial limits. Suitable for established insurers with mature processes.",
  minAutomationConfidence: 85,
  minHybridConfidence: 65,
  maxAiOnlyApprovalAmount: 7500000, // $75,000 (in cents)
  maxHybridApprovalAmount: 20000000, // $200,000 (in cents)
  maxFraudScoreForAutomation: 30, // Standard threshold
  fraudSensitivityMultiplier: 1.0, // Standard fraud detection
  eligibleClaimTypes: ["collision", "comprehensive", "glass", "windscreen", "hail"], // Common types
  excludedClaimTypes: ["total_loss"], // Only exclude total loss
  eligibleVehicleCategories: ["passenger_vehicle", "suv", "light_commercial"], // Standard categories
  excludedVehicleMakes: ["exotic"], // Only exclude exotic vehicles
  minVehicleYear: 2010, // Last 15 years
  maxVehicleAge: 15, // Max 15 years old
  requireManagerApprovalAbove: 25000000, // $250,000
  allowPolicyOverride: true, // Overrides allowed
};

/**
 * Aggressive Profile
 * 
 * Risk Appetite: High
 * Use Case: Mature insurers with strong fraud detection, competitive markets
 * 
 * Characteristics:
 * - Low confidence thresholds (80% automation, 55% hybrid)
 * - High financial limits ($100k AI-only, $300k hybrid)
 * - Lenient fraud sensitivity (0.75x multiplier)
 * - Very broad claim type eligibility
 * - Manager approval required above $500k
 */
export const AGGRESSIVE_PROFILE: PolicyProfileTemplate = {
  profileType: "aggressive",
  policyName: "Aggressive Automation Policy",
  description: "Lower confidence thresholds, higher financial limits, faster processing. For mature insurers with strong fraud detection.",
  minAutomationConfidence: 80,
  minHybridConfidence: 55,
  maxAiOnlyApprovalAmount: 10000000, // $100,000 (in cents)
  maxHybridApprovalAmount: 30000000, // $300,000 (in cents)
  maxFraudScoreForAutomation: 40, // More lenient
  fraudSensitivityMultiplier: 0.75, // 25% more lenient fraud detection
  eligibleClaimTypes: ["collision", "comprehensive", "glass", "windscreen", "hail", "fire", "vandalism"], // Most types
  excludedClaimTypes: [], // No exclusions
  eligibleVehicleCategories: ["passenger_vehicle", "suv", "light_commercial", "motorcycle"], // All categories
  excludedVehicleMakes: [], // No exclusions
  minVehicleYear: 2005, // Last 20 years
  maxVehicleAge: 20, // Max 20 years old
  requireManagerApprovalAbove: 50000000, // $500,000
  allowPolicyOverride: true, // Overrides allowed
};

/**
 * Fraud-Sensitive Profile
 * 
 * Risk Appetite: Very Low (Fraud Focus)
 * Use Case: High-fraud markets, fraud investigation focus
 * 
 * Characteristics:
 * - Very high confidence thresholds (95% automation, 80% hybrid)
 * - Very low financial limits ($25k AI-only, $50k hybrid)
 * - Maximum fraud sensitivity (2.0x multiplier)
 * - Very strict fraud score cutoff (15)
 * - Limited claim type eligibility
 * - Manager approval required above $50k
 */
export const FRAUD_SENSITIVE_PROFILE: PolicyProfileTemplate = {
  profileType: "fraud_sensitive",
  policyName: "Fraud-Sensitive Automation Policy",
  description: "Maximum fraud detection sensitivity, very high confidence thresholds, low financial limits. For high-fraud markets.",
  minAutomationConfidence: 95,
  minHybridConfidence: 80,
  maxAiOnlyApprovalAmount: 2500000, // $25,000 (in cents)
  maxHybridApprovalAmount: 5000000, // $50,000 (in cents)
  maxFraudScoreForAutomation: 15, // Extremely strict (only 0-15 fraud score)
  fraudSensitivityMultiplier: 2.0, // 2x stricter fraud detection
  eligibleClaimTypes: ["collision", "comprehensive"], // Limited to common types
  excludedClaimTypes: ["theft", "total_loss", "fire", "vandalism", "glass"], // Exclude high-fraud types
  eligibleVehicleCategories: ["passenger_vehicle"], // Only standard passenger vehicles
  excludedVehicleMakes: ["exotic", "luxury", "commercial", "motorcycle"], // Exclude high-risk vehicles
  minVehicleYear: 2018, // Very recent vehicles only
  maxVehicleAge: 7, // Max 7 years old
  requireManagerApprovalAbove: 5000000, // $50,000
  allowPolicyOverride: false, // No overrides allowed
};

/**
 * Custom Profile (Template)
 * 
 * Risk Appetite: User-Defined
 * Use Case: Custom configuration starting point
 * 
 * Characteristics:
 * - Starts with balanced defaults
 * - User customizes all parameters
 */
export const CUSTOM_PROFILE: PolicyProfileTemplate = {
  profileType: "custom",
  policyName: "Custom Automation Policy",
  description: "Fully customizable automation policy. Start with balanced defaults and adjust to your needs.",
  minAutomationConfidence: 85,
  minHybridConfidence: 65,
  maxAiOnlyApprovalAmount: 7500000, // $75,000 (in cents)
  maxHybridApprovalAmount: 20000000, // $200,000 (in cents)
  maxFraudScoreForAutomation: 30,
  fraudSensitivityMultiplier: 1.0,
  eligibleClaimTypes: ["collision", "comprehensive", "glass", "windscreen", "hail"],
  excludedClaimTypes: ["total_loss"],
  eligibleVehicleCategories: ["passenger_vehicle", "suv", "light_commercial"],
  excludedVehicleMakes: ["exotic"],
  minVehicleYear: 2010,
  maxVehicleAge: 15,
  requireManagerApprovalAbove: 25000000, // $250,000
  allowPolicyOverride: true,
};

/**
 * Get policy profile template by type
 */
export function getPolicyProfileTemplate(profileType: PolicyProfileType): PolicyProfileTemplate {
  switch (profileType) {
    case "conservative":
      return CONSERVATIVE_PROFILE;
    case "balanced":
      return BALANCED_PROFILE;
    case "aggressive":
      return AGGRESSIVE_PROFILE;
    case "fraud_sensitive":
      return FRAUD_SENSITIVE_PROFILE;
    case "custom":
      return CUSTOM_PROFILE;
    default:
      return BALANCED_PROFILE;
  }
}

/**
 * Get all policy profile templates
 */
export function getAllPolicyProfiles(): PolicyProfileTemplate[] {
  return [
    CONSERVATIVE_PROFILE,
    BALANCED_PROFILE,
    AGGRESSIVE_PROFILE,
    FRAUD_SENSITIVE_PROFILE,
    CUSTOM_PROFILE,
  ];
}

/**
 * Convert policy profile template to InsertAutomationPolicy
 */
export function profileToAutomationPolicy(
  profile: PolicyProfileTemplate,
  tenantId: string,
  createdByUserId: number
): Omit<InsertAutomationPolicy, "id" | "createdAt" | "updatedAt"> {
  return {
    tenantId,
    policyName: profile.policyName,
    minAutomationConfidence: profile.minAutomationConfidence,
    minHybridConfidence: profile.minHybridConfidence,
    eligibleClaimTypes: profile.eligibleClaimTypes,
    excludedClaimTypes: profile.excludedClaimTypes,
    maxAiOnlyApprovalAmount: profile.maxAiOnlyApprovalAmount,
    maxHybridApprovalAmount: profile.maxHybridApprovalAmount,
    maxFraudScoreForAutomation: profile.maxFraudScoreForAutomation,
    fraudSensitivityMultiplier: profile.fraudSensitivityMultiplier.toString(),
    eligibleVehicleCategories: profile.eligibleVehicleCategories,
    excludedVehicleMakes: profile.excludedVehicleMakes,
    minVehicleYear: profile.minVehicleYear,
    maxVehicleAge: profile.maxVehicleAge,
    requireManagerApprovalAbove: profile.requireManagerApprovalAbove,
    allowPolicyOverride: profile.allowPolicyOverride,
    createdByUserId,
    isActive: false, // New policies start inactive, must be explicitly activated
    version: 1, // First version
    effectiveFrom: new Date(),
    effectiveUntil: null,
    supersededByPolicyId: null,
  };
}
