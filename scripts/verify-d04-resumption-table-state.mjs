import { readFileSync } from 'node:fs';

function requireArgument(value, name) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

function normalizeCsvField(value) {
  const trimmed = value.replace(/\r$/, '').trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/""/g, '"')
    : trimmed;
}

function parseOneColumnCsv(path) {
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  if (normalizeCsvField(lines[0]) !== 'table_name') throw new Error(`Unexpected CSV header in ${path}`);
  return new Set(lines.slice(1).map(normalizeCsvField).filter(Boolean));
}

function sourceTables(path) {
  return new Set([...readFileSync(path, 'utf8').matchAll(/^\s*CREATE TABLE `([^`]+)`/gm)].map((match) => match[1]));
}

function union(...sets) {
  return new Set(sets.flatMap((set) => [...set]));
}

function difference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

const [csvPath, d01Path, d02Path, d03Path, revisedD04Path] = process.argv.slice(2).map((value, index) =>
  requireArgument(value, ['CSV', 'D-01 source', 'D-02 source', 'revised D-03 source', 'revised D-04 source'][index]),
);

const live = parseOneColumnCsv(csvPath);
const baseline = union(sourceTables(d01Path), sourceTables(d02Path), sourceTables(d03Path));
const d04 = sourceTables(revisedD04Path);
const expected = union(baseline, d04);
const result = {
  live_table_count: live.size,
  expected_baseline_table_count: baseline.size,
  expected_accepted_d04_partial_table_count: d04.size,
  expected_cumulative_table_count: expected.size,
  missing_baseline_tables: difference(baseline, live),
  missing_accepted_d04_tables: difference(d04, live),
  unexpected_live_tables: difference(live, expected),
};

console.log(JSON.stringify(result, null, 2));
if (
  result.live_table_count !== 113 ||
  result.expected_baseline_table_count !== 73 ||
  result.expected_accepted_d04_partial_table_count !== 40 ||
  result.expected_cumulative_table_count !== 113 ||
  result.missing_baseline_tables.length !== 0 ||
  result.missing_accepted_d04_tables.length !== 0 ||
  result.unexpected_live_tables.length !== 0
) {
  process.exitCode = 1;
} else {
  console.log('RESULT=PASS exact 73-table baseline plus accepted 40-table D-04 partial state; no extra tables');
}
