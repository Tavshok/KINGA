import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [csvPath] = process.argv.slice(2);
if (!csvPath) throw new Error("Usage: node scripts/verify-ncu01-preflight-duplicate-pairs.mjs <duplicate-pair-preflight.csv>");

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
for (const field of ["pair_rule", "duplicate_groups", "rows_in_duplicate_groups"]) if (!(field in index)) throw new Error(`Missing CSV header ${field}`);
const expectedRules = [
  "assessor_insurer_relationships (assessor_id, tenant_id)",
  "policy_claim_links (policy_id, claim_id)",
  "fleet_drivers (fleet_id, user_id)",
].sort();
const actual = rows
  .filter((row) => row.length > 1)
  .map((row) => ({ pairRule: row[index.pair_rule], duplicateGroups: Number(row[index.duplicate_groups]), rowsInDuplicateGroups: Number(row[index.rows_in_duplicate_groups]) }))
  .sort((left, right) => left.pairRule.localeCompare(right.pairRule));
const pass = JSON.stringify(actual.map((row) => row.pairRule)) === JSON.stringify(expectedRules)
  && actual.every((row) => row.duplicateGroups === 0 && row.rowsInDuplicateGroups === 0);
console.log(JSON.stringify({ status: pass ? "PASS" : "FAIL", expected_rules: expectedRules, actual }, null, 2));
process.exit(pass ? 0 : 1);
