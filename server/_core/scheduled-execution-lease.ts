import { randomUUID } from "node:crypto";

import type mysql from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { getRawPool } from "../db-core";
import type { ScheduledJobKey } from "./service-capabilities";

export interface ScheduledExecutionFence {
  readonly jobKey: ScheduledJobKey;
  readonly windowKey: string;
  readonly executionId: string;
  readonly generation: number;
}

export interface FencedScheduledTransaction {
  readonly connection: mysql.PoolConnection;
  readonly fence: ScheduledExecutionFence;
}

export type AcquireScheduledLeaseResult =
  | {
      readonly outcome: "acquired" | "taken_over";
      readonly fence: ScheduledExecutionFence;
      readonly leaseExpiresAt: Date;
    }
  | { readonly outcome: "busy"; readonly leaseExpiresAt: Date }
  | {
      readonly outcome: "terminal";
      readonly status: "completed" | "failed" | "cancelled";
    };

export interface AcquireScheduledLeaseOptions {
  readonly jobKey: ScheduledJobKey;
  readonly windowKey: string;
  readonly leaseDurationMs: number;
  /** Compatibility/test input only; lease authority always uses UTC_TIMESTAMP(3). */
  readonly now?: Date;
  readonly executionId?: string;
  readonly pool?: mysql.Pool;
}

interface ExecutionRow extends RowDataPacket {
  execution_id: string;
  generation: number | string | bigint;
  status: "running" | "completed" | "failed" | "cancelled";
  lease_expires_at: Date | string;
  lease_current: 0 | 1 | number | string;
}

const activeFencedTransactions = new WeakSet<object>();

function requireLeaseDuration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 86_400_000) {
    throw new Error("Lease duration must be between 1000ms and 24h");
  }
}

function requireWindowKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/u.test(value)) {
    throw new Error("Invalid scheduled window key");
  }
}

function databaseDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(`${value}Z`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Invalid database lease timestamp");
  }
  return parsed;
}

function asCurrent(row: ExecutionRow): boolean {
  return Number(row.lease_current) === 1;
}

function fenceFromRow(
  jobKey: ScheduledJobKey,
  windowKey: string,
  row: ExecutionRow
): ScheduledExecutionFence {
  return Object.freeze({
    jobKey,
    windowKey,
    executionId: row.execution_id,
    generation: Number(row.generation),
  });
}

async function requiredPool(pool?: mysql.Pool): Promise<mysql.Pool> {
  const resolved = pool ?? (await getRawPool());
  if (!resolved) throw new Error("Scheduled execution database unavailable");
  return resolved;
}

async function selectExecutionForUpdate(
  connection: mysql.PoolConnection,
  jobKey: ScheduledJobKey,
  windowKey: string
): Promise<ExecutionRow | undefined> {
  const [rows] = await connection.execute<ExecutionRow[]>(
    `SELECT execution_id, generation, status, lease_expires_at,
            (lease_expires_at > UTC_TIMESTAMP(3)) AS lease_current
       FROM scheduled_job_executions
      WHERE job_key = ? AND window_key = ?
      FOR UPDATE`,
    [jobKey, windowKey]
  );
  return rows[0];
}

async function selectExecution(
  connection: mysql.PoolConnection,
  jobKey: ScheduledJobKey,
  windowKey: string
): Promise<ExecutionRow | undefined> {
  const [rows] = await connection.execute<ExecutionRow[]>(
    `SELECT execution_id, generation, status, lease_expires_at,
            (lease_expires_at > UTC_TIMESTAMP(3)) AS lease_current
       FROM scheduled_job_executions
      WHERE job_key = ? AND window_key = ?`,
    [jobKey, windowKey]
  );
  return rows[0];
}

/**
 * Lease authority is defined solely by the database UTC clock. Callers cannot
 * accelerate acquisition, takeover, renewal, work, or completion with a local
 * clock; all timestamps are stored as TIMESTAMP(3).
 */
export async function acquireScheduledLease(
  options: AcquireScheduledLeaseOptions
): Promise<AcquireScheduledLeaseResult> {
  requireWindowKey(options.windowKey);
  requireLeaseDuration(options.leaseDurationMs);
  const pool = await requiredPool(options.pool);
  const connection = await pool.getConnection();
  const executionId = options.executionId ?? randomUUID();
  const leaseDurationMicros = options.leaseDurationMs * 1_000;

  try {
    await connection.beginTransaction();
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO scheduled_job_executions
        (job_key, window_key, execution_id, generation, status, lease_expires_at,
         attempt_count, takeover_count, started_at)
       VALUES (?, ?, ?, 1, 'running',
               DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MICROSECOND),
               1, 0, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE job_key = VALUES(job_key)`,
      [options.jobKey, options.windowKey, executionId, leaseDurationMicros]
    );

    const current = await selectExecutionForUpdate(
      connection,
      options.jobKey,
      options.windowKey
    );
    if (!current) {
      throw new Error("Scheduled execution conflict row disappeared");
    }

    if (insertResult.insertId !== 0 && current.execution_id === executionId) {
      await connection.commit();
      return {
        outcome: "acquired",
        fence: fenceFromRow(options.jobKey, options.windowKey, current),
        leaseExpiresAt: databaseDate(current.lease_expires_at),
      };
    }

    if (current.status !== "running") {
      await connection.commit();
      return { outcome: "terminal", status: current.status };
    }

    if (asCurrent(current)) {
      await connection.commit();
      return {
        outcome: "busy",
        leaseExpiresAt: databaseDate(current.lease_expires_at),
      };
    }

    const generation = Number(current.generation) + 1;
    const [takeover] = await connection.execute<ResultSetHeader>(
      `UPDATE scheduled_job_executions
          SET execution_id = ?, generation = ?,
              lease_expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MICROSECOND),
              attempt_count = attempt_count + 1, takeover_count = takeover_count + 1,
              started_at = UTC_TIMESTAMP(3), completed_at = NULL, outcome_code = NULL
        WHERE job_key = ? AND window_key = ? AND status = 'running'
          AND execution_id = ? AND generation = ?
          AND lease_expires_at <= UTC_TIMESTAMP(3)`,
      [
        executionId,
        generation,
        leaseDurationMicros,
        options.jobKey,
        options.windowKey,
        current.execution_id,
        current.generation,
      ]
    );
    if (takeover.affectedRows !== 1) {
      throw new Error("Scheduled execution takeover lost database clock fence");
    }

    const renewed = await selectExecutionForUpdate(
      connection,
      options.jobKey,
      options.windowKey
    );
    if (!renewed)
      throw new Error("Scheduled execution takeover row disappeared");
    await connection.commit();
    return {
      outcome: "taken_over",
      fence: fenceFromRow(options.jobKey, options.windowKey, renewed),
      leaseExpiresAt: databaseDate(renewed.lease_expires_at),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function renewScheduledLease(
  fence: ScheduledExecutionFence,
  leaseDurationMs: number,
  options: { readonly pool?: mysql.Pool } = {}
): Promise<boolean> {
  requireLeaseDuration(leaseDurationMs);
  const pool = await requiredPool(options.pool);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE scheduled_job_executions
        SET lease_expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MICROSECOND)
      WHERE job_key = ? AND window_key = ? AND execution_id = ? AND generation = ?
        AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP(3)`,
    [
      leaseDurationMs * 1_000,
      fence.jobKey,
      fence.windowKey,
      fence.executionId,
      fence.generation,
    ]
  );
  return result.affectedRows === 1;
}

/**
 * Creates an opaque active context only after a row lock verifies this exact
 * running fence against the database UTC clock. Consumers must use this context
 * for transactional effects; a stale/fabricated context is rejected.
 */
export async function withScheduledLeaseTransaction<T>(
  fence: ScheduledExecutionFence,
  work: (context: FencedScheduledTransaction) => Promise<T>,
  options: { readonly pool?: mysql.Pool } = {}
): Promise<T> {
  const pool = await requiredPool(options.pool);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const current = await selectExecutionForUpdate(
      connection,
      fence.jobKey,
      fence.windowKey
    );
    if (
      !current ||
      current.status !== "running" ||
      current.execution_id !== fence.executionId ||
      Number(current.generation) !== fence.generation ||
      !asCurrent(current)
    ) {
      throw new Error("STALE_SCHEDULED_EXECUTION_FENCE");
    }

    const context: FencedScheduledTransaction = Object.freeze({
      connection,
      fence: Object.freeze({ ...fence }),
    });
    activeFencedTransactions.add(context);
    try {
      const result = await work(context);
      await connection.commit();
      return result;
    } finally {
      activeFencedTransactions.delete(context);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Rejects a context not minted by a currently active fenced transaction. */
export function assertActiveFencedTransaction(
  context: FencedScheduledTransaction
): void {
  if (!activeFencedTransactions.has(context)) {
    throw new Error("STALE_SCHEDULED_EXECUTION_FENCE");
  }
}

export async function finishScheduledLease(
  fence: ScheduledExecutionFence,
  status: "completed" | "failed" | "cancelled",
  outcomeCode: string,
  options: { readonly pool?: mysql.Pool } = {}
): Promise<boolean> {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(outcomeCode)) {
    throw new Error("Invalid scheduled outcome code");
  }
  try {
    return await withScheduledLeaseTransaction(
      fence,
      async context => {
        const [result] = await context.connection.execute<ResultSetHeader>(
          `UPDATE scheduled_job_executions
              SET status = ?, completed_at = UTC_TIMESTAMP(3), outcome_code = ?
            WHERE job_key = ? AND window_key = ? AND execution_id = ? AND generation = ?
              AND status = 'running' AND lease_expires_at > UTC_TIMESTAMP(3)`,
          [
            status,
            outcomeCode,
            fence.jobKey,
            fence.windowKey,
            fence.executionId,
            fence.generation,
          ]
        );
        if (result.affectedRows !== 1) {
          throw new Error("STALE_SCHEDULED_EXECUTION_FENCE");
        }
        return true;
      },
      options
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STALE_SCHEDULED_EXECUTION_FENCE"
    ) {
      return false;
    }
    throw error;
  }
}

export async function completeScheduledLease(
  fence: ScheduledExecutionFence,
  outcomeCode: string,
  options: { readonly pool?: mysql.Pool } = {}
): Promise<boolean> {
  return finishScheduledLease(fence, "completed", outcomeCode, options);
}

export async function cancelScheduledLease(
  fence: ScheduledExecutionFence,
  outcomeCode: string,
  options: { readonly pool?: mysql.Pool } = {}
): Promise<boolean> {
  return finishScheduledLease(fence, "cancelled", outcomeCode, options);
}

export async function runWithScheduledLease<T>(
  options: AcquireScheduledLeaseOptions,
  runner: (fence: ScheduledExecutionFence) => Promise<T>
): Promise<{
  readonly acquisition: AcquireScheduledLeaseResult;
  readonly value?: T;
}> {
  const acquisition = await acquireScheduledLease(options);
  if (
    acquisition.outcome !== "acquired" &&
    acquisition.outcome !== "taken_over"
  ) {
    return { acquisition };
  }
  const value = await runner(acquisition.fence);
  const completed = await completeScheduledLease(
    acquisition.fence,
    "completed",
    {
      pool: options.pool,
    }
  );
  if (!completed) throw new Error("Scheduled lease lost before completion");
  return { acquisition, value };
}

/** Exposed only to integration tests to assert a database-clock lease row. */
export async function readScheduledLease(
  jobKey: ScheduledJobKey,
  windowKey: string,
  options: { readonly pool?: mysql.Pool } = {}
): Promise<ExecutionRow | undefined> {
  const pool = await requiredPool(options.pool);
  const connection = await pool.getConnection();
  try {
    return await selectExecution(connection, jobKey, windowKey);
  } finally {
    connection.release();
  }
}
