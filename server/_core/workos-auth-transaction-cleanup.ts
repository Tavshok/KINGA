import { lt } from "drizzle-orm";

import { workosAuthTransactions } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Maximum time an abandoned, expired PKCE verifier can remain after its
 * five-minute transaction expiry. This interval starts only with the default-off
 * WorkOS human-auth route and is independent of future login traffic.
 */
export const WORKOS_AUTH_TRANSACTION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

type CleanupDependencies = {
  now: () => Date;
  deleteExpired: (before: Date) => Promise<void>;
  schedule: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  error: (message: string) => void;
};

export async function deleteExpiredWorkOSAuthTransactions(
  before = new Date()
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "WorkOS transaction cleanup requires the configured database."
    );
  }
  await db
    .delete(workosAuthTransactions)
    .where(lt(workosAuthTransactions.expiresAt, before.toISOString()));
}

/**
 * Starts one bounded hourly cleanup loop once the explicitly enabled WorkOS
 * human-auth feature is mounted. The immediate run bounds retention after a
 * restart; the recurring run prevents an abandoned final login from retaining
 * a PKCE verifier until another user starts authentication.
 */
export function startWorkOSAuthTransactionCleanup(
  overrides: Partial<CleanupDependencies> = {}
): NodeJS.Timeout {
  const dependencies: CleanupDependencies = {
    now: () => new Date(),
    deleteExpired: deleteExpiredWorkOSAuthTransactions,
    schedule: (callback, delayMs) => setInterval(callback, delayMs),
    error: message => console.error(message),
    ...overrides,
  };

  const run = () => {
    dependencies.deleteExpired(dependencies.now()).catch(() => {
      // No record details, browser values, or provider data enter the log.
      dependencies.error("[WorkOS] Authentication transaction cleanup failed.");
    });
  };

  run();
  const timer = dependencies.schedule(
    run,
    WORKOS_AUTH_TRANSACTION_CLEANUP_INTERVAL_MS
  );
  timer.unref?.();
  return timer;
}
