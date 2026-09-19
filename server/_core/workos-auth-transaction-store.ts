import { and, eq, lt } from "drizzle-orm";

import { workosAuthTransactions } from "../../drizzle/schema";
import {
  hashAuthTransactionOpaqueValue,
  type HumanAuthTransactionStore,
  type PendingHumanAuthTransaction,
} from "./auth-transaction";
import { WORKOS_AUTH_EXPIRED_RETENTION_MS } from "./workos-auth-constants";
import { getDb } from "../db";

/**
 * Durable implementation of Package C's transaction-store interface.
 *
 * The database retains hashes of browser-visible state and binding values, not
 * the raw values themselves. The PKCE verifier is server-only and remains only
 * until the callback atomically consumes the matching row.
 */
export class DatabaseHumanAuthTransactionStore
  implements HumanAuthTransactionStore
{
  async create(transaction: PendingHumanAuthTransaction): Promise<void> {
    const db = await requireDatabase();
    await db
      .delete(workosAuthTransactions)
      .where(
        lt(
          workosAuthTransactions.expiresAt,
          new Date(Date.now() - WORKOS_AUTH_EXPIRED_RETENTION_MS).toISOString()
        )
      );
    await db.insert(workosAuthTransactions).values({
      provider: transaction.provider,
      stateHash: transaction.stateHash,
      browserBindingHash: transaction.browserBindingHash,
      codeVerifier: transaction.codeVerifier,
      redirectUri: transaction.redirectUri,
      returnTo: transaction.returnTo,
      createdAt: transaction.createdAt.toISOString(),
      expiresAt: transaction.expiresAt.toISOString(),
    });
  }

  /**
   * Atomically locks, validates, deletes, and returns one live transaction.
   * A callback cannot replay the transaction because the delete commits in the
   * same database transaction as the lock-protected read.
   */
  async consume(input: {
    provider: "workos";
    stateHash: string;
    browserBindingHash: string;
    now: Date;
  }): Promise<PendingHumanAuthTransaction | null> {
    const db = await requireDatabase();

    return await db.transaction(async tx => {
      const [record] = await tx
        .select()
        .from(workosAuthTransactions)
        .where(
          and(
            eq(workosAuthTransactions.provider, input.provider),
            eq(workosAuthTransactions.stateHash, input.stateHash),
            eq(
              workosAuthTransactions.browserBindingHash,
              input.browserBindingHash
            )
          )
        )
        .for("update");

      if (!record) {
        return null;
      }

      if (new Date(record.expiresAt) <= input.now) {
        await tx
          .delete(workosAuthTransactions)
          .where(eq(workosAuthTransactions.stateHash, input.stateHash));
        return null;
      }

      const deletion = await tx
        .delete(workosAuthTransactions)
        .where(eq(workosAuthTransactions.stateHash, input.stateHash));
      const affectedRows = Number(
        (deletion as unknown as [{ affectedRows?: number }])[0]?.affectedRows ??
          0
      );
      if (affectedRows !== 1) {
        throw new Error(
          "WorkOS authentication transaction consumption was not atomic."
        );
      }

      return {
        provider: "workos",
        stateHash: record.stateHash,
        browserBindingHash: record.browserBindingHash,
        codeVerifier: record.codeVerifier,
        redirectUri: record.redirectUri,
        returnTo: record.returnTo,
        createdAt: new Date(record.createdAt),
        expiresAt: new Date(record.expiresAt),
      };
    });
  }

  /** Removes a just-created transaction when authorization URL construction fails. */
  async discardByState(state: string): Promise<void> {
    const db = await requireDatabase();
    await db
      .delete(workosAuthTransactions)
      .where(
        eq(
          workosAuthTransactions.stateHash,
          hashAuthTransactionOpaqueValue(state)
        )
      );
  }
}

async function requireDatabase() {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "WorkOS human authentication requires the configured database."
    );
  }
  return db;
}
