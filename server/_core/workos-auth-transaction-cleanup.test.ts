import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { workosAuthTransactions } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  deleteExpiredWorkOSAuthTransactions,
  startWorkOSAuthTransactionCleanup,
  WORKOS_AUTH_TRANSACTION_CLEANUP_INTERVAL_MS,
} from "./workos-auth-transaction-cleanup";

const expiredState = "e".repeat(43);
const liveState = "l".repeat(43);

async function clearRows() {
  const db = await getDb();
  if (!db) throw new Error("Dedicated CI database is unavailable");
  await db
    .delete(workosAuthTransactions)
    .where(eq(workosAuthTransactions.provider, "workos-cleanup-test"));
}

async function insertRow(stateHash: string, expiresAt: string) {
  const db = await getDb();
  if (!db) throw new Error("Dedicated CI database is unavailable");
  await db.insert(workosAuthTransactions).values({
    stateHash,
    provider: "workos-cleanup-test",
    browserBindingHash: "b".repeat(43),
    codeVerifier: "v".repeat(43),
    redirectUri: "https://app.example.test/api/auth/workos/callback",
    returnTo: "/",
    createdAt: "2026-09-19T12:00:00.000Z",
    expiresAt,
  });
}

describe("WorkOS authentication transaction cleanup", () => {
  beforeEach(clearRows);
  afterEach(clearRows);

  it("deletes abandoned expired verifier records while preserving live records", async () => {
    await insertRow(expiredState, "2026-09-19T12:04:59.000Z");
    await insertRow(liveState, "2026-09-19T12:05:01.000Z");

    await deleteExpiredWorkOSAuthTransactions(
      new Date("2026-09-19T12:05:00.000Z")
    );

    const db = await getDb();
    if (!db) throw new Error("Dedicated CI database is unavailable");
    const rows = await db
      .select({ stateHash: workosAuthTransactions.stateHash })
      .from(workosAuthTransactions)
      .where(eq(workosAuthTransactions.provider, "workos-cleanup-test"));
    expect(rows).toEqual([{ stateHash: liveState }]);
  });

  it("runs immediately and schedules bounded recurring cleanup without logging data", async () => {
    const deleteExpired = vi.fn(async () => undefined);
    const schedule = vi.fn(
      () => ({ unref: vi.fn() }) as unknown as NodeJS.Timeout
    );
    const error = vi.fn();
    const now = new Date("2026-09-19T12:05:00.000Z");

    startWorkOSAuthTransactionCleanup({
      now: () => now,
      deleteExpired,
      schedule,
      error,
    });
    await vi.waitFor(() => expect(deleteExpired).toHaveBeenCalledWith(now));

    expect(schedule).toHaveBeenCalledWith(
      expect.any(Function),
      WORKOS_AUTH_TRANSACTION_CLEANUP_INTERVAL_MS
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("logs only a fixed category when cleanup infrastructure fails", async () => {
    const error = vi.fn();
    startWorkOSAuthTransactionCleanup({
      deleteExpired: async () => {
        throw new Error(
          "state=secret browserBinding=secret codeVerifier=secret"
        );
      },
      schedule: () => ({ unref: vi.fn() }) as unknown as NodeJS.Timeout,
      error,
    });

    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error).toHaveBeenCalledWith(
      "[WorkOS] Authentication transaction cleanup failed."
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
  });
});
