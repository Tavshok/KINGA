#!/usr/bin/env node
/** Gate C Wave 3 loopback-only composed scratch replay runner. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { validateWaveOneSql } from "./gate-c-wave-one-replay.mjs";
import { validateWaveTwoSql } from "./gate-c-wave-two-replay.mjs";
import { PREREQUISITE_TABLES, WAVE_THREE_TABLES, validateWaveThreeSql } from "./gate-c-wave-three-contract.mjs";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
function option(name) { const position = process.argv.indexOf(name); return position === -1 ? undefined : process.argv[position + 1]; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function validateScratchTarget(databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.protocol !== "mysql:") throw new Error("Gate C Wave 3 accepts only mysql:// scratch URLs.");
  if (!ALLOWED_HOSTS.has(target.hostname)) throw new Error("Gate C Wave 3 rejects non-loopback database targets.");
  const database = target.pathname.replace(/^\//, "");
  if (!/^kinga_gatec_[a-z0-9_]+$/i.test(database)) throw new Error("Gate C Wave 3 requires a uniquely named kinga_gatec_* database.");
  return { database, host: target.hostname, port: target.port || "3306" };
}
export function structuralMetadataFingerprint({ tables, constraints, indexes }) { return sha256(JSON.stringify({ tables, constraints, indexes })); }

async function main() {
  const databaseUrl = option("--database-url");
  const waveOnePath = option("--wave-one-sql");
  const waveTwoPath = option("--wave-two-sql");
  const waveThreePath = option("--wave-three-sql");
  const evidenceDir = option("--evidence-dir");
  if (!databaseUrl || !waveOnePath || !waveTwoPath || !waveThreePath || !evidenceDir) throw new Error("Usage: --database-url mysql://... --wave-one-sql /absolute/wave-1.sql --wave-two-sql /absolute/wave-2.sql --wave-three-sql /absolute/wave-3.sql --evidence-dir /absolute/path");
  const target = validateScratchTarget(databaseUrl);
  const waveOneSql = await readFile(resolve(waveOnePath), "utf8");
  const waveTwoSql = await readFile(resolve(waveTwoPath), "utf8");
  const waveThreeSql = await readFile(resolve(waveThreePath), "utf8");
  const waveOneStatements = validateWaveOneSql(waveOneSql);
  const waveTwoStatements = validateWaveTwoSql(waveTwoSql);
  const waveThree = validateWaveThreeSql(waveThreeSql);
  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [existing] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    if (existing.length) throw new Error("Gate C Wave 3 requires an empty scratch database.");
    const replayStatements = [
      ...waveOneStatements.map((statement) => ({ wave: "Wave 1 prerequisite", statement })),
      ...waveTwoStatements.map((statement) => ({ wave: "Wave 2 prerequisite", statement })),
      ...waveThree.statements.map((statement) => ({ wave: "Wave 3", statement })),
    ];
    for (const [index, { wave, statement }] of replayStatements.entries()) {
      try { await connection.query(statement); }
      catch (error) { throw new Error(`Gate C ${wave} statement ${index + 1}/${replayStatements.length} failed: ${statement.replace(/\s+/g, " ").slice(0, 240)}\n${error instanceof Error ? error.message : String(error)}`); }
    }
    const [tables] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    const [constraints] = await connection.query("SELECT table_name AS tableName, constraint_name AS constraintName, constraint_type AS constraintType FROM information_schema.table_constraints WHERE table_schema = DATABASE() ORDER BY table_name, constraint_name");
    const [indexes] = await connection.query("SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequence, column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index");
    const tableNames = tables.map((row) => String(row.tableName)).sort();
    const expected = [...PREREQUISITE_TABLES, ...WAVE_THREE_TABLES].sort();
    if (JSON.stringify(tableNames) !== JSON.stringify(expected)) throw new Error(`Gate C Wave 3 scratch metadata has an unexpected table set: ${tableNames.join(", ")}.`);
    await mkdir(resolve(evidenceDir), { recursive: true });
    const metadata = { target, tables, constraints, indexes };
    const replay = {
      scope: "Gate C Wave 3 local loopback-only composed scratch replay",
      target,
      waveOneStatementCount: waveOneStatements.length,
      waveTwoStatementCount: waveTwoStatements.length,
      waveThreeStatementCount: waveThree.statements.length,
      waveOneSqlSha256: sha256(waveOneSql), waveTwoSqlSha256: sha256(waveTwoSql), waveThreeSqlSha256: sha256(waveThreeSql),
      structuralMetadataSha256: structuralMetadataFingerprint(metadata), createdTableCount: tableNames.length, createdTableNames: tableNames, status: "passed",
    };
    await writeFile(resolve(evidenceDir, "replay.json"), `${JSON.stringify(replay, null, 2)}\n`);
    await writeFile(resolve(evidenceDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(resolve(evidenceDir, "sql.sha256"), `${replay.waveThreeSqlSha256}  ${resolve(waveThreePath)}\n`);
    console.log(JSON.stringify(replay));
  } finally { await connection.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
