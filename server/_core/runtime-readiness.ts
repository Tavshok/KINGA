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

import { isValidDirectMediaHost } from "./direct-provider-media";
import {
  getConfiguredAiProvider,
  getConfiguredObjectStorageProvider,
} from "./env";

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

export interface DirectClaimPathReadiness {
  verificationScope: "configuration-only";
  requiredConfiguration: string[];
  missingConfiguration: string[];
  invalidConfiguration: string[];
  configurationReady: boolean;
}

export interface G1ServiceRouteReadiness {
  enabled: boolean;
  routeBoundaryMounted: false;
  verificationScope: "configuration-only";
  requiredConfiguration: readonly [
    "G1_SERVICE_ROUTES_ENABLED",
    "KINGA_SERVICE_ENVIRONMENT",
    "KINGA_SCHEDULER_OF_RECORD",
  ];
  missingConfiguration: string[];
  invalidConfiguration: string[];
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

const G1_REQUIRED_CONFIGURATION = [
  "G1_SERVICE_ROUTES_ENABLED",
  "KINGA_SERVICE_ENVIRONMENT",
  "KINGA_SCHEDULER_OF_RECORD",
] as const;

const DIRECT_CLAIM_PATH_COMMON_CONFIGURATION = [
  "AI_PROVIDER",
  "OBJECT_STORAGE_PROVIDER",
  "DIRECT_MEDIA_ALLOWED_HOSTS",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

function present(env: RuntimeEnvironment, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function isHttpOrigin(value: string | undefined, production: boolean): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash) return false;
    return production
      ? url.protocol === "https:"
      : ["http:", "https:"].includes(url.protocol);
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
  return (
    env.KINGA_RELEASE_VERSION?.trim() ||
    env.GIT_SHA?.trim() ||
    env.npm_package_version?.trim() ||
    "unknown"
  );
}

/**
 * Checks only the declared non-secret dependencies for an independent Render
 * claim path. It never performs AI, storage, database, PDF, or tenant I/O.
 */
export function getDirectClaimPathReadiness(
  env: RuntimeEnvironment = process.env
): DirectClaimPathReadiness {
  const provider = env.AI_PROVIDER?.trim().toLowerCase();
  const requiredConfiguration: string[] = [
    ...DIRECT_CLAIM_PATH_COMMON_CONFIGURATION,
  ];
  const invalidConfiguration: string[] = [];

  if (provider === "gemini") {
    requiredConfiguration.push("GEMINI_API_KEY", "GEMINI_MODEL");
  } else if (provider === "anthropic") {
    requiredConfiguration.push("ANTHROPIC_API_KEY", "ANTHROPIC_MODEL");
  } else {
    invalidConfiguration.push(
      "AI_PROVIDER (must be gemini or anthropic in external mode)"
    );
  }

  if (env.OBJECT_STORAGE_PROVIDER?.trim().toLowerCase() !== "s3") {
    invalidConfiguration.push(
      "OBJECT_STORAGE_PROVIDER (must be s3 in external mode)"
    );
  }

  const mediaHosts = (env.DIRECT_MEDIA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(host => host.trim())
    .filter(Boolean);
  if (
    mediaHosts.length === 0 ||
    mediaHosts.some(host => !isValidDirectMediaHost(host))
  ) {
    invalidConfiguration.push(
      "DIRECT_MEDIA_ALLOWED_HOSTS (must list exact hostnames)"
    );
  }

  if (present(env, "S3_ENDPOINT")) {
    try {
      const endpoint = new URL(env.S3_ENDPOINT!);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.port ||
        endpoint.pathname !== "/" ||
        endpoint.search ||
        endpoint.hash ||
        !isValidDirectMediaHost(endpoint.hostname)
      ) {
        throw new Error("unsafe endpoint");
      }
    } catch {
      invalidConfiguration.push(
        "S3_ENDPOINT (must be a credential-free HTTPS URL with a public DNS hostname)"
      );
    }
  }

  if (present(env, "DIRECT_MEDIA_MAX_BYTES")) {
    const maxBytes = Number(env.DIRECT_MEDIA_MAX_BYTES);
    if (
      !Number.isInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > 50 * 1024 * 1024
    ) {
      invalidConfiguration.push(
        "DIRECT_MEDIA_MAX_BYTES (must be an integer from 1 to 52428800)"
      );
    }
  }

  const missingConfiguration = requiredConfiguration.filter(
    key => !present(env, key)
  );
  return {
    verificationScope: "configuration-only",
    requiredConfiguration,
    missingConfiguration,
    invalidConfiguration,
    configurationReady:
      missingConfiguration.length === 0 && invalidConfiguration.length === 0,
  };
}

/**
 * Return configuration readiness for probes and deployment diagnostics.
 * This function does not perform network I/O and is intentionally deterministic.
 */
export function getRuntimeReadiness(
  env: RuntimeEnvironment = process.env
): RuntimeReadiness {
  const runtimeMode = runtimeModeFrom(env);
  const production = env.NODE_ENV === "production";
  const requiredConfiguration: string[] =
    runtimeMode === "external"
      ? [...EXTERNAL_REQUIRED_CONFIGURATION]
      : [...MANAGED_REQUIRED_CONFIGURATION];
  const missingConfiguration = requiredConfiguration.filter(
    key => !present(env, key)
  );
  const invalidConfiguration: string[] = [];

  if (runtimeMode === "invalid") {
    invalidConfiguration.push(
      "KINGA_RUNTIME_MODE (must be managed or external)"
    );
  }

  if (runtimeMode === "external") {
    if (
      present(env, "KINGA_PUBLIC_APP_ORIGIN") &&
      !isHttpOrigin(env.KINGA_PUBLIC_APP_ORIGIN, production)
    ) {
      invalidConfiguration.push(
        "KINGA_PUBLIC_APP_ORIGIN (must be an origin; HTTPS required in production)"
      );
    }
    if (
      present(env, "KINGA_API_ORIGIN") &&
      !isHttpOrigin(env.KINGA_API_ORIGIN, production)
    ) {
      invalidConfiguration.push(
        "KINGA_API_ORIGIN (must be an origin; HTTPS required in production)"
      );
    }

    const directClaimPath = getDirectClaimPathReadiness(env);
    requiredConfiguration.push(...directClaimPath.requiredConfiguration);
    missingConfiguration.push(...directClaimPath.missingConfiguration);
    invalidConfiguration.push(...directClaimPath.invalidConfiguration);
  } else if (runtimeMode === "managed") {
    try {
      getConfiguredAiProvider("managed", env.AI_PROVIDER);
    } catch (error) {
      invalidConfiguration.push(
        error instanceof Error
          ? error.message
          : "Managed AI provider is invalid"
      );
    }
    try {
      getConfiguredObjectStorageProvider(
        "managed",
        env.OBJECT_STORAGE_PROVIDER
      );
    } catch (error) {
      invalidConfiguration.push(
        error instanceof Error
          ? error.message
          : "Managed object storage provider is invalid"
      );
    }
  }

  const configurationReady =
    missingConfiguration.length === 0 && invalidConfiguration.length === 0;

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

/** Configuration declaration only; it cannot mount or infer activation. */
export function getG1ServiceRouteReadiness(
  env: RuntimeEnvironment = process.env
): G1ServiceRouteReadiness {
  const enabled = env.G1_SERVICE_ROUTES_ENABLED === "true";
  const missingConfiguration = G1_REQUIRED_CONFIGURATION.filter(
    key => !present(env, key)
  );
  const invalidConfiguration: string[] = [];

  if (
    present(env, "G1_SERVICE_ROUTES_ENABLED") &&
    env.G1_SERVICE_ROUTES_ENABLED !== "true" &&
    env.G1_SERVICE_ROUTES_ENABLED !== "false"
  ) {
    invalidConfiguration.push(
      "G1_SERVICE_ROUTES_ENABLED (must be exactly true or false)"
    );
  }
  if (
    present(env, "KINGA_SERVICE_ENVIRONMENT") &&
    !/^[a-z][a-z0-9-]{1,30}$/u.test(env.KINGA_SERVICE_ENVIRONMENT!)
  ) {
    invalidConfiguration.push(
      "KINGA_SERVICE_ENVIRONMENT (must be a lowercase environment name)"
    );
  }

  return {
    enabled,
    routeBoundaryMounted: false,
    verificationScope: "configuration-only",
    requiredConfiguration: G1_REQUIRED_CONFIGURATION,
    missingConfiguration,
    invalidConfiguration,
    configurationReady:
      enabled &&
      missingConfiguration.length === 0 &&
      invalidConfiguration.length === 0,
  };
}
