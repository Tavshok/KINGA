import { describe, expect, it, vi } from "vitest";
import {
  createWorkOSAuthProvider,
  getWorkOSProviderConfig,
  WorkOSProviderError,
  type WorkOSProviderConfig,
} from "./workos";

const validConfig: WorkOSProviderConfig = {
  apiKey: "sk_test_provider_secret",
  clientId: "client_test_123",
  redirectUri: "https://app.example.test/api/oauth/workos/callback",
};

type FakeClient = {
  getAuthorizationUrl: ReturnType<typeof vi.fn>;
  authenticateWithCode: ReturnType<typeof vi.fn>;
};

function createFakeClient(): FakeClient {
  return {
    getAuthorizationUrl: vi.fn(
      () => "https://authkit.workos.com/authorize?state=opaque-state"
    ),
    authenticateWithCode: vi.fn(async () => ({
      user: {
        id: "user_01HWORKOS",
        email: "owner@example.test",
        emailVerified: true,
      },
      organizationId: "org_01HWORKOS",
      accessToken: "provider-access-token-not-returned",
      refreshToken: "provider-refresh-token-not-returned",
    })),
  };
}

function createProvider(
  config: WorkOSProviderConfig = validConfig,
  client = createFakeClient()
) {
  const factory = vi.fn(() => client);
  const provider = createWorkOSAuthProvider(config, factory);
  return { provider, client, factory };
}

function expectProviderError(
  action: () => unknown,
  code: WorkOSProviderError["code"]
) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(WorkOSProviderError);
  expect(caught).toMatchObject({ code });
}

describe("WorkOS AuthKit provider adapter", () => {
  it("reads optional WorkOS configuration only from an explicit injected environment", () => {
    expect(
      getWorkOSProviderConfig({
        WORKOS_API_KEY: "sk_test_provider_secret",
        WORKOS_CLIENT_ID: "client_test_123",
        WORKOS_REDIRECT_URI: validConfig.redirectUri,
      })
    ).toEqual(validConfig);
  });

  it("fails closed before SDK construction when configuration is absent", () => {
    const factory = vi.fn();

    expectProviderError(
      () => createWorkOSAuthProvider({ ...validConfig, apiKey: "" }, factory),
      "WORKOS_NOT_CONFIGURED"
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    "not a URL",
    "http://app.example.test/api/oauth/workos/callback",
    "https://user:password@app.example.test/api/oauth/workos/callback",
    "https://app.example.test/api/oauth/workos/callback?unexpected=value",
    "https://app.example.test/api/oauth/workos/callback#fragment",
  ])("rejects an unsafe configured redirect URI: %s", redirectUri => {
    expectProviderError(
      () => createWorkOSAuthProvider({ ...validConfig, redirectUri }),
      "WORKOS_INVALID_CONFIGURATION"
    );
  });

  it("rejects an HTTP localhost callback unless an explicit local-only option is supplied", () => {
    const localConfig = {
      ...validConfig,
      redirectUri: "http://localhost:3000/api/oauth/workos/callback",
    };

    expectProviderError(
      () => createWorkOSAuthProvider(localConfig),
      "WORKOS_INVALID_CONFIGURATION"
    );
    expect(() =>
      createWorkOSAuthProvider(localConfig, undefined, {
        allowInsecureLocalhostRedirect: true,
      })
    ).not.toThrow();
  });

  it("accepts HTTPS loopback callbacks without requiring an insecure local option", () => {
    expect(() =>
      createWorkOSAuthProvider({
        ...validConfig,
        redirectUri: "https://localhost:3000/api/oauth/workos/callback",
      })
    ).not.toThrow();
  });

  it("builds an AuthKit URL with exact configured callback, state, and S256 challenge", async () => {
    const { provider, client } = createProvider();

    await expect(
      provider.getAuthorizationUrl({
        redirectUri: validConfig.redirectUri,
        state: "package-c-state",
        codeChallenge: "package-c-pkce-challenge",
      })
    ).resolves.toBe("https://authkit.workos.com/authorize?state=opaque-state");

    expect(client.getAuthorizationUrl).toHaveBeenCalledWith({
      provider: "authkit",
      clientId: validConfig.clientId,
      redirectUri: validConfig.redirectUri,
      state: "package-c-state",
      codeChallenge: "package-c-pkce-challenge",
      codeChallengeMethod: "S256",
    });
  });

  it("rejects a supplied callback URL that differs from the configured exact URL", async () => {
    const { provider, client } = createProvider();

    await expect(
      provider.getAuthorizationUrl({
        redirectUri: "https://attacker.example.test/api/oauth/workos/callback",
        state: "package-c-state",
        codeChallenge: "package-c-pkce-challenge",
      })
    ).rejects.toMatchObject({ code: "WORKOS_INVALID_REQUEST" });
    expect(client.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it.each([
    null,
    42,
    "unexpected-string",
    [],
    {},
    { state: "opaque-state", codeChallenge: "challenge" },
    { redirectUri: 42, state: "opaque-state", codeChallenge: "challenge" },
    {
      redirectUri: validConfig.redirectUri,
      state: [],
      codeChallenge: "challenge",
    },
    {
      redirectUri: validConfig.redirectUri,
      state: "opaque-state",
      codeChallenge: {},
    },
  ])(
    "fails closed on malformed authorization input without calling WorkOS: %p",
    async input => {
      const { provider, client } = createProvider();

      await expect(
        provider.getAuthorizationUrl(input as never)
      ).rejects.toMatchObject({
        code: "WORKOS_INVALID_REQUEST",
      });
      expect(client.getAuthorizationUrl).not.toHaveBeenCalled();
    }
  );

  it("exchanges an opaque code and returns only the identity fields needed by a later package", async () => {
    const { provider, client } = createProvider();

    await expect(
      provider.exchangeCode({
        code: "opaque-authorization-code",
        codeVerifier: "opaque-pkce-verifier",
      })
    ).resolves.toEqual({
      workosUserId: "user_01HWORKOS",
      email: "owner@example.test",
      emailVerified: true,
      organizationId: "org_01HWORKOS",
    });

    expect(client.authenticateWithCode).toHaveBeenCalledWith({
      code: "opaque-authorization-code",
      codeVerifier: "opaque-pkce-verifier",
      clientId: validConfig.clientId,
    });
  });

  it("rejects incomplete provider identities rather than returning a partial link candidate", async () => {
    const client = createFakeClient();
    client.authenticateWithCode.mockResolvedValueOnce({
      user: {
        id: "",
        email: "owner@example.test",
        emailVerified: true,
      },
    });
    const { provider } = createProvider(validConfig, client);

    await expect(
      provider.exchangeCode({
        code: "opaque-code",
        codeVerifier: "opaque-verifier",
      })
    ).rejects.toMatchObject({ code: "WORKOS_INVALID_RESPONSE" });
  });

  it.each([
    null,
    42,
    "unexpected-string",
    [],
    {},
    { code: "opaque-code" },
    { code: null, codeVerifier: "opaque-verifier" },
    { code: "opaque-code", codeVerifier: {} },
  ])(
    "fails closed on malformed code exchange input without calling WorkOS: %p",
    async input => {
      const { provider, client } = createProvider();

      await expect(provider.exchangeCode(input as never)).rejects.toMatchObject(
        {
          code: "WORKOS_INVALID_REQUEST",
        }
      );
      expect(client.authenticateWithCode).not.toHaveBeenCalled();
    }
  );

  it("redacts provider exceptions without exposing provider secrets, code, or verifier values", async () => {
    const client = createFakeClient();
    client.authenticateWithCode.mockRejectedValueOnce(
      new Error(
        "sk_test_provider_secret opaque-authorization-code opaque-pkce-verifier"
      )
    );
    const { provider } = createProvider(validConfig, client);

    let caught: unknown;
    try {
      await provider.exchangeCode({
        code: "opaque-authorization-code",
        codeVerifier: "opaque-pkce-verifier",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkOSProviderError);
    expect(caught).toMatchObject({ code: "WORKOS_PROVIDER_REQUEST_FAILED" });
    expect(String(caught)).not.toContain("sk_test_provider_secret");
    expect(String(caught)).not.toContain("opaque-authorization-code");
    expect(String(caught)).not.toContain("opaque-pkce-verifier");
  });
});
