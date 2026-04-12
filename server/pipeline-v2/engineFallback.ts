/**
 * engineFallback.ts
 *
 * Stage 26: Defensive Output Contracts
 *
 * Provides:
 *   1. `markFallback(value)` — wraps a value with { estimated: true, source: "fallback" }
 *   2. `markLowConfidence(value, confidence)` — wraps a value with reduced-confidence metadata
 *   3. Five engine-specific fallback output factories:
 *      - buildPhysicsFallback(reason?)
 *      - buildDamageFallback(reason?)
 *      - buildFraudFallback(reason?)
 *      - buildCostFallback(reason?)
 *      - buildReconstructionFallback(claimId, tenantId, reason?)
 *
 * Rules enforced:
 *   - NEVER return null, undefined, or empty objects
 *   - All required fields are always present
 *   - Fallback/estimated fields are marked with { estimated: true, source: "fallback" }
 *   - Low-confidence output reduces confidence but does NOT remove output
 *   - Damage: at least 1 zone OR explicit "no visible damage detected" sentinel
 *   - Fraud: at least 1 contributing factor always present
 *   - Physics: delta_v, direction, and estimated_force always present
 *   - Cost: ai_estimate, parts, labour, fair_range always present
 */

import type {
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  CollisionDirection,
  AccidentSeverity,
  FraudRiskLevel,
} from "./types";

// ─── Metadata marker types ────────────────────────────────────────────────────

export interface FallbackMeta {
  estimated: true;
  source: "fallback";
  reason?: string;
}

export interface LowConfidenceMeta {
  estimated: true;
  source: "low_confidence";
  original_confidence: number;
  reduced_confidence: number;
  reason?: string;
}

export type FallbackField<T> = T & FallbackMeta;
export type LowConfidenceField<T> = T & LowConfidenceMeta;

/**
 * Wraps a primitive or object value with fallback metadata.
 * For primitives, returns a boxed object with `value` + metadata.
 * For objects, spreads the metadata onto the object.
 */
export function markFallback<T>(value: T, reason?: string): T & FallbackMeta {
  if (typeof value === "object" && value !== null) {
    return { ...(value as object), estimated: true as const, source: "fallback" as const, ...(reason ? { reason } : {}) } as T & FallbackMeta;
  }
  // For primitives, return as-is (callers should use the wrapper object form)
  return { value, estimated: true as const, source: "fallback" as const, ...(reason ? { reason } : {}) } as unknown as T & FallbackMeta;
}

/**
 * Marks a numeric confidence value as reduced.
 * The output confidence is clamped to [0, original_confidence).
 * The output VALUE is preserved — low confidence never removes output.
 */
export function markLowConfidence(
  originalConfidence: number,
  reducedConfidence: number,
  reason?: string
): LowConfidenceMeta {
  return {
    estimated: true as const,
    source: "low_confidence" as const,
    original_confidence: originalConfidence,
    reduced_confidence: Math.max(0, Math.min(reducedConfidence, originalConfidence - 1)),
    ...(reason ? { reason } : {}),
  };
}

// ─── Physics fallback ─────────────────────────────────────────────────────────

export interface PhysicsFallbackOutput extends Stage7Output {
  _fallback: FallbackMeta;
  _fallback_fields: string[];
}

/**
 * Builds a complete, UI-renderable physics output when inputs are missing
 * or the physics engine fails. All required fields are present and marked.
 *
 * Minimum required:
 *   - delta_v (deltaVKmh)
 *   - direction (impactVector.direction)
 *   - estimated_force (impactForceKn)
 */
export function buildPhysicsFallback(reason = "insufficient_input"): PhysicsFallbackOutput {
  const fallbackMeta: FallbackMeta = { estimated: true, source: "fallback", reason };
  return {
    // Required: delta_v
    deltaVKmh: 0,
    // Required: direction
    impactVector: {
      direction: "unknown" as CollisionDirection,
      magnitude: 0,
      angle: 0,
    },
    // Required: estimated_force
    impactForceKn: 0,
    // All remaining required fields
    energyDistribution: {
      kineticEnergyJ: 0,
      energyDissipatedJ: 0,
      energyDissipatedKj: 0,
    },
    estimatedSpeedKmh: 0,
    decelerationG: 0,
    accidentSeverity: "none" as AccidentSeverity,
    accidentReconstructionSummary:
      "Physics analysis could not be completed. Further review required to determine impact parameters.",
    damageConsistencyScore: 50,
    latentDamageProbability: {
      engine: 0,
      transmission: 0,
      suspension: 0,
      frame: 0,
      electrical: 0,
    },
    physicsExecuted: false,
    // Fallback metadata
    _fallback: fallbackMeta,
    _fallback_fields: ["deltaVKmh", "impactVector", "impactForceKn", "energyDistribution", "estimatedSpeedKmh"],
  };
}

/**
 * Applies fallback markers to a partial physics output, filling in any
 * missing required fields. Used when the engine runs but produces
 * incomplete results.
 */
export function ensurePhysicsContract(
  partial: Partial<Stage7Output>,
  reason = "partial_output"
): Stage7Output & { _fallback_fields: string[] } {
  const fallback = buildPhysicsFallback(reason);
  const missing: string[] = [];

  if (partial.deltaVKmh === undefined || partial.deltaVKmh === null) missing.push("deltaVKmh");
  if (!partial.impactVector?.direction) missing.push("impactVector.direction");
  if (partial.impactForceKn === undefined || partial.impactForceKn === null) missing.push("impactForceKn");

  return {
    ...fallback,
    ...partial,
    deltaVKmh: partial.deltaVKmh ?? fallback.deltaVKmh,
    impactVector: partial.impactVector ?? fallback.impactVector,
    impactForceKn: partial.impactForceKn ?? fallback.impactForceKn,
    energyDistribution: partial.energyDistribution ?? fallback.energyDistribution,
    estimatedSpeedKmh: partial.estimatedSpeedKmh ?? fallback.estimatedSpeedKmh,
    decelerationG: partial.decelerationG ?? fallback.decelerationG,
    accidentSeverity: partial.accidentSeverity ?? fallback.accidentSeverity,
    accidentReconstructionSummary: partial.accidentReconstructionSummary ?? fallback.accidentReconstructionSummary,
    damageConsistencyScore: partial.damageConsistencyScore ?? fallback.damageConsistencyScore,
    latentDamageProbability: partial.latentDamageProbability ?? fallback.latentDamageProbability,
    physicsExecuted: partial.physicsExecuted ?? false,
    _fallback_fields: missing,
  };
}

// ─── Damage fallback ──────────────────────────────────────────────────────────

export interface DamageFallbackOutput extends Stage6Output {
  _fallback: FallbackMeta;
  _fallback_fields: string[];
  /** Explicit sentinel when no damage could be detected */
  no_damage_detected?: boolean;
}

/**
 * Builds a complete, UI-renderable damage output when inputs are missing
 * or the damage engine fails.
 *
 * Minimum required:
 *   - at least 1 zone OR no_damage_detected = true
 */
export function buildDamageFallback(reason = "insufficient_input"): DamageFallbackOutput {
  const fallbackMeta: FallbackMeta = { estimated: true, source: "fallback", reason };
  return {
    damagedParts: [],
    // Minimum: 1 zone with explicit "no visible damage detected" sentinel
    damageZones: [
      {
        zone: "unspecified",
        componentCount: 0,
        maxSeverity: "none" as AccidentSeverity,
      },
    ],
    overallSeverityScore: 0,
    structuralDamageDetected: false,
    totalDamageArea: 0,
    no_damage_detected: true,
    _fallback: fallbackMeta,
    _fallback_fields: ["damageZones", "damagedParts", "overallSeverityScore"],
  };
}

/**
 * Ensures a damage output satisfies the minimum contract.
 * If damageZones is empty, adds the "no visible damage detected" sentinel zone.
 */
export function ensureDamageContract(
  partial: Partial<Stage6Output>,
  reason = "partial_output"
): Stage6Output & { _fallback_fields: string[]; no_damage_detected?: boolean } {
  const fallback = buildDamageFallback(reason);
  const missing: string[] = [];
  const zones = partial.damageZones ?? [];

  // Rule: at least 1 zone OR explicit sentinel
  const effectiveZones =
    zones.length > 0
      ? zones
      : fallback.damageZones; // sentinel zone

  if (zones.length === 0) missing.push("damageZones");

  return {
    damagedParts: partial.damagedParts ?? [],
    damageZones: effectiveZones,
    overallSeverityScore: partial.overallSeverityScore ?? 0,
    structuralDamageDetected: partial.structuralDamageDetected ?? false,
    totalDamageArea: partial.totalDamageArea ?? 0,
    no_damage_detected: zones.length === 0,
    _fallback_fields: missing,
  };
}

// ─── Fraud fallback ───────────────────────────────────────────────────────────

export interface FraudFallbackOutput extends Stage8Output {
  _fallback: FallbackMeta;
  _fallback_fields: string[];
}

/**
 * Builds a complete, UI-renderable fraud output when inputs are missing
 * or the fraud engine fails.
 *
 * Minimum required:
 *   - score (fraudRiskScore)
 *   - level (fraudRiskLevel)
 *   - at least 1 contributing factor (indicators)
 */
export function buildFraudFallback(reason = "insufficient_input"): FraudFallbackOutput {
  const fallbackMeta: FallbackMeta = { estimated: true, source: "fallback", reason };
  return {
    fraudRiskScore: 50,
    fraudRiskLevel: "medium" as FraudRiskLevel,
    // Minimum: 1 contributing factor
    indicators: [
      {
        indicator: "assessment_unavailable",
        category: "system",
        score: 50,
        description:
          "Fraud assessment could not be completed with available data. Additional verification needed before final determination.",
      },
    ],
    quoteDeviation: null,
    repairerHistory: {
      flagged: false,
      notes: "Additional verification needed.",
    },
    claimantClaimFrequency: {
      flagged: false,
      notes: "Additional verification needed.",
    },
    vehicleClaimHistory: {
      flagged: false,
      notes: "Additional verification needed.",
    },
    damageConsistencyScore: 50,
    damageConsistencyNotes:
      "Damage consistency could not be assessed. Further review required.",
    scenarioFraudResult: null,
    crossEngineConsistency: null,
    _fallback: fallbackMeta,
    _fallback_fields: ["fraudRiskScore", "fraudRiskLevel", "indicators"],
  };
}

/**
 * Ensures a fraud output satisfies the minimum contract.
 * If indicators is empty, adds the fallback "assessment_unavailable" indicator.
 */
export function ensureFraudContract(
  partial: Partial<Stage8Output>,
  reason = "partial_output"
): Stage8Output & { _fallback_fields: string[] } {
  const fallback = buildFraudFallback(reason);
  const missing: string[] = [];

  if (partial.fraudRiskScore === undefined || partial.fraudRiskScore === null) missing.push("fraudRiskScore");
  if (!partial.fraudRiskLevel) missing.push("fraudRiskLevel");

  const indicators = partial.indicators ?? [];
  if (indicators.length === 0) {
    missing.push("indicators");
  }

  return {
    fraudRiskScore: partial.fraudRiskScore ?? fallback.fraudRiskScore,
    fraudRiskLevel: partial.fraudRiskLevel ?? fallback.fraudRiskLevel,
    indicators: indicators.length > 0 ? indicators : fallback.indicators,
    quoteDeviation: partial.quoteDeviation ?? null,
    repairerHistory: partial.repairerHistory ?? fallback.repairerHistory,
    claimantClaimFrequency: partial.claimantClaimFrequency ?? fallback.claimantClaimFrequency,
    vehicleClaimHistory: partial.vehicleClaimHistory ?? fallback.vehicleClaimHistory,
    damageConsistencyScore: partial.damageConsistencyScore ?? fallback.damageConsistencyScore,
    damageConsistencyNotes: partial.damageConsistencyNotes ?? fallback.damageConsistencyNotes,
    scenarioFraudResult: partial.scenarioFraudResult ?? null,
    crossEngineConsistency: partial.crossEngineConsistency ?? null,
    photoForensics: partial.photoForensics ?? null,
    _fallback_fields: missing,
  };
}

// ─── Cost fallback ────────────────────────────────────────────────────────────

/**
 * Extended cost output with top-level required fields and fallback metadata.
 * The UI contract requires ai_estimate, parts, labour, and fair_range
 * as top-level renderable values.
 */
export interface CostFallbackOutput extends Stage9Output {
  /** Top-level ai_estimate (mirrors expectedRepairCostCents) */
  ai_estimate: number;
  /** Top-level parts cost cents */
  parts: number;
  /** Top-level labour cost cents */
  labour: number;
  /** Top-level fair range (mirrors recommendedCostRange) */
  fair_range: { lowCents: number; highCents: number };
  _fallback: FallbackMeta;
  _fallback_fields: string[];
}

/**
 * Builds a complete, UI-renderable cost output when inputs are missing
 * or the cost engine fails.
 *
 * Minimum required:
 *   - ai_estimate
 *   - parts
 *   - labour
 *   - fair_range
 */
export function buildCostFallback(reason = "insufficient_input"): CostFallbackOutput {
  const fallbackMeta: FallbackMeta = { estimated: true, source: "fallback", reason };
  // Conservative industry-average baseline (USD cents)
  const BASE_PARTS = 200_000;   // $2,000
  const BASE_LABOUR = 100_000;  // $1,000
  const BASE_PAINT = 50_000;    // $500
  const BASE_TOTAL = BASE_PARTS + BASE_LABOUR + BASE_PAINT;

  return {
    // Top-level required fields
    ai_estimate: BASE_TOTAL,
    parts: BASE_PARTS,
    labour: BASE_LABOUR,
    fair_range: { lowCents: Math.round(BASE_TOTAL * 0.8), highCents: Math.round(BASE_TOTAL * 1.2) },
    // Stage9Output fields
    expectedRepairCostCents: BASE_TOTAL,
    quoteDeviationPct: null,
    recommendedCostRange: { lowCents: Math.round(BASE_TOTAL * 0.8), highCents: Math.round(BASE_TOTAL * 1.2) },
    savingsOpportunityCents: 0,
    breakdown: {
      partsCostCents: BASE_PARTS,
      labourCostCents: BASE_LABOUR,
      paintCostCents: BASE_PAINT,
      hiddenDamageCostCents: 0,
      totalCents: BASE_TOTAL,
    },
    labourRateUsdPerHour: 85,
    marketRegion: "unknown",
    currency: "USD",
    repairIntelligence: [],
    partsReconciliation: [],
    reconciliationSummary: null,
    alignmentResult: null,
    costNarrative: null,
    costReliability: null,
    quoteOptimisation: null,
    costDecision: null,
    documentedOriginalQuoteUsd: null,
    documentedAgreedCostUsd: null,
    panelBeaterName: null,
    documentedLabourCostUsd: null,
    documentedPartsCostUsd: null,
    economicContext: null,  // Phase 2B: ECE not available in fallback path
    _fallback: fallbackMeta,
    _fallback_fields: ["ai_estimate", "parts", "labour", "fair_range", "expectedRepairCostCents"],
  };
}

/**
 * Ensures a cost output satisfies the minimum contract.
 * Adds top-level ai_estimate, parts, labour, and fair_range fields.
 */
export function ensureCostContract(
  partial: Partial<Stage9Output>,
  reason = "partial_output"
): CostFallbackOutput {
  const fallback = buildCostFallback(reason);
  const missing: string[] = [];

  if (!partial.expectedRepairCostCents) missing.push("ai_estimate");
  if (!partial.breakdown?.partsCostCents) missing.push("parts");
  if (!partial.breakdown?.labourCostCents) missing.push("labour");
  if (!partial.recommendedCostRange) missing.push("fair_range");

  const base: Stage9Output = {
    expectedRepairCostCents: partial.expectedRepairCostCents ?? fallback.expectedRepairCostCents,
    quoteDeviationPct: partial.quoteDeviationPct ?? null,
    recommendedCostRange: partial.recommendedCostRange ?? fallback.recommendedCostRange,
    savingsOpportunityCents: partial.savingsOpportunityCents ?? 0,
    breakdown: partial.breakdown ?? fallback.breakdown,
    labourRateUsdPerHour: partial.labourRateUsdPerHour ?? fallback.labourRateUsdPerHour,
    marketRegion: partial.marketRegion ?? fallback.marketRegion,
    currency: partial.currency ?? fallback.currency,
    repairIntelligence: partial.repairIntelligence ?? [],
    partsReconciliation: partial.partsReconciliation ?? [],
    reconciliationSummary: partial.reconciliationSummary ?? null,
    alignmentResult: partial.alignmentResult ?? null,
    costNarrative: partial.costNarrative ?? null,
    costReliability: partial.costReliability ?? null,
    quoteOptimisation: partial.quoteOptimisation ?? null,
    costDecision: partial.costDecision ?? null,
    // Documented quote values from the extracted claim document
    documentedOriginalQuoteUsd: partial.documentedOriginalQuoteUsd ?? null,
    documentedAgreedCostUsd: partial.documentedAgreedCostUsd ?? null,
    panelBeaterName: partial.panelBeaterName ?? null,
    documentedLabourCostUsd: partial.documentedLabourCostUsd ?? null,
    documentedPartsCostUsd: partial.documentedPartsCostUsd ?? null,
    economicContext: partial.economicContext ?? null,  // Phase 2B: ECE
  };

  return {
    ...base,
    ai_estimate: base.expectedRepairCostCents,
    parts: base.breakdown.partsCostCents,
    labour: base.breakdown.labourCostCents,
    fair_range: base.recommendedCostRange,
    _fallback: fallback._fallback,
    _fallback_fields: missing,
  };
}

// ─── Reconstruction fallback ──────────────────────────────────────────────────

/**
 * Minimal reconstruction (Stage 5 assembly) fallback output.
 * Returns a ClaimRecord-shaped object with all required fields present.
 */
export interface ReconstructionFallbackOutput {
  claimId: number;
  tenantId: number;
  vehicle: {
    make: string;
    model: string;
    year: number | null;
    registration: string | null;
  };
  incident: {
    type: string;
    date: string | null;
    location: string | null;
    description: string;
  };
  _fallback: FallbackMeta;
  _fallback_fields: string[];
}

/**
 * Builds a minimal reconstruction output when the assembly stage fails
 * or required inputs are missing.
 */
export function buildReconstructionFallback(
  claimId: number,
  tenantId: number,
  reason = "insufficient_input"
): ReconstructionFallbackOutput {
  const fallbackMeta: FallbackMeta = { estimated: true, source: "fallback", reason };
  return {
    claimId,
    tenantId,
    vehicle: {
      make: "Unknown",
      model: "Unknown",
      year: null,
      registration: null,
    },
    incident: {
      type: "unknown",
      date: null,
      location: null,
      description:
        "Incident reconstruction could not be completed with available data. Further review required.",
    },
    _fallback: fallbackMeta,
    _fallback_fields: ["vehicle.make", "vehicle.model", "incident.type", "incident.description"],
  };
}

// ─── Confidence reduction utility ────────────────────────────────────────────

/**
 * Reduces a confidence score when below a threshold.
 * The output value is preserved — low confidence never removes output.
 *
 * @param confidence   Current confidence (0–100)
 * @param threshold    Minimum acceptable confidence (default 30)
 * @param reduction    Amount to reduce by when below threshold (default 20)
 */
export function applyConfidenceReduction(
  confidence: number,
  threshold = 30,
  reduction = 20
): { confidence: number; reduced: boolean; meta?: LowConfidenceMeta } {
  if (confidence >= threshold) {
    return { confidence, reduced: false };
  }
  const reduced = Math.max(0, confidence - reduction);
  return {
    confidence: reduced,
    reduced: true,
    meta: markLowConfidence(confidence, reduced, `confidence_below_threshold_${threshold}`),
  };
}

// ─── Validation helper ────────────────────────────────────────────────────────

/**
 * Returns true if the output is a fallback (was produced by a fallback factory).
 */
export function isFallbackOutput(output: unknown): output is { _fallback: FallbackMeta } {
  return (
    typeof output === "object" &&
    output !== null &&
    "_fallback" in output &&
    (output as { _fallback: FallbackMeta })._fallback?.source === "fallback"
  );
}

/**
 * Returns the list of fields that were filled by fallback logic.
 */
export function getFallbackFields(output: unknown): string[] {
  if (
    typeof output === "object" &&
    output !== null &&
    "_fallback_fields" in output &&
    Array.isArray((output as { _fallback_fields: string[] })._fallback_fields)
  ) {
    return (output as { _fallback_fields: string[] })._fallback_fields;
  }
  return [];
}
