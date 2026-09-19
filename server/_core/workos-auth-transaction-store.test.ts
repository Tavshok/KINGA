import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { workosAuthTransactions } from "../../drizzle/schema";
import { getDb } from "../db";
import { DatabaseHumanAuthTransactionStore } from "./workos-auth-transaction-store";

const now = new Date("2026-09-19T13:00:00.000Z");
const stateHash = "s".repeat(43);
const browserBindingHash = "b".repeat(43);

async function clearTransactions() {
  const db = await getDb();
  if (!db) throw new Error("Dedicated CI database is unavailable");
  await db.delete(workosAuthTransactions);
}

function transaction(
  overrides: Partial<{
    stateHash: string;
    browserBindingHash: string;
    expiresAt: Date;
  }> = {}
) {
  return {
    provider: "workos" as const,
    stateHash: overrides.stateHash ?? stateHash,
    browserBindingHash: overrides.browserBindingHash ?? browserBindingHash,
    codeVerifier: "v".repeat(43),
    redirectUri: "https://app.example.test/api/auth/workos/callback",
    returnTo: "/claims",
    createdAt: now,
    expiresAt: overrides.expiresAt ?? new Date(now.getTime() + 60_000),
  };
}

describe("DatabaseHumanAuthTransactionStore", () => {
  beforeEach(clearTransactions);
  afterEach(clearTransactions);

  it("persists only browser-value hashes and deletes the record on consumption", async () => {
    const store = new DatabaseHumanAuthTransactionStore();
    await store.create(transaction());

    const db = await getDb();
    if (!db) throw new Error("Dedicated CI database is unavailable");
    const [persisted] = await db
      .select()
      .from(workosAuthTransactions)
      .where(eq(workosAuthTransactions.stateHash, stateHash));

    expect(persisted).toMatchObject({
      stateHash,
      browserBindingHash,
      codeVerifier: "v".repeat(43),
      returnTo: "/claims",
    });
    expect(JSON.stringify(persisted)).not.toContain("raw-browser-state");

    await expect(
      store.consume({
        provider: "workos",
        stateHash,
        browserBindingHash,
        now,
      })
    ).resolves.toMatchObject({ returnTo: "/claims" });

    await expect(
      db
        .select()
        .from(workosAuthTransactions)
        .where(eq(workosAuthTransactions.stateHash, stateHash))
    ).resolves.toEqual([]);
  });

  it("allows only one concurrent store instance to consume a transaction", async () => {
    const firstStore = new DatabaseHumanAuthTransactionStore();
    const secondStore = new DatabaseHumanAuthTransactionStore();
    await firstStore.create(transaction());

    const results = await Promise.all([
      firstStore.consume({
        provider: "workos",
        stateHash,
        browserBindingHash,
        now,
      }),
      secondStore.consume({
        provider: "workos",
        stateHash,
        browserBindingHash,
        now,
      }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("deletes an expired verifier record instead of returning it", async () => {
    const store = new DatabaseHumanAuthTransactionStore();
    await store.create(transaction({ expiresAt: new Date(now.getTime() - 1) }));

    await expect(
      store.consume({ provider: "workos", stateHash, browserBindingHash, now })
    ).resolves.toBeNull();

    const db = await getDb();
    if (!db) throw new Error("Dedicated CI database is unavailable");
    await expect(
      db
        .select()
        .from(workosAuthTransactions)
        .where(eq(workosAuthTransactions.stateHash, stateHash))
    ).resolves.toEqual([]);
  });
});
