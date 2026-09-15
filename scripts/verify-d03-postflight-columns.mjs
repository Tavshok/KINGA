import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [waveThreePath, ...liveCsvPaths] = process.argv.slice(2);
if (!waveThreePath || !liveCsvPaths.length) {
  console.error("Usage: node scripts/verify-d03-postflight-columns.mjs <revised-wave-3.sql> <one-or-more-live-columns.csv>");
  process.exit(2);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

const normalizeType = (value) => value.replace(/\s+/g, "").toLowerCase();
function normaliseDefault(value) {
  if (value === null || value === undefined) return "NULL";
  const raw = String(value).trim();
  if (raw === "") return "";
  const normalized = raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1).trim() : raw;
  if (/^current_timestamp(?:\(\))?$/i.test(normalized) || /^now\(\)$/i.test(normalized)) return "CURRENT_TIMESTAMP";
  if (/^json_array\(\)$/i.test(normalized)) return "JSON_ARRAY()";
  if (/^json_object\(\)$/i.test(normalized)) return "JSON_OBJECT()";
  return normalized.replace(/^'(.*)'$/, "$1");
}
function sourceDefault(rest) {
  if (/\bDEFAULT\s+\(now\(\)\)/i.test(rest)) return "CURRENT_TIMESTAMP";
  if (/\bDEFAULT\s+\(JSON_ARRAY\(\)\)/i.test(rest)) return "JSON_ARRAY()";
  if (/\bDEFAULT\s+\(JSON_OBJECT\(\)\)/i.test(rest)) return "JSON_OBJECT()";
  const match = rest.match(/\bDEFAULT\s+(\([^)]*\)|'(?:[^'\\]|\\.)*'|[^\s,]+)/i);
  return match ? normaliseDefault(match[1]) : null;
}
function sourceColumn(line, tableName, ordinal) {
  const match = line.match(/^\s*`([^`]+)`\s+(.+?)(?:,)?$/);
  if (!match) return null;
  const [, columnName, rest] = match;
  const typeMatch = rest.match(/^(.+?)(?=\s+(?:NOT NULL|DEFAULT|AUTO_INCREMENT|ON UPDATE)|,?$)/i);
  if (!typeMatch) throw new Error(`Could not parse type for ${tableName}.${columnName}: ${line}`);
  return {
    tableName,
    columnName,
    ordinal,
    type: normalizeType(typeMatch[1]),
    nullable: /\bNOT NULL\b/i.test(rest) ? "NO" : "YES",
    defaultValue: sourceDefault(rest),
    autoIncrement: /\bAUTO_INCREMENT\b/i.test(rest),
    onUpdateCurrentTimestamp: /\bON UPDATE CURRENT_TIMESTAMP\b/i.test(rest),
  };
}
function extractSourceColumns(sourceText) {
  const tables = new Map();
  const createTablePattern = /CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\);/g;
  for (const match of sourceText.matchAll(createTablePattern)) {
    const [, tableName, body] = match;
    const columns = [];
    for (const line of body.split("\n")) {
      const column = sourceColumn(line, tableName, columns.length + 1);
      if (column) columns.push(column);
    }
    if (!columns.length || tables.has(tableName)) throw new Error(`Invalid source table parse for ${tableName}`);
    tables.set(tableName, columns);
  }
  return tables;
}

const expectedTables = extractSourceColumns(readFileSync(resolve(waveThreePath), "utf8"));
const parsedCsvs = liveCsvPaths.map((path) => parseCsv(readFileSync(resolve(path), "utf8")));
const [header] = parsedCsvs[0];
const headerIndex = Object.fromEntries(header.map((name, index) => [name, index]));
const requiredHeaders = ["TABLE_SCHEMA", "TABLE_NAME", "COLUMN_NAME", "ORDINAL_POSITION", "COLUMN_DEFAULT", "IS_NULLABLE", "COLUMN_TYPE", "EXTRA"];
for (const field of requiredHeaders) if (!(field in headerIndex)) throw new Error(`Live CSV missing ${field}`);
const liveTables = new Map();
for (const parsed of parsedCsvs) {
  const [candidateHeader, ...rows] = parsed;
  if (JSON.stringify(candidateHeader) !== JSON.stringify(header)) throw new Error("Live CSV headers differ");
  for (const row of rows) {
    if (row[headerIndex.TABLE_SCHEMA] !== "kinga_staging") continue;
    const tableName = row[headerIndex.TABLE_NAME];
    if (!expectedTables.has(tableName)) continue;
    const value = {
      tableName,
      columnName: row[headerIndex.COLUMN_NAME],
      ordinal: Number(row[headerIndex.ORDINAL_POSITION]),
      type: normalizeType(row[headerIndex.COLUMN_TYPE]),
      nullable: row[headerIndex.IS_NULLABLE],
      defaultValue: normaliseDefault(row[headerIndex.COLUMN_DEFAULT]),
      autoIncrement: /auto_increment/i.test(row[headerIndex.EXTRA]),
      onUpdateCurrentTimestamp: /on update current_timestamp/i.test(row[headerIndex.EXTRA]),
    };
    const columns = liveTables.get(tableName) ?? [];
    columns.push(value);
    liveTables.set(tableName, columns);
  }
}
const mismatches = [];
for (const [tableName, expectedColumns] of expectedTables) {
  const actualColumns = (liveTables.get(tableName) ?? []).sort((a, b) => a.ordinal - b.ordinal);
  if (!liveTables.has(tableName)) { mismatches.push({ kind: "missing_table", tableName }); continue; }
  if (expectedColumns.length !== actualColumns.length) mismatches.push({ kind: "column_count", tableName, expected: expectedColumns.length, actual: actualColumns.length });
  for (let index = 0; index < Math.max(expectedColumns.length, actualColumns.length); index += 1) {
    const expected = expectedColumns[index]; const actual = actualColumns[index]; if (!expected || !actual) continue;
    for (const field of ["ordinal", "columnName", "type", "nullable", "autoIncrement", "onUpdateCurrentTimestamp"]) {
      if (expected[field] !== actual[field]) mismatches.push({ kind: "column_property", tableName, column: expected.columnName, field, expected: expected[field], actual: actual[field] });
    }
    if (expected.defaultValue !== null && expected.defaultValue !== actual.defaultValue) mismatches.push({ kind: "column_default", tableName, column: expected.columnName, expected: expected.defaultValue, actual: actual.defaultValue });
  }
}
const expectedColumnCount = [...expectedTables.values()].flat().length;
const liveColumnCount = [...liveTables.values()].flat().length;
console.log(JSON.stringify({
  status: mismatches.length ? "FAIL" : "PASS",
  expected_table_count: expectedTables.size,
  live_table_count: liveTables.size,
  expected_column_count: expectedColumnCount,
  live_column_count: liveColumnCount,
  default_comparison_policy: "All explicit source defaults are compared after normalizing CURRENT_TIMESTAMP and JSON_ARRAY()/JSON_OBJECT() expression representations.",
  mismatches,
}, null, 2));
process.exit(mismatches.length ? 1 : 0);
