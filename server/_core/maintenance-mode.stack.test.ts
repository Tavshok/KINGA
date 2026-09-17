import express from "express";
import type { Server } from "http";
import { afterEach, describe, expect, it } from "vitest";
import { createMaintenanceModeMiddleware } from "./maintenance-mode";
import { registerRuntimeProbes } from "./runtime-probes";

const servers: Server[] = [];

async function start(app: express.Express): Promise<string> {
  return await new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not expose a TCP address");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("maintenance mode Express stack", () => {
  it("exposes only healthz and reaches no parser or business route while enabled", async () => {
    const app = express();
    let parserReached = false;
    let handlerReached = false;

    app.use(
      createMaintenanceModeMiddleware(true, () => "2026-09-17T19:30:00.000Z")
    );
    registerRuntimeProbes(app, () => ({
      runtimeMode: "production",
      configurationReady: true,
      releaseVersion: "test",
      issues: [],
    }));
    app.use((_req, _res, next) => {
      parserReached = true;
      next();
    });
    app.post("/api/upload", (_req, res) => {
      handlerReached = true;
      res.status(201).json({ unexpected: true });
    });

    const baseUrl = await start(app);
    const healthResponse = await fetch(`${baseUrl}/healthz`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toMatchObject({
      status: "ok",
      service: "kinga-api",
    });

    const readinessResponse = await fetch(`${baseUrl}/readyz`);
    expect(readinessResponse.status).toBe(503);
    expect(await readinessResponse.json()).toMatchObject({
      error: "MAINTENANCE_IN_PROGRESS",
    });

    const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ large: "payload" }),
    });
    expect(uploadResponse.status).toBe(503);
    expect(await uploadResponse.json()).toMatchObject({
      error: "MAINTENANCE_IN_PROGRESS",
    });
    expect(parserReached).toBe(false);
    expect(handlerReached).toBe(false);
  });

  it("retains ordinary routing when the maintenance switch is disabled", async () => {
    const app = express();
    let parserReached = false;
    let handlerReached = false;

    app.use(createMaintenanceModeMiddleware(false));
    registerRuntimeProbes(app, () => ({
      runtimeMode: "production",
      configurationReady: true,
      releaseVersion: "test",
      issues: [],
    }));
    app.use((_req, _res, next) => {
      parserReached = true;
      next();
    });
    app.post("/api/upload", (_req, res) => {
      handlerReached = true;
      res.status(201).json({ ok: true });
    });

    const baseUrl = await start(app);
    const response = await fetch(`${baseUrl}/api/upload`, { method: "POST" });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(parserReached).toBe(true);
    expect(handlerReached).toBe(true);
  });
});
