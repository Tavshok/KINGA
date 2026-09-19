import { AXIOS_TIMEOUT_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import type { Request } from "express";
import { ENV } from "./env";
import {
  createLocalSessionToken,
  readLocalSessionCookie,
  resolveActiveLocalUser,
  signLocalSession,
  verifyLocalSession,
  type LocalSessionPayload,
} from "./kinga-session";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
function assertNoDirectOAuthAccessDuringTests(): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    throw new Error(
      "Direct OAuth access is disabled during tests. Mock server/_core/sdk at the test boundary."
    );
  }
}

// ── Heartbeat cron identity support ──────────────────────────────────────────
// These must be declared before SDKServer because authenticateRequest uses them.

const CRON_OPEN_ID_PREFIX = "cron_";

export type AuthenticatedUser = import("../../drizzle/schema").User & {
  /** Set only for Heartbeat cron callers (openId starts with "cron_"). */
  taskUid?: string;
  /** True only for Heartbeat cron callers. */
  isCron?: boolean;
};

function buildCronUser(
  userInfo: GetUserInfoWithJwtResponse
): AuthenticatedUser {
  const nowStr = new Date().toISOString().slice(0, 19).replace("T", " ");
  // Cast via unknown: cron callers are synthetic identities and intentionally
  // omit DB-only fields (passwordHash, organizationId, etc.).
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    passwordHash: null,
    loginMethod: null,
    role: "user" as const,
    insurerRole: null,
    organizationId: null,
    tenantId: null,
    emailVerified: 0,
    createdAt: nowStr,
    updatedAt: nowStr,
    lastSignedIn: nowStr,
    assessorTier: null,
    tierActivatedAt: null,
    tierExpiresAt: null,
    performanceScore: null,
    totalAssessmentsCompleted: null,
    averageVarianceFromFinal: null,
    accuracyScore: null,
    avgCompletionTime: null,
    marketplaceProfileId: null,
    isActive: 1,
    deactivatedAt: null,
    taskUid: userInfo.taskUid ?? undefined,
    isCron: true,
  } as unknown as AuthenticatedUser;
}

/** @deprecated Import LocalSessionPayload from kinga-session for new code. */
export type SessionPayload = LocalSessionPayload;

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }

  private decodeState(state: string): string {
    // state = btoa(redirectUri) — the Manus OAuth server always sends back the
    // same state that was passed to /app-auth. The client navigation facade
    // preserves this plain-base64 format. Do NOT change this to JSON parsing.
    return atob(state);
  }

  async getTokenByCode(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    assertNoDirectOAuthAccessDuringTests();
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    assertNoDirectOAuthAccessDuringTests();
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return createLocalSessionToken(openId, options);
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    return signLocalSession(payload, options);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    return verifyLocalSession(cookieValue);
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    assertNoDirectOAuthAccessDuringTests();
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // Regular authentication flow
    const sessionCookie = readLocalSessionCookie(req);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    // ── Heartbeat cron short-circuit ──────────────────────────────────────────────────
    // Heartbeat cron callers have openId prefixed with "cron_".
    // They are not real users — skip the DB lookup and return a synthetic user.
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
      if (!userInfo.taskUid)
        throw ForbiddenError("Cron session missing task_uid");
      return buildCronUser(userInfo);
    }
    // ── Regular user path (unchanged) ───────────────────────────────────────

    return resolveActiveLocalUser(session.openId);
  }
}

export const sdk = new SDKServer();
