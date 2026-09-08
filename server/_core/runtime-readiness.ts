/**
 * KINGA runtime readiness contract.
 *
 * This module is deliberately provider-neutral. It does not select or connect an
 * external identity, storage, scheduler, database, or cloud provider. Instead it
 * makes the configuration evidence required before an external staging deployment
 * may be considered ready explicit and safe to expose through a probe endpoint.
 *
 * NEVER: return secret values, treat this configuration probe as a database health
 * check, or use it as evidence that tenant/object authority has been verified.
 */

export type RuntimeMode = "managed" | "external" | "invalid";

type RuntimeEnvironment = Record<string, string | undefined>;

export interface RuntimeReadiness {
  status: "ready" | "not_ready";
  runtimeMode: RuntimeMode;
  releaseVersion: string;
  /** Readiness is limited to declared configuration, not live service parity. */
  verificationScope: "configuration-only";
  /** Names only; secret values are never included in this contract. */
  requiredConfiguration: string[];
  missingConfiguration: string[];
  invalidConfiguration: string[];
  /** True only when configuration is complete; it is not a DB or authority proof. */
  configurationReady: boolean;
}

const MANAGED_REQUIRED_CONFIGURATION = ["DATABASE_URL", "JWT_SECRET"] as const;

/**
 * These are the minimum *declaration* boundaries for an externally hosted
 * staging environment. The selected OIDC, storage and scheduler implementations
 * remain a separately reviewed decision; this contract does not pretend they
 * already exist in the current code path.
 */
const EXTERNAL_REQUIRED_CONFIGURATION = [
  "DATABASE_URL",
  "JWT_SECRET",
  "KINGA_PUBLIC_APP_ORIGIN",
  "KINGA_API_ORIGIN",
  "KINGA_IDENTITY_MODE",
  "KINGA_OBJECT_STORAGE_MODE",
  "KINGA_SCHEDULER_AUTH_MODE",
  "KINGA_JOB_EXECUTION_MODE",
  "KINGA_WEBSOCKET_MODE",
] as const;

function present(env: RuntimeEnvironment, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function isHttpOrigin(value: string | undefined, production: boolean): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash) return false;
    return production ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function runtimeModeFrom(env: RuntimeEnvironment): RuntimeMode {
  const configured = (env.KINGA_RUNTIME_MODE ?? "managed").trim().toLowerCase();
  if (configured === "managed") return "managed";
  if (configured === "external") return "external";
  return "invalid";
}

function releaseVersionFrom(env: RuntimeEnvironment): string {
  return env.KINGA_RELEASE_VERSION?.trim()
    || env.GIT_SHA?.trim()
    || env.npm_package_version?.trim()
    || "unknown";
}

/**
 * Return configuration readiness for probes and deployment diagnostics.
 * This function does not perform network I/O and is intentionally deterministic.
 */
export function getRuntimeReadiness(
  env: RuntimeEnvironment = process.env,
): RuntimeReadiness {
  const runtimeMode = runtimeModeFrom(env);
  const production = env.NODE_ENV === "production";
  const requiredConfiguration = runtimeMode === "external"
    ? [...EXTERNAL_REQUIRED_CONFIGURATION]
    : [...MANAGED_REQUIRED_CONFIGURATION];
  const missingConfiguration = requiredConfiguration.filter((key) => !present(env, key));
  const invalidConfiguration: string[] = [];

  if (runtimeMode === "invalid") {
    invalidConfiguration.push("KINGA_RUNTIME_MODE (must be managed or external)");
  }

  if (runtimeMode === "external") {
    if (present(env, "KINGA_PUBLIC_APP_ORIGIN") && !isHttpOrigin(env.KINGA_PUBLIC_APP_ORIGIN, production)) {
      invalidConfiguration.push("KINGA_PUBLIC_APP_ORIGIN (must be an origin; HTTPS required in production)");
    }
    if (present(env, "KINGA_API_ORIGIN") && !isHttpOrigin(env.KINGA_API_ORIGIN, production)) {
      invalidConfiguration.push("KINGA_API_ORIGIN (must be an origin; HTTPS required in production)");
    }
  }

  const configurationReady = missingConfiguration.length === 0 && invalidConfiguration.length === 0;

  return {
    status: configurationReady ? "ready" : "not_ready",
    runtimeMode,
    releaseVersion: releaseVersionFrom(env),
    verificationScope: "configuration-only",
    requiredConfiguration,
    missingConfiguration,
    invalidConfiguration,
    configurationReady,
  };
}
