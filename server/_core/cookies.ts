import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalhost(req: Request): boolean {
  const host = req.hostname ?? "";
  return LOCAL_HOSTS.has(host) || host === "127.0.0.1" || host === "::1";
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const local = isLocalhost(req);

  // Cookie strategy:
  // - On localhost (dev): SameSite=lax, Secure=false — works for local HTTP
  // - On deployed site (HTTPS): SameSite=lax, Secure=true
  //
  // WHY NOT SameSite=none:
  //   SameSite=none REQUIRES Secure=true. If the server incorrectly detects the
  //   request as HTTP (e.g. X-Forwarded-Proto not trusted by Express), it sets
  //   Secure=false, and the browser silently drops the cookie — causing the
  //   login loop. This was the root cause of the persistent login loop.
  //
  // WHY SameSite=lax works for OAuth:
  //   The OAuth callback is a top-level GET redirect (302) from manus.im back to
  //   our domain. SameSite=lax allows cookies to be SET on top-level navigations,
  //   so the Set-Cookie in the callback response is accepted by the browser.
  //   Subsequent /api/trpc requests (same-origin XHR) also send lax cookies.

  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: !local,
  };
}
