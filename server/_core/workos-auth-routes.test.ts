import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";

import { COOKIE_NAME } from "@shared/const";

import type {
  CreatedHumanAuthTransaction,
  HumanAuthTransactionStore,
  PendingHumanAuthTransaction,
} from "./auth-transaction";
import { createWorkOSHumanAuthRouter } from "./workos-auth-routes";
import { WORKOS_AUTH_BINDING_COOKIE_NAME } from "./workos-auth-constants";
import type { WorkOSAuthProvider } from "./workos";
import { WorkOSLocalLinkError } from "./workos-local-link";

const servers: Server[] = [];
const redirectUri = "https://app.example.test/api/auth/workos/callback";

class AtomicRouteStore implements HumanAuthTransactionStore {
  records = new Map<string, PendingHumanAuthTransaction>();
  states = new Map<string, string>();

  async create(transaction: PendingHumanAuthTransaction) {
    this.records.set(transaction.stateHash, transaction);
  }

  async consume(input: {
    provider: "workos";
    stateHash: string;
    browserBindingHash: string;
    now: Date;
  }) {
    const record = this.records.get(input.stateHash) ?? null;
    if (
      !record ||
      record.provider !== input.provider ||
      record.browserBindingHash !== input.browserBindingHash ||
      record.expiresAt <= input.now
    ) {
      return null;
    }
    this.records.delete(input.stateHash);
    return record;
  }

  async discardByState(state: string) {
    const { hashAuthTransactionOpaqueValue } = await import(
      "./auth-transaction"
    );
    this.records.delete(hashAuthTransactionOpaqueValue(state));
  }
}

class RedirectMismatchStore extends AtomicRouteStore {
  override async consume(input: {
    provider: "workos";
    stateHash: string;
    browserBindingHash: string;
    now: Date;
  }) {
    const transaction = await super.consume(input);
    return transaction
      ? {
          ...transaction,
          redirectUri: "https://attacker.example.test/api/auth/workos/callback",
        }
      : null;
  }
}

function provider(): WorkOSAuthProvider & {
  getAuthorizationUrl: ReturnType<typeof vi.fn>;
  exchangeCode: ReturnType<typeof vi.fn>;
} {
  return {
    getAuthorizationUrl: vi.fn(
      async input =>
        `https://authkit.example.test/authorize?state=${encodeURIComponent(input.state)}`
    ),
    exchangeCode: vi.fn(async () => ({
      workosUserId: "user_workos_route_test",
      email: "route-owner@example.test",
      emailVerified: true,
      organizationId: "org_workos_route_test",
    })),
  };
}

async function startServer(app: express.Express): Promise<string> {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test address");
  return `http://127.0.0.1:${address.port}`;
}

function cookieValue(response: Response, name: string): string | null {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
}

function createRouteApp(
  overrides: {
    provider?: ReturnType<typeof provider>;
    store?: AtomicRouteStore;
    linkIdentity?: Parameters<
      typeof createWorkOSHumanAuthRouter
    >[0]["linkIdentity"];
    issueSession?: Parameters<
      typeof createWorkOSHumanAuthRouter
    >[0]["issueSession"];
  } = {}
) {
  const app = express();
  const currentProvider = overrides.provider ?? provider();
  const store = overrides.store ?? new AtomicRouteStore();
  const issueSession =
    overrides.issueSession ?? vi.fn(async () => "kinga-local-session");
  const linkIdentity =
    overrides.linkIdentity ??
    vi.fn(async () => ({
      id: 1,
      openId: "route-owner-open-id",
      name: "Route Owner",
      tenantId: "route-tenant",
      role: "user" as const,
    }));

  app.use(
    "/api/auth/workos",
    createWorkOSHumanAuthRouter({
      provider: currentProvider,
      transactionStore: store,
      redirectUri,
      linkIdentity,
      issueSession,
      startLimiter: (_req, _res, next) => next(),
    })
  );
  return { app, currentProvider, store, issueSession, linkIdentity };
}

async function beginTransaction(baseUrl: string): Promise<{
  state: string;
  binding: string;
}> {
  const response = await fetch(
    `${baseUrl}/api/auth/workos/start?returnTo=%2Fclaims`,
    {
      redirect: "manual",
    }
  );
  expect(response.status).toBe(302);
  const location = response.headers.get("location");
  if (!location) throw new Error("Missing authorization redirect");
  const state = new URL(location).searchParams.get("state");
  const binding = cookieValue(response, WORKOS_AUTH_BINDING_COOKIE_NAME);
  if (!state || !binding) throw new Error("Missing transaction values");
  return { state, binding };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        server =>
          new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve()))
          )
      )
  );
});

describe("default-off WorkOS callback routes", () => {
  it("starts with a canonical callback URI, binding cookie, and no raw return path", async () => {
    const { app, currentProvider } = createRouteApp();
    const baseUrl = await startServer(app);

    const response = await fetch(
      `${baseUrl}/api/auth/workos/start?returnTo=%2Fclaims%3Ftab%3Dopen`,
      {
        redirect: "manual",
      }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "https://authkit.example.test/authorize?state="
    );
    expect(response.headers.get("location")).not.toContain("returnTo");
    expect(response.headers.get("location")).not.toContain("code_challenge");
    expect(response.headers.get("location")).not.toContain("code_verifier");
    expect(response.headers.get("set-cookie")).toContain(
      `${WORKOS_AUTH_BINDING_COOKIE_NAME}=`
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(currentProvider.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri,
        codeChallenge: expect.any(String),
      })
    );
  });

  it("consumes once, links the existing local account, and issues only a KINGA session", async () => {
    const { app, currentProvider, issueSession, linkIdentity } =
      createRouteApp();
    const baseUrl = await startServer(app);
    const { state, binding } = await beginTransaction(baseUrl);

    const callback = await fetch(
      `${baseUrl}/api/auth/workos/callback?code=opaque-code&state=${encodeURIComponent(state)}`,
      {
        redirect: "manual",
        headers: { cookie: `${WORKOS_AUTH_BINDING_COOKIE_NAME}=${binding}` },
      }
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/claims");
    expect(callback.headers.get("set-cookie")).toContain(
      `${COOKIE_NAME}=kinga-local-session`
    );
    expect(callback.headers.get("set-cookie")).not.toContain("opaque-code");
    expect(currentProvider.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "opaque-code",
        codeVerifier: expect.any(String),
      })
    );
    expect(linkIdentity).toHaveBeenCalledTimes(1);
    expect(issueSession).toHaveBeenCalledWith({
      openId: "route-owner-open-id",
      name: "Route Owner",
    });

    const replay = await fetch(
      `${baseUrl}/api/auth/workos/callback?code=opaque-code&state=${encodeURIComponent(state)}`,
      {
        redirect: "manual",
        headers: { cookie: `${WORKOS_AUTH_BINDING_COOKIE_NAME}=${binding}` },
      }
    );
    expect(replay.status).toBe(302);
    expect(replay.headers.get("location")).toBe("/");
    expect(issueSession).toHaveBeenCalledTimes(1);
  });

  it("rejects tampering, duplicates, provider errors, and missing binding before code exchange", async () => {
    const { app, currentProvider, issueSession } = createRouteApp();
    const baseUrl = await startServer(app);
    const { state, binding } = await beginTransaction(baseUrl);

    const attempts = [
      `${baseUrl}/api/auth/workos/callback?code=one&code=two&state=${encodeURIComponent(state)}`,
      `${baseUrl}/api/auth/workos/callback?state=${encodeURIComponent(state)}&error=access_denied`,
      `${baseUrl}/api/auth/workos/callback?code=opaque-code&state=${encodeURIComponent(state)}`,
    ];

    for (const url of attempts) {
      const response = await fetch(url, {
        redirect: "manual",
        headers:
          url.includes("opaque-code") &&
          !url.endsWith(encodeURIComponent(state))
            ? { cookie: `${WORKOS_AUTH_BINDING_COOKIE_NAME}=${binding}` }
            : undefined,
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
      expect(response.headers.get("location")).not.toContain("code");
    }

    expect(currentProvider.exchangeCode).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it("clears the binding and deletes the new transaction when authorization URL construction fails", async () => {
    const failingProvider = provider();
    failingProvider.getAuthorizationUrl.mockRejectedValueOnce(
      new Error("provider failure")
    );
    const store = new AtomicRouteStore();
    const { app } = createRouteApp({ provider: failingProvider, store });
    const baseUrl = await startServer(app);

    const response = await fetch(`${baseUrl}/api/auth/workos/start`, {
      redirect: "manual",
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toContain(
      `${WORKOS_AUTH_BINDING_COOKIE_NAME}=`
    );
    expect(store.records.size).toBe(0);
  });

  it("does not exchange a code when a durable record has a mismatched callback URI", async () => {
    const currentProvider = provider();
    const { app, issueSession } = createRouteApp({
      provider: currentProvider,
      store: new RedirectMismatchStore(),
    });
    const baseUrl = await startServer(app);
    const { state, binding } = await beginTransaction(baseUrl);

    const response = await fetch(
      `${baseUrl}/api/auth/workos/callback?code=opaque-code&state=${encodeURIComponent(state)}`,
      {
        redirect: "manual",
        headers: { cookie: `${WORKOS_AUTH_BINDING_COOKIE_NAME}=${binding}` },
      }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(currentProvider.exchangeCode).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it.each([
    ["provider exchange failure", "exchange"],
    ["local admission denial", "link-denied"],
    ["local persistence unavailability", "link-unavailable"],
    ["KINGA session issuance failure", "session"],
  ])(
    "returns the same generic terminal response after %s",
    async (_label, failure) => {
      const currentProvider = provider();
      const issueSession = vi.fn(async () => "kinga-local-session");
      let linkIdentity: Parameters<
        typeof createWorkOSHumanAuthRouter
      >[0]["linkIdentity"];

      if (failure === "exchange") {
        currentProvider.exchangeCode.mockRejectedValueOnce(
          new Error("provider code failure")
        );
      }
      if (failure === "link-denied") {
        linkIdentity = async () => {
          throw new WorkOSLocalLinkError("WORKOS_LINK_DENIED");
        };
      }
      if (failure === "link-unavailable") {
        linkIdentity = async () => {
          throw new WorkOSLocalLinkError("WORKOS_LINK_UNAVAILABLE");
        };
      }
      if (failure === "session") {
        issueSession.mockRejectedValueOnce(
          new Error("session signer unavailable")
        );
      }

      const { app } = createRouteApp({
        provider: currentProvider,
        linkIdentity,
        issueSession,
      });
      const baseUrl = await startServer(app);
      const { state, binding } = await beginTransaction(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/auth/workos/callback?code=opaque-code&state=${encodeURIComponent(state)}`,
        {
          redirect: "manual",
          headers: { cookie: `${WORKOS_AUTH_BINDING_COOKIE_NAME}=${binding}` },
        }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("set-cookie")).toContain(
        `${WORKOS_AUTH_BINDING_COOKIE_NAME}=`
      );
      expect(response.headers.get("set-cookie")).not.toContain(
        `${COOKIE_NAME}=`
      );
      expect(response.headers.get("location")).not.toContain("opaque-code");
    }
  );
});
