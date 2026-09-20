import type { Server } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getDb: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("./sdk", () => ({
  sdk: {
    authenticateRequest: mocks.authenticateRequest,
  },
}));

vi.mock("../db", async importOriginal => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: mocks.getDb,
}));

vi.mock("./notification", async importOriginal => ({
  ...(await importOriginal<typeof import("./notification")>()),
  notifyOwner: mocks.notifyOwner,
}));

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
  vi.clearAllMocks();
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

describe("scheduled routes production composition", () => {
  it("leaves the retired recovery sweep as ordinary Express 404 fall-through", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "false");
    vi.resetModules();

    const { createApplication } = await import("./index");
    const { server } = await createApplication({ includeFrontend: false });
    const baseUrl = await start(server);
    vi.clearAllMocks();
    const requests: Array<{ label: string; path?: string; init: RequestInit }> =
      [
        {
          label: "ordinary JSON",
          init: {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: "app_session_id=unused-human-session",
              authorization: "Bearer unused-value",
            },
            body: JSON.stringify({ run: true }),
          },
        },
        {
          label: "trailing slash",
          path: "/api/scheduled/recovery-deadline-sweep/",
          init: {
            method: "POST",
          },
        },
      ];

    for (const request of requests) {
      const response = await fetch(
        `${baseUrl}${request.path ?? "/api/scheduled/recovery-deadline-sweep"}`,
        request.init
      );

      expect(response.status, request.label).toBe(404);
      expect(await response.text(), request.label).toMatch(/^<!DOCTYPE html>/);
    }

    expect(mocks.authenticateRequest).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });

  it("preserves standard JSON parser validation for retained scheduled endpoints", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "false");
    vi.resetModules();

    const { createApplication } = await import("./index");
    const { server } = await createApplication({ includeFrontend: false });
    const baseUrl = await start(server);
    vi.clearAllMocks();

    const malformed = await fetch(`${baseUrl}/api/scheduled/keepwarm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{malformed-json",
    });
    expect(malformed.status).toBe(400);

    const oversized = await fetch(`${baseUrl}/api/scheduled/keepwarm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"payload":"${"x".repeat(1_100_000)}"}`,
    });
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({
      error: "PAYLOAD_TOO_LARGE",
    });

    expect(mocks.authenticateRequest).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });

  it("retains harmless behavior for keepwarm and denial for protected scheduled writers", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "false");
    mocks.authenticateRequest.mockRejectedValue(
      new Error("invalid test session")
    );
    vi.resetModules();

    const { createApplication } = await import("./index");
    const { server } = await createApplication({ includeFrontend: false });
    const baseUrl = await start(server);
    vi.clearAllMocks();

    const keepwarm = await fetch(`${baseUrl}/api/scheduled/keepwarm`, {
      method: "POST",
    });
    expect(keepwarm.status).toBe(200);
    await expect(keepwarm.json()).resolves.toMatchObject({ ok: true });

    for (const path of [
      "/api/scheduled/intake-escalation",
      "/api/scheduled/stuck-recovery",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method: "POST" });
      expect(response.status, path).toBe(401);
      await expect(response.json(), path).resolves.toEqual({
        error: "Unauthorized — valid session cookie required",
      });
    }

    expect(mocks.authenticateRequest).toHaveBeenCalledTimes(2);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });
});
