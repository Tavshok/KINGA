import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";

import { denyRecoveryDeadlineSweep } from "./recovery-deadline-sweep-default-deny-route";

const servers: Server[] = [];

async function startRoute(): Promise<string> {
  const app = express();
  app.post("/api/scheduled/recovery-deadline-sweep", denyRecoveryDeadlineSweep);
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No route test port");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) =>
          server.close(error => (error ? reject(error) : resolve()))
        )
    )
  );
});

describe("REC-SEC-02A recovery deadline sweep emergency default deny", () => {
  it.each([
    ["anonymous", {}],
    ["human session", { cookie: "app_session_id=active-human-session" }],
    ["cron-looking session", { cookie: "app_session_id=cron-looking-cookie" }],
    ["scheduler-looking header", { "x-manus-task-uid": "known-looking-task" }],
    ["bearer credential", { authorization: "Bearer any-value" }],
  ])("returns the same generic denial for %s traffic", async (_label, headers) => {
    const baseUrl = await startRoute();
    const response = await fetch(`${baseUrl}/api/scheduled/recovery-deadline-sweep`, {
      method: "POST",
      headers,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("does not expose a success path through a route-equivalent trailing slash", async () => {
    const baseUrl = await startRoute();
    const response = await fetch(`${baseUrl}/api/scheduled/recovery-deadline-sweep/`, {
      method: "POST",
      headers: { cookie: "app_session_id=active-human-session" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});
