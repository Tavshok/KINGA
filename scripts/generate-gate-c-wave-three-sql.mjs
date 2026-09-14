/**
 * Selects the reviewed 50-table Wave 3 scratch SQL from a disposable
 * Drizzle-generated full source snapshot. It does not connect to a database or
 * invoke Drizzle itself; callers must pass a generated SQL file explicitly.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  WAVE_THREE_TABLES,
  createIndexTarget,
  createTableName,
  foreignKeyTables,
  normaliseWaveThreeForeignKeyName,
  splitStatements,
  validateWaveThreeSql,
} from "./gate-c-wave-three-contract.mjs";

function option(name) {
  const position = process.argv.indexOf(name);
  return position === -1 ? undefined : process.argv[position + 1];
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const sourcePath = option("--source-sql");
  const outputPath = option("--out");
  const evidencePath = option("--evidence");
  if (!sourcePath || !outputPath || !evidencePath) throw new Error("Usage: --source-sql /absolute/full-source.sql --out /absolute/wave-3.sql --evidence /absolute/generation.json");
  const source = await readFile(resolve(sourcePath), "utf8");
  const creates = [];
  const foreignKeys = [];
  const foreignKeyNameNormalisations = [];
  const indexes = [];
  for (const statement of splitStatements(source)) {
    const table = createTableName(statement);
    if (table) {
      if (WAVE_THREE_TABLES.includes(table)) creates.push(statement);
      continue;
    }
    const fk = foreignKeyTables(statement);
    if (fk) {
      if (WAVE_THREE_TABLES.includes(fk.source)) {
        const normalised = normaliseWaveThreeForeignKeyName(statement);
        foreignKeys.push(normalised.statement);
        if (normalised.normalisation) foreignKeyNameNormalisations.push({ source: fk.source, target: fk.target, ...normalised.normalisation });
      }
      continue;
    }
    const indexTarget = createIndexTarget(statement);
    if (indexTarget && WAVE_THREE_TABLES.includes(indexTarget)) indexes.push(statement);
  }
  const sql = `${[...creates, ...foreignKeys, ...indexes].join("\n--> statement-breakpoint\n")}\n--> statement-breakpoint\n`;
  const inspected = validateWaveThreeSql(sql);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await mkdir(dirname(resolve(evidencePath)), { recursive: true });
  await writeFile(resolve(outputPath), sql);
  const evidence = {
    scope: "Source-derived Wave 3 scratch SQL selection only. No database connection, DDL execution, staging, production, migration account, or live-data operation occurred.",
    sourceSqlSha256: sha256(source),
    outputSqlSha256: sha256(sql),
    tableCount: inspected.createdTables.length,
    tableNames: inspected.createdTables,
    indexStatementCount: inspected.indexStatements.length,
    foreignKeyCount: inspected.foreignKeys.length,
    foreignKeys: inspected.foreignKeys.map(({ source, target }) => ({ source, target })),
    foreignKeyNameNormalisations,
    statementCount: inspected.statements.length,
    status: "passed",
  };
  await writeFile(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
