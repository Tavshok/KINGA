/** Gate C final photo-reextraction supplemental composed replay; loopback scratch targets only. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { validateWaveOneSql } from "./gate-c-wave-one-replay.mjs";
import { validateWaveTwoSql } from "./gate-c-wave-two-replay.mjs";
import { validateWaveThreeSql } from "./gate-c-wave-three-contract.mjs";
import { validateWaveFourSql } from "./gate-c-wave-four-contract.mjs";
import { validateWaveFiveSql } from "./gate-c-wave-five-contract.mjs";
import { PRIOR_TABLES, SUPPLEMENT_TABLES, validatePhotoReextractionSupplementSql } from "./gate-c-photo-reextraction-supplement-contract.mjs";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
function option(name) { const position = process.argv.indexOf(name); return position === -1 ? undefined : process.argv[position + 1]; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function validateScratchTarget(databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.protocol !== "mysql:") throw new Error("Gate C photo-reextraction supplement accepts only mysql:// scratch URLs.");
  if (!ALLOWED_HOSTS.has(target.hostname)) throw new Error("Gate C photo-reextraction supplement rejects non-loopback database targets.");
  const database = target.pathname.replace(/^\//, "");
  if (!/^kinga_gatec_[a-z0-9_]+$/i.test(database)) throw new Error("Gate C photo-reextraction supplement requires a uniquely named kinga_gatec_* database.");
  return { database, host: target.hostname, port: target.port || "3306" };
}
function structuralFingerprint({ tables, constraints, indexes }) { return sha256(JSON.stringify({ tables, constraints, indexes })); }

async function main() {
  const databaseUrl = option("--database-url");
  const waveOnePath = option("--wave-one-sql");
  const waveTwoPath = option("--wave-two-sql");
  const waveThreePath = option("--wave-three-sql");
  const waveFourPath = option("--wave-four-sql");
  const waveFivePath = option("--wave-five-sql");
  const supplementPath = option("--supplement-sql");
  const evidenceDir = option("--evidence-dir");
  if (!databaseUrl || !waveOnePath || !waveTwoPath || !waveThreePath || !waveFourPath || !waveFivePath || !supplementPath || !evidenceDir) {
    throw new Error("Usage: --database-url mysql://... --wave-one-sql /absolute/wave-1.sql --wave-two-sql /absolute/wave-2.sql --wave-three-sql /absolute/wave-3.sql --wave-four-sql /absolute/wave-4.sql --wave-five-sql /absolute/wave-5.sql --supplement-sql /absolute/supplement.sql --evidence-dir /absolute/path");
  }
  const target = validateScratchTarget(databaseUrl);
  const [waveOneSql, waveTwoSql, waveThreeSql, waveFourSql, waveFiveSql, supplementSql] = await Promise.all(
    [waveOnePath, waveTwoPath, waveThreePath, waveFourPath, waveFivePath, supplementPath].map((filePath) => readFile(resolve(filePath), "utf8"))
  );
  const waveOne = validateWaveOneSql(waveOneSql);
  const waveTwo = validateWaveTwoSql(waveTwoSql);
  const waveThree = validateWaveThreeSql(waveThreeSql);
  const waveFour = validateWaveFourSql(waveFourSql);
  const waveFive = validateWaveFiveSql(waveFiveSql);
  const supplement = validatePhotoReextractionSupplementSql(supplementSql);
  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [existing] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    if (existing.length) throw new Error("Gate C final supplement requires an empty scratch database.");
    const replayStatements = [
      ...waveOne.map((statement) => ({ wave: "Wave 1 prerequisite", statement })),
      ...waveTwo.map((statement) => ({ wave: "Wave 2 prerequisite", statement })),
      ...waveThree.statements.map((statement) => ({ wave: "Wave 3 prerequisite", statement })),
      ...waveFour.statements.map((statement) => ({ wave: "Wave 4 prerequisite", statement })),
      ...waveFive.statements.map((statement) => ({ wave: "Wave 5 prerequisite", statement })),
      ...supplement.statements.map((statement) => ({ wave: "Photo re-extraction supplement", statement })),
    ];
    for (const [index, { wave, statement }] of replayStatements.entries()) {
      try { await connection.query(statement); }
      catch (error) { throw new Error(`Gate C ${wave} statement ${index + 1}/${replayStatements.length} failed: ${statement.replace(/\s+/g, " ").slice(0, 240)}\n${error instanceof Error ? error.message : String(error)}`); }
    }
    const [tables] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    const [constraints] = await connection.query("SELECT table_name AS tableName, constraint_name AS constraintName, constraint_type AS constraintType FROM information_schema.table_constraints WHERE table_schema = DATABASE() ORDER BY table_name, constraint_name");
    const [indexes] = await connection.query("SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequence, column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index");
    const tableNames = tables.map((row) => String(row.tableName)).sort();
    const expected = [...PRIOR_TABLES, ...SUPPLEMENT_TABLES].sort();
    if (JSON.stringify(tableNames) !== JSON.stringify(expected)) throw new Error(`Gate C final supplement scratch metadata has an unexpected table set: ${tableNames.join(", ")}.`);
    await mkdir(resolve(evidenceDir), { recursive: true });
    const metadata = { target, tables, constraints, indexes };
    const replay = {
      scope: "Gate C final photo-reextraction local loopback-only composed scratch replay", target,
      waveOneStatementCount: waveOne.length, waveTwoStatementCount: waveTwo.length, waveThreeStatementCount: waveThree.statements.length,
      waveFourStatementCount: waveFour.statements.length, waveFiveStatementCount: waveFive.statements.length, supplementStatementCount: supplement.statements.length,
      waveOneSqlSha256: sha256(waveOneSql), waveTwoSqlSha256: sha256(waveTwoSql), waveThreeSqlSha256: sha256(waveThreeSql),
      waveFourSqlSha256: sha256(waveFourSql), waveFiveSqlSha256: sha256(waveFiveSql), supplementSqlSha256: sha256(supplementSql),
      structuralMetadataSha256: structuralFingerprint(metadata), createdTableCount: tableNames.length, createdTableNames: tableNames, status: "passed",
    };
    await writeFile(resolve(evidenceDir, "replay.json"), `${JSON.stringify(replay, null, 2)}\n`);
    await writeFile(resolve(evidenceDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(resolve(evidenceDir, "supplement-sql.sha256"), `${replay.supplementSqlSha256}  ${resolve(supplementPath)}\n`);
    console.log(JSON.stringify(replay));
  } finally { await connection.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
