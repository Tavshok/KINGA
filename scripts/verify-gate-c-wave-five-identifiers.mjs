/** Validates final Wave 5 index, inline unique constraint, and foreign-key identifiers without opening a database. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createTableName, createIndexTarget, foreignKeyTables, splitStatements, validateWaveFiveSql } from "./gate-c-wave-five-contract.mjs";

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath) throw new Error("Usage: node scripts/verify-gate-c-wave-five-identifiers.mjs /absolute/or/repository-relative/wave-5.sql");
  const sql = await readFile(resolve(sqlPath), "utf8");
  const inspected = validateWaveFiveSql(sql);
  const namesByTable = new Map();
  const add = (table, name, kind) => {
    if (!name) throw new Error(`Wave 5 ${kind} on ${table} has an empty identifier.`);
    if (name.length > 64) throw new Error(`Wave 5 ${kind} ${name} on ${table} exceeds MySQL/TiDB’s 64-character identifier limit.`);
    const names = namesByTable.get(table) ?? new Set();
    if (names.has(name)) throw new Error(`Wave 5 ${kind} identifier ${name} is duplicated on ${table}.`);
    names.add(name); namesByTable.set(table, names);
  };
  let indexCount = 0; let inlineUniqueCount = 0; let foreignKeyCount = 0;
  for (const statement of splitStatements(sql)) {
    const table = createTableName(statement);
    if (table) {
      for (const match of statement.matchAll(/CONSTRAINT\s+`([^`]+)`\s+UNIQUE\s*\(/gi)) { add(table, match[1], "inline unique constraint"); inlineUniqueCount += 1; }
      continue;
    }
    const indexTarget = createIndexTarget(statement);
    if (indexTarget) { add(indexTarget, statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`([^`]+)`/i)?.[1], "index"); indexCount += 1; continue; }
    const foreignKey = foreignKeyTables(statement);
    if (foreignKey) { add(foreignKey.source, foreignKey.name, "foreign key"); foreignKeyCount += 1; }
  }
  console.log(JSON.stringify({ scope: "Gate C Wave 5 identifier-only static validation; no database was opened.", tableCount: inspected.createdTables.length, indexCount, inlineUniqueCount, foreignKeyCount, status: "passed" }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
