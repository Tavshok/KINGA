import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import {
  authorizeRecoveryDeadlineSweep,
  RECOVERY_DEADLINE_SCRYPT_PARAMETERS,
} from "./recovery-deadline-service-authorization";

const scrypt = promisify(scryptCallback);
const ENVIRONMENT = "ci-test";
const KEY_ID = "recovery-ci-key-0001";
const SECRET = "c".repeat(48);

async function storedHash(secret = SECRET): Promise<string> {
  const salt = randomBytes(16);
  const digest = (await scrypt(
    secret,
    salt,
    RECOVERY_DEADLINE_SCRYPT_PARAMETERS.keyLength,
    {
      N: RECOVERY_DEADLINE_SCRYPT_PARAMETERS.N,
      r: RECOVERY_DEADLINE_SCRYPT_PARAMETERS.r,
      p: RECOVERY_DEADLINE_SCRYPT_PARAMETERS.p,
      maxmem: 256 * 1024 * 1024,
    }
  )) as Buffer;
  return [
    RECOVERY_DEADLINE_SCRYPT_PARAMETERS.version,
    RECOVERY_DEADLINE_SCRYPT_PARAMETERS.N,
    RECOVERY_DEADLINE_SCRYPT_PARAMETERS.r,
    RECOVERY_DEADLINE_SCRYPT_PARAMETERS.p,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

async function authorize(
  overrides: Partial<Parameters<typeof authorizeRecoveryDeadlineSweep>[1]> = {},
  input: Partial<Parameters<typeof authorizeRecoveryDeadlineSweep>[0]> = {}
) {
  const findCapability =
    overrides.findCapability ??
    vi.fn(async () => ({
      keyId: KEY_ID,
      capability: "recovery-deadline-sweep",
      environment: ENVIRONMENT,
      secretHash: await storedHash(),
      status: "active" as const,
      expiresAt: null,
    }));
  const result = await authorizeRecoveryDeadlineSweep(
    {
      authorization: `Bearer kinga-svc:v1:recovery-deadline-sweep:${KEY_ID}:${SECRET}`,
      hasHumanSessionCookie: false,
      ...input,
    },
    {
      environment: ENVIRONMENT,
      findCapability,
      ...overrides,
    }
  );
  return { result, findCapability };
}

describe("REC-SEC-02 recovery sweep service capability", () => {
  it("accepts exactly the configured active, unexpired capability", async () => {
    const { result } = await authorize();
    expect(result).toEqual({ authorized: true, keyId: KEY_ID });
  });

  it("denies a human session before any capability lookup", async () => {
    const findCapability = vi.fn();
    const { result } = await authorize(
      { findCapability },
      { hasHumanSessionCookie: true }
    );
    expect(result).toEqual({ authorized: false });
    expect(findCapability).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "Basic invalid",
    "Bearer kinga-svc:v1:recovery-deadline-sweep:short:too-short",
    `Bearer kinga-svc:v1:wrong-capability:${KEY_ID}:${SECRET}`,
    `Bearer kinga-svc:v1:recovery-deadline-sweep:${KEY_ID}:not-enough-secret`,
    `Bearer kinga-svc:v1:recovery-deadline-sweep:${KEY_ID}:${"x".repeat(513)}`,
  ])(
    "denies malformed credentials without a database lookup: %s",
    async authorization => {
      const findCapability = vi.fn();
      const { result } = await authorize({ findCapability }, { authorization });
      expect(result).toEqual({ authorized: false });
      expect(findCapability).not.toHaveBeenCalled();
    }
  );

  it("denies a wrong secret without revealing which verification failed", async () => {
    const { result, findCapability } = await authorize(
      {},
      {
        authorization: `Bearer kinga-svc:v1:recovery-deadline-sweep:${KEY_ID}:${"d".repeat(48)}`,
      }
    );
    expect(result).toEqual({ authorized: false });
    expect(findCapability).toHaveBeenCalledOnce();
  });

  it.each([
    ["wrong capability", { capability: "intake-escalation" }],
    ["wrong environment", { environment: "production" }],
    ["revoked", { status: "revoked" as const }],
    ["expired", { expiresAt: new Date("2020-01-01T00:00:00Z") }],
    ["invalid hash", { secretHash: "not-a-scrypt-hash" }],
  ])("denies a %s record", async (_label, recordOverride) => {
    const hash = await storedHash();
    const { result } = await authorize({
      findCapability: async () => ({
        keyId: KEY_ID,
        capability: "recovery-deadline-sweep",
        environment: ENVIRONMENT,
        secretHash: hash,
        status: "active",
        expiresAt: null,
        ...recordOverride,
      }),
    });
    expect(result).toEqual({ authorized: false });
  });

  it("denies unavailable capability storage and an unset deployment environment", async () => {
    const unavailable = await authorize({
      findCapability: async () => {
        throw new Error("storage unavailable");
      },
    });
    expect(unavailable.result).toEqual({ authorized: false });

    const unsetEnvironment = await authorize({ environment: "" });
    expect(unsetEnvironment.result).toEqual({ authorized: false });
  });
});
