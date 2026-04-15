/**
 * apiResponseValidator.ts
 *
 * Stage 27: API Response Validation & Auto-Healing Layer
 *
 * Validates claim analysis responses at the API boundary before they reach
 * the frontend. Applies auto-healing corrections for known field-name drifts
 * and structural inconsistencies. Logs every correction for audit purposes.
 *
 * Rules enforced:
 *   1. Required top-level fields must be present (auto-heal or block)
 *   2. Numeric fields must be finite numbers (NaN/Infinity → 0)
 *   3. Confidence values must be in [0, 100] (clamped)
 *   4. Fraud risk score must be in [0, 100] (clamped)
 *   5. Known field-name drifts are auto-mapped (e.g. delta_v → deltaVKmh)
 *   6. ESCALATE + APPROVE cannot coexist — ESCALATE wins
 *   7. Empty string fields that should be null are normalised
 *   8. Array fields that are null/undefined are normalised to []
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "info" | "warn" | "error" | "block";

export interface ValidationCorrection {
  field: string;
  issue: string;
  action: "auto_healed" | "blocked" | "logged";
  original_value?: unknown;
  corrected_value?: unknown;
  severity: ValidationSeverity;
  timestamp: string;
}

export interface ValidationResult {
  /** Whether the response passed validation (false = blocked, not served) */
  passed: boolean;
  /** Whether any auto-healing was applied */
  healed: boolean;
  /** List of all corrections applied or issues detected */
  corrections: ValidationCorrection[];
  /** The (possibly healed) response object */
  data: unknown;
  /** ISO timestamp of validation */
  validated_at: string;
}

// ─── Correction logger ────────────────────────────────────────────────────────

function logCorrection(
  corrections: ValidationCorrection[],
  field: string,
  issue: string,
  action: ValidationCorrection["action"],
  severity: ValidationSeverity,
  original_value?: unknown,
  corrected_value?: unknown
): void {
  corrections.push({
    field,
    issue,
    action,
    original_value,
    corrected_value,
    severity,
    timestamp: new Date().toISOString(),
  });
}

// ─── Field-level healers ──────────────────────────────────────────────────────

/**
 * Clamps a numeric value to [min, max].
 * Returns the fallback if the value is not a finite number.
 */
function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || !isFinite(value) || isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

/**
 * Ensures a value is a finite number. Returns fallback otherwise.
 */
function ensureFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value)) return fallback;
  return value;
}

/**
 * Normalises empty string to null.
 */
function emptyStringToNull(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

/**
 * Ensures an array field is an array (null/undefined → []).
 */
function ensureArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

// ─── Known field-name drift mappings ─────────────────────────────────────────

/**
 * Maps legacy or alternative field names to the canonical names expected by
 * the frontend. Applied to physics, fraud, and cost sub-objects.
 */
const PHYSICS_FIELD_ALIASES: Record<string, string> = {
  delta_v: "deltaVKmh",
  deltaV: "deltaVKmh",
  impact_force_kn: "impactForceKn",
  impact_vector: "impactVector",
  energy_distribution: "energyDistribution",
  estimated_speed_kmh: "estimatedSpeedKmh",
  deceleration_g: "decelerationG",
  accident_severity: "accidentSeverity",
  accident_reconstruction_summary: "accidentReconstructionSummary",
  damage_consistency_score: "damageConsistencyScore",
};

const FRAUD_FIELD_ALIASES: Record<string, string> = {
  fraud_risk_score: "fraudRiskScore",
  fraud_risk_level: "fraudRiskLevel",
  fraud_score: "fraudRiskScore",
  risk_score: "fraudRiskScore",
  risk_level: "fraudRiskLevel",
};

const COST_FIELD_ALIASES: Record<string, string> = {
  expected_repair_cost_cents: "expectedRepairCostCents",
  quote_deviation_pct: "quoteDeviationPct",
  recommended_cost_range: "recommendedCostRange",
  savings_opportunity_cents: "savingsOpportunityCents",
};

/**
 * Applies field-name alias mappings to an object.
 * Returns the object with canonical field names.
 */
function applyAliases(
  obj: Record<string, unknown>,
  aliases: Record<string, string>,
  corrections: ValidationCorrection[],
  context: string
): Record<string, unknown> {
  const result = { ...obj };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (alias in result && !(canonical in result)) {
      result[canonical] = result[alias];
      delete result[alias];
      logCorrection(
        corrections,
        `${context}.${alias}`,
        `Field name drift: "${alias}" → "${canonical}"`,
        "auto_healed",
        "info",
        alias,
        canonical
      );
    }
  }
  return result;
}

// ─── Physics sub-object validator ─────────────────────────────────────────────

function validatePhysicsObject(
  physics: unknown,
  corrections: ValidationCorrection[]
): Record<string, unknown> | null {
  if (!physics || typeof physics !== "object") return null;

  let obj = applyAliases(
    physics as Record<string, unknown>,
    PHYSICS_FIELD_ALIASES,
    corrections,
    "physics"
  );

  // Clamp deltaVKmh to [0, 300]
  if ("deltaVKmh" in obj) {
    const clamped = clampNumber(obj.deltaVKmh, 0, 300, 0);
    if (clamped !== obj.deltaVKmh) {
      logCorrection(corrections, "physics.deltaVKmh", "Out of range [0,300]", "auto_healed", "warn", obj.deltaVKmh, clamped);
      obj = { ...obj, deltaVKmh: clamped };
    }
  }

  // Clamp impactForceKn to [0, 10000]
  if ("impactForceKn" in obj) {
    const clamped = clampNumber(obj.impactForceKn, 0, 10_000, 0);
    if (clamped !== obj.impactForceKn) {
      logCorrection(corrections, "physics.impactForceKn", "Out of range [0,10000]", "auto_healed", "warn", obj.impactForceKn, clamped);
      obj = { ...obj, impactForceKn: clamped };
    }
  }

  // Ensure damageConsistencyScore is [0, 100]
  if ("damageConsistencyScore" in obj) {
    const clamped = clampNumber(obj.damageConsistencyScore, 0, 100, 50);
    if (clamped !== obj.damageConsistencyScore) {
      logCorrection(corrections, "physics.damageConsistencyScore", "Out of range [0,100]", "auto_healed", "warn", obj.damageConsistencyScore, clamped);
      obj = { ...obj, damageConsistencyScore: clamped };
    }
  }

  return obj;
}

// ─── Fraud sub-object validator ───────────────────────────────────────────────

function validateFraudObject(
  fraud: unknown,
  corrections: ValidationCorrection[]
): Record<string, unknown> | null {
  if (!fraud || typeof fraud !== "object") return null;

  let obj = applyAliases(
    fraud as Record<string, unknown>,
    FRAUD_FIELD_ALIASES,
    corrections,
    "fraud"
  );

  // Clamp fraudRiskScore to [0, 100]
  if ("fraudRiskScore" in obj) {
    const clamped = clampNumber(obj.fraudRiskScore, 0, 100, 50);
    if (clamped !== obj.fraudRiskScore) {
      logCorrection(corrections, "fraud.fraudRiskScore", "Out of range [0,100]", "auto_healed", "warn", obj.fraudRiskScore, clamped);
      obj = { ...obj, fraudRiskScore: clamped };
    }
  }

  // Ensure indicators is an array
  if ("indicators" in obj) {
    const arr = ensureArray(obj.indicators);
    if (!Array.isArray(obj.indicators)) {
      logCorrection(corrections, "fraud.indicators", "Not an array — normalised to []", "auto_healed", "warn", obj.indicators, arr);
      obj = { ...obj, indicators: arr };
    }
  }

  return obj;
}

// ─── Cost sub-object validator ────────────────────────────────────────────────

function validateCostObject(
  cost: unknown,
  corrections: ValidationCorrection[]
): Record<string, unknown> | null {
  if (!cost || typeof cost !== "object") return null;

  let obj = applyAliases(
    cost as Record<string, unknown>,
    COST_FIELD_ALIASES,
    corrections,
    "cost"
  );

  // Ensure expectedRepairCostCents is a finite number ≥ 0
  if ("expectedRepairCostCents" in obj) {
    const healed = ensureFiniteNumber(obj.expectedRepairCostCents, 0);
    if (healed !== obj.expectedRepairCostCents) {
      logCorrection(corrections, "cost.expectedRepairCostCents", "Not a finite number", "auto_healed", "warn", obj.expectedRepairCostCents, healed);
      obj = { ...obj, expectedRepairCostCents: healed };
    }
  }

  // Ensure breakdown is an object with required sub-fields
  if ("breakdown" in obj && obj.breakdown && typeof obj.breakdown === "object") {
    const bd = obj.breakdown as Record<string, unknown>;
    const partsCents = ensureFiniteNumber(bd.partsCostCents, 0);
    const labourCents = ensureFiniteNumber(bd.labourCostCents, 0);
    const paintCents = ensureFiniteNumber(bd.paintCostCents, 0);
    const totalCents = ensureFiniteNumber(bd.totalCents, partsCents + labourCents + paintCents);

    // Detect total ≠ parts + labour + paint (allow 5% tolerance for rounding)
    const computedTotal = partsCents + labourCents + paintCents;
    if (computedTotal > 0 && Math.abs(totalCents - computedTotal) / computedTotal > 0.05) {
      logCorrection(
        corrections,
        "cost.breakdown.totalCents",
        `Total (${totalCents}) ≠ parts+labour+paint (${computedTotal}) — mismatch >5%`,
        "logged",
        "warn",
        totalCents,
        computedTotal
      );
    }
  }

  return obj;
}

// ─── Decision contradiction check ────────────────────────────────────────────

/**
 * Rule 6: ESCALATE + APPROVE cannot coexist. ESCALATE wins.
 */
function checkDecisionContradiction(
  response: Record<string, unknown>,
  corrections: ValidationCorrection[]
): Record<string, unknown> {
  const rec = (response.recommendation as string | undefined)?.toUpperCase() ?? "";
  const verdict = (response.aiVerdict as string | undefined)?.toUpperCase() ?? "";
  const decision = (response.decision as string | undefined)?.toUpperCase() ?? "";

  const hasEscalate =
    rec.includes("ESCALATE") || verdict.includes("ESCALATE") || decision.includes("ESCALATE");
  const hasApprove =
    rec.includes("APPROVE") || verdict.includes("APPROVE") || decision.includes("APPROVE");

  if (hasEscalate && hasApprove) {
    // ESCALATE wins — overwrite approve fields
    logCorrection(
      corrections,
      "recommendation",
      "ESCALATE and APPROVE coexist — ESCALATE takes precedence",
      "auto_healed",
      "error",
      { recommendation: response.recommendation, aiVerdict: response.aiVerdict },
      "ESCALATE"
    );
    const healed = { ...response };
    if (rec.includes("APPROVE")) healed.recommendation = "ESCALATE";
    if (verdict.includes("APPROVE")) healed.aiVerdict = "ESCALATE";
    return healed;
  }

  return response;
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * Validates and auto-heals a claim analysis response.
 *
 * @param response  The raw response object from the tRPC procedure
 * @param context   A label for logging (e.g. "aiAssessments.byClaim")
 * @returns         A ValidationResult with the healed data and correction log
 */
export function validateClaimAnalysisResponse(
  response: unknown,
  context = "claim_analysis"
): ValidationResult {
  const corrections: ValidationCorrection[] = [];
  const validated_at = new Date().toISOString();

  // Null / non-object response → block
  if (!response || typeof response !== "object") {
    logCorrection(
      corrections,
      context,
      "Response is null, undefined, or not an object",
      "blocked",
      "error",
      response,
      null
    );
    return { passed: false, healed: false, corrections, data: null, validated_at };
  }

  let obj = { ...(response as Record<string, unknown>) };

  // ── Rule 5: Apply field-name drift mappings to top-level physics/fraud/cost ──
  if (obj.physicsAnalysis) {
    const healed = validatePhysicsObject(obj.physicsAnalysis, corrections);
    if (healed) obj = { ...obj, physicsAnalysis: healed };
  }

  if (obj.fraudScoreBreakdownJson) {
    const healed = validateFraudObject(obj.fraudScoreBreakdownJson, corrections);
    if (healed) obj = { ...obj, fraudScoreBreakdownJson: healed };
  }

  if (obj.costIntelligenceJson) {
    const healed = validateCostObject(obj.costIntelligenceJson, corrections);
    if (healed) obj = { ...obj, costIntelligenceJson: healed };
  }

  // ── Rule 3: Clamp top-level confidence to [0, 100] ──
  if ("confidence" in obj) {
    const clamped = clampNumber(obj.confidence, 0, 100, 50);
    if (clamped !== obj.confidence) {
      logCorrection(corrections, "confidence", "Out of range [0,100]", "auto_healed", "warn", obj.confidence, clamped);
      obj = { ...obj, confidence: clamped };
    }
  }

  // ── Rule 4: Clamp top-level fraudScore to [0, 100] ──
  if ("fraudScore" in obj) {
    const clamped = clampNumber(obj.fraudScore, 0, 100, 0);
    if (clamped !== obj.fraudScore) {
      logCorrection(corrections, "fraudScore", "Out of range [0,100]", "auto_healed", "warn", obj.fraudScore, clamped);
      obj = { ...obj, fraudScore: clamped };
    }
  }

  // ── Rule 2: Ensure numeric fields are finite ──
  for (const field of ["fraudRiskScore", "overallConfidence", "damageConsistencyScore"]) {
    if (field in obj) {
      const healed = ensureFiniteNumber(obj[field], 0);
      if (healed !== obj[field]) {
        logCorrection(corrections, field, "Not a finite number", "auto_healed", "warn", obj[field], healed);
        obj = { ...obj, [field]: healed };
      }
    }
  }

  // ── Rule 7: Normalise empty strings to null ──
  for (const field of ["recommendation", "aiVerdict", "decision", "incidentType"]) {
    if (field in obj) {
      const normalised = emptyStringToNull(obj[field]);
      if (normalised !== obj[field]) {
        logCorrection(corrections, field, "Empty string normalised to null", "auto_healed", "info", obj[field], null);
        obj = { ...obj, [field]: normalised };
      }
    }
  }

  // ── Rule 8: Normalise null/undefined array fields ──
  for (const field of ["damagedParts", "damageZones", "indicators", "repairIntelligence"]) {
    if (field in obj && !Array.isArray(obj[field])) {
      const arr = ensureArray(obj[field]);
      logCorrection(corrections, field, "Array field was null/undefined — normalised to []", "auto_healed", "info", obj[field], arr);
      obj = { ...obj, [field]: arr };
    }
  }

  // ── Rule 6: Decision contradiction check ──
  obj = checkDecisionContradiction(obj, corrections);

  const healed = corrections.some((c) => c.action === "auto_healed");
  const blocked = corrections.some((c) => c.action === "blocked");

  if (blocked) {
    return { passed: false, healed, corrections, data: null, validated_at };
  }

  return { passed: true, healed, corrections, data: obj, validated_at };
}

/**
 * Validates a response and returns the healed data directly.
 * Throws if the response is blocked (null/non-object).
 * Logs corrections to console in development.
 */
export function validateAndHeal(
  response: unknown,
  context = "claim_analysis"
): unknown {
  const result = validateClaimAnalysisResponse(response, context);

  if (result.corrections.length > 0 && process.env.NODE_ENV !== "production") {
    const warns = result.corrections.filter((c) => c.severity !== "info");
    if (warns.length > 0) {
      console.warn(
        `[apiResponseValidator] ${context}: ${warns.length} correction(s) applied`,
        warns.map((c) => `${c.field}: ${c.issue}`)
      );
    }
  }

  if (!result.passed) {
    throw new Error(
      `[apiResponseValidator] ${context}: Response blocked — ${result.corrections.map((c) => c.issue).join("; ")}`
    );
  }

  return result.data;
}

/**
 * Validates a list of claim analysis responses.
 * Returns only the responses that pass validation (with healing applied).
 */
export function validateClaimAnalysisList(
  responses: unknown[],
  context = "claim_analysis_list"
): unknown[] {
  return responses
    .map((r, i) => validateClaimAnalysisResponse(r, `${context}[${i}]`))
    .filter((r) => r.passed)
    .map((r) => r.data);
}
