import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(root, 'audit/gate-d-d05-final-postflight-queries-2026-09-15');
const sourcePaths = [
  resolve(root, 'audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql'),
  resolve(root, 'audit/gate-d-d02-statement-hash-ledger-2026-09-12.json'),
  resolve(root, 'audit/gate-d-d03-revised-statement-hash-ledger-2026-09-14.json'),
  resolve(root, 'audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql'),
  resolve(root, 'audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql'),
];

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

function statementsFromPath(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) return JSON.parse(text).statements.map((entry) => entry.sql);
  return text.split('--> statement-breakpoint').map((entry) => entry.trim()).filter(Boolean);
}

const sourceStatements = sourcePaths.map(statementsFromPath);
const allStatements = sourceStatements.flat();
const waveFiveStatements = sourceStatements.at(-1);
const extractTables = (statements) => statements.flatMap((statement) => [...statement.matchAll(/^CREATE TABLE `([^`]+)`/gm)].map((match) => match[1]));
const allTables = [...new Set(extractTables(allStatements))].sort();
const waveFiveTables = [...new Set(extractTables(waveFiveStatements))].sort();
if (allTables.length !== 188 || waveFiveTables.length !== 75) throw new Error(JSON.stringify({ allTables: allTables.length, waveFiveTables: waveFiveTables.length }));

const tableInventory = `-- Source-derived final cumulative inventory; read-only.\nSELECT table_name\nFROM information_schema.tables\nWHERE table_schema = 'kinga_staging'\n  AND table_type = 'BASE TABLE'\nORDER BY table_name;\n`;

const foreignKeys = `-- Source-derived final cumulative foreign-key definitions; read-only.\nSELECT\n  kcu.constraint_name,\n  kcu.table_name,\n  kcu.column_name,\n  kcu.referenced_table_name,\n  kcu.referenced_column_name,\n  rc.update_rule,\n  rc.delete_rule\nFROM information_schema.key_column_usage AS kcu\nJOIN information_schema.referential_constraints AS rc\n  ON rc.constraint_schema = kcu.constraint_schema\n AND rc.constraint_name = kcu.constraint_name\nWHERE kcu.constraint_schema = 'kinga_staging'\n  AND kcu.referenced_table_name IS NOT NULL\nORDER BY kcu.constraint_name, kcu.ordinal_position;\n`;

const explicitIndexes = `-- Source-derived final non-primary index-column metadata; read-only.\nSELECT\n  table_name,\n  index_name,\n  seq_in_index,\n  column_name,\n  non_unique\nFROM information_schema.statistics\nWHERE table_schema = 'kinga_staging'\n  AND index_name <> 'PRIMARY'\nORDER BY table_name, index_name, seq_in_index;\n`;

const primaryUniqueKeys = `-- Source-derived final primary/unique-key metadata; read-only.\nSELECT\n  table_name,\n  index_name,\n  seq_in_index,\n  column_name,\n  non_unique\nFROM information_schema.statistics\nWHERE table_schema = 'kinga_staging'\n  AND non_unique = 0\nORDER BY table_name, index_name, seq_in_index;\n`;

const d05NonPrimaryIndexes = `-- Source-derived bounded D-05 non-primary index-column metadata; read-only.\nSELECT\n  table_name,\n  index_name,\n  seq_in_index,\n  column_name,\n  non_unique\nFROM information_schema.statistics\nWHERE table_schema = 'kinga_staging'\n  AND table_name IN (\n  ${waveFiveTables.map(quote).join(',\n  ')}\n  )\n  AND index_name <> 'PRIMARY'\nORDER BY table_name, index_name, seq_in_index;\n`;

const zeroRows = `-- Source-derived final cumulative 188-table zero-row assertion; read-only.\nUSE \`kinga_staging\`;\nSELECT\n  COUNT(*) AS checked_table_count,\n  COALESCE(SUM(row_count), 0) AS total_rows,\n  MIN(row_count) AS minimum_rows,\n  MAX(row_count) AS maximum_rows\nFROM (\n${allTables.map((table) => `SELECT ${quote(table)} AS table_name, COUNT(*) AS row_count FROM \`kinga_staging\`.\`${table}\``).join('\nUNION ALL\n')}\n) AS all_wave_counts;\n`;

mkdirSync(outputDirectory, { recursive: true });
const outputs = new Map([
  ['01-final-cumulative-table-inventory.sql', tableInventory],
  ['02-final-cumulative-foreign-keys.sql', foreignKeys],
  ['03-final-cumulative-non-primary-indexes.sql', explicitIndexes],
  ['04-final-cumulative-primary-unique-keys.sql', primaryUniqueKeys],
  ['05-final-cumulative-zero-rows.sql', zeroRows],
  ['14-d05-non-primary-indexes.sql', d05NonPrimaryIndexes],
]);
for (const [fileName, content] of outputs) writeFileSync(resolve(outputDirectory, fileName), content);
writeFileSync(resolve(outputDirectory, 'expected-final-cumulative-tables.txt'), `${allTables.join('\n')}\n`);
writeFileSync(resolve(outputDirectory, 'expected-d05-tables.txt'), `${waveFiveTables.join('\n')}\n`);

const columnFiles = [];
for (let start = 0; start < waveFiveTables.length; start += 10) {
  const group = waveFiveTables.slice(start, start + 10);
  const name = `${String(start / 10 + 6).padStart(2, '0')}-d05-columns-${String(start + 1).padStart(2, '0')}-${String(start + group.length).padStart(2, '0')}.sql`;
  const content = `-- Source-derived bounded D-05 column metadata; read-only.\nSELECT\n  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA\nFROM information_schema.columns\nWHERE TABLE_SCHEMA = 'kinga_staging'\n  AND TABLE_NAME IN (\n  ${group.map(quote).join(',\n  ')}\n  )\nORDER BY TABLE_NAME, ORDINAL_POSITION;\n`;
  writeFileSync(resolve(outputDirectory, name), content);
  columnFiles.push({ file: name, table_start: start + 1, table_end: start + group.length, table_count: group.length, sha256: sha256(content) });
}

const cumulativeIndexFiles = [];
for (let start = 0; start < allTables.length; start += 40) {
  const group = allTables.slice(start, start + 40);
  const name = `${String(start / 40 + 15).padStart(2, '0')}-cumulative-indexes-${String(start + 1).padStart(3, '0')}-${String(start + group.length).padStart(3, '0')}.sql`;
  const content = `-- Source-derived bounded cumulative non-primary index-column metadata; read-only.\nSELECT\n  table_name,\n  index_name,\n  seq_in_index,\n  column_name,\n  non_unique\nFROM information_schema.statistics\nWHERE table_schema = 'kinga_staging'\n  AND table_name IN (\n  ${group.map(quote).join(',\n  ')}\n  )\n  AND index_name <> 'PRIMARY'\nORDER BY table_name, index_name, seq_in_index;\n`;
  writeFileSync(resolve(outputDirectory, name), content);
  cumulativeIndexFiles.push({ file: name, table_start: start + 1, table_end: start + group.length, table_count: group.length, sha256: sha256(content) });
}

const manifest = {
  schema: 'kinga-d05-final-postflight-query-manifest/v1',
  database: 'kinga_staging',
  source_paths: sourcePaths.map((path) => path.replace(`${root}/`, '')),
  source_sha256: sha256(readFileSync(sourcePaths.at(-1), 'utf8')),
  cumulative_expected_tables: allTables.length,
  d05_expected_tables: waveFiveTables.length,
  expected_table_lists: [
    'expected-final-cumulative-tables.txt',
    'expected-d05-tables.txt',
  ],
  query_files: [...outputs.entries()].map(([file, content]) => ({ file, sha256: sha256(content) })),
  d05_column_query_files: columnFiles,
  cumulative_non_primary_index_query_files: cumulativeIndexFiles,
  notes: 'All generated statements are read-only information_schema queries or an aggregate SELECT. The zero-row assertion begins with USE kinga_staging only because TiDB SQL Editor requires a selected session schema; it issues no DDL or DML.',
};
writeFileSync(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
