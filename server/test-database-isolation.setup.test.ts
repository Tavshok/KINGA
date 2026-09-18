import callbackMysql, {
  createConnection as createCallbackConnection,
  createPoolCluster as createCallbackPoolCluster,
} from "mysql2";
import mysql, {
  createConnection,
  createPool,
  createPoolCluster,
} from "mysql2/promise";
import { expect, test } from "vitest";

test("global setup blocks unsafe direct default mysql2 factories before connection", () => {
  expect(() =>
    mysql.createConnection(
      "mysql://runner:password@127.0.0.1:33306/kinga_ci_test?host=unsafe.example.test"
    )
  ).toThrow("Refusing to run tests against a non-dedicated database");
  expect(() =>
    mysql.createPool({ socketPath: "/tmp/unsafe.sock" } as never)
  ).toThrow("Refusing to run tests against a non-dedicated database");
});

test("global setup blocks unsafe direct named mysql2 factories before connection", () => {
  expect(() =>
    createConnection("mysql://runner:password@localhost:33306/kinga_ci_test")
  ).toThrow("Refusing to run tests against a non-dedicated database");
  expect(() =>
    createPool({
      uri: "mysql://runner:password@127.0.0.1:33306/kinga_ci_test",
      socketPath: "/tmp/unsafe.sock",
    } as never)
  ).toThrow("Refusing to run tests against a non-dedicated database");
  expect(() => createConnection(undefined as never)).toThrow(
    "Refusing to run tests against a non-dedicated database"
  );
  expect(() => createPoolCluster()).toThrow(
    "MySQL pool clusters are disabled during tests"
  );
  expect(() => createCallbackPoolCluster()).toThrow(
    "MySQL pool clusters are disabled during tests"
  );
});

test("global setup blocks unsafe callback mysql2 factories before connection", () => {
  expect(() =>
    createCallbackConnection(
      "mysql://runner:password@127.0.0.1:33306/kinga_ci_test?database=kinga"
    )
  ).toThrow("Refusing to run tests against a non-dedicated database");
  expect(() =>
    callbackMysql.createPool({ host: "unsafe.example.test" } as never)
  ).toThrow("Refusing to run tests against a non-dedicated database");
  expect(() => callbackMysql.createPoolCluster()).toThrow(
    "MySQL pool clusters are disabled during tests"
  );
});

test("global setup allows the exact CI URL in direct connections and fixed pool options", async () => {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL!,
    connectionLimit: 1,
    waitForConnections: true,
  });
  try {
    const [rows] = await connection.query<{ database_name: string }[]>(
      "SELECT DATABASE() AS database_name"
    );
    expect(rows).toEqual([{ database_name: "kinga_ci_test" }]);

    const [poolRows] = await pool.query<{ database_name: string }[]>(
      "SELECT DATABASE() AS database_name"
    );
    expect(poolRows).toEqual([{ database_name: "kinga_ci_test" }]);
  } finally {
    await connection.end();
    await pool.end();
  }
});
