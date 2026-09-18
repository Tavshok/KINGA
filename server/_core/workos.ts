import { WorkOS } from "@workos-inc/node";

/**
 * Server-only configuration for the WorkOS AuthKit adapter. Values are read
 * only when a caller explicitly constructs this adapter; no route or startup
 * code constructs it in Package B.
 */
export type WorkOSProviderConfig = {
  apiKey: string;
  clientId: string;
  redirectUri: string;
};

/**
 * Reads the optional server-only WorkOS variables only when a future,
 * separately authorized package explicitly asks to construct the adapter.
 * Package B itself has no caller and never invokes this helper at startup.
 */
export function getWorkOSProviderConfig(
  environment: NodeJS.ProcessEnv = process.env
): WorkOSProviderConfig {
  return {
    apiKey: environment.WORKOS_API_KEY ?? "",
    clientId: environment.WORKOS_CLIENT_ID ?? "",
    redirectUri: environment.WORKOS_REDIRECT_URI ?? "",
  };
}

/**
 * Production callers must not opt in to an insecure callback merely by
 * supplying a redirect string. This option is for explicit local tests only.
 */
export type WorkOSProviderFactoryOptions = {
  allowInsecureLocalhostRedirect?: boolean;
};

/** Opaque Package C input used to build an AuthKit authorization URL. */
export type WorkOSAuthorizationRequest = {
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

/** Opaque Package C input used to exchange a returned authorization code. */
export type WorkOSCodeExchangeRequest = {
  code: string;
  codeVerifier: string;
};

/**
 * The deliberately small provider response consumed by the later guarded
 * linking package. Provider tokens and session material never leave this
 * adapter.
 */
export type WorkOSAuthenticatedIdentity = {
  workosUserId: string;
  email: string;
  emailVerified: boolean;
  organizationId: string | null;
};

/** Future packages use this interface rather than WorkOS SDK concrete types. */
export interface WorkOSAuthProvider {
  getAuthorizationUrl(input: WorkOSAuthorizationRequest): Promise<string>;
  exchangeCode(
    input: WorkOSCodeExchangeRequest
  ): Promise<WorkOSAuthenticatedIdentity>;
}

type WorkOSAuthKitClient = {
  getAuthorizationUrl(input: {
    provider: "authkit";
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
  }): string;
  authenticateWithCode(input: {
    code: string;
    codeVerifier: string;
    clientId: string;
  }): Promise<{
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
    };
    organizationId?: string;
  }>;
};

export type WorkOSProviderErrorCode =
  | "WORKOS_NOT_CONFIGURED"
  | "WORKOS_INVALID_CONFIGURATION"
  | "WORKOS_INVALID_REQUEST"
  | "WORKOS_PROVIDER_REQUEST_FAILED"
  | "WORKOS_INVALID_RESPONSE";

/** A safe error surface that never includes secret, code, verifier, or token values. */
export class WorkOSProviderError extends Error {
  constructor(
    readonly code: WorkOSProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WorkOSProviderError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function throwNotConfigured(): never {
  throw new WorkOSProviderError(
    "WORKOS_NOT_CONFIGURED",
    "WorkOS provider configuration is incomplete."
  );
}

function validateRedirectUri(
  value: unknown,
  allowInsecureLocalhostRedirect = false
): string {
  if (!isNonEmptyString(value)) {
    throw new WorkOSProviderError(
      "WORKOS_INVALID_CONFIGURATION",
      "WorkOS redirect URI must be an absolute URL."
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new WorkOSProviderError(
      "WORKOS_INVALID_CONFIGURATION",
      "WorkOS redirect URI must be an absolute URL."
    );
  }

  const localHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  const allowedScheme =
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" &&
      localHost &&
      allowInsecureLocalhostRedirect);

  if (
    !allowedScheme ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new WorkOSProviderError(
      "WORKOS_INVALID_CONFIGURATION",
      "WorkOS redirect URI must be an exact HTTPS callback URL, or an HTTP localhost callback in local development."
    );
  }

  return parsed.toString();
}

function validateConfig(
  config: WorkOSProviderConfig,
  options: WorkOSProviderFactoryOptions
): Required<WorkOSProviderConfig> {
  if (
    !config ||
    typeof config !== "object" ||
    !isNonEmptyString(config.apiKey) ||
    !isNonEmptyString(config.clientId) ||
    !isNonEmptyString(config.redirectUri)
  ) {
    return throwNotConfigured();
  }

  return {
    apiKey: config.apiKey.trim(),
    clientId: config.clientId.trim(),
    redirectUri: validateRedirectUri(
      config.redirectUri.trim(),
      options.allowInsecureLocalhostRedirect === true
    ),
  };
}

function requireOpaqueValue(value: unknown): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new WorkOSProviderError(
      "WORKOS_INVALID_REQUEST",
      "WorkOS authorization request is incomplete."
    );
  }
}

function requireRequestObject(
  value: unknown
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkOSProviderError(
      "WORKOS_INVALID_REQUEST",
      "WorkOS authorization request is incomplete."
    );
  }
}

function providerFailure(): never {
  throw new WorkOSProviderError(
    "WORKOS_PROVIDER_REQUEST_FAILED",
    "WorkOS authentication request failed."
  );
}

function normalizeIdentity(
  response: Awaited<ReturnType<WorkOSAuthKitClient["authenticateWithCode"]>>
): WorkOSAuthenticatedIdentity {
  if (
    !response ||
    !response.user ||
    !isNonEmptyString(response.user.id) ||
    !isNonEmptyString(response.user.email) ||
    typeof response.user.emailVerified !== "boolean" ||
    (response.organizationId !== undefined &&
      !isNonEmptyString(response.organizationId))
  ) {
    throw new WorkOSProviderError(
      "WORKOS_INVALID_RESPONSE",
      "WorkOS returned an incomplete authentication identity."
    );
  }

  return {
    workosUserId: response.user.id,
    email: response.user.email,
    emailVerified: response.user.emailVerified,
    organizationId: response.organizationId ?? null,
  };
}

function createSdkClient(apiKey: string): WorkOSAuthKitClient {
  return new WorkOS(apiKey).userManagement as WorkOSAuthKitClient;
}

/**
 * Creates an inert server-only WorkOS AuthKit adapter. Package B deliberately
 * has no caller: Package C owns state/CSRF/PKCE verifier storage and Package D
 * owns local identity eligibility, linking, session issuance, and all database
 * access.
 */
export function createWorkOSAuthProvider(
  config: WorkOSProviderConfig,
  clientFactory: (apiKey: string) => WorkOSAuthKitClient = createSdkClient,
  options: WorkOSProviderFactoryOptions = {}
): WorkOSAuthProvider {
  const validatedConfig = validateConfig(config, options);
  const client = clientFactory(validatedConfig.apiKey);

  return {
    async getAuthorizationUrl(
      input: WorkOSAuthorizationRequest
    ): Promise<string> {
      requireRequestObject(input);
      requireOpaqueValue(input.redirectUri);
      requireOpaqueValue(input.state);
      requireOpaqueValue(input.codeChallenge);

      let suppliedRedirectUri: string;
      try {
        suppliedRedirectUri = validateRedirectUri(
          input.redirectUri,
          options.allowInsecureLocalhostRedirect === true
        );
      } catch (error) {
        if (error instanceof WorkOSProviderError) {
          throw new WorkOSProviderError(
            "WORKOS_INVALID_REQUEST",
            "WorkOS authorization request is incomplete."
          );
        }
        throw error;
      }
      if (suppliedRedirectUri !== validatedConfig.redirectUri) {
        throw new WorkOSProviderError(
          "WORKOS_INVALID_REQUEST",
          "WorkOS authorization request redirect URI does not match configured callback URI."
        );
      }

      try {
        const authorizationUrl = client.getAuthorizationUrl({
          provider: "authkit",
          clientId: validatedConfig.clientId,
          redirectUri: validatedConfig.redirectUri,
          state: input.state,
          codeChallenge: input.codeChallenge,
          codeChallengeMethod: "S256",
        });

        if (!isNonEmptyString(authorizationUrl)) {
          throw new Error("empty authorization URL");
        }

        return authorizationUrl;
      } catch (error) {
        if (error instanceof WorkOSProviderError) {
          throw error;
        }
        return providerFailure();
      }
    },

    async exchangeCode(
      input: WorkOSCodeExchangeRequest
    ): Promise<WorkOSAuthenticatedIdentity> {
      requireRequestObject(input);
      requireOpaqueValue(input.code);
      requireOpaqueValue(input.codeVerifier);

      try {
        const response = await client.authenticateWithCode({
          code: input.code,
          codeVerifier: input.codeVerifier,
          clientId: validatedConfig.clientId,
        });
        return normalizeIdentity(response);
      } catch (error) {
        if (error instanceof WorkOSProviderError) {
          throw error;
        }
        return providerFailure();
      }
    },
  };
}
