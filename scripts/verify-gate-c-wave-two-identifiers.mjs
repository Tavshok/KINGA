/**
 * Gate C Wave 2 identifier guard.
 *
 * Validates source-generated SQL without opening a database. Empty index names,
 * duplicate physical index definitions, and foreign-key names over MySQL/TiDB's
 * 64-character identifier limit are rejected before a scratch replay can begin.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suppliedPath = process.argv[2];
if (!suppliedPath) {
  throw new Error("Usage: node scripts/verify-gate-c-wave-two-identifiers.mjs <repository-relative-sql-path>");
}

const sqlPath = path.resolve(repoRoot, suppliedPath);
if (!sqlPath.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error("SQL path must be inside the repository.");
}

const sql = fs.readFileSync(sqlPath, "utf8");
const indexes = [...sql.matchAll(/CREATE(?:\s+UNIQUE)?\s+INDEX\s+`([^`]*)`\s+ON\s+`([^`]+)`\s*\(([^)]*)\)/gi)]
  .map(([, name, table, columns]) => ({
    name,
    table,
    columns: columns.replace(/\s+/g, ""),
  }));
const foreignKeys = [...sql.matchAll(/CONSTRAINT\s+`([^`]+)`/gi)]
  .map(([, name]) => ({ name, length: name.length }));
const emptyIndexes = indexes.filter((index) => !index.name);
const duplicateIndexColumns = indexes.filter((index, indexNumber) =>
  indexes.findIndex((candidate) => candidate.table === index.table && candidate.columns === index.columns) !== indexNumber,
);
const overlongForeignKeys = foreignKeys.filter((foreignKey) => foreignKey.length > 64);

console.log(JSON.stringify({
  scope: "Gate C Wave 2 identifier validation only; no database connection was opened.",
  sqlPath: path.relative(repoRoot, sqlPath),
  indexCount: indexes.length,
  foreignKeyCount: foreignKeys.length,
  emptyIndexes,
  duplicateIndexColumns,
  overlongForeignKeys,
  status: emptyIndexes.length || duplicateIndexColumns.length || overlongForeignKeys.length ? "failed" : "passed",
}, null, 2));

if (emptyIndexes.length || duplicateIndexColumns.length || overlongForeignKeys.length) {
  process.exitCode = 1;
}
