import { scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import {
  isServiceCapability,
  type ServiceCapability,
} from "./service-capabilities";
import type {
  ServiceCredentialRecord,
  ServiceCredentialStore,
} from "./service-credential-store";

const TOKEN_PATTERN =
  /^kng_st_([a-z][a-z0-9-]{1,30})_([A-Za-z0-9]{16,64})_([A-Za-z0-9_-]{32,256})$/u;
const MAX_AUTHORIZATION_VALUE_BYTES = 512;

export const SCRYPT_V1_PARAMETERS = Object.freeze({
  N: 131_072,
  r: 8,
  p: 1,
  keyLength: 32,
  minimumSaltBytes: 16,
  maxmem: 256 * 1024 * 1024,
});

export interface ParsedServiceBearer {
  readonly environment: string;
  readonly credentialId: string;
  readonly secret: string;
  readonly safePrefix: string;
}

export interface ServicePrincipal {
  readonly kind: "service-principal";
  readonly principalName: string;
  readonly credentialId: string;
  readonly environment: string;
  readonly capability: ServiceCapability;
}

export type ServiceAuthenticationDenial =
  | "invalid_request"
  | "invalid_credential"
  | "inactive_credential"
  | "not_yet_valid"
  | "expired_credential"
  | "wrong_environment"
  | "wrong_capability"
  | "forbidden_context"
  | "service_unavailable";

export type ServiceAuthenticationResult =
  | { readonly ok: true; readonly principal: ServicePrincipal }
  | { readonly ok: false; readonly reason: ServiceAuthenticationDenial };

export interface ServiceAuthenticationSignals {
  readonly hasCookie?: boolean;
  readonly hasQuery?: boolean;
  readonly hasBody?: boolean;
  readonly hasHumanContext?: boolean;
  readonly hasCronContext?: boolean;
  readonly hasSdkContext?: boolean;
}

export interface AuthenticateServicePrincipalInput {
  readonly authorizationValues: readonly string[];
  readonly expectedEnvironment: string;
  readonly requiredCapability: ServiceCapability;
  readonly store: ServiceCredentialStore;
  readonly signals?: ServiceAuthenticationSignals;
  readonly now?: Date;
}

function deriveScrypt(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      secret,
      salt,
      SCRYPT_V1_PARAMETERS.keyLength,
      {
        N: SCRYPT_V1_PARAMETERS.N,
        r: SCRYPT_V1_PARAMETERS.r,
        p: SCRYPT_V1_PARAMETERS.p,
        maxmem: SCRYPT_V1_PARAMETERS.maxmem,
      },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      }
    );
  });
}

function decodeBase64UrlStrict(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

export function parseServiceAuthorization(
  values: readonly string[]
): ParsedServiceBearer | null {
  if (values.length !== 1) return null;
  const value = values[0];
  if (
    !value ||
    Buffer.byteLength(value, "utf8") > MAX_AUTHORIZATION_VALUE_BYTES ||
    value.includes(",")
  ) {
    return null;
  }

  const match = /^Bearer ([^\s]+)$/iu.exec(value);
  if (!match) return null;
  const tokenMatch = TOKEN_PATTERN.exec(match[1]);
  if (!tokenMatch) return null;

  const [, environment, credentialId, secret] = tokenMatch;
  if (!decodeBase64UrlStrict(secret)) return null;

  return {
    environment,
    credentialId,
    secret,
    safePrefix: `kng_st_${environment}_${credentialId}`,
  };
}

export async function verifyScryptV1(
  secret: string,
  record: Pick<
    ServiceCredentialRecord,
    "verifierAlgorithm" | "saltBase64" | "verifierBase64"
  >
): Promise<boolean> {
  if (record.verifierAlgorithm !== "scrypt-v1") return false;

  const salt = decodeBase64UrlStrict(record.saltBase64);
  const expected = decodeBase64UrlStrict(record.verifierBase64);
  if (
    !salt ||
    salt.length < SCRYPT_V1_PARAMETERS.minimumSaltBytes ||
    !expected ||
    expected.length !== SCRYPT_V1_PARAMETERS.keyLength
  ) {
    return false;
  }

  const derived = await deriveScrypt(secret, salt);

  return timingSafeEqual(derived, expected);
}

function hasForbiddenContext(signals: ServiceAuthenticationSignals): boolean {
  return Boolean(
    signals.hasCookie ||
      signals.hasQuery ||
      signals.hasBody ||
      signals.hasHumanContext ||
      signals.hasCronContext ||
      signals.hasSdkContext
  );
}

function validTime(value: string): number | null {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export async function authenticateServicePrincipal(
  input: AuthenticateServicePrincipalInput
): Promise<ServiceAuthenticationResult> {
  try {
    if (hasForbiddenContext(input.signals ?? {})) {
      return { ok: false, reason: "forbidden_context" };
    }

    const parsed = parseServiceAuthorization(input.authorizationValues);
    if (!parsed) return { ok: false, reason: "invalid_request" };
    if (!isServiceCapability(input.requiredCapability)) {
      return { ok: false, reason: "wrong_capability" };
    }

    const record = await input.store.findByCredentialId(parsed.credentialId);
    if (!record) return { ok: false, reason: "invalid_credential" };
    if (
      record.environment !== input.expectedEnvironment ||
      parsed.environment !== record.environment
    ) {
      return { ok: false, reason: "wrong_environment" };
    }
    if (record.capability !== input.requiredCapability) {
      return { ok: false, reason: "wrong_capability" };
    }
    if (record.lifecycleState !== "active" || record.revokedAt) {
      return { ok: false, reason: "inactive_credential" };
    }
    if (record.safePrefix !== parsed.safePrefix) {
      return { ok: false, reason: "invalid_credential" };
    }

    const notBefore = validTime(record.notBefore);
    const expiresAt = validTime(record.expiresAt);
    if (notBefore === null || expiresAt === null || expiresAt <= notBefore) {
      return { ok: false, reason: "inactive_credential" };
    }

    const now = (input.now ?? new Date()).getTime();
    if (now < notBefore) return { ok: false, reason: "not_yet_valid" };
    if (now >= expiresAt) return { ok: false, reason: "expired_credential" };

    if (!(await verifyScryptV1(parsed.secret, record))) {
      return { ok: false, reason: "invalid_credential" };
    }

    return {
      ok: true,
      principal: Object.freeze({
        kind: "service-principal",
        principalName: record.principalName,
        credentialId: record.credentialId,
        environment: record.environment,
        capability: record.capability,
      }),
    };
  } catch {
    return { ok: false, reason: "service_unavailable" };
  }
}
