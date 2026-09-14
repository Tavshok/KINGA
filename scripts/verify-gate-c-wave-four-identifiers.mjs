import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { splitStatements, validateWaveFourSql } from "./gate-c-wave-four-contract.mjs";

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath) throw new Error("Usage: node scripts/verify-gate-c-wave-four-identifiers.mjs /absolute/wave-4.sql");
  const sql = await readFile(sqlPath, "utf8");
  const inspected = validateWaveFourSql(sql);
  const names = [];
  for (const statement of splitStatements(sql)) {
    const table = statement.match(/^CREATE\s+TABLE\s+`([^`]+)`/i)?.[1];
    if (table) {
      for (const uniqueConstraint of statement.matchAll(/CONSTRAINT\s+`([^`]+)`\s+UNIQUE\s*\(/gi)) {
        names.push({ kind: "unique_constraint", name: uniqueConstraint[1], table });
      }
    }
    const indexTarget = statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/i);
    if (indexTarget) names.push({ kind: "index", name: indexTarget[1], table: indexTarget[2] });
    const foreignKey = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`([^`]+)`/i);
    if (foreignKey) names.push({ kind: "foreign_key", name: foreignKey[2], table: foreignKey[1] });
  }
  const invalid = names.filter(({ name }) => !name || name.length > 64);
  const duplicateNames = names.filter(({ name, table }, index) => names.findIndex((candidate) => candidate.name === name && candidate.table === table) !== index).map(({ table, name }) => `${table}.${name}`);
  if (invalid.length || duplicateNames.length) throw new Error(`Invalid Wave 4 identifiers: invalid=${JSON.stringify(invalid)}, duplicate=${JSON.stringify([...new Set(duplicateNames)])}`);
  console.log(JSON.stringify({ tableCount: inspected.createdTables.length, indexCount: names.filter(({ kind }) => kind === "index").length, inlineUniqueConstraintCount: names.filter(({ kind }) => kind === "unique_constraint").length, foreignKeyCount: names.filter(({ kind }) => kind === "foreign_key").length, status: "passed" }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
