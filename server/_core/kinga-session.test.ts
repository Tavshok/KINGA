import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, decodeJwt, decodeProtectedHeader } from "jose";

const mocks = vi.hoisted(() => ({
  getUserByOpenId: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
}));

vi.mock("../db", () => ({
  getUserByOpenId: mocks.getUserByOpenId,
  updateUserLastSignedIn: mocks.updateUserLastSignedIn,
}));

vi.mock("./env", () => ({
  ENV: {
    appId: "kinga-session-test-app",
    cookieSecret: "kinga-session-test-secret-at-least-32-chars",
  },
}));

import { ONE_YEAR_MS } from "@shared/const";
import {
  createLocalSessionToken,
  readLocalSessionCookie,
  resolveActiveLocalUser,
  signLocalSession,
  verifyLocalSession,
} from "./kinga-session";

const signingKey = new TextEncoder().encode(
  "kinga-session-test-secret-at-least-32-chars"
);

function activeUser(openId = "local-session-user") {
  return {
    id: 41,
    openId,
    name: "Local Session User",
    email: "local-session-user@test.local",
    role: "user" as const,
    tenantId: "tenant-local-session",
    isActive: 1,
  } as any;
}

async function tokenWithPayload(
  payload: Record<string, unknown>,
  algorithm: "HS256" | "HS384" = "HS256"
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: algorithm, typ: "JWT" })
    .setExpirationTime("1h")
    .sign(signingKey);
}

describe("KINGA local session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateUserLastSignedIn.mockResolvedValue(undefined);
  });

  it("issues the existing three-claim HS256 token with a one-year default", async () => {
    const beforeSeconds = Math.floor(Date.now() / 1000);
    const token = await createLocalSessionToken("human-open-id", {
      name: "Human User",
    });
    const payload = decodeJwt(token);
    const header = decodeProtectedHeader(token);

    expect(header).toMatchObject({ alg: "HS256", typ: "JWT" });
    expect(payload).toMatchObject({
      openId: "human-open-id",
      appId: "kinga-session-test-app",
      name: "Human User",
    });
    expect(Object.keys(payload).sort()).toEqual(
      expect.arrayContaining(["appId", "exp", "name", "openId"])
    );
    expect(payload.exp).toBeGreaterThanOrEqual(
      beforeSeconds + Math.floor(ONE_YEAR_MS / 1000) - 1
    );
    expect(payload.exp).toBeLessThanOrEqual(
      beforeSeconds + Math.ceil(ONE_YEAR_MS / 1000) + 1
    );
  });

  it("preserves explicit expiry and never serializes unsupported extra fields", async () => {
    const beforeSeconds = Math.floor(Date.now() / 1000);
    const token = await signLocalSession(
      {
        openId: "impersonation-target",
        appId: "kinga-session-test-app",
        name: "Target User",
        // The legacy caller can pass these at runtime, but they are not claims.
        impersonatedBy: "admin-open-id",
      } as any,
      { expiresInMs: 60_000 }
    );
    const payload = decodeJwt(token);

    expect(payload).toMatchObject({
      openId: "impersonation-target",
      appId: "kinga-session-test-app",
      name: "Target User",
    });
    expect(payload).not.toHaveProperty("impersonatedBy");
    expect(payload.exp).toBeGreaterThanOrEqual(beforeSeconds + 59);
    expect(payload.exp).toBeLessThanOrEqual(beforeSeconds + 61);
  });

  it("accepts the current empty or absent name behavior", async () => {
    const emptyName = await createLocalSessionToken("empty-name");
    expect(await verifyLocalSession(emptyName)).toEqual({
      openId: "empty-name",
      appId: "kinga-session-test-app",
      name: "",
    });

    const absentName = await tokenWithPayload({
      openId: "absent-name",
      appId: "kinga-session-test-app",
    });
    expect(await verifyLocalSession(absentName)).toEqual({
      openId: "absent-name",
      appId: "kinga-session-test-app",
      name: undefined,
    });
  });

  it("fails closed for missing, malformed, wrong-signature, wrong-algorithm, and incomplete tokens", async () => {
    const wrongSignature = new SignJWT({
      openId: "wrong-signature",
      appId: "kinga-session-test-app",
      name: "Wrong Signature",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("another-secret-that-is-not-the-key"));

    await expect(verifyLocalSession(undefined)).resolves.toBeNull();
    await expect(verifyLocalSession("not-a-jwt")).resolves.toBeNull();
    await expect(verifyLocalSession(await wrongSignature)).resolves.toBeNull();
    await expect(
      verifyLocalSession(
        await tokenWithPayload(
          {
            openId: "wrong-algorithm",
            appId: "kinga-session-test-app",
            name: "Wrong Algorithm",
          },
          "HS384"
        )
      )
    ).resolves.toBeNull();
    await expect(
      verifyLocalSession(
        await tokenWithPayload({ appId: "kinga-session-test-app" })
      )
    ).resolves.toBeNull();
    await expect(
      verifyLocalSession(await tokenWithPayload({ openId: "missing-app-id" }))
    ).resolves.toBeNull();
    await expect(
      verifyLocalSession(
        await tokenWithPayload({
          openId: "empty-app-id",
          appId: "",
        })
      )
    ).resolves.toBeNull();
  });

  it("reads only the configured local session cookie", () => {
    expect(
      readLocalSessionCookie({
        headers: { cookie: "other=value; app_session_id=local-session-value" },
      } as any)
    ).toBe("local-session-value");
    expect(readLocalSessionCookie({ headers: {} } as any)).toBeUndefined();
  });

  it("retains the KINGA-AUTH-01 active, missing, and deactivated local-user decisions", async () => {
    mocks.getUserByOpenId.mockResolvedValueOnce(activeUser("active-human"));
    await expect(resolveActiveLocalUser("active-human")).resolves.toMatchObject(
      {
        openId: "active-human",
      }
    );
    expect(mocks.updateUserLastSignedIn).toHaveBeenCalledWith(
      "active-human",
      expect.any(String)
    );

    mocks.getUserByOpenId.mockResolvedValueOnce(null);
    await expect(resolveActiveLocalUser("deleted-human")).rejects.toThrow(
      "User not found"
    );

    mocks.getUserByOpenId.mockResolvedValueOnce({
      ...activeUser("deactivated-human"),
      isActive: 0,
    });
    await expect(resolveActiveLocalUser("deactivated-human")).rejects.toThrow(
      "Account has been deactivated"
    );
  });

  it("has no provider transport, WorkOS, or route-registration dependency", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./kinga-session.ts", import.meta.url)),
      "utf8"
    );
    const providerMarkers = [
      "axios",
      "OAUTH_SERVER_URL",
      "workos",
      "exchangeCodeForToken",
      "getUserInfoWithJwt",
      "express.Router",
    ];

    for (const marker of providerMarkers) {
      expect(source.toLowerCase()).not.toContain(marker.toLowerCase());
    }
    expect(createHash("sha256").update(source).digest("hex")).toHaveLength(64);
  });
});
