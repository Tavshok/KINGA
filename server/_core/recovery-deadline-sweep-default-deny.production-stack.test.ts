import type { Server } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";

const servers: Server[] = [];

async function start(server: Server): Promise<string> {
  return await new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Composed test server did not expose a TCP address");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) =>
          server.close(error => (error ? reject(error) : resolve()))
        )
    )
  );
});

describe("REC-SEC-02A composed recovery sweep default denial", () => {
  it("preempts body parsing and returns the same generic denial in normal mode", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "false");
    vi.resetModules();

    const { createApplication } = await import("./index");
    const { server } = await createApplication({ includeFrontend: false });
    const baseUrl = await start(server);

    const requests: Array<{ label: string; path?: string; init?: RequestInit }> = [
      { label: "anonymous" },
      {
        label: "human session",
        init: { headers: { cookie: "app_session_id=active-human-session" } },
      },
      {
        label: "cron-looking session",
        init: { headers: { cookie: "app_session_id=cron-looking-cookie" } },
      },
      {
        label: "scheduler-looking task header",
        init: { headers: { "x-manus-task-uid": "known-looking-task" } },
      },
      {
        label: "bearer credential",
        init: { headers: { authorization: "Bearer opaque-value" } },
      },
      {
        label: "trailing slash",
        path: "/api/scheduled/recovery-deadline-sweep/",
      },
      {
        label: "malformed JSON",
        init: {
          headers: { "content-type": "application/json" },
          body: "{malformed-json",
        },
      },
      {
        label: "oversized JSON",
        init: {
          headers: { "content-type": "application/json" },
          body: `{"payload":"${"x".repeat(1_100_000)}"}`,
        },
      },
    ];

    for (const request of requests) {
      const response = await fetch(
        `${baseUrl}${request.path ?? "/api/scheduled/recovery-deadline-sweep"}`,
        { method: "POST", ...request.init }
      );
      expect(response.status, request.label).toBe(404);
      await expect(response.json(), request.label).resolves.toEqual({ error: "Not found" });
    }
  });

  it("leaves the existing maintenance gate as the explicit global preemption", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "true");
    vi.resetModules();

    const { createApplication } = await import("./index");
    const { server } = await createApplication({ includeFrontend: false });
    const baseUrl = await start(server);
    const response = await fetch(`${baseUrl}/api/scheduled/recovery-deadline-sweep`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{malformed-json",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "MAINTENANCE_IN_PROGRESS",
    });
  });
});
