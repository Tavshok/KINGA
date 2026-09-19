import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { recoverySweepServiceCapabilities } from "../../drizzle/schema";
import { getDb } from "../db";

const EXPECTED_CAPABILITY = "recovery-deadline-sweep";
const HASH_VERSION = "scrypt-v1";
const SCRYPT_N = 131_072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const MAX_SECRET_LENGTH = 512;

type CapabilityRecord = {
  keyId: string;
  capability: string;
  environment: string;
  secretHash: string;
  status: "active" | "revoked";
  expiresAt: string | Date | null;
};

export type RecoverySweepAuthorizationDependencies = {
  environment: string;
  findCapability: (
    keyId: string,
    environment: string
  ) => Promise<CapabilityRecord | null>;
  now?: () => Date;
};

export type RecoverySweepAuthorizationResult =
  | { authorized: true; keyId: string }
  | { authorized: false };

function isOpaqueIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/u.test(value);
}

function isEnvironmentLabel(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(value);
}

function parseAuthorizationHeader(
  value: unknown
): { keyId: string; secret: string } | null {
  if (typeof value !== "string") return null;
  const match = /^Bearer ([^\s]+)$/u.exec(value);
  if (!match) return null;

  const components = match[1].split(":");
  if (
    components.length !== 5 ||
    components[0] !== "kinga-svc" ||
    components[1] !== "v1" ||
    components[2] !== EXPECTED_CAPABILITY
  ) {
    return null;
  }

  const [, , , keyId, secret] = components;
  if (
    !isOpaqueIdentifier(keyId) ||
    secret.length < 32 ||
    secret.length > MAX_SECRET_LENGTH
  ) {
    return null;
  }

  return { keyId, secret };
}

function parseStoredHash(
  value: string
): { salt: Buffer; digest: Buffer } | null {
  const [version, n, r, p, saltEncoded, digestEncoded] = value.split("$");
  if (
    version !== HASH_VERSION ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    !saltEncoded ||
    !digestEncoded
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(saltEncoded, "base64url");
    const digest = Buffer.from(digestEncoded, "base64url");
    if (
      salt.length < 16 ||
      salt.length > 64 ||
      digest.length !== SCRYPT_KEY_LENGTH
    ) {
      return null;
    }
    return { salt, digest };
  } catch {
    return null;
  }
}

function deriveScrypt(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      secret,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 256 * 1024 * 1024,
      },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      }
    );
  });
}

async function verifySecret(
  secret: string,
  storedHash: string
): Promise<boolean> {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;

  try {
    const derived = await deriveScrypt(secret, parsed.salt);
    return timingSafeEqual(derived, parsed.digest);
  } catch {
    return false;
  }
}

function isActiveCapability(
  record: CapabilityRecord,
  keyId: string,
  environment: string,
  now: Date
): boolean {
  if (
    record.keyId !== keyId ||
    record.capability !== EXPECTED_CAPABILITY ||
    record.environment !== environment ||
    record.status !== "active"
  ) {
    return false;
  }

  if (record.expiresAt === null) return true;
  const expiresAt = new Date(record.expiresAt);
  return (
    Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()
  );
}

/**
 * Authorizes only the dedicated recovery-deadline service capability. This
 * verifier intentionally has no human-session, cron, task-UID, network, or
 * proxy-header success path.
 */
export async function authorizeRecoveryDeadlineSweep(
  input: { authorization: unknown; hasHumanSessionCookie: boolean },
  dependencies: RecoverySweepAuthorizationDependencies
): Promise<RecoverySweepAuthorizationResult> {
  if (
    input.hasHumanSessionCookie ||
    !isEnvironmentLabel(dependencies.environment)
  ) {
    return { authorized: false };
  }

  const parsed = parseAuthorizationHeader(input.authorization);
  if (!parsed) return { authorized: false };

  let record: CapabilityRecord | null;
  try {
    record = await dependencies.findCapability(
      parsed.keyId,
      dependencies.environment
    );
  } catch {
    return { authorized: false };
  }
  if (
    !record ||
    !isActiveCapability(
      record,
      parsed.keyId,
      dependencies.environment,
      dependencies.now?.() ?? new Date()
    )
  ) {
    return { authorized: false };
  }

  return (await verifySecret(parsed.secret, record.secretHash))
    ? { authorized: true, keyId: record.keyId }
    : { authorized: false };
}

export async function authorizeRecoveryDeadlineSweepRequest(input: {
  authorization: unknown;
  hasHumanSessionCookie: boolean;
  environment: string;
}): Promise<RecoverySweepAuthorizationResult> {
  return authorizeRecoveryDeadlineSweep(input, {
    environment: input.environment,
    async findCapability(keyId, environment) {
      const db = await getDb();
      if (!db) return null;
      const [record] = await db
        .select({
          keyId: recoverySweepServiceCapabilities.keyId,
          capability: recoverySweepServiceCapabilities.capability,
          environment: recoverySweepServiceCapabilities.environment,
          secretHash: recoverySweepServiceCapabilities.secretHash,
          status: recoverySweepServiceCapabilities.status,
          expiresAt: recoverySweepServiceCapabilities.expiresAt,
        })
        .from(recoverySweepServiceCapabilities)
        .where(
          and(
            eq(recoverySweepServiceCapabilities.keyId, keyId),
            eq(recoverySweepServiceCapabilities.environment, environment)
          )
        )
        .limit(1);
      return record ?? null;
    },
  });
}

export const RECOVERY_DEADLINE_SWEEP_CAPABILITY = EXPECTED_CAPABILITY;
export const RECOVERY_DEADLINE_SCRYPT_PARAMETERS = {
  version: HASH_VERSION,
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  keyLength: SCRYPT_KEY_LENGTH,
} as const;
