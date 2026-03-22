/**
 * decisionReadinessEngine.ts
 *
 * Decision Readiness Engine — the final pre-recommendation gate.
 *
 * Determines whether the pipeline has accumulated sufficient validated evidence
 * to issue a final recommendation. If ANY critical condition is unmet, the
 * engine sets decision_ready = false and blocks the recommendation.
 *
 * FOUR CRITICAL CONDITIONS:
 *   1. Photos processed   — at least one damage photograph has been processed
 *   2. Incident confirmed — incident type is a known, non-unknown value
 *   3. Physics valid      — physics analysis ran successfully (not fallback/invalid)
 *   4. Cost available     — a validated cost figure is present
 *
 * RULES:
 *   - Any critical data missing → decision_ready = false
 *   - No partial decisions are allowed
 *   - Confidence is derived from the number of conditions met + data quality signals
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ReadinessCheckStatus = "PASS" | "FAIL" | "WARN";

export interface ReadinessCheck {
  /** Machine-readable identifier for this check */
  check_id:
    | "PHOTOS_PROCESSED"
    | "INCIDENT_CONFIRMED"
    | "PHYSICS_VALID"
    | "COST_AVAILABLE";
  /** Human-readable label */
  label: string;
  /** Whether this check passed */
  status: ReadinessCheckStatus;
  /** Detail message explaining the status */
  detail: string;
  /** Whether this check is a hard blocker (FAIL → decision_ready = false) */
  is_critical: boolean;
}

export interface BlockingIssue {
  /** The check that produced this issue */
  check_id: string;
  /** Human-readable description of the blocking issue */
  description: string;
  /** What must be done to resolve it */
  resolution: string;
  /** Severity of the issue */
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

export interface DecisionReadinessResult {
  /** Whether the system is permitted to issue a final recommendation */
  decision_ready: boolean;
  /**
   * Confidence in the readiness assessment (0–100).
   * 100 = all four checks pass with high-quality data.
   * Reduced for each failed check, WARN status, or low-confidence inputs.
   */
  confidence: number;
  /** Issues that are blocking the decision. Empty when decision_ready = true. */
  blocking_issues: BlockingIssue[];
  /** Full detail of all four checks, including passing ones */
  checks: ReadinessCheck[];
  /** Human-readable summary */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PhotosProcessedInput {
  /** From evidence registry */
  damage_photos_status: "PRESENT" | "ABSENT" | "UNKNOWN";
  /** Number of photos actually processed by the image analysis stage */
  photos_processed_count?: number | null;
}

export interface IncidentConfirmedInput {
  /** The resolved incident type from the Incident Classification Engine */
  incident_type: string | null | undefined;
  /** Confidence from the classification engine (0–100) */
  classification_confidence?: number | null;
  /** Whether a conflict was detected during classification */
  conflict_detected?: boolean;
}

export interface PhysicsValidInput {
  /**
   * Whether the physics analysis ran successfully.
   * false = ran in fallback mode or was skipped.
   */
  physics_ran_successfully: boolean;
  /**
   * Whether the physics result was marked as "physically invalid"
   * by the causal chain or physics engine.
   */
  physics_marked_invalid?: boolean;
  /** Confidence from the physics engine (0–100) */
  physics_confidence?: number | null;
}

export interface CostAvailableInput {
  /** The true cost USD from the Cost Decision Engine */
  true_cost_usd: number | null | undefined;
  /** The cost basis classification */
  cost_basis?: "assessor_validated" | "system_optimised" | null;
  /** Confidence from the cost decision engine (0–100) */
  cost_confidence?: number | null;
}

export interface DecisionReadinessInput {
  photos: PhotosProcessedInput;
  incident: IncidentConfirmedInput;
  physics: PhysicsValidInput;
  cost: CostAvailableInput;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALID INCIDENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

const VALID_INCIDENT_TYPES = new Set([
  "animal_strike",
  "vehicle_collision",
  "theft",
  "fire",
  "flood",
  "vandalism",
]);

// ─────────────────────────────────────────────────────────────────────────────
// CHECK IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check 1: Photos processed
 *
 * PASS  — damage_photos = PRESENT and at least one photo was processed
 * WARN  — damage_photos = PRESENT but processed count is unknown/null
 * FAIL  — damage_photos = ABSENT
 * FAIL  — damage_photos = UNKNOWN (cannot confirm presence)
 */
function checkPhotosProcessed(input: PhotosProcessedInput): ReadinessCheck {
  const { damage_photos_status, photos_processed_count } = input;

  if (damage_photos_status === "ABSENT") {
    return {
      check_id: "PHOTOS_PROCESSED",
      label: "Damage photographs processed",
      status: "FAIL",
      detail:
        "No damage photographs are present in the claim document. Visual evidence is mandatory before a recommendation can be issued.",
      is_critical: true,
    };
  }

  if (damage_photos_status === "UNKNOWN") {
    return {
      check_id: "PHOTOS_PROCESSED",
      label: "Damage photographs processed",
      status: "FAIL",
      detail:
        "Photograph presence could not be confirmed. The Evidence Registry returned UNKNOWN — the document must be re-processed before a decision can be made.",
      is_critical: true,
    };
  }

  // PRESENT — check if they were actually processed
  if (
    photos_processed_count !== null &&
    photos_processed_count !== undefined &&
    photos_processed_count === 0
  ) {
    return {
      check_id: "PHOTOS_PROCESSED",
      label: "Damage photographs processed",
      status: "FAIL",
      detail:
        "Damage photographs are present in the document but zero photographs were processed by the image analysis stage. Processing must complete before a decision can be issued.",
      is_critical: true,
    };
  }

  if (
    photos_processed_count === null ||
    photos_processed_count === undefined
  ) {
    return {
      check_id: "PHOTOS_PROCESSED",
      label: "Damage photographs processed",
      status: "WARN",
      detail:
        "Damage photographs are present but the processed count is not available. Proceeding with caution — confidence will be reduced.",
      is_critical: false,
    };
  }

  return {
    check_id: "PHOTOS_PROCESSED",
    label: "Damage photographs processed",
    status: "PASS",
    detail: `${photos_processed_count} damage photograph(s) processed successfully.`,
    is_critical: false,
  };
}

/**
 * Check 2: Incident type confirmed
 *
 * PASS  — incident_type is a known, non-unknown value with confidence ≥ 60
 * WARN  — incident_type is known but confidence < 60 or conflict_detected
 * FAIL  — incident_type is null, empty, or "unknown"
 */
function checkIncidentConfirmed(input: IncidentConfirmedInput): ReadinessCheck {
  const { incident_type, classification_confidence, conflict_detected } = input;

  if (
    !incident_type ||
    incident_type.trim() === "" ||
    incident_type.toLowerCase() === "unknown"
  ) {
    return {
      check_id: "INCIDENT_CONFIRMED",
      label: "Incident type confirmed",
      status: "FAIL",
      detail:
        "Incident type could not be determined. The Incident Classification Engine must resolve the incident type before a recommendation can be issued.",
      is_critical: true,
    };
  }

  if (!VALID_INCIDENT_TYPES.has(incident_type.toLowerCase())) {
    return {
      check_id: "INCIDENT_CONFIRMED",
      label: "Incident type confirmed",
      status: "FAIL",
      detail: `Incident type "${incident_type}" is not a recognised classification. Valid types are: ${Array.from(VALID_INCIDENT_TYPES).join(", ")}.`,
      is_critical: true,
    };
  }

  // Known type — check confidence and conflicts
  if (conflict_detected) {
    return {
      check_id: "INCIDENT_CONFIRMED",
      label: "Incident type confirmed",
      status: "WARN",
      detail: `Incident type "${incident_type}" was classified but a source conflict was detected. The conflict should be resolved before issuing a final recommendation.`,
      is_critical: false,
    };
  }

  if (
    classification_confidence !== null &&
    classification_confidence !== undefined &&
    classification_confidence < 60
  ) {
    return {
      check_id: "INCIDENT_CONFIRMED",
      label: "Incident type confirmed",
      status: "WARN",
      detail: `Incident type "${incident_type}" was classified with low confidence (${classification_confidence}%). Additional source documents should be reviewed.`,
      is_critical: false,
    };
  }

  const confText =
    classification_confidence !== null && classification_confidence !== undefined
      ? ` (confidence: ${classification_confidence}%)`
      : "";

  return {
    check_id: "INCIDENT_CONFIRMED",
    label: "Incident type confirmed",
    status: "PASS",
    detail: `Incident type confirmed as "${incident_type}"${confText}.`,
    is_critical: false,
  };
}

/**
 * Check 3: Physics valid
 *
 * PASS  — physics ran successfully and was not marked invalid
 * WARN  — physics ran but with low confidence
 * FAIL  — physics ran in fallback mode (not successfully)
 * FAIL  — physics was explicitly marked as physically invalid
 */
function checkPhysicsValid(input: PhysicsValidInput): ReadinessCheck {
  const {
    physics_ran_successfully,
    physics_marked_invalid,
    physics_confidence,
  } = input;

  if (physics_marked_invalid) {
    return {
      check_id: "PHYSICS_VALID",
      label: "Physics analysis valid",
      status: "FAIL",
      detail:
        "The physics analysis explicitly marked this claim as physically invalid. The causal chain cannot be confirmed — the claim must be reviewed by an adjuster before a recommendation is issued.",
      is_critical: true,
    };
  }

  if (!physics_ran_successfully) {
    return {
      check_id: "PHYSICS_VALID",
      label: "Physics analysis valid",
      status: "FAIL",
      detail:
        "The physics analysis ran in fallback mode or was skipped entirely. A valid physics assessment is required before a recommendation can be issued.",
      is_critical: true,
    };
  }

  if (
    physics_confidence !== null &&
    physics_confidence !== undefined &&
    physics_confidence < 40
  ) {
    return {
      check_id: "PHYSICS_VALID",
      label: "Physics analysis valid",
      status: "WARN",
      detail: `Physics analysis completed but with very low confidence (${physics_confidence}%). Results should be treated as indicative only.`,
      is_critical: false,
    };
  }

  const confText =
    physics_confidence !== null && physics_confidence !== undefined
      ? ` (confidence: ${physics_confidence}%)`
      : "";

  return {
    check_id: "PHYSICS_VALID",
    label: "Physics analysis valid",
    status: "PASS",
    detail: `Physics analysis completed successfully${confText}.`,
    is_critical: false,
  };
}

/**
 * Check 4: Cost available
 *
 * PASS  — true_cost_usd is a positive number
 * WARN  — cost is available but from system_optimised with low confidence
 * FAIL  — true_cost_usd is null, undefined, or zero
 */
function checkCostAvailable(input: CostAvailableInput): ReadinessCheck {
  const { true_cost_usd, cost_basis, cost_confidence } = input;

  if (
    true_cost_usd === null ||
    true_cost_usd === undefined ||
    true_cost_usd <= 0
  ) {
    return {
      check_id: "COST_AVAILABLE",
      label: "Validated cost available",
      status: "FAIL",
      detail:
        "No validated cost figure is available. The Cost Decision Engine must produce a true_cost_usd before a recommendation can be issued.",
      is_critical: true,
    };
  }

  // Cost is present — check quality
  if (
    cost_basis === "system_optimised" &&
    cost_confidence !== null &&
    cost_confidence !== undefined &&
    cost_confidence < 50
  ) {
    return {
      check_id: "COST_AVAILABLE",
      label: "Validated cost available",
      status: "WARN",
      detail: `Cost of USD ${true_cost_usd.toFixed(2)} is available (system_optimised) but with low confidence (${cost_confidence}%). An assessor-validated agreed cost is recommended before final approval.`,
      is_critical: false,
    };
  }

  const basisText = cost_basis ? ` (${cost_basis})` : "";
  const confText =
    cost_confidence !== null && cost_confidence !== undefined
      ? `, confidence: ${cost_confidence}%`
      : "";

  return {
    check_id: "COST_AVAILABLE",
    label: "Validated cost available",
    status: "PASS",
    detail: `Validated cost of USD ${true_cost_usd.toFixed(2)} is available${basisText}${confText}.`,
    is_critical: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a 0–100 confidence score from the check results and input quality signals.
 *
 * Base: 25 points per PASS check (max 100)
 * Deductions:
 *   - FAIL check: −25 points
 *   - WARN check: −10 points
 *   - Low classification confidence (< 70): −5 points
 *   - Low physics confidence (< 60): −5 points
 *   - Low cost confidence (< 60): −5 points
 *   - Conflict detected: −5 points
 */
function computeConfidence(
  checks: ReadinessCheck[],
  input: DecisionReadinessInput
): number {
  let score = 0;

  for (const check of checks) {
    if (check.status === "PASS") score += 25;
    else if (check.status === "WARN") score += 15;
    // FAIL = 0 contribution
  }

  // Quality deductions
  const classConf = input.incident.classification_confidence;
  if (classConf !== null && classConf !== undefined && classConf < 70) {
    score -= 5;
  }

  const physConf = input.physics.physics_confidence;
  if (physConf !== null && physConf !== undefined && physConf < 60) {
    score -= 5;
  }

  const costConf = input.cost.cost_confidence;
  if (costConf !== null && costConf !== undefined && costConf < 60) {
    score -= 5;
  }

  if (input.incident.conflict_detected) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKING ISSUES BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildBlockingIssues(checks: ReadinessCheck[]): BlockingIssue[] {
  const issues: BlockingIssue[] = [];

  for (const check of checks) {
    if (check.status !== "FAIL") continue;

    switch (check.check_id) {
      case "PHOTOS_PROCESSED":
        issues.push({
          check_id: check.check_id,
          description: check.detail,
          resolution:
            "Request damage photographs from the claimant or assessor, upload them to the claim, and re-run the pipeline.",
          severity: "CRITICAL",
        });
        break;

      case "INCIDENT_CONFIRMED":
        issues.push({
          check_id: check.check_id,
          description: check.detail,
          resolution:
            "Re-run the Incident Classification Engine with additional source documents (driver statement, assessor report, damage description).",
          severity: "CRITICAL",
        });
        break;

      case "PHYSICS_VALID":
        issues.push({
          check_id: check.check_id,
          description: check.detail,
          resolution:
            "Review the physics analysis inputs (speed, impact direction, damage components) and re-run the physics engine with corrected values.",
          severity: "CRITICAL",
        });
        break;

      case "COST_AVAILABLE":
        issues.push({
          check_id: check.check_id,
          description: check.detail,
          resolution:
            "Ensure at least one valid repair quote is present and the Cost Decision Engine has produced a true_cost_usd before re-running.",
          severity: "CRITICAL",
        });
        break;
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(
  decision_ready: boolean,
  checks: ReadinessCheck[],
  blocking_issues: BlockingIssue[]
): string {
  const passCount = checks.filter((c) => c.status === "PASS").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  const failCount = checks.filter((c) => c.status === "FAIL").length;

  if (decision_ready) {
    if (warnCount > 0) {
      return `Decision ready — all ${passCount} critical checks passed. ${warnCount} warning(s) noted; recommendation may be issued with reduced confidence.`;
    }
    return `Decision ready — all ${passCount} critical checks passed. Recommendation may be issued.`;
  }

  const failLabels = checks
    .filter((c) => c.status === "FAIL")
    .map((c) => c.label)
    .join(", ");

  return `Decision BLOCKED — ${failCount} critical check(s) failed: ${failLabels}. ${blocking_issues.length} blocking issue(s) must be resolved before a recommendation can be issued.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate whether the pipeline has sufficient validated evidence to issue
 * a final recommendation.
 *
 * @param input - The four critical data inputs to check
 * @returns A DecisionReadinessResult with decision_ready, confidence, and blocking_issues
 */
export function evaluateDecisionReadiness(
  input: DecisionReadinessInput
): DecisionReadinessResult {
  // Run all four checks
  const checks: ReadinessCheck[] = [
    checkPhotosProcessed(input.photos),
    checkIncidentConfirmed(input.incident),
    checkPhysicsValid(input.physics),
    checkCostAvailable(input.cost),
  ];

  // Determine decision readiness — any FAIL on a critical check blocks the decision
  const criticalFails = checks.filter(
    (c) => c.is_critical && c.status === "FAIL"
  );
  const decision_ready = criticalFails.length === 0;

  // Build blocking issues (only from FAIL checks)
  const blocking_issues = buildBlockingIssues(checks);

  // Compute confidence
  const confidence = computeConfidence(checks, input);

  // Build summary
  const summary = buildSummary(decision_ready, checks, blocking_issues);

  return {
    decision_ready,
    confidence,
    blocking_issues,
    checks,
    summary,
  };
}

/**
 * Convenience helper — returns true only when the decision is ready.
 */
export function isDecisionReady(input: DecisionReadinessInput): boolean {
  return evaluateDecisionReadiness(input).decision_ready;
}
