import { describe, expect, it } from "vitest";
import { AUTH_TRANSACTION_TTL_MS } from "./auth-transaction-policy";
import {
  AuthTransactionError,
  consumeHumanAuthTransaction,
  createHumanAuthTransaction,
  deriveS256CodeChallenge,
  normalizeAuthReturnPath,
  type HumanAuthTransactionStore,
  type PendingHumanAuthTransaction,
} from "./auth-transaction";

class TestOnlyAtomicTransactionStore implements HumanAuthTransactionStore {
  readonly records = new Map<string, PendingHumanAuthTransaction>();
  consumeAttempts = 0;

  async create(transaction: PendingHumanAuthTransaction): Promise<void> {
    this.records.set(transaction.stateHash, transaction);
  }

  async consume(input: {
    stateHash: string;
    browserBindingHash: string;
    now: Date;
  }): Promise<PendingHumanAuthTransaction | null> {
    this.consumeAttempts += 1;
    const transaction = this.records.get(input.stateHash) ?? null;
    if (!transaction) return null;

    // Test fake models an atomic compare-and-delete. It is intentionally not
    // exported and must never become a Package D production fallback.
    if (
      transaction.browserBindingHash !== input.browserBindingHash ||
      transaction.expiresAt <= input.now
    ) {
      return null;
    }

    this.records.delete(input.stateHash);
    return transaction;
  }
}

function isAuthTransactionError(
  error: unknown,
  code: AuthTransactionError["code"]
): boolean {
  return error instanceof AuthTransactionError && error.code === code;
}

describe("WorkOS local authentication transaction", () => {
  it("remains independent of HTTP routes and provider SDKs", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("./auth-transaction.ts", import.meta.url), "utf8")
    );

    expect(source).not.toContain("express");
    expect(source).not.toContain("@workos-inc/node");
  });

  it.each([
    ["/claims", "/claims"],
    ["/claims?tab=active", "/claims?tab=active"],
    ["/claims/123#reports", "/claims/123#reports"],
    ["/%63laims%3Ftab%3Dactive", "/claims?tab=active"],
  ])("keeps an allowed local return path: %s", (input, expected) => {
    expect(normalizeAuthReturnPath(input)).toBe(expected);
  });

  it.each([
    "",
    "claims",
    "https://attacker.example.test",
    "//attacker.example.test",
    "/%2f%2fattacker.example.test",
    "/%252f%252fattacker.example.test",
    "/%5cattacker.example.test",
    "/%00claims",
    "/%2e%2e//attacker.example.test",
    "/%2525252f%2525252fattacker.example.test",
    "/%2525252e%2525252e%2525252f%2525252fattacker.example.test",
    "/%25252500claims",
    "/%C2%80claims",
    "/%C2%85claims",
    "/%C2%9Fclaims",
    "/%6c%6f%67%69%6e",
    "/%6c%6f%67%69%6e/",
    "/%70%6f%72%74%61%6c%2d%68%75%62",
    "/%70%6f%72%74%61%6c%2d%68%75%62/",
    "/login%2f..%2fclaims",
    "/login",
    "/login/",
    "/portal-hub",
    "/portal-hub/",
  ])("rejects an unsafe or looping return path: %s", input => {
    expect(() => normalizeAuthReturnPath(input)).toThrowError(
      expect.objectContaining({ code: "AUTH_TRANSACTION_INVALID_RETURN_PATH" })
    );
  });

  it("matches the RFC 7636 S256 known vector", () => {
    expect(
      deriveS256CodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it.each(["too-short", "has spaces in the verifier", "x".repeat(129)])(
    "rejects an invalid PKCE verifier: %s",
    verifier => {
      expect(() => deriveS256CodeChallenge(verifier)).toThrowError(
        expect.objectContaining({ code: "AUTH_TRANSACTION_INVALID_INPUT" })
      );
    }
  );

  it("creates independent opaque browser values while storing only their hashes", async () => {
    const store = new TestOnlyAtomicTransactionStore();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const transaction = await createHumanAuthTransaction(store, {
      provider: "workos",
      redirectUri: "https://app.example.test/api/auth/workos/callback",
      returnTo: "/claims?tab=active",
      now,
    });

    expect(transaction.state).not.toBe(transaction.browserBinding);
    expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(transaction.browserBinding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(transaction.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(transaction.expiresAt.getTime()).toBe(
      now.getTime() + AUTH_TRANSACTION_TTL_MS
    );

    const stored = [...store.records.values()][0];
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(transaction.state);
    expect(JSON.stringify(stored)).not.toContain(transaction.browserBinding);
    expect(stored?.returnTo).toBe("/claims?tab=active");
  });

  it("consumes a matching transaction exactly once", async () => {
    const store = new TestOnlyAtomicTransactionStore();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const created = await createHumanAuthTransaction(store, {
      provider: "workos",
      redirectUri: "https://app.example.test/api/auth/workos/callback",
      returnTo: "/claims",
      now,
    });

    await expect(
      consumeHumanAuthTransaction(store, {
        provider: "workos",
        state: created.state,
        browserBinding: created.browserBinding,
        now,
      })
    ).resolves.toMatchObject({
      provider: "workos",
      returnTo: "/claims",
    });
    expect(store.records).toHaveLength(0);

    await expect(
      consumeHumanAuthTransaction(store, {
        provider: "workos",
        state: created.state,
        browserBinding: created.browserBinding,
        now,
      })
    ).rejects.toSatisfy(error =>
      isAuthTransactionError(error, "AUTH_TRANSACTION_NOT_FOUND")
    );
  });

  it("does not consume a transaction when the browser binding differs", async () => {
    const store = new TestOnlyAtomicTransactionStore();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const created = await createHumanAuthTransaction(store, {
      provider: "workos",
      redirectUri: "https://app.example.test/api/auth/workos/callback",
      returnTo: "/claims",
      now,
    });

    await expect(
      consumeHumanAuthTransaction(store, {
        provider: "workos",
        state: created.state,
        browserBinding: "z".repeat(43),
        now,
      })
    ).rejects.toSatisfy(error =>
      isAuthTransactionError(error, "AUTH_TRANSACTION_NOT_FOUND")
    );
    expect(store.records).toHaveLength(1);
  });

  it("rejects an expired transaction without returning its verifier", async () => {
    const store = new TestOnlyAtomicTransactionStore();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const created = await createHumanAuthTransaction(store, {
      provider: "workos",
      redirectUri: "https://app.example.test/api/auth/workos/callback",
      returnTo: "/claims",
      now,
    });

    await expect(
      consumeHumanAuthTransaction(store, {
        provider: "workos",
        state: created.state,
        browserBinding: created.browserBinding,
        now: new Date(now.getTime() + AUTH_TRANSACTION_TTL_MS),
      })
    ).rejects.toSatisfy(error =>
      isAuthTransactionError(error, "AUTH_TRANSACTION_NOT_FOUND")
    );
  });

  it("rejects malformed transaction input without revealing supplied values", async () => {
    const store = new TestOnlyAtomicTransactionStore();
    const sensitive = "a".repeat(2049);

    let caught: unknown;
    try {
      await consumeHumanAuthTransaction(store, {
        provider: "workos",
        state: sensitive,
        browserBinding: "b".repeat(43),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toSatisfy(error =>
      isAuthTransactionError(error, "AUTH_TRANSACTION_INVALID_INPUT")
    );
    expect(String(caught)).not.toContain(sensitive);
    expect(store.consumeAttempts).toBe(0);
  });
});
