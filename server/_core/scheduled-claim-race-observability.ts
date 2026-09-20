import { createHash, randomUUID } from "node:crypto";

/**
 * Source-only correlation data for accepted duplicate scheduled work across
 * independently deployed runtimes. This module deliberately does not take a
 * lock, write a database row, or alter job behavior.
 */
const PROCESS_STARTED_AT = new Date().toISOString();
const RUNTIME_INSTANCE_ID = randomUUID();

export type ScheduledJobKey = "intake-escalation" | "stuck-recovery";
export type ScheduledInvocationSource =
  | "heartbeat"
  | "in_process_interval"
  | "startup_immediate"
  | "startup_cleanup"
  | "direct";
export type ScheduledObservationPhase =
  | "candidate_selected"
  | "side_effect_intent"
  | "side_effect_completed"
  | "pipeline_trigger_dispatched"
  | "error";

export type ScheduledJobRunContext = Readonly<{
  jobKey: ScheduledJobKey;
  invocationSource: ScheduledInvocationSource;
  jobRunId: string;
  heartbeatTaskUid: string | null;
}>;

type ScheduledClaimRaceObservation = Readonly<{
  phase: ScheduledObservationPhase;
  action: string;
  claimId?: number;
  tenantId?: number | null;
  recoveryCase?: string | null;
  batchFingerprint?: string;
  candidateCount?: number;
  outcome?: "attempted" | "completed" | "dispatched" | "error";
  errorCode?: string;
}>;

function normalizeTaskUid(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

function sanitizeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "UNCLASSIFIED_ERROR";

  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return "UNCLASSIFIED_ERROR";

  const mappedCodes: Record<string, string> = {
    ECONNREFUSED: "CONNECTION_REFUSED",
    ECONNRESET: "CONNECTION_RESET",
    ER_LOCK_DEADLOCK: "DATABASE_DEADLOCK",
    ER_LOCK_WAIT_TIMEOUT: "DATABASE_LOCK_TIMEOUT",
    ETIMEDOUT: "TIMEOUT",
  };
  return mappedCodes[code] ?? "UNCLASSIFIED_ERROR";
}

export function createScheduledJobRunContext(
  jobKey: ScheduledJobKey,
  invocationSource: ScheduledInvocationSource = "direct",
  heartbeatTaskUid?: string
): ScheduledJobRunContext {
  return {
    jobKey,
    invocationSource,
    jobRunId: randomUUID(),
    heartbeatTaskUid: normalizeTaskUid(heartbeatTaskUid),
  };
}

/**
 * Provides a stable, non-PII batch key for correlating duplicate aggregate
 * notifications. Claim identifiers remain in the process only long enough to
 * derive the hash; they are not included in this event.
 */
export function createScheduledClaimBatchFingerprint(
  claimIds: readonly number[]
): string {
  const canonicalIds = [...claimIds]
    .sort((left, right) => left - right)
    .join(",");
  return createHash("sha256").update(canonicalIds).digest("hex").slice(0, 24);
}

export function observeScheduledClaimRace(
  context: ScheduledJobRunContext,
  observation: ScheduledClaimRaceObservation
): void {
  // Observability must never change scheduled-job semantics. Both payload
  // construction and the configured log sink are treated as best effort.
  try {
    const payload = {
      event: "scheduled_claim_race_observation",
      schema_version: 1,
      observed_at: new Date().toISOString(),
      job_key: context.jobKey,
      invocation_source: context.invocationSource,
      job_run_id: context.jobRunId,
      heartbeat_task_uid: context.heartbeatTaskUid,
      runtime_instance_id: RUNTIME_INSTANCE_ID,
      runtime: {
        hostname: process.env.HOSTNAME ?? null,
        service: process.env.K_SERVICE ?? null,
        node_env: process.env.NODE_ENV ?? null,
        pid: process.pid,
        process_started_at: PROCESS_STARTED_AT,
      },
      phase: observation.phase,
      action: observation.action,
      claim_ref:
        typeof observation.claimId === "number"
          ? `claim:${observation.claimId}`
          : null,
      tenant_id: observation.tenantId ?? null,
      recovery_case: observation.recoveryCase ?? null,
      batch_fingerprint: observation.batchFingerprint ?? null,
      candidate_count: observation.candidateCount ?? null,
      outcome: observation.outcome ?? null,
      error_code: observation.errorCode ?? null,
    };

    console.warn(JSON.stringify(payload));
  } catch {
    // Intentionally swallow logging failures: job side effects must proceed.
  }
}

export function observeScheduledClaimRaceError(
  context: ScheduledJobRunContext,
  observation: Omit<
    ScheduledClaimRaceObservation,
    "phase" | "outcome" | "errorCode"
  >,
  error: unknown
): void {
  let errorCode = "UNCLASSIFIED_ERROR";
  try {
    errorCode = sanitizeErrorCode(error);
  } catch {
    // A hostile getter on an arbitrary error object must not reach job code.
  }

  observeScheduledClaimRace(context, {
    ...observation,
    phase: "error",
    outcome: "error",
    errorCode,
  });
}
