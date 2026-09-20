import type { RowDataPacket } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2/promise";

import {
  canonicalScheduledEffectPayload,
  scheduledEffectKey,
  validateScheduledEffect,
  type ScheduledEffectInput,
} from "./scheduled-effect-contracts";
import {
  assertActiveFencedTransaction,
  type FencedScheduledTransaction,
} from "./scheduled-execution-lease";

export {
  scheduledEffectKey,
  type ScheduledEffectInput,
} from "./scheduled-effect-contracts";

interface ExistingEffect extends RowDataPacket {
  job_key: string;
  window_key: string;
  effect_type: string;
  subject_key: string;
  payload: unknown;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (("code" in error &&
        (error as { code?: unknown }).code === "ER_DUP_ENTRY") ||
        ("errno" in error && (error as { errno?: unknown }).errno === 1062))
  );
}

function canonicalDatabasePayload(value: unknown): string {
  if (typeof value === "string") {
    try {
      return canonicalScheduledEffectPayload(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return canonicalScheduledEffectPayload(value as { reasonCode: string });
}

function matchesExistingEffect(
  existing: ExistingEffect | undefined,
  fence: FencedScheduledTransaction["fence"],
  effect: ReturnType<typeof validateScheduledEffect>
): boolean {
  return Boolean(
    existing &&
      existing.job_key === fence.jobKey &&
      existing.window_key === fence.windowKey &&
      existing.effect_type === effect.effectType &&
      existing.subject_key === effect.subjectKey &&
      canonicalDatabasePayload(existing.payload) === effect.canonicalPayload
  );
}

/**
 * Enqueues a reviewed, opaque effect only through an active fenced transaction.
 * The INSERT ... SELECT repeats the current-fence and database-clock test in SQL,
 * so a stale or fabricated caller cannot write merely by holding a connection.
 */
export async function enqueueScheduledEffect(
  context: FencedScheduledTransaction,
  input: ScheduledEffectInput
): Promise<{ readonly effectKey: string; readonly inserted: boolean }> {
  assertActiveFencedTransaction(context);
  const effect = validateScheduledEffect(input);
  const { fence, connection } = context;
  const effectKey = scheduledEffectKey(
    fence,
    effect.effectType,
    effect.subjectKey
  );

  const [fenceRows] = await connection.execute<RowDataPacket[]>(
    `SELECT 1
       FROM scheduled_job_executions
      WHERE job_key = ? AND window_key = ? AND execution_id = ? AND generation = ?
        AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP(3)
      FOR UPDATE`,
    [fence.jobKey, fence.windowKey, fence.executionId, fence.generation]
  );
  if (fenceRows.length !== 1)
    throw new Error("STALE_SCHEDULED_EXECUTION_FENCE");

  const [windowRows] = await connection.execute<ExistingEffect[]>(
    `SELECT job_key, window_key, effect_type, subject_key, payload
       FROM scheduled_job_effects
      WHERE job_key = ? AND window_key = ?
      FOR UPDATE`,
    [fence.jobKey, fence.windowKey]
  );
  if (windowRows[0]) {
    if (matchesExistingEffect(windowRows[0], fence, effect)) {
      return { effectKey, inserted: false };
    }
    throw new Error("SCHEDULED_EFFECT_DEDUPLICATION_CONFLICT");
  }

  try {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO scheduled_job_effects
       (effect_key, job_key, window_key, execution_id, generation, effect_type,
         subject_key, payload, status, attempt_count, available_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, UTC_TIMESTAMP(3)
         FROM scheduled_job_executions
        WHERE job_key = ? AND window_key = ? AND execution_id = ? AND generation = ?
          AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP(3)`,
      [
        effectKey,
        fence.jobKey,
        fence.windowKey,
        fence.executionId,
        fence.generation,
        effect.effectType,
        effect.subjectKey,
        effect.canonicalPayload,
        fence.jobKey,
        fence.windowKey,
        fence.executionId,
        fence.generation,
      ]
    );
    if (result.affectedRows === 1) return { effectKey, inserted: true };
    throw new Error("STALE_SCHEDULED_EXECUTION_FENCE");
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const [rows] = await connection.execute<ExistingEffect[]>(
    `SELECT job_key, window_key, effect_type, subject_key, payload
       FROM scheduled_job_effects
      WHERE job_key = ? AND window_key = ?
      FOR UPDATE`,
    [fence.jobKey, fence.windowKey]
  );
  const existing = rows[0];
  if (!matchesExistingEffect(existing, fence, effect)) {
    throw new Error("SCHEDULED_EFFECT_DEDUPLICATION_CONFLICT");
  }

  // Identical effects intentionally deduplicate across generations for the same
  // canonical window. A changed type, subject, or payload is always a conflict.
  return { effectKey, inserted: false };
}
