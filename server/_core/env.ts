import { isMaintenanceModeEnabled } from "./maintenance-mode";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /**
   * System Acceptance Testing mode.
   * When true: all email sends are suppressed (logged only), subjects prefixed
   * with "[TEST MODE]", and background retry loops are disabled.
   */
  systemTestMode: process.env.SYSTEM_TEST_MODE === "true",
  /**
   * Short-lived operational safety switch. When true, request middleware
   * rejects all non-health traffic and startup write jobs remain disabled.
   * This value is server-only and must be reset after a controlled window.
   */
  maintenanceMode: isMaintenanceModeEnabled(process.env.KINGA_MAINTENANCE_MODE),
  /** Dev/staging email redirect — all outbound emails go here instead of real recipients. */
  devEmailOverride: process.env.DEV_EMAIL_OVERRIDE ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /**
   * Default-off server-only gate for the separately configured WorkOS human
   * authentication route. No client code reads this value and no provider
   * configuration is evaluated unless the route is mounted.
   */
  workosHumanAuthEnabled: process.env.WORKOS_HUMAN_AUTH_ENABLED === "true",
  /**
   * Exact deployment-environment binding for the dedicated recovery sweep
   * service capability. It has no default: an unset value makes the route deny.
   */
  recoveryDeadlineSweepEnvironment:
    process.env.KINGA_RECOVERY_SWEEP_ENVIRONMENT ?? "",
  /**
   * Comma-separated list of Heartbeat task UIDs allowed to trigger
   * /api/scheduled/intake-escalation and /api/scheduled/stuck-recovery.
   *
   * Default "*" = allow any authenticated cron identity (permissive).
   * Set to the exact task UIDs returned by `manus-heartbeat create` after deploy
   * to lock down these endpoints to only the registered crons.
   *
   * Example: "f3Y36QWnFCQ6dmvd5C5xQ6,aB1cD2eF3gH4iJ5kL6mN7o"
   */
  heartbeatAllowedTaskUids: process.env.HEARTBEAT_ALLOWED_TASK_UIDS ?? "*",
};
