import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Decode the OAuth `state` parameter.
 *
 * Legacy format: base64(redirectUri)          → returns { redirectUri, returnPath: undefined }
 * New format:    base64(JSON{ redirectUri, returnPath? }) → returns both fields
 *
 * Both formats are supported so existing sessions and bookmarked login links
 * continue to work after the upgrade.
 */
function parseState(state: string): { redirectUri: string; returnPath?: string } {
  try {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    // New format: JSON object
    if (decoded.trimStart().startsWith("{")) {
      const parsed = JSON.parse(decoded) as { redirectUri?: string; returnPath?: string };
      if (parsed.redirectUri) {
        return { redirectUri: parsed.redirectUri, returnPath: parsed.returnPath };
      }
    }
    // Legacy format: plain redirectUri string
    return { redirectUri: decoded };
  } catch {
    return { redirectUri: "/portal-hub" };
  }
}

/**
 * Validate that a returnPath is safe to redirect to:
 * - Must start with "/" (relative path only, no open redirects)
 * - Must not be /login or /portal-hub (would cause redirect loops)
 */
function isSafeReturnPath(path: string | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path === "/login" || path === "/portal-hub") return false;
  return true;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      console.log("[OAuth] Step 1: exchangeCodeForToken starting, state length=" + state.length);
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      console.log("[OAuth] Step 2: exchangeCodeForToken OK");
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      console.log(`[OAuth] Step 3: getUserInfo OK openId=${userInfo.openId} name="${userInfo.name}" email="${userInfo.email}"`);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      console.log("[OAuth] Step 4: upsertUser starting");
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date().toISOString(),
      });
      console.log("[OAuth] Step 5: upsertUser OK, creating session token");

      // Use email or openId as fallback so the JWT name field is never empty.
      const displayName = userInfo.name || userInfo.email || userInfo.openId || "user";
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: displayName,
        expiresInMs: ONE_YEAR_MS,
      });
      console.log("[OAuth] Step 6: session token created");

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to the page the user was on before login, or fall back to
      // /portal-hub for role selection.
      const { returnPath } = parseState(state);
      const destination = isSafeReturnPath(returnPath) ? returnPath : "/portal-hub";
      console.log(`[OAuth] Step 7: redirecting to ${destination}`);
      res.redirect(302, destination);
    } catch (error) {
      console.error("[OAuth] Callback FAILED:", String(error));
      if (error instanceof Error) console.error("[OAuth] Stack:", error.stack?.split('\n').slice(0, 5).join(' | '));
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
