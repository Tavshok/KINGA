import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createIndexTarget, foreignKeyTables, splitStatements } from "./gate-c-wave-five-contract.mjs";
import { validatePhotoReextractionSupplementSql } from "./gate-c-photo-reextraction-supplement-contract.mjs";

function option(name) { const position = process.argv.indexOf(name); return position === -1 ? undefined : process.argv[position + 1]; }
function identifierFromIndex(statement) { return statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`([^`]+)`/i)?.[1] ?? null; }
async function main() {
  const sqlPath = option("--sql");
  if (!sqlPath) throw new Error("Usage: --sql /absolute/supplement.sql");
  const sql = await readFile(sqlPath, "utf8");
  const validated = validatePhotoReextractionSupplementSql(sql);
  const seenByTable = new Map();
  for (const statement of splitStatements(sql)) {
    const table = createIndexTarget(statement);
    const name = identifierFromIndex(statement);
    if (table && name) {
      if (!name.trim()) throw new Error(`Empty supplemental index identifier on ${table}.`);
      if (name.length > 64) throw new Error(`Overlong supplemental index identifier ${name}.`);
      const seen = seenByTable.get(table) ?? new Set();
      if (seen.has(name)) throw new Error(`Duplicate supplemental index identifier ${name} on ${table}.`);
      seen.add(name); seenByTable.set(table, seen);
    }
    const foreignKey = foreignKeyTables(statement);
    if (foreignKey) {
      if (!foreignKey.name.trim()) throw new Error(`Empty supplemental foreign-key identifier on ${foreignKey.source}.`);
      if (foreignKey.name.length > 64) throw new Error(`Overlong supplemental foreign-key identifier ${foreignKey.name}.`);
    }
  }
  console.log(JSON.stringify({ tableCount: validated.createdTables.length, indexStatementCount: validated.indexStatements.length, foreignKeyCount: validated.foreignKeys.length, status: "passed" }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
