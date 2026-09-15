import { readFileSync } from 'node:fs';

const [inventoryPath, wave1Path, wave2LedgerPath, wave3LedgerPath, wave4Path, wave5Path] = process.argv.slice(2);

if (![inventoryPath, wave1Path, wave2LedgerPath, wave3LedgerPath, wave4Path, wave5Path].every(Boolean)) {
  throw new Error('usage: node scripts/verify-d05-preflight-tables.mjs <inventory.csv> <wave1.sql> <wave2-ledger.json> <wave3-ledger.json> <wave4-v2.sql> <wave5-v2.sql>');
}

function tablesFromSql(sqlText) {
  return [...sqlText.matchAll(/CREATE TABLE\s+`([^`]+)`/gi)].map((match) => match[1]);
}

function tablesFromLedger(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : parsed.statements;
  if (!Array.isArray(rows)) throw new Error(`ledger at ${path} has no statements array`);
  return rows.flatMap((row) => tablesFromSql(row.sqlText ?? row.sql ?? row.statement ?? ''));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

const inventoryRows = readFileSync(inventoryPath, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim().replace(/^"|"$/g, '').replace(/""/g, ''))
  .filter(Boolean);

const expectedBaseline = uniqueSorted([
  ...tablesFromSql(readFileSync(wave1Path, 'utf8')),
  ...tablesFromLedger(wave2LedgerPath),
  ...tablesFromLedger(wave3LedgerPath),
  ...tablesFromSql(readFileSync(wave4Path, 'utf8')),
]);
const d05Tables = uniqueSorted(tablesFromSql(readFileSync(wave5Path, 'utf8')));
const live = uniqueSorted(inventoryRows);

const missingBaseline = expectedBaseline.filter((name) => !live.includes(name));
const unexpectedLive = live.filter((name) => !expectedBaseline.includes(name));
const d05AlreadyPresent = d05Tables.filter((name) => live.includes(name));
const baselineD05Overlap = expectedBaseline.filter((name) => d05Tables.includes(name));

const result = {
  expected_baseline_tables: expectedBaseline.length,
  live_tables: live.length,
  d05_tables: d05Tables.length,
  missing_baseline: missingBaseline,
  unexpected_live: unexpectedLive,
  d05_already_present: d05AlreadyPresent,
  baseline_d05_overlap: baselineD05Overlap,
};

console.log(JSON.stringify(result, null, 2));
if (expectedBaseline.length !== 113 || d05Tables.length !== 75 || missingBaseline.length || unexpectedLive.length || d05AlreadyPresent.length || baselineD05Overlap.length) {
  process.exitCode = 1;
}
