import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [csvPath] = process.argv.slice(2);
if (!csvPath) throw new Error("Usage: node scripts/verify-ncu01-postflight-index-state.mjs <final-index-state.csv>");
const root = resolve(import.meta.dirname, "..");
const contract = JSON.parse(readFileSync(resolve(root, "audit/natural-composite-unique-staging-2026-09-15/source-contract.json"), "utf8"));

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]; const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') { cell += '"'; index += 1; }
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

const [header, ...rows] = parseCsv(readFileSync(resolve(csvPath), "utf8"));
const index = Object.fromEntries(header.map((name, position) => [name, position]));
for (const field of ["table_name", "index_name", "non_unique", "seq_in_index", "column_name"]) if (!(field in index)) throw new Error(`Missing CSV header ${field}`);
const actual = rows.filter((row) => row.length > 1).map((row) => ({ table_name: row[index.table_name], index_name: row[index.index_name], non_unique: Number(row[index.non_unique]), seq_in_index: Number(row[index.seq_in_index]), column_name: row[index.column_name] }));
const sortRows = (left, right) => left.table_name.localeCompare(right.table_name)
  || left.index_name.localeCompare(right.index_name)
  || left.seq_in_index - right.seq_in_index;
const expected = contract.expected_postflight.unique_indexes
  .flatMap((definition) => definition.columns.map((column_name, position) => ({ table_name: definition.table_name, index_name: definition.index_name, non_unique: 0, seq_in_index: position + 1, column_name })))
  .sort(sortRows);
actual.sort(sortRows);
const oldIndexPresent = actual.some((row) => row.index_name === contract.expected_postflight.removed_index.index_name);
const pass = !oldIndexPresent && JSON.stringify(actual) === JSON.stringify(expected);
console.log(JSON.stringify({
  status: pass ? "PASS" : "FAIL",
  removed_index_present: oldIndexPresent,
  expected_unique_index_column_rows: expected.length,
  actual_unique_index_column_rows: actual.length,
  expected,
  actual,
}, null, 2));
process.exit(pass ? 0 : 1);
