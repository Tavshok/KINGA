#!/usr/bin/env node

/**
 * Gate C Wave 1 scratch-only replay runner.
 *
 * It accepts only a fresh loopback MySQL/MariaDB database whose name starts
 * `kinga_gatec_`. It will never use DATABASE_URL or KINGA_STAGING_DATABASE_URL.
 * Generated SQL must contain only the three reviewed Wave 1 tables and CREATE
 * statements; no data query or external database is permitted.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const REQUIRED_TABLES = ["tenant_invitations", "tenants", "users"];
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function validateScratchTarget(databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.protocol !== "mysql:") {
    throw new Error("Gate C Wave 1 accepts only mysql:// scratch URLs.");
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error("Gate C Wave 1 rejects non-loopback database targets.");
  }
  const database = target.pathname.replace(/^\//, "");
  if (!/^kinga_gatec_[a-z0-9_]+$/i.test(database)) {
    throw new Error("Gate C Wave 1 requires a uniquely named kinga_gatec_* database.");
  }
  return { database, host: target.hostname, port: target.port || "3306" };
}

export function validateWaveOneSql(sql) {
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (statements.length === 0) {
    throw new Error("Gate C Wave 1 SQL contains no statements.");
  }
  for (const statement of statements) {
    if (!/^CREATE\s+(TABLE|INDEX)\b/i.test(statement)) {
      throw new Error("Gate C Wave 1 permits CREATE TABLE and CREATE INDEX statements only.");
    }
  }
  for (const table of REQUIRED_TABLES) {
    if (!new RegExp(`CREATE\\s+TABLE\\s+\\\`${table}\\\``, "i").test(sql)) {
      throw new Error(`Gate C Wave 1 SQL is missing required table ${table}.`);
    }
  }
  const createdTables = [...sql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi)].map((match) => match[1]);
  if (createdTables.length !== REQUIRED_TABLES.length || createdTables.some((table) => !REQUIRED_TABLES.includes(table))) {
    throw new Error("Gate C Wave 1 SQL contains an unexpected table.");
  }
  return statements;
}

function option(name) {
  const position = process.argv.indexOf(name);
  return position === -1 ? undefined : process.argv[position + 1];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function structuralMetadataFingerprint({ tables, constraints, indexes }) {
  return sha256(JSON.stringify({ tables, constraints, indexes }));
}

async function main() {
  const databaseUrl = option("--database-url");
  const sqlPath = option("--sql");
  const evidenceDir = option("--evidence-dir");
  if (!databaseUrl || !sqlPath || !evidenceDir) {
    throw new Error("Usage: --database-url mysql://... --sql /absolute/path.sql --evidence-dir /absolute/path");
  }

  const target = validateScratchTarget(databaseUrl);
  const sql = await readFile(resolve(sqlPath), "utf8");
  const statements = validateWaveOneSql(sql);
  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [existing] = await connection.query(
      "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
    );
    if (existing.length > 0) {
      throw new Error("Gate C Wave 1 requires an empty scratch database.");
    }

    for (const statement of statements) {
      await connection.query(statement);
    }

    const [tables] = await connection.query(
      "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
    );
    const [constraints] = await connection.query(
      "SELECT table_name AS tableName, constraint_name AS constraintName, constraint_type AS constraintType FROM information_schema.table_constraints WHERE table_schema = DATABASE() ORDER BY table_name, constraint_name",
    );
    const [indexes] = await connection.query(
      "SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequence, column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index",
    );
    const tableNames = tables.map((row) => String(row.tableName)).sort();
    const expectedTableNames = [...REQUIRED_TABLES].sort();
    if (JSON.stringify(tableNames) !== JSON.stringify(expectedTableNames)) {
      throw new Error(`Gate C Wave 1 scratch metadata contains an unexpected table set: ${tableNames.join(", ")}.`);
    }

    await mkdir(resolve(evidenceDir), { recursive: true });
    const metadata = { target, tables, constraints, indexes };
    const replay = {
      scope: "Gate C Wave 1 local scratch-only replay",
      target,
      statementCount: statements.length,
      sqlSha256: sha256(sql),
      structuralMetadataSha256: structuralMetadataFingerprint(metadata),
      createdTableCount: tableNames.length,
      createdTableNames: tableNames,
      status: "passed",
    };
    await writeFile(resolve(evidenceDir, "replay.json"), `${JSON.stringify(replay, null, 2)}\n`);
    await writeFile(resolve(evidenceDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(resolve(evidenceDir, "sql.sha256"), `${replay.sqlSha256}  ${resolve(sqlPath)}\n`);
    console.log(JSON.stringify(replay));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
