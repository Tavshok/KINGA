import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

// ── Heartbeat cron identity support ──────────────────────────────────────────
// These must be declared before SDKServer because authenticateRequest uses them.

const CRON_OPEN_ID_PREFIX = "cron_";

export type AuthenticatedUser = import("../../drizzle/schema").User & {
  /** Set only for Heartbeat cron callers (openId starts with "cron_"). */
  taskUid?: string;
  /** True only for Heartbeat cron callers. */
  isCron?: boolean;
};

function buildCronUser(userInfo: GetUserInfoWithJwtResponse): AuthenticatedUser {
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
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

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

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
    const redirectUri = atob(state);
    return redirectUri;
  }

  async getTokenByCode(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
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

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
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
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    // ── SESSION-DURATION-N-01 ────────────────────────────────────────────────────
    // Default session duration: 1 year (ONE_YEAR_MS).
    //
    // Rationale: KINGA's primary intake channel is WhatsApp, where claimants and
    // assessors interact via mobile. Forcing re-authentication every 7–30 days
    // creates friction for field users who are mid-claim. The 1-year default is
    // intentional, not an oversight.
    //
    // Revocation: The isActive=0 check in authenticateRequest() provides the
    // revocation mechanism — deactivated accounts are rejected at request time
    // even if their JWT is still cryptographically valid. See Pre-Batch-3 fix.
    //
    // No stale-tenantId risk: tenantId is NOT stored in the JWT payload. It is
    // loaded fresh from the database on every request via getUserByOpenId().
    // Changing a user's tenantId in the DB takes effect on the next request.
    //
    // Known constraint: If the database is unavailable, the isActive check cannot
    // run and the request will fail with INTERNAL_SERVER_ERROR (not a security
    // bypass — the request is rejected, not allowed through).
    // ────────────────────────────────────────────────────────────────────────────
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId)
        // NOTE: name is intentionally NOT required — users without a display name
        // on their Manus account will have name="" in the JWT. Rejecting empty name
        // permanently locks those users out. Name is not a security-critical field.
      ) {
        console.warn("[Auth] Session payload missing required fields (openId or appId)");
        return null;
      }

      return {
        openId,
        appId,
        name,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
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
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    // ── Heartbeat cron short-circuit ──────────────────────────────────────────────────
    // Heartbeat cron callers have openId prefixed with "cron_".
    // They are not real users — skip the DB lookup and return a synthetic user.
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
      if (!userInfo.taskUid) throw ForbiddenError("Cron session missing task_uid");
      return buildCronUser(userInfo);
    }
    // ── Regular user path (unchanged) ───────────────────────────────────────

    const sessionUserId = session.openId;
    const signedInAt = new Date().toISOString();
    let user = await db.getUserByOpenId(sessionUserId);

    // ── KINGA-AUTH-01: Fail-closed re-sync guard ──────────────────────────────
    // Only the platform owner (ENV.ownerOpenId) is auto-synced from the OAuth
    // server when not found in the DB. All other missing users are rejected
    // immediately with FORBIDDEN.
    //
    // Previously, any authenticated user not found in the DB was re-synced,
    // which allowed hard-deleted users to be re-created on every request because
    // their JWT remains valid for 1 year. This fix ensures that removing a user
    // from the DB is a permanent revocation. The correct revocation path is
    // admin.deactivateUser (sets isActive=0); hard-deleting a row is also safe
    // now because missing users are rejected rather than re-created.
    if (!user) {
      if (sessionUserId === ENV.ownerOpenId) {
        // Owner auto-sync: the platform owner may not be in the DB on first login.
        try {
          const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
          await db.upsertUser({
            openId: userInfo.openId,
            name: userInfo.name || null,
            email: userInfo.email ?? null,
            loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
            lastSignedIn: signedInAt,
          });
          user = await db.getUserByOpenId(userInfo.openId);
        } catch (error) {
          console.error("[Auth] Failed to sync owner from OAuth:", error);
          throw ForbiddenError("Failed to sync owner info");
        }
      } else {
        // Non-owner not in DB: fail closed.
        // Hard-deleted users whose JWT is still valid are rejected here.
        // They must be re-invited through the normal registration flow.
        console.warn(`[Auth] Rejected unknown user openId=${sessionUserId} — not in DB and not the platform owner`);
        throw ForbiddenError("User not found");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found after owner sync");
    }

    // ── Revocation check ──────────────────────────────────────────────────────
    // isActive=0 means the account has been explicitly deactivated by an admin.
    // A valid JWT for a deactivated account must be rejected immediately.
    // Hard-deleted users are now also blocked by the KINGA-AUTH-01 guard above.
    if (user.isActive === 0) {
      console.warn(`[Auth] Rejected deactivated user id=${user.id} openId=${user.openId}`);
      throw ForbiddenError("Account has been deactivated");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();
