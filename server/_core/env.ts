import { isMaintenanceModeEnabled } from "./maintenance-mode";

export type KingaRuntimeMode = "managed" | "external";

export function getConfiguredRuntimeMode(
  value: string | undefined = process.env.KINGA_RUNTIME_MODE
): KingaRuntimeMode {
  const normalized = (value ?? "managed").trim().toLowerCase();
  if (normalized === "managed" || normalized === "external") {
    return normalized;
  }
  throw new Error("KINGA_RUNTIME_MODE must be managed or external");
}

export function getConfiguredAiProvider(
  runtimeMode: KingaRuntimeMode,
  value: string | undefined = process.env.AI_PROVIDER
): "forge" | "gemini" | "anthropic" {
  const provider = (value ?? "forge").trim().toLowerCase();
  if (runtimeMode === "managed") {
    if (provider !== "forge") {
      throw new Error("Managed runtime requires AI_PROVIDER=forge");
    }
    return provider;
  }
  if (provider === "gemini" || provider === "anthropic") {
    return provider;
  }
  throw new Error("External runtime requires AI_PROVIDER=gemini or anthropic");
}

export function getConfiguredObjectStorageProvider(
  runtimeMode: KingaRuntimeMode,
  value: string | undefined = process.env.OBJECT_STORAGE_PROVIDER
): "forge" | "s3" {
  const provider = (value ?? "forge").trim().toLowerCase();
  if (runtimeMode === "managed") {
    if (provider !== "forge") {
      throw new Error("Managed runtime requires OBJECT_STORAGE_PROVIDER=forge");
    }
    return provider;
  }
  if (provider === "s3") return provider;
  throw new Error("External runtime requires OBJECT_STORAGE_PROVIDER=s3");
}

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
  runtimeMode: process.env.KINGA_RUNTIME_MODE ?? "managed",
  /**
   * Managed deployments retain the existing Forge adapter by default. External
   * Render deployments must select exactly one direct provider; no Forge
   * fallback is permitted there.
   */
  aiProvider: process.env.AI_PROVIDER ?? "forge",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "",
  directMediaAllowedHosts: process.env.DIRECT_MEDIA_ALLOWED_HOSTS ?? "",
  directMediaMaxBytes: process.env.DIRECT_MEDIA_MAX_BYTES ?? "",
  objectStorageProvider: process.env.OBJECT_STORAGE_PROVIDER ?? "forge",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  /**
   * Default-off server-only gate for the separately configured WorkOS human
   * authentication route. No client code reads this value and no provider
   * configuration is evaluated unless the route is mounted.
   */
  workosHumanAuthEnabled: process.env.WORKOS_HUMAN_AUTH_ENABLED === "true",
  /**
   * Package G1 declaration only. No service-principal route is mounted by the
   * source-only foundation, even when this exact value is true. A later owner-
   * approved activation must separately compose and mount each canonical route.
   */
  g1ServiceRoutesEnabled: process.env.G1_SERVICE_ROUTES_ENABLED === "true",
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
