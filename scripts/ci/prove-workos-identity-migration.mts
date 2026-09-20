import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import mysql from "mysql2/promise";

import { assertIsolatedTestDatabaseUrl } from "../../shared/ci-test-database-policy";

const databaseUrl = assertIsolatedTestDatabaseUrl(
  process.env.KINGA_CI_DATABASE_URL
);
const migrationPath = resolve(
  process.cwd(),
  "drizzle/0063_workos_identity_mappings.sql"
);
const migrationSql = await readFile(migrationPath, "utf8");
const statements = migrationSql
  .split("--> statement-breakpoint")
  .map(statement => statement.trim())
  .filter(Boolean);

if (statements.length !== 4) {
  throw new Error("Expected exactly four WorkOS identity mapping statements.");
}

const connection = await mysql.createConnection(databaseUrl);
const fixtureTenantPrefix = "workos-migration-proof-tenant-";
const fixtureUserPrefix = "workos-migration-proof-open-";

async function expectDuplicate(label: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) return;
    throw error;
  }
  throw new Error(`${label} duplicate was accepted.`);
}

try {
  await connection.query(
    "ALTER TABLE `users` DROP INDEX `users_workos_user_id_unique`"
  );
  await connection.query("ALTER TABLE `users` DROP COLUMN `workos_user_id`");
  await connection.query(
    "ALTER TABLE `tenants` DROP INDEX `tenants_workos_organization_id_unique`"
  );
  await connection.query(
    "ALTER TABLE `tenants` DROP COLUMN `workos_organization_id`"
  );

  for (const statement of statements) {
    await connection.query(statement);
  }

  const [columns] = await connection.query<
    Array<{
      tableName: string;
      columnName: string;
      dataType: string;
      maximumLength: number | null;
      isNullable: string;
    }>
  >(
    "SELECT table_name AS tableName, column_name AS columnName, data_type AS dataType, character_maximum_length AS maximumLength, is_nullable AS isNullable FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'tenants' AND column_name = 'workos_organization_id') OR (table_name = 'users' AND column_name = 'workos_user_id')) ORDER BY table_name, column_name"
  );
  expectColumn(columns, "tenants", "workos_organization_id");
  expectColumn(columns, "users", "workos_user_id");

  const [indexes] = await connection.query<
    Array<{
      tableName: string;
      indexName: string;
      nonUnique: number;
      columnName: string;
    }>
  >(
    "SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('tenants_workos_organization_id_unique', 'users_workos_user_id_unique') ORDER BY table_name, index_name"
  );
  expectIndex(
    indexes,
    "tenants",
    "tenants_workos_organization_id_unique",
    "workos_organization_id"
  );
  expectIndex(
    indexes,
    "users",
    "users_workos_user_id_unique",
    "workos_user_id"
  );

  await connection.query(
    "INSERT INTO tenants (id, name, display_name, contact_email, billing_email, workos_organization_id) VALUES (?, ?, ?, ?, ?, ?)",
    [
      `${fixtureTenantPrefix}one`,
      `${fixtureTenantPrefix}one`,
      "WorkOS proof one",
      "one@example.test",
      "billing-one@example.test",
      "org_workos_migration_proof",
    ]
  );
  await expectDuplicate("tenant mapping", () =>
    connection.query(
      "INSERT INTO tenants (id, name, display_name, contact_email, billing_email, workos_organization_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        `${fixtureTenantPrefix}two`,
        `${fixtureTenantPrefix}two`,
        "WorkOS proof two",
        "two@example.test",
        "billing-two@example.test",
        "org_workos_migration_proof",
      ]
    )
  );
  await connection.query(
    "INSERT INTO tenants (id, name, display_name, contact_email, billing_email) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
    [
      `${fixtureTenantPrefix}null-one`,
      `${fixtureTenantPrefix}null-one`,
      "WorkOS null one",
      "null-one@example.test",
      "billing-null-one@example.test",
      `${fixtureTenantPrefix}null-two`,
      `${fixtureTenantPrefix}null-two`,
      "WorkOS null two",
      "null-two@example.test",
      "billing-null-two@example.test",
    ]
  );

  await connection.query(
    "INSERT INTO users (openId, email, workos_user_id) VALUES (?, ?, ?)",
    [
      `${fixtureUserPrefix}one`,
      "user-one@example.test",
      "user_workos_migration_proof",
    ]
  );
  await expectDuplicate("user mapping", () =>
    connection.query(
      "INSERT INTO users (openId, email, workos_user_id) VALUES (?, ?, ?)",
      [
        `${fixtureUserPrefix}two`,
        "user-two@example.test",
        "user_workos_migration_proof",
      ]
    )
  );
  await connection.query(
    "INSERT INTO users (openId, email) VALUES (?, ?), (?, ?)",
    [
      `${fixtureUserPrefix}null-one`,
      "user-null-one@example.test",
      `${fixtureUserPrefix}null-two`,
      "user-null-two@example.test",
    ]
  );

  console.log(
    JSON.stringify({
      status: "passed",
      migrationSha256: createHash("sha256").update(migrationSql).digest("hex"),
      statements: statements.length,
      duplicateNonNullValuesRejected: true,
      multipleNullValuesAccepted: true,
    })
  );
} finally {
  await connection.query("DELETE FROM users WHERE openId LIKE ?", [
    `${fixtureUserPrefix}%`,
  ]);
  await connection.query("DELETE FROM tenants WHERE id LIKE ?", [
    `${fixtureTenantPrefix}%`,
  ]);
  await connection.end();
}

function expectColumn(
  columns: Array<{
    tableName: string;
    columnName: string;
    dataType: string;
    maximumLength: number | null;
    isNullable: string;
  }>,
  tableName: string,
  columnName: string
) {
  const column = columns.find(
    candidate =>
      candidate.tableName === tableName && candidate.columnName === columnName
  );
  if (
    !column ||
    column.dataType !== "varchar" ||
    Number(column.maximumLength) !== 128 ||
    column.isNullable !== "YES"
  ) {
    throw new Error(`Unexpected ${tableName}.${columnName} column contract.`);
  }
}

function expectIndex(
  indexes: Array<{
    tableName: string;
    indexName: string;
    nonUnique: number;
    columnName: string;
  }>,
  tableName: string,
  indexName: string,
  columnName: string
) {
  const index = indexes.find(
    candidate =>
      candidate.tableName === tableName && candidate.indexName === indexName
  );
  if (
    !index ||
    Number(index.nonUnique) !== 0 ||
    index.columnName !== columnName
  ) {
    throw new Error(`Unexpected ${tableName}.${indexName} index contract.`);
  }
}
