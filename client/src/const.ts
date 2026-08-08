export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
// Key used to store the post-login return path in localStorage.
// Written before the OAuth redirect; read by Login.tsx after the callback.
export const RETURN_PATH_STORAGE_KEY = "kinga_post_login_return_path";

/**
 * Generate login URL at runtime so redirect URI reflects the current origin.
 *
 * IMPORTANT: The Manus OAuth server requires state = btoa(redirectUri) — a plain
 * base64 of the redirect URI. Do NOT encode JSON in state; the OAuth server uses
 * state to validate the redirectUri in the token exchange and rejects anything
 * that doesn't decode to a valid URI (returns 401).
 *
 * returnPath is stored in localStorage (RETURN_PATH_STORAGE_KEY) before the
 * OAuth redirect so Login.tsx can read it after the callback completes.
 *
 * @param returnPath  Optional path to redirect to after login.
 */
export const getLoginUrl = (returnPath?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  // Store returnPath in localStorage so it survives the OAuth redirect.
  // Exclude /login and /portal-hub to avoid redirect loops.
  const safePath = returnPath && returnPath !== "/login" && returnPath !== "/portal-hub"
    ? returnPath
    : undefined;
  if (safePath) {
    try { localStorage.setItem(RETURN_PATH_STORAGE_KEY, safePath); } catch { /* ignore */ }
  }

  // Keep state as btoa(redirectUri) — the original format the Manus OAuth server expects.
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
