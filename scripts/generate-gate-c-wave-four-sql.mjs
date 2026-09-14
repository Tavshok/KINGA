/** Selects reviewed Wave 4 scratch SQL from an explicitly supplied disposable source snapshot. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { WAVE_FOUR_TABLES, createIndexTarget, createTableName, foreignKeyTables, splitStatements, validateWaveFourSql } from "./gate-c-wave-four-contract.mjs";

function option(name) { const position = process.argv.indexOf(name); return position === -1 ? undefined : process.argv[position + 1]; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

async function main() {
  const sourcePath = option("--source-sql");
  const outputPath = option("--out");
  const evidencePath = option("--evidence");
  if (!sourcePath || !outputPath || !evidencePath) throw new Error("Usage: --source-sql /absolute/full-source.sql --out /absolute/wave-4.sql --evidence /absolute/generation.json");
  const source = await readFile(resolve(sourcePath), "utf8");
  const creates = [];
  const foreignKeys = [];
  const indexes = [];
  for (const statement of splitStatements(source)) {
    const table = createTableName(statement);
    if (table) {
      if (WAVE_FOUR_TABLES.includes(table)) creates.push(statement);
      continue;
    }
    const foreignKey = foreignKeyTables(statement);
    if (foreignKey) {
      if (WAVE_FOUR_TABLES.includes(foreignKey.source)) foreignKeys.push(statement);
      continue;
    }
    const indexTarget = createIndexTarget(statement);
    if (indexTarget && WAVE_FOUR_TABLES.includes(indexTarget)) indexes.push(statement);
  }
  const sql = `${[...creates, ...foreignKeys, ...indexes].join("\n--> statement-breakpoint\n")}\n--> statement-breakpoint\n`;
  const inspected = validateWaveFourSql(sql);
  const inlineUniqueConstraintCount = creates.reduce((count, statement) => count + (statement.match(/CONSTRAINT\s+`[^`]+`\s+UNIQUE\s*\(/gi) ?? []).length, 0);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await mkdir(dirname(resolve(evidencePath)), { recursive: true });
  await writeFile(resolve(outputPath), sql);
  const evidence = {
    scope: "Source-derived Wave 4 scratch SQL selection only. No database connection, DDL execution, staging, production, migration account, or live-data operation occurred.",
    sourceSqlSha256: sha256(source),
    outputSqlSha256: sha256(sql),
    tableCount: inspected.createdTables.length,
    tableNames: inspected.createdTables,
    indexStatementCount: inspected.indexStatements.length,
    inlineUniqueConstraintCount,
    totalSourceDeclaredIndexAndUniqueConstraintCount: inspected.indexStatements.length + inlineUniqueConstraintCount,
    foreignKeyCount: inspected.foreignKeys.length,
    foreignKeys: inspected.foreignKeys.map(({ source: fkSource, target }) => ({ source: fkSource, target })),
    statementCount: inspected.statements.length,
    status: "passed",
  };
  await writeFile(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
