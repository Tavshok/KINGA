import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [liveCsv, source] = process.argv.slice(2);
if (!liveCsv || !source) throw new Error('Usage: node scripts/verify-d05-final-postflight-explicit-indexes.mjs <live.csv> <wave-5.sql>');
function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const character = text[index]; const next = text[index + 1]; if (quoted) { if (character === '"' && next === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = false; else cell += character; continue; } if (character === '"') quoted = true; else if (character === ',') { row.push(cell); cell = ''; } else if (character === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += character; }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); } const [header, ...data] = rows; return data.filter((values) => values.length && values.some(Boolean)).map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ''])));
}
const statements = readFileSync(resolve(source), 'utf8').split('--> statement-breakpoint').map((entry) => entry.trim()).filter(Boolean);
const expected = statements.flatMap((statement) => { const match = statement.match(/^CREATE INDEX `([^`]+)` ON `([^`]+)`\s*\(([^)]+)\);$/is); if (!match) return []; const [, index_name, table_name, raw] = match; return [{ table_name, index_name, columns: [...raw.matchAll(/`([^`]+)`/g)].map((entry) => entry[1]) }]; });
const actualRows = csvRows(readFileSync(resolve(liveCsv), 'utf8'));
const actualByPair = new Map();
for (const row of actualRows) { const pair = `${row.table_name}|${row.index_name}`; const entry = actualByPair.get(pair) ?? { table_name: row.table_name, index_name: row.index_name, columns: [] }; entry.columns[Number(row.seq_in_index) - 1] = row.column_name; actualByPair.set(pair, entry); }
const pair = (entry) => `${entry.table_name}|${entry.index_name}`; const definition = (entry) => `${pair(entry)}|${entry.columns.join(',')}`;
const expectedDefinitions = new Set(expected.map(definition)); const missing = expected.filter((entry) => !actualByPair.has(pair(entry)) || definition(actualByPair.get(pair(entry))) !== definition(entry)).map(definition); const definition_mismatches = [...actualByPair.values()].filter((entry) => expected.some((candidate) => pair(candidate) === pair(entry)) && !expectedDefinitions.has(definition(entry))).map(definition);
const result = { status: expected.length === 190 && !missing.length && !definition_mismatches.length ? 'PASS' : 'FAIL', expected_explicit_table_index_pairs: expected.length, live_matching_explicit_table_index_pairs: expected.filter((entry) => actualByPair.has(pair(entry)) && definition(actualByPair.get(pair(entry))) === definition(entry)).length, expected_indexed_column_rows: expected.reduce((count, entry) => count + entry.columns.length, 0), live_d05_non_primary_index_column_rows: actualRows.length, missing, definition_mismatches };
console.log(JSON.stringify(result, null, 2)); process.exit(result.status === 'PASS' ? 0 : 1);
