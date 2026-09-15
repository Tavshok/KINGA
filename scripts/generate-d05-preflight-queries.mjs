import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'audit');
const paths = {
  wave1: resolve(root, 'audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql'),
  wave2: resolve(root, 'audit/gate-d-d02-statement-hash-ledger-2026-09-12.json'),
  wave3: resolve(root, 'audit/gate-d-d03-revised-statement-hash-ledger-2026-09-14.json'),
  wave4: resolve(root, 'audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql'),
  wave5: resolve(root, 'audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql'),
};

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function sqlTables(text) {
  return [...text.matchAll(/CREATE TABLE\s+`([^`]+)`/gi)].map((match) => match[1]);
}

function ledgerRows(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.statements;
}

function ledgerSql(path) {
  return ledgerRows(path).map((row) => row.sqlText ?? row.sql ?? row.statement ?? '').join('\n');
}

function listSql(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',\n  ');
}

function sourceIndexPairs(sql) {
  return [...sql.matchAll(/CREATE INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/gi)]
    .map((match) => ({ index: match[1], table: match[2] }));
}

function sourceForeignKeyNames(sql) {
  return [...sql.matchAll(/CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY/gi)].map((match) => match[1]);
}

const baselineTables = [...new Set([
  ...sqlTables(readFileSync(paths.wave1, 'utf8')),
  ...sqlTables(ledgerSql(paths.wave2)),
  ...sqlTables(ledgerSql(paths.wave3)),
  ...sqlTables(readFileSync(paths.wave4, 'utf8')),
])].sort();
const wave5Sql = readFileSync(paths.wave5, 'utf8');
const d05Tables = [...new Set(sqlTables(wave5Sql))].sort();
const d05ForeignKeys = [...new Set(sourceForeignKeyNames(wave5Sql))].sort();
const d05Indexes = sourceIndexPairs(wave5Sql).sort((a, b) => a.table.localeCompare(b.table) || a.index.localeCompare(b.index));

if (baselineTables.length !== 113 || d05Tables.length !== 75 || d05ForeignKeys.length !== 25 || d05Indexes.length !== 190) {
  throw new Error(JSON.stringify({ baseline: baselineTables.length, d05Tables: d05Tables.length, d05ForeignKeys: d05ForeignKeys.length, d05Indexes: d05Indexes.length }));
}

const absenceQuery = `-- Generated from pinned D-05 source; read-only metadata assertion.\nSELECT\n  (SELECT COUNT(*)\n   FROM information_schema.table_constraints\n   WHERE constraint_schema = 'kinga_staging'\n     AND constraint_type = 'FOREIGN KEY'\n     AND constraint_name IN (\n  ${listSql(d05ForeignKeys)}\n     )) AS existing_d05_foreign_keys,\n  (SELECT COUNT(*)\n   FROM (\n     SELECT table_name, index_name\n     FROM information_schema.statistics\n     WHERE table_schema = 'kinga_staging'\n       AND (table_name, index_name) IN (\n         ${d05Indexes.map(({ table, index }) => `('${table}', '${index}')`).join(',\n         ')}\n       )\n     GROUP BY table_name, index_name\n   ) AS distinct_d05_indexes) AS existing_d05_explicit_indexes;\n`;

const countRows = baselineTables
  .map((table) => `SELECT '${table}' AS table_name, COUNT(*) AS row_count FROM \`kinga_staging\`.\`${table}\``)
  .join('\nUNION ALL\n');
const zeroRowQuery = `-- Generated from pinned D-01–D-04 sources; read-only count assertion.\nSELECT\n  COUNT(*) AS tables_checked,\n  COALESCE(SUM(row_count), 0) AS total_rows,\n  MIN(row_count) AS minimum_rows,\n  MAX(row_count) AS maximum_rows\nFROM (\n${countRows}\n) AS baseline_counts;\n`;

const outputs = {
  absence: resolve(outputDir, 'gate-d-d05-object-absence-query-2026-09-15.sql'),
  zeroRows: resolve(outputDir, 'gate-d-d05-baseline-zero-row-query-2026-09-15.sql'),
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputs.absence, absenceQuery);
writeFileSync(outputs.zeroRows, zeroRowQuery);
console.log(JSON.stringify({
  baseline_tables: baselineTables.length,
  d05_tables: d05Tables.length,
  d05_foreign_keys: d05ForeignKeys.length,
  d05_explicit_indexes: d05Indexes.length,
  absence_query_sha256: sha256(absenceQuery),
  zero_row_query_sha256: sha256(zeroRowQuery),
  outputs,
}, null, 2));
