import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertIsolatedTestDatabaseUrl } from "../../shared/ci-test-database-policy.ts";

const databaseUrl = assertIsolatedTestDatabaseUrl(
  process.env.KINGA_CI_DATABASE_URL
);
const parsed = new URL(databaseUrl);
const schemaPath = resolve("ci/schema/kinga-ci-mariadb-schema.sql");
const mysqlClient = process.env.MYSQL_CLIENT_BIN ?? "mysql";
const rootPassword = process.env.KINGA_CI_ROOT_PASSWORD;

if (!existsSync(schemaPath)) {
  throw new Error(`Missing disposable CI schema snapshot: ${schemaPath}`);
}

const clientArgs = [
  `--host=${parsed.hostname}`,
  `--port=${parsed.port}`,
  `--user=${decodeURIComponent(parsed.username)}`,
  "--protocol=tcp",
  "kinga_ci_test",
];
const clientEnvironment = {
  ...process.env,
  MYSQL_PWD: decodeURIComponent(parsed.password),
};

function runClient(args, input) {
  const result = spawnSync(mysqlClient, [...clientArgs, ...args], {
    env: clientEnvironment,
    input,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Disposable CI database setup failed: ${result.stderr || result.stdout || "unknown mysql client error"}`
    );
  }
  return result.stdout;
}

// Match the local MariaDB compatibility settings used for the isolated suite.
// The root password exists only inside the ephemeral GitHub Actions service.
// This service has no route to the application database.
if (rootPassword === undefined) {
  throw new Error(
    "Disposable CI service configuration requires KINGA_CI_ROOT_PASSWORD."
  );
}
const rootResult = spawnSync(
  mysqlClient,
  [
    `--host=${parsed.hostname}`,
    `--port=${parsed.port}`,
    "--user=root",
    "--protocol=tcp",
    "--execute",
    "SET GLOBAL sql_mode = 'IGNORE_SPACE'; SET GLOBAL time_zone = '+00:00';",
  ],
  {
    env: { ...process.env, MYSQL_PWD: rootPassword },
    encoding: "utf8",
  }
);
if (rootResult.error) throw rootResult.error;
if (rootResult.status !== 0) {
  throw new Error(
    `Disposable CI service configuration failed: ${rootResult.stderr || rootResult.stdout || "unknown mysql client error"}`
  );
}

// The service creates the dedicated database before this script runs. Removing
// the snapshot's first CREATE DATABASE/USE pair avoids granting the test user
// global database-administration privileges.
const schemaSql = readFileSync(schemaPath, "utf8").replace(
  /^CREATE DATABASE `kinga_ci_test`;\nUSE `kinga_ci_test`;\n/u,
  ""
);
runClient([], schemaSql);

const verification = runClient([
  "--batch",
  "--skip-column-names",
  "--execute",
  "SELECT COUNT(*) AS table_count, @@global.sql_mode AS sql_mode, @@global.time_zone AS time_zone FROM information_schema.tables WHERE table_schema = 'kinga_ci_test' AND table_type = 'BASE TABLE';",
]).trim();

const [tableCountText, sqlMode, timeZone] = verification.split("\t");
const tableCount = Number(tableCountText);
if (!Number.isInteger(tableCount) || tableCount < 200) {
  throw new Error(
    `Disposable CI schema verification failed: expected at least 200 tables, received ${tableCountText || "none"}.`
  );
}
if (timeZone !== "+00:00") {
  throw new Error(
    `Disposable CI service must use UTC; received ${timeZone || "none"}.`
  );
}
if (!sqlMode.split(",").includes("IGNORE_SPACE")) {
  throw new Error(
    `Disposable CI service must enable IGNORE_SPACE; received ${sqlMode || "none"}.`
  );
}

console.log(
  JSON.stringify({
    provisioned: true,
    target: "kinga_ci_test",
    tableCount,
    sqlMode,
    timeZone,
  })
);
