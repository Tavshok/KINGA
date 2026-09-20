import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const servers: Server[] = [];

async function start(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error(
      "WorkOS registration test server did not expose a TCP address"
    );
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.unstubAllEnvs();
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

describe("WorkOS human-auth route registration", () => {
  it("is absent by default even when WorkOS variables are incomplete", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "false");
    vi.stubEnv("WORKOS_HUMAN_AUTH_ENABLED", "false");
    vi.stubEnv("WORKOS_API_KEY", "");
    vi.stubEnv("WORKOS_CLIENT_ID", "");
    vi.stubEnv("WORKOS_REDIRECT_URI", "");
    vi.resetModules();

    const { createApplication } = await import("./index");
    const { server } = await createApplication({ includeFrontend: false });
    const baseUrl = await start(server);

    await expect(
      fetch(`${baseUrl}/api/auth/workos/start`, { redirect: "manual" })
    ).resolves.toMatchObject({ status: 404 });
  });

  it("fails startup rather than mounting an enabled route with incomplete provider configuration", async () => {
    vi.stubEnv("KINGA_MAINTENANCE_MODE", "false");
    vi.stubEnv("WORKOS_HUMAN_AUTH_ENABLED", "true");
    vi.stubEnv("WORKOS_API_KEY", "");
    vi.stubEnv("WORKOS_CLIENT_ID", "");
    vi.stubEnv("WORKOS_REDIRECT_URI", "");
    vi.resetModules();

    const { createApplication } = await import("./index");
    await expect(
      createApplication({ includeFrontend: false })
    ).rejects.toMatchObject({
      code: "WORKOS_NOT_CONFIGURED",
    });
  });
});
