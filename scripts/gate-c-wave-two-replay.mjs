#!/usr/bin/env node

/**
 * Gate C Wave 2 scratch-only replay runner.
 *
 * It will connect only to a fresh loopback `kinga_gatec_*` database supplied
 * explicitly by the caller. It never reads DATABASE_URL or staging/production
 * configuration and permits only the 20 reviewed tables, CREATE indexes, and
 * source-declared foreign-key additions.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { validateWaveOneSql } from "./gate-c-wave-one-replay.mjs";

const REQUIRED_TABLES = [
  "claim_assignments", "claim_documents", "claims", "drivers", "inspections",
  "insurance_audit_logs", "insurance_carriers", "insurance_policies", "insurance_products", "insurance_quotes",
  "measurement_types", "vehicle_condition_assessment", "vehicle_condition_snapshots", "vehicle_damage_history",
  "vehicle_geometry_measurements", "vehicle_market_valuations", "vehicle_mileage_logs", "vehicle_models",
  "vehicle_passport_snapshots", "vehicle_registry",
].sort();
const WAVE_ONE_PREREQUISITES = new Set(["tenant_invitations", "tenants", "users"]);
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function validateWaveOnePrerequisiteSql(sql) {
  const statements = validateWaveOneSql(sql);
  const tableNames = [...sql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi)].map((match) => match[1]).sort();
  const expectedTableNames = [...WAVE_ONE_PREREQUISITES].sort();
  if (JSON.stringify(tableNames) !== JSON.stringify(expectedTableNames)) {
    throw new Error("Gate C Wave 2 prerequisite SQL differs from the reviewed Wave 1 table set.");
  }
  return statements;
}

export function validateScratchTarget(databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.protocol !== "mysql:") throw new Error("Gate C Wave 2 accepts only mysql:// scratch URLs.");
  if (!ALLOWED_HOSTS.has(target.hostname)) throw new Error("Gate C Wave 2 rejects non-loopback database targets.");
  const database = target.pathname.replace(/^\//, "");
  if (!/^kinga_gatec_[a-z0-9_]+$/i.test(database)) {
    throw new Error("Gate C Wave 2 requires a uniquely named kinga_gatec_* database.");
  }
  return { database, host: target.hostname, port: target.port || "3306" };
}

export function validateWaveTwoSql(sql) {
  const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
  if (statements.length === 0) throw new Error("Gate C Wave 2 SQL contains no statements.");

  for (const statement of statements) {
    if (/^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\b/i.test(statement)) continue;
    const foreignKey = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY\s*\([^)]*\)\s+REFERENCES\s+`([^`]+)`\s*\([^)]*\)(?:\s+ON\s+DELETE\s+[A-Z ]+)?(?:\s+ON\s+UPDATE\s+[A-Z ]+)?;?$/is);
    if (!foreignKey) throw new Error(`Gate C Wave 2 permits only CREATE statements and reviewed foreign-key additions: ${statement.slice(0, 96)}`);
    const [, sourceTable, targetTable] = foreignKey;
    if (!REQUIRED_TABLES.includes(sourceTable) || (!REQUIRED_TABLES.includes(targetTable) && !WAVE_ONE_PREREQUISITES.has(targetTable))) {
      throw new Error(`Gate C Wave 2 foreign key references an unreviewed table: ${sourceTable} -> ${targetTable}.`);
    }
  }

  const createdTables = [...sql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi)].map((match) => match[1]).sort();
  if (JSON.stringify(createdTables) !== JSON.stringify(REQUIRED_TABLES)) {
    throw new Error(`Gate C Wave 2 SQL table set differs from the reviewed plan: ${createdTables.join(", ")}.`);
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
  const prerequisiteSqlPath = option("--prerequisite-sql");
  const evidenceDir = option("--evidence-dir");
  if (!databaseUrl || !sqlPath || !prerequisiteSqlPath || !evidenceDir) {
    throw new Error("Usage: --database-url mysql://... --prerequisite-sql /absolute/wave-1.sql --sql /absolute/wave-2.sql --evidence-dir /absolute/path");
  }

  const target = validateScratchTarget(databaseUrl);
  const prerequisiteSql = await readFile(resolve(prerequisiteSqlPath), "utf8");
  const sql = await readFile(resolve(sqlPath), "utf8");
  const prerequisiteStatements = validateWaveOnePrerequisiteSql(prerequisiteSql);
  const statements = validateWaveTwoSql(sql);
  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [existing] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    if (existing.length > 0) throw new Error("Gate C Wave 2 requires an empty scratch database.");

    const replayStatements = [
      ...prerequisiteStatements.map((statement) => ({ wave: "Wave 1 prerequisite", statement })),
      ...statements.map((statement) => ({ wave: "Wave 2", statement })),
    ];
    for (const [index, { wave, statement }] of replayStatements.entries()) {
      try {
        await connection.query(statement);
      } catch (error) {
        const summary = statement.replace(/\s+/g, " ").slice(0, 240);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Gate C ${wave} statement ${index + 1}/${replayStatements.length} failed: ${summary}\n${message}`);
      }
    }

    const [tables] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    const [constraints] = await connection.query("SELECT table_name AS tableName, constraint_name AS constraintName, constraint_type AS constraintType FROM information_schema.table_constraints WHERE table_schema = DATABASE() ORDER BY table_name, constraint_name");
    const [indexes] = await connection.query("SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequence, column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index");
    const tableNames = tables.map((row) => String(row.tableName)).sort();
    const expectedTableNames = [...WAVE_ONE_PREREQUISITES, ...REQUIRED_TABLES].sort();
    if (JSON.stringify(tableNames) !== JSON.stringify(expectedTableNames)) {
      throw new Error(`Gate C Wave 2 scratch metadata has an unexpected table set: ${tableNames.join(", ")}.`);
    }

    await mkdir(resolve(evidenceDir), { recursive: true });
    const metadata = { target, tables, constraints, indexes };
    const replay = {
      scope: "Gate C Wave 2 local scratch-only replay",
      target,
      prerequisiteStatementCount: prerequisiteStatements.length,
      statementCount: replayStatements.length,
      prerequisiteSqlSha256: sha256(prerequisiteSql),
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
