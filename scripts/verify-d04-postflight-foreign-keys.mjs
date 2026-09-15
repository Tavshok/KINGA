import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [liveCsvArg, ...sourceArgs] = process.argv.slice(2);
if (!liveCsvArg || sourceArgs.length !== 4) {
  console.error("Usage: node scripts/verify-d04-postflight-foreign-keys.mjs <live.csv> <wave-1.sql> <wave-2.sql> <revised-wave-3-ledger.json> <revised-wave-4.sql>");
  process.exit(2);
}

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  return lines.map((line) => {
    const values = line.split(",").map((value) => value.replace(/^"|"$/g, ""));
    return Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
  });
}

function statementText(path) {
  const text = readFileSync(resolve(path), "utf8");
  if (path.endsWith(".json")) return JSON.parse(text).statements.map((statement) => statement.sql);
  return text.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
}

function sourceRows(statements) {
  return statements.flatMap((statement) => {
    const table = statement.match(/^ALTER TABLE `([^`]+)`/i)?.[1];
    const match = statement.match(/ADD CONSTRAINT `([^`]+)` FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)`\(`([^`]+)`\)(?: ON DELETE ([A-Z ]+?))?(?: ON UPDATE ([A-Z ]+?))?;/i);
    if (!table || !match) return [];
    const [, constraint_name, column_name, referenced_table_name, referenced_column_name, delete_rule = "NO ACTION", update_rule = "NO ACTION"] = match;
    return [{
      constraint_name,
      table_name: table,
      column_name,
      referenced_table_name,
      referenced_column_name,
      update_rule: update_rule.trim().toUpperCase(),
      delete_rule: delete_rule.trim().toUpperCase(),
    }];
  });
}

const normalize = (row) => [
  row.constraint_name,
  row.table_name,
  row.column_name,
  row.referenced_table_name,
  row.referenced_column_name,
  row.update_rule.trim().toUpperCase(),
  row.delete_rule.trim().toUpperCase(),
].join("|");

const liveRows = csvRows(readFileSync(resolve(liveCsvArg), "utf8"));
const expectedRows = sourceArgs.flatMap((path) => sourceRows(statementText(path)));
const liveSet = new Set(liveRows.map(normalize));
const expectedSet = new Set(expectedRows.map(normalize));
const missing = [...expectedSet].filter((value) => !liveSet.has(value));
const unexpected = [...liveSet].filter((value) => !expectedSet.has(value));
const result = {
  status: missing.length === 0 && unexpected.length === 0 && expectedRows.length === 42 && liveRows.length === 42 ? "PASS" : "FAIL",
  expected_row_count: expectedRows.length,
  live_row_count: liveRows.length,
  expected_distinct_constraint_count: new Set(expectedRows.map((row) => row.constraint_name)).size,
  live_distinct_constraint_count: new Set(liveRows.map((row) => row.constraint_name)).size,
  missing,
  unexpected,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "PASS" ? 0 : 1);
