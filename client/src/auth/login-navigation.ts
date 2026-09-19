import { RETURN_PATH_STORAGE_KEY } from "@/const";

/**
 * Client-owned boundary for the active human-auth provider.
 *
 * Package E intentionally preserves Manus as the only browser-visible provider.
 * Later provider-selection work may replace this implementation without requiring
 * every login trigger in the UI to understand provider URL construction.
 */
const MANUS_AUTH_PATH = "/app-auth";
const MANUS_CALLBACK_PATH = "/api/oauth/callback";

function getSafeReturnPath(returnPath?: string): string | undefined {
  return returnPath && returnPath !== "/login" && returnPath !== "/portal-hub"
    ? returnPath
    : undefined;
}

function getManusRuntimeConfig() {
  return {
    appId: import.meta.env.VITE_APP_ID,
    oauthPortalUrl: import.meta.env.VITE_OAUTH_PORTAL_URL,
    redirectUri: `${window.location.origin}${MANUS_CALLBACK_PATH}`,
  };
}

/**
 * Generates the currently selected provider's sign-in URL.
 *
 * The active provider remains Manus. Its OAuth server requires state to be the
 * plain base64 representation of redirectUri, so this format is deliberately
 * preserved. Internal return paths remain browser-local state rather than OAuth
 * state and are consumed by the existing login page after the callback.
 */
export function getDefaultLoginUrl(returnPath?: string): string {
  const { appId, oauthPortalUrl, redirectUri } = getManusRuntimeConfig();
  const safePath = getSafeReturnPath(returnPath);

  if (safePath) {
    try {
      localStorage.setItem(RETURN_PATH_STORAGE_KEY, safePath);
    } catch {
      // Preserve existing best-effort browser storage behavior.
    }
  }

  const url = new URL(`${oauthPortalUrl}${MANUS_AUTH_PATH}`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", btoa(redirectUri));
  url.searchParams.set("type", "signIn");
  return url.toString();
}

/** Starts the active provider's sign-in flow without exposing provider details. */
export function startDefaultLogin(returnPath?: string): void {
  window.location.href = getDefaultLoginUrl(returnPath);
}

/** Generates the active provider's account-recovery URL without changing return-path state. */
export function getAccountRecoveryUrl(): string {
  const { appId, oauthPortalUrl, redirectUri } = getManusRuntimeConfig();
  const url = new URL(`${oauthPortalUrl}${MANUS_AUTH_PATH}`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("type", "forgotPassword");
  return url.toString();
}
