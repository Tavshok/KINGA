import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [ledgerArg, statementsDirArg] = process.argv.slice(2);
if (!ledgerArg || !statementsDirArg) {
  throw new Error('Usage: node scripts/verify-d05-statement-files.mjs <ledger.json> <statements-directory>');
}

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const ledger = JSON.parse(readFileSync(resolve(ledgerArg), 'utf8'));
const directory = resolve(statementsDirArg);
if (ledger.statement_count !== 290 || ledger.statements.length !== 290) {
  throw new Error(`Unexpected ledger statement count: ${ledger.statement_count}`);
}

const actualFiles = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
if (actualFiles.length !== ledger.statement_count) {
  throw new Error(`Expected ${ledger.statement_count} statement files; found ${actualFiles.length}`);
}

const orderedStatements = [];
for (const statement of ledger.statements) {
  const expectedName = `${String(statement.ordinal).padStart(3, '0')}-${statement.object_name}.sql`;
  if (!actualFiles.includes(expectedName)) throw new Error(`Missing statement file: ${expectedName}`);
  const content = readFileSync(resolve(directory, expectedName), 'utf8');
  if (content !== statement.sql) throw new Error(`Statement text mismatch: ${expectedName}`);
  if (sha256(content) !== statement.sha256) throw new Error(`Statement hash mismatch: ${expectedName}`);
  orderedStatements.push(content);
}

const expectedNames = new Set(ledger.statements.map((statement) => `${String(statement.ordinal).padStart(3, '0')}-${statement.object_name}.sql`));
const unexpectedFiles = actualFiles.filter((name) => !expectedNames.has(name));
if (unexpectedFiles.length) throw new Error(`Unexpected statement files: ${unexpectedFiles.join(', ')}`);

console.log(JSON.stringify({
  status: 'PASS',
  statement_count: ledger.statement_count,
  first_ordinal: ledger.statements[0].ordinal,
  last_ordinal: ledger.statements.at(-1).ordinal,
  ordered_statement_file_sha256: sha256(orderedStatements.join('\n')),
}, null, 2));
