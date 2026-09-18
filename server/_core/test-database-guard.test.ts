import { describe, expect, it } from "vitest";
import {
  assertIsolatedTestDatabaseUrl,
  assertTestDatabasePoolTarget,
} from "./test-database-guard";

describe("isolated CI database guard", () => {
  const validUrl =
    "mysql://kinga_ci_runner:opaque-password@127.0.0.1:33306/kinga_ci_test";

  it("accepts only the dedicated loopback database", () => {
    expect(assertIsolatedTestDatabaseUrl(validUrl)).toBe(validUrl);
  });

  it.each([
    undefined,
    "not-a-url",
    "mysql://runner:password@live.example.test:4000/kinga",
    "mysql://runner:password@localhost:33306/kinga_ci_test",
    "mysql://runner:password@[::1]:33306/kinga_ci_test",
    "mysql://runner:password@127.0.0.1:3306/kinga_ci_test",
    "mysql://runner:password@127.0.0.1/kinga_ci_test",
    "mysql://runner:password@127.0.0.1:33307/kinga_ci_test",
    "mysql://runner:password@127.0.0.1:33306/different_database",
    "postgres://runner:password@127.0.0.1:33306/kinga_ci_test",
    "mysql://runner:password@127.1:33306/kinga_ci_test",
    "mysql://runner:password@2130706433:33306/kinga_ci_test",
    "mysql://runner:password@127.0.0.1:033306/kinga_ci_test",
    "mysql://runner:password@127.0.0.1:33306/kinga%5Fci%5Ftest",
    "mysql://runner:password@127.0.0.1:33306/kinga_ci_test?host=live.example.test",
    "mysql://runner:password@127.0.0.1:33306/kinga_ci_test?port=3306",
    "mysql://runner:password@127.0.0.1:33306/kinga_ci_test?database=kinga",
    "mysql://runner:password@127.0.0.1:33306/kinga_ci_test?socketPath=%2Ftmp%2Funsafe.sock",
    "mysql://runner:password@127.0.0.1:33306/kinga_ci_test#override",
  ])("rejects an unsafe or absent test database target", unsafeUrl => {
    expect(() => assertIsolatedTestDatabaseUrl(unsafeUrl)).toThrow(
      "Refusing to run tests"
    );
  });

  it("enforces the same boundary when a Vitest process creates a database pool", () => {
    expect(() => assertTestDatabasePoolTarget(validUrl)).not.toThrow();
    expect(() =>
      assertTestDatabasePoolTarget(
        "mysql://runner:password@live.example.test:4000/kinga"
      )
    ).toThrow("Refusing to run tests");
  });
});
