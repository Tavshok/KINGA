import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

/**
 * The exact current KINGA human-session payload. Authorization data is not
 * carried in the JWT and is read fresh from the local user record per request.
 */
export type LocalSessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function getSessionSecret(): Uint8Array {
  return new TextEncoder().encode(ENV.cookieSecret);
}

/**
 * Produces the existing KINGA HS256 local session token. This module has no
 * provider HTTP dependency and deliberately serializes only the established
 * openId, appId, and name fields.
 */
export async function signLocalSession(
  payload: LocalSessionPayload,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

  return new SignJWT({
    openId: payload.openId,
    appId: payload.appId,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSessionSecret());
}

/** Creates the current normal local session payload without provider access. */
export async function createLocalSessionToken(
  openId: string,
  options: { expiresInMs?: number; name?: string } = {}
): Promise<string> {
  return signLocalSession(
    {
      openId,
      appId: ENV.appId,
      // Preserve the existing empty-name behavior for accounts without a name.
      name: options.name || "",
    },
    options
  );
}

/**
 * Verifies the existing local session token. Invalid, expired, malformed, or
 * non-HS256 tokens fail closed as null so the caller keeps its current outcome.
 */
export async function verifyLocalSession(
  cookieValue: string | undefined | null
): Promise<LocalSessionPayload | null> {
  if (!cookieValue) {
    console.warn("[Auth] Missing session cookie");
    return null;
  }

  try {
    const { payload } = await jwtVerify(cookieValue, getSessionSecret(), {
      algorithms: ["HS256"],
    });
    const { openId, appId, name } = payload as Record<string, unknown>;

    if (!isNonEmptyString(openId) || !isNonEmptyString(appId)) {
      console.warn(
        "[Auth] Session payload missing required fields (openId or appId)"
      );
      return null;
    }

    // `name` is intentionally not required. Preserve the prior runtime result
    // for legacy tokens where it is absent rather than rejecting the session.
    return {
      openId,
      appId,
      name: name as string,
    };
  } catch (error) {
    console.warn("[Auth] Session verification failed", String(error));
    return null;
  }
}

/** Reads only the normal KINGA session cookie; provider cookies are ignored. */
export function readLocalSessionCookie(
  req: Pick<Request, "headers">
): string | undefined {
  const cookieHeader =
    typeof req.headers.cookie === "string" ? req.headers.cookie : undefined;
  if (!cookieHeader) return undefined;
  return parseCookieHeader(cookieHeader)[COOKIE_NAME];
}

/**
 * Resolves an ordinary human local session against the database on every
 * request. This is the KINGA-AUTH-01 fail-closed boundary: no request-time
 * provisioning or re-synchronization is permitted.
 */
export async function resolveActiveLocalUser(openId: string): Promise<User> {
  const signedInAt = new Date().toISOString();
  const user = await db.getUserByOpenId(openId);

  if (!user) {
    console.warn(`[Auth] Rejected missing user openId=${openId}`);
    throw ForbiddenError("User not found");
  }

  if (user.isActive === 0) {
    console.warn(
      `[Auth] Rejected deactivated user id=${user.id} openId=${user.openId}`
    );
    throw ForbiddenError("Account has been deactivated");
  }

  // Update only an existing row. An upsert here would recreate a hard-deleted
  // identity from a still-valid JWT and defeat the KINGA-AUTH-01 revocation fix.
  await db.updateUserLastSignedIn(user.openId, signedInAt);

  return user;
}
