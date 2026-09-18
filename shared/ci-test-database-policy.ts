/**
 * The only database target permitted for automated KINGA tests.
 *
 * Validate the raw URL before a MySQL client sees it. mysql2 accepts URI query
 * parameters as connection options, so parsed hostname/port checks alone are
 * insufficient: a query such as `?host=...` could otherwise redirect a client.
 */
const EXACT_CI_DATABASE_URL =
  /^mysql:\/\/[^/?#\s]+@127\.0\.0\.1:33306\/kinga_ci_test$/u;

export function assertIsolatedTestDatabaseUrl(
  databaseUrl: string | undefined
): string {
  if (!databaseUrl) {
    throw new Error(
      "Refusing to run tests without KINGA_CI_DATABASE_URL. Configure a disposable loopback database first."
    );
  }

  if (!EXACT_CI_DATABASE_URL.test(databaseUrl)) {
    throw new Error(
      "Refusing to run tests against a non-dedicated database. Use mysql://…@127.0.0.1:33306/kinga_ci_test."
    );
  }

  // Retain semantic checks alongside the raw lexical boundary. The raw check
  // forbids aliases, search/hash strings, encoded path variants, and mysql2
  // connection-option overrides; these checks protect future regex changes.
  const parsed = new URL(databaseUrl);
  if (
    parsed.protocol !== "mysql:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "33306" ||
    parsed.pathname !== "/kinga_ci_test" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "Refusing to run tests against a non-dedicated database. Use mysql://…@127.0.0.1:33306/kinga_ci_test."
    );
  }

  return databaseUrl;
}

/**
 * Direct Vitest callers bypass package scripts, so pool construction repeats
 * the same test-only policy whenever Vitest has established test mode.
 */
export function assertTestDatabasePoolTarget(
  databaseUrl: string | undefined
): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    assertIsolatedTestDatabaseUrl(databaseUrl);
  }
}

/** Runs before every normal or integration Vitest test module is evaluated. */
export function assertTestDatabaseEnvironment(): void {
  assertIsolatedTestDatabaseUrl(process.env.DATABASE_URL);
}
