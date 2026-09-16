#!/usr/bin/env node
/**
 * Loopback-only Package A proof. It rebuilds the closed 188-table baseline,
 * applies the already closed NCU-01 transition, then applies Package A's four
 * additive statements. It rejects all non-loopback targets and performs no
 * implicit cleanup so the caller can inspect and explicitly dispose of each
 * named scratch database after a successful run.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const marker = "--> statement-breakpoint";
const sourceSpecs = [
  { wave: "D-01", markers: 10, statements: 11, path: resolve(root, "audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql") },
  { wave: "D-02", markers: 86, statements: 87, path: resolve(root, "audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql") },
  { wave: "D-03", markers: 187, statements: 187, path: resolve(root, "audit/gate-d-d03-tidb-compatible-source-2026-09-14.sql") },
  { wave: "D-04", markers: 134, statements: 134, path: resolve(root, "audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql") },
  { wave: "D-05", markers: 290, statements: 290, path: resolve(root, "audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql") },
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const statementsFromSemicolonSql = (sql) => sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean).map((statement) => `${statement};`);
function splitStatements(sql, expectedMarkers, expectedStatements, label) {
  const markerCount = sql.split(marker).length - 1;
  if (markerCount !== expectedMarkers) throw new Error(`${label} marker count ${markerCount} did not match expected ${expectedMarkers}.`);
  const fragments = sql.split(marker).map((fragment) => fragment.trim()).filter(Boolean);
  if (fragments.length !== expectedStatements) throw new Error(`${label} yielded ${fragments.length} executable statements, expected ${expectedStatements}.`);
  return fragments;
}
function assertIndex(rows, table, index, columns) {
  const found = rows.filter((row) => row.tableName === table && row.indexName === index).sort((a, b) => Number(a.sequence) - Number(b.sequence));
  if (found.length !== columns.length) throw new Error(`${table}.${index} has ${found.length} metadata rows; expected ${columns.length}.`);
  if (found.some((row) => Number(row.nonUnique) !== 0)) throw new Error(`${table}.${index} is not unique.`);
  const actual = found.map((row) => row.columnName);
  if (JSON.stringify(actual) !== JSON.stringify(columns)) throw new Error(`${table}.${index} columns ${actual.join(",")} did not match ${columns.join(",")}.`);
}
async function expectDuplicate(label, action) {
  try {
    await action();
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY" || Number(error?.errno) === 1062) return { label, rejected: true, code: "ER_DUP_ENTRY" };
    throw error;
  }
  throw new Error(`${label} duplicate was accepted.`);
}

const databaseUrlText = option("--database-url");
const evidenceDirInput = option("--evidence-dir");
if (!databaseUrlText || !evidenceDirInput) throw new Error("Usage: --database-url mysql://... --evidence-dir /absolute/path");
const target = new URL(databaseUrlText);
const databaseName = target.pathname.replace(/^\//, "");
if (target.protocol !== "mysql:" || !allowedHosts.has(target.hostname)) throw new Error("Package A scratch proof accepts only mysql:// loopback targets.");
if (!/^kinga_workos_package_a_[a-z0-9_]+$/.test(databaseName)) throw new Error(`Scratch database ${databaseName} lacks the required kinga_workos_package_a_ prefix.`);
const evidenceDir = resolve(evidenceDirInput);
if (!evidenceDir.startsWith(`${root}/`)) throw new Error("Evidence directory must be inside the isolated Package A repository.");

const [packageSql, ncuSql, ...sourceSql] = await Promise.all([
  readFile(resolve(root, "audit/workos-package-a-2026-09-16/workos-package-a-additive-schema.sql"), "utf8"),
  readFile(resolve(root, "audit/natural-composite-unique-2026-09-15/natural-composite-unique-constraints.sql"), "utf8"),
  ...sourceSpecs.map((spec) => readFile(spec.path, "utf8")),
]);
const baselineStatements = sourceSql.flatMap((sql, index) => splitStatements(sql, sourceSpecs[index].markers, sourceSpecs[index].statements, sourceSpecs[index].wave));
const ncuStatements = statementsFromSemicolonSql(ncuSql);
const packageStatements = statementsFromSemicolonSql(packageSql);
if (ncuStatements.length !== 4 || packageStatements.length !== 4) throw new Error("Expected four NCU-01 and four Package A statements.");
const expectedTables = [...new Set(baselineStatements.map((statement) => statement.match(/^CREATE TABLE\s+`([^`]+)`/i)?.[1]).filter(Boolean))].sort();
if (expectedTables.length !== 188) throw new Error(`Baseline declares ${expectedTables.length} tables, expected 188.`);

const connection = await mysql.createConnection(databaseUrlText);
try {
  const [existing] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE()");
  if (existing.length) throw new Error(`Scratch target ${databaseName} is not empty.`);
  for (const statement of baselineStatements) await connection.query(statement);
  for (const statement of ncuStatements) await connection.query(statement);
  for (const statement of packageStatements) await connection.query(statement);

  const [tables] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
  const actualTables = tables.map((row) => row.tableName).sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
    const missing = expectedTables.filter((table) => !actualTables.includes(table));
    const unexpected = actualTables.filter((table) => !expectedTables.includes(table));
    throw new Error(`Package A table-set check failed: expected=${expectedTables.length}, actual=${actualTables.length}, missing=${missing.join(",") || "none"}, unexpected=${unexpected.join(",") || "none"}.`);
  }
  const [columns] = await connection.query("SELECT table_name AS tableName, column_name AS columnName, data_type AS dataType, character_maximum_length AS maximumLength, is_nullable AS isNullable FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'users' AND column_name = 'workos_user_id') OR (table_name = 'tenants' AND column_name = 'workos_organization_id')) ORDER BY table_name, column_name");
  const expectedColumns = [
    { tableName: "tenants", columnName: "workos_organization_id" },
    { tableName: "users", columnName: "workos_user_id" },
  ];
  if (columns.length !== expectedColumns.length) throw new Error(`Found ${columns.length} WorkOS columns, expected 2.`);
  for (const expected of expectedColumns) {
    const row = columns.find((column) => column.tableName === expected.tableName && column.columnName === expected.columnName);
    if (!row || row.dataType !== "varchar" || Number(row.maximumLength) !== 128 || row.isNullable !== "YES") throw new Error(`Column contract mismatch for ${expected.tableName}.${expected.columnName}.`);
  }
  const [indexes] = await connection.query("SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequence, column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index");
  assertIndex(indexes, "tenants", "tenants_workos_organization_id_unique", ["workos_organization_id"]);
  assertIndex(indexes, "users", "users_workos_user_id_unique", ["workos_user_id"]);

  await connection.query("INSERT INTO tenants (id, workos_organization_id, name, display_name, contact_email, billing_email) VALUES ('workos-tenant-a', 'org_01PACKAGEATEST', 'workos-a', 'WorkOS A', 'a@example.test', 'billing-a@example.test')");
  const tenantDuplicate = await expectDuplicate("WorkOS organization duplicate", () => connection.query("INSERT INTO tenants (id, workos_organization_id, name, display_name, contact_email, billing_email) VALUES ('workos-tenant-b', 'org_01PACKAGEATEST', 'workos-b', 'WorkOS B', 'b@example.test', 'billing-b@example.test')"));
  await connection.query("INSERT INTO tenants (id, name, display_name, contact_email, billing_email) VALUES ('workos-tenant-null', 'workos-null', 'WorkOS Null', 'null@example.test', 'billing-null@example.test')");
  await connection.query("INSERT INTO users (openId, workos_user_id, email) VALUES ('package-a-open-1', 'user_01PACKAGEATEST', 'one@example.test')");
  const userDuplicate = await expectDuplicate("WorkOS user duplicate", () => connection.query("INSERT INTO users (openId, workos_user_id, email) VALUES ('package-a-open-2', 'user_01PACKAGEATEST', 'two@example.test')"));
  await connection.query("INSERT INTO users (openId, email) VALUES ('package-a-open-null', 'null@example.test')");

  await mkdir(evidenceDir, { recursive: true });
  const report = {
    scope: "Loopback-only Package A 188-table plus NCU-01 replay",
    target: `mysql://${target.hostname}:${target.port || "3306"}/${databaseName}`,
    baselineTableCount: actualTables.length,
    baselineTableSetSha256: sha256(actualTables.join("\n")),
    baselineStatementCount: baselineStatements.length,
    ncuMigrationSqlSha256: sha256(ncuSql),
    packageMigrationSqlSha256: sha256(packageSql),
    packageStatementCount: packageStatements.length,
    verifiedColumns: columns,
    verifiedIndexes: [
      { table: "tenants", index: "tenants_workos_organization_id_unique", columns: ["workos_organization_id"] },
      { table: "users", index: "users_workos_user_id_unique", columns: ["workos_user_id"] },
    ],
    duplicateRejections: [tenantDuplicate, userDuplicate],
    nullableAcceptance: ["tenant without workos_organization_id", "user without workos_user_id"],
    status: "passed",
  };
  await writeFile(resolve(evidenceDir, "scratch-replay.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  await connection.end();
}
