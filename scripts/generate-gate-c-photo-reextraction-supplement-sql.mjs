/** Select only the approved photo-reextraction supplemental SQL from a disposable source snapshot; never opens a database. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createIndexTarget, createTableName, foreignKeyTables, splitStatements } from "./gate-c-wave-five-contract.mjs";
import { SUPPLEMENT_TABLES, validatePhotoReextractionSupplementSql } from "./gate-c-photo-reextraction-supplement-contract.mjs";

function option(name) { const position = process.argv.indexOf(name); return position === -1 ? undefined : process.argv[position + 1]; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

async function main() {
  const sourcePath = option("--source-sql");
  const outputPath = option("--out");
  const evidencePath = option("--evidence");
  if (!sourcePath || !outputPath || !evidencePath) throw new Error("Usage: --source-sql /absolute/full-source.sql --out /absolute/supplement.sql --evidence /absolute/generation.json");
  const source = await readFile(resolve(sourcePath), "utf8");
  const creates = [];
  const foreignKeys = [];
  const indexes = [];
  for (const statement of splitStatements(source)) {
    const table = createTableName(statement);
    if (table) { if (SUPPLEMENT_TABLES.includes(table)) creates.push(statement); continue; }
    const foreignKey = foreignKeyTables(statement);
    if (foreignKey) { if (SUPPLEMENT_TABLES.includes(foreignKey.source)) foreignKeys.push(statement); continue; }
    const indexTarget = createIndexTarget(statement);
    if (indexTarget && SUPPLEMENT_TABLES.includes(indexTarget)) indexes.push(statement);
  }
  const sql = `${[...creates, ...foreignKeys, ...indexes].join("\n--> statement-breakpoint\n")}\n--> statement-breakpoint\n`;
  const inspected = validatePhotoReextractionSupplementSql(sql);
  const inlineUniqueConstraintCount = creates.reduce((count, statement) => count + (statement.match(/CONSTRAINT\s+`[^`]+`\s+UNIQUE\s*\(/gi) ?? []).length, 0);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await mkdir(dirname(resolve(evidencePath)), { recursive: true });
  await writeFile(resolve(outputPath), sql);
  const evidence = {
    scope: "Approved Gate C photo-reextraction supplemental source selection only; no database connection or DDL execution occurred.",
    sourceSqlSha256: sha256(source), outputSqlSha256: sha256(sql), tableCount: inspected.createdTables.length,
    tableNames: inspected.createdTables, statementCount: inspected.statements.length, indexStatementCount: inspected.indexStatements.length,
    inlineUniqueConstraintCount, totalSourceDeclaredIndexAndUniqueConstraintCount: inspected.indexStatements.length + inlineUniqueConstraintCount,
    foreignKeyCount: inspected.foreignKeys.length,
    foreignKeys: inspected.foreignKeys.map(({ source: fkSource, name, target }) => ({ source: fkSource, name, target })), status: "passed",
  };
  await writeFile(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
