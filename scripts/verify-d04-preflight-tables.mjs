import { readFileSync } from 'node:fs';

function requireArgument(value, name) {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function normalizeCsvField(value) {
  const trimmed = value.replace(/\r$/, '').trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

function parseOneColumnCsv(path) {
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  if (normalizeCsvField(lines[0]) !== 'table_name') {
    throw new Error(`Unexpected CSV header in ${path}: ${lines[0] ?? '<empty>'}`);
  }
  return new Set(lines.slice(1).map(normalizeCsvField).filter(Boolean));
}

function sourceTables(path) {
  return new Set(
    [...readFileSync(path, 'utf8').matchAll(/^\s*CREATE TABLE `([^`]+)`/gm)].map((match) => match[1]),
  );
}

function union(...sets) {
  return new Set(sets.flatMap((set) => [...set]));
}

function difference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

const [csvPath, d01Path, d02Path, d03Path, d04Path] = process.argv.slice(2).map((value, index) =>
  requireArgument(value, ['csv', 'd01 source', 'd02 source', 'revised d03 source', 'revised d04 source'][index]),
);

const live = parseOneColumnCsv(csvPath);
const baseline = union(sourceTables(d01Path), sourceTables(d02Path), sourceTables(d03Path));
const d04 = sourceTables(d04Path);
const missingBaseline = difference(baseline, live);
const unexpectedLive = difference(live, baseline);
const presentD04 = difference(d04, new Set([...d04].filter((name) => !live.has(name))));

const result = {
  live_table_count: live.size,
  expected_baseline_table_count: baseline.size,
  expected_d04_table_count: d04.size,
  missing_baseline_tables: missingBaseline,
  unexpected_live_tables: unexpectedLive,
  d04_tables_already_present: presentD04,
};

console.log(JSON.stringify(result, null, 2));

if (
  result.live_table_count !== 73 ||
  result.expected_baseline_table_count !== 73 ||
  result.expected_d04_table_count !== 40 ||
  missingBaseline.length !== 0 ||
  unexpectedLive.length !== 0 ||
  presentD04.length !== 0
) {
  process.exitCode = 1;
} else {
  console.log('RESULT=PASS exact 73-table D-01–D-03 baseline; all 40 D-04 tables absent');
}
