import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createAuditEntry: vi.fn(),
  createLocalSessionToken: vi.fn(),
}));

vi.mock("./sdk", () => ({
  sdk: {
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getUserInfo: mocks.getUserInfo,
  },
}));

vi.mock("../db", () => ({
  upsertUser: mocks.upsertUser,
  getUserByOpenId: mocks.getUserByOpenId,
  createAuditEntry: mocks.createAuditEntry,
}));

vi.mock("./kinga-session", () => ({
  createLocalSessionToken: mocks.createLocalSessionToken,
}));

import { ONE_YEAR_MS } from "@shared/const";
import { registerOAuthRoutes } from "./oauth";

const servers: Server[] = [];

async function startServer(app: express.Express): Promise<string> {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address");
  }
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

describe("Manus OAuth callback local session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForToken.mockResolvedValue({
      accessToken: "access-token",
    });
    mocks.getUserInfo.mockResolvedValue({
      openId: "oauth-local-session-user",
      name: "OAuth Local Session User",
      email: "oauth-local-session-user@test.local",
      loginMethod: "email",
      platform: "email",
    });
    mocks.upsertUser.mockResolvedValue(undefined);
    mocks.getUserByOpenId.mockResolvedValue({
      id: 9,
      role: "user",
      insurerRole: null,
      tenantId: "tenant-oauth",
    });
    mocks.createAuditEntry.mockResolvedValue(undefined);
    mocks.createLocalSessionToken.mockResolvedValue("local-session-token");
  });

  it("preserves provider exchange and local upsert while issuing only through the local session module", async () => {
    const app = express();
    registerOAuthRoutes(app);
    const baseUrl = await startServer(app);
    const state = Buffer.from(
      JSON.stringify({
        redirectUri: `${baseUrl}/api/oauth/callback`,
        returnPath: "/claims",
      })
    ).toString("base64");

    const response = await fetch(
      `${baseUrl}/api/oauth/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
      { redirect: "manual" }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/claims");
    expect(response.headers.get("set-cookie")).toContain(
      "app_session_id=local-session-token"
    );
    expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith(
      "oauth-code",
      state
    );
    expect(mocks.getUserInfo).toHaveBeenCalledWith("access-token");
    expect(mocks.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ openId: "oauth-local-session-user" })
    );
    expect(mocks.createLocalSessionToken).toHaveBeenCalledWith(
      "oauth-local-session-user",
      {
        name: "OAuth Local Session User",
        expiresInMs: ONE_YEAR_MS,
      }
    );
  });
});
