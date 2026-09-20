import { randomUUID } from "node:crypto";

import type mysql from "mysql2/promise";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { getRawPool } from "../db-core";
import {
  acquireScheduledLease,
  completeScheduledLease,
  readScheduledLease,
  renewScheduledLease,
  withScheduledLeaseTransaction,
} from "./scheduled-execution-lease";

let pool: mysql.Pool;
const windows: string[] = [];

function windowKey(label: string): string {
  const value = `g1-test/${label}/${randomUUID()}`;
  windows.push(value);
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

describe("G1 durable scheduled execution lease", () => {
  it("allows one winner under a dual-trigger race", async () => {
    const window = windowKey("race");
    const results = await Promise.all([
      acquireScheduledLease({
        jobKey: "intake-escalation",
        windowKey: window,
        leaseDurationMs: 60_000,
        pool,
      }),
      acquireScheduledLease({
        jobKey: "intake-escalation",
        windowKey: window,
        leaseDurationMs: 60_000,
        pool,
      }),
    ]);
    expect(
      results.filter(result => result.outcome === "acquired")
    ).toHaveLength(1);
    expect(results.filter(result => result.outcome === "busy")).toHaveLength(1);
  });

  it("uses the database clock despite a fast injected local-clock argument", async () => {
    const window = windowKey("clock-skew");
    const first = await acquireScheduledLease({
      jobKey: "stuck-recovery",
      windowKey: window,
      leaseDurationMs: 60_000,
      pool,
    });
    if (first.outcome !== "acquired") throw new Error("Expected acquisition");

    // `now` is deliberately unsupported authority input. A fast local timestamp
    // cannot make the second caller take over the database-clock-valid lease.
    const skewed = await acquireScheduledLease({
      jobKey: "stuck-recovery",
      windowKey: window,
      leaseDurationMs: 60_000,
      pool,
      now: new Date("2099-01-01T00:00:00.000Z"),
    });
    expect(skewed.outcome).toBe("busy");
  });

  it("preserves millisecond expiry boundaries and fences the prior holder after takeover", async () => {
    const window = windowKey("millisecond-boundary");
    const first = await acquireScheduledLease({
      jobKey: "stuck-recovery",
      windowKey: window,
      leaseDurationMs: 1_000,
      pool,
    });
    if (first.outcome !== "acquired") throw new Error("Expected acquisition");

    const row = await readScheduledLease("stuck-recovery", window, { pool });
    expect(row?.lease_expires_at).toBeDefined();
    await delay(350);
    await expect(
      acquireScheduledLease({
        jobKey: "stuck-recovery",
        windowKey: window,
        leaseDurationMs: 60_000,
        pool,
      })
    ).resolves.toMatchObject({ outcome: "busy" });

    await delay(850);
    const second = await acquireScheduledLease({
      jobKey: "stuck-recovery",
      windowKey: window,
      leaseDurationMs: 60_000,
      pool,
    });
    if (second.outcome !== "taken_over") throw new Error("Expected takeover");
    expect(second.fence.generation).toBe(first.fence.generation + 1);

    await expect(
      withScheduledLeaseTransaction(first.fence, async () => "must-not-run", {
        pool,
      })
    ).rejects.toThrow("STALE_SCHEDULED_EXECUTION_FENCE");
    await expect(
      completeScheduledLease(first.fence, "stale", { pool })
    ).resolves.toBe(false);
    await expect(
      completeScheduledLease(second.fence, "success", { pool })
    ).resolves.toBe(true);
  });

  it("renews only the current database-clock-valid fence", async () => {
    const acquired = await acquireScheduledLease({
      jobKey: "stuck-recovery",
      windowKey: windowKey("renew"),
      leaseDurationMs: 60_000,
      pool,
    });
    if (acquired.outcome !== "acquired")
      throw new Error("Expected acquisition");
    await expect(
      renewScheduledLease(acquired.fence, 120_000, { pool })
    ).resolves.toBe(true);
  });

  it("marks a current window complete and prevents replay while later windows stay independent", async () => {
    const firstWindow = windowKey("complete");
    const acquired = await acquireScheduledLease({
      jobKey: "intake-escalation",
      windowKey: firstWindow,
      leaseDurationMs: 60_000,
      pool,
    });
    if (acquired.outcome !== "acquired")
      throw new Error("Expected acquisition");
    await expect(
      completeScheduledLease(acquired.fence, "success", { pool })
    ).resolves.toBe(true);
    await expect(
      completeScheduledLease(acquired.fence, "success", { pool })
    ).resolves.toBe(false);
    await expect(
      acquireScheduledLease({
        jobKey: "intake-escalation",
        windowKey: firstWindow,
        leaseDurationMs: 60_000,
        pool,
      })
    ).resolves.toEqual({ outcome: "terminal", status: "completed" });

    const later = await acquireScheduledLease({
      jobKey: "intake-escalation",
      windowKey: windowKey("later-window"),
      leaseDurationMs: 60_000,
      pool,
    });
    expect(later.outcome).toBe("acquired");
  });
});
