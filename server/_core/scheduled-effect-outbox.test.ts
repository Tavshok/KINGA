import { randomUUID } from "node:crypto";

import type mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getRawPool } from "../db-core";
import {
  enqueueScheduledEffect,
  scheduledEffectKey,
  type ScheduledEffectInput,
} from "./scheduled-effect-outbox";
import {
  acquireScheduledLease,
  withScheduledLeaseTransaction,
} from "./scheduled-execution-lease";

let pool: mysql.Pool;
const windows: string[] = [];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquire(label: string, leaseDurationMs = 60_000) {
  const windowKey = `g1-test/outbox/${label}/${randomUUID()}`;
  windows.push(windowKey);
  const result = await acquireScheduledLease({
    jobKey: "intake-escalation",
    windowKey,
    leaseDurationMs,
    pool,
  });
  if (result.outcome !== "acquired") throw new Error("Expected acquisition");
  return result.fence;
}

const effect: ScheduledEffectInput = {
  effectType: "intake-escalation:queue-claim",
  subjectKey: "claim:123",
  payload: { reasonCode: "intake_timeout" },
};

beforeAll(async () => {
  const resolved = await getRawPool();
  if (!resolved) throw new Error("Guarded kinga_ci_test pool unavailable");
  pool = resolved;
});

afterEach(async () => {
  if (windows.length === 0) return;
  const placeholders = windows.map(() => "?").join(",");
  await pool.execute(
    `DELETE FROM scheduled_job_effects WHERE window_key IN (${placeholders})`,
    windows
  );
  await pool.execute(
    `DELETE FROM scheduled_job_executions WHERE window_key IN (${placeholders})`,
    windows
  );
  windows.splice(0);
});

describe("G1 transactional scheduled effect outbox", () => {
  it("derives a stable versioned key and exactly deduplicates one effect", async () => {
    const fence = await acquire("dedupe");
    expect(
      scheduledEffectKey(fence, effect.effectType, effect.subjectKey)
    ).toHaveLength(64);

    const results = await withScheduledLeaseTransaction(
      fence,
      async context => [
        await enqueueScheduledEffect(context, effect),
        await enqueueScheduledEffect(context, effect),
      ],
      { pool }
    );
    expect(results.map(result => result.inserted)).toEqual([true, false]);

    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM scheduled_job_effects WHERE window_key = ?",
      [fence.windowKey]
    );
    expect(Number(rows[0].total)).toBe(1);
  });

  it("rolls the effect back with the enclosing fenced transaction", async () => {
    const fence = await acquire("rollback");
    await expect(
      withScheduledLeaseTransaction(
        fence,
        async context => {
          await enqueueScheduledEffect(context, effect);
          throw new Error("test rollback");
        },
        { pool }
      )
    ).rejects.toThrow("test rollback");

    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM scheduled_job_effects WHERE window_key = ?",
      [fence.windowKey]
    );
    expect(Number(rows[0].total)).toBe(0);
  });

  it("rejects a stale fence after takeover and permits the current holder", async () => {
    const first = await acquire("stale-fence", 1_000);
    await delay(1_150);
    const current = await acquireScheduledLease({
      jobKey: "intake-escalation",
      windowKey: first.windowKey,
      leaseDurationMs: 60_000,
      pool,
    });
    if (current.outcome !== "taken_over") throw new Error("Expected takeover");

    await expect(
      withScheduledLeaseTransaction(
        first,
        context => enqueueScheduledEffect(context, effect),
        { pool }
      )
    ).rejects.toThrow("STALE_SCHEDULED_EXECUTION_FENCE");

    await expect(
      withScheduledLeaseTransaction(
        current.fence,
        context => enqueueScheduledEffect(context, effect),
        { pool }
      )
    ).resolves.toMatchObject({ inserted: true });
  });

  it("deduplicates an exact same-window effect across generations but rejects changed content", async () => {
    const first = await acquire("generation-dedupe", 1_000);
    await withScheduledLeaseTransaction(
      first,
      context => enqueueScheduledEffect(context, effect),
      {
        pool,
      }
    );
    await delay(1_150);
    const current = await acquireScheduledLease({
      jobKey: "intake-escalation",
      windowKey: first.windowKey,
      leaseDurationMs: 60_000,
      pool,
    });
    if (current.outcome !== "taken_over") throw new Error("Expected takeover");

    await expect(
      withScheduledLeaseTransaction(
        current.fence,
        context => enqueueScheduledEffect(context, effect),
        {
          pool,
        }
      )
    ).resolves.toMatchObject({ inserted: false });
    await expect(
      withScheduledLeaseTransaction(
        current.fence,
        context =>
          enqueueScheduledEffect(context, {
            ...effect,
            payload: { reasonCode: "manual_retry" },
          }),
        { pool }
      )
    ).rejects.toThrow("SCHEDULED_EFFECT_DEDUPLICATION_CONFLICT");
    await expect(
      withScheduledLeaseTransaction(
        current.fence,
        context =>
          enqueueScheduledEffect(context, {
            effectType: "stuck-recovery:queue-assessment",
            subjectKey: "assessment:123",
            payload: { reasonCode: "assessment_stuck" },
          }),
        { pool }
      )
    ).rejects.toThrow("SCHEDULED_EFFECT_DEDUPLICATION_CONFLICT");
    await expect(
      withScheduledLeaseTransaction(
        current.fence,
        context =>
          enqueueScheduledEffect(context, {
            ...effect,
            subjectKey: "claim:124",
          }),
        { pool }
      )
    ).rejects.toThrow("SCHEDULED_EFFECT_DEDUPLICATION_CONFLICT");
  });

  it.each([
    { claimantName: "Test Person" },
    { name: "Test Person" },
    { phone: "+263000000" },
    { address: "1 Test Street" },
    { email: "test@example.invalid" },
  ])("rejects PII-shaped payload %j", async payload => {
    const fence = await acquire("pii-payload");
    await expect(
      withScheduledLeaseTransaction(
        fence,
        context =>
          enqueueScheduledEffect(context, { ...effect, payload } as never),
        { pool }
      )
    ).rejects.toThrow("Invalid scheduled effect payload");
  });

  it("rejects a PII-shaped subject reference", async () => {
    const fence = await acquire("pii-subject");
    await expect(
      withScheduledLeaseTransaction(
        fence,
        context =>
          enqueueScheduledEffect(context, {
            ...effect,
            subjectKey: "claimant:Test Person",
          }),
        { pool }
      )
    ).rejects.toThrow("Invalid scheduled effect subject");
  });

  it("does not classify a non-duplicate database failure as deduplication", async () => {
    const fence = await acquire("database-failure");
    await expect(
      withScheduledLeaseTransaction(
        fence,
        async context => {
          const spy = vi
            .spyOn(context.connection, "execute")
            .mockRejectedValueOnce({ code: "ER_BAD_FIELD_ERROR", errno: 1054 });
          try {
            await enqueueScheduledEffect(context, effect);
          } finally {
            spy.mockRestore();
          }
        },
        { pool }
      )
    ).rejects.toMatchObject({ code: "ER_BAD_FIELD_ERROR" });
  });
});
