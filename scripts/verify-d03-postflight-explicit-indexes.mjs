import { basename, resolve } from "node:path";
import { readFileSync } from "node:fs";

const [liveCsvArg, ...sourceArgs] = process.argv.slice(2);
if (!liveCsvArg || sourceArgs.length === 0) {
  console.error("Usage: node scripts/verify-d03-postflight-explicit-indexes.mjs <live.csv> <wave-1.sql> <wave-2.sql> <revised-wave-3.sql>");
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

function explicitIndexes(text) {
  const statements = text.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
  return statements.flatMap((statement) => {
    const match = statement.match(/^CREATE INDEX `([^`]+)` ON `([^`]+)`\s*\(([^)]+)\);$/is);
    if (!match) return [];
    const [, index_name, table_name, rawColumns] = match;
    const columns = [...rawColumns.matchAll(/`([^`]+)`/g)].map((entry) => entry[1]);
    if (columns.length === 0) throw new Error(`Could not parse indexed columns from ${statement}`);
    return [{ table_name, index_name, columns }];
  });
}

const identity = (index) => `${index.table_name}|${index.index_name}`;
const definition = (index) => `${identity(index)}|${index.columns.join(",")}`;

const liveRows = csvRows(readFileSync(resolve(liveCsvArg), "utf8"));
const liveByIdentity = new Map();
for (const row of liveRows) {
  const key = `${row.table_name}|${row.index_name}`;
  const entry = liveByIdentity.get(key) ?? { table_name: row.table_name, index_name: row.index_name, columns: [] };
  entry.columns[Number(row.seq_in_index) - 1] = row.column_name;
  liveByIdentity.set(key, entry);
}

const expectedBySource = Object.fromEntries(sourceArgs.map((arg) => [basename(arg), explicitIndexes(readFileSync(resolve(arg), "utf8"))]));
const expected = Object.values(expectedBySource).flat();
const expectedSet = new Set(expected.map(definition));
const liveExpectedDefinitions = [...liveByIdentity.values()].filter((entry) => expectedSet.has(definition(entry)));
const missing = expected.filter((entry) => !liveByIdentity.has(identity(entry)) || definition(liveByIdentity.get(identity(entry))) !== definition(entry)).map(definition);
const unexpectedExplicitLike = [...liveByIdentity.values()]
  .filter((entry) => expected.some((candidate) => identity(candidate) === identity(entry)) && !expectedSet.has(definition(entry)))
  .map(definition);

const sourceCounts = Object.fromEntries(Object.entries(expectedBySource).map(([source, indexes]) => [source, {
  distinct_table_index_pairs: new Set(indexes.map(identity)).size,
  indexed_column_rows: indexes.reduce((count, index) => count + index.columns.length, 0),
}]));

const result = {
  status: missing.length === 0 && unexpectedExplicitLike.length === 0 ? "PASS" : "FAIL",
  live_non_primary_index_column_rows: liveRows.length,
  expected_explicit_table_index_pairs: expected.length,
  live_matching_explicit_table_index_pairs: liveExpectedDefinitions.length,
  expected_explicit_indexed_column_rows: expected.reduce((count, index) => count + index.columns.length, 0),
  live_distinct_non_primary_table_index_pairs: liveByIdentity.size,
  source_counts: sourceCounts,
  missing,
  definition_mismatches: unexpectedExplicitLike,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "PASS" ? 0 : 1);
