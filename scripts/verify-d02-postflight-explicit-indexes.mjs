import { readFileSync } from 'node:fs';

const [sourcePath, liveCsvPath] = process.argv.slice(2);

if (!sourcePath || !liveCsvPath) {
  console.error('Usage: node scripts/verify-d02-postflight-explicit-indexes.mjs <wave-02.sql> <live-statistics.csv>');
  process.exit(2);
}

const sourceRows = [];
for (const line of readFileSync(sourcePath, 'utf8').split('\n')) {
  const match = line.match(/^CREATE INDEX `([^`]+)` ON `([^`]+)` \(([^)]+)\);/);
  if (!match) continue;
  const [, indexName, tableName, rawColumns] = match;
  const columns = [...rawColumns.matchAll(/`([^`]+)`/g)].map((columnMatch) => columnMatch[1]);
  if (!columns.length) throw new Error(`No columns parsed from ${line}`);
  columns.forEach((columnName, index) => {
    sourceRows.push({ tableName, indexName, sequence: index + 1, columnName, nonUnique: '1' });
  });
}

const lines = readFileSync(liveCsvPath, 'utf8').trim().split(/\r?\n/);
const [header, ...body] = lines;
if (header !== 'table_name,index_name,seq_in_index,column_name,non_unique') {
  throw new Error(`Unexpected live CSV header: ${header}`);
}

const liveRows = body.map((line) => {
  const [tableName, indexName, sequence, columnName, nonUnique] = line.replace(/"/g, '').split(',');
  return { tableName, indexName, sequence: Number(sequence), columnName, nonUnique };
});

const key = ({ tableName, indexName, sequence, columnName, nonUnique }) => `${tableName}\t${indexName}\t${sequence}\t${columnName}\t${nonUnique}`;
const liveKeys = new Set(liveRows.map(key));
const missing = sourceRows.filter((row) => !liveKeys.has(key(row)));
const sourceIndexKeys = new Set(sourceRows.map(({ tableName, indexName }) => `${tableName}\t${indexName}`));
const liveExplicitNames = new Set(liveRows
  .filter(({ tableName, indexName }) => sourceIndexKeys.has(`${tableName}\t${indexName}`))
  .map(({ tableName, indexName }) => `${tableName}\t${indexName}`));

const report = {
  status: missing.length ? 'FAIL' : 'PASS',
  expected_explicit_index_count: sourceIndexKeys.size,
  matched_explicit_index_count: liveExplicitNames.size,
  expected_explicit_index_column_row_count: sourceRows.length,
  missing,
};

console.log(JSON.stringify(report, null, 2));
process.exit(missing.length ? 1 : 0);
