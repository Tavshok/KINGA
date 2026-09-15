import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [liveCsv, ...sources] = process.argv.slice(2);
if (!liveCsv || sources.length !== 5) {
  throw new Error('Usage: node scripts/verify-d05-final-postflight-cumulative-indexes.mjs <live.csv> <wave-1.sql> <wave-2-ledger.json> <wave-3-ledger.json> <wave-4.sql> <wave-5.sql>');
}

function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]; const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const [header, ...data] = rows;
  return data.filter((values) => values.length && values.some(Boolean)).map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ''])));
}

function statements(path) {
  const text = readFileSync(resolve(path), 'utf8');
  return path.endsWith('.json')
    ? JSON.parse(text).statements.map((entry) => entry.sql)
    : text.split('--> statement-breakpoint').map((entry) => entry.trim()).filter(Boolean);
}

const allStatements = sources.flatMap(statements);
const explicitIndexes = allStatements.flatMap((statement) => {
  const match = statement.match(/^CREATE INDEX `([^`]+)` ON `([^`]+)`\s*\(([^)]+)\);$/is);
  if (!match) return [];
  const [, index_name, table_name, rawColumns] = match;
  return [{ table_name, index_name, columns: [...rawColumns.matchAll(/`([^`]+)`/g)].map((entry) => entry[1]) }];
});
const automaticallyNamedForeignKeyPairs = allStatements.flatMap((statement) => {
  const tableName = statement.match(/^ALTER TABLE `([^`]+)`/i)?.[1];
  const constraintName = statement.match(/ADD CONSTRAINT `([^`]+)` FOREIGN KEY/i)?.[1];
  return tableName && constraintName ? [`${tableName}|${constraintName}`] : [];
});
const uniqueConstraintPairs = allStatements.flatMap((statement) => {
  const createTable = statement.match(/^CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\);$/);
  if (!createTable) return [];
  const [, tableName, body] = createTable;
  return [...body.matchAll(/^\s*CONSTRAINT `([^`]+)` UNIQUE\(/gm)].map((entry) => `${tableName}|${entry[1]}`);
});

const pair = (entry) => `${entry.table_name}|${entry.index_name}`;
const definition = (entry) => `${pair(entry)}|${entry.columns.join(',')}`;
const actualRows = csvRows(readFileSync(resolve(liveCsv), 'utf8'));
const actualByPair = new Map();
for (const row of actualRows) {
  const identifier = `${row.table_name}|${row.index_name}`;
  const entry = actualByPair.get(identifier) ?? { table_name: row.table_name, index_name: row.index_name, columns: [] };
  entry.columns[Number(row.seq_in_index) - 1] = row.column_name;
  actualByPair.set(identifier, entry);
}
const expectedExplicitDefinitions = new Set(explicitIndexes.map(definition));
const missingOrMismatchedExplicit = explicitIndexes
  .filter((entry) => !actualByPair.has(pair(entry)) || definition(actualByPair.get(pair(entry))) !== definition(entry))
  .map(definition);
const allowedPairs = new Set([
  ...explicitIndexes.map(pair),
  ...automaticallyNamedForeignKeyPairs,
  ...uniqueConstraintPairs,
]);
const unexpectedNonPrimaryPairs = [...actualByPair.keys()].filter((identifier) => !allowedPairs.has(identifier));
const result = {
  status: explicitIndexes.length === 454 && missingOrMismatchedExplicit.length === 0 && unexpectedNonPrimaryPairs.length === 0 ? 'PASS' : 'FAIL',
  expected_explicit_table_index_pairs: explicitIndexes.length,
  live_matching_explicit_table_index_pairs: explicitIndexes.filter((entry) => actualByPair.has(pair(entry)) && definition(actualByPair.get(pair(entry))) === definition(entry)).length,
  live_total_non_primary_table_index_pairs: actualByPair.size,
  expected_foreign_key_constraint_names: new Set(automaticallyNamedForeignKeyPairs).size,
  expected_unique_constraint_names: new Set(uniqueConstraintPairs).size,
  missing_or_mismatched_explicit: missingOrMismatchedExplicit,
  unexpected_non_primary_pairs: unexpectedNonPrimaryPairs,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'PASS' ? 0 : 1);
