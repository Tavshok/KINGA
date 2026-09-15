import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [ledgerArg, outputArg] = process.argv.slice(2);
if (!ledgerArg || !outputArg) throw new Error('Usage: node scripts/generate-d05-scope-manifest.mjs <ledger.json> <output.json>');

const ledger = JSON.parse(readFileSync(resolve(ledgerArg), 'utf8'));
const tables = ledger.statements.filter((statement) => statement.kind === 'CREATE TABLE').map((statement) => statement.object_name);
const foreignKeys = ledger.statements
  .filter((statement) => statement.kind === 'ADD FOREIGN KEY')
  .map((statement) => ({ ordinal: statement.ordinal, table: statement.table_name, name: statement.object_name, sha256: statement.sha256 }));
const indexes = ledger.statements
  .filter((statement) => statement.kind === 'CREATE INDEX')
  .map((statement) => ({ ordinal: statement.ordinal, table: statement.table_name, name: statement.object_name, sha256: statement.sha256 }));

if (tables.length !== 75 || foreignKeys.length !== 25 || indexes.length !== 190) {
  throw new Error(`Unexpected scope: tables=${tables.length}, foreign_keys=${foreignKeys.length}, indexes=${indexes.length}`);
}

const manifest = {
  schema: 'kinga-d05-scope-manifest/v1',
  source_sha256: ledger.source_sha256,
  statement_count: ledger.statement_count,
  tables,
  foreign_keys: foreignKeys,
  explicit_indexes: indexes,
};
writeFileSync(resolve(outputArg), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'PASS',
  source_sha256: manifest.source_sha256,
  tables: tables.length,
  foreign_keys: foreignKeys.length,
  explicit_indexes: indexes.length,
}, null, 2));
