import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { registerRuntimeProbes } from "./runtime-probes";
import type { RuntimeReadiness } from "./runtime-readiness";

const ready: RuntimeReadiness = {
  status: "ready",
  runtimeMode: "external",
  releaseVersion: "probe-test",
  verificationScope: "configuration-only",
  requiredConfiguration: ["DATABASE_URL"],
  missingConfiguration: [],
  invalidConfiguration: [],
  configurationReady: true,
};

describe("KINGA deployment probes", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
  });

  async function request(path: string, readiness: RuntimeReadiness) {
    const app = express();
    registerRuntimeProbes(app, () => readiness);
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP test server address");
    return fetch(`http://127.0.0.1:${address.port}${path}`);
  }

  it("returns a non-sensitive liveness response", async () => {
    const response = await request("/healthz", ready);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "kinga-api",
      releaseVersion: "probe-test",
    });
  });

  it("returns configuration readiness without claiming service or authority health", async () => {
    const response = await request("/readyz", ready);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      verificationScope: "configuration-only",
      configurationReady: true,
    });
  });

  it("returns 503 when a required external declaration is absent", async () => {
    const response = await request("/readyz", {
      ...ready,
      status: "not_ready",
      configurationReady: false,
      missingConfiguration: ["KINGA_IDENTITY_MODE"],
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      missingConfiguration: ["KINGA_IDENTITY_MODE"],
      verificationScope: "configuration-only",
    });
  });
});
