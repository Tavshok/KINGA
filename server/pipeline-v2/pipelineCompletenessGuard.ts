/**
 * pipelineCompletenessGuard.ts
 *
 * Phase 6 — Pipeline Completeness Enforcement
 *
 * Design principle:
 *   The pipeline must NEVER write a report if IFE or DOE is absent.
 *   An incomplete execution is not a "degraded report" — it is a failed execution.
 *   Failed executions are routed to PIPELINE_INCOMPLETE state in the exception queue.
 *
 * This guard runs as the final check before the orchestrator calls db.ts to persist
 * the assessment result. If the guard fails, the orchestrator throws a
 * PipelineIncompleteError instead of writing a report.
 *
 * The Governance Gate (reportVersionGate.ts) is now a historical migration utility
 * only — it classifies existing DB records that predate Phase 4 deployment.
 * New pipeline runs will never produce a sub-v4.0 report.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompletenessFailureReason =
  | "IFE_ABSENT"          // Input Fidelity Engine did not run or returned null
  | "DOE_ABSENT"          // Decision Optimisation Engine did not run or returned null
  | "FEL_SNAPSHOT_ABSENT" // FEL version snapshot could not be built
  | "REPLAY_INCOMPLETE";  // FEL snapshot built but has missing prompt hashes

export interface CompletenessGuardResult {
  complete: boolean;
  failures: CompletenessFailure[];
  /** State to write to the state machine if guard fails */
  failureState: "PIPELINE_INCOMPLETE" | "REPLAY_INCOMPLETE" | null;
  /** Human-readable reason for the exception queue */
  exceptionReason: string | null;
}

export interface CompletenessFailure {
  reason: CompletenessFailureReason;
  detail: string;
  /** Whether this failure blocks report write entirely */
  blocking: boolean;
}

/**
 * Thrown by the orchestrator when the completeness guard fails.
 * Caught at the top level to route the claim to the exception queue.
 */
export class PipelineIncompleteError extends Error {
  public readonly guardResult: CompletenessGuardResult;
  public readonly claimId: number;

  constructor(claimId: number, guardResult: CompletenessGuardResult) {
    super(
      `Pipeline completeness guard failed for claim ${claimId}: ${guardResult.exceptionReason}`
    );
    this.name = "PipelineIncompleteError";
    this.guardResult = guardResult;
    this.claimId = claimId;
  }
}

// ─── Guard inputs ─────────────────────────────────────────────────────────────

export interface CompletenessGuardInput {
  /** Result from inputFidelityEngine.runIFE() — null if IFE did not run */
  ifeResult: object | null | undefined;
  /** Result from decisionOptimisationEngine.runDOE() — null if DOE did not run */
  doeResult: object | null | undefined;
  /** Result from felVersionRegistry.buildFELVersionSnapshot() — null if not built */
  felVersionSnapshot: {
    replaySupported: boolean;
    replayLimitation?: string | null;
    stages: Array<{ promptHash: string | null }>;
  } | null | undefined;
  /** Whether this is a re-analysis run (slightly relaxed rules for legacy re-runs) */
  isReanalysis?: boolean;
}

// ─── Guard implementation ─────────────────────────────────────────────────────

/**
 * Runs the completeness guard before report write.
 *
 * Blocking failures (IFE_ABSENT, DOE_ABSENT):
 *   → failureState = "PIPELINE_INCOMPLETE"
 *   → orchestrator must NOT write a report
 *
 * Non-blocking failures (REPLAY_INCOMPLETE):
 *   → failureState = "REPLAY_INCOMPLETE"
 *   → report CAN be written but is flagged in the exception queue
 *   → assessors are warned that the decision cannot be replayed to court standard
 */
export function runCompletenessGuard(input: CompletenessGuardInput): CompletenessGuardResult {
  const failures: CompletenessFailure[] = [];

  // ── Check 1: IFE must be present ──────────────────────────────────────────
  if (!input.ifeResult) {
    failures.push({
      reason: "IFE_ABSENT",
      detail:
        "The Input Fidelity Engine did not produce a result. Data gap attribution is unavailable. " +
        "This means data gaps cannot be classified by responsible party and the DOE eligibility " +
        "gate cannot be applied. The pipeline cannot produce a defensible report without IFE output.",
      blocking: true,
    });
  }

  // ── Check 2: DOE must be present ──────────────────────────────────────────
  if (!input.doeResult) {
    failures.push({
      reason: "DOE_ABSENT",
      detail:
        "The Decision Optimisation Engine did not produce a result. Cost decisions are not " +
        "systematically defensible without DOE scoring. The pipeline cannot produce a report " +
        "that meets the v4.0 adjudication standard without DOE output.",
      blocking: true,
    });
  }

  // ── Check 3: FEL version snapshot (non-blocking) ──────────────────────────
  if (!input.felVersionSnapshot) {
    failures.push({
      reason: "FEL_SNAPSHOT_ABSENT",
      detail:
        "The FEL version snapshot could not be built. The decision cannot be replayed or " +
        "audited to court standard. This is a non-blocking failure — the report can be written " +
        "but is flagged as REPLAY_INCOMPLETE.",
      blocking: false,
    });
  } else if (!input.felVersionSnapshot.replaySupported) {
    // Snapshot was built but has missing prompt hashes
    failures.push({
      reason: "REPLAY_INCOMPLETE",
      detail:
        input.felVersionSnapshot.replayLimitation ??
        "One or more pipeline stages are missing prompt hashes. The decision cannot be fully " +
        "replayed to court standard. Report is flagged as REPLAY_INCOMPLETE.",
      blocking: false,
    });
  }

  // ── Determine overall result ───────────────────────────────────────────────
  const blockingFailures = failures.filter(f => f.blocking);
  const nonBlockingFailures = failures.filter(f => !f.blocking);

  if (blockingFailures.length > 0) {
    // Hard failure — do not write report
    const reasons = blockingFailures.map(f => f.reason).join(", ");
    return {
      complete: false,
      failures,
      failureState: "PIPELINE_INCOMPLETE",
      exceptionReason:
        `Pipeline incomplete: ${reasons}. ` +
        blockingFailures.map(f => f.detail).join(" "),
    };
  }

  if (nonBlockingFailures.length > 0) {
    // Soft failure — write report but flag it
    return {
      complete: true,
      failures,
      failureState: "REPLAY_INCOMPLETE",
      exceptionReason:
        nonBlockingFailures.map(f => f.detail).join(" "),
    };
  }

  // All checks passed
  return {
    complete: true,
    failures: [],
    failureState: null,
    exceptionReason: null,
  };
}

// ─── Orchestrator integration helper ─────────────────────────────────────────

/**
 * Call this in the orchestrator immediately before persisting the assessment result.
 * Throws PipelineIncompleteError if blocking failures are found.
 * Returns the guard result (including any non-blocking REPLAY_INCOMPLETE flags)
 * so the orchestrator can persist them alongside the report.
 *
 * @example
 * ```ts
 * const guardResult = enforceCompletenessOrThrow(claimId, {
 *   ifeResult: stage9Data.ifeResult,
 *   doeResult: stage9Data.doeResult,
 *   felVersionSnapshot,
 * });
 * // guardResult.failureState may be "REPLAY_INCOMPLETE" — persist it
 * await saveAssessment({ ...result, replayStatus: guardResult.failureState });
 * ```
 */
export function enforceCompletenessOrThrow(
  claimId: number,
  input: CompletenessGuardInput
): CompletenessGuardResult {
  const guardResult = runCompletenessGuard(input);

  if (!guardResult.complete) {
    throw new PipelineIncompleteError(claimId, guardResult);
  }

  return guardResult;
}
