import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import type { Server } from "node:http";
import { promisify } from "node:util";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ServiceCredentialRecord,
  ServiceCredentialStore,
} from "./service-credential-store";
import { createServicePrincipalRouteBoundary } from "./service-principal-route";
import { SCRYPT_V1_PARAMETERS } from "./service-principal";

const scrypt = promisify(nodeScrypt);
const servers: Server[] = [];
const secret = randomBytes(32).toString("base64url");
const credentialId = "RouteBoundary0001";
const bearer = `kng_st_ci-test_${credentialId}_${secret}`;

async function record(): Promise<ServiceCredentialRecord> {
  const salt = randomBytes(16);
  const digest = (await scrypt(
    secret,
    salt,
    32,
    SCRYPT_V1_PARAMETERS
  )) as Buffer;
  return {
    credentialId,
    safePrefix: `kng_st_ci-test_${credentialId}`,
    environment: "ci-test",
    principalName: "ci-route-boundary",
    capability: "scheduled:intake-escalation:run",
    verifierAlgorithm: "scrypt-v1",
    saltBase64: salt.toString("base64url"),
    verifierBase64: digest.toString("base64url"),
    lifecycleState: "active",
    notBefore: "2026-09-20T09:00:00.000Z",
    expiresAt: "2026-09-20T11:00:00.000Z",
    revokedAt: null,
  };
}

async function startBoundary(
  options: {
    store?: ServiceCredentialStore;
    timeoutMs?: number;
  } = {}
) {
  const stored = await record();
  const handler = vi.fn((_request, response) => response.status(204).end());
  const boundary = createServicePrincipalRouteBoundary(
    {
      expectedEnvironment: "ci-test",
      requiredCapability: "scheduled:intake-escalation:run",
      store: options.store ?? { findByCredentialId: async () => stored },
      now: () => new Date("2026-09-20T10:00:00.000Z"),
      timeoutMs: options.timeoutMs,
    },
    handler
  );
  const app = express();
  app.post("/candidate", boundary);
  app.use(express.json());
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No route test port");
  return { url: `http://127.0.0.1:${address.port}/candidate`, handler };
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

describe("unmounted G1 pre-body service route boundary", () => {
  it("accepts a header-only empty request before body parsing", async () => {
    const { url, handler } = await startBoundary();
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-length": "0" },
    });
    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].body).toBeUndefined();
  });

  it.each([
    ["cookie", { cookie: "app_session_id=human" }, undefined],
    ["query", {}, "?bearer=hidden"],
    ["body", { "content-type": "application/json" }, undefined],
    ["cron", { "x-manus-task-uid": "cron-looking" }, undefined],
    ["WorkOS", { "x-workos-user-id": "human-looking" }, undefined],
  ])(
    "generically denies %s signals before business work",
    async (_label, headers, suffix) => {
      const { url, handler } = await startBoundary();
      const response = await fetch(`${url}${suffix ?? ""}`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, ...headers },
        body: _label === "body" ? "{}" : undefined,
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it("is only a factory and is not mounted by the application source", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("./index.ts", import.meta.url), "utf8")
    );
    expect(source).not.toContain("createServicePrincipalRouteBoundary");
    expect(source).not.toContain("/api/service/scheduled/");
  });

  it("returns generic 503 when credential storage rejects", async () => {
    const { url, handler } = await startBoundary({
      store: {
        findByCredentialId: async () => {
          throw new Error("database outage: do not disclose details");
        },
      },
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-length": "0" },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unavailable" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("times out authentication before business work without leaking details", async () => {
    const { url, handler } = await startBoundary({
      timeoutMs: 20,
      store: { findByCredentialId: async () => new Promise(() => undefined) },
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-length": "0" },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unavailable" });
    expect(handler).not.toHaveBeenCalled();
  });
});
