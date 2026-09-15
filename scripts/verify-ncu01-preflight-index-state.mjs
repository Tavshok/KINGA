import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [csvPath] = process.argv.slice(2);
if (!csvPath) throw new Error("Usage: node scripts/verify-ncu01-preflight-index-state.mjs <current-index-state.csv>");

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
const actual = rows.filter((row) => row.length > 1).map((row) => ({ table: row[index.table_name], index: row[index.index_name], nonUnique: Number(row[index.non_unique]), sequence: Number(row[index.seq_in_index]), column: row[index.column_name] }));
const expected = [
  { table: "assessor_insurer_relationships", index: "unique_assessor_tenant", nonUnique: 1, sequence: 1, column: "assessor_id" },
  { table: "assessor_insurer_relationships", index: "unique_assessor_tenant", nonUnique: 1, sequence: 2, column: "tenant_id" },
];
const pass = JSON.stringify(actual) === JSON.stringify(expected);
console.log(JSON.stringify({
  status: pass ? "PASS" : "FAIL",
  expected_prior_non_unique_index_rows: expected.length,
  actual_prior_non_unique_index_rows: actual.length,
  planned_unique_index_rows_present: actual.filter((row) => row.index !== "unique_assessor_tenant").length,
  expected,
  actual,
}, null, 2));
process.exit(pass ? 0 : 1);
