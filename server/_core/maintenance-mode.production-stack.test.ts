import type { Server } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";

const servers: Server[] = [];

async function start(server: Server): Promise<string> {
  return await new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error(
          "Production-composed test server did not expose a TCP address"
        );
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
        new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("maintenance mode production route composition", () => {
  it("returns 503 before every actual protected route class is reached", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "true");
    vi.resetModules();

    const { createApplication } = await import("./index");
    const { server } = await createApplication({ includeFrontend: false });
    const baseUrl = await start(server);

    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);

    const protectedRequests: Array<{ path: string; init?: RequestInit }> = [
      { path: "/readyz" },
      { path: "/api/oauth/callback?code=unreachable" },
      {
        path: "/api/whatsapp/webhook",
        init: {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "Body=unreachable&From=whatsapp%3A%2B263000000000",
        },
      },
      {
        path: "/api/upload",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{malformed-json",
        },
      },
      {
        path: "/api/trpc/documentIngestion.uploadDocuments",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{malformed-json",
        },
      },
      {
        path: "/api/trpc/auth.me?batch=1&input=%7B%7D",
      },
      { path: "/api/scheduled/keepwarm", init: { method: "POST" } },
      { path: "/api/scheduled/intake-escalation", init: { method: "POST" } },
      { path: "/api/scheduled/stuck-recovery", init: { method: "POST" } },
    ];

    for (const request of protectedRequests) {
      const response = await fetch(`${baseUrl}${request.path}`, request.init);
      expect(response.status, request.path).toBe(503);
      await expect(response.json(), request.path).resolves.toMatchObject({
        error: "MAINTENANCE_IN_PROGRESS",
      });
    }
  });
});
