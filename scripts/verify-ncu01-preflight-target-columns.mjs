import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [csvPath] = process.argv.slice(2);
if (!csvPath) throw new Error("Usage: node scripts/verify-ncu01-preflight-target-columns.mjs <target-columns.csv>");

const root = resolve(import.meta.dirname, "..");
const targets = new Set(["assessor_insurer_relationships", "policy_claim_links", "fleet_drivers"]);
const sources = [
  "/home/ubuntu/kinga-replit-d05-packet/audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql",
  "/home/ubuntu/kinga-replit-d05-packet/audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql",
  "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-d03-tidb-compatible-source-2026-09-14.sql",
  "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql",
  "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql",
];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i]; const next = text[i + 1];
    if (quoted) {
      if (character === '"' && next === '"') { cell += '"'; i += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
const normalizeType = (value) => value.replace(/\s+/g, "").toLowerCase();
function normalizeDefault(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return "";
  const unwrapped = raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1).trim() : raw;
  if (/^(now\(\)|current_timestamp(?:\(\))?)$/i.test(unwrapped)) return "CURRENT_TIMESTAMP";
  return unwrapped.replace(/^'(.*)'$/, "$1");
}
function sourceDefault(rest) {
  if (/\bDEFAULT\s+\(now\(\)\)/i.test(rest)) return "CURRENT_TIMESTAMP";
  const match = rest.match(/\bDEFAULT\s+(\([^)]*\)|'(?:[^'\\]|\\.)*'|[^\s,]+)/i);
  return match ? normalizeDefault(match[1]) : null;
}
function sourceColumn(line, tableName, ordinal) {
  const match = line.match(/^\s*`([^`]+)`\s+(.+?)(?:,)?$/);
  if (!match) return null;
  const [, columnName, rest] = match;
  const type = rest.match(/^(.+?)(?=\s+(?:NOT NULL|DEFAULT|AUTO_INCREMENT|ON UPDATE)|,?$)/i)?.[1];
  if (!type) throw new Error(`Cannot parse ${tableName}.${columnName}`);
  return { ordinal, columnName, type: normalizeType(type), nullable: /\bNOT NULL\b/i.test(rest) ? "NO" : "YES", defaultValue: sourceDefault(rest), autoIncrement: /\bAUTO_INCREMENT\b/i.test(rest) };
}
function expectedColumns() {
  const expected = new Map();
  for (const sourcePath of sources) {
    const source = readFileSync(sourcePath, "utf8");
    for (const match of source.matchAll(/CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\);/g)) {
      const [, tableName, body] = match;
      if (!targets.has(tableName)) continue;
      if (expected.has(tableName)) throw new Error(`Duplicate source declaration for ${tableName}`);
      const columns = body.split("\n").map((line, index) => sourceColumn(line, tableName, index + 1)).filter(Boolean);
      expected.set(tableName, columns);
    }
  }
  if (expected.size !== targets.size) throw new Error(`Expected ${targets.size} source target declarations, found ${expected.size}`);
  return expected;
}

const expected = expectedColumns();
const [header, ...rows] = parseCsv(readFileSync(resolve(csvPath), "utf8"));
const index = Object.fromEntries(header.map((name, position) => [name, position]));
for (const field of ["table_name", "ordinal_position", "column_name", "column_type", "is_nullable", "column_default", "extra"]) if (!(field in index)) throw new Error(`Missing CSV header ${field}`);
const actual = new Map();
for (const row of rows) {
  const tableName = row[index.table_name];
  if (!targets.has(tableName)) continue;
  const columns = actual.get(tableName) ?? [];
  columns.push({ ordinal: Number(row[index.ordinal_position]), columnName: row[index.column_name], type: normalizeType(row[index.column_type]), nullable: row[index.is_nullable], defaultValue: normalizeDefault(row[index.column_default]), autoIncrement: /auto_increment/i.test(row[index.extra]) });
  actual.set(tableName, columns);
}
const mismatches = [];
for (const [tableName, sourceColumns] of expected) {
  const liveColumns = (actual.get(tableName) ?? []).sort((a, b) => a.ordinal - b.ordinal);
  if (sourceColumns.length !== liveColumns.length) mismatches.push({ kind: "column_count", tableName, expected: sourceColumns.length, actual: liveColumns.length });
  for (let i = 0; i < Math.max(sourceColumns.length, liveColumns.length); i += 1) {
    const sourceColumnValue = sourceColumns[i]; const liveColumnValue = liveColumns[i];
    if (!sourceColumnValue || !liveColumnValue) continue;
    for (const field of ["ordinal", "columnName", "type", "nullable", "autoIncrement"]) if (sourceColumnValue[field] !== liveColumnValue[field]) mismatches.push({ kind: "column_property", tableName, column: sourceColumnValue.columnName, field, expected: sourceColumnValue[field], actual: liveColumnValue[field] });
    if (sourceColumnValue.defaultValue !== null && sourceColumnValue.defaultValue !== liveColumnValue.defaultValue) mismatches.push({ kind: "column_default", tableName, column: sourceColumnValue.columnName, expected: sourceColumnValue.defaultValue, actual: liveColumnValue.defaultValue });
  }
}
console.log(JSON.stringify({ status: mismatches.length ? "FAIL" : "PASS", expected_tables: expected.size, live_tables: actual.size, expected_columns: [...expected.values()].flat().length, live_columns: [...actual.values()].flat().length, mismatches }, null, 2));
process.exit(mismatches.length ? 1 : 0);
