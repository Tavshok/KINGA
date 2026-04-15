/**
 * assumptionClassifier.ts — Phase 2C Assumption Registry Enrichment
 *
 * Infers `assumptionType` and `impact` from the existing `strategy` and `field`
 * values on each Assumption. Applied at the assumptionRegistryJson build step in
 * db.ts so all 40 push sites remain unchanged.
 *
 * Classification rules:
 *   - assumptionType: derived from RecoveryStrategy
 *   - impact: derived from field name (HIGH for cost/fraud/physics, MEDIUM for
 *     vehicle/policy, LOW for metadata/formatting fields)
 */

import type { Assumption, AssumptionType, AssumptionImpact } from "./types";

// ─── Strategy → AssumptionType mapping ───────────────────────────────────────

const STRATEGY_TO_TYPE: Record<string, AssumptionType> = {
  industry_average:       "MARKET_DEFAULT",
  manufacturer_lookup:    "MARKET_DEFAULT",
  damage_based_estimate:  "SYSTEM_ESTIMATE",
  typical_collision:      "SYSTEM_ESTIMATE",
  default_value:          "SYSTEM_ESTIMATE",
  llm_vision:             "SYSTEM_ESTIMATE",
  contextual_inference:   "DOCUMENT_INFERENCE",
  cross_document_search:  "DOCUMENT_INFERENCE",
  secondary_ocr:          "DOCUMENT_INFERENCE",
  partial_data:           "DOCUMENT_INFERENCE",
  historical_data:        "HISTORICAL_PROXY",
  none:                   "SYSTEM_ESTIMATE",
  skip:                   "SYSTEM_ESTIMATE",
};

// ─── Field → AssumptionImpact mapping ────────────────────────────────────────

const HIGH_IMPACT_FIELDS = new Set([
  "quoteTotalCents", "agreedCostCents", "labourCostCents", "partsCostCents",
  "estimatedSpeedKmh", "deltaVKmh", "impactForceKn", "energyDissipatedKj",
  "fraudScore", "fraudRiskLevel", "physicsConsistencyScore",
  "marketValueCents", "excessAmountCents", "totalExpectedCents",
  "vehicleRegistration", "policyNumber", "insurerName",
  "structuralDamage", "airbagDeployment",
]);

const MEDIUM_IMPACT_FIELDS = new Set([
  "vehicleMake", "vehicleModel", "vehicleYear", "vehicleVin",
  "accidentDate", "accidentLocation", "incidentType",
  "claimantName", "driverName", "driverLicenseNumber",
  "repairCountry", "quoteCurrency",
  "panelBeater", "repairerCompany",
]);

function inferImpact(field: string): AssumptionImpact {
  const normalised = field.toLowerCase();
  // Check exact set membership first
  if (HIGH_IMPACT_FIELDS.has(field)) return "HIGH";
  if (MEDIUM_IMPACT_FIELDS.has(field)) return "MEDIUM";
  // Keyword heuristics for fields not in the sets
  if (
    normalised.includes("cost") ||
    normalised.includes("price") ||
    normalised.includes("amount") ||
    normalised.includes("cents") ||
    normalised.includes("fraud") ||
    normalised.includes("physics") ||
    normalised.includes("speed") ||
    normalised.includes("structural") ||
    normalised.includes("airbag")
  ) return "HIGH";
  if (
    normalised.includes("vehicle") ||
    normalised.includes("policy") ||
    normalised.includes("insurer") ||
    normalised.includes("date") ||
    normalised.includes("location") ||
    normalised.includes("driver") ||
    normalised.includes("registration")
  ) return "MEDIUM";
  return "LOW";
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Enriches a single Assumption with `assumptionType` and `impact` fields.
 * If the assumption already has these fields set, they are preserved.
 */
export function classifyAssumption(a: Assumption): Assumption {
  const assumptionType: AssumptionType =
    a.assumptionType ?? STRATEGY_TO_TYPE[a.strategy] ?? "SYSTEM_ESTIMATE";
  const impact: AssumptionImpact =
    a.impact ?? inferImpact(a.field);
  return { ...a, assumptionType, impact };
}

/**
 * Enriches an array of Assumptions with type and impact classification.
 * Safe to call on any assumptions array — returns empty array for null/undefined input.
 */
export function classifyAssumptions(assumptions: Assumption[] | null | undefined): Assumption[] {
  if (!assumptions || !Array.isArray(assumptions)) return [];
  return assumptions.map(classifyAssumption);
}
