export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Generate login URL at runtime so redirect URI reflects the current origin.
 *
 * The `state` parameter now encodes both the redirectUri (required by the
 * OAuth server) and an optional `returnPath` so the callback handler can
 * redirect the user back to the page they were trying to reach instead of
 * always landing on /portal-hub.
 *
 * Encoding: base64(JSON.stringify({ redirectUri, returnPath }))
 *
 * @param returnPath  Optional path to redirect to after login.
 *                    Defaults to the current pathname + search string.
 */
export const getLoginUrl = (returnPath?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  // Capture the page the user was on so we can return them there after login.
  // Exclude /login and /portal-hub from the returnPath to avoid redirect loops.
  const currentPath = window.location.pathname + window.location.search;
  const safePath =
    returnPath ??
    (currentPath === "/login" || currentPath === "/portal-hub" ? undefined : currentPath);

  const statePayload = JSON.stringify({
    redirectUri,
    ...(safePath ? { returnPath: safePath } : {}),
  });
  const state = btoa(statePayload);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
