import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAccountRecoveryUrl,
  getDefaultLoginUrl,
  startDefaultLogin,
} from "../client/src/auth/login-navigation";
import { RETURN_PATH_STORAGE_KEY } from "../client/src/const";

const clientPath = (relativePath: string) =>
  fileURLToPath(new URL(`../client/src/${relativePath}`, import.meta.url));

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const loginSurfaceExpectations = [
  { path: "main.tsx", facade: "startDefaultLogin" },
  { path: "_core/hooks/useAuth.ts", facade: "getDefaultLoginUrl" },
  { path: "components/DashboardLayout.tsx", facade: "startDefaultLogin" },
  { path: "pages/ClientPortal.tsx", facade: "startDefaultLogin" },
  { path: "pages/ClientProfile.tsx", facade: "startDefaultLogin" },
  { path: "pages/InviteAccept.tsx", facade: "getDefaultLoginUrl" },
  { path: "pages/Login.tsx", facade: "startDefaultLogin" },
  { path: "pages/PortalSelection.tsx", facade: "startDefaultLogin" },
] as const;

describe("provider-neutral client navigation boundary", () => {
  const storage = new MemoryStorage();
  const fakeWindow = {
    location: {
      origin: "https://kinga.test",
      href: "https://kinga.test/",
    },
  };

  beforeEach(() => {
    vi.stubEnv("VITE_APP_ID", "kinga-test-app");
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://oauth.manus.test");
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("localStorage", storage);
    fakeWindow.location.href = "https://kinga.test/";
    storage.removeItem(RETURN_PATH_STORAGE_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("preserves the active Manus sign-in URL and browser-local return path", () => {
    const url = new URL(getDefaultLoginUrl("/client"));

    expect(url.origin).toBe("https://oauth.manus.test");
    expect(url.pathname).toBe("/app-auth");
    expect(url.searchParams.get("appId")).toBe("kinga-test-app");
    expect(url.searchParams.get("redirectUri")).toBe(
      "https://kinga.test/api/oauth/callback"
    );
    expect(url.searchParams.get("state")).toBe(
      btoa("https://kinga.test/api/oauth/callback")
    );
    expect(url.searchParams.get("type")).toBe("signIn");
    expect(storage.getItem(RETURN_PATH_STORAGE_KEY)).toBe("/client");
  });

  it("preserves the existing login-loop exclusions", () => {
    getDefaultLoginUrl("/login");
    expect(storage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();

    getDefaultLoginUrl("/portal-hub");
    expect(storage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it("uses the same active provider URL for navigation", () => {
    startDefaultLogin("/my-profile");

    expect(fakeWindow.location.href).toBe(getDefaultLoginUrl("/my-profile"));
    expect(storage.getItem(RETURN_PATH_STORAGE_KEY)).toBe("/my-profile");
  });

  it("preserves account recovery without a state or return-path side effect", () => {
    const url = new URL(getAccountRecoveryUrl());

    expect(url.origin).toBe("https://oauth.manus.test");
    expect(url.pathname).toBe("/app-auth");
    expect(url.searchParams.get("appId")).toBe("kinga-test-app");
    expect(url.searchParams.get("redirectUri")).toBe(
      "https://kinga.test/api/oauth/callback"
    );
    expect(url.searchParams.get("type")).toBe("forgotPassword");
    expect(url.searchParams.has("state")).toBe(false);
    expect(storage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it("routes all documented client integration locations through the facade", () => {
    for (const { path, facade } of loginSurfaceExpectations) {
      const source = readFileSync(clientPath(path), "utf8");
      expect(source).toContain(facade);
      expect(source).not.toContain("getLoginUrl(");
      expect(source).not.toContain("VITE_OAUTH_PORTAL_URL");
    }

    const loginSource = readFileSync(clientPath("pages/Login.tsx"), "utf8");
    expect(loginSource).toContain("getAccountRecoveryUrl");
    expect(loginSource).not.toContain("forgotPassword");
  });

  it("keeps WorkOS absent from the client navigation facade", () => {
    const source = readFileSync(clientPath("auth/login-navigation.ts"), "utf8");

    expect(source).not.toMatch(/from\s+["'][^"']*workos[^"']*["']/iu);
    expect(source).not.toContain("/api/auth/workos/start");
  });
});
