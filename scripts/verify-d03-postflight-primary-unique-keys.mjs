import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [liveCsvPath, ...sourcePaths] = process.argv.slice(2);
if (!liveCsvPath || sourcePaths.length === 0) {
  console.error("Usage: node scripts/verify-d03-postflight-primary-unique-keys.mjs <live-statistics.csv> <wave-1.sql> <wave-2.sql> <revised-wave-3.sql>");
  process.exit(2);
}

function extractKeys(sourceText) {
  const rows = [];
  const createTablePattern = /CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\);/g;
  for (const tableMatch of sourceText.matchAll(createTablePattern)) {
    const [, tableName, body] = tableMatch;
    for (const line of body.split("\n")) {
      const constraintMatch = line.match(/^\s*CONSTRAINT `([^`]+)` (PRIMARY KEY|UNIQUE)\(([^)]+)\)/);
      if (!constraintMatch) continue;
      const [, sourceName, keyType, rawColumns] = constraintMatch;
      const indexName = keyType === "PRIMARY KEY" ? "PRIMARY" : sourceName;
      [...rawColumns.matchAll(/`([^`]+)`/g)].forEach((columnMatch, index) => rows.push({
        tableName,
        indexName,
        sequence: index + 1,
        columnName: columnMatch[1],
        nonUnique: "0",
      }));
    }
  }
  return rows;
}

const sourceRows = sourcePaths.flatMap((path) => extractKeys(readFileSync(resolve(path), "utf8")));
const lines = readFileSync(resolve(liveCsvPath), "utf8").trim().split(/\r?\n/);
const [header, ...body] = lines;
if (header !== "table_name,index_name,seq_in_index,column_name,non_unique") throw new Error(`Unexpected live CSV header: ${header}`);
const liveRows = body.map((line) => {
  const [tableName, indexName, sequence, columnName, nonUnique] = line.replace(/"/g, "").split(",");
  return { tableName, indexName, sequence: Number(sequence), columnName, nonUnique };
});
const key = ({ tableName, indexName, sequence, columnName, nonUnique }) => `${tableName}\t${indexName}\t${sequence}\t${columnName}\t${nonUnique}`;
const expectedKeys = new Set(sourceRows.map(key));
const liveKeys = new Set(liveRows.map(key));
const missing = sourceRows.filter((row) => !liveKeys.has(key(row)));
const unexpected = liveRows.filter((row) => !expectedKeys.has(key(row)));
const result = {
  status: missing.length || unexpected.length ? "FAIL" : "PASS",
  expected_keyed_column_row_count: sourceRows.length,
  live_keyed_column_row_count: liveRows.length,
  expected_distinct_key_structures: new Set(sourceRows.map((row) => `${row.tableName}|${row.indexName}`)).size,
  live_distinct_key_structures: new Set(liveRows.map((row) => `${row.tableName}|${row.indexName}`)).size,
  missing,
  unexpected,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "PASS" ? 0 : 1);
