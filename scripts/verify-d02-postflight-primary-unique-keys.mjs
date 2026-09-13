import { readFileSync } from 'node:fs';

const [waveOnePath, waveTwoPath, liveCsvPath] = process.argv.slice(2);

if (!waveOnePath || !waveTwoPath || !liveCsvPath) {
  console.error('Usage: node scripts/verify-d02-postflight-primary-unique-keys.mjs <wave-01.sql> <wave-02.sql> <live-statistics.csv>');
  process.exit(2);
}

function extractKeys(sourceText) {
  const rows = [];
  const createTablePattern = /CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\);/g;
  for (const tableMatch of sourceText.matchAll(createTablePattern)) {
    const [, tableName, body] = tableMatch;
    for (const line of body.split('\n')) {
      const constraintMatch = line.match(/^\s*CONSTRAINT `([^`]+)` (PRIMARY KEY|UNIQUE)\(([^)]+)\)/);
      if (!constraintMatch) continue;
      const [, sourceName, keyType, rawColumns] = constraintMatch;
      const indexName = keyType === 'PRIMARY KEY' ? 'PRIMARY' : sourceName;
      const columns = [...rawColumns.matchAll(/`([^`]+)`/g)].map((columnMatch) => columnMatch[1]);
      columns.forEach((columnName, index) => {
        rows.push({ tableName, indexName, sequence: index + 1, columnName, nonUnique: '0' });
      });
    }
  }
  return rows;
}

const sourceRows = [
  ...extractKeys(readFileSync(waveOnePath, 'utf8')),
  ...extractKeys(readFileSync(waveTwoPath, 'utf8')),
];

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
const expectedKeys = new Set(sourceRows.map(key));
const missing = sourceRows.filter((row) => !liveKeys.has(key(row)));
const unexpected = liveRows.filter((row) => !expectedKeys.has(key(row)));

const report = {
  status: missing.length || unexpected.length ? 'FAIL' : 'PASS',
  expected_keyed_column_row_count: sourceRows.length,
  live_keyed_column_row_count: liveRows.length,
  missing,
  unexpected,
};

console.log(JSON.stringify(report, null, 2));
process.exit(missing.length || unexpected.length ? 1 : 0);
