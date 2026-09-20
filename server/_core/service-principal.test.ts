import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type {
  ServiceCredentialRecord,
  ServiceCredentialStore,
} from "./service-credential-store";
import {
  authenticateServicePrincipal,
  parseServiceAuthorization,
  SCRYPT_V1_PARAMETERS,
} from "./service-principal";

const scrypt = promisify(nodeScrypt);
const environment = "ci-test";
const credentialId = "AbCdEf0123456789";
const secret = randomBytes(32).toString("base64url");
const bearer = `kng_st_${environment}_${credentialId}_${secret}`;

async function testRecord(
  overrides: Partial<ServiceCredentialRecord> = {}
): Promise<ServiceCredentialRecord> {
  const salt = randomBytes(16);
  const digest = (await scrypt(secret, salt, SCRYPT_V1_PARAMETERS.keyLength, {
    N: SCRYPT_V1_PARAMETERS.N,
    r: SCRYPT_V1_PARAMETERS.r,
    p: SCRYPT_V1_PARAMETERS.p,
    maxmem: SCRYPT_V1_PARAMETERS.maxmem,
  })) as Buffer;
  return {
    credentialId,
    safePrefix: `kng_st_${environment}_${credentialId}`,
    environment,
    principalName: "ci-intake-scheduler",
    capability: "scheduled:intake-escalation:run",
    verifierAlgorithm: "scrypt-v1",
    saltBase64: salt.toString("base64url"),
    verifierBase64: digest.toString("base64url"),
    lifecycleState: "active",
    notBefore: "2026-09-20T09:00:00.000Z",
    expiresAt: "2026-09-20T11:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

function storeFor(
  record: ServiceCredentialRecord | null
): ServiceCredentialStore {
  return { findByCredentialId: vi.fn(async () => record) };
}

async function authenticate(overrides: Record<string, unknown> = {}) {
  const record = await testRecord();
  return authenticateServicePrincipal({
    authorizationValues: [`Bearer ${bearer}`],
    expectedEnvironment: environment,
    requiredCapability: "scheduled:intake-escalation:run",
    store: storeFor(record),
    now: new Date("2026-09-20T10:00:00.000Z"),
    ...overrides,
  });
}

describe("G1 exact-one service bearer parser", () => {
  it("parses exactly one canonical bearer", () => {
    expect(parseServiceAuthorization([`Bearer ${bearer}`])).toEqual({
      environment,
      credentialId,
      secret,
      safePrefix: `kng_st_${environment}_${credentialId}`,
    });
  });

  it.each([
    { values: [] },
    { values: [`Bearer ${bearer}`, `Bearer ${bearer}`] },
    { values: [`Bearer ${bearer}, Bearer ${bearer}`] },
    { values: [`Basic ${bearer}`] },
    { values: [`Bearer  ${bearer}`] },
    { values: [`Bearer kng_st_${environment}_${credentialId}_short`] },
    { values: [`Bearer cron_${credentialId}_${secret}`] },
    { values: [`Bearer ${"x".repeat(513)}`] },
  ])(
    "denies missing, duplicate, combined, malformed, or oversized values",
    ({ values }) => {
      expect(parseServiceAuthorization(values)).toBeNull();
    }
  );
});

describe("G1 scrypt-v1 service-principal verification", () => {
  it("uses the reviewed fallback parameters and returns only a narrow non-human principal", async () => {
    expect(SCRYPT_V1_PARAMETERS).toEqual({
      N: 131_072,
      r: 8,
      p: 1,
      keyLength: 32,
      minimumSaltBytes: 16,
      maxmem: 268_435_456,
    });
    const result = await authenticate();
    expect(result).toEqual({
      ok: true,
      principal: {
        kind: "service-principal",
        principalName: "ci-intake-scheduler",
        credentialId,
        environment,
        capability: "scheduled:intake-escalation:run",
      },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("cookie");
    expect(JSON.stringify(result)).not.toContain("userId");
  });

  it.each([
    ["cookie", { signals: { hasCookie: true } }, "forbidden_context"],
    ["query", { signals: { hasQuery: true } }, "forbidden_context"],
    ["body", { signals: { hasBody: true } }, "forbidden_context"],
    ["human", { signals: { hasHumanContext: true } }, "forbidden_context"],
    ["cron", { signals: { hasCronContext: true } }, "forbidden_context"],
    ["SDK", { signals: { hasSdkContext: true } }, "forbidden_context"],
    [
      "wrong environment",
      { expectedEnvironment: "production" },
      "wrong_environment",
    ],
    [
      "wrong capability",
      { requiredCapability: "scheduled:stuck-recovery:run" },
      "wrong_capability",
    ],
  ])("denies %s context", async (_label, overrides, reason) => {
    await expect(authenticate(overrides)).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it.each([
    ["pending", { lifecycleState: "pending" as const }, "inactive_credential"],
    [
      "suspended",
      { lifecycleState: "suspended" as const },
      "inactive_credential",
    ],
    [
      "revoked",
      {
        lifecycleState: "revoked" as const,
        revokedAt: "2026-09-20T09:30:00.000Z",
      },
      "inactive_credential",
    ],
    ["not before", { notBefore: "2026-09-20T10:30:00.000Z" }, "not_yet_valid"],
    [
      "expired",
      { expiresAt: "2026-09-20T10:00:00.000Z" },
      "expired_credential",
    ],
    [
      "wrong algorithm",
      { verifierAlgorithm: "other" as "scrypt-v1" },
      "invalid_credential",
    ],
    [
      "short salt",
      { saltBase64: randomBytes(8).toString("base64url") },
      "invalid_credential",
    ],
  ])("denies %s credential state", async (_label, recordOverrides, reason) => {
    const record = await testRecord(recordOverrides);
    await expect(
      authenticateServicePrincipal({
        authorizationValues: [`Bearer ${bearer}`],
        expectedEnvironment: environment,
        requiredCapability: "scheduled:intake-escalation:run",
        store: storeFor(record),
        now: new Date("2026-09-20T10:00:00.000Z"),
      })
    ).resolves.toEqual({ ok: false, reason });
  });

  it("denies an incorrect secret without returning it", async () => {
    const wrongSecret = randomBytes(32).toString("base64url");
    const result = await authenticate({
      authorizationValues: [
        `Bearer kng_st_${environment}_${credentialId}_${wrongSecret}`,
      ],
    });
    expect(result).toEqual({ ok: false, reason: "invalid_credential" });
    expect(JSON.stringify(result)).not.toContain(wrongSecret);
  });

  it("fails closed when credential storage rejects", async () => {
    const result = await authenticateServicePrincipal({
      authorizationValues: [`Bearer ${bearer}`],
      expectedEnvironment: environment,
      requiredCapability: "scheduled:intake-escalation:run",
      store: {
        findByCredentialId: async () => {
          throw new Error("database timeout containing no credential value");
        },
      },
      now: new Date("2026-09-20T10:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "service_unavailable" });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("fails closed when persisted verifier access throws", async () => {
    const record = await testRecord();
    Object.defineProperty(record, "saltBase64", {
      get() {
        throw new Error("corrupt verifier metadata");
      },
    });
    const result = await authenticateServicePrincipal({
      authorizationValues: [`Bearer ${bearer}`],
      expectedEnvironment: environment,
      requiredCapability: "scheduled:intake-escalation:run",
      store: storeFor(record),
      now: new Date("2026-09-20T10:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "service_unavailable" });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
