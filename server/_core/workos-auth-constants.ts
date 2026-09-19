/**
 * Shared, server-only constants for the default-off WorkOS human-auth path.
 * This file contains no provider configuration and does not enable the route.
 */
export const WORKOS_AUTH_CALLBACK_PATH = "/api/auth/workos/callback";
export const WORKOS_AUTH_START_PATH = "/api/auth/workos/start";
export const WORKOS_AUTH_BINDING_COOKIE_NAME = "workos_auth_binding";

/**
 * Expired records are discarded on every start and callback store operation.
 * A separately reviewed operational cleanup job remains required before any
 * environment activates the route, so inactive systems do not retain verifier
 * material indefinitely.
 */
export const WORKOS_AUTH_EXPIRED_RETENTION_MS = 0;

export const WORKOS_AUTH_FAILURE_RETURN_PATH = "/";
