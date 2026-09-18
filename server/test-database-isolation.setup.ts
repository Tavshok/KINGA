import { afterAll, vi } from "vitest";
import {
  assertIsolatedTestDatabaseUrl,
  assertTestDatabaseEnvironment,
} from "../shared/ci-test-database-policy";

/**
 * Normal test execution must fail before a test module can choose its own
 * database target. mysql2 accepts strings and option objects, including socket
 * paths. Direct clients accept only the exact shared URL string. The
 * application pool may pass its fixed non-target pool tuning options alongside
 * that exact URI; every target-setting field and unknown option is rejected.
 */
function guardMySqlFactoryInput(value: unknown): unknown {
  if (typeof value === "string") return assertIsolatedTestDatabaseUrl(value);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "Refusing to run tests against a non-dedicated database. MySQL test connections require the exact CI URL string."
    );
  }

  const config = value as Record<string, unknown>;
  const safePoolOptions = new Set([
    "uri",
    "connectionLimit",
    "waitForConnections",
    "queueLimit",
    "enableKeepAlive",
    "keepAliveInitialDelay",
    "connectTimeout",
    "multipleStatements",
    "idleTimeout",
  ]);

  if (Object.keys(config).some(key => !safePoolOptions.has(key))) {
    throw new Error(
      "Refusing to run tests against a non-dedicated database. MySQL test connections require the exact CI URL string."
    );
  }

  return {
    ...config,
    uri: assertIsolatedTestDatabaseUrl(config.uri as string | undefined),
  };
}

function guardPromiseModule<T extends Record<string, unknown>>(actual: T): T {
  const originalDefault = actual.default as Record<string, unknown>;
  const guardedDefault = Object.create(originalDefault) as Record<
    string,
    unknown
  >;

  for (const method of [
    "createConnection",
    "createPool",
    "createPoolCluster",
  ] as const) {
    const originalFactory = originalDefault[method];
    if (typeof originalFactory !== "function") continue;
    if (method === "createPoolCluster") {
      guardedDefault[method] = () => {
        throw new Error(
          "MySQL pool clusters are disabled during tests; use the dedicated CI database pool instead."
        );
      };
      continue;
    }
    guardedDefault[method] = (value: unknown) =>
      originalFactory.call(originalDefault, guardMySqlFactoryInput(value));
  }

  const guarded = { ...actual, default: guardedDefault } as Record<
    string,
    unknown
  >;
  for (const method of [
    "createConnection",
    "createPool",
    "createPoolCluster",
  ] as const) {
    const originalFactory = actual[method];
    if (typeof originalFactory !== "function") continue;
    if (method === "createPoolCluster") {
      guarded[method] = () => {
        throw new Error(
          "MySQL pool clusters are disabled during tests; use the dedicated CI database pool instead."
        );
      };
      continue;
    }
    guarded[method] = (value: unknown) =>
      originalFactory.call(actual, guardMySqlFactoryInput(value));
  }

  return guarded as T;
}

// This preflight runs before test modules. The module mocks then guard tests
// that construct mysql2 clients directly instead of using server/db.ts.
assertTestDatabaseEnvironment();

vi.mock("mysql2/promise", async importOriginal => {
  const actual = await importOriginal<typeof import("mysql2/promise")>();
  return guardPromiseModule(actual);
});

vi.mock("mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("mysql2")>();
  return guardPromiseModule(actual);
});

afterAll(async () => {
  const { closeDbPool } = await vi.importActual<typeof import("./db")>("./db");
  if (typeof closeDbPool === "function") {
    await closeDbPool();
  }
});
