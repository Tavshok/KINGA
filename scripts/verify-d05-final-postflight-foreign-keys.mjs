import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [liveCsv, ...sources] = process.argv.slice(2);
if (!liveCsv || sources.length !== 5) throw new Error('Usage: node scripts/verify-d05-final-postflight-foreign-keys.mjs <live.csv> <wave-1.sql> <wave-2-ledger.json> <wave-3-ledger.json> <wave-4.sql> <wave-5.sql>');

function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]; const next = text[index + 1];
    if (quoted) { if (character === '"' && next === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = false; else cell += character; continue; }
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
  return path.endsWith('.json') ? JSON.parse(text).statements.map((entry) => entry.sql) : text.split('--> statement-breakpoint').map((entry) => entry.trim()).filter(Boolean);
}
function expectedRows(sqlStatements) {
  return sqlStatements.flatMap((statement) => {
    const table = statement.match(/^ALTER TABLE `([^`]+)`/i)?.[1];
    const match = statement.match(/ADD CONSTRAINT `([^`]+)` FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)`\(`([^`]+)`\)(?: ON DELETE ([A-Z ]+?))?(?: ON UPDATE ([A-Z ]+?))?;/i);
    if (!table || !match) return [];
    const [, constraint_name, column_name, referenced_table_name, referenced_column_name, delete_rule = 'NO ACTION', update_rule = 'NO ACTION'] = match;
    return [{ constraint_name, table_name: table, column_name, referenced_table_name, referenced_column_name, update_rule: update_rule.trim().toUpperCase(), delete_rule: delete_rule.trim().toUpperCase() }];
  });
}
const identity = (row) => [row.constraint_name, row.table_name, row.column_name, row.referenced_table_name, row.referenced_column_name, row.update_rule.trim().toUpperCase(), row.delete_rule.trim().toUpperCase()].join('|');
const expected = sources.flatMap((source) => expectedRows(statements(source)));
const actual = csvRows(readFileSync(resolve(liveCsv), 'utf8'));
const expectedSet = new Set(expected.map(identity)); const actualSet = new Set(actual.map(identity));
const missing = [...expectedSet].filter((entry) => !actualSet.has(entry)); const unexpected = [...actualSet].filter((entry) => !expectedSet.has(entry));
const result = { status: expected.length === 67 && actual.length === 67 && !missing.length && !unexpected.length ? 'PASS' : 'FAIL', expected_row_count: expected.length, live_row_count: actual.length, expected_distinct_constraint_count: new Set(expected.map((row) => row.constraint_name)).size, live_distinct_constraint_count: new Set(actual.map((row) => row.constraint_name)).size, missing, unexpected };
console.log(JSON.stringify(result, null, 2)); process.exit(result.status === 'PASS' ? 0 : 1);
