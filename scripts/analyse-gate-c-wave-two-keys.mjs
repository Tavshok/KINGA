/**
 * Gate C Wave 2 source-generated SQL analysis only.
 *
 * Detects missing key contracts before a scratch replay can attempt foreign-key
 * creation. It never opens a database or writes source schema metadata.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.resolve(repoRoot, process.argv[2] ?? "");
if (!sqlPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error("SQL path must be inside the repository.");

const statements = fs.readFileSync(sqlPath, "utf8")
  .split(/-->\s*statement-breakpoint/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const tables = new Map();
const foreignKeys = [];
for (const statement of statements) {
  const create = statement.match(/^CREATE\s+TABLE\s+`([^`]+)`\s*\(([\s\S]*)\);$/i);
  if (create) {
    const [, tableName, body] = create;
    const autoIncrementColumns = [...body.matchAll(/`([^`]+)`[^,\n]*\bAUTO_INCREMENT\b/gi)].map((match) => match[1]);
    const primaryKeyColumns = [...body.matchAll(/PRIMARY\s+KEY\s*\(([^)]+)\)/gi)]
      .map((match) => match[1].match(/`([^`]+)`/g)?.map((column) => column.slice(1, -1)) ?? []);
    const uniqueColumns = [...body.matchAll(/UNIQUE\s*\(([^)]+)\)/gi)]
      .map((match) => match[1].match(/`([^`]+)`/g)?.map((column) => column.slice(1, -1)) ?? []);
    tables.set(tableName, { tableName, autoIncrementColumns, primaryKeyColumns, uniqueColumns });
    continue;
  }

  const foreignKey = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`([^`]+)`\s+FOREIGN\s+KEY\s*\(`([^`]+)`\)\s+REFERENCES\s+`([^`]+)`\s*\(`([^`]+)`\)/i);
  if (foreignKey) {
    const [, tableName, constraintName, localColumn, referencedTable, referencedColumn] = foreignKey;
    foreignKeys.push({ tableName, constraintName, localColumn, referencedTable, referencedColumn });
  }
}

const missingAutoIncrementPrimaryKeys = [...tables.values()]
  .filter((table) => table.autoIncrementColumns.length > 0 && !table.primaryKeyColumns.some((key) => key.length > 0));
const invalidForeignKeyTargets = foreignKeys.filter(({ referencedTable, referencedColumn }) => {
  const table = tables.get(referencedTable);
  if (!table) return false;
  return !table.primaryKeyColumns.some((columns) => columns.includes(referencedColumn))
    && !table.uniqueColumns.some((columns) => columns.includes(referencedColumn));
});

console.log(JSON.stringify({
  scope: "Static Wave 2 source-generated SQL analysis only; no database connection was opened.",
  tableCount: tables.size,
  foreignKeyCount: foreignKeys.length,
  missingAutoIncrementPrimaryKeys,
  invalidForeignKeyTargets,
  status: missingAutoIncrementPrimaryKeys.length === 0 && invalidForeignKeyTargets.length === 0 ? "passed" : "review_required",
}, null, 2));
