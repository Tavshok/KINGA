import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

import { createRecoveryDeadlineSweepHandler } from "./recovery-deadline-sweep-route";

const servers: Server[] = [];

async function startRoute(
  dependencies: Parameters<typeof createRecoveryDeadlineSweepHandler>[0]
) {
  const app = express();
  app.post(
    "/api/scheduled/recovery-deadline-sweep",
    createRecoveryDeadlineSweepHandler(dependencies)
  );
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No route test port");
  return `http://127.0.0.1:${address.port}`;
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

describe("REC-SEC-02 recovery deadline sweep HTTP boundary", () => {
  it("passes a human session cookie to the dedicated verifier and never starts global work when denied", async () => {
    const authorize = vi.fn().mockResolvedValue({ authorized: false });
    const runSweep = vi.fn();
    const baseUrl = await startRoute({
      environment: "ci-test",
      authorize,
      runSweep,
    });

    const response = await fetch(
      `${baseUrl}/api/scheduled/recovery-deadline-sweep`,
      {
        method: "POST",
        headers: {
          cookie: "other=value; app_session_id=human-session-value",
          authorization:
            "Bearer kinga-svc:v1:recovery-deadline-sweep:recovery-ci-key-0001:cccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Scheduled sweep unavailable",
    });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        hasHumanSessionCookie: true,
        environment: "ci-test",
      })
    );
    expect(runSweep).not.toHaveBeenCalled();
  });

  it("runs only after dedicated authorization succeeds", async () => {
    const authorize = vi
      .fn()
      .mockResolvedValue({ authorized: true, keyId: "recovery-ci-key-0001" });
    const runSweep = vi.fn().mockResolvedValue(undefined);
    const baseUrl = await startRoute({
      environment: "ci-test",
      authorize,
      runSweep,
    });

    const response = await fetch(
      `${baseUrl}/api/scheduled/recovery-deadline-sweep`,
      {
        method: "POST",
        headers: { authorization: "Bearer opaque" },
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        hasHumanSessionCookie: false,
        environment: "ci-test",
      })
    );
    expect(runSweep).toHaveBeenCalledOnce();
  });

  it("does not treat a scheduler-looking task identifier as authority", async () => {
    const authorize = vi.fn().mockResolvedValue({ authorized: false });
    const runSweep = vi.fn();
    const baseUrl = await startRoute({
      environment: "ci-test",
      authorize,
      runSweep,
    });

    const response = await fetch(
      `${baseUrl}/api/scheduled/recovery-deadline-sweep`,
      {
        method: "POST",
        headers: { "x-manus-task-uid": "known-looking-task-id" },
      }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Scheduled sweep unavailable",
    });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: undefined })
    );
    expect(runSweep).not.toHaveBeenCalled();
  });

  it("returns a generic unavailable result when execution fails", async () => {
    const baseUrl = await startRoute({
      environment: "ci-test",
      authorize: async () => ({
        authorized: true,
        keyId: "recovery-ci-key-0001",
      }),
      runSweep: async () => {
        throw new Error(
          "database and operational detail must not reach caller"
        );
      },
    });

    const response = await fetch(
      `${baseUrl}/api/scheduled/recovery-deadline-sweep`,
      { method: "POST" }
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Scheduled sweep unavailable",
    });
  });
});
