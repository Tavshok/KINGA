import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertIsolatedTestDatabaseUrl } from "../shared/ci-test-database-policy";

const localUrlPath = "/home/ubuntu/.kinga-ci-test-db/test-database-url";
const configuredUrl =
  process.env.KINGA_CI_DATABASE_URL ??
  (existsSync(localUrlPath)
    ? readFileSync(localUrlPath, "utf8").trim()
    : undefined);
const databaseUrl = assertIsolatedTestDatabaseUrl(configuredUrl);
const requestedPatterns = process.argv
  .slice(2)
  .filter(argument => argument !== "--");
const vitest = resolve("node_modules/vitest/vitest.mjs");

const result = spawnSync(
  process.execPath,
  [vitest, "run", ...requestedPatterns],
  {
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" },
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
