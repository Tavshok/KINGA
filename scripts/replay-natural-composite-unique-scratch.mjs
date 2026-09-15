#!/usr/bin/env node
/**
 * Local-only proof for the approved natural/composite unique constraints.
 * It composes the retained 188-table Gate C/D baseline into an empty loopback
 * scratch database, applies the four-statement source-derived transition, and
 * proves positive and negative pair semantics. It never creates or selects a
 * non-loopback target and never reads DATABASE_URL.
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
  { wave: "D-01", markers: 10, statements: 11, path: "/home/ubuntu/kinga-replit-d05-packet/audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql" },
  { wave: "D-02", markers: 86, statements: 87, path: "/home/ubuntu/kinga-replit-d05-packet/audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql" },
  { wave: "D-03", markers: 187, statements: 187, path: "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-d03-tidb-compatible-source-2026-09-14.sql" },
  { wave: "D-04", markers: 134, statements: 134, path: "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql" },
  { wave: "D-05", markers: 290, statements: 290, path: "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql" },
];

function option(name) {
  const position = process.argv.indexOf(name);
  return position === -1 ? undefined : process.argv[position + 1];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function redact(url) {
  return `mysql://${url.hostname}:${url.port || "3306"}/${url.pathname.replace(/^\//, "")}`;
}

function splitStatements(sql, expectedMarkers, expectedStatements, label) {
  const markerCount = sql.split(marker).length - 1;
  if (markerCount !== expectedMarkers) throw new Error(`${label} marker count ${markerCount} did not match expected ${expectedMarkers}.`);
  const fragments = sql.split(marker).map((fragment) => fragment.trim()).filter(Boolean);
  if (fragments.length !== expectedStatements) throw new Error(`${label} yielded ${fragments.length} executable fragments rather than ${expectedStatements}.`);
  return fragments;
}

function expectedTables(statements) {
  const tables = new Set();
  for (const statement of statements) {
    const match = statement.match(/^CREATE TABLE\s+`([^`]+)`/i);
    if (match) tables.add(match[1]);
  }
  return [...tables].sort();
}

async function expectDuplicate(label, fn) {
  try {
    await fn();
  } catch (error) {
    const code = error?.code ?? "";
    const errno = Number(error?.errno ?? 0);
    if (code === "ER_DUP_ENTRY" || errno === 1062) return { label, rejected: true, code: code || "ER_DUP_ENTRY" };
    throw new Error(`${label} failed with unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(`${label} duplicate pair was accepted.`);
}

function assertIndex(indexRows, table, index, columns, unique = true) {
  const rows = indexRows.filter((row) => row.tableName === table && row.indexName === index);
  if (rows.length !== columns.length) throw new Error(`${table}.${index} has ${rows.length} metadata rows; expected ${columns.length}.`);
  if (rows.some((row) => Number(row.nonUnique) !== (unique ? 0 : 1))) throw new Error(`${table}.${index} uniqueness metadata mismatch.`);
  const actual = rows.sort((a, b) => Number(a.sequence) - Number(b.sequence)).map((row) => row.columnName);
  if (JSON.stringify(actual) !== JSON.stringify(columns)) throw new Error(`${table}.${index} columns ${actual.join(",")} did not match ${columns.join(",")}.`);
}

const databaseUrlText = option("--database-url");
const evidenceDirInput = option("--evidence-dir");
if (!databaseUrlText || !evidenceDirInput) throw new Error("Usage: --database-url mysql://... --evidence-dir /absolute/path");
const target = new URL(databaseUrlText);
const databaseName = target.pathname.replace(/^\//, "");
if (target.protocol !== "mysql:" || !allowedHosts.has(target.hostname)) throw new Error("Scratch proof accepts only mysql:// loopback targets.");
if (!/^kinga_natural_unique_[a-z0-9_]+$/.test(databaseName)) throw new Error(`Scratch database ${databaseName} lacks the required kinga_natural_unique_ prefix.`);
const evidenceDir = resolve(evidenceDirInput);
if (!evidenceDir.startsWith(`${root}/`)) throw new Error("Evidence directory must be inside this repository.");

const migrationPath = resolve(root, "audit/natural-composite-unique-2026-09-15/natural-composite-unique-constraints.sql");
const [migrationSql, ...sourceSql] = await Promise.all([readFile(migrationPath, "utf8"), ...sourceSpecs.map((spec) => readFile(spec.path, "utf8"))]);
const baselineStatements = sourceSql.flatMap((sql, index) => splitStatements(sql, sourceSpecs[index].markers, sourceSpecs[index].statements, sourceSpecs[index].wave));
const migrationStatements = migrationSql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean).map((statement) => `${statement};`);
if (migrationStatements.length !== 4) throw new Error(`Expected 4 unique-constraint transition statements; found ${migrationStatements.length}.`);
const expected = expectedTables(baselineStatements);
if (expected.length !== 188) throw new Error(`Composed baseline declares ${expected.length} tables; expected 188.`);

const connection = await mysql.createConnection(databaseUrlText);
try {
  const [existing] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
  if (existing.length) throw new Error(`Scratch target ${databaseName} is not empty.`);

  for (const [ordinal, statement] of baselineStatements.entries()) {
    try {
      await connection.query(statement);
    } catch (error) {
      throw new Error(`Baseline statement ${ordinal + 1}/${baselineStatements.length} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const [ordinal, statement] of migrationStatements.entries()) {
    try {
      await connection.query(statement);
    } catch (error) {
      throw new Error(`Unique-transition statement ${ordinal + 1}/4 failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const [tables] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
  const actualTables = tables.map((row) => row.tableName).sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(expected)) throw new Error("Final scratch table set differs from the 188-table baseline.");

  const [indexes] = await connection.query("SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequence, column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index");
  assertIndex(indexes, "assessor_insurer_relationships", "uq_assessor_insurer_relationship", ["assessor_id", "tenant_id"]);
  assertIndex(indexes, "policy_claim_links", "uq_policy_claim_link", ["policy_id", "claim_id"]);
  assertIndex(indexes, "fleet_drivers", "uq_fleet_driver_membership", ["fleet_id", "user_id"]);
  if (indexes.some((row) => row.tableName === "assessor_insurer_relationships" && row.indexName === "unique_assessor_tenant")) throw new Error("Superseded assessor index still exists in scratch metadata.");
  if (indexes.some((row) => row.tableName === "entity_relationships" && row.indexName !== "PRIMARY" && Number(row.nonUnique) === 0)) throw new Error("entity_relationships unexpectedly acquired a secondary unique index.");

  await connection.query("INSERT INTO assessor_insurer_relationships (assessor_id, tenant_id, relationship_type, contract_start_date) VALUES (101, 'insurer-a', 'insurer_owned', '2026-09-15 00:00:00')");
  const assessorDuplicate = await expectDuplicate("assessor/insurer duplicate", () => connection.query("INSERT INTO assessor_insurer_relationships (assessor_id, tenant_id, relationship_type, contract_start_date) VALUES (101, 'insurer-a', 'marketplace_contract', '2026-09-16 00:00:00')"));
  await connection.query("INSERT INTO assessor_insurer_relationships (assessor_id, tenant_id, relationship_type, contract_start_date) VALUES (102, 'insurer-a', 'insurer_owned', '2026-09-15 00:00:00')");
  await connection.query("INSERT INTO assessor_insurer_relationships (assessor_id, tenant_id, relationship_type, contract_start_date) VALUES (101, 'insurer-b', 'insurer_owned', '2026-09-15 00:00:00')");

  const [claimResult] = await connection.query("INSERT INTO claims (claim_number) VALUES ('NU-CLAIM-001')");
  const claimId = Number(claimResult.insertId);
  await connection.query("INSERT INTO policy_claim_links (policy_id, claim_id) VALUES (501, ?)", [claimId]);
  const policyDuplicate = await expectDuplicate("policy/claim duplicate", () => connection.query("INSERT INTO policy_claim_links (policy_id, claim_id) VALUES (501, ?)", [claimId]));
  await connection.query("INSERT INTO policy_claim_links (policy_id, claim_id) VALUES (502, ?)", [claimId]);
  const [secondClaimResult] = await connection.query("INSERT INTO claims (claim_number) VALUES ('NU-CLAIM-002')");
  await connection.query("INSERT INTO policy_claim_links (policy_id, claim_id) VALUES (501, ?)", [Number(secondClaimResult.insertId)]);

  await connection.query("INSERT INTO fleet_drivers (fleet_id, tenant_id, user_id, driver_license_number, license_expiry, hire_date) VALUES (701, 'fleet-tenant-a', 801, 'LIC-801', '2028-01-01', '2026-01-01')");
  const fleetDuplicate = await expectDuplicate("fleet/driver duplicate", () => connection.query("INSERT INTO fleet_drivers (fleet_id, tenant_id, user_id, driver_license_number, license_expiry, hire_date) VALUES (701, 'fleet-tenant-a', 801, 'LIC-801B', '2028-01-01', '2026-02-01')"));
  await connection.query("INSERT INTO fleet_drivers (fleet_id, tenant_id, user_id, driver_license_number, license_expiry, hire_date) VALUES (702, 'fleet-tenant-a', 801, 'LIC-801C', '2028-01-01', '2026-03-01')");
  await connection.query("INSERT INTO fleet_drivers (fleet_id, tenant_id, user_id, driver_license_number, license_expiry, hire_date) VALUES (701, 'fleet-tenant-a', 802, 'LIC-802', '2028-01-01', '2026-03-01')");

  await mkdir(evidenceDir, { recursive: true });
  const report = {
    scope: "Loopback-only 188-table replay plus approved natural/composite unique transition",
    target: redact(target),
    baselineStatementCount: baselineStatements.length,
    baselineTableCount: actualTables.length,
    baselineTableSetSha256: sha256(actualTables.join("\n")),
    sourceInputs: sourceSpecs.map((spec, index) => ({ wave: spec.wave, path: spec.path, sha256: sha256(sourceSql[index]), markerCount: spec.markers, executableStatementCount: spec.statements })),
    migrationSqlSha256: sha256(migrationSql),
    migrationStatementCount: migrationStatements.length,
    expectedUniqueIndexes: [
      { table: "assessor_insurer_relationships", index: "uq_assessor_insurer_relationship", columns: ["assessor_id", "tenant_id"] },
      { table: "policy_claim_links", index: "uq_policy_claim_link", columns: ["policy_id", "claim_id"] },
      { table: "fleet_drivers", index: "uq_fleet_driver_membership", columns: ["fleet_id", "user_id"] },
    ],
    duplicateRejections: [assessorDuplicate, policyDuplicate, fleetDuplicate],
    distinctPairAcceptance: ["one insurer / multiple assessors", "one assessor / multiple insurers", "one claim / multiple policies", "one policy / multiple claims", "one driver / multiple fleets", "one fleet / multiple drivers"],
    entityRelationshipUniqueConstraint: "not added; entity_relationships is outside the approved 188-table scratch baseline and is guarded at source level as unique-index-free",
    status: "passed",
  };
  await writeFile(resolve(evidenceDir, "scratch-replay.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(evidenceDir, "index-metadata.json"), `${JSON.stringify(indexes, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  await connection.end();
}
