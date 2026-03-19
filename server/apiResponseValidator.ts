/**
 * apiResponseValidator.ts
 *
 * Stage 27: API Response Validation & Auto-Healing Layer
 *
 * Validates every engine output before it reaches the frontend.
 * Pipeline:
 *   engine_output → api_response → ui_model
 *
 * Rules:
 *   1. Validate mapping: engine_output → api_response → ui_model
 *   2. For each required UI field: ensure it exists, correct type, non-null
 *   3. If mismatch detected: auto-map known field renames
 *      Example: physics.damageConsistency.score → physics.consistencyScore
 *   4. Log all mapping corrections: { field, original, corrected }
 *   5. Block response ONLY if critical fields missing: claim_id, decision_verdict
 *      Otherwise: auto-heal response
 *
 * Goal: Frontend must ALWAYS receive complete, usable data.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldType = "string" | "number" | "boolean" | "object" | "array";

export interface FieldContract {
  /** Dot-notation path in the response object */
  path: string;
  /** Expected JavaScript type */
  type: FieldType;
  /** Whether null/undefined blocks the response entirely */
  critical: boolean;
  /** Fallback value when field is missing and not critical */
  fallback?: unknown;
  /** Known legacy/alternate paths to try if primary path is missing */
  aliases?: string[];
}

export interface MappingCorrection {
  field: string;
  original: unknown;
  corrected: unknown;
  reason: string;
  timestamp: string;
}

export interface ValidationResult<T = unknown> {
  /** Whether the response is safe to send to the frontend */
  valid: boolean;
  /** Whether the response was blocked (only for critical field failures) */
  blocked: boolean;
  /** The (possibly healed) response data */
  data: T;
  /** All corrections applied during auto-healing */
  corrections: MappingCorrection[];
  /** Fields that were missing and could not be auto-healed */
  unresolved: string[];
  /** Human-readable summary */
  summary: string;
}

// ─── Field Contracts ──────────────────────────────────────────────────────────

/**
 * UI field contract for the aiAssessments.byClaim response.
 * This is the primary engine output consumed by the claim decision UI.
 */
export const AI_ASSESSMENT_CONTRACT: FieldContract[] = [
  // ── CRITICAL FIELDS (block if missing) ──────────────────────────────────
  {
    path: "claimId",
    type: "number",
    critical: true,
    aliases: ["claim_id", "id"],
  },
  {
    path: "finalDecision.decision",
    type: "string",
    critical: true,
    aliases: ["decision_verdict", "verdict", "decision"],
  },

  // ── FRAUD FIELDS ─────────────────────────────────────────────────────────
  {
    path: "fraudLevelEnforced",
    type: "string",
    critical: false,
    fallback: "low",
    aliases: ["fraudRiskLevel", "fraud_risk_level", "fraudLevel"],
  },
  {
    path: "fraudLevelLabel",
    type: "string",
    critical: false,
    fallback: "Low Risk",
    aliases: ["fraudLabel"],
  },
  {
    path: "fraudScoreBreakdown.totalScore",
    type: "number",
    critical: false,
    fallback: 0,
    aliases: ["fraudScore", "fraud_score", "fraudRiskScore"],
  },
  {
    path: "fraudScoreBreakdown.level",
    type: "string",
    critical: false,
    fallback: "low",
    aliases: ["fraudRiskLevel"],
  },

  // ── PHYSICS FIELDS ────────────────────────────────────────────────────────
  {
    path: "physicsInsight",
    type: "string",
    critical: false,
    fallback: "Physics analysis data requires further review.",
    aliases: ["physics_insight", "physicsNote"],
  },
  {
    path: "consistencyFlag.score",
    type: "number",
    critical: false,
    fallback: 50,
    // Stage 27 canonical auto-map: physics.damageConsistency.score → physics.consistencyScore
    aliases: [
      "physics.damageConsistency.score",
      "physics.consistencyScore",
      "consistencyScore",
      "damageConsistencyScore",
    ],
  },
  {
    path: "consistencyFlag.flag",
    type: "string",
    critical: false,
    fallback: "inconclusive",
    aliases: ["consistencyFlag", "consistency_flag"],
  },
  {
    path: "directionFlag.flag",
    type: "string",
    critical: false,
    fallback: "inconclusive",
    aliases: ["directionFlag", "direction_flag"],
  },

  // ── COST FIELDS ───────────────────────────────────────────────────────────
  {
    path: "costExtraction.ai_estimate",
    type: "number",
    critical: false,
    fallback: 0,
    aliases: ["costExtraction.aiEstimate", "aiEstimatedCost", "estimatedCost"],
  },
  {
    path: "costExtraction.parts",
    type: "number",
    critical: false,
    fallback: 0,
    aliases: ["costExtraction.partsCost", "partsCost", "aiPartsCost"],
  },
  {
    path: "costExtraction.labour",
    type: "number",
    critical: false,
    fallback: 0,
    aliases: ["costExtraction.labourCost", "labourCost", "aiLabourCost"],
  },
  {
    path: "costExtraction.fair_range",
    type: "object",
    critical: false,
    fallback: { min: 0, max: 0 },
    aliases: ["costExtraction.fairRange", "fairRange", "recommendedCostRange"],
  },
  {
    path: "costBenchmark.estimatedCostUsd",
    type: "number",
    critical: false,
    fallback: 0,
    aliases: ["costBenchmark.estimate", "estimatedCostUsd"],
  },
  {
    path: "costVerdict.verdict",
    type: "string",
    critical: false,
    fallback: "within_range",
    aliases: ["costVerdict", "cost_verdict"],
  },

  // ── DECISION FIELDS ───────────────────────────────────────────────────────
  {
    path: "finalDecision.label",
    type: "string",
    critical: false,
    fallback: "Review Required",
    aliases: ["decisionLabel", "decision_label"],
  },
  {
    path: "finalDecision.color",
    type: "string",
    critical: false,
    fallback: "amber",
    aliases: ["decisionColor", "decision_color"],
  },
  {
    path: "finalDecision.primaryReason",
    type: "string",
    critical: false,
    fallback: "Additional verification needed before final determination.",
    aliases: ["primaryReason", "primary_reason"],
  },
  {
    path: "finalDecision.recommendedActions",
    type: "array",
    critical: false,
    fallback: [],
    aliases: ["recommendedActions", "recommended_actions"],
  },

  // ── CONFIDENCE FIELDS ─────────────────────────────────────────────────────
  {
    path: "confidenceBreakdown.finalScore",
    type: "number",
    critical: false,
    fallback: 50,
    aliases: ["confidenceScore", "confidence_score", "extractionConfidence"],
  },

  // ── ALERTS ────────────────────────────────────────────────────────────────
  {
    path: "alerts",
    type: "array",
    critical: false,
    fallback: [],
    aliases: ["critical_alerts", "criticalAlerts"],
  },
];

/**
 * UI field contract for the claims.getById response.
 */
export const CLAIM_DETAIL_CONTRACT: FieldContract[] = [
  {
    path: "id",
    type: "number",
    critical: true,
    aliases: ["claimId", "claim_id"],
  },
  {
    path: "claimNumber",
    type: "string",
    critical: false,
    fallback: "UNKNOWN",
    aliases: ["claim_number"],
  },
  {
    path: "status",
    type: "string",
    critical: false,
    fallback: "pending",
    aliases: ["claim_status"],
  },
  {
    path: "currencyCode",
    type: "string",
    critical: false,
    fallback: "USD",
    aliases: ["currency", "currency_code"],
  },
];

// ─── Path Utilities ───────────────────────────────────────────────────────────

/**
 * Get a nested value from an object using dot-notation path.
 * Returns undefined if any segment is missing.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested value on an object using dot-notation path.
 * Creates intermediate objects as needed.
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === null || current[part] === undefined || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Check if a value matches the expected FieldType.
 */
export function matchesType(value: unknown, expectedType: FieldType): boolean {
  if (value === null || value === undefined) return false;
  switch (expectedType) {
    case "array":   return Array.isArray(value);
    case "object":  return typeof value === "object" && !Array.isArray(value);
    case "string":  return typeof value === "string";
    case "number":  return typeof value === "number" && !isNaN(value as number);
    case "boolean": return typeof value === "boolean";
    default:        return false;
  }
}

// ─── Correction Logger ────────────────────────────────────────────────────────

const _correctionLog: MappingCorrection[] = [];

export function logCorrection(correction: MappingCorrection): void {
  _correctionLog.push(correction);
  // Also emit to server console for observability
  console.log(
    `[APIValidator] Correction applied — field: ${correction.field}, ` +
    `original: ${JSON.stringify(correction.original)}, ` +
    `corrected: ${JSON.stringify(correction.corrected)}, ` +
    `reason: ${correction.reason}`
  );
}

/** Get all corrections logged in this process lifetime (for testing/audit) */
export function getCorrectionLog(): MappingCorrection[] {
  return [..._correctionLog];
}

/** Clear the in-memory log (used in tests) */
export function clearCorrectionLog(): void {
  _correctionLog.length = 0;
}

// ─── Core Validator ───────────────────────────────────────────────────────────

/**
 * Validate and auto-heal an API response against a field contract.
 *
 * @param data    - The raw engine output / API response object
 * @param contract - Array of FieldContract definitions for this response type
 * @param context  - Human-readable context label for log messages (e.g. "aiAssessments.byClaim")
 * @returns ValidationResult with healed data, corrections list, and block decision
 */
export function validateApiResponse<T extends Record<string, unknown>>(
  data: T,
  contract: FieldContract[],
  context = "unknown"
): ValidationResult<T> {
  const corrections: MappingCorrection[] = [];
  const unresolved: string[] = [];
  let blocked = false;

  // Deep-clone to avoid mutating the original
  const healed = JSON.parse(JSON.stringify(data ?? {})) as Record<string, unknown>;

  for (const field of contract) {
    const currentValue = getNestedValue(healed, field.path);
    const isPresent = currentValue !== null && currentValue !== undefined;
    const isCorrectType = isPresent && matchesType(currentValue, field.type);

    if (isPresent && isCorrectType) {
      // Field is valid — no action needed
      continue;
    }

    // ── Step 1: Try aliases (auto-map known field renames) ──────────────────
    let resolvedValue: unknown = undefined;
    let resolvedAlias: string | undefined;

    if (field.aliases && field.aliases.length > 0) {
      for (const alias of field.aliases) {
        const aliasValue = getNestedValue(healed, alias);
        if (aliasValue !== null && aliasValue !== undefined && matchesType(aliasValue, field.type)) {
          resolvedValue = aliasValue;
          resolvedAlias = alias;
          break;
        }
      }
    }

    if (resolvedValue !== undefined && resolvedAlias !== undefined) {
      // Auto-map: copy from alias path to canonical path
      setNestedValue(healed, field.path, resolvedValue);
      const correction: MappingCorrection = {
        field: field.path,
        original: currentValue,
        corrected: resolvedValue,
        reason: `auto-mapped from alias "${resolvedAlias}"`,
        timestamp: new Date().toISOString(),
      };
      corrections.push(correction);
      logCorrection(correction);
      continue;
    }

    // ── Step 2: Apply fallback ──────────────────────────────────────────────
    if (!field.critical && field.fallback !== undefined) {
      setNestedValue(healed, field.path, field.fallback);
      const correction: MappingCorrection = {
        field: field.path,
        original: currentValue,
        corrected: field.fallback,
        reason: `applied fallback value (field was ${isPresent ? "wrong type" : "missing"})`,
        timestamp: new Date().toISOString(),
      };
      corrections.push(correction);
      logCorrection(correction);
      continue;
    }

    // ── Step 3: Critical field missing — block response ─────────────────────
    if (field.critical) {
      blocked = true;
      unresolved.push(field.path);
      console.error(
        `[APIValidator][${context}] BLOCKED — critical field missing: ${field.path}`
      );
      continue;
    }

    // ── Step 4: Non-critical, no fallback — record as unresolved ────────────
    unresolved.push(field.path);
    console.warn(
      `[APIValidator][${context}] Unresolved non-critical field: ${field.path}`
    );
  }

  const valid = !blocked && unresolved.length === 0;
  const summary = blocked
    ? `BLOCKED: critical fields missing — ${unresolved.join(", ")}`
    : corrections.length > 0
      ? `Auto-healed ${corrections.length} field(s): ${corrections.map(c => c.field).join(", ")}`
      : "All fields valid — no corrections needed";

  return {
    valid,
    blocked,
    data: healed as T,
    corrections,
    unresolved,
    summary,
  };
}

// ─── Convenience Wrappers ─────────────────────────────────────────────────────

/**
 * Validate an aiAssessments.byClaim response.
 * Throws TRPCError if critical fields are missing.
 */
export function validateAiAssessmentResponse<T extends Record<string, unknown>>(
  data: T,
  claimId?: number | string
): T {
  const context = `aiAssessments.byClaim(${claimId ?? "?"})`;
  const result = validateApiResponse(data, AI_ASSESSMENT_CONTRACT, context);

  if (result.blocked) {
    // Import TRPCError dynamically to avoid circular deps
    const { TRPCError } = require("@trpc/server");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Response validation failed — critical fields missing: ${result.unresolved.join(", ")}. Context: ${context}`,
    });
  }

  return result.data;
}

/**
 * Validate a claims.getById response.
 * Throws TRPCError if critical fields are missing.
 */
export function validateClaimDetailResponse<T extends Record<string, unknown>>(
  data: T,
  claimId?: number | string
): T {
  const context = `claims.getById(${claimId ?? "?"})`;
  const result = validateApiResponse(data, CLAIM_DETAIL_CONTRACT, context);

  if (result.blocked) {
    const { TRPCError } = require("@trpc/server");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Response validation failed — critical fields missing: ${result.unresolved.join(", ")}. Context: ${context}`,
    });
  }

  return result.data;
}

/**
 * Generic validator that auto-heals but never blocks.
 * Use for non-critical supplementary data endpoints.
 */
export function validateAndHeal<T extends Record<string, unknown>>(
  data: T,
  contract: FieldContract[],
  context = "unknown"
): T {
  const result = validateApiResponse(data, contract, context);
  // Even if blocked (should not happen with this wrapper), return healed data
  return result.data;
}
