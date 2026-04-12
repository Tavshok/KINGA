/**
 * pipelineStateMachine.ts
 *
 * Pipeline Execution State Machine — KINGA Pipeline Integrity Layer
 *
 * Tracks the execution state of a single AI assessment pipeline run.
 * Enforces allowed state transitions and routes to FLAGGED_EXCEPTION
 * when a critical stage fails.
 *
 * Seven execution states:
 *   INGESTED          → Documents received and stored; pipeline not yet started
 *   VALIDATED         → Stages 1-5 complete; ClaimRecord assembled
 *   ANALYZED          → Stage 6 (damage) and Stage 7 (physics) complete
 *   COSTED            → Stage 9 (cost optimisation) complete
 *   FRAUD_SCORED      → Stage 8 (fraud analysis) complete
 *   REPORTED          → Stage 10 (report generation) complete; result available
 *   FLAGGED_EXCEPTION → A critical stage failed and could not be recovered;
 *                       manual review required before pipeline can continue
 *
 * Usage:
 *   const sm = createPipelineStateMachine();
 *   sm.transition("VALIDATED");   // OK
 *   sm.transition("REPORTED");    // Throws — skipping ANALYZED, COSTED, FRAUD_SCORED
 *   sm.flagException("Stage 7 physics engine timed out after 60s");
 *   sm.getState();  // → "FLAGGED_EXCEPTION"
 *   sm.toSummary(); // → { state, history, flagReason, durationMs }
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineExecutionState =
  | "INGESTED"
  | "VALIDATED"
  | "ANALYZED"
  | "COSTED"
  | "FRAUD_SCORED"
  | "REPORTED"
  | "FLAGGED_EXCEPTION";

export interface StateTransitionRecord {
  from: PipelineExecutionState;
  to: PipelineExecutionState;
  timestampMs: number;
  reason?: string;
}

export interface PipelineStateMachineSummary {
  currentState: PipelineExecutionState;
  history: StateTransitionRecord[];
  flagReason: string | null;
  startedAtMs: number;
  durationMs: number;
  stagesCompleted: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLOWED TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Defines which states a pipeline may transition TO from each state.
 * FLAGGED_EXCEPTION can be reached from any state.
 * Once FLAGGED_EXCEPTION is reached, only a manual reset can move forward.
 */
export const PIPELINE_TRANSITIONS: Record<PipelineExecutionState, PipelineExecutionState[]> = {
  INGESTED:          ["VALIDATED", "FLAGGED_EXCEPTION"],
  VALIDATED:         ["ANALYZED", "FLAGGED_EXCEPTION"],
  ANALYZED:          ["COSTED", "FRAUD_SCORED", "FLAGGED_EXCEPTION"],
  COSTED:            ["FRAUD_SCORED", "REPORTED", "FLAGGED_EXCEPTION"],
  FRAUD_SCORED:      ["REPORTED", "FLAGGED_EXCEPTION"],
  REPORTED:          ["FLAGGED_EXCEPTION"],  // Terminal success state
  FLAGGED_EXCEPTION: [],                     // Terminal failure state — no automatic transitions
};

/**
 * Maps pipeline stages (recordStage keys) to the execution state they advance to.
 * When a stage completes successfully, call advanceForStage(stageId) to update state.
 */
export const STAGE_TO_STATE_ADVANCEMENT: Record<string, PipelineExecutionState> = {
  "1_ingestion":              "INGESTED",
  "2_extraction":             "INGESTED",   // Still in INGESTED until assembly complete
  "0_evidence_registry":      "INGESTED",
  "0a_document_verification": "INGESTED",
  "3_structured_extraction":  "INGESTED",
  "4_validation":             "INGESTED",
  "5_assembly":               "VALIDATED",  // ClaimRecord assembled → VALIDATED
  "6_damage_analysis":        "ANALYZED",   // Damage done → ANALYZED (physics may follow)
  "7_unified":                "ANALYZED",   // Physics done → still ANALYZED
  "8_fraud":                  "FRAUD_SCORED",
  "9_cost":                   "COSTED",
  "9b_turnaround":            "COSTED",     // Still COSTED
  "10_report":                "REPORTED",
};

/**
 * Stages whose failure should trigger FLAGGED_EXCEPTION (cannot be recovered).
 * All other stage failures are non-fatal and result in degraded mode.
 */
export const CRITICAL_STAGES = new Set([
  "1_ingestion",   // No documents = nothing to process
  "5_assembly",    // No ClaimRecord = no downstream analysis possible (unless DB fallback works)
]);

// ─────────────────────────────────────────────────────────────────────────────
// STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineStateMachine {
  /** Current execution state */
  getState(): PipelineExecutionState;
  /**
   * Attempt a direct state transition.
   * Throws if the transition is not allowed.
   */
  transition(to: PipelineExecutionState, reason?: string): void;
  /**
   * Advance state based on a completed stage.
   * Only advances if the new state is "higher" than the current state.
   * Does nothing if the stage is not in STAGE_TO_STATE_ADVANCEMENT.
   */
  advanceForStage(stageId: string, reason?: string): void;
  /**
   * Flag an exception. Transitions to FLAGGED_EXCEPTION from any state.
   * Records the reason for the flag.
   */
  flagException(reason: string): void;
  /** Whether the pipeline is in a terminal state (REPORTED or FLAGGED_EXCEPTION) */
  isTerminal(): boolean;
  /** Whether the pipeline completed successfully */
  isSuccess(): boolean;
  /** Whether the pipeline is in an exception state */
  isException(): boolean;
  /** Full summary for persistence and audit */
  toSummary(): PipelineStateMachineSummary;
  /** Mark a stage as completed (for summary tracking) */
  markStageCompleted(stageId: string): void;
}

// State ordering for "higher than" comparison
const STATE_ORDER: PipelineExecutionState[] = [
  "INGESTED",
  "VALIDATED",
  "ANALYZED",
  "COSTED",
  "FRAUD_SCORED",
  "REPORTED",
  "FLAGGED_EXCEPTION",
];

function stateRank(state: PipelineExecutionState): number {
  const idx = STATE_ORDER.indexOf(state);
  return idx === -1 ? -1 : idx;
}

export function createPipelineStateMachine(): PipelineStateMachine {
  let currentState: PipelineExecutionState = "INGESTED";
  let flagReason: string | null = null;
  const history: StateTransitionRecord[] = [];
  const stagesCompleted: string[] = [];
  const startedAtMs = Date.now();

  function doTransition(to: PipelineExecutionState, reason?: string): void {
    const allowed = PIPELINE_TRANSITIONS[currentState];
    if (!allowed.includes(to)) {
      throw new Error(
        `PIPELINE_STATE_MACHINE: Invalid transition from "${currentState}" to "${to}". ` +
        `Allowed: [${allowed.join(", ")}]`
      );
    }
    history.push({ from: currentState, to, timestampMs: Date.now(), reason });
    currentState = to;
  }

  return {
    getState() {
      return currentState;
    },

    transition(to, reason) {
      doTransition(to, reason);
    },

    advanceForStage(stageId, reason) {
      const targetState = STAGE_TO_STATE_ADVANCEMENT[stageId];
      if (!targetState) return; // Stage not mapped — no state change
      if (currentState === "FLAGGED_EXCEPTION") return; // Already in exception — no advancement
      if (targetState === "FLAGGED_EXCEPTION") {
        this.flagException(reason ?? `Stage "${stageId}" triggered exception`);
        return;
      }
      // Only advance if the target state is "higher" than current
      if (stateRank(targetState) > stateRank(currentState)) {
        // Check if the transition is allowed
        const allowed = PIPELINE_TRANSITIONS[currentState];
        if (allowed.includes(targetState)) {
          doTransition(targetState, reason ?? `Stage "${stageId}" completed`);
        }
        // If the direct transition is not allowed (e.g. INGESTED → ANALYZED),
        // we don't force it — the state machine only advances when stages complete
        // in order. Out-of-order completions are recorded in stagesCompleted but
        // don't change state until the prerequisite states are reached.
      }
    },

    flagException(reason) {
      flagReason = reason;
      if (currentState !== "FLAGGED_EXCEPTION") {
        history.push({
          from: currentState,
          to: "FLAGGED_EXCEPTION",
          timestampMs: Date.now(),
          reason,
        });
        currentState = "FLAGGED_EXCEPTION";
      }
    },

    isTerminal() {
      return currentState === "REPORTED" || currentState === "FLAGGED_EXCEPTION";
    },

    isSuccess() {
      return currentState === "REPORTED";
    },

    isException() {
      return currentState === "FLAGGED_EXCEPTION";
    },

    markStageCompleted(stageId) {
      if (!stagesCompleted.includes(stageId)) {
        stagesCompleted.push(stageId);
      }
    },

    toSummary() {
      return {
        currentState,
        history,
        flagReason,
        startedAtMs,
        durationMs: Date.now() - startedAtMs,
        stagesCompleted: [...stagesCompleted],
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANOMALY SENTINEL RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named invariants that the pipeline must satisfy before any report is generated.
 * These complement the preGenerationConsistencyCheck.ts rules (R1-R5).
 *
 * Each sentinel defines:
 *   - id:          Machine-readable identifier
 *   - description: What the rule checks
 *   - check:       Function that returns true if the invariant is VIOLATED
 *   - severity:    "HARD_STOP" | "WARNING"
 *                  HARD_STOP → blocks report generation
 *                  WARNING   → adds a warning to the report
 */
export interface AnomalySentinel {
  id: string;
  description: string;
  check: (inputs: AnomalySentinelInputs) => boolean;
  severity: "HARD_STOP" | "WARNING";
  message: string;
}

export interface AnomalySentinelInputs {
  /** True cost in USD from cost engine (null if not computed) */
  trueCostUsd: number | null;
  /** Number of damage components detected */
  damageComponentCount: number;
  /** Fraud score from fraud engine (null if not computed) */
  fraudScore: number | null;
  /** Physics plausibility score (0-100, null if not computed) */
  physicsPlausibilityScore: number | null;
  /** Whether damage photos were processed */
  photosProcessed: boolean;
  /** Number of photos processed */
  photoCount: number;
  /** Whether the incident type is known */
  incidentTypeKnown: boolean;
  /** Fraud score from rule trace (may differ from weighted score) */
  fraudScoreRuleTrace: number | null;
  /** Fraud score from weighted engine (may differ from rule trace) */
  fraudScoreWeighted: number | null;
}

export interface AnomalySentinelViolation {
  id: string;
  severity: "HARD_STOP" | "WARNING";
  message: string;
}

export const ANOMALY_SENTINELS: AnomalySentinel[] = [
  {
    id: "S1_COST_ZERO_WITH_DAMAGE",
    description: "Cost cannot be zero or null if damage components were detected",
    check: (i) => i.damageComponentCount > 0 && (i.trueCostUsd === null || i.trueCostUsd === 0),
    severity: "HARD_STOP",
    message: "Cost engine returned zero/null but damage components are present. This is a silent failure — report blocked until cost is resolved.",
  },
  {
    id: "S2_FRAUD_SCORE_NULL",
    description: "Fraud score must not be null when the fraud engine ran",
    check: (i) => i.fraudScore === null && i.incidentTypeKnown,
    severity: "HARD_STOP",
    message: "Fraud score is null despite incident type being known. Fraud engine may have failed silently.",
  },
  {
    id: "S3_DAMAGE_WITHOUT_PHOTOS",
    description: "Damage component list must not be populated if no photos were processed",
    check: (i) => !i.photosProcessed && i.damageComponentCount > 3,
    severity: "WARNING",
    message: "Damage component list has >3 items but no photos were processed. Damage assessment is based on narrative only — lower reliability.",
  },
  {
    id: "S4_FRAUD_SCORE_CONTRADICTION",
    description: "Rule trace and weighted fraud scores must not differ by more than 15 points",
    check: (i) => {
      if (i.fraudScoreRuleTrace === null || i.fraudScoreWeighted === null) return false;
      return Math.abs(i.fraudScoreRuleTrace - i.fraudScoreWeighted) > 15;
    },
    severity: "WARNING",
    message: "Rule trace fraud score and weighted fraud score differ by more than 15 points. Contradiction must be disclosed in the report.",
  },
  {
    id: "S5_PHYSICS_ALL_NULL",
    description: "Physics engine must not return all-null values for a physical damage incident",
    check: (i) => i.physicsPlausibilityScore === null && i.incidentTypeKnown && i.damageComponentCount > 0,
    severity: "WARNING",
    message: "Physics engine returned no output for a physical damage incident. Physics section will show estimated values based on damage severity.",
  },
];

/**
 * Run all anomaly sentinels against the given inputs.
 * Returns a list of violations (may be empty).
 */
export function runAnomalySentinels(inputs: AnomalySentinelInputs): AnomalySentinelViolation[] {
  return ANOMALY_SENTINELS
    .filter((sentinel) => sentinel.check(inputs))
    .map((sentinel) => ({
      id: sentinel.id,
      severity: sentinel.severity,
      message: sentinel.message,
    }));
}
