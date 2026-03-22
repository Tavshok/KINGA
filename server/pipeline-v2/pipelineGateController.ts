/**
 * pipelineGateController.ts
 *
 * Pipeline Gate Controller — a deterministic go/no-go decision module.
 *
 * Evaluates three inputs:
 *   1. evidence_registry  — from evidenceRegistryEngine.ts
 *   2. validated_fields   — from fieldValidationEngine.ts
 *   3. conflict_report    — from claimConsistencyChecker.ts
 *
 * Applies four hard HOLD rules in priority order:
 *   1. damage_photos = ABSENT
 *   2. incident_type = unknown
 *   3. any HIGH conflict exists
 *   4. repair_cost missing in post-assessment mode
 *
 * Returns:
 *   { status: "PROCEED" | "HOLD", reasons: string[], required_actions: string[] }
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Evidence presence classification from evidenceRegistryEngine */
export type EvidenceStatus = "PRESENT" | "ABSENT" | "UNKNOWN";

/** Subset of EvidenceRegistry used by the gate */
export interface GateEvidenceRegistry {
  damage_photos: EvidenceStatus;
  repair_quote?: EvidenceStatus;
  assessor_report?: EvidenceStatus;
  claim_form?: EvidenceStatus;
  driver_statement?: EvidenceStatus;
  incident_details?: EvidenceStatus;
  vehicle_details?: EvidenceStatus;
  multi_quotes?: EvidenceStatus;
  police_report_info?: EvidenceStatus;
  digital_signature?: EvidenceStatus;
}

/** Subset of validated fields used by the gate */
export interface GateValidatedFields {
  incident_type?: {
    value: string | null;
    source: string;
    confidence: number;
  } | null;
  repair_cost?: {
    value: number | null;
    source: string;
    confidence: number;
  } | null;
  speed_kmh?: {
    value: number | null;
    source: string;
    confidence: number;
  } | null;
  market_value?: {
    value: number | null;
    source: string;
    confidence: number;
  } | null;
}

/** Conflict severity from claimConsistencyChecker */
export type ConflictSeverity = "HIGH" | "MEDIUM";

/** Individual conflict entry from claimConsistencyChecker */
export interface GateConflict {
  type: string;
  severity: ConflictSeverity;
  description: string;
}

/** Conflict report from claimConsistencyChecker */
export interface GateConflictReport {
  critical_conflicts: GateConflict[];
  proceed: boolean;
  summary?: string;
}

/** Assessment mode — determines whether repair_cost is mandatory */
export type AssessmentMode = "PRE_ASSESSMENT" | "POST_ASSESSMENT";

/** Full input to the gate controller */
export interface GateControllerInput {
  evidence_registry: GateEvidenceRegistry;
  validated_fields: GateValidatedFields;
  conflict_report: GateConflictReport;
  /** Defaults to PRE_ASSESSMENT if omitted */
  assessment_mode?: AssessmentMode;
}

/** Gate decision output */
export interface GateControllerResult {
  status: "PROCEED" | "HOLD";
  reasons: string[];
  required_actions: string[];
  /** Internal detail: which rules fired */
  rules_triggered: RuleResult[];
}

/** Internal rule evaluation result */
export interface RuleResult {
  rule_id: string;
  triggered: boolean;
  reason?: string;
  required_action?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rule 1: HOLD if damage_photos = ABSENT
 *
 * Photographic evidence is mandatory for any damage assessment. Without it,
 * the physics model, damage reconciliation engine, and fraud scoring stage
 * cannot operate on verified visual evidence.
 */
function ruleNoDamagePhotos(input: GateControllerInput): RuleResult {
  const status = input.evidence_registry.damage_photos;
  const triggered = status === "ABSENT";
  return {
    rule_id: "NO_DAMAGE_PHOTOS",
    triggered,
    reason: triggered
      ? "Damage photographs are absent from the claim document set. Photographic evidence is mandatory before damage analysis can proceed."
      : undefined,
    required_action: triggered
      ? "Request damage photographs from the claimant or assessor before re-submitting the claim for processing."
      : undefined,
  };
}

/**
 * Rule 2: HOLD if incident_type = unknown
 *
 * All downstream models (physics, fraud, cost) are incident-type-specific.
 * An unknown incident type means every model will apply the wrong analytical
 * template, producing unreliable results.
 */
function ruleUnknownIncidentType(input: GateControllerInput): RuleResult {
  const incidentType = input.validated_fields.incident_type?.value;
  // Treat null, undefined, empty string, and "unknown" as unknown
  const isUnknown =
    incidentType == null ||
    incidentType.trim() === "" ||
    incidentType.toLowerCase() === "unknown";
  return {
    rule_id: "UNKNOWN_INCIDENT_TYPE",
    triggered: isUnknown,
    reason: isUnknown
      ? `Incident type could not be determined from available evidence (value: ${JSON.stringify(incidentType)}). All downstream models require a confirmed incident type.`
      : undefined,
    required_action: isUnknown
      ? "Obtain a clear incident description from the driver or claim form and re-run the Incident Classification Engine before proceeding."
      : undefined,
  };
}

/**
 * Rule 3: HOLD if any HIGH conflict exists in the conflict report
 *
 * HIGH conflicts indicate a fundamental inconsistency in the claim data
 * (e.g., speed stated as 90 km/h but estimated as 17 km/h, or incident
 * classified as vehicle_collision when narrative describes an animal strike).
 * Proceeding with HIGH conflicts would produce unreliable model outputs.
 */
function ruleHighConflictExists(input: GateControllerInput): RuleResult {
  const highConflicts = input.conflict_report.critical_conflicts.filter(
    (c) => c.severity === "HIGH"
  );
  const triggered = highConflicts.length > 0;
  const conflictList = highConflicts.map((c) => `${c.type}: ${c.description}`).join("; ");
  return {
    rule_id: "HIGH_CONFLICT_EXISTS",
    triggered,
    reason: triggered
      ? `${highConflicts.length} HIGH-severity conflict(s) detected in the claim data: ${conflictList}`
      : undefined,
    required_action: triggered
      ? `Resolve all HIGH-severity conflicts before proceeding. Conflicts: ${highConflicts.map((c) => c.type).join(", ")}.`
      : undefined,
  };
}

/**
 * Rule 4: HOLD if repair_cost is missing in POST_ASSESSMENT mode
 *
 * In post-assessment mode, an agreed repair cost must exist for the
 * Cost Decision Engine to establish the TRUE_COST basis. Without it,
 * the engine falls back to system_optimised, which is only valid for
 * pre-assessment guidance, not final adjudication.
 */
function ruleMissingRepairCostPostAssessment(input: GateControllerInput): RuleResult {
  const mode = input.assessment_mode ?? "PRE_ASSESSMENT";
  if (mode !== "POST_ASSESSMENT") {
    return { rule_id: "MISSING_REPAIR_COST_POST", triggered: false };
  }
  const repairCostValue = input.validated_fields.repair_cost?.value;
  const isMissing = repairCostValue == null || repairCostValue <= 0;
  return {
    rule_id: "MISSING_REPAIR_COST_POST",
    triggered: isMissing,
    reason: isMissing
      ? "Assessment mode is POST_ASSESSMENT but no validated repair cost is present. The Cost Decision Engine requires an agreed cost to establish the assessor-validated true cost basis."
      : undefined,
    required_action: isMissing
      ? "Obtain the agreed repair cost from the assessor report or claim form and re-run field validation before proceeding."
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate the four HOLD rules and return a structured gate decision.
 *
 * Rules are evaluated in priority order. All triggered rules are collected
 * and returned — the gate does not short-circuit on the first HOLD.
 */
export function evaluateGate(input: GateControllerInput): GateControllerResult {
  const rules: RuleResult[] = [
    ruleNoDamagePhotos(input),
    ruleUnknownIncidentType(input),
    ruleHighConflictExists(input),
    ruleMissingRepairCostPostAssessment(input),
  ];

  const triggered = rules.filter((r) => r.triggered);
  const status: "PROCEED" | "HOLD" = triggered.length > 0 ? "HOLD" : "PROCEED";

  const reasons = triggered
    .map((r) => r.reason)
    .filter((r): r is string => r != null);

  const required_actions = triggered
    .map((r) => r.required_action)
    .filter((a): a is string => a != null);

  return {
    status,
    reasons,
    required_actions,
    rules_triggered: rules,
  };
}

/**
 * Convenience helper: returns true if the gate allows analysis to proceed.
 */
export function canProceed(input: GateControllerInput): boolean {
  return evaluateGate(input).status === "PROCEED";
}
